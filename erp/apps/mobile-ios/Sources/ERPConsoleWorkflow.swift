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
    private static let finance = ["finance.payroll", "finance.accountant", "finance.payout", "finance.payout.approve", "finance.payroll.approve"]
    static let allModules: [ERPModule] = [
        .init(id: "vehicle_trip", icon: "car.2", title: .sharedTrips, permissions: ["trip.read", "dispatch.manage", "trip.approve"]),
        .init(id: "change_order", icon: "doc.badge.plus", title: .changes, permissions: ["commerce.read", "commerce.manage", "dispatch.manage", "customer.manage", "customer.read", "lead.manage", "customer.portal"]),
        .init(id: "timesheet", icon: "calendar", title: .timesheets, permissions: ["timesheet.read", "timesheet.approve", "finance.payroll", "finance.accountant"]),
        .init(id: "trip", icon: "car", title: .trips, permissions: ["trip.read", "trip.manage", "trip.approve"]),
        .init(id: "defect", icon: "exclamationmark.circle", title: .defects, permissions: ["task.read", "task.review"]),
        .init(id: "worklog", icon: "list.clipboard", title: .worklogs, permissions: ["task.read", "operations.read"]),
        .init(id: "material", icon: "shippingbox", title: .materials, permissions: ["inventory.read"]),
        .init(id: "material_request_batch", icon: "shippingbox", title: .requestBatches, permissions: ["inventory.read"]),
        .init(id: "stock_location", icon: "archivebox", title: .stockLocations, permissions: ["inventory.read"]),
        .init(id: "stock_reservation", icon: "archivebox", title: .stockReservations, permissions: ["inventory.read"]),
        .init(id: "stock_movement", icon: "arrow.left.arrow.right", title: .stockMovements, permissions: ["inventory.read"]),
        .init(id: "supplier", icon: "building.2", title: .suppliers, permissions: ["procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"]),
        .init(id: "purchase_requisition", icon: "cart", title: .purchaseRequests, permissions: ["procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"]),
        .init(id: "purchase_order", icon: "cart", title: .purchaseOrders, permissions: ["procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"]),
        .init(id: "goods_receipt", icon: "checkmark.circle", title: .goodsReceipts, permissions: ["procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"]),
        .init(id: "payroll_calculation", icon: "banknote", title: .payroll, permissions: ["payroll.self"] + finance),
        .init(id: "official_payslip", icon: "doc.text", title: .payslips, permissions: ["payroll.self"] + finance),
        .init(id: "payout", icon: "banknote", title: .payouts, permissions: ["payroll.self", "finance.payout.ack"] + finance),
        .init(id: "receipt", icon: "checkmark.seal", title: .receipts, permissions: ["payroll.self", "finance.payout.ack"] + finance),
        .init(id: "media_asset", icon: "paperclip", title: .files, permissions: ["media.read", "media.upload"]),
        .init(id: "knowledge", icon: "book", title: .knowledge, permissions: ["assistant.read", "assistant.manage"]),
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
        ERPActionLabels.title(name, language: language)
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
    struct FieldSchema {
        let type: String
        let definition: [String: ERPField]
        let allowsNull: Bool
    }
    private static let fieldTypes: Set<String> = ["string", "integer", "number", "boolean", "array", "object"]
    private static let compositeKeys: Set<String> = ["anyOf", "oneOf", "allOf", "not", "if", "then", "else", "$ref", "$dynamicRef"]
    private static let annotationKeys: Set<String> = ["title", "description", "default", "examples", "$schema", "readOnly", "writeOnly"]

    /// Support the actual nullable shapes emitted by the server, without guessing
    /// an editor for arbitrary unions or treating a typed string "null" as nil.
    static func fieldSchema(_ definition: [String: ERPField]) throws -> FieldSchema {
        guard compositeKeys.subtracting(["anyOf"]).isDisjoint(with: definition.keys) else { throw ERPFailure.invalidPayload }
        if let union = definition["anyOf"] {
            guard Set(definition.keys).isSubset(of: annotationKeys.union(["anyOf"])),
                  let branches = union.list, branches.count == 2 else { throw ERPFailure.invalidPayload }
            var nonNull: FieldSchema?
            var hasNull = false
            for branch in branches {
                guard let schema = branch.dictionary, compositeKeys.isDisjoint(with: schema.keys),
                      let type = schema["type"]?.string else { throw ERPFailure.invalidPayload }
                if type == "null" {
                    guard !hasNull, Set(schema.keys).isSubset(of: annotationKeys.union(["type", "enum", "const"])),
                          permitsNull(schema) else { throw ERPFailure.invalidPayload }
                    hasNull = true
                } else {
                    guard nonNull == nil, fieldTypes.contains(type) else { throw ERPFailure.invalidPayload }
                    nonNull = FieldSchema(type: type, definition: schema, allowsNull: false)
                }
            }
            guard hasNull, let nonNull else { throw ERPFailure.invalidPayload }
            return FieldSchema(type: nonNull.type, definition: nonNull.definition, allowsNull: true)
        }
        if let types = definition["type"]?.list {
            let names = types.compactMap { $0.string }
            guard types.count == 2, names.count == 2, Set(names).count == 2, names.contains("null"),
                  let type = names.first(where: { $0 != "null" }), fieldTypes.contains(type) else { throw ERPFailure.invalidPayload }
            return FieldSchema(type: type, definition: definition, allowsNull: permitsNull(definition))
        }
        guard let type = definition["type"]?.string, fieldTypes.contains(type) else { throw ERPFailure.invalidPayload }
        return FieldSchema(type: type, definition: definition, allowsNull: false)
    }
    private static func permitsNull(_ definition: [String: ERPField]) -> Bool {
        if let constant = definition["const"] {
            guard case .null = constant.value else { return false }
        }
        if let enumeration = definition["enum"] {
            guard let choices = enumeration.list else { return false }
            return choices.contains { if case .null = $0.value { return true }; return false }
        }
        return true
    }

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

    static func payload(command: ERPCommand, fields: [String: String], nullFields: Set<String> = []) throws -> Data {
        guard let schema = command.schema?.dictionary, schema["type"]?.string == "object",
              let properties = schema["properties"]?.dictionary,
              nullFields.isSubset(of: Set(properties.keys)) else { throw ERPFailure.invalidPayload }
        let required = Set(schema["required"]?.list?.compactMap { $0.string } ?? [])
        var output: [String: Any] = [:]
        for (key, property) in properties {
            guard let rawDefinition = property.dictionary else { throw ERPFailure.invalidPayload }
            let resolved = try fieldSchema(rawDefinition)
            let definition = resolved.definition
            if nullFields.contains(key) {
                guard resolved.allowsNull else { throw ERPFailure.invalidPayload }
                output[key] = NSNull()
                continue
            }
            let raw = fields[key] ?? ""
            let value = ERPWorkspacePolicy.sensitiveField(key) ? raw : raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if value.isEmpty { if required.contains(key) { throw ERPFailure.invalidPayload }; continue }
            let type = resolved.type
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
