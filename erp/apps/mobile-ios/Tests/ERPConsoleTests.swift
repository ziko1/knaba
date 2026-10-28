import XCTest
@testable import KNABADE

final class ERPConsoleTests: XCTestCase {
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
