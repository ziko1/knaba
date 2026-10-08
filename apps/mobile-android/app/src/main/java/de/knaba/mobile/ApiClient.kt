package de.knaba.mobile

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.io.ByteArrayOutputStream

class ApiFailure(val code: String, val status: Int) : Exception(code)
class ApiClient(private val store: SecureStore, private val generation: Long = store.generation()) {
    companion object { private val syncLock = Any() }
    fun configure(origin: String) {
        store.requireGeneration(generation)
        val uri = URI(origin.trim().trimEnd('/'))
        require(uri.scheme == "https" && uri.host != null && uri.rawUserInfo == null && uri.query == null && uri.fragment == null && (uri.path == "" || uri.path == "/")) { "HTTPS_ORIGIN_REQUIRED" }
        val previous = store.read()
        require(!previous.has("deviceToken") || previous.optString("origin") == uri.toString().trimEnd('/')) { "SIGN_OUT_BEFORE_ORIGIN_CHANGE" }
        store.updateForGeneration(generation) { it.put("origin", uri.toString().trimEnd('/')) }
    }
    private fun call(path: String, body: JSONObject? = null, authenticated: Boolean = true): JSONObject {
        store.requireGeneration(generation)
        val state = store.read(); val origin = state.getString("origin")
        val connection = URL(origin + path).openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false; connection.connectTimeout = 15000; connection.readTimeout = 15000
        connection.requestMethod = if (body == null) "GET" else "POST"
        connection.setRequestProperty("Accept", "application/json")
        if (authenticated) connection.setRequestProperty("Authorization", "Bearer " + state.getString("deviceToken"))
        try {
            if (body != null) {
                connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes = stream?.use { input ->
                val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { val count = input.read(buffer); if (count < 0) break; require(output.size() + count <= 2 * 1024 * 1024) { "RESPONSE_TOO_LARGE" }; output.write(buffer, 0, count) }
                output.toByteArray()
            } ?: byteArrayOf()
            require(bytes.size <= 2 * 1024 * 1024) { "RESPONSE_TOO_LARGE" }
            val response = if (bytes.isEmpty()) JSONObject() else JSONObject(String(bytes, Charsets.UTF_8))
            store.requireGeneration(generation)
            if (status !in 200..299) throw ApiFailure(response.optString("code", "HTTP_ERROR"), status)
            return response
        } finally { connection.disconnect() }
    }
    fun enroll(code: String) {
        val before = store.read()
        require(!before.has("deviceToken")) { "ENROLLMENT_REQUIRES_SIGN_OUT" }
        require((before.optJSONArray("queue") ?: JSONArray()).length() == 0) { "SYNC_OR_RECONCILE_QUEUE_BEFORE_ENROLLMENT" }
        val response = call("/api/v1/mobile/enroll", JSONObject().put("code", code).put("platform", "ANDROID").put("deviceName", "Android KNABA DE"), false)
        store.updateForGeneration(generation) { state ->
            // Logout or another enrollment must fence an older network response.
            require(state.optString("origin") == before.optString("origin") && state.optString("deviceToken") == before.optString("deviceToken") && state.optString("deviceId") == before.optString("deviceId")) { "ENROLLMENT_CANCELLED" }
            state.put("deviceToken", response.getString("deviceToken")).put("deviceId", response.getString("deviceId")).put("employeeId", response.getString("employeeId"))
            store.rotateGeneration()
        }
    }
    fun session(): JSONObject {
        val session = call("/api/v1/mobile/session")
        require(session.getString("deviceId") == store.read().getString("deviceId")) { "FOREIGN_DEVICE_SESSION" }
        val expiry = Instant.parse(session.getString("expiresAt"))
        require(NativeTrackingPolicy.validLease(System.currentTimeMillis(), expiry.toEpochMilli())) { "INVALID_SESSION_LEASE" }
        require(session.getString("mode") in setOf("OFF", "PRIVATE_BREAK", "SITE_PRESENCE", "BUSINESS_TRAVEL")) { "INVALID_TRACKING_MODE" }
        if (session.getString("mode") in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL")) require(session.optString("trackingSessionId").isNotEmpty()) { "TRACKING_LEASE_REQUIRED" }
        if (session.getString("mode") == "SITE_PRESENCE") require(session.optString("geofenceVersionId").isNotEmpty() && session.optJSONObject("siteGeofence")?.optString("algorithmVersion") == "GEOFENCE_V1") { "GEOFENCE_VERSION_REQUIRED" }
        if (session.getString("mode") == "BUSINESS_TRAVEL") require(session.optString("tripId").isNotEmpty()) { "TRIP_LEASE_REQUIRED" }
        store.requireGeneration(generation)
        return session
    }
    fun sync(): Int = synchronized(syncLock) {
        store.withGeneration(generation) { store.expireLocationEvents() }
        val queue = store.read().optJSONArray("queue") ?: JSONArray(); var completed = 0
        for (i in 0 until queue.length()) {
            val item = queue.getJSONObject(i)
            try {
                if (item.getString("kind") == "COMMAND") {
                    val result = call("/api/v1/commands", JSONObject().put("command", item.getString("command")).put("input", item.getJSONObject("input")).put("idempotency_key", item.getString("id")))
                    store.updateForGeneration(generation) {
                        if (item.getString("command") == "trip.start") it.put("manualTripId", result.getString("id"))
                        if (item.getString("command") in setOf("trip.arrive", "trip.end", "shift.end")) it.remove("manualTripId")
                    }
                } else {
                    val response = call("/api/v1/mobile/events", JSONObject().put("events", JSONArray().put(JSONObject().put("command", item.getString("command")).put("input", item.getJSONObject("input")))))
                    val results = response.optJSONArray("results") ?: error("EVENT_ACK_MISSING")
                    require(results.length() == 1 && response.optInt("apiVersion") == 1) { "EVENT_ACK_INVALID" }
                    val receipt = results.getJSONObject(0)
                    require(receipt.optString("eventId") == item.getJSONObject("input").getString("eventId") && receipt.optString("status") in setOf("ACCEPTED", "REJECTED", "REVIEW")) { "EVENT_ACK_MISMATCH" }
                    if (receipt.getString("status") != "ACCEPTED") store.withGeneration(generation) { store.reject(item, receipt.optString("code", if (receipt.getString("status") == "REVIEW") "EVENT_REVIEW_REQUIRED" else "EVENT_REJECTED")) }
                }
                store.withGeneration(generation) { store.remove(setOf(item.getString("id"))) }; completed++
            } catch (error: ApiFailure) {
                if (error.status in setOf(401, 403)) {
                    store.updateForGeneration(generation) { it.put("trackingEnabled", false).put("lastError", error.code) }; throw error
                }
                if (item.getString("kind") == "COMMAND" && error.status in setOf(400, 409, 422)) {
                    store.withGeneration(generation) { store.reject(item, error.code); store.remove(setOf(item.getString("id"))) }
                }
                // Keep ordered events. Domain rejects require explicit reconciliation, never silent discard.
                throw error
            }
        }
        completed
    }
}
