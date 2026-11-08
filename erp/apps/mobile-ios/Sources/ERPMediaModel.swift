import Foundation
import Combine

enum ERPMediaScreenState: Equatable {
    case idle, selected, uploading, uploadUnknown, uploaded, registering, registerUnknown, registered
}

/// This model owns only the media screen. Leaving it cancels its tickets and
/// releases private buffers; it never signs out or changes the GPS/time queue.
@MainActor final class ERPMediaModel: ObservableObject {
    @Published private(set) var authority: ERPMediaAuthority?
    @Published private(set) var contexts: [ERPMediaContext] = []
    @Published private(set) var context: ERPMediaContext?
    @Published private(set) var gallery: [ERPItem] = []
    @Published private(set) var pending: ERPMediaPending?
    @Published private(set) var file: ERPMediaFile?
    @Published private(set) var receipt: ERPMediaPending?
    @Published private(set) var state: ERPMediaScreenState = .idle
    @Published private(set) var canUpload = false
    @Published private(set) var busy = false
    @Published private(set) var recoveryBlocked = false
    @Published private(set) var recoveryWarning = false
    @Published private(set) var problem: Error?
    @Published private(set) var galleryProblem: Error?
    @Published var stage = "BEFORE"
    @Published var visibility = "INTERNAL"
    @Published var caption = ""
    @Published var retentionPurpose = ""
    @Published var privacyAccepted = false
    @Published var redactionConfirmed = false
    @Published private(set) var kind = "site"
    private let client: ERPConsoleClient
    private let initialContext: ERPMediaContext?
    private var ticket: ERPMediaTicket?
    private var picker: ERPMediaTicket?
    private var epoch = 0

    init(client: ERPConsoleClient, initialRecord: ERPItem? = nil) {
        self.client = client
        initialContext = initialRecord.flatMap { try? ERPMediaContext(record: $0) }
        kind = initialContext?.kind ?? "site"
    }
    var frozen: Bool { pending != nil || busy }
    var canSelect: Bool { canUpload && context != nil && !busy && !recoveryBlocked && (pending == nil || pending?.phase == .uploadPending) }
    var canSend: Bool {
        guard canSelect, file != nil, privacyAccepted, let context else { return false }
        if pending != nil { return true }
        let input = ERPMediaInput(siteId: context.siteId, taskId: context.taskId, stage: stage, visibility: visibility,
                                  caption: caption, retentionPurpose: retentionPurpose)
        do { try input.validate(); return true } catch { return false }
    }
    var canRegister: Bool { !busy && !recoveryBlocked && context != nil && pending?.uploadId != nil }
    var fileName: String? { pending?.fileName ?? file?.fileName }
    var fileSize: Int? { pending?.byteSize ?? file?.bytes.count }
    var visibleGallery: [ERPItem] {
        guard let context else { return gallery }
        return gallery.filter {
            $0.data["siteId"]?.string == context.siteId && (context.taskId == nil || $0.data["taskId"]?.string == context.taskId)
        }
    }
    private func current(_ value: Int, _ captured: ERPMediaTicket) -> Bool {
        guard epoch == value, ticket?.id == captured.id else { return false }
        do { try captured.check(); return true }
        catch { stop(); problem = error; return false }
    }
    private func checked(_ value: Int, _ captured: ERPMediaTicket) async throws {
        guard current(value, captured) else { throw CancellationError() }
        try await client.checkMedia(captured)
        guard current(value, captured) else { throw CancellationError() }
    }
    private func replaceTicket(_ context: ERPMediaContext?) {
        ticket?.cancel(); picker?.cancel(); picker = nil
        guard let authority else { ticket = nil; return }
        ticket = ERPMediaTicket(authority: authority, context: context)
    }
    func stop() {
        epoch += 1; ticket?.cancel(); picker?.cancel(); ticket = nil; picker = nil
        authority = nil; contexts = []; context = nil; gallery = []; pending = nil; file = nil; receipt = nil
        caption = ""; retentionPurpose = ""; privacyAccepted = false; redactionConfirmed = false
        busy = false; canUpload = false; recoveryBlocked = false; recoveryWarning = false
        problem = nil; galleryProblem = nil; state = .idle
    }
    func start() async {
        stop()
        let revision = epoch; busy = true
        defer { if revision == epoch { busy = false } }
        do {
            let currentAuthority = try await client.mediaSession()
            guard revision == epoch else { return }
            authority = currentAuthority
            if currentAuthority.external { kind = "site"; stage = "DEFECT"; visibility = "INTERNAL" }
            replaceTicket(nil)
            guard let captured = ticket else { return }
            do {
                try await client.mediaCapability(captured)
                try await checked(revision, captured)
                canUpload = true
            } catch {
                try await checked(revision, captured)
                canUpload = false
                if (error as? ERPMediaFailure) != .noUploadPermission { problem = error }
            }
            do {
                let saved = try await client.pendingMedia()
                try await checked(revision, captured)
                let command = try await client.pendingCommand()
                try await checked(revision, captured)
                if let command, command.nativeMedia != true { throw ERPFailure.pendingCommand }
                pending = saved
                if let saved {
                    kind = saved.input.taskId == nil ? "site" : "task"
                    stage = saved.input.stage; visibility = saved.input.visibility
                    caption = saved.input.caption; retentionPurpose = saved.input.retentionPurpose
                    redactionConfirmed = saved.redactionConfirmed
                    state = screenState(saved.phase)
                    if saved.phase == .registered { receipt = saved; recoveryWarning = true }
                }
            } catch {
                try await checked(revision, captured)
                recoveryBlocked = true; problem = error
            }
            if canUpload && !recoveryBlocked {
                do {
                    let choices = try await client.mediaContexts(kind: kind, ticket: captured)
                    try await checked(revision, captured)
                    contexts = choices
                    let requestedID = pending.map { $0.input.taskId ?? $0.input.siteId } ?? initialContext?.recordId
                    context = choices.first { $0.recordId == requestedID }
                    if pending != nil && context == nil { recoveryBlocked = true; problem = ERPMediaFailure.contextChanged }
                } catch {
                    try await checked(revision, captured)
                    problem = error
                    if pending != nil { recoveryBlocked = true }
                }
            }
            replaceTicket(context)
            await refreshGallery()
        } catch {
            guard revision == epoch else { return }
            problem = error; canUpload = false; recoveryBlocked = true
            file = nil; gallery = []; contexts = []; context = nil
        }
    }
    private func screenState(_ phase: ERPMediaPhase) -> ERPMediaScreenState {
        switch phase {
        case .uploadPending: return .uploadUnknown
        case .uploaded: return .uploaded
        case .registerPending: return .registerUnknown
        case .registered: return .registered
        }
    }
    func chooseKind(_ next: String) async {
        guard !frozen, !recoveryBlocked, ["site", "task"].contains(next), let authority,
              !authority.external || next == "site" else { return }
        kind = next; context = nil; contexts = []; file = nil; receipt = nil; privacyAccepted = false; problem = nil
        replaceTicket(nil)
        guard let captured = ticket else { return }
        let revision = epoch; busy = true
        defer { if revision == epoch { busy = false } }
        do {
            let choices = try await client.mediaContexts(kind: next, ticket: captured)
            try await checked(revision, captured)
            contexts = choices
        } catch { if current(revision, captured) { problem = error } }
    }
    func chooseContext(_ id: String) {
        guard !frozen, !recoveryBlocked else { return }
        context = contexts.first { $0.id == id }; file = nil; receipt = nil; privacyAccepted = false; redactionConfirmed = false
        state = .idle; problem = nil; replaceTicket(context)
    }
    func beginSelection() async throws -> ERPMediaTicket {
        guard canSelect, let context, let captured = ticket else { throw ERPMediaFailure.missingSelection }
        let revision = epoch
        let choices = try await client.mediaContexts(kind: context.kind, ticket: captured)
        try await checked(revision, captured)
        guard choices.contains(where: { $0.recordId == context.recordId && $0.siteId == context.siteId }) else { throw ERPMediaFailure.contextChanged }
        picker?.cancel()
        let next = ERPMediaTicket(authority: captured.authority, context: context)
        picker = next; file = nil; privacyAccepted = false; problem = nil
        return next
    }
    func accept(_ selected: ERPMediaFile, selection: ERPMediaTicket) async throws {
        guard let captured = ticket, picker?.id == selection.id, captured.context == selection.context else { throw CancellationError() }
        let revision = epoch
        try await client.checkMedia(selection); try await checked(revision, captured)
        guard picker?.id == selection.id else { throw CancellationError() }
        if captured.authority.external && selected.mimeType == "application/pdf" { throw ERPMediaFailure.unsupportedType }
        if let pending {
            guard pending.phase == .uploadPending, selected.sha256 == pending.sha256,
                  selected.bytes.count == pending.byteSize, selected.mimeType == pending.mimeType else { throw ERPMediaFailure.differentFile }
        }
        file = selected; privacyAccepted = false; state = pending == nil ? .selected : .uploadUnknown; problem = nil
    }
    func beginRead(selection: ERPMediaTicket) throws {
        guard picker?.id == selection.id, !busy, pending == nil || pending?.phase == .uploadPending else { throw CancellationError() }
        try selection.check()
        file = nil; privacyAccepted = false; receipt = nil
        if pending == nil { state = .idle; redactionConfirmed = false }
    }
    func cancelSelection() { picker?.cancel(); picker = nil; file = nil; privacyAccepted = false }
    func show(_ error: Error) {
        if authority != nil, !(error is CancellationError) { problem = error }
    }
    func upload() async {
        guard canSend, let file, let context, let captured = ticket else { return }
        let revision = epoch; busy = true; problem = nil; state = .uploading
        defer { if revision == epoch { busy = false } }
        do {
            let input = ERPMediaInput(siteId: context.siteId, taskId: context.taskId, stage: stage, visibility: visibility,
                                      caption: caption, retentionPurpose: retentionPurpose)
            let next = try pending ?? ERPMediaPending(file: file, authority: captured.authority, input: input, redactionConfirmed: redactionConfirmed)
            let result = try await client.uploadMedia(file, pending: next, ticket: captured)
            try await checked(revision, captured)
            pending = result.pending; recoveryWarning = result.recoveryWarning; state = .uploaded
            self.file = nil // A known upload never needs the original bytes again.
        } catch {
            guard current(revision, captured) else { return }
            do {
                let saved = try await client.pendingMedia()
                try await checked(revision, captured)
                pending = saved; state = saved.map { screenState($0.phase) } ?? .selected
                problem = error
            } catch { if current(revision, captured) { problem = error; recoveryBlocked = true; self.file = nil } }
        }
    }
    func register() async {
        guard canRegister, let pending, let captured = ticket else { return }
        let revision = epoch; busy = true; problem = nil; state = .registering
        defer { if revision == epoch { busy = false } }
        do {
            let result = try await client.registerMedia(pending, ticket: captured)
            try await checked(revision, captured)
            receipt = result.pending; recoveryWarning = result.recoveryWarning; state = .registered
            self.pending = result.recoveryWarning ? result.pending : nil
            file = nil; privacyAccepted = false; redactionConfirmed = false
            // A follow-up read failure is separate from the already known receipt.
            await refreshGallery()
        } catch {
            guard current(revision, captured) else { return }
            do {
                let saved = try await client.pendingMedia()
                try await checked(revision, captured)
                self.pending = saved; state = saved.map { screenState($0.phase) } ?? .uploaded; problem = error
            } catch { if current(revision, captured) { problem = error; recoveryBlocked = true } }
        }
    }
    func refreshGallery() async {
        guard let captured = ticket else { return }
        let revision = epoch
        do {
            let records = try await client.mediaGallery(captured)
            try await checked(revision, captured)
            gallery = records; galleryProblem = nil
        } catch { if current(revision, captured) { gallery = []; galleryProblem = error } }
    }
    func download(_ asset: ERPItem) async throws -> (ERPMediaDownload, ERPMediaTicket) {
        guard !busy, let captured = ticket else { throw ERPFailure.commandInFlight }
        let revision = epoch; busy = true
        defer { if revision == epoch { busy = false } }
        let result = try await client.downloadMedia(asset, ticket: captured)
        try await checked(revision, captured)
        return (result, captured)
    }
    func isCurrent(_ captured: ERPMediaTicket) -> Bool { current(epoch, captured) }
}
