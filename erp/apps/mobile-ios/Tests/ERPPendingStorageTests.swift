import XCTest
@testable import KNABADE

private final class ERPTestJournalKeyStore: ERPJournalKeyStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var key: Data?
    private var writes = 0
    func read() throws -> Data? { lock.lock(); defer { lock.unlock() }; return key }
    func write(_ next: Data) throws { lock.lock(); defer { lock.unlock() }; key = next; writes += 1 }
    func writeCount() -> Int { lock.lock(); defer { lock.unlock() }; return writes }
}

final class ERPPendingStorageTests: XCTestCase {
    private func directory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory
    }
    private func command(key: String = UUID().uuidString, version: Int? = 7, createdAt: Date = Date()) throws -> ERPPendingCommand {
        var envelope: [String: Any] = ["idempotency_key": key, "input": ["id": "task-a", "note": "private synthetic task content"]]
        if let version { envelope["expected_version"] = version }
        return ERPPendingCommand(schemaVersion: 1, origin: "https://erp.knaba.test", companyId: "company-a", userId: "user-a",
                                 command: "task.submit", idempotencyKey: key, expectedVersion: version,
                                 body: try JSONSerialization.data(withJSONObject: envelope, options: .sortedKeys), createdAt: createdAt)
    }

    func testEncryptedAtomicRoundTripSurvivesRecreationWithoutTouchingGPSQueue() throws {
        let directory = try directory(), keys = ERPTestJournalKeyStore()
        let file = directory.appendingPathComponent("erp-pending-command-v1.aesgcm")
        let gps = directory.appendingPathComponent("queue-v1.aesgcm"), sentinel = Data("existing GPS queue".utf8)
        try sentinel.write(to: gps)
        let record = try command()
        let store = ERPEncryptedPendingCommandStore(file: file, keys: keys)
        try store.insert(record)
        let encrypted = try Data(contentsOf: file)
        XCTAssertNil(encrypted.range(of: Data("private synthetic task content".utf8)))
        XCTAssertNil(encrypted.range(of: record.body))
        XCTAssertEqual(keys.writeCount(), 1)
        XCTAssertTrue(try file.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        let recreated = ERPEncryptedPendingCommandStore(file: file, keys: keys)
        XCTAssertEqual(try recreated.load(), record)
        try recreated.resolve(record)
        XCTAssertNil(try recreated.load())
        XCTAssertEqual(try Data(contentsOf: gps), sentinel)
    }

    func testMissingKeyOrCorruptionPreservesJournalAndNeverCreatesReplacementKey() throws {
        let directory = try directory(), keys = ERPTestJournalKeyStore()
        let file = directory.appendingPathComponent("erp-pending-command-v1.aesgcm")
        let record = try command()
        try ERPEncryptedPendingCommandStore(file: file, keys: keys).insert(record)
        let original = try Data(contentsOf: file)
        let missing = ERPTestJournalKeyStore()
        let locked = ERPEncryptedPendingCommandStore(file: file, keys: missing)
        XCTAssertThrowsError(try locked.load()) { XCTAssertEqual($0 as? ERPFailure, .pendingStorage) }
        XCTAssertThrowsError(try locked.insert(self.command()))
        XCTAssertEqual(missing.writeCount(), 0)
        XCTAssertEqual(try Data(contentsOf: file), original)
        var corrupt = original; corrupt[corrupt.count - 1] ^= 1
        try corrupt.write(to: file)
        let store = ERPEncryptedPendingCommandStore(file: file, keys: keys)
        XCTAssertThrowsError(try store.load()) { XCTAssertEqual($0 as? ERPFailure, .pendingStorage) }
        XCTAssertThrowsError(try store.insert(self.command()))
        XCTAssertEqual(try Data(contentsOf: file), corrupt)
    }

    func testSizeAndVersionBoundsFailClosedWithoutReplacingRecord() throws {
        let directory = try directory(), keys = ERPTestJournalKeyStore()
        let file = directory.appendingPathComponent("erp-pending-command-v1.aesgcm")
        let store = ERPEncryptedPendingCommandStore(file: file, keys: keys)
        for version in [0, -1] {
            XCTAssertThrowsError(try store.insert(command(version: version))) { XCTAssertEqual($0 as? ERPFailure, .pendingStorage) }
        }
        XCTAssertEqual(keys.writeCount(), 0)
        let oversized = Data(repeating: 1, count: ERPEncryptedPendingCommandStore.maximumBytes + 65)
        try oversized.write(to: file)
        XCTAssertThrowsError(try store.load()) { XCTAssertEqual($0 as? ERPFailure, .pendingStorage) }
        XCTAssertThrowsError(try store.insert(command()))
        XCTAssertEqual(try Data(contentsOf: file), oversized)
        XCTAssertEqual(keys.writeCount(), 0)
    }

    func testConditionalResolutionCannotDeleteAnotherCommandOrReplaceUnresolvedWrite() throws {
        let file = try directory().appendingPathComponent("erp-pending-command-v1.aesgcm")
        let store = ERPEncryptedPendingCommandStore(file: file, keys: ERPTestJournalKeyStore())
        let old = try command(), next = try command()
        try store.insert(old)
        XCTAssertThrowsError(try store.insert(next)) { XCTAssertEqual($0 as? ERPFailure, .pendingExists) }
        XCTAssertEqual(try store.load(), old)
        try store.resolve(old)
        try store.insert(next)
        XCTAssertThrowsError(try store.resolve(old)) { XCTAssertEqual($0 as? ERPFailure, .pendingChanged) }
        XCTAssertEqual(try store.load(), next)
    }

    func testUnresolvedCommandDoesNotExpireOrDisappearOnOldCreationDate() throws {
        let file = try directory().appendingPathComponent("erp-pending-command-v1.aesgcm")
        let store = ERPEncryptedPendingCommandStore(file: file, keys: ERPTestJournalKeyStore())
        let old = try command(createdAt: Date(timeIntervalSince1970: 1))
        try store.insert(old)
        XCTAssertEqual(try store.load(), old)
    }
}
