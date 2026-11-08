import Foundation
import CoreFoundation
import CryptoKit
import Security

enum ERPFederationFailure: Error, Equatable {
    case disabled, invalidResponse, invalidCallback, expired, changed, cancelled, presentation
    case startUnknown, sessionUnknown, restartRequired
}

/// A compiled first-party TEST registration. Neither discovery nor a callback can
/// enable a client absent from this binary. The Release registry is always empty.
struct ERPFederationRegistry: Sendable, Equatable {
    let clientID: String
    let redirectURI: String
    static var compiled: ERPFederationRegistry? {
        #if DEBUG && KNABA_FEDERATION_TEST
        return ERPFederationRegistry(clientID: "knaba-ios-test-v1", redirectURI: "de.knaba.mobile.ios.test:/auth/federation/callback")
        #else
        return nil
        #endif
    }
    var scheme: String { String(redirectURI.prefix { $0 != ":" }) }
}

struct ERPFederationAuthority: Sendable, Equatable, Identifiable {
    let id: String
    let label: String
    let siteOrigin: String
}
struct ERPFederationConfiguration: Sendable {
    let issuer: String
    let authorities: [ERPFederationAuthority]
}
struct ERPFederationStart: Sendable {
    let requestID: String
    let url: URL
    let deadline: Date
}
struct ERPFederationCandidate: Sendable {
    let cookie: String
    let cookieExpiry: Date
    var deadline: Date
    let uptimeDeadline: TimeInterval
}
struct ERPFederationAdoption: Sendable {
    let identity: ERPIdentity
    let revision: Int
    let pending: ERPPendingCommand?
}

/// A retired client can never send again, even if an older callback subsequently
/// resets it. Media callbacks use the same permanently invalidated local fence.
final class ERPFederationClientLifetime: @unchecked Sendable {
    let mediaFence = ERPMediaSessionFence()
    private let lock = NSLock()
    private var retired = false
    var active: Bool { lock.lock(); defer { lock.unlock() }; return !retired }
    func advance(to revision: Int) {
        lock.lock(); defer { lock.unlock() }
        if !retired { mediaFence.advance(to: revision) }
    }
    func retire() {
        lock.lock(); defer { lock.unlock() }
        retired = true; mediaFence.advance(to: -1)
    }
}

/// Network verification does not switch the active client. The prepared client
/// is private until this single MainActor commit installs both it and its UI.
final class ERPFederationVerified: @unchecked Sendable {
    private let client: ERPConsoleClient
    private let adoption: ERPFederationAdoption
    private let ticket: ERPFederationTicket
    private let previousLifetime: ERPFederationClientLifetime
    private let deadline: Date
    private let uptimeDeadline: TimeInterval
    private let now: @Sendable () -> Date
    private let uptime: @Sendable () -> TimeInterval
    private let checkRecovery: @Sendable () throws -> Void
    init(client: ERPConsoleClient, adoption: ERPFederationAdoption, ticket: ERPFederationTicket,
         previousLifetime: ERPFederationClientLifetime, deadline: Date, uptimeDeadline: TimeInterval,
         now: @escaping @Sendable () -> Date, uptime: @escaping @Sendable () -> TimeInterval,
         checkRecovery: @escaping @Sendable () throws -> Void) {
        self.client = client; self.adoption = adoption; self.ticket = ticket
        self.previousLifetime = previousLifetime; self.deadline = deadline; self.uptimeDeadline = uptimeDeadline
        self.now = now; self.uptime = uptime
        self.checkRecovery = checkRecovery
    }
    @MainActor func commit(_ install: (ERPConsoleClient, ERPFederationAdoption) -> Void) throws {
        try Task.checkCancellation()
        try ticket.commit {
            guard previousLifetime.active else { throw ERPFederationFailure.changed }
            guard deadline > now(), uptimeDeadline > uptime() else { throw ERPFederationFailure.expired }
            try Task.checkCancellation()
            // Bounded local metadata read, before any account switch. A changed,
            // locked or corrupt journal requires a new explicit preparation.
            try checkRecovery()
            guard deadline > now(), uptimeDeadline > uptime() else { throw ERPFederationFailure.expired }
            try Task.checkCancellation()
            previousLifetime.retire()
        }
        // Same MainActor turn, no await or I/O. Release the ticket lock before
        // publishing UI values, whose observers may synchronously inspect it.
        install(client, adoption)
    }
}
struct ERPFederationHTTPResult: @unchecked Sendable {
    // Immutable response headers survive a failed body read. A nil body is never
    // success: only a fresh exact token-200 cookie can authorize a later /me read.
    let response: HTTPURLResponse
    let body: Data?
    let headersReceivedAt: Date
    let headersReceivedUptime: TimeInterval
    init(response: HTTPURLResponse, body: Data?, headersReceivedAt: Date,
         headersReceivedUptime: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        self.response = response; self.body = body; self.headersReceivedAt = headersReceivedAt
        self.headersReceivedUptime = headersReceivedUptime
    }
}

/// Synchronous cancellation crosses the main/client actor boundary before a
/// callback can adopt a session. Commit and cancellation share one linearization.
final class ERPFederationTicket: @unchecked Sendable {
    let id = UUID()
    private let lock = NSLock()
    private var state = 0 // active / cancelled / committed
    @discardableResult func cancel() -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard state != 2 else { return false }
        state = 1; return true
    }
    func check() throws {
        lock.lock(); defer { lock.unlock() }
        guard state == 0 else { throw ERPFederationFailure.cancelled }
    }
    func commit<T>(_ update: () throws -> T) throws -> T {
        lock.lock(); defer { lock.unlock() }
        guard state == 0 else { throw ERPFederationFailure.cancelled }
        let value = try update(); state = 2; return value
    }
    var committed: Bool { lock.lock(); defer { lock.unlock() }; return state == 2 }
}

enum ERPFederationPolicy {
    static let maximumJSON = 64 * 1024
    static let pendingSeconds: TimeInterval = 300 // current server F3 pending bound
    static let recoverySeconds: TimeInterval = 120 // local recovery policy, no session grant
    static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) == value.startIndex..<value.endIndex
    }
    static func text(_ value: Any?, maximum: Int) -> String? {
        guard let value = value as? String, !value.isEmpty, value.utf16.count <= maximum,
              !value.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }) else { return nil }
        return value
    }
    static func boolean(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }
    static func object(_ data: Data) throws -> [String: Any] {
        guard data.count <= maximumJSON, let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ERPFederationFailure.invalidResponse
        }
        return value
    }
    private static func exact(_ value: [String: Any], _ keys: Set<String>, optional: Set<String> = []) throws {
        guard keys.isSubset(of: Set(value.keys)), Set(value.keys).isSubset(of: keys.union(optional)) else {
            throw ERPFederationFailure.invalidResponse
        }
    }
    static func instant(_ value: Any?) -> Date? {
        guard let text = text(value, maximum: 32), matches(text, "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{3})?Z$") else { return nil }
        let format = ISO8601DateFormatter()
        format.formatOptions = text.contains(".") ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
        return format.date(from: text)
    }
    static func randomSecret() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw ERPFederationFailure.disabled }
        return base64url(Data(bytes))
    }
    static func base64url(_ bytes: Data) -> String {
        bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    static func challenge(_ verifier: String) throws -> String {
        guard matches(verifier, "^[A-Za-z0-9._~-]{43,128}$") else { throw ERPFederationFailure.invalidResponse }
        return base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
    }
    static func health(_ data: Data) throws {
        let value = try object(data); try exact(value, ["ok", "application", "apiVersion", "mode"])
        guard boolean(value["ok"]) == true, value["application"] as? String == "KNABA DE",
              let version = value["apiVersion"] as? NSNumber, CFGetTypeID(version) != CFBooleanGetTypeID(), version == 1,
              value["mode"] as? String == "TEST" else { throw ERPFederationFailure.disabled }
    }
    static func configuration(_ data: Data, origin: URL, registry: ERPFederationRegistry) throws -> ERPFederationConfiguration {
        let value = try object(data)
        if boolean(value["enabled"]) == false { throw ERPFederationFailure.disabled }
        try exact(value, ["enabled", "authorizationIssuer", "authorities", "clients"])
        guard boolean(value["enabled"]) == true, let issuer = value["authorizationIssuer"] as? String,
              issuer == origin.absoluteString + "/auth/federation",
              let authorities = value["authorities"] as? [[String: Any]], (1...8).contains(authorities.count),
              let clients = value["clients"] as? [[String: Any]], (1...16).contains(clients.count) else { throw ERPFederationFailure.invalidResponse }
        var seen = Set<String>(), found = false
        for client in clients {
            try exact(client, ["clientId", "kind", "platform", "label"], optional: ["redirectUri"])
            guard let id = client["clientId"] as? String, matches(id, "^[A-Za-z0-9_-]{1,64}$"), seen.insert(id).inserted,
                  text(client["label"], maximum: 80) != nil else { throw ERPFederationFailure.invalidResponse }
            if client["kind"] as? String == "WEB" {
                guard client["platform"] as? String == "WEB", client["redirectUri"] == nil else { throw ERPFederationFailure.invalidResponse }
            } else {
                guard client["kind"] as? String == "NATIVE", ["ANDROID", "IOS"].contains(client["platform"] as? String ?? ""),
                      text(client["redirectUri"], maximum: 2048) != nil else { throw ERPFederationFailure.invalidResponse }
            }
            if id == registry.clientID {
                guard client["kind"] as? String == "NATIVE", client["platform"] as? String == "IOS",
                      client["redirectUri"] as? String == registry.redirectURI else { throw ERPFederationFailure.invalidResponse }
                found = true
            }
        }
        guard found else { throw ERPFederationFailure.disabled }
        seen.removeAll()
        let parsed = try authorities.map { row -> ERPFederationAuthority in
            try exact(row, ["authorityId", "label", "siteOrigin"])
            guard let id = row["authorityId"] as? String, matches(id, "^[A-Za-z0-9_-]{1,64}$"), seen.insert(id).inserted,
                  let label = text(row["label"], maximum: 253), let source = row["siteOrigin"] as? String,
                  validSiteOrigin(source) else { throw ERPFederationFailure.invalidResponse }
            return ERPFederationAuthority(id: id, label: label, siteOrigin: source)
        }
        return ERPFederationConfiguration(issuer: issuer, authorities: parsed)
    }
    private static func validSiteOrigin(_ value: String) -> Bool {
        guard text(value, maximum: 512) != nil, let parts = URLComponents(string: value), parts.scheme == "https",
              let host = parts.host, !host.isEmpty, host == host.lowercased(),
              parts.user == nil, parts.password == nil, parts.path.isEmpty, parts.query == nil, parts.fragment == nil,
              parts.url?.absoluteString == value else { return false }
        if let port = parts.port { return (0...65535).contains(port) && port != 443 }
        return true
    }
    static func start(_ data: Data, origin: URL, now: Date, attemptDeadline: Date) throws -> ERPFederationStart {
        let value = try object(data); try exact(value, ["requestId", "authorizationUrl", "expiresAt"])
        guard let id = value["requestId"] as? String,
              matches(id, "^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$"),
              let address = value["authorizationUrl"] as? String,
              address == origin.absoluteString + "/auth/federation/authorize?request_id=" + id,
              let url = URL(string: address), let expiry = instant(value["expiresAt"]), expiry > now else { throw ERPFederationFailure.invalidResponse }
        let deadline = min(expiry, attemptDeadline)
        guard deadline > now else { throw ERPFederationFailure.expired }
        return ERPFederationStart(requestID: id, url: url, deadline: deadline)
    }
    static func callback(_ url: URL, state: String, issuer: String, registry: ERPFederationRegistry) throws -> String {
        let raw = url.absoluteString
        guard raw.utf8.count <= 4096, let query = raw.firstIndex(of: "?"), String(raw[..<query]) == registry.redirectURI,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), parts.user == nil, parts.password == nil,
              parts.host == nil, parts.port == nil, parts.fragment == nil,
              let items = parts.queryItems, items.count == 3, Set(items.map(\.name)) == Set(["code", "state", "iss"]),
              let code = items.first(where: { $0.name == "code" })?.value, matches(code, "^K3C\\.[A-Za-z0-9_-]{43}$"),
              items.first(where: { $0.name == "state" })?.value == state,
              items.first(where: { $0.name == "iss" })?.value == issuer else { throw ERPFederationFailure.invalidCallback }
        return code
    }
    static func candidate(_ result: ERPFederationHTTPResult, tokenURL: URL, previousCookie: String?, now: Date,
                          attemptDeadline: Date) throws -> ERPFederationCandidate {
        let response = result.response
        guard response.statusCode == 200, response.url == tokenURL, response.mimeType?.lowercased() == "application/json",
              let header = response.value(forHTTPHeaderField: "Set-Cookie"), header.utf8.count <= 4096,
              !header.contains("\r"), !header.contains("\n") else { throw ERPFederationFailure.restartRequired }
        let parts = header.split(separator: ";", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
        guard let first = parts.first, matches(first, "^knaba_session=KF3\\.[A-Za-z0-9_-]{43}$") else { throw ERPFederationFailure.restartRequired }
        let cookie = String(first.dropFirst("knaba_session=".count))
        guard cookie != previousCookie else { throw ERPFederationFailure.restartRequired }
        var attrs = [String: String]()
        for part in parts.dropFirst() {
            let pair = part.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard let key = pair.first?.lowercased(), !key.isEmpty, attrs[key] == nil,
                  ["path", "secure", "httponly", "samesite", "max-age", "expires"].contains(key) else { throw ERPFederationFailure.restartRequired }
            attrs[key] = pair.count == 1 ? "" : String(pair[1])
        }
        guard attrs["secure"] == "", attrs["httponly"] == "", attrs["path"] == "/", attrs["samesite"]?.lowercased() == "strict",
              result.headersReceivedAt <= now else { throw ERPFederationFailure.restartRequired }
        var expiries = [Date]()
        if let age = attrs["max-age"] {
            guard matches(age, "^[0-9]{1,5}$"), let seconds = Int(age), (1...28800).contains(seconds) else { throw ERPFederationFailure.restartRequired }
            expiries.append(result.headersReceivedAt.addingTimeInterval(TimeInterval(seconds)))
        }
        if let expiry = attrs["expires"] {
            let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX"); format.timeZone = TimeZone(secondsFromGMT: 0)
            format.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"; format.isLenient = false
            guard let date = format.date(from: expiry), format.string(from: date) == expiry else { throw ERPFederationFailure.restartRequired }
            expiries.append(date)
        }
        guard let expiry = expiries.min(), expiry > now else { throw ERPFederationFailure.restartRequired }
        let deadline = min(expiry, attemptDeadline, result.headersReceivedAt.addingTimeInterval(recoverySeconds))
        guard deadline > now else { throw ERPFederationFailure.expired }
        return ERPFederationCandidate(cookie: cookie, cookieExpiry: expiry, deadline: deadline,
                                      uptimeDeadline: result.headersReceivedUptime + recoverySeconds)
    }
    static func profile(_ data: Data, tokenResponse: Bool) throws -> (ERPIdentity, Date?) {
        let value = try object(data)
        try exact(value, ["actor", "user", "csrfToken", "mode"], optional: tokenResponse ? ["expiresAt"] : ["version"])
        guard value["mode"] as? String == "TEST", let csrf = value["csrfToken"] as? String, matches(csrf, "^[A-Za-z0-9_-]{43}$"),
              let actor = value["actor"] as? [String: Any], text(actor["userId"], maximum: 200) != nil,
              text(actor["companyId"], maximum: 200) != nil, boolean(actor["mfaVerified"]) != nil else { throw ERPFederationFailure.invalidResponse }
        for key in ["roles", "permissions", "siteIds", "customerIds", "warehouseIds"] {
            guard let items = actor[key] as? [String], items.count <= 1024, items.allSatisfy({ text($0, maximum: 200) != nil }) else { throw ERPFederationFailure.invalidResponse }
        }
        let identity = try JSONDecoder().decode(ERPIdentity.self, from: data)
        guard identity.user.id == identity.actor.userId else { throw ERPFederationFailure.invalidResponse }
        let expiry = instant(value["expiresAt"])
        guard !tokenResponse || expiry != nil else { throw ERPFederationFailure.invalidResponse }
        return (identity, expiry)
    }
}
