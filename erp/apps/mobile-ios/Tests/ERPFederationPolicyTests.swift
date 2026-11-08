import XCTest
@testable import KNABADE

final class ERPFederationPolicyTests: XCTestCase {
    private let registry = ERPFederationRegistry(clientID: "knaba-ios-test-v1", redirectURI: "de.knaba.mobile.ios.test:/auth/federation/callback")
    private let origin = URL(string: "https://erp.example.test")!
    private let now = Date(timeIntervalSince1970: 1_794_160_000)
    private let cookie = "KF3." + String(repeating: "c", count: 43)
    private func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
    private func config() -> [String: Any] {
        ["enabled": true, "authorizationIssuer": origin.absoluteString + "/auth/federation",
         "authorities": [["authorityId": "site-a", "label": "Synthetic site", "siteOrigin": "https://site.example.test"]],
         "clients": [["clientId": registry.clientID, "kind": "NATIVE", "platform": "IOS", "label": "KNABA iOS Test", "redirectUri": registry.redirectURI]]]
    }
    private func candidate(header: String? = nil, status: Int = 200, url: URL? = nil, previous: String? = nil,
                           received: Date? = nil, deadline: Date? = nil) throws -> ERPFederationCandidate {
        let target = origin.appendingPathComponent("api/v1/auth/federation/token")
        let response = HTTPURLResponse(url: url ?? target, statusCode: status, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "application/json", "Set-Cookie": header ?? "knaba_session=\(cookie); Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600"
        ])!
        return try ERPFederationPolicy.candidate(.init(response: response, body: nil, headersReceivedAt: received ?? now), tokenURL: target,
             previousCookie: previous, now: now, attemptDeadline: deadline ?? now.addingTimeInterval(300))
    }
    private func callback(_ query: [URLQueryItem], base: String? = nil) -> URL {
        var value = URLComponents(string: base ?? registry.redirectURI)!
        value.queryItems = query; return value.url!
    }
    private var validQuery: [URLQueryItem] {
        [.init(name: "code", value: "K3C." + String(repeating: "k", count: 43)), .init(name: "state", value: String(repeating: "s", count: 43)),
         .init(name: "iss", value: origin.absoluteString + "/auth/federation")]
    }
    private func parse(_ value: URL) throws -> String {
        try ERPFederationPolicy.callback(value, state: String(repeating: "s", count: 43), issuer: origin.absoluteString + "/auth/federation", registry: registry)
    }
    func testS256MatchesRFC7636VectorWithoutPlainOrPaddingFallback() throws {
        XCTAssertEqual(try ERPFederationPolicy.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        for value in [String(repeating: "a", count: 42), String(repeating: "a", count: 129), String(repeating: "a", count: 43) + "\n", String(repeating: "é", count: 43)] {
            XCTAssertThrowsError(try ERPFederationPolicy.challenge(value))
        }
        XCTAssertTrue(ERPFederationPolicy.matches(try ERPFederationPolicy.randomSecret(), "^[A-Za-z0-9_-]{43}$"))
    }
    func testCompiledRegistryMatchesOnlyDebugTestBuild() {
        #if DEBUG && KNABA_FEDERATION_TEST
        XCTAssertEqual(ERPFederationRegistry.compiled, registry)
        #else
        XCTAssertNil(ERPFederationRegistry.compiled)
        #endif
    }
    func testDiscoveryRequiresExactIssuerClientPlatformCallbackAndUniqueAuthority() throws {
        XCTAssertEqual(try ERPFederationPolicy.configuration(json(config()), origin: origin, registry: registry).authorities.first?.id, "site-a")
        for key in ["clientId", "platform", "redirectUri"] {
            var value = config(); var clients = value["clients"] as! [[String: Any]]; clients[0][key] = "foreign"; value["clients"] = clients
            XCTAssertThrowsError(try ERPFederationPolicy.configuration(json(value), origin: origin, registry: registry), key)
        }
        var value = config(); value["authorizationIssuer"] = "https://foreign.example.test/auth/federation"
        XCTAssertThrowsError(try ERPFederationPolicy.configuration(json(value), origin: origin, registry: registry))
        value = config(); let authorities = value["authorities"] as! [[String: Any]]; value["authorities"] = authorities + authorities
        XCTAssertThrowsError(try ERPFederationPolicy.configuration(json(value), origin: origin, registry: registry))
    }
    func testDiscoveryRejectsDisabledAndNumericBooleanOrUnboundedInput() throws {
        XCTAssertThrowsError(try ERPFederationPolicy.configuration(json(["enabled": false]), origin: origin, registry: registry))
        var value = config(); value["enabled"] = 1
        XCTAssertThrowsError(try ERPFederationPolicy.configuration(json(value), origin: origin, registry: registry))
        XCTAssertThrowsError(try ERPFederationPolicy.configuration(Data(repeating: 32, count: 65537), origin: origin, registry: registry))
    }
    func testAuthorityLabelAcceptsFullConfiguredHostnameBoundAndRejectsOverflow() throws {
        let host = [63, 63, 63, 61].map { String(repeating: "a", count: $0) }.joined(separator: ".")
        XCTAssertEqual(host.count, 253)
        var value = config()
        value["authorities"] = [["authorityId": "site-a", "label": host, "siteOrigin": "https://" + host]]
        XCTAssertEqual(try ERPFederationPolicy.configuration(json(value), origin: origin, registry: registry).authorities.first?.label, host)
        value["authorities"] = [["authorityId": "site-a", "label": host + "a", "siteOrigin": "https://" + host]]
        XCTAssertThrowsError(try ERPFederationPolicy.configuration(json(value), origin: origin, registry: registry))
    }
    func testSourceAuthorityHttpsPortDoesNotRelaxOwnAppOriginOrAcceptURLSecrets() throws {
        var value = config()
        value["authorities"] = [["authorityId": "site-a", "label": "site.example.test", "siteOrigin": "https://site.example.test:8443"]]
        XCTAssertEqual(try ERPFederationPolicy.configuration(json(value), origin: origin, registry: registry).authorities.first?.siteOrigin,
                       "https://site.example.test:8443")
        XCTAssertNil(ERPOrigin.validate("https://erp.example.test:8443"))
        for source in ["http://site.example.test", "https://user@site.example.test", "https://site.example.test/path",
                       "https://site.example.test?token=x", "https://site.example.test#fragment", "https://site.example.test:443", "https://site.example.test:99999"] {
            value["authorities"] = [["authorityId": "site-a", "label": "Synthetic site", "siteOrigin": source]]
            XCTAssertThrowsError(try ERPFederationPolicy.configuration(json(value), origin: origin, registry: registry), source)
        }
    }
    func testStartRequiresExactOwnAuthorizationURLAndCapsServerDeadline() throws {
        let id = "11111111-1111-4111-8111-111111111111"
        var value: [String: Any] = ["requestId": id, "authorizationUrl": origin.absoluteString + "/auth/federation/authorize?request_id=" + id,
                                    "expiresAt": ISO8601DateFormatter().string(from: now.addingTimeInterval(600))]
        XCTAssertEqual(try ERPFederationPolicy.start(json(value), origin: origin, now: now, attemptDeadline: now.addingTimeInterval(300)).deadline, now.addingTimeInterval(300))
        value["authorizationUrl"] = "https://foreign.example.test/auth/federation/authorize?request_id=" + id
        XCTAssertThrowsError(try ERPFederationPolicy.start(json(value), origin: origin, now: now, attemptDeadline: now.addingTimeInterval(300)))
    }
    func testCallbackAcceptsOnlyExactBaseStateIssuerAndSingleKeys() throws {
        XCTAssertEqual(try parse(callback(validQuery)), validQuery[0].value)
        for base in ["other:/auth/federation/callback", "de.knaba.mobile.ios.test://host/auth/federation/callback",
                     registry.redirectURI + "/", "de.knaba.mobile.ios.test:/auth/federation/%63allback"] {
            XCTAssertThrowsError(try parse(callback(validQuery, base: base)))
        }
        for name in ["code", "state", "iss", "extra"] { XCTAssertThrowsError(try parse(callback(validQuery + [.init(name: name, value: "x")]))) }
        for index in 0..<3 {
            var query = validQuery; query[index] = .init(name: query[index].name, value: "foreign")
            XCTAssertThrowsError(try parse(callback(query)))
        }
        XCTAssertThrowsError(try parse(URL(string: callback(validQuery).absoluteString + "#fragment")!))
    }
    func testCandidateRequiresFreshExact200CookieNotOldSameUserOrNormalCookie() throws {
        XCTAssertEqual(try candidate().cookie, cookie)
        XCTAssertThrowsError(try candidate(previous: cookie))
        for status in [201, 302, 400, 401, 403, 409, 503] { XCTAssertThrowsError(try candidate(status: status)) }
        XCTAssertThrowsError(try candidate(url: URL(string: "https://foreign.example.test/api/v1/auth/federation/token")!))
        XCTAssertThrowsError(try candidate(header: "knaba_session=" + String(repeating: "s", count: 43) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600"))
    }
    func testCandidateRejectsAmbiguousMissingAndForeignCookieAttributes() throws {
        let valid = "knaba_session=\(cookie); Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600"
        for header in [valid + ", knaba_session=" + cookie, valid + "; Domain=example.test", valid + "; Max-Age=10",
                       valid.replacingOccurrences(of: "; Secure", with: ""), valid.replacingOccurrences(of: "Path=/", with: "Path=/other"),
                       valid.replacingOccurrences(of: "Strict", with: "Lax"), valid.replacingOccurrences(of: "3600", with: "0"),
                       valid.replacingOccurrences(of: "3600", with: "28801"), valid.replacingOccurrences(of: "; Max-Age=3600", with: "") ] {
            XCTAssertThrowsError(try candidate(header: header))
        }
    }
    func testRecoveryDeadlineUsesHeaderTimeAndMinimumCookieAndAttemptExpiry() throws {
        XCTAssertEqual(try candidate().deadline, now.addingTimeInterval(120))
        XCTAssertEqual(try candidate(received: now.addingTimeInterval(-90)).deadline, now.addingTimeInterval(30))
        XCTAssertEqual(try candidate(deadline: now.addingTimeInterval(10)).deadline, now.addingTimeInterval(10))
        XCTAssertThrowsError(try candidate(received: now.addingTimeInterval(-121)))
        XCTAssertThrowsError(try candidate(received: now.addingTimeInterval(1)))
    }
    func testCandidateExpiresAttributeMustBeExactAndNeverExtendsMaxAge() throws {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
        let expiry = formatter.string(from: now.addingTimeInterval(40))
        let header = "knaba_session=\(cookie); Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Expires=" + expiry
        XCTAssertEqual(try candidate(header: header).deadline, now.addingTimeInterval(40))
        XCTAssertThrowsError(try candidate(header: header + ", another=value"))
    }
    func testTicketCancelAndCommitHaveOneWinnerAndNoSecondCommit() throws {
        let cancelled = ERPFederationTicket(); cancelled.cancel()
        var mutations = 0
        XCTAssertThrowsError(try cancelled.commit { mutations += 1 })
        let committed = ERPFederationTicket(); try committed.commit { mutations += 1 }
        XCTAssertFalse(committed.cancel()); XCTAssertTrue(committed.committed)
        XCTAssertThrowsError(try committed.commit { mutations += 1 }); XCTAssertEqual(mutations, 1)
    }
    func testHealthRejectsProductionDemoBooleanVersionAndOtherApplication() throws {
        let health: [String: Any] = ["ok": true, "application": "KNABA DE", "apiVersion": 1, "mode": "TEST"]
        try ERPFederationPolicy.health(json(health))
        for (key, value) in [("mode", "PRODUCTION" as Any), ("mode", "DEMO" as Any), ("apiVersion", true as Any),
                             ("application", "other" as Any), ("ok", 1 as Any)] {
            var invalid = health; invalid[key] = value
            XCTAssertThrowsError(try ERPFederationPolicy.health(json(invalid)))
        }
    }
    func testMeHasNoInventedExpiryAndRequiresCurrentTestIdentityWithFullScopeArrays() throws {
        let data = MediaFixtures.identity()
        let (_, expiry) = try ERPFederationPolicy.profile(data, tokenResponse: false); XCTAssertNil(expiry)
        XCTAssertThrowsError(try ERPFederationPolicy.profile(data, tokenResponse: true))
        var value = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        value["mode"] = "PRODUCTION"
        XCTAssertThrowsError(try ERPFederationPolicy.profile(json(value), tokenResponse: false))
        value["mode"] = "TEST"; var actor = value["actor"] as! [String: Any]; actor.removeValue(forKey: "warehouseIds"); value["actor"] = actor
        XCTAssertThrowsError(try ERPFederationPolicy.profile(json(value), tokenResponse: false))
    }
    func testAllSixLanguagesCoverStatesAndLocalCredentialBoundary() {
        XCTAssertEqual(Set(ERPFederationStrings.rows.keys), Set(ERPFederationText.allCases))
        for key in ERPFederationText.allCases {
            XCTAssertEqual(ERPFederationStrings.rows[key]?.count, 6)
            XCTAssertTrue(ERPFederationStrings.rows[key]!.allSatisfy { !$0.isEmpty })
        }
        for language in NativeLanguage.allCases {
            XCTAssertEqual(ERPStrings.error(ERPFailure.http(403, "LOCAL_ERP_REAUTH_REQUIRED"), language), ERPFederationStrings.text(.localPassword, language))
        }
    }
}
