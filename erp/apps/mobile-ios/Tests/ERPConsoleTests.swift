import XCTest
@testable import KNABADE

final class ERPConsoleTests: XCTestCase {
    func testEveryERPLabelHasSixCompleteTranslationsInTheDisplayOrder() {
        XCTAssertEqual(Set(ERPStrings.rows.keys), Set(ERPText.allCases))
        for key in ERPText.allCases {
            let row = ERPStrings.rows[key]!
            XCTAssertEqual(row.count, NativeLanguage.allCases.count, key.rawValue)
            XCTAssertTrue(row.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }, key.rawValue)
            XCTAssertEqual(Set(row.map { $0.components(separatedBy: "%@").count }).count, 1, key.rawValue)
        }
        XCTAssertEqual(ERPStrings.text(.signIn, .de), "Sicher anmelden")
        XCTAssertEqual(ERPStrings.text(.authorizedCount, .en, "4"), "Authorized records: 4")
        XCTAssertEqual(ERPStrings.text(.authorizedCount, .uk, "4"), "Доступні записи: 4")
    }
    func testERPErrorLocalizationDoesNotExposeRawServerMessage() {
        let failure = ERPFailure.http(403, "PRIVATE_SERVER_DETAIL")
        for language in NativeLanguage.allCases {
            let rendered = ERPStrings.error(failure, language)
            XCTAssertTrue(rendered.contains("403"))
            XCTAssertFalse(rendered.contains("PRIVATE_SERVER_DETAIL"))
        }
        XCTAssertNotEqual(ERPStrings.error(ERPFailure.expired, .de), ERPStrings.error(ERPFailure.expired, .lt))
    }
    func testPortableServerOriginRejectsUnsafeRedirectAndCredentials() {
        XCTAssertEqual(ERPOrigin.validate("https://new-owner.example")?.absoluteString, "https://new-owner.example")
        XCTAssertEqual(ERPOrigin.validate("https://erp.knaba.de/")?.absoluteString, "https://erp.knaba.de")
        for bad in ["", "http://knaba.de", "https://user:password@knaba.de", "https://knaba.de/path", "https://knaba.de?token=x", "https://knaba.de/#secret", "javascript:alert(1)", "https://knaba.de:8080"] {
            XCTAssertNil(ERPOrigin.validate(bad), bad)
        }
    }
    func testDecodesServerRoleAndEntityWithoutClientPermissionClaims() throws {
        let identity = try JSONDecoder().decode(ERPIdentity.self, from: Data(#"{"actor":{"userId":"u","companyId":"c","roles":["OWNER"],"permissions":["*"]},"user":{"id":"u","name":"Test Owner"},"csrfToken":"xyz","mode":"DEMO"}"#.utf8))
        XCTAssertEqual(identity.actor.companyId, "c")
        XCTAssertEqual(identity.actor.roles, ["OWNER"])
        let page = try JSONDecoder().decode(ERPPage.self, from: Data(#"{"items":[{"id":"t","kind":"task","version":3,"data":{"title":"Site job","state":"ASSIGNED","count":3}}],"has_more":false,"next_cursor":null}"#.utf8))
        XCTAssertEqual(page.items.first?.title, "Site job")
        XCTAssertEqual(page.items.first?.version, 3)
    }
}
