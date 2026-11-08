import SwiftUI

/// Role labels select presentation only. The ERP remains the authority for all data/actions.
enum ERPWorkspaceRoute: String, CaseIterable, Identifiable {
    case client, worker, partner, bauleiter, owner
    var id: String { rawValue }
    static func available(_ actor: ERPActor) -> [Self] {
        let roles = Set(actor.roles.map { $0.uppercased() })
        let permissions = actor.permissions
        func has(_ names: [String]) -> Bool { ERPModuleCatalog.permits(permissions, anyOf: names) }
        return allCases.filter { workspace in
            switch workspace {
            case .client: return !roles.isDisjoint(with: ["CLIENT", "CUSTOMER"]) && has(["customer.portal"])
            case .worker: return !roles.isDisjoint(with: ["WORKER", "EMPLOYEE", "TEAM_LEADER"]) && has(["task.read", "shift.read"])
            case .partner: return roles.contains("PARTNER") && has(["lead.manage_own", "customer.portal"])
            case .bauleiter: return !roles.isDisjoint(with: ["BAULEITER", "SITE_MANAGER", "INTERNAL_BAULEITER", "EXTERNAL_BAULEITER"]) && has(["crew.assign", "dispatch.manage"])
            case .owner: return !roles.isDisjoint(with: ["OWNER", "DIRECTOR"]) && has(["identity.manage", "operations.read"])
            }
        }
    }
}

@MainActor final class ERPConsoleModel: ObservableObject {
    @Published var language: NativeLanguage = .de
    func text(_ key: ERPText) -> String { ERPStrings.text(key, language) }
    private func describe(_ error: Error) -> String { ERPStrings.error(error, language) }
    @Published var origin = UserDefaults.standard.string(forKey: "knaba-erp-origin") ?? ""
    @Published var email = ""
    @Published var password = ""
    @Published var otp = ""
    @Published var identity: ERPIdentity?
    @Published var availableWorkspaces: [ERPWorkspaceRoute] = []
    @Published var selectedWorkspace: ERPWorkspaceRoute?
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
    private var commandAuthority: ERPConsoleClient.Authority?
    private var storedOrigin = ""
    init(client: ERPConsoleClient = ERPConsoleClient()) { self.client = client }
    var hasPending: Bool { pendingCommandName != nil || recoveryBlocked }
    var sessionGeneration: Int { epoch }
    func actionTitle(_ name: String, includeModule: Bool = false) -> String {
        if name == "user.password.rotate" { return text(.changePassword) }
        if name == "user.mfa.configure" { return text(.configureMFA) }
        return ERPActionLabels.title(name, language: language, includeModule: includeModule)
    }
    func fieldLabel(_ name: String) -> String {
        switch name {
        case "currentPassword": return text(.currentPassword)
        case "newPassword": return text(.newPassword)
        case "secret": return text(.mfaSecret)
        case "otp": return text(.credentialOtp)
        default: return ERPActionLabels.field(name, language: language)
        }
    }
    func recordActions(_ record: ERPItem) -> [ERPCommand] {
        guard let actor = identity?.actor else { return [] }
        return commands.filter { ERPRecordActions.context(for: record, command: $0, actor: actor) != nil }
    }
    var modules: [ERPModule] {
        guard let actor = identity?.actor else { return [] }
        // A visible tab is not an authorization grant: ERP always performs its own scope validation.
        let permitted = ERPModuleCatalog.visible(to: actor)
        // The chooser prevents navigation without selection. Keep the existing
        // catalog projection available to isolated presentation tests and legacy callers.
        guard let workspace = selectedWorkspace else { return permitted }
        // Presentation-only subsets. ERP still validates every read/write on the server.
        let kinds: Set<String>
        switch workspace {
        case .client:
            kinds = ["site", "order", "lead", "quote", "change_order", "channel", "report", "report_version", "issue", "media_asset", "notification"]
        case .worker:
            kinds = ["task", "site", "crew_assignment", "shift", "timesheet", "trip", "vehicle_trip", "defect", "worklog", "channel", "notification", "official_payslip", "receipt"]
        case .partner:
            kinds = ["lead", "quote", "order", "site", "channel", "media_asset", "notification"]
        case .bauleiter:
            kinds = ["task", "site", "order", "crew_assignment", "employee", "shift", "timesheet", "defect", "worklog", "report", "report_version", "channel", "media_asset", "notification"]
        case .owner:
            return permitted
        }
        return permitted.filter { kinds.contains($0.kind) }
    }
    var isOperator: Bool {
        ERPModuleCatalog.permits(identity?.actor.permissions ?? [], anyOf: ["decision.manage", "dispatch.manage", "crew.assign", "operations.read"])
    }
    var roleLabel: String { identity?.actor.roles.map { ERPStrings.role($0, language) }.joined(separator: " · ") ?? "" }
    func updateWorkspaceRoute(_ actor: ERPActor) {
        let next = ERPWorkspaceRoute.available(actor)
        availableWorkspaces = next
        if let selectedWorkspace, next.contains(selectedWorkspace) { return }
        selectedWorkspace = next.count == 1 ? next[0] : nil
    }
    func signIn() async {
        guard !busy else { return }
        busy = true; problem = ""; notice = ""; epoch += 1
        let ticket = epoch
        do {
            try await client.configure(origin)
            storedOrigin = ERPOrigin.validate(origin)?.absoluteString ?? ""
            let result = try await client.login(email: email, password: password, otp: otp)
            let authority = try await client.commandAuthority()
            guard epoch == ticket else { return }
            guard ERPOrigin.validate(origin)?.absoluteString == storedOrigin else { await signOut(ERPFailure.accessChanged); return }
            identity = result
            updateWorkspaceRoute(result.actor)
            commandAuthority = authority
            password = ""; otp = ""
            UserDefaults.standard.set(storedOrigin, forKey: "knaba-erp-origin")
            notice = text(.connected)
            busy = false
            await loadOverview()
        } catch {
            guard ticket == epoch else { return }
            problem = describe(error); identity = nil; commandAuthority = nil; busy = false
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
            updateWorkspaceRoute(next.actor)
            await reloadPendingState()
        } catch { if ticket == epoch { await signOut(error) } }
    }
    private func clearSessionPresentation(_ error: Error? = nil) {
        epoch += 1
        identity = nil; availableWorkspaces = []; selectedWorkspace = nil
        items = []; commands = []; channels = []; messages = []; dashboard = nil
        commandAuthority = nil
        selectedChannel = ""; messageText = ""; password = ""; otp = ""
        pendingCommandName = nil; recoveryBlocked = false
        notice = ""; problem = error.map(describe) ?? ""; busy = false
    }
    func signOut(_ error: Error? = nil) async {
        clearSessionPresentation(error)
        await client.logout()
    }
    private func failed(_ error: Error, ticket: Int) async {
        guard ticket == epoch else { return }
        if let failure = error as? ERPFailure {
            switch failure {
            case .credentialReauthenticationRequired, .credentialOutcomeUnknown:
                // The captured client session was already cleared by the one-shot path.
                clearSessionPresentation(error); return
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
    func refreshActions() async {
        guard identity != nil, !busy else { return }
        let ticket = epoch
        busy = true; problem = ""
        do {
            let next = try await client.refresh()
            let catalog = try await client.catalog()
            guard ticket == epoch else { return }
            identity = next; commands = catalog
        } catch { await failed(error, ticket: ticket) }
        if ticket == epoch { busy = false }
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
    @discardableResult
    func submit(_ command: ERPCommand, fields: [String: String], versionText: String,
                expectedSession: Int, context: ERPRecordActionContext? = nil, confirmed: Bool = false) async -> Bool {
        guard !busy, expectedSession == epoch, identity != nil, let authority = commandAuthority else { return false }
        busy = true; problem = ""; notice = ""; let ticket = epoch
        var applied = false
        do {
            let fresh = try await client.refresh()
            let catalog = try await client.catalog()
            guard epoch == ticket else { return false }
            identity = fresh; commands = catalog
            guard let current = catalog.first(where: { $0.name == command.name && $0.permission == command.permission }),
                  ERPModuleCatalog.permits(fresh.actor.permissions, anyOf: [current.permission]) else { throw ERPFailure.accessChanged }
            if current.highRisk == true && !confirmed { throw ERPFailure.confirmationRequired }
            if let context { try ERPRecordActions.validate(context, command: current, actor: fresh.actor) }
            let rawVersion = versionText.trimmingCharacters(in: .whitespacesAndNewlines)
            let version: Int?
            if let context { version = context.record.version }
            else if rawVersion.isEmpty { version = nil }
            else {
                guard let parsed = Int(rawVersion), parsed > 0 else { throw ERPFailure.invalidPayload }
                version = parsed
            }
            let data = try ERPCommandInput.data(command: current, fields: fields, fixed: context?.fixedFields ?? [:])
            _ = try await client.execute(current, input: data, expectedVersion: version, authority: authority)
            guard epoch == ticket else { return false }
            if ERPCredentialPolicy.isOneShot(current.name) {
                clearSessionPresentation()
                notice = text(.credentialReauth)
                return true
            }
            notice = text(.saved); applied = true
        } catch { await failed(error, ticket: ticket) }
        guard epoch == ticket else { return false }
        busy = false
        await reloadPendingState()
        guard epoch == ticket else { return applied }
        if applied {
            // The acknowledged write stays successful even if this separate read fails.
            if let context { await loadKind(context.record.kind) }
            else { await loadOverview() }
        }
        return applied
    }
}

@MainActor struct ERPConsoleView: View {
    @ObservedObject var preferences: AppModel
    @StateObject private var model = ERPConsoleModel()
    @State private var selectedTab = 0
    @State private var actionSearch = ""
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            Group {
                if model.identity == nil { ERPLoginScreen(model: model) }
                else if model.availableWorkspaces.isEmpty {
                    VStack(spacing: 16) {
                        Text(model.text(.errorAccess)).font(.headline)
                        Button(model.text(.signOut)) { Task { await model.signOut() } }
                    }.padding()
                } else if model.selectedWorkspace == nil {
                    ScrollView {
                        VStack(spacing: 16) {
                            Text(model.text(.title)).font(.title2.bold())
                            ForEach(model.availableWorkspaces) { workspace in
                                Button(model.text({ () -> ERPText in
                                    switch workspace {
                                    case .client: return .roleClient
                                    case .worker: return .roleEmployee
                                    case .partner: return .roleClient
                                    case .bauleiter: return .roleExternalBauleiter
                                    case .owner: return .roleOwner
                                    }
                                }())) { model.selectedWorkspace = workspace }
                                    .buttonStyle(KNABAButtonStyle())
                                    .accessibilityIdentifier("workspace-\(workspace.rawValue)")
                            }
                        }.padding()
                    }
                } else { console }
            }
            .knabaScreen()
            .navigationTitle(model.identity == nil ? "" : model.text(.title))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Picker(preferences.text(.language), selection: $preferences.localeSelection) {
                            ForEach(NativeLanguage.allCases) { language in Text(language.name).tag(language.rawValue) }
                            Text(preferences.text(.deviceLanguage)).tag("system")
                        }
                    } label: {
                        Label(preferences.language.name, systemImage: "globe")
                            .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
                    }
                    .accessibilityLabel(preferences.text(.language))
                    .accessibilityValue(preferences.language.name)
                    .accessibilityIdentifier("erpLanguageSelector")
                }
                if model.availableWorkspaces.count > 1 && model.selectedWorkspace != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            model.selectedWorkspace = nil
                            selectedTab = 0
                        } label: {
                            Image(systemName: "square.grid.2x2")
                        }
                        .accessibilityLabel(model.text(.roles))
                        .accessibilityIdentifier("switchWorkspace")
                    }
                }
                if model.identity != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(model.text(.signOut), systemImage: "rectangle.portrait.and.arrow.right") { Task { await model.signOut() } }
                            .frame(minWidth: 44, minHeight: 44)
                    }
                }
            }
        }
        .id(model.sessionGeneration)
        .onChange(of: preferences.localeSelection, initial: true) { _, _ in
            model.language = preferences.language
            model.problem = ""; model.notice = ""
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && model.identity != nil { Task { await model.reloadSession() } }
        }
    }
    private var console: some View {
        VStack(spacing: 0) {
            ERPWorkspaceTabs(selection: $selectedTab, language: model.language)
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
        ScrollView {
            LazyVStack(spacing: 18) {
                feedback
                ERPOverviewContent(model: model) { module in
                    selectedTab = 1
                    Task { await model.loadKind(module.kind) }
                }
            }
            .frame(maxWidth: 840).padding(16).frame(maxWidth: .infinity)
        }
        .refreshable { await model.loadOverview() }
    }
    private var records: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                feedback
                KNABACard(title: model.text(.module), icon: "square.grid.2x2") {
                    Picker(model.text(.records), selection: $model.selection) {
                        ForEach(model.modules) { module in Text(model.text(module.title)).tag(module.kind) }
                    }
                    .pickerStyle(.menu).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                    .onChange(of: model.selection) { _, kind in Task { await model.loadKind(kind) } }
                    Button { Task { await model.loadKind(model.selection) } } label: {
                        Label(model.text(.refresh), systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(KNABAButtonStyle(emphasis: .secondary)).disabled(model.busy)
                }
                Text(ERPStrings.text(.authorizedCount, model.language, String(model.items.count)))
                    .font(.subheadline.weight(.semibold)).foregroundStyle(KNABATheme.muted)
                    .padding(.horizontal, 3).accessibilityAddTraits(.isHeader)
                if model.items.isEmpty { KNABACard { KNABAEmptyState(title: model.text(.empty), icon: "tray") } }
                ForEach(model.items) { item in
                    NavigationLink {
                        ERPRecordDetail(recordID: item.id, kind: item.kind, model: model)
                    } label: {
                        KNABANavigationRow(title: item.title,
                                           icon: model.modules.first(where: { $0.kind == item.kind })?.icon ?? "doc.text",
                                           subtitle: item.subtitle)
                    }.buttonStyle(.plain)
                }
            }
            .frame(maxWidth: 840).padding(16).frame(maxWidth: .infinity)
        }
        .task { if model.items.isEmpty { await model.loadKind(model.selection) } }
        .refreshable { await model.loadKind(model.selection) }
    }
    private var messages: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                feedback
                KNABACard(title: model.text(.conversation), icon: "bubble.left.and.bubble.right") {
                    Picker(model.text(.channel), selection: $model.selectedChannel) {
                        ForEach(model.channels) { item in Text(item.title).tag(item.id) }
                    }
                    .pickerStyle(.menu).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                    .onChange(of: model.selectedChannel) { _, _ in Task { await model.loadMessages() } }
                    Button { Task { await model.loadChannels() } } label: {
                        Label(model.text(.refresh), systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(KNABAButtonStyle(emphasis: .secondary)).disabled(model.busy)
                }
                if model.messages.isEmpty { KNABACard { KNABAEmptyState(title: model.text(.noMessages), icon: "bubble.left") } }
                ForEach(model.messages) { item in
                    KNABACard {
                        Text(item.data["text"]?.string ?? item.title).font(.body)
                            .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        Label(item.data["language"]?.string ?? "KNABA", systemImage: "text.bubble")
                            .font(.caption).foregroundStyle(KNABATheme.muted)
                    }
                }
                KNABACard(title: model.text(.reply), icon: "square.and.pencil") {
                    KNABAField(model.text(.message), icon: "text.bubble") {
                        TextField(model.text(.message), text: $model.messageText, axis: .vertical)
                            .lineLimit(2...5).accessibilityIdentifier("erpMessageDraft")
                    }
                    Button { Task { await model.sendMessage() } } label: {
                        Label(model.text(.send), systemImage: "paperplane.fill")
                    }
                    .buttonStyle(KNABAButtonStyle())
                    .disabled(model.busy || model.hasPending || model.selectedChannel.isEmpty || model.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .frame(maxWidth: 840).padding(16).frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .task { if model.channels.isEmpty { await model.loadChannels() } }
        .refreshable { await model.loadChannels() }
    }
    private var actions: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                feedback
                KNABAStatusNotice(text: model.text(.actionsIntro))
                ForEach(model.commands.filter { actionSearch.isEmpty ||
                    (model.actionTitle($0.name, includeModule: true) + " " + $0.name).localizedCaseInsensitiveContains(actionSearch) }) { command in
                    NavigationLink {
                        ERPCommandForm(command: command, model: model)
                    } label: {
                        KNABANavigationRow(title: model.actionTitle(command.name, includeModule: true),
                                           icon: command.highRisk == true ? "exclamationmark.shield" : "arrow.right.circle")
                    }.buttonStyle(.plain)
                }
                if model.commands.isEmpty { KNABACard { KNABAEmptyState(title: model.text(.empty), icon: "checklist") } }
            }
            .frame(maxWidth: 840).padding(16).frame(maxWidth: .infinity)
        }
        .searchable(text: $actionSearch, prompt: model.text(.search))
        .refreshable { await model.refreshActions() }
    }
    @ViewBuilder private var feedback: some View {
        if model.busy {
            ProgressView(model.text(.loading)).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
                .padding(12).accessibilityIdentifier("erpLoading")
        }
        if !model.problem.isEmpty { KNABAStatusNotice(text: model.problem, kind: .error) }
        if !model.notice.isEmpty { KNABAStatusNotice(text: model.notice, kind: .success) }
        if let command = model.pendingCommandName {
            KNABACard(title: model.text(.recoveryTitle), icon: "arrow.clockwise.circle") {
                Text(model.text(.recoveryNotice)).font(.subheadline).foregroundStyle(KNABATheme.muted)
                Text(model.actionTitle(command, includeModule: true)).font(.subheadline.weight(.semibold))
                Button { Task { await model.retryPending() } } label: {
                    Label(model.text(.recoveryRetry), systemImage: "arrow.clockwise")
                }
                .buttonStyle(KNABAButtonStyle()).disabled(model.busy)
                .accessibilityIdentifier("erpRetryPendingCommand")
            }
        }
    }
}

/// No appearance side effects: the form is also rendered by native UI tests.
@MainActor struct ERPLoginScreen: View {
    @ObservedObject var model: ERPConsoleModel
    @FocusState private var focusedField: LoginField?
    private enum LoginField: Hashable { case server, email, password, otp }
    private var canSignIn: Bool {
        !model.busy && !model.email.isEmpty && !model.password.isEmpty && ERPOrigin.validate(model.origin) != nil
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                KNABABrandHeader(title: model.text(.roleHeading), subtitle: model.text(.loginIntro))
                KNABACard(title: model.text(.account), icon: "person.crop.circle") {
                    KNABAField(model.text(.server), icon: "network") {
                        TextField("https://erp.example.de", text: $model.origin)
                            .textContentType(.URL).textInputAutocapitalization(.never)
                            .keyboardType(.URL).autocorrectionDisabled().submitLabel(.next)
                            .focused($focusedField, equals: .server).onSubmit { focusedField = .email }
                            .accessibilityLabel(model.text(.server)).accessibilityIdentifier("erpServer")
                    }
                    KNABAField(model.text(.email), icon: "envelope") {
                        TextField(model.text(.email), text: $model.email).keyboardType(.emailAddress)
                            .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .submitLabel(.next).focused($focusedField, equals: .email).onSubmit { focusedField = .password }
                            .accessibilityIdentifier("erpEmail")
                    }
                    KNABAField(model.text(.password), icon: "lock") {
                        SecureField(model.text(.password), text: $model.password).textContentType(.password)
                            .submitLabel(.next).focused($focusedField, equals: .password).onSubmit { focusedField = .otp }
                            .accessibilityIdentifier("erpPassword")
                    }
                    KNABAField(model.text(.otp), icon: "key") {
                        TextField(model.text(.otp), text: $model.otp).keyboardType(.numberPad)
                            .textContentType(.oneTimeCode).focused($focusedField, equals: .otp)
                            .accessibilityIdentifier("erpOTP")
                    }
                    Button {
                        focusedField = nil
                        Task { await model.signIn() }
                    } label: {
                        HStack(spacing: 10) {
                            if model.busy { ProgressView().tint(KNABATheme.ink) }
                            Label(model.text(.signIn), systemImage: "arrow.right")
                        }
                    }
                    .buttonStyle(KNABAButtonStyle()).disabled(!canSignIn)
                    .accessibilityIdentifier("erpSignIn")
                }
                if !model.problem.isEmpty { KNABAStatusNotice(text: model.problem, kind: .error) }
                KNABAStatusNotice(text: model.text(.shiftNotice))
            }
            .frame(maxWidth: 560).padding(16).frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .knabaScreen()
    }
}

@MainActor struct ERPWorkspaceTabs: View {
    @Binding var selection: Int
    let language: NativeLanguage
    private let tabs: [(ERPText, String)] = [(.overview, "square.grid.2x2"), (.records, "list.bullet.rectangle"),
                                           (.messages, "bubble.left.and.bubble.right"), (.actions, "slider.horizontal.3")]
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(tabs.indices, id: \.self) { index in
                        Button { selection = index } label: {
                            Label(ERPStrings.text(tabs[index].0, language), systemImage: tabs[index].1)
                                .font(.subheadline.weight(.semibold)).fixedSize(horizontal: true, vertical: false)
                                .padding(.horizontal, 15).frame(minHeight: 46)
                                .foregroundStyle(selection == index ? KNABATheme.ink : KNABATheme.text)
                                .background(selection == index ? KNABATheme.lime : KNABATheme.surface,
                                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(selection == index ? KNABATheme.ink : KNABATheme.line, lineWidth: selection == index ? 2 : 1))
                        }
                        .buttonStyle(.plain).id(index)
                        .accessibilityAddTraits(selection == index ? [.isSelected] : [])
                        .accessibilityIdentifier("erpTab\(index)")
                    }
                }.padding(.horizontal, 16).padding(.vertical, 10)
            }
            .onChange(of: selection) { _, value in proxy.scrollTo(value, anchor: .center) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(KNABATheme.paper)
    }
}

/// Purely presents current, server-scoped data; synthetic fixture values live in Tests only.
@MainActor struct ERPOverviewContent: View {
    @ObservedObject var model: ERPConsoleModel
    let openModule: (ERPModule) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    private var columns: [GridItem] {
        typeSize >= .xxLarge ? [GridItem(.flexible())] : [GridItem(.adaptive(minimum: 150), spacing: 12)]
    }
    private func module(_ key: String) -> ERPModule? { ERPModuleCatalog.items.first { $0.kind == key } }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            KNABABrandHeader(title: model.identity?.user.name ?? model.identity?.user.email ?? "KNABA",
                             subtitle: model.roleLabel, eyebrow: model.text(.overview))
            HStack {
                Text(model.text(.liveOverview)).font(.headline).accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Button { Task { await model.loadOverview() } } label: {
                    Label(model.text(.refresh), systemImage: "arrow.clockwise").labelStyle(.iconOnly)
                        .frame(minWidth: 44, minHeight: 44)
                }.disabled(model.busy)
            }
            if let stats = model.dashboard {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(stats.counts.keys.sorted(), id: \.self) { key in
                        KNABAMetric(title: module(key).map { model.text($0.title) } ?? key.replacingOccurrences(of: "_", with: " ").capitalized,
                                    value: String(stats.counts[key] ?? 0), icon: module(key)?.icon ?? "chart.bar")
                    }
                    if let activeShifts = stats.activeShifts {
                        KNABAMetric(title: model.text(.activeShifts), value: String(activeShifts), icon: "clock", color: KNABATheme.metricLilac)
                    }
                }
            } else { KNABACard { KNABAEmptyState(title: model.text(.unavailable), icon: "wifi.slash") } }
            Text(model.text(.areas)).font(.headline).accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(model.modules) { module in
                    Button { openModule(module) } label: {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                Image(systemName: module.icon).font(.title3)
                                    .frame(width: 40, height: 40).background(KNABATheme.soft, in: RoundedRectangle(cornerRadius: 12))
                                Spacer(minLength: 0)
                                Image(systemName: "arrow.up.right").font(.caption.weight(.semibold))
                            }.accessibilityHidden(true)
                            Text(model.text(module.title)).font(.body.weight(.semibold))
                                .fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).padding(16)
                        .background(KNABATheme.surface, in: RoundedRectangle(cornerRadius: KNABATheme.radius, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: KNABATheme.radius, style: .continuous).stroke(KNABATheme.line, lineWidth: 1))
                    }.buttonStyle(.plain).foregroundStyle(KNABATheme.text)
                }
            }
            KNABACard(title: model.text(.permissions), icon: "person.crop.circle.badge.checkmark") {
                LabeledContent(model.text(.signedIn), value: model.identity?.user.name ?? model.identity?.user.email ?? "KNABA")
                LabeledContent(model.text(.roles), value: model.roleLabel)
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.text(.company)).font(.caption.weight(.semibold)).foregroundStyle(KNABATheme.muted)
                    Text(model.identity?.actor.companyId ?? "—").font(.subheadline).textSelection(.enabled)
                }
            }
            KNABAStatusNotice(text: model.text(.presenceNotice))
        }
    }
}

private struct ERPRecordDetail: View {
    let recordID: String
    let kind: String
    @ObservedObject var model: ERPConsoleModel
    private var item: ERPItem? { model.selection == kind ? model.items.first { $0.id == recordID && $0.kind == kind } : nil }
    var body: some View {
        List {
            if let item {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "doc.text").font(.title2).foregroundStyle(KNABATheme.tint).accessibilityHidden(true)
                        Text(item.title).font(.title2.weight(.bold))
                    }.padding(.vertical, 8)
                    LabeledContent(model.text(.recordId), value: item.id)
                    LabeledContent(model.text(.version), value: String(item.version))
                }.listRowBackground(KNABATheme.surface)
                Section(model.text(.actions)) {
                    ForEach(model.recordActions(item)) { command in
                        if let actor = model.identity?.actor,
                           let context = ERPRecordActions.context(for: item, command: command, actor: actor) {
                            NavigationLink {
                                ERPCommandForm(command: command, model: model, context: context)
                            } label: {
                                Label(model.actionTitle(command.name), systemImage: command.highRisk == true ? "exclamationmark.shield" : "arrow.right.circle")
                                    .padding(.vertical, 7)
                            }
                        }
                    }
                    Button { Task { await model.loadKind(kind); await model.refreshActions() } } label: {
                        Label(model.text(.refresh), systemImage: "arrow.clockwise")
                    }.disabled(model.busy)
                }.listRowBackground(KNABATheme.surface)
                Section(model.text(.fields)) {
                    ForEach(item.data.keys.filter { !ERPCredentialPolicy.sensitiveKey($0) }.sorted(), id: \.self) { key in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(model.fieldLabel(key)).font(.caption.weight(.semibold)).foregroundStyle(KNABATheme.muted)
                            Text(item.data[key].flatMap { ERPCommandInput.displayText($0, name: key) } ??
                                 (item.data[key]?.dictionary != nil ? model.text(.object) : item.data[key]?.list != nil ? model.text(.list) : "—"))
                                .font(.body).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        }.padding(.vertical, 5)
                    }
                }.listRowBackground(KNABATheme.surface)
            } else { KNABAEmptyState(title: model.text(.empty), icon: "tray").listRowBackground(KNABATheme.surface) }
        }
        .knabaScreen().navigationTitle(model.text(.records)).navigationBarTitleDisplayMode(.inline)
        .task { await model.refreshActions() }
    }
}

struct ERPCommandForm: View {
    let command: ERPCommand
    @ObservedObject var model: ERPConsoleModel
    @State private var draft: [String: String]
    @State private var expectedVersion = ""
    @State private var confirmation = false
    @State private var context: ERPRecordActionContext?
    @State private var sessionGeneration: Int
    @Environment(\.dismiss) private var dismiss
    init(command: ERPCommand, model: ERPConsoleModel, context: ERPRecordActionContext? = nil) {
        self.command = command; self.model = model
        _draft = State(initialValue: ERPCommandInput.defaultFields(command))
        _context = State(initialValue: context)
        _sessionGeneration = State(initialValue: model.sessionGeneration)
    }
    private var properties: [(String, ERPField)] {
        (command.schema?.dictionary?["properties"]?.dictionary ?? [:]).sorted { $0.key < $1.key }
    }
    private var currentCommand: ERPCommand? {
        model.commands.first { $0.name == command.name && $0.permission == command.permission }
    }
    private var required: Set<String> {
        Set(command.schema?.dictionary?["required"]?.list?.compactMap { $0.string } ?? [])
    }
    private var oneShot: Bool { ERPCredentialPolicy.isOneShot(command.name) }
    private var unsupportedSecrets: Bool { !oneShot && properties.contains { ERPCredentialPolicy.sensitiveKey($0.0) } }
    var body: some View {
        Form {
            Section {
                Label(model.actionTitle(command.name, includeModule: context == nil), systemImage: command.highRisk == true ? "exclamationmark.shield" : "square.and.pencil")
                    .font(.headline).padding(.vertical, 6)
                if let context {
                    Text(context.record.title).font(.headline)
                    LabeledContent(model.text(.recordId), value: context.record.id)
                    LabeledContent(model.text(.version), value: String(context.record.version))
                }
                if oneShot { KNABAStatusNotice(text: model.text(.credentialOnce)) }
                if unsupportedSecrets { KNABAStatusNotice(text: model.text(.errorSensitiveCommand), kind: .warning) }
                ForEach(properties.map { $0.0 }, id: \.self) { key in
                    if let definition = properties.first(where: { $0.0 == key })?.1 {
                    let isRequired = required.contains(key)
                    let type = definition.dictionary?["type"]?.string ?? "string"
                    if let fixed = context?.fixedFields[key] {
                        LabeledContent(model.fieldLabel(key), value: fixed)
                    } else if ERPCredentialPolicy.sensitiveKey(key) {
                        VStack(alignment: .leading, spacing: 8) {
                            let title = model.fieldLabel(key) + (isRequired ? " *" : "")
                            Text(title).font(.caption.weight(.semibold)).foregroundStyle(KNABATheme.muted)
                            ERPCredentialField(title: title, key: key,
                                               text: Binding(get: { draft[key] ?? "" }, set: { draft[key] = $0 }))
                                .disabled(model.busy || unsupportedSecrets)
                        }.padding(.vertical, 6)
                    } else if type == "boolean" {
                        Picker(model.fieldLabel(key) + (isRequired ? " *" : ""), selection: Binding(get: { draft[key] ?? "" }, set: { draft[key] = $0 })) {
                            Text(model.text(.choose)).tag("")
                            Text(model.text(.yes)).tag("true")
                            Text(model.text(.no)).tag("false")
                        }
                    } else if let choices = definition.dictionary?["enum"]?.list?.compactMap(ERPCommandInput.scalarText) {
                        Picker(model.fieldLabel(key) + (isRequired ? " *" : ""), selection: Binding(get: { draft[key] ?? "" }, set: { draft[key] = $0 })) {
                            Text(model.text(.choose)).tag("")
                            ForEach(choices, id: \.self) { Text($0).tag($0) }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(model.fieldLabel(key) + (isRequired ? " *" : "")).font(.caption.weight(.semibold)).foregroundStyle(KNABATheme.muted)
                            TextField(type == "array" ? model.text(.jsonArray) : type == "object" ? model.text(.jsonObject) : model.fieldLabel(key),
                                      text: Binding(get: { draft[key] ?? "" }, set: { draft[key] = $0 }), axis: .vertical)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                                .accessibilityLabel(model.fieldLabel(key) + (isRequired ? " *" : ""))
                        }.padding(.vertical, 6)
                    }
                    }
                }
                if context == nil && !oneShot { TextField(model.text(.expectedVersion), text: $expectedVersion).keyboardType(.numberPad) }
            }.listRowBackground(KNABATheme.surface)
            Section {
                if model.hasPending {
                    KNABAStatusNotice(text: model.text(.recoveryNotice), kind: .warning)
                    if model.pendingCommandName != nil {
                        Button(model.text(.recoveryRetry)) { Task { await model.retryPending() } }
                            .buttonStyle(KNABAButtonStyle(emphasis: .secondary)).disabled(model.busy)
                    }
                }
                if !model.problem.isEmpty { KNABAStatusNotice(text: model.problem, kind: .error) }
                Button {
                    if currentCommand?.highRisk == true { confirmation = true }
                    else { submit(confirmed: false) }
                } label: { Label(model.text(.submit), systemImage: "checkmark.circle") }
                .buttonStyle(KNABAButtonStyle()).disabled(model.busy || model.hasPending || unsupportedSecrets || sessionGeneration != model.sessionGeneration || currentCommand == nil)
            }.listRowBackground(KNABATheme.surface)
        }
        .knabaScreen().scrollDismissesKeyboard(.interactively)
        .navigationTitle(model.text(.actionTitle)).navigationBarTitleDisplayMode(.inline)
        .onDisappear { clearSensitiveDraft() }
        .onChange(of: model.sessionGeneration) { _, _ in clearSensitiveDraft() }
        .confirmationDialog(model.text(.confirmSensitive), isPresented: $confirmation) {
            Button(model.text(.confirm) + " · " + model.actionTitle(command.name), role: .destructive) {
                submit(confirmed: true)
            }
        } message: {
            Text(model.text(.confirmNotice) + (context.map { "\n" + $0.record.title + "\n" + model.text(.version) + ": " + String($0.record.version) } ?? ""))
        }
    }
    private func submit(confirmed: Bool) {
        let values = draft, version = expectedVersion, record = context, generation = sessionGeneration
        clearSensitiveDraft()
        Task {
            if await model.submit(command, fields: values, versionText: version, expectedSession: generation,
                                  context: record, confirmed: confirmed), generation == model.sessionGeneration { dismiss() }
        }
    }
    private func clearSensitiveDraft() {
        if oneShot { draft.removeAll(); expectedVersion = "" }
        else { draft = draft.filter { !ERPCredentialPolicy.sensitiveKey($0.key) } }
    }
}

/// No show-password toggle or state restoration; the form owns this in-memory binding.
struct ERPCredentialField: View {
    let title: String
    let key: String
    @Binding var text: String
    var body: some View {
        SecureField(title, text: $text)
            .textContentType(key == "otp" ? .oneTimeCode : key == "newPassword" ? .newPassword : key == "currentPassword" ? .password : nil)
            .keyboardType(key == "otp" ? .numberPad : .default)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .privacySensitive()
            .accessibilityLabel(title).accessibilityIdentifier("erpCredential-" + key)
    }
}
