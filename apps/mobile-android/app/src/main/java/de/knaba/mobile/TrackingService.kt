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
    private var lastObservation = 0L
    private val heartbeat = object : Runnable {
        override fun run() {
            val lease = session
            if (!active || lease == null || !Instant.parse(lease.getString("expiresAt")).isAfter(Instant.now())) { stopTracking("SESSION_EXPIRED"); return }
            io.execute {
                try {
                    val api = ApiClient(store); api.sync(); val latest = api.session()
                    main.post {
                        if (latest.optString("mode") !in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL") || latest.optString("shiftId") != session?.optString("shiftId")) stopTracking("SERVER_PAUSED")
                        else session = latest
                    }
                } catch (error: Exception) {
                    if (error is ApiFailure && error.status in setOf(401, 403)) main.post { stopTracking("ACCESS_REVOKED") }
                    else store.update { it.put("lastError", "OFFLINE_PENDING_SYNC") }
                }
            }
            main.postDelayed(this, 30000)
        }
    }
    override fun onCreate() { super.onCreate(); store = SecureStore(this); locations = getSystemService(LOCATION_SERVICE) as LocationManager }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { stopTracking("USER_STOPPED"); return START_NOT_STICKY }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { stopSelf(); return START_NOT_STICKY }
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("knaba_tracking", "KNABA DE Standortstatus", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, TrackingService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "knaba_tracking").setContentTitle("KNABA DE · Standort aktiv")
            .setContentText("Nur genehmigte Arbeitszeit. Pause oder Stop beendet die Erfassung.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentIntent(open).setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build()).build()
        startForeground(4001, notification)
        try {
            session = JSONObject(intent?.getStringExtra("session") ?: error("SESSION_REQUIRED"))
            require(session!!.getString("mode") in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL"))
            require(Instant.parse(session!!.getString("expiresAt")).isAfter(Instant.now()))
            store.update { it.put("trackingEnabled", true) }; active = true
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000L, 15f, this, Looper.getMainLooper())
            if (locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000L, 15f, this, Looper.getMainLooper())
            main.removeCallbacks(heartbeat); main.post(heartbeat)
        } catch (error: Exception) { stopTracking("TRACKING_UNAVAILABLE") }
        return START_NOT_STICKY
    }
    override fun onLocationChanged(location: Location) {
        val lease = session ?: return
        if (!active || !store.read().optBoolean("trackingEnabled") || !Instant.parse(lease.getString("expiresAt")).isAfter(Instant.now())) { stopTracking("SESSION_EXPIRED"); return }
        @Suppress("DEPRECATION") val mock = if (Build.VERSION.SDK_INT >= 31) location.isMock else location.isFromMockProvider
        if (!location.hasAccuracy() || location.accuracy <= 0f || mock || location.time <= lastObservation) return
        val maxAge = lease.optJSONObject("siteGeofence")?.optLong("maxAgeSeconds", 120) ?: 120
        if (System.currentTimeMillis() - location.time !in 0..maxAge * 1000) return
        val mode = lease.getString("mode"); if (mode !in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL")) { stopTracking("PRIVATE_BREAK"); return }
        val observedAt = Instant.ofEpochMilli(location.time).toString()
        val input = JSONObject().put("eventId", java.util.UUID.randomUUID().toString()).put("deviceId", lease.getString("deviceId"))
            .put("shiftId", lease.getString("shiftId")).put("policyVersionId", lease.getString("policyVersionId"))
            .put("observedAt", observedAt).put("accuracyM", location.accuracy.toDouble())
        val command: String
        if (mode == "SITE_PRESENCE") {
            val zone = lease.optJSONObject("siteGeofence") ?: return
            if (location.accuracy > zone.optDouble("maxAccuracyM", 50.0)) return
            val distance = GeofenceClassifier.distance(location.latitude, location.longitude, zone.getDouble("latitude"), zone.getDouble("longitude"))
            input.put("siteId", lease.getString("siteId")).put("distanceM", distance).put("source", "NATIVE_LOCATION").put("trackerState", "ONLINE")
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
        try { store.enqueue(command, input); lastObservation = location.time } catch (error: Exception) { stopTracking("OFFLINE_QUEUE_FULL") }
    }
    override fun onProviderDisabled(provider: String) { store.update { it.put("lastError", "LOCATION_UNKNOWN") } }
    override fun onProviderEnabled(provider: String) { }
    @Deprecated("Legacy callback") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) { }
    private fun stopTracking(reason: String) {
        active = false; session = null; main.removeCallbacks(heartbeat)
        if (::locations.isInitialized) locations.removeUpdates(this)
        if (::store.isInitialized) store.update { it.put("trackingEnabled", false).put("lastTrackingStatus", reason) }
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
    }
    override fun onTaskRemoved(rootIntent: Intent?) { stopTracking("APP_CLOSED") }
    override fun onDestroy() { active = false; main.removeCallbacksAndMessages(null); if (::locations.isInitialized) locations.removeUpdates(this); io.shutdownNow(); super.onDestroy() }
}
