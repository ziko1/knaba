import XCTest
@testable import KNABADE

final class ERPRecordActionsTests: XCTestCase {
    private func actor(_ permissions: [String] = ["*"], user: String = "worker-a", company: String = "company-a") -> ERPActor {
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
        let payload = try object(ERPCommandInput.data(command: action, fields: ["id": "foreign-record", "quoteVersion": "88", "acceptanceEvidence": "Customer confirmation"], fixed: context.fixedFields))
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
        XCTAssertNotNil(ERPRecordActions.context(for: assigned, command: start, actor: actor(["commerce.*"])))
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

    func testQuantitiesConvertExactDisplayedUnitsIncludingCommaAndNegativeCorrection() throws {
        for (text, expected) in [("0.001", 1), ("1,250", 1250), ("12", 12000), ("-0.001", -1), ("9007199254740.991", 9_007_199_254_740_991)] {
            XCTAssertEqual(try ERPCommandInput.quantityMilli(text), expected)
            XCTAssertEqual(try ERPCommandInput.quantityMilli(ERPCommandInput.quantityText(expected)), expected)
        }
        let action = try command("task.worklog", field: "taskId", extra: ["quantityMilli": ["type": "integer", "minimum": 1, "maximum": 2500]], required: ["quantityMilli"])
        let payload = try object(ERPCommandInput.data(command: action, fields: ["taskId": "task-a", "quantityMilli": "2,5"]))
        XCTAssertEqual(payload["quantityMilli"] as? Int, 2500)
        for invalid in ["0", "-1", "2.501"] {
            XCTAssertThrowsError(try ERPCommandInput.data(command: action, fields: ["taskId": "task-a", "quantityMilli": invalid]))
        }
    }

    func testQuantityPrecisionOverflowAndScientificNotationAreRejected() {
        for invalid in ["", "1.0001", "1e3", "NaN", "Infinity", "1,2.3", "1 000", "9007199254740.992", "99999999999999999999", ".5", "--1"] {
            XCTAssertThrowsError(try ERPCommandInput.quantityMilli(invalid), invalid)
        }
    }

    func testRequiredEnumBooleanAndJsonTypesAreValidatedBeforeCommand() throws {
        let action = try command("order.review", extra: ["decision": ["type": "string", "enum": ["APPROVE", "REWORK"]], "approved": ["type": "boolean"], "details": ["type": "object"], "ids": ["type": "array"]], required: ["decision", "approved"])
        let fields = ["id": "record-a", "decision": "APPROVE", "approved": "false", "details": "{\"note\":\"OK\"}", "ids": "[\"a\"]"]
        let payload = try object(ERPCommandInput.data(command: action, fields: fields))
        XCTAssertEqual(payload["approved"] as? Bool, false)
        XCTAssertEqual(payload["ids"] as? [String], ["a"])
        for (key, value) in [("decision", "ESCALATE"), ("decision", ""), ("approved", "yes"), ("details", "[]"), ("ids", "{}"), ("id", "")] {
            var invalid = fields; invalid[key] = value
            XCTAssertThrowsError(try ERPCommandInput.data(command: action, fields: invalid))
        }
    }

    func testDefaultsPreserveIntegerBooleanAndQuantityMeaning() throws {
        let action = try command("task.worklog", field: "taskId", extra: [
            "quantityMilli": ["type": "integer", "default": 1250],
            "quoteVersion": ["type": "integer", "default": 4],
            "approved": ["type": "boolean", "default": false],
            "ids": ["type": "array", "default": ["a"]]
        ])
        let values = ERPCommandInput.defaultFields(action)
        XCTAssertEqual(values["quantityMilli"], "1.25")
        XCTAssertEqual(values["quoteVersion"], "4")
        XCTAssertEqual(values["approved"], "false")
        var fields = values; fields["taskId"] = "task-a"
        let payload = try object(ERPCommandInput.data(command: action, fields: fields))
        XCTAssertEqual(payload["quantityMilli"] as? Int, 1250)
        XCTAssertEqual(payload["ids"] as? [String], ["a"])
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
}
