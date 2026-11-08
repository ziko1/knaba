import XCTest
@testable import KNABADE

@MainActor final class ERPMediaModelTests: XCTestCase {
    private func fixture(_ transport: MediaTransport = MediaTransport(), media: MediaMemoryJournal = MediaMemoryJournal(),
                         commands: MediaCommandJournal = MediaCommandJournal()) async throws -> (ERPConsoleClient, ERPMediaModel) {
        let client = ERPConsoleClient(transport: transport, journal: commands, mediaJournal: media)
        try await mediaSignIn(client)
        let model = ERPMediaModel(client: client, initialRecord: try MediaFixtures.item(MediaFixtures.record()))
        await model.start()
        return (client, model)
    }
    private func choose(_ model: ERPMediaModel) async throws -> ERPMediaTicket {
        let picker = try await model.beginSelection()
        try model.beginRead(selection: picker)
        try await model.accept(MediaFixtures.pdf(), selection: picker)
        model.retentionPurpose = "Work evidence"
        return picker
    }
    func testSelectionDoesNotSendAndPrivacyStartsUnchecked() async throws {
        let transport = MediaTransport()
        let (_, model) = try await fixture(transport)
        _ = try await choose(model)
        XCTAssertFalse(model.privacyAccepted); XCTAssertFalse(model.redactionConfirmed); XCTAssertFalse(model.canSend)
        await model.upload()
        let requests = await transport.requests()
        XCTAssertFalse(requests.contains { $0.url?.path == "/api/v1/media/uploads" })
        model.privacyAccepted = true
        XCTAssertTrue(model.canSend)
    }
    func testPrivacyAckDoesNotPretendVisualRedaction() async throws {
        let transport = MediaTransport()
        let (_, model) = try await fixture(transport)
        _ = try await choose(model); model.privacyAccepted = true
        await model.upload()
        XCTAssertEqual(model.state, .uploaded); XCTAssertNil(model.file)
        let requests = await transport.requests()
        let upload = try XCTUnwrap(requests.first { $0.url?.path == "/api/v1/media/uploads" })
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: upload.httpBody!) as? [String: Any])
        XCTAssertEqual(body["redactionConfirmed"] as? Bool, false)
        XCTAssertEqual(Set(body.keys), Set(["base64", "fileName", "mimeType", "redactionConfirmed"]))
    }
    func testCancelPickerBeforeSendClearsBytesWithoutLoggingOut() async throws {
        let transport = MediaTransport()
        let (client, model) = try await fixture(transport)
        let picker = try await choose(model)
        model.cancelSelection()
        XCTAssertNil(model.file); XCTAssertFalse(model.privacyAccepted)
        XCTAssertThrowsError(try picker.check())
        let signedIn = await client.hasSession(); XCTAssertTrue(signedIn)
        let requests = await transport.requests()
        XCTAssertFalse(requests.contains { $0.url?.path == "/api/v1/media/uploads" })
    }
    func testOldPickerResultCannotRestoreFileAfterContextChangeOrStop() async throws {
        let (_, model) = try await fixture()
        let old = try await model.beginSelection()
        model.chooseContext("")
        do { try await model.accept(MediaFixtures.pdf(), selection: old); XCTFail("Old context must be rejected") } catch { }
        XCTAssertNil(model.file)
        model.chooseContext("task:task-a")
        let later = try await model.beginSelection()
        model.stop()
        do { try await model.accept(MediaFixtures.pdf(), selection: later); XCTFail("Stopped screen must reject callback") } catch { }
        XCTAssertNil(model.file); XCTAssertTrue(model.contexts.isEmpty); XCTAssertNil(model.authority)
    }
    func testObservedAuthorityLossClearsFileBeforeLatePickerCanReturn() async throws {
        let transport = MediaTransport()
        let (client, model) = try await fixture(transport)
        let picker = try await choose(model)
        await transport.setIdentity(MediaFixtures.identity(warehouses: ["new-scope"]))
        _ = try await client.refresh()
        do { try await model.accept(MediaFixtures.pdf(), selection: picker); XCTFail("Old authority must be rejected") } catch { }
        await model.refreshGallery()
        XCTAssertNil(model.file); XCTAssertNil(model.context); XCTAssertTrue(model.gallery.isEmpty)
    }
    func testKnownRegistrationSurvivesGalleryReadFailure() async throws {
        let transport = MediaTransport()
        let (_, model) = try await fixture(transport)
        _ = try await choose(model); model.privacyAccepted = true
        await model.upload()
        await transport.setGalleryError(.notConnectedToInternet)
        await model.register()
        XCTAssertEqual(model.state, .registered); XCTAssertEqual(model.receipt?.assetId, "asset-a")
        XCTAssertNil(model.pending); XCTAssertNotNil(model.galleryProblem)
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/commands/media.register" }.count, 1)
    }
    func testNextSelectionReleasesPreviousBytesAndResetsConsent() async throws {
        let (_, model) = try await fixture()
        let picker = try await choose(model)
        model.privacyAccepted = true; model.redactionConfirmed = true
        try model.beginRead(selection: picker)
        XCTAssertNil(model.file); XCTAssertFalse(model.privacyAccepted); XCTAssertFalse(model.redactionConfirmed)
        try await model.accept(MediaFixtures.pdf(40), selection: picker)
        XCTAssertEqual(model.file?.bytes.count, 40); XCTAssertFalse(model.privacyAccepted)
    }
    func testFrozenMetadataCannotChangeBodyOnRetry() async throws {
        let transport = MediaTransport()
        let (_, model) = try await fixture(transport)
        _ = try await choose(model); model.privacyAccepted = true
        await transport.setUploadErrors([.timedOut])
        await model.upload()
        XCTAssertEqual(model.state, .uploadUnknown); XCTAssertTrue(model.frozen)
        model.stage = "AFTER"; model.retentionPurpose = "Changed local draft"; model.redactionConfirmed = true
        await model.upload()
        let requests = await transport.requests()
        let uploads = requests.filter { $0.url?.path == "/api/v1/media/uploads" }
        XCTAssertEqual(uploads.count, 2); XCTAssertEqual(uploads[0].httpBody, uploads[1].httpBody)
        XCTAssertEqual(model.pending?.input.stage, "BEFORE"); XCTAssertEqual(model.pending?.input.retentionPurpose, "Work evidence")
    }
    func testSystemExportCopyCannotExposeBytesAfterLogout() async throws {
        let (client, _) = try await fixture()
        let ticket = try await mediaTicket(client)
        let bytes = try MediaFixtures.pdf().bytes
        let document = try ERPMediaExportDocument(data: bytes, ticket: ticket)
        XCTAssertEqual(try document.currentBytes(), bytes)
        await client.logout()
        XCTAssertThrowsError(try document.currentBytes()) { XCTAssertEqual($0 as? ERPFailure, .accessChanged) }
    }
    func testAllMediaStatesHaveSixNonemptyLocalizedLabels() {
        XCTAssertEqual(Set(ERPMediaStrings.rows.keys), Set(ERPMediaText.allCases))
        for key in ERPMediaText.allCases {
            XCTAssertEqual(ERPMediaStrings.rows[key]?.count, NativeLanguage.allCases.count)
            for language in NativeLanguage.allCases { XCTAssertFalse(ERPMediaStrings.text(key, language).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
        }
    }
    func testReopenedRegisteredDescriptorOffersLocalCleanupWithoutAnotherPOST() async throws {
        let transport = MediaTransport(), media = MediaMemoryJournal(), commands = MediaCommandJournal()
        let (_, first) = try await fixture(transport, media: media, commands: commands)
        _ = try await choose(first); first.privacyAccepted = true
        await first.upload(); media.failRemoval(true); await first.register()
        XCTAssertEqual(first.pending?.phase, .registered)
        first.stop(); media.failRemoval(false)
        let (_, reopened) = try await fixture(transport, media: media, commands: commands)
        XCTAssertEqual(reopened.state, .registered); XCTAssertEqual(reopened.receipt?.assetId, "asset-a")
        XCTAssertTrue(reopened.canRegister); XCTAssertFalse(reopened.canSelect)
        await reopened.register()
        XCTAssertNil(reopened.pending); XCTAssertFalse(reopened.recoveryWarning)
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/commands/media.register" }.count, 1)
    }

    private func assertProviderDrain(replaceScreen: Bool) async throws {
        let transport = MediaTransport(), queue = ERPMediaImportQueue()
        let (client, first) = try await fixture(transport)
        let oldPicker = try await first.beginSelection()
        try first.beginRead(selection: oldPicker)
        let entered = expectation(description: "old provider entered"), gate = MediaImportProviderGate()
        var reads = 0, maximumReads = 0, events: [String] = []
        var oldWaiter: Task<Void, Never>? = try queue.enqueue {
            do {
                var original: ERPMediaFile? = try MediaFixtures.pdf()
                reads += 1; maximumReads = max(maximumReads, reads); events.append("old-read")
                entered.fulfill(); await gate.wait()
                XCTAssertFalse(Task.isCancelled, "Cancelling a view must not prematurely finish the retained provider worker")
                do {
                    try oldPicker.check()
                    try await first.accept(try XCTUnwrap(original), selection: oldPicker)
                    XCTFail("Cancelled selection must not publish old bytes")
                } catch { }
                original = nil; reads -= 1; events.append("old-discard")
            } catch { XCTFail("Synthetic provider failed: \(error)") }
        }
        await fulfillment(of: [entered], timeout: 2)
        oldPicker.cancel()
        if replaceScreen { first.stop() } else { first.cancelSelection() }
        oldWaiter?.cancel(); oldWaiter = nil // the departed view loses its waiter
        let next: ERPMediaModel
        if replaceScreen {
            next = ERPMediaModel(client: client, initialRecord: try MediaFixtures.item(MediaFixtures.record()))
            await next.start()
        } else { next = first }
        let newWaiter = try queue.enqueue {
            do {
                let picker = try await next.beginSelection()
                try next.beginRead(selection: picker)
                reads += 1; maximumReads = max(maximumReads, reads); events.append("new-read")
                try await next.accept(MediaFixtures.pdf(), selection: picker)
                reads -= 1
            } catch { XCTFail("Current selection failed: \(error)") }
        }
        XCTAssertEqual(events, ["old-read"]); XCTAssertNil(next.file)
        gate.release(); await newWaiter.value
        XCTAssertEqual(events, ["old-read", "old-discard", "new-read"])
        XCTAssertEqual(maximumReads, 1); XCTAssertEqual(reads, 0); XCTAssertNotNil(next.file)
        if replaceScreen { XCTAssertNil(first.file); XCTAssertNil(first.authority) }
        let signedIn = await client.hasSession(); XCTAssertTrue(signedIn)
        let requests = await transport.requests()
        XCTAssertFalse(requests.contains { $0.url?.path == "/api/v1/media/uploads" || $0.url?.path == "/api/v1/commands/media.register" })
    }
    func testCancelThenReselectDrainsProviderBeforeReadingAnotherOriginal() async throws {
        try await assertProviderDrain(replaceScreen: false)
    }
    func testReplacementMediaScreenSharesImportDrainAfterOldWaiterIsDiscarded() async throws {
        try await assertProviderDrain(replaceScreen: true)
    }
    func testImportQueueBoundsCancelledWaitersAndReportsBusyUntilProviderDrains() async throws {
        let queue = ERPMediaImportQueue(), gate = MediaImportProviderGate()
        let entered = expectation(description: "active provider")
        let active = try queue.enqueue { entered.fulfill(); await gate.wait() }
        await fulfillment(of: [entered], timeout: 2)
        var selectionCurrent = true, unexpectedReads = 0
        let waiting = try queue.enqueue { if selectionCurrent { unexpectedReads += 1 } }
        selectionCurrent = false; waiting.cancel()
        for _ in 0..<8 {
            do { _ = try queue.enqueue { unexpectedReads += 1 }; XCTFail("Only one active and one waiting operation may be retained") }
            catch { XCTAssertEqual(error as? ERPMediaFailure, .importBusy) }
        }
        XCTAssertEqual(unexpectedReads, 0)
        gate.release(); await active.value; await waiting.value
        let next = try queue.enqueue { unexpectedReads += 1 }; await next.value
        XCTAssertEqual(unexpectedReads, 1)
        for language in NativeLanguage.allCases {
            XCTAssertEqual(ERPMediaStrings.error(ERPMediaFailure.importBusy, language), ERPMediaStrings.text(.importBusy, language))
        }
    }
}

/// Delayed provider double. The real PhotosPicker/FileRepresentation interaction
/// still requires Xcode/device acceptance; this exercises the production queue.
@MainActor private final class MediaImportProviderGate {
    private var released = false
    private var continuation: CheckedContinuation<Void, Never>?
    func wait() async {
        if released { return }
        await withCheckedContinuation { continuation = $0 }
    }
    func release() {
        released = true; continuation?.resume(); continuation = nil
    }
}
