import XCTest
@testable import KNABADE

final class LocalizationAndSummaryTests: XCTestCase {
    func testEverySupportedLanguageCoversAllUIPrivacyStatusAndErrorKeys() {
        XCTAssertEqual(Set(NativeStrings.rows.keys), Set(NativeText.allCases))
        XCTAssertEqual(NativeLanguage.allCases.count, 6)
        for key in NativeText.allCases {
            let row = NativeStrings.rows[key]!
            XCTAssertEqual(row.count, 6, key.rawValue)
            XCTAssertTrue(row.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }, key.rawValue)
            let count = row[0].components(separatedBy: "%@").count
            XCTAssertTrue(row.allSatisfy { $0.components(separatedBy: "%@").count == count }, key.rawValue)
        }
        XCTAssertEqual(Set(NativeLanguage.allCases.map { NativeStrings.text(.privacyNotice, $0) }).count, 6)
        XCTAssertEqual(Set(NativeLanguage.allCases.map { NativeStrings.text(.syncFailed, $0) }).count, 6)
    }
    func testExplicitLanguageAndDeviceFallbackUseFullLocaleTagWithoutInventingUnsupportedLanguage() {
        XCTAssertEqual(NativeLanguage.device(["uk-UA"]), .uk)
        XCTAssertEqual(NativeLanguage.device(["lt_LT"]), .lt)
        XCTAssertEqual(NativeLanguage.device(["ja-JP", "en-GB"]), .en)
        XCTAssertEqual(NativeLanguage.device(["ja-JP"]), .de)
        XCTAssertEqual(NativeLanguage.selected("ru", preferred: ["de-DE"]), .ru)
        XCTAssertEqual(NativeLanguage.selected("system", preferred: ["pl-PL"]), .pl)
    }
    func testErrorsPrivacyStatesAndFormattedCountersChangeLanguageWithoutChangingCanonicalState() {
        XCTAssertEqual(NativeStrings.code("PRIVATE_BREAK", .en), "Private break · GPS OFF")
        XCTAssertEqual(NativeStrings.code("PRIVATE_BREAK", .uk), "Приватна перерва · GPS OFF")
        XCTAssertNotEqual(NativeStrings.code("ACCESS_REVOKED", .ru), NativeStrings.code("ACCESS_REVOKED", .de))
        XCTAssertEqual(NativeStrings.text(.queued, .en, "7"), "Saved offline: 7")
        XCTAssertEqual(NativeStrings.text(.queued, .pl, "7"), "Zapisano offline: 7")
        XCTAssertEqual(NativeStrings.command("shift.end", .lt), "Pamaina END")
        XCTAssertEqual(NativeStrings.code("UNTRUSTED_UNKNOWN_ERROR", .uk), NativeStrings.text(.generalError, .uk))
    }
    private let snapshot = Date(timeIntervalSince1970: 10_000)
    private func summary(activity: String = "WORKING", asOf: Date? = nil, siteSeconds: Int = 1200, review: Bool = false) -> NativeShiftSummary {
        NativeShiftSummary(shiftId: "shift", siteId: "site", state: "ACTIVE", activity: activity,
            startedAt: Clock.iso(snapshot.addingTimeInterval(-3600)), asOf: Clock.iso(asOf ?? snapshot),
            siteCode: "SYNTHETIC_A", siteName: "Synthetic site", activityStartedAt: Clock.iso(snapshot.addingTimeInterval(-1200)),
            siteSeconds: siteSeconds, travelSeconds: 600, breakSeconds: 300, pendingSeconds: 300,
            serviceSeconds: 300, waitingSeconds: 300, reviewRequired: review)
    }
    func testDisplayAddsOnlyBoundedKnownCurrentActivityAndNeverDuplicatesCounters() throws {
        let display = try XCTUnwrap(summary().display(at: snapshot.addingTimeInterval(45), localPending: false))
        XCTAssertEqual(display.siteSeconds, 1245)
        XCTAssertEqual(display.travelSeconds, 600)
        XCTAssertEqual(display.breakSeconds, 300)
        XCTAssertEqual(display.pendingSeconds, 300)
        XCTAssertEqual(display.serviceSeconds, 300)
        XCTAssertEqual(display.waitingSeconds, 300)
        let travel = try XCTUnwrap(summary(activity: "TRAVELLING").display(at: snapshot.addingTimeInterval(45), localPending: false))
        XCTAssertEqual(travel.siteSeconds, 1200)
        XCTAssertEqual(travel.travelSeconds, 645)
    }
    func testPendingLocalActionStaleSnapshotAndReviewFreezeAtRecordedServerCounters() throws {
        let pending = try XCTUnwrap(summary().display(at: snapshot.addingTimeInterval(45), localPending: true))
        XCTAssertEqual(pending.siteSeconds, 1200)
        XCTAssertTrue(pending.localPending)
        let stale = try XCTUnwrap(summary().display(at: snapshot.addingTimeInterval(301), localPending: false))
        XCTAssertEqual(stale.siteSeconds, 1200)
        XCTAssertTrue(stale.stale)
        let reviewed = try XCTUnwrap(summary(review: true).display(at: snapshot.addingTimeInterval(45), localPending: false))
        XCTAssertEqual(reviewed.siteSeconds, 1200)
        XCTAssertTrue(reviewed.reviewRequired)
        let unknown = try XCTUnwrap(summary(activity: "UNKNOWN").display(at: snapshot.addingTimeInterval(45), localPending: false))
        XCTAssertEqual(unknown.siteSeconds, 1200)
        XCTAssertTrue(unknown.reviewRequired)
    }
    func testInvalidFutureNegativeAndImpossibleCountersNeverRenderAsAuthoritativeTime() {
        XCTAssertNil(summary(asOf: snapshot.addingTimeInterval(1)).display(at: snapshot, localPending: false))
        XCTAssertNil(summary(siteSeconds: -1).display(at: snapshot, localPending: false))
        XCTAssertNil(summary(siteSeconds: 4000).display(at: snapshot, localPending: false))
        XCTAssertNil(summary(asOf: snapshot.addingTimeInterval(-3601)).display(at: snapshot, localPending: false))
    }
    func testAuthenticatedSummaryCannotBeUsedForDifferentShiftOrSiteOrToAuthorizeGPS() {
        var session = TrackingSession(deviceId: "device", employeeId: "employee", apiVersion: 1,
            expiresAt: Clock.iso(Date().addingTimeInterval(300)), mode: .off, shiftId: "shift", tripId: nil,
            siteId: "site", policyVersionId: nil, reason: "GPS_LEGAL_GATE_CLOSED", siteGeofence: nil)
        session.shiftSummary = summary()
        XCTAssertNotNil(session.ownShiftSummary)
        XCTAssertFalse(session.permitsLocation)
        var otherShift = TrackingSession(deviceId: "device", employeeId: "employee", apiVersion: 1,
            expiresAt: session.expiresAt, mode: .off, shiftId: "other", tripId: nil, siteId: "site",
            policyVersionId: nil, reason: nil, siteGeofence: nil)
        otherShift.shiftSummary = summary()
        XCTAssertNil(otherShift.ownShiftSummary)
        var otherSite = TrackingSession(deviceId: "device", employeeId: "employee", apiVersion: 1,
            expiresAt: session.expiresAt, mode: .off, shiftId: "shift", tripId: nil, siteId: "other",
            policyVersionId: nil, reason: nil, siteGeofence: nil)
        otherSite.shiftSummary = summary()
        XCTAssertNil(otherSite.ownShiftSummary)
    }
    func testOlderServerSessionWithoutSummaryRemainsCompatibleAndDoesNotInventZeroTime() throws {
        let raw = """
        {"deviceId":"device","employeeId":"employee","apiVersion":1,"expiresAt":"2026-10-06T23:00:00Z","mode":"OFF"}
        """
        let session = try JSONDecoder().decode(TrackingSession.self, from: Data(raw.utf8))
        XCTAssertNil(session.shiftSummary)
        XCTAssertNil(session.ownShiftSummary)
        XCTAssertFalse(session.permitsLocation)
    }
    func testServiceAndWaitingStayDistinctAndDurationNeverWrapsAtTwentyFourHours() throws {
        let service = try XCTUnwrap(summary(activity: "SERVICE_TASK").display(at: snapshot.addingTimeInterval(45), localPending: false))
        XCTAssertEqual(service.serviceSeconds, 345)
        XCTAssertEqual(service.siteSeconds, 1200)
        XCTAssertEqual(service.pendingSeconds, 300)
        let waiting = try XCTUnwrap(summary(activity: "WAITING_WORK").display(at: snapshot.addingTimeInterval(45), localPending: false))
        XCTAssertEqual(waiting.waitingSeconds, 345)
        XCTAssertEqual(NativeShiftDisplay.duration(25 * 3600 + 61), "25:01:01")
    }
    func testLateEnrollmentAndReceiptCannotWriteAfterAuthorizationEpochIsRevoked() async {
        let store = SecureStore(), oldEpoch = await store.authorizationEpoch()
        // Invalidate only an in-memory epoch; this fixture does not create or
        // clear credentials, queue files, Keychain values or a real enrollment.
        await store.invalidatePendingAuthorization()
        do {
            try await store.install(Enrollment(deviceId: "synthetic", employeeId: "synthetic", deviceToken: "NOT_A_REAL_TOKEN"), expectedEpoch: oldEpoch)
            XCTFail("A late enrollment must not recreate credentials")
        } catch NativeError.failure(let code) { XCTAssertEqual(code, "ACCESS_REVOKED") }
        catch { XCTFail("Unexpected error: \(error)") }
        let item = QueueItem(id: "synthetic", kind: "COMMAND", command: "shift.start", createdAt: Clock.iso(), input: [:])
        do {
            try await store.acknowledge(item, expectedEpoch: oldEpoch)
            XCTFail("A late receipt must not restore manual shift/trip state")
        } catch NativeError.failure(let code) { XCTAssertEqual(code, "ACCESS_REVOKED") }
        catch { XCTFail("Unexpected error: \(error)") }
    }
    func testAuthorizationEpochFailureStopsOldLeaseWhileNetworkFailureKeepsOnlyExistingExpiry() {
        XCTAssertTrue(NativeError.failure("ACCESS_REVOKED").requiresPrivacyStop)
        XCTAssertTrue(NativeError.failure("INVALID_OR_FOREIGN_SESSION").requiresPrivacyStop)
        XCTAssertTrue(NativeError.failure("DEVICE_NOT_ENROLLED").requiresPrivacyStop)
        XCTAssertTrue(NativeError.failure("SESSION_EXPIRED").requiresPrivacyStop)
        XCTAssertFalse(NativeError.failure("INVALID_RESPONSE").requiresPrivacyStop)
        XCTAssertFalse(NativeError.failure("HTTP_ERROR").requiresPrivacyStop)
    }
}
