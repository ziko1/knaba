import Foundation
import CoreLocation
import Combine

/// OS-native tracking with visible user activation, a bounded server lease and immediate local privacy stop.
@MainActor final class LocationTracker: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var language = NativeLanguage.device()
    @Published private var statusKey: NativeText = .locationOff
    @Published private var statusReason: String? = nil
    @Published private(set) var lastLocationAt: Date? = nil
    @Published private(set) var permissionKey: NativeText = .permissionUnknown
    @Published private(set) var accessRevoked = false
    var status: String {
        if statusKey == .activeUntil, let lease = session { return NativeStrings.text(.activeUntil, language, NativeStrings.code(lease.mode.rawValue, language), lease.expiresAt) }
        if statusKey == .stopped { return NativeStrings.text(.stopped, language, NativeStrings.code(statusReason, language)) }
        return NativeStrings.text(statusKey, language)
    }
    @Published private(set) var active = false
    @Published private(set) var presence: Presence = .unknown
    private let manager = CLLocationManager(), store: SecureStore, api: NativeAPI
    private var session: TrackingSession?, classifier = GeofenceClassifier(), wantsTracking = false
    private var timer: Timer?, lastObserved: Date = .distantPast, lastRenewal: Date = .distantPast
    private var renewing = false, privacyGeneration = 0
    private var privacyStoppedAt = Date.distantPast
    init(store: SecureStore, api: NativeAPI) { self.store = store; self.api = api; super.init(); manager.delegate = self; manager.pausesLocationUpdatesAutomatically = true; manager.showsBackgroundLocationIndicator = true; updatePermission() }
    private func updatePermission() {
        switch manager.authorizationStatus {
        case .authorizedAlways: permissionKey = .permissionAlways
        case .authorizedWhenInUse: permissionKey = .permissionWhileUsing
        case .notDetermined: permissionKey = .permissionUnknown
        default: permissionKey = .permissionDenied
        }
    }
    func enable() async throws {
        let generation = privacyGeneration
        let lease = try await api.session()
        guard generation == privacyGeneration else { throw NativeError.failure("ACCESS_REVOKED") }
        guard lease.permitsLocation else { throw NativeError.failure(lease.reason ?? "GPS_NOT_AUTHORIZED") }
        accessRevoked = false
        session = lease; wantsTracking = true
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization(); statusKey = .permissionRequired
        case .authorizedWhenInUse, .authorizedAlways: begin(lease)
        default: wantsTracking = false; throw NativeError.failure("LOCATION_PERMISSION_DENIED_MANUAL_TIME_AVAILABLE")
        }
    }
    func requestBackgroundPermission() { guard wantsTracking, session?.permitsLocation == true, manager.authorizationStatus == .authorizedWhenInUse else { statusKey = .activateFirst; return }; manager.requestAlwaysAuthorization() }
    func accept(_ lease: TrackingSession) {
        guard lease.valid else { stop("SESSION_EXPIRED"); return }
        accessRevoked = false
        if let previous = session, previous.shiftId != lease.shiftId || previous.deviceId != lease.deviceId { stop("SESSION_CHANGED"); return }
        session = lease
        if !lease.permitsLocation { stop(lease.mode == .privateBreak ? "PRIVATE_BREAK" : lease.reason ?? "SERVER_OFF"); return }
        // Receiving a new server lease does not activate previously stopped tracking.
        if wantsTracking { manager.desiredAccuracy = lease.mode == .businessTravel ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyHundredMeters }
    }
    private func begin(_ lease: TrackingSession) {
        guard wantsTracking, lease.permitsLocation else { stop("SESSION_EXPIRED"); return }
        manager.desiredAccuracy = lease.mode == .businessTravel ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyHundredMeters
        manager.distanceFilter = lease.mode == .businessTravel ? 15 : 25
        manager.activityType = lease.mode == .businessTravel ? .automotiveNavigation : .other
        // Always is requested separately by a user action; the app never promises background delivery for When-In-Use.
        manager.allowsBackgroundLocationUpdates = manager.authorizationStatus == .authorizedAlways
        manager.startUpdatingLocation(); active = true
        statusKey = .activeUntil
        timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in Task { @MainActor in await self?.heartbeat() } }
    }
    func stop(_ reason: String = "USER_STOPPED") {
        if reason == "ACCESS_REVOKED" || reason == "SIGNED_OUT" { accessRevoked = true }
        privacyGeneration += 1; privacyStoppedAt = Date(); wantsTracking = false; active = false; session = nil; timer?.invalidate(); timer = nil
        manager.stopUpdatingLocation(); manager.allowsBackgroundLocationUpdates = false
        statusKey = .stopped; statusReason = reason; lastLocationAt = nil; classifier = GeofenceClassifier(); presence = .unknown
    }
    private func heartbeat() async {
        guard active, wantsTracking, let lease = session, lease.valid else { if active { stop("SESSION_EXPIRED") }; return }
        guard !renewing, Date().timeIntervalSince(lastRenewal) >= 30 else { return }
        renewing = true; defer { renewing = false }; let generation = privacyGeneration
        do {
            _ = try await api.sync(); let fresh = try await api.session()
            guard generation == privacyGeneration, wantsTracking else { return }; lastRenewal = Date(); accept(fresh)
        } catch let failure as APIFailure {
            if [401, 403].contains(failure.status) { stop("ACCESS_REVOKED") } else { statusKey = .leaseOnly }
        } catch let failure as NativeError {
            if failure.requiresPrivacyStop { stop("ACCESS_REVOKED") } else { statusKey = .leaseOnly }
        } catch { statusKey = .leaseOnly }
        if session?.valid != true { stop("SESSION_EXPIRED") }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        updatePermission()
        guard wantsTracking else { return }
        if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse { if let lease = session { begin(lease) } }
        else if manager.authorizationStatus != .notDetermined { stop("PERMISSION_DENIED") }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active, wantsTracking, let lease = session, lease.permitsLocation else { if active { stop("SESSION_EXPIRED") }; return }
        let generation = privacyGeneration
        for location in locations {
            guard location.timestamp > lastObserved, location.horizontalAccuracy > 0, CLLocationCoordinate2DIsValid(location.coordinate), !(location.coordinate.latitude == 0 && location.coordinate.longitude == 0), Date().timeIntervalSince(location.timestamp) >= 0, Date().timeIntervalSince(location.timestamp) <= (lease.siteGeofence?.maxAgeSeconds ?? 120) else { continue }
            if #available(iOS 15.0, *), location.sourceInformation?.isSimulatedBySoftware == true { statusKey = .simulatedLocation; continue }
            guard let shiftId = lease.shiftId, let policyId = lease.policyVersionId else { stop("INCOMPLETE_SESSION"); return }
            var payload: [String: JSONValue] = ["deviceId": .string(lease.deviceId), "shiftId": .string(shiftId), "policyVersionId": .string(policyId), "observedAt": .string(Clock.iso(location.timestamp)), "accuracyM": .number(location.horizontalAccuracy)]
            let command: String
            if lease.mode == .sitePresence {
                guard let fence = lease.siteGeofence, let siteId = lease.siteId, location.horizontalAccuracy <= fence.maxAccuracyM else { presence = .unknown; continue }
                let distance = GeofenceClassifier.distance(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, centerLatitude: fence.latitude, centerLongitude: fence.longitude)
                let zoneDistances = (fence.exceptionZones ?? []).map { GeofenceClassifier.distance(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, centerLatitude: $0.latitude, centerLongitude: $0.longitude) }
                presence = classifier.observe(distance: distance, accuracy: location.horizontalAccuracy, fence: fence, at: location.timestamp, exceptionDistances: zoneDistances)
                payload["siteId"] = .string(siteId); payload["distanceM"] = .number(distance); payload["source"] = .string("NATIVE_LOCATION"); payload["trackerState"] = .string("ONLINE")
                payload["zoneDistances"] = .array(zoneDistances.enumerated().map { .object(["zoneIndex": .number(Double($0.offset)), "distanceM": .number($0.element), "accuracyM": .number(location.horizontalAccuracy)]) })
                command = "presence.ingest" // Coordinates never enter SITE_PRESENCE persistence or network.
            } else if lease.mode == .businessTravel, let tripId = lease.tripId {
                payload["tripId"] = .string(tripId); payload["latitude"] = .number(location.coordinate.latitude); payload["longitude"] = .number(location.coordinate.longitude); command = "trip.sample"
            } else { stop("PRIVATE_OR_OFF_DUTY"); return }
            lastObserved = location.timestamp
            lastLocationAt = location.timestamp
            let eventPayload = payload
            Task { @MainActor [weak self] in
                guard let self, self.active, self.wantsTracking, self.privacyGeneration == generation else { return }
                do { try await self.store.enqueue(command, input: eventPayload, event: true); if self.privacyGeneration != generation { try await self.store.purgeLocationSince(self.privacyStoppedAt) } }
                catch { self.stop("OFFLINE_QUEUE_FULL_OR_STORAGE_UNAVAILABLE") }
            }
        }
        Task { await heartbeat() }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let error = error as? CLError, error.code == .denied { stop("PERMISSION_DENIED") }
        else { presence = .unknown; lastLocationAt = nil; statusKey = .locationUnknown }
    }
}
