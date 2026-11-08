import SwiftUI

enum ERPFederationPhase: Equatable {
    case idle, discovering, choose, starting, browser, exchanging, checking, startUnknown, sessionUnknown, failed, complete
    var waiting: Bool { [.discovering, .starting, .browser, .exchanging, .checking].contains(self) }
    var active: Bool { ![.idle, .failed, .complete].contains(self) }
}

struct ERPFederationControls: View {
    @ObservedObject var model: ERPConsoleModel
    @StateObject private var browser = ERPFederationAuthSession()
    private func text(_ key: ERPFederationText) -> String { ERPFederationStrings.text(key, model.language) }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(text(.title), systemImage: "person.crop.circle.badge.checkmark").font(.headline)
            Text(text(.intro)).font(.footnote).foregroundStyle(.secondary)
            if model.identity != nil { Text(text(.preserve)).font(.caption).foregroundStyle(.secondary) }
            if model.websitePhase == .choose || model.websitePhase == .startUnknown {
                Picker(text(.website), selection: $model.websiteAuthority) {
                    ForEach(model.websiteAuthorities) { source in Text(source.label).tag(source.id) }
                }.disabled(model.websitePhase == .startUnknown).accessibilityIdentifier("erpFederationAuthority")
                if let source = model.websiteAuthorities.first(where: { $0.id == model.websiteAuthority }) {
                    Text(source.siteOrigin).font(.caption).textSelection(.enabled)
                }
                Button(text(model.websitePhase == .startUnknown ? .retryStart : .openBrowser)) {
                    model.run { await model.openWebsiteSignIn(using: browser) }
                }.buttonStyle(.borderedProminent).accessibilityIdentifier("erpFederationOpen")
            } else if model.websitePhase == .sessionUnknown {
                Button(text(.checkSession)) { model.run { await model.recoverWebsiteSignIn(using: browser) } }
                    .buttonStyle(.borderedProminent).accessibilityIdentifier("erpFederationRecover")
            } else if !model.websitePhase.active {
                Button(text(.begin)) { model.run { await model.prepareWebsiteSignIn() } }
                    .buttonStyle(.bordered).disabled(model.busy || ERPOrigin.validate(model.origin) == nil)
                    .accessibilityIdentifier("erpFederationBegin")
            }
            if model.websitePhase.waiting {
                ProgressView(text(model.websitePhase == .browser ? .browser : .checking))
                    .accessibilityIdentifier("erpFederationProgress")
            }
            if let problem = model.websiteProblem {
                Text(text(problem)).font(.footnote).foregroundStyle(.red).accessibilityIdentifier("erpFederationError")
            }
            if model.websitePhase == .complete { Text(text(.connected)).font(.footnote).accessibilityIdentifier("erpFederationConnected") }
            if model.websitePhase.active {
                Button(text(.cancel), role: .cancel) { model.cancelWebsiteSignIn(); browser.cancel() }
                    .accessibilityIdentifier("erpFederationCancel")
            }
            Text(text(.scope)).font(.caption).foregroundStyle(.secondary)
        }
        .background(ERPFederationWindowReader(browser: browser).frame(width: 0, height: 0))
        .privacySensitive()
    }
}
