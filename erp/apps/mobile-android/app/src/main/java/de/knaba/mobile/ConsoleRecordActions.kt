package de.knaba.mobile

/** Exact existing ERP command/primary-entity bindings, not permission or state transitions. */
internal object ConsoleRecordActions {
    private data class Binding(val field: String, val commands: Set<String>)
    private fun binding(field: String, vararg commands: String) = Binding(field, commands.toSet())
    private val bindings = mapOf(
        "task" to binding("taskId", "task.start", "task.worklog", "task.submit"),
        "quote" to binding("id", "quote.approve", "quote.send", "quote.accept", "quote.reject", "quote.expire"),
        "order" to binding("id", "order.link_site", "order.confirm", "order.submit", "order.review", "order.transition"),
        "crew_assignment" to binding("id", "crew_assignment.acknowledge", "crew_assignment.decline", "crew_assignment.expire", "crew_assignment.start", "dispatch.reschedule"),
        "material_request" to binding("requestId", "request.submit", "request.approve", "request.close", "request.ack"),
        "material_request_batch" to binding("batchRequestId", "request.batch.submit", "request.batch.approve", "request.batch.close"),
        "purchase_requisition" to binding("requisitionId", "procurement.approve", "procurement.order"),
        "purchase_order" to binding("orderId", "procurement.confirm_delivery", "procurement.receive", "procurement.close"),
        "goods_receipt" to binding("receiptId", "procurement.reconcile"),
        "timesheet" to binding("timesheetId", "timesheet.review", "timesheet.lock", "timesheet.correction", "timesheet.correction.bulk"),
        "trip" to binding("tripId", "trip.destination", "trip.stop", "trip.resume", "trip.arrive", "trip.end", "trip.approve"),
        "payout" to binding("payoutId", "payout.submit", "payout.cancel", "payout.approve", "payout.record", "payout.ack", "payout.ack_amend", "payout.reconcile", "payout.reverse"),
        "report" to binding("reportId", "report.refresh", "report.review", "report.approve", "report.publish", "report.revise"),
        "report_version" to binding("reportVersionId", "report.delivered", "report.ack"),
        "issue" to binding("id", "issue.submit", "issue.qualify", "issue.link_work", "issue.resolve", "issue.reopen")
    )
    fun supports(kind: String) = kind in bindings
    fun kind(command: String) = bindings.entries.firstOrNull { command in it.value.commands }?.key
    fun field(kind: String, command: String): String? = bindings[kind]?.takeIf { command in it.commands }?.field
    fun snapshotFields(kind: String): Set<String> = when (kind) {
        "quote" -> setOf("quoteVersion")
        "crew_assignment" -> setOf("employeeId", "scheduleVersion")
        else -> emptySet()
    }
}
