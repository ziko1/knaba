package de.knaba.mobile

/** Navigation hints follow the existing ERP read policies; they never authorize a request. */
internal object ConsoleModules {
    data class Module(val kind: String, val title: Int, val permissions: List<String>)
    private fun module(kind: String, title: Int, vararg permissions: String) = Module(kind, title, permissions.toList())
    private val finance = arrayOf("finance.payroll", "finance.accountant", "finance.payout", "finance.payout.approve", "finance.payroll.approve")
    val items = listOf(
        module("task", R.string.erp_tasks, "task.read", "task.assign"),
        module("site", R.string.erp_sites, "site.read", "customer.portal"),
        module("order", R.string.erp_orders, "order.manage", "commerce.read", "commerce.manage", "dispatch.manage", "site.read", "customer.portal"),
        module("lead", R.string.erp_requests, "lead.read", "lead.manage", "lead.manage_own", "commerce.manage", "commerce.read", "dispatch.manage", "customer.manage", "customer.read"),
        module("quote", R.string.erp_quotes, "quote.read", "quote.create", "commerce.manage", "commerce.read", "dispatch.manage", "customer.manage", "customer.read", "lead.manage"),
        module("change_order", R.string.erp_changes, "commerce.read", "commerce.manage", "dispatch.manage", "customer.manage", "customer.read", "lead.manage", "customer.portal"),
        module("channel", R.string.erp_messages, "chat.read"),
        module("decision", R.string.erp_decisions, "decision.manage"),
        module("crew_assignment", R.string.erp_crew, "crew.assign", "dispatch.manage", "dispatch.acknowledge"),
        module("employee", R.string.erp_people, "operations.read", "identity.manage"),
        module("shift", R.string.erp_shifts, "shift.read", "shift.manage", "timesheet.approve", "finance.accountant"),
        module("timesheet", R.string.erp_timesheets, "timesheet.read", "timesheet.approve", "finance.payroll", "finance.accountant"),
        module("trip", R.string.erp_trips, "trip.read", "trip.manage", "trip.approve"),
        module("presence", R.string.erp_presence, "location.presence.read"),
        module("defect", R.string.erp_defects, "task.read", "task.review"),
        module("worklog", R.string.erp_worklogs, "task.read", "operations.read"),
        module("customer", R.string.erp_customers, "customer.manage", "customer.read", "commerce.manage", "commerce.read", "dispatch.manage", "lead.manage", "customer.portal"),
        module("material", R.string.erp_materials, "inventory.read"),
        module("material_request", R.string.erp_material_requests, "inventory.read"),
        module("material_request_batch", R.string.erp_request_batches, "inventory.read"),
        module("stock_location", R.string.erp_stock_locations, "inventory.read"),
        module("stock_reservation", R.string.erp_stock_reservations, "inventory.read"),
        module("stock_movement", R.string.erp_stock_movements, "inventory.read"),
        module("supplier", R.string.erp_suppliers, "procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"),
        module("purchase_requisition", R.string.erp_purchase_requests, "procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"),
        module("purchase_order", R.string.erp_purchase_orders, "procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"),
        module("goods_receipt", R.string.erp_goods_receipts, "procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"),
        module("payroll_calculation", R.string.erp_payroll, "payroll.self", *finance),
        module("official_payslip", R.string.erp_payslips, "payroll.self", *finance),
        module("payout", R.string.erp_payouts, "payroll.self", "finance.payout.ack", *finance),
        module("receipt", R.string.erp_receipts, "payroll.self", "finance.payout.ack", *finance),
        module("report", R.string.erp_reports, "report.read", "report.create", "report.review"),
        module("report_version", R.string.erp_report_versions, "report.read", "report.ack", "report.acknowledge"),
        module("issue", R.string.erp_issues, "issue.read"),
        module("media_asset", R.string.erp_files, "media.read", "media.upload"),
        module("knowledge", R.string.erp_knowledge, "assistant.read", "assistant.manage"),
        module("notification", R.string.erp_alerts, "identity.self", "notifications.manage"),
        module("user", R.string.erp_users, "identity.manage"),
        module("bot_config", R.string.erp_settings, "bot.manage", "assistant.manage")
    )
}
