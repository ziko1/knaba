import XCTest
@testable import KNABADE

private final class FederationInterruptedProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "federation-transport.example.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "application/json", "Set-Cookie": "knaba_session=KF3." + String(repeating: "s", count: 43) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600"
        ])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{\"actor\":".utf8))
        client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
    }
    override func stopLoading() { }
}

private final class FederationOversizeProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "federation-oversize.example.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "application/json", "Content-Length": "65537"
        ])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { }
}

final class ERPFederationURLSessionTests: XCTestCase {
    private func transport(_ protocolClass: AnyClass) -> ERPURLSessionTransport {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [protocolClass]
        return ERPURLSessionTransport(configuration: config)
    }
    func testRealURLSessionPreservesFreshHeadersWhenStreamFailsAfterResponse() async throws {
        let request = URLRequest(url: URL(string: "https://federation-transport.example.test/api/v1/auth/federation/token")!)
        let result = try await transport(FederationInterruptedProtocol.self).federationData(for: request)
        XCTAssertEqual(result.response.statusCode, 200); XCTAssertEqual(result.response.url, request.url); XCTAssertNil(result.body)
        XCTAssertTrue(result.response.value(forHTTPHeaderField: "Set-Cookie")?.hasPrefix("knaba_session=KF3.") == true)
        XCTAssertLessThanOrEqual(result.headersReceivedAt, Date())
    }
    func testOrdinaryTransportStillThrowsForTheSameFailedBody() async {
        let request = URLRequest(url: URL(string: "https://federation-transport.example.test/api/v1/auth/federation/token")!)
        do { _ = try await transport(FederationInterruptedProtocol.self).data(for: request); XCTFail("Ordinary transport must still fail") }
        catch { XCTAssertTrue(error is URLError) }
    }
    func testFederationBodyBoundDoesNotRaiseOrdinaryOrMediaLimits() async throws {
        let request = URLRequest(url: URL(string: "https://federation-oversize.example.test/api/v1/auth/federation/token")!)
        let result = try await transport(FederationOversizeProtocol.self).federationData(for: request)
        XCTAssertNil(result.body); XCTAssertEqual(result.response.expectedContentLength, 65537)
        XCTAssertEqual(ERPURLSessionTransport.maximumResponseBytes, 2 * 1024 * 1024)
        XCTAssertEqual(ERPFederationPolicy.maximumJSON, 64 * 1024)
        XCTAssertEqual(ERPPendingCommand.maximumInputBytes, 64 * 1024)
        // The existing envelope cap also allows the idempotency/version metadata.
        XCTAssertEqual(ERPPendingCommand.maximumBodyBytes, 70_000)
    }
}
