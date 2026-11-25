import SwiftUI

@MainActor struct ERPPartnerOrdersView: View {
    @ObservedObject var model: ERPConsoleModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(model.text(.orders)).font(.title.bold()).accessibilityAddTraits(.isHeader)
                if model.busy {
                    ProgressView(model.text(.loading)).accessibilityIdentifier("partnerOrdersLoading")
                } else if !model.problem.isEmpty {
                    KNABAStatusNotice(text: model.problem, kind: .error)
                    refresh
                } else if let detail = model.partnerDetail {
                    KNABACard(title: detail.id, icon: "doc.text") {
                        LabeledContent(model.text(.fieldStatus), value: model.text(statusLabel(detail.status)))
                        LabeledContent(model.text(.partnerUpdated), value: detail.updatedAt.formatted(
                            Date.FormatStyle(date: .abbreviated, time: .shortened, locale: Locale(identifier: model.language.rawValue),
                                             timeZone: TimeZone(identifier: "Europe/Berlin") ?? .gmt)))
                    }
                    Button(model.text(.partnerBack)) { Task { await model.returnToPartnerPage() } }
                        .buttonStyle(KNABAButtonStyle(emphasis: .secondary))
                } else if let page = model.partnerPage {
                    if page.items.isEmpty {
                        KNABAEmptyState(title: model.text(.partnerEmpty), icon: "tray")
                    } else {
                        ForEach(page.items, id: \.opaqueID) { order in
                            Button {
                                Task { await model.loadPartnerOrders(orderID: order.id) }
                            } label: {
                                KNABANavigationRow(title: order.id, icon: "doc.text", subtitle: model.text(statusLabel(order.status)))
                            }.buttonStyle(.plain)
                        }
                    }
                    if let next = page.nextAfter {
                        Button(model.text(.partnerNext)) { Task { await model.loadPartnerOrders(after: next) } }
                            .buttonStyle(KNABAButtonStyle()).accessibilityIdentifier("partnerNextPage")
                    }
                    refresh
                } else {
                    refresh
                }
            }
            .frame(maxWidth: 840, alignment: .leading).padding(16).frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("partnerOrders")
        .refreshable { await model.reloadSession() }
        .task {
            // Check the displayed projection while visible; discard it immediately on lifecycle changes.
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                await model.revalidatePartnerPresentation()
            }
        }
    }

    private var refresh: some View {
        Button { Task { await model.reloadSession() } } label: {
            Label(model.text(.refresh), systemImage: "arrow.clockwise")
        }.buttonStyle(KNABAButtonStyle(emphasis: .secondary))
    }

    private func statusLabel(_ value: String) -> ERPText {
        switch value {
        case "PENDING_OPERATIONS": return .partnerPending
        case "CONFIRMED": return .partnerConfirmed
        case "SCHEDULED": return .partnerScheduled
        case "IN_PROGRESS": return .partnerInProgress
        case "WORK_SUBMITTED": return .partnerSubmitted
        case "CLIENT_REVIEW": return .partnerReview
        case "CLOSED": return .partnerClosed
        case "PAUSED": return .partnerPaused
        case "CANCELLED": return .partnerCancelled
        case "DISPUTED": return .partnerDisputed
        default: return .partnerUnknown
        }
    }
}

private extension ERPPartnerOrder {
    // ERP IDs are byte-exact. Swift String equality normalizes equivalent Unicode.
    var opaqueID: Data { Data(id.utf8) }
}
