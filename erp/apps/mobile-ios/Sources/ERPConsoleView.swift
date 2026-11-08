import SwiftUI

struct ERPConsoleIntent {
    fileprivate let client: ERPConsoleClient
    fileprivate let epoch: Int
    fileprivate let revision: Int
    fileprivate let origin: String
}

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
    @Published private(set) var resultCommandName = ""
    @Published private(set) var sessionRevision = 0
    @Published private(set) var websitePhase: ERPFederationPhase = .idle
    @Published private(set) var websiteAuthorities: [ERPFederationAuthority] = []
    @Published var websiteAuthority = ""
    @Published private(set) var websiteProblem: ERPFederationText?
    private var websiteTicket: ERPFederationTicket?
    private var websiteEpoch = 0
    private var websiteOrigin = ""
    private var websiteTimeout: Task<Void, Never>?
    private weak var websiteBrowser: ERPFederationAuthSession?
    private var client: ERPConsoleClient
    private let websiteBeforeCommit: (@MainActor @Sendable () async -> Void)?
    var mediaClient: ERPConsoleClient { client }
    private let preferences: UserDefaults
    private var epoch = 0
    private var authorityRevision: Int?
    private var storedOrigin = ""
    private var operations = Set<UUID>()
    private var reads: [String: Int] = [:]
    private var loadingKind: String?
    private var loadingChannel: String?

    init(client: ERPConsoleClient = ERPConsoleClient(), preferences: UserDefaults = .standard,
         websiteBeforeCommit: (@MainActor @Sendable () async -> Void)? = nil) {
        self.client = client
        self.preferences = preferences
        self.websiteBeforeCommit = websiteBeforeCommit
        origin = preferences.string(forKey: "knaba-erp-origin") ?? ""
    }
    var modules: [ERPModule] { identity.map { ERPWorkspacePolicy.modules(for: $0.actor) } ?? [] }
    func captureIntent() -> ERPConsoleIntent { ERPConsoleIntent(client: client, epoch: epoch, revision: sessionRevision, origin: origin) }
    func currentIntent(_ intent: ERPConsoleIntent) -> Bool {
        client === intent.client && epoch == intent.epoch && sessionRevision == intent.revision && origin == intent.origin
    }
    func perform(_ intent: ERPConsoleIntent, _ operation: @MainActor () async -> Void) async {
        guard currentIntent(intent) else { return }
        await operation()
    }
    /// Capture account authority at the tap, before an unstructured Task can wait.
    @discardableResult func run(_ operation: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let intent = captureIntent()
        return Task { await perform(intent, operation) }
    }
    @discardableResult func requestSignIn() -> Task<Void, Never> {
        cancelWebsiteSignIn()
        return run { await self.signIn() }
    }
    @discardableResult func requestSignOut() -> Task<Void, Never> {
        let client = self.client
        // The tap itself cancels an outstanding handoff and clears private UI;
        // its later network Task never resolves the mutable current client.
        clearSession(); problem = ""
        return Task { await client.logout() }
    }
    var roleLabel: String { identity?.actor.roles.joined(separator: " · ") ?? "" }
    var canWrite: Bool { identity != nil && !busy && pending == nil && !recoveryBlocked }
    var canMessage: Bool { commands.contains { $0.name == "message.send" } }
    var canUploadMedia: Bool {
        guard let actor = identity?.actor else { return false }
        return (try? ERPMediaPolicy.command(commands, actor: actor)) != nil
    }
    func canUploadMedia(to record: ERPItem) -> Bool {
        guard canUploadMedia, ["site", "task"].contains(record.kind) else { return false }
        let external = identity?.actor.roles.contains { ERPMediaPolicy.externalRoles.contains($0) } == true
        return (!external || record.kind == "site") && (try? ERPMediaContext(record: record)) != nil
    }
    func fieldLabel(_ name: String) -> String { ERPActionLabels.field(name, language: language) }
    func recordActions(_ record: ERPItem) -> [ERPCommand] {
        guard let actor = identity?.actor else { return [] }
        return commands.filter { ERPRecordActions.context(for: record, command: $0, actor: actor) != nil }
    }

    private func begin() -> UUID { let id = UUID(); operations.insert(id); busy = true; return id }
    private func finish(_ id: UUID) { operations.remove(id); busy = !operations.isEmpty }
    private func readTicket(_ name: String) -> Int { let next = (reads[name] ?? 0) + 1; reads[name] = next; return next }
    private func current(_ ticket: Int, _ key: String, _ read: Int) -> Bool { epoch == ticket && reads[key] == read && identity != nil }
    private func clearViews() {
        items = []; channels = []; messages = []; commands = []; dashboard = nil
        selectedChannel = ""; messageText = ""; selection = ""
        commandResult = nil; resultTitle = ""; resultCommandName = ""; pending = nil; recoveryBlocked = false
        operations.removeAll(); reads.removeAll(); loadingKind = nil; loadingChannel = nil; busy = false; sessionRevision += 1
    }
    private func clearSession() {
        cancelWebsiteSignIn()
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
        guard epoch == ticket else { return }
        let client = self.client
        do {
            let value = try await client.pendingCommand()
            guard epoch == ticket, identity != nil else { return }
            pending = value; recoveryBlocked = false
        } catch {
            guard epoch == ticket else { return }
            pending = nil; recoveryBlocked = true; problem = describe(error)
        }
    }
    private func failed(_ error: Error, ticket: Int) async {
        guard epoch == ticket else { return }
        let client = self.client
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
        let client = self.client
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
        let client = self.client
        let ticket = epoch
        do {
            _ = try await client.refresh()
            let authority = await client.authorityState()
            guard epoch == ticket else { return }
            guard let next = authority.identity else { throw ERPFailure.expired }
            guard ERPOrigin.validate(origin)?.absoluteString == storedOrigin else { await signOut(); return }
            if authorityRevision != authority.revision || !sameAuthority(previous.actor, next.actor) {
                cancelWebsiteSignIn()
                epoch += 1; clearViews(); notice = text(.accessUpdated)
            }
            authorityRevision = authority.revision
            adopt(next)
            await syncPending(epoch)
        } catch { await failed(error, ticket: ticket) }
    }
    func signOut() async {
        let client = self.client
        // Clear private views before the network suspension. Late requests cannot reopen a session.
        clearSession(); problem = ""
        await client.logout()
    }
    // Browser sign-in has independent UI state. Failures never call failed(),
    // clearSession(), or the destructive ordinary password-login path.
    var websiteAvailable: Bool { ERPFederationRegistry.compiled != nil }
    private func websiteCurrent(_ ticket: ERPFederationTicket) -> Bool {
        websiteTicket === ticket && epoch == websiteEpoch && ERPOrigin.validate(origin)?.absoluteString == websiteOrigin
    }
    private func websiteTimer(_ ticket: ERPFederationTicket, deadline: Date) {
        websiteTimeout?.cancel()
        websiteTimeout = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(max(0, deadline.timeIntervalSinceNow))) } catch { return }
            guard let self, self.websiteCurrent(ticket), !ticket.committed else { return }
            self.cancelWebsiteSignIn(); self.websitePhase = .failed; self.websiteProblem = .expired
        }
    }
    func cancelWebsiteSignIn() {
        let client = self.client
        let ticket = websiteTicket
        ticket?.cancel(); websiteTicket = nil; websiteTimeout?.cancel(); websiteTimeout = nil
        websiteBrowser?.cancel(); websiteBrowser = nil
        websiteAuthorities = []; websiteAuthority = ""; websitePhase = .idle; websiteProblem = nil
        if let ticket { Task { await client.cancelFederation(ticket) } }
    }
    func websiteDidEnterBackground() { cancelWebsiteSignIn() }
    func prepareWebsiteSignIn() async {
        guard websiteAvailable, !busy, websiteTicket == nil else { return }
        let client = self.client
        guard let normalized = ERPOrigin.validate(origin), identity == nil || normalized.absoluteString == storedOrigin else {
            websitePhase = .failed; websiteProblem = .changed; return
        }
        let ticket = ERPFederationTicket()
        websiteTicket = ticket; websiteEpoch = epoch; websiteOrigin = normalized.absoluteString
        websitePhase = .discovering; websiteProblem = nil
        websiteTimer(ticket, deadline: Date().addingTimeInterval(ERPFederationPolicy.pendingSeconds))
        do {
            try await client.configure(websiteOrigin)
            guard websiteCurrent(ticket) else { return }
            let config = try await client.prepareFederation(ticket)
            guard websiteCurrent(ticket) else { return }
            websiteAuthorities = config.authorities; websiteAuthority = config.authorities.first?.id ?? ""
            websitePhase = .choose
        } catch { await websiteFailed(error, ticket: ticket) }
    }
    func openWebsiteSignIn(using browser: ERPFederationAuthSession) async {
        guard [.choose, .startUnknown].contains(websitePhase), let ticket = websiteTicket, websiteCurrent(ticket),
              let registry = ERPFederationRegistry.compiled else { return }
        let client = self.client
        websiteBrowser = browser; websitePhase = .starting; websiteProblem = nil
        do {
            let start = try await client.startFederation(ticket, authorityID: websiteAuthority)
            guard websiteCurrent(ticket) else { return }
            websiteTimer(ticket, deadline: start.deadline); websitePhase = .browser
            let callback = try await browser.open(start.url, scheme: registry.scheme)
            guard websiteCurrent(ticket) else { return }
            try ticket.check(); websitePhase = .exchanging
            let adoption = try await client.redeemFederation(ticket, callback: callback)
            await adoptWebsite(adoption, ticket: ticket)
        } catch { await websiteFailed(error, ticket: ticket) }
    }
    func recoverWebsiteSignIn(using browser: ERPFederationAuthSession? = nil) async {
        guard websitePhase == .sessionUnknown, let ticket = websiteTicket, websiteCurrent(ticket) else { return }
        let client = self.client
        if let browser { websiteBrowser = browser }
        websitePhase = .checking; websiteProblem = nil
        do { await adoptWebsite(try await client.recoverFederation(ticket), ticket: ticket) }
        catch { await websiteFailed(error, ticket: ticket) }
    }
    private func adoptWebsite(_ verified: ERPFederationVerified, ticket: ERPFederationTicket) async {
        // An injectable scheduling boundary exercises a paused MainActor handoff.
        // Production has no suspension here; all network work is already done.
        if let websiteBeforeCommit { await websiteBeforeCommit() }
        guard websiteCurrent(ticket) else { return }
        do {
            guard websiteBrowser?.presentationAvailable == true else { throw ERPFederationFailure.presentation }
            try verified.commit { nextClient, current in
                // The ticket/revision/deadline fence, retiring the old client,
                // and installing the new client + private UI are one MainActor action.
                websiteTimeout?.cancel(); websiteTimeout = nil; websiteBrowser?.cancel(); websiteBrowser = nil
                websiteTicket = nil; websiteAuthorities = []; websiteAuthority = ""; websiteProblem = nil; websitePhase = .complete
                epoch += 1; clearViews(); client = nextClient; authorityRevision = current.revision
                storedOrigin = websiteOrigin; adopt(current.identity); password = ""; otp = ""; problem = ""
                pending = current.pending; recoveryBlocked = false
                preferences.set(storedOrigin, forKey: "knaba-erp-origin"); notice = text(.connected)
            }
        } catch { await websiteFailed(error, ticket: ticket); return }
        await loadOverview()
    }
    private func websiteFailed(_ error: Error, ticket: ERPFederationTicket) async {
        guard websiteCurrent(ticket), !ticket.committed else { return }
        let client = self.client
        if error as? ERPFederationFailure == .startUnknown { websitePhase = .startUnknown; websiteProblem = .startUnknown; return }
        if error as? ERPFederationFailure == .sessionUnknown {
            do {
                let deadline = try await client.federationDeadline(ticket)
                guard websiteCurrent(ticket) else { return }
                websiteTimer(ticket, deadline: deadline); websitePhase = .sessionUnknown; websiteProblem = .sessionUnknown
                return
            } catch { /* expiry or authority change requires an explicit restart */ }
        }
        cancelWebsiteSignIn()
        if error is CancellationError || error as? ERPFederationFailure == .cancelled { return }
        websitePhase = .failed; websiteProblem = ERPFederationStrings.errorKey(error)
    }
    func loadOverview() async {
        guard identity != nil else { return }
        let client = self.client
        let ticket = epoch, read = readTicket("overview"), operation = begin()
        defer { finish(operation) }
        do {
            let value = try await client.dashboard()
            guard current(ticket, "overview", read) else { return }
            let catalog = try await client.catalog()
            guard current(ticket, "overview", read) else { return }
            dashboard = value; commands = catalog
        } catch { if current(ticket, "overview", read) { await failed(error, ticket: ticket) } }
    }
    func loadKind(_ kind: String) async {
        guard identity != nil, loadingKind != kind, modules.contains(where: { $0.kind == kind }) else { return }
        let client = self.client
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
        let client = self.client
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
        let client = self.client
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
        let client = self.client
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
    @discardableResult func submit(_ command: ERPCommand, fields: [String: String], versionText: String,
                                   expectedSession: Int, nullFields: Set<String> = [],
                                   context: ERPRecordActionContext? = nil, confirmed: Bool = false) async -> Bool {
        guard expectedSession == sessionRevision, canWrite, let originalAuthority = authorityRevision,
              commands.contains(where: { $0.name == command.name && $0.permission == command.permission }) else { return false }
        let client = self.client
        let ticket = epoch, operation = begin()
        defer { finish(operation) }
        problem = ""; notice = ""; commandResult = nil
        do {
            guard ERPOrigin.validate(origin)?.absoluteString == storedOrigin else { throw ERPFailure.accessChanged }
            let fresh = try await client.refresh()
            let catalog = try await client.catalog()
            let authority = await client.authorityState()
            guard epoch == ticket, sessionRevision == expectedSession else { return false }
            guard authority.revision == originalAuthority,
                  let current = catalog.first(where: { $0.name == command.name && $0.permission == command.permission }),
                  fresh.actor.permissions.contains(current.permission) else { throw ERPFailure.accessChanged }
            adopt(fresh); commands = catalog
            if current.highRisk == true && !confirmed { throw ERPFailure.confirmationRequired }
            let data: Data
            let version: Int?
            if let context {
                data = try ERPRecordActions.payload(context, command: current, actor: fresh.actor, fields: fields, nullFields: nullFields)
                version = context.record.version
            } else {
                data = try ERPCommandInput.payload(command: current, fields: fields, nullFields: nullFields)
                version = try ERPCommandInput.version(versionText)
            }
            let result = try await client.execute(current, input: data, expectedVersion: version, authorityRevision: originalAuthority)
            guard epoch == ticket else { return false }
            if result.dictionary?["reauthenticationRequired"]?.bool == true {
                clearSession(); problem = text(.reauthRequired); return true
            }
            commandResult = result; resultCommandName = command.name
            resultTitle = ERPActionLabels.title(command.name, language: language, includeModule: true)
            notice = text(.saved); await syncPending(ticket)
            if epoch == ticket {
                await loadOverview()
                let overviewProblem = problem
                if epoch == ticket {
                    if let context { await loadKind(context.record.kind) }
                    else if command.name.hasPrefix("task."), !selection.isEmpty { await loadKind(selection) }
                    if epoch == ticket, sessionRevision == expectedSession, authorityRevision == originalAuthority {
                        // Follow-up reads can fail independently of the acknowledged write.
                        // A later successful list refresh must not erase that warning or receipt.
                        if problem.isEmpty { problem = overviewProblem }
                        commandResult = result
                    }
                }
            }
            // A confirmed mutation stays acknowledged if a separate refresh fails.
            return true
        } catch {
            await failed(error, ticket: ticket)
            if epoch == ticket, identity == nil, ["user.password.rotate", "user.mfa.configure"].contains(command.name) { problem = text(.reauthRequired) }
            return false
        }
    }
    func retryPending() async {
        guard identity != nil, pending != nil, !busy, !recoveryBlocked else { return }
        let client = self.client
        let ticket = epoch, original = pending, operation = begin()
        defer { finish(operation) }
        problem = ""; notice = ""; commandResult = nil
        do {
            let result = try await client.retryPending()
            guard epoch == ticket else { return }
            commandResult = result; resultCommandName = original?.name ?? ""
            resultTitle = original.map { ERPActionLabels.title($0.name, language: language, includeModule: true) } ?? ""
            notice = text(.recovered); await syncPending(ticket)
            if epoch == ticket { await loadOverview(); if epoch == ticket, !selection.isEmpty { await loadKind(selection) } }
        } catch { await failed(error, ticket: ticket) }
    }
    func refreshWorkspace(kind: String? = nil, channels: Bool = false) async {
        let intent = captureIntent()
        await reloadSession()
        guard currentIntent(intent) else { return }
        if channels { await loadChannels() }
        else {
            await loadOverview()
            if let kind, currentIntent(intent) { await loadKind(kind) }
        }
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
                            Button(model.text(.signOut), systemImage: "rectangle.portrait.and.arrow.right") { model.requestSignOut() }
                                .accessibilityIdentifier("erpSignOut")
                        }
                    }
                }
        }
        .id(model.sessionRevision)
        .tint(Color(red: 0.78, green: 0.31, blue: 0.08))
        .onChange(of: preferences.localeSelection, initial: true) { _, _ in model.language = preferences.language }
        .onChange(of: model.sessionRevision) { _, _ in selectedTab = 0; search = "" }
        .onChange(of: model.origin) { _, _ in model.cancelWebsiteSignIn() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { model.websiteDidEnterBackground() }
            if phase == .active && model.identity != nil { model.run { await model.reloadSession() } }
        }
        .task(id: model.identity?.actor.userId) {
            guard model.identity != nil else { return }
            let intent = model.captureIntent()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                guard model.currentIntent(intent) else { return }
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
                Button { model.requestSignIn() } label: {
                    Label(model.text(.signIn), systemImage: "lock.shield").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent)
                    .disabled(model.busy || model.email.isEmpty || model.password.isEmpty || ERPOrigin.validate(model.origin) == nil)
                    .accessibilityIdentifier("erpSignIn")
            }
            if model.websiteAvailable { Section { ERPFederationControls(model: model) } }
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
                if pending.nativeMedia != true {
                    DisclosureGroup(model.text(.pendingDetails)) {
                        Text(pending.createdAt.formatted(date: .abbreviated, time: .shortened)).font(.caption)
                        if let version = pending.expectedVersion { LabeledContent(model.text(.version), value: String(version)) }
                        if let input = try? JSONDecoder().decode(ERPField.self, from: pending.input) {
                            ScrollView { ERPResultView(value: input, model: model) }.frame(maxHeight: 180)
                        }
                    }
                }
                if pending.nativeMedia == true {
                    NavigationLink(ERPMediaStrings.text(.recovery, model.language)) { ERPMediaView(console: model) }
                        .accessibilityIdentifier("erpMediaRecovery")
                } else {
                    Button(model.text(.retryOriginal)) { confirmRetry = true }
                        .disabled(model.busy || model.recoveryBlocked).accessibilityIdentifier("erpRetryOriginal")
                }
            }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(.orange.opacity(0.12))
            .confirmationDialog(model.text(.retryOriginal), isPresented: $confirmRetry) {
                Button(model.text(.confirm)) { model.run { await model.retryPending() } }
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
            if model.websiteAvailable { Section { ERPFederationControls(model: model) } }
            Section(model.text(.liveOverview)) {
                if let stats = model.dashboard {
                    ForEach(stats.counts.keys.sorted(), id: \.self) { key in
                        LabeledContent(ERPWorkspacePolicy.allModules.first(where: { $0.kind == key }).map { model.text($0.title) } ?? key,
                                       value: String(stats.counts[key] ?? 0))
                    }
                    LabeledContent(model.text(.activeShifts), value: String(stats.activeShifts ?? 0))
                } else { ContentUnavailableView(model.text(.unavailable), systemImage: "wifi.slash") }
                Button(model.text(.refresh)) { model.run { await model.refreshWorkspace() } }
            }
            Section(model.text(.areas)) {
                ForEach(model.modules) { module in
                    Button { selectedTab = 1; model.run { await model.loadKind(module.kind) } } label: {
                        Label(model.text(module.title), systemImage: module.icon)
                    }
                }
            }
            if let result = model.commandResult { Section(model.resultTitle) { ERPResultView(value: result, model: model) } }
            Section { Text(model.text(.presenceNotice)).font(.footnote).foregroundStyle(.secondary) }
        }.refreshable { await model.refreshWorkspace() }
    }
    private var records: some View {
        List {
            Section(model.text(.module)) {
                Picker(model.text(.records), selection: $model.selection) {
                    ForEach(model.modules) { module in Text(model.text(module.title)).tag(module.kind) }
                }.onChange(of: model.selection) { _, kind in search = ""; model.run { await model.loadKind(kind) } }
                Button(model.text(.refresh)) { model.run { await model.loadKind(model.selection) } }
                if model.selection == "media_asset" {
                    NavigationLink(ERPMediaStrings.text(.title, model.language)) { ERPMediaView(console: model) }
                        .accessibilityIdentifier("erpMediaGallery")
                }
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
            .refreshable { await model.refreshWorkspace(kind: model.selection) }
    }
    private var messages: some View {
        List {
            Section(model.text(.conversation)) {
                Picker(model.text(.channel), selection: $model.selectedChannel) {
                    ForEach(model.channels) { item in Text(item.title).tag(item.id) }
                }.onChange(of: model.selectedChannel) { _, _ in model.messageText = ""; model.run { await model.loadMessages() } }
                Button(model.text(.refresh)) { model.run { await model.loadChannels() } }
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
                    Button(model.text(.send)) { model.run { await model.sendMessage() } }
                        .disabled(!model.canWrite || model.selectedChannel.isEmpty || model.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }.task { if model.channels.isEmpty { await model.loadChannels() } }
            .refreshable { await model.refreshWorkspace(channels: true) }
    }
    private var actions: some View {
        List {
            Section { Text(model.text(.actionsIntro)).font(.footnote).foregroundStyle(.secondary) }
            ForEach(model.commands) { command in
                NavigationLink {
                    if command.name == "media.register" { ERPMediaView(console: model) }
                    else { ERPCommandForm(command: command, model: model) }
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(ERPActionLabels.title(command.name, language: model.language, includeModule: true)).font(.body.weight(.medium))
                            Text(command.permission).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if command.highRisk == true { Image(systemName: "exclamationmark.shield").foregroundStyle(.orange).accessibilityLabel(model.text(.confirmSensitive)) }
                    }
                }
            }
        }.refreshable { await model.refreshWorkspace() }
    }
}

private struct ERPRecordView: View {
    let item: ERPItem
    @ObservedObject var model: ERPConsoleModel
    var body: some View {
        List {
          if let item = model.items.first(where: { $0.id == self.item.id && $0.kind == self.item.kind }), model.selection == item.kind {
            Section(model.text(.records)) {
                LabeledContent("ID", value: item.id).textSelection(.enabled)
                LabeledContent(model.text(.version), value: String(item.version))
            }
            Section(model.text(.actions)) {
                if model.canUploadMedia(to: item) {
                    NavigationLink(ERPMediaStrings.text(.title, model.language)) { ERPMediaView(console: model, initialRecord: item) }
                        .accessibilityIdentifier("erpRecordMedia")
                }
                if item.kind == "media_asset" {
                    NavigationLink(ERPMediaStrings.text(.title, model.language)) { ERPMediaView(console: model) }
                }
                ForEach(model.recordActions(item)) { command in
                    if let actor = model.identity?.actor,
                       let context = ERPRecordActions.context(for: item, command: command, actor: actor) {
                        NavigationLink(ERPWorkspacePolicy.commandTitle(command.name, language: model.language)) {
                            ERPCommandForm(command: command, model: model, context: context)
                        }
                    }
                }
            }
            Section(model.text(.fields)) { ERPResultView(fields: item.data, model: model) }
          } else { ContentUnavailableView(model.text(.unavailable), systemImage: "tray") }
        }.navigationTitle(model.items.first(where: { $0.id == self.item.id && $0.kind == self.item.kind })?.title ?? model.text(.unavailable))
            .refreshable { await model.refreshWorkspace(kind: item.kind) }
            .privacySensitive()
    }
}

@MainActor private struct ERPCommandForm: View {
    let command: ERPCommand
    @ObservedObject var model: ERPConsoleModel
    @State private var context: ERPRecordActionContext?
    @State private var sourceSessionRevision: Int
    @State private var draft: [String: String]
    @State private var expectedVersion: String
    @State private var nullFields = Set<String>()
    @State private var confirmation = false
    @Environment(\.dismiss) private var dismiss
    init(command: ERPCommand, model: ERPConsoleModel, context: ERPRecordActionContext? = nil) {
        self.command = command; self.model = model
        _context = State(initialValue: context)
        _sourceSessionRevision = State(initialValue: model.sessionRevision)
        _draft = State(initialValue: [:])
        _expectedVersion = State(initialValue: context.map { String($0.record.version) } ?? "")
    }
    private var record: ERPItem? { context?.record }
    private var currentCommand: ERPCommand? {
        model.commands.first { $0.name == command.name && $0.permission == command.permission }
    }
    private var properties: [(String, ERPField)] {
        (currentCommand?.schema?.dictionary?["properties"]?.dictionary ?? [:]).sorted { $0.key < $1.key }
    }
    private var required: Set<String> { Set(currentCommand?.schema?.dictionary?["required"]?.list?.compactMap { $0.string } ?? []) }
    private var hasUnsupportedFields: Bool {
        properties.contains { _, field in
            guard let definition = field.dictionary else { return true }
            return (try? ERPCommandInput.fieldSchema(definition)) == nil
        }
    }
    private func binding(_ key: String) -> Binding<String> { Binding(get: { draft[key] ?? "" }, set: { draft[key] = $0 }) }
    private func nullBinding(_ key: String) -> Binding<Bool> {
        Binding(get: { nullFields.contains(key) }, set: { clear in
            if clear { nullFields.insert(key) } else { nullFields.remove(key) }
        })
    }
    private func submit(confirmed: Bool) async {
        let revision = sourceSessionRevision, selectedContext = context
        var fields = draft
        if command.name == "task.worklog" {
            do {
                for key in ["quantityMilli", "remainingQuantityMilli"] {
                    if !nullFields.contains(key), let raw = fields[key], !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        fields[key] = try ERPCommandInput.milliQuantity(raw)
                    }
                }
            } catch { model.problem = model.text(.errorInput); return }
        }
        // Credentials stay in the form only until the one explicit attempt; never survive navigation.
        draft = draft.filter { !ERPWorkspacePolicy.sensitiveField($0.key) }
        let success = await model.submit(command, fields: fields, versionText: expectedVersion,
                                         expectedSession: revision, nullFields: nullFields,
                                         context: selectedContext, confirmed: confirmed)
        if success && selectedContext != nil && revision == model.sessionRevision { dismiss() }
    }
    var body: some View {
        Form {
            Section(ERPActionLabels.title(command.name, language: model.language, includeModule: context == nil)) {
                if let record {
                    Text(record.title).font(.headline)
                    LabeledContent(model.text(.recordId), value: record.id).textSelection(.enabled)
                    LabeledContent(model.text(.expectedVersion), value: String(record.version))
                }
                ForEach(properties.map { $0.0 }, id: \.self) { key in
                    if let definition = properties.first(where: { $0.0 == key })?.1.dictionary {
                        field(key, definition: definition)
                    }
                }
                if context == nil { TextField(model.text(.expectedVersion), text: $expectedVersion).keyboardType(.numberPad) }
            }
            if !model.problem.isEmpty { Section { Text(model.problem).foregroundStyle(.red) } }
            Section {
                Button(model.text(.submit)) {
                    if currentCommand?.highRisk == true { confirmation = true }
                    else { model.run { await submit(confirmed: false) } }
                }.buttonStyle(.borderedProminent).disabled(!model.canWrite || hasUnsupportedFields || currentCommand == nil || sourceSessionRevision != model.sessionRevision)
            }
            if let result = model.commandResult, model.resultCommandName == command.name {
                Section(model.text(.result)) { ERPResultView(value: result, model: model) }
            }
        }.navigationTitle(model.text(.actionTitle)).privacySensitive()
            .confirmationDialog(model.text(.confirmSensitive), isPresented: $confirmation) {
                Button(model.text(.confirm) + " · " + ERPWorkspacePolicy.commandTitle(command.name, language: model.language), role: .destructive) {
                    model.run { await submit(confirmed: true) }
                }
                Button(model.text(.cancel), role: .cancel) { }
            } message: {
                Text(model.text(.confirmNotice) + (record.map { "\n" + $0.title + "\n" + model.text(.version) + ": " + String($0.version) } ?? ""))
            }
    }
    @ViewBuilder private func field(_ key: String, definition: [String: ERPField]) -> some View {
        if let schema = try? ERPCommandInput.fieldSchema(definition) {
            VStack(alignment: .leading, spacing: 8) {
                editor(key, schema: schema).disabled(nullFields.contains(key))
                if schema.allowsNull && context?.fixedFields[key] == nil {
                    Toggle(model.text(.clearValue), isOn: nullBinding(key))
                        .accessibilityLabel(key + " · " + model.text(.clearValue))
                        .accessibilityIdentifier("erpClearValue_" + key)
                }
            }
        } else {
            LabeledContent(key, value: model.text(.unavailable)).foregroundStyle(.secondary)
        }
    }
    @ViewBuilder private func editor(_ key: String, schema: ERPCommandInput.FieldSchema) -> some View {
        let fieldNames: [String: ERPText] = ["quantityMilli": .quantity, "remainingQuantityMilli": .remainingQuantity,
            "description": .description, "problems": .problems, "delayReason": .delayReason,
            "currentPassword": .currentPassword, "newPassword": .newPassword]
        let label = (fieldNames[key].map { model.text($0) } ?? model.fieldLabel(key)) + (required.contains(key) ? " *" : "")
        let definition = schema.definition
        let type = schema.type
        if let fixed = context?.fixedFields[key] {
            LabeledContent(label, value: fixed).textSelection(.enabled)
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
