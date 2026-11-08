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
    @Test public void wildcardPermissionDoesNotInventRole() {
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of(), List.of("*")));
    }
    @Test public void revokedPermissionRemovesWorkspace() {
        assertEquals(RoleWorkspaceRouting.Destination.NoAccess.INSTANCE,
            RoleWorkspaceRouting.INSTANCE.route(List.of("BAULEITER"), List.of("task.read")));
    }
}
