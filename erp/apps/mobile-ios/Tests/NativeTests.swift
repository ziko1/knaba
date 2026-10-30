import XCTest
@testable import KNABADE

final class NativeTests: XCTestCase {
    func testSharedConservativeVectors() throws {
        struct Vectors: Decodable { let classifier: [Vector] }
        struct Vector: Decodable { let name: String, distanceM: Double, accuracyM: Double?, enterM: Double, exitM: Double, maxAccuracyM: Double, expected: String }
        let url = try XCTUnwrap(Bundle(for: NativeTests.self).url(forResource: "native-vectors", withExtension: "json"))
        let vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
        for v in vectors.classifier { XCTAssertEqual(GeofenceClassifier.classify(distance: v.distanceM, accuracy: v.accuracyM, enter: v.enterM, exit: v.exitM, maximumAccuracy: v.maxAccuracyM).rawValue, v.expected, v.name) }
    }
    func testOneJumpDoesNotConfirmExitAndDwellIsRequired() {
        let fence = Geofence(latitude: 52.52, longitude: 13.4, radiusEnterM: 150, radiusExitM: 200, maxAccuracyM: 50, maxAgeSeconds: 120, dwellSeconds: 120, exceptionZones: [])
        var c = GeofenceClassifier(); let start = Date(timeIntervalSince1970: 1000)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 5, fence: fence, at: start), .unknown)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 5, fence: fence, at: start.addingTimeInterval(60)), .unknown)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 5, fence: fence, at: start.addingTimeInterval(120)), .outside)
    }
    func testApprovedExceptionCirclesUseActualDistancesAndConservativeExitMargin() throws {
        struct Fixture: Decodable { let exceptionZones: [Vector] }
        struct Vector: Decodable { let name: String, distanceM: Double, accuracyM: Double, radiiM: [Double], distancesM: [Double], expected: String }
        let url = try XCTUnwrap(Bundle(for: NativeTests.self).url(forResource: "native-vectors", withExtension: "json"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        for v in fixture.exceptionZones {
            let zones = v.radiiM.map { Geofence.ExceptionZone(latitude: 52.52, longitude: 13.4, radiusM: $0, reason: "SYNTHETIC_TEST_ONLY") }
            let fence = Geofence(latitude: 52.52, longitude: 13.4, radiusEnterM: 150, radiusExitM: 200, maxAccuracyM: 50, maxAgeSeconds: 120, dwellSeconds: 120, exceptionZones: zones)
            var classifier = GeofenceClassifier(); let start = Date(timeIntervalSince1970: 1000)
            _ = classifier.observe(distance: v.distanceM, accuracy: v.accuracyM, fence: fence, at: start, exceptionDistances: v.distancesM)
            _ = classifier.observe(distance: v.distanceM, accuracy: v.accuracyM, fence: fence, at: start.addingTimeInterval(60), exceptionDistances: v.distancesM)
            XCTAssertEqual(classifier.observe(distance: v.distanceM, accuracy: v.accuracyM, fence: fence, at: start.addingTimeInterval(120), exceptionDistances: v.distancesM).rawValue, v.expected, v.name)
        }
    }
    func testLeaseRejectsExpiryAndNeverStartsGPSFromOFF() {
        let expired = TrackingSession(deviceId: "test", employeeId: "synthetic", apiVersion: 1, expiresAt: Clock.iso(Date().addingTimeInterval(-1)), mode: .businessTravel, shiftId: "shift", tripId: "trip", siteId: "site", policyVersionId: "policy", reason: nil, siteGeofence: nil)
        XCTAssertFalse(expired.permitsLocation)
        let off = TrackingSession(deviceId: "test", employeeId: "synthetic", apiVersion: 1, expiresAt: Clock.iso(Date().addingTimeInterval(300)), mode: .off, shiftId: "shift", tripId: nil, siteId: nil, policyVersionId: nil, reason: "GPS_LEGAL_GATE_CLOSED", siteGeofence: nil)
        XCTAssertFalse(off.permitsLocation)
    }
    func testLocationRequiresServerIssuedBoundLeaseAndGeofenceVersion() {
        let fence=Geofence(latitude:52.52,longitude:13.4,radiusEnterM:150,radiusExitM:200,maxAccuracyM:75,maxAgeSeconds:120,dwellSeconds:120,exceptionZones:[],algorithmVersion:"GEOFENCE_V1")
        var session = TrackingSession(deviceId: "test", employeeId: "synthetic", apiVersion: 1, expiresAt: Clock.iso(Date().addingTimeInterval(900)), mode: .sitePresence, shiftId: "shift", tripId: nil, siteId: "site", policyVersionId: "policy", reason: nil, siteGeofence: fence)
        XCTAssertFalse(session.permitsLocation)
        session.trackingSessionId = "issued-lease"; XCTAssertFalse(session.permitsLocation)
        session.geofenceVersionId = "approved-geofence"; XCTAssertTrue(session.permitsLocation)
        XCTAssertNotNil(UUID(uuidString: NativeTrackingPolicy.bootSessionId))
    }
    func testV4LeaseAndSeventyTwoHourGPSRetentionBoundaries() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertTrue(NativeTrackingPolicy.validLease(expiresAt: now.addingTimeInterval(900), now: now))
        XCTAssertFalse(NativeTrackingPolicy.validLease(expiresAt: now.addingTimeInterval(900.001), now: now))
        XCTAssertFalse(NativeTrackingPolicy.validLease(expiresAt: now, now: now))
        XCTAssertFalse(NativeTrackingPolicy.gpsExpired(observedAt: now.addingTimeInterval(-72 * 3600 + 0.001), now: now))
        XCTAssertTrue(NativeTrackingPolicy.gpsExpired(observedAt: now.addingTimeInterval(-72 * 3600), now: now))
        XCTAssertTrue(NativeTrackingPolicy.gpsExpired(observedAt: now.addingTimeInterval(1), now: now))
        XCTAssertTrue(NativeTrackingPolicy.gpsExpired(observedAt: nil, now: now))
        XCTAssertEqual(NativeTrackingPolicy.renewalSeconds, 300)
    }
    func testGapOverNinetySecondsAndAmbiguousPointsRestartTheThreeSampleWindow() {
        let fence = Geofence(latitude: 52.52, longitude: 13.4, radiusEnterM: 150, radiusExitM: 200, maxAccuracyM: 75, maxAgeSeconds: 120, dwellSeconds: 120, exceptionZones: [])
        var c = GeofenceClassifier(); let start = Date(timeIntervalSince1970: 1000)
        for offset in [0, 91, 151] { XCTAssertEqual(c.observe(distance: 300, accuracy: 75, fence: fence, at: start.addingTimeInterval(Double(offset))), .unknown) }
        XCTAssertEqual(c.observe(distance: 300, accuracy: 75, fence: fence, at: start.addingTimeInterval(211)), .outside)
        // Borderline measurements break the candidate without changing an accepted mode.
        XCTAssertEqual(c.observe(distance: 20, accuracy: 5, fence: fence, at: start.addingTimeInterval(220)), .outside)
        XCTAssertEqual(c.observe(distance: 150, accuracy: 5, fence: fence, at: start.addingTimeInterval(280)), .outside)
        XCTAssertEqual(c.observe(distance: 20, accuracy: 5, fence: fence, at: start.addingTimeInterval(340)), .outside)
        XCTAssertEqual(c.observe(distance: 20, accuracy: 5, fence: fence, at: start.addingTimeInterval(400)), .outside)
        XCTAssertEqual(c.observe(distance: 20, accuracy: 5, fence: fence, at: start.addingTimeInterval(460)), .inside)
    }
    func testDuplicateAndClockReorderedObservationsCannotFillTheWindowAndStaleDataBecomesUnknown() {
        let fence = Geofence(latitude: 52.52, longitude: 13.4, radiusEnterM: 150, radiusExitM: 200, maxAccuracyM: 75, maxAgeSeconds: 120, dwellSeconds: 120, exceptionZones: [])
        var c = GeofenceClassifier(); let start = Date(timeIntervalSince1970: 1000)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 5, fence: fence, at: start), .unknown)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 5, fence: fence, at: start), .unknown)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 5, fence: fence, at: start.addingTimeInterval(-1)), .unknown)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 5, fence: fence, at: start.addingTimeInterval(90)), .unknown)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 5, fence: fence, at: start.addingTimeInterval(180)), .outside)
        XCTAssertEqual(c.observe(distance: 300, accuracy: 100, fence: fence, at: start.addingTimeInterval(480)), .unknown)
    }
}
