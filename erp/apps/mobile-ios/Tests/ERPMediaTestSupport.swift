import XCTest
@testable import KNABADE

enum MediaFixtures {
    static let origin = "https://erp.example.test"
    static let company = "company-a"
    static func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
    static func identity(user: String = "user-a", company: String = MediaFixtures.company, roles: [String] = ["EMPLOYEE"],
                         permissions: [String] = ["media.upload", "media.read", "task.read"], warehouses: [String] = []) -> Data {
        json(["actor": ["userId": user, "companyId": company, "roles": roles, "permissions": permissions,
                         "siteIds": ["site-a"], "customerIds": [], "warehouseIds": warehouses, "mfaVerified": false],
              "user": ["id": user, "name": "Synthetic actor"], "csrfToken": String(repeating: "c", count: 43), "mode": "TEST"])
    }
    static let catalog = json(["items": [["name": "media.register", "permission": "media.upload", "highRisk": false,
        "schema": ["type": "object", "properties": [
            "uploadId": ["type": "string", "minLength": 1, "maxLength": 100],
            "siteId": ["type": "string"], "taskId": ["type": "string"],
            "stage": ["type": "string", "enum": ["BEFORE", "AFTER", "DEFECT", "MATERIALS", "DOCUMENT"]],
            "visibility": ["type": "string", "enum": ["INTERNAL", "CLIENT_AFTER_APPROVAL", "CONFIDENTIAL"]],
            "caption": ["type": "string", "maxLength": 2000], "retentionPurpose": ["type": "string", "minLength": 3, "maxLength": 2000]
        ], "required": ["uploadId", "stage", "retentionPurpose"], "additionalProperties": false]]]])
    static func record(kind: String = "task", id: String = "task-a", company: String = MediaFixtures.company, site: String = "site-a", version: Int = 1) -> [String: Any] {
        ["id": id, "kind": kind, "companyId": company, "version": version, "createdAt": "2026-11-08T10:00:00.000Z",
         "data": ["name": "Synthetic context", "siteId": site]]
    }
    static func item(_ record: [String: Any]) throws -> ERPItem { try JSONDecoder().decode(ERPItem.self, from: json(record)) }
    static func page(_ values: [[String: Any]]) -> Data { json(["items": values, "has_more": false, "next_cursor": NSNull()]) }
    static func asset(company: String = MediaFixtures.company, site: String = "site-a", task: String? = "task-a", id: String = "asset-a", version: Int = 1) -> [String: Any] {
        var data: [String: Any] = ["uploadId": String(repeating: "a", count: 64), "siteId": site, "stage": "BEFORE", "visibility": "INTERNAL",
                                   "caption": "Synthetic photo", "retentionPurpose": "Work evidence", "state": "RECEIVED", "uploadedAt": "2026-11-08T10:00:00.000Z"]
        if let task { data["taskId"] = task }
        return ["id": id, "kind": "media_asset", "companyId": company, "version": version, "createdAt": "2026-11-08T10:00:00.000Z", "data": data]
    }
    static func pdf(_ length: Int = 30) throws -> ERPMediaFile {
        var bytes = Data("%PDF-1.7\n".utf8); bytes.append(Data(repeating: 65, count: max(0, length - bytes.count)))
        return try ERPMediaFile(bytes: bytes, fileName: "synthetic.pdf")
    }
    static func input(task: String? = "task-a", stage: String = "BEFORE", visibility: String = "INTERNAL") -> ERPMediaInput {
        ERPMediaInput(siteId: "site-a", taskId: task, stage: stage, visibility: visibility, caption: "Synthetic photo", retentionPurpose: "Work evidence")
    }
}

final class MediaMemoryJournal: ERPMediaJournal, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: ERPMediaPending] = [:]
    private var failPhase: ERPMediaPhase?
    private var failAll = false
    private var failRemove = false
    func fail(phase: ERPMediaPhase? = nil, all: Bool = false) { lock.lock(); defer { lock.unlock() }; failPhase = phase; failAll = all }
    func failRemoval(_ value: Bool) { lock.lock(); defer { lock.unlock() }; failRemove = value }
    func read(scope: String) throws -> ERPMediaPending? { lock.lock(); defer { lock.unlock() }; return values[scope] }
    func persist(_ value: ERPMediaPending) throws {
        lock.lock(); defer { lock.unlock() }
        if failAll || value.phase == failPhase { throw ERPFailure.recoveryUnavailable }
        try value.validate(scope: value.scope)
        if let old = values[value.scope] {
            guard old.sameMutation(as: value), value.phase.order >= old.phase.order else { throw ERPMediaFailure.pendingMedia }
        }
        values[value.scope] = value
    }
    func remove(scope: String, uploadKey: String) throws {
        lock.lock(); defer { lock.unlock() }
        if failRemove { throw ERPFailure.recoveryUnavailable }
        guard values[scope]?.uploadKey == uploadKey, values[scope]?.phase == .registered else { throw ERPFailure.recoveryInvalid }
        values.removeValue(forKey: scope)
    }
}

final class MediaCommandJournal: ERPCommandJournal, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: ERPPendingCommand] = [:]
    private var failRemove = false
    func failRemoval(_ value: Bool) { lock.lock(); defer { lock.unlock() }; failRemove = value }
    func read(scope: String) throws -> ERPPendingCommand? { lock.lock(); defer { lock.unlock() }; return values[scope] }
    func persist(_ value: ERPPendingCommand) throws {
        lock.lock(); defer { lock.unlock() }
        guard values[value.scope] == nil || values[value.scope] == value else { throw ERPFailure.pendingCommand }
        values[value.scope] = value
    }
    func remove(scope: String, idempotencyKey: String) throws {
        lock.lock(); defer { lock.unlock() }
        if failRemove { throw ERPFailure.recoveryUnavailable }
        guard values[scope]?.idempotencyKey == idempotencyKey else { throw ERPFailure.recoveryInvalid }
        values.removeValue(forKey: scope)
    }
}

/// HTTP transport double; the production actor, authority fences, canonical
/// request builders and journals above it are real. This is not PG/live evidence.
actor MediaTransport: ERPConsoleTransport {
    var identity = MediaFixtures.identity()
    var catalog = MediaFixtures.catalog
    var taskPage = MediaFixtures.page([MediaFixtures.record()])
    var sitePage = MediaFixtures.page([MediaFixtures.record(kind: "site", id: "site-a")])
    var gallery = MediaFixtures.page([MediaFixtures.asset()])
    var uploadErrors: [URLError.Code] = []
    var registerErrors: [URLError.Code] = []
    var uploadStatus = 200
    var registerStatus = 200
    var uploadByteDelta = 0
    var registerOverride: Data?
    var galleryError: URLError.Code?
    var binary = Data("%PDF-1.7\nsynthetic".utf8)
    var binaryMime = "application/pdf"
    var binaryURL: URL?
    private var recorded: [URLRequest] = []
    private var holdPath: String?
    private var holdSignal: XCTestExpectation?
    private var continuation: CheckedContinuation<Void, Never>?
    let mutationObserver: (@Sendable (URLRequest) -> Void)?
    init(mutationObserver: (@Sendable (URLRequest) -> Void)? = nil) { self.mutationObserver = mutationObserver }
    func setIdentity(_ value: Data) { identity = value }
    func setUploadErrors(_ value: [URLError.Code]) { uploadErrors = value }
    func setRegisterErrors(_ value: [URLError.Code]) { registerErrors = value }
    func setUploadStatus(_ value: Int) { uploadStatus = value }
    func setUploadByteDelta(_ value: Int) { uploadByteDelta = value }
    func setRegisterOverride(_ value: Data) { registerOverride = value }
    func setGallery(_ value: Data) { gallery = value }
    func setGalleryError(_ value: URLError.Code?) { galleryError = value }
    func setTaskPage(_ value: Data) { taskPage = value }
    func setBinary(_ value: Data, mime: String, url: URL? = nil) { binary = value; binaryMime = mime; binaryURL = url }
    func hold(_ path: String, signal: XCTestExpectation) { holdPath = path; holdSignal = signal }
    func release() { continuation?.resume(); continuation = nil }
    func requests() -> [URLRequest] { recorded }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        recorded.append(request)
        let path = request.url!.path
        if holdPath == path {
            holdPath = nil
            await withCheckedContinuation { continuation in self.continuation = continuation; holdSignal?.fulfill() }
        }
        var response = Data("{}".utf8), status = 200, headers = ["Content-Type": "application/json"]
        var url = request.url!
        switch path {
        case "/api/v1/auth/login":
            response = identity; headers["Set-Cookie"] = "knaba_session=\(String(repeating: "s", count: 43)); Path=/; Secure; HttpOnly"
        case "/api/v1/me": response = identity
        case "/api/v1/auth/logout": break
        case "/api/v1/commands": response = catalog
        case "/api/v1/entities/task": response = taskPage
        case "/api/v1/entities/site": response = sitePage
        case "/api/v1/entities/media_asset":
            if let galleryError { throw URLError(galleryError) }
            response = gallery
        case "/api/v1/media/uploads":
            mutationObserver?(request)
            if !uploadErrors.isEmpty { throw URLError(uploadErrors.removeFirst()) }
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            let bytes = Data(base64Encoded: body["base64"] as! String)!
            response = MediaFixtures.json(["uploadId": String(repeating: "a", count: 64), "byteSize": bytes.count + uploadByteDelta, "metadataStripped": false, "scanState": "CLEAN"])
            status = uploadStatus
            if status != 200 { response = MediaFixtures.json(["code": status == 429 ? "RATE_LIMITED" : "ACCESS_DENIED"]) }
        case "/api/v1/commands/media.register":
            mutationObserver?(request)
            if !registerErrors.isEmpty { throw URLError(registerErrors.removeFirst()) }
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            var input = body["input"] as! [String: Any]
            input["state"] = "RECEIVED"
            response = registerOverride ?? MediaFixtures.json(["id": "asset-a", "companyId": MediaFixtures.company, "kind": "media_asset", "version": 1, "data": input])
            status = registerStatus
        default:
            if path.hasPrefix("/api/v1/media/") && path.hasSuffix("/file") {
                response = binary; headers["Content-Type"] = binaryMime; url = binaryURL ?? url
            } else { throw URLError(.unsupportedURL) }
        }
        return (response, HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
    }
}

@MainActor func mediaSignIn(_ client: ERPConsoleClient) async throws {
    try await client.configure(MediaFixtures.origin)
    _ = try await client.login(email: "synthetic@example.test", password: "Synthetic only")
}

@MainActor func mediaTicket(_ client: ERPConsoleClient, kind: String = "task", id: String = "task-a") async throws -> ERPMediaTicket {
    let authority = try await client.mediaAuthority()
    let record = try MediaFixtures.item(MediaFixtures.record(kind: kind, id: id))
    return ERPMediaTicket(authority: authority, context: try ERPMediaContext(record: record))
}
