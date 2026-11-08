import Foundation
import CryptoKit
import ImageIO

/// Media is a two-receipt workflow. Neither receipt creates a worklog or sends a message.
enum ERPMediaLimits {
    static let images = 10 * 1024 * 1024
    static let pdf = 20 * 1024 * 1024
    static let uploadBody = 28 * 1024 * 1024
    static let download = 25 * 1024 * 1024
    static let selection = 8
    static let pixels = 24_000_000
}

enum ERPMediaFailure: Error, Equatable {
    case unsupportedType, fileUnavailable, invalidFileName, invalidMetadata, differentFile, contextChanged
    case noUploadPermission, unsupportedCatalog, missingSelection, privacyRequired
    case recoveryMismatch, pendingMedia, receiptInvalid, importBusy
}

/// One process-wide drain barrier survives cancellation and replacement of a
/// media view. Its private worker is deliberately not the cancellable view task:
/// CoreTransferable must finish and its stale bytes must be discarded before a
/// later import starts. File I/O stays in the detached provider/file workers.
@MainActor final class ERPMediaImportQueue {
    static let shared = ERPMediaImportQueue()
    private let capacity = 2 // one active operation and at most one waiting operation
    private var outstanding = 0
    private var tail: (id: UUID, task: Task<Void, Never>)?

    func enqueue(_ operation: @escaping @MainActor () async -> Void) throws -> Task<Void, Never> {
        guard outstanding < capacity else { throw ERPMediaFailure.importBusy }
        outstanding += 1
        let previous = tail?.task, id = UUID()
        // Task.init is unstructured: cancelling the caller does not cancel this
        // retained worker or make awaiting its predecessor finish early.
        let worker = Task { @MainActor in
            await previous?.value
            await operation()
            self.outstanding -= 1
            if self.tail?.id == id { self.tail = nil }
        }
        tail = (id, worker)
        // Return only a waiter; callers never receive the retained worker handle.
        return Task { @MainActor in await worker.value }
    }
}

/// A synchronous view/export fence. The client advances it before any logout,
/// origin or observed authority change can suspend. System document callbacks
/// cannot await an actor, so they consult this same fence before exposing bytes.
final class ERPMediaSessionFence: @unchecked Sendable, Equatable {
    private let lock = NSLock()
    private var revision = 0
    func advance(to value: Int) { lock.lock(); revision = value; lock.unlock() }
    func isCurrent(_ value: Int) -> Bool { lock.lock(); defer { lock.unlock() }; return revision == value }
    static func == (lhs: ERPMediaSessionFence, rhs: ERPMediaSessionFence) -> Bool { lhs === rhs }
}

struct ERPMediaAuthority: Sendable, Equatable {
    let clientID: UUID
    let fence: ERPMediaSessionFence
    let origin: String
    let companyId: String
    let userId: String
    let scope: String
    let fingerprint: String
    let revision: Int
    let external: Bool
}

struct ERPMediaContext: Codable, Sendable, Equatable, Identifiable {
    let kind: String
    let recordId: String
    let siteId: String
    let title: String
    var id: String { kind + ":" + recordId }
    var taskId: String? { kind == "task" ? recordId : nil }
    init(record: ERPItem) throws {
        guard ["site", "task"].contains(record.kind), ERPMediaPolicy.validID(record.id) else { throw ERPMediaFailure.contextChanged }
        let site = record.kind == "site" ? record.id : record.data["siteId"]?.string
        guard let site, ERPMediaPolicy.validID(site) else { throw ERPMediaFailure.contextChanged }
        kind = record.kind; recordId = record.id; siteId = site; title = record.title
    }
}

/// Cancellation belongs to this picker/view operation, never to time/GPS or the ERP account.
/// The small synchronous flag closes cancel-before-send races across actor suspension points.
final class ERPMediaTicket: @unchecked Sendable {
    let id = UUID()
    let authority: ERPMediaAuthority
    let context: ERPMediaContext?
    private let lock = NSLock()
    private var cancelled = false
    init(authority: ERPMediaAuthority, context: ERPMediaContext? = nil) {
        self.authority = authority; self.context = context
    }
    func cancel() { lock.lock(); cancelled = true; lock.unlock() }
    func check() throws {
        lock.lock(); let stopped = cancelled; lock.unlock()
        if stopped { throw CancellationError() }
        guard authority.fence.isCurrent(authority.revision) else { throw ERPFailure.accessChanged }
        try Task.checkCancellation()
    }
}

struct ERPMediaInput: Codable, Sendable, Equatable {
    let siteId: String
    let taskId: String?
    let stage: String
    let visibility: String
    let caption: String
    let retentionPurpose: String
    func validate() throws {
        guard ERPMediaPolicy.validID(siteId), taskId == nil || ERPMediaPolicy.validID(taskId!),
              ERPMediaPolicy.stages.contains(stage), ERPMediaPolicy.visibilities.contains(visibility),
              caption.utf16.count <= 2000, (3...2000).contains(retentionPurpose.utf16.count),
              retentionPurpose.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count >= 3 else {
            throw ERPMediaFailure.invalidMetadata
        }
    }
    func data(uploadId: String) throws -> Data {
        try validate()
        guard ERPMediaPolicy.validID(uploadId) else { throw ERPMediaFailure.receiptInvalid }
        var object: [String: Any] = [
            "uploadId": uploadId, "siteId": siteId, "stage": stage, "visibility": visibility,
            "caption": caption, "retentionPurpose": retentionPurpose
        ]
        if let taskId { object["taskId"] = taskId }
        return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }
}

enum ERPMediaPolicy {
    static let stages = ["BEFORE", "AFTER", "DEFECT", "MATERIALS", "DOCUMENT"]
    static let visibilities = ["INTERNAL", "CLIENT_AFTER_APPROVAL", "CONFIDENTIAL"]
    static let externalRoles = ["CLIENT", "CUSTOMER", "EXTERNAL_BAULEITER", "GUEST"]
    static func validID(_ value: String) -> Bool { (1...100).contains(value.utf16.count) }
    static func hash(_ value: Data) -> String { SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined() }
    static func command(_ catalog: [ERPCommand], actor: ERPActor) throws -> ERPCommand {
        guard actor.permissions.contains("media.upload") else { throw ERPMediaFailure.noUploadPermission }
        guard let command = catalog.first(where: { $0.name == "media.register" && $0.permission == "media.upload" }),
              let properties = command.schema?.dictionary?["properties"]?.dictionary,
              ["uploadId", "siteId", "taskId", "stage", "visibility", "caption", "retentionPurpose"].allSatisfy({ properties[$0] != nil }),
              let stage = properties["stage"]?.dictionary?["enum"]?.list?.compactMap({ $0.string }),
              let visibility = properties["visibility"]?.dictionary?["enum"]?.list?.compactMap({ $0.string }),
              Set(stages).isSubset(of: Set(stage)), Set(visibilities).isSubset(of: Set(visibility)) else {
            throw ERPMediaFailure.unsupportedCatalog
        }
        return command
    }
    static func validate(_ input: ERPMediaInput, context: ERPMediaContext, authority: ERPMediaAuthority, mimeType: String) throws {
        try input.validate()
        guard input.siteId == context.siteId, input.taskId == context.taskId else { throw ERPMediaFailure.contextChanged }
        if authority.external {
            guard context.kind == "site", input.taskId == nil, input.stage == "DEFECT",
                  input.visibility == "INTERNAL", mimeType != "application/pdf" else { throw ERPMediaFailure.noUploadPermission }
        }
    }
    static func component(_ value: String) throws -> String {
        guard validID(value) else { throw ERPFailure.invalidPath }
        // Encode the entire identifier as one component, including dots, slash and percent.
        return value.utf8.map { String(format: "%%%02X", $0) }.joined()
    }
    static func mime(_ data: Data) throws -> String {
        let prefix = Array(data.prefix(12))
        if prefix.count >= 3, prefix[0...2].elementsEqual([0xff, 0xd8, 0xff]) { return "image/jpeg" }
        if prefix.count >= 8, prefix.prefix(8).elementsEqual([137,80,78,71,13,10,26,10]) { return "image/png" }
        if prefix.count >= 12, String(bytes: prefix[0..<4], encoding: .ascii) == "RIFF",
           String(bytes: prefix[8..<12], encoding: .ascii) == "WEBP" { return "image/webp" }
        if prefix.count >= 5, String(bytes: prefix.prefix(5), encoding: .ascii) == "%PDF-" { return "application/pdf" }
        throw ERPMediaFailure.unsupportedType
    }
}

struct ERPMediaFile: Sendable {
    let bytes: Data
    let fileName: String
    let mimeType: String
    let sha256: String
    init(bytes: Data, fileName: String, inspectImage: Bool = true) throws {
        guard (1...200).contains(fileName.utf16.count) else { throw ERPMediaFailure.invalidFileName }
        guard !bytes.isEmpty else { throw ERPMediaFailure.fileUnavailable }
        let mime = try ERPMediaPolicy.mime(bytes)
        guard bytes.count <= (mime == "application/pdf" ? ERPMediaLimits.pdf : ERPMediaLimits.images) else { throw ERPFailure.tooLarge }
        if mime != "application/pdf", inspectImage {
            guard let source = CGImageSourceCreateWithData(bytes as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
                  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                  let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
                  let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
                  width.intValue > 0, height.intValue > 0,
                  width.int64Value <= Int64(ERPMediaLimits.pixels) / height.int64Value else {
                throw ERPMediaFailure.unsupportedType
            }
        }
        self.bytes = bytes; self.fileName = fileName; mimeType = mime; sha256 = ERPMediaPolicy.hash(bytes)
    }
    /// File bytes are bounded while reading. No reencoding, bookmark or private disk copy.
    static func read(_ url: URL, securityScoped: Bool, ticket: ERPMediaTicket? = nil) throws -> ERPMediaFile {
        try Task.checkCancellation()
        try ticket?.check()
        guard url.isFileURL else { throw ERPMediaFailure.fileUnavailable }
        let accessed = securityScoped ? url.startAccessingSecurityScopedResource() : false
        if securityScoped && !accessed { throw ERPMediaFailure.fileUnavailable }
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?
        var result: Result<ERPMediaFile, Error>?
        NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: .withoutChanges, error: &coordinationError) { current in
            result = Result { try readCoordinated(current, ticket: ticket) }
        }
        if let coordinationError { throw coordinationError }
        guard let result else { throw ERPMediaFailure.fileUnavailable }
        return try result.get()
    }
    private static func readCoordinated(_ url: URL, ticket: ERPMediaTicket?) throws -> ERPMediaFile {
        try Task.checkCancellation(); try ticket?.check()
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw ERPMediaFailure.fileUnavailable }
        if let size = values.fileSize, size > ERPMediaLimits.pdf { throw ERPFailure.tooLarge }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var data = Data()
        while let chunk = try handle.read(upToCount: min(65_536, ERPMediaLimits.pdf + 1 - data.count)), !chunk.isEmpty {
            try Task.checkCancellation()
            try ticket?.check()
            data.append(chunk)
            guard data.count <= ERPMediaLimits.pdf else { throw ERPFailure.tooLarge }
            if data.count >= 12 {
                let mime = try ERPMediaPolicy.mime(data)
                if mime != "application/pdf", data.count > ERPMediaLimits.images { throw ERPFailure.tooLarge }
            }
        }
        try ticket?.check()
        return try ERPMediaFile(bytes: data, fileName: url.lastPathComponent)
    }
}

enum ERPMediaPhase: String, Codable, Sendable {
    case uploadPending = "UPLOAD_PENDING", uploaded = "UPLOADED"
    case registerPending = "REGISTER_PENDING", registered = "REGISTERED"
    var order: Int { switch self { case .uploadPending: return 0; case .uploaded: return 1; case .registerPending: return 2; case .registered: return 3 } }
}

/// Metadata only. Original bytes, URI/bookmark, cookie, CSRF and credentials are never encoded.
struct ERPMediaPending: Codable, Sendable, Equatable, Identifiable {
    let format: Int
    let scope: String
    let authorityHash: String
    let origin: String
    let companyId: String
    let userId: String
    let uploadKey: String
    let registerKey: String
    let sha256: String
    let fileName: String
    let mimeType: String
    let byteSize: Int
    let redactionConfirmed: Bool
    let input: ERPMediaInput
    var phase: ERPMediaPhase
    var uploadId: String?
    var assetId: String?
    var assetVersion: Int?
    var id: String { uploadKey }
    init(file: ERPMediaFile, authority: ERPMediaAuthority, input: ERPMediaInput,
         redactionConfirmed: Bool, uploadKey: String = UUID().uuidString, registerKey: String = UUID().uuidString) throws {
        format = 1; scope = authority.scope; authorityHash = authority.fingerprint
        origin = authority.origin; companyId = authority.companyId; userId = authority.userId
        self.uploadKey = uploadKey; self.registerKey = registerKey; sha256 = file.sha256
        fileName = file.fileName; mimeType = file.mimeType; byteSize = file.bytes.count
        self.redactionConfirmed = redactionConfirmed; self.input = input; phase = .uploadPending
        try validate(scope: scope)
    }
    func validate(scope expected: String) throws {
        guard format == 1, scope == expected, scope.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              authorityHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let url = ERPOrigin.validate(origin), url.absoluteString == origin,
              try ERPPendingCommand.scope(origin: url, companyId: companyId, userId: userId) == scope,
              UUID(uuidString: uploadKey) != nil, UUID(uuidString: registerKey) != nil, uploadKey != registerKey,
              sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              (1...200).contains(fileName.utf16.count), ["image/jpeg","image/png","image/webp","application/pdf"].contains(mimeType),
              byteSize > 0, byteSize <= (mimeType == "application/pdf" ? ERPMediaLimits.pdf : ERPMediaLimits.images) else { throw ERPFailure.recoveryInvalid }
        try input.validate()
        if phase != .uploadPending { guard let uploadId, ERPMediaPolicy.validID(uploadId) else { throw ERPFailure.recoveryInvalid } }
        else if uploadId != nil { throw ERPFailure.recoveryInvalid }
        if phase == .registered {
            guard let assetId, ERPMediaPolicy.validID(assetId), let assetVersion, assetVersion > 0 else { throw ERPFailure.recoveryInvalid }
        } else if assetId != nil || assetVersion != nil { throw ERPFailure.recoveryInvalid }
    }
    func matches(_ authority: ERPMediaAuthority) -> Bool {
        scope == authority.scope && authorityHash == authority.fingerprint && origin == authority.origin &&
        companyId == authority.companyId && userId == authority.userId
    }
    func sameMutation(as other: Self) -> Bool {
        var a = self, b = other
        a.phase = .uploadPending; a.uploadId = nil; a.assetId = nil; a.assetVersion = nil
        b.phase = .uploadPending; b.uploadId = nil; b.assetId = nil; b.assetVersion = nil
        return a == b
    }
    func uploadBody(file: ERPMediaFile) throws -> Data {
        guard phase == .uploadPending, uploadId == nil,
              file.sha256 == sha256, file.bytes.count == byteSize, file.mimeType == mimeType else { throw ERPMediaFailure.differentFile }
        // Keep one original file and one HTTP body. Never allocate a complete
        // base64 String or round-trip the large JSON through JSONSerialization.
        let encoder = JSONEncoder()
        let name = try encoder.encode(fileName), mime = try encoder.encode(mimeType)
        let capacity = 4 * ((byteSize + 2) / 3) + name.count + mime.count + 96
        guard capacity <= ERPMediaLimits.uploadBody else { throw ERPFailure.tooLarge }
        var body = Data(); body.reserveCapacity(capacity)
        body.append(Data("{\"base64\":\"".utf8))
        let block = 48 * 1024 // Divisible by three: padding appears only in the final block.
        for offset in stride(from: 0, to: file.bytes.count, by: block) {
            body.append(file.bytes.subdata(in: offset..<min(offset + block, file.bytes.count)).base64EncodedData())
        }
        body.append(Data("\",\"fileName\":".utf8)); body.append(name)
        body.append(Data(",\"mimeType\":".utf8)); body.append(mime)
        body.append(Data(",\"redactionConfirmed\":\(redactionConfirmed ? "true" : "false")}".utf8))
        guard body.count <= ERPMediaLimits.uploadBody else { throw ERPFailure.tooLarge }
        return body
    }
}

struct ERPMediaUploadReceipt: Decodable, Sendable {
    let uploadId: String
    let byteSize: Int
    let metadataStripped: Bool
    let scanState: String
    func validate(_ pending: ERPMediaPending) throws {
        guard ERPMediaPolicy.validID(uploadId), byteSize == pending.byteSize, scanState == "CLEAN" else { throw ERPMediaFailure.receiptInvalid }
    }
}
struct ERPMediaUploadResult: Sendable {
    let pending: ERPMediaPending
    let receipt: ERPMediaUploadReceipt
    let recoveryWarning: Bool
}
struct ERPMediaRegistrationResult: Sendable {
    let pending: ERPMediaPending
    let asset: ERPItem?
    let recoveryWarning: Bool
}
struct ERPMediaDownload: Sendable {
    let assetId: String
    let bytes: Data
    let mimeType: String
}
