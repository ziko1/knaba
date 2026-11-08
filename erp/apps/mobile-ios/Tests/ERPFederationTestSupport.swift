import XCTest
@testable import KNABADE

final class FederationClock: @unchecked Sendable {
    private let lock = NSLock()
    private var value = Date()
    private var monotonic = ProcessInfo.processInfo.systemUptime
    func now() -> Date { lock.lock(); defer { lock.unlock() }; return value }
    func uptime() -> TimeInterval { lock.lock(); defer { lock.unlock() }; return monotonic }
    func advance(_ seconds: TimeInterval) { lock.lock(); defer { lock.unlock() }; value.addTimeInterval(seconds); monotonic += seconds }
    func moveWallClockBack(_ seconds: TimeInterval) { lock.lock(); defer { lock.unlock() }; value.addTimeInterval(-seconds) }
}

actor FederationGate {
    private var arrived = false
    private var released = false
    private var arrivals: [CheckedContinuation<Void, Never>] = []
    private var waiters: [CheckedContinuation<Void, Never>] = []
    func pause() async {
        arrived = true; arrivals.forEach { $0.resume() }; arrivals.removeAll()
        if !released { await withCheckedContinuation { waiters.append($0) } }
    }
    func entered() async { if !arrived { await withCheckedContinuation { arrivals.append($0) } } }
    func release() { released = true; waiters.forEach { $0.resume() }; waiters.removeAll() }
}

final class FederationCommandJournal: ERPCommandJournal, @unchecked Sendable {
    private let lock = NSLock()
    private let storage = MediaCommandJournal()
    private var failure: ERPFailure?
    func failReads(_ value: ERPFailure?) { lock.lock(); defer { lock.unlock() }; failure = value }
    func read(scope: String) throws -> ERPPendingCommand? {
        lock.lock(); defer { lock.unlock() }
        if let failure { throw failure }
        return try storage.read(scope: scope)
    }
    func persist(_ value: ERPPendingCommand) throws { try storage.persist(value) }
    func remove(scope: String, idempotencyKey: String) throws { try storage.remove(scope: scope, idempotencyKey: idempotencyKey) }
}

/// Deterministic HTTP double; the production client, parsers and actor fences run
/// unchanged. No browser, PostgreSQL or native integration claim follows this fixture.
actor FederationTransport: ERPConsoleTransport {
    enum TokenMode: Equatable { case normal, bodyLost, noCookie, beforeHeaders, oldCookie, wrongMode, malformedBody, errorCookie }
    static let origin = "https://erp.example.test"
    static let oldCookie = String(repeating: "o", count: 43)
    static let newCookie = "KF3." + String(repeating: "n", count: 43)
    static let oldCSRF = String(repeating: "c", count: 43)
    static let newCSRF = String(repeating: "d", count: 43)
    nonisolated let clock: FederationClock
    private var captured: [URLRequest] = []
    private var gates: [String: FederationGate] = [:]
    private var tokenMode: TokenMode = .normal
    private var candidateStatus = 200
    private var candidateBodyLost = false
    private var candidateCSRF = FederationTransport.newCSRF
    private var candidateUser = "new-user"
    private var candidateCompany = "company-a"
    private var candidateWarehouses: [String] = []
    private var oldWarehouses: [String] = []
    private var oldRoles = ["EMPLOYEE"]
    private var oldPermissions = ["media.upload", "media.read", "task.read", "task.work"]
    private var oldCredentialRevision = 1
    private var oldCSRF = FederationTransport.oldCSRF
    private var startFailures = 0
    private var healthMode = "TEST"
    init(clock: FederationClock = FederationClock()) { self.clock = clock }
    func gate(_ path: String, _ gate: FederationGate) { gates[path] = gate }
    func setToken(_ mode: TokenMode) { tokenMode = mode }
    func setCandidate(status: Int = 200, bodyLost: Bool = false, user: String = "new-user", csrf: String = FederationTransport.newCSRF, company: String = "company-a", warehouses: [String] = []) {
        candidateStatus = status; candidateBodyLost = bodyLost; candidateUser = user; candidateCSRF = csrf; candidateCompany = company
        candidateWarehouses = warehouses
    }
    func changeOldAuthority(warehouses: [String] = [], credentials: Int = 1, csrf: String = FederationTransport.oldCSRF,
                            roles: [String] = ["EMPLOYEE"], permissions: [String] = ["media.upload", "media.read", "task.read", "task.work"]) {
        oldWarehouses = warehouses; oldCredentialRevision = credentials; oldCSRF = csrf
        oldRoles = roles; oldPermissions = permissions
    }
    func failStartOnce() { startFailures = 1 }
    func setHealthMode(_ value: String) { healthMode = value }
    func requests() -> [URLRequest] { captured }
    private func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
    private func profile(user: String, csrf: String, token: Bool = false, mode: String = "TEST", company: String = "company-a", warehouses: [String]? = nil) throws -> Data {
        var body: [String: Any] = ["actor": ["userId": user, "companyId": company, "roles": user == "old-user" ? oldRoles : ["EMPLOYEE"],
            "permissions": user == "old-user" ? oldPermissions : ["media.upload", "media.read", "task.read", "task.work"], "siteIds": ["site-a"], "customerIds": [],
            "warehouseIds": warehouses ?? (user == "old-user" ? oldWarehouses : []), "mfaVerified": false,
            "credentialRevision": user == "old-user" ? oldCredentialRevision : 1],
            "user": ["id": user, "name": "Synthetic account"], "csrfToken": csrf, "mode": mode]
        if token { body["expiresAt"] = ISO8601DateFormatter().string(from: clock.now().addingTimeInterval(3600)) }
        else { body["version"] = "synthetic-source" }
        return try json(body)
    }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let result = try await federationData(for: request)
        guard let body = result.body else { throw URLError(.networkConnectionLost) }
        return (body, result.response)
    }
    func federationData(for request: URLRequest) async throws -> ERPFederationHTTPResult {
        captured.append(request)
        let url = request.url!, path = url.path
        var headers = ["Content-Type": "application/json"], status = 200, body: Data?
        let isCandidate = request.value(forHTTPHeaderField: "Cookie") == "knaba_session=" + Self.newCookie
        switch path {
        case "/api/v1/health": body = try json(["ok": true, "application": "KNABA DE", "apiVersion": 1, "mode": healthMode])
        case "/api/v1/auth/login":
            headers["Set-Cookie"] = "knaba_session=\(Self.oldCookie); Path=/; HttpOnly; Secure"
            body = try profile(user: "old-user", csrf: oldCSRF)
        case "/api/v1/auth/logout": body = try json(["ok": true])
        case "/api/v1/auth/federation/config":
            body = try json(["enabled": true, "authorizationIssuer": url.scheme! + "://" + url.host! + "/auth/federation",
                "authorities": [["authorityId": "site-a", "label": "Synthetic site", "siteOrigin": "https://site.example.test"]],
                "clients": [["clientId": "knaba-ios-test-v1", "kind": "NATIVE", "platform": "IOS", "label": "KNABA iOS Test",
                             "redirectUri": "de.knaba.mobile.ios.test:/auth/federation/callback"]]])
        case "/api/v1/auth/federation/start":
            if startFailures > 0 { startFailures -= 1; throw URLError(.networkConnectionLost) }
            let id = "11111111-1111-4111-8111-111111111111"
            body = try json(["requestId": id, "authorizationUrl": Self.origin + "/auth/federation/authorize?request_id=" + id,
                             "expiresAt": ISO8601DateFormatter().string(from: clock.now().addingTimeInterval(300))])
        case "/api/v1/auth/federation/token":
            if tokenMode == .beforeHeaders { throw URLError(.networkConnectionLost) }
            let cookie = tokenMode == .oldCookie ? Self.oldCookie : Self.newCookie
            if tokenMode != .noCookie { headers["Set-Cookie"] = "knaba_session=\(cookie); Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600" }
            if tokenMode == .errorCookie { status = 401 }
            body = tokenMode == .bodyLost ? nil : try profile(user: "new-user", csrf: Self.newCSRF, token: true, mode: tokenMode == .wrongMode ? "PRODUCTION" : "TEST")
            if tokenMode == .malformedBody { body = Data("{truncated".utf8) }
        case "/api/v1/me":
            if isCandidate {
                status = candidateStatus
                body = candidateBodyLost ? nil : try profile(user: candidateUser, csrf: candidateCSRF, company: candidateCompany, warehouses: candidateWarehouses)
            } else { body = try profile(user: "old-user", csrf: oldCSRF) }
        case "/api/v1/dashboard": body = try json(["counts": ["site": 1]])
        case "/api/v1/commands": body = try json(["items": []])
        default: throw URLError(.unsupportedURL)
        }
        let result = ERPFederationHTTPResult(response: HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!,
                                             body: body, headersReceivedAt: clock.now(), headersReceivedUptime: clock.uptime())
        if let gate = gates.removeValue(forKey: isCandidate ? "candidate-me" : path) { await gate.pause() }
        return result
    }
    func callback() throws -> URL {
        let request = captured.last(where: { $0.url?.path == "/api/v1/auth/federation/start" })!
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
        var url = URLComponents(string: "de.knaba.mobile.ios.test:/auth/federation/callback")!
        url.queryItems = [.init(name: "code", value: "K3C." + String(repeating: "k", count: 43)), .init(name: "state", value: body["state"]!),
                          .init(name: "iss", value: Self.origin + "/auth/federation")]
        return url.url!
    }
}
