import XCTest
@testable import KNABADE

// native-console-contract.test.ts compares this complete fixture with registry['quote.accept'].
private let recordQuoteCatalog = #"{"items":[{"name":"quote.accept","permission":"quote.accept","highRisk":false,"schema":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"quoteVersion":{"type":"integer","minimum":1,"maximum":1000000000},"acceptanceEvidence":{"type":"string","minLength":1,"maxLength":4000}},"required":["id","quoteVersion"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}}]}"#

private actor RecordActionGate {
    let entered: XCTestExpectation
    private var opened = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    init(_ entered: XCTestExpectation) { self.entered = entered }
    func pause() async {
        entered.fulfill()
        if !opened { await withCheckedContinuation { waiters.append($0) } }
    }
    func release() { opened = true; waiters.forEach { $0.resume() }; waiters.removeAll() }
}

private final class RecordActionJournal: ERPCommandJournal, @unchecked Sendable {
    private let lock = NSLock()
    private var saved: [String: ERPPendingCommand] = [:]
    private var writes = 0
    func read(scope: String) throws -> ERPPendingCommand? { lock.lock(); defer { lock.unlock() }; return saved[scope] }
    func persist(_ command: ERPPendingCommand) throws {
        lock.lock(); defer { lock.unlock() }
        guard saved[command.scope] == nil else { throw ERPFailure.pendingCommand }
        saved[command.scope] = command; writes += 1
    }
    func remove(scope: String, idempotencyKey: String) throws {
        lock.lock(); defer { lock.unlock() }
        guard saved[scope]?.idempotencyKey == idempotencyKey else { throw ERPFailure.recoveryInvalid }
        saved.removeValue(forKey: scope)
    }
    func snapshot() -> (writes: Int, records: [ERPPendingCommand]) {
        lock.lock(); defer { lock.unlock() }; return (writes, Array(saved.values))
    }
}

private actor RecordActionTransport: ERPConsoleTransport {
    private var user = "user-a"
    private var permissions = ["quote.accept", "commerce.read"]
    private var warehouses = ["warehouse-a"]
    private var hidden = false
    private var critical = false
    private var failWrite = false
    private var failReadAfterWrite = false
    private var holds: [String: RecordActionGate] = [:]
    private var requests: [URLRequest] = []
    private let journal: RecordActionJournal
    private(set) var persistedBeforeSend = false
    init(_ journal: RecordActionJournal) { self.journal = journal }
    func setUser(_ value: String) { user = value }
    func setPermissions(_ value: [String]) { permissions = value }
    func setWarehouses(_ value: [String]) { warehouses = value }
    func hideAction() { hidden = true }
    func requireConfirmation() { critical = true }
    func timeoutWrite() { failWrite = true }
    func failSubsequentRead() { failReadAfterWrite = true }
    func hold(_ path: String, gate: RecordActionGate) { holds[path] = gate }
    func observed() -> [URLRequest] { requests }
    func writes() -> [URLRequest] { requests.filter { $0.url?.path == "/api/v1/commands/quote.accept" } }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let url = request.url!, path = url.path
        var headers = ["Content-Type": "application/json"]
        let body: [String: Any]
        switch path {
        case "/api/v1/auth/login", "/api/v1/me":
            body = ["actor": ["userId": user, "companyId": "company-a", "roles": ["EMPLOYEE"],
                              "permissions": permissions, "siteIds": ["site-a"], "customerIds": [],
                              "warehouseIds": warehouses, "mfaVerified": false],
                    "user": ["id": user, "name": "Synthetic colleague"], "csrfToken": String(repeating: "c", count: 40)]
            if path.hasSuffix("/login") { headers["Set-Cookie"] = "knaba_session=" + String(repeating: "s", count: 40) + "; Path=/; HttpOnly; Secure" }
        case "/api/v1/dashboard":
            if failReadAfterWrite && !writes().isEmpty { throw URLError(.timedOut) }
            body = ["counts": ["quote": 1], "activeShifts": 0]
        case "/api/v1/commands":
            var value = try JSONSerialization.jsonObject(with: Data(recordQuoteCatalog.utf8)) as! [String: Any]
            var items = value["items"] as! [[String: Any]]
            items[0]["highRisk"] = critical
            value["items"] = hidden ? [] : items
            body = value
        case "/api/v1/entities/quote":
            body = ["items": [["id": "quote-a", "kind": "quote", "version": 7,
                                "data": ["title": "Observed offer", "quoteVersion": 3]]], "has_more": false]
        case "/api/v1/commands/quote.accept":
            persistedBeforeSend = journal.snapshot().records.count == 1
            if failWrite { throw URLError(.timedOut) }
            body = ["ok": true, "record": ["id": "quote-a", "version": 8]]
        case "/api/v1/auth/logout": body = ["ok": true]
        default: throw URLError(.unsupportedURL)
        }
        let bytes = try JSONSerialization.data(withJSONObject: body)
        if let gate = holds[path] { await gate.pause() }
        return (bytes, HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
    }
}

@MainActor final class ERPRecordActionModelTests: XCTestCase {
    private func workspace(_ transport: RecordActionTransport, journal: RecordActionJournal) async throws -> (ERPConsoleModel, ERPConsoleClient, ERPCommand, ERPRecordActionContext) {
        let client = ERPConsoleClient(transport: transport, journal: journal)
        let model = ERPConsoleModel(client: client, preferences: UserDefaults(suiteName: "KNABA.RecordActions." + UUID().uuidString)!)
        model.origin = "https://knaba.example"; model.email = "synthetic@example.test"; model.password = "Synthetic password"
        await model.signIn(); await model.loadKind("quote")
        let command = try XCTUnwrap(model.commands.first), actor = try XCTUnwrap(model.identity?.actor)
        let context = try XCTUnwrap(ERPRecordActions.context(for: XCTUnwrap(model.items.first), command: command, actor: actor))
        return (model, client, command, context)
    }
    private func object(_ bytes: Data) throws -> [String: Any] { try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any]) }

    func testContextPinsCanonicalIDRelatedVersionAndExpectedVersionAtTheWireBoundary() async throws {
        let journal = RecordActionJournal(), transport = RecordActionTransport(journal)
        let (model, _, command, context) = try await workspace(transport, journal: journal)
        let accepted = await model.submit(command, fields: ["id": "foreign", "quoteVersion": "88", "acceptanceEvidence": "Explicit approval"],
                                          versionText: "999", expectedSession: model.sessionRevision, context: context)
        XCTAssertTrue(accepted)
        let sent = await transport.writes(), persisted = await transport.persistedBeforeSend
        XCTAssertEqual(sent.count, 1); XCTAssertTrue(persisted)
        let body = try object(XCTUnwrap(sent.first?.httpBody)), input = try XCTUnwrap(body["input"] as? [String: Any])
        XCTAssertEqual(body["expectedVersion"] as? Int, 7)
        XCTAssertEqual(input["id"] as? String, "quote-a"); XCTAssertEqual(input["quoteVersion"] as? Int, 3)
        XCTAssertEqual(input["acceptanceEvidence"] as? String, "Explicit approval")
        XCTAssertTrue(journal.snapshot().records.isEmpty)
        XCTAssertEqual(model.resultCommandName, "quote.accept")
        model.language = .uk
        XCTAssertEqual(model.resultCommandName, "quote.accept"); XCTAssertNotNil(model.commandResult)
        let paths = await transport.observed().compactMap { $0.url?.path }
        let mutation = try XCTUnwrap(paths.firstIndex(of: "/api/v1/commands/quote.accept"))
        XCTAssertEqual(Array(paths[(mutation - 2)..<mutation]), ["/api/v1/me", "/api/v1/commands"])
    }

    func testFreshCriticalFlagRequiresAnExplicitConfirmationBeforePersisting() async throws {
        let journal = RecordActionJournal(), transport = RecordActionTransport(journal)
        let (model, _, command, context) = try await workspace(transport, journal: journal)
        await transport.requireConfirmation()
        let blocked = await model.submit(command, fields: [:], versionText: "", expectedSession: model.sessionRevision, context: context)
        XCTAssertFalse(blocked); XCTAssertEqual(journal.snapshot().writes, 0)
        let first = await transport.writes(); XCTAssertTrue(first.isEmpty)
        XCTAssertEqual(model.commands.first?.highRisk, true); XCTAssertNotNil(model.identity)
        let accepted = await model.submit(command, fields: [:], versionText: "", expectedSession: model.sessionRevision, context: context, confirmed: true)
        XCTAssertTrue(accepted); XCTAssertEqual(journal.snapshot().writes, 1)
    }

    func testFreshCatalogRemovalPermissionRevocationAndFutureAuthorityChangeBlockBeforeJournal() async throws {
        for change in ["catalog", "permission", "warehouse"] {
            let journal = RecordActionJournal(), transport = RecordActionTransport(journal)
            let (model, _, command, context) = try await workspace(transport, journal: journal)
            switch change {
            case "catalog": await transport.hideAction()
            case "permission": await transport.setPermissions(["commerce.read"])
            default: await transport.setWarehouses(["warehouse-b"])
            }
            let accepted = await model.submit(command, fields: [:], versionText: "", expectedSession: model.sessionRevision, context: context)
            XCTAssertFalse(accepted, change); XCTAssertEqual(journal.snapshot().writes, 0, change)
            let sent = await transport.writes(); XCTAssertTrue(sent.isEmpty, change)
        }
    }

    func testOldFormCannotSubmitAfterSameAccountReloginOrAccountChange() async throws {
        for user in ["user-a", "user-b"] {
            let journal = RecordActionJournal(), transport = RecordActionTransport(journal)
            let (model, _, command, context) = try await workspace(transport, journal: journal)
            let revision = model.sessionRevision
            await model.signOut(); await transport.setUser(user)
            model.password = "Synthetic password"; await model.signIn()
            let before = await transport.observed().count
            let accepted = await model.submit(command, fields: [:], versionText: "", expectedSession: revision, context: context)
            let after = await transport.observed().count
            XCTAssertFalse(accepted); XCTAssertEqual(before, after); XCTAssertEqual(journal.snapshot().writes, 0)
        }
    }

    func testLogoutDuringCatalogPreflightCannotPersistOrSendTheOldForm() async throws {
        let journal = RecordActionJournal(), transport = RecordActionTransport(journal)
        let (model, _, command, context) = try await workspace(transport, journal: journal)
        let entered = expectation(description: "catalog preflight entered"), revision = model.sessionRevision
        let hold = RecordActionGate(entered); await transport.hold("/api/v1/commands", gate: hold)
        let attempt = Task { await model.submit(command, fields: [:], versionText: "", expectedSession: revision, context: context) }
        await fulfillment(of: [entered], timeout: 3)
        await model.signOut(); await hold.release()
        let accepted = await attempt.value, sent = await transport.writes()
        XCTAssertFalse(accepted); XCTAssertTrue(sent.isEmpty); XCTAssertEqual(journal.snapshot().writes, 0); XCTAssertNil(model.identity)
    }

    func testAuthorityChangesBetweenPreflightAndActorExecutionAreRejectedBeforeJournal() async throws {
        let journal = RecordActionJournal(), transport = RecordActionTransport(journal)
        let (_, client, command, _) = try await workspace(transport, journal: journal)
        let previous = await client.authorityState().revision
        await transport.setWarehouses(["warehouse-b"]); _ = try await client.refresh()
        let before = await transport.observed().count
        do {
            _ = try await client.execute(command, input: Data(#"{"id":"quote-a","quoteVersion":3}"#.utf8), expectedVersion: 7, authorityRevision: previous)
            XCTFail("The final actor boundary must reject the old authority")
        } catch { XCTAssertEqual(error as? ERPFailure, .accessChanged) }
        let after = await transport.observed().count
        XCTAssertEqual(before, after); XCTAssertEqual(journal.snapshot().writes, 0)
    }

    func testUnknownWriteRetainsExactContextEnvelopeWithoutAutomaticReplayOnRefresh() async throws {
        let journal = RecordActionJournal(), transport = RecordActionTransport(journal)
        let (model, _, command, context) = try await workspace(transport, journal: journal)
        await transport.timeoutWrite()
        let accepted = await model.submit(command, fields: ["id": "foreign"], versionText: "999", expectedSession: model.sessionRevision, context: context)
        XCTAssertFalse(accepted); XCTAssertNotNil(model.pending); XCTAssertFalse(model.canWrite)
        let sent = await transport.writes(), pending = try XCTUnwrap(journal.snapshot().records.first)
        XCTAssertEqual(sent.count, 1); XCTAssertEqual(sent.first?.httpBody, pending.body); XCTAssertEqual(pending.expectedVersion, 7)
        await model.reloadSession(); await model.loadOverview()
        let after = await transport.writes(); XCTAssertEqual(after.count, 1)
        XCTAssertEqual(journal.snapshot().records.first?.idempotencyKey, pending.idempotencyKey)
    }

    func testIndependentReadFailureCannotTurnAcknowledgedWriteIntoARepeatableFailure() async throws {
        let journal = RecordActionJournal(), transport = RecordActionTransport(journal)
        let (model, _, command, context) = try await workspace(transport, journal: journal)
        await transport.failSubsequentRead()
        let accepted = await model.submit(command, fields: [:], versionText: "", expectedSession: model.sessionRevision, context: context)
        XCTAssertTrue(accepted); XCTAssertTrue(journal.snapshot().records.isEmpty)
        let sent = await transport.writes(); XCTAssertEqual(sent.count, 1)
        XCTAssertFalse(model.problem.isEmpty)
    }
}
