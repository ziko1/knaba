import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Native ERP account authentication; never reuses the employee GPS device bearer.
/// The existing KNABA server remains authoritative for every role and tenant decision.
struct ERPActor: Decodable, Sendable, Equatable {
    let userId: String
    let companyId: String
    let roles: [String]
    let permissions: [String]
    let siteIds: [String]?
    let customerIds: [String]?
}
struct ERPUser: Decodable, Sendable, Equatable {
    let id: String
    let name: String?
    let email: String?
}
struct ERPIdentity: Decodable, Sendable, Equatable {
    let actor: ERPActor
    let user: ERPUser
    let csrfToken: String?
    let mode: String?
}
struct ERPItem: Decodable, Identifiable, Sendable {
    let id: String
    let kind: String
    let version: Int
    let data: [String: ERPField]
    var title: String {
        for key in ["name", "title", "code", "subject", "email", "description", "status", "state"] {
            if let value = data[key]?.string, !value.isEmpty { return value }
        }
        return kind + " · " + String(id.prefix(8))
    }
    var subtitle: String {
        ["status", "state", "activity", "siteId", "employeeId", "customerId"]
            .compactMap { key in data[key]?.string.map { "\(key): \($0)" } }.joined(separator: " · ")
    }
}
struct ERPPage: Decodable, Sendable {
    let items: [ERPItem]
    let has_more: Bool
    let next_cursor: String?
}
struct ERPCommand: Decodable, Identifiable, Sendable {
    let name: String
    let permission: String
    let highRisk: Bool?
    let schema: ERPField?
    var id: String { name }
}
struct ERPCommands: Decodable, Sendable { let items: [ERPCommand] }
struct ERPDashboard: Decodable, Sendable {
    let counts: [String: Int]
    let openDecisions: Int?
    let activeSites: Int?
    let activeShifts: Int?
}
struct ERPField: Codable, Sendable {
    let value: ERPAny
    init(from decoder: Decoder) throws { value = try ERPAny(from: decoder) }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
    var string: String? { value.string }
    var dictionary: [String: ERPField]? { value.dictionary }
    var list: [ERPField]? { value.list }
    var bool: Bool? { value.bool }
}
indirect enum ERPAny: Codable, Sendable {
    case text(String), number(Double), boolean(Bool), object([String: ERPField]), array([ERPField]), null
    init(from decoder: Decoder) throws {
        let decoder = try decoder.singleValueContainer()
        if decoder.decodeNil() { self = .null }
        else if let value = try? decoder.decode(Bool.self) { self = .boolean(value) }
        else if let value = try? decoder.decode(Double.self) { self = .number(value) }
        else if let value = try? decoder.decode(String.self) { self = .text(value) }
        else if let value = try? decoder.decode([String: ERPField].self) { self = .object(value) }
        else { self = .array(try decoder.decode([ERPField].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var encoder = encoder.singleValueContainer()
        switch self {
        case .text(let x): try encoder.encode(x)
        case .number(let x): try encoder.encode(x)
        case .boolean(let x): try encoder.encode(x)
        case .object(let x): try encoder.encode(x)
        case .array(let x): try encoder.encode(x)
        case .null: try encoder.encodeNil()
        }
    }
    var string: String? {
        switch self { case .text(let x): return x; case .number(let x): return String(x); case .boolean(let x): return x ? "true" : "false"; default: return nil }
    }
    var bool: Bool? { if case .boolean(let b) = self { return b }; return nil }
    var dictionary: [String: ERPField]? { if case .object(let d) = self { return d }; return nil }
    var list: [ERPField]? { if case .array(let a) = self { return a }; return nil }
}

enum ERPFailure: Error, LocalizedError, Equatable {
    case invalidOrigin, invalidPath, expired, invalidResponse, http(Int, String), tooLarge, accessChanged, invalidPayload
    case pendingCommand, commandInFlight, recoveryUnavailable, recoveryInvalid, noPendingCommand, sensitiveCommand
    var errorDescription: String? {
        switch self {
        case .invalidOrigin: return "Use the KNABA ERP HTTPS server address (without a path)."
        case .invalidPath: return "Unsupported ERP API path."
        case .expired: return "Your session has expired; sign in again."
        case .invalidResponse: return "Invalid response from KNABA server."
        case .tooLarge: return "Server response is too large."
        case .accessChanged: return "Access or server has changed. Sign in again."
        case .invalidPayload: return "Invalid command input."
        case .pendingCommand: return "Resolve the saved command before starting another action."
        case .commandInFlight: return "An action is already being sent."
        case .recoveryUnavailable: return "Secure command storage is unavailable. Check the saved action before retrying."
        case .recoveryInvalid: return "Saved command recovery needs review."
        case .noPendingCommand: return "There is no saved command to retry."
        case .sensitiveCommand: return "Use the secure account workflow for this action."
        case .http(let status, let code): return "KNABA server: \(code) (\(status))."
        }
    }
}

/// Strict, configurable origin. No arbitrary schemes, credentials, paths or URL-embedded tokens.
enum ERPOrigin {
    static func validate(_ raw: String) -> URL? {
        guard raw.count <= 512,
              let value = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              value.scheme?.lowercased() == "https", let host = value.host, !host.isEmpty,
              value.user == nil, value.password == nil, value.query == nil, value.fragment == nil,
              value.path.isEmpty || value.path == "/", value.port == nil || value.port == 443 else { return nil }
        var clean = URLComponents()
        clean.scheme = "https"; clean.host = host.lowercased()
        return clean.url
    }
}

/// Injectable network boundary; production rejects redirects and bounds the response while streaming.
protocol ERPConsoleTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

final class ERPNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

final class ERPURLSessionTransport: ERPConsoleTransport, @unchecked Sendable {
    static let maximumResponseBytes = 2 * 1024 * 1024
    private let session: URLSession
    private let redirects = ERPNoRedirect()
    init(configuration: URLSessionConfiguration = .ephemeral) {
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }
    deinit { session.invalidateAndCancel() }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (bytes, raw) = try await session.bytes(for: request, delegate: redirects)
        defer { bytes.task.cancel() }
        guard let response = raw as? HTTPURLResponse else { throw ERPFailure.invalidResponse }
        guard response.expectedContentLength <= Int64(Self.maximumResponseBytes) else { throw ERPFailure.tooLarge }
        var data = Data()
        data.reserveCapacity(min(max(Int(response.expectedContentLength), 0), Self.maximumResponseBytes))
        for try await byte in bytes {
            guard data.count < Self.maximumResponseBytes else { throw ERPFailure.tooLarge }
            data.append(byte)
        }
        return (data, response)
    }
}

/// The actor fences each complete operation, including every page and every suspension.
/// Authentication lives only in RAM; unresolved domain actions use a separate encrypted journal.
actor ERPConsoleClient {
    private struct Session {
        let origin: URL
        let cookie: String?
        let csrf: String?
        let generation: Int
        let scope: String?
    }
    private let transport: any ERPConsoleTransport
    private let journal: any ERPCommandJournal
    private var origin: URL?
    private var cookie: String?
    private var csrf: String?
    private var generation = 0
    private var authority: Data?
    private var actorScope: String?
    private var pending: ERPPendingCommand?
    private var commandFlight: UUID?
    private(set) var identity: ERPIdentity?

    init(transport: any ERPConsoleTransport = ERPURLSessionTransport(),
         journal: any ERPCommandJournal = ERPEncryptedCommandJournal()) {
        self.transport = transport
        self.journal = journal
    }
    func configure(_ raw: String) throws {
        guard let next = ERPOrigin.validate(raw) else { throw ERPFailure.invalidOrigin }
        if next != origin { reset() }
        origin = next
    }
    private func reset() {
        generation += 1
        identity = nil; cookie = nil; csrf = nil; authority = nil; actorScope = nil
        pending = nil; commandFlight = nil
    }
    func forget() { reset(); origin = nil }
    func hasSession() -> Bool { identity != nil && cookie != nil && csrf != nil && actorScope != nil }
    func authorityState() -> (revision: Int, identity: ERPIdentity?) { (generation, identity) }
    private func capture(authenticated: Bool = true) throws -> Session {
        guard let origin else { throw ERPFailure.invalidOrigin }
        if authenticated && !hasSession() { throw ERPFailure.expired }
        return Session(origin: origin, cookie: cookie, csrf: csrf, generation: generation, scope: actorScope)
    }
    private func requireCurrent(_ session: Session) throws {
        guard session.generation == generation, session.origin == origin else { throw ERPFailure.accessChanged }
    }
    private func request(_ path: String, method: String, body: Data?, authenticated: Bool, session: Session) throws -> URLRequest {
        guard path.hasPrefix("/api/v1/"), !path.contains(".."), !path.contains("//"), !path.contains("#"),
              let url = URL(string: session.origin.absoluteString + path), url.host == session.origin.host,
              url.scheme == "https", url.port == session.origin.port, url.user == nil, url.password == nil else {
            throw ERPFailure.invalidPath
        }
        guard (body?.count ?? 0) <= ERPPendingCommand.maximumBodyBytes else { throw ERPFailure.invalidPayload }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated {
            guard let cookie = session.cookie, let csrf = session.csrf else { throw ERPFailure.expired }
            request.setValue("knaba_session=" + cookie, forHTTPHeaderField: "Cookie")
            if method != "GET" { request.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token") }
        }
        if method != "GET" {
            request.setValue(session.origin.absoluteString, forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body ?? Data("{}".utf8)
        }
        return request
    }
    private func send(_ path: String, method: String = "GET", body: Data? = nil,
                      authenticated: Bool = true, session: Session) async throws -> (Data, HTTPURLResponse) {
        try requireCurrent(session)
        try Task.checkCancellation()
        let outgoing = try request(path, method: method, body: body, authenticated: authenticated, session: session)
        let received: (Data, HTTPURLResponse)
        do { received = try await transport.data(for: outgoing) }
        catch { try requireCurrent(session); throw error }
        let (data, response) = received
        try requireCurrent(session)
        guard response.url == outgoing.url else { throw ERPFailure.invalidResponse }
        guard data.count <= ERPURLSessionTransport.maximumResponseBytes else { throw ERPFailure.tooLarge }
        guard (200..<300).contains(response.statusCode) else {
            let code = Self.errorCode(data)
            if response.statusCode == 401 && authenticated { reset() }
            throw ERPFailure.http(response.statusCode, code)
        }
        guard response.mimeType?.lowercased() == "application/json" else { throw ERPFailure.invalidResponse }
        return (data, response)
    }
    private static func errorCode(_ data: Data) -> String {
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let value = (object?["code"] as? String) ?? ((object?["error"] as? [String: Any])?["code"] as? String) ?? "HTTP_ERROR"
        return value.range(of: "^[A-Z][A-Z0-9_]{0,59}$", options: .regularExpression) != nil ? value : "HTTP_ERROR"
    }
    private static func identityResponse(_ data: Data) throws -> (ERPIdentity, Data) {
        let value = try JSONDecoder().decode(ERPIdentity.self, from: data)
        guard !value.actor.userId.isEmpty, !value.actor.companyId.isEmpty,
              value.actor.userId.utf8.count <= 200, value.actor.companyId.utf8.count <= 200,
              value.user.id == value.actor.userId,
              let token = value.csrfToken, token.range(of: "^[A-Za-z0-9_-]{30,100}$", options: .regularExpression) != nil,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              var actor = object["actor"] as? [String: Any] else { throw ERPFailure.invalidResponse }
        // Include all server authority fields (also future warehouse/delegation fields),
        // not just those rendered by the current native UI. Login omits the
        // session-reporting timestamp that /me supplies; the actual mfaVerified
        // boolean remains part of this fingerprint and fences MFA expiry.
        actor.removeValue(forKey: "mfaVerifiedAt")
        return (value, try JSONSerialization.data(withJSONObject: actor, options: [.sortedKeys]))
    }
    private static func sessionCookie(_ response: HTTPURLResponse) throws -> String {
        guard let header = response.value(forHTTPHeaderField: "Set-Cookie") else { throw ERPFailure.invalidResponse }
        let regex = try NSRegularExpression(pattern: "(?:^|[,;]\\s*)knaba_session=([A-Za-z0-9_-]{30,100})(?=[;,]|$)")
        let matches = regex.matches(in: header, range: NSRange(header.startIndex..., in: header))
        guard matches.count == 1, let range = Range(matches[0].range(at: 1), in: header) else { throw ERPFailure.invalidResponse }
        return String(header[range])
    }
    func login(email: String, password: String, otp: String = "") async throws -> ERPIdentity {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, email.utf16.count <= 200, !password.isEmpty, password.utf16.count <= 128,
              otp.isEmpty || otp.range(of: "^[0-9]{6}$", options: .regularExpression) != nil else { throw ERPFailure.invalidPayload }
        reset()
        let session = try capture(authenticated: false)
        var payload = ["email": email, "password": password]
        if !otp.isEmpty { payload["otp"] = otp }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await send("/api/v1/auth/login", method: "POST", body: body, authenticated: false, session: session)
        try requireCurrent(session)
        do {
            let (decoded, nextAuthority) = try Self.identityResponse(data)
            let nextCookie = try Self.sessionCookie(response)
            let nextScope = try ERPPendingCommand.scope(origin: session.origin, companyId: decoded.actor.companyId, userId: decoded.actor.userId)
            cookie = nextCookie; csrf = decoded.csrfToken; identity = decoded; authority = nextAuthority
            actorScope = nextScope; pending = nil
            // Recovery is checked lazily by pendingCommand(), including before
            // every mutation. A missing/corrupt/locked journal must not prevent
            // authenticated read-only access or become permission for a new write.
            return decoded
        } catch {
            reset()
            throw error
        }
    }
    func refresh() async throws -> ERPIdentity {
        let session = try capture()
        let (data, _) = try await send("/api/v1/me", session: session)
        try requireCurrent(session)
        do {
            let (result, nextAuthority) = try Self.identityResponse(data)
            guard result.actor.companyId == identity?.actor.companyId, result.actor.userId == identity?.actor.userId else {
                throw ERPFailure.accessChanged
            }
            if authority != nextAuthority { generation += 1 }
            csrf = result.csrfToken; identity = result; authority = nextAuthority
            return result
        } catch {
            reset()
            throw error
        }
    }
    /// Local authorization is revoked before I/O. An old logout cannot erase a later login.
    func logout() async {
        let previous = try? capture()
        reset()
        guard let previous,
              let outgoing = try? request("/api/v1/auth/logout", method: "POST", body: Data("{}".utf8), authenticated: true, session: previous) else { return }
        _ = try? await transport.data(for: outgoing)
    }
    func dashboard() async throws -> ERPDashboard {
        let session = try capture()
        let (data, _) = try await send("/api/v1/dashboard", session: session)
        return try JSONDecoder().decode(ERPDashboard.self, from: data)
    }
    func catalog() async throws -> [ERPCommand] {
        let session = try capture()
        let (data, _) = try await send("/api/v1/commands", session: session)
        return try JSONDecoder().decode(ERPCommands.self, from: data).items
    }
    func entities(_ kind: String, channelId: String? = nil) async throws -> [ERPItem] {
        guard kind.range(of: "^[a-z][a-z0-9_]{0,48}$", options: .regularExpression) != nil else { throw ERPFailure.invalidPath }
        if let channelId, UUID(uuidString: channelId) == nil { throw ERPFailure.invalidPath }
        let path = channelId.map { "/api/v1/channels/\($0)/messages" } ?? "/api/v1/entities/\(kind)"
        let session = try capture()
        var results: [ERPItem] = [], cursor: String? = nil, seen = Set<String>()
        for _ in 0..<10 {
            var url = URLComponents()
            url.path = path
            url.queryItems = [URLQueryItem(name: "limit", value: "100")]
            if let cursor { url.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
            guard let resource = url.string else { throw ERPFailure.invalidPath }
            let (data, _) = try await send(resource, session: session)
            let page = try JSONDecoder().decode(ERPPage.self, from: data)
            guard page.items.count <= 100 else { throw ERPFailure.invalidResponse }
            results.append(contentsOf: page.items)
            if !page.has_more { return results }
            guard let next = page.next_cursor, !next.isEmpty, next.utf8.count <= 8192, seen.insert(next).inserted else { throw ERPFailure.invalidResponse }
            cursor = next
        }
        throw ERPFailure.tooLarge
    }
    func pendingCommand() throws -> ERPPendingCommand? {
        guard hasSession(), let scope = actorScope else { return nil }
        let saved = try journal.read(scope: scope)
        try saved?.validate(expectedScope: scope)
        pending = saved
        return saved
    }
    func execute(_ command: ERPCommand, input: Data, expectedVersion: Int? = nil) async throws -> ERPField {
        guard !command.permission.isEmpty else { throw ERPFailure.invalidPayload }
        guard commandFlight == nil else { throw ERPFailure.commandInFlight }
        let session = try capture()
        guard try pendingCommand() == nil else { throw ERPFailure.pendingCommand }
        guard let scope = session.scope else { throw ERPFailure.expired }
        let payload = try ERPPendingCommand.validatedInput(name: command.name, input: input, expectedVersion: expectedVersion)
        if ERPCommandSecrets.oneShotNames.contains(command.name) {
            try ERPCommandSecrets.validateOneShot(name: command.name, payload: payload)
            return try await executeSensitive(command.name, input: input, expectedVersion: expectedVersion, session: session)
        }
        guard !ERPCommandSecrets.containsSecret(payload) else { throw ERPFailure.sensitiveCommand }
        let next = try ERPPendingCommand(scope: scope, name: command.name, input: input, expectedVersion: expectedVersion)
        try journal.persist(next)
        pending = next
        return try await perform(next, session: session, firstAttempt: true)
    }
    func retryPending() async throws -> ERPField {
        guard commandFlight == nil else { throw ERPFailure.commandInFlight }
        let session = try capture()
        guard let command = try pendingCommand() else { throw ERPFailure.noPendingCommand }
        // Hold the flight guard across /me, then use a fresh CSRF value only if the
        // exact same session/authority still exists. No login or automatic replay.
        let flight = UUID(); commandFlight = flight
        defer { if commandFlight == flight { commandFlight = nil } }
        _ = try await refresh()
        try requireCurrent(session)
        let refreshed = try capture()
        guard command.scope == refreshed.scope else { throw ERPFailure.accessChanged }
        return try await perform(command, session: refreshed, firstAttempt: false, flight: flight)
    }
    private func perform(_ command: ERPPendingCommand, session: Session, firstAttempt: Bool, flight suppliedFlight: UUID? = nil) async throws -> ERPField {
        let flight = suppliedFlight ?? UUID()
        guard commandFlight == nil || commandFlight == flight else { throw ERPFailure.commandInFlight }
        commandFlight = flight
        defer { if commandFlight == flight { commandFlight = nil } }
        do {
            let (data, _) = try await send("/api/v1/commands/\(command.name)", method: "POST", body: command.body, session: session)
            let result = try JSONDecoder().decode(ERPField.self, from: data)
            try requireCurrent(session)
            try journal.remove(scope: command.scope, idempotencyKey: command.idempotencyKey)
            if pending?.idempotencyKey == command.idempotencyKey { pending = nil }
            if result.dictionary?["reauthenticationRequired"]?.bool == true { reset() }
            return result
        } catch {
            // After any earlier unknown outcome (including a process restart), a
            // later 4xx is not proof that the original business effect did not happen.
            if firstAttempt, session.generation == generation, session.origin == origin,
               let failure = error as? ERPFailure, Self.definiteRejection(failure) {
                try journal.remove(scope: command.scope, idempotencyKey: command.idempotencyKey)
                if pending?.idempotencyKey == command.idempotencyKey { pending = nil }
            }
            throw error
        }
    }
    private static func definiteRejection(_ error: ERPFailure) -> Bool {
        guard case .http(let status, let code) = error else { return false }
        // Only documented atomic precondition failures of a first submitted call.
        return (status == 400 && code == "VALIDATION_ERROR") ||
               (status == 403 && code == "ACCESS_DENIED") ||
               (status == 404 && code == "NOT_FOUND_SAFE") ||
               (status == 409 && ["VERSION_CONFLICT", "INVALID_STATE"].contains(code)) ||
               (status == 422 && ["NEEDS_APPROVAL", "MISSING_CONFIGURATION"].contains(code)) ||
               (status == 429 && code == "RATE_LIMITED")
    }
    private func executeSensitive(_ name: String, input: Data, expectedVersion: Int?, session: Session) async throws -> ERPField {
        let flight = UUID(); commandFlight = flight
        defer { if commandFlight == flight { commandFlight = nil } }
        _ = try await refresh()
        try requireCurrent(session)
        let current = try capture()
        let body = try ERPPendingCommand.requestBody(input: input, expectedVersion: expectedVersion, idempotencyKey: UUID().uuidString)
        // Secrets are intentionally never written to a journal. Once submitted,
        // local sign-out is mandatory even on timeout; the user verifies by logging in.
        defer { if generation == current.generation && origin == current.origin { reset() } }
        let (data, _) = try await send("/api/v1/commands/\(name)", method: "POST", body: body, session: current)
        let result = try JSONDecoder().decode(ERPField.self, from: data)
        guard result.dictionary?["ok"]?.bool == true, result.dictionary?["reauthenticationRequired"]?.bool == true else { throw ERPFailure.invalidResponse }
        return result
    }
    func messages(_ channelId: String) async throws -> [ERPItem] {
        guard UUID(uuidString: channelId) != nil else { throw ERPFailure.invalidPath }
        return try await entities("message", channelId: channelId)
    }
    func sendMessage(channelId: String, text: String, language: String) async throws {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard UUID(uuidString: channelId) != nil, !text.isEmpty, text.utf16.count <= 12000,
              ["DE", "EN", "PL", "LT", "RU", "UK"].contains(language) else { throw ERPFailure.invalidPayload }
        let command = ERPCommand(name: "message.send", permission: "chat.write", highRisk: false, schema: nil)
        let payload = ["channel_id": channelId, "text": text, "language": language]
        _ = try await execute(command, input: JSONSerialization.data(withJSONObject: payload))
    }
}
