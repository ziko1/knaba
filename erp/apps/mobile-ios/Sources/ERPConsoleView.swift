import SwiftUI

@MainActor final class ERPConsoleModel: ObservableObject {
    @Published var language: NativeLanguage = .de
    func text(_ key: ERPText) -> String { ERPStrings.text(key, language) }
    private func describe(_ error: Error) -> String { ERPStrings.error(error, language) }
    @Published var origin: String
    @Published var email = ""
    @Published var password = ""
    @Published var otp = ""
    @Published private(set) var identity: ERPIdentity?
    @Published private(set) var dashboard: ERPDashboard?
    @Published private(set) var commands: [ERPCommand] = []
    @Published var selection = ""
    @Published private(set) var items: [ERPItem] = []
    @Published private(set) var channels: [ERPItem] = []
    @Published private(set) var messages: [ERPItem] = []
    @Published var selectedChannel = ""
    @Published var messageText = ""
    @Published private(set) var busy = false
    @Published var problem = ""
    @Published var notice = ""
    @Published private(set) var pending: ERPPendingCommand?
    @Published private(set) var recoveryBlocked = false
    @Published private(set) var commandResult: ERPField?
    @Published private(set) var resultTitle = ""
    @Published private(set) var sessionRevision = 0
    private let client: ERPConsoleClient
    private let preferences: UserDefaults
    private var epoch = 0
    private var authorityRevision: Int?
    private var storedOrigin = ""
    private var operations = Set<UUID>()
    private var reads: [String: Int] = [:]
    private var loadingKind: String?
    private var loadingChannel: String?

    init(client: ERPConsoleClient = ERPConsoleClient(), preferences: UserDefaults = .standard) {
        self.client = client
        self.preferences = preferences
        origin = preferences.string(forKey: "knaba-erp-origin") ?? ""
    }
    var modules: [ERPModule] { identity.map { ERPWorkspacePolicy.modules(for: $0.actor) } ?? [] }
    var roleLabel: String { identity?.actor.roles.joined(separator: " · ") ?? "" }
    var canWrite: Bool { identity != nil && !busy && pending == nil && !recoveryBlocked }
    var canMessage: Bool { commands.contains { $0.name == "message.send" } }

    private func begin() -> UUID { let id = UUID(); operations.insert(id); busy = true; return id }
    private func finish(_ id: UUID) { operations.remove(id); busy = !operations.isEmpty }
    private func readTicket(_ name: String) -> Int { let next = (reads[name] ?? 0) + 1; reads[name] = next; return next }
    private func current(_ ticket: Int, _ key: String, _ read: Int) -> Bool { epoch == ticket && reads[key] == read && identity != nil }
    private func clearViews() {
        items = []; channels = []; messages = []; commands = []; dashboard = nil
        selectedChannel = ""; messageText = ""; selection = ""
        commandResult = nil; resultTitle = ""; pending = nil; recoveryBlocked = false
        operations.removeAll(); reads.removeAll(); loadingKind = nil; loadingChannel = nil; busy = false; sessionRevision += 1
    }
    private func clearSession() {
        epoch += 1; authorityRevision = nil; identity = nil; clearViews(); password = ""; otp = ""; notice = ""
    }
    private func adopt(_ next: ERPIdentity) {
        identity = next
        if !modules.contains(where: { $0.kind == selection }) { selection = modules.first?.kind ?? ""; items = [] }
    }
    private func sameAuthority(_ a: ERPActor, _ b: ERPActor) -> Bool {
        a.userId == b.userId && a.companyId == b.companyId && a.roles.sorted() == b.roles.sorted() &&
        a.permissions.sorted() == b.permissions.sorted() && (a.siteIds ?? []).sorted() == (b.siteIds ?? []).sorted() &&
        (a.customerIds ?? []).sorted() == (b.customerIds ?? []).sorted()
    }
    private func syncPending(_ ticket: Int) async {
        do {
            let value = try await client.pendingCommand()
            guard epoch == ticket, identity != nil else { return }
            pending = value; recoveryBlocked = false
        } catch {
            guard epoch == ticket else { return }
            recoveryBlocked = true; problem = describe(error)
        }
    }
    private func failed(_ error: Error, ticket: Int) async {
        guard epoch == ticket else { return }
        let stillAuthenticated = await client.hasSession()
        guard epoch == ticket else { return }
        if !stillAuthenticated || (error as? ERPFailure) == .expired || (error as? ERPFailure) == .accessChanged {
            clearSession(); problem = describe(error); return
        }
        if let failure = error as? ERPFailure, case .http(let status, _) = failure, status == 401 {
            clearSession(); problem = text(.errorExpired); return
        }
        problem = describe(error); commandResult = nil
        await syncPending(ticket)
    }
    func signIn() async {
        guard !busy else { return }
        let credentials = (email: email, password: password, otp: otp)
        clearSession(); problem = ""; notice = ""
        let operation = begin(), ticket = epoch
        defer { finish(operation) }
        do {
            try await client.configure(origin)
            guard let normalized = ERPOrigin.validate(origin) else { throw ERPFailure.invalidOrigin }
            storedOrigin = normalized.absoluteString
            let result = try await client.login(email: credentials.email, password: credentials.password, otp: credentials.otp)
            let authority = await client.authorityState()
            guard epoch == ticket else { return }
            guard let verified = authority.identity, verified.actor.userId == result.actor.userId,
                  verified.actor.companyId == result.actor.companyId else { throw ERPFailure.accessChanged }
            authorityRevision = authority.revision
            adopt(verified); password = ""; otp = ""
            preferences.set(storedOrigin, forKey: "knaba-erp-origin")
            notice = text(.connected)
            await syncPending(ticket)
            guard epoch == ticket else { return }
            await loadOverview()
        } catch {
            guard ticket == epoch else { return }
            password = ""; otp = ""; identity = nil; problem = describe(error)
        }
    }
    func reloadSession() async {
        guard let previous = identity else { return }
        let ticket = epoch
        do {
            _ = try await client.refresh()
            let authority = await client.authorityState()
            guard epoch == ticket else { return }
            guard let next = authority.identity else { throw ERPFailure.expired }
            guard ERPOrigin.validate(origin)?.absoluteString == storedOrigin else { await signOut(); return }
            if authorityRevision != authority.revision || !sameAuthority(previous.actor, next.actor) {
                epoch += 1; clearViews(); notice = text(.accessUpdated)
            }
            authorityRevision = authority.revision
            adopt(next)
            await syncPending(epoch)
        } catch { await failed(error, ticket: ticket) }
    }
    func signOut() async {
        // Clear private views before the network suspension. Late requests cannot reopen a session.
        clearSession(); problem = ""
        await client.logout()
    }
    func loadOverview() async {
        guard identity != nil else { return }
        let ticket = epoch, read = readTicket("overview"), operation = begin()
        defer { finish(operation) }
        do {
            let value = try await client.dashboard()
            let catalog = try await client.catalog()
            guard current(ticket, "overview", read) else { return }
            dashboard = value; commands = catalog
        } catch { if current(ticket, "overview", read) { await failed(error, ticket: ticket) } }
    }
    func loadKind(_ kind: String) async {
        guard identity != nil, loadingKind != kind, modules.contains(where: { $0.kind == kind }) else { return }
        selection = kind; items = []; problem = ""
        let ticket = epoch, read = readTicket("records"), operation = begin()
        loadingKind = kind
        defer { finish(operation); if epoch == ticket, reads["records"] == read { loadingKind = nil } }
        do {
            let value = try await client.entities(kind)
            guard current(ticket, "records", read), selection == kind else { return }
            items = value
        } catch { if current(ticket, "records", read) { await failed(error, ticket: ticket) } }
    }
    func loadChannels() async {
        guard identity != nil else { return }
        let ticket = epoch, read = readTicket("channels"), operation = begin()
        defer { finish(operation) }
        do {
            let list = try await client.entities("channel")
            guard current(ticket, "channels", read) else { return }
            channels = list
            if !list.contains(where: { $0.id == selectedChannel }) {
                selectedChannel = list.first?.id ?? ""; messages = []; messageText = ""
            }
            await loadMessages()
        } catch { if current(ticket, "channels", read) { channels = []; messages = []; await failed(error, ticket: ticket) } }
    }
    func loadMessages() async {
        guard loadingChannel != selectedChannel else { return }
        messages = []
        guard !selectedChannel.isEmpty, identity != nil, channels.contains(where: { $0.id == selectedChannel }) else { return }
        let ticket = epoch, channel = selectedChannel, read = readTicket("messages"), operation = begin()
        loadingChannel = channel
        defer { finish(operation); if epoch == ticket, reads["messages"] == read { loadingChannel = nil } }
        do {
            let rows = try await client.messages(channel)
            if current(ticket, "messages", read), selectedChannel == channel { messages = rows }
        } catch { if current(ticket, "messages", read), selectedChannel == channel { await failed(error, ticket: ticket) } }
    }
    func sendMessage() async {
        guard canWrite, canMessage, channels.contains(where: { $0.id == selectedChannel }),
              !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let ticket = epoch, channel = selectedChannel, draft = messageText, operation = begin()
        defer { finish(operation) }
        problem = ""; notice = ""; commandResult = nil
        do {
            try await client.sendMessage(channelId: channel, text: draft, language: language.rawValue.uppercased())
            guard ticket == epoch else { return }
            if channel == selectedChannel, messageText == draft { messageText = "" }
            notice = text(.sent); await syncPending(ticket)
            if ticket == epoch, channel == selectedChannel { await loadMessages() }
        } catch { await failed(error, ticket: ticket) }
    }
    @discardableResult func submit(_ command: ERPCommand, fields: [String: String], versionText: String) async -> Bool {
        guard canWrite, commands.contains(where: { $0.name == command.name }) else { return false }
        let ticket = epoch, operation = begin()
        defer { finish(operation) }
        problem = ""; notice = ""; commandResult = nil
        do {
            let data = try ERPCommandInput.payload(command: command, fields: fields)
            let version = try ERPCommandInput.version(versionText)
            let result = try await client.execute(command, input: data, expectedVersion: version)
            guard epoch == ticket else { return false }
            if result.dictionary?["reauthenticationRequired"]?.bool == true {
                clearSession(); problem = text(.reauthRequired); return true
            }
            commandResult = result; resultTitle = ERPWorkspacePolicy.commandTitle(command.name, language: language)
            notice = text(.saved); await syncPending(ticket)
            if epoch == ticket {
                await loadOverview()
                if epoch == ticket, command.name.hasPrefix("task."), !selection.isEmpty { await loadKind(selection) }
            }
            return epoch == ticket
        } catch {
            await failed(error, ticket: ticket)
            if identity == nil, ["user.password.rotate", "user.mfa.configure"].contains(command.name) { problem = text(.reauthRequired) }
            return false
        }
    }
    func retryPending() async {
        guard identity != nil, pending != nil, !busy, !recoveryBlocked else { return }
        let ticket = epoch, original = pending, operation = begin()
        defer { finish(operation) }
        problem = ""; notice = ""; commandResult = nil
        do {
            let result = try await client.retryPending()
            guard epoch == ticket else { return }
            commandResult = result; resultTitle = original.map { ERPWorkspacePolicy.commandTitle($0.name, language: language) } ?? ""
            notice = text(.recovered); await syncPending(ticket)
            if epoch == ticket { await loadOverview(); if !selection.isEmpty { await loadKind(selection) } }
        } catch { await failed(error, ticket: ticket) }
    }
}

struct ERPConsoleView: View {
    @ObservedObject var preferences: AppModel
    @StateObject private var model = ERPConsoleModel()
    @State private var selectedTab = 0
    @State private var search = ""
    @State private var confirmRetry = false
    @Environment(\.scenePhase) private var scenePhase
    private var filteredItems: [ERPItem] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return query.isEmpty ? model.items : model.items.filter {
            $0.title.localizedCaseInsensitiveContains(query) || $0.subtitle.localizedCaseInsensitiveContains(query) || $0.id.localizedCaseInsensitiveContains(query)
        }
    }
    var body: some View {
        NavigationStack {
            Group { if model.identity == nil { login } else { console } }
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
                                .accessibilityIdentifier("erpSignOut")
                        }
                    }
                }
        }
        .id(model.sessionRevision)
        .tint(Color(red: 0.78, green: 0.31, blue: 0.08))
        .onChange(of: preferences.localeSelection, initial: true) { _, _ in model.language = preferences.language }
        .onChange(of: model.sessionRevision) { _, _ in selectedTab = 0; search = "" }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && model.identity != nil { Task { await model.reloadSession() } }
        }
        .task(id: model.identity?.actor.userId) {
            guard model.identity != nil else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                if scenePhase == .active { await model.reloadSession() }
            }
        }
    }
    private var login: some View {
        Form {
            Section {
                Label(model.text(.roleHeading), systemImage: "building.2.crop.circle").font(.headline)
                Text(model.text(.loginIntro)).font(.footnote).foregroundStyle(.secondary)
            }
            Section(model.text(.server)) {
                TextField("https://erp.example.de", text: $model.origin)
                    .textContentType(.URL).textInputAutocapitalization(.never).keyboardType(.URL).autocorrectionDisabled()
                Text(model.text(.serverNotice)).font(.caption).foregroundStyle(.secondary)
            }
            Section(model.text(.account)) {
                TextField(model.text(.email), text: $model.email).keyboardType(.emailAddress)
                    .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField(model.text(.password), text: $model.password).textContentType(.password)
                TextField(model.text(.otp), text: $model.otp).keyboardType(.numberPad).textContentType(.oneTimeCode)
                Button { Task { await model.signIn() } } label: {
                    Label(model.text(.signIn), systemImage: "lock.shield").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent)
                    .disabled(model.busy || model.email.isEmpty || model.password.isEmpty || ERPOrigin.validate(model.origin) == nil)
                    .accessibilityIdentifier("erpSignIn")
            }
            if model.busy { ProgressView(model.text(.loading)) }
            if !model.problem.isEmpty { Section { Text(model.problem).foregroundStyle(.red).accessibilityIdentifier("erpError") } }
            Section { Text(model.text(.shiftNotice)).font(.caption).foregroundStyle(.secondary) }
        }
    }
    private var console: some View {
        VStack(spacing: 0) {
            if model.busy { ProgressView(model.text(.loading)).padding(6) }
            if !model.problem.isEmpty { Text(model.problem).font(.callout).foregroundStyle(.red).padding(10).accessibilityIdentifier("erpError") }
            if !model.notice.isEmpty { Text(model.notice).font(.caption).foregroundStyle(.secondary).padding(.horizontal, 10) }
            if model.pending != nil || model.recoveryBlocked { recovery }
            Picker(model.text(.module), selection: $selectedTab) {
                Text(model.text(.overview)).tag(0)
                Text(model.text(.records)).tag(1)
                Text(model.text(.messages)).tag(2)
                Text(model.text(.actions)).tag(3)
            }.pickerStyle(.segmented).padding(.horizontal)
            Group {
                switch selectedTab { case 1: records; case 2: messages; case 3: actions; default: overview }
            }
        }.privacySensitive()
    }
    private var recovery: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(model.text(.pendingTitle), systemImage: "arrow.clockwise.circle").font(.headline)
            Text(model.text(model.recoveryBlocked ? .errorRecovery : .pendingNotice)).font(.caption)
            if let pending = model.pending {
                Text(ERPWorkspacePolicy.commandTitle(pending.name, language: model.language)).font(.caption.monospaced())
                DisclosureGroup(model.text(.pendingDetails)) {
                    Text(pending.createdAt.formatted(date: .abbreviated, time: .shortened)).font(.caption)
                    if let version = pending.expectedVersion { LabeledContent(model.text(.version), value: String(version)) }
                    if let input = try? JSONDecoder().decode(ERPField.self, from: pending.input) {
                        ScrollView { ERPResultView(value: input, model: model) }.frame(maxHeight: 180)
                    }
                }
                Button(model.text(.retryOriginal)) { confirmRetry = true }
                    .disabled(model.busy || model.recoveryBlocked).accessibilityIdentifier("erpRetryOriginal")
            }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(.orange.opacity(0.12))
            .confirmationDialog(model.text(.retryOriginal), isPresented: $confirmRetry) {
                Button(model.text(.confirm)) { Task { await model.retryPending() } }
                Button(model.text(.cancel), role: .cancel) { }
            } message: { Text(model.text(.pendingNotice)) }
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
                        LabeledContent(ERPWorkspacePolicy.allModules.first(where: { $0.kind == key }).map { model.text($0.title) } ?? key,
                                       value: String(stats.counts[key] ?? 0))
                    }
                    LabeledContent(model.text(.activeShifts), value: String(stats.activeShifts ?? 0))
                } else { ContentUnavailableView(model.text(.unavailable), systemImage: "wifi.slash") }
                Button(model.text(.refresh)) { Task { await model.reloadSession(); await model.loadOverview() } }
            }
            Section(model.text(.areas)) {
                ForEach(model.modules) { module in
                    Button { selectedTab = 1; Task { await model.loadKind(module.kind) } } label: {
                        Label(model.text(module.title), systemImage: module.icon)
                    }
                }
            }
            if let result = model.commandResult { Section(model.resultTitle) { ERPResultView(value: result, model: model) } }
            Section { Text(model.text(.presenceNotice)).font(.footnote).foregroundStyle(.secondary) }
        }.refreshable { await model.reloadSession(); await model.loadOverview() }
    }
    private var records: some View {
        List {
            Section(model.text(.module)) {
                Picker(model.text(.records), selection: $model.selection) {
                    ForEach(model.modules) { module in Text(model.text(module.title)).tag(module.kind) }
                }.onChange(of: model.selection) { _, kind in search = ""; Task { await model.loadKind(kind) } }
                Button(model.text(.refresh)) { Task { await model.loadKind(model.selection) } }
            }
            Section(ERPStrings.text(.authorizedCount, model.language, String(filteredItems.count))) {
                if filteredItems.isEmpty && !model.busy { ContentUnavailableView(model.text(.empty), systemImage: "tray") }
                ForEach(filteredItems) { item in
                    NavigationLink {
                        ERPRecordView(item: item, model: model)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title).font(.headline)
                            Text(item.subtitle).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                }
            }
        }.searchable(text: $search, prompt: model.text(.search))
            .task { if model.items.isEmpty { await model.loadKind(model.selection) } }
            .refreshable { await model.reloadSession(); await model.loadKind(model.selection) }
    }
    private var messages: some View {
        List {
            Section(model.text(.conversation)) {
                Picker(model.text(.channel), selection: $model.selectedChannel) {
                    ForEach(model.channels) { item in Text(item.title).tag(item.id) }
                }.onChange(of: model.selectedChannel) { _, _ in model.messageText = ""; Task { await model.loadMessages() } }
                Button(model.text(.refresh)) { Task { await model.loadChannels() } }
            }
            Section(model.text(.messages)) {
                if model.messages.isEmpty && !model.busy { ContentUnavailableView(model.text(.noMessages), systemImage: "bubble.left") }
                ForEach(model.messages) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.data["text"]?.string ?? item.title).textSelection(.enabled)
                        Text(item.data["author_id"]?.string ?? "KNABA").font(.caption).foregroundStyle(.secondary)
                        Text(item.data["language"]?.string ?? "").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            if model.canMessage {
                Section(model.text(.reply)) {
                    TextField(model.text(.message), text: $model.messageText, axis: .vertical).lineLimit(2...5)
                    Button(model.text(.send)) { Task { await model.sendMessage() } }
                        .disabled(!model.canWrite || model.selectedChannel.isEmpty || model.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }.task { if model.channels.isEmpty { await model.loadChannels() } }
            .refreshable { await model.reloadSession(); await model.loadChannels() }
    }
    private var actions: some View {
        List {
            Section { Text(model.text(.actionsIntro)).font(.footnote).foregroundStyle(.secondary) }
            ForEach(model.commands) { command in
                NavigationLink { ERPCommandForm(command: command, model: model) } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(ERPWorkspacePolicy.commandTitle(command.name, language: model.language)).font(.body.weight(.medium))
                            Text(command.permission).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if command.highRisk == true { Image(systemName: "exclamationmark.shield").foregroundStyle(.orange).accessibilityLabel(model.text(.confirmSensitive)) }
                    }
                }
            }
        }.refreshable { await model.reloadSession(); await model.loadOverview() }
    }
}

private struct ERPRecordView: View {
    let item: ERPItem
    @ObservedObject var model: ERPConsoleModel
    var body: some View {
        List {
          if let item = model.items.first(where: { $0.id == self.item.id }) {
            Section(model.text(.records)) {
                LabeledContent("ID", value: item.id).textSelection(.enabled)
                LabeledContent(model.text(.version), value: String(item.version))
            }
            if item.kind == "task" {
                Section(model.text(.actions)) {
                    ForEach(ERPWorkspacePolicy.taskActions(for: item, catalog: model.commands)) { command in
                        NavigationLink(ERPWorkspacePolicy.commandTitle(command.name, language: model.language)) {
                            ERPCommandForm(command: command, model: model, record: item)
                        }
                    }
                }
            }
            Section(model.text(.fields)) { ERPResultView(fields: item.data, model: model) }
          } else { ContentUnavailableView(model.text(.unavailable), systemImage: "tray") }
        }.navigationTitle(model.items.first(where: { $0.id == self.item.id })?.title ?? model.text(.unavailable)).privacySensitive()
    }
}

private struct ERPCommandForm: View {
    let command: ERPCommand
    @ObservedObject var model: ERPConsoleModel
    let record: ERPItem?
    @State private var draft: [String: String]
    @State private var expectedVersion: String
    @State private var confirmation = false
    @Environment(\.dismiss) private var dismiss
    init(command: ERPCommand, model: ERPConsoleModel, record: ERPItem? = nil) {
        self.command = command; self.model = model; self.record = record
        _draft = State(initialValue: record?.kind == "task" ? ["taskId": record!.id] : [:])
        _expectedVersion = State(initialValue: record.map { String($0.version) } ?? "")
    }
    private var properties: [(String, ERPField)] {
        (command.schema?.dictionary?["properties"]?.dictionary ?? [:]).sorted { $0.key < $1.key }
    }
    private var required: Set<String> { Set(command.schema?.dictionary?["required"]?.list?.compactMap { $0.string } ?? []) }
    private func binding(_ key: String) -> Binding<String> { Binding(get: { draft[key] ?? "" }, set: { draft[key] = $0 }) }
    private func submit() async {
        var fields = draft
        if command.name == "task.worklog" {
            do {
                for key in ["quantityMilli", "remainingQuantityMilli"] {
                    if let raw = fields[key], !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        fields[key] = try ERPCommandInput.milliQuantity(raw)
                    }
                }
            } catch { model.problem = model.text(.errorInput); return }
        }
        let success = await model.submit(command, fields: fields, versionText: expectedVersion)
        // Credentials stay in the form only until the one explicit attempt; never survive navigation.
        draft = draft.filter { !ERPWorkspacePolicy.sensitiveField($0.key) }
        if success && record != nil { dismiss() }
    }
    var body: some View {
        Form {
            Section(ERPWorkspacePolicy.commandTitle(command.name, language: model.language)) {
                if let record { Text(record.title).font(.headline) }
                ForEach(properties.map { $0.0 }, id: \.self) { key in
                    if let definition = properties.first(where: { $0.0 == key })?.1.dictionary {
                        field(key, definition: definition)
                    }
                }
                TextField(model.text(.expectedVersion), text: $expectedVersion).keyboardType(.numberPad)
            }
            if !model.problem.isEmpty { Section { Text(model.problem).foregroundStyle(.red) } }
            Section {
                Button(model.text(.submit)) {
                    if command.highRisk == true { confirmation = true }
                    else { Task { await submit() } }
                }.buttonStyle(.borderedProminent).disabled(!model.canWrite)
            }
            if let result = model.commandResult, model.resultTitle == ERPWorkspacePolicy.commandTitle(command.name, language: model.language) {
                Section(model.text(.result)) { ERPResultView(value: result, model: model) }
            }
        }.navigationTitle(model.text(.actionTitle)).privacySensitive()
            .confirmationDialog(model.text(.confirmSensitive), isPresented: $confirmation) {
                Button(model.text(.confirm) + " · " + ERPWorkspacePolicy.commandTitle(command.name, language: model.language), role: .destructive) {
                    Task { await submit() }
                }
                Button(model.text(.cancel), role: .cancel) { }
            } message: { Text(model.text(.confirmNotice)) }
    }
    @ViewBuilder private func field(_ key: String, definition: [String: ERPField]) -> some View {
        let fieldNames: [String: ERPText] = ["quantityMilli": .quantity, "remainingQuantityMilli": .remainingQuantity,
            "description": .description, "problems": .problems, "delayReason": .delayReason,
            "currentPassword": .currentPassword, "newPassword": .newPassword]
        let label = (fieldNames[key].map { model.text($0) } ?? key) + (required.contains(key) ? " *" : "")
        let type = definition["type"]?.string ?? "string"
        if record != nil && key == "taskId" {
            LabeledContent(label, value: record!.id).textSelection(.enabled)
        } else if ERPWorkspacePolicy.sensitiveField(key) {
            SecureField(label, text: binding(key)).textInputAutocapitalization(.never).autocorrectionDisabled()
        } else if let choices = definition["enum"]?.list?.compactMap({ $0.string }), !choices.isEmpty {
            Picker(label, selection: binding(key)) {
                Text(model.text(.choose)).tag("")
                ForEach(choices, id: \.self) { Text($0).tag($0) }
            }
        } else if type == "boolean" {
            Picker(label, selection: binding(key)) {
                Text(model.text(.choose)).tag("")
                Text(model.text(.yes)).tag("true")
                Text(model.text(.no)).tag("false")
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.caption.weight(.semibold))
                TextField(type == "array" ? model.text(.jsonArray) : type == "object" ? model.text(.jsonObject) : label,
                          text: binding(key), axis: .vertical).textInputAutocapitalization(.never).autocorrectionDisabled()
                if key == "quantityMilli" || key == "remainingQuantityMilli" {
                    Text(model.text(.quantityHint) + (record?.data["unit"]?.string.map { " · " + $0 } ?? "")).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct ERPResultView: View {
    let fields: [String: ERPField]
    @ObservedObject var model: ERPConsoleModel
    init(fields: [String: ERPField], model: ERPConsoleModel) { self.fields = fields; self.model = model }
    init(value: ERPField, model: ERPConsoleModel) { self.fields = value.dictionary ?? ["result": value]; self.model = model }
    private var rows: [ERPDisplayRow] { ERPDisplayRows.flatten(fields) }
    var body: some View {
        ForEach(rows) { row in
            VStack(alignment: .leading, spacing: 3) {
                Text(row.label).font(.caption).foregroundStyle(.secondary)
                Text(row.value).font(.body).textSelection(.enabled)
            }.padding(.leading, CGFloat(min(row.depth, 4) * 8))
        }
        Text(model.text(.previewLimit)).font(.caption).foregroundStyle(.secondary)
    }
}
