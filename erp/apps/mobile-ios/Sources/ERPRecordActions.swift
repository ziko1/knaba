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
        "task": binding("taskId", "task.start", "task.worklog", "task.submit", "task.checklist", "task.review"),
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
        guard !record.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, record.version > 0, record.version <= 9_007_199_254_740_991, !actor.userId.isEmpty, !actor.companyId.isEmpty,
              !command.permission.isEmpty,
              actor.permissions.contains(command.permission),
              let primary = field(kind: record.kind, command: command.name),
              let schema = command.schema?.dictionary, schema["type"]?.string == "object",
              let properties = schema["properties"]?.dictionary,
              properties[primary]?.dictionary?["type"]?.string == "string",
              schema["required"]?.list?.contains(where: { $0.string == primary }) == true else { return nil }
        if record.kind == "task", ERPWorkspacePolicy.taskActions(for: record, catalog: [command]).isEmpty { return nil }
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
    /// Fixed record identity/snapshot fields always win over a stale or tampered draft.
    /// Keep the established nullable/union and exact credential-byte input converter.
    static func payload(_ context: ERPRecordActionContext, command: ERPCommand, actor: ERPActor,
                        fields: [String: String], nullFields: Set<String> = []) throws -> Data {
        try validate(context, command: command, actor: actor)
        guard Set(context.fixedFields.keys).isDisjoint(with: nullFields) else { throw ERPFailure.invalidPayload }
        let bound = fields.merging(context.fixedFields) { _, fixed in fixed }
        return try ERPCommandInput.payload(command: command, fields: bound, nullFields: nullFields)
    }

}
