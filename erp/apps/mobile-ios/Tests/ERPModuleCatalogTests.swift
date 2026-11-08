import XCTest
@testable import KNABADE

final class ERPModuleCatalogTests: XCTestCase {
    private func actor(_ roles: [String], _ permissions: [String]) -> ERPActor {
        ERPActor(userId: "synthetic-user", companyId: "synthetic-company", roles: roles,
                 permissions: permissions, siteIds: [], customerIds: [])
    }
    private func kinds(_ roles: [String], _ permissions: [String]) -> Set<String> {
        Set(ERPModuleCatalog.visible(to: actor(roles, permissions)).map(\.id))
    }

    @MainActor func testOwnerRoleAloneDoesNotRevealFinanceGPSOrAnyGrantedModule() {
        let model = ERPConsoleModel()
        model.identity = ERPIdentity(actor: actor(["OWNER"], []), user: ERPUser(id: "synthetic-user", name: nil, email: nil), csrfToken: "csrf", mode: "TEST")
        XCTAssertTrue(model.modules.isEmpty)
        XCTAssertFalse(model.isOperator)
        XCTAssertTrue(kinds(["OWNER", "DIRECTOR", "ACCOUNTANT"], []).isEmpty)
    }

    func testClientDiscoversOwnOrderQuoteReportAndFileAreasWithoutInternalData() {
        let visible = kinds(["CLIENT"], ["customer.portal", "quote.read", "chat.read", "report.read", "report.acknowledge", "issue.read", "media.read"])
        XCTAssertTrue(Set(["site", "order", "quote", "change_order", "channel", "report", "report_version", "issue", "media_asset"]).isSubset(of: visible))
        XCTAssertTrue(visible.isDisjoint(with: ["payout", "payroll_calculation", "official_payslip", "presence", "employee", "stock_location", "user"]))
    }

    func testAccountantDiscoversFinanceAndApprovedTimeWithoutChatOrPreciseLocation() {
        let visible = kinds(["ACCOUNTANT"], ["finance.accountant"])
        XCTAssertEqual(visible, Set(["shift", "timesheet", "payroll_calculation", "official_payslip", "payout", "receipt"]))
        XCTAssertTrue(visible.isDisjoint(with: ["channel", "presence", "user"]))
    }

    func testStorekeeperAndProcurementSeeStockAndPurchasingWithoutFinance() {
        let visible = kinds(["STOREKEEPER", "PROCUREMENT"], ["inventory.read", "procurement.read"])
        XCTAssertEqual(visible, Set(["material", "material_request", "material_request_batch", "stock_location", "stock_reservation", "stock_movement", "supplier", "purchase_requisition", "purchase_order", "goods_receipt"]))
        XCTAssertFalse(visible.contains("payroll_calculation"))
    }

    func testSiteSupervisorAndExplicitCommercialGrantsDiscoverServerReadableRecords() {
        // Engine.visible permits internal order reads through site.read, including a scoped Bauleiter.
        XCTAssertEqual(kinds(["INTERNAL_BAULEITER"], ["site.read"]), Set(["site", "order"]))
        for permission in ["commerce.manage", "commerce.read", "dispatch.manage", "customer.manage", "customer.read", "lead.manage"] {
            let visible = kinds([], [permission])
            XCTAssertTrue(Set(["lead", "quote", "change_order", "customer"]).isSubset(of: visible), permission)
            XCTAssertTrue(visible.isDisjoint(with: ["payroll_calculation", "payout", "presence", "user"]), permission)
        }
    }

    func testCanonicalProcurementGrantsDiscoverTheSameScopedPurchasingAreas() {
        let purchasing: Set<String> = ["supplier", "purchase_requisition", "purchase_order", "goods_receipt"]
        for permission in ["procurement.read", "procurement.manage", "procurement.request", "procurement.order", "procurement.approve"] {
            XCTAssertEqual(kinds([], [permission]), purchasing, permission)
        }
        XCTAssertTrue(kinds(["PROCUREMENT"], []).isEmpty)
    }

    func testWorkerSelfPermissionsAndReceiptPermissionRemainDistinct() {
        let worker = kinds(["EMPLOYEE"], ["task.read", "shift.manage", "trip.manage", "payroll.self", "chat.read"])
        XCTAssertTrue(Set(["task", "defect", "worklog", "shift", "trip", "channel", "payroll_calculation", "official_payslip", "payout", "receipt"]).isSubset(of: worker))
        XCTAssertFalse(worker.contains("user")); XCTAssertFalse(worker.contains("presence"))
        XCTAssertEqual(kinds(["EMPLOYEE"], ["finance.payout.ack"]), Set(["payout", "receipt"]))
    }

    func testExplicitPermissionWildcardsHaveBoundedNamespaceMatching() {
        XCTAssertEqual(kinds([], ["inventory.*"]), kinds([], ["inventory.read"]))
        XCTAssertTrue(kinds(["OWNER"], ["financee.*"]).isEmpty)
        XCTAssertEqual(kinds([], ["*"]).count, 40)
        XCTAssertEqual(Set(ERPModuleCatalog.items.map(\.id)).count, ERPModuleCatalog.items.count)
    }

    func testSharedVehicleNavigationRequiresAnExplicitServerReadCapability() {
        for permission in ["trip.read", "dispatch.manage", "trip.approve"] {
            XCTAssertTrue(kinds(["EMPLOYEE"], [permission]).contains("vehicle_trip"), permission)
        }
        XCTAssertFalse(kinds(["EMPLOYEE"], ["trip.manage"]).contains("vehicle_trip"))
        XCTAssertFalse(kinds(["CLIENT"], ["customer.portal"]).contains("vehicle_trip"))
        XCTAssertFalse(kinds(["OWNER"], []).contains("vehicle_trip"))
    }
}
