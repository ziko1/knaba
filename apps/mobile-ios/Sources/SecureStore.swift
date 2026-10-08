import Foundation
import Security
import CryptoKit

enum Keychain {
    private static let service = "de.knaba.mobile.v1"
    static func read(_ account: String) throws -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?; let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }; guard status == errSecSuccess, let value = result as? Data else { throw NativeError.failure("KEYCHAIN_UNAVAILABLE") }; return value
    }
    static func write(_ data: Data, account: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        let changes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, changes as CFDictionary)
        if status == errSecItemNotFound { var item = query; changes.forEach { item[$0.key] = $0.value }; guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw NativeError.failure("KEYCHAIN_WRITE_FAILED") } }
        else if status != errSecSuccess { throw NativeError.failure("KEYCHAIN_WRITE_FAILED") }
    }
    static func remove(_ account: String) { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] as CFDictionary) }
}

/// Serialized AES-GCM queue. Tokens and encryption key are Keychain-only, device-bound and excluded from backup.
actor SecureStore {
    private let file: URL
    private let maximumItems = 5000, maximumBytes = 4 * 1024 * 1024
    private var epoch = 0
    func authorizationEpoch() -> Int { epoch }
    func invalidatePendingAuthorization() { epoch += 1 }
    private func requireEpoch(_ expected: Int?) throws {
        if let expected, expected != epoch { throw NativeError.failure("ACCESS_REVOKED") }
    }
    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("KNABADE", isDirectory: true)
        file = base.appendingPathComponent("queue-v1.aesgcm")
    }
    private func encryptionKey() throws -> SymmetricKey {
        if let key = try Keychain.read("queue-key") { guard key.count == 32 else { throw NativeError.failure("INVALID_QUEUE_KEY") }; return SymmetricKey(data: key) }
        let key = SymmetricKey(size: .bits256); try Keychain.write(key.withUnsafeBytes { Data($0) }, account: "queue-key"); return key
    }
    func read() throws -> NativeState {
        guard FileManager.default.fileExists(atPath: file.path) else { return NativeState() }
        let bytes = try Data(contentsOf: file); guard bytes.count <= maximumBytes + 64 else { throw NativeError.failure("QUEUE_TOO_LARGE") }
        let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: encryptionKey())
        return try JSONDecoder().decode(NativeState.self, from: plaintext)
    }
    private func write(_ state: NativeState) throws {
        let plain = try JSONEncoder().encode(state); guard plain.count <= maximumBytes else { throw NativeError.failure("OFFLINE_QUEUE_FULL") }
        guard let encrypted = try AES.GCM.seal(plain, using: encryptionKey()).combined else { throw NativeError.failure("ENCRYPTION_FAILED") }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encrypted.write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: file.path)
        var url = file; var options = URLResourceValues(); options.isExcludedFromBackup = true; try url.setResourceValues(options)
    }
    func configure(_ raw: String) throws {
        guard let parts = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)), parts.scheme == "https", parts.host != nil, parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil, parts.path == "" || parts.path == "/", let url = parts.url else { throw NativeError.failure("HTTPS_ORIGIN_REQUIRED") }
        var state = try read(); let origin = url.absoluteString.hasSuffix("/") ? String(url.absoluteString.dropLast()) : url.absoluteString
        guard state.deviceId.isEmpty || state.origin == origin else { throw NativeError.failure("SIGN_OUT_BEFORE_ORIGIN_CHANGE") }
        if state.origin != origin { epoch += 1 }; state.origin = origin; try write(state)
    }
    func install(_ enrollment: Enrollment, expectedEpoch: Int? = nil) throws {
        try requireEpoch(expectedEpoch)
        let previous = try read(); guard previous.queue.isEmpty else { throw NativeError.failure("SYNC_OR_RECONCILE_QUEUE_BEFORE_DEVICE_CHANGE") }
        try Keychain.write(Data(enrollment.deviceToken.utf8), account: "device-token")
        epoch += 1
        var state = NativeState(); state.origin = previous.origin; state.deviceId = enrollment.deviceId; state.employeeId = enrollment.employeeId; try write(state)
    }
    func credentials() throws -> Credentials {
        let state = try read(); guard let url = URL(string: state.origin), !state.deviceId.isEmpty, let tokenData = try Keychain.read("device-token"), let token = String(data: tokenData, encoding: .utf8) else { throw NativeError.failure("DEVICE_NOT_ENROLLED") }
        return Credentials(origin: url, deviceId: state.deviceId, employeeId: state.employeeId, deviceToken: token, authorizationEpoch: epoch)
    }
    @discardableResult func enqueue(_ command: String, input: [String: JSONValue], event: Bool = false) throws -> String {
        var state = try read(); guard state.queue.count < maximumItems else { throw NativeError.failure("OFFLINE_QUEUE_FULL") }; let id = UUID().uuidString
        var payload = input
        if event { state.sequenceNumber += 1; payload["sequenceNumber"] = .number(Double(state.sequenceNumber)); payload["eventId"] = .string(id) }
        state.queue.append(QueueItem(id: id, kind: event ? "EVENT" : "COMMAND", command: command, createdAt: Clock.iso(), input: payload)); try write(state); return id
    }
    func acknowledge(_ item: QueueItem, rejection: String? = nil, result: JSONValue? = nil, expectedEpoch: Int? = nil) throws {
        try requireEpoch(expectedEpoch)
        var state = try read(); guard state.queue.contains(where: { $0.id == item.id }) else { return }
        if let code = rejection { state.reconciliation.append(Reconciliation(id: item.id, command: item.command, code: code, observedAt: item.input["observedAt"]?.string ?? item.input["occurredAt"]?.string, receivedAt: Clock.iso())); state.reconciliation = Array(state.reconciliation.suffix(200)) }
        else if let object = result?.object, let recordId = object["id"]?.string {
            if item.command == "shift.start" { state.manualShiftId = recordId }; if item.command == "trip.start" { state.manualTripId = recordId }
            if ["trip.arrive", "trip.end"].contains(item.command) { state.manualTripId = nil }; if item.command == "shift.end" { state.manualShiftId = nil; state.manualTripId = nil }
        }
        state.queue.removeAll { $0.id == item.id }; try write(state)
    }
    func purgeLocationSince(_ at: Date) throws {
        var state = try read(); state.queue.removeAll { item in item.kind == "EVENT" && (Clock.parse(item.input["observedAt"]?.string ?? "") ?? .distantFuture) >= at }; try write(state)
    }
    func expireLocationEvents() throws {
        var state = try read(); let now = Date()
        func missingAuthority(_ item: QueueItem) -> Bool {
            item.input["trackingSessionId"]?.string?.isEmpty != false || UUID(uuidString: item.input["bootSessionId"]?.string ?? "") == nil || (item.input["monotonicElapsedMs"]?.number ?? -1) < 0 || item.command == "presence.ingest" && item.input["geofenceVersionId"]?.string?.isEmpty != false
        }
        let expired = state.queue.filter { $0.kind == "EVENT" && (missingAuthority($0) || NativeTrackingPolicy.gpsExpired(observedAt: Clock.parse($0.input["observedAt"]?.string ?? ""), now: now)) }
        for item in expired {
            let at = Clock.parse(item.input["observedAt"]?.string ?? "")
            let code = missingAuthority(item) ? "LEGACY_EVENT_LEASE_REVIEW_REQUIRED" : at == nil || at! > now ? "INVALID_EVENT_TIME" : "LOCAL_RETENTION_EXPIRED"
            state.reconciliation.append(Reconciliation(id: item.id, command: item.command, code: code, observedAt: item.input["observedAt"]?.string, receivedAt: Clock.iso(now)))
        }
        let ids = Set(expired.map(\.id)); state.queue.removeAll { ids.contains($0.id) }; state.reconciliation = Array(state.reconciliation.suffix(200)); try write(state)
    }
    func clear() throws { epoch += 1; if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }; Keychain.remove("device-token"); Keychain.remove("queue-key") }
}
