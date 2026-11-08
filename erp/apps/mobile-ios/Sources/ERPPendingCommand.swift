import Foundation
import CryptoKit

/// One unresolved account command. No cookie, CSRF token, password or GPS bearer is serialized.
/// The body is the exact envelope sent to ERP, including its original key and expected version.
struct ERPPendingCommand: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let origin: String
    let companyId: String
    let userId: String
    let command: String
    let idempotencyKey: String
    let expectedVersion: Int?
    let body: Data
    let createdAt: Date

    static let maximumBodyBytes = 65_536

    func belongs(to identity: ERPIdentity, origin: URL) -> Bool {
        self.origin == origin.absoluteString && companyId == identity.actor.companyId &&
        userId == identity.actor.userId && identity.user.id == identity.actor.userId
    }

    func validate() throws {
        guard schemaVersion == 1,
              ERPOrigin.validate(origin)?.absoluteString == origin,
              !companyId.isEmpty, companyId.count <= 200,
              !userId.isEmpty, userId.count <= 200,
              ERPCommandName.isValid(command), UUID(uuidString: idempotencyKey) != nil,
              expectedVersion == nil || expectedVersion! > 0,
              createdAt.timeIntervalSince1970.isFinite,
              !body.isEmpty, body.count <= Self.maximumBodyBytes,
              let envelope = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let input = envelope["input"] as? [String: Any],
              !ERPCredentialPolicy.isOneShot(command),
              (try? ERPCredentialPolicy.containsSecret(input)) == false,
              envelope["idempotency_key"] as? String == idempotencyKey,
              Set(envelope.keys).isSubset(of: ["input", "idempotency_key", "expected_version"]) else {
            throw ERPFailure.pendingStorage
        }
        if let expectedVersion {
            guard let actual = envelope["expected_version"] as? NSNumber,
                  String(cString: actual.objCType) != "c", actual.stringValue == String(expectedVersion) else {
                throw ERPFailure.pendingStorage
            }
        } else if envelope["expected_version"] != nil {
            throw ERPFailure.pendingStorage
        }
    }
}

enum ERPCommandName {
    static func isValid(_ value: String) -> Bool {
        value.count <= 160 && value.range(of: "^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$", options: .regularExpression) != nil
    }
}

/// Synchronous operations keep the caller's epoch check and journal mutation in one actor turn.
/// Implementations must compare the entire command when resolving, never blindly delete a file.
protocol ERPPendingCommandStoring: Sendable {
    func load() throws -> ERPPendingCommand?
    func insert(_ command: ERPPendingCommand) throws
    func resolve(_ command: ERPPendingCommand) throws
}

protocol ERPJournalKeyStoring: Sendable {
    func read() throws -> Data?
    func write(_ key: Data) throws
}

struct ERPJournalKeychain: ERPJournalKeyStoring {
    private let account = "erp-pending-command-key-v1"
    func read() throws -> Data? { try Keychain.read(account) }
    func write(_ key: Data) throws { try Keychain.write(key, account: account) }
}

/// Account-command persistence is independent of queue-v1.aesgcm and its device token/key.
/// The actor owns command/session state. This narrow process lock additionally makes file CAS
/// safe if more than one native scene creates a client for the same journal.
struct ERPEncryptedPendingCommandStore: ERPPendingCommandStoring {
    private static let fileLock = NSLock()
    private let file: URL
    private let keys: any ERPJournalKeyStoring
    static let maximumBytes = 128 * 1024

    init(file: URL? = nil, keys: any ERPJournalKeyStoring = ERPJournalKeychain()) {
        self.file = file ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KNABADE", isDirectory: true)
            .appendingPathComponent("erp-pending-command-v1.aesgcm")
        self.keys = keys
    }

    func load() throws -> ERPPendingCommand? {
        Self.fileLock.lock(); defer { Self.fileLock.unlock() }
        do { return try loadLocked() }
        catch { throw ERPFailure.pendingStorage }
    }

    func insert(_ command: ERPPendingCommand) throws {
        Self.fileLock.lock(); defer { Self.fileLock.unlock() }
        do {
            try command.validate()
            guard try loadLocked() == nil else { throw ERPFailure.pendingExists }
            let plain = try JSONEncoder().encode(command)
            guard plain.count <= Self.maximumBytes else { throw ERPFailure.pendingStorage }
            let key = try encryptionKey(allowCreation: true)
            guard let encrypted = try AES.GCM.seal(plain, using: key).combined else { throw ERPFailure.pendingStorage }
            let directory = file.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var directoryURL = directory
            var excluded = URLResourceValues(); excluded.isExcludedFromBackup = true
            try directoryURL.setResourceValues(excluded)
            try encrypted.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var fileURL = file; try fileURL.setResourceValues(excluded)
        } catch let failure as ERPFailure {
            throw failure
        } catch {
            throw ERPFailure.pendingStorage
        }
    }

    func resolve(_ command: ERPPendingCommand) throws {
        Self.fileLock.lock(); defer { Self.fileLock.unlock() }
        do {
            guard let current = try loadLocked() else { return }
            guard current == command else { throw ERPFailure.pendingChanged }
            try FileManager.default.removeItem(at: file)
        } catch let failure as ERPFailure {
            throw failure
        } catch {
            throw ERPFailure.pendingStorage
        }
    }

    private func loadLocked() throws -> ERPPendingCommand? {
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let attributes = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey])
        guard attributes.isRegularFile == true, attributes.isSymbolicLink != true,
              let count = attributes.fileSize, count > 0, count <= Self.maximumBytes + 64 else {
            throw ERPFailure.pendingStorage
        }
        let encrypted = try Data(contentsOf: file)
        guard encrypted.count <= Self.maximumBytes + 64 else { throw ERPFailure.pendingStorage }
        // A surviving encrypted file with a missing key is a blocker, not a new empty journal.
        let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: encrypted), using: encryptionKey(allowCreation: false))
        guard plain.count <= Self.maximumBytes else { throw ERPFailure.pendingStorage }
        let command = try JSONDecoder().decode(ERPPendingCommand.self, from: plain)
        try command.validate()
        return command
    }

    private func encryptionKey(allowCreation: Bool) throws -> SymmetricKey {
        if let bytes = try keys.read() {
            guard bytes.count == 32 else { throw ERPFailure.pendingStorage }
            return SymmetricKey(data: bytes)
        }
        guard allowCreation else { throw ERPFailure.pendingStorage }
        let key = SymmetricKey(size: .bits256)
        try keys.write(key.withUnsafeBytes { Data($0) })
        return key
    }
}
