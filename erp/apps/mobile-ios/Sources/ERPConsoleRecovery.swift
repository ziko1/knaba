import Foundation
import CoreFoundation
import CryptoKit
import Security

/// Immutable request bytes bind an explicit retry to the original account and action.
/// Neither this record nor the journal contains an ERP session, login password or CSRF token.
struct ERPPendingCommand: Codable, Sendable, Equatable, Identifiable {
    static let maximumInputBytes = 65_536
    static let maximumBodyBytes = 70_000
    let formatVersion: Int
    let scope: String
    let name: String
    let idempotencyKey: String
    let expectedVersion: Int?
    let createdAt: Date
    let input: Data
    let body: Data
    /// Local recovery routing only; never included in the command wire envelope.
    /// Nil preserves legacy generic command journals.
    let nativeMedia: Bool?
    var id: String { idempotencyKey }

    init(scope: String, name: String, input: Data, expectedVersion: Int? = nil,
         idempotencyKey: String = UUID().uuidString, createdAt: Date = Date(), nativeMedia: Bool? = nil) throws {
        let payload = try Self.validatedInput(name: name, input: input, expectedVersion: expectedVersion)
        guard !ERPCommandSecrets.containsSecret(payload), !ERPCommandSecrets.oneShotNames.contains(name) else {
            throw ERPFailure.sensitiveCommand
        }
        self.formatVersion = 1
        self.scope = scope
        self.name = name
        self.idempotencyKey = idempotencyKey
        self.expectedVersion = expectedVersion
        self.createdAt = createdAt
        self.nativeMedia = nativeMedia
        self.input = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        self.body = try Self.requestBody(input: self.input, expectedVersion: expectedVersion, idempotencyKey: idempotencyKey)
        try validate(expectedScope: scope)
    }
    static func scope(origin: URL, companyId: String, userId: String) throws -> String {
        guard ERPOrigin.validate(origin.absoluteString) == origin, !companyId.isEmpty, !userId.isEmpty else { throw ERPFailure.invalidPayload }
        let binding = try JSONEncoder().encode(["KNABA-ERP-COMMAND-v1", origin.absoluteString, companyId, userId])
        return SHA256.hash(data: binding).map { String(format: "%02x", $0) }.joined()
    }
    static func validatedInput(name: String, input: Data, expectedVersion: Int?) throws -> [String: Any] {
        guard name.utf8.count <= 100,
              name.range(of: "^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$", options: .regularExpression) != nil,
              input.count <= maximumInputBytes,
              expectedVersion == nil || (expectedVersion! > 0 && expectedVersion! <= 9_007_199_254_740_991),
              let value = try? JSONSerialization.jsonObject(with: input), let payload = value as? [String: Any] else {
            throw ERPFailure.invalidPayload
        }
        try validateJSONBudget(payload)
        return payload
    }
    private static func validateJSONBudget(_ value: Any, depth: Int = 0) throws {
        guard depth <= 24 else { throw ERPFailure.invalidPayload }
        if let dictionary = value as? [String: Any] {
            guard dictionary.count <= 256 else { throw ERPFailure.invalidPayload }
            for (key, child) in dictionary {
                guard key.utf8.count <= 200 else { throw ERPFailure.invalidPayload }
                try validateJSONBudget(child, depth: depth + 1)
            }
        } else if let array = value as? [Any] {
            guard array.count <= 2000 else { throw ERPFailure.invalidPayload }
            for child in array { try validateJSONBudget(child, depth: depth + 1) }
        } else if let number = value as? NSNumber {
            guard number.doubleValue.isFinite else { throw ERPFailure.invalidPayload }
        }
    }
    static func requestBody(input: Data, expectedVersion: Int?, idempotencyKey: String) throws -> Data {
        guard UUID(uuidString: idempotencyKey) != nil,
              let payload = try JSONSerialization.jsonObject(with: input) as? [String: Any] else { throw ERPFailure.invalidPayload }
        var envelope: [String: Any] = ["input": payload, "idempotency_key": idempotencyKey]
        if let expectedVersion { envelope["expected_version"] = expectedVersion }
        let bytes = try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys])
        guard bytes.count <= maximumBodyBytes else { throw ERPFailure.invalidPayload }
        return bytes
    }
    func validate(expectedScope: String) throws {
        do {
            guard formatVersion == 1, scope == expectedScope,
                  scope.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  UUID(uuidString: idempotencyKey) != nil, createdAt.timeIntervalSince1970.isFinite,
                  body.count <= Self.maximumBodyBytes else { throw ERPFailure.recoveryInvalid }
            guard nativeMedia == nil || (nativeMedia == true && name == "media.register" && expectedVersion == nil) else {
                throw ERPFailure.recoveryInvalid
            }
            let payload = try Self.validatedInput(name: name, input: input, expectedVersion: expectedVersion)
            guard !ERPCommandSecrets.containsSecret(payload), !ERPCommandSecrets.oneShotNames.contains(name),
                  let envelope = try JSONSerialization.jsonObject(with: body) as? [String: Any],
                  Set(envelope.keys) == (expectedVersion == nil ? Set(["input", "idempotency_key"]) : Set(["input", "idempotency_key", "expected_version"])),
                  envelope["idempotency_key"] as? String == idempotencyKey,
                  let savedInput = envelope["input"] as? [String: Any],
                  try JSONSerialization.data(withJSONObject: savedInput, options: [.sortedKeys]) == JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else {
                throw ERPFailure.recoveryInvalid
            }
            if let expectedVersion {
                guard let storedVersion = envelope["expected_version"] as? NSNumber,
                      CFGetTypeID(storedVersion) != CFBooleanGetTypeID(),
                      storedVersion.doubleValue == Double(expectedVersion) else { throw ERPFailure.recoveryInvalid }
            }
        } catch { throw ERPFailure.recoveryInvalid }
    }
}

/// Only explicitly supported credential changes use a one-shot RAM-only path.
/// Arbitrary command schemas must not accidentally put secrets in offline recovery.
enum ERPCommandSecrets {
    static let oneShotNames: Set<String> = ["user.password.rotate", "user.mfa.configure"]
    static func containsSecret(_ value: Any) -> Bool {
        if let object = value as? [String: Any] {
            return object.contains { key, child in sensitiveKey(key) || containsSecret(child) }
        }
        if let array = value as? [Any] { return array.contains(where: containsSecret) }
        return false
    }
    static func sensitiveKey(_ key: String) -> Bool {
        let normalized = key.lowercased().filter { $0.isLetter || $0.isNumber }
        return normalized == "key" || ["password", "passphrase", "secret", "token", "credential", "privatekey", "apikey", "encryptionkey", "signingkey", "authorization", "cookie", "csrf", "otp", "totp", "bearer"].contains { normalized.contains($0) }
    }
    static func validateOneShot(name: String, payload: [String: Any]) throws {
        let keys = Set(payload.keys)
        guard let password = payload["currentPassword"] as? String, !password.isEmpty, password.utf16.count <= 128 else { throw ERPFailure.invalidPayload }
        switch name {
        case "user.password.rotate":
            guard keys == Set(["currentPassword", "newPassword"]), let value = payload["newPassword"] as? String,
                  (8...128).contains(value.utf16.count) else { throw ERPFailure.invalidPayload }
        case "user.mfa.configure":
            guard keys == Set(["currentPassword", "secret", "otp"]), let secret = payload["secret"] as? String,
                  secret.range(of: "^[A-Z2-7]{16,100}$", options: .regularExpression) != nil,
                  let otp = payload["otp"] as? String, otp.range(of: "^[0-9]{6}$", options: .regularExpression) != nil else { throw ERPFailure.invalidPayload }
        default: throw ERPFailure.sensitiveCommand
        }
    }
}

protocol ERPCommandJournal: Sendable {
    func read(scope: String) throws -> ERPPendingCommand?
    func persist(_ command: ERPPendingCommand) throws
    func remove(scope: String, idempotencyKey: String) throws
}

protocol ERPRecoveryKeyStore: Sendable {
    func read() throws -> Data?
    /// Creates once, never silently replaces an existing key.
    func create(_ value: Data) throws
}

struct ERPRecoveryKeychain: ERPRecoveryKeyStore {
    private static let service = "de.knaba.mobile.erp-console-recovery.v1"
    private static let account = "aes-gcm-key"
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service,
         kSecAttrAccount as String: Self.account, kSecAttrSynchronizable as String: false]
    }
    func read() throws -> Data? {
        var query = self.query
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes = item as? Data else { throw ERPFailure.recoveryUnavailable }
        return bytes
    }
    func create(_ value: Data) throws {
        guard value.count == 32 else { throw ERPFailure.recoveryInvalid }
        var item = query
        item[kSecValueData as String] = value
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw ERPFailure.recoveryUnavailable }
    }
}

/// A synchronous bounded file transaction leaves no actor suspension between recovery
/// validation and the first network attempt. The process-wide lock also protects two
/// concurrent client instances. This file/key namespace never overlaps GPS enrollment.
final class ERPEncryptedCommandJournal: ERPCommandJournal, @unchecked Sendable {
    private struct State: Codable {
        let version: Int
        var commands: [String: ERPPendingCommand]
    }
    private static let lock = NSLock()
    private static let maximumScopes = 16
    private static let maximumPlainBytes = 2 * 1024 * 1024
    private static let associatedData = Data("KNABA-ERP-RECOVERY-v1".utf8)
    private let file: URL
    private let keys: any ERPRecoveryKeyStore
    init(directory: URL? = nil, keys: any ERPRecoveryKeyStore = ERPRecoveryKeychain()) {
        let directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KNABADE", isDirectory: true)
            .appendingPathComponent("ERPConsoleRecovery", isDirectory: true)
        self.file = directory.appendingPathComponent("erp-command-recovery-v1.aesgcm")
        self.keys = keys
    }
    func read(scope: String) throws -> ERPPendingCommand? {
        Self.lock.lock(); defer { Self.lock.unlock() }
        try validScope(scope)
        return try load().commands[scope]
    }
    func persist(_ command: ERPPendingCommand) throws {
        Self.lock.lock(); defer { Self.lock.unlock() }
        try command.validate(expectedScope: command.scope)
        var state = try load()
        if let current = state.commands[command.scope] {
            guard current == command else { throw ERPFailure.pendingCommand }
            return
        }
        guard state.commands.count < Self.maximumScopes else { throw ERPFailure.recoveryUnavailable }
        state.commands[command.scope] = command
        try save(state)
    }
    func remove(scope: String, idempotencyKey: String) throws {
        Self.lock.lock(); defer { Self.lock.unlock() }
        try validScope(scope)
        var state = try load()
        guard let current = state.commands[scope] else { return }
        guard current.idempotencyKey == idempotencyKey else { throw ERPFailure.recoveryInvalid }
        state.commands.removeValue(forKey: scope)
        // Keep an authenticated empty journal after resolution. A missing file with
        // an existing key is a recovery failure, not permission to issue a new write.
        try save(state)
    }
    private func validScope(_ scope: String) throws {
        guard scope.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw ERPFailure.recoveryInvalid }
    }
    private func readKey() throws -> Data? {
        do {
            let key = try keys.read()
            guard key == nil || key?.count == 32 else { throw ERPFailure.recoveryInvalid }
            return key
        } catch let error as ERPFailure { throw error }
        catch { throw ERPFailure.recoveryUnavailable }
    }
    private func load() throws -> State {
        let key = try readKey()
        guard FileManager.default.fileExists(atPath: file.path) else {
            guard key == nil else { throw ERPFailure.recoveryInvalid }
            return State(version: 1, commands: [:])
        }
        guard let key else { throw ERPFailure.recoveryInvalid }
        do {
            let handle = try FileHandle(forReadingFrom: file)
            defer { try? handle.close() }
            var bytes = Data()
            while let chunk = try handle.read(upToCount: min(65_536, Self.maximumPlainBytes + 65 - bytes.count)), !chunk.isEmpty {
                bytes.append(chunk)
                guard bytes.count <= Self.maximumPlainBytes + 64 else { throw ERPFailure.recoveryInvalid }
            }
            let box = try AES.GCM.SealedBox(combined: bytes)
            let plain = try AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: Self.associatedData)
            guard plain.count <= Self.maximumPlainBytes else { throw ERPFailure.recoveryInvalid }
            let state = try JSONDecoder().decode(State.self, from: plain)
            guard state.version == 1, state.commands.count <= Self.maximumScopes else { throw ERPFailure.recoveryInvalid }
            for (scope, command) in state.commands { try command.validate(expectedScope: scope) }
            return state
        } catch let error as ERPFailure { throw error }
        catch let error as CocoaError where [.fileReadNoPermission, .fileReadUnknown].contains(error.code) { throw ERPFailure.recoveryUnavailable }
        catch { throw ERPFailure.recoveryInvalid }
    }
    private func save(_ state: State) throws {
        do {
            let plain = try JSONEncoder().encode(state)
            guard plain.count <= Self.maximumPlainBytes else { throw ERPFailure.recoveryUnavailable }
            let key: Data
            if let existing = try readKey() { key = existing }
            else {
                let generated = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
                try keys.create(generated)
                guard let stored = try readKey(), stored == generated else { throw ERPFailure.recoveryUnavailable }
                key = stored
            }
            guard let encrypted = try AES.GCM.seal(plain, using: SymmetricKey(data: key), authenticating: Self.associatedData).combined else {
                throw ERPFailure.recoveryUnavailable
            }
            let directory = file.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                    attributes: [.protectionKey: FileProtectionType.complete])
            var backup = URLResourceValues(); backup.isExcludedFromBackup = true
            var directoryURL = directory; try directoryURL.setResourceValues(backup)
            try encrypted.write(to: file, options: [.atomic, .completeFileProtection])
            var fileURL = file; try fileURL.setResourceValues(backup)
        } catch let error as ERPFailure { throw error }
        catch { throw ERPFailure.recoveryUnavailable }
    }
}
