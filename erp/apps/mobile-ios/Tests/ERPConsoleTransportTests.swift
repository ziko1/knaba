import XCTest
@testable import KNABADE

private enum ERPStubReply: Sendable {
    case response(Data, Int, [String: String])
    case failure(URLError.Code)
    static func json(_ body: String, status: Int = 200, headers: [String: String] = [:]) -> ERPStubReply {
        .response(Data(body.utf8), status, headers)
    }
    func result(for request: URLRequest) throws -> (Data, HTTPURLResponse) {
        switch self {
        case .failure(let code): throw URLError(code)
        case .response(let data, let status, let headers):
            var fields = headers; fields["Content-Type"] = fields["Content-Type"] ?? "application/json"
            return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: fields)!)
        }
    }
}

private actor ERPStubTransport: ERPConsoleTransport {
    let replies: [ERPStubReply]
    let holds: [Int: XCTestExpectation]
    let onRequest: (@Sendable (URLRequest) -> Void)?
    private var received: [URLRequest] = []
    private var continuations: [Int: CheckedContinuation<(Data, HTTPURLResponse), Error>] = [:]
    init(_ replies: [ERPStubReply], holds: [Int: XCTestExpectation] = [:], onRequest: (@Sendable (URLRequest) -> Void)? = nil) {
        self.replies = replies; self.holds = holds; self.onRequest = onRequest
    }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let index = received.count
        received.append(request)
        onRequest?(request)
        guard replies.indices.contains(index) else { throw URLError(.badServerResponse) }
        if let signal = holds[index] {
            return try await withCheckedThrowingContinuation { continuation in
                continuations[index] = continuation
                signal.fulfill()
            }
        }
        return try replies[index].result(for: request)
    }
    func release(_ index: Int) -> Bool {
        guard let continuation = continuations.removeValue(forKey: index), received.indices.contains(index) else { return false }
        do { continuation.resume(returning: try replies[index].result(for: received[index])) }
        catch { continuation.resume(throwing: error) }
        return true
    }
    func requests() -> [URLRequest] { received }
}

private final class ERPTestJournal: ERPCommandJournal, @unchecked Sendable {
    private let lock = NSLock()
    private var records: [String: ERPPendingCommand] = [:]
    private(set) var persistCount = 0
    private let writeFailure: Bool
    init(writeFailure: Bool = false) { self.writeFailure = writeFailure }
    func read(scope: String) throws -> ERPPendingCommand? {
        lock.lock(); defer { lock.unlock() }
        return records[scope]
    }
    func persist(_ command: ERPPendingCommand) throws {
        lock.lock(); defer { lock.unlock() }
        if writeFailure { throw ERPFailure.recoveryUnavailable }
        guard records[command.scope] == nil || records[command.scope] == command else { throw ERPFailure.pendingCommand }
        records[command.scope] = command; persistCount += 1
    }
    func remove(scope: String, idempotencyKey: String) throws {
        lock.lock(); defer { lock.unlock() }
        guard records[scope]?.idempotencyKey == idempotencyKey else { throw ERPFailure.recoveryInvalid }
        records.removeValue(forKey: scope)
    }
    func all() -> [ERPPendingCommand] {
        lock.lock(); defer { lock.unlock() }
        return Array(records.values)
    }
}

@MainActor
final class ERPConsoleTransportTests: XCTestCase {
    private let origin = "https://erp.example.test"
    private let command = ERPCommand(name: "task.start", permission: "task.work", highRisk: false, schema: nil)
    private let input = Data(#"{"taskId":"synthetic-task"}"#.utf8)
    private let csrf = String(repeating: "c", count: 43)
    private let cookie = String(repeating: "s", count: 43)

    private func identity(_ user: String = "user-a", company: String = "company-a", permissions: [String] = ["task.work", "chat.write"],
                          timestamp: Bool = false, mfa: Bool = false, csrfToken: String? = nil, userID: String? = nil) -> String {
        var actor: [String: Any] = ["userId": user, "companyId": company, "roles": ["EMPLOYEE"], "permissions": permissions,
                                    "siteIds": ["site-a"], "customerIds": [], "warehouseIds": [], "mfaVerified": mfa]
        if timestamp { actor["mfaVerifiedAt"] = "2026-11-08T10:00:00.000Z" }
        let value: [String: Any] = ["actor": actor, "user": ["id": userID ?? user, "name": "Synthetic test user"], "csrfToken": csrfToken ?? csrf, "mode": "TEST"]
        return String(data: try! JSONSerialization.data(withJSONObject: value), encoding: .utf8)!
    }
    private func login(_ user: String = "user-a", company: String = "company-a", csrfToken: String? = nil, cookieSuffix: String = "") -> ERPStubReply {
        .json(identity(user, company: company, csrfToken: csrfToken), headers: ["Set-Cookie": "knaba_session=\(cookie)\(cookieSuffix); Path=/; HttpOnly; Secure"])
    }
    private func signIn(_ client: ERPConsoleClient, origin: String? = nil) async throws {
        try await client.configure(origin ?? self.origin)
        _ = try await client.login(email: "synthetic@example.test", password: "Synthetic-only password")
    }
    private func assertFailure<T>(_ expected: ERPFailure, operation: () async throws -> T, file: StaticString = #filePath, line: UInt = #line) async {
        do { _ = try await operation(); XCTFail("Expected \(expected)", file: file, line: line) }
        catch { XCTAssertEqual(error as? ERPFailure, expected, file: file, line: line) }
    }

    func testUnknownWritePersistsBeforeNetworkAndExplicitRetryUsesOriginalBytesAfterRestart() async throws {
        let journal = ERPTestJournal()
        let transport = ERPStubTransport([login(), .failure(.timedOut), login(), .json(identity(timestamp: true)), .json(#"{"id":"synthetic-task","version":4}"#)], onRequest: { request in
            if request.url?.path == "/api/v1/commands/task.start" {
                XCTAssertEqual(journal.all().first?.body, request.httpBody, "Recovery must exist before a request can be submitted")
            }
        })
        let first = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(first)
        do { _ = try await first.execute(command, input: input, expectedVersion: 3); XCTFail("Expected transport timeout") }
        catch { XCTAssertEqual((error as? URLError)?.code, .timedOut) }
        let firstPending = try await first.pendingCommand()
        let saved = try XCTUnwrap(firstPending)
        XCTAssertEqual(saved.expectedVersion, 3)
        let restarted = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(restarted)
        let recovered = try await restarted.pendingCommand()
        XCTAssertEqual(recovered, saved)
        await assertFailure(.pendingCommand) { try await restarted.execute(command, input: self.input, expectedVersion: 999) }
        let reply = try await restarted.retryPending()
        XCTAssertEqual(reply.dictionary?["id"]?.string, "synthetic-task")
        let remaining = try await restarted.pendingCommand()
        XCTAssertNil(remaining)
        let requests = await transport.requests()
        let mutations = requests.filter { $0.url?.path == "/api/v1/commands/task.start" }
        XCTAssertEqual(mutations.count, 2)
        XCTAssertEqual(mutations.first?.httpBody, mutations.last?.httpBody)
        XCTAssertEqual(journal.persistCount, 1)
        XCTAssertEqual(requests.count, 5, "Restart/login must never automatically replay an unresolved action")
    }

    func testRecoveryFailureStopsMutationBeforeTheNetwork() async throws {
        let journal = ERPTestJournal(writeFailure: true)
        let transport = ERPStubTransport([login()])
        let client = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(client)
        await assertFailure(.recoveryUnavailable) { try await client.execute(self.command, input: self.input) }
        let count = await transport.requests().count
        XCTAssertEqual(count, 1)
        XCTAssertTrue(journal.all().isEmpty)
    }

    func testAnotherUserCompanyOrOriginCannotSeeOrReplaySavedCommand() async throws {
        let journal = ERPTestJournal()
        let transport = ERPStubTransport([login(), .failure(.networkConnectionLost), login("user-b"), login(company: "company-b"), login(), login()])
        let owner = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(owner)
        _ = try? await owner.execute(command, input: input)
        let ownerPending = try await owner.pendingCommand()
        let original = try XCTUnwrap(ownerPending)
        for server in [origin, origin, "https://another.example.test"] {
            let other = ERPConsoleClient(transport: transport, journal: journal)
            try await signIn(other, origin: server)
            let pending = try await other.pendingCommand()
            XCTAssertNil(pending)
            await assertFailure(.noPendingCommand) { try await other.retryPending() }
        }
        let returning = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(returning)
        let restored = try await returning.pendingCommand()
        XCTAssertEqual(restored, original)
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path.hasPrefix("/api/v1/commands/") == true }.count, 1)
    }

    func testFirstValidationRejectionResolvesButLaterRejectionAfterUnknownRetainsOriginalKey() async throws {
        let journal = ERPTestJournal()
        let transport = ERPStubTransport([login(), .json(#"{"code":"VALIDATION_ERROR"}"#, status: 400), .failure(.timedOut),
                                          .json(identity(timestamp: true)), .json(#"{"code":"VERSION_CONFLICT"}"#, status: 409)])
        let client = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(client)
        await assertFailure(.http(400, "VALIDATION_ERROR")) { try await client.execute(self.command, input: self.input) }
        let cleared = try await client.pendingCommand(); XCTAssertNil(cleared)
        _ = try? await client.execute(command, input: input)
        let saved = try await client.pendingCommand()
        await assertFailure(.http(409, "VERSION_CONFLICT")) { try await client.retryPending() }
        let retained = try await client.pendingCommand()
        XCTAssertEqual(saved, retained)
        await assertFailure(.pendingCommand) { try await client.execute(self.command, input: self.input) }
    }

    func testKnown422PreconditionRejectionAllowsCorrectionButDoesNotResolvePriorUnknown() async throws {
        for code in ["NEEDS_APPROVAL", "MISSING_CONFIGURATION"] {
            let journal = ERPTestJournal()
            let rejection = ERPStubReply.json("{\"code\":\"\(code)\"}", status: 422)
            let transport = ERPStubTransport([login(), rejection, .failure(.timedOut), .json(identity(timestamp: true)), rejection])
            let client = ERPConsoleClient(transport: transport, journal: journal)
            try await signIn(client)
            let review = ERPCommand(name: "task.review", permission: "task.review", highRisk: false, schema: nil)
            let reviewInput = Data(#"{"taskId":"synthetic-task","decision":"ACCEPT"}"#.utf8)
            await assertFailure(.http(422, code)) { try await client.execute(review, input: reviewInput) }
            let cleared = try await client.pendingCommand(); XCTAssertNil(cleared)
            // A correction can now be attempted. Its timeout must remain unresolved,
            // even if a later retry sees the same documented 422 precondition code.
            _ = try? await client.execute(command, input: input)
            let unknown = try await client.pendingCommand()
            await assertFailure(.http(422, code)) { try await client.retryPending() }
            let retained = try await client.pendingCommand(); XCTAssertEqual(retained, unknown)
        }
    }

    func test401AndIdempotencyConflictNeverDiscardRecovery() async throws {
        let journal = ERPTestJournal()
        let transport = ERPStubTransport([login(), .json(#"{"code":"NEEDS_REAUTH"}"#, status: 401), login(), .json(identity(timestamp: true)), .json(#"{"code":"IDEMPOTENCY_CONFLICT"}"#, status: 409)])
        let client = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(client)
        await assertFailure(.http(401, "NEEDS_REAUTH")) { try await client.execute(self.command, input: self.input) }
        let hasSession = await client.hasSession(); XCTAssertFalse(hasSession)
        let hidden = try await client.pendingCommand(); XCTAssertNil(hidden)
        XCTAssertEqual(journal.all().count, 1)
        try await signIn(client)
        let original = try await client.pendingCommand()
        await assertFailure(.http(409, "IDEMPOTENCY_CONFLICT")) { try await client.retryPending() }
        let retained = try await client.pendingCommand(); XCTAssertEqual(retained, original)
    }

    func testConcurrentMutationsCannotReplaceOrDuplicateTheInFlightCommand() async throws {
        let submitted = expectation(description: "first mutation reached transport")
        let journal = ERPTestJournal()
        let transport = ERPStubTransport([login(), .json(#"{"ok":true}"#)], holds: [1: submitted])
        let client = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(client)
        let first = Task { try await client.execute(command, input: input) }
        await fulfillment(of: [submitted], timeout: 3)
        await assertFailure(.commandInFlight) { try await client.execute(self.command, input: self.input) }
        await assertFailure(.commandInFlight) { try await client.retryPending() }
        let released = await transport.release(1); XCTAssertTrue(released)
        _ = try await first.value
        XCTAssertEqual(journal.persistCount, 1)
        let requests = await transport.requests(); XCTAssertEqual(requests.count, 2)
    }

    func testLogoutInvalidatesPendingLoginBeforeItsResponseCanInstallSession() async throws {
        let waiting = expectation(description: "login submitted")
        let transport = ERPStubTransport([login()], holds: [0: waiting])
        let client = ERPConsoleClient(transport: transport, journal: ERPTestJournal())
        try await client.configure(origin)
        let signIn = Task { try await client.login(email: "synthetic@example.test", password: "Synthetic password") }
        await fulfillment(of: [waiting], timeout: 3)
        await client.logout()
        let released = await transport.release(0); XCTAssertTrue(released)
        await assertFailure(.accessChanged) { try await signIn.value }
        let identity = await client.identity; XCTAssertNil(identity)
        let hasSession = await client.hasSession(); XCTAssertFalse(hasSession)
    }

    func testLogoutClearsLocallyBeforeIOAndOldCompletionCannotEraseNewAccount() async throws {
        let mutationStarted = expectation(description: "mutation submitted")
        let logoutStarted = expectation(description: "old logout submitted")
        let journal = ERPTestJournal()
        let transport = ERPStubTransport([login(), .json(#"{"ok":true}"#), .json(#"{"ok":true}"#), login("user-b")], holds: [1: mutationStarted, 2: logoutStarted])
        let client = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(client)
        let mutation = Task { try await client.execute(command, input: input) }
        await fulfillment(of: [mutationStarted], timeout: 3)
        let logout = Task { await client.logout() }
        await fulfillment(of: [logoutStarted], timeout: 3)
        let localSession = await client.hasSession(); XCTAssertFalse(localSession)
        try await signIn(client)
        let releaseMutation = await transport.release(1); XCTAssertTrue(releaseMutation)
        let releaseLogout = await transport.release(2); XCTAssertTrue(releaseLogout)
        await assertFailure(.accessChanged) { try await mutation.value }
        await logout.value
        let current = await client.identity; XCTAssertEqual(current?.actor.userId, "user-b")
        let hidden = try await client.pendingCommand(); XCTAssertNil(hidden)
        XCTAssertEqual(journal.all().count, 1, "Late success is not consumed after its actor session is detached")
    }

    func testChangedPermissionsFenceOlderReadsAndChangedUserIsRejected() async throws {
        let readStarted = expectation(description: "dashboard submitted")
        let transport = ERPStubTransport([login(), .json(#"{"counts":{"private":9}}"#), .json(identity(permissions: [], timestamp: true)), .json(identity("user-b", timestamp: true))], holds: [1: readStarted])
        let client = ERPConsoleClient(transport: transport, journal: ERPTestJournal())
        try await signIn(client)
        let dashboard = Task { try await client.dashboard() }
        await fulfillment(of: [readStarted], timeout: 3)
        let refreshed = try await client.refresh(); XCTAssertTrue(refreshed.actor.permissions.isEmpty)
        let released = await transport.release(1); XCTAssertTrue(released)
        await assertFailure(.accessChanged) { try await dashboard.value }
        await assertFailure(.accessChanged) { try await client.refresh() }
        let hasSession = await client.hasSession(); XCTAssertFalse(hasSession)
    }

    func testMalformedRefreshCannotKeepAnAuthenticatedSession() async throws {
        for malformed in [identity(timestamp: true, csrfToken: ""), identity(timestamp: true, userID: "different-user"), #"{"actor":{}}"#] {
            let transport = ERPStubTransport([login(), .json(malformed)])
            let client = ERPConsoleClient(transport: transport, journal: ERPTestJournal())
            try await signIn(client)
            do { _ = try await client.refresh(); XCTFail("Malformed identity must fail") } catch { }
            let current = await client.hasSession(); XCTAssertFalse(current)
        }
    }

    func testLoginRequiresCompleteCSRFAndCookieBoundary() async throws {
        for response in [login(csrfToken: "short"), login(cookieSuffix: ".evil"), login(cookieSuffix: String(repeating: "x", count: 100))] {
            let transport = ERPStubTransport([response])
            let client = ERPConsoleClient(transport: transport, journal: ERPTestJournal())
            await assertFailure(.invalidResponse) { try await self.signIn(client) }
            let current = await client.hasSession(); XCTAssertFalse(current)
        }
    }

    func testOriginChangeRejectsOldResponseAndCursorCannotInjectAnotherQuery() async throws {
        let pageStarted = expectation(description: "second page submitted")
        let first = #"{"items":[],"has_more":true,"next_cursor":"opaque&limit=9000#token"}"#
        let transport = ERPStubTransport([login(), .json(first), .json(#"{"items":[],"has_more":false}"#)], holds: [2: pageStarted])
        let client = ERPConsoleClient(transport: transport, journal: ERPTestJournal())
        try await signIn(client)
        let pages = Task { try await client.entities("task") }
        await fulfillment(of: [pageStarted], timeout: 3)
        let requests = await transport.requests()
        let components = URLComponents(url: requests[2].url!, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(components.queryItems?.count, 2)
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "cursor" })?.value, "opaque&limit=9000#token")
        try await client.configure("https://new.example.test")
        let released = await transport.release(2); XCTAssertTrue(released)
        await assertFailure(.accessChanged) { try await pages.value }
    }

    func testSecretsNeverReachTheRecoveryJournalAndPasswordChangePreservesWhitespace() async throws {
        let journal = ERPTestJournal()
        let transport = ERPStubTransport([login(), .json(identity(timestamp: true)), .json(#"{"ok":true,"reauthenticationRequired":true}"#)])
        let client = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(client)
        let unsafe = Data(#"{"nested":[{"api_token":"do-not-store"}]}"#.utf8)
        await assertFailure(.sensitiveCommand) { try await client.execute(self.command, input: unsafe) }
        let password = ERPCommand(name: "user.password.rotate", permission: "identity.self", highRisk: true, schema: nil)
        let bytes = Data(#"{"currentPassword":" old password ","newPassword":" new password "}"#.utf8)
        let result = try await client.execute(password, input: bytes)
        XCTAssertEqual(result.dictionary?["reauthenticationRequired"]?.bool, true)
        let hasSession = await client.hasSession(); XCTAssertFalse(hasSession)
        XCTAssertEqual(journal.persistCount, 0)
        XCTAssertTrue(journal.all().isEmpty)
        let requests = await transport.requests()
        XCTAssertEqual(requests.count, 3)
        let payload = try JSONSerialization.jsonObject(with: requests[2].httpBody!) as! [String: Any]
        XCTAssertEqual((payload["input"] as? [String: String])?["currentPassword"], " old password ")
        XCTAssertEqual((payload["input"] as? [String: String])?["newPassword"], " new password ")
    }

    func testSensitiveTimeoutRequiresReauthenticationWithoutAnyDurableRetry() async throws {
        let journal = ERPTestJournal()
        let transport = ERPStubTransport([login(), .json(identity(timestamp: true)), .failure(.timedOut)])
        let client = ERPConsoleClient(transport: transport, journal: journal)
        try await signIn(client)
        let mfa = ERPCommand(name: "user.mfa.configure", permission: "identity.self", highRisk: true, schema: nil)
        do {
            _ = try await client.execute(mfa, input: Data(#"{"currentPassword":"Synthetic password","secret":"ABCDEFGHIJKLMNOP","otp":"123456"}"#.utf8))
            XCTFail("Expected timeout")
        } catch { XCTAssertEqual((error as? URLError)?.code, .timedOut) }
        let current = await client.hasSession(); XCTAssertFalse(current)
        XCTAssertEqual(journal.persistCount, 0)
        XCTAssertTrue(journal.all().isEmpty)
        await assertFailure(.expired) { try await client.retryPending() }
    }

    func testMFAAuthorityChangeStillFencesAnInFlightRead() async throws {
        let readStarted = expectation(description: "dashboard submitted")
        let transport = ERPStubTransport([login(), .json(#"{"counts":{}}"#), .json(identity(timestamp: true, mfa: true))], holds: [1: readStarted])
        let client = ERPConsoleClient(transport: transport, journal: ERPTestJournal())
        try await signIn(client)
        let dashboard = Task { try await client.dashboard() }
        await fulfillment(of: [readStarted], timeout: 3)
        _ = try await client.refresh()
        let released = await transport.release(1); XCTAssertTrue(released)
        await assertFailure(.accessChanged) { try await dashboard.value }
    }

    func testOversizedOrMalformedSuccessRetainsUnknownCommand() async throws {
        for reply in [ERPStubReply.response(Data(repeating: 32, count: ERPURLSessionTransport.maximumResponseBytes + 1), 200, [:]), .json("not-json")] {
            let journal = ERPTestJournal()
            let transport = ERPStubTransport([login(), reply])
            let client = ERPConsoleClient(transport: transport, journal: journal)
            try await signIn(client)
            do { _ = try await client.execute(command, input: input); XCTFail("Invalid response must fail") } catch { }
            let pending = try await client.pendingCommand(); XCTAssertNotNil(pending)
            XCTAssertEqual(journal.all().count, 1)
        }
    }
}
