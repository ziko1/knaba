import XCTest
@testable import KNABADE

private final class ERPMemoryJournal: ERPPendingCommandStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var command: ERPPendingCommand?
    private var insertFailure = false
    private var inserts = 0
    private var loads = 0
    func loadCount() -> Int { lock.lock(); defer { lock.unlock() }; return loads }
    func failInsert() { lock.lock(); defer { lock.unlock() }; insertFailure = true }
    func insertCount() -> Int { lock.lock(); defer { lock.unlock() }; return inserts }
    func installLegacy(_ next: ERPPendingCommand) { lock.lock(); defer { lock.unlock() }; command = next }
    func load() throws -> ERPPendingCommand? {
        lock.lock(); defer { lock.unlock() }
        loads += 1
        return command
    }
    func insert(_ next: ERPPendingCommand) throws {
        lock.lock(); defer { lock.unlock() }
        inserts += 1
        if insertFailure { throw ERPFailure.pendingStorage }
        guard command == nil else { throw ERPFailure.pendingExists }
        try next.validate(); command = next
    }
    func resolve(_ expected: ERPPendingCommand) throws {
        lock.lock(); defer { lock.unlock() }
        guard let command else { return }
        guard command == expected else { throw ERPFailure.pendingChanged }
        self.command = nil
    }
}

private actor ERPRaceGate {
    let reached: XCTestExpectation
    private var continuation: CheckedContinuation<Void, Never>?
    private var released = false
    init(_ reached: XCTestExpectation) { self.reached = reached }
    func hold() async {
        reached.fulfill()
        if released { return }
        await withCheckedContinuation { continuation = $0 }
    }
    func release() { released = true; continuation?.resume(); continuation = nil }
}

private enum ERPFixtureOutcome: Sendable {
    case applied, committedThenTimeout, committedMalformedReceipt
    case reject(Int, String)
}

/// Only the HTTP boundary is doubled. The real client and journal contract perform every retry.
private actor ERPFixtureTransport: ERPTransport {
    private var user = "user-a"
    private var company = "company-a"
    private var meOverride: Data?
    private var responseOrigin: URL?
    private var roles = ["EMPLOYEE"]
    private var permissions = ["task.work", "chat.write"]
    private var partnerResponses: [(Int, Data)] = []
    func setPartnerResponses(_ values: [(Int, Data)]) { partnerResponses = values }
    func allPaths() -> [String] { seen.map { $0.url!.path + ($0.url?.query.map { "?" + $0 } ?? "") } }
    private var catalogData = Data(#"{"items":[]}"#.utf8)
    private var failEntityReads = false
    private var entityPages: [Data] = []
    private var outcomes: [ERPFixtureOutcome] = []
    private var gates: [String: ERPRaceGate] = [:]
    private var seen: [URLRequest] = []
    private var effects: [String: Data] = [:]
    private var storedBeforeWrite: [Bool] = []
    private let journal: any ERPPendingCommandStoring
    init(journal: any ERPPendingCommandStoring) { self.journal = journal }
    func setActor(user: String = "user-a", company: String = "company-a") { self.user = user; self.company = company }
    func setMe(_ data: Data?) { meOverride = data }
    func setResponseOrigin(_ url: URL?) { responseOrigin = url }
    func setRoles(_ roles: [String]) { self.roles = roles }
    func setPermissions(_ permissions: [String]) { self.permissions = permissions }
    func setCatalog(_ data: Data) { catalogData = data }
    func setEntityReadFailure(_ value: Bool) { failEntityReads = value }
    func setPages(_ values: [Data]) { entityPages = values }
    func setOutcomes(_ values: [ERPFixtureOutcome]) { outcomes = values }
    func hold(_ path: String, at gate: ERPRaceGate) { gates[path] = gate }
    func requests(_ suffix: String) -> [URLRequest] { seen.filter { $0.url?.path.hasSuffix(suffix) == true } }
    func writes() -> [URLRequest] { seen.filter { $0.httpMethod == "POST" && $0.url?.path.contains("/commands/") == true } }
    func effectCount() -> Int { effects.count }
    func persistenceChecks() -> [Bool] { storedBeforeWrite }
    func identityData() -> Data {
        try! JSONSerialization.data(withJSONObject: [
            "actor": ["userId": user, "companyId": company, "roles": roles, "permissions": permissions],
            "user": ["id": user, "name": "Synthetic worker"], "csrfToken": "csrf_" + user, "mode": "TEST"
        ])
    }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        seen.append(request)
        let path = request.url!.path
        let qualified = path + (request.url?.query.map { "?" + $0 } ?? "")
        let gate = gates.removeValue(forKey: qualified) ?? gates.removeValue(forKey: path)
        let url = responseOrigin ?? request.url!
        let identity = identityData()
        let me = meOverride ?? identity
        let session = "session_" + String(repeating: "s", count: 32) + "_" + user
        var status = 200
        var body = Data("{}".utf8)
        var headers: [String: String] = [:]
        var timeout = false
        if path.hasSuffix("/auth/login") {
            body = identity; headers["Set-Cookie"] = "knaba_session=\(session); Path=/; Secure; HttpOnly"
        } else if path.hasSuffix("/me") {
            body = me
        } else if path.contains("/commands/") {
            let bytes = request.httpBody ?? Data()
            let saved = try journal.load()
            storedBeforeWrite.append(saved?.body == bytes)
            let envelope = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            let key = envelope["idempotency_key"] as! String
            let outcome = outcomes.isEmpty ? .applied : outcomes.removeFirst()
            switch outcome {
            case .reject(let code, let reason):
                status = code; body = try JSONSerialization.data(withJSONObject: ["code": reason])
            case .applied, .committedThenTimeout, .committedMalformedReceipt:
                if let previous = effects[key], previous != bytes {
                    status = 409; body = Data(#"{"code":"IDEMPOTENCY_CONFLICT"}"#.utf8)
                } else {
                    effects[key] = bytes
                    status = 201; body = Data(#"{"id":"saved-record","version":8}"#.utf8)
                    if path.hasSuffix("/user.password.rotate") || path.hasSuffix("/user.mfa.configure") {
                        status = 200; body = Data(#"{"ok":true,"reauthenticationRequired":true}"#.utf8)
                    }
                    if case .committedThenTimeout = outcome { timeout = true }
                    if case .committedMalformedReceipt = outcome { body = Data("not-json".utf8) }
                }
            }
        } else if path.hasPrefix("/api/v1/partner/") {
            guard !partnerResponses.isEmpty else { throw ERPFailure.invalidResponse }
            (status, body) = partnerResponses.removeFirst()
        } else if path.hasSuffix("/dashboard") {
            body = Data(#"{"counts":{},"activeShifts":0}"#.utf8)
        } else if path.hasSuffix("/commands") {
            body = catalogData
        } else if path.contains("/entities/") || path.hasSuffix("/messages") {
            body = entityPages.isEmpty ? Data(#"{"items":[],"has_more":false}"#.utf8) : entityPages.removeFirst()
            if failEntityReads { status = 503; body = Data(#"{"code":"DEPENDENCY_UNAVAILABLE"}"#.utf8) }
        }
        if let gate { await gate.hold() }
        if timeout { throw URLError(.timedOut) }
        return (body, HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
    }
}

final class ERPCommandRecoveryTests: XCTestCase {
    private let origin = "https://erp.knaba.test"
    // Current operations.ts task.submit contract; the HTTP fixture is not a real ERP transaction.
    private let command = ERPCommand(name: "task.submit", permission: "task.work", highRisk: false, schema: nil)
    private let input = Data(#"{"taskId":"task-a","description":"Synthetic completion"}"#.utf8)

    private func signIn(_ client: ERPConsoleClient, origin: String? = nil) async throws {
        try await client.configure(origin ?? self.origin)
        _ = try await client.login(email: "synthetic@example.test", password: "synthetic-password")
    }
    private func expect(_ failure: ERPFailure, _ operation: () async throws -> Void, file: StaticString = #filePath, line: UInt = #line) async {
        do { try await operation(); XCTFail("Expected \(failure)", file: file, line: line) }
        catch { XCTAssertEqual(error as? ERPFailure, failure, file: file, line: line) }
    }

    func testCommitLostAckRestartAndExplicitRetryUseOneExactEnvelopeAndOneEffect() async throws {
        let journal = ERPMemoryJournal()
        // Use the same durable boundary for the transport's persist-before-POST observation.
        let server = ERPFixtureTransport(journal: journal)
        let first = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(first)
        await server.setOutcomes([.committedThenTimeout])
        await expect(.pendingUnknown) { _ = try await first.execute(self.command, input: self.input, expectedVersion: 7) }
        let saved = try XCTUnwrap(journal.load())
        XCTAssertEqual(saved.expectedVersion, 7)
        XCTAssertEqual(saved.origin, origin)
        let restarted = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(restarted)
        let restored = try await restarted.pendingCommand()
        XCTAssertEqual(restored, saved)
        let beforeRetry = await server.writes()
        XCTAssertEqual(beforeRetry.count, 1, "Signing in or loading the journal must not replay")
        _ = try await restarted.retryPendingCommand()
        let writes = await server.writes(), effects = await server.effectCount(), checks = await server.persistenceChecks()
        XCTAssertEqual(writes.count, 2)
        XCTAssertEqual(writes[0].httpBody, writes[1].httpBody)
        XCTAssertEqual(writes[0].httpBody, saved.body)
        let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: saved.body) as? [String: Any])
        XCTAssertEqual(envelope["input"] as? [String: String], ["taskId": "task-a", "description": "Synthetic completion"])
        XCTAssertEqual(envelope["idempotency_key"] as? String, saved.idempotencyKey)
        XCTAssertEqual(envelope["expected_version"] as? Int, 7)
        XCTAssertEqual(effects, 1)
        XCTAssertEqual(checks, [true, true])
        XCTAssertNil(try journal.load())
    }

    func testDifferentUserCompanyOrOriginCannotReadReplayOrReplaceSavedCommand() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(client)
        await server.setOutcomes([.committedThenTimeout])
        await expect(.pendingUnknown) { _ = try await client.execute(self.command, input: self.input) }
        let saved = try XCTUnwrap(journal.load())
        for (user, company, url) in [("user-b", "company-a", origin), ("user-a", "company-b", origin), ("user-a", "company-a", "https://other.knaba.test")] {
            let other = ERPConsoleClient(transport: server, pendingStore: journal)
            await server.setActor(user: user, company: company)
            try await signIn(other, origin: url)
            await expect(.pendingDifferentActor) { _ = try await other.pendingCommand() }
            await expect(.pendingDifferentActor) { _ = try await other.retryPendingCommand() }
            await expect(.pendingExists) { _ = try await other.execute(self.command, input: self.input) }
            XCTAssertEqual(try journal.load(), saved)
        }
        let writes = await server.writes()
        XCTAssertEqual(writes.count, 1)
    }

    func testPersistenceFailureAndInvalidVersionOrBodyBudgetSendNoCommand() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(client)
        for version in [0, -1] {
            await expect(.invalidPayload) { _ = try await client.execute(self.command, input: self.input, expectedVersion: version) }
        }
        let large = try JSONSerialization.data(withJSONObject: ["taskId": "task-a", "description": String(repeating: "x", count: 65_490)])
        await expect(.invalidPayload) { _ = try await client.execute(self.command, input: large, expectedVersion: 1) }
        journal.failInsert()
        await expect(.pendingStorage) { _ = try await client.execute(self.command, input: self.input) }
        let writes = await server.writes()
        XCTAssertTrue(writes.isEmpty)
        XCTAssertNil(try journal.load())
    }

    func testFirstDefinitiveRejectionCanResolveButLaterRejectionNeverDisprovesUnknownEffect() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(client)
        await server.setOutcomes([.reject(400, "VALIDATION_ERROR")])
        await expect(.http(400, "VALIDATION_ERROR")) { _ = try await client.execute(self.command, input: self.input) }
        XCTAssertNil(try journal.load())
        for (status, code) in [(401, "ACCESS_DENIED"), (403, "ACCESS_DENIED"), (409, "VERSION_CONFLICT")] {
            let pendingJournal = ERPMemoryJournal()
            let backend = ERPFixtureTransport(journal: pendingJournal)
            let actor = ERPConsoleClient(transport: backend, pendingStore: pendingJournal)
            try await signIn(actor)
            await backend.setOutcomes([.committedThenTimeout, .reject(status, code)])
            await expect(.pendingUnknown) { _ = try await actor.execute(self.command, input: self.input) }
            let original = try pendingJournal.load()
            do { _ = try await actor.retryPendingCommand(); XCTFail("Expected recovery to remain unresolved") } catch {}
            XCTAssertEqual(try pendingJournal.load(), original)
            let effects = await backend.effectCount(), writes = await backend.writes()
            XCTAssertEqual(effects, 1); XCTAssertEqual(writes.count, 2)
            XCTAssertEqual(writes[0].httpBody, writes[1].httpBody)
        }
    }

    func testMalformedOrChangedMeBlocksRecoveryBeforeAnotherPost() async throws {
        let invalid: [Data] = [
            Data("broken".utf8),
            Data(#"{"actor":{"userId":"user-a","companyId":"company-a","roles":[],"permissions":[]},"user":{"id":"user-b"},"csrfToken":"csrf"}"#.utf8),
            Data(#"{"actor":{"userId":"user-a","companyId":"company-b","roles":[],"permissions":[]},"user":{"id":"user-a"},"csrfToken":"csrf"}"#.utf8),
            Data(#"{"actor":{"userId":"user-a","companyId":"company-a","roles":[],"permissions":[]},"user":{"id":"user-a"}}"#.utf8)
        ]
        for response in invalid {
            let journal = ERPMemoryJournal()
            let server = ERPFixtureTransport(journal: journal)
            let client = ERPConsoleClient(transport: server, pendingStore: journal)
            try await signIn(client)
            await server.setOutcomes([.committedThenTimeout])
            await expect(.pendingUnknown) { _ = try await client.execute(self.command, input: self.input) }
            let saved = try journal.load()
            await server.setMe(response)
            await expect(.accessChanged) { _ = try await client.retryPendingCommand() }
            let writes = await server.writes(), identity = await client.identity
            XCTAssertEqual(writes.count, 1); XCTAssertNil(identity)
            XCTAssertEqual(try journal.load(), saved)
        }
    }

    func testLateLogoutResponseDoesNotClearNewSession() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(client)
        let reached = expectation(description: "logout transport entered")
        let barrier = ERPRaceGate(reached)
        await server.hold("/api/v1/auth/logout", at: barrier)
        let logout = Task { await client.logout() }
        await fulfillment(of: [reached], timeout: 2)
        let loggedOut = await client.identity
        XCTAssertNil(loggedOut, "Logout invalidates locally before waiting on HTTP")
        await server.setActor(user: "user-b")
        try await signIn(client)
        await barrier.release(); await logout.value
        let current = await client.identity, requests = await server.requests("/auth/logout")
        XCTAssertEqual(current?.actor.userId, "user-b")
        XCTAssertTrue(requests[0].value(forHTTPHeaderField: "Cookie")?.hasSuffix("user-a") == true)
    }

    func testLateLoginCannotRestoreSessionAfterLogout() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await client.configure(origin)
        let reached = expectation(description: "login transport entered")
        let gate = ERPRaceGate(reached)
        await server.hold("/api/v1/auth/login", at: gate)
        let login = Task { try await client.login(email: "synthetic@example.test", password: "test") }
        await fulfillment(of: [reached], timeout: 2)
        await client.logout()
        await gate.release()
        await expect(.accessChanged) { _ = try await login.value }
        let identity = await client.identity
        XCTAssertNil(identity)
    }

    func testLoginPublishesNoAuthorityUntilMeAndOldMeCannotResetNewLogin() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await client.configure(origin)
        let reached = expectation(description: "provisional login waits for me")
        let gate = ERPRaceGate(reached)
        await server.hold("/api/v1/me", at: gate)
        await server.setMe(Data("malformed old me".utf8))
        let old = Task { try await client.login(email: "synthetic@example.test", password: "test") }
        await fulfillment(of: [reached], timeout: 2)
        let provisional = await client.identity
        XCTAssertNil(provisional)
        await expect(.expired) { _ = try await client.execute(self.command, input: self.input) }
        await server.setMe(nil)
        await server.setActor(user: "user-b")
        try await signIn(client)
        await gate.release()
        await expect(.accessChanged) { _ = try await old.value }
        let current = await client.identity, writes = await server.writes()
        XCTAssertEqual(current?.actor.userId, "user-b")
        XCTAssertTrue(writes.isEmpty)
    }

    func testPaginationKeepsOneActorAndEncodesCursorAsOneBoundedQueryValue() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(client)
        let cursor = "next&company=foreign/#fragment"
        let page = try JSONSerialization.data(withJSONObject: ["items": [], "has_more": true, "next_cursor": cursor])
        await server.setPages([page, Data(#"{"items":[],"has_more":false}"#.utf8)])
        _ = try await client.entities("task")
        let encodedRequests = await server.requests("/entities/task")
        XCTAssertEqual(encodedRequests.count, 2)
        let query = URLComponents(url: encodedRequests[1].url!, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(query.queryItems?.map(\.name), ["limit", "cursor"])
        XCTAssertEqual(query.queryItems?.last?.value, cursor)
        XCTAssertNil(query.fragment)

        let first = Data(#"{"items":[{"id":"old-actor-record","kind":"task","version":1,"data":{}}],"has_more":true,"next_cursor":"page-2"}"#.utf8)
        await server.setPages([first, Data(#"{"items":[{"id":"second-record","kind":"task","version":1,"data":{}}],"has_more":false}"#.utf8)])
        let reached = expectation(description: "second page waits")
        let barrier = ERPRaceGate(reached)
        await server.hold("/api/v1/entities/task?limit=100&cursor=page-2", at: barrier)
        let old = Task { try await client.entities("task") }
        await fulfillment(of: [reached], timeout: 2)
        await client.logout()
        await server.setActor(user: "user-b")
        try await signIn(client)
        await barrier.release()
        await expect(.accessChanged) { _ = try await old.value }
        let current = await client.identity
        XCTAssertEqual(current?.actor.userId, "user-b")

        let before = await server.requests("/entities/task").count
        let oversize = try JSONSerialization.data(withJSONObject: ["items": [], "has_more": true, "next_cursor": String(repeating: "x", count: 8193)])
        await server.setPages([oversize])
        await expect(.invalidResponse) { _ = try await client.entities("task") }
        let after = await server.requests("/entities/task").count
        XCTAssertEqual(after, before + 1)
    }

    func testLateRefreshAndWriteCannotMutateNewSessionOrResolveOldJournal() async throws {
        for path in ["/api/v1/me", "/api/v1/commands/task.submit"] {
            let journal = ERPMemoryJournal()
            let server = ERPFixtureTransport(journal: journal)
            let client = ERPConsoleClient(transport: server, pendingStore: journal)
            try await signIn(client)
            let reached = expectation(description: path)
            let barrier = ERPRaceGate(reached)
            await server.hold(path, at: barrier)
            let old = Task {
                if path.hasSuffix("/me") { _ = try await client.refresh() }
                else { _ = try await client.execute(self.command, input: self.input) }
            }
            await fulfillment(of: [reached], timeout: 2)
            let saved = try journal.load()
            await client.logout()
            await server.setActor(user: "user-b")
            try await signIn(client)
            await barrier.release()
            await expect(.accessChanged) { try await old.value }
            let identity = await client.identity
            XCTAssertEqual(identity?.actor.userId, "user-b")
            XCTAssertEqual(try journal.load(), saved)
        }
    }

    func testConcurrentSubmitIsBlockedAndMalformedCommitReceiptStaysRecoverable() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(client)
        let reached = expectation(description: "first write entered")
        let gate = ERPRaceGate(reached)
        await server.hold("/api/v1/commands/task.submit", at: gate)
        await server.setOutcomes([.committedMalformedReceipt])
        let first = Task { try await client.execute(self.command, input: self.input) }
        await fulfillment(of: [reached], timeout: 2)
        await expect(.pendingExists) { _ = try await client.execute(self.command, input: self.input) }
        await gate.release()
        await expect(.pendingUnknown) { _ = try await first.value }
        XCTAssertNotNil(try journal.load())
        _ = try await client.retryPendingCommand()
        let writes = await server.writes(), effects = await server.effectCount()
        XCTAssertEqual(writes.count, 2); XCTAssertEqual(effects, 1)
    }

    func testRedirectDelegateRejectsRedirectAndForeignResponseCannotAuthenticate() async throws {
        let guardDelegate = ERPNoRedirect(), session = URLSession(configuration: .ephemeral)
        let original = URL(string: origin + "/api/v1/auth/login")!
        let destination = URL(string: "https://foreign.example.test/steal")!
        let task = session.dataTask(with: original)
        var called = false
        guardDelegate.urlSession(session, task: task,
            willPerformHTTPRedirection: HTTPURLResponse(url: original, statusCode: 302, httpVersion: nil, headerFields: ["Location": destination.absoluteString])!,
            newRequest: URLRequest(url: destination)) { next in called = true; XCTAssertNil(next) }
        XCTAssertTrue(called); session.invalidateAndCancel()
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        await server.setResponseOrigin(destination)
        await expect(.invalidResponse) { try await self.signIn(client) }
        let identity = await client.identity
        XCTAssertNil(identity)
    }

    @MainActor func testViewModelLateRefreshAndLogoutKeepNewLoginVisible() async throws {
        for delayed in ["/api/v1/me", "/api/v1/auth/logout"] {
            let journal = ERPMemoryJournal()
            let server = ERPFixtureTransport(journal: journal)
            let client = ERPConsoleClient(transport: server, pendingStore: journal)
            let model = ERPConsoleModel(client: client)
            model.origin = origin; model.email = "synthetic@example.test"; model.password = "test"
            await model.signIn()
            let reached = expectation(description: delayed)
            let barrier = ERPRaceGate(reached)
            await server.hold(delayed, at: barrier)
            let old = Task { if delayed.hasSuffix("/me") { await model.reloadSession() } else { await model.signOut() } }
            await fulfillment(of: [reached], timeout: 2)
            if delayed.hasSuffix("/me") { await model.signOut() }
            XCTAssertNil(model.identity)
            await server.setActor(user: "user-b")
            model.password = "new-test-password"
            await model.signIn()
            XCTAssertEqual(model.identity?.actor.userId, "user-b")
            await barrier.release(); await old.value
            XCTAssertEqual(model.identity?.actor.userId, "user-b")
            let identity = await client.identity
            XCTAssertEqual(identity?.actor.userId, "user-b")
        }
    }


    @MainActor private func partnerFixture() async -> (ERPConsoleModel, ERPFixtureTransport) {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let model = ERPConsoleModel(client: ERPConsoleClient(transport: server, pendingStore: journal))
        await server.setRoles(["PARTNER"])
        await server.setPermissions(["partner.orders.read"])
        model.origin = origin; model.email = "partner@example.test"; model.password = "test"
        return (model, server)
    }

    @MainActor func testEveryPartnerRoleClaimBlocksGenericTransportAndJournal() async {
        let grants = ["partner.orders.read", "identity.manage", "*"]
        let claims: [([String], [String], Bool)] = [
            (["PARTNER"], [], false), (["PARTNER"], ["customer.portal"], false),
            (["PARTNER"], ["lead.manage_own"], false), (["PARTNER"], ["*"], false),
            (["PARTNER", "OWNER"], ["identity.manage"], false), (["PARTNER", "OWNER"], grants, false),
            (["pArTnEr"], grants, false), ([" PARTNER "], grants, false), (["PARTNER"], grants, true)
        ]
        for (roles, permissions, mayReadOrders) in claims {
            let journal = ERPMemoryJournal()
            let server = ERPFixtureTransport(journal: journal)
            let client = ERPConsoleClient(transport: server, pendingStore: journal)
            let model = ERPConsoleModel(client: client)
            await server.setRoles(roles)
            await server.setPermissions(permissions)
            await server.setPartnerResponses([(200, Data(#"{"items":[],"nextAfter":null}"#.utf8))])
            model.origin = origin; model.email = "partner@example.test"; model.password = "test"
            await model.signIn()
            XCTAssertNotNil(model.identity)
            XCTAssertEqual(model.selectedWorkspace, mayReadOrders ? .partner : nil)
            XCTAssertTrue(model.modules.isEmpty)
            XCTAssertFalse(model.hasPending)
            await expect(.accessChanged) { _ = try await client.commandAuthority() }
            await expect(.accessChanged) { _ = try await client.dashboard() }
            await expect(.accessChanged) { _ = try await client.catalog() }
            await expect(.accessChanged) { _ = try await client.entities("order") }
            await expect(.accessChanged) { _ = try await client.pendingCommand() }
            await expect(.accessChanged) { _ = try await client.retryPendingCommand() }
            await expect(.accessChanged) { _ = try await client.execute(self.command, input: self.input) }
            var expectedPaths = ["/api/v1/auth/login", "/api/v1/me"]
            if mayReadOrders {
                expectedPaths.append("/api/v1/partner/orders?limit=50")
                XCTAssertEqual(model.partnerPage?.items.count, 0)
            } else {
                await expect(.accessChanged) { _ = try await client.partnerOrders() }
                await expect(.accessChanged) { _ = try await client.partnerOrder(id: "A") }
            }
            let paths = await server.allPaths()
            XCTAssertEqual(paths, expectedPaths)
            XCTAssertEqual(journal.loadCount(), 0)
            XCTAssertEqual(journal.insertCount(), 0)
        }
    }

    @MainActor func testPartnerGrantOnNonPartnerPreservesAuthorizedStaffReads() async {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        let model = ERPConsoleModel(client: client)
        await server.setRoles(["DISPATCHER"])
        await server.setPermissions(["partner.orders.read", "dispatch.manage"])
        model.origin = origin; model.email = "dispatcher@example.test"; model.password = "test"
        await model.signIn()
        XCTAssertEqual(model.selectedWorkspace, .staff)
        XCTAssertNotNil(model.dashboard)
        await expect(.accessChanged) { _ = try await client.partnerOrders() }
        let paths = await server.allPaths()
        XCTAssertEqual(paths, ["/api/v1/auth/login", "/api/v1/me", "/api/v1/dashboard", "/api/v1/commands"])
        XCTAssertGreaterThan(journal.loadCount(), 0)
    }

    @MainActor func testPartnerLoginOpensOnlyScopedPagedOrdersAndRechecksEachDetail() async {
        let (model, server) = await partnerFixture()
        let first = #"{"id":"A","status":"CONFIRMED","updatedAt":"2026-11-25T01:02:03.000Z"}"#
        let next = #"{"id":"B","status":"SCHEDULED","updatedAt":"2026-11-25T01:02:03.000Z"}"#
        await server.setPartnerResponses([(200, Data("{\"items\":[\(first)],\"nextAfter\":\"A\"}".utf8)),
                                          (200, Data("{\"items\":[\(next)],\"nextAfter\":null}".utf8)), (200,Data(next.utf8))])
        await model.signIn()
        XCTAssertTrue(model.usesPartnerOrders)
        XCTAssertTrue(model.email.isEmpty)
        XCTAssertEqual(model.partnerPage?.items.map(\.id), ["A"])
        await model.loadPartnerOrders(after: "A")
        XCTAssertEqual(model.partnerPage?.items.map(\.id), ["B"])
        await model.loadPartnerOrders(orderID: "B")
        XCTAssertEqual(model.partnerDetail?.id, "B")
        XCTAssertNil(model.partnerPage)
        await model.refreshActions()
        await model.loadKind("order")
        await model.retryPending()
        let paths = await server.allPaths()
        XCTAssertEqual(paths, ["/api/v1/auth/login", "/api/v1/me", "/api/v1/partner/orders?limit=50",
                               "/api/v1/partner/orders?limit=50&after=A", "/api/v1/partner/orders/B"])
        await model.signOut()
        XCTAssertNil(model.partnerDetail)
    }

    @MainActor func testPartnerRefreshAndBackKeepTheOriginatingPageUntilHidden() async {
        let (model, server) = await partnerFixture()
        let first = #"{"id":"A","status":"CONFIRMED","updatedAt":"2026-11-25T01:02:03.000Z"}"#
        let second = #"{"id":"B","status":"SCHEDULED","updatedAt":"2026-11-25T01:02:03.000Z"}"#
        let firstPage = Data(#"{"items":[\#(first)],"nextAfter":"A"}"#.utf8)
        let secondPage = Data(#"{"items":[\#(second)],"nextAfter":null}"#.utf8)
        await server.setPartnerResponses([(200, firstPage), (200, secondPage), (200, secondPage),
                                          (200, Data(second.utf8)), (200, Data(second.utf8)), (200, secondPage), (200, firstPage)])
        await model.signIn()
        await model.loadPartnerOrders(after: "A")
        await model.reloadSession()
        XCTAssertEqual(model.partnerPage?.items.first?.id, "B")
        await model.loadPartnerOrders(orderID: "B")
        await model.reloadSession()
        XCTAssertEqual(model.partnerDetail?.id, "B")
        await model.returnToPartnerPage()
        XCTAssertEqual(model.partnerPage?.items.first?.id, "B")
        XCTAssertNil(model.partnerDetail)
        model.setPartnerVisibility(false)
        model.setPartnerVisibility(true)
        await model.reloadSession()
        XCTAssertEqual(model.partnerPage?.items.first?.id, "A")
        let paths = await server.allPaths()
        XCTAssertEqual(paths.filter { $0.hasPrefix("/api/v1/partner/") }, [
            "/api/v1/partner/orders?limit=50", "/api/v1/partner/orders?limit=50&after=A",
            "/api/v1/partner/orders?limit=50&after=A", "/api/v1/partner/orders/B", "/api/v1/partner/orders/B",
            "/api/v1/partner/orders?limit=50&after=A", "/api/v1/partner/orders?limit=50"
        ])
    }

    @MainActor func testPartnerErrorsPurgeOrdersAndRetryStartsWithFreshPage() async {
        let (model, server) = await partnerFixture()
        let page = Data(#"{"items":[{"id":"A","status":"CONFIRMED","updatedAt":"2026-11-25T01:02:03.000Z"}],"nextAfter":null}"#.utf8)
        let error = Data(#"{"code":"NOT_FOUND_SAFE"}"#.utf8)
        await server.setPartnerResponses([(200,page), (404,error), (503,error), (200,page), (403,error), (200,page)])
        await model.signIn()
        await model.loadPartnerOrders(orderID: "A")
        XCTAssertNotNil(model.identity); XCTAssertNil(model.partnerPage); XCTAssertNil(model.partnerDetail)
        XCTAssertFalse(model.problem.isEmpty)
        await model.loadPartnerOrders()
        XCTAssertFalse(model.problem.isEmpty); XCTAssertNil(model.partnerPage)
        await model.loadPartnerOrders()
        XCTAssertEqual(model.partnerPage?.items.first?.id, "A"); XCTAssertTrue(model.problem.isEmpty)
        await model.loadPartnerOrders(orderID: "A")
        XCTAssertNotNil(model.identity); XCTAssertNil(model.partnerDetail); XCTAssertNil(model.partnerPage)
        XCTAssertEqual(model.partnerProblem, .partnerForbidden)
        await model.loadPartnerOrders()
        XCTAssertEqual(model.partnerPage?.items.first?.id, "A"); XCTAssertNil(model.partnerProblem)
    }

    @MainActor func testLatePartnerPageCannotSurviveHidingOrReplacementAccount() async {
        let (model, server) = await partnerFixture()
        let page = Data(#"{"items":[{"id":"A","status":"CONFIRMED","updatedAt":"2026-11-25T01:02:03.000Z"}],"nextAfter":"A"}"#.utf8)
        let late = Data(#"{"items":[{"id":"secret-A","status":"CLOSED","updatedAt":"2026-11-25T01:02:03.000Z"}],"nextAfter":null}"#.utf8)
        let other = Data(#"{"items":[],"nextAfter":null}"#.utf8)
        await server.setPartnerResponses([(200,page),(200,late),(200,other)])
        await model.signIn()
        let entered = expectation(description: "Partner page requested"), gate = ERPRaceGate(entered)
        await server.hold("/api/v1/partner/orders?limit=50&after=A", at: gate)
        let read = Task { await model.loadPartnerOrders(after: "A") }
        await fulfillment(of: [entered], timeout: 2)
        model.setPartnerVisibility(false)
        XCTAssertNil(model.partnerPage); XCTAssertFalse(model.busy)
        await model.signOut()
        await server.setActor(user: "user-b", company: "company-b")
        model.setPartnerVisibility(true)
        model.email = "other@example.test"; model.password = "test"; await model.signIn()
        await gate.release(); await read.value
        XCTAssertEqual(model.identity?.actor.companyId, "company-b")
        XCTAssertEqual(model.partnerPage?.items.count, 0); XCTAssertNil(model.partnerDetail)
    }

    @MainActor func testCheckingDisplayedPartnerDetailKeepsItsRouteAndDropsRevokedProjection() async {
        let (model, server) = await partnerFixture()
        let detail = #"{"id":"A","status":"CONFIRMED","updatedAt":"2026-11-25T01:02:03.000Z"}"#
        let page = Data("{\"items\":[\(detail)],\"nextAfter\":null}".utf8)
        await server.setPartnerResponses([(200,page),(200,Data(detail.utf8)),(200,Data(detail.utf8)),(404,Data("{}".utf8))])
        await model.signIn()
        await model.loadPartnerOrders(orderID: "A")
        await model.revalidatePartnerPresentation()
        XCTAssertEqual(model.partnerDetail?.id, "A")
        await model.revalidatePartnerPresentation()
        XCTAssertNil(model.partnerDetail); XCTAssertNil(model.partnerPage); XCTAssertFalse(model.problem.isEmpty)
        let paths = await server.allPaths()
        XCTAssertEqual(paths.filter { $0 == "/api/v1/partner/orders/A" }.count, 3)
    }

    @MainActor func testPartnerResumeReadsScopeAgainEvenWhenMeRemainsActive() async {
        let (model, server) = await partnerFixture()
        let page = Data(#"{"items":[{"id":"A","status":"CONFIRMED","updatedAt":"2026-11-25T01:02:03.000Z"}],"nextAfter":null}"#.utf8)
        await server.setPartnerResponses([(200,page),(401,Data(#"{"code":"NEEDS_REAUTH"}"#.utf8))])
        await model.signIn()
        model.setPartnerVisibility(false)
        XCTAssertNil(model.partnerPage)
        model.setPartnerVisibility(true)
        await model.reloadSession()
        XCTAssertNil(model.identity); XCTAssertNil(model.partnerPage)
        let paths = await server.allPaths()
        XCTAssertEqual(paths.filter { $0 == "/api/v1/me" }.count, 2)
        XCTAssertEqual(paths.filter { $0 == "/api/v1/partner/orders?limit=50" }.count, 2)
    }
    @MainActor func testWorkspaceEntryDefersOperationalReadsUntilSelectionAndClearsRoleDataOnSwitch() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        await server.setRoles(["WORKER", "CLIENT"])
        await server.setPermissions(["task.read", "customer.portal"])
        let model = ERPConsoleModel(client: ERPConsoleClient(transport: server, pendingStore: journal))
        model.origin = origin; model.email = "synthetic@example.test"; model.password = "test"
        await model.signIn()
        XCTAssertNotNil(model.identity)
        XCTAssertEqual(model.availableWorkspaces, [.client, .worker])
        XCTAssertNil(model.selectedWorkspace)
        XCTAssertTrue(model.modules.isEmpty)
        model.selectWorkspace(.owner)
        await model.loadOverview()
        await model.loadKind("task")
        let dashboardReads = await server.requests("/dashboard")
        let catalogReads = await server.requests("/commands")
        let prematureTaskReads = await server.requests("/entities/task")
        XCTAssertTrue(dashboardReads.isEmpty && catalogReads.isEmpty && prematureTaskReads.isEmpty)

        model.selectWorkspace(.worker)
        await model.loadOverview()
        XCTAssertNotNil(model.dashboard)
        await server.setPages([Data(#"{"items":[{"id":"private-task","kind":"task","version":1,"data":{}}],"has_more":false,"next_cursor":null}"#.utf8)])
        await model.loadKind("task")
        XCTAssertEqual(model.items.first?.id, "private-task")
        let previousSession = model.sessionGeneration
        model.selectWorkspace(nil)
        XCTAssertGreaterThan(model.sessionGeneration, previousSession)
        XCTAssertTrue(model.items.isEmpty && model.modules.isEmpty)
        XCTAssertNil(model.dashboard)
        model.selectWorkspace(.client)
        XCTAssertEqual(model.selection, "site")
        await model.loadKind("task")
        let taskReads = await server.requests("/entities/task")
        XCTAssertEqual(taskReads.count, 1)
        XCTAssertTrue(model.items.isEmpty)
        await model.signOut()
        XCTAssertNil(model.identity)
    }

    @MainActor func testDelayedMessageReadCannotRepopulateTheNextWorkspace() async {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        await server.setRoles(["WORKER", "CLIENT"])
        await server.setPermissions(["task.read", "customer.portal", "chat.read"])
        let model = ERPConsoleModel(client: ERPConsoleClient(transport: server, pendingStore: journal))
        model.origin = origin; model.email = "synthetic@example.test"; model.password = "test"
        await model.signIn()
        model.selectWorkspace(.worker)
        let channel = "00000000-0000-4000-8000-000000000001"
        model.selectedChannel = channel
        let reached = expectation(description: "previous workspace requested messages")
        let gate = ERPRaceGate(reached)
        await server.hold("/api/v1/channels/\(channel)/messages", at: gate)
        await server.setPages([Data(#"{"items":[{"id":"old-message","kind":"message","version":1,"data":{}}],"has_more":false,"next_cursor":null}"#.utf8)])
        let old = Task { await model.loadMessages() }
        await fulfillment(of: [reached], timeout: 2)
        model.selectWorkspace(nil)
        model.selectWorkspace(.client)
        model.selectedChannel = channel
        await gate.release()
        await old.value
        XCTAssertEqual(model.selectedWorkspace, .client)
        XCTAssertTrue(model.messages.isEmpty)
        XCTAssertTrue(model.problem.isEmpty)
    }

    @MainActor func testUnknownWorkspaceWithWildcardDoesNotFetchDashboardOrCommands() async {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        await server.setRoles(["UNKNOWN"]); await server.setPermissions(["*"])
        let model = ERPConsoleModel(client: ERPConsoleClient(transport: server, pendingStore: journal))
        model.origin = origin; model.email = "synthetic@example.test"; model.password = "test"
        await model.signIn()
        XCTAssertNotNil(model.identity)
        XCTAssertTrue(model.availableWorkspaces.isEmpty && model.modules.isEmpty)
        model.selectWorkspace(.owner)
        XCTAssertNil(model.selectedWorkspace)
        await model.refreshActions()
        let dashboardReads = await server.requests("/dashboard")
        let catalogReads = await server.requests("/commands")
        XCTAssertTrue(dashboardReads.isEmpty && catalogReads.isEmpty)
        await model.signOut()
        XCTAssertNil(model.identity)
    }

    @MainActor func testRefreshingActionsDiscardsARevokedWorkspaceBeforePublishingCatalog() async {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        await server.setRoles(["STOREKEEPER"]); await server.setPermissions(["inventory.read"])
        let model = ERPConsoleModel(client: ERPConsoleClient(transport: server, pendingStore: journal))
        model.origin = origin; model.email = "synthetic@example.test"; model.password = "test"
        await model.signIn()
        XCTAssertEqual(model.selectedWorkspace, .staff)
        XCTAssertTrue(model.modules.contains { $0.kind == "material" })
        await server.setPermissions([])
        await model.refreshActions()
        XCTAssertNil(model.identity)
        XCTAssertNil(model.selectedWorkspace)
        XCTAssertTrue(model.modules.isEmpty && model.commands.isEmpty)
        let catalogReads = await server.requests("/commands")
        XCTAssertEqual(catalogReads.count, 1, "Only the original authorized login fetches its catalog")
    }

    private func quoteAction(_ highRisk: Bool = false) throws -> ERPCommand {
        let schema = try JSONDecoder().decode(ERPField.self, from: Data(#"{"type":"object","required":["id","quoteVersion"],"properties":{"id":{"type":"string"},"quoteVersion":{"type":"integer"},"acceptanceEvidence":{"type":"string"}}}"#.utf8))
        return ERPCommand(name: "quote.accept", permission: "quote.accept", highRisk: highRisk, schema: schema)
    }
    private func quoteRecord() throws -> ERPItem {
        try JSONDecoder().decode(ERPItem.self, from: Data(#"{"id":"quote-a","kind":"quote","version":7,"data":{"title":"Synthetic quote","quoteVersion":3}}"#.utf8))
    }
    private func quoteCatalog(_ highRisk: Bool = false) -> Data {
        Data((#"{"items":[{"name":"quote.accept","permission":"quote.accept","highRisk":HIGH_RISK,"schema":{"type":"object","required":["id","quoteVersion"],"properties":{"id":{"type":"string"},"quoteVersion":{"type":"integer"},"acceptanceEvidence":{"type":"string"}}}}]}"#).replacingOccurrences(of: "HIGH_RISK", with: highRisk ? "true" : "false").utf8)
    }
    @MainActor private func quoteModel(_ server: ERPFixtureTransport, journal: ERPMemoryJournal) async -> ERPConsoleModel {
        await server.setRoles(["CLIENT"])
        await server.setPermissions(["quote.accept", "quote.read"])
        await server.setCatalog(quoteCatalog())
        let model = ERPConsoleModel(client: ERPConsoleClient(transport: server, pendingStore: journal))
        model.origin = origin; model.email = "synthetic@example.test"; model.password = "test"
        await model.signIn()
        return model
    }

    @MainActor func testRecordSubmitPinsSnapshotAndAcknowledgedWriteSurvivesRefreshFailure() async throws {
        let journal = ERPMemoryJournal()
        // Use one journal for both the real client and transport observation.
        let transport = ERPFixtureTransport(journal: journal)
        let model = await quoteModel(transport, journal: journal)
        let action = try quoteAction()
        let context = try XCTUnwrap(ERPRecordActions.context(for: quoteRecord(), command: action, actor: XCTUnwrap(model.identity).actor))
        await transport.setEntityReadFailure(true)
        let applied = await model.submit(action, fields: ["id": "foreign-quote", "quoteVersion": "99", "acceptanceEvidence": "Explicit approval"],
                                         versionText: "999", expectedSession: model.sessionGeneration, context: context, confirmed: true)
        XCTAssertTrue(applied, "A later read failure must not invite a duplicate business command")
        XCTAssertEqual(model.selection, "quote", "Return to the original record kind, not the command result kind")
        let writes = await transport.writes()
        XCTAssertEqual(writes.count, 1)
        let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(writes.first?.httpBody)) as? [String: Any])
        let input = try XCTUnwrap(envelope["input"] as? [String: Any])
        XCTAssertEqual(input["id"] as? String, "quote-a")
        XCTAssertEqual(input["quoteVersion"] as? Int, 3)
        XCTAssertEqual(envelope["expected_version"] as? Int, 7)
        XCTAssertNil(try journal.load())
    }

    @MainActor func testCurrentSensitiveFlagRequiresConfirmationEvenIfOldCatalogDidNot() async throws {
        let journal = ERPMemoryJournal()
        let transport = ERPFixtureTransport(journal: journal)
        let model = await quoteModel(transport, journal: journal)
        let old = try quoteAction(false)
        // Deliberately elevate only this HTTP double to exercise a server catalog change.
        await transport.setCatalog(quoteCatalog(true))
        let rejected = await model.submit(old, fields: ["id": "quote-a", "quoteVersion": "3"], versionText: "7", expectedSession: model.sessionGeneration)
        XCTAssertFalse(rejected)
        let before = await transport.writes()
        XCTAssertTrue(before.isEmpty); XCTAssertNil(try journal.load())
        let accepted = await model.submit(old, fields: ["id": "quote-a", "quoteVersion": "3"], versionText: "7", expectedSession: model.sessionGeneration, confirmed: true)
        XCTAssertTrue(accepted)
        let after = await transport.writes()
        XCTAssertEqual(after.count, 1)
    }

    @MainActor func testCurrentPermissionAndOldFormSessionAreCheckedBeforeWrite() async throws {
        let journal = ERPMemoryJournal()
        let transport = ERPFixtureTransport(journal: journal)
        let model = await quoteModel(transport, journal: journal)
        let oldGeneration = model.sessionGeneration
        await model.signOut(); model.password = "test"; await model.signIn()
        let stale = await model.submit(try quoteAction(), fields: ["id": "quote-a", "quoteVersion": "3"], versionText: "7", expectedSession: oldGeneration, confirmed: true)
        XCTAssertFalse(stale)
        await transport.setPermissions([])
        let revoked = await model.submit(try quoteAction(), fields: ["id": "quote-a", "quoteVersion": "3"], versionText: "7", expectedSession: model.sessionGeneration, confirmed: true)
        XCTAssertFalse(revoked)
        let writes = await transport.writes()
        XCTAssertTrue(writes.isEmpty); XCTAssertNil(try journal.load())
    }

    @MainActor func testMalformedManualVersionIsNotSilentlyConvertedToUnversionedWrite() async throws {
        let journal = ERPMemoryJournal()
        let transport = ERPFixtureTransport(journal: journal)
        let model = await quoteModel(transport, journal: journal)
        for raw in ["invalid", "0", "-1", "1.5", "999999999999999999999"] {
            let applied = await model.submit(try quoteAction(), fields: ["id": "quote-a", "quoteVersion": "3"], versionText: raw, expectedSession: model.sessionGeneration, confirmed: true)
            XCTAssertFalse(applied, raw)
        }
        let writes = await transport.writes()
        XCTAssertTrue(writes.isEmpty); XCTAssertNil(try journal.load())
    }

    @MainActor func testUncertainContextualWriteUsesExistingExactJournalRecovery() async throws {
        let journal = ERPMemoryJournal()
        let transport = ERPFixtureTransport(journal: journal)
        let model = await quoteModel(transport, journal: journal)
        let action = try quoteAction()
        let context = try XCTUnwrap(ERPRecordActions.context(for: quoteRecord(), command: action, actor: XCTUnwrap(model.identity).actor))
        await transport.setOutcomes([.committedThenTimeout])
        let applied = await model.submit(action, fields: [:], versionText: "", expectedSession: model.sessionGeneration, context: context, confirmed: true)
        XCTAssertFalse(applied); XCTAssertTrue(model.hasPending)
        let saved = try XCTUnwrap(journal.load())
        XCTAssertEqual(saved.expectedVersion, 7)
        await model.retryPending()
        let writes = await transport.writes(), effects = await transport.effectCount()
        XCTAssertEqual(effects, 1); XCTAssertEqual(writes.count, 2)
        XCTAssertEqual(writes[0].httpBody, saved.body); XCTAssertEqual(writes[1].httpBody, saved.body)
        XCTAssertNil(try journal.load()); XCTAssertFalse(model.hasPending)
    }

    @MainActor func testDelayedActionCatalogCannotSubmitUnderNewLogin() async throws {
        let journal = ERPMemoryJournal()
        let transport = ERPFixtureTransport(journal: journal)
        let model = await quoteModel(transport, journal: journal)
        let reached = expectation(description: "old form waits for current catalog")
        let gate = ERPRaceGate(reached)
        await transport.hold("/api/v1/commands", at: gate)
        let action = try quoteAction(), generation = model.sessionGeneration
        let old = Task { await model.submit(action, fields: ["id": "quote-a", "quoteVersion": "3"], versionText: "7", expectedSession: generation, confirmed: true) }
        await fulfillment(of: [reached], timeout: 2)
        await model.signOut()
        await transport.setActor(user: "user-b")
        model.password = "new-test"; await model.signIn()
        await gate.release()
        let applied = await old.value
        XCTAssertFalse(applied); XCTAssertEqual(model.identity?.actor.userId, "user-b")
        let writes = await transport.writes()
        XCTAssertTrue(writes.isEmpty); XCTAssertNil(try journal.load())
    }

    func testCapturedCommandAuthorityRejectsAnotherSessionEvenForSameUser() async throws {
        let journal = ERPMemoryJournal()
        let transport = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: transport, pendingStore: journal)
        try await signIn(client)
        let authority = try await client.commandAuthority()
        await client.logout(); try await signIn(client)
        await expect(.accessChanged) { _ = try await client.execute(self.command, input: self.input, authority: authority) }
        let writes = await transport.writes()
        XCTAssertTrue(writes.isEmpty); XCTAssertNil(try journal.load())
    }

    private func credentialDefinition(_ name: String = "user.password.rotate") -> [String: Any] {
        let fields = name == "user.password.rotate" ? ["currentPassword", "newPassword"] : ["currentPassword", "secret", "otp"]
        return ["name": name, "permission": "identity.self", "highRisk": true,
                "schema": ["type": "object", "required": fields,
                           "properties": Dictionary(uniqueKeysWithValues: fields.map { ($0, ["type": "string"]) })]]
    }
    private func credentialCommand(_ name: String = "user.password.rotate") throws -> ERPCommand {
        try JSONDecoder().decode(ERPCommand.self, from: JSONSerialization.data(withJSONObject: credentialDefinition(name)))
    }
    private func credentialFields(_ name: String = "user.password.rotate") -> [String: String] {
        name == "user.password.rotate" ? ["currentPassword": " current-password ", "newPassword": " new-password "] :
            ["currentPassword": " current-password ", "secret": "JBSWY3DPEHPK3PXP", "otp": "123456"]
    }

    func testCredentialSuccessUsesFreshIdentityWithoutAnyJournalOrReplay() async throws {
        for name in ["user.password.rotate", "user.mfa.configure"] {
            let journal = ERPMemoryJournal(); journal.failInsert()
            let server = ERPFixtureTransport(journal: journal)
            await server.setPermissions(["identity.self"])
            let client = ERPConsoleClient(transport: server, pendingStore: journal)
            try await signIn(client)
            let before = await server.requests("/me").count
            let result = try await client.execute(credentialCommand(name), input: JSONSerialization.data(withJSONObject: credentialFields(name)))
            XCTAssertEqual(result.dictionary?["reauthenticationRequired"]?.bool, true)
            let identity = await client.identity, writes = await server.writes(), checks = await server.persistenceChecks()
            let reads = await server.requests("/me")
            XCTAssertNil(identity); XCTAssertNil(try journal.load()); XCTAssertEqual(journal.insertCount(), 0)
            XCTAssertEqual(reads.count, before + 1); XCTAssertEqual(writes.count, 1); XCTAssertEqual(checks, [false])
            let request = try XCTUnwrap(writes.first)
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), "csrf_user-a")
            XCTAssertTrue(request.value(forHTTPHeaderField: "Cookie")?.hasPrefix("knaba_session=") == true)
            let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
            XCTAssertEqual(envelope["input"] as? [String: String], credentialFields(name), "Credential whitespace is significant")
            let restarted = ERPConsoleClient(transport: server, pendingStore: journal)
            try await signIn(restarted)
            let pending = try await restarted.pendingCommand()
            XCTAssertNil(pending)
            await expect(.pendingChanged) { _ = try await restarted.retryPendingCommand() }
            let afterRestart = await server.writes()
            XCTAssertEqual(afterRestart.count, 1, "Neither login nor explicit recovery can replay a credential")
        }
    }

    func testEveryDispatchedCredentialFailureClearsSessionWithoutPersistenceOrRetry() async throws {
        let outcomes: [(ERPFixtureOutcome, ERPFailure)] = [
            (.committedThenTimeout, .credentialOutcomeUnknown),
            (.committedMalformedReceipt, .credentialOutcomeUnknown),
            (.reject(503, "synthetic-sensitive-server-error"), .credentialOutcomeUnknown),
            (.reject(400, "VALIDATION_ERROR"), .credentialReauthenticationRequired),
            (.reject(401, "ACCESS_DENIED"), .credentialReauthenticationRequired)
        ]
        for (outcome, expected) in outcomes {
            let journal = ERPMemoryJournal(), action = try credentialCommand()
            let server = ERPFixtureTransport(journal: journal)
            await server.setPermissions(["identity.self"]); await server.setOutcomes([outcome])
            let client = ERPConsoleClient(transport: server, pendingStore: journal)
            try await signIn(client)
            let payload = try JSONSerialization.data(withJSONObject: credentialFields())
            await expect(expected) { _ = try await client.execute(action, input: payload) }
            let identity = await client.identity
            XCTAssertNil(identity); XCTAssertNil(try journal.load()); XCTAssertEqual(journal.insertCount(), 0)
            try await signIn(client)
            let pending = try await client.pendingCommand()
            XCTAssertNil(pending)
            await expect(.pendingChanged) { _ = try await client.retryPendingCommand() }
            let writes = await server.writes(), checks = await server.persistenceChecks()
            XCTAssertEqual(writes.count, 1); XCTAssertEqual(checks, [false])
            XCTAssertFalse(expected.localizedDescription.contains("synthetic-sensitive-server-error"))
        }
    }

    func testLateCredentialSuccessTimeoutAndUnauthorizedResponseCannotClearNewLogin() async throws {
        for outcome in [ERPFixtureOutcome.applied, .committedThenTimeout, .reject(401, "ACCESS_DENIED")] {
            let journal = ERPMemoryJournal(), action = try credentialCommand()
            let server = ERPFixtureTransport(journal: journal)
            await server.setPermissions(["identity.self"]); await server.setOutcomes([outcome])
            let client = ERPConsoleClient(transport: server, pendingStore: journal)
            try await signIn(client)
            let reached = expectation(description: "credential POST dispatched")
            let barrier = ERPRaceGate(reached)
            await server.hold("/api/v1/commands/user.password.rotate", at: barrier)
            let payload = try JSONSerialization.data(withJSONObject: credentialFields())
            let old = Task { try await client.execute(action, input: payload) }
            await fulfillment(of: [reached], timeout: 2)
            await client.logout(); await server.setActor(user: "user-b"); try await signIn(client)
            await barrier.release()
            await expect(.accessChanged) { _ = try await old.value }
            let identity = await client.identity
            XCTAssertEqual(identity?.actor.userId, "user-b")
            XCTAssertNil(try journal.load()); XCTAssertEqual(journal.insertCount(), 0)
        }
    }

    func testCredentialFreshAuthorityChangesBlockBeforePostIncludingUnknownFutureScopes() async throws {
        let changes: [(String, Any)] = [("warehouseIds", ["warehouse-b"]), ("permissions", [] as [String]),
                                      ("mfaVerified", false), ("delegatedScope", ["region": "changed"])]
        for (key, value) in changes {
            let journal = ERPMemoryJournal(), action = try credentialCommand()
            let server = ERPFixtureTransport(journal: journal)
            await server.setPermissions(["identity.self"])
            let client = ERPConsoleClient(transport: server, pendingStore: journal)
            try await signIn(client)
            let identityData = await server.identityData()
            var document = try XCTUnwrap(JSONSerialization.jsonObject(with: identityData) as? [String: Any])
            var actor = try XCTUnwrap(document["actor"] as? [String: Any]); actor[key] = value; document["actor"] = actor
            await server.setMe(try JSONSerialization.data(withJSONObject: document))
            let payload = try JSONSerialization.data(withJSONObject: credentialFields())
            await expect(.accessChanged) { _ = try await client.execute(action, input: payload) }
            let writes = await server.writes(), identity = await client.identity
            XCTAssertTrue(writes.isEmpty, key); XCTAssertNil(identity); XCTAssertEqual(journal.insertCount(), 0)
        }
    }

    func testSecretShapedOrdinaryInputAndUnsafeLegacyJournalCannotBeSent() async throws {
        let journal = ERPMemoryJournal()
        let server = ERPFixtureTransport(journal: journal)
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(client)
        let unsafeInput = Data(#"{"taskId":"task-a","attachments":[{"nested":{"Access-Token":"synthetic-secret"}}]}"#.utf8)
        await expect(.sensitiveCommand) { _ = try await client.execute(self.command, input: unsafeInput) }
        XCTAssertNil(try journal.load()); XCTAssertEqual(journal.insertCount(), 0)
        let key = UUID().uuidString
        let legacy = ERPPendingCommand(schemaVersion: 1, origin: origin, companyId: "company-a", userId: "user-a",
                                       command: "user.password.rotate", idempotencyKey: key, expectedVersion: nil,
                                       body: try JSONSerialization.data(withJSONObject: ["idempotency_key": key, "input": credentialFields()]), createdAt: Date())
        journal.installLegacy(legacy)
        await expect(.pendingStorage) { _ = try await client.pendingCommand() }
        await expect(.pendingStorage) { _ = try await client.retryPendingCommand() }
        await expect(.pendingStorage) { _ = try await client.execute(self.command, input: self.input) }
        XCTAssertEqual(try journal.load(), legacy, "Unsafe legacy data is blocked, never silently discarded or replaced")
        let writes = await server.writes(); XCTAssertTrue(writes.isEmpty)
    }

    func testUnrelatedUnknownDurableWriteBlocksCredentialWithoutOverwritingJournal() async throws {
        let journal = ERPMemoryJournal(), action = try credentialCommand()
        let server = ERPFixtureTransport(journal: journal)
        await server.setPermissions(["task.work", "identity.self"])
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        try await signIn(client); await server.setOutcomes([.committedThenTimeout])
        await expect(.pendingUnknown) { _ = try await client.execute(self.command, input: self.input) }
        let saved = try XCTUnwrap(journal.load()), payload = try JSONSerialization.data(withJSONObject: credentialFields())
        await expect(.pendingExists) { _ = try await client.execute(action, input: payload) }
        XCTAssertEqual(try journal.load(), saved); XCTAssertEqual(journal.insertCount(), 1)
        XCTAssertNil(saved.body.range(of: Data("current-password".utf8)))
        let writes = await server.writes(); XCTAssertEqual(writes.count, 1)
    }

    @MainActor func testCredentialModelSuccessAndUnknownOutcomeRequireReauthenticationWithoutPendingUI() async throws {
        for (outcome, expectedSuccess) in [(ERPFixtureOutcome.applied, true), (.committedThenTimeout, false)] {
            let journal = ERPMemoryJournal(), action = try credentialCommand()
            let server = ERPFixtureTransport(journal: journal)
            await server.setPermissions(["identity.self"])
            await server.setCatalog(try JSONSerialization.data(withJSONObject: ["items": [credentialDefinition()]]))
            await server.setOutcomes([outcome])
            let model = ERPConsoleModel(client: ERPConsoleClient(transport: server, pendingStore: journal))
            model.origin = origin; model.email = "synthetic@example.test"; model.password = "test"
            await model.signIn()
            let applied = await model.submit(action, fields: credentialFields(), versionText: "",
                                             expectedSession: model.sessionGeneration, confirmed: true)
            XCTAssertEqual(applied, expectedSuccess); XCTAssertNil(model.identity); XCTAssertFalse(model.hasPending)
            XCTAssertFalse(model.busy); XCTAssertTrue(model.commands.isEmpty); XCTAssertTrue(model.password.isEmpty)
            XCTAssertEqual(expectedSuccess ? model.notice : model.problem, model.text(expectedSuccess ? .credentialReauth : .credentialUnknown))
            XCTAssertNil(try journal.load()); XCTAssertEqual(journal.insertCount(), 0)
        }
    }

    @MainActor func testLateCredentialModelCompletionCannotClearNewAccountPresentation() async throws {
        let journal = ERPMemoryJournal(), action = try credentialCommand()
        let server = ERPFixtureTransport(journal: journal)
        await server.setPermissions(["identity.self"])
        await server.setCatalog(try JSONSerialization.data(withJSONObject: ["items": [credentialDefinition()]]))
        let client = ERPConsoleClient(transport: server, pendingStore: journal)
        let model = ERPConsoleModel(client: client)
        model.origin = origin; model.email = "synthetic@example.test"; model.password = "test"
        await model.signIn()
        let reached = expectation(description: "model credential POST dispatched")
        let barrier = ERPRaceGate(reached)
        await server.hold("/api/v1/commands/user.password.rotate", at: barrier)
        let session = model.sessionGeneration, fields = credentialFields()
        let old = Task { await model.submit(action, fields: fields, versionText: "", expectedSession: session, confirmed: true) }
        await fulfillment(of: [reached], timeout: 2)
        await model.signOut(); await server.setActor(user: "user-b")
        model.password = "new-test"; await model.signIn()
        await barrier.release(); let applied = await old.value
        XCTAssertFalse(applied); XCTAssertEqual(model.identity?.actor.userId, "user-b")
        let identity = await client.identity; XCTAssertEqual(identity?.actor.userId, "user-b")
        XCTAssertNil(try journal.load()); XCTAssertEqual(journal.insertCount(), 0)
    }
}
