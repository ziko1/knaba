import SwiftUI
import UIKit

/// Native counterparts of corporate-site global.css and portal.css. Brand colors
/// stay fixed; content colors adapt to the user's light/dark appearance.
enum KNABATheme {
    static let ink = Color(hex: 0x102F38)
    static let green = Color(hex: 0x123A43)
    static let lime = Color(hex: 0xD8F779)
    static let paper = adaptive(0xFBFCF7, 0x0B2027)
    static let surface = adaptive(0xFFFFFF, 0x14313A)
    static let text = adaptive(0x14343B, 0xF1F6EF)
    static let muted = adaptive(0x556B6D, 0xB8CCC8)
    static let line = adaptive(0xD8E0DB, 0x3B555D)
    static let fieldLine = adaptive(0x758A81, 0x79968F)
    static let soft = adaptive(0xEFF3EA, 0x1E3D44)
    static let tint = adaptive(0x123A43, 0xD8F779)
    static let success = adaptive(0x235C3B, 0xB9E4B7)
    static let warning = adaptive(0x85540B, 0xFFD59B)
    static let danger = adaptive(0xB42318, 0xFFB4AB)
    static let metricGreen = adaptive(0xE3EFDE, 0x244438)
    static let metricLilac = adaptive(0xE8E2F8, 0x37344E)
    static let metricPeach = adaptive(0xF7E3D8, 0x48392F)
    static let radius: CGFloat = 18

    private static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((value >> 16) & 255) / 255,
                           green: CGFloat((value >> 8) & 255) / 255,
                           blue: CGFloat(value & 255) / 255, alpha: 1)
        })
    }
}

private extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 255) / 255,
                  green: Double((hex >> 8) & 255) / 255,
                  blue: Double(hex & 255) / 255, opacity: 1)
    }
}

struct KNABACard<Content: View>: View {
    var title: String? = nil
    var icon: String? = nil
    private let content: Content
    init(title: String? = nil, icon: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title; self.icon = icon; self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let title {
                HStack(alignment: .firstTextBaseline, spacing: 9) {
                    if let icon { Image(systemName: icon).foregroundStyle(KNABATheme.tint).accessibilityHidden(true) }
                    Text(title).font(.headline).foregroundStyle(KNABATheme.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityAddTraits(.isHeader)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(KNABATheme.surface, in: RoundedRectangle(cornerRadius: KNABATheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: KNABATheme.radius, style: .continuous).stroke(KNABATheme.line, lineWidth: 1))
    }
}

struct KNABABrandHeader: View {
    let title: String
    var subtitle: String? = nil
    var eyebrow: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 19) {
            // Exact compact website wordmark, kept on its approved light surface.
            Image("BrandWordmark").resizable().scaledToFit()
                .frame(maxWidth: 230, maxHeight: 58, alignment: .leading).padding(10)
                .background(.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityLabel("KNABA DE")
            if let eyebrow {
                Text(eyebrow).font(.caption.weight(.semibold)).foregroundStyle(KNABATheme.lime)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 9) {
                Text(title).font(.title2.weight(.bold)).foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.subheadline).foregroundStyle(Color.white.opacity(0.84))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Capsule().fill(KNABATheme.lime).frame(width: 44, height: 4).accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(KNABATheme.green, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
}

struct KNABAButtonStyle: ButtonStyle {
    enum Emphasis: Equatable { case primary, secondary }
    var emphasis: Emphasis = .primary
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        let destructive = configuration.role == .destructive
        return configuration.label
            .font(.body.weight(.semibold))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 24)
            .padding(.horizontal, 16).padding(.vertical, 13)
            .foregroundStyle(destructive ? KNABATheme.danger : emphasis == .primary ? KNABATheme.ink : KNABATheme.text)
            .background(destructive ? KNABATheme.danger.opacity(0.08) : emphasis == .primary ? KNABATheme.lime : KNABATheme.soft,
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(destructive ? KNABATheme.danger.opacity(0.3) : emphasis == .primary ? .clear : KNABATheme.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(isEnabled ? (configuration.isPressed ? 0.76 : 1) : 0.46)
    }
}

struct KNABAField<Content: View>: View {
    let title: String
    let icon: String
    private let content: Content
    init(_ title: String, icon: String, @ViewBuilder content: () -> Content) {
        self.title = title; self.icon = icon; self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(KNABATheme.muted)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: icon).foregroundStyle(KNABATheme.muted).accessibilityHidden(true)
                content.foregroundStyle(KNABATheme.text).tint(KNABATheme.tint)
            }
            .padding(13).frame(minHeight: 48)
            .background(KNABATheme.paper, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(KNABATheme.fieldLine, lineWidth: 1))
        }
    }
}

struct KNABAStatusNotice: View {
    enum Kind { case information, success, warning, error }
    let text: String
    var kind: Kind = .information
    private var color: Color {
        switch kind { case .information: return KNABATheme.tint; case .success: return KNABATheme.success
        case .warning: return KNABATheme.warning; case .error: return KNABATheme.danger }
    }
    private var icon: String {
        switch kind { case .information: return "info.circle"; case .success: return "checkmark.circle"
        case .warning: return "exclamationmark.triangle"; case .error: return "exclamationmark.circle" }
    }
    var body: some View {
        Label { Text(text).fixedSize(horizontal: false, vertical: true) }
            icon: { Image(systemName: icon).accessibilityHidden(true) }
            .font(.subheadline).foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
            .background(color.opacity(0.07), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityElement(children: .combine)
    }
}

struct KNABAMetric: View {
    let title: String
    let value: String
    let icon: String
    var color: Color = KNABATheme.metricGreen
    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            Image(systemName: icon).font(.title3).foregroundStyle(KNABATheme.text).accessibilityHidden(true)
            Text(value).font(.title2.weight(.bold)).monospacedDigit().foregroundStyle(KNABATheme.text)
                .fixedSize(horizontal: false, vertical: true)
            Text(title).font(.subheadline).foregroundStyle(KNABATheme.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(17).background(color, in: RoundedRectangle(cornerRadius: KNABATheme.radius, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title).accessibilityValue(value)
    }
}

struct KNABAEmptyState: View {
    let title: String
    let icon: String
    var body: some View {
        VStack(spacing: 13) {
            Image(systemName: icon).font(.title).foregroundStyle(KNABATheme.tint)
                .padding(20).background(KNABATheme.soft, in: Circle()).accessibilityHidden(true)
            Text(title).font(.body.weight(.medium)).multilineTextAlignment(.center)
                .foregroundStyle(KNABATheme.muted).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 22)
    }
}

struct KNABANavigationRow: View {
    let title: String
    let icon: String
    var subtitle: String? = nil
    var body: some View {
        HStack(alignment: .center, spacing: 13) {
            Image(systemName: icon).font(.title3).foregroundStyle(KNABATheme.tint)
                .frame(width: 44, height: 44).background(KNABATheme.soft, in: RoundedRectangle(cornerRadius: 12))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.body.weight(.semibold)).foregroundStyle(KNABATheme.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.subheadline).foregroundStyle(KNABATheme.muted)
                        .lineLimit(3)
                }
            }
            Spacer(minLength: 2)
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(KNABATheme.muted)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .padding(15)
        .background(KNABATheme.surface, in: RoundedRectangle(cornerRadius: KNABATheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: KNABATheme.radius, style: .continuous).stroke(KNABATheme.line, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: KNABATheme.radius, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct KNABAScreenModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.foregroundStyle(KNABATheme.text).tint(KNABATheme.tint)
            .scrollContentBackground(.hidden)
            .background(KNABATheme.paper)
            .toolbarBackground(KNABATheme.paper, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}

extension View {
    func knabaScreen() -> some View { modifier(KNABAScreenModifier()) }
}
