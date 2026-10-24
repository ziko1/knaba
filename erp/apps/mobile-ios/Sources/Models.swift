import Foundation
import CoreLocation

enum NativeError: Error, LocalizedError {
    case failure(String)
    var errorDescription: String? { if case .failure(let code) = self { return code }; return "NATIVE_ERROR" }
    var requiresPrivacyStop: Bool {
        if case .failure(let code) = self { return ["ACCESS_REVOKED", "INVALID_OR_FOREIGN_SESSION", "DEVICE_NOT_ENROLLED", "SESSION_EXPIRED"].contains(code) }
        return true
    }
}
enum JSONValue: Codable, Sendable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try c.decode([JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self { case .string(let v): try c.encode(v); case .number(let v): try c.encode(v); case .bool(let v): try c.encode(v); case .object(let v): try c.encode(v); case .array(let v): try c.encode(v); case .null: try c.encodeNil() }
    }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    var object: [String: JSONValue]? { if case .object(let v) = self { return v }; return nil }
    var number: Double? { if case .number(let v) = self { return v }; return nil }
}
enum Clock {
    static func iso(_ date: Date = Date()) -> String { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.string(from: date) }
    static func parse(_ string: String) -> Date? { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; if let d = f.date(from: string) { return d }; f.formatOptions = [.withInternetDateTime]; return f.date(from: string) }
}
enum TrackingMode: String, Codable, Sendable { case off = "OFF", privateBreak = "PRIVATE_BREAK", sitePresence = "SITE_PRESENCE", businessTravel = "BUSINESS_TRAVEL" }
struct Geofence: Codable, Sendable, Equatable {
    let latitude: Double, longitude: Double, radiusEnterM: Double, radiusExitM: Double
    let maxAccuracyM: Double, maxAgeSeconds: Double, dwellSeconds: Double
    let exceptionZones: [ExceptionZone]?
    var algorithmVersion: String? = nil
    var minimumSamples: Int? = nil
    var maxSampleGapSeconds: Double? = nil
    var staleAfterSeconds: Double? = nil
    struct ExceptionZone: Codable, Sendable, Equatable { let latitude: Double, longitude: Double, radiusM: Double; let reason: String }
}
struct TrackingSession: Codable, Sendable {
    let deviceId: String, employeeId: String, apiVersion: Int, expiresAt: String, mode: TrackingMode
    let shiftId: String?, tripId: String?, siteId: String?, policyVersionId: String?, reason: String?, siteGeofence: Geofence?
    var shiftSummary: NativeShiftSummary? = nil
    var trackingSessionId: String? = nil
    var geofenceVersionId: String? = nil
    var ownShiftSummary: NativeShiftSummary? {
        guard let summary = shiftSummary, summary.shiftId == shiftId,
              siteId == nil || summary.siteId == siteId else { return nil }
        return summary
    }
    var valid: Bool { guard let end = Clock.parse(expiresAt) else { return false }; return NativeTrackingPolicy.validLease(expiresAt: end, now: Date()) }
    var permitsLocation: Bool { valid && (mode == .sitePresence || mode == .businessTravel) && shiftId?.isEmpty == false && policyVersionId?.isEmpty == false && trackingSessionId?.isEmpty == false && (mode != .sitePresence || geofenceVersionId?.isEmpty == false && siteGeofence?.algorithmVersion == "GEOFENCE_V1") && (mode != .businessTravel || tripId?.isEmpty == false) }
}
struct Enrollment: Codable, Sendable { let deviceId: String, employeeId: String, deviceToken: String }
struct Credentials: Sendable { let origin: URL, deviceId: String, employeeId: String, deviceToken: String; let authorizationEpoch: Int }
struct QueueItem: Codable, Identifiable, Sendable {
    let id: String, kind: String, command: String, createdAt: String
    var input: [String: JSONValue]
}
struct Reconciliation: Codable, Identifiable, Sendable { let id: String, command: String, code: String, observedAt: String?, receivedAt: String }
struct NativeState: Codable, Sendable {
    var origin = "", deviceId = "", employeeId = "", sequenceNumber: Int64 = 0
    var queue: [QueueItem] = [], reconciliation: [Reconciliation] = []
    var manualShiftId: String?, manualTripId: String?
}
enum Presence: String, Codable, Sendable { case inside = "INSIDE", outside = "OUTSIDE", unknown = "UNKNOWN" }
enum NativeTrackingPolicy {
    static let bootSessionId = UUID().uuidString
    static let leaseSeconds: TimeInterval = 900
    static let renewalSeconds: TimeInterval = 300
    static let gpsRetentionSeconds: TimeInterval = 72 * 3600
    static func validLease(expiresAt: Date, now: Date) -> Bool { expiresAt > now && expiresAt.timeIntervalSince(now) <= leaseSeconds }
    static func gpsExpired(observedAt: Date?, now: Date) -> Bool {
        guard let observedAt else { return true }
        return observedAt > now || now.timeIntervalSince(observedAt) >= gpsRetentionSeconds
    }
}
struct GeofenceClassifier {
    private(set) var confirmed: Presence = .unknown
    private var candidate: Presence = .unknown, since: Date?, count = 0
    private var lastObserved: Date?, lastUsable: Date?
    static func classify(distance: Double, accuracy: Double?, enter: Double, exit: Double, maximumAccuracy: Double) -> Presence {
        guard let a = accuracy, a.isFinite, a > 0, a <= maximumAccuracy, distance.isFinite, distance >= 0, enter > 0, exit > enter else { return .unknown }
        if distance - a > exit { return .outside }; if distance + a < enter { return .inside }; return .unknown
    }
    mutating func observe(distance: Double, accuracy: Double?, fence: Geofence, at: Date, exceptionDistances: [Double] = []) -> Presence {
        if let previous = lastObserved, at <= previous { return confirmed }
        if let previous = lastUsable, at.timeIntervalSince(previous) >= 300 { confirmed = .unknown }
        let primary = Self.classify(distance: distance, accuracy: accuracy, enter: fence.radiusEnterM, exit: fence.radiusExitM, maximumAccuracy: min(fence.maxAccuracyM, 75))
        let zones = fence.exceptionZones ?? []; let next: Presence
        if let a = accuracy, a.isFinite, a > 0, a <= min(fence.maxAccuracyM, 75), distance.isFinite, distance >= 0, fence.radiusEnterM > 0, fence.radiusExitM > fence.radiusEnterM, exceptionDistances.count == zones.count, exceptionDistances.allSatisfy({ $0.isFinite && $0 >= 0 }) {
            let exceptionInside = zones.enumerated().contains { exceptionDistances[$0.offset] + a < $0.element.radiusM }
            let allOutside = zones.enumerated().allSatisfy { exceptionDistances[$0.offset] - a > $0.element.radiusM + (fence.radiusExitM - fence.radiusEnterM) }
            next = primary == .inside || exceptionInside ? .inside : primary == .outside && allOutside ? .outside : .unknown
        } else { next = zones.isEmpty ? primary : .unknown }
        let interrupted = lastObserved.map { at.timeIntervalSince($0) > min(fence.maxSampleGapSeconds ?? 90, 90) } ?? false
        lastObserved = at
        if let a = accuracy, a.isFinite, a > 0, a <= min(fence.maxAccuracyM, 75), distance.isFinite, distance >= 0, fence.radiusEnterM > 0, fence.radiusExitM > fence.radiusEnterM { lastUsable = at }
        if next == .unknown { candidate = .unknown; since = nil; count = 0; return confirmed }
        if interrupted { candidate = .unknown; since = nil; count = 0 }
        if next != candidate { candidate = next; since = at; count = 1 } else { count += 1 }
        if count >= max(fence.minimumSamples ?? 3, 3), let first = since, at.timeIntervalSince(first) >= max(fence.dwellSeconds, 120) { confirmed = next }
        return confirmed
    }
    static func distance(latitude: Double, longitude: Double, centerLatitude: Double, centerLongitude: Double) -> Double {
        let r = Double.pi / 180, dlat = (centerLatitude - latitude) * r, dlon = (centerLongitude - longitude) * r
        let h = pow(sin(dlat / 2), 2) + cos(latitude * r) * cos(centerLatitude * r) * pow(sin(dlon / 2), 2)
        return 6_371_008.8 * 2 * atan2(sqrt(max(0, min(1, h))), sqrt(max(0, min(1, 1 - h))))
    }
}
