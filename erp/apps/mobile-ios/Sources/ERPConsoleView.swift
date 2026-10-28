import SwiftUI

struct ERPModule: Identifiable {
    let id: String
    let icon: String
    let title: String
    let permission: String
    var kind: String { id }
}

/// All navigation is native SwiftUI. These are server-visible entities, not simulated records.
private let erpModules: [ERPModule] = [
    .init(id: "decision", icon: "checkmark.seal", title: "Decisions", permission: "decisions.read"),
    .init(id: "site", icon: "building.2", title: "Sites", permission: "site.read"),
    .init(id: "order", icon: "doc.plaintext", title: "Orders", permission: "order.manage"),
    .init(id: "lead", icon: "person.crop.square", title: "Requests", permission: "lead.read"),
    .init(id: "task", icon: "checklist", title: "Tasks", permission: "task.read"),
    .init(id: "crew_assignment", icon: "person.3.sequence", title: "Crew", permission: "crew.assign"),
    .init(id: "employee", icon: "person.2", title: "Employees", permission: "operations.read"),
    .init(id: "shift", icon: "clock", title: "Shifts", permission: "shift.manage"),
    .init(id: "presence", icon: "location.circle", title: "Presence status", permission: "location.presence.read"),
    .init(id: "customer", icon: "person.2.crop.square.stack", title: "Customers", permission: "customer.manage"),
    .init(id: "channel", icon: "bubble.left.and.bubble.right", title: "Chats", permission: "chat.read"),
    .init(id: "report", icon: "doc.text.image", title: "Reports", permission: "report.read"),
    .init(id: "notification", icon: "bell", title: "Notifications", permission: "notifications.manage"),
    .init(id: "user", icon: "person.crop.circle.badge.checkmark", title: "Users & roles", permission: "identity.manage"),
    .init(id: "bot_config", icon: "gearshape.2", title: "Automation", permission: "bot.manage")
]

@MainActor final class ERPConsoleModel: ObservableObject {
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
    private let client = ERPConsoleClient()
    private var epoch = 0
    private var storedOrigin = ""
    var modules: [ERPModule] {
        guard let actor = identity?.actor else { return [] }
        // A visible tab is not an authorization grant: ERP always performs its own scope validation.
        return erpModules.filter { module in
            actor.roles.contains("OWNER") || actor.permissions.contains("*") || actor.permissions.contains(module.permission) ||
            actor.permissions.contains(module.permission.split(separator: ".").first.map { String($0) + ".*" } ?? "") ||
            (module.id == "task" && actor.permissions.contains("task.assign")) ||
            (module.id == "shift" && actor.permissions.contains("shift.read"))
        }
    }
    var isOperator: Bool {
        identity?.actor.roles.contains(where: { ["OWNER", "DIRECTOR", "OPERATIONS_MANAGER", "DISPATCHER"].contains($0) }) == true
    }
    var roleLabel: String { identity?.actor.roles.joined(separator: " · ") ?? "" }
    func signIn() async {
        guard !busy else { return }
        busy = true; problem = ""; notice = ""; epoch += 1
        let ticket = epoch
        do {
            try await client.configure(origin)
            storedOrigin = origin.trimmingCharacters(in: .whitespacesAndNewlines)
            let result = try await client.login(email: email, password: password, otp: otp)
            guard epoch == ticket else { return }
            identity = result
            password = ""; otp = ""
            UserDefaults.standard.set(storedOrigin, forKey: "knaba-erp-origin")
            notice = "Connected to your KNABA account"
            busy = false
            await loadOverview()
        } catch {
            guard ticket == epoch else { return }
            problem = error.localizedDescription; identity = nil; busy = false
        }
    }
    func reloadSession() async {
        guard identity != nil, !busy else { return }
        do {
            let next = try await client.refresh()
            guard storedOrigin == origin.trimmingCharacters(in: .whitespacesAndNewlines) else { await signOut(); return }
            identity = next
        } catch { await signOut(); problem = error.localizedDescription }
    }
    func signOut() async {
        epoch += 1
        await client.logout()
        identity = nil; items = []; commands = []; channels = []; messages = []; dashboard = nil
        selectedChannel = ""; messageText = ""; password = ""; otp = ""
        notice = ""; busy = false
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
            problem = error.localizedDescription
        }
        if epoch == ticket { busy = false }
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
            items = []; problem = error.localizedDescription
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
        } catch { if epoch == ticket { channels = []; messages = []; problem = error.localizedDescription } }
        if epoch == ticket { busy = false; if !selectedChannel.isEmpty { await loadMessages() } }
    }
    func loadMessages() async {
        guard !selectedChannel.isEmpty, identity != nil else { return }
        let ticket = epoch, channel = selectedChannel
        do {
            let rows = try await client.messages(channel)
            if ticket == epoch && selectedChannel == channel { messages = rows }
        } catch { if ticket == epoch { problem = error.localizedDescription } }
    }
    func sendMessage() async {
        guard !busy, !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        busy = true; problem = ""; let ticket = epoch
        do {
            try await client.sendMessage(channelId: selectedChannel, text: messageText, language: "DE")
            if ticket == epoch { messageText = ""; notice = "Message sent" }
            if ticket == epoch { await loadMessages() }
        } catch { if ticket == epoch { problem = error.localizedDescription } }
        if ticket == epoch { busy = false }
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
            if epoch == ticket { notice = "Saved by KNABA server"; await loadOverview() }
        } catch { if epoch == ticket { problem = error.localizedDescription } }
        if epoch == ticket { busy = false }
    }
}

struct ERPConsoleView: View {
    @StateObject private var model = ERPConsoleModel()
    @State private var selectedTab = 0
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            Group {
                if model.identity == nil { login }
                else { console }
            }
            .navigationTitle(model.identity == nil ? "KNABA DE" : "KNABA Control")
            .toolbar {
                if model.identity != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right") { Task { await model.signOut() } }
                    }
                }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && model.identity != nil { Task { await model.reloadSession() } }
        }
    }
    private var login: some View {
        Form {
            Section {
                Label("Owner · Team · Client · Partner", systemImage: "building.2.crop.circle")
                    .font(.headline)
                Text("Native access to the KNABA ERP. No web browser or WebView. Your rights come from the server.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Server") {
                TextField("https://erp.example.de", text: $model.origin)
                    .textContentType(.URL).textInputAutocapitalization(.never)
                    .keyboardType(.URL).autocorrectionDisabled()
            }
            Section("Your account") {
                TextField("E-mail", text: $model.email).keyboardType(.emailAddress)
                    .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Password", text: $model.password).textContentType(.password)
                TextField("2FA code, if required", text: $model.otp).keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                Button { Task { await model.signIn() } } label: {
                    Label("Sign in securely", systemImage: "lock.shield")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.busy || model.email.isEmpty || model.password.isEmpty || ERPOrigin.validate(model.origin) == nil)
            }
            if !model.problem.isEmpty { Section { Text(model.problem).foregroundStyle(.red) } }
            Section { Text("Employees may use the separate native shift and voluntary location tools. GPS is never activated by signing in.").font(.caption).foregroundStyle(.secondary) }
        }
    }
    private var console: some View {
        VStack(spacing: 0) {
            if !model.problem.isEmpty { Text(model.problem).font(.callout).foregroundStyle(.red).padding(10) }
            if !model.notice.isEmpty { Text(model.notice).font(.caption).foregroundStyle(.secondary).padding(.horizontal, 10) }
            Picker("Module", selection: $selectedTab) {
                Label("Overview", systemImage: "square.grid.2x2").tag(0)
                Label("Records", systemImage: "list.bullet.rectangle").tag(1)
                Label("Messages", systemImage: "bubble.left.and.bubble.right").tag(2)
                Label("Actions", systemImage: "slider.horizontal.3").tag(3)
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
            Section("Account & permissions") {
                LabeledContent("Signed in", value: model.identity?.user.name ?? model.identity?.user.email ?? "KNABA")
                LabeledContent("Roles", value: model.roleLabel)
                LabeledContent("Company", value: model.identity?.actor.companyId ?? "—")
            }
            Section("Live overview") {
                if let stats = model.dashboard {
                    ForEach(stats.counts.keys.sorted(), id: \.self) { key in
                        LabeledContent(key.replacingOccurrences(of: "_", with: " ").capitalized, value: String(stats.counts[key] ?? 0))
                    }
                    LabeledContent("Active shifts", value: String(stats.activeShifts ?? 0))
                } else { ContentUnavailableView("Server data unavailable", systemImage: "wifi.slash") }
                Button("Refresh") { Task { await model.loadOverview() } }
            }
            Section("Available areas") {
                ForEach(model.modules) { module in
                    Button { selectedTab = 1; Task { await model.loadKind(module.kind) } } label: {
                        Label(module.title, systemImage: module.icon)
                    }
                }
            }
            Section {
                Text("Position is shown only if a server-authorized active work session and an explicit location policy exist. Offline or missing location does not mean an employee is absent.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .refreshable { await model.loadOverview() }
    }
    private var records: some View {
        List {
            Section("Module") {
                Picker("Records", selection: $model.selection) {
                    ForEach(model.modules) { module in Text(module.title).tag(module.kind) }
                }
                .onChange(of: model.selection) { _, kind in Task { await model.loadKind(kind) } }
                Button("Reload \(model.selection)") { Task { await model.loadKind(model.selection) } }
            }
            Section("Authorized records · \(model.items.count)") {
                if model.items.isEmpty { ContentUnavailableView("No accessible records", systemImage: "tray") }
                ForEach(model.items) { item in
                    NavigationLink {
                        List {
                            Section(item.kind) { LabeledContent("ID", value: item.id); LabeledContent("Version", value: String(item.version)) }
                            Section("Server fields") {
                                ForEach(item.data.keys.sorted(), id: \.self) { key in
                                    LabeledContent(key, value: item.data[key]?.string ?? (item.data[key]?.dictionary != nil ? "Object" : item.data[key]?.list != nil ? "List" : "—"))
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
            Section("Company conversation") {
                Picker("Channel", selection: $model.selectedChannel) {
                    ForEach(model.channels) { item in Text(item.title).tag(item.id) }
                }
                .onChange(of: model.selectedChannel) { _, _ in Task { await model.loadMessages() } }
                Button("Refresh conversation") { Task { await model.loadChannels() } }
            }
            Section("Messages") {
                if model.messages.isEmpty { ContentUnavailableView("No messages", systemImage: "bubble.left") }
                ForEach(model.messages) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.data["text"]?.string ?? item.title).font(.body)
                        Text(item.data["language"]?.string ?? "KNABA").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Section("Reply") {
                TextField("Message", text: $model.messageText, axis: .vertical).lineLimit(2...5)
                Button("Send") { Task { await model.sendMessage() } }
                    .disabled(model.busy || model.selectedChannel.isEmpty || model.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .task { if model.channels.isEmpty { await model.loadChannels() } }
        .refreshable { await model.loadChannels() }
    }
    private var actions: some View {
        List {
            Section {
                Text("Only actions authorized by the server are shown. Sensitive changes require a second confirmation and may require 2FA.")
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
                        TextField(type == "array" ? "JSON array e.g. [\"id\"]" : type == "object" ? "JSON object" : type,
                                  text: Binding(get: { draft[key] ?? "" }, set: { draft[key] = $0 }), axis: .vertical)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        if type == "boolean" { Text("Enter true or false").font(.caption).foregroundStyle(.secondary) }
                    }
                    }
                }
                TextField("Expected entity version (optional)", text: $expectedVersion).keyboardType(.numberPad)
            }
            Section {
                Button("Submit to KNABA") {
                    if command.highRisk == true { confirmation = true }
                    else { Task { await model.submit(command, fields: draft, version: Int(expectedVersion)) } }
                }
                .buttonStyle(.borderedProminent).disabled(model.busy)
            }
        }
        .navigationTitle("KNABA action")
        .confirmationDialog("Confirm sensitive operation", isPresented: $confirmation) {
            Button("Confirm \(command.name)", role: .destructive) {
                Task { await model.submit(command, fields: draft, version: Int(expectedVersion)) }
            }
        } message: { Text("This operation changes real company records. Check details and server rights before approving.") }
    }
}
