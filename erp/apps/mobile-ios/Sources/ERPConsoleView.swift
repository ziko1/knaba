import SwiftUI

@MainActor final class ERPConsoleModel: ObservableObject {
    @Published var language: NativeLanguage = .de
    func text(_ key: ERPText) -> String { ERPStrings.text(key, language) }
    private func describe(_ error: Error) -> String { ERPStrings.error(error, language) }
    @Published var origin = UserDefaults.standard.string(forKey: "knaba-erp-origin") ?? ""
    @Published var email = ""
    @Published var password = ""
    @Published var otp = ""
    @Published var identity: ERPIdentity?
    @Published var dashboard: ERPDashboard?
    @Published var commands: [ERPCommand] = []
    @Published var selection = "task"
    @Published var items: [ERPItem] = []
    @Published var channels: [ERPItem] = []
    @Published var messages: [ERPItem] = []
    @Published var selectedChannel = ""
    @Published var messageText = ""
    @Published var busy = false
    @Published var problem = ""
    @Published var notice = ""
    @Published var pendingCommandName: String?
    @Published var recoveryBlocked = false
    private let client: ERPConsoleClient
    private var epoch = 0
    private var storedOrigin = ""
    init(client: ERPConsoleClient = ERPConsoleClient()) { self.client = client }
    var hasPending: Bool { pendingCommandName != nil || recoveryBlocked }
    var modules: [ERPModule] {
        guard let actor = identity?.actor else { return [] }
        // A visible tab is not an authorization grant: ERP always performs its own scope validation.
        return ERPModuleCatalog.visible(to: actor)
    }
    var isOperator: Bool {
        ERPModuleCatalog.permits(identity?.actor.permissions ?? [], anyOf: ["decision.manage", "dispatch.manage", "crew.assign", "operations.read"])
    }
    var roleLabel: String { identity?.actor.roles.joined(separator: " · ") ?? "" }
    func signIn() async {
        guard !busy else { return }
        busy = true; problem = ""; notice = ""; epoch += 1
        let ticket = epoch
        do {
            try await client.configure(origin)
            storedOrigin = ERPOrigin.validate(origin)?.absoluteString ?? ""
            let result = try await client.login(email: email, password: password, otp: otp)
            guard epoch == ticket else { return }
            guard ERPOrigin.validate(origin)?.absoluteString == storedOrigin else { await signOut(ERPFailure.accessChanged); return }
            identity = result
            password = ""; otp = ""
            UserDefaults.standard.set(storedOrigin, forKey: "knaba-erp-origin")
            notice = text(.connected)
            busy = false
            await loadOverview()
        } catch {
            guard ticket == epoch else { return }
            problem = describe(error); identity = nil; busy = false
        }
    }
    func reloadSession() async {
        guard identity != nil, !busy else { return }
        let ticket = epoch
        do {
            let next = try await client.refresh()
            guard ticket == epoch, identity != nil else { return }
            guard storedOrigin == ERPOrigin.validate(origin)?.absoluteString else { await signOut(ERPFailure.accessChanged); return }
            identity = next
            await reloadPendingState()
        } catch { if ticket == epoch { await signOut(error) } }
    }
    func signOut(_ error: Error? = nil) async {
        epoch += 1
        identity = nil; items = []; commands = []; channels = []; messages = []; dashboard = nil
        selectedChannel = ""; messageText = ""; password = ""; otp = ""
        pendingCommandName = nil; recoveryBlocked = false
        notice = ""; problem = error.map(describe) ?? ""; busy = false
        await client.logout()
    }
    private func failed(_ error: Error, ticket: Int) async {
        guard ticket == epoch else { return }
        if let failure = error as? ERPFailure {
            switch failure {
            case .expired, .accessChanged:
                await signOut(error); return
            case .http(let status, _) where status == 401:
                await signOut(error); return
            default: break
            }
        }
        problem = describe(error)
    }
    private func reloadPendingState() async {
        guard identity != nil else { return }
        let ticket = epoch
        do {
            let pending = try await client.pendingCommand()
            guard ticket == epoch else { return }
            pendingCommandName = pending?.command; recoveryBlocked = false
        } catch {
            guard ticket == epoch else { return }
            pendingCommandName = nil; recoveryBlocked = true
            problem = describe(error)
        }
    }
    func retryPending() async {
        guard identity != nil, !busy, pendingCommandName != nil else { return }
        let ticket = epoch
        busy = true; problem = ""; notice = ""
        do {
            let pending = try await client.pendingCommand()
            _ = try await client.retryPendingCommand()
            guard ticket == epoch else { return }
            let refreshed = await client.identity
            guard ticket == epoch else { return }
            identity = refreshed
            // Recovering an older message must not erase a different draft composed meanwhile.
            if let pending, pending.command == "message.send",
               let envelope = try? JSONSerialization.jsonObject(with: pending.body) as? [String: Any],
               let input = envelope["input"] as? [String: Any],
               input["channel_id"] as? String == selectedChannel,
               input["text"] as? String == messageText.trimmingCharacters(in: .whitespacesAndNewlines) {
                messageText = ""
            }
            pendingCommandName = nil; recoveryBlocked = false; notice = text(.recoveryResolved)
        } catch { await failed(error, ticket: ticket) }
        guard ticket == epoch else { return }
        busy = false
        await reloadPendingState()
        if !hasPending { await loadOverview() }
    }
    func loadOverview() async {
        guard identity != nil else { return }
        busy = true; problem = ""
        let ticket = epoch
        do {
            let value = try await client.dashboard()
            let catalog = try await client.catalog()
            guard epoch == ticket else { return }
            dashboard = value; commands = catalog
        } catch {
            guard epoch == ticket else { return }
            await failed(error, ticket: ticket)
        }
        if epoch == ticket { busy = false }
        if epoch == ticket { await reloadPendingState() }
    }
    func loadKind(_ kind: String) async {
        guard identity != nil, !busy else { return }
        busy = true; problem = ""; selection = kind; items = []
        let ticket = epoch
        do {
            let value = try await client.entities(kind)
            guard epoch == ticket && selection == kind else { return }
            items = value
        } catch {
            guard epoch == ticket else { return }
            items = []; await failed(error, ticket: ticket)
        }
        if epoch == ticket { busy = false }
    }
    func loadChannels() async {
        guard identity != nil else { return }
        busy = true; problem = ""
        let ticket = epoch
        do {
            let list = try await client.entities("channel")
            guard epoch == ticket else { return }
            channels = list
            if !list.contains(where: { $0.id == selectedChannel }) { selectedChannel = list.first?.id ?? "" }
        } catch { if epoch == ticket { channels = []; messages = []; await failed(error, ticket: ticket) } }
        if epoch == ticket { busy = false; if !selectedChannel.isEmpty { await loadMessages() } }
    }
    func loadMessages() async {
        guard !selectedChannel.isEmpty, identity != nil else { return }
        let ticket = epoch, channel = selectedChannel
        do {
            let rows = try await client.messages(channel)
            if ticket == epoch && selectedChannel == channel { messages = rows }
        } catch { await failed(error, ticket: ticket) }
    }
    func sendMessage() async {
        guard !busy, !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        busy = true; problem = ""; let ticket = epoch
        do {
            try await client.sendMessage(channelId: selectedChannel, text: messageText, language: language.rawValue.uppercased())
            if ticket == epoch { messageText = ""; notice = text(.sent) }
            if ticket == epoch { await loadMessages() }
        } catch { await failed(error, ticket: ticket) }
        if ticket == epoch { busy = false }
        if ticket == epoch { await reloadPendingState() }
    }
    func submit(_ command: ERPCommand, fields: [String: String], version: Int?) async {
        guard !busy else { return }
        busy = true; problem = ""; notice = ""; let ticket = epoch
        do {
            var payload: [String: Any] = [:]
            let schema = command.schema?.dictionary
            let properties = schema?["properties"]?.dictionary ?? [:]
            let required = schema?["required"]?.list?.compactMap { $0.string } ?? []
            for (key, definition) in properties {
                let raw = (fields[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if raw.isEmpty { if required.contains(key) { throw ERPFailure.invalidPayload }; continue }
                let type = definition.dictionary?["type"]?.string ?? "string"
                switch type {
                case "integer": guard let n = Int(raw) else { throw ERPFailure.invalidPayload }; payload[key] = n
                case "number": guard let n = Double(raw), n.isFinite else { throw ERPFailure.invalidPayload }; payload[key] = n
                case "boolean": guard raw == "true" || raw == "false" else { throw ERPFailure.invalidPayload }; payload[key] = raw == "true"
                case "array", "object":
                    guard let data = raw.data(using: .utf8) else { throw ERPFailure.invalidPayload }
                    let parsed = try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
                    guard type == "array" ? parsed is [Any] : parsed is [String: Any] else { throw ERPFailure.invalidPayload }
                    payload[key] = parsed
                default: payload[key] = raw
                }
            }
            let data = try JSONSerialization.data(withJSONObject: payload)
            _ = try await client.execute(command, input: data, expectedVersion: version)
            if epoch == ticket { notice = text(.saved); await loadOverview() }
        } catch { await failed(error, ticket: ticket) }
        if epoch == ticket { busy = false }
        if epoch == ticket { await reloadPendingState() }
    }
}

struct ERPConsoleView: View {
    @ObservedObject var preferences: AppModel
    @StateObject private var model = ERPConsoleModel()
    @State private var selectedTab = 0
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            Group {
                if model.identity == nil { login }
                else { console }
            }
            .navigationTitle(model.identity == nil ? "KNABA DE" : model.text(.title))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Picker(preferences.text(.language), selection: $preferences.localeSelection) {
                        ForEach(NativeLanguage.allCases) { language in Text(language.name).tag(language.rawValue) }
                        Text(preferences.text(.deviceLanguage)).tag("system")
                    }.accessibilityIdentifier("erpLanguageSelector")
                }
                if model.identity != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(model.text(.signOut), systemImage: "rectangle.portrait.and.arrow.right") { Task { await model.signOut() } }
                    }
                }
            }
        }
        .onChange(of: preferences.localeSelection, initial: true) { _, _ in
            model.language = preferences.language
            model.problem = ""; model.notice = ""
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && model.identity != nil { Task { await model.reloadSession() } }
        }
    }
    private var login: some View {
        Form {
            Section {
                Label(model.text(.roleHeading), systemImage: "building.2.crop.circle")
                    .font(.headline)
                Text(model.text(.loginIntro))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section(model.text(.server)) {
                TextField("https://erp.example.de", text: $model.origin)
                    .textContentType(.URL).textInputAutocapitalization(.never)
                    .keyboardType(.URL).autocorrectionDisabled()
            }
            Section(model.text(.account)) {
                TextField(model.text(.email), text: $model.email).keyboardType(.emailAddress)
                    .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField(model.text(.password), text: $model.password).textContentType(.password)
                TextField(model.text(.otp), text: $model.otp).keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                Button { Task { await model.signIn() } } label: {
                    Label(model.text(.signIn), systemImage: "lock.shield")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.busy || model.email.isEmpty || model.password.isEmpty || ERPOrigin.validate(model.origin) == nil)
            }
            if !model.problem.isEmpty { Section { Text(model.problem).foregroundStyle(.red) } }
            Section { Text(model.text(.shiftNotice)).font(.caption).foregroundStyle(.secondary) }
        }
    }
    private var console: some View {
        VStack(spacing: 0) {
            if !model.problem.isEmpty { Text(model.problem).font(.callout).foregroundStyle(.red).padding(10) }
            if !model.notice.isEmpty { Text(model.notice).font(.caption).foregroundStyle(.secondary).padding(.horizontal, 10) }
            if let command = model.pendingCommandName {
                VStack(alignment: .leading, spacing: 6) {
                    Label(model.text(.recoveryTitle), systemImage: "arrow.clockwise.circle").font(.headline)
                    Text(model.text(.recoveryNotice)).font(.footnote)
                    Text(command).font(.caption).foregroundStyle(.secondary)
                    Button(model.text(.recoveryRetry)) { Task { await model.retryPending() } }
                        .buttonStyle(.borderedProminent).disabled(model.busy)
                        .accessibilityIdentifier("erpRetryPendingCommand")
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(12)
            }
            Picker(model.text(.module), selection: $selectedTab) {
                Label(model.text(.overview), systemImage: "square.grid.2x2").tag(0)
                Label(model.text(.records), systemImage: "list.bullet.rectangle").tag(1)
                Label(model.text(.messages), systemImage: "bubble.left.and.bubble.right").tag(2)
                Label(model.text(.actions), systemImage: "slider.horizontal.3").tag(3)
            }
            .pickerStyle(.segmented).padding(.horizontal)
            Group {
                switch selectedTab {
                case 1: records
                case 2: messages
                case 3: actions
                default: overview
                }
            }
        }
        .task { if model.dashboard == nil { await model.loadOverview() } }
    }
    private var overview: some View {
        List {
            Section(model.text(.permissions)) {
                LabeledContent(model.text(.signedIn), value: model.identity?.user.name ?? model.identity?.user.email ?? "KNABA")
                LabeledContent(model.text(.roles), value: model.roleLabel)
                LabeledContent(model.text(.company), value: model.identity?.actor.companyId ?? "—")
            }
            Section(model.text(.liveOverview)) {
                if let stats = model.dashboard {
                    ForEach(stats.counts.keys.sorted(), id: \.self) { key in
                        LabeledContent(key.replacingOccurrences(of: "_", with: " ").capitalized, value: String(stats.counts[key] ?? 0))
                    }
                    LabeledContent(model.text(.activeShifts), value: String(stats.activeShifts ?? 0))
                } else { ContentUnavailableView(model.text(.unavailable), systemImage: "wifi.slash") }
                Button(model.text(.refresh)) { Task { await model.loadOverview() } }
            }
            Section(model.text(.areas)) {
                ForEach(model.modules) { module in
                    Button { selectedTab = 1; Task { await model.loadKind(module.kind) } } label: {
                        Label(model.text(module.title), systemImage: module.icon)
                    }
                }
            }
            Section {
                Text(model.text(.presenceNotice))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .refreshable { await model.loadOverview() }
    }
    private var records: some View {
        List {
            Section(model.text(.module)) {
                Picker(model.text(.records), selection: $model.selection) {
                    ForEach(model.modules) { module in Text(model.text(module.title)).tag(module.kind) }
                }
                .onChange(of: model.selection) { _, kind in Task { await model.loadKind(kind) } }
                Button(model.text(.refresh)) { Task { await model.loadKind(model.selection) } }
            }
            Section(ERPStrings.text(.authorizedCount, model.language, String(model.items.count))) {
                if model.items.isEmpty { ContentUnavailableView(model.text(.empty), systemImage: "tray") }
                ForEach(model.items) { item in
                    NavigationLink {
                        List {
                            Section(item.kind) { LabeledContent("ID", value: item.id); LabeledContent(model.text(.version), value: String(item.version)) }
                            Section(model.text(.fields)) {
                                ForEach(item.data.keys.sorted(), id: \.self) { key in
                                    LabeledContent(key, value: item.data[key]?.string ?? (item.data[key]?.dictionary != nil ? model.text(.object) : item.data[key]?.list != nil ? model.text(.list) : "—"))
                                }
                            }
                        }.navigationTitle(item.title)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title).font(.headline)
                            Text(item.subtitle).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                }
            }
        }
        .task { if model.items.isEmpty { await model.loadKind(model.selection) } }
        .refreshable { await model.loadKind(model.selection) }
    }
    private var messages: some View {
        List {
            Section(model.text(.conversation)) {
                Picker(model.text(.channel), selection: $model.selectedChannel) {
                    ForEach(model.channels) { item in Text(item.title).tag(item.id) }
                }
                .onChange(of: model.selectedChannel) { _, _ in Task { await model.loadMessages() } }
                Button(model.text(.refresh)) { Task { await model.loadChannels() } }
            }
            Section(model.text(.messages)) {
                if model.messages.isEmpty { ContentUnavailableView(model.text(.noMessages), systemImage: "bubble.left") }
                ForEach(model.messages) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.data["text"]?.string ?? item.title).font(.body)
                        Text(item.data["language"]?.string ?? "KNABA").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Section(model.text(.reply)) {
                TextField(model.text(.message), text: $model.messageText, axis: .vertical).lineLimit(2...5)
                Button(model.text(.send)) { Task { await model.sendMessage() } }
                    .disabled(model.busy || model.hasPending || model.selectedChannel.isEmpty || model.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .task { if model.channels.isEmpty { await model.loadChannels() } }
        .refreshable { await model.loadChannels() }
    }
    private var actions: some View {
        List {
            Section {
                Text(model.text(.actionsIntro))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(model.commands) { command in
                NavigationLink {
                    ERPCommandForm(command: command, model: model)
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(command.name).font(.body.weight(.medium))
                            Text(command.permission).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if command.highRisk == true { Image(systemName: "exclamationmark.shield").foregroundStyle(.orange) }
                    }
                }
            }
        }
        .refreshable { await model.loadOverview() }
    }
}

private struct ERPCommandForm: View {
    let command: ERPCommand
    @ObservedObject var model: ERPConsoleModel
    @State private var draft: [String: String] = [:]
    @State private var expectedVersion = ""
    @State private var confirmation = false
    private var properties: [(String, ERPField)] {
        (command.schema?.dictionary?["properties"]?.dictionary ?? [:]).sorted { $0.key < $1.key }
    }
    private var required: Set<String> {
        Set(command.schema?.dictionary?["required"]?.list?.compactMap { $0.string } ?? [])
    }
    var body: some View {
        Form {
            Section(command.name) {
                Text(command.permission).font(.caption).foregroundStyle(.secondary)
                ForEach(properties.map { $0.0 }, id: \.self) { key in
                    if let definition = properties.first(where: { $0.0 == key })?.1 {
                    let isRequired = required.contains(key)
                    let type = definition.dictionary?["type"]?.string ?? "string"
                    VStack(alignment: .leading) {
                        Text(key + (isRequired ? " *" : "")).font(.caption.weight(.semibold))
                        TextField(type == "array" ? model.text(.jsonArray) : type == "object" ? model.text(.jsonObject) : type,
                                  text: Binding(get: { draft[key] ?? "" }, set: { draft[key] = $0 }), axis: .vertical)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        if type == "boolean" { Text(model.text(.booleanHint)).font(.caption).foregroundStyle(.secondary) }
                    }
                    }
                }
                TextField(model.text(.expectedVersion), text: $expectedVersion).keyboardType(.numberPad)
            }
            Section {
                if model.hasPending {
                    Text(model.text(.recoveryNotice)).font(.footnote)
                    if model.pendingCommandName != nil {
                        Button(model.text(.recoveryRetry)) { Task { await model.retryPending() } }
                            .disabled(model.busy)
                    }
                }
                if !model.problem.isEmpty { Text(model.problem).foregroundStyle(.red) }
                Button(model.text(.submit)) {
                    if command.highRisk == true { confirmation = true }
                    else { Task { await model.submit(command, fields: draft, version: Int(expectedVersion)) } }
                }
                .buttonStyle(.borderedProminent).disabled(model.busy || model.hasPending)
            }
        }
        .navigationTitle(model.text(.actionTitle))
        .confirmationDialog(model.text(.confirmSensitive), isPresented: $confirmation) {
            Button(model.text(.confirm) + " · " + command.name, role: .destructive) {
                Task { await model.submit(command, fields: draft, version: Int(expectedVersion)) }
            }
        } message: { Text(model.text(.confirmNotice)) }
    }
}
