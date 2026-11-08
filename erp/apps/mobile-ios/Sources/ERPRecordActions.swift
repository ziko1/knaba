import Foundation

/// A record shortcut is a snapshot, never an authorization grant or a client-side transition.
/// Its identity, version and related quote/assignment versions cannot be edited by the form.
struct ERPRecordActionContext: Sendable {
    let commandName: String
    let permission: String
    let record: ERPItem
    let companyId: String
    let userId: String
    let fixedFields: [String: String]
}

enum ERPRecordActions {
    private struct Binding {
        let field: String
        let commands: Set<String>
    }
    private static func binding(_ field: String, _ commands: String...) -> Binding {
        Binding(field: field, commands: Set(commands))
    }
    // Names and primary IDs are checked against the executable ERP registry in repository CI.
    private static let bindings: [String: Binding] = [
        "task": binding("taskId", "task.start", "task.worklog", "task.submit"),
        "quote": binding("id", "quote.approve", "quote.send", "quote.accept", "quote.reject", "quote.expire"),
        "order": binding("id", "order.link_site", "order.confirm", "order.submit", "order.review", "order.transition"),
        "crew_assignment": binding("id", "crew_assignment.acknowledge", "crew_assignment.decline", "crew_assignment.expire", "crew_assignment.start", "dispatch.reschedule"),
        "material_request": binding("requestId", "request.submit", "request.approve", "request.close", "request.ack"),
        "material_request_batch": binding("batchRequestId", "request.batch.submit", "request.batch.approve", "request.batch.close"),
        "purchase_requisition": binding("requisitionId", "procurement.approve", "procurement.order"),
        "purchase_order": binding("orderId", "procurement.confirm_delivery", "procurement.receive", "procurement.close"),
        "goods_receipt": binding("receiptId", "procurement.reconcile"),
        "timesheet": binding("timesheetId", "timesheet.review", "timesheet.lock", "timesheet.correction", "timesheet.correction.bulk"),
        "trip": binding("tripId", "trip.destination", "trip.stop", "trip.resume", "trip.arrive", "trip.end", "trip.approve"),
        "payout": binding("payoutId", "payout.submit", "payout.cancel", "payout.approve", "payout.record", "payout.ack", "payout.ack_amend", "payout.reconcile", "payout.reverse"),
        "report": binding("reportId", "report.refresh", "report.review", "report.approve", "report.publish", "report.revise"),
        "report_version": binding("reportVersionId", "report.delivered", "report.ack"),
        "issue": binding("id", "issue.submit", "issue.qualify", "issue.link_work", "issue.resolve", "issue.reopen")
    ]

    static func kind(for command: String) -> String? {
        bindings.first(where: { $0.value.commands.contains(command) })?.key
    }
    static func field(kind: String, command: String) -> String? {
        guard let entry = bindings[kind], entry.commands.contains(command) else { return nil }
        return entry.field
    }
    private static func snapshotFields(_ kind: String) -> Set<String> {
        switch kind {
        case "quote": return ["quoteVersion"]
        case "crew_assignment": return ["employeeId", "scheduleVersion"]
        default: return []
        }
    }
    static func context(for record: ERPItem, command: ERPCommand, actor: ERPActor) -> ERPRecordActionContext? {
        guard !record.id.isEmpty, record.version > 0, !actor.userId.isEmpty, !actor.companyId.isEmpty,
              !command.permission.isEmpty,
              ERPModuleCatalog.permits(actor.permissions, anyOf: [command.permission]),
              let primary = field(kind: record.kind, command: command.name),
              let schema = command.schema?.dictionary,
              let properties = schema["properties"]?.dictionary,
              properties[primary]?.dictionary?["type"]?.string == "string",
              schema["required"]?.list?.contains(where: { $0.string == primary }) == true else { return nil }
        if record.kind == "task" {
            let state = record.data["status"]?.string ?? record.data["state"]?.string ?? ""
            let allowed: Set<String> = state == "ASSIGNED" ? ["task.start"] :
                state == "IN_PROGRESS" ? ["task.worklog", "task.submit"] : []
            guard allowed.contains(command.name) else { return nil }
        }
        var fixed = [primary: record.id]
        for key in snapshotFields(record.kind) where properties[key] != nil {
            guard let value = record.data[key] else { return nil }
            switch (properties[key]?.dictionary?["type"]?.string, value.value) {
            case ("string", .text(let text)) where !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty:
                fixed[key] = text
            case ("integer", .number(let number)) where number.isFinite && number > 0 && number <= 9_007_199_254_740_991:
                guard let integer = Int(exactly: number) else { return nil }
                fixed[key] = String(integer)
            default: return nil
            }
        }
        return ERPRecordActionContext(commandName: command.name, permission: command.permission,
                                      record: record, companyId: actor.companyId, userId: actor.userId,
                                      fixedFields: fixed)
    }
    static func validate(_ context: ERPRecordActionContext, command: ERPCommand, actor: ERPActor) throws {
        guard context.companyId == actor.companyId, context.userId == actor.userId,
              context.commandName == command.name, context.permission == command.permission,
              let current = self.context(for: context.record, command: command, actor: actor),
              current.fixedFields == context.fixedFields else { throw ERPFailure.accessChanged }
    }
}

/// Native input conversion; the server remains responsible for the full schema and business rules.
enum ERPCommandInput {
    static let quantityFields: Set<String> = ["quantityMilli", "plannedQuantityMilli", "reportedQuantityMilli", "acceptedQuantityMilli"]
    static func quantityText(_ milli: Int) -> String {
        let negative = milli < 0
        let magnitude = milli.magnitude
        let whole = magnitude / 1000, fraction = magnitude % 1000
        let suffix = fraction == 0 ? "" : "." + String(format: "%03d", Int(fraction)).replacingOccurrences(of: "0+$", with: "", options: .regularExpression)
        return (negative ? "-" : "") + String(whole) + suffix
    }
    /// Convert displayed units to integer thousandths without binary floating-point rounding.
    static func quantityMilli(_ raw: String) throws -> Int {
        guard raw.range(of: "^-?[0-9]+(?:[.,][0-9]{1,3})?$", options: .regularExpression) != nil else { throw ERPFailure.invalidPayload }
        let negative = raw.hasPrefix("-")
        let unsigned = negative ? String(raw.dropFirst()) : raw
        let pieces = unsigned.replacingOccurrences(of: ",", with: ".").split(separator: ".")
        guard let whole = Int(pieces[0]), whole <= 9_007_199_254_740 else { throw ERPFailure.invalidPayload }
        let fraction = pieces.count == 2 ? String(pieces[1]) : ""
        guard let remainder = Int(fraction + String(repeating: "0", count: 3 - fraction.count)) else { throw ERPFailure.invalidPayload }
        let value = whole * 1000 + remainder
        guard value <= 9_007_199_254_740_991 else { throw ERPFailure.invalidPayload }
        return negative ? -value : value
    }
    static func scalarText(_ field: ERPField) -> String? {
        switch field.value {
        case .text(let value): return value
        case .boolean(let value): return value ? "true" : "false"
        case .number(let value) where value.isFinite:
            if abs(value) <= 9_007_199_254_740_991, let integer = Int(exactly: value) { return String(integer) }
            return String(value)
        default: return nil
        }
    }
    static func displayText(_ field: ERPField, name: String) -> String? {
        if quantityFields.contains(name), case .number(let number) = field.value,
           number.isFinite, abs(number) <= 9_007_199_254_740_991, let milli = Int(exactly: number) {
            return quantityText(milli)
        }
        return scalarText(field)
    }
    static func defaultFields(_ command: ERPCommand) -> [String: String] {
        var fields: [String: String] = [:]
        for (key, definition) in command.schema?.dictionary?["properties"]?.dictionary ?? [:] {
            guard !ERPCredentialPolicy.sensitiveKey(key) else { continue }
            guard let value = definition.dictionary?["default"] else { continue }
            if quantityFields.contains(key), case .number(let number) = value.value,
               abs(number) <= 9_007_199_254_740_991, let milli = Int(exactly: number) { fields[key] = quantityText(milli) }
            else if let scalar = scalarText(value) { fields[key] = scalar }
            else if let data = try? JSONEncoder().encode(value) { fields[key] = String(data: data, encoding: .utf8) }
        }
        return fields
    }
    static func data(command: ERPCommand, fields: [String: String], fixed: [String: String] = [:]) throws -> Data {
        guard let schema = command.schema?.dictionary,
              let properties = schema["properties"]?.dictionary else { throw ERPFailure.invalidPayload }
        let required = Set(schema["required"]?.list?.compactMap { $0.string } ?? [])
        guard required.isSubset(of: Set(properties.keys)), Set(fixed.keys).isSubset(of: Set(properties.keys)) else {
            throw ERPFailure.invalidPayload
        }
        var payload: [String: Any] = [:]
        for (key, definition) in properties {
            let value = fixed[key] ?? fields[key] ?? ""
            let raw = ERPCredentialPolicy.sensitiveKey(key) ? value : value.trimmingCharacters(in: .whitespacesAndNewlines)
            if raw.isEmpty { if required.contains(key) { throw ERPFailure.invalidPayload }; continue }
            let type = definition.dictionary?["type"]?.string ?? "string"
            if let choices = definition.dictionary?["enum"]?.list {
                guard choices.compactMap(scalarText).contains(raw) else { throw ERPFailure.invalidPayload }
            }
            switch type {
            case "integer":
                let parsed: Int?
                if quantityFields.contains(key) { parsed = try quantityMilli(raw) } else { parsed = Int(raw) }
                guard let n = parsed, n >= -9_007_199_254_740_991, n <= 9_007_199_254_740_991 else { throw ERPFailure.invalidPayload }
                if case .number(let min)? = definition.dictionary?["minimum"]?.value, Double(n) < min { throw ERPFailure.invalidPayload }
                if case .number(let max)? = definition.dictionary?["maximum"]?.value, Double(n) > max { throw ERPFailure.invalidPayload }
                payload[key] = n
            case "number":
                guard let n = Double(raw), n.isFinite else { throw ERPFailure.invalidPayload }
                payload[key] = n
            case "boolean":
                guard raw == "true" || raw == "false" else { throw ERPFailure.invalidPayload }
                payload[key] = raw == "true"
            case "array", "object":
                guard let bytes = raw.data(using: .utf8), bytes.count <= 65_536 else { throw ERPFailure.invalidPayload }
                let parsed = try JSONSerialization.jsonObject(with: bytes, options: .fragmentsAllowed)
                guard type == "array" ? parsed is [Any] : parsed is [String: Any] else { throw ERPFailure.invalidPayload }
                payload[key] = parsed
            case "string": payload[key] = raw
            default: throw ERPFailure.invalidPayload
            }
        }
        if ERPCredentialPolicy.isOneShot(command.name) {
            try ERPCredentialPolicy.validateOneShot(command.name, input: payload)
        } else if try ERPCredentialPolicy.containsSecret(payload) { throw ERPFailure.sensitiveCommand }
        let bytes = try JSONSerialization.data(withJSONObject: payload, options: .sortedKeys)
        guard bytes.count <= 65_536 else { throw ERPFailure.invalidPayload }
        return bytes
    }
}
