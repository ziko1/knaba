import Foundation

private final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
struct APIFailure: Error, LocalizedError { let code: String, status: Int; var errorDescription: String? { code } }
private struct ErrorBody: Decodable { let code: String? }
private struct EventReceipt: Decodable { let eventId: String, status: String, code: String? }
private struct EventReceipts: Decodable { let results: [EventReceipt], apiVersion: Int }

actor NativeAPI {
    private let store: SecureStore
    private let transport: URLSession
    private var syncing = false
    init(store: SecureStore) {
        self.store = store; let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 30; config.httpCookieStorage = nil; config.urlCache = nil
        transport = URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }
    private func send(_ path: String, body: JSONValue? = nil, authenticated: Bool = true) async throws -> Data {
        let origin: URL; var token: String?; let epoch: Int
        if authenticated { let credentials = try await store.credentials(); origin = credentials.origin; token = credentials.deviceToken; epoch = credentials.authorizationEpoch }
        else { epoch = await store.authorizationEpoch(); let state = try await store.read(); guard let url = URL(string: state.origin), url.scheme == "https" else { throw NativeError.failure("HTTPS_ORIGIN_REQUIRED") }; origin = url }
        guard let url = URL(string: origin.absoluteString + path), url.scheme == "https", url.host == origin.host else { throw NativeError.failure("INVALID_API_URL") }
        var request = URLRequest(url: url); request.httpMethod = body == nil ? "GET" : "POST"; request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONEncoder().encode(body) }
        let (data, raw) = try await transport.data(for: request)
        guard await store.authorizationEpoch() == epoch else { throw NativeError.failure("ACCESS_REVOKED") }
        guard data.count <= 2 * 1024 * 1024, let response = raw as? HTTPURLResponse else { throw NativeError.failure("INVALID_RESPONSE") }
        guard (200..<300).contains(response.statusCode) else { let failure = try? JSONDecoder().decode(ErrorBody.self, from: data); throw APIFailure(code: failure?.code ?? "HTTP_ERROR", status: response.statusCode) }; return data
    }
    func enroll(code: String) async throws {
        let epoch = await store.authorizationEpoch()
        guard (20...100).contains(code.count), (try await store.read()).queue.isEmpty else { throw NativeError.failure("SYNC_QUEUE_BEFORE_ENROLLMENT") }
        let data = try await send("/api/v1/mobile/enroll", body: .object(["code": .string(code), "platform": .string("IOS"), "deviceName": .string("iPhone KNABA DE")]), authenticated: false)
        try await store.install(JSONDecoder().decode(Enrollment.self, from: data), expectedEpoch: epoch)
    }
    func session() async throws -> TrackingSession {
        let epoch = await store.authorizationEpoch()
        let data = try await send("/api/v1/mobile/session")
        let session = try JSONDecoder().decode(TrackingSession.self, from: data)
        let credentials = try await store.credentials(); guard credentials.authorizationEpoch == epoch, session.apiVersion == 1, session.deviceId == credentials.deviceId, session.employeeId == credentials.employeeId, session.valid else { throw NativeError.failure("INVALID_OR_FOREIGN_SESSION") }; return session
    }
    /// Only receipt-matching event IDs leave the queue. Transport failures retain original IDs/time/order.
    func sync() async throws -> Int {
        if syncing { return 0 }; syncing = true; defer { syncing = false }; try await store.expireLocationEvents()
        let epoch = await store.authorizationEpoch()
        let state = try await store.read(); let items = state.queue; var completed = 0
        for item in items.prefix(100) {
            if item.kind == "EVENT" {
                let data = try await send("/api/v1/mobile/events", body: .object(["events": .array([.object(["command": .string(item.command), "input": .object(item.input)])])]))
                let receipts = try JSONDecoder().decode(EventReceipts.self, from: data)
                guard receipts.apiVersion == 1, let ack = receipts.results.first(where: { $0.eventId == item.id }), ["ACCEPTED", "REJECTED"].contains(ack.status) else { throw NativeError.failure("EVENT_ACK_MISMATCH") }
                try await store.acknowledge(item, rejection: ack.status == "REJECTED" ? ack.code ?? "EVENT_REJECTED" : nil, expectedEpoch: epoch)
            } else {
                do { let data = try await send("/api/v1/commands", body: .object(["command": .string(item.command), "input": .object(item.input), "idempotency_key": .string(item.id)])); try await store.acknowledge(item, result: JSONDecoder().decode(JSONValue.self, from: data), expectedEpoch: epoch) }
                catch let error as APIFailure {
                    if [400, 409, 422].contains(error.status) { try await store.acknowledge(item, rejection: error.code, expectedEpoch: epoch); throw error }
                    throw error
                }
            }
            completed += 1
        }
        return completed
    }
}
