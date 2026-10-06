import Foundation
import Combine

@MainActor final class AppModel: ObservableObject {
    @Published var origin = ""
    @Published var enrollmentCode = ""
    @Published var siteId = ""
    @Published var destinationId = ""
    @Published var status = "Gerät verknüpfen. GPS bleibt OFF."
    @Published var session: TrackingSession? = nil
    @Published var busy = false
    @Published var queued = 0
    @Published var reconciliations: [Reconciliation] = []
    let store: SecureStore, api: NativeAPI, tracker: LocationTracker
    private var manualShiftId: String?, manualTripId: String?
    private var pendingRefresh = false
    init() { let store = SecureStore(), api = NativeAPI(store: store); self.store = store; self.api = api; tracker = LocationTracker(store: store, api: api) }
    var shiftId: String? { session?.shiftId ?? manualShiftId }
    var tripId: String? { session?.tripId ?? manualTripId }
    func load() async { do { let saved = try await store.read(); origin = saved.origin; manualShiftId = saved.manualShiftId; manualTripId = saved.manualTripId; queued = saved.queue.count; reconciliations = saved.reconciliation; if !saved.deviceId.isEmpty { await refresh() } } catch { status = "Geschützter Speicher nicht verfügbar: \(error.localizedDescription)" } }
    func enroll() async {
        await perform { try await self.store.configure(self.origin); try await self.api.enroll(code: self.enrollmentCode); self.enrollmentCode = ""; self.status = "Gerät verknüpft · GPS OFF"; try await self.updateLocalState() }
    }
    func refresh() async {
        await perform { let count = try await self.api.sync(); let session = try await self.api.session(); self.session = session; self.tracker.accept(session); if let selected = session.siteId { self.siteId = selected }; try await self.updateLocalState(); self.status = "\(session.mode.rawValue) · \(count) synchronisiert · \(session.reason ?? "Serverstatus geprüft")" }
    }
    private func updateLocalState() async throws { let saved = try await store.read(); queued = saved.queue.count; reconciliations = saved.reconciliation; manualShiftId = saved.manualShiftId; manualTripId = saved.manualTripId }
    private func perform(_ action: @escaping () async throws -> Void) async {
        guard !busy else { pendingRefresh = true; return }; busy = true
        defer { busy = false; if pendingRefresh { pendingRefresh = false; Task { await self.refresh() } } }
        do { try await action() }
        catch let failure as APIFailure { if [401, 403].contains(failure.status) { tracker.stop("ACCESS_REVOKED") }; status = "Nicht synchronisiert: \(failure.code). Gespeicherte Aktionen bleiben prüfbar."; try? await updateLocalState() }
        catch { status = "Nicht synchronisiert: \(error.localizedDescription). Manueller Ablauf bleibt verfügbar."; try? await updateLocalState() }
    }
    private func enqueue(_ command: String, input: [String: JSONValue]) async {
        do { try await store.enqueue(command, input: input); try await updateLocalState(); status = "Aktion sicher gespeichert · Synchronisierung folgt" }
        catch { status = "Aktion nicht gespeichert: \(error.localizedDescription)"; return }
        await refresh()
    }
    func startShift() async {
        guard !siteId.trimmingCharacters(in: .whitespaces).isEmpty else { status = "Zugewiesene Objekt-ID erforderlich"; return }
        do { let credentials = try await store.credentials(); await enqueue("shift.start", input: ["siteId": .string(siteId), "deviceId": .string(credentials.deviceId), "occurredAt": .string(Clock.iso())]) } catch { status = error.localizedDescription }
    }
    func privateBreak() async {
        let at = Date(); tracker.stop("PRIVATE_BREAK")
        do { try await store.purgeLocationSince(at) } catch { status = error.localizedDescription; return }
        guard let id = shiftId else { status = "Keine aktive Schicht"; return }
        if let trip = tripId { await enqueue("trip.stop", input: ["tripId": .string(trip), "kind": .string("PRIVATE_BREAK"), "reason": .string("Private Pause ausdrücklich bestätigt"), "occurredAt": .string(Clock.iso(at))]) }
        else { await enqueue("shift.activity", input: ["shiftId": .string(id), "activity": .string("ON_BREAK"), "occurredAt": .string(Clock.iso(at))]) }
    }
    func returnToWork() async {
        tracker.stop("MANUAL_RETURN_REQUIRES_NEW_ACTIVATION"); guard let id = shiftId else { status = "Keine aktive Schicht"; return }
        if let trip = tripId { await enqueue("trip.resume", input: ["tripId": .string(trip), "occurredAt": .string(Clock.iso())]) }
        else { await enqueue("shift.activity", input: ["shiftId": .string(id), "activity": .string("WORKING"), "siteId": .string(siteId), "occurredAt": .string(Clock.iso())]) }
    }
    func startTrip() async {
        tracker.stop("MODE_CHANGE_REQUIRES_NEW_ACTIVATION"); guard let id = shiftId, !destinationId.isEmpty else { status = "Schicht und genehmigte Ziel-Objekt-ID erforderlich"; return }
        await enqueue("trip.start", input: ["shiftId": .string(id), "destination": .object(["kind": .string("SITE"), "id": .string(destinationId)]), "purpose": .string("Dienstfahrt zum zugewiesenen Objekt"), "occurredAt": .string(Clock.iso())])
    }
    func arrive() async {
        tracker.stop("ARRIVAL_REQUIRES_NEW_ACTIVATION"); guard let id = tripId else { status = "Keine aktive Fahrt-ID. Synchronisieren Sie den Fahrtbeginn."; return }
        await enqueue("trip.arrive", input: ["tripId": .string(id), "startWork": .bool(true), "occurredAt": .string(Clock.iso())])
    }
    func endShift() async {
        let at = Date(); tracker.stop("SHIFT_ENDED")
        do { try await store.purgeLocationSince(at) } catch { status = error.localizedDescription; return }; guard let id = shiftId else { status = "Keine aktive Schicht"; return }
        await enqueue("shift.end", input: ["shiftId": .string(id), "occurredAt": .string(Clock.iso(at))])
    }
    func enableGPS() async { await perform { try await self.tracker.enable(); self.status = "Standorterfassung ausdrücklich angefordert" } }
    func signOut() async { tracker.stop("SIGNED_OUT"); do { try await store.clear(); session = nil; manualShiftId = nil; manualTripId = nil; queued = 0; reconciliations = []; status = "Abgemeldet · lokale Daten gelöscht · GPS OFF" } catch { status = "Lokale Löschung fehlgeschlagen: \(error.localizedDescription)" } }
}
