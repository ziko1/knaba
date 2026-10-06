package de.knaba.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.*
import android.widget.*
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private lateinit var store: SecureStore
    private lateinit var status: TextView
    private lateinit var origin: EditText
    private lateinit var code: EditText
    private lateinit var site: EditText
    private lateinit var destination: EditText
    private val io = Executors.newSingleThreadExecutor()
    private var currentSession: JSONObject? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); store = SecureStore(this)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 32, 32, 32) }
        val scroll = ScrollView(this).apply { addView(layout) }; setContentView(scroll)
        layout.addView(TextView(this).apply { text = "KNABA DE · Arbeitszeit & Standort"; textSize = 24f })
        layout.addView(TextView(this).apply { text = "Standort nur nach Ihrer Aktivierung und genehmigter Server-Richtlinie. Pause/Schichtende beendet GPS. Standort am Objekt überträgt nur Abstand und Qualität. Fahrten erfassen Punkte nur bei aktivem Dienstweg." })
        status = TextView(this).apply { text = "OFF · Standort nicht aktiv" }; layout.addView(status)
        origin = EditText(this).apply { hint = "HTTPS Server-Origin"; setText(store.read().optString("origin")); inputType = 17 }; layout.addView(origin)
        code = EditText(this).apply { hint = "Einmaliger Gerätecode aus dem Webkonto"; inputType = 129 }; layout.addView(code)
        button(layout, "Gerät verknüpfen") { work { val api = ApiClient(store); api.configure(origin.text.toString()); api.enroll(code.text.toString()); "Gerät verknüpft. GPS bleibt OFF." } }
        button(layout, "Status / Offline synchronisieren") { refresh() }
        site = EditText(this).apply { hint = "Zugewiesene Objekt-ID" }; layout.addView(site)
        button(layout, "Schicht START (ohne automatische GPS-Aktivierung)") {
            val siteId = site.text.toString(); val deviceId = store.read().optString("deviceId")
            require(deviceId.isNotBlank()) { "Gerät zuerst verknüpfen" }
            queueCommand("shift.start", JSONObject().put("siteId", siteId).put("deviceId", deviceId).put("occurredAt", Instant.now().toString()))
        }
        button(layout, "GPS ausdrücklich aktivieren") {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                if (Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.POST_NOTIFICATIONS)
                requestPermissions(permissions.toTypedArray(), 101)
            } else activateGPS()
        }
        button(layout, "Private Pause / Mittag") {
            val at = Instant.now().toString(); stopGPS(); store.purgeLocationSince(at)
            val tripId = currentSession?.optString("tripId")?.takeIf { it.isNotBlank() } ?: store.read().optString("manualTripId")
            if (tripId.isNotBlank()) queueCommand("trip.stop", JSONObject().put("tripId", tripId).put("kind", "PRIVATE_BREAK").put("reason", "Private Pause ausdrücklich bestätigt").put("occurredAt", at))
            else currentSession?.optString("shiftId")?.takeIf { it.isNotBlank() }?.let { queueCommand("shift.activity", JSONObject().put("shiftId", it).put("activity", "ON_BREAK").put("occurredAt", at)) }
        }
        button(layout, "Zurück zur Arbeit (GPS bleibt bis Aktivierung OFF)") {
            stopGPS()
            val tripId = currentSession?.optString("tripId")?.takeIf { it.isNotBlank() } ?: store.read().optString("manualTripId")
            if (tripId.isNotBlank()) queueCommand("trip.resume", JSONObject().put("tripId", tripId).put("occurredAt", Instant.now().toString()))
            else currentSession?.optString("shiftId")?.takeIf { it.isNotBlank() }?.let { queueCommand("shift.activity", JSONObject().put("shiftId", it).put("activity", "WORKING").put("siteId", site.text.toString()).put("occurredAt", Instant.now().toString())) }
        }
        destination = EditText(this).apply { hint = "Genehmigte Ziel-Objekt-ID für Dienstfahrt" }; layout.addView(destination)
        button(layout, "Dienstfahrt starten") {
            stopGPS()
            currentSession?.optString("shiftId")?.takeIf { it.isNotBlank() }?.let { queueCommand("trip.start", JSONObject().put("shiftId", it).put("destination", JSONObject().put("kind", "SITE").put("id", destination.text.toString())).put("purpose", "Dienstfahrt zum zugewiesenen Objekt").put("occurredAt", Instant.now().toString())) }
        }
        button(layout, "Ankunft bestätigen und Arbeit beginnen") {
            stopGPS()
            val tripId = currentSession?.optString("tripId")?.takeIf { it.isNotBlank() } ?: store.read().optString("manualTripId")
            require(tripId.isNotBlank()) { "Fahrtbeginn zuerst synchronisieren" }
            queueCommand("trip.arrive", JSONObject().put("tripId", tripId).put("startWork", true).put("occurredAt", Instant.now().toString()))
        }
        button(layout, "Schicht END") {
            val at = Instant.now().toString(); stopGPS(); store.purgeLocationSince(at)
            currentSession?.optString("shiftId")?.takeIf { it.isNotBlank() }?.let { queueCommand("shift.end", JSONObject().put("shiftId", it).put("occurredAt", at)) }
        }
        button(layout, "GPS OFF") { stopGPS(); status.text = "OFF · Standort nicht aktiv" }
        button(layout, "Abmelden / lokale Daten löschen") { stopGPS();store.clear();currentSession = null;status.text = "Abgemeldet · OFF" }
        if (store.read().has("deviceToken")) refresh()
    }
    private fun button(parent: LinearLayout, label: String, action: () -> Unit) { parent.addView(Button(this).apply { text = label; setOnClickListener { try { action() } catch (error: Exception) { status.text = error.message ?: "Aktion fehlgeschlagen" } } }) }
    private fun work(block: () -> String) { status.text = "Synchronisierung…"; io.execute { val text = try { block() } catch (error: Exception) { "Nicht synchronisiert: " + (error.message ?: "Verbindung fehlt") }; runOnUiThread { status.text = text } } }
    private fun refresh() { work { val api = ApiClient(store); val count = api.sync(); val session = api.session(); currentSession = session; "Server: ${session.getString("mode")} · ${count} synchronisiert · GPS ${if(store.read().optBoolean("trackingEnabled")) "aktiv" else "OFF"}" } }
    private fun queueCommand(command: String, input: JSONObject) { store.enqueue(command, input, "COMMAND");refresh() }
    private fun stopGPS() { store.update { it.put("trackingEnabled", false) }; stopService(Intent(this, TrackingService::class.java));currentSession = currentSession?.put("mode", "OFF") }
    private fun activateGPS() {
        work { val session = ApiClient(store).session(); require(session.getString("mode") in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL")) { "GPS nicht freigegeben: ${session.getString("mode")}" };currentSession = session
            runOnUiThread { startForegroundService(Intent(this, TrackingService::class.java).putExtra("session", session.toString())) }; "GPS sichtbar aktiv · gültig bis ${session.getString("expiresAt")}" }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) { super.onRequestPermissionsResult(requestCode, permissions, grantResults); if(requestCode == 101) { if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) activateGPS() else status.text = "GPS-Zugriff verweigert. Manueller Schichtablauf bleibt verfügbar." } }
    override fun onDestroy() { io.shutdown();super.onDestroy() }
}
