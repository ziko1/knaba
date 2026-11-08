import XCTest
@testable import KNABADE

#if DEBUG && KNABA_FEDERATION_TEST
@MainActor final class ERPFederationTransportTests: XCTestCase {
    private func fixture(_ transport: FederationTransport = FederationTransport(), commands: MediaCommandJournal = MediaCommandJournal(),
                         media: MediaMemoryJournal = MediaMemoryJournal()) async throws -> ERPConsoleClient {
        let clock = transport.clock
        let client = ERPConsoleClient(transport: transport, journal: commands, mediaJournal: media,
                                      federationNow: { clock.now() }, federationUptime: { clock.uptime() })
        try await client.configure(FederationTransport.origin)
        _ = try await client.login(email: "synthetic@example.test", password: "Synthetic password")
        return client
    }
    private func begin(_ client: ERPConsoleClient) async throws -> ERPFederationTicket {
        let ticket = ERPFederationTicket(); _ = try await client.prepareFederation(ticket)
        _ = try await client.startFederation(ticket, authorityID: "site-a"); return ticket
    }
    private func failure<T>(_ expected: ERPFederationFailure, _ operation: () async throws -> T, file: StaticString = #filePath, line: UInt = #line) async {
        do { _ = try await operation(); XCTFail("Expected federation rejection", file: file, line: line) }
        catch { XCTAssertEqual(error as? ERPFederationFailure, expected, file: file, line: line) }
    }
    private func oldAccount(_ client: ERPConsoleClient, file: StaticString = #filePath, line: UInt = #line) async {
        let identity = await client.identity, session = await client.hasSession()
        XCTAssertEqual(identity?.actor.userId, "old-user", file: file, line: line); XCTAssertTrue(session, file: file, line: line)
    }
    private func install(_ verified: ERPFederationVerified) throws -> (ERPConsoleClient, ERPFederationAdoption) {
        var value: (ERPConsoleClient, ERPFederationAdoption)?
        try verified.commit { value = ($0, $1) }
        return try XCTUnwrap(value)
    }
    func testFreshCandidateUsesNoOldCookieAndAdoptsOnlyAfterCurrentMe() async throws {
        let transport = FederationTransport(), client = try await fixture(transport)
        let old = await client.authorityState(), oldMedia = try await client.mediaAuthority(), mediaTicket = ERPMediaTicket(authority: oldMedia)
        let ticket = try await begin(client), callback = try await transport.callback()
        let verified = try await client.redeemFederation(ticket, callback: callback)
        await oldAccount(client); XCTAssertFalse(ticket.committed); XCTAssertNoThrow(try mediaTicket.check())
        let (next, result) = try install(verified)
        XCTAssertEqual(result.identity.actor.userId, "new-user"); XCTAssertGreaterThan(result.revision, old.revision)
        XCTAssertTrue(ticket.committed); XCTAssertThrowsError(try mediaTicket.check())
        let previousSession = await client.hasSession(), nextSession = await next.hasSession()
        XCTAssertFalse(previousSession); XCTAssertTrue(nextSession)
        let calls = await transport.requests()
        for request in calls.filter({ $0.url?.path.contains("/auth/federation/") == true }) {
            XCTAssertNil(request.value(forHTTPHeaderField: "Cookie")); XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            XCTAssertNil(request.value(forHTTPHeaderField: "X-CSRF-Token"))
        }
        let me = try XCTUnwrap(calls.last(where: { $0.url?.path == "/api/v1/me" }))
        XCTAssertEqual(me.value(forHTTPHeaderField: "Cookie"), "knaba_session=" + FederationTransport.newCookie)
        let token = try XCTUnwrap(calls.first(where: { $0.url?.path.hasSuffix("/token") == true }))
        let body = try JSONSerialization.jsonObject(with: token.httpBody!) as! [String: String]
        XCTAssertEqual(Set(body.keys), Set(["grantType", "clientId", "redirectUri", "code", "codeVerifier"]))
        XCTAssertEqual(token.value(forHTTPHeaderField: "Origin"), FederationTransport.origin)
        XCTAssertFalse(token.url!.absoluteString.contains(body["codeVerifier"]!))
    }
    func testLostBodyUsesOnlyCapturedCandidateOnExplicitRecoveryWithoutTokenReplay() async throws {
        let transport = FederationTransport(), client = try await fixture(transport)
        await transport.setToken(.bodyLost)
        let ticket = try await begin(client), callback = try await transport.callback()
        await failure(.sessionUnknown) { try await client.redeemFederation(ticket, callback: callback) }
        await oldAccount(client)
        var calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path == "/api/v1/me" })
        let verified = try await client.recoverFederation(ticket)
        await oldAccount(client); XCTAssertFalse(ticket.committed)
        let (_, result) = try install(verified); XCTAssertEqual(result.identity.actor.userId, "new-user")
        calls = await transport.requests()
        XCTAssertEqual(calls.filter { $0.url?.path.hasSuffix("/token") == true }.count, 1)
        XCTAssertEqual(calls.last?.value(forHTTPHeaderField: "Cookie"), "knaba_session=" + FederationTransport.newCookie)
    }
    func testMissingFreshCookieOrErrorHeadersCannotRecoverWithOldSession() async throws {
        for mode in [FederationTransport.TokenMode.noCookie, .beforeHeaders, .oldCookie, .errorCookie] {
            let transport = FederationTransport(), client = try await fixture(transport)
            await transport.setToken(mode)
            let ticket = try await begin(client), callback = try await transport.callback()
            await failure(.restartRequired) { try await client.redeemFederation(ticket, callback: callback) }
            await failure(.restartRequired) { try await client.recoverFederation(ticket) }
            await oldAccount(client)
            let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path == "/api/v1/me" })
        }
    }
    func testCandidate401403503OrMalformedProfileNeverResetsOldAccount() async throws {
        for status in [401, 403, 503] {
            let transport = FederationTransport(), client = try await fixture(transport)
            await transport.setToken(.bodyLost); await transport.setCandidate(status: status)
            let ticket = try await begin(client), callback = try await transport.callback()
            await failure(.sessionUnknown) { try await client.redeemFederation(ticket, callback: callback) }
            do { _ = try await client.recoverFederation(ticket); XCTFail("Candidate must not be adopted") } catch { }
            await oldAccount(client)
        }
        for mode in [FederationTransport.TokenMode.wrongMode, .malformedBody] {
            let transport = FederationTransport(), client = try await fixture(transport)
            await transport.setToken(mode)
            let ticket = try await begin(client), callback = try await transport.callback()
            do { _ = try await client.redeemFederation(ticket, callback: callback); XCTFail("Invalid candidate profile") } catch { }
            await oldAccount(client)
        }
    }
    func testCandidateMeMustMatchTokenUserCompanyAndCsrf() async throws {
        for change in 0..<3 {
            let transport = FederationTransport(), client = try await fixture(transport)
            await transport.setCandidate(user: change == 0 ? "foreign-user" : "new-user",
                                         csrf: change == 1 ? FederationTransport.oldCSRF : FederationTransport.newCSRF,
                                         company: change == 2 ? "foreign-company" : "company-a")
            let ticket = try await begin(client), callback = try await transport.callback()
            await failure(.restartRequired) { try await client.redeemFederation(ticket, callback: callback) }
            await oldAccount(client)
        }
    }
    func testUnknownStartRetryKeepsExactKeyBodyStateAndChallenge() async throws {
        let transport = FederationTransport(), client = try await fixture(transport), ticket = ERPFederationTicket()
        _ = try await client.prepareFederation(ticket); await transport.failStartOnce()
        await failure(.startUnknown) { try await client.startFederation(ticket, authorityID: "site-a") }
        _ = try await client.startFederation(ticket, authorityID: "site-a")
        let calls = await transport.requests().filter { $0.url?.path.hasSuffix("/start") == true }
        XCTAssertEqual(calls.count, 2); XCTAssertEqual(calls[0].httpBody, calls[1].httpBody)
        XCTAssertEqual(calls[0].value(forHTTPHeaderField: "Idempotency-Key"), calls[1].value(forHTTPHeaderField: "Idempotency-Key"))
        let body = try JSONSerialization.jsonObject(with: calls[0].httpBody!) as! [String: String]
        XCTAssertEqual(Set(body.keys), Set(["authorityId", "clientId", "redirectUri", "state", "codeChallenge", "codeChallengeMethod"]))
        XCTAssertEqual(body["codeChallengeMethod"], "S256"); XCTAssertEqual(body["state"]?.count, 43); XCTAssertEqual(body["codeChallenge"]?.count, 43)
    }
    func testDuplicateCallbackCannotSendSecondTokenWhileFirstRequestIsSuspended() async throws {
        let transport = FederationTransport(), client = try await fixture(transport), gate = FederationGate()
        let ticket = try await begin(client), callback = try await transport.callback()
        await transport.gate("/api/v1/auth/federation/token", gate)
        let first = Task { try await client.redeemFederation(ticket, callback: callback) }; await gate.entered()
        await failure(.restartRequired) { try await client.redeemFederation(ticket, callback: callback) }
        await gate.release(); _ = try await first.value
        let calls = await transport.requests(); XCTAssertEqual(calls.filter { $0.url?.path.hasSuffix("/token") == true }.count, 1)
    }
    func testCancelDuringTokenOrCandidateMeDiscardsLateResponseWithoutChangingOldAccount() async throws {
        for path in ["/api/v1/auth/federation/token", "candidate-me"] {
            let transport = FederationTransport(), client = try await fixture(transport), gate = FederationGate()
            let ticket = try await begin(client), callback = try await transport.callback(); await transport.gate(path, gate)
            let pending = Task { try await client.redeemFederation(ticket, callback: callback) }; await gate.entered()
            ticket.cancel(); await client.cancelFederation(ticket); await gate.release()
            do { _ = try await pending.value; XCTFail("Cancelled result must not adopt") } catch { }
            await oldAccount(client)
        }
    }
    func testLogoutAndOriginChangeFenceLateCandidateWithoutReopeningSession() async throws {
        for logout in [true, false] {
            let transport = FederationTransport(), client = try await fixture(transport), gate = FederationGate()
            let ticket = try await begin(client), callback = try await transport.callback(); await transport.gate("candidate-me", gate)
            let pending = Task { try await client.redeemFederation(ticket, callback: callback) }; await gate.entered()
            if logout { await client.logout() } else { try await client.configure("https://other.example.test") }
            await gate.release(); do { _ = try await pending.value; XCTFail("Stale adoption") } catch { }
            let hasSession = await client.hasSession(); XCTAssertFalse(hasSession)
        }
    }
    func testSameUserWarehouseCredentialCsrfRoleAndPermissionRefreshFenceTheOriginalAttempt() async throws {
        for change in 0..<5 {
            let transport = FederationTransport(), client = try await fixture(transport), gate = FederationGate()
            let ticket = try await begin(client), callback = try await transport.callback(); await transport.gate("candidate-me", gate)
            let pending = Task { try await client.redeemFederation(ticket, callback: callback) }; await gate.entered()
            await transport.changeOldAuthority(warehouses: change == 0 ? ["warehouse-new"] : [], credentials: change == 1 ? 2 : 1,
                                               csrf: change == 2 ? String(repeating: "z", count: 43) : FederationTransport.oldCSRF,
                                               roles: change == 3 ? ["TECH_MANAGER"] : ["EMPLOYEE"],
                                               permissions: change == 4 ? ["task.read"] : ["media.upload", "media.read", "task.read", "task.work"])
            _ = try await client.refresh(); await gate.release()
            do { _ = try await pending.value; XCTFail("Same actor authority changed") } catch { }
            await oldAccount(client)
        }
    }
    func testLaterPasswordLoginCannotBeOverwrittenByFederationCandidate() async throws {
        let transport = FederationTransport(), client = try await fixture(transport), gate = FederationGate()
        let ticket = try await begin(client), callback = try await transport.callback(); await transport.gate("candidate-me", gate)
        let pending = Task { try await client.redeemFederation(ticket, callback: callback) }; await gate.entered()
        _ = try await client.login(email: "synthetic@example.test", password: "Later password")
        await gate.release(); do { _ = try await pending.value; XCTFail("Must preserve later login") } catch { }
        await oldAccount(client)
    }
    func testExpiredRecoveryCannotReadOldMeOrExtendMissingMeExpiry() async throws {
        let clock = FederationClock(), transport = FederationTransport(clock: clock), client = try await fixture(transport)
        await transport.setToken(.bodyLost)
        let ticket = try await begin(client), callback = try await transport.callback()
        await failure(.sessionUnknown) { try await client.redeemFederation(ticket, callback: callback) }
        clock.advance(121)
        await failure(.expired) { try await client.recoverFederation(ticket) }; await oldAccount(client)
        let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path == "/api/v1/me" })
    }
    func testWallClockRollbackCannotExtendMonotonicCandidateRecoveryWindow() async throws {
        let clock = FederationClock(), transport = FederationTransport(clock: clock), client = try await fixture(transport)
        await transport.setToken(.bodyLost)
        let ticket = try await begin(client), callback = try await transport.callback()
        await failure(.sessionUnknown) { try await client.redeemFederation(ticket, callback: callback) }
        clock.advance(121); clock.moveWallClockBack(3600)
        await failure(.expired) { try await client.recoverFederation(ticket) }; await oldAccount(client)
        let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path == "/api/v1/me" })
    }
    func testMalformedFullTokenProfileCannotBeUpgradedByLaterCandidateRecovery() async throws {
        let transport = FederationTransport(), client = try await fixture(transport)
        await transport.setToken(.wrongMode)
        let ticket = try await begin(client), callback = try await transport.callback()
        await failure(.invalidResponse) { try await client.redeemFederation(ticket, callback: callback) }
        await failure(.restartRequired) { try await client.recoverFederation(ticket) }; await oldAccount(client)
        let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path == "/api/v1/me" })
    }
    func testUnknownCommandsAndMediaDescriptorsSurviveBothFailedAndSuccessfulSwitch() async throws {
        let transport = FederationTransport(), commands = MediaCommandJournal(), media = MediaMemoryJournal()
        let client = try await fixture(transport, commands: commands, media: media), authority = try await client.mediaAuthority()
        let command = try ERPPendingCommand(scope: authority.scope, name: "task.start", input: Data(#"{"taskId":"task-a"}"#.utf8), expectedVersion: nil)
        try commands.persist(command)
        let descriptor = try ERPMediaPending(file: MediaFixtures.pdf(), authority: authority, input: MediaFixtures.input(), redactionConfirmed: false)
        try media.persist(descriptor)
        let cancelled = try await begin(client); cancelled.cancel(); await client.cancelFederation(cancelled)
        XCTAssertEqual(try commands.read(scope: authority.scope), command); XCTAssertEqual(try media.read(scope: authority.scope), descriptor)
        let ticket = try await begin(client), callback = try await transport.callback()
        let verified = try await client.redeemFederation(ticket, callback: callback), (next, _) = try install(verified)
        XCTAssertEqual(try commands.read(scope: authority.scope), command); XCTAssertEqual(try media.read(scope: authority.scope), descriptor)
        let newPending = try await next.pendingCommand(); XCTAssertNil(newPending)
    }
    func testVerifiedHandoffIsCancelledBySameUserAuthorityRefreshBeforeCommit() async throws {
        let transport = FederationTransport(), client = try await fixture(transport)
        let ticket = try await begin(client), callback = try await transport.callback()
        let verified = try await client.redeemFederation(ticket, callback: callback)
        await transport.changeOldAuthority(warehouses: ["warehouse-after-verification"]); _ = try await client.refresh()
        XCTAssertThrowsError(try install(verified)); XCTAssertFalse(ticket.committed)
        await oldAccount(client)
    }
    func testVerifiedHandoffCannotOverwriteLaterPasswordLogin() async throws {
        let transport = FederationTransport(), client = try await fixture(transport)
        let ticket = try await begin(client), callback = try await transport.callback()
        let verified = try await client.redeemFederation(ticket, callback: callback)
        _ = try await client.login(email: "synthetic@example.test", password: "Later password")
        XCTAssertThrowsError(try install(verified)); XCTAssertFalse(ticket.committed)
        await oldAccount(client)
    }
    func testVerifiedHandoffDeadlineAndCancelAreRecheckedWithoutAnySecondNetworkCall() async throws {
        for cancel in [false, true] {
            let transport = FederationTransport(), client = try await fixture(transport)
            let ticket = try await begin(client), callback = try await transport.callback()
            let verified = try await client.redeemFederation(ticket, callback: callback)
            let count = await transport.requests().count
            if cancel { ticket.cancel() } else { transport.clock.advance(121) }
            XCTAssertThrowsError(try install(verified)); XCTAssertFalse(ticket.committed)
            await oldAccount(client)
            let after = await transport.requests().count; XCTAssertEqual(after, count)
        }
    }
    func testRetiredClientAndMediaFenceCannotBeReopenedByLateResetOrPasswordLogin() async throws {
        let transport = FederationTransport(), client = try await fixture(transport)
        let mediaTicket = ERPMediaTicket(authority: try await client.mediaAuthority())
        let ticket = try await begin(client), callback = try await transport.callback()
        let verified = try await client.redeemFederation(ticket, callback: callback), (next, _) = try install(verified)
        let count = await transport.requests().count
        await client.forget()
        do { try await client.configure(FederationTransport.origin); XCTFail("A retired client is not reusable") } catch { }
        do { _ = try await client.login(email: "synthetic@example.test", password: "Late password"); XCTFail("No old actor login") } catch { }
        XCTAssertThrowsError(try mediaTicket.check())
        let previous = await client.identity, current = await next.identity, after = await transport.requests().count
        XCTAssertNil(previous); XCTAssertEqual(current?.actor.userId, "new-user"); XCTAssertEqual(after, count)
    }
    func testChangedJournalBetweenVerificationAndMainCommitRequiresPreparationAgain() async throws {
        let transport = FederationTransport(), journal = MediaCommandJournal()
        let client = try await fixture(transport, commands: journal)
        let ticket = try await begin(client), callback = try await transport.callback()
        let verified = try await client.redeemFederation(ticket, callback: callback)
        let scope = try ERPPendingCommand.scope(origin: URL(string: FederationTransport.origin)!, companyId: "company-a", userId: "new-user")
        let pending = try ERPPendingCommand(scope: scope, name: "task.start", input: Data(#"{"taskId":"task-a"}"#.utf8), expectedVersion: nil)
        try journal.persist(pending)
        XCTAssertThrowsError(try install(verified)); XCTAssertFalse(ticket.committed)
        await oldAccount(client); XCTAssertEqual(try journal.read(scope: scope), pending)
    }
    func testCallbackFromCancelledAttemptCannotRedeemForNewAttempt() async throws {
        let transport = FederationTransport(), client = try await fixture(transport)
        let first = try await begin(client), oldCallback = try await transport.callback()
        first.cancel(); await client.cancelFederation(first)
        let second = try await begin(client)
        await failure(.invalidCallback) { try await client.redeemFederation(second, callback: oldCallback) }
        await oldAccount(client)
        let calls = await transport.requests(); XCTAssertFalse(calls.contains { $0.url?.path.hasSuffix("/token") == true })
    }
}
#endif
