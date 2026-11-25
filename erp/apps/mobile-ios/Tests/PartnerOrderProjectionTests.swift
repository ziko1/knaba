import XCTest
@testable import KNABADE

final class PartnerOrderProjectionTests: XCTestCase {
    private func row(_ id: String) -> [String: String] {
        ["id": id, "status": "CONFIRMED", "updatedAt": "2026-11-25T03:15:12.123Z"]
    }

    func testEncodesOpaqueIDsAndCursorsWithoutChangingRoute() throws {
        let id = "A/ä?#%2F&+.."
        let encoded = "A%2F%C3%A4%3F%23%252F%26%2B%2E%2E"
        XCTAssertEqual(try ERPPartnerOrder.detailPath(id: id), "/api/v1/partner/orders/" + encoded)
        XCTAssertEqual(try ERPPartnerOrder.listPath(after: id), "/api/v1/partner/orders?limit=50&after=" + encoded)
        XCTAssertEqual(try ERPPartnerOrder.detailPath(id: "."), "/api/v1/partner/order?id=%2E")
        XCTAssertEqual(try ERPPartnerOrder.detailPath(id: ".."), "/api/v1/partner/order?id=%2E%2E")
        XCTAssertThrowsError(try ERPPartnerOrder.detailPath(id: "x\u{0}"))
        XCTAssertThrowsError(try ERPPartnerOrder.listPath(after: String(repeating: "💠", count: 51)))
    }

    func testParsesDistinctUnicodeIDsAndRequiresExactDetail() throws {
        let first = "caf\u{e9}", second = "cafe\u{301}"
        let value = try JSONSerialization.data(withJSONObject: ["items": [row(first), row(second)], "nextAfter": second] as [String: Any])
        let page = try ERPPartnerOrderPage.decode(value, after: nil)
        XCTAssertEqual(page.items.map { Data($0.id.utf8) }, [Data(first.utf8), Data(second.utf8)])
        let detail = try JSONSerialization.data(withJSONObject: row(second))
        XCTAssertNoThrow(try ERPPartnerOrder.decode(detail, expectedID: second))
        XCTAssertThrowsError(try ERPPartnerOrder.decode(detail, expectedID: first))
    }

    func testRejectsInvalidProjectionAndNonprogressingPages() throws {
        let item = row("A")
        for obj: [String: Any] in [["items": [item]], ["items": [item], "nextAfter": "outside"],
                                  ["items": [item,item], "nextAfter": NSNull()],
                                  ["items": [row("")], "nextAfter": NSNull()]] {
            let data = try JSONSerialization.data(withJSONObject: obj)
            XCTAssertThrowsError(try ERPPartnerOrderPage.decode(data, after: nil))
        }
        let repeated = try JSONSerialization.data(withJSONObject: ["items": [item], "nextAfter": NSNull()] as [String: Any])
        XCTAssertThrowsError(try ERPPartnerOrderPage.decode(repeated, after: "A"))
        var badDate = row("A"); badDate["updatedAt"] = "2026"
        XCTAssertThrowsError(try ERPPartnerOrder.decode(JSONSerialization.data(withJSONObject: badDate), expectedID: "A"))
    }
}
