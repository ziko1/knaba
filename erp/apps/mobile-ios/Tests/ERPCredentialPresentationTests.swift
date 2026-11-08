import XCTest
import SwiftUI
import UIKit
@testable import KNABADE

final class ERPCredentialPresentationTests: XCTestCase {
    @MainActor func testNativeCredentialControlsMaskEveryValueAndUseAppropriateAutofill() throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let formerKeyWindow = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        let bounds = CGRect(x: 0, y: 0, width: 320, height: 640)
        window.frame = bounds
        let host = UIHostingController(rootView: VStack(spacing: 20) {
            ERPCredentialField(title: "Current password", key: "currentPassword", text: .constant("synthetic-current"))
            ERPCredentialField(title: "New password", key: "newPassword", text: .constant("synthetic-new"))
            ERPCredentialField(title: "Authenticator setup key", key: "secret", text: .constant("JBSWY3DPEHPK3PXP"))
            ERPCredentialField(title: "Authenticator code", key: "otp", text: .constant("012345"))
        }.padding().frame(width: bounds.width, height: bounds.height))
        host.safeAreaRegions = []
        window.rootViewController = host; window.makeKeyAndVisible()
        host.view.frame = bounds; host.view.setNeedsLayout(); host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.12))
        host.view.layoutIfNeeded()
        defer { window.isHidden = true; window.rootViewController = nil; formerKeyWindow?.makeKey() }
        func descendants(_ view: UIView) -> [UIView] { [view] + view.subviews.flatMap { descendants($0) } }
        let views = descendants(host.view), fields = views.compactMap { $0 as? UITextField }
        XCTAssertEqual(fields.count, 4, "Inspect actual native controls, not a mocked input type")
        for field in fields {
            XCTAssertTrue(field.isSecureTextEntry)
            XCTAssertEqual(field.autocapitalizationType, .none)
            XCTAssertEqual(field.autocorrectionType, .no)
        }
        func field(_ value: String) throws -> UITextField { try XCTUnwrap(fields.first { $0.text == value }) }
        XCTAssertEqual(try field("synthetic-current").textContentType, .password)
        XCTAssertEqual(try field("synthetic-new").textContentType, .newPassword)
        XCTAssertNil(try field("JBSWY3DPEHPK3PXP").textContentType, "A setup key must not suggest a saved account password")
        XCTAssertEqual(try field("012345").textContentType, .oneTimeCode)
        XCTAssertEqual(try field("012345").keyboardType, .numberPad)
        let secrets = Set(["synthetic-current", "synthetic-new", "JBSWY3DPEHPK3PXP", "012345"])
        XCTAssertTrue(views.compactMap { ($0 as? UILabel)?.text }.allSatisfy { !secrets.contains($0) })
    }
}
