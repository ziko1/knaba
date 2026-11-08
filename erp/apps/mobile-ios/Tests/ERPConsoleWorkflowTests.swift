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
    func testNullableTypeUnionDistinguishesOmissionExplicitNullAndTheStringNull() throws {
        let cmd = try command(#"{"type":"object","properties":{"value":{"type":["string","null"],"enum":["null","keep",null],"default":null}}}"#)
        let omitted = try JSONSerialization.jsonObject(with: ERPCommandInput.payload(command: cmd, fields: [:])) as! [String: Any]
        XCTAssertNil(omitted["value"], "An optional field stays omitted; schema default null is not an instruction to clear it")
        let text = try JSONSerialization.jsonObject(with: ERPCommandInput.payload(command: cmd, fields: ["value": "null"])) as! [String: Any]
        XCTAssertEqual(text["value"] as? String, "null")
        let cleared = try JSONSerialization.jsonObject(with: ERPCommandInput.payload(command: cmd, fields: ["value": "keep"], nullFields: ["value"])) as! [String: Any]
        XCTAssertTrue(cleared["value"] is NSNull, "Only the explicit clear control overrides a draft with JSON null")
    }
    func testActualRequiredNullableSiteResponsibilitiesCanBeClearedExplicitly() throws {
        let cmd = try command(#"{"type":"object","properties":{"siteId":{"type":"string","minLength":1},"geoResponsibleUserId":{"type":["string","null"],"minLength":1},"onCallUserId":{"type":["null","string"],"minLength":1}},"required":["siteId","geoResponsibleUserId","onCallUserId"]}"#, name: "site.geo_responsible.set")
        let fields = ["siteId": "site-a", "onCallUserId": "user-b"]
        XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: fields))
        let body = try JSONSerialization.jsonObject(with: ERPCommandInput.payload(command: cmd, fields: fields, nullFields: ["geoResponsibleUserId"])) as! [String: Any]
        XCTAssertEqual(body["siteId"] as? String, "site-a")
        XCTAssertEqual(body["onCallUserId"] as? String, "user-b")
        XCTAssertTrue(body["geoResponsibleUserId"] is NSNull)
        let both = try JSONSerialization.jsonObject(with: ERPCommandInput.payload(command: cmd, fields: ["siteId": "site-a"], nullFields: ["geoResponsibleUserId", "onCallUserId"])) as! [String: Any]
        XCTAssertTrue(both["geoResponsibleUserId"] is NSNull)
        XCTAssertTrue(both["onCallUserId"] is NSNull)
    }
    func testNullableAnyOfUsesTheNonNullEditorAndPreservesTypedNestedInput() throws {
        let cmd = try command(#"{"type":"object","properties":{"state":{"anyOf":[{"type":"string","enum":["ACCEPT","REJECT"]},{"type":"null"}]},"count":{"anyOf":[{"type":"null"},{"type":"integer","minimum":0,"maximum":3}]},"details":{"anyOf":[{"type":"object","additionalProperties":true},{"type":"null"}]},"entries":{"type":["array","null"]},"checked":{"type":["boolean","null"]},"amount":{"type":["number","null"]}}}"#)
        let properties = try XCTUnwrap(cmd.schema?.dictionary?["properties"]?.dictionary)
        let state = try ERPCommandInput.fieldSchema(XCTUnwrap(properties["state"]?.dictionary))
        XCTAssertEqual(state.type, "string"); XCTAssertTrue(state.allowsNull)
        XCTAssertEqual(state.definition["enum"]?.list?.compactMap { $0.string }, ["ACCEPT", "REJECT"])
        let count = try ERPCommandInput.fieldSchema(XCTUnwrap(properties["count"]?.dictionary))
        XCTAssertEqual(count.type, "integer")
        let fields = ["state": "ACCEPT", "count": "2", "details": #"{"note":"null","nested":null}"#, "entries": #"["null",null]"#, "checked": "false", "amount": "1.5"]
        let body = try JSONSerialization.jsonObject(with: ERPCommandInput.payload(command: cmd, fields: fields)) as! [String: Any]
        XCTAssertEqual(body["state"] as? String, "ACCEPT"); XCTAssertEqual(body["count"] as? Int, 2)
        XCTAssertEqual(body["checked"] as? Bool, false); XCTAssertEqual(body["amount"] as? Double, 1.5)
        let details = try XCTUnwrap(body["details"] as? [String: Any])
        XCTAssertEqual(details["note"] as? String, "null"); XCTAssertTrue(details["nested"] is NSNull)
        let entries = try XCTUnwrap(body["entries"] as? [Any])
        XCTAssertEqual(entries.first as? String, "null"); XCTAssertTrue(entries.last is NSNull)
        XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: ["count": "4"]))
        XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: ["state": "OTHER"]))
        let cleared = try JSONSerialization.jsonObject(with: ERPCommandInput.payload(command: cmd, fields: [:], nullFields: Set(properties.keys))) as! [String: Any]
        XCTAssertEqual(cleared.count, properties.count); XCTAssertTrue(cleared.values.allSatisfy { $0 is NSNull })
    }
    func testClearRejectsUnknownNonNullableAndNullExcludedByEnumOrConst() throws {
        let cmd = try command(#"{"type":"object","properties":{"plain":{"type":"string"},"choice":{"type":["string","null"],"enum":["keep"]},"fixed":{"type":["string","null"],"const":"keep"}}}"#)
        for field in ["missing", "plain", "choice", "fixed"] {
            XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: [:], nullFields: [field]), field) {
                XCTAssertEqual($0 as? ERPFailure, .invalidPayload)
            }
        }
    }
    func testUnsupportedUnionsFailClosedEvenWhenOptionalOrExplicitlyCleared() throws {
        let definitions = [
            #"{"type":["string","integer"]}"#,
            #"{"type":["string","null","null"]}"#,
            #"{"type":["string",null,"null"]}"#,
            #"{"type":["null"]}"#,
            #"{"anyOf":[{"type":"string"},{"type":"number"},{"type":"null"}]}"#,
            #"{"anyOf":[{"type":"string"},{"type":"integer"}]}"#,
            #"{"anyOf":[{"type":"null"},{"type":"null"}]}"#,
            #"{"anyOf":[{"type":["string","null"]},{"type":"null"}]}"#,
            #"{"anyOf":[{"type":"string"},{"type":"null","enum":["null"]}]}"#,
            #"{"oneOf":[{"type":"string"},{"type":"null"}]}"#,
            #"{"type":"string","allOf":[{"type":"string"}]}"#,
            #"{"anyOf":[{"type":"string"},{"type":"null"}],"minLength":1}"#
        ]
        for definition in definitions {
            let cmd = try command("{\"type\":\"object\",\"properties\":{\"value\":\(definition)}}")
            for fields in [[:], ["value": "test"]] as [[String: String]] {
                XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: fields), definition) {
                    XCTAssertEqual($0 as? ERPFailure, .invalidPayload)
                }
            }
            XCTAssertThrowsError(try ERPCommandInput.payload(command: cmd, fields: [:], nullFields: ["value"]), definition)
        }
    }
    func testClearingAnotherFieldDoesNotTrimPasswordWhitespace() throws {
        let cmd = try command(#"{"type":"object","properties":{"currentPassword":{"type":"string"},"note":{"type":["string","null"]}},"required":["currentPassword"]}"#)
        let body = try JSONSerialization.jsonObject(with: ERPCommandInput.payload(command: cmd, fields: ["currentPassword": " exact password "], nullFields: ["note"])) as! [String: Any]
        XCTAssertEqual(body["currentPassword"] as? String, " exact password ")
        XCTAssertTrue(body["note"] is NSNull)
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
