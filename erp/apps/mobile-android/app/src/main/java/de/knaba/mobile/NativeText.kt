package de.knaba.mobile

import android.content.Context
import java.io.IOException

class NativeActionFailure(val textId: Int) : Exception()

object NativeText {
    fun mode(context: Context, mode: String): String = context.getString(when(mode) {
        "SITE_PRESENCE" -> R.string.mode_presence
        "BUSINESS_TRAVEL" -> R.string.mode_travel
        "PRIVATE_BREAK" -> R.string.mode_break
        else -> R.string.mode_off
    })
    fun activity(context: Context, activity: String): String = context.getString(when(activity) {
        "WORKING" -> R.string.activity_working
        "ON_BREAK" -> R.string.activity_break
        "TRAVELLING" -> R.string.activity_travel
        "AWAY_PENDING_REASON" -> R.string.activity_away
        "WAITING_WORK" -> R.string.activity_waiting
        "SERVICE_TASK" -> R.string.activity_service
        "OFF_DUTY" -> R.string.activity_off
        else -> R.string.activity_unknown
    })
    fun reason(context: Context, code: String): String = context.getString(when(code) {
        "NO_ACTIVE_SHIFT" -> R.string.shift_none
        "GPS_LEGAL_GATE_CLOSED" -> R.string.reason_policy
        "TRACKING_LEASE_EXPIRED", "SESSION_EXPIRED", "INVALID_SESSION_LEASE" -> R.string.reason_expired
        "GEOFENCE_NOT_CONFIGURED" -> R.string.reason_geofence
        "ACCESS_REVOKED", "ACCESS_DENIED", "NEEDS_REAUTH", "UNAUTHENTICATED", "AUTH_GENERATION_CHANGED" -> R.string.error_access
        "PERMISSION_REVOKED" -> R.string.notification_permission_denied
        "OFFLINE_PENDING_SYNC", "LOCATION_UNKNOWN" -> R.string.reason_offline
        "OFFLINE_QUEUE_FULL" -> R.string.error_queue_full
        "LOCAL_RETENTION_EXPIRED" -> R.string.reason_retention
        "USER_STOPPED", "APP_CLOSED", "PRIVATE_BREAK", "SERVER_PAUSED" -> R.string.status_off
        else -> R.string.error_action
    })
    fun error(context: Context, error: Exception): String {
        if (error is NativeActionFailure) return context.getString(error.textId)
        if (error is IOException) return context.getString(R.string.error_connection)
        val code = if (error is ApiFailure) error.code else error.message ?: ""
        val resource = when(code) {
            "HTTPS_ORIGIN_REQUIRED" -> R.string.error_origin
            "SIGN_OUT_BEFORE_ORIGIN_CHANGE" -> R.string.error_origin_change
            "ENROLLMENT_REQUIRES_SIGN_OUT" -> R.string.error_enrollment_change
            "SYNC_OR_RECONCILE_QUEUE_BEFORE_ENROLLMENT" -> R.string.error_queue_sync
            "RESPONSE_TOO_LARGE" -> R.string.error_response
            "FOREIGN_DEVICE_SESSION" -> R.string.error_foreign_session
            "INVALID_SESSION_LEASE" -> R.string.reason_expired
            "INVALID_TRACKING_MODE", "SESSION_REQUIRED" -> R.string.error_session
            "EVENT_ACK_MISSING", "EVENT_ACK_INVALID", "EVENT_ACK_MISMATCH", "EVENT_REJECTED" -> R.string.error_ack
            "SECURE_STORAGE_INVALID" -> R.string.error_storage
            "OFFLINE_QUEUE_FULL" -> R.string.error_queue_full
            "ACCESS_DENIED", "NEEDS_REAUTH", "UNAUTHENTICATED", "NOT_FOUND_SAFE", "ENROLLMENT_CANCELLED", "AUTH_GENERATION_CHANGED" -> R.string.error_access
            "VERSION_CONFLICT", "INVALID_STATE" -> R.string.error_conflict
            "VALIDATION_ERROR" -> R.string.error_validation
            "HTTP_ERROR" -> R.string.error_connection
            else -> if (error is ApiFailure && error.status in setOf(401,403)) R.string.error_access else R.string.error_action
        }
        // Never display arbitrary server bodies, credentials or raw exception text.
        return context.getString(resource)
    }
}
