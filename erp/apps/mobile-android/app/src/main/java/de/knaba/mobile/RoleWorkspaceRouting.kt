package de.knaba.mobile

/**
 * Presentation-only workspace selection. Server-side ERP scopes remain authoritative.
 * Unknown roles and absent permissions never produce an accessible workspace.
 */
internal object RoleWorkspaceRouting {
    enum class Workspace { CLIENT, WORKER, PARTNER, BAULEITER, OWNER, STAFF }
    sealed interface Destination {
        data object NoAccess : Destination
        data class Open(val workspace: Workspace) : Destination
        data class Choose(val workspaces: List<Workspace>) : Destination
    }

    private class Rule(val workspace: Workspace, vararg val grants: String)
    private val client = Rule(Workspace.CLIENT, "customer.portal", "quote.read")
    private val worker = Rule(Workspace.WORKER, "task.read", "shift.read", "trip.read", "inventory.read",
        "dispatch.acknowledge", "payroll.self", "identity.self")
    private val bauleiter = Rule(Workspace.BAULEITER, "crew.assign", "dispatch.manage")
    private val owner = Rule(Workspace.OWNER, "identity.manage", "operations.read", "site.read")
    private val rules = mapOf(
        "CLIENT" to client, "CUSTOMER" to client,
        "WORKER" to worker, "EMPLOYEE" to worker, "TEAM_LEADER" to worker,
        // No canonical ERP PARTNER actor yet: fail closed until server role and scoped grants exist.
        "BAULEITER" to bauleiter, "SITE_MANAGER" to bauleiter,
        "INTERNAL_BAULEITER" to Rule(Workspace.BAULEITER, *bauleiter.grants, "site.read", "task.assign"),
        "EXTERNAL_BAULEITER" to Rule(Workspace.BAULEITER, *bauleiter.grants, "customer.portal"),
        "OWNER" to owner, "DIRECTOR" to owner,
        "OPERATIONS_MANAGER" to Rule(Workspace.STAFF, "operations.read"),
        "DISPATCHER" to Rule(Workspace.STAFF, "dispatch.manage"),
        "QUALITY_CONTROL" to Rule(Workspace.STAFF, "quality.manage"),
        "STOREKEEPER" to Rule(Workspace.STAFF, "inventory.read"),
        "PROCUREMENT" to Rule(Workspace.STAFF, "procurement.read", "procurement.manage"),
        "ACCOUNTANT" to Rule(Workspace.STAFF, "finance.accountant", "finance.payroll", "timesheet.read"),
        "BOT_ADMIN" to Rule(Workspace.STAFF, "bot.manage"),
        "AUDITOR" to Rule(Workspace.STAFF, "audit.read"),
        "DEVELOPER_SUPPORT" to Rule(Workspace.STAFF, "integration.status")
    )

    private fun permitted(grants: Set<String>, permission: String): Boolean =
        "*" in grants || permission in grants || (permission.substringBefore('.') + ".*") in grants

    fun destinations(roles: Collection<String>, permissions: Collection<String>): List<Workspace> {
        val grants = permissions.toSet()
        val available = roles.mapNotNull { rules[it.trim().uppercase(java.util.Locale.ROOT)] }
            .filter { rule -> rule.grants.any { permitted(grants, it) } }
            .map { it.workspace }.toSet()
        return Workspace.entries.filter { it in available }
    }

    fun route(roles: Collection<String>, permissions: Collection<String>): Destination {
        val available = destinations(roles, permissions)
        return when (available.size) {
            0 -> Destination.NoAccess
            1 -> Destination.Open(available.single())
            else -> Destination.Choose(available)
        }
    }
}
