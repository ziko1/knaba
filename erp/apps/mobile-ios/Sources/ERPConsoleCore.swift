import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Native ERP account authentication; never reuses the employee GPS device bearer.
/// The existing KNABA server remains authoritative for every role and tenant decision.
struct ERPActor: Decodable, Sendable {
    let userId: String
    let companyId: String
    let roles: [String]
    let permissions: [String]
    let siteIds: [String]?
    let customerIds: [String]?
}
struct ERPUser: Decodable, Sendable {
    let id: String
    let name: String?
    let email: String?
}
struct ERPIdentity: Decodable, Sendable {
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
    case invalidOrigin, invalidPath, expired, invalidResponse, http(Int, String), tooLarge, accessChanged, invalidPayload, confirmationRequired
    case pendingExists, pendingUnknown, pendingDifferentActor, pendingStorage, pendingChanged
    case sensitiveCommand, credentialReauthenticationRequired, credentialOutcomeUnknown
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
        case .http(let status, let code): return "KNABA server: \(code) (\(status))."
        case .pendingExists: return "Resolve the saved request before sending another change."
        case .pendingUnknown: return "The request may already have been applied. Retry the saved request only."
        case .pendingDifferentActor: return "A saved request belongs to another account or server."
        case .pendingStorage: return "The saved request cannot be read or safely stored. Do not create it again."
        case .pendingChanged: return "The saved request has changed. Reload its current state."
        case .sensitiveCommand: return "This credential action is not available through durable mobile commands."
        case .credentialReauthenticationRequired: return "Sign in again to check your credential change."
        case .credentialOutcomeUnknown: return "The credential change may have been applied. Sign in again to check it; it will not be retried."
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

final class ERPNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

protocol ERPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

struct ERPURLSessionTransport: ERPTransport {
    private let session: URLSession
    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        session = URLSession(configuration: configuration, delegate: ERPNoRedirect(), delegateQueue: nil)
    }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw ERPFailure.invalidResponse }
        return (data, response)
    }
}

/// An actor serializes identity changes. Sessions exist only in RAM; no plaintext token in UserDefaults.
actor ERPConsoleClient {
    private let transport: any ERPTransport
    private let pendingStore: any ERPPendingCommandStoring
    private var origin: URL?
    private var cookie: String?
    private var csrf: String?
    private var generation = 0
    private var activeWrite: UUID?
    private var identityAuthority: Data?
    private(set) var identity: ERPIdentity?

    struct Authority: Sendable {
        let generation: Int
        let origin: URL
        let companyId: String
        let userId: String
    }

    init(transport: any ERPTransport = ERPURLSessionTransport(),
         pendingStore: any ERPPendingCommandStoring = ERPEncryptedPendingCommandStore()) {
        self.transport = transport
        self.pendingStore = pendingStore
    }
    func configure(_ raw: String) throws {
        guard let next = ERPOrigin.validate(raw) else { reset(); origin = nil; throw ERPFailure.invalidOrigin }
        if next != origin { reset() }
        origin = next
    }
    private func reset() { generation += 1; identity = nil; cookie = nil; csrf = nil; identityAuthority = nil }
    func forget() { reset(); origin = nil }
    private func validatedIdentity(_ value: ERPIdentity) throws -> ERPIdentity {
        guard !value.actor.companyId.isEmpty, value.actor.companyId.count <= 200,
              !value.actor.userId.isEmpty, value.actor.userId.count <= 200,
              value.user.id == value.actor.userId,
              let token = value.csrfToken, !token.isEmpty, token.count <= 256,
              token.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { throw ERPFailure.invalidResponse }
        return value
    }
    private func authority() throws -> Authority {
        guard let origin, let identity, cookie != nil, csrf != nil else { throw ERPFailure.expired }
        return Authority(generation: generation, origin: origin, companyId: identity.actor.companyId, userId: identity.actor.userId)
    }
    func commandAuthority() throws -> Authority { try authority() }
    private func require(_ value: Authority) throws {
        guard value.generation == generation, value.origin == origin,
              value.companyId == identity?.actor.companyId, value.userId == identity?.actor.userId,
              cookie != nil, csrf != nil else { throw ERPFailure.accessChanged }
    }
    private func send(_ path: String, method: String = "GET", body: Data? = nil, authenticated: Bool = true) async throws -> (Data, HTTPURLResponse) {
        guard let base = origin else { throw ERPFailure.invalidOrigin }
        guard path.hasPrefix("/api/v1/"), !path.contains(".."), !path.contains("//"), !path.contains("#"),
              let url = URL(string: base.absoluteString + path), url.host == base.host, url.scheme == "https" else { throw ERPFailure.invalidPath }
        let epoch = generation
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated {
            guard let cookie else { throw ERPFailure.expired }
            request.setValue("knaba_session=" + cookie, forHTTPHeaderField: "Cookie")
        }
        if method != "GET" {
            request.setValue(base.absoluteString, forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if authenticated {
                guard let csrf else { throw ERPFailure.expired }
                request.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token")
            }
            request.httpBody = body ?? Data("{}".utf8)
        }
        let data: Data, response: HTTPURLResponse
        do { (data, response) = try await transport.data(for: request) }
        catch {
            guard epoch == generation else { throw ERPFailure.accessChanged }
            throw error
        }
        guard epoch == generation else { throw ERPFailure.accessChanged }
        guard response.url == url else { throw ERPFailure.invalidResponse }
        guard data.count <= 2 * 1024 * 1024 else { throw ERPFailure.tooLarge }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 && authenticated { reset() }
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let code = (json?["code"] as? String) ?? ((json?["error"] as? [String: Any])?["code"] as? String) ?? "HTTP_ERROR"
            throw ERPFailure.http(response.statusCode, String(code.prefix(60)))
        }
        return (data, response)
    }
    func login(email: String, password: String, otp: String = "") async throws -> ERPIdentity {
        reset()
        let loginEpoch = generation
        guard !email.isEmpty, !password.isEmpty, otp.isEmpty || otp.range(of: "^[0-9]{6}$", options: .regularExpression) != nil else { throw ERPFailure.invalidPayload }
        var payload: [String: String] = ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password]
        if !otp.isEmpty { payload["otp"] = otp }
        let body = try JSONSerialization.data(withJSONObject: payload)
        do {
            let (data, response) = try await send("/api/v1/auth/login", method: "POST", body: body, authenticated: false)
            guard loginEpoch == generation else { throw ERPFailure.accessChanged }
            let decoded = try validatedIdentity(JSONDecoder().decode(ERPIdentity.self, from: data))
            guard let header = response.value(forHTTPHeaderField: "Set-Cookie"),
                  let match = header.range(of: "(?:^|[,;]\\s*)knaba_session=([A-Za-z0-9_-]{30,100})", options: .regularExpression),
                  let sessionCookie = header[match].split(separator: "=").last.map(String.init),
                  let token = decoded.csrfToken, !token.isEmpty else { throw ERPFailure.invalidResponse }
            // Provisional credentials can fetch /me, but no accepted identity or command authority
            // is exposed until the current server identity matches this login exactly.
            cookie = sessionCookie; csrf = token
            let current = try await readCurrentIdentity(matching: decoded.actor, epoch: loginEpoch)
            guard loginEpoch == generation else { throw ERPFailure.accessChanged }
            identity = current; csrf = current.csrfToken
            return current
        } catch {
            if loginEpoch == generation { reset() }
            throw error
        }
    }
    private func readCurrentIdentity(matching expected: ERPActor, epoch: Int) async throws -> ERPIdentity {
        let (data, _) = try await send("/api/v1/me")
        guard epoch == generation else { throw ERPFailure.accessChanged }
        let result: ERPIdentity, snapshot: Data
        do {
            result = try validatedIdentity(JSONDecoder().decode(ERPIdentity.self, from: data))
            snapshot = try ERPCredentialPolicy.authoritySnapshot(data)
        }
        catch { if epoch == generation { reset() }; throw ERPFailure.accessChanged }
        guard result.actor.companyId == expected.companyId, result.actor.userId == expected.userId else {
            if epoch == generation { reset() }; throw ERPFailure.accessChanged
        }
        identityAuthority = snapshot
        return result
    }
    func refresh() async throws -> ERPIdentity {
        let current = try authority()
        guard let expected = identity?.actor else { throw ERPFailure.expired }
        let result = try await readCurrentIdentity(matching: expected, epoch: current.generation)
        try require(current)
        csrf = result.csrfToken
        identity = result
        return result
    }
    func logout() async {
        var request: URLRequest?
        if let origin, let cookie, let csrf, let url = URL(string: origin.absoluteString + "/api/v1/auth/logout") {
            var snapshot = URLRequest(url: url)
            snapshot.httpMethod = "POST"
            snapshot.setValue("application/json", forHTTPHeaderField: "Content-Type")
            snapshot.setValue(origin.absoluteString, forHTTPHeaderField: "Origin")
            snapshot.setValue("knaba_session=" + cookie, forHTTPHeaderField: "Cookie")
            snapshot.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token")
            snapshot.httpBody = Data("{}".utf8)
            request = snapshot
        }
        // Invalidate before suspension. A delayed logout never clears a subsequent login.
        reset()
        if let request { _ = try? await transport.data(for: request) }
    }
    func dashboard() async throws -> ERPDashboard { let (data, _) = try await send("/api/v1/dashboard"); return try JSONDecoder().decode(ERPDashboard.self, from: data) }
    func catalog() async throws -> [ERPCommand] { let (data, _) = try await send("/api/v1/commands"); return try JSONDecoder().decode(ERPCommands.self, from: data).items }
    func entities(_ kind: String, channelId: String? = nil) async throws -> [ERPItem] {
        let current = try authority()
        guard kind.range(of: "^[a-z][a-z0-9_]{0,48}$", options: .regularExpression) != nil else { throw ERPFailure.invalidPath }
        if let channelId, UUID(uuidString: channelId) == nil { throw ERPFailure.invalidPath }
        let path: String = channelId == nil ? "/api/v1/entities/\(kind)" : "/api/v1/channels/\(channelId!)/messages"
        let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var results: [ERPItem] = [], cursor: String? = nil, seen = Set<String>()
        for _ in 0..<10 {
            try require(current)
            var url = path + "?limit=100"
            if let cursor {
                guard cursor.utf8.count <= 8192, let encoded = cursor.addingPercentEncoding(withAllowedCharacters: unreserved) else { throw ERPFailure.invalidResponse }
                url += "&cursor=" + encoded
            }
            let (data, _) = try await send(url)
            try require(current)
            let page = try JSONDecoder().decode(ERPPage.self, from: data)
            results.append(contentsOf: page.items)
            if !page.has_more { return results }
            guard let next = page.next_cursor, !next.isEmpty, next.utf8.count <= 8192, seen.insert(next).inserted else { throw ERPFailure.invalidResponse }
            cursor = next
        }
        throw ERPFailure.tooLarge
    }
    func execute(_ command: ERPCommand, input: Data, expectedVersion: Int? = nil, authority expected: Authority? = nil) async throws -> ERPField {
        if let expected { try require(expected) }
        let current = try authority()
        guard activeWrite == nil else { throw ERPFailure.pendingExists }
        guard ERPCommandName.isValid(command.name), !command.permission.isEmpty, input.count <= 65536,
              expectedVersion == nil || expectedVersion! > 0 else { throw ERPFailure.invalidPayload }
        let raw = try JSONSerialization.jsonObject(with: input)
        guard let object = raw as? [String: Any] else { throw ERPFailure.invalidPayload }
        let oneShot = ERPCredentialPolicy.isOneShot(command.name)
        if oneShot {
            guard command.permission == "identity.self" else { throw ERPFailure.invalidPayload }
            try ERPCredentialPolicy.validateOneShot(command.name, input: object)
        } else if try ERPCredentialPolicy.containsSecret(object) { throw ERPFailure.sensitiveCommand }
        guard try validatedPending() == nil else { throw ERPFailure.pendingExists }
        let key = UUID().uuidString
        var body: [String: Any] = ["input": raw, "idempotency_key": key]
        if let expectedVersion { body["expected_version"] = expectedVersion }
        let data = try JSONSerialization.data(withJSONObject: body, options: .sortedKeys)
        guard data.count <= ERPPendingCommand.maximumBodyBytes else { throw ERPFailure.invalidPayload }
        if oneShot {
            let operation = UUID(); activeWrite = operation
            defer { if activeWrite == operation { activeWrite = nil } }
            return try await executeCredential(command.name, body: data, authority: current)
        }
        let pending = ERPPendingCommand(schemaVersion: 1, origin: current.origin.absoluteString,
                                        companyId: current.companyId, userId: current.userId, command: command.name,
                                        idempotencyKey: key, expectedVersion: expectedVersion, body: data, createdAt: Date())
        // This synchronous actor turn persists the exact envelope before any network suspension.
        try pendingStore.insert(pending)
        let operation = UUID(); activeWrite = operation
        defer { if activeWrite == operation { activeWrite = nil } }
        return try await transmit(pending, authority: current, previousOutcomeUnknown: false)
    }

    private func validatedPending() throws -> ERPPendingCommand? {
        guard let pending = try pendingStore.load() else { return nil }
        try pending.validate()
        return pending
    }

    private func executeCredential(_ name: String, body: Data, authority current: Authority) async throws -> ERPField {
        guard let expectedAuthority = identityAuthority else { throw ERPFailure.expired }
        var dispatched = false
        defer {
            // An old completion must never clear a newer login or origin.
            if dispatched && current.generation == generation && current.origin == origin { reset() }
        }
        do {
            _ = try await refresh()
            try require(current)
            guard identityAuthority == expectedAuthority else { reset(); throw ERPFailure.accessChanged }
            guard try validatedPending() == nil else { throw ERPFailure.pendingExists }
            try Task.checkCancellation()
            dispatched = true
            let (data, response) = try await send("/api/v1/commands/\(name)", method: "POST", body: body)
            try require(current)
            guard response.statusCode == 200 || response.statusCode == 201 else { throw ERPFailure.invalidResponse }
            let result = try JSONDecoder().decode(ERPField.self, from: data)
            guard result.dictionary?["ok"]?.bool == true,
                  result.dictionary?["reauthenticationRequired"]?.bool == true else { throw ERPFailure.invalidResponse }
            return result
        } catch {
            guard dispatched else { throw error }
            if let failure = error as? ERPFailure, failure == .accessChanged { throw failure }
            if definitiveRejection(error) { throw ERPFailure.credentialReauthenticationRequired }
            if case .http(let status, _)? = error as? ERPFailure, status == 401 {
                throw ERPFailure.credentialReauthenticationRequired
            }
            // No envelope or key is retained for replay, including a timeout or cancellation.
            throw ERPFailure.credentialOutcomeUnknown
        }
    }

    func pendingCommand() throws -> ERPPendingCommand? {
        let current = try authority()
        guard let pending = try validatedPending() else { return nil }
        guard let identity, pending.belongs(to: identity, origin: current.origin) else { throw ERPFailure.pendingDifferentActor }
        return pending
    }

    func retryPendingCommand() async throws -> ERPField {
        let current = try authority()
        guard activeWrite == nil else { throw ERPFailure.pendingExists }
        guard let pending = try pendingCommand() else { throw ERPFailure.pendingChanged }
        let operation = UUID(); activeWrite = operation
        defer { if activeWrite == operation { activeWrite = nil } }
        // Every explicit recovery rechecks /me. Login, process recreation and resume never replay.
        _ = try await refresh()
        try require(current)
        guard try validatedPending() == pending else { throw ERPFailure.pendingChanged }
        return try await transmit(pending, authority: current, previousOutcomeUnknown: true)
    }

    private func transmit(_ pending: ERPPendingCommand, authority current: Authority, previousOutcomeUnknown: Bool) async throws -> ERPField {
        do {
            try require(current)
            let (data, response) = try await send("/api/v1/commands/\(pending.command)", method: "POST", body: pending.body)
            try require(current)
            // A queued/empty/malformed response is not the ERP command's commit receipt.
            guard response.statusCode == 200 || response.statusCode == 201 else { throw ERPFailure.invalidResponse }
            let value = try JSONDecoder().decode(ERPField.self, from: data)
            try require(current)
            try pendingStore.resolve(pending)
            return value
        } catch {
            // A rejection after an earlier uncertain attempt cannot disprove its effect.
            // Only the first attempt's explicit transactional rejection can release its journal.
            if !previousOutcomeUnknown, (try? require(current)) != nil, definitiveRejection(error) {
                try pendingStore.resolve(pending)
                throw error
            }
            if let failure = error as? ERPFailure {
                switch failure {
                case .accessChanged, .expired, .pendingStorage, .pendingChanged: throw failure
                case .http(let status, _) where status == 401 || status == 403: throw failure
                default: break
                }
            }
            throw ERPFailure.pendingUnknown
        }
    }

    private func definitiveRejection(_ error: Error) -> Bool {
        guard let failure = error as? ERPFailure, case let .http(status, code) = failure else { return false }
        return [400, 403, 404, 409, 422].contains(status) &&
            ["VALIDATION_ERROR", "VERSION_CONFLICT", "ACCESS_DENIED", "NOT_FOUND"].contains(code)
    }
    func messages(_ channelId: String) async throws -> [ERPItem] {
        guard UUID(uuidString: channelId) != nil else { throw ERPFailure.invalidPath }
        return try await entities("message", channelId: channelId)
    }
    func sendMessage(channelId: String, text: String, language: String) async throws {
        guard UUID(uuidString: channelId) != nil, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 12000 else { throw ERPFailure.invalidPayload }
        let cmd = ERPCommand(name: "message.send", permission: "chat.write", highRisk: false, schema: nil)
        let value: [String: String] = ["channel_id": channelId, "text": text.trimmingCharacters(in: .whitespacesAndNewlines), "language": language]
        _ = try await execute(cmd, input: JSONSerialization.data(withJSONObject: value))
    }
}
