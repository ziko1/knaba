package de.knaba.mobile

/**
 * Presentation-only workspace selection. Server-side ERP scopes remain authoritative.
 * Unknown roles and absent permissions never produce an accessible workspace.
 */
internal object RoleWorkspaceRouting {
    enum class Workspace { CLIENT, WORKER, PARTNER, BAULEITER, OWNER }
    sealed interface Destination {
        data object NoAccess : Destination
        data class Open(val workspace: Workspace) : Destination
        data class Choose(val workspaces: List<Workspace>) : Destination
    }

    private val roleNames = mapOf(
        "CLIENT" to Workspace.CLIENT, "CUSTOMER" to Workspace.CLIENT,
        "WORKER" to Workspace.WORKER, "EMPLOYEE" to Workspace.WORKER, "TEAM_LEADER" to Workspace.WORKER,
        "PARTNER" to Workspace.PARTNER,
        "BAULEITER" to Workspace.BAULEITER, "SITE_MANAGER" to Workspace.BAULEITER,
        "INTERNAL_BAULEITER" to Workspace.BAULEITER, "EXTERNAL_BAULEITER" to Workspace.BAULEITER,
        "OWNER" to Workspace.OWNER, "DIRECTOR" to Workspace.OWNER
    )
    private val required = mapOf(
        Workspace.CLIENT to listOf("customer.portal"),
        Workspace.WORKER to listOf("task.read", "shift.read"),
        Workspace.PARTNER to listOf("lead.manage_own", "customer.portal"),
        Workspace.BAULEITER to listOf("crew.assign", "dispatch.manage"),
        Workspace.OWNER to listOf("identity.manage", "operations.read")
    )
    private fun permitted(grants: Set<String>, permission: String): Boolean =
        grants.any { it == "*" || it == permission ||
            (it.endsWith(".*") && permission.startsWith(it.dropLast(1))) }

    fun destinations(roles: Collection<String>, permissions: Collection<String>): List<Workspace> {
        val grants = permissions.toSet()
        return roles.mapNotNull { roleNames[it.trim().uppercase(java.util.Locale.ROOT)] }
            .distinct()
            .filter { workspace -> required.getValue(workspace).any { permitted(grants, it) } }
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
