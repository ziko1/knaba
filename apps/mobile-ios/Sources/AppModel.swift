import Foundation
import Combine

@MainActor final class AppModel: ObservableObject {
    @Published var origin = ""
    @Published var enrollmentCode = ""
    @Published var siteId = ""
    @Published var destinationId = ""
    @Published var localeSelection = UserDefaults.standard.string(forKey: "knaba-ui-language") ?? "system" {
        didSet { UserDefaults.standard.set(localeSelection, forKey: "knaba-ui-language"); tracker.language = language }
    }
    @Published private var statusKey: NativeText = .notEnrolled
    @Published private(set) var statusCode: String? = nil
    private var lastSyncedCount = 0
    var language: NativeLanguage { NativeLanguage.selected(localeSelection) }
    func text(_ key: NativeText) -> String { NativeStrings.text(key, language) }
    var status: String {
        if statusKey == .synchronized { return NativeStrings.text(.synchronized, language, NativeStrings.code(session?.mode.rawValue, language), String(lastSyncedCount)) }
        return text(statusKey)
    }
    @Published var session: TrackingSession? = nil
    @Published var busy = false
    @Published var queued = 0
    @Published var reconciliations: [Reconciliation] = []
    let store: SecureStore, api: NativeAPI, tracker: LocationTracker
    private var manualShiftId: String?, manualTripId: String?
    private var pendingRefresh = false
    private var privacyGeneration = 0
    init() { let store = SecureStore(), api = NativeAPI(store: store); self.store = store; self.api = api; tracker = LocationTracker(store: store, api: api); tracker.language = language }
    var shiftId: String? { session?.shiftId ?? manualShiftId }
    var tripId: String? { session?.tripId ?? manualTripId }
    private func setStatus(_ key: NativeText, error: Error? = nil) {
        statusKey = key
        if let failure = error as? APIFailure { statusCode = failure.code }
        else if let failure = error as? NativeError, case .failure(let code) = failure { statusCode = code }
        else { statusCode = error == nil ? nil : "NATIVE_ERROR" }
    }
    func load() async { do { let saved = try await store.read(); origin = saved.origin; manualShiftId = saved.manualShiftId; manualTripId = saved.manualTripId; queued = saved.queue.count; reconciliations = saved.reconciliation; if !saved.deviceId.isEmpty { await refresh() } } catch { setStatus(.storageUnavailable, error: error) } }
    func enroll() async {
        let generation = privacyGeneration
        await perform { try await self.store.configure(self.origin); try await self.api.enroll(code: self.enrollmentCode); guard generation == self.privacyGeneration else { return }; self.enrollmentCode = ""; self.setStatus(.enrolled); try await self.updateLocalState() }
    }
    func refresh() async {
        let generation = privacyGeneration
        await perform { let count = try await self.api.sync(); let session = try await self.api.session(); guard generation == self.privacyGeneration else { return }; self.session = session; self.tracker.accept(session); if let selected = session.siteId ?? session.shiftSummary?.siteId { self.siteId = selected }; try await self.updateLocalState(); guard generation == self.privacyGeneration else { return }; self.lastSyncedCount = count; self.setStatus(.synchronized) }
    }
    private func updateLocalState() async throws { let generation = privacyGeneration; let saved = try await store.read(); guard generation == privacyGeneration else { return }; queued = saved.queue.count; reconciliations = saved.reconciliation; manualShiftId = saved.manualShiftId; manualTripId = saved.manualTripId }
    private func perform(_ action: @escaping () async throws -> Void) async {
        guard !busy else { pendingRefresh = true; return }; busy = true; let generation = privacyGeneration
        defer { busy = false; if pendingRefresh { pendingRefresh = false; Task { await self.refresh() } } }
        do { try await action() }
        catch let failure as APIFailure {
            guard generation == privacyGeneration else { return }
            if [401, 403].contains(failure.status) { privacyGeneration += 1; tracker.stop("ACCESS_REVOKED"); session = nil; manualShiftId = nil; manualTripId = nil; siteId = ""; destinationId = "" }
            setStatus(.syncFailed, error: failure)
            if ![401, 403].contains(failure.status) { try? await updateLocalState() }
        }
        catch let failure as NativeError {
            guard generation == privacyGeneration else { return }
            if failure.requiresPrivacyStop { privacyGeneration += 1; tracker.stop("ACCESS_REVOKED"); session = nil; manualShiftId = nil; manualTripId = nil; siteId = ""; destinationId = "" }
            setStatus(.syncFailed, error: failure)
            if !failure.requiresPrivacyStop { try? await updateLocalState() }
        }
        catch { guard generation == privacyGeneration else { return }; setStatus(.syncFailed, error: error); try? await updateLocalState() }
    }
    private func enqueue(_ command: String, input: [String: JSONValue]) async {
        do { try await store.enqueue(command, input: input); try await updateLocalState(); setStatus(.actionSaved) }
        catch { setStatus(.actionFailed, error: error); return }
        await refresh()
    }
    func startShift() async {
        guard !siteId.trimmingCharacters(in: .whitespaces).isEmpty else { setStatus(.siteRequired); return }
        do { let credentials = try await store.credentials(); await enqueue("shift.start", input: ["siteId": .string(siteId), "deviceId": .string(credentials.deviceId), "occurredAt": .string(Clock.iso())]) } catch { setStatus(.actionFailed, error: error) }
    }
    func privateBreak() async {
        let at = Date(); tracker.stop("PRIVATE_BREAK")
        do { try await store.purgeLocationSince(at) } catch { setStatus(.storageUnavailable, error: error); return }
        guard let id = shiftId else { setStatus(.noShift); return }
        if let trip = tripId { await enqueue("trip.stop", input: ["tripId": .string(trip), "kind": .string("PRIVATE_BREAK"), "reason": .string("Private Pause ausdrücklich bestätigt"), "occurredAt": .string(Clock.iso(at))]) }
        else { await enqueue("shift.activity", input: ["shiftId": .string(id), "activity": .string("ON_BREAK"), "occurredAt": .string(Clock.iso(at))]) }
    }
    func returnToWork() async {
        tracker.stop("MANUAL_RETURN_REQUIRES_NEW_ACTIVATION"); guard let id = shiftId else { setStatus(.noShift); return }
        if let trip = tripId { await enqueue("trip.resume", input: ["tripId": .string(trip), "occurredAt": .string(Clock.iso())]) }
        else { await enqueue("shift.activity", input: ["shiftId": .string(id), "activity": .string("WORKING"), "siteId": .string(siteId), "occurredAt": .string(Clock.iso())]) }
    }
    func startTrip() async {
        tracker.stop("MODE_CHANGE_REQUIRES_NEW_ACTIVATION"); guard let id = shiftId, !destinationId.isEmpty else { setStatus(.destinationRequired); return }
        await enqueue("trip.start", input: ["shiftId": .string(id), "destination": .object(["kind": .string("SITE"), "id": .string(destinationId)]), "purpose": .string("Dienstfahrt zum zugewiesenen Objekt"), "occurredAt": .string(Clock.iso())])
    }
    func arrive() async {
        tracker.stop("ARRIVAL_REQUIRES_NEW_ACTIVATION"); guard let id = tripId else { setStatus(.noTrip); return }
        await enqueue("trip.arrive", input: ["tripId": .string(id), "startWork": .bool(true), "occurredAt": .string(Clock.iso())])
    }
    func endShift() async {
        let at = Date(); tracker.stop("SHIFT_ENDED")
        do { try await store.purgeLocationSince(at) } catch { setStatus(.storageUnavailable, error: error); return }; guard let id = shiftId else { setStatus(.noShift); return }
        await enqueue("shift.end", input: ["shiftId": .string(id), "occurredAt": .string(Clock.iso(at))])
    }
    func enableGPS() async { await perform { try await self.tracker.enable(); self.setStatus(.gpsRequested) } }
    func signOut() async {
        privacyGeneration += 1; pendingRefresh = false; tracker.stop("SIGNED_OUT"); session = nil; manualShiftId = nil; manualTripId = nil; siteId = ""; destinationId = ""; enrollmentCode = ""
        do { try await store.clear(); queued = 0; reconciliations = []; setStatus(.signedOut) } catch { setStatus(.clearFailed, error: error) }
    }
}
