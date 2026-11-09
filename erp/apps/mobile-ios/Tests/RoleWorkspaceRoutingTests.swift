import XCTest
@testable import KNABADE

final class RoleWorkspaceRoutingTests: XCTestCase {
    private func actor(_ roles: [String], _ grants: [String]) -> ERPActor {
        ERPActor(userId: "fixture-user", companyId: "fixture-company", roles: roles,
                 permissions: grants, siteIds: nil, customerIds: nil)
    }

    func testSingleRoleSelectsOnlyAuthorizedWorkspace() {
        XCTAssertEqual(ERPWorkspaceRoute.available(actor(["CLIENT"], ["customer.portal"])), [.client])
    }

    func testUnknownRoleDoesNotBecomeOwnerEvenWithWildcard() {
        XCTAssertTrue(ERPWorkspaceRoute.available(actor(["UNRECOGNIZED"], ["*"])).isEmpty)
    }

    func testMissingGrantCannotCreateOwnerWorkspace() {
        XCTAssertTrue(ERPWorkspaceRoute.available(actor(["OWNER"], ["task.read"])).isEmpty)
    }

    func testMultipleRolesRequireChooser() {
        XCTAssertEqual(ERPWorkspaceRoute.available(actor(["CLIENT", "WORKER"],
            ["customer.portal", "task.read"])), [.client, .worker])
    }

    func testRevocationRemovesPreviouslyAvailableWorkspace() {
        XCTAssertEqual(ERPWorkspaceRoute.available(actor(["WORKER"], ["task.read"])), [.worker])
        XCTAssertTrue(ERPWorkspaceRoute.available(actor(["WORKER"], ["chat.read"])).isEmpty)
    }

    @MainActor func testModelReconcilesSelectionAfterPermissionChange() {
        let model = ERPConsoleModel()
        model.updateWorkspaceRoute(actor(["CLIENT"], ["customer.portal"]))
        XCTAssertEqual(model.selectedWorkspace, .client)
        model.updateWorkspaceRoute(actor(["CLIENT", "WORKER"], ["customer.portal", "task.read"]))
        XCTAssertEqual(model.selectedWorkspace, .client)
        model.updateWorkspaceRoute(actor(["WORKER"], ["task.read"]))
        XCTAssertEqual(model.selectedWorkspace, .worker)
        model.updateWorkspaceRoute(actor(["WORKER"], []))
        XCTAssertNil(model.selectedWorkspace)
        XCTAssertTrue(model.availableWorkspaces.isEmpty)
    }
}
