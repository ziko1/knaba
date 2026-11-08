import XCTest
import UIKit
@testable import KNABADE

#if DEBUG && KNABA_FEDERATION_TEST
@MainActor final class ERPFederationModelTests: XCTestCase {
    private func fixture(_ transport: FederationTransport = FederationTransport(),
                         beforeCommit: (@MainActor @Sendable () async -> Void)? = nil,
                         journal: any ERPCommandJournal = MediaCommandJournal()) async throws -> (ERPConsoleModel, ERPConsoleClient, UserDefaults) {
        let name = "knaba-federation-test-" + UUID().uuidString
        addTeardownBlock { UserDefaults.standard.removePersistentDomain(forName: name) }
        let preferences = UserDefaults(suiteName: name)!, clock = transport.clock
        let client = ERPConsoleClient(transport: transport, journal: journal, mediaJournal: MediaMemoryJournal(),
                                      federationNow: { clock.now() }, federationUptime: { clock.uptime() })
        let model = ERPConsoleModel(client: client, preferences: preferences, websiteBeforeCommit: beforeCommit)
        model.origin = FederationTransport.origin; model.email = "synthetic@example.test"; model.password = "Synthetic password"
        await model.signIn(); XCTAssertEqual(model.identity?.actor.userId, "old-user")
        return (model, client, preferences)
    }
    func testOldModelStaysVisibleUntilCandidateReadAndCompleteAtomicAdoption() async throws {
        let transport = FederationTransport(), (model, _, preferences) = try await fixture(transport)
        let gate = FederationGate(), opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn(); XCTAssertEqual(model.websitePhase, .choose)
        let oldRevision = model.sessionRevision; await transport.gate("candidate-me", gate)
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        XCTAssertEqual(model.identity?.actor.userId, "old-user"); XCTAssertEqual(model.sessionRevision, oldRevision)
        await gate.release(); await task.value
        XCTAssertEqual(model.identity?.actor.userId, "new-user"); XCTAssertGreaterThan(model.sessionRevision, oldRevision)
        XCTAssertEqual(model.websitePhase, .complete); XCTAssertEqual(preferences.string(forKey: "knaba-erp-origin"), FederationTransport.origin)
        XCTAssertNil(preferences.string(forKey: "codeVerifier")); XCTAssertNil(preferences.string(forKey: "knaba_session"))
    }
    func testCancelOrBackgroundAtVerifiedMainHandoffPreservesOldModelAndClient() async throws {
        for background in [false, true] {
            let transport = FederationTransport(), gate = FederationGate()
            let (model, client, _) = try await fixture(transport, beforeCommit: { await gate.pause() })
            let opened = expectation(description: "browser"), window = UIWindow()
            var session: FederationFakeBrowser?
            let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
            browser.window = window; await model.prepareWebsiteSignIn()
            let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
            session?.completion(try await transport.callback(), nil); await gate.entered()
            XCTAssertEqual(model.identity?.actor.userId, "old-user"); XCTAssertTrue(model.mediaClient === client)
            let before = await client.identity; XCTAssertEqual(before?.actor.userId, "old-user")
            if background { model.websiteDidEnterBackground() } else { model.cancelWebsiteSignIn() }
            await gate.release(); await task.value
            XCTAssertEqual(model.identity?.actor.userId, "old-user"); XCTAssertTrue(model.mediaClient === client)
            XCTAssertEqual(model.websitePhase, .idle)
            let current = try await client.refresh(); XCTAssertEqual(current.actor.userId, "old-user")
            let calls = await transport.requests()
            XCTAssertEqual(calls.last?.value(forHTTPHeaderField: "Cookie"), "knaba_session=" + FederationTransport.oldCookie)
            XCTAssertEqual(calls.filter { $0.url?.path.hasSuffix("/token") == true }.count, 1)
        }
    }
    func testVerifiedMainHandoffInstallsClientAndUITogetherAndRejectsOldDeferredIntent() async throws {
        let transport = FederationTransport(), gate = FederationGate()
        let (model, client, _) = try await fixture(transport, beforeCommit: { await gate.pause() })
        let opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let intent = model.captureIntent(), oldMedia = ERPMediaTicket(authority: try await client.mediaAuthority())
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        XCTAssertTrue(model.mediaClient === client); XCTAssertNoThrow(try oldMedia.check())
        await gate.release(); await task.value
        XCTAssertFalse(model.mediaClient === client); XCTAssertEqual(model.identity?.actor.userId, "new-user")
        let installed = await model.mediaClient.identity, retired = await client.hasSession()
        XCTAssertEqual(installed?.actor.userId, model.identity?.actor.userId); XCTAssertFalse(retired)
        XCTAssertThrowsError(try oldMedia.check())
        let count = await transport.requests().count
        await model.perform(intent) { await model.signOut() }
        let after = await transport.requests().count
        XCTAssertEqual(after, count); XCTAssertEqual(model.identity?.actor.userId, "new-user")
    }
    func testVerifiedMainHandoffAfterSameUserRefreshCannotDiscardUpdatedAuthority() async throws {
        let transport = FederationTransport(), gate = FederationGate()
        let (model, client, _) = try await fixture(transport, beforeCommit: { await gate.pause() })
        let opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        let revision = model.sessionRevision
        await transport.changeOldAuthority(warehouses: ["warehouse-current"]); await model.reloadSession()
        await gate.release(); await task.value
        XCTAssertTrue(model.mediaClient === client); XCTAssertEqual(model.identity?.actor.userId, "old-user")
        XCTAssertGreaterThan(model.sessionRevision, revision)
        let authenticated = await client.hasSession(); XCTAssertTrue(authenticated)
    }
    func testVerifiedMainHandoffExpiryPreservesOldAccountWithoutNetworkReplay() async throws {
        let transport = FederationTransport(), gate = FederationGate()
        let (model, client, _) = try await fixture(transport, beforeCommit: { await gate.pause() })
        let opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        let count = await transport.requests().count; transport.clock.advance(121)
        await gate.release(); await task.value
        XCTAssertEqual(model.websitePhase, .failed); XCTAssertEqual(model.websiteProblem, .expired)
        XCTAssertTrue(model.mediaClient === client); XCTAssertEqual(model.identity?.actor.userId, "old-user")
        let after = await transport.requests().count; XCTAssertEqual(after, count)
    }
    func testRetiredLateReadErrorCannotClearNewAccountOrStartReadOnNewClient() async throws {
        let transport = FederationTransport(), (model, client, _) = try await fixture(transport)
        let opened = expectation(description: "browser"), window = UIWindow(), oldRead = FederationGate()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        await transport.gate("/api/v1/dashboard", oldRead)
        let read = Task { await model.loadOverview() }; await oldRead.entered()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await task.value
        XCTAssertEqual(model.identity?.actor.userId, "new-user"); XCTAssertFalse(model.mediaClient === client)
        let count = await transport.requests().count
        await oldRead.release(); await read.value
        XCTAssertEqual(model.identity?.actor.userId, "new-user"); XCTAssertTrue(model.problem.isEmpty)
        let after = await transport.requests().count; XCTAssertEqual(after, count)
    }
    func testCandidateJournalReadOrParseFailurePreservesOriginalAccount() async throws {
        for failure in [ERPFailure.recoveryUnavailable, .recoveryInvalid] {
            let transport = FederationTransport(), journal = FederationCommandJournal()
            let (model, client, _) = try await fixture(transport, journal: journal)
            let opened = expectation(description: "browser"), window = UIWindow()
            var session: FederationFakeBrowser?
            let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
            browser.window = window; await model.prepareWebsiteSignIn(); journal.failReads(failure)
            let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
            session?.completion(try await transport.callback(), nil); await task.value
            XCTAssertTrue(model.mediaClient === client); XCTAssertEqual(model.identity?.actor.userId, "old-user")
            XCTAssertEqual(model.websitePhase, .failed)
            let authenticated = await client.hasSession(); XCTAssertTrue(authenticated)
            journal.failReads(nil)
            let current = try await client.refresh(); XCTAssertEqual(current.actor.userId, "old-user")
        }
    }
    func testValidCandidatePendingJournalIsRetainedAndNewAccountRemainsReadOnly() async throws {
        let transport = FederationTransport(), journal = FederationCommandJournal()
        let scope = try ERPPendingCommand.scope(origin: URL(string: FederationTransport.origin)!, companyId: "company-a", userId: "new-user")
        let pending = try ERPPendingCommand(scope: scope, name: "task.start", input: Data(#"{"taskId":"task-a"}"#.utf8), expectedVersion: nil)
        try journal.persist(pending)
        let (model, client, _) = try await fixture(transport, journal: journal)
        let opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await task.value
        XCTAssertFalse(model.mediaClient === client); XCTAssertEqual(model.identity?.actor.userId, "new-user")
        XCTAssertEqual(model.pending, pending); XCTAssertFalse(model.canWrite); XCTAssertFalse(model.recoveryBlocked)
        XCTAssertEqual(try journal.read(scope: scope), pending)
        let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path.contains("/commands/task.start") == true })
    }
    func testJournalBecomingUnavailableWhileMainHandoffWaitsStillPreservesOldAccount() async throws {
        let transport = FederationTransport(), journal = FederationCommandJournal(), gate = FederationGate()
        let (model, client, _) = try await fixture(transport, beforeCommit: { await gate.pause() }, journal: journal)
        let opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        journal.failReads(.recoveryUnavailable)
        await gate.release(); await task.value
        XCTAssertTrue(model.mediaClient === client); XCTAssertEqual(model.identity?.actor.userId, "old-user")
        XCTAssertEqual(model.websitePhase, .failed)
        let current = await client.hasSession(); XCTAssertTrue(current)
    }
    func testPresentationDetachingAfterVerificationRejectsCommitAndPreservesOldAccount() async throws {
        let transport = FederationTransport(), gate = FederationGate()
        let (model, client, _) = try await fixture(transport, beforeCommit: { await gate.pause() })
        let opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        browser.window = nil
        await gate.release(); await task.value
        XCTAssertTrue(model.mediaClient === client); XCTAssertEqual(model.identity?.actor.userId, "old-user")
        XCTAssertEqual(model.websitePhase, .failed); XCTAssertEqual(model.websiteProblem, .presentation)
        let current = await client.hasSession(); XCTAssertTrue(current)
    }
    func testSignOutTapCancelsVerifiedHandoffBeforeItsNetworkTaskCanRun() async throws {
        let transport = FederationTransport(), gate = FederationGate()
        let (model, client, _) = try await fixture(transport, beforeCommit: { await gate.pause() })
        let opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        let logout = model.requestSignOut()
        XCTAssertNil(model.identity); XCTAssertEqual(model.websitePhase, .idle)
        await gate.release(); await task.value; await logout.value
        XCTAssertNil(model.identity); XCTAssertTrue(model.mediaClient === client)
        let calls = await transport.requests().filter { $0.url?.path == "/api/v1/auth/logout" }
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls.first?.value(forHTTPHeaderField: "Cookie"), "knaba_session=" + FederationTransport.oldCookie)
    }
    func testTaskCancellationAtVerifiedMainHandoffPreservesOldAccountWithoutExplicitUICancel() async throws {
        let transport = FederationTransport(), gate = FederationGate()
        let (model, client, _) = try await fixture(transport, beforeCommit: { await gate.pause() })
        let opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        let count = await transport.requests().count
        task.cancel()
        await gate.release(); await task.value
        XCTAssertTrue(model.mediaClient === client); XCTAssertEqual(model.identity?.actor.userId, "old-user")
        XCTAssertEqual(model.websitePhase, .idle); XCTAssertNil(model.websiteProblem)
        let current = await client.hasSession(), after = await transport.requests().count
        XCTAssertTrue(current); XCTAssertEqual(after, count)
    }
    func testSystemCancelPreservesModelClientAndDoesNotSendTokenOrLogout() async throws {
        let transport = FederationTransport(), (model, client, _) = try await fixture(transport), opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        model.cancelWebsiteSignIn(); await task.value
        XCTAssertEqual(model.identity?.actor.userId, "old-user"); XCTAssertEqual(model.websitePhase, .idle)
        let authenticated = await client.hasSession(); XCTAssertTrue(authenticated)
        let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path.hasSuffix("/token") == true || $0.url?.path.hasSuffix("/logout") == true })
    }
    func testLostBodyOffersOnlyExplicitCandidateReadAndPreservesOldIdentityUntilThatRead() async throws {
        let transport = FederationTransport(), (model, _, _) = try await fixture(transport), opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await transport.setToken(.bodyLost); await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await task.value
        XCTAssertEqual(model.websitePhase, .sessionUnknown); XCTAssertEqual(model.identity?.actor.userId, "old-user")
        await model.recoverWebsiteSignIn(); XCTAssertEqual(model.websitePhase, .complete); XCTAssertEqual(model.identity?.actor.userId, "new-user")
        let calls = await transport.requests(); XCTAssertEqual(calls.filter { $0.url?.path.hasSuffix("/token") == true }.count, 1)
    }
    func testCandidate401UsesFederationErrorPathWithoutClearingCurrentSession() async throws {
        let transport = FederationTransport(), (model, client, _) = try await fixture(transport), opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await transport.setCandidate(status: 401); await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await task.value
        XCTAssertEqual(model.websitePhase, .failed); XCTAssertEqual(model.identity?.actor.userId, "old-user")
        let authenticated = await client.hasSession(); XCTAssertTrue(authenticated)
    }
    func testCancelDuringDiscoveryCannotRestoreAuthorityOptionsOrClearOldAccount() async throws {
        let transport = FederationTransport(), (model, _, _) = try await fixture(transport), gate = FederationGate()
        await transport.gate("/api/v1/auth/federation/config", gate)
        let prepare = Task { await model.prepareWebsiteSignIn() }; await gate.entered()
        model.cancelWebsiteSignIn(); await gate.release(); await prepare.value
        XCTAssertTrue(model.websiteAuthorities.isEmpty); XCTAssertEqual(model.websitePhase, .idle); XCTAssertEqual(model.identity?.actor.userId, "old-user")
    }
    func testSameUserAuthorityRefreshCancelsBrowserAttemptAndRejectsLatePrivateResult() async throws {
        let transport = FederationTransport(), (model, _, _) = try await fixture(transport), opened = expectation(description: "browser"), window = UIWindow(), gate = FederationGate()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn(); await transport.gate("candidate-me", gate)
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        session?.completion(try await transport.callback(), nil); await gate.entered()
        await transport.changeOldAuthority(warehouses: ["warehouse-new"]); await model.reloadSession()
        await gate.release(); await task.value
        XCTAssertEqual(model.identity?.actor.userId, "old-user"); XCTAssertEqual(model.websitePhase, .idle)
    }
    func testPasswordLoginDuringBrowserCancelsItAndLateCallbackCannotSendToken() async throws {
        let transport = FederationTransport(), (model, _, _) = try await fixture(transport), opened = expectation(description: "browser"), window = UIWindow()
        var session: FederationFakeBrowser?
        let browser = ERPFederationAuthSession(factory: { _, _, _, done in session = FederationFakeBrowser(completion: done); opened.fulfill(); return session! }, usableWindow: { _ in true })
        browser.window = window; await model.prepareWebsiteSignIn()
        let task = Task { await model.openWebsiteSignIn(using: browser) }; await fulfillment(of: [opened], timeout: 2)
        model.password = "Later password"; await model.signIn(); session?.completion(try await transport.callback(), nil); await task.value
        XCTAssertEqual(model.identity?.actor.userId, "old-user"); XCTAssertEqual(model.websitePhase, .idle)
        let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path.hasSuffix("/token") == true })
    }
    func testDemoOrProductionHealthFailsBeforeAnyFederationMutation() async throws {
        for mode in ["DEMO", "PRODUCTION"] {
            let transport = FederationTransport(), (model, client, _) = try await fixture(transport)
            await transport.setHealthMode(mode); await model.prepareWebsiteSignIn()
            XCTAssertEqual(model.websitePhase, .failed); XCTAssertEqual(model.websiteProblem, .unavailable)
            XCTAssertEqual(model.identity?.actor.userId, "old-user"); let authenticated = await client.hasSession(); XCTAssertTrue(authenticated)
            let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path.contains("/auth/federation/") == true })
        }
    }
}
#endif
