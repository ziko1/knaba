import AuthenticationServices
import SwiftUI
import UIKit

@MainActor protocol ERPFederationBrowserSession: AnyObject {
    func start() -> Bool
    func cancel()
}

@MainActor private final class ERPFederationPresentation: NSObject, ASWebAuthenticationPresentationContextProviding {
    let window: UIWindow
    init(window: UIWindow) { self.window = window }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window }
}

@MainActor private final class ERPFederationSystemSession: ERPFederationBrowserSession {
    private let session: ASWebAuthenticationSession
    private let presentation: ERPFederationPresentation
    init(url: URL, scheme: String, window: UIWindow, completion: @escaping (URL?, Error?) -> Void) {
        presentation = ERPFederationPresentation(window: window)
        // This documented initializer supports the app's unchanged iOS 17.0
        // minimum. Callback-object APIs must not silently raise that minimum.
        session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme, completionHandler: completion)
        session.presentationContextProvider = presentation
        session.prefersEphemeralWebBrowserSession = false
    }
    func start() -> Bool { session.start() }
    func cancel() { session.cancel() }
}

/// One system browser per presentation. No shared app cookies, credentials,
/// fallback window, automatic retry or general deep-link receiver is involved.
@MainActor final class ERPFederationAuthSession: ObservableObject {
    typealias Factory = @MainActor (URL, String, UIWindow, @escaping (URL?, Error?) -> Void) -> any ERPFederationBrowserSession
    private let factory: Factory
    private let usableWindow: @MainActor (UIWindow) -> Bool
    private var session: (any ERPFederationBrowserSession)?
    private var flight: UUID?
    private var completion: CheckedContinuation<URL, Error>?
    private weak var activeWindow: UIWindow?
    weak var window: UIWindow?
    var presentationAvailable: Bool { window.map { usableWindow($0) } ?? false }

    init(factory: Factory? = nil, usableWindow: (@MainActor (UIWindow) -> Bool)? = nil) {
        self.factory = factory ?? { ERPFederationSystemSession(url: $0, scheme: $1, window: $2, completion: $3) }
        self.usableWindow = usableWindow ?? { !$0.isHidden && $0.windowScene?.activationState == .foregroundActive }
    }
    func open(_ url: URL, scheme: String) async throws -> URL {
        guard flight == nil, let window, usableWindow(window), url.scheme == "https" else { throw ERPFederationFailure.presentation }
        let id = UUID(); flight = id; activeWindow = window
        defer { cancel(id) }
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                completion = continuation
                let browser = factory(url, scheme, window) { [weak self] url, error in
                    Task { @MainActor [weak self] in self?.finish(id, url: url, error: error) }
                }
                session = browser
                if !browser.start() { finish(id, url: nil, error: ERPFederationFailure.presentation) }
            }
        } onCancel: { [weak self] in
            Task { @MainActor [weak self] in self?.cancel(id) }
        }
    }
    private func finish(_ id: UUID, url: URL?, error: Error?) {
        guard flight == id else { return }
        let callback = completion, sameWindow = activeWindow != nil && activeWindow === window
        completion = nil; session = nil; flight = nil; activeWindow = nil
        if let url, error == nil, sameWindow { callback?.resume(returning: url) }
        else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin || error is CancellationError || error as? ERPFederationFailure == .cancelled {
            callback?.resume(throwing: ERPFederationFailure.cancelled)
        } else { callback?.resume(throwing: ERPFederationFailure.presentation) }
    }
    private func cancel(_ id: UUID) {
        guard flight == id else { return }
        let browser = session, callback = completion
        flight = nil; session = nil; completion = nil; activeWindow = nil
        browser?.cancel(); callback?.resume(throwing: ERPFederationFailure.cancelled)
    }
    func cancel() { if let flight { cancel(flight) } }
}

/// The exact window containing this view supplies the presentation anchor.
/// Scene enumeration or constructing an unrelated UIWindow is deliberately absent.
struct ERPFederationWindowReader: UIViewRepresentable {
    let browser: ERPFederationAuthSession
    final class WindowView: UIView {
        weak var browser: ERPFederationAuthSession?
        override func didMoveToWindow() { super.didMoveToWindow(); browser?.window = window }
    }
    func makeUIView(context: Context) -> WindowView { let view = WindowView(); view.browser = browser; return view }
    func updateUIView(_ uiView: WindowView, context: Context) { uiView.browser = browser; browser.window = uiView.window }
    static func dismantleUIView(_ uiView: WindowView, coordinator: ()) {
        if uiView.browser?.window === uiView.window { uiView.browser?.window = nil }
    }
}
