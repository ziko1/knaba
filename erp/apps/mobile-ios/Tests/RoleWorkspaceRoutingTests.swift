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

    func testSpecialistsAndBauleiterReachPermissionScopedWorkspaces() {
        let specialists = [("OPERATIONS_MANAGER", "operations.read"), ("DISPATCHER", "dispatch.manage"),
            ("QUALITY_CONTROL", "quality.manage"), ("STOREKEEPER", "inventory.read"), ("PROCUREMENT", "procurement.read"),
            ("ACCOUNTANT", "finance.accountant"), ("BOT_ADMIN", "bot.manage"), ("AUDITOR", "audit.read"),
            ("DEVELOPER_SUPPORT", "integration.status")]
        for (role, grant) in specialists {
            XCTAssertEqual(ERPWorkspaceRoute.available(actor([role], [grant])), [.staff], role)
            XCTAssertTrue(ERPWorkspaceRoute.available(actor([role], [])).isEmpty, role)
        }
        XCTAssertEqual(ERPWorkspaceRoute.available(actor(["INTERNAL_BAULEITER"], ["site.read"])), [.bauleiter])
        XCTAssertEqual(ERPWorkspaceRoute.available(actor(["EXTERNAL_BAULEITER"], ["customer.portal"])), [.bauleiter])
        XCTAssertTrue(ERPWorkspaceRoute.available(actor(["GUEST", "SERVICE_ACCOUNT"], ["*"])).isEmpty)
        for language in NativeLanguage.allCases {
            let titles = ERPWorkspaceRoute.allCases.map { ERPStrings.text($0.title, language) }
            XCTAssertEqual(Set(titles).count, titles.count, language.rawValue)
        }
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
