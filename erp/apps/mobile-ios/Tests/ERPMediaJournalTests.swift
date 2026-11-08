import XCTest
import CryptoKit
@testable import KNABADE

private final class MediaTestKeys: ERPRecoveryKeyStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: Data?
    func read() throws -> Data? { lock.lock(); defer { lock.unlock() }; return value }
    func create(_ value: Data) throws {
        lock.lock(); defer { lock.unlock() }
        guard self.value == nil else { throw ERPFailure.recoveryUnavailable }
        self.value = value
    }
    func replace(_ value: Data?) { lock.lock(); defer { lock.unlock() }; self.value = value }
}

final class ERPMediaJournalTests: XCTestCase {
    private func directory() throws -> URL {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("knaba-media-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: path) }
        return path
    }
    private func pending(_ user: String = "user-a") throws -> ERPMediaPending {
        let origin = URL(string: MediaFixtures.origin)!
        let authority = ERPMediaAuthority(clientID: UUID(), fence: ERPMediaSessionFence(), origin: origin.absoluteString,
            companyId: MediaFixtures.company, userId: user,
            scope: try ERPPendingCommand.scope(origin: origin, companyId: MediaFixtures.company, userId: user),
            fingerprint: String(repeating: "b", count: 64), revision: 0, external: false)
        return try ERPMediaPending(file: MediaFixtures.pdf(), authority: authority, input: MediaFixtures.input(), redactionConfirmed: false)
    }
    func testEncryptedMetadataRoundTripAndNoPrivateFileOrCredentialFields() throws {
        let root = try directory(), keys = MediaTestKeys()
        let journal = ERPEncryptedMediaJournal(directory: root, keys: keys), saved = try pending()
        try journal.persist(saved)
        let cipher = try Data(contentsOf: root.appendingPathComponent("erp-media-metadata-v1.aesgcm"))
        XCTAssertNil(cipher.range(of: Data(saved.fileName.utf8)))
        let secret = try XCTUnwrap(keys.read())
        let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: cipher), using: SymmetricKey(data: secret), authenticating: Data("KNABA-ERP-MEDIA-RECOVERY-v1".utf8))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: plain) as? [String: Any])
        let items = try XCTUnwrap(object["items"] as? [String: [String: Any]])
        let metadata = try XCTUnwrap(items[saved.scope])
        XCTAssertEqual(metadata["sha256"] as? String, saved.sha256)
        XCTAssertTrue(Set(metadata.keys).isDisjoint(with: ["bytes", "base64", "uri", "bookmark", "cookie", "csrf", "password", "otp"]))
        XCTAssertEqual(try ERPEncryptedMediaJournal(directory: root, keys: keys).read(scope: saved.scope), saved)
    }
    func testImmutableMutationAndReceiptProgressCannotRegressOrChange() throws {
        let root = try directory(), keys = MediaTestKeys()
        let journal = ERPEncryptedMediaJournal(directory: root, keys: keys)
        let first = try pending(); try journal.persist(first)
        var uploaded = first; uploaded.phase = .uploaded; uploaded.uploadId = String(repeating: "a", count: 64)
        try journal.persist(uploaded)
        XCTAssertThrowsError(try journal.persist(first))
        var conflicting = uploaded; conflicting.uploadId = "other-upload"
        XCTAssertThrowsError(try journal.persist(conflicting))
        XCTAssertThrowsError(try journal.persist(pending()))
        XCTAssertThrowsError(try journal.remove(scope: first.scope, uploadKey: first.uploadKey))
        var registered = uploaded; registered.phase = .registered; registered.assetId = "asset-a"; registered.assetVersion = 1
        try journal.persist(registered)
        XCTAssertThrowsError(try journal.remove(scope: first.scope, uploadKey: UUID().uuidString))
        try journal.remove(scope: first.scope, uploadKey: first.uploadKey)
        XCTAssertNil(try journal.read(scope: first.scope))
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent("erp-media-metadata-v1.aesgcm").path))
    }
    func testMissingCorruptOrTruncatedEncryptedMetadataNeverBecomesFreshPermission() throws {
        for mode in ["missing", "tampered", "truncated", "oversized"] {
            let root = try directory(), keys = MediaTestKeys()
            let journal = ERPEncryptedMediaJournal(directory: root, keys: keys), value = try pending()
            try journal.persist(value)
            let url = root.appendingPathComponent("erp-media-metadata-v1.aesgcm")
            switch mode {
            case "missing": try FileManager.default.removeItem(at: url)
            case "tampered": var bytes = try Data(contentsOf: url); bytes[bytes.count / 2] ^= 1; try bytes.write(to: url)
            case "truncated": try Data([1, 2, 3]).write(to: url)
            default: try Data(repeating: 0, count: 512 * 1024 + 65).write(to: url)
            }
            XCTAssertThrowsError(try journal.read(scope: value.scope), mode)
            XCTAssertThrowsError(try journal.persist(pending("user-b")), mode)
        }
    }
    func testMissingOrChangedKeyCannotOverwriteExistingCiphertext() throws {
        let root = try directory(), keys = MediaTestKeys()
        let journal = ERPEncryptedMediaJournal(directory: root, keys: keys), value = try pending()
        try journal.persist(value)
        let url = root.appendingPathComponent("erp-media-metadata-v1.aesgcm"), before = try Data(contentsOf: url)
        keys.replace(nil)
        XCTAssertThrowsError(try journal.read(scope: value.scope))
        XCTAssertThrowsError(try journal.persist(value))
        XCTAssertEqual(try Data(contentsOf: url), before)
    }
    func testScopeBudgetRetainsExistingSixteenAccountsWithoutEviction() throws {
        let root = try directory(), keys = MediaTestKeys()
        let journal = ERPEncryptedMediaJournal(directory: root, keys: keys)
        var saved: [ERPMediaPending] = []
        for index in 0..<16 { let value = try pending("user-\(index)"); saved.append(value); try journal.persist(value) }
        XCTAssertThrowsError(try journal.persist(pending("user-17")))
        for value in saved { XCTAssertEqual(try journal.read(scope: value.scope), value) }
    }
    func testNativeMediaMarkerIsMetadataOnlyAndLegacyCommandsRemainDecodable() throws {
        let descriptor = try pending(), input = try descriptor.input.data(uploadId: "upload-a")
        let marked = try ERPPendingCommand(scope: descriptor.scope, name: "media.register", input: input, idempotencyKey: descriptor.registerKey, nativeMedia: true)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: JSONEncoder().encode(marked)) as? [String: Any])
        XCTAssertEqual(object["nativeMedia"] as? Bool, true)
        let wire = try XCTUnwrap(try JSONSerialization.jsonObject(with: marked.body) as? [String: Any])
        XCTAssertEqual(Set(wire.keys), Set(["input", "idempotency_key"]))
        let legacy = try ERPPendingCommand(scope: descriptor.scope, name: "media.register", input: input)
        let decoded = try JSONDecoder().decode(ERPPendingCommand.self, from: JSONEncoder().encode(legacy))
        XCTAssertNil(decoded.nativeMedia)
        XCTAssertThrowsError(try ERPPendingCommand(scope: descriptor.scope, name: "task.start", input: MediaFixtures.json(["taskId": "task-a"]), nativeMedia: true))
        XCTAssertThrowsError(try ERPPendingCommand(scope: descriptor.scope, name: "media.register", input: input, nativeMedia: false))
    }
}
