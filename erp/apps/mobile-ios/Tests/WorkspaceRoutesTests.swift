import XCTest
@testable import KNABADE

final class WorkspaceRoutesTests: XCTestCase {
    func testSecureHandoffResolvesConfigurableSiteAndERPHosts() {
        XCTAssertEqual(WorkspaceRoutes.url(origin:"https://knaba.de",path:"/app/")?.absoluteString,"https://knaba.de/app/")
        XCTAssertEqual(WorkspaceRoutes.url(origin:"https://future-owner.example",path:"/konto/")?.absoluteString,"https://future-owner.example/konto/")
        XCTAssertEqual(WorkspaceRoutes.url(origin:"https://erp.knaba.de",path:"/console")?.absoluteString,"https://erp.knaba.de/console")
    }
    func testRejectsUnsafeOriginsAndUnknownPaths() {
        for origin in ["http://knaba.de","https://owner:secret@knaba.de","https://knaba.de/other","https://knaba.de/?token=x","https://knaba.de/#token","https://knaba.de:8080","javascript:alert(1)","", "https://knaba.de.evil.example/abc"] {
            XCTAssertNil(WorkspaceRoutes.url(origin:origin,path:"/app/"), origin)
        }
        XCTAssertNil(WorkspaceRoutes.url(origin:"https://knaba.de",path:"/admin/"))
    }
}
