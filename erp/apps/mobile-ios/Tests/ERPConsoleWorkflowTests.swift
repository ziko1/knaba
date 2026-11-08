import XCTest
@testable import KNABADE

final class ERPConsoleWorkflowTests: XCTestCase {
    private func actor(roles: [String], permissions: [String]) -> ERPActor {
        ERPActor(userId: "user", companyId: "company", roles: roles, permissions: permissions, siteIds: [], customerIds: [])
    }
    private func command(_ schema: String, name: String = "task.worklog") throws -> ERPCommand {
        let field = try JSONDecoder().decode(ERPField.self, from: Data(schema.utf8))
        return ERPCommand(name: name, permission: "task.work", highRisk: false, schema: field)
    }
    func testOwnerAndWildcardClaimsDoNotInventServerPermissions() {
        for permissions in [[], ["*"], ["site.*"]] {
            let rows = ERPWorkspacePolicy.modules(for: actor(roles: ["OWNER"], permissions: permissions))
            XCTAssertEqual(rows.map(\.id), ["notification"])
        }
        XCTAssertTrue(ERPWorkspacePolicy.modules(for: actor(roles: [], permissions: ["site.read"])).contains { $0.id == "site" })
    }
    func testClientCanReachPublishedPortalRecordsButNotInternalData() {
        for role in ["CLIENT", "EXTERNAL_BAULEITER"] {
            let ids = Set(ERPWorkspacePolicy.modules(for: actor(roles: [role], permissions: ["chat.read", "issue.read"])).map(\.id))
            XCTAssertTrue(Set(["site", "order", "quote", "report", "report_version", "channel", "issue", "notification"]).isSubset(of: ids))
            XCTAssertTrue(ids.isDisjoint(with: ["employee", "presence", "task", "decision", "bot_config"]))
        }
    }
    func testWorkersCanReachOwnOffersAndNotifications() {
        let ids = ERPWorkspacePolicy.modules(for: actor(roles: ["EMPLOYEE"], permissions: ["dispatch.acknowledge", "task.read", "identity.self"])).map(\.id)
        XCTAssertTrue(ids.contains("crew_assignment")); XCTAssertTrue(ids.contains("notification"))
        XCTAssertFalse(ids.contains("employee"))
    }
    func testVersionCannotSilentlyDisableOptimisticConcurrency() throws {
        XCTAssertNil(try ERPCommandInput.version(" "))
        XCTAssertEqual(try ERPCommandInput.version(" 12 "), 12)
        for value in ["0", "-1", "1.5", "abc", "1e3", "9007199254740992", "9999999999999999999999"] {
            XCTAssertThrowsError(try ERPCommandInput.version(value), value)
        }
    }
    func testPasswordsRetainExactWhitespaceAndDoNotBecomeNumeric() throws {
        let cmd = try command(#"{"type":"object","properties":{"currentPassword":{"type":"string"},"newPassword":{"type":"string"}},"required":["currentPassword","newPassword"]}"#, name: "user.password.rotate")
        let data = try ERPCommandInput.payload(command: cmd, fields: ["currentPassword": " pass with spaces ", "newPassword": " 1234567890 "])
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
        XCTAssertEqual(body["currentPassword"], " pass with spaces ")
        XCTAssertEqual(body["newPassword"], " 1234567890 ")
    }
    func testFormRejectsInvalidTypeBoundsEnumsAndUnsafeInteger() throws {
        let cmd = try command(#"{"type":"object","properties":{"quantityMilli":{"type":"integer","minimum":0,"maximum":5000},"state":{"type":"string","enum":["ACCEPT","REJECT"]},"checked":{"type":"boolean"}},"required":["quantityMilli","state"]}"#)
        let valid = try ERPCommandInput.payload(command: cmd, fields: ["quantityMilli": "2500", "state": "ACCEPT", "checked": "false"])
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: valid) as? [String: Any])
        XCTAssertEqual(body["quantityMilli"] as? Int, 2500); XCTAssertEqual(body["checked"] as? Bool, false)
        for invalid in ["2.5", "-1", "5001", "9007199254740992", "nan"] {
            XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: ["quantityMilli": invalid, "state": "ACCEPT"]))
        }
        XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: ["quantityMilli": "1", "state": "UNKNOWN"]))
        XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: ["quantityMilli": "1", "state": "ACCEPT", "checked": "yes"]))
    }
    func testQuantityConversionIsExactAndNeverSilentlyRounds() throws {
        for (input, expected) in [("2.5", "2500"), ("2,005", "2005"), ("0", "0"), ("0.001", "1"), ("12.340", "12340")] {
            XCTAssertEqual(try ERPCommandInput.milliQuantity(input), expected)
        }
        for invalid in ["1.0001", "1e3", "-2", "1,234.5", "1.", ".5", "9007199254741", "9007199254740.992"] {
            XCTAssertThrowsError(try ERPCommandInput.milliQuantity(invalid), invalid)
        }
    }
    func testTaskActionsRequireActualServerCatalogAndState() throws {
        let schema = #"{"type":"object","properties":{"taskId":{"type":"string"}},"required":["taskId"]}"#
        let catalog = try ["task.start", "task.worklog", "task.submit", "task.review"].map { try command(schema, name: $0) }
        let item = try JSONDecoder().decode(ERPItem.self, from: Data(#"{"id":"task","kind":"task","version":4,"data":{"state":"ASSIGNED"}}"#.utf8))
        XCTAssertEqual(ERPWorkspacePolicy.taskActions(for: item, catalog: catalog).map(\.name), ["task.start"])
        XCTAssertTrue(ERPWorkspacePolicy.taskActions(for: item, catalog: []).isEmpty)
    }
    func testStructuredReportResultsAreReadableAndSecretsFilteredAtEveryDepth() throws {
        let result = try JSONDecoder().decode(ERPField.self, from: Data(#"{"snapshot":{"site":{"name":"Berlin"},"checklist":[{"label":"Windows","checked":true}],"passwordHash":"hidden"},"token":"private"}"#.utf8))
        let rows = ERPDisplayRows.flatten(try XCTUnwrap(result.dictionary))
        XCTAssertTrue(rows.contains { $0.value == "Berlin" })
        XCTAssertTrue(rows.contains { $0.value == "Windows" })
        XCTAssertTrue(rows.contains { $0.value == "true" })
        XCTAssertFalse(rows.contains { $0.value == "hidden" || $0.value == "private" })
    }
}
