import XCTest
@testable import KNABADE

@MainActor final class ERPMediaPolicyTests: XCTestCase {
    private func authority(external: Bool = false) throws -> ERPMediaAuthority {
        let origin = URL(string: MediaFixtures.origin)!
        return ERPMediaAuthority(clientID: UUID(), fence: ERPMediaSessionFence(), origin: origin.absoluteString, companyId: MediaFixtures.company,
                                 userId: "user-a", scope: try ERPPendingCommand.scope(origin: origin, companyId: MediaFixtures.company, userId: "user-a"),
                                 fingerprint: String(repeating: "b", count: 64), revision: 0, external: external)
    }
    func testOriginalMagicAndLimitsRejectHEICWrongTypesAndOversize() throws {
        XCTAssertThrowsError(try ERPMediaFile(bytes: Data("not an image".utf8), fileName: "fake.jpg"))
        XCTAssertThrowsError(try ERPMediaFile(bytes: Data([0,0,0,24] + Array("ftypheic".utf8)), fileName: "photo.heic"))
        XCTAssertThrowsError(try MediaFixtures.pdf(ERPMediaLimits.pdf + 1)) { XCTAssertEqual($0 as? ERPFailure, .tooLarge) }
        var jpeg = Data([0xff,0xd8,0xff]); jpeg.append(Data(repeating: 0, count: ERPMediaLimits.images - 2))
        XCTAssertThrowsError(try ERPMediaFile(bytes: jpeg, fileName: "photo.jpg", inspectImage: false)) { XCTAssertEqual($0 as? ERPFailure, .tooLarge) }
        XCTAssertThrowsError(try ERPMediaFile(bytes: Data(), fileName: "empty.pdf"))
        XCTAssertEqual(ERPMediaLimits.selection, 8)
    }
    func testMaximumPDFBodyPreservesOriginalBytesAndFitsDedicatedBound() throws {
        let file = try MediaFixtures.pdf(ERPMediaLimits.pdf)
        let pending = try ERPMediaPending(file: file, authority: authority(), input: MediaFixtures.input(), redactionConfirmed: false)
        let body = try pending.uploadBody(file: file)
        XCTAssertLessThanOrEqual(body.count, ERPMediaLimits.uploadBody)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(object["base64"] as? String)), file.bytes)
        XCTAssertEqual(object["fileName"] as? String, "synthetic.pdf")
        XCTAssertFalse(String(data: body, encoding: .utf8)!.contains("\\n"))
    }
    func testIncrementalBase64HasCorrectPaddingAtEveryChunkBoundary() throws {
        for length in [9, 10, 11, 48 * 1024 - 1, 48 * 1024, 48 * 1024 + 1, 96 * 1024 + 2] {
            let file = try MediaFixtures.pdf(length)
            let pending = try ERPMediaPending(file: file, authority: authority(), input: MediaFixtures.input(), redactionConfirmed: false)
            let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: pending.uploadBody(file: file)) as? [String: Any])
            XCTAssertEqual(body["base64"] as? String, file.bytes.base64EncodedString())
        }
    }
    func testFileNameAndMetadataUseUTF16BoundsAndSafeJSONEscaping() throws {
        let name = String(repeating: "🧱", count: 98) + "\"\\"
        let file = try ERPMediaFile(bytes: MediaFixtures.pdf().bytes, fileName: name)
        let pending = try ERPMediaPending(file: file, authority: authority(), input: MediaFixtures.input(), redactionConfirmed: true)
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: pending.uploadBody(file: file)) as? [String: Any])
        XCTAssertEqual(body["fileName"] as? String, name)
        XCTAssertThrowsError(try ERPMediaFile(bytes: file.bytes, fileName: String(repeating: "🧱", count: 101)))
        let tooLong = ERPMediaInput(siteId: "site-a", taskId: nil, stage: "BEFORE", visibility: "INTERNAL", caption: String(repeating: "🧱", count: 1001), retentionPurpose: "Work evidence")
        XCTAssertThrowsError(try tooLong.validate())
        let blank = ERPMediaInput(siteId: "site-a", taskId: nil, stage: "BEFORE", visibility: "INTERNAL", caption: "", retentionPurpose: "   ")
        XCTAssertThrowsError(try blank.validate())
    }
    func testExternalPolicyRejectsTaskPDFAndNonDefectOrPublicVisibility() throws {
        let actor = try authority(external: true)
        let site = try ERPMediaContext(record: MediaFixtures.item(MediaFixtures.record(kind: "site", id: "site-a")))
        let task = try ERPMediaContext(record: MediaFixtures.item(MediaFixtures.record()))
        XCTAssertNoThrow(try ERPMediaPolicy.validate(MediaFixtures.input(task: nil, stage: "DEFECT"), context: site, authority: actor, mimeType: "image/jpeg"))
        XCTAssertThrowsError(try ERPMediaPolicy.validate(MediaFixtures.input(stage: "DEFECT"), context: task, authority: actor, mimeType: "image/jpeg"))
        XCTAssertThrowsError(try ERPMediaPolicy.validate(MediaFixtures.input(task: nil, stage: "DEFECT"), context: site, authority: actor, mimeType: "application/pdf"))
        XCTAssertThrowsError(try ERPMediaPolicy.validate(MediaFixtures.input(task: nil, stage: "AFTER"), context: site, authority: actor, mimeType: "image/jpeg"))
        XCTAssertThrowsError(try ERPMediaPolicy.validate(MediaFixtures.input(task: nil, stage: "DEFECT", visibility: "CLIENT_AFTER_APPROVAL"), context: site, authority: actor, mimeType: "image/jpeg"))
    }
    func testCatalogRequiresActualCommandPermissionAndEnums() throws {
        let actor = try JSONDecoder().decode(ERPIdentity.self, from: MediaFixtures.identity()).actor
        let catalog = try JSONDecoder().decode(ERPCommands.self, from: MediaFixtures.catalog).items
        XCTAssertEqual(try ERPMediaPolicy.command(catalog, actor: actor).name, "media.register")
        XCTAssertThrowsError(try ERPMediaPolicy.command([ERPCommand(name: "media.upload", permission: "media.upload", highRisk: false, schema: catalog[0].schema)], actor: actor))
        XCTAssertThrowsError(try ERPMediaPolicy.command([ERPCommand(name: "media.register", permission: "media.upload", highRisk: false, schema: nil)], actor: actor))
        let denied = try JSONDecoder().decode(ERPIdentity.self, from: MediaFixtures.identity(permissions: [])).actor
        XCTAssertThrowsError(try ERPMediaPolicy.command(catalog, actor: denied))
    }
    func testDomainIDsAreNotUUIDOnlyAndAreOneEncodedPathComponent() throws {
        XCTAssertTrue(ERPMediaPolicy.validID(String(repeating: "a", count: 64)))
        XCTAssertTrue(ERPMediaPolicy.validID("legacy-id/..% ?#"))
        let encoded = try ERPMediaPolicy.component("legacy-id/..% ?#")
        XCTAssertFalse(encoded.contains("/")); XCTAssertFalse(encoded.contains("..")); XCTAssertFalse(encoded.contains("?"))
        XCTAssertEqual(encoded.removingPercentEncoding, "legacy-id/..% ?#")
        XCTAssertThrowsError(try ERPMediaPolicy.component(""))
        XCTAssertThrowsError(try ERPMediaPolicy.component(String(repeating: "a", count: 101)))
    }
    func testMetadataDescriptorHasNoBytesURIOrAuthenticationSecrets() throws {
        let pending = try ERPMediaPending(file: MediaFixtures.pdf(), authority: authority(), input: MediaFixtures.input(), redactionConfirmed: false)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: JSONEncoder().encode(pending)) as? [String: Any])
        XCTAssertEqual(Set(object.keys), Set(["format","scope","authorityHash","origin","companyId","userId","uploadKey","registerKey","sha256","fileName","mimeType","byteSize","redactionConfirmed","input","phase"]))
        XCTAssertNil(object["bytes"]); XCTAssertNil(object["base64"]); XCTAssertNil(object["uri"]); XCTAssertNil(object["cookie"])
        let input = try XCTUnwrap(object["input"] as? [String: Any])
        XCTAssertEqual(Set(input.keys), Set(["siteId","taskId","stage","visibility","caption","retentionPurpose"]))
        XCTAssertNil(input["uploadId"])
    }
    func testBoundedFileReadRejectsRemoteURLAndCancelledOriginalSelection() throws {
        XCTAssertThrowsError(try ERPMediaFile.read(URL(string: "https://other.example.test/file.pdf")!, securityScoped: false)) {
            XCTAssertEqual($0 as? ERPMediaFailure, .fileUnavailable)
        }
        let ticket = ERPMediaTicket(authority: try authority())
        ticket.cancel()
        XCTAssertThrowsError(try ERPMediaFile.read(URL(fileURLWithPath: "/synthetic/not-opened.pdf"), securityScoped: false, ticket: ticket)) {
            XCTAssertTrue($0 is CancellationError)
        }
    }
}
