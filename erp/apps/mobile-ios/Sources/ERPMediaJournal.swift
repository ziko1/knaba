import Foundation
import CryptoKit
import Security

protocol ERPMediaJournal: Sendable {
    func read(scope: String) throws -> ERPMediaPending?
    func persist(_ pending: ERPMediaPending) throws
    func remove(scope: String, uploadKey: String) throws
}

/// Separate from ERP command recovery and employee/GPS enrollment.
struct ERPMediaRecoveryKeychain: ERPRecoveryKeyStore {
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "de.knaba.mobile.erp-media-recovery.v1",
         kSecAttrAccount as String: "aes-gcm-key", kSecAttrSynchronizable as String: false]
    }
    func read() throws -> Data? {
        var input = query
        input[kSecReturnData as String] = true; input[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(input as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let value = item as? Data else { throw ERPFailure.recoveryUnavailable }
        return value
    }
    func create(_ value: Data) throws {
        guard value.count == 32 else { throw ERPFailure.recoveryInvalid }
        var input = query
        input[kSecValueData as String] = value
        input[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(input as CFDictionary, nil) == errSecSuccess else { throw ERPFailure.recoveryUnavailable }
    }
}

/// Synchronous bounded transactions make persistence-before-send indivisible with
/// respect to actor reentrancy. The encrypted record contains metadata, never file bytes.
final class ERPEncryptedMediaJournal: ERPMediaJournal, @unchecked Sendable {
    private struct State: Codable { let version: Int; var items: [String: ERPMediaPending] }
    private static let lock = NSLock()
    private static let maximumScopes = 16
    private static let maximumBytes = 512 * 1024
    private static let aad = Data("KNABA-ERP-MEDIA-RECOVERY-v1".utf8)
    private let file: URL
    private let keys: any ERPRecoveryKeyStore
    init(directory: URL? = nil, keys: any ERPRecoveryKeyStore = ERPMediaRecoveryKeychain()) {
        let folder = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KNABADE", isDirectory: true).appendingPathComponent("ERPMediaRecovery", isDirectory: true)
        file = folder.appendingPathComponent("erp-media-metadata-v1.aesgcm")
        self.keys = keys
    }
    func read(scope: String) throws -> ERPMediaPending? {
        Self.lock.lock(); defer { Self.lock.unlock() }
        try validScope(scope)
        return try load().items[scope]
    }
    func persist(_ pending: ERPMediaPending) throws {
        Self.lock.lock(); defer { Self.lock.unlock() }
        try pending.validate(scope: pending.scope)
        var state = try load()
        if let old = state.items[pending.scope] {
            guard old.sameMutation(as: pending), pending.phase.order >= old.phase.order,
                  old.uploadId == nil || old.uploadId == pending.uploadId,
                  old.assetId == nil || old.assetId == pending.assetId,
                  old.assetVersion == nil || old.assetVersion == pending.assetVersion else { throw ERPMediaFailure.pendingMedia }
        } else {
            guard state.items.count < Self.maximumScopes else { throw ERPFailure.recoveryUnavailable }
        }
        state.items[pending.scope] = pending
        try save(state)
    }
    func remove(scope: String, uploadKey: String) throws {
        Self.lock.lock(); defer { Self.lock.unlock() }
        try validScope(scope)
        var state = try load()
        guard let old = state.items[scope] else { return }
        guard old.uploadKey == uploadKey, old.phase == .registered else { throw ERPFailure.recoveryInvalid }
        state.items.removeValue(forKey: scope)
        try save(state)
    }
    private func validScope(_ value: String) throws {
        guard value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw ERPFailure.recoveryInvalid }
    }
    private func key() throws -> Data? {
        do {
            let value = try keys.read()
            guard value == nil || value?.count == 32 else { throw ERPFailure.recoveryInvalid }
            return value
        } catch let error as ERPFailure { throw error }
        catch { throw ERPFailure.recoveryUnavailable }
    }
    private func load() throws -> State {
        let secret = try key()
        guard FileManager.default.fileExists(atPath: file.path) else {
            guard secret == nil else { throw ERPFailure.recoveryInvalid }
            return State(version: 1, items: [:])
        }
        guard let secret else { throw ERPFailure.recoveryInvalid }
        do {
            let handle = try FileHandle(forReadingFrom: file)
            defer { try? handle.close() }
            var encrypted = Data()
            while let chunk = try handle.read(upToCount: min(65_536, Self.maximumBytes + 65 - encrypted.count)), !chunk.isEmpty {
                encrypted.append(chunk)
                guard encrypted.count <= Self.maximumBytes + 64 else { throw ERPFailure.recoveryInvalid }
            }
            let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: encrypted), using: SymmetricKey(data: secret), authenticating: Self.aad)
            guard plain.count <= Self.maximumBytes else { throw ERPFailure.recoveryInvalid }
            let state = try JSONDecoder().decode(State.self, from: plain)
            guard state.version == 1, state.items.count <= Self.maximumScopes else { throw ERPFailure.recoveryInvalid }
            for (scope, value) in state.items { try value.validate(scope: scope) }
            return state
        } catch let error as ERPFailure { throw error }
        catch let error as CocoaError where [.fileReadNoPermission, .fileReadUnknown].contains(error.code) { throw ERPFailure.recoveryUnavailable }
        catch { throw ERPFailure.recoveryInvalid }
    }
    private func save(_ state: State) throws {
        do {
            let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
            let plain = try encoder.encode(state)
            guard plain.count <= Self.maximumBytes else { throw ERPFailure.recoveryUnavailable }
            let secret: Data
            if let value = try key() { secret = value }
            else {
                let generated = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
                try keys.create(generated)
                guard let stored = try key(), stored == generated else { throw ERPFailure.recoveryUnavailable }
                secret = stored
            }
            guard let encrypted = try AES.GCM.seal(plain, using: SymmetricKey(data: secret), authenticating: Self.aad).combined else {
                throw ERPFailure.recoveryUnavailable
            }
            var directory = file.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                    attributes: [.protectionKey: FileProtectionType.complete])
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            try directory.setResourceValues(values)
            try encrypted.write(to: file, options: [.atomic, .completeFileProtection])
            var written = file; try written.setResourceValues(values)
        } catch let error as ERPFailure { throw error }
        catch { throw ERPFailure.recoveryUnavailable }
    }
}
