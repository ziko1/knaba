import Foundation

/// Canonical command identifiers remain unchanged; labels reuse the six Android translations.
enum ERPActionLabels {
    static func title(_ command: String, language: NativeLanguage, includeModule: Bool = false) -> String {
        let key: ERPText
        switch command {
        case "task.start": key = .startTask
        case "task.worklog": key = .logWork
        case "task.submit": key = .submitTask
        case "task.checklist": key = .checklist
        case "task.review": key = .reviewTask
        case "user.password.rotate": key = .changePassword
        case "user.mfa.configure": key = .configureMFA
        case "customer.portal": key = .clientPortal
        case "request.submit", "request.batch.submit", "payout.submit", "order.submit", "issue.submit": key = .actionSubmit
        case "quote.approve", "payout.approve", "report.approve", "procurement.approve": key = .actionApprove
        case "request.approve", "request.batch.approve", "timesheet.review", "report.review", "order.review", "trip.approve": key = .actionReview
        case "request.close", "request.batch.close", "procurement.close": key = .actionClose
        case "request.ack", "payout.ack", "report.ack": key = .actionReceipt
        case "payout.ack_amend": key = .actionReceiptAmend
        case "quote.send": key = .actionSend
        case "quote.accept", "crew_assignment.acknowledge": key = .actionAccept
        case "quote.reject", "crew_assignment.decline": key = .actionDecline
        case "quote.expire", "crew_assignment.expire": key = .actionExpire
        case "crew_assignment.start": key = .actionStart
        case "dispatch.reschedule": key = .actionReschedule
        case "order.confirm": key = .actionConfirm
        case "order.link_site", "issue.link_work": key = .actionLink
        case "order.transition": key = .actionStatus
        case "timesheet.lock": key = .actionLock
        case "timesheet.correction": key = .actionCorrect
        case "timesheet.correction.bulk": key = .actionCorrectBulk
        case "payout.cancel": key = .actionCancel
        case "payout.record": key = .actionRecordPayment
        case "payout.reconcile", "procurement.reconcile": key = .actionReconcile
        case "payout.reverse": key = .actionReverse
        case "procurement.order": key = .actionOrder
        case "procurement.receive": key = .actionReceive
        case "procurement.confirm_delivery", "report.delivered": key = .actionDelivery
        case "report.refresh": key = .actionRefresh
        case "report.publish": key = .actionPublish
        case "report.revise": key = .actionRevise
        case "issue.qualify": key = .actionClassify
        case "issue.resolve": key = .actionResolve
        case "issue.reopen": key = .actionReopen
        case "trip.destination": key = .actionDestination
        case "trip.stop": key = .actionStop
        case "trip.resume": key = .actionResume
        case "trip.arrive": key = .actionArrive
        case "trip.end": key = .actionEnd
        default: return command
        }
        let label = ERPStrings.text(key, language)
        if includeModule, let kind = ERPRecordActions.kind(for: command), kind != "task",
           let module = ERPWorkspacePolicy.allModules.first(where: { $0.kind == kind }) {
            return ERPStrings.text(module.title, language) + " · " + label
        }
        return label
    }
    static func field(_ name: String, language: NativeLanguage) -> String {
        let key: ERPText
        switch name {
        case "name", "title": key = .fieldName
        case "text", "description": key = .fieldDescription
        case "status", "state": key = .fieldStatus
        case "phone": key = .fieldPhone
        case "address": key = .fieldAddress
        case "taskId", "task_id": key = .taskId
        case "quantityMilli": key = .quantity
        case "remainingQuantityMilli": key = .remainingQuantity
        case "problems": key = .problems
        case "delayReason": key = .delayReason
        case "currentPassword": key = .currentPassword
        case "newPassword": key = .newPassword
        case "plannedQuantityMilli": key = .plannedQuantity
        case "reportedQuantityMilli": key = .reportedQuantity
        case "acceptedQuantityMilli": key = .acceptedQuantity
        case "id": key = .recordId
        case "email": key = .email
        case "siteId", "site_id": key = .sites
        case "employeeId": key = .employees
        case "quoteVersion", "scheduleVersion": key = .version
        default: return name
        }
        return ERPStrings.text(key, language)
    }
}
