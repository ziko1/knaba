import XCTest
@testable import KNABADE

final class ERPRecordActionsTests: XCTestCase {
    private func actor(_ permissions: [String] = ["commerce.manage"], user: String = "worker-a", company: String = "company-a") -> ERPActor {
        ERPActor(userId: user, companyId: company, roles: ["OWNER"], permissions: permissions, siteIds: [], customerIds: [])
    }
    // Pure converter/shortcut fixtures; actual API schemas and permissions are checked by native-console-contract.test.ts.
    private func command(_ name: String, field: String = "id", extra: [String: Any] = [:], required: [String] = []) throws -> ERPCommand {
        var properties: [String: Any] = [field: ["type": "string"]]
        for (key, value) in extra { properties[key] = value }
        let object: [String: Any] = ["name": name, "permission": "commerce.manage", "highRisk": true,
                                   "schema": ["type": "object", "properties": properties, "required": [field] + required]]
        return try JSONDecoder().decode(ERPCommand.self, from: JSONSerialization.data(withJSONObject: object))
    }
    private func record(_ kind: String, version: Int = 7, data: [String: Any] = [:]) throws -> ERPItem {
        try JSONDecoder().decode(ERPItem.self, from: JSONSerialization.data(withJSONObject: [
            "id": "record-a", "kind": kind, "version": version, "data": data
        ]))
    }
    private func object(_ bytes: Data) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
    }

    func testQuoteContextPinsRecordAndQuoteVersionOverEditableDraft() throws {
        let action = try command("quote.accept", extra: ["quoteVersion": ["type": "integer"], "acceptanceEvidence": ["type": "string"]], required: ["quoteVersion"])
        let context = try XCTUnwrap(ERPRecordActions.context(for: record("quote", data: ["quoteVersion": 3]), command: action, actor: actor()))
        let payload = try object(ERPRecordActions.payload(context, command: action, actor: actor(), fields: ["id": "foreign-record", "quoteVersion": "88", "acceptanceEvidence": "Customer confirmation"]))
        XCTAssertEqual(payload["id"] as? String, "record-a")
        XCTAssertEqual(payload["quoteVersion"] as? Int, 3)
        XCTAssertEqual(context.record.version, 7)
        XCTAssertEqual(payload["acceptanceEvidence"] as? String, "Customer confirmation")
    }


    func testCrewContextPinsEmployeeAndScheduleAndCannotBeUsedByAnotherActor() throws {
        let action = try command("crew_assignment.acknowledge", extra: ["employeeId": ["type": "string"], "scheduleVersion": ["type": "integer"]], required: ["employeeId", "scheduleVersion"])
        let context = try XCTUnwrap(ERPRecordActions.context(for: record("crew_assignment", data: ["employeeId": "employee-a", "scheduleVersion": 6]), command: action, actor: actor()))
        XCTAssertEqual(context.fixedFields, ["id": "record-a", "employeeId": "employee-a", "scheduleVersion": "6"])
        XCTAssertNoThrow(try ERPRecordActions.validate(context, command: action, actor: actor()))
        XCTAssertThrowsError(try ERPRecordActions.validate(context, command: action, actor: actor(user: "worker-b")))
        XCTAssertThrowsError(try ERPRecordActions.validate(context, command: action, actor: actor(company: "company-b")))
        XCTAssertThrowsError(try ERPRecordActions.validate(context, command: action, actor: actor([])))
    }


    func testRoleNameAloneNeverEnablesActionAndTaskTransitionsUseObservedState() throws {
        let start = try command("task.start", field: "taskId")
        let work = try command("task.worklog", field: "taskId")
        let submit = try command("task.submit", field: "taskId")
        let assigned = try record("task", data: ["state": "ASSIGNED"])
        let progress = try record("task", data: ["state": "IN_PROGRESS"])
        XCTAssertNil(ERPRecordActions.context(for: assigned, command: start, actor: actor([])))
        XCTAssertNil(ERPRecordActions.context(for: assigned, command: start, actor: actor(["commerce.*"])))
        XCTAssertNil(ERPRecordActions.context(for: assigned, command: start, actor: actor(["*"])))
        XCTAssertNotNil(ERPRecordActions.context(for: assigned, command: start, actor: actor()))
        XCTAssertNil(ERPRecordActions.context(for: assigned, command: submit, actor: actor()))
        XCTAssertNil(ERPRecordActions.context(for: progress, command: start, actor: actor()))
        XCTAssertNotNil(ERPRecordActions.context(for: progress, command: work, actor: actor()))
        XCTAssertNotNil(ERPRecordActions.context(for: progress, command: submit, actor: actor()))
        XCTAssertNil(ERPRecordActions.context(for: try record("task", data: ["state": "SUBMITTED_FOR_REVIEW"]), command: submit, actor: actor()))
    }


    func testWrongKindOrPrimarySchemaOrInvalidVersionCannotCreateShortcut() throws {
        let action = try command("order.confirm")
        XCTAssertNil(ERPRecordActions.context(for: try record("quote"), command: action, actor: actor()))
        XCTAssertNil(ERPRecordActions.context(for: try record("order", version: 0), command: action, actor: actor()))
        XCTAssertNil(ERPRecordActions.context(for: try record("order"), command: try command("order.confirm", field: "wrongId"), actor: actor()))
        XCTAssertNil(ERPRecordActions.context(for: try record("order"), command: try command("order.confirm", extra: ["id": ["type": "integer"]]), actor: actor()))
        XCTAssertNil(ERPRecordActions.context(for: try record("order"), command: ERPCommand(name: "order.confirm", permission: "commerce.manage", highRisk: true, schema: nil), actor: actor()))
    }


    func testMissingOrNonIntegralSnapshotNeverBecomesEditableVersion() throws {
        let action = try command("quote.accept", extra: ["quoteVersion": ["type": "integer"]], required: ["quoteVersion"])
        let samples: [[String: Any]] = [[:], ["quoteVersion": 0], ["quoteVersion": -1], ["quoteVersion": 1.5], ["quoteVersion": "3"], ["quoteVersion": true]]
        for data in samples {
            XCTAssertNil(ERPRecordActions.context(for: try record("quote", data: data), command: action, actor: actor()))
        }
    }


    func testChangedCommandCannotReuseAnEarlierRecordContext() throws {
        let action = try command("quote.accept", extra: ["quoteVersion": ["type": "integer"]], required: ["quoteVersion"])
        let context = try XCTUnwrap(ERPRecordActions.context(for: record("quote", data: ["quoteVersion": 2]), command: action, actor: actor()))
        XCTAssertThrowsError(try ERPRecordActions.validate(context, command: command("quote.reject"), actor: actor()))
        let changed = try command("quote.accept", extra: ["quoteVersion": ["type": "string"]], required: ["quoteVersion"])
        XCTAssertThrowsError(try ERPRecordActions.validate(context, command: changed, actor: actor()))
    }


    func testLabelsKeepCanonicalCommandsOutOfKnownUserActionsInAllSixLanguages() {
        for language in NativeLanguage.allCases {
            XCTAssertNotEqual(ERPActionLabels.title("quote.accept", language: language), "quote.accept")
            XCTAssertNotEqual(ERPActionLabels.title("task.worklog", language: language), "task.worklog")
            XCTAssertNotEqual(ERPActionLabels.field("quantityMilli", language: language), "quantityMilli")
            XCTAssertNotEqual(ERPActionLabels.title("request.submit", language: language, includeModule: true),
                              ERPActionLabels.title("request.batch.submit", language: language, includeModule: true))
        }
        XCTAssertEqual(ERPActionLabels.title("quote.accept", language: .de), ERPStrings.text(.actionAccept, .de))
        XCTAssertEqual(ERPActionLabels.title("unknown.command", language: .uk), "unknown.command")
    }
    func testExistingBlockedReopenedChecklistAndReviewActionsRemainAvailable() throws {
        let names = ["task.start", "task.worklog", "task.checklist", "task.submit", "task.review"]
        let catalog = try names.map { try command($0, field: "taskId") }
        for state in ["BLOCKED", "REOPENED"] {
            let item = try record("task", data: ["state": state])
            XCTAssertEqual(catalog.filter { ERPRecordActions.context(for: item, command: $0, actor: actor()) != nil }.map(\.name),
                           ["task.start", "task.worklog", "task.checklist"])
        }
        let review = try record("task", data: ["state": "SUBMITTED_FOR_REVIEW"])
        XCTAssertEqual(catalog.filter { ERPRecordActions.context(for: review, command: $0, actor: actor()) != nil }.map(\.name), ["task.review"])
        let completed = try record("task", data: ["state": "ACCEPTED"])
        XCTAssertTrue(catalog.allSatisfy { ERPRecordActions.context(for: completed, command: $0, actor: actor()) == nil })
    }

    func testFixedFieldsCannotBeClearedWhileOtherNullableFieldsKeepTheirSemantics() throws {
        let action = try command("quote.accept", extra: ["quoteVersion": ["type": "integer"], "note": ["type": ["string", "null"]]], required: ["quoteVersion"])
        let context = try XCTUnwrap(ERPRecordActions.context(for: record("quote", data: ["quoteVersion": 3]), command: action, actor: actor()))
        for key in ["id", "quoteVersion"] {
            XCTAssertThrowsError(try ERPRecordActions.payload(context, command: action, actor: actor(), fields: [:], nullFields: [key]))
        }
        let payload = try object(ERPRecordActions.payload(context, command: action, actor: actor(), fields: [:], nullFields: ["note"]))
        XCTAssertTrue(payload["note"] is NSNull)
        XCTAssertEqual(payload["id"] as? String, "record-a")
        XCTAssertEqual(payload["quoteVersion"] as? Int, 3)
        XCTAssertThrowsError(try ERPRecordActions.payload(context, command: action, actor: actor([]), fields: [:]))
    }

}
