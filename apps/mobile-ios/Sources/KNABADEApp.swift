import SwiftUI

@main @MainActor struct KNABADEApp: App {
    @StateObject private var model = AppModel()
    var body: some Scene { WindowGroup { CompanionView(model: model) } }
}
@MainActor struct CompanionView: View {
    @ObservedObject var model: AppModel
    @ObservedObject private var tracker: LocationTracker
    init(model: AppModel) { self.model = model; tracker = model.tracker }
    var body: some View {
        NavigationStack {
            Form {
                Section("Status") {
                    Label(tracker.active ? "Standort sichtbar aktiv" : "Standort OFF", systemImage: tracker.active ? "location.fill" : "location.slash")
                        .foregroundStyle(tracker.active ? Color.green : Color.secondary)
                    Text(tracker.status).font(.caption)
                    Text(model.status).accessibilityIdentifier("serverStatus")
                    Text("Offline gespeichert: \(model.queued)")
                    Button("Status / Offline synchronisieren") { Task { await model.refresh() } }
                }
                Section("Gerät einmalig verknüpfen") {
                    TextField("HTTPS Server-Origin", text: $model.origin).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    SecureField("Einmaliger Code aus dem Webkonto", text: $model.enrollmentCode)
                    Button("Gerät verknüpfen") { Task { await model.enroll() } }
                    Text("Der Code bindet dieses Gerät an Ihren Beschäftigtenzugang. Neue Verknüpfung widerruft das alte Gerät. GPS startet dadurch nicht.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Arbeitszeit ohne GPS") {
                    TextField("Zugewiesene Objekt-ID", text: $model.siteId).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Schicht START") { Task { await model.startShift() } }.accessibilityIdentifier("startShift")
                    Button("Private Pause / Mittag") { Task { await model.privateBreak() } }.accessibilityIdentifier("privateBreak")
                    Button("Zurück zur Arbeit") { Task { await model.returnToWork() } }
                    Button("Schicht END", role: .destructive) { Task { await model.endShift() } }.accessibilityIdentifier("endShift")
                }
                Section("Dienstfahrt") {
                    TextField("Genehmigte Ziel-Objekt-ID", text: $model.destinationId).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Dienstfahrt starten") { Task { await model.startTrip() } }
                    Button("Ankunft bestätigen und Arbeit beginnen") { Task { await model.arrive() } }
                    Text("Ankunft erfolgt ausdrücklich. GPS-Eintritt beginnt keine Schicht und beendet keine private Pause.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Standort bewusst steuern") {
                    Text("GPS benötigt Ihre Aktivierung und eine genehmigte Server-Richtlinie. Am Objekt werden Abstand und Qualität übermittelt. Genaue Punkte nur für ausdrücklich erlaubte Dienstfahrten. Pausen und Schichtende stoppen lokal sofort.").font(.callout)
                    Button("GPS ausdrücklich aktivieren") { Task { await model.enableGPS() } }
                    Button("Erfassung im Hintergrund erlauben") { tracker.requestBackgroundPermission() }
                    Button("GPS OFF", role: .destructive) { tracker.stop() }
                    Text("iOS kann Erfassung durch Berechtigungen, Akku, Force-Stop oder Neustart begrenzen. Fehlende Position ist UNKNOWN und keine Abwesenheit.").font(.caption).foregroundStyle(.secondary)
                }
                if !model.reconciliations.isEmpty {
                    Section("Zur Klärung") { ForEach(model.reconciliations.suffix(20).reversed()) { item in VStack(alignment: .leading) { Text(item.command); Text("\(item.code) · \(item.observedAt ?? item.receivedAt)").font(.caption).foregroundStyle(.secondary) } } }
                }
                Section { Button("Abmelden / lokale Daten löschen", role: .destructive) { Task { await model.signOut() } } }
            }
            .navigationTitle("KNABA DE")
            .task { await model.load() }
        }
    }
}
