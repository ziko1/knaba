package de.knaba.mobile

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.*
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.*
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private lateinit var store: SecureStore
    private lateinit var status: TextView
    private lateinit var shiftView: TextView
    private lateinit var queueView: TextView
    private lateinit var origin: EditText
    private lateinit var code: EditText
    private lateinit var site: EditText
    private lateinit var destination: EditText
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var currentSession: JSONObject? = null
    private var currentSessionGeneration = Long.MIN_VALUE
    private var pendingPermissionGeneration: Long? = null
    private var sessionReceivedElapsed = 0L
    @Volatile private var viewEpoch = 0L
    private val timer = object : Runnable {
        override fun run() { renderShift(); main.postDelayed(this, 1000) }
    }
    override fun attachBaseContext(newBase: Context) { super.attachBaseContext(NativeLocale.wrap(newBase)) }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); store = SecureStore(this)
        KnabaTheme.configureWindow(this)
        val layout = KnabaTheme.content(this)
        val scroller = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(KnabaTheme.paper)
            addView(layout, FrameLayout.LayoutParams(-1, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL))
            setOnApplyWindowInsetsListener { view, insets ->
                val safe = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
                insets
            }
        }
        setContentView(scroller)
        scroller.requestApplyInsets()
        layout.addView(KnabaTheme.wordmark(this))
        val navigation = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        layout.addView(navigation, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(16) })
        button(navigation, R.string.erp_back) { finish() }.layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = dp(8) }
        button(navigation, R.string.language_label) { chooseLanguage() }.layoutParams = LinearLayout.LayoutParams(0, -2, 1f)

        val shift = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = KnabaTheme.hero(this@MainActivity)
            setPadding(dp(22), dp(22), dp(22), dp(24))
        }
        layout.addView(shift, LinearLayout.LayoutParams(-1, -2))
        text(shift, R.string.erp_time_tools, 13f, KnabaTheme.lime).apply {
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
        text(shift, R.string.my_shift, 28f, Color.WHITE).apply {
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            isAccessibilityHeading = true
        }
        shiftView = text(shift, R.string.shift_none, 18f, Color.WHITE).apply {
            setLineSpacing(dp(6).toFloat(), 1f)
            fontFeatureSettings = "tnum"
        }
        text(shift, R.string.shift_manual_notice, 14f, Color.rgb(216, 234, 231))

        val synchronization = panel(layout)
        status = text(synchronization, R.string.status_off, 16f, KnabaTheme.ink).apply {
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
        queueView = text(synchronization, R.string.queue_notice, 15f, KnabaTheme.text)
        text(synchronization, R.string.queue_notice, 14f)
        button(synchronization, R.string.action_sync, primary = true) { refresh() }

        val enrollment = panel(layout, R.string.action_enroll)
        origin = field(enrollment, R.string.origin_hint, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI).apply {
            setText(store.read().optString("origin"))
        }
        code = field(enrollment, R.string.code_hint, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        button(enrollment, R.string.action_enroll, primary = true) {
            val address = origin.text.toString(); val enrollmentCode = code.text.toString()
            currentSession = null; viewEpoch++; renderShift()
            work(enrollment = true) { epoch, generation -> val api = ApiClient(store, generation); api.configure(address); api.enroll(enrollmentCode); runOnUiThread { if(epoch == viewEpoch && !isDestroyed) code.setText("") }; getString(R.string.enrolled) }
        }

        val work = panel(layout, R.string.activity_working)
        site = field(work, R.string.site_hint)
        button(work, R.string.action_shift_start, primary = true) {
            val deviceId = store.read().optString("deviceId")
            if (deviceId.isBlank()) throw NativeActionFailure(R.string.error_device_first)
            queueCommand("shift.start", JSONObject().put("siteId", site.text.toString()).put("deviceId", deviceId).put("occurredAt", Instant.now().toString()))
        }
        button(work, R.string.action_pause) {
            val at = Instant.now().toString(); stopGPS(); store.purgeLocationSince(at)
            val tripId = tripId()
            if (tripId.isNotBlank()) queueCommand("trip.stop", JSONObject().put("tripId", tripId).put("kind", "PRIVATE_BREAK").put("reason", "Private Pause ausdrücklich bestätigt").put("occurredAt", at))
            else queueCommand("shift.activity", JSONObject().put("shiftId", shiftId()).put("activity", "ON_BREAK").put("occurredAt", at))
        }
        button(work, R.string.action_return) {
            stopGPS()
            val tripId = tripId()
            if (tripId.isNotBlank()) queueCommand("trip.resume", JSONObject().put("tripId", tripId).put("occurredAt", Instant.now().toString()))
            else queueCommand("shift.activity", JSONObject().put("shiftId", shiftId()).put("activity", "WORKING").put("siteId", site.text.toString()).put("occurredAt", Instant.now().toString()))
        }
        button(work, R.string.action_shift_end) {
            val at = Instant.now().toString(); stopGPS(); store.purgeLocationSince(at)
            queueCommand("shift.end", JSONObject().put("shiftId", shiftId()).put("occurredAt", at))
        }.setTextColor(KnabaTheme.error)

        val travel = panel(layout, R.string.mode_travel)
        destination = field(travel, R.string.destination_hint)
        button(travel, R.string.action_trip_start, primary = true) {
            stopGPS()
            queueCommand("trip.start", JSONObject().put("shiftId", shiftId()).put("destination", JSONObject().put("kind", "SITE").put("id", destination.text.toString())).put("purpose", "Dienstfahrt zum zugewiesenen Objekt").put("occurredAt", Instant.now().toString()))
        }
        button(travel, R.string.action_arrive) {
            stopGPS()
            val tripId = tripId(); if (tripId.isBlank()) throw NativeActionFailure(R.string.error_trip_required)
            queueCommand("trip.arrive", JSONObject().put("tripId", tripId).put("startWork", true).put("occurredAt", Instant.now().toString()))
        }

        val location = panel(layout, R.string.erp_presence, KnabaTheme.green)
        text(location, R.string.privacy_notice, 15f, KnabaTheme.text)
        button(location, R.string.action_gps_activate) {
            if (!hasTrackingPermissions()) {
                val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                if (Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.POST_NOTIFICATIONS)
                pendingPermissionGeneration = store.generation()
                requestPermissions(permissions.toTypedArray(), 101)
            } else activateGPS()
        }
        button(location, R.string.action_gps_off) { stopGPS(); status.setText(R.string.status_off) }.setTextColor(KnabaTheme.error)

        val account = panel(layout, R.string.mobile_open_account)
        button(account, R.string.action_sign_out) {
            viewEpoch++; stopGPS(); store.clear(); currentSession = null; origin.setText(""); code.setText(""); site.setText(""); destination.setText("")
            status.setText(R.string.signed_out); renderShift()
        }.setTextColor(KnabaTheme.error)
        renderShift()
        if (store.read().has("deviceToken")) refresh()
    }
    private fun chooseLanguage() {
        val tags = LanguagePolicy.SUPPORTED + listOf("")
        val names = arrayOf("Deutsch", "English", "Polski", "Lietuvių", "Русский", "Українська", getString(R.string.language_device))
        val selected = tags.indexOf(NativeLocale.selected(this)).coerceAtLeast(0)
        AlertDialog.Builder(this).setTitle(R.string.language_label).setSingleChoiceItems(names, selected) { dialog, index ->
            NativeLocale.choose(this, tags[index]); sendBroadcast(Intent(NativeLocale.CHANGED).setPackage(packageName)); dialog.dismiss(); recreate()
        }.show()
    }
    private fun dp(value: Int) = KnabaTheme.dp(this, value)
    private fun panel(parent: LinearLayout, title: Int? = null, color: Int = Color.WHITE): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = KnabaTheme.surface(this@MainActivity, color, border = KnabaTheme.line)
        setPadding(dp(18), dp(14), dp(18), dp(20))
        parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })
        if (title != null) text(this, title, 20f, KnabaTheme.ink).apply {
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            isAccessibilityHeading = true
        }
    }
    private fun text(parent: LinearLayout, label: Int, size: Float = 15f, color: Int = KnabaTheme.muted): TextView =
        KnabaTheme.label(this, getString(label), size, color).apply {
            parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8); bottomMargin = dp(4) })
        }
    private fun field(parent: LinearLayout, label: Int, input: Int = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS): EditText {
        val caption = text(parent, label, 14f, KnabaTheme.ink)
        return EditText(this).apply {
            id = View.generateViewId(); caption.labelFor = id
            setHint(label); inputType = input; setSingleLine(true)
            isSaveEnabled = false
            if (input and InputType.TYPE_TEXT_VARIATION_PASSWORD != 0) importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            KnabaTheme.applyInput(this)
            parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(4); bottomMargin = dp(8) })
        }
    }
    private fun button(parent: LinearLayout, label: Int, primary: Boolean = false, action: () -> Unit): Button = Button(this).apply {
        setText(label)
        KnabaTheme.applyButton(this, primary)
        parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        setOnClickListener { try { action() } catch (error: Exception) { status.text = NativeText.error(this@MainActivity, error) } }
    }
    private fun work(enrollment: Boolean = false, block: (Long, Long) -> String) {
        val epoch = viewEpoch; val generation = store.generation(); status.setText(R.string.syncing)
        io.execute {
            val text = try { store.requireGeneration(generation); if(epoch != viewEpoch) throw IllegalStateException("AUTH_GENERATION_CHANGED"); block(epoch, generation) } catch (error: Exception) {
                if (error is ApiFailure && error.status in setOf(401,403)) runOnUiThread { if (epoch == viewEpoch) { stopGPS(); currentSession = null; renderShift() } }
                getString(R.string.sync_failed, NativeText.error(this, error))
            }
            runOnUiThread { if (epoch == viewEpoch && !isDestroyed && (enrollment || generation == store.generation())) { status.text = text; renderShift() } }
        }
    }
    private fun publishSession(session: JSONObject, epoch: Long, generation: Long) {
        runOnUiThread {
            val state = store.read()
            if (epoch != viewEpoch || generation != store.generation() || isDestroyed || session.optString("deviceId") != state.optString("deviceId") || session.optString("employeeId") != state.optString("employeeId")) return@runOnUiThread
            currentSession = session; currentSessionGeneration = generation; sessionReceivedElapsed = SystemClock.elapsedRealtime()
            val siteId = session.optJSONObject("shiftSummary")?.optString("siteId") ?: session.optString("siteId")
            if (!siteId.isNullOrBlank() && site.text.isBlank()) site.setText(siteId)
            renderShift()
        }
    }
    private fun refresh() {
        work { epoch, generation ->
            val api = ApiClient(store, generation); val count = api.sync(); val session = api.session(); publishSession(session, epoch, generation)
            getString(R.string.server_status, NativeText.mode(this, session.getString("mode")), count, getString(if(store.read().optBoolean("trackingEnabled")) R.string.gps_on else R.string.gps_off))
        }
    }
    private fun shiftId(): String {
        val state = store.read()
        if (currentSessionGeneration != store.generation() || currentSession?.optString("deviceId") != state.optString("deviceId") || currentSession?.optString("employeeId") != state.optString("employeeId")) throw NativeActionFailure(R.string.error_shift_required)
        val id = currentSession?.optJSONObject("shiftSummary")?.optString("shiftId")?.takeIf { it.isNotBlank() } ?: currentSession?.optString("shiftId").orEmpty()
        if (id.isBlank()) throw NativeActionFailure(R.string.error_shift_required)
        return id
    }
    private fun tripId(): String = currentSession?.optString("tripId")?.takeIf { it.isNotBlank() } ?: store.read().optString("manualTripId")
    private fun queueCommand(command: String, input: JSONObject) { store.enqueue(command, input, "COMMAND"); renderShift(); refresh() }
    private fun stopGPS() {
        store.update { it.put("trackingEnabled", false) }; stopService(Intent(this, TrackingService::class.java))
        currentSession = currentSession?.put("mode", "OFF")
    }
    private fun activateGPS() {
        work { epoch, generation ->
            if (!hasTrackingPermissions()) throw NativeActionFailure(R.string.notification_permission_denied)
            val session = ApiClient(store, generation).session()
            if (session.getString("mode") !in setOf("SITE_PRESENCE", "BUSINESS_TRAVEL")) throw NativeActionFailure(R.string.error_session)
            publishSession(session, epoch, generation)
            runOnUiThread {
                if (epoch == viewEpoch && generation == store.generation() && !isDestroyed && store.read().optString("deviceId") == session.optString("deviceId"))
                    startForegroundService(Intent(this, TrackingService::class.java).putExtra("session", session.toString()))
            }
            getString(R.string.gps_visible_until, displayDate(session.getString("expiresAt")))
        }
    }
    private fun hasTrackingPermissions(): Boolean {
        val notifications = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED &&
            (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            notifications.areNotificationsEnabled() && notifications.getNotificationChannel("knaba_tracking")?.importance != NotificationManager.IMPORTANCE_NONE
    }
    private fun displayDate(iso: String): String = try {
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withLocale(resources.configuration.locales[0]).withZone(ZoneId.of("Europe/Berlin")).format(Instant.parse(iso))
    } catch (_: Exception) { getString(R.string.shift_timer_unknown) }
    private fun renderShift() {
        if (!::shiftView.isInitialized || !::store.isInitialized) return
        val state = try { store.read() } catch (error: Exception) { status.text = NativeText.error(this,error); return }
        val lines = mutableListOf<String>()
        val session = currentSession
        val own = session != null && currentSessionGeneration == store.generation() && session.optString("deviceId") == state.optString("deviceId") && session.optString("employeeId") == state.optString("employeeId")
        val summary = if (own) session?.optJSONObject("shiftSummary") else null
        if (summary == null || summary.optString("state") != "ACTIVE") lines.add(getString(R.string.shift_none))
        else {
            lines.add(getString(R.string.shift_site, summary.optString("siteName").ifBlank { summary.optString("siteCode").ifBlank { summary.optString("siteId") } }))
            lines.add(getString(R.string.shift_activity, NativeText.activity(this, summary.optString("activity"))))
            lines.add(getString(R.string.shift_started, displayDate(summary.optString("startedAt"))))
            lines.add(getString(R.string.shift_as_of, displayDate(summary.optString("asOf"))))
            val expires = session!!.optString("expiresAt")
            val elapsed = ShiftClock.elapsedSeconds(summary.optString("startedAt"), summary.optString("asOf"), expires, sessionReceivedElapsed, SystemClock.elapsedRealtime())
            if (elapsed == null) lines.add(getString(R.string.shift_stale)) else lines.add(getString(R.string.shift_elapsed, ShiftClock.duration(elapsed)))
            val activityElapsed = ShiftClock.elapsedSeconds(summary.optString("activityStartedAt"), summary.optString("asOf"), expires, sessionReceivedElapsed, SystemClock.elapsedRealtime())
            if (activityElapsed != null) lines.add(getString(R.string.shift_activity_elapsed, ShiftClock.duration(activityElapsed)))
            for ((key, textId) in listOf("siteSeconds" to R.string.shift_site_time, "travelSeconds" to R.string.shift_travel_time, "breakSeconds" to R.string.shift_break_time, "pendingSeconds" to R.string.shift_pending_time, "serviceSeconds" to R.string.shift_service_time, "waitingSeconds" to R.string.shift_waiting_time)) {
                if (summary.has(key) && !summary.isNull(key)) {
                    val seconds = summary.optLong(key,-1); if (seconds >= 0) lines.add(getString(textId, ShiftClock.duration(seconds)))
                }
            }
            if(summary.optBoolean("reviewRequired")) lines.add(getString(R.string.shift_review))
        }
        if (own && session != null && session.optString("reason").isNotBlank()) lines.add(NativeText.reason(this, session.optString("reason")))
        shiftView.text = lines.joinToString("\n")
        queueView.text = getString(R.string.queue_status,state.optJSONArray("queue")?.length() ?: 0,state.optJSONArray("reconciliation")?.length() ?: 0)
        val last = state.optString("lastError").ifBlank { state.optString("lastTrackingStatus") }
        if (last.isNotBlank()) queueView.append("\n"+getString(R.string.last_status,NativeText.reason(this,last)))
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if(requestCode == 101) {
            val requestedGeneration = pendingPermissionGeneration; pendingPermissionGeneration = null
            if(requestedGeneration == null || requestedGeneration != store.generation()) { status.setText(R.string.error_access); return }
            if(hasTrackingPermissions()) activateGPS() else status.setText(if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) R.string.permission_denied else R.string.notification_permission_denied)
        }
    }
    override fun onResume() { super.onResume(); main.removeCallbacks(timer); main.post(timer) }
    override fun onPause() { main.removeCallbacks(timer); super.onPause() }
    override fun onDestroy() { viewEpoch++; main.removeCallbacksAndMessages(null); io.shutdown();super.onDestroy() }
}
