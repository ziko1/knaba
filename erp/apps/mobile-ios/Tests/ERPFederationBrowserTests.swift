import XCTest
import UIKit
import AuthenticationServices
@testable import KNABADE

@MainActor final class FederationFakeBrowser: ERPFederationBrowserSession {
    let completion: (URL?, Error?) -> Void
    let accepted: Bool
    private(set) var starts = 0
    private(set) var cancels = 0
    init(accepted: Bool = true, completion: @escaping (URL?, Error?) -> Void) { self.accepted = accepted; self.completion = completion }
    func start() -> Bool { starts += 1; return accepted }
    func cancel() { cancels += 1 }
}

@MainActor final class ERPFederationBrowserTests: XCTestCase {
    private let url = URL(string: "https://erp.example.test/auth/federation/authorize?request_id=11111111-1111-4111-8111-111111111111")!
    private let callback = URL(string: "de.knaba.mobile.ios.test:/auth/federation/callback?code=synthetic")!
    func testMissingOrInactivePresentationWindowNeverStartsSystemBrowser() async {
        var starts = 0
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in starts += 1; return FederationFakeBrowser(completion: done) }, usableWindow: { _ in false })
        for attached in [false, true] {
            let window = UIWindow(); browser.window = attached ? window : nil
            do { _ = try await browser.open(url, scheme: "de.knaba.mobile.ios.test"); XCTFail("No valid presenter") }
            catch { XCTAssertEqual(error as? ERPFederationFailure, .presentation) }
        }
        XCTAssertEqual(starts, 0)
    }
    func testStartFalsePreservesRetryabilityAndUsesExactSuppliedWindowAndURL() async {
        let window = UIWindow(); var sessions: [FederationFakeBrowser] = []
        let browser = ERPFederationAuthSession(factory: { address, scheme, anchor, done in
            XCTAssertEqual(address, self.url); XCTAssertEqual(scheme, "de.knaba.mobile.ios.test"); XCTAssertTrue(anchor === window)
            let session = FederationFakeBrowser(accepted: false, completion: done); sessions.append(session); return session
        }, usableWindow: { _ in true }); browser.window = window
        for _ in 0..<2 {
            do { _ = try await browser.open(url, scheme: "de.knaba.mobile.ios.test"); XCTFail("start false") }
            catch { XCTAssertEqual(error as? ERPFederationFailure, .presentation) }
        }
        XCTAssertEqual(sessions.count, 2); XCTAssertTrue(sessions.allSatisfy { $0.starts == 1 })
    }
    func testCancellationCompletesOnceAndLateOldCallbackCannotCompleteNewAttempt() async throws {
        let window = UIWindow(); let firstStarted = expectation(description: "first start"), secondStarted = expectation(description: "second start")
        var sessions: [FederationFakeBrowser] = []
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in
            let value = FederationFakeBrowser(completion: done); sessions.append(value)
            (sessions.count == 1 ? firstStarted : secondStarted).fulfill(); return value
        }, usableWindow: { _ in true }); browser.window = window
        let first = Task { try await browser.open(url, scheme: "de.knaba.mobile.ios.test") }
        await fulfillment(of: [firstStarted], timeout: 2); browser.cancel()
        do { _ = try await first.value; XCTFail("Cancelled browser") } catch { XCTAssertEqual(error as? ERPFederationFailure, .cancelled) }
        var adopted = false
        let second = Task { let result = try await browser.open(url, scheme: "de.knaba.mobile.ios.test"); adopted = true; return result }
        await fulfillment(of: [secondStarted], timeout: 2)
        sessions[0].completion(callback, nil); await Task.yield(); XCTAssertFalse(adopted)
        sessions[1].completion(callback, nil); let result = try await second.value
        XCTAssertEqual(result, callback); XCTAssertEqual(sessions[0].cancels, 1); XCTAssertEqual(sessions[1].starts, 1)
    }
    func testTaskCancellationCancelsOwnedSystemSessionAndDiscardsCallback() async {
        let window = UIWindow(), started = expectation(description: "start"); var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); started.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window
        let task = Task { try await browser.open(url, scheme: "de.knaba.mobile.ios.test") }
        await fulfillment(of: [started], timeout: 2); task.cancel()
        do { _ = try await task.value; XCTFail("Task cancellation") } catch { }
        XCTAssertEqual(session?.cancels, 1); session?.completion(callback, nil)
    }
    func testDetachedOriginalWindowRejectsCompletionWithoutInventedFallbackAnchor() async {
        let window = UIWindow(), started = expectation(description: "start"); var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); started.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window
        let task = Task { try await browser.open(url, scheme: "de.knaba.mobile.ios.test") }
        await fulfillment(of: [started], timeout: 2); browser.window = nil; session?.completion(callback, nil)
        do { _ = try await task.value; XCTFail("Presenter detached") } catch { XCTAssertEqual(error as? ERPFederationFailure, .presentation) }
    }
    func testSystemUserCancellationIsNotACompletionOrAnAccountFailure() async {
        let window = UIWindow(), started = expectation(description: "start"); var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); started.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window
        let task = Task { try await browser.open(url, scheme: "de.knaba.mobile.ios.test") }
        await fulfillment(of: [started], timeout: 2)
        session?.completion(nil, NSError(domain: ASWebAuthenticationSessionErrorDomain, code: ASWebAuthenticationSessionError.Code.canceledLogin.rawValue))
        do { _ = try await task.value; XCTFail("User cancelled") } catch { XCTAssertEqual(error as? ERPFederationFailure, .cancelled) }
    }
}
