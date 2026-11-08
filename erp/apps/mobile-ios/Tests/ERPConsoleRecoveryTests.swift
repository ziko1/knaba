import XCTest
@testable import KNABADE

private final class ERPTestKeys: ERPRecoveryKeyStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: Data?
    let rejectCreation: Bool
    init(rejectCreation: Bool = false) { self.rejectCreation = rejectCreation }
    func read() throws -> Data? { lock.lock(); defer { lock.unlock() }; return value }
    func create(_ bytes: Data) throws {
        lock.lock(); defer { lock.unlock() }
        guard !rejectCreation, value == nil else { throw ERPFailure.recoveryUnavailable }
        value = bytes
    }
    func replace(_ bytes: Data?) { lock.lock(); defer { lock.unlock() }; value = bytes }
}

private final class ERPWriteOutcomes: @unchecked Sendable {
    private let lock = NSLock()
    private var successes = 0
    func accepted() { lock.lock(); successes += 1; lock.unlock() }
    func count() -> Int { lock.lock(); defer { lock.unlock() }; return successes }
}

final class ERPConsoleRecoveryTests: XCTestCase {
    private func directory() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("knaba-erp-recovery-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return root
    }
    private func file(_ directory: URL) -> URL { directory.appendingPathComponent("erp-command-recovery-v1.aesgcm") }
    private func command(_ user: String = "user-a", company: String = "company-a", origin: String = "https://erp.example.test") throws -> ERPPendingCommand {
        let scope = try ERPPendingCommand.scope(origin: URL(string: origin)!, companyId: company, userId: user)
        return try ERPPendingCommand(scope: scope, name: "message.send", input: Data(#"{"channel_id":"529ddcd3-4355-44c6-92cc-fcd592b1e0e2","text":"Synthetic private recovery text","language":"UK"}"#.utf8), expectedVersion: 7)
    }

    func testAESJournalRoundTripsAfterRestartAndResolutionCannotDeleteAnotherAccount() throws {
        let directory = try directory(), keys = ERPTestKeys()
        let first = ERPEncryptedCommandJournal(directory: directory, keys: keys)
        let one = try command(), two = try command("user-b")
        try first.persist(one)
        let bytes = try Data(contentsOf: file(directory))
        XCTAssertNil(bytes.range(of: Data("Synthetic private recovery text".utf8)))
        XCTAssertNil(bytes.range(of: Data(one.scope.utf8)))
        XCTAssertGreaterThan(bytes.count, 28)
        XCTAssertEqual(try keys.read()?.count, 32)
        let restarted = ERPEncryptedCommandJournal(directory: directory, keys: keys)
        XCTAssertEqual(try restarted.read(scope: one.scope), one)
        XCTAssertNil(try restarted.read(scope: two.scope))
        try restarted.persist(two)
        XCTAssertThrowsError(try restarted.remove(scope: one.scope, idempotencyKey: two.idempotencyKey)) { XCTAssertEqual($0 as? ERPFailure, .recoveryInvalid) }
        XCTAssertEqual(try restarted.read(scope: one.scope), one)
        try restarted.remove(scope: one.scope, idempotencyKey: one.idempotencyKey)
        XCTAssertNil(try first.read(scope: one.scope))
        XCTAssertEqual(try first.read(scope: two.scope), two)
        try first.remove(scope: two.scope, idempotencyKey: two.idempotencyKey)
        XCTAssertTrue(FileManager.default.fileExists(atPath: file(directory).path), "Authenticated empty file preserves missing-file detection")
    }

    func testTamperedTruncatedMissingOrOversizedCiphertextCannotBecomeAnEmptyJournal() throws {
        for mode in ["tampered", "truncated", "missing", "oversized"] {
            let directory = try directory(), keys = ERPTestKeys()
            let journal = ERPEncryptedCommandJournal(directory: directory, keys: keys)
            let saved = try command()
            try journal.persist(saved)
            let url = file(directory)
            switch mode {
            case "tampered":
                var bytes = try Data(contentsOf: url); bytes[bytes.count / 2] ^= 1; try bytes.write(to: url)
            case "truncated": try Data([1, 2, 3]).write(to: url)
            case "missing": try FileManager.default.removeItem(at: url)
            default: try Data(repeating: 0, count: 2 * 1024 * 1024 + 65).write(to: url)
            }
            XCTAssertThrowsError(try journal.read(scope: saved.scope), mode) { XCTAssertEqual($0 as? ERPFailure, .recoveryInvalid) }
            XCTAssertThrowsError(try journal.persist(command("user-b")), mode)
        }
    }

    func testMissingOrInvalidKeyNeverGeneratesAReplacementForExistingCiphertext() throws {
        for replacement in [nil, Data(repeating: 7, count: 16), Data(repeating: 8, count: 32)] as [Data?] {
            let directory = try directory(), keys = ERPTestKeys()
            let journal = ERPEncryptedCommandJournal(directory: directory, keys: keys)
            let saved = try command()
            try journal.persist(saved)
            let before = try Data(contentsOf: file(directory))
            keys.replace(replacement)
            XCTAssertThrowsError(try journal.read(scope: saved.scope)) { XCTAssertEqual($0 as? ERPFailure, .recoveryInvalid) }
            XCTAssertThrowsError(try journal.persist(command("user-b")))
            XCTAssertEqual(try Data(contentsOf: file(directory)), before)
            XCTAssertEqual(try keys.read(), replacement)
        }
    }

    func testKeyOrFilesystemFailureCannotReportSuccessfulPersistence() throws {
        let directory = try directory()
        let blockedKeys = ERPTestKeys(rejectCreation: true)
        let saved = try command()
        let blocked = ERPEncryptedCommandJournal(directory: directory, keys: blockedKeys)
        XCTAssertThrowsError(try blocked.persist(saved)) { XCTAssertEqual($0 as? ERPFailure, .recoveryUnavailable) }
        XCTAssertFalse(FileManager.default.fileExists(atPath: file(directory).path))
        let pathIsFile = directory.appendingPathComponent("not-a-directory")
        try Data("existing synthetic file".utf8).write(to: pathIsFile)
        let keys = ERPTestKeys()
        let unavailable = ERPEncryptedCommandJournal(directory: pathIsFile, keys: keys)
        XCTAssertThrowsError(try unavailable.persist(saved)) { XCTAssertEqual($0 as? ERPFailure, .recoveryUnavailable) }
        XCTAssertEqual(try String(contentsOf: pathIsFile, encoding: .utf8), "existing synthetic file")
        XCTAssertThrowsError(try unavailable.persist(saved), "A partial first persistence must fail closed on retry")
    }

    func testPendingRecordsCannotBeOverwrittenAndStorageHasABoundedAccountCount() throws {
        let directory = try directory(), keys = ERPTestKeys()
        let journal = ERPEncryptedCommandJournal(directory: directory, keys: keys)
        let saved = try command()
        try journal.persist(saved)
        try journal.persist(saved) // Exact already-saved bytes are idempotent.
        XCTAssertThrowsError(try journal.persist(command())) { XCTAssertEqual($0 as? ERPFailure, .pendingCommand) }
        for i in 1..<16 { try journal.persist(command("user-\(i)")) }
        XCTAssertThrowsError(try journal.persist(command("seventeenth"))) { XCTAssertEqual($0 as? ERPFailure, .recoveryUnavailable) }
        XCTAssertEqual(try journal.read(scope: saved.scope), saved)
    }

    func testActorScopeIncludesOriginCompanyAndUser() throws {
        let records = try [command(), command("user-b"), command(company: "company-b"), command(origin: "https://other.example.test")]
        XCTAssertEqual(Set(records.map(\.scope)).count, 4)
        for value in records { XCTAssertNotNil(value.scope.range(of: "^[a-f0-9]{64}$", options: .regularExpression)) }
        XCTAssertThrowsError(try records[0].validate(expectedScope: records[1].scope)) { XCTAssertEqual($0 as? ERPFailure, .recoveryInvalid) }
    }

    func testUntrustedRestoredEnvelopeCannotChangeOriginalInputVersionOrKey() throws {
        let saved = try command()
        let serialized = try JSONEncoder().encode(saved)
        for alteration in ["key", "version", "input", "scope", "format", "extra-envelope-field"] {
            var value = try JSONSerialization.jsonObject(with: serialized) as! [String: Any]
            switch alteration {
            case "key": value["idempotencyKey"] = UUID().uuidString
            case "version": value["expectedVersion"] = 999
            case "input": value["input"] = Data(#"{"different":"input"}"#.utf8).base64EncodedString()
            case "scope": value["scope"] = String(repeating: "f", count: 64)
            case "format": value["formatVersion"] = 2
            default:
                var envelope = try JSONSerialization.jsonObject(with: saved.body) as! [String: Any]
                envelope["actor"] = "foreign-user"
                value["body"] = try JSONSerialization.data(withJSONObject: envelope).base64EncodedString()
            }
            let changed = try JSONDecoder().decode(ERPPendingCommand.self, from: JSONSerialization.data(withJSONObject: value))
            XCTAssertThrowsError(try changed.validate(expectedScope: saved.scope), alteration) { XCTAssertEqual($0 as? ERPFailure, .recoveryInvalid) }
        }
    }

    func testCredentialKeysAreRejectedRecursivelyWithoutRejectingOrdinaryTaskInput() throws {
        let scope = try command().scope
        for key in ["newPassword", "current_password", "API-Token", "TOTP", "secret", "clientSecret", "authorization", "private_key"] {
            let payload: [String: Any] = ["nested": [[key: "synthetic credential"]]]
            let bytes = try JSONSerialization.data(withJSONObject: payload)
            XCTAssertThrowsError(try ERPPendingCommand(scope: scope, name: "config.update", input: bytes), key) { XCTAssertEqual($0 as? ERPFailure, .sensitiveCommand) }
        }
        XCTAssertNoThrow(try ERPPendingCommand(scope: scope, name: "task.start", input: Data(#"{"taskId":"synthetic-task"}"#.utf8)))
        XCTAssertThrowsError(try ERPPendingCommand(scope: scope, name: "user.password.rotate", input: Data(#"{"currentPassword":"old","newPassword":"new-secret"}"#.utf8)))
    }

    func testTwoJournalInstancesCannotRaceToOverwriteAnUnresolvedRequest() throws {
        let directory = try directory(), keys = ERPTestKeys()
        let journals = [ERPEncryptedCommandJournal(directory: directory, keys: keys), ERPEncryptedCommandJournal(directory: directory, keys: keys)]
        let candidates = try [command(), command()]
        let outcomes = ERPWriteOutcomes()
        DispatchQueue.concurrentPerform(iterations: 2) { index in
            do { try journals[index].persist(candidates[index]); outcomes.accepted() } catch { }
        }
        XCTAssertEqual(outcomes.count(), 1)
        let current = try XCTUnwrap(journals[0].read(scope: candidates[0].scope))
        XCTAssertTrue(candidates.contains(current))
        XCTAssertEqual(try journals[1].read(scope: current.scope), current)
    }
}
