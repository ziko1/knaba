package de.knaba.mobile;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class RoleWorkspaceRoutingTest {
    @Test public void singleClientOpensClientWorkspace() {
        assertEquals(new RoleWorkspaceRouting.Destination.Open(RoleWorkspaceRouting.Workspace.CLIENT),
            RoleWorkspaceRouting.INSTANCE.route(List.of("CLIENT"), List.of("customer.portal")));
    }
    @Test public void noPermissionNeverGrantsRole() {
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("OWNER"), List.of("task.read")));
    }
    @Test public void unknownRoleNeverGrantsAccess() {
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("SUPER_ADMIN"), List.of("*")));
    }
    @Test public void multipleRolesRequireExplicitChoice() {
        var result = RoleWorkspaceRouting.INSTANCE.route(
            List.of("CLIENT", "WORKER"), List.of("customer.portal", "task.read"));
        assertEquals(new RoleWorkspaceRouting.Destination.Choose(
            List.of(RoleWorkspaceRouting.Workspace.CLIENT, RoleWorkspaceRouting.Workspace.WORKER)), result);
    }
    @Test public void proposedPartnerRoleCannotCreateUnverifiedWorkspace() {
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("PARTNER"), List.of("customer.portal", "lead.manage_own")));
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("PARTNER"), List.of("*")));
    }
    @Test public void wildcardPermissionDoesNotInventRole() {
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of(), List.of("*")));
    }
    @Test public void canonicalSiteSupervisorRoleIsRecognized() {
        assertEquals(new RoleWorkspaceRouting.Destination.Open(RoleWorkspaceRouting.Workspace.BAULEITER),
            RoleWorkspaceRouting.INSTANCE.route(List.of("INTERNAL_BAULEITER"), List.of("crew.assign")));
    }
    @Test public void directorRequiresActualPermission() {
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("DIRECTOR"), List.of("chat.read")));
    }
    @Test public void duplicateAliasesNeverCreateDuplicateWorkspace() {
        assertEquals(new RoleWorkspaceRouting.Destination.Open(RoleWorkspaceRouting.Workspace.CLIENT),
            RoleWorkspaceRouting.INSTANCE.route(List.of("CLIENT", "CUSTOMER"), List.of("customer.portal")));
    }
    @Test public void wildcardPermissionStillNeedsRecognizedRole() {
        assertEquals(new RoleWorkspaceRouting.Destination.Open(RoleWorkspaceRouting.Workspace.WORKER),
            RoleWorkspaceRouting.INSTANCE.route(List.of("EMPLOYEE"), List.of("task.*")));
    }
    @Test public void removedGrantCannotReusePreviousSelection() {
        var initial = RoleWorkspaceRouting.INSTANCE.route(List.of("WORKER"), List.of("task.read"));
        assertEquals(new RoleWorkspaceRouting.Destination.Open(RoleWorkspaceRouting.Workspace.WORKER), initial);
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("WORKER"), List.of("chat.read")));
    }
    @Test public void revokedPermissionRemovesWorkspace() {
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("BAULEITER"), List.of("task.read")));
    }
    @Test public void canonicalSupervisorsCanUseTheirOwnServerGrants() {
        var result = new RoleWorkspaceRouting.Destination.Open(RoleWorkspaceRouting.Workspace.BAULEITER);
        assertEquals(result, RoleWorkspaceRouting.INSTANCE.route(List.of("INTERNAL_BAULEITER"), List.of("task.assign")));
        assertEquals(result, RoleWorkspaceRouting.INSTANCE.route(List.of("EXTERNAL_BAULEITER"), List.of("customer.portal")));
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("INTERNAL_BAULEITER"), List.of("customer.portal")));
    }

    @Test public void specialistRolesRequireTheirOwnGrantsAndShareOneStaffWorkspace() {
        var result = new RoleWorkspaceRouting.Destination.Open(RoleWorkspaceRouting.Workspace.STAFF);
        assertEquals(result, RoleWorkspaceRouting.INSTANCE.route(
            List.of("ACCOUNTANT", "STOREKEEPER"), List.of("finance.accountant", "inventory.read")));
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("STOREKEEPER"), List.of("finance.accountant")));
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("GUEST", "SERVICE_ACCOUNT"), List.of("*")));
    }
}
