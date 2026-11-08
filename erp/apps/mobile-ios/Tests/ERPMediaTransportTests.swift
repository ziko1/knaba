import XCTest
@testable import KNABADE

@MainActor final class ERPMediaTransportTests: XCTestCase {
    private func failure<T>(_ expected: ERPFailure, _ action: () async throws -> T, file: StaticString = #filePath, line: UInt = #line) async {
        do { _ = try await action(); XCTFail("Expected rejection", file: file, line: line) }
        catch { XCTAssertEqual(error as? ERPFailure, expected, file: file, line: line) }
    }
    private func mediaFailure<T>(_ expected: ERPMediaFailure, _ action: () async throws -> T, file: StaticString = #filePath, line: UInt = #line) async {
        do { _ = try await action(); XCTFail("Expected media rejection", file: file, line: line) }
        catch { XCTAssertEqual(error as? ERPMediaFailure, expected, file: file, line: line) }
    }
    private func fixture(_ transport: MediaTransport = MediaTransport(), journal: MediaMemoryJournal = MediaMemoryJournal(),
                         commands: MediaCommandJournal = MediaCommandJournal()) async throws -> (ERPConsoleClient, ERPMediaTicket, ERPMediaFile, ERPMediaPending) {
        let client = ERPConsoleClient(transport: transport, journal: commands, mediaJournal: journal)
        try await mediaSignIn(client)
        let ticket = try await mediaTicket(client), file = try MediaFixtures.pdf()
        let pending = try ERPMediaPending(file: file, authority: ticket.authority, input: MediaFixtures.input(), redactionConfirmed: false)
        return (client, ticket, file, pending)
    }
    func testTwoReceiptsUseDistinctStableKeysAndCurrentTaskWithoutSiteRead() async throws {
        let journal = MediaMemoryJournal(), commands = MediaCommandJournal()
        let scope = try ERPPendingCommand.scope(origin: URL(string: MediaFixtures.origin)!, companyId: MediaFixtures.company, userId: "user-a")
        let transport = MediaTransport { request in
            let media = try? journal.read(scope: scope)
            XCTAssertNotNil(media, "Metadata must exist before either mutation")
            if request.url?.path == "/api/v1/media/uploads" { XCTAssertEqual(media?.uploadKey, request.value(forHTTPHeaderField: "Idempotency-Key")) }
            if request.url?.path == "/api/v1/commands/media.register" {
                XCTAssertEqual(try? commands.read(scope: scope)?.body, request.httpBody)
            }
        }
        let (client, ticket, file, pending) = try await fixture(transport, journal: journal, commands: commands)
        let uploaded = try await client.uploadMedia(file, pending: pending, ticket: ticket)
        XCTAssertEqual(uploaded.pending.phase, .uploaded); XCTAssertEqual(uploaded.receipt.byteSize, file.bytes.count)
        let registered = try await client.registerMedia(uploaded.pending, ticket: ticket)
        XCTAssertEqual(registered.pending.phase, .registered); XCTAssertEqual(registered.asset?.id, "asset-a")
        XCTAssertFalse(registered.recoveryWarning)
        XCTAssertNil(try journal.read(scope: scope)); XCTAssertNil(try commands.read(scope: scope))
        let requests = await transport.requests()
        XCTAssertFalse(requests.contains { $0.url?.path == "/api/v1/entities/site" }, "A scoped task carries its siteId")
        let mutations = requests.filter { $0.httpMethod == "POST" && $0.url?.path != "/api/v1/auth/login" }
        XCTAssertEqual(mutations.count, 2)
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: mutations[1].httpBody!) as? [String: Any])
        XCTAssertEqual(Set(body.keys), Set(["input", "idempotency_key"]))
        XCTAssertEqual(body["idempotency_key"] as? String, pending.registerKey)
        XCTAssertNotEqual(pending.registerKey, mutations[0].value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertEqual((body["input"] as? [String: Any])?["taskId"] as? String, "task-a")
    }
    func testUnknownUploadAfterProcessLossNeedsExactFileAndReplaysExactBody() async throws {
        let transport = MediaTransport(), journal = MediaMemoryJournal(), commands = MediaCommandJournal()
        await transport.setUploadErrors([.timedOut])
        let (first, ticket, file, pending) = try await fixture(transport, journal: journal, commands: commands)
        do { _ = try await first.uploadMedia(file, pending: pending, ticket: ticket); XCTFail("Timeout expected") } catch { XCTAssertTrue(error is URLError) }
        let restarted = ERPConsoleClient(transport: transport, journal: commands, mediaJournal: journal)
        try await mediaSignIn(restarted)
        let restoredOptional = try await restarted.pendingMedia(), newTicket = try await mediaTicket(restarted)
        let restored = try XCTUnwrap(restoredOptional)
        await mediaFailure(.differentFile) { try await restarted.uploadMedia(MediaFixtures.pdf(31), pending: restored, ticket: newTicket) }
        let renamed = try ERPMediaFile(bytes: file.bytes, fileName: "another-name.pdf")
        _ = try await restarted.uploadMedia(renamed, pending: restored, ticket: newTicket)
        let uploads = await transport.requests().filter { $0.url?.path == "/api/v1/media/uploads" }
        XCTAssertEqual(uploads.count, 2)
        XCTAssertEqual(uploads[0].httpBody, uploads[1].httpBody)
        XCTAssertEqual(uploads[0].value(forHTTPHeaderField: "Idempotency-Key"), uploads[1].value(forHTTPHeaderField: "Idempotency-Key"))
    }
    func testUnknownRegistrationDoesNotReuploadAndUsesOriginalCommandJournal() async throws {
        let transport = MediaTransport(), journal = MediaMemoryJournal(), commands = MediaCommandJournal()
        let (client, ticket, file, pending) = try await fixture(transport, journal: journal, commands: commands)
        let upload = try await client.uploadMedia(file, pending: pending, ticket: ticket)
        await transport.setRegisterErrors([.networkConnectionLost])
        do { _ = try await client.registerMedia(upload.pending, ticket: ticket); XCTFail("Lost response expected") } catch { XCTAssertTrue(error is URLError) }
        let restarted = ERPConsoleClient(transport: transport, journal: commands, mediaJournal: journal)
        try await mediaSignIn(restarted)
        let restoredOptional = try await restarted.pendingMedia(), newTicket = try await mediaTicket(restarted)
        let restored = try XCTUnwrap(restoredOptional)
        XCTAssertEqual(restored.phase, .registerPending)
        let response = try await restarted.registerMedia(restored, ticket: newTicket)
        XCTAssertEqual(response.pending.assetId, "asset-a")
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/media/uploads" }.count, 1)
        let registrations = requests.filter { $0.url?.path == "/api/v1/commands/media.register" }
        XCTAssertEqual(registrations.count, 2); XCTAssertEqual(registrations[0].httpBody, registrations[1].httpBody)
    }
    func testPersistenceFailureBeforeUploadMakesNoMutation() async throws {
        let transport = MediaTransport(), journal = MediaMemoryJournal()
        let (client, ticket, file, pending) = try await fixture(transport, journal: journal)
        journal.fail(all: true)
        await failure(.recoveryUnavailable) { try await client.uploadMedia(file, pending: pending, ticket: ticket) }
        let requests = await transport.requests()
        XCTAssertFalse(requests.contains { $0.url?.path == "/api/v1/media/uploads" })
    }
    func testUploadAckSurvivesMetadataWriteFailureAndNeverReuploadsKnownID() async throws {
        let transport = MediaTransport(), journal = MediaMemoryJournal()
        let (client, ticket, file, pending) = try await fixture(transport, journal: journal)
        journal.fail(phase: .uploaded)
        let result = try await client.uploadMedia(file, pending: pending, ticket: ticket)
        XCTAssertTrue(result.recoveryWarning); XCTAssertNotNil(result.pending.uploadId)
        await mediaFailure(.pendingMedia) { try await client.uploadMedia(file, pending: pending, ticket: ticket) }
        journal.fail()
        _ = try await client.registerMedia(result.pending, ticket: ticket)
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/media/uploads" }.count, 1)
    }
    func testRegistrationAckSurvivesCleanupFailureAndRetryIsOnlyLocal() async throws {
        let transport = MediaTransport(), journal = MediaMemoryJournal(), commands = MediaCommandJournal()
        let (client, ticket, file, pending) = try await fixture(transport, journal: journal, commands: commands)
        let upload = try await client.uploadMedia(file, pending: pending, ticket: ticket)
        commands.failRemoval(true)
        let result = try await client.registerMedia(upload.pending, ticket: ticket)
        XCTAssertTrue(result.recoveryWarning); XCTAssertEqual(result.pending.phase, .registered)
        commands.failRemoval(false)
        let cleaned = try await client.registerMedia(result.pending, ticket: ticket)
        XCTAssertFalse(cleaned.recoveryWarning)
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/commands/media.register" }.count, 1)
    }
    func testDenialAndRateLimitRetainKeyInsteadOfCreatingNewUpload() async throws {
        for status in [403, 404, 409, 429] {
            let transport = MediaTransport(), journal = MediaMemoryJournal()
            let (client, ticket, file, pending) = try await fixture(transport, journal: journal)
            await transport.setUploadStatus(status)
            do { _ = try await client.uploadMedia(file, pending: pending, ticket: ticket); XCTFail("HTTP rejection expected") } catch { XCTAssertNotNil(error as? ERPFailure) }
            XCTAssertEqual(try journal.read(scope: pending.scope)?.uploadKey, pending.uploadKey)
            let another = try ERPMediaPending(file: file, authority: ticket.authority, input: pending.input, redactionConfirmed: false)
            await mediaFailure(.pendingMedia) { try await client.uploadMedia(file, pending: another, ticket: ticket) }
            let requests = await transport.requests()
            XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/media/uploads" }.count, 1)
        }
    }
    func testUploadReceiptMustMatchExactOriginalByteCount() async throws {
        let transport = MediaTransport()
        let (client, ticket, file, pending) = try await fixture(transport)
        await transport.setUploadByteDelta(-1)
        await mediaFailure(.receiptInvalid) { try await client.uploadMedia(file, pending: pending, ticket: ticket) }
        let saved = try await client.pendingMedia()
        XCTAssertEqual(saved?.phase, .uploadPending); XCTAssertNil(saved?.uploadId)
    }
    func testRegistrationReceiptMustMatchCompanyAndSelectedContext() async throws {
        for changed in [MediaFixtures.asset(company: "company-other"), MediaFixtures.asset(site: "site-other"), MediaFixtures.asset(task: "task-other")] {
            let transport = MediaTransport()
            let (client, ticket, file, pending) = try await fixture(transport)
            let upload = try await client.uploadMedia(file, pending: pending, ticket: ticket)
            await transport.setRegisterOverride(MediaFixtures.json(changed))
            await mediaFailure(.receiptInvalid) { try await client.registerMedia(upload.pending, ticket: ticket) }
            let saved = try await client.pendingMedia()
            XCTAssertEqual(saved?.phase, .registerPending); XCTAssertNil(saved?.assetId)
        }
    }
    func testCancelWhilePreflightIsHeldPreventsAnyUpload() async throws {
        let transport = MediaTransport()
        let (client, ticket, file, pending) = try await fixture(transport)
        let entered = expectation(description: "fresh task read")
        await transport.hold("/api/v1/entities/task", signal: entered)
        let work = Task { try await client.uploadMedia(file, pending: pending, ticket: ticket) }
        await fulfillment(of: [entered], timeout: 3)
        ticket.cancel(); await transport.release()
        do { _ = try await work.value; XCTFail("Cancelled context must not upload") } catch { XCTAssertTrue(error is CancellationError) }
        let requests = await transport.requests()
        XCTAssertFalse(requests.contains { $0.url?.path == "/api/v1/media/uploads" })
    }
    func testCancelAfterSendRetainsUnknownAndLateResponseCannotAcknowledge() async throws {
        let transport = MediaTransport(), journal = MediaMemoryJournal()
        let (client, ticket, file, pending) = try await fixture(transport, journal: journal)
        let entered = expectation(description: "upload sent")
        await transport.hold("/api/v1/media/uploads", signal: entered)
        let work = Task { try await client.uploadMedia(file, pending: pending, ticket: ticket) }
        await fulfillment(of: [entered], timeout: 3)
        ticket.cancel(); await transport.release()
        do { _ = try await work.value; XCTFail("Late ACK must not restore old screen") } catch { XCTAssertTrue(error is CancellationError) }
        XCTAssertEqual(try journal.read(scope: pending.scope)?.phase, .uploadPending)
        let hasSession = await client.hasSession()
        XCTAssertTrue(hasSession, "Media cancellation is not account logout")
    }
    func testDoubleTapCannotSendSecondMutation() async throws {
        let transport = MediaTransport()
        let (client, ticket, file, pending) = try await fixture(transport)
        let entered = expectation(description: "first upload")
        await transport.hold("/api/v1/media/uploads", signal: entered)
        let work = Task { try await client.uploadMedia(file, pending: pending, ticket: ticket) }
        await fulfillment(of: [entered], timeout: 3)
        await failure(.commandInFlight) { try await client.uploadMedia(file, pending: pending, ticket: ticket) }
        await transport.release(); _ = try await work.value
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/media/uploads" }.count, 1)
    }
    func testChangedPermissionOrHiddenWarehouseAuthorityDeniesRecovery() async throws {
        for changed in [MediaFixtures.identity(permissions: ["task.read"]), MediaFixtures.identity(warehouses: ["warehouse-other"])] {
            let transport = MediaTransport(), journal = MediaMemoryJournal()
            let (client, ticket, file, pending) = try await fixture(transport, journal: journal)
            await transport.setUploadErrors([.timedOut])
            do { _ = try await client.uploadMedia(file, pending: pending, ticket: ticket) } catch { }
            await transport.setIdentity(changed)
            _ = try await client.refresh()
            await mediaFailure(.recoveryMismatch) { try await client.pendingMedia() }
            XCTAssertThrowsError(try ticket.check()) { XCTAssertEqual($0 as? ERPFailure, .accessChanged) }
        }
    }
    func testLogoutAndNewOriginInvalidatePickerExportTicketSynchronously() async throws {
        let transport = MediaTransport()
        let (client, ticket, _, _) = try await fixture(transport)
        await client.logout()
        XCTAssertThrowsError(try ticket.check()) { XCTAssertEqual($0 as? ERPFailure, .accessChanged) }
        try await mediaSignIn(client)
        let newer = try await mediaTicket(client)
        try await client.configure("https://other.example.test")
        XCTAssertThrowsError(try newer.check()) { XCTAssertEqual($0 as? ERPFailure, .accessChanged) }
    }
    func testDownloadUsesCurrentScopedAssetAndOnlyEncodedOwnOriginClientCopy() async throws {
        let transport = MediaTransport()
        let (client, ticket, _, _) = try await fixture(transport)
        let asset = try MediaFixtures.item(MediaFixtures.asset(id: "asset/../% unusual"))
        await transport.setGallery(MediaFixtures.page([MediaFixtures.asset(id: asset.id)]))
        let copy = try await client.downloadMedia(asset, ticket: ticket)
        XCTAssertEqual(copy.assetId, asset.id); XCTAssertEqual(copy.mimeType, "application/pdf")
        let requests = await transport.requests()
        let request = try XCTUnwrap(requests.last)
        XCTAssertEqual(request.url?.host, "erp.example.test")
        XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.percentEncodedPath,
                       "/api/v1/media/\(try ERPMediaPolicy.component(asset.id))/file")
        XCTAssertEqual(request.url?.query, "copy=client")
        XCTAssertNotNil(request.value(forHTTPHeaderField: "Cookie")); XCTAssertNil(request.url?.user)
    }
    func testDownloadDeniesChangedAssetVersionWrongOriginMIMEAndCumulativeOversize() async throws {
        let asset = try MediaFixtures.item(MediaFixtures.asset())
        let transport = MediaTransport()
        let (client, ticket, _, _) = try await fixture(transport)
        await transport.setGallery(MediaFixtures.page([MediaFixtures.asset(version: 2)]))
        await mediaFailure(.contextChanged) { try await client.downloadMedia(asset, ticket: ticket) }
        await transport.setGallery(MediaFixtures.page([MediaFixtures.asset()]))
        await transport.setBinary(Data("%PDF-1.7\n".utf8), mime: "application/pdf", url: URL(string: "https://other.example.test/file")!)
        await failure(.invalidResponse) { try await client.downloadMedia(asset, ticket: ticket) }
        await transport.setBinary(Data("<html>".utf8), mime: "text/html")
        await mediaFailure(.unsupportedType) { try await client.downloadMedia(asset, ticket: ticket) }
        await transport.setBinary(Data(repeating: 65, count: ERPMediaLimits.download + 1), mime: "application/pdf")
        await failure(.tooLarge) { try await client.downloadMedia(asset, ticket: ticket) }
    }
    func testMediaBodyAboveNormalCapDoesNotIncreaseNormalCommandLimit() async throws {
        let transport = MediaTransport()
        let (client, ticket, _, _) = try await fixture(transport)
        let file = try MediaFixtures.pdf(100_000)
        let pending = try ERPMediaPending(file: file, authority: ticket.authority, input: MediaFixtures.input(), redactionConfirmed: false)
        _ = try await client.uploadMedia(file, pending: pending, ticket: ticket)
        let requests = await transport.requests()
        XCTAssertGreaterThan(requests.last!.httpBody!.count, ERPPendingCommand.maximumBodyBytes)
        XCTAssertEqual(ERPPendingCommand.maximumInputBytes, 65_536)
        XCTAssertEqual(ERPURLSessionTransport.maximumResponseBytes, 2 * 1024 * 1024)
        let command = ERPCommand(name: "task.start", permission: "task.work", highRisk: false, schema: nil)
        await failure(.invalidPayload) {
            try await client.execute(command, input: MediaFixtures.json(["taskId": "task-a", "note": String(repeating: "a", count: 66_000)]))
        }
    }
    func testFreshTaskMovedToAnotherSiteCannotReceiveSelectedFile() async throws {
        let transport = MediaTransport()
        let (client, ticket, file, pending) = try await fixture(transport)
        await transport.setTaskPage(MediaFixtures.page([MediaFixtures.record(site: "site-other")]))
        await mediaFailure(.contextChanged) { try await client.uploadMedia(file, pending: pending, ticket: ticket) }
        let requests = await transport.requests()
        XCTAssertFalse(requests.contains { $0.url?.path == "/api/v1/media/uploads" })
    }
    func testHeldBinaryResponseAfterLogoutCannotProduceExportBytes() async throws {
        let transport = MediaTransport()
        let (client, ticket, _, _) = try await fixture(transport)
        let entered = expectation(description: "binary request sent")
        await transport.hold("/api/v1/media/asset-a/file", signal: entered)
        let asset = try MediaFixtures.item(MediaFixtures.asset())
        let work = Task { try await client.downloadMedia(asset, ticket: ticket) }
        await fulfillment(of: [entered], timeout: 3)
        await client.logout(); await transport.release()
        await failure(.accessChanged) { try await work.value }
    }
}
