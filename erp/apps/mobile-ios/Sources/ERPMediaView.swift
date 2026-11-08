import SwiftUI
import PhotosUI
import CoreTransferable
import UniformTypeIdentifiers

private struct ERPMediaPhoto: Transferable {
    let file: ERPMediaFile
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image, shouldAttemptToOpenInPlace: false) { received in
            // The system-owned URL is valid only in this closure. Read bounded
            // original bytes here; never save a URI, bookmark or copied file.
            let source = received.file
            let file = try await Task.detached(priority: .userInitiated) {
                try ERPMediaFile.read(source, securityScoped: false)
            }.value
            return ERPMediaPhoto(file: file)
        }
    }
}

struct ERPMediaExportDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.jpeg, .pdf]
    private let data: Data
    private let ticket: ERPMediaTicket
    init(data: Data, ticket: ERPMediaTicket) throws {
        guard data.count <= ERPMediaLimits.download else { throw ERPFailure.tooLarge }
        try ticket.check()
        self.data = data; self.ticket = ticket
    }
    init(configuration: ReadConfiguration) throws { throw ERPMediaFailure.unsupportedType }
    func currentBytes() throws -> Data {
        try ticket.check()
        guard data.count <= ERPMediaLimits.download else { throw ERPFailure.tooLarge }
        return data
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: try currentBytes()) }
}

private struct ERPMediaGalleryGroup: Hashable {
    let site: String
    let task: String?
    let day: String?
    let stage: String
    init(_ asset: ERPItem) {
        site = asset.data["siteId"]?.string ?? "—"
        task = asset.data["taskId"]?.string
        let raw = asset.data["uploadedAt"]?.string ?? asset.createdAt ?? ""
        day = raw.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T", options: .regularExpression) == nil ? nil : String(raw.prefix(10))
        stage = asset.data["stage"]?.string ?? ""
    }
    var order: String { [site, task ?? "", day ?? "", stage].joined(separator: "\u{001f}") }
}

/// System pickers grant access only to explicit selections. A queue retains
/// identifiers in this view's RAM, loads one file at a time and never auto-sends.
@MainActor struct ERPMediaView: View {
    @ObservedObject private var console: ERPConsoleModel
    @StateObject private var model: ERPMediaModel
    @State private var photosPresented = false
    @State private var filesPresented = false
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var photoQueue: [PhotosPickerItem] = []
    @State private var fileQueue: [URL] = []
    @State private var queuePosition = 0
    @State private var queueCount = 0
    @State private var selectionTicket: ERPMediaTicket?
    @State private var readOperation: Task<Void, Never>?
    @State private var readID: UUID?
    @State private var reading = false
    @State private var preparingPicker = false
    @State private var mutationTask: Task<Void, Never>?
    @State private var mutationID: UUID?
    @State private var exportDocument: ERPMediaExportDocument?
    @State private var exportType: UTType = .jpeg
    @State private var exportName = "KNABA"
    @State private var exportTicket: ERPMediaTicket?
    @State private var exportViewTicket: ERPMediaTicket?
    @State private var downloadTask: Task<Void, Never>?
    @State private var exportRequestID: UUID?
    @State private var exporting = false
    @State private var exportNotice = false

    init(console: ERPConsoleModel, initialRecord: ERPItem? = nil) {
        self.console = console
        _model = StateObject(wrappedValue: ERPMediaModel(client: console.mediaClient, initialRecord: initialRecord))
    }
    private func text(_ key: ERPMediaText) -> String { ERPMediaStrings.text(key, console.language) }
    private func caption(_ asset: ERPItem) -> String {
        let value = asset.data["caption"]?.string ?? ""
        return value.isEmpty ? asset.id : value
    }
    private func status(_ asset: ERPItem) -> String {
        switch asset.data["state"]?.string {
        case "RECEIVED": return text(.received)
        case "APPROVED_FOR_CLIENT": return text(.approved)
        default: return text(.unconfirmed)
        }
    }
    private var hasNext: Bool { !photoQueue.isEmpty || !fileQueue.isEmpty }
    private var selecting: Bool { reading || preparingPicker || photosPresented || filesPresented }
    private var groups: [(key: ERPMediaGalleryGroup, assets: [ERPItem])] {
        Dictionary(grouping: model.visibleGallery, by: ERPMediaGalleryGroup.init)
            .map { (key: $0.key, assets: $0.value) }.sorted { $0.key.order < $1.key.order }
    }
    var body: some View {
        let capturedPicker = selectionTicket
        let capturedExport = exportRequestID
        Form {
            Section { Text(text(.intro)).font(.footnote); Text(text(.limits)).font(.caption).foregroundStyle(.secondary) }
            if model.busy || selecting { ProgressView(text(model.state == .uploading ? .uploading : model.state == .registering ? .registering : .loading)) }
            if let error = model.problem { Section { Text(ERPMediaStrings.error(error, console.language)).foregroundStyle(.red).accessibilityIdentifier("erpMediaError") } }
            if model.recoveryBlocked { Section { Text(text(.recoveryBlocked)).foregroundStyle(.orange) } }
            if model.canUpload { contextSection; selectionSection; metadataSection; stateSection }
            Section {
                Button(text(.refresh), systemImage: "arrow.clockwise") {
                    clearSelection(); clearMutation(); clearExport(); model.stop()
                    Task { await model.start() }
                }.disabled(model.busy || selecting).accessibilityIdentifier("erpMediaRefresh")
                Button(text(.cancel), role: .cancel) {
                    clearSelection(); clearMutation(); clearExport(); model.stop()
                }.accessibilityIdentifier("erpMediaCancel")
                Text(text(.unknown)).font(.caption).foregroundStyle(.secondary)
            }
            gallerySections
        }
        .navigationTitle(text(.title))
        .privacySensitive()
        .task { await model.start() }
        .onDisappear { clearSelection(); clearMutation(); clearExport(); model.stop() }
        .photosPicker(isPresented: $photosPresented, selection: photoSelection(capturedPicker), maxSelectionCount: ERPMediaLimits.selection,
                      selectionBehavior: .ordered, matching: .images, preferredItemEncoding: .current)
        .fileImporter(isPresented: $filesPresented, allowedContentTypes: model.authority?.external == true ? [.jpeg, .png, .webP] : [.jpeg, .png, .webP, .pdf],
                      allowsMultipleSelection: true, onCompletion: { result in
            guard let capturedPicker, selectionTicket?.id == capturedPicker.id else { return }
            switch result {
            case .success(let urls):
                guard !urls.isEmpty, urls.count <= ERPMediaLimits.selection, selectionTicket != nil else {
                    clearSelection(); model.show(ERPFailure.tooLarge); return
                }
                photoQueue = []; fileQueue = urls; queuePosition = 0; queueCount = urls.count; loadNext()
            case .failure(let error): clearSelection(); model.show(error)
            }
        }, onCancellation: {
            if let capturedPicker, selectionTicket?.id == capturedPicker.id { clearSelection() }
        })
        .fileExporter(isPresented: $exporting, document: exportDocument, contentTypes: [exportType], defaultFilename: exportName,
                      onCompletion: { result in
            guard let capturedExport, capturedExport == exportRequestID else { return }
            defer { clearExport() }
            guard let captured = exportTicket, let original = exportViewTicket, model.isCurrent(original) else { return }
            do { try captured.check() } catch { return }
            switch result { case .success: exportNotice = true; case .failure(let error): model.show(error) }
        }, onCancellation: {
            if let capturedExport, capturedExport == exportRequestID { clearExport() }
        })
    }
    private var contextSection: some View {
        Section(text(.context)) {
            if model.authority?.external == true { Text(text(.externalNotice)).font(.caption) }
            Picker(text(.context), selection: Binding(get: { model.kind }, set: { next in
                clearSelection(); clearExport(); Task { await model.chooseKind(next) }
            })) {
                Text(text(.site)).tag("site")
                if model.authority?.external != true { Text(text(.task)).tag("task") }
            }.disabled(model.frozen || selecting || model.recoveryBlocked)
            Picker(text(.chooseContext), selection: Binding(get: { model.context?.id ?? "" }, set: { id in
                clearSelection(); clearExport(); model.chooseContext(id)
            })) {
                Text(text(.chooseContext)).tag("")
                ForEach(model.contexts) { context in Text(context.title + " · " + context.recordId).tag(context.id) }
            }.disabled(model.frozen || selecting || model.recoveryBlocked).accessibilityIdentifier("erpMediaContext")
            if let context = model.context {
                LabeledContent(text(.site), value: context.siteId)
                if let taskId = context.taskId { LabeledContent(text(.task), value: taskId) }
            }
        }
    }
    private var selectionSection: some View {
        Section(text(.selected)) {
            if model.pending?.phase == .uploadPending && model.file == nil { Text(text(.reselect)).font(.caption) }
            Button(text(.photos), systemImage: "photo.on.rectangle") { preparePicker(photos: true) }
                .disabled(!model.canSelect || selecting).accessibilityIdentifier("erpMediaPhotos")
            Button(text(.files), systemImage: "folder") { preparePicker(photos: false) }
                .disabled(!model.canSelect || selecting).accessibilityIdentifier("erpMediaFiles")
            if let name = model.fileName { Text(name).font(.body.weight(.medium)).accessibilityIdentifier("erpMediaFileName") }
            if let size = model.fileSize { Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .binary)).font(.caption) }
            if queueCount > 0 { LabeledContent(text(.queue), value: "\(queuePosition) / \(queueCount)") }
            if hasNext {
                Button(text(.nextFile)) { loadNext() }
                    .disabled(model.pending != nil || model.busy || reading)
                    .accessibilityIdentifier("erpMediaNext")
            }
        }
    }
    private var metadataSection: some View {
        Section(text(.context)) {
            Picker(text(.stage), selection: $model.stage) {
                ForEach(model.authority?.external == true ? ["DEFECT"] : ERPMediaPolicy.stages, id: \.self) {
                    Text(ERPMediaStrings.stage($0, console.language)).tag($0)
                }
            }.disabled(model.frozen || selecting)
            Picker(text(.visibility), selection: $model.visibility) {
                ForEach(model.authority?.external == true ? ["INTERNAL"] : ERPMediaPolicy.visibilities, id: \.self) {
                    Text(ERPMediaStrings.visibility($0, console.language)).tag($0)
                }
            }.disabled(model.frozen || selecting)
            TextField(text(.caption), text: $model.caption, axis: .vertical).lineLimit(2...6)
                .disabled(model.frozen || selecting).accessibilityIdentifier("erpMediaCaption")
            TextField(text(.retention), text: $model.retentionPurpose, axis: .vertical).lineLimit(2...6)
                .disabled(model.frozen || selecting).accessibilityIdentifier("erpMediaRetention")
            Toggle(text(.redaction), isOn: $model.redactionConfirmed).disabled(model.frozen || selecting)
                .accessibilityIdentifier("erpMediaRedaction")
            Text(text(.redactionHelp)).font(.caption).foregroundStyle(.secondary)
            if model.pending == nil || model.pending?.phase == .uploadPending {
                Toggle(text(.privacy), isOn: $model.privacyAccepted).disabled(model.busy || selecting)
                    .accessibilityIdentifier("erpMediaPrivacy")
                Button(text(model.pending == nil ? .upload : .retryUpload)) { runMutation(register: false) }
                    .buttonStyle(.borderedProminent).disabled(!model.canSend || selecting)
                    .accessibilityIdentifier("erpMediaUpload")
            }
        }
    }
    private var stateSection: some View {
        Section(text(.recovery)) {
            if model.state == .uploadUnknown || model.state == .registerUnknown { Text(text(.unknown)).foregroundStyle(.orange) }
            if let pending = model.pending, let uploadId = pending.uploadId {
                Text(text(pending.phase == .registered ? .registered : .uploadReceived)).font(.headline)
                LabeledContent(text(.uploadID), value: uploadId).textSelection(.enabled)
                Button(text(pending.phase == .registered ? .clearRecovery : pending.phase == .registerPending ? .retryRegister : .register)) {
                    runMutation(register: true)
                }.disabled(!model.canRegister || selecting).accessibilityIdentifier("erpMediaRegister")
            }
            if let receipt = model.receipt, let assetId = receipt.assetId {
                Label(text(.registered), systemImage: "checkmark.circle").foregroundStyle(.green)
                    .accessibilityIdentifier("erpMediaReceipt")
                LabeledContent(text(.mediaID), value: assetId).textSelection(.enabled)
                LabeledContent(console.text(.version), value: String(receipt.assetVersion ?? 0))
                LabeledContent(text(.site), value: receipt.input.siteId)
                if let task = receipt.input.taskId { LabeledContent(text(.task), value: task) }
            }
            if model.recoveryWarning { Text(text(.recoveryWarning)).foregroundStyle(.orange).accessibilityIdentifier("erpMediaRecoveryWarning") }
            Text(text(.notAttached)).font(.caption).foregroundStyle(.secondary)
        }
    }
    @ViewBuilder private var gallerySections: some View {
        Section(text(.title)) {
            Button(text(.refresh)) { Task { await model.refreshGallery() } }.disabled(model.busy || selecting)
            Text(text(.exportNotice)).font(.caption).foregroundStyle(.secondary)
            if exportNotice { Text(text(.exported)).foregroundStyle(.green) }
            if let error = model.galleryProblem { Text(ERPMediaStrings.error(error, console.language)).foregroundStyle(.orange) }
            if model.visibleGallery.isEmpty { Text(text(.empty)).foregroundStyle(.secondary) }
        }
        ForEach(groups, id: \.key) { group in
            Section([group.key.site, group.key.task ?? text(.noTask), group.key.day ?? text(.dateUnknown), ERPMediaStrings.stage(group.key.stage, console.language)].joined(separator: " · ")) {
                ForEach(group.assets) { asset in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(caption(asset)).font(.headline)
                        Text(status(asset))
                            .font(.caption).foregroundStyle(.secondary)
                        if asset.data["duplicateOf"]?.string != nil { Label(text(.duplicate), systemImage: "doc.on.doc").font(.caption) }
                        Text(asset.id).font(.caption.monospaced()).textSelection(.enabled)
                        Button(text(.saveCopy), systemImage: "square.and.arrow.down") { saveCopy(asset) }
                            .disabled(model.busy || selecting || exporting).accessibilityIdentifier("erpMediaSaveCopy")
                    }.padding(.vertical, 4)
                }
            }
        }
    }
    private func preparePicker(photos: Bool) {
        guard !preparingPicker else { return }
        clearSelection(); preparingPicker = true
        let request = UUID(); readID = request
        do {
            readOperation = try ERPMediaImportQueue.shared.enqueue {
                defer { if readID == request { preparingPicker = false } }
                guard readID == request else { return }
                do {
                    let captured = try await model.beginSelection()
                    guard readID == request else { captured.cancel(); return }
                    selectionTicket = captured
                    if photos { photosPresented = true } else { filesPresented = true }
                } catch { if readID == request { model.show(error) } }
            }
        } catch {
            if readID == request { preparingPicker = false; model.show(error) }
        }
    }
    private func photoSelection(_ captured: ERPMediaTicket?) -> Binding<[PhotosPickerItem]> {
        Binding(get: { selectedPhotos }, set: { selected in
            guard let captured, selectionTicket?.id == captured.id else { return }
            selectedPhotos = selected
            guard !selected.isEmpty else { return }
            guard selected.count <= ERPMediaLimits.selection else { clearSelection(); model.show(ERPFailure.tooLarge); return }
            photoQueue = selected; fileQueue = []; queuePosition = 0; queueCount = selected.count
            loadNext()
        })
    }
    private func loadNext() {
        guard !reading, hasNext, let captured = selectionTicket, model.pending == nil || model.pending?.phase == .uploadPending else { return }
        do { try model.beginRead(selection: captured) } catch { model.show(error); return }
        let request = UUID(); readID = request; reading = true
        do {
            readOperation = try ERPMediaImportQueue.shared.enqueue {
                defer { if readID == request { reading = false } }
                guard readID == request else { return }
                do {
                    try captured.check()
                    // Keep pending identifiers in the cancellable view's
                    // bounded queue until admission; an overflow loses none.
                    let photo = photoQueue.isEmpty ? nil : photoQueue.removeFirst()
                    let url = photo == nil && !fileQueue.isEmpty ? fileQueue.removeFirst() : nil
                    queuePosition += 1
                    let file: ERPMediaFile
                    if let photo {
                        guard let received = try await photo.loadTransferable(type: ERPMediaPhoto.self) else { throw ERPMediaFailure.fileUnavailable }
                        file = received.file
                    } else if let url {
                        file = try await Task.detached(priority: .userInitiated) { try ERPMediaFile.read(url, securityScoped: true, ticket: captured) }.value
                    } else { throw ERPMediaFailure.missingSelection }
                    guard readID == request else { return }
                    try await model.accept(file, selection: captured)
                } catch { if readID == request { model.show(error) } }
                // The local file and any stale result are released before
                // this operation returns and the next import is admitted.
            }
        } catch {
            if readID == request { reading = false; model.show(error) }
        }
    }
    private func clearSelection() {
        // Cancel only the view's waiter. The process-wide queue keeps the actual
        // provider worker until it drains, including after this view disappears.
        readID = nil; readOperation?.cancel(); readOperation = nil
        selectionTicket?.cancel(); selectionTicket = nil; model.cancelSelection()
        selectedPhotos = []; photoQueue = []; fileQueue = []; queueCount = 0; queuePosition = 0
        reading = false; preparingPicker = false; photosPresented = false; filesPresented = false
    }
    private func runMutation(register: Bool) {
        guard mutationTask == nil else { return }
        let id = UUID(); mutationID = id
        mutationTask = Task {
            if register { await model.register() } else { await model.upload() }
            if mutationID == id { mutationTask = nil; mutationID = nil }
        }
    }
    private func clearMutation() { mutationID = nil; mutationTask?.cancel(); mutationTask = nil }
    private func saveCopy(_ asset: ERPItem) {
        clearExport(); exportNotice = false
        let request = UUID(); exportRequestID = request
        downloadTask = Task {
            defer { if exportRequestID == request { downloadTask = nil } }
            do {
                let (download, captured) = try await model.download(asset)
                guard exportRequestID == request, !Task.isCancelled, model.isCurrent(captured) else { return }
                let dedicated = ERPMediaTicket(authority: captured.authority, context: captured.context)
                exportDocument = try ERPMediaExportDocument(data: download.bytes, ticket: dedicated)
                exportType = download.mimeType == "application/pdf" ? .pdf : .jpeg
                // Never use a server-provided filename or identifier as a path.
                exportName = "KNABA-" + UUID().uuidString + (download.mimeType == "application/pdf" ? ".pdf" : ".jpg")
                exportViewTicket = captured; exportTicket = dedicated; exporting = true
            } catch { if exportRequestID == request { model.show(error) } }
        }
    }
    private func clearExport() {
        exportRequestID = nil; downloadTask?.cancel(); downloadTask = nil
        exportTicket?.cancel(); exporting = false; exportDocument = nil; exportTicket = nil; exportViewTicket = nil
    }
}
