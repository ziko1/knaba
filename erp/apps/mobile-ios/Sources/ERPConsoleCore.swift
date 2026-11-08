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
    let companyId: String?
    let kind: String
    let version: Int
    let createdAt: String?
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
    case invalidOrigin, invalidPath, expired, invalidResponse, http(Int, String), tooLarge, accessChanged, invalidPayload, confirmationRequired
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
        case .confirmationRequired: return "Confirm the current sensitive action before submitting."
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
    func mediaData(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

extension ERPConsoleTransport {
    // Existing deterministic transports remain usable. The client also verifies
    // the media bound; production enforces it while streaming, before allocation.
    func mediaData(for request: URLRequest) async throws -> (Data, HTTPURLResponse) { try await data(for: request) }
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
        try await boundedData(for: request, maximum: Self.maximumResponseBytes)
    }
    func mediaData(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await boundedData(for: request, maximum: ERPMediaLimits.download, binary: true)
    }
    private func boundedData(for request: URLRequest, maximum: Int, binary: Bool = false) async throws -> (Data, HTTPURLResponse) {
        let (bytes, raw) = try await session.bytes(for: request, delegate: redirects)
        defer { bytes.task.cancel() }
        guard let response = raw as? HTTPURLResponse else { throw ERPFailure.invalidResponse }
        let success = (200..<300).contains(response.statusCode)
        if binary && success {
            guard ["image/jpeg", "application/pdf"].contains(response.mimeType?.lowercased() ?? "") else { throw ERPMediaFailure.unsupportedType }
        }
        let bound = success ? maximum : min(maximum, Self.maximumResponseBytes)
        guard response.expectedContentLength <= Int64(bound) else { throw ERPFailure.tooLarge }
        var data = Data()
        data.reserveCapacity(min(max(Int(response.expectedContentLength), 0), bound))
        for try await byte in bytes {
            guard data.count < bound else { throw ERPFailure.tooLarge }
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
    private let mediaJournal: any ERPMediaJournal
    private let mediaClientID = UUID()
    private let mediaSessionFence = ERPMediaSessionFence()
    private var mediaPending: ERPMediaPending?
    private var mediaFlight: UUID?
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
         journal: any ERPCommandJournal = ERPEncryptedCommandJournal(),
         mediaJournal: any ERPMediaJournal = ERPEncryptedMediaJournal()) {
        self.transport = transport
        self.journal = journal
        self.mediaJournal = mediaJournal
    }
    func configure(_ raw: String) throws {
        guard let next = ERPOrigin.validate(raw) else { throw ERPFailure.invalidOrigin }
        if next != origin { reset() }
        origin = next
    }
    private func reset() {
        generation += 1
        mediaSessionFence.advance(to: generation)
        identity = nil; cookie = nil; csrf = nil; authority = nil; actorScope = nil
        pending = nil; commandFlight = nil; mediaPending = nil; mediaFlight = nil
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
    private func request(_ path: String, method: String, body: Data?, authenticated: Bool, session: Session,
                         bodyLimit: Int = ERPPendingCommand.maximumBodyBytes) throws -> URLRequest {
        guard path.hasPrefix("/api/v1/"), !path.contains(".."), !path.contains("//"), !path.contains("#"),
              let url = URL(string: session.origin.absoluteString + path), url.host == session.origin.host,
              url.scheme == "https", url.port == session.origin.port, url.user == nil, url.password == nil else {
            throw ERPFailure.invalidPath
        }
        guard (body?.count ?? 0) <= bodyLimit else { throw ERPFailure.invalidPayload }
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
                      authenticated: Bool = true, session: Session,
                      mediaUploadKey: String? = nil, mediaTicket: ERPMediaTicket? = nil) async throws -> (Data, HTTPURLResponse) {
        try requireCurrent(session)
        try Task.checkCancellation()
        var outgoing = try request(path, method: method, body: body, authenticated: authenticated, session: session,
                                   bodyLimit: mediaUploadKey == nil ? ERPPendingCommand.maximumBodyBytes : ERPMediaLimits.uploadBody)
        if let mediaUploadKey {
            guard path == "/api/v1/media/uploads", method == "POST", UUID(uuidString: mediaUploadKey) != nil else { throw ERPFailure.invalidPayload }
            outgoing.setValue(mediaUploadKey, forHTTPHeaderField: "Idempotency-Key")
        }
        if let mediaTicket { try checkMedia(mediaTicket) }
        let received: (Data, HTTPURLResponse)
        do { received = try await transport.data(for: outgoing) }
        catch { try requireCurrent(session); throw error }
        let (data, response) = received
        try requireCurrent(session)
        if let mediaTicket { try checkMedia(mediaTicket) }
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
            if authority != nextAuthority {
                generation += 1; mediaSessionFence.advance(to: generation); mediaPending = nil
            }
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
    func entities(_ kind: String, channelId: String? = nil, mediaTicket: ERPMediaTicket? = nil) async throws -> [ERPItem] {
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
            let (data, _) = try await send(resource, session: session, mediaTicket: mediaTicket)
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
        if let saved, saved.nativeMedia == true {
            guard let descriptor = try pendingMedia(), let uploadId = descriptor.uploadId else { throw ERPMediaFailure.recoveryMismatch }
            let expected = try ERPPendingCommand(scope: scope, name: "media.register", input: descriptor.input.data(uploadId: uploadId),
                                                 expectedVersion: nil, idempotencyKey: descriptor.registerKey, nativeMedia: true)
            guard sameMediaCommand(saved, expected) else { throw ERPMediaFailure.recoveryMismatch }
        }
        pending = saved
        return saved
    }
    func execute(_ command: ERPCommand, input: Data, expectedVersion: Int? = nil, authorityRevision expected: Int? = nil) async throws -> ERPField {
        // The form's authority is checked inside this actor before any journal access
        // or network suspension, including a session change after model preflight.
        if let expected, expected != generation { throw ERPFailure.accessChanged }
        guard !command.permission.isEmpty else { throw ERPFailure.invalidPayload }
        guard commandFlight == nil, mediaFlight == nil else { throw ERPFailure.commandInFlight }
        let session = try capture()
        guard try pendingCommand() == nil else { throw ERPFailure.pendingCommand }
        guard let scope = session.scope else { throw ERPFailure.expired }
        let payload = try ERPPendingCommand.validatedInput(name: command.name, input: input, expectedVersion: expectedVersion)
        if command.name == "media.register", let descriptor = try pendingMedia(),
           payload["uploadId"] as? String == descriptor.uploadId {
            throw ERPMediaFailure.pendingMedia
        }
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
        guard commandFlight == nil, mediaFlight == nil else { throw ERPFailure.commandInFlight }
        let session = try capture()
        guard let command = try pendingCommand() else { throw ERPFailure.noPendingCommand }
        guard command.nativeMedia != true else { throw ERPMediaFailure.pendingMedia }
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

    // MARK: Typed native media. Ordinary command and JSON limits stay unchanged.
    func mediaAuthority() throws -> ERPMediaAuthority {
        let session = try capture()
        guard let identity, let authority, let scope = session.scope else { throw ERPFailure.expired }
        return ERPMediaAuthority(clientID: mediaClientID, fence: mediaSessionFence, origin: session.origin.absoluteString,
                                 companyId: identity.actor.companyId, userId: identity.actor.userId,
                                 scope: scope, fingerprint: ERPMediaPolicy.hash(authority), revision: generation,
                                 external: identity.actor.roles.contains { ERPMediaPolicy.externalRoles.contains($0) })
    }
    func mediaSession() async throws -> ERPMediaAuthority {
        _ = try await refresh()
        return try mediaAuthority()
    }
    func checkMedia(_ ticket: ERPMediaTicket) throws {
        try ticket.check()
        guard try mediaAuthority() == ticket.authority else { throw ERPFailure.accessChanged }
    }
    func mediaCapability(_ ticket: ERPMediaTicket) async throws {
        try checkMedia(ticket)
        let commands = try await catalog()
        try checkMedia(ticket)
        guard let actor = identity?.actor else { throw ERPFailure.expired }
        _ = try ERPMediaPolicy.command(commands, actor: actor)
    }
    func mediaContexts(kind: String, ticket: ERPMediaTicket) async throws -> [ERPMediaContext] {
        guard ["site", "task"].contains(kind), !ticket.authority.external || kind == "site" else { throw ERPMediaFailure.noUploadPermission }
        try checkMedia(ticket)
        _ = try await refresh(); try checkMedia(ticket)
        try await mediaCapability(ticket)
        let records = try await entities(kind, mediaTicket: ticket)
        try checkMedia(ticket)
        return try records.map {
            guard $0.companyId == ticket.authority.companyId else { throw ERPMediaFailure.contextChanged }
            return try ERPMediaContext(record: $0)
        }
    }
    private func freshMediaContext(_ ticket: ERPMediaTicket) async throws {
        guard let context = ticket.context else { throw ERPMediaFailure.contextChanged }
        let choices = try await mediaContexts(kind: context.kind, ticket: ticket)
        guard choices.contains(where: { $0.kind == context.kind && $0.recordId == context.recordId && $0.siteId == context.siteId }) else {
            throw ERPMediaFailure.contextChanged
        }
        try checkMedia(ticket)
    }
    func pendingMedia() throws -> ERPMediaPending? {
        let current = try mediaAuthority()
        let saved = try mediaJournal.read(scope: current.scope)
        try saved?.validate(scope: current.scope)
        if let saved, !saved.matches(current) { throw ERPMediaFailure.recoveryMismatch }
        if let memory = mediaPending, memory.matches(current) {
            if let saved {
                guard memory.sameMutation(as: saved), saved.uploadId == nil || memory.uploadId == nil || saved.uploadId == memory.uploadId,
                      saved.assetId == nil || memory.assetId == nil || saved.assetId == memory.assetId,
                      saved.assetVersion == nil || memory.assetVersion == nil || saved.assetVersion == memory.assetVersion else { throw ERPFailure.recoveryInvalid }
                if memory.phase.order >= saved.phase.order { return memory }
            } else if memory.phase == .registered { return memory }
        }
        mediaPending = saved
        return saved
    }
    private func validateMedia(_ value: ERPMediaPending, ticket: ERPMediaTicket) throws {
        try checkMedia(ticket); try value.validate(scope: ticket.authority.scope)
        guard value.matches(ticket.authority), let context = ticket.context else { throw ERPMediaFailure.recoveryMismatch }
        try ERPMediaPolicy.validate(value.input, context: context, authority: ticket.authority, mimeType: value.mimeType)
        if let old = try pendingMedia() {
            guard old.sameMutation(as: value), value.phase.order >= old.phase.order,
                  old.uploadId == nil || old.uploadId == value.uploadId else { throw ERPMediaFailure.pendingMedia }
        }
    }
    func uploadMedia(_ file: ERPMediaFile, pending value: ERPMediaPending, ticket: ERPMediaTicket) async throws -> ERPMediaUploadResult {
        guard mediaFlight == nil, commandFlight == nil else { throw ERPFailure.commandInFlight }
        try validateMedia(value, ticket: ticket)
        guard value.phase == .uploadPending else { throw ERPMediaFailure.pendingMedia }
        let flight = UUID(); mediaFlight = flight
        defer { if mediaFlight == flight { mediaFlight = nil } }
        try await freshMediaContext(ticket)
        guard try pendingCommand() == nil else { throw ERPFailure.pendingCommand }
        let body = try value.uploadBody(file: file)
        try checkMedia(ticket)
        try mediaJournal.persist(value) // Fail closed before the first mutation.
        mediaPending = value
        let session = try capture()
        let (data, _) = try await send("/api/v1/media/uploads", method: "POST", body: body, session: session,
                                       mediaUploadKey: value.uploadKey, mediaTicket: ticket)
        let receipt = try JSONDecoder().decode(ERPMediaUploadReceipt.self, from: data)
        try receipt.validate(value); try checkMedia(ticket)
        var next = value; next.phase = .uploaded; next.uploadId = receipt.uploadId
        mediaPending = next // A known ACK is never reclassified as unknown by a disk error.
        var warning = false
        do { try mediaJournal.persist(next) } catch { warning = true }
        return ERPMediaUploadResult(pending: next, receipt: receipt, recoveryWarning: warning)
    }
    private func sameMediaCommand(_ command: ERPPendingCommand, _ expected: ERPPendingCommand) -> Bool {
        command.scope == expected.scope && command.name == "media.register" && command.expectedVersion == nil && command.nativeMedia == true && expected.nativeMedia == true &&
        command.idempotencyKey == expected.idempotencyKey && command.input == expected.input && command.body == expected.body
    }
    private func finishMediaReceipt(_ value: ERPMediaPending) -> Bool {
        do {
            try mediaJournal.persist(value)
            if let command = try journal.read(scope: value.scope) {
                guard let uploadId = value.uploadId else { throw ERPMediaFailure.receiptInvalid }
                let expected = try ERPPendingCommand(scope: value.scope, name: "media.register", input: value.input.data(uploadId: uploadId),
                                                     expectedVersion: nil, idempotencyKey: value.registerKey, nativeMedia: true)
                guard sameMediaCommand(command, expected) else { throw ERPFailure.pendingCommand }
                try journal.remove(scope: value.scope, idempotencyKey: value.registerKey)
                if pending?.idempotencyKey == value.registerKey { pending = nil }
            }
            try mediaJournal.remove(scope: value.scope, uploadKey: value.uploadKey)
            mediaPending = nil
            return false
        } catch { return true }
    }
    func registerMedia(_ value: ERPMediaPending, ticket: ERPMediaTicket) async throws -> ERPMediaRegistrationResult {
        guard mediaFlight == nil, commandFlight == nil else { throw ERPFailure.commandInFlight }
        try validateMedia(value, ticket: ticket)
        guard let uploadId = value.uploadId, value.phase != .uploadPending else { throw ERPMediaFailure.missingSelection }
        let flight = UUID(); mediaFlight = flight
        defer { if mediaFlight == flight { mediaFlight = nil } }
        try await freshMediaContext(ticket)
        if value.phase == .registered {
            // Only local cleanup remains. Never replay a known successful registration.
            return ERPMediaRegistrationResult(pending: value, asset: nil, recoveryWarning: finishMediaReceipt(value))
        }
        let expected = try ERPPendingCommand(scope: value.scope, name: "media.register", input: value.input.data(uploadId: uploadId),
                                             expectedVersion: nil, idempotencyKey: value.registerKey, nativeMedia: true)
        let old = try pendingCommand()
        if let old, !sameMediaCommand(old, expected) { throw ERPFailure.pendingCommand }
        var next = value; next.phase = .registerPending
        try checkMedia(ticket)
        try mediaJournal.persist(next)
        if old == nil { try journal.persist(expected) }
        pending = old ?? expected; mediaPending = next
        let session = try capture()
        let (data, _) = try await send("/api/v1/commands/media.register", method: "POST", body: expected.body, session: session, mediaTicket: ticket)
        let asset = try JSONDecoder().decode(ERPItem.self, from: data)
        try checkMedia(ticket)
        guard asset.kind == "media_asset", asset.companyId == value.companyId, ERPMediaPolicy.validID(asset.id), asset.version > 0,
              asset.data["uploadId"]?.string == uploadId, asset.data["siteId"]?.string == value.input.siteId,
              asset.data["taskId"]?.string == value.input.taskId, asset.data["stage"]?.string == value.input.stage,
              asset.data["visibility"]?.string == value.input.visibility else { throw ERPMediaFailure.receiptInvalid }
        next.phase = .registered; next.assetId = asset.id; next.assetVersion = asset.version
        mediaPending = next
        let warning = finishMediaReceipt(next)
        return ERPMediaRegistrationResult(pending: next, asset: asset, recoveryWarning: warning)
    }
    func mediaGallery(_ ticket: ERPMediaTicket) async throws -> [ERPItem] {
        try checkMedia(ticket)
        _ = try await refresh(); try checkMedia(ticket)
        let records = try await entities("media_asset", mediaTicket: ticket)
        try checkMedia(ticket)
        guard records.allSatisfy({ $0.kind == "media_asset" && $0.companyId == ticket.authority.companyId && ERPMediaPolicy.validID($0.id) }) else {
            throw ERPMediaFailure.receiptInvalid
        }
        return records
    }
    func downloadMedia(_ asset: ERPItem, ticket: ERPMediaTicket) async throws -> ERPMediaDownload {
        guard asset.kind == "media_asset", asset.companyId == ticket.authority.companyId else { throw ERPMediaFailure.contextChanged }
        if let context = ticket.context {
            guard asset.data["siteId"]?.string == context.siteId,
                  context.taskId == nil || asset.data["taskId"]?.string == context.taskId else { throw ERPMediaFailure.contextChanged }
        }
        let current = try await mediaGallery(ticket)
        guard current.contains(where: { $0.id == asset.id && $0.version == asset.version &&
            $0.data["siteId"]?.string == asset.data["siteId"]?.string && $0.data["taskId"]?.string == asset.data["taskId"]?.string }) else {
            throw ERPMediaFailure.contextChanged
        }
        let path = "/api/v1/media/\(try ERPMediaPolicy.component(asset.id))/file?copy=client"
        let session = try capture()
        var outgoing = try request(path, method: "GET", body: nil, authenticated: true, session: session)
        outgoing.setValue("image/jpeg, application/pdf", forHTTPHeaderField: "Accept")
        try checkMedia(ticket)
        let (data, response) = try await transport.mediaData(for: outgoing)
        try requireCurrent(session); try checkMedia(ticket)
        guard response.url == outgoing.url else { throw ERPFailure.invalidResponse }
        guard data.count <= ERPMediaLimits.download, response.expectedContentLength <= Int64(ERPMediaLimits.download) else { throw ERPFailure.tooLarge }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 { reset() }
            let code = data.count <= ERPURLSessionTransport.maximumResponseBytes ? Self.errorCode(data) : "HTTP_ERROR"
            throw ERPFailure.http(response.statusCode, code)
        }
        guard let mime = response.mimeType?.lowercased(), ["image/jpeg", "application/pdf"].contains(mime),
              try ERPMediaPolicy.mime(data) == mime else { throw ERPMediaFailure.unsupportedType }
        return ERPMediaDownload(assetId: asset.id, bytes: data, mimeType: mime)
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
