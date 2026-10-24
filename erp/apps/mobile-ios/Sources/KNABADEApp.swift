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
                Section(model.text(.language)) {
                    Picker(model.text(.language), selection: $model.localeSelection) {
                        Text(model.text(.deviceLanguage)).tag("system")
                        ForEach(NativeLanguage.allCases) { language in Text(language.name).tag(language.rawValue) }
                    }.accessibilityIdentifier("languageSelector")
                }
                TimelineView(.periodic(from: Date(), by: 1)) { timeline in
                    Section(model.text(.myShift)) { shiftCard(now: timeline.date) }
                }
                Section(model.text(.status)) {
                    Label(model.text(tracker.active ? .locationOn : .locationOff), systemImage: tracker.active ? "location.fill" : "location.slash")
                        .foregroundStyle(tracker.active ? Color.green : Color.secondary)
                    Text(tracker.status).font(.caption)
                    Text(model.status).accessibilityIdentifier("serverStatus")
                    if let code = model.statusCode { Text(NativeStrings.code(code, model.language)).font(.caption).foregroundStyle(.secondary) }
                    if let reason = model.session?.reason { Text(NativeStrings.code(reason, model.language)).font(.caption) }
                    Text(NativeStrings.text(.queued, model.language, String(model.queued)))
                    LabeledContent(model.text(.permission), value: model.text(tracker.permissionKey))
                    TimelineView(.periodic(from: Date(), by: 15)) { timeline in
                        LabeledContent(model.text(.position), value: positionText(now: timeline.date))
                    }
                    Button(model.text(.synchronize)) { Task { await model.refresh() } }.disabled(model.busy)
                }
                Section(model.text(.enrollment)) {
                    TextField(model.text(.origin), text: $model.origin).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    SecureField(model.text(.enrollmentCode), text: $model.enrollmentCode)
                    Button(model.text(.enroll)) { Task { await model.enroll() } }.disabled(model.busy)
                    Text(model.text(.enrollmentNotice)).font(.caption).foregroundStyle(.secondary)
                }
                Section(model.text(.timeWithoutGPS)) {
                    TextField(model.text(.siteInput), text: $model.siteId).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(model.text(.startShift)) { Task { await model.startShift() } }.accessibilityIdentifier("startShift")
                    Button(model.text(.privateBreak)) { Task { await model.privateBreak() } }.accessibilityIdentifier("privateBreak")
                    Button(model.text(.returnToWork)) { Task { await model.returnToWork() } }
                    Button(model.text(.endShift), role: .destructive) { Task { await model.endShift() } }.accessibilityIdentifier("endShift")
                }
                Section(model.text(.businessTravel)) {
                    TextField(model.text(.destinationInput), text: $model.destinationId).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(model.text(.startTrip)) { Task { await model.startTrip() } }
                    Button(model.text(.arrive)) { Task { await model.arrive() } }
                    Text(model.text(.arrivalNotice)).font(.caption).foregroundStyle(.secondary)
                }
                Section(model.text(.locationControl)) {
                    Text(model.text(.privacyNotice)).font(.callout)
                    Button(model.text(.enableGPS)) { Task { await model.enableGPS() } }.disabled(model.busy)
                    Button(model.text(.backgroundPermission)) { tracker.requestBackgroundPermission() }
                    Button(model.text(.gpsOff), role: .destructive) { tracker.stop() }
                    Text(model.text(.operatingSystemNotice)).font(.caption).foregroundStyle(.secondary)
                }
                if !model.reconciliations.isEmpty {
                    Section(model.text(.reconcile)) {
                        ForEach(model.reconciliations.suffix(20).reversed()) { item in
                            VStack(alignment: .leading) {
                                Text(NativeStrings.command(item.command, model.language))
                                Text(NativeStrings.code(item.code, model.language)).font(.caption).foregroundStyle(.secondary)
                                Text(item.observedAt ?? item.receivedAt).font(.caption)
                            }
                        }
                    }
                }
                Section { Button(model.text(.signOut), role: .destructive) { Task { await model.signOut() } } }
            }
            .navigationTitle("KNABA DE")
            .task { await model.load() }
        }
    }
    @ViewBuilder private func shiftCard(now: Date) -> some View {
        if !tracker.accessRevoked, let summary = model.session?.ownShiftSummary,
           let counters = summary.display(at: now, localPending: model.queued > 0 || !model.reconciliations.isEmpty) {
            let siteTitle = [summary.siteCode, summary.siteName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            LabeledContent(model.text(.site), value: siteTitle.isEmpty ? summary.siteId : siteTitle)
            LabeledContent(model.text(.status), value: NativeStrings.code(summary.state, model.language))
            LabeledContent(model.text(.activity), value: NativeStrings.code(summary.activity, model.language))
            LabeledContent(model.text(.siteTime), value: NativeShiftDisplay.duration(counters.siteSeconds))
            LabeledContent(model.text(.travelTime), value: NativeShiftDisplay.duration(counters.travelSeconds))
            LabeledContent(model.text(.breakTime), value: NativeShiftDisplay.duration(counters.breakSeconds))
            LabeledContent(model.text(.pendingTime), value: NativeShiftDisplay.duration(counters.pendingSeconds))
            if counters.serviceSeconds > 0 { LabeledContent(model.text(.serviceTime), value: NativeShiftDisplay.duration(counters.serviceSeconds)) }
            if counters.waitingSeconds > 0 { LabeledContent(model.text(.waitingTime), value: NativeShiftDisplay.duration(counters.waitingSeconds)) }
            Text(NativeStrings.text(.snapshot, model.language, summary.asOf)).font(.caption)
            if counters.stale { Text(model.text(.staleSummary)).font(.caption).foregroundStyle(.orange) }
            if counters.localPending { Text(model.text(.localPending)).font(.caption).foregroundStyle(.orange) }
            if counters.reviewRequired { Text(model.text(.reconcile)).font(.caption).foregroundStyle(.orange) }
            Text(model.text(.provisional)).font(.caption).foregroundStyle(.secondary)
        } else { Text(model.text(.noSummary)).foregroundStyle(.secondary) }
    }
    private func positionText(now: Date) -> String {
        guard tracker.active, let position = tracker.lastLocationAt else { return model.text(.unknownPosition) }
        guard now >= position, now.timeIntervalSince(position) <= 120 else { return model.text(.stalePosition) }
        return NativeStrings.text(.freshPosition, model.language, position.formatted(date: .omitted, time: .standard))
    }
}
