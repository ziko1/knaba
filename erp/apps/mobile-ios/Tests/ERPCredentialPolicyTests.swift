import XCTest
@testable import KNABADE

final class ERPCredentialPolicyTests: XCTestCase {
    private func command(_ name: String, properties: [String: Any], required: [String]) throws -> ERPCommand {
        try JSONDecoder().decode(ERPCommand.self, from: JSONSerialization.data(withJSONObject: [
            "name": name, "permission": "identity.self", "highRisk": true,
            "schema": ["type": "object", "required": required, "properties": properties]
        ]))
    }

    func testCredentialInputPreservesExactWhitespaceAndNeverPrefillsServerDefaults() throws {
        let action = try command("user.password.rotate", properties: [
            "currentPassword": ["type": "string", "default": "server-secret"],
            "newPassword": ["type": "string", "default": "another-secret"]
        ], required: ["currentPassword", "newPassword"])
        XCTAssertTrue(ERPCommandInput.defaultFields(action).isEmpty)
        let fields = ["currentPassword": " current password \t", "newPassword": " new password \n"]
        let bytes = try ERPCommandInput.data(command: action, fields: fields)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: bytes) as? [String: String], fields)
        let ordinary = try command("task.update", properties: ["note": ["type": "string"]], required: ["note"])
        let trimmed = try ERPCommandInput.data(command: ordinary, fields: ["note": " normal text \n"])
        XCTAssertEqual(try JSONSerialization.jsonObject(with: trimmed) as? [String: String], ["note": "normal text"])
    }

    func testCredentialValidationMatchesUTF16PasswordBoundsAndExactMFAFields() throws {
        let password = "user.password.rotate"
        XCTAssertNoThrow(try ERPCredentialPolicy.validateOneShot(password, input: [
            "currentPassword": String(repeating: "😀", count: 64), "newPassword": String(repeating: "😀", count: 4)
        ]))
        let invalidPasswords: [[String: Any]] = [
            ["currentPassword": String(repeating: "😀", count: 65), "newPassword": "password"],
            ["currentPassword": "current", "newPassword": "short"],
            ["currentPassword": "current", "newPassword": "password", "extra": "unexpected"],
            ["currentPassword": "current", "newPassword": 12345678]
        ]
        for input in invalidPasswords {
            XCTAssertThrowsError(try ERPCredentialPolicy.validateOneShot(password, input: input)) {
                XCTAssertEqual($0 as? ERPFailure, .invalidPayload)
            }
        }
        let valid = ["currentPassword": " current ", "secret": "JBSWY3DPEHPK3PXP", "otp": "012345"]
        XCTAssertNoThrow(try ERPCredentialPolicy.validateOneShot("user.mfa.configure", input: valid))
        for (key, value) in [("secret", "JBSWY3DPEHPK3PXP\n"), ("secret", "jbswy3dpehpk3pxp"),
                             ("otp", "012345\n"), ("otp", " 012345"), ("otp", "12345")] {
            var invalid = valid; invalid[key] = value
            XCTAssertThrowsError(try ERPCredentialPolicy.validateOneShot("user.mfa.configure", input: invalid)) {
                XCTAssertEqual($0 as? ERPFailure, .invalidPayload)
            }
        }
        XCTAssertFalse(ERPCredentialPolicy.isOneShot("user.password.rotate.v2"))
        XCTAssertThrowsError(try ERPCredentialPolicy.validateOneShot("user.credentials.update", input: valid)) {
            XCTAssertEqual($0 as? ERPFailure, .sensitiveCommand)
        }
    }

    func testRecursiveSecretDetectionIsBoundedAndDoesNotTreatOrdinaryValuesAsKeys() throws {
        for key in ["currentPassword", "ACCESS-TOKEN", "private_key", "otp", "nestedSecret", "Authorization", "key"] {
            XCTAssertTrue(try ERPCredentialPolicy.containsSecret(["rows": [["details": [key: "synthetic"]]]]), key)
        }
        XCTAssertFalse(try ERPCredentialPolicy.containsSecret(["note": "token is a word in an ordinary note", "quantity": 3]))
        var deep: Any = "value"
        for _ in 0..<26 { deep = ["child": deep] }
        let invalidStructures: [Any] = [deep, Array(repeating: 0, count: 2001),
                                       Dictionary(uniqueKeysWithValues: (0..<257).map { ("field\($0)", 0) }),
                                       [String(repeating: "a", count: 201): "value"]]
        for invalid in invalidStructures {
            XCTAssertThrowsError(try ERPCredentialPolicy.containsSecret(invalid)) {
                XCTAssertEqual($0 as? ERPFailure, .invalidPayload)
            }
        }
    }

    func testStructuredOrdinaryFormCannotSmuggleSecretsIntoDurableInput() throws {
        let action = try command("task.update", properties: ["details": ["type": "object"]], required: ["details"])
        XCTAssertThrowsError(try ERPCommandInput.data(command: action, fields: [
            "details": #"{"rows":[{"credentials":{"refresh_token":"synthetic"}}]}"#
        ])) { XCTAssertEqual($0 as? ERPFailure, .sensitiveCommand) }
    }

    func testAuthoritySnapshotIgnoresOnlyReportingTimeAndKnownSetOrder() throws {
        let base: [String: Any] = ["userId": "user-a", "companyId": "company-a", "roles": ["OWNER", "EMPLOYEE"],
                                  "permissions": ["identity.self", "task.work"], "siteIds": ["a", "b"],
                                  "warehouseIds": ["c", "d"], "customerIds": ["e", "f"],
                                  "mfaVerified": true, "mfaVerifiedAt": "first", "delegatedScope": ["region": "one"]]
        func snapshot(_ actor: [String: Any]) throws -> Data {
            try ERPCredentialPolicy.authoritySnapshot(JSONSerialization.data(withJSONObject: ["actor": actor]))
        }
        let expected = try snapshot(base)
        var reordered = base
        for key in ["roles", "permissions", "siteIds", "warehouseIds", "customerIds"] {
            reordered[key] = (base[key] as! [String]).reversed().map { $0 }
        }
        reordered["mfaVerifiedAt"] = "second"
        XCTAssertEqual(try snapshot(reordered), expected)
        let changes: [(String, Any)] = [("warehouseIds", ["other"]), ("mfaVerified", false),
                                       ("delegatedScope", ["region": "two"])]
        for (key, value) in changes {
            var changed = base; changed[key] = value
            XCTAssertNotEqual(try snapshot(changed), expected, key)
        }
    }
}
