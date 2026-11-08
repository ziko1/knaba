import SwiftUI

@main @MainActor struct KNABADEApp: App {
    @StateObject private var model = AppModel()
    var body: some Scene {
        WindowGroup {
            TabView {
                ERPConsoleView(preferences: model)
                    .tabItem { Label("KNABA ERP", systemImage: "square.grid.2x2") }
                CompanionView(model: model)
                    .tabItem { Label(model.text(.myShift), systemImage: "clock.arrow.circlepath") }
            }
            .tint(KNABATheme.tint)
            .toolbarBackground(KNABATheme.surface, for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
        }
    }
}

@MainActor struct CompanionView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        NavigationStack {
            CompanionDashboard(model: model)
                .navigationTitle(model.text(.myShift)).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker(model.text(.language), selection: $model.localeSelection) {
                                ForEach(NativeLanguage.allCases) { language in Text(language.name).tag(language.rawValue) }
                                Text(model.text(.deviceLanguage)).tag("system")
                            }
                        } label: {
                            Label(model.language.name, systemImage: "globe")
                                .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
                        }
                        .accessibilityLabel(model.text(.language)).accessibilityValue(model.language.name)
                        .accessibilityIdentifier("languageSelector")
                    }
                }
                .task { await model.load() }
        }
    }
}

/// Presentation only. Loading and permissions remain explicit in the parent/model.
@MainActor struct CompanionDashboard: View {
    @ObservedObject var model: AppModel
    @ObservedObject private var tracker: LocationTracker
    init(model: AppModel) { self.model = model; tracker = model.tracker }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                KNABABrandHeader(title: model.text(.myShift), subtitle: model.text(.timeWithoutGPS))
                TimelineView(.periodic(from: Date(), by: 1)) { timeline in
                    KNABAShiftSummaryCard(model: model, tracker: tracker, now: timeline.date)
                }
                statusCard
                shiftActions
                travelCard
                locationCard
                enrollmentCard
                if !model.reconciliations.isEmpty { reconciliationCard }
                Button(model.text(.signOut), role: .destructive) { Task { await model.signOut() } }
                    .buttonStyle(KNABAButtonStyle(emphasis: .secondary))
            }
            .frame(maxWidth: 840).padding(16).frame(maxWidth: .infinity)
        }
        .knabaScreen().scrollDismissesKeyboard(.interactively)
        .refreshable { await model.refresh() }
    }
    private var statusCard: some View {
        KNABACard(title: model.text(.status), icon: "antenna.radiowaves.left.and.right") {
            Label(model.text(tracker.active ? .locationOn : .locationOff), systemImage: tracker.active ? "location.fill" : "location.slash")
                .font(.body.weight(.semibold)).foregroundStyle(tracker.active ? KNABATheme.success : KNABATheme.muted)
            Text(tracker.status).font(.caption).foregroundStyle(KNABATheme.muted)
            Text(model.status).font(.subheadline).accessibilityIdentifier("serverStatus")
            if let code = model.statusCode { KNABAStatusNotice(text: NativeStrings.code(code, model.language), kind: .warning) }
            if let reason = model.session?.reason { Text(NativeStrings.code(reason, model.language)).font(.caption).foregroundStyle(KNABATheme.muted) }
            Label(NativeStrings.text(.queued, model.language, String(model.queued)), systemImage: "tray.and.arrow.up")
                .font(.subheadline)
            LabeledContent(model.text(.permission), value: model.text(tracker.permissionKey)).font(.subheadline)
            TimelineView(.periodic(from: Date(), by: 15)) { timeline in
                LabeledContent(model.text(.position), value: positionText(now: timeline.date)).font(.subheadline)
            }
            Button { Task { await model.refresh() } } label: {
                Label(model.text(.synchronize), systemImage: "arrow.triangle.2.circlepath")
            }
            .buttonStyle(KNABAButtonStyle(emphasis: .secondary)).disabled(model.busy)
        }
    }
    private var shiftActions: some View {
        KNABACard(title: model.text(.timeWithoutGPS), icon: "clock") {
            KNABAField(model.text(.siteInput), icon: "building.2") {
                TextField(model.text(.siteInput), text: $model.siteId)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Button { Task { await model.startShift() } } label: { Label(model.text(.startShift), systemImage: "play.fill") }
                .buttonStyle(KNABAButtonStyle()).accessibilityIdentifier("startShift")
            Button { Task { await model.privateBreak() } } label: { Label(model.text(.privateBreak), systemImage: "pause.fill") }
                .buttonStyle(KNABAButtonStyle(emphasis: .secondary)).accessibilityIdentifier("privateBreak")
            Button { Task { await model.returnToWork() } } label: { Label(model.text(.returnToWork), systemImage: "arrow.uturn.forward") }
                .buttonStyle(KNABAButtonStyle(emphasis: .secondary))
            Button(role: .destructive) { Task { await model.endShift() } } label: { Label(model.text(.endShift), systemImage: "stop.fill") }
                .buttonStyle(KNABAButtonStyle(emphasis: .secondary)).accessibilityIdentifier("endShift")
        }
    }
    private var travelCard: some View {
        KNABACard(title: model.text(.businessTravel), icon: "car") {
            KNABAField(model.text(.destinationInput), icon: "mappin.and.ellipse") {
                TextField(model.text(.destinationInput), text: $model.destinationId)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Button { Task { await model.startTrip() } } label: { Label(model.text(.startTrip), systemImage: "car.fill") }
                .buttonStyle(KNABAButtonStyle(emphasis: .secondary))
            Button { Task { await model.arrive() } } label: { Label(model.text(.arrive), systemImage: "checkmark.circle") }
                .buttonStyle(KNABAButtonStyle(emphasis: .secondary))
            Text(model.text(.arrivalNotice)).font(.caption).foregroundStyle(KNABATheme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    private var locationCard: some View {
        KNABACard(title: model.text(.locationControl), icon: "location.slash") {
            Text(model.text(.privacyNotice)).font(.subheadline).foregroundStyle(KNABATheme.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button { Task { await model.enableGPS() } } label: {
                Label(model.text(.enableGPS), systemImage: "location")
            }.buttonStyle(KNABAButtonStyle(emphasis: .secondary)).disabled(model.busy)
            Button(model.text(.backgroundPermission)) { tracker.requestBackgroundPermission() }
                .buttonStyle(KNABAButtonStyle(emphasis: .secondary))
            Button(role: .destructive) { tracker.stop() } label: { Label(model.text(.gpsOff), systemImage: "location.slash.fill") }
                .buttonStyle(KNABAButtonStyle(emphasis: .secondary))
            Text(model.text(.operatingSystemNotice)).font(.caption).foregroundStyle(KNABATheme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    private var enrollmentCard: some View {
        KNABACard(title: model.text(.enrollment), icon: "iphone") {
            KNABAField(model.text(.origin), icon: "network") {
                TextField(model.text(.origin), text: $model.origin)
                    .textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
            }
            KNABAField(model.text(.enrollmentCode), icon: "key") {
                SecureField(model.text(.enrollmentCode), text: $model.enrollmentCode)
            }
            Button { Task { await model.enroll() } } label: { Label(model.text(.enroll), systemImage: "link") }
                .buttonStyle(KNABAButtonStyle(emphasis: .secondary)).disabled(model.busy)
            Text(model.text(.enrollmentNotice)).font(.caption).foregroundStyle(KNABATheme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    private var reconciliationCard: some View {
        KNABACard(title: model.text(.reconcile), icon: "exclamationmark.arrow.triangle.2.circlepath") {
            ForEach(model.reconciliations.suffix(20).reversed()) { item in
                VStack(alignment: .leading, spacing: 5) {
                    Text(NativeStrings.command(item.command, model.language)).font(.body.weight(.semibold))
                    Text(NativeStrings.code(item.code, model.language)).font(.subheadline).foregroundStyle(KNABATheme.muted)
                    Text(item.observedAt ?? item.receivedAt).font(.caption).foregroundStyle(KNABATheme.muted)
                }
            }
        }
    }
    private func positionText(now: Date) -> String {
        guard tracker.active, let position = tracker.lastLocationAt else { return model.text(.unknownPosition) }
        guard now >= position, now.timeIntervalSince(position) <= 120 else { return model.text(.stalePosition) }
        return NativeStrings.text(.freshPosition, model.language, position.formatted(date: .omitted, time: .standard))
    }
}

@MainActor struct KNABAShiftSummaryCard: View {
    @ObservedObject var model: AppModel
    @ObservedObject var tracker: LocationTracker
    let now: Date
    @Environment(\.dynamicTypeSize) private var typeSize
    private var columns: [GridItem] {
        typeSize >= .xxLarge ? [GridItem(.flexible())] : [GridItem(.adaptive(minimum: 140), spacing: 12)]
    }
    var body: some View {
        KNABACard(title: model.text(.myShift), icon: "clock.arrow.circlepath") {
            if !tracker.accessRevoked, let summary = model.session?.ownShiftSummary,
               let counters = summary.display(at: now, localPending: model.queued > 0 || !model.reconciliations.isEmpty) {
                let siteTitle = [summary.siteCode, summary.siteName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                VStack(alignment: .leading, spacing: 6) {
                    Text(siteTitle.isEmpty ? summary.siteId : siteTitle).font(.headline)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(NativeStrings.code(summary.state, model.language) + " · " + NativeStrings.code(summary.activity, model.language))
                        .font(.subheadline).foregroundStyle(KNABATheme.muted)
                }
                LazyVGrid(columns: columns, spacing: 12) {
                    KNABAMetric(title: model.text(.siteTime), value: NativeShiftDisplay.duration(counters.siteSeconds), icon: "building.2")
                    KNABAMetric(title: model.text(.travelTime), value: NativeShiftDisplay.duration(counters.travelSeconds), icon: "car", color: KNABATheme.metricLilac)
                    KNABAMetric(title: model.text(.breakTime), value: NativeShiftDisplay.duration(counters.breakSeconds), icon: "cup.and.saucer", color: KNABATheme.metricPeach)
                    KNABAMetric(title: model.text(.pendingTime), value: NativeShiftDisplay.duration(counters.pendingSeconds), icon: "hourglass", color: KNABATheme.soft)
                    if counters.serviceSeconds > 0 { KNABAMetric(title: model.text(.serviceTime), value: NativeShiftDisplay.duration(counters.serviceSeconds), icon: "wrench.and.screwdriver", color: KNABATheme.soft) }
                    if counters.waitingSeconds > 0 { KNABAMetric(title: model.text(.waitingTime), value: NativeShiftDisplay.duration(counters.waitingSeconds), icon: "clock", color: KNABATheme.soft) }
                }
                Text(NativeStrings.text(.snapshot, model.language, summary.asOf)).font(.caption).foregroundStyle(KNABATheme.muted)
                if counters.stale { KNABAStatusNotice(text: model.text(.staleSummary), kind: .warning) }
                if counters.localPending { KNABAStatusNotice(text: model.text(.localPending), kind: .warning) }
                if counters.reviewRequired { KNABAStatusNotice(text: model.text(.reconcile), kind: .warning) }
                Text(model.text(.provisional)).font(.caption).foregroundStyle(KNABATheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else { KNABAEmptyState(title: model.text(.noSummary), icon: "clock") }
        }
    }
}
