package de.knaba.mobile

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.location.*
import android.os.*
import org.json.JSONObject
import org.json.JSONArray
import java.time.Instant
import java.util.concurrent.Executors

/** Visible foreground service only; force-stop/task removal never secretly restarts tracking. */
class TrackingService : Service(), LocationListener {
    private lateinit var store: SecureStore
    private lateinit var locations: LocationManager
    private var session: JSONObject? = null
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var active = false
    private var activeGeneration = Long.MIN_VALUE
    private var lastObservation = 0L
    private var lastRenewalAttempt = 0L
    private var leaseDeadlineElapsed = 0L
    private val expireLease = Runnable { if (active) stopTracking("SESSION_EXPIRED") }
    private val localeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { if (active && intent?.action == NativeLocale.CHANGED) updateNotification() }
    }
    private val heartbeat = object : Runnable {
        override fun run() {
            val lease = session
            val generation = activeGeneration
            if (generation != store.generation()) { stopTracking("AUTH_GENERATION_CHANGED"); return }
            if (!hasTrackingPermissions()) { stopTracking("PERMISSION_REVOKED"); return }
            if (!active || lease == null || SystemClock.elapsedRealtime() >= leaseDeadlineElapsed || !Instant.parse(lease.getString("expiresAt")).isAfter(Instant.now())) { stopTracking("SESSION_EXPIRED"); return }
            if (!NativeTrackingPolicy.renewalDue(SystemClock.elapsedRealtime(), lastRenewalAttempt)) { main.postDelayed(this, 30000); return }
            lastRenewalAttempt = SystemClock.elapsedRealtime()
            io.execute {
                try {
                    val api = ApiClient(store, generation); api.sync(); val latest = api.session()
                    main.post {
                        if (generation != activeGeneration || generation != store.generation()) return@post
                        if (latest.optString("mode") !in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL") || latest.optString("shiftId") != session?.optString("shiftId")) stopTracking("SERVER_PAUSED")
                        else try { installLease(latest) } catch (_: Exception) { stopTracking("SESSION_EXPIRED") }
                    }
                } catch (error: Exception) {
                    if (generation != store.generation() || error is ApiFailure && error.status in setOf(401, 403)) main.post { if(generation == activeGeneration) stopTracking("ACCESS_REVOKED") }
                    else try { store.updateForGeneration(generation) { it.put("lastError", "OFFLINE_PENDING_SYNC") } } catch (_: IllegalStateException) { main.post { if(generation == activeGeneration) stopTracking("AUTH_GENERATION_CHANGED") } }
                }
            }
            main.postDelayed(this, 30000)
        }
    }
    override fun onCreate() {
        super.onCreate(); store = SecureStore(this); activeGeneration = store.generation(); locations = getSystemService(LOCATION_SERVICE) as LocationManager
        // The API 26 flags overload works on every supported device. The signature
        // permission also protects this app-only receiver before API 33 enforces
        // RECEIVER_NOT_EXPORTED, so another app cannot send a locale notification.
        registerReceiver(localeReceiver, IntentFilter(NativeLocale.CHANGED),
            "de.knaba.mobile.permission.INTERNAL_BROADCAST", null, Context.RECEIVER_NOT_EXPORTED)
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { stopTracking("USER_STOPPED"); return START_NOT_STICKY }
        if (!hasTrackingPermissions()) { stopTracking("PERMISSION_REVOKED"); return START_NOT_STICKY }
        startForeground(4001, notification())
        try {
            activeGeneration = store.generation()
            session = JSONObject(intent?.getStringExtra("session") ?: error("SESSION_REQUIRED"))
            require(session!!.getString("deviceId") == store.read().optString("deviceId") && session!!.getString("employeeId") == store.read().optString("employeeId"))
            require(session!!.getString("mode") in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL"))
            require(session!!.optString("trackingSessionId").isNotEmpty()) { "TRACKING_LEASE_REQUIRED" }
            if (session!!.getString("mode") == "SITE_PRESENCE") require(session!!.optString("geofenceVersionId").isNotEmpty() && session!!.optJSONObject("siteGeofence")?.optString("algorithmVersion") == "GEOFENCE_V1") { "GEOFENCE_VERSION_REQUIRED" }
            if (session!!.getString("mode") == "BUSINESS_TRAVEL") require(session!!.optString("tripId").isNotEmpty()) { "TRIP_LEASE_REQUIRED" }
            installLease(session!!)
            lastRenewalAttempt = SystemClock.elapsedRealtime()
            store.updateForGeneration(activeGeneration) { it.put("trackingEnabled", true) }; active = true
            configureLocationUpdates(session!!)
            main.removeCallbacks(heartbeat); main.post(heartbeat)
        } catch (_: SecurityException) { stopTracking("PERMISSION_REVOKED") }
        catch (error: Exception) { stopTracking("TRACKING_UNAVAILABLE") }
        return START_NOT_STICKY
    }
    private fun notification(): Notification {
        val text = NativeLocale.wrap(this)
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("knaba_tracking", text.getString(R.string.notification_channel), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, TrackingService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, "knaba_tracking").setContentTitle(text.getString(R.string.notification_title))
            .setContentText(text.getString(R.string.notification_body))
            .setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentIntent(open).setOngoing(true)
            .addAction(Notification.Action.Builder(null, text.getString(R.string.notification_stop), stop).build()).build()
    }
    private fun updateNotification() { (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(4001, notification()) }
    private fun installLease(lease: JSONObject) {
        val remaining = Instant.parse(lease.getString("expiresAt")).toEpochMilli() - System.currentTimeMillis()
        require(remaining in 1..NativeTrackingPolicy.LEASE_MILLIS) { "INVALID_SESSION_LEASE" }
        val previousMode = session?.optString("mode")
        session = lease; leaseDeadlineElapsed = SystemClock.elapsedRealtime() + remaining
        main.removeCallbacks(expireLease); main.postDelayed(expireLease, remaining)
        if (active && previousMode != lease.optString("mode")) configureLocationUpdates(lease)
    }
    private fun configureLocationUpdates(lease: JSONObject) {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) throw SecurityException("LOCATION_PERMISSION_REQUIRED")
        // Stationary presence needs repeated quality observations to confirm dwell.
        val minimumDistance = if (lease.getString("mode") == "SITE_PRESENCE") 0f else 15f
        locations.removeUpdates(this)
        locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000L, minimumDistance, this, Looper.getMainLooper())
        if (locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000L, minimumDistance, this, Looper.getMainLooper())
    }
    override fun onLocationChanged(location: Location) {
        val lease = session ?: return
        val generation = activeGeneration
        if (generation != store.generation()) { stopTracking("AUTH_GENERATION_CHANGED"); return }
        if (!hasTrackingPermissions()) { stopTracking("PERMISSION_REVOKED"); return }
        if (!active || !store.read().optBoolean("trackingEnabled") || SystemClock.elapsedRealtime() >= leaseDeadlineElapsed || !Instant.parse(lease.getString("expiresAt")).isAfter(Instant.now())) { stopTracking("SESSION_EXPIRED"); return }
        @Suppress("DEPRECATION") val mock = if (Build.VERSION.SDK_INT >= 31) location.isMock else location.isFromMockProvider
        if (!location.hasAccuracy() || location.accuracy <= 0f || mock || location.time <= lastObservation) return
        val maxAge = minOf(lease.optJSONObject("siteGeofence")?.optLong("maxAgeSeconds", 120) ?: 120, 120)
        if (System.currentTimeMillis() - location.time !in 0..maxAge * 1000) return
        val mode = lease.getString("mode"); if (mode !in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL")) { stopTracking("PRIVATE_BREAK"); return }
        val observedAt = Instant.ofEpochMilli(location.time).toString()
        val input = JSONObject().put("eventId", java.util.UUID.randomUUID().toString()).put("deviceId", lease.getString("deviceId"))
            .put("shiftId", lease.getString("shiftId")).put("policyVersionId", lease.getString("policyVersionId"))
            .put("trackingSessionId", lease.getString("trackingSessionId")).put("bootSessionId", SecureStore.bootSessionId)
            .put("monotonicElapsedMs", location.elapsedRealtimeNanos / 1000000L)
            .put("observedAt", observedAt).put("accuracyM", location.accuracy.toDouble())
        val command: String
        if (mode == "SITE_PRESENCE") {
            val zone = lease.optJSONObject("siteGeofence") ?: return
            // Keep a minimal poor-quality presence observation so the server
            // resets an interrupted dwell; SITE_PRESENCE sends no coordinates.
            val distance = GeofenceClassifier.distance(location.latitude, location.longitude, zone.getDouble("latitude"), zone.getDouble("longitude"))
            input.put("siteId", lease.getString("siteId")).put("geofenceVersionId", lease.getString("geofenceVersionId")).put("distanceM", distance).put("source", "NATIVE_LOCATION").put("trackerState", "ONLINE")
            val exceptions = zone.optJSONArray("exceptionZones") ?: JSONArray(); val distances = JSONArray()
            for (index in 0 until exceptions.length()) {
                val approved = exceptions.getJSONObject(index)
                val metres = GeofenceClassifier.distance(location.latitude, location.longitude, approved.getDouble("latitude"), approved.getDouble("longitude"))
                distances.put(JSONObject().put("zoneIndex", index).put("distanceM", metres).put("accuracyM", location.accuracy.toDouble()))
            }
            input.put("zoneDistances", distances)
            command = "presence.ingest" // Precise point remains on device; server independently confirms dwell/hysteresis.
        } else {
            input.put("tripId", lease.getString("tripId")).put("latitude", location.latitude).put("longitude", location.longitude)
            command = "trip.sample"
        }
        try { store.withGeneration(generation) { store.enqueue(command, input) }; lastObservation = location.time } catch (error: Exception) { stopTracking(if(generation != store.generation()) "AUTH_GENERATION_CHANGED" else "OFFLINE_QUEUE_FULL") }
    }
    override fun onProviderDisabled(provider: String) { try { store.updateForGeneration(activeGeneration) { it.put("lastError", "LOCATION_UNKNOWN") } } catch (_: IllegalStateException) { stopTracking("AUTH_GENERATION_CHANGED") } }
    override fun onProviderEnabled(provider: String) { }
    private fun hasTrackingPermissions(): Boolean {
        val notifications = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED &&
            (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            notifications.areNotificationsEnabled() && notifications.getNotificationChannel("knaba_tracking")?.importance != NotificationManager.IMPORTANCE_NONE
    }
    @Deprecated("Legacy callback") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) { }
    private fun stopTracking(reason: String) {
        active = false; session = null; main.removeCallbacks(heartbeat); main.removeCallbacks(expireLease)
        if (::locations.isInitialized) locations.removeUpdates(this)
        if (::store.isInitialized) try { store.updateForGeneration(activeGeneration) { it.put("trackingEnabled", false).put("lastTrackingStatus", reason) } } catch (_: IllegalStateException) { /* An older service must not write into a new account vault. */ }
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
    }
    override fun onTaskRemoved(rootIntent: Intent?) { stopTracking("APP_CLOSED") }
    override fun onDestroy() { active = false; main.removeCallbacksAndMessages(null); if (::locations.isInitialized) locations.removeUpdates(this); unregisterReceiver(localeReceiver); io.shutdownNow(); super.onDestroy() }
}
