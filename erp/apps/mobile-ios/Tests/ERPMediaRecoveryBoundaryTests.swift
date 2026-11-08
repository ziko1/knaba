import XCTest
@testable import KNABADE

@MainActor final class ERPMediaRecoveryBoundaryTests: XCTestCase {
    private func uploaded(_ transport: MediaTransport, media: MediaMemoryJournal, commands: MediaCommandJournal) async throws -> (ERPConsoleClient, ERPMediaTicket, ERPMediaPending) {
        let client = ERPConsoleClient(transport: transport, journal: commands, mediaJournal: media)
        try await mediaSignIn(client)
        let ticket = try await mediaTicket(client), file = try MediaFixtures.pdf()
        let descriptor = try ERPMediaPending(file: file, authority: ticket.authority, input: MediaFixtures.input(), redactionConfirmed: false)
        let result = try await client.uploadMedia(file, pending: descriptor, ticket: ticket)
        return (client, ticket, result.pending)
    }
    func testMarkedPendingCannotUseGenericRetryOrExposeInputsWithoutDescriptor() async throws {
        let transport = MediaTransport(), media = MediaMemoryJournal(), commands = MediaCommandJournal()
        let (client, ticket, uploaded) = try await uploaded(transport, media: media, commands: commands)
        await transport.setRegisterErrors([.timedOut])
        do { _ = try await client.registerMedia(uploaded, ticket: ticket) } catch { }
        let saved = try await client.pendingCommand()
        XCTAssertEqual(saved?.nativeMedia, true)
        do { _ = try await client.retryPending(); XCTFail("Marked media must use typed recovery") }
        catch { XCTAssertEqual(error as? ERPMediaFailure, .pendingMedia) }
        let missing = ERPConsoleClient(transport: transport, journal: commands, mediaJournal: MediaMemoryJournal())
        try await mediaSignIn(missing)
        do { _ = try await missing.pendingCommand(); XCTFail("No descriptor must hide the pending payload") }
        catch { XCTAssertEqual(error as? ERPMediaFailure, .recoveryMismatch) }
        let model = ERPMediaModel(client: missing, initialRecord: try MediaFixtures.item(MediaFixtures.record()))
        await model.start()
        XCTAssertTrue(model.recoveryBlocked); XCTAssertNil(model.pending); XCTAssertFalse(model.canSelect)
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/commands/media.register" }.count, 1)
    }
    func testMarkedPendingRejectsChangedFullAuthorityBeforeGenericReadOrRetry() async throws {
        let transport = MediaTransport(), media = MediaMemoryJournal(), commands = MediaCommandJournal()
        let (client, ticket, uploaded) = try await uploaded(transport, media: media, commands: commands)
        await transport.setRegisterErrors([.timedOut])
        do { _ = try await client.registerMedia(uploaded, ticket: ticket) } catch { }
        await transport.setIdentity(MediaFixtures.identity(warehouses: ["changed-warehouse"]))
        _ = try await client.refresh()
        do { _ = try await client.pendingCommand(); XCTFail("Hidden scope changes must deny private recovery") }
        catch { XCTAssertEqual(error as? ERPMediaFailure, .recoveryMismatch) }
        do { _ = try await client.retryPending(); XCTFail("No generic fallback") }
        catch { XCTAssertEqual(error as? ERPMediaFailure, .recoveryMismatch) }
    }
    func testKnownAckWithCommandAlreadyRemovedCannotBeRegisteredWithFreshGenericKey() async throws {
        let transport = MediaTransport(), media = MediaMemoryJournal(), commands = MediaCommandJournal()
        let (client, ticket, uploaded) = try await uploaded(transport, media: media, commands: commands)
        media.failRemoval(true)
        let receipt = try await client.registerMedia(uploaded, ticket: ticket)
        XCTAssertTrue(receipt.recoveryWarning); XCTAssertNil(try commands.read(scope: uploaded.scope))
        let command = try JSONDecoder().decode(ERPCommands.self, from: MediaFixtures.catalog).items[0]
        do {
            _ = try await client.execute(command, input: uploaded.input.data(uploadId: uploaded.uploadId!))
            XCTFail("Unresolved typed upload cannot receive a fresh generic registration key")
        } catch { XCTAssertEqual(error as? ERPMediaFailure, .pendingMedia) }
        let requests = await transport.requests()
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/commands/media.register" }.count, 1)
    }
    func testLegacyUnmarkedGenericRegistrationRemainsCompatible() async throws {
        let transport = MediaTransport(), media = MediaMemoryJournal(), commands = MediaCommandJournal()
        let client = ERPConsoleClient(transport: transport, journal: commands, mediaJournal: media)
        try await mediaSignIn(client)
        let authority = try await client.mediaAuthority()
        let command = try ERPPendingCommand(scope: authority.scope, name: "media.register", input: MediaFixtures.input().data(uploadId: "legacy-upload"))
        try commands.persist(command)
        let exposed = try await client.pendingCommand()
        XCTAssertNil(exposed?.nativeMedia)
        _ = try await client.retryPending()
        XCTAssertNil(try commands.read(scope: authority.scope))
        let requests = await transport.requests()
        XCTAssertEqual(requests.last?.httpBody, command.body)
    }
}
