import XCTest
import SwiftUI
import UIKit
@testable import KNABADE

/// Actual native rendering, using explicit synthetic in-memory values only.
/// These tests never log in, send commands, enable GPS or imply device/live UAT.
final class BrandPresentationTests: XCTestCase {
    @MainActor func testSemanticTextAndFieldBoundariesKeepContrastInBothAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            for surface in [KNABATheme.paper, KNABATheme.surface, KNABATheme.soft] {
                XCTAssertGreaterThanOrEqual(contrast(KNABATheme.text, surface, traits), 4.5)
                XCTAssertGreaterThanOrEqual(contrast(KNABATheme.muted, surface, traits), 4.5)
            }
            XCTAssertGreaterThanOrEqual(contrast(KNABATheme.ink, KNABATheme.lime, traits), 7)
            XCTAssertGreaterThanOrEqual(contrast(.white, KNABATheme.green, traits), 7)
            XCTAssertGreaterThanOrEqual(contrast(KNABATheme.fieldLine, KNABATheme.paper, traits), 3)
            for metric in [KNABATheme.metricGreen, KNABATheme.metricLilac, KNABATheme.metricPeach] {
                XCTAssertGreaterThanOrEqual(contrast(KNABATheme.text, metric, traits), 4.5)
            }
        }
    }

    @MainActor func testCanonicalCompactWebsiteWordmarkIsBundledAndDecodable() throws {
        let image = try XCTUnwrap(UIImage(named: "BrandWordmark"))
        XCTAssertGreaterThan(image.size.width, 100)
        XCTAssertEqual(image.size.width / image.size.height, 1140.0 / 280.0, accuracy: 0.01)
        XCTAssertNotNil(image.cgImage)
    }

    @MainActor func testLoginRendersAtNarrowWidthInAllSixLanguages() throws {
        for language in NativeLanguage.allCases {
            let model = ERPConsoleModel()
            model.language = language
            try render(ERPLoginScreen(model: model), name: "login-\(language.rawValue)-320-light",
                       width: 320, height: 900)
            XCTAssertNil(model.identity)
            XCTAssertFalse(model.busy)
        }
    }

    @MainActor func testLoginAndLongNavigationLabelsRenderAtAccessibilitySizeInDarkMode() throws {
        let model = ERPConsoleModel()
        model.language = .uk
        model.problem = model.text(.errorNetwork)
        try render(ERPLoginScreen(model: model), name: "login-uk-390-dark-accessibility",
                   width: 390, height: 1000, dark: true, typeSize: .accessibility2)
        try render(ERPWorkspaceTabs(selection: .constant(3), language: .de).knabaScreen(),
                   name: "navigation-de-320-dark-accessibility", width: 320, height: 150,
                   dark: true, typeSize: .accessibility2)
        let tabHost = UIHostingController(rootView: ERPWorkspaceTabs(selection: .constant(3), language: .de).dynamicTypeSize(.accessibility2))
        let tabSize = tabHost.sizeThatFits(in: CGSize(width: 320, height: 1000))
        XCTAssertGreaterThanOrEqual(tabSize.height, 44)
        XCTAssertLessThanOrEqual(tabSize.height, 160, "Module tabs must leave vertical room for the selected screen")
        XCTAssertNil(model.identity)
        XCTAssertFalse(model.busy)
    }

    @MainActor func testServerScopedOverviewFixtureRendersWithoutStartingRequests() throws {
        let model = overviewFixture(language: .de)
        try render(VStack(spacing: 0) {
            ERPWorkspaceTabs(selection: .constant(0), language: model.language)
            ScrollView { ERPOverviewContent(model: model, openModule: { _ in XCTFail("Rendering must not open a module") }).padding(16) }
        }.knabaScreen(),
                   name: "overview-synthetic-de-390-light", width: 390, height: 1100)
        XCTAssertEqual(Set(model.modules.map(\.kind)), Set(["task", "defect", "worklog", "site", "order", "channel"]))
        XCTAssertEqual(model.dashboard?.counts["task"], 4)
        XCTAssertFalse(model.busy)
        XCTAssertNil(model.pendingCommandName)
    }

    @MainActor func testOverviewFixtureKeepsLargeTypeAndDarkSurfacesAtNarrowWidth() throws {
        let model = overviewFixture(language: .uk)
        try render(VStack(spacing: 0) {
            ERPWorkspaceTabs(selection: .constant(0), language: model.language)
            ScrollView { ERPOverviewContent(model: model, openModule: { _ in XCTFail("Rendering must not send actions") }).padding(16) }
        }.knabaScreen(),
                   name: "overview-synthetic-uk-320-dark-accessibility", width: 320, height: 1300,
                   dark: true, typeSize: .accessibility2)
        XCTAssertFalse(model.busy)
        XCTAssertTrue(model.commands.isEmpty)
    }

    @MainActor func testShiftEmptyStateAndAuthenticatedSummaryFixtureRenderWithGPSOff() throws {
        let savedLanguage = UserDefaults.standard.object(forKey: "knaba-ui-language")
        defer {
            if let savedLanguage { UserDefaults.standard.set(savedLanguage, forKey: "knaba-ui-language") }
            else { UserDefaults.standard.removeObject(forKey: "knaba-ui-language") }
        }
        let model = AppModel()
        model.localeSelection = "de"
        try render(CompanionDashboard(model: model), name: "shift-empty-de-390-light", width: 390, height: 1100)
        XCTAssertNil(model.session)
        XCTAssertFalse(model.tracker.active)
        let now = Date(timeIntervalSince1970: 1_794_139_200)
        var session = TrackingSession(deviceId: "synthetic-device", employeeId: "synthetic-employee", apiVersion: 1,
                                      expiresAt: Clock.iso(now.addingTimeInterval(300)), mode: .off,
                                      shiftId: "synthetic-shift", tripId: nil, siteId: "synthetic-site",
                                      policyVersionId: nil, reason: "GPS_LEGAL_GATE_CLOSED", siteGeofence: nil)
        session.shiftSummary = NativeShiftSummary(shiftId: "synthetic-shift", siteId: "synthetic-site", state: "ACTIVE", activity: "WORKING",
            startedAt: Clock.iso(now.addingTimeInterval(-7200)), asOf: Clock.iso(now), siteCode: "TEST",
            siteName: "SYNTHETIC · Baustelle", activityStartedAt: Clock.iso(now.addingTimeInterval(-1200)),
            siteSeconds: 5400, travelSeconds: 900, breakSeconds: 900, pendingSeconds: 0,
            serviceSeconds: 0, waitingSeconds: 0, reviewRequired: false)
        model.session = session
        try render(ScrollView { KNABAShiftSummaryCard(model: model, tracker: model.tracker, now: now).padding(16) }.knabaScreen(),
                   name: "shift-summary-synthetic-de-390-light", width: 390, height: 1000)
        model.localeSelection = "uk"
        try render(ScrollView { KNABAShiftSummaryCard(model: model, tracker: model.tracker, now: now).padding(16) }.knabaScreen(),
                   name: "shift-summary-synthetic-uk-320-dark-accessibility", width: 320, height: 1300,
                   dark: true, typeSize: .accessibility2)
        XCTAssertFalse(model.tracker.active)
        XCTAssertFalse(session.permitsLocation)
        XCTAssertEqual(model.queued, 0)
    }

    @MainActor private func overviewFixture(language: NativeLanguage) -> ERPConsoleModel {
        let model = ERPConsoleModel()
        model.language = language
        model.identity = ERPIdentity(actor: ERPActor(userId: "synthetic-user", companyId: "synthetic-company", roles: ["SYNTHETIC TEAM"],
                                                     permissions: ["task.read", "site.read", "chat.read"], siteIds: [], customerIds: []),
                                     user: ERPUser(id: "synthetic-user", name: "SYNTHETIC · KNABA", email: nil),
                                     csrfToken: "NOT_AN_AUTHENTICATED_SESSION", mode: "TEST")
        model.dashboard = ERPDashboard(counts: ["task": 4, "site": 2], openDecisions: nil, activeSites: nil, activeShifts: 1)
        return model
    }

    @MainActor private func render<Content: View>(_ content: Content, name: String, width: CGFloat, height: CGFloat,
                                       dark: Bool = false, typeSize: DynamicTypeSize = .large) throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let formerKeyWindow = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        let bounds = CGRect(x: 0, y: 0, width: width, height: height)
        window.frame = bounds
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        let host = UIHostingController(rootView: content.environment(\.colorScheme, dark ? .dark : .light)
            .dynamicTypeSize(typeSize).frame(width: width, height: height))
        host.safeAreaRegions = []
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = bounds
        host.view.setNeedsLayout(); host.view.layoutIfNeeded()
        // Give native text fields, images and SwiftUI layout a bounded frame to render.
        RunLoop.main.run(until: Date().addingTimeInterval(0.12))
        host.view.layoutIfNeeded()
        defer { window.isHidden = true; window.rootViewController = nil; formerKeyWindow?.makeKey() }
        let fitted = host.sizeThatFits(in: bounds.size)
        XCTAssertLessThanOrEqual(fitted.width, width + 0.5, name)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        var drew = false
        let image = UIGraphicsImageRenderer(size: bounds.size, format: format).image { _ in
            drew = host.view.drawHierarchy(in: bounds, afterScreenUpdates: true)
        }
        XCTAssertTrue(drew, "Native drawing failed: \(name)")
        XCTAssertEqual(image.cgImage?.width, Int(width))
        XCTAssertEqual(image.cgImage?.height, Int(height))
        let bytes = try XCTUnwrap(image.pngData())
        XCTAssertGreaterThan(bytes.count, 1000, "Empty rendering: \(name)")
        let attachment = XCTAttachment(image: image)
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }

    @MainActor private func contrast(_ first: Color, _ second: Color, _ traits: UITraitCollection) -> Double {
        func luminance(_ color: Color) -> Double {
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            XCTAssertTrue(UIColor(color).resolvedColor(with: traits).getRed(&red, green: &green, blue: &blue, alpha: &alpha))
            let channels = [red, green, blue].map { value -> Double in
                let value = Double(value)
                return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
            }
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        }
        let values = [luminance(first), luminance(second)].sorted()
        return (values[1] + 0.05) / (values[0] + 0.05)
    }
}
