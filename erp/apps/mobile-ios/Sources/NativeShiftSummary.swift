import Foundation

/// Optional, authenticated own-device projection. Display data never grants a
/// location permission, tracking lease, payability rule or worker presence.
struct NativeShiftSummary: Codable, Sendable {
    let shiftId: String, siteId: String, state: String, activity: String, startedAt: String, asOf: String
    let siteCode: String?, siteName: String?, activityStartedAt: String?
    let siteSeconds: Int, travelSeconds: Int, breakSeconds: Int, pendingSeconds: Int
    let serviceSeconds: Int?, waitingSeconds: Int?
    let reviewRequired: Bool?

    func display(at now: Date, localPending: Bool) -> NativeShiftDisplay? {
        guard state == "ACTIVE", !shiftId.isEmpty, !siteId.isEmpty,
              let start = Clock.parse(startedAt), let snapshot = Clock.parse(asOf),
              start <= snapshot, snapshot <= now,
              [siteSeconds, travelSeconds, breakSeconds, pendingSeconds, serviceSeconds ?? 0, waitingSeconds ?? 0].allSatisfy({ $0 >= 0 && $0 <= 31_536_000 }) else { return nil }
        let recorded = siteSeconds + travelSeconds + breakSeconds + pendingSeconds + (serviceSeconds ?? 0) + (waitingSeconds ?? 0)
        guard Double(recorded) <= snapshot.timeIntervalSince(start) + 1 else { return nil }
        if let activityStartedAt {
            guard let activityStart = Clock.parse(activityStartedAt), activityStart >= start, activityStart <= snapshot else { return nil }
        }
        let age = now.timeIntervalSince(snapshot), stale = age > 300
        let knownActivity = ["WORKING", "TRAVELLING", "ON_BREAK", "AWAY_PENDING_REASON", "SERVICE_TASK", "WAITING_WORK"].contains(activity)
        let needsReview = reviewRequired == true || !knownActivity
        // A pending local command/reconciliation, stale or review-bound snapshot
        // cannot tell us the currently recorded activity. Keep its exact counters.
        let elapsed = localPending || stale || needsReview || activityStartedAt == nil ? 0 : max(0, Int(age))
        return NativeShiftDisplay(
            siteSeconds: siteSeconds + (activity == "WORKING" ? elapsed : 0),
            travelSeconds: travelSeconds + (activity == "TRAVELLING" ? elapsed : 0),
            breakSeconds: breakSeconds + (activity == "ON_BREAK" ? elapsed : 0),
            pendingSeconds: pendingSeconds + (activity == "AWAY_PENDING_REASON" ? elapsed : 0),
            serviceSeconds: (serviceSeconds ?? 0) + (activity == "SERVICE_TASK" ? elapsed : 0),
            waitingSeconds: (waitingSeconds ?? 0) + (activity == "WAITING_WORK" ? elapsed : 0),
            stale: stale, localPending: localPending, reviewRequired: needsReview)
    }
}
struct NativeShiftDisplay: Sendable {
    let siteSeconds: Int, travelSeconds: Int, breakSeconds: Int, pendingSeconds: Int, serviceSeconds: Int, waitingSeconds: Int
    let stale: Bool, localPending: Bool, reviewRequired: Bool
    static func duration(_ seconds: Int) -> String { String(format: "%02d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60) }
}
