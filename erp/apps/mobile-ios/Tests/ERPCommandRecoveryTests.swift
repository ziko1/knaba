import XCTest
@testable import KNABADE

private final class ERPMemoryJournal: ERPPendingCommandStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var command: ERPPendingCommand?
    private var insertFailure = false
    func failInsert() { lock.lock(); defer { lock.unlock() }; insertFailure = true }
    func load() throws -> ERPPendingCommand? { lock.lock(); defer { lock.unlock() }; return command }
    func insert(_ next: ERPPendingCommand) throws {
        lock.lock(); defer { lock.unlock() }
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
    func setPages(_ values: [Data]) { entityPages = values }
    func setOutcomes(_ values: [ERPFixtureOutcome]) { outcomes = values }
    func hold(_ path: String, at gate: ERPRaceGate) { gates[path] = gate }
    func requests(_ suffix: String) -> [URLRequest] { seen.filter { $0.url?.path.hasSuffix(suffix) == true } }
    func writes() -> [URLRequest] { seen.filter { $0.httpMethod == "POST" && $0.url?.path.contains("/commands/") == true } }
    func effectCount() -> Int { effects.count }
    func persistenceChecks() -> [Bool] { storedBeforeWrite }
    func identityData() -> Data {
        try! JSONSerialization.data(withJSONObject: [
            "actor": ["userId": user, "companyId": company, "roles": ["EMPLOYEE"], "permissions": ["task.work", "chat.write"]],
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
                    if case .committedThenTimeout = outcome { timeout = true }
                    if case .committedMalformedReceipt = outcome { body = Data("not-json".utf8) }
                }
            }
        } else if path.hasSuffix("/dashboard") {
            body = Data(#"{"counts":{},"activeShifts":0}"#.utf8)
        } else if path.hasSuffix("/commands") {
            body = Data(#"{"items":[]}"#.utf8)
        } else if path.contains("/entities/") {
            body = entityPages.isEmpty ? Data(#"{"items":[],"has_more":false}"#.utf8) : entityPages.removeFirst()
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
}
