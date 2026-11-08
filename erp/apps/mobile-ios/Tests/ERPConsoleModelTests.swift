import XCTest
@testable import KNABADE

private actor ModelGate {
    private var isEntered = false
    private var isOpen = false
    private var enterWaiters: [CheckedContinuation<Void, Never>] = []
    private var releaseWaiters: [CheckedContinuation<Void, Never>] = []
    func pause() async {
        isEntered = true; enterWaiters.forEach { $0.resume() }; enterWaiters.removeAll()
        if !isOpen { await withCheckedContinuation { releaseWaiters.append($0) } }
    }
    func entered() async { if !isEntered { await withCheckedContinuation { enterWaiters.append($0) } } }
    func release() { isOpen = true; releaseWaiters.forEach { $0.resume() }; releaseWaiters.removeAll() }
}

private final class ModelJournal: ERPCommandJournal, @unchecked Sendable {
    private let lock = NSLock()
    private var records: [String: ERPPendingCommand] = [:]
    func read(scope: String) throws -> ERPPendingCommand? { lock.lock(); defer { lock.unlock() }; return records[scope] }
    func persist(_ command: ERPPendingCommand) throws { lock.lock(); defer { lock.unlock() }; records[command.scope] = command }
    func remove(scope: String, idempotencyKey: String) throws {
        lock.lock(); defer { lock.unlock() }
        if records[scope]?.idempotencyKey == idempotencyKey { records.removeValue(forKey: scope) }
    }
}

private struct UnavailableModelJournal: ERPCommandJournal {
    func read(scope: String) throws -> ERPPendingCommand? { throw ERPFailure.recoveryInvalid }
    func persist(_ command: ERPPendingCommand) throws { throw ERPFailure.recoveryInvalid }
    func remove(scope: String, idempotencyKey: String) throws { throw ERPFailure.recoveryInvalid }
}

private actor ModelTransport: ERPConsoleTransport {
    var roles = ["EMPLOYEE"]
    // The fixture advertises task.start, whose real server permission is task.work.
    var permissions = ["site.read", "task.read", "task.work", "chat.read", "chat.write", "identity.self"]
    var warehouses = ["warehouse-a"]
    var block: [String: ModelGate] = [:]
    var failCommands = false
    private(set) var receivedPassword = ""
    func gate(_ path: String, _ gate: ModelGate) { block[path] = gate }
    func setRights(roles: [String], permissions: [String]) { self.roles = roles; self.permissions = permissions }
    func setWarehouses(_ ids: [String]) { warehouses = ids }
    func failCommandRequests() { failCommands = true }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let url = request.url!, path = url.path
        var headers = ["Content-Type": "application/json"]
        let body: [String: Any]
        switch path {
        case "/api/v1/auth/login", "/api/v1/me":
            var actor: [String: Any] = ["userId": "user-a", "companyId": "company-a", "roles": roles,
                                      "permissions": permissions, "siteIds": ["site-a"], "customerIds": [],
                                      "warehouseIds": warehouses, "mfaVerified": false]
            if path.hasSuffix("/me") { actor["mfaVerifiedAt"] = "2026-11-08T08:00:00.000Z" }
            body = ["actor": actor, "user": ["id": "user-a", "name": "Synthetic worker"], "csrfToken": String(repeating: "c", count: 40)]
            if path.hasSuffix("/login") {
                headers["Set-Cookie"] = "knaba_session=" + String(repeating: "s", count: 40) + "; Path=/; HttpOnly; Secure"
                receivedPassword = (try JSONSerialization.jsonObject(with: request.httpBody!) as? [String: String])?["password"] ?? ""
            }
        case "/api/v1/dashboard": body = ["counts": ["site": 1, "task": 1], "activeShifts": 0]
        case "/api/v1/commands":
            body = ["items": [["name": "task.start", "permission": "task.work", "highRisk": false,
                               "schema": ["type": "object", "properties": ["taskId": ["type": "string"]], "required": ["taskId"]]]]]
        case "/api/v1/entities/site", "/api/v1/entities/task":
            body = ["items": [["id": "record-a", "kind": path.hasSuffix("/site") ? "site" : "task", "version": 2,
                                "data": ["title": "Private original data", "state": "ASSIGNED"]]], "has_more": false]
        case "/api/v1/auth/logout": body = ["ok": true]
        default:
            if path.hasPrefix("/api/v1/commands/") {
                if failCommands { throw URLError(.timedOut) }
                body = ["ok": true, "record": ["title": "Confirmed server result"]]
            } else { body = ["items": [], "has_more": false] }
        }
        let data = try JSONSerialization.data(withJSONObject: body)
        if let hold = block[path] { await hold.pause() }
        return (data, HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
    }
}

@MainActor final class ERPConsoleModelTests: XCTestCase {
    private func login(_ transport: ModelTransport, journal: any ERPCommandJournal = ModelJournal()) async -> ERPConsoleModel {
        let defaults = UserDefaults(suiteName: "KNABA.ModelTests." + UUID().uuidString)!
        let client = ERPConsoleClient(transport: transport, journal: journal)
        let model = ERPConsoleModel(client: client, preferences: defaults)
        model.origin = "https://knaba.example"; model.email = "synthetic@example.test"; model.password = " exact synthetic password "
        await model.signIn()
        XCTAssertNotNil(model.identity)
        return model
    }
    func testRecoveryFailureKeepsAuthenticatedReadViewsAndBlocksWrites() async throws {
        let model = await login(ModelTransport(), journal: UnavailableModelJournal())
        XCTAssertNotNil(model.identity)
        XCTAssertTrue(model.recoveryBlocked)
        XCTAssertFalse(model.canWrite)
        XCTAssertFalse(model.problem.isEmpty)
        XCTAssertEqual(model.dashboard?.counts["task"], 1)
        await model.loadKind("task")
        XCTAssertEqual(model.items.first?.id, "record-a")
        XCTAssertTrue(model.recoveryBlocked)
        let command = try XCTUnwrap(model.commands.first)
        let submitted = await model.submit(command, fields: ["taskId": "record-a"], versionText: "2", expectedSession: model.sessionRevision)
        XCTAssertFalse(submitted)
        XCTAssertTrue(model.recoveryBlocked)
    }
    func testSignInPreservesPasswordAndNormalizesAvailableSelection() async {
        let transport = ModelTransport()
        await transport.setRights(roles: ["CLIENT"], permissions: ["chat.read"])
        let model = await login(transport)
        let password = await transport.receivedPassword
        XCTAssertEqual(password, " exact synthetic password ")
        XCTAssertEqual(model.password, "")
        XCTAssertEqual(model.selection, "site")
        XCTAssertFalse(model.modules.contains { $0.kind == "task" })
    }
    func testLogoutClearsPrivateViewsBeforeSlowNetworkAndLateReadCannotReturn() async {
        let transport = ModelTransport(), model = await login(transport)
        let readGate = ModelGate(), logoutGate = ModelGate()
        await transport.gate("/api/v1/entities/site", readGate)
        await transport.gate("/api/v1/auth/logout", logoutGate)
        let readTask = Task { await model.loadKind("site") }
        await readGate.entered()
        let logoutTask = Task { await model.signOut() }
        await logoutGate.entered()
        XCTAssertNil(model.identity); XCTAssertTrue(model.items.isEmpty); XCTAssertTrue(model.commands.isEmpty)
        await readGate.release(); await readTask.value
        XCTAssertNil(model.identity); XCTAssertTrue(model.items.isEmpty)
        await logoutGate.release(); await logoutTask.value
    }
    func testRightsRefreshRemovesOldRecordsAndDetailNavigation() async {
        let transport = ModelTransport(), model = await login(transport)
        await model.loadKind("task"); XCTAssertFalse(model.items.isEmpty)
        let revision = model.sessionRevision
        await transport.setRights(roles: ["CLIENT"], permissions: ["chat.read"])
        await model.reloadSession()
        XCTAssertTrue(model.items.isEmpty); XCTAssertTrue(model.commands.isEmpty)
        XCTAssertGreaterThan(model.sessionRevision, revision); XCTAssertEqual(model.selection, "site")
    }
    func testWarehouseScopeRefreshAlsoClearsPrivateResults() async {
        let transport = ModelTransport(), model = await login(transport)
        await model.reloadSession()
        await model.loadKind("site"); XCTAssertFalse(model.items.isEmpty)
        let revision = model.sessionRevision
        await transport.setWarehouses(["warehouse-b"])
        await model.reloadSession()
        XCTAssertTrue(model.items.isEmpty)
        XCTAssertGreaterThan(model.sessionRevision, revision)
    }
    func testLatePreviousSelectionCannotReplaceCurrentRecords() async {
        let transport = ModelTransport(), model = await login(transport)
        let hold = ModelGate(); await transport.gate("/api/v1/entities/site", hold)
        let slow = Task { await model.loadKind("site") }
        await hold.entered(); await model.loadKind("task")
        XCTAssertEqual(model.items.first?.kind, "task")
        await hold.release(); await slow.value
        XCTAssertEqual(model.selection, "task"); XCTAssertEqual(model.items.first?.kind, "task")
    }
    func testCommandResultIsVisibleOnlyWithinItsSession() async throws {
        let model = await login(ModelTransport())
        let cmd = try XCTUnwrap(model.commands.first)
        let success = await model.submit(cmd, fields: ["taskId": "record-a"], versionText: "2", expectedSession: model.sessionRevision)
        XCTAssertTrue(success); XCTAssertNotNil(model.commandResult)
        await model.signOut(); XCTAssertNil(model.commandResult); XCTAssertEqual(model.resultTitle, "")
    }
    func testTimeoutLeavesPendingRecoveryAndBlocksNewWrites() async throws {
        let transport = ModelTransport(), model = await login(transport)
        await transport.failCommandRequests()
        let cmd = try XCTUnwrap(model.commands.first)
        let success = await model.submit(cmd, fields: ["taskId": "record-a"], versionText: "2", expectedSession: model.sessionRevision)
        XCTAssertFalse(success); XCTAssertNotNil(model.pending); XCTAssertFalse(model.canWrite)
        XCTAssertEqual(model.pending?.expectedVersion, 2)
    }
}
