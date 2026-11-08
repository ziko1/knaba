import Foundation

struct ERPModule: Identifiable {
    let id: String
    let icon: String
    let title: ERPText
    let permissions: [String]
    var kind: String { id }
}

/// Navigation hints only. The server applies current company/site/customer scope on every read.
/// Permission names mirror Engine.visible; a role never implies a wildcard permission.
enum ERPWorkspacePolicy {
    static let allModules: [ERPModule] = [
        .init(id: "site", icon: "building.2", title: .sites, permissions: ["site.read", "task.read", "operations.read"]),
        .init(id: "order", icon: "doc.plaintext", title: .orders, permissions: ["commerce.manage", "dispatch.manage", "site.read"]),
        .init(id: "task", icon: "checklist", title: .tasks, permissions: ["site.read", "task.read", "operations.read"]),
        .init(id: "quote", icon: "doc.text", title: .quotes, permissions: ["commerce.manage", "commerce.read", "customer.read", "lead.manage"]),
        .init(id: "lead", icon: "person.crop.square", title: .requests, permissions: ["lead.manage", "lead.create", "commerce.manage", "customer.read"]),
        .init(id: "crew_assignment", icon: "person.3.sequence", title: .crew, permissions: ["dispatch.manage", "dispatch.read", "dispatch.acknowledge"]),
        .init(id: "employee", icon: "person.2", title: .employees, permissions: ["identity.manage", "dispatch.manage", "task.assign"]),
        .init(id: "shift", icon: "clock", title: .shifts, permissions: ["shift.read", "shift.manage", "shift.own", "timesheet.approve"]),
        .init(id: "presence", icon: "location.circle", title: .presence, permissions: ["location.presence.read"]),
        .init(id: "customer", icon: "person.2.crop.square.stack", title: .customers, permissions: ["customer.manage", "customer.read", "commerce.manage"]),
        .init(id: "channel", icon: "bubble.left.and.bubble.right", title: .messages, permissions: ["chat.read"]),
        .init(id: "issue", icon: "exclamationmark.bubble", title: .issues, permissions: ["issue.read"]),
        .init(id: "report", icon: "doc.text.image", title: .reports, permissions: ["report.read", "report.create", "report.review", "report.publish", "report.ack"]),
        .init(id: "report_version", icon: "doc.on.doc", title: .publishedReports, permissions: ["report.read", "report.review", "report.publish", "report.ack"]),
        .init(id: "material_request", icon: "shippingbox", title: .materials, permissions: ["inventory.read", "inventory.request", "inventory.manage"]),
        .init(id: "notification", icon: "bell", title: .notifications, permissions: []),
        .init(id: "decision", icon: "checkmark.seal", title: .decisions, permissions: ["decision.manage"]),
        .init(id: "user", icon: "person.crop.circle.badge.checkmark", title: .users, permissions: ["identity.manage", "identity.self", "task.assign"]),
        .init(id: "bot_config", icon: "gearshape.2", title: .automation, permissions: ["bot.manage", "company.manage"])
    ]

    static func modules(for actor: ERPActor) -> [ERPModule] {
        let external = actor.roles.contains { ["CLIENT", "CUSTOMER", "EXTERNAL_BAULEITER", "GUEST"].contains($0) }
        return allModules.filter { module in
            if module.id == "notification" { return true } // Server returns only this user's notifications.
            if external {
                if ["site", "order", "report", "report_version", "quote"].contains(module.id) { return true }
                guard ["lead", "channel", "issue", "user"].contains(module.id) else { return false }
            }
            return module.permissions.contains { actor.permissions.contains($0) }
        }
    }

    static func taskActions(for item: ERPItem, catalog: [ERPCommand]) -> [ERPCommand] {
        guard item.kind == "task" else { return [] }
        let state = item.data["state"]?.string ?? item.data["status"]?.string ?? ""
        let names: Set<String>
        switch state {
        case "ASSIGNED": names = ["task.start"]
        case "IN_PROGRESS": names = ["task.worklog", "task.checklist", "task.submit"]
        case "BLOCKED", "REOPENED": names = ["task.start", "task.worklog", "task.checklist"]
        case "SUBMITTED_FOR_REVIEW": names = ["task.review"]
        default: names = []
        }
        return catalog.filter { names.contains($0.name) }
    }

    static func commandTitle(_ name: String, language: NativeLanguage) -> String {
        let keys: [String: ERPText] = ["task.start": .startTask, "task.worklog": .logWork, "task.submit": .submitTask, "task.checklist": .checklist, "task.review": .reviewTask,
            "user.password.rotate": .changePassword, "user.mfa.configure": .configureMFA, "customer.portal": .clientPortal]
        return keys[name].map { ERPStrings.text($0, language) } ?? name
    }

    static func sensitiveField(_ key: String) -> Bool {
        let key = key.lowercased()
        return key.contains("password") || key.contains("secret") || key.contains("token") || key == "otp" || key.contains("privatekey")
    }

    static func visibleKeys(_ data: [String: ERPField]) -> [String] {
        data.keys.filter { !sensitiveField($0) }.sorted()
    }
}

/// Preserve exact password bytes. Reject an invalid version instead of silently omitting concurrency control.
enum ERPCommandInput {
    static func milliQuantity(_ raw: String) throws -> String {
        let normalized = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
        guard normalized.range(of: "^[0-9]+(?:\\.[0-9]{1,3})?$", options: .regularExpression) != nil else { throw ERPFailure.invalidPayload }
        let parts = normalized.split(separator: ".")
        guard let whole = Int(parts[0]), whole <= 9_007_199_254_740 else { throw ERPFailure.invalidPayload }
        let fractional = parts.count == 2 ? String(parts[1]) : ""
        guard let fraction = Int(fractional + String(repeating: "0", count: 3 - fractional.count)) else { throw ERPFailure.invalidPayload }
        let amount = whole * 1000 + fraction
        guard amount <= 9_007_199_254_740_991 else { throw ERPFailure.invalidPayload }
        return String(amount)
    }
    static func version(_ text: String) throws -> Int? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return nil }
        guard value.range(of: "^[0-9]+$", options: .regularExpression) != nil,
              let number = Int(value), number > 0, number <= 9_007_199_254_740_991 else { throw ERPFailure.invalidPayload }
        return number
    }

    static func payload(command: ERPCommand, fields: [String: String]) throws -> Data {
        guard let schema = command.schema?.dictionary, schema["type"]?.string == "object",
              let properties = schema["properties"]?.dictionary else { throw ERPFailure.invalidPayload }
        let required = Set(schema["required"]?.list?.compactMap { $0.string } ?? [])
        var output: [String: Any] = [:]
        for (key, property) in properties {
            let raw = fields[key] ?? ""
            let value = ERPWorkspacePolicy.sensitiveField(key) ? raw : raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if value.isEmpty { if required.contains(key) { throw ERPFailure.invalidPayload }; continue }
            guard let definition = property.dictionary else { throw ERPFailure.invalidPayload }
            let type = definition["type"]?.string ?? "string"
            switch type {
            case "integer":
                guard value.range(of: "^-?[0-9]+$", options: .regularExpression) != nil,
                      let number = Int(value), number.magnitude <= 9_007_199_254_740_991 else { throw ERPFailure.invalidPayload }
                try bounds(Double(number), definition)
                output[key] = number
            case "number":
                guard let number = Double(value), number.isFinite else { throw ERPFailure.invalidPayload }
                try bounds(number, definition)
                output[key] = number
            case "boolean":
                guard value == "true" || value == "false" else { throw ERPFailure.invalidPayload }
                output[key] = value == "true"
            case "array", "object":
                guard let data = value.data(using: .utf8), data.count <= 65_536 else { throw ERPFailure.invalidPayload }
                let parsed = try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
                guard type == "array" ? parsed is [Any] : parsed is [String: Any] else { throw ERPFailure.invalidPayload }
                output[key] = parsed
            case "string":
                if let minimum = definition["minLength"]?.string.flatMap(Double.init), Double(value.utf16.count) < minimum { throw ERPFailure.invalidPayload }
                if let maximum = definition["maxLength"]?.string.flatMap(Double.init), Double(value.utf16.count) > maximum { throw ERPFailure.invalidPayload }
                if let choices = definition["enum"]?.list?.compactMap({ $0.string }), !choices.contains(value) { throw ERPFailure.invalidPayload }
                output[key] = value
            default: throw ERPFailure.invalidPayload
            }
        }
        let result = try JSONSerialization.data(withJSONObject: output, options: .sortedKeys)
        guard result.count <= 65_536 else { throw ERPFailure.invalidPayload }
        return result
    }

    private static func bounds(_ value: Double, _ schema: [String: ERPField]) throws {
        if let minimum = schema["minimum"]?.string.flatMap(Double.init), value < minimum { throw ERPFailure.invalidPayload }
        if let maximum = schema["maximum"]?.string.flatMap(Double.init), value > maximum { throw ERPFailure.invalidPayload }
    }
}

struct ERPDisplayRow: Identifiable {
    let id: String
    let label: String
    let value: String
    let depth: Int
}

/// Bounded in-memory display of actual server projections. Never persist results or render secret fields.
enum ERPDisplayRows {
    static let limit = 200
    static func flatten(_ data: [String: ERPField]) -> [ERPDisplayRow] {
        var rows: [ERPDisplayRow] = []
        func visit(_ value: ERPField, path: String, label: String, depth: Int) {
            guard rows.count < limit, depth <= 6 else { return }
            if let dictionary = value.dictionary {
                for key in ERPWorkspacePolicy.visibleKeys(dictionary) {
                    visit(dictionary[key]!, path: path + "/" + key, label: label + " · " + key, depth: depth + 1)
                }
            } else if let list = value.list {
                for (index, item) in list.prefix(50).enumerated() {
                    visit(item, path: path + "/\(index)", label: label + " [\(index + 1)]", depth: depth + 1)
                }
            } else {
                rows.append(.init(id: path, label: label, value: String((value.string ?? "—").prefix(8000)), depth: depth))
            }
        }
        for key in ERPWorkspacePolicy.visibleKeys(data) { visit(data[key]!, path: key, label: key, depth: 0) }
        return rows
    }
}
