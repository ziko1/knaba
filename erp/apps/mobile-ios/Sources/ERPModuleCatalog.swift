import Foundation

struct ERPModule: Identifiable {
    let id: String
    let icon: String
    let title: ERPText
    let permissions: [String]
    var kind: String { id }
}

/// Native discovery mirrors Engine read policies. It grants no server access or write permission.
enum ERPModuleCatalog {
    private static let finance = ["finance.payroll", "finance.accountant", "finance.payout", "finance.payout.approve", "finance.payroll.approve"]
    static let items: [ERPModule] = [
        .init(id: "task", icon: "checklist", title: .tasks, permissions: ["task.read", "task.assign"]),
        .init(id: "site", icon: "building.2", title: .sites, permissions: ["site.read", "customer.portal"]),
        .init(id: "order", icon: "doc.plaintext", title: .orders, permissions: ["order.manage", "commerce.read", "commerce.manage", "dispatch.manage", "site.read", "customer.portal"]),
        .init(id: "lead", icon: "person.crop.square", title: .requests, permissions: ["lead.read", "lead.manage", "lead.manage_own", "commerce.manage", "commerce.read", "dispatch.manage", "customer.manage", "customer.read"]),
        .init(id: "quote", icon: "tag", title: .quotes, permissions: ["quote.read", "quote.create", "commerce.manage", "commerce.read", "dispatch.manage", "customer.manage", "customer.read", "lead.manage"]),
        .init(id: "change_order", icon: "doc.badge.plus", title: .changes, permissions: ["commerce.read", "commerce.manage", "dispatch.manage", "customer.manage", "customer.read", "lead.manage", "customer.portal"]),
        .init(id: "channel", icon: "bubble.left.and.bubble.right", title: .messages, permissions: ["chat.read"]),
        .init(id: "decision", icon: "checkmark.seal", title: .decisions, permissions: ["decision.manage"]),
        .init(id: "crew_assignment", icon: "person.3.sequence", title: .crew, permissions: ["crew.assign", "dispatch.manage", "dispatch.acknowledge"]),
        .init(id: "employee", icon: "person.2", title: .employees, permissions: ["operations.read", "identity.manage"]),
        .init(id: "shift", icon: "clock", title: .shifts, permissions: ["shift.read", "shift.manage", "timesheet.approve", "finance.accountant"]),
        .init(id: "timesheet", icon: "calendar", title: .timesheets, permissions: ["timesheet.read", "timesheet.approve", "finance.payroll", "finance.accountant"]),
        .init(id: "trip", icon: "car", title: .trips, permissions: ["trip.read", "trip.manage", "trip.approve"]),
        .init(id: "vehicle_trip", icon: "car.2", title: .vehicleTrips, permissions: ["trip.read", "dispatch.manage", "trip.approve"]),
        .init(id: "presence", icon: "location.circle", title: .presence, permissions: ["location.presence.read"]),
        .init(id: "defect", icon: "exclamationmark.circle", title: .defects, permissions: ["task.read", "task.review"]),
        .init(id: "worklog", icon: "list.clipboard", title: .worklogs, permissions: ["task.read", "operations.read"]),
        .init(id: "customer", icon: "person.2.crop.square.stack", title: .customers, permissions: ["customer.manage", "customer.read", "commerce.manage", "commerce.read", "dispatch.manage", "lead.manage", "customer.portal"]),
        .init(id: "material", icon: "shippingbox", title: .materials, permissions: ["inventory.read"]),
        .init(id: "material_request", icon: "shippingbox", title: .materialRequests, permissions: ["inventory.read"]),
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
        .init(id: "report", icon: "doc.text.image", title: .reports, permissions: ["report.read", "report.create", "report.review"]),
        .init(id: "report_version", icon: "doc.on.doc", title: .reportVersions, permissions: ["report.read", "report.ack", "report.acknowledge"]),
        .init(id: "issue", icon: "exclamationmark.bubble", title: .issues, permissions: ["issue.read"]),
        .init(id: "media_asset", icon: "paperclip", title: .files, permissions: ["media.read", "media.upload"]),
        .init(id: "knowledge", icon: "book", title: .knowledge, permissions: ["assistant.read", "assistant.manage"]),
        .init(id: "notification", icon: "bell", title: .notifications, permissions: ["identity.self", "notifications.manage"]),
        .init(id: "user", icon: "person.crop.circle.badge.checkmark", title: .users, permissions: ["identity.manage"]),
        .init(id: "bot_config", icon: "gearshape.2", title: .automation, permissions: ["bot.manage", "assistant.manage"])
    ]

    static func permits(_ granted: [String], anyOf required: [String]) -> Bool {
        required.contains { permission in
            granted.contains { value in
                value == "*" || value == permission ||
                (value.hasSuffix(".*") && permission.hasPrefix(String(value.dropLast())))
            }
        }
    }

    static func visible(to actor: ERPActor) -> [ERPModule] {
        items.filter { permits(actor.permissions, anyOf: $0.permissions) }
    }
}
