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
    case invalidOrigin, invalidPath, expired, invalidResponse, http(Int, String), tooLarge, accessChanged, invalidPayload
    var errorDescription: String? {
        switch self {
        case .invalidOrigin: return "Use the KNABA ERP HTTPS server address (without a path)."
        case .invalidPath: return "Unsupported ERP API path."
        case .expired: return "Your session has expired; sign in again."
        case .invalidResponse: return "Invalid response from KNABA server."
        case .tooLarge: return "Server response is too large."
        case .accessChanged: return "Access or server has changed. Sign in again."
        case .invalidPayload: return "Invalid command input."
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

private final class ERPNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSession, willPerformHTTPRedirection response: HTTPURLResponse, newRequest: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// An actor serializes identity changes. Sessions exist only in RAM; no plaintext token in UserDefaults.
actor ERPConsoleClient {
    private let transport: URLSession
    private var origin: URL?
    private var cookie: String?
    private var csrf: String?
    private var generation = 0
    private(set) var identity: ERPIdentity?
    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        transport = URLSession(configuration: configuration, delegate: ERPNoRedirect(), delegateQueue: nil)
    }
    func configure(_ raw: String) throws {
        guard let next = ERPOrigin.validate(raw) else { throw ERPFailure.invalidOrigin }
        if next != origin { reset() }
        origin = next
    }
    private func reset() { generation += 1; identity = nil; cookie = nil; csrf = nil }
    func forget() { reset(); origin = nil }
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
            if authenticated, let csrf { request.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token") }
            request.httpBody = body ?? Data("{}".utf8)
        }
        let (data, raw) = try await transport.data(for: request)
        guard epoch == generation else { throw ERPFailure.accessChanged }
        guard let response = raw as? HTTPURLResponse else { throw ERPFailure.invalidResponse }
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
        guard !email.isEmpty, !password.isEmpty, otp.isEmpty || otp.range(of: "^[0-9]{6}$", options: .regularExpression) != nil else { throw ERPFailure.invalidPayload }
        var payload: [String: String] = ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password]
        if !otp.isEmpty { payload["otp"] = otp }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await send("/api/v1/auth/login", method: "POST", body: body, authenticated: false)
        let decoded = try JSONDecoder().decode(ERPIdentity.self, from: data)
        guard let header = response.value(forHTTPHeaderField: "Set-Cookie"),
              let match = header.range(of: "(?:^|[,;]\\s*)knaba_session=([A-Za-z0-9_-]{30,100})", options: .regularExpression),
              let sessionCookie = header[match].split(separator: "=").last.map(String.init),
              decoded.actor.companyId.count > 0, decoded.actor.userId.count > 0,
              let token = decoded.csrfToken, !token.isEmpty else { throw ERPFailure.invalidResponse }
        cookie = sessionCookie; csrf = token; identity = decoded
        return decoded
    }
    func refresh() async throws -> ERPIdentity {
        let (data, _) = try await send("/api/v1/me")
        let result = try JSONDecoder().decode(ERPIdentity.self, from: data)
        guard result.actor.companyId == identity?.actor.companyId && result.actor.userId == identity?.actor.userId else { reset(); throw ERPFailure.accessChanged }
        csrf = result.csrfToken
        identity = result
        return result
    }
    func logout() async {
        if cookie != nil { _ = try? await send("/api/v1/auth/logout", method: "POST", body: Data("{}".utf8)) }
        reset()
    }
    func dashboard() async throws -> ERPDashboard { let (data, _) = try await send("/api/v1/dashboard"); return try JSONDecoder().decode(ERPDashboard.self, from: data) }
    func catalog() async throws -> [ERPCommand] { let (data, _) = try await send("/api/v1/commands"); return try JSONDecoder().decode(ERPCommands.self, from: data).items }
    func entities(_ kind: String, channelId: String? = nil) async throws -> [ERPItem] {
        guard kind.range(of: "^[a-z][a-z0-9_]{0,48}$", options: .regularExpression) != nil else { throw ERPFailure.invalidPath }
        let path: String = channelId == nil ? "/api/v1/entities/\(kind)" : "/api/v1/channels/\(channelId!.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "")/messages"
        var results: [ERPItem] = [], cursor: String? = nil, seen = Set<String>()
        for _ in 0..<10 {
            var url = path + "?limit=100"
            if let cursor { url += "&cursor=" + (cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "") }
            let (data, _) = try await send(url)
            let page = try JSONDecoder().decode(ERPPage.self, from: data)
            results.append(contentsOf: page.items)
            if !page.has_more { return results }
            guard let next = page.next_cursor, !next.isEmpty, seen.insert(next).inserted else { throw ERPFailure.invalidResponse }
            cursor = next
        }
        throw ERPFailure.tooLarge
    }
    func execute(_ command: ERPCommand, input: Data, expectedVersion: Int? = nil) async throws -> ERPField {
        guard catalogName(command.name), !command.permission.isEmpty, input.count <= 65536 else { throw ERPFailure.invalidPayload }
        let raw = try JSONSerialization.jsonObject(with: input)
        guard raw is [String: Any] else { throw ERPFailure.invalidPayload }
        var body: [String: Any] = ["input": raw, "idempotency_key": UUID().uuidString]
        if let expectedVersion { body["expected_version"] = expectedVersion }
        let data = try JSONSerialization.data(withJSONObject: body)
        let (result, _) = try await send("/api/v1/commands/\(command.name)", method: "POST", body: data)
        return try JSONDecoder().decode(ERPField.self, from: result)
    }
    private func catalogName(_ value: String) -> Bool { value.range(of: "^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$", options: .regularExpression) != nil }
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
