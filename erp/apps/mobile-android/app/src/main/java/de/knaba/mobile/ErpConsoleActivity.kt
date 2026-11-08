package de.knaba.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors

/** Native, server-authorized workspace. Demo data never enters a company session. */
class ErpConsoleActivity : Activity() {
    private var api = ErpConsoleTransport()
    private var discovery = ErpServerDiscovery()
    private val worker = Executors.newSingleThreadExecutor()
    private val configWorker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private lateinit var content: LinearLayout
    private lateinit var notice: TextView
    private lateinit var progress: ProgressBar
    private lateinit var scroller: ScrollView
    private lateinit var syncNotice: TextView
    private lateinit var screenTitle: TextView
    private var foreground = false
    private var startedOnce = false
    private var nextRefreshDelay = 0L
    private var readRetryAt = 0L
    private var refreshRead: (() -> Unit)? = null
    private var refreshFailures = 0
    private var discoveryBusy = false
    private val refreshTick = Runnable { refreshRead?.invoke() }
    private var screen = 0L
    private var actor: JSONObject? = null
    private var demoMode = false
    private var busy = false
    private var mutation = false
    private var uncertain = false
    private var backAction: (() -> Unit)? = null
    private var removePlatformBackCallback: (() -> Unit)? = null
    private data class PendingMutation(val title: String, val name: String, val input: String, val version: Int?, val key: String)
    private data class RetainedSession(val transport: ErpConsoleTransport, val discovery: ErpServerDiscovery, val actor: JSONObject?, val demo: Boolean, val pending: PendingMutation?, val federation: ErpFederationLogin?)
    private var federation: ErpFederationLogin? = null
    private var federationRendered = ""
    private val federationTick = Runnable { updateFederation() }
    private var pendingRecovery: PendingMutation? = null
    private var mediaScreen: ConsoleMediaScreen? = null
    private val controls = mutableListOf<View>()
    private val ink = Color.rgb(24, 52, 52)
    private val teal = Color.rgb(0, 105, 94)
    private val muted = Color.rgb(86, 109, 107)
    // Discovery only: the ERP freshly authorizes and projects every returned entity.
    // A role name never grants finance, location or customer access here.
    private val modules = ConsoleModules.items

    override fun attachBaseContext(newBase: Context) { super.attachBaseContext(NativeLocale.wrap(newBase)) }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        api = newTransport()
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(22), dp(20), dp(28))
            setBackgroundColor(Color.rgb(244, 248, 247))
        }
        scroller = ScrollView(this).apply { isFillViewport = true; addView(content) }
        scroller.setOnApplyWindowInsetsListener { view, insets ->
            val safe = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            insets
        }
        setContentView(scroller)
        if (Build.VERSION.SDK_INT >= 33) {
            val dispatcher = onBackInvokedDispatcher
            val callback = android.window.OnBackInvokedCallback { goBack() }
            dispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
            removePlatformBackCallback = { dispatcher.unregisterOnBackInvokedCallback(callback) }
        }
        val retained = lastNonConfigurationInstance as? RetainedSession
        if (retained != null) {
            api = retained.transport; discovery = retained.discovery; actor = retained.actor; demoMode = retained.demo; pendingRecovery = retained.pending
            federation = retained.federation
            if (federation != null) updateFederation()
            else if (actor != null) { if (pendingRecovery != null && api.hasPendingCommand()) showPendingRecovery() else showDashboard() }
            else showLogin()
        } else showLogin()
    }
    private fun newTransport() = ErpConsoleTransport(ConsoleRecoveryJournal(applicationContext), ConsoleMediaJournal(applicationContext))
    private fun recoverPending() {
        pendingRecovery = api.pendingCommand()?.let { envelope ->
            PendingMutation(commandTitle(envelope.getString("name")), envelope.getString("name"),
                envelope.getJSONObject("input").toString(), if (envelope.has("expected_version")) envelope.getInt("expected_version") else null,
                envelope.getString("idempotency_key"))
        }
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun shape(color: Int, border: Int? = null): GradientDrawable = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(16).toFloat(); if (border != null) setStroke(dp(1), border)
    }
    private fun heading(title: String, subtitle: String = "", back: (() -> Unit)? = null, showPending: Boolean = true, keepFederation: Boolean = false) {
        if (!keepFederation) stopFederation()
        mediaScreen?.close(); mediaScreen = null
        screen++
        main.removeCallbacks(refreshTick); refreshRead = null; refreshFailures = 0; discoveryBusy = false
        busy = false; mutation = false; uncertain = false; controls.clear(); backAction = back
        content.removeAllViews()
        if (demoMode) label(getString(R.string.erp_demo_banner), color = Color.rgb(104, 62, 0)).apply {
            background = shape(Color.rgb(255, 239, 197)); setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        if (back != null) button(getString(R.string.erp_back), navigation = true) { goBack() }
        label("KNABA DE", 12f, teal).apply { letterSpacing = .14f; setTypeface(null, Typeface.BOLD) }
        screenTitle = label(title, 28f).apply { setTypeface(null, Typeface.BOLD); setPadding(0, dp(4), 0, dp(8)) }
        if (subtitle.isNotEmpty()) label(subtitle, 14f, muted)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true; visibility = View.GONE
        }
        content.addView(progress, LinearLayout.LayoutParams(-1, dp(4)))
        notice = label("", 14f, Color.rgb(142, 48, 35)).apply {
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE; visibility = View.GONE
        }
        syncNotice = label("", 12f, muted).apply { visibility = View.GONE }
        if (showPending && api.hasNativeMediaPending()) {
            status(getString(R.string.erp_media_register_unknown))
            button(getString(R.string.erp_review_pending)) { showMedia() }
        } else if (showPending && pendingRecovery != null && api.hasPendingCommand()) {
            status(getString(R.string.erp_unknown_result))
            button(getString(R.string.erp_review_pending)) { showPendingRecovery() }
        }
        scroller.post { scroller.scrollTo(0, 0) }
    }
    private fun status(text: String, success: Boolean = false) {
        notice.text = text; notice.visibility = if (text.isBlank()) View.GONE else View.VISIBLE
        notice.setTextColor(if (success) teal else Color.rgb(142, 48, 35))
    }
    private fun label(text: String, size: Float = 15f, color: Int = ink, parent: LinearLayout = content): TextView = TextView(this).apply {
        this.text = text; textSize = size; setTextColor(color); setPadding(0, dp(7), 0, dp(7))
        parent.addView(this, LinearLayout.LayoutParams(-1, -2))
    }
    private fun button(text: String, primary: Boolean = false, navigation: Boolean = false, parent: LinearLayout = content, action: () -> Unit): Button = Button(this).apply {
        val actionScreen = screen
        this.text = text; isAllCaps = false; textSize = 15f; minHeight = dp(50)
        setTextColor(if (primary) Color.WHITE else teal)
        background = shape(if (primary) teal else Color.WHITE, if (primary) null else Color.rgb(213, 228, 223))
        setPadding(dp(14), dp(8), dp(14), dp(8))
        parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9); bottomMargin = dp(3) })
        if (!navigation) { controls.add(this); isEnabled = !busy }
        setOnClickListener { if (screen == actionScreen && !isDestroyed && (!busy || navigation)) action() }
    }
    private fun field(title: String, input: Int = InputType.TYPE_CLASS_TEXT, multiline: Boolean = false, parent: LinearLayout = content): EditText {
        val caption = label(title, 13f, muted, parent)
        return EditText(this).apply {
            id = View.generateViewId(); caption.labelFor = id; hint = title; inputType = input
            setSingleLine(!multiline); if (multiline) { minLines = 3; maxLines = 7; gravity = Gravity.TOP }
            textSize = 16f; setTextColor(ink); setHintTextColor(muted)
            background = shape(Color.WHITE, Color.rgb(198, 219, 210))
            setPadding(dp(12), dp(12), dp(12), dp(12)); minHeight = dp(52)
            isSaveEnabled = false
            if (input and InputType.TYPE_TEXT_VARIATION_PASSWORD != 0) importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(5) })
            controls.add(this)
        }
    }
    private fun clearList(parent: LinearLayout) {
        controls.removeAll { view ->
            var ancestor = view.parent
            while (ancestor is View && ancestor !== parent) ancestor = ancestor.parent
            ancestor === parent
        }
        parent.removeAllViews()
    }
    private fun panel(parent: LinearLayout = content): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; background = shape(Color.WHITE)
        setPadding(dp(16), dp(10), dp(16), dp(12))
        parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10); bottomMargin = dp(2) })
    }
    private fun loading(value: Boolean, preserveInputs: Boolean = false) {
        busy = value; progress.visibility = if (value) View.VISIBLE else View.GONE
        controls.forEach { if (!(value && preserveInputs && it is EditText)) it.isEnabled = !value }
    }
    private fun run(operation: () -> JSONObject, changing: Boolean = false, refreshing: Boolean = false, failed: ((Exception) -> Unit)? = null, expectedTransport: ErpConsoleTransport = api, done: (JSONObject) -> Unit) {
        if (busy || api !== expectedTransport) return
        val ticket = screen
        mutation = changing; loading(true, preserveInputs = refreshing)
        if (!refreshing) status(getString(R.string.erp_loading))
        worker.execute {
            if (api !== expectedTransport) return@execute
            try {
                val result = operation()
                main.post {
                    if (ticket == screen && api === expectedTransport && !isDestroyed) {
                        loading(false); mutation = false; uncertain = false; status(""); done(result)
                    }
                }
            } catch (error: Exception) {
                main.post {
                    if (ticket == screen && api === expectedTransport && !isDestroyed) {
                        loading(false); mutation = false
                        val failure = error as? ErpConsoleTransport.Failure
                        uncertain = changing && (failure?.outcomeUnknown == true || failure?.code == "IDEMPOTENCY_CONFLICT")
                        if (failure?.status == 401 || (refreshing && failure?.status == 403) || failure?.code in setOf("NEEDS_REAUTH", "ACCESS_CHANGED")) {
                            api.clear(); actor = null; showLogin(); status(getString(R.string.erp_session_expired))
                        } else {
                            status(if (uncertain) getString(R.string.erp_unknown_result) else errorText(error))
                            failed?.invoke(error)
                        }
                    }
                }
            }
        }
    }
    private fun errorText(error: Exception): String {
        val failure = error as? ErpConsoleTransport.Failure
        val code = failure?.code ?: error.message.orEmpty()
        return getString(when {
            code == "INVALID_ORIGIN" -> R.string.error_origin
            code == "INVALID_LOGIN_INPUT" || code == "INVALID_MESSAGE" -> R.string.error_validation
            code == "SENSITIVE_COMMAND" -> R.string.erp_sensitive_command
            code == "LOCAL_ERP_REAUTH_REQUIRED" -> R.string.erp_federation_device_proof
            failure?.status == 403 -> R.string.erp_access_denied
            failure?.status == 409 -> R.string.error_conflict
            failure?.status == 429 -> R.string.erp_rate_limit
            failure?.status == 400 || failure?.status == 422 -> R.string.error_validation
            code == "NETWORK_ERROR" || error is java.io.IOException || failure?.outcomeUnknown == true || (failure?.status ?: 0) >= 500 -> R.string.erp_connection_error
            else -> R.string.erp_request_failed
        })
    }
    private fun scheduleRefresh(delay: Long) {
        nextRefreshDelay = delay
        main.removeCallbacks(refreshTick)
        if (foreground && refreshRead != null && !isDestroyed) main.postDelayed(refreshTick, delay)
    }
    private fun authority(value: JSONObject?): String {
        val identity = JSONArray().put(value?.optString("userId")).put(value?.optString("companyId"))
        listOf("roles", "permissions", "siteIds", "warehouseIds", "customerIds").forEach { key ->
            val values = value?.optJSONArray(key) ?: JSONArray()
            identity.put(JSONArray((0 until values.length()).map { values.optString(it) }.sorted()))
        }
        return identity.toString()
    }
    /** The only repeating work is authenticated GET. Forms and uncertain writes never retry themselves. */
    private fun observe(interval: Long = 30_000, operation: () -> JSONObject, apply: (JSONObject) -> Unit) {
        val ticket = screen
        val transport = api
        var lastPayload: String? = null
        var lastUpdated: String? = null
        refreshRead = refresh@{
            if (!foreground || ticket != screen || isDestroyed) return@refresh
            main.removeCallbacks(refreshTick)
            if (busy) { scheduleRefresh(1_000); return@refresh }
            if (uncertain || transport.hasPendingCommand() && !transport.hasNativeMediaPending()) { scheduleRefresh(interval); return@refresh }
            val wait = readRetryAt - android.os.SystemClock.elapsedRealtime()
            if (wait > 0) { status(getString(R.string.erp_rate_limit)); scheduleRefresh(wait); return@refresh }
            syncNotice.visibility = View.VISIBLE
            syncNotice.text = getString(R.string.erp_sync_updating)
            val expectedAuthority = authority(actor)
            run({
                val current = transport.me().getJSONObject("actor")
                if (authority(current) != expectedAuthority) throw ErpConsoleTransport.Failure(401, "ACCESS_CHANGED", false)
                operation().put("_actor", current)
            }, refreshing = true, expectedTransport = transport, failed = { error ->
                val failure = error as? ErpConsoleTransport.Failure
                val retryable = failure?.code == "NETWORK_ERROR" || error is java.io.IOException || failure?.status == 429 || (failure?.status ?: 0) >= 500
                syncNotice.text = if (lastUpdated == null) getString(R.string.erp_sync_waiting) else getString(R.string.erp_sync_stale, lastUpdated)
                if (retryable) {
                    refreshFailures = (refreshFailures + 1).coerceAtMost(3)
                    val serverDelay = failure?.retryAfterMillis ?: 0
                    readRetryAt = android.os.SystemClock.elapsedRealtime() + serverDelay
                    scheduleRefresh(ErpReadRetry.delay(interval, refreshFailures, serverDelay, Math.random()))
                } // Protocol and other client errors require an explicit refresh or a new foreground entry.
            }) { result ->
                actor = result.getJSONObject("_actor")
                val payload = result.toString()
                val scroll = scroller.scrollY
                if (payload != lastPayload) { apply(result); lastPayload = payload }
                scroller.post { if (screen == ticket && !isDestroyed) scroller.scrollTo(0, scroll) }
                lastUpdated = java.time.LocalTime.now().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss", resources.configuration.locales[0]))
                syncNotice.text = if (demoMode) getString(R.string.erp_demo_banner) else getString(R.string.erp_sync_updated, lastUpdated)
                refreshFailures = 0; readRetryAt = 0
                if (!demoMode) scheduleRefresh(interval)
            }
        }
        refreshRead?.invoke()
    }
    private fun showLogin() {
        actor = null; pendingRecovery = null
        heading(getString(R.string.erp_title), getString(R.string.erp_login_intro))
        button(getString(R.string.language_label)) { chooseLanguage() }
        val connection = label(getString(R.string.erp_server_connecting), 14f, muted, panel())
        label(getString(R.string.erp_server_automatic), 13f, muted)
        var resolvedOrigin = ""
        val ticket = screen
        val resolver = discovery
        var configRetryAt = 0L
        var configFailures = 0
        refreshRead = discover@{
            if (!foreground || ticket != screen || isDestroyed || busy || discoveryBusy) return@discover
            val wait = configRetryAt - android.os.SystemClock.elapsedRealtime()
            if (wait > 0) { scheduleRefresh(wait); return@discover }
            discoveryBusy = true
            connection.text = getString(R.string.erp_server_connecting)
            configWorker.execute {
                try {
                    val origin = resolver.discover()
                    main.post {
                        if (ticket == screen && !isDestroyed) {
                            discoveryBusy = false; resolvedOrigin = origin; configFailures = 0; configRetryAt = 0
                            connection.text = getString(R.string.erp_server_connected)
                            connection.setTextColor(teal)
                            scheduleRefresh(60_000)
                        }
                    }
                } catch (error: Exception) {
                    main.post {
                        if (ticket == screen && !isDestroyed) {
                            discoveryBusy = false; resolvedOrigin = ""
                            val failure = error as? ErpConsoleTransport.Failure
                            val code = failure?.code
                            connection.text = getString(when (code) {
                                "SERVER_NOT_CONFIGURED" -> R.string.erp_server_pending
                                "SERVER_CONFIG_INVALID" -> R.string.erp_server_invalid
                                "SERVER_NOT_READY" -> R.string.erp_server_not_ready
                                else -> R.string.erp_server_unavailable
                            })
                            connection.setTextColor(muted)
                            if (code == "SERVER_NOT_CONFIGURED" || code == "SERVER_CONFIG_INVALID" || code == "SERVER_NOT_READY") scheduleRefresh(60_000)
                            else {
                                configFailures = (configFailures + 1).coerceAtMost(3)
                                val serverDelay = failure?.retryAfterMillis ?: 0
                                configRetryAt = android.os.SystemClock.elapsedRealtime() + serverDelay
                                scheduleRefresh(ErpReadRetry.delay(30_000, configFailures, serverDelay, Math.random()))
                            }
                        }
                    }
                }
            }
        }
        button(getString(R.string.erp_server_retry)) { refreshRead?.invoke() }
        val email = field(getString(R.string.erp_email), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val password = field(getString(R.string.erp_password), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        val code = field(getString(R.string.erp_otp), InputType.TYPE_CLASS_NUMBER).apply { filters = arrayOf(InputFilter.LengthFilter(6)) }
        button(getString(R.string.erp_sign_in), primary = true) {
            val url = resolvedOrigin; val address = email.text.toString().trim()
            val secret = password.text.toString(); val otp = code.text.toString()
            if (address.isBlank() || secret.isBlank()) { status(getString(R.string.erp_fields_required)); return@button }
            if (url.isBlank() || discoveryBusy) { status(getString(R.string.erp_server_wait)); refreshRead?.invoke(); return@button }
            val transport = api
            run({ transport.configure(url); transport.login(address, secret, otp) }, expectedTransport = transport, failed = { password.setText(""); code.setText("") }) { response ->
                actor = response.optJSONObject("actor")
                readRetryAt = 0
                password.setText(""); code.setText(""); recoverPending()
                if (pendingRecovery != null) showPendingRecovery() else showDashboard()
            }
        }
        if (BuildConfig.DEBUG && BuildConfig.APPLICATION_ID == "de.knaba.mobile.test") {
            button(getString(R.string.erp_federation_title)) {
                if (resolvedOrigin.isBlank() || discoveryBusy) { status(getString(R.string.erp_server_wait)); return@button }
                password.setText(""); code.setText("")
                openFederation(resolvedOrigin)
            }
        }
        label(getString(R.string.erp_privacy), 13f, muted)
        if (BuildConfig.DEBUG) {
            button(getString(R.string.erp_try_demo)) { enterDemo() }
            label(getString(R.string.erp_demo_intro), 13f, muted)
        }
        refreshRead?.invoke()
    }
    private fun enterDemo() {
        if (!BuildConfig.DEBUG) return
        api.clear(); api = DemoConsoleTransport(); demoMode = true
        val transport = api
        run({ transport.login("", "", "") }, expectedTransport = transport) { result -> actor = result.getJSONObject("actor"); showDashboard() }
    }
    private fun chooseLanguage() {
        val tags = LanguagePolicy.SUPPORTED + listOf("")
        val names = arrayOf("Deutsch", "English", "Polski", "Lietuvių", "Русский", "Українська", getString(R.string.language_device))
        AlertDialog.Builder(this).setTitle(R.string.language_label).setSingleChoiceItems(names, tags.indexOf(NativeLocale.selected(this)).coerceAtLeast(0)) { dialog, index ->
            NativeLocale.choose(this, tags[index]); sendBroadcast(Intent(NativeLocale.CHANGED).setPackage(packageName)); dialog.dismiss(); recreate()
        }.show()
    }
    private fun permitted(permission: String): Boolean {
        val permissions = actor?.optJSONArray("permissions") ?: return false
        return (0 until permissions.length()).any {
            val value = permissions.optString(it)
            value == "*" || value == permission || value == permission.substringBefore('.') + ".*"
        }
    }
    private fun showDashboard() {
        heading(getString(R.string.erp_home), getString(R.string.erp_workspace_intro))
        val roles = actor?.optJSONArray("roles") ?: JSONArray()
        label(getString(R.string.erp_role) + ": " + (0 until roles.length()).joinToString(", ") { human(roles.optString(it)) }, 13f, muted)
        val summary = panel()
        label(getString(R.string.erp_loading), 15f, muted, summary)
        button(getString(R.string.erp_refresh)) { refreshRead?.invoke() }
        val destinations = panel()
        renderModules(destinations, null)
        button(getString(R.string.erp_actions)) { showActions() }
        if (!demoMode && BuildConfig.DEBUG && BuildConfig.APPLICATION_ID == "de.knaba.mobile.test")
            button(getString(R.string.erp_federation_title)) { openFederation(api.origin()) }
        if (!demoMode) button(getString(R.string.erp_time_tools)) { startActivity(Intent(this, MainActivity::class.java)) }
        button(getString(if (demoMode) R.string.erp_exit_demo else R.string.erp_logout)) { signOut() }
        label(getString(if (demoMode) R.string.erp_demo_intro else R.string.erp_presence_notice), 13f, muted)
        val transport = api
        observe(operation = { transport.dashboard() }) { result ->
            summary.removeAllViews()
            label(getString(R.string.erp_active_sites, result.optInt("activeSites")), 18f, ink, summary)
            label(getString(R.string.erp_active_shifts) + ": " + result.optInt("activeShifts"), 16f, muted, summary)
            label(getString(R.string.erp_open_decisions, result.optInt("openDecisions")), 16f, muted, summary)
            clearList(destinations); renderModules(destinations, result.optJSONObject("counts"))
        }
    }
    private fun renderModules(parent: LinearLayout, counts: JSONObject?) {
        for ((kind, name, permissions) in modules) {
            if (permissions.any(::permitted)) {
                val count = if (counts?.has(kind) == true) " · " + counts.optInt(kind) else ""
                button(getString(name) + count, parent = parent) { if (kind == "channel") showChannels() else showRecords(kind, getString(name)) }
            }
        }
    }
    private fun showMedia(initial: JSONObject? = null) {
        heading(getString(R.string.erp_files), getString(R.string.erp_server_scope), ::showDashboard, showPending = false)
        val transport = api; val token = screen
        val panel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; content.addView(this) }
        val view = ConsoleMediaScreen(this, transport, panel,
            { api === transport && screen == token && !isDestroyed },
            { _ ->
                if (api === transport && screen == token && !isDestroyed) {
                    transport.clear(); actor = null; demoMode = false; showLogin(); status(getString(R.string.erp_session_expired))
                }
            },
            { item -> showDetail(item, getString(R.string.erp_files)) { showMedia() } })
        mediaScreen = view; view.open(initial)
    }
    private fun showRecords(kind: String, title: String) {
        if (kind == "media_asset" && !demoMode) { showMedia(); return }
        heading(title, getString(R.string.erp_server_scope), ::showDashboard)
        button(getString(R.string.erp_refresh)) { refreshRead?.invoke() }
        val search = field(getString(R.string.erp_search))
        val count = label("", 13f, muted)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; content.addView(this) }
        var items = JSONArray(); var limit = 40
        fun render() {
            clearList(list)
            val query = search.text.toString().trim().lowercase(Locale.ROOT)
            val selected = (0 until items.length()).mapNotNull { items.optJSONObject(it) }.filter {
                query.isEmpty() || (recordTitle(it) + " " + recordState(it) + " " + it.optString("id")).lowercase(Locale.ROOT).contains(query)
            }
            count.text = getString(R.string.erp_count, selected.size)
            if (selected.isEmpty()) label(getString(R.string.erp_empty), color = muted, parent = list)
            selected.take(limit).forEach { item ->
                val card = panel(list)
                label(recordTitle(item), 18f, ink, card).setTypeface(null, Typeface.BOLD)
                recordState(item).takeIf { it.isNotBlank() }?.let { label(human(it), 13f, teal, card) }
                button(getString(R.string.erp_view_details), parent = card) { showDetail(item, title) { showRecords(kind, title) } }
            }
            if (selected.size > limit) button(getString(R.string.erp_more), parent = list) { limit += 40; render() }
        }
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { limit = 40; render() }
            override fun afterTextChanged(s: Editable?) {}
        })
        val transport = api
        observe(operation = { JSONObject().put("items", transport.entities(kind)) }) { result ->
            items = result.getJSONArray("items"); render()
        }
    }
    private fun recordTitle(item: JSONObject): String {
        val data = item.optJSONObject("data") ?: JSONObject()
        return listOf("name", "title", "code", "subject", "email").map { data.optString(it) }.firstOrNull { it.isNotBlank() }
            ?: item.optString("id").take(12)
    }
    private fun recordState(item: JSONObject): String {
        val data = item.optJSONObject("data") ?: JSONObject()
        return listOf("state", "activity", "status").map { data.optString(it) }.firstOrNull { it.isNotBlank() } ?: ""
    }
    private fun showDetail(item: JSONObject, title: String, back: () -> Unit) {
        heading(recordTitle(item), title, back)
        val card = panel()
        val actions = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; content.addView(this) }
        button(getString(R.string.erp_refresh)) { refreshRead?.invoke() }
        button(getString(R.string.erp_actions)) { showActions() }
        val transport = api
        val id = item.optString("id"); val kind = item.optString("kind")
        observe(operation = {
            val rows = transport.entities(kind)
            val fresh = (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.firstOrNull { it.optString("id") == id }
                ?: throw ErpConsoleTransport.Failure(403, "ACCESS_CHANGED", false)
            JSONObject().put("item", fresh).put("catalog", if ((ConsoleRecordActions.supports(kind) || kind in setOf("site", "task")) && fresh.optInt("version") > 0) transport.catalog() else JSONArray())
        }) { result ->
            val fresh = result.getJSONObject("item")
            val data = fresh.optJSONObject("data") ?: JSONObject()
            screenTitle.text = recordTitle(fresh)
            clearList(card); clearList(actions)
            showValues(data, card)
            label(getString(R.string.erp_record_id), 12f, muted, card)
            label(id, 14f, ink, card).setTextIsSelectable(true)
            if (fresh.has("version")) label(getString(R.string.erp_record_version, fresh.optInt("version")), 13f, muted, card)
            val taskActions = when (data.optString("status", data.optString("state"))) {
                "ASSIGNED" -> setOf("task.start")
                "IN_PROGRESS" -> setOf("task.worklog", "task.submit")
                else -> emptySet()
            }
            val catalog = result.getJSONArray("catalog")
            if (!demoMode && kind in setOf("site", "task") && permitted("media.upload") &&
                (kind != "task" || actor?.let { !ErpMedia.external(it) } == true) &&
                (0 until catalog.length()).any { catalog.optJSONObject(it)?.optString("name") == "media.register" }) {
                button(getString(R.string.erp_media_add), primary = true, parent = actions) { showMedia(JSONObject(fresh.toString())) }
            }
            for (i in 0 until catalog.length()) {
                val command = catalog.optJSONObject(i) ?: continue
                val name = command.optString("name")
                val field = ConsoleRecordActions.field(kind, name) ?: continue
                val schema = command.optJSONObject("schema") ?: continue
                val required = schema.optJSONArray("required") ?: continue
                if (!permitted(command.optString("permission")) ||
                    schema.optJSONObject("properties")?.optJSONObject(field)?.optString("type") != "string" ||
                    (0 until required.length()).none { required.optString(it) == field } ||
                    (kind == "task" && name !in taskActions)) continue
                button(commandTitle(name), primary = true, parent = actions) { showCommand(command, JSONObject(fresh.toString())) }
            }
        }
    }
    private fun showValues(data: JSONObject, parent: LinearLayout, depth: Int = 0) {
        data.keys().asSequence().sorted().take(40).forEach { key ->
            if (ErpCommandSecrets.sensitiveKey(key)) return@forEach
            val value = data.opt(key)
            if (value == null || value == JSONObject.NULL) return@forEach
            label(fieldLabel(key), 12f, muted, parent)
            when (value) {
                is JSONObject -> if (depth < 2) showValues(value, parent, depth + 1) else label(getString(R.string.erp_nested_data), parent = parent)
                is JSONArray -> {
                    val text = (0 until value.length()).take(20).joinToString("\n") { index ->
                        val row = value.opt(index)
                        if (row is JSONObject) listOf("name", "title", "text", "user_id", "id").map { row.optString(it) }.firstOrNull { it.isNotBlank() } ?: getString(R.string.erp_nested_data)
                        else row.toString()
                    }
                    label(text.ifEmpty { "—" }, parent = parent).setTextIsSelectable(true)
                }
                else -> label(if (value is Boolean) getString(if (value) R.string.erp_yes else R.string.erp_no) else if (value is String && key in setOf("state", "status", "activity")) human(value)
                    else if (value is Number && key in setOf("quantityMilli", "plannedQuantityMilli", "reportedQuantityMilli", "acceptedQuantityMilli")) ConsoleQuantity.display(value.toLong()) + data.optString("unit").let { if (it.isBlank()) "" else " " + quantityUnit(it) }
                    else if (key == "unit") quantityUnit(value.toString()) else value.toString(), parent = parent).setTextIsSelectable(true)
            }
        }
    }
    private fun showChannels() {
        heading(getString(R.string.erp_messages), getString(R.string.erp_server_scope), ::showDashboard)
        button(getString(R.string.erp_refresh)) { refreshRead?.invoke() }
        val channels = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; content.addView(this) }
        val transport = api
        observe(operation = { JSONObject().put("items", transport.entities("channel")) }) { result ->
            clearList(channels)
            val list = result.getJSONArray("items")
            if (list.length() == 0) label(getString(R.string.erp_empty), color = muted, parent = channels)
            for (i in 0 until list.length()) {
                val channel = list.optJSONObject(i) ?: continue
                val id = channel.optString("id"); val title = recordTitle(channel)
                button(title, parent = channels) { showConversation(id, title) }
            }
        }
    }
    private fun showConversation(channel: String, title: String) {
        heading(title, getString(R.string.erp_messages), ::showChannels)
        val messages = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; content.addView(this) }
        val composer = if (permitted("chat.write")) field(getString(R.string.erp_message), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES, multiline = true).apply {
            filters = arrayOf(InputFilter.LengthFilter(12000))
        } else null
        var pendingText: String? = null; var key = UUID.randomUUID().toString()
        val transport = api
        if (composer != null) button(getString(R.string.erp_send), primary = true) {
            if (api.hasPendingCommand() && pendingText == null && pendingRecovery != null) { showPendingRecovery(); return@button }
            val text = pendingText ?: composer.text.toString().trim()
            if (text.isEmpty()) return@button
            pendingText = text
            val language = resources.configuration.locales[0].language.uppercase(Locale.ROOT)
            pendingRecovery = PendingMutation(title, "message.send", JSONObject().put("channel_id", channel).put("text", text).put("language", language).toString(), null, key)
            run({ transport.sendMessage(channel, text, language, key) }, changing = true, expectedTransport = transport, failed = { error ->
                val failure = error as? ErpConsoleTransport.Failure
                if (failure?.outcomeUnknown == true || failure?.code == "IDEMPOTENCY_CONFLICT") composer.isEnabled = false
                else { pendingText = null; pendingRecovery = null; key = UUID.randomUUID().toString() }
            }) { pendingRecovery = null; composer.setText(""); showConversation(channel, title); status(getString(R.string.erp_sent), true) }
        }
        button(getString(R.string.erp_refresh)) {
            if (pendingText != null) status(getString(R.string.erp_unknown_result)) else refreshRead?.invoke()
        }
        observe(interval = 15_000, operation = { JSONObject().put("items", transport.messages(channel)) }) { result ->
            clearList(messages)
            val list = result.getJSONArray("items")
            if (list.length() == 0) label(getString(R.string.erp_empty), color = muted, parent = messages)
            for (i in 0 until list.length()) {
                val item = list.optJSONObject(i) ?: continue; val data = item.optJSONObject("data") ?: continue
                val own = data.optString("author_id") == actor?.optString("userId")
                val card = panel(messages).apply { background = shape(if (own) Color.rgb(218, 240, 229) else Color.WHITE) }
                label(getString(if (own) R.string.erp_you else R.string.erp_conversation), 12f, muted, card)
                label(data.optString("text"), 16f, ink, card).setTextIsSelectable(true)
                item.optString("createdAt").takeIf { it.isNotBlank() }?.let { label(displayTime(it), 12f, muted, card) }
            }
        }
    }
    private fun showActions() {
        heading(getString(R.string.erp_actions), getString(R.string.erp_actions_intro), ::showDashboard)
        button(getString(R.string.erp_refresh)) { refreshRead?.invoke() }
        val search = field(getString(R.string.erp_search))
        val actions = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; content.addView(this) }
        var catalog = JSONArray()
        fun render() {
            clearList(actions)
            val query = search.text.toString().trim()
            val matches = (0 until catalog.length()).mapNotNull { catalog.optJSONObject(it) }.filter {
                permitted(it.optString("permission")) && (query.isEmpty() ||
                    (commandTitle(it.optString("name")) + " " + it.optString("name")).contains(query, ignoreCase = true))
            }
            if (matches.isEmpty()) label(getString(R.string.erp_empty), color = muted, parent = actions)
            matches.forEach { command -> button(commandTitle(command.optString("name")), parent = actions) { showCommand(command) } }
        }
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { render() }
            override fun afterTextChanged(s: Editable?) {}
        })
        val transport = api
        observe(operation = { JSONObject().put("items", transport.catalog()) }) { result ->
            catalog = result.getJSONArray("items"); render()
        }
    }
    private fun showCommand(command: JSONObject, contextItem: JSONObject? = null) {
        val name = command.optString("name")
        val oneShot = ErpCommandSecrets.isOneShot(name)
        val contextKind = contextItem?.optString("kind").orEmpty()
        val contextTitle = modules.firstOrNull { it.kind == contextKind }?.let { getString(it.title) }.orEmpty()
        val contextField = ConsoleRecordActions.field(contextKind, name)
        heading(commandTitle(name), getString(R.string.erp_server_scope), if (contextItem == null) ::showActions else { { showDetail(contextItem, contextTitle) { showRecords(contextKind, contextTitle) } } })
        if (contextItem != null) {
            label(recordTitle(contextItem), 18f)
            label(getString(R.string.erp_record_version, contextItem.getInt("version")), 13f, muted)
        }
        if (oneShot) label(getString(R.string.erp_account_change_once), 13f, muted)
        val schema = command.optJSONObject("schema") ?: JSONObject()
        val properties = schema.optJSONObject("properties") ?: JSONObject()
        val required = schema.optJSONArray("required") ?: JSONArray()
        val mandatory = (0 until required.length()).map { required.optString(it) }.toSet()
        val readers = linkedMapOf<String, () -> Any?>()
        for (key in properties.keys().asSequence().sorted()) {
            val def = properties.optJSONObject(key) ?: JSONObject(); val type = def.optString("type", "string")
            if (key == contextField && contextItem != null) {
                readers[key] = { contextItem.getString("id") }
                continue
            }
            val snapshotValue = contextItem?.optJSONObject("data")?.opt(key)
            if (contextItem != null && key in ConsoleRecordActions.snapshotFields(contextKind) &&
                ((type == "string" && snapshotValue is String && snapshotValue.isNotBlank()) ||
                 (type == "integer" && snapshotValue is Number && snapshotValue.toLong() > 0 && snapshotValue.toDouble() == snapshotValue.toLong().toDouble()))) {
                readers[key] = { snapshotValue }
                label(fieldLabel(key) + ": " + snapshotValue, 13f, muted)
                continue
            }
            val unit = if (key == "quantityMilli") contextItem?.optJSONObject("data")?.optString("unit").orEmpty() else ""
            val caption = fieldLabel(key) + (if (unit.isNotBlank()) " (" + quantityUnit(unit) + ")" else "") + if (key in mandatory) " *" else ""
            val choices = def.optJSONArray("enum")
            if (type == "boolean") {
                val box = CheckBox(this).apply { text = caption; isChecked = def.optBoolean("default"); minHeight = dp(48); content.addView(this); controls.add(this) }
                readers[key] = { box.isChecked }
            } else if (choices != null) {
                label(caption, 13f, muted)
                val values = (0 until choices.length()).map { choices.get(it) }
                val picker = Spinner(this).apply {
                    adapter = ArrayAdapter(this@ErpConsoleActivity, android.R.layout.simple_spinner_dropdown_item, listOf(getString(R.string.erp_choose)) + values.map { human(it.toString()) })
                    minimumHeight = dp(52); content.addView(this); controls.add(this)
                }
                if (def.has("default")) picker.setSelection(values.indexOf(def.opt("default")).let { if (it < 0) 0 else it + 1 })
                readers[key] = { if (picker.selectedItemPosition == 0) null else values[picker.selectedItemPosition - 1] }
            } else {
                val secretField = ErpCommandSecrets.sensitiveKey(key)
                val inputType = if (secretField) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                    else if (key == "quantityMilli") InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL else when (type) {
                    "integer" -> InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_SIGNED
                    "number" -> InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_SIGNED or InputType.TYPE_NUMBER_FLAG_DECIMAL
                    else -> InputType.TYPE_CLASS_TEXT
                }
                val edit = field(caption, inputType, multiline = type == "object" || type == "array")
                if (secretField) edit.isSaveEnabled = false
                val defaultValue = def.opt("default")
                if (defaultValue != null && defaultValue != JSONObject.NULL) {
                    edit.setText(if (key == "quantityMilli" && defaultValue is Number) ConsoleQuantity.display(defaultValue.toLong()) else defaultValue.toString())
                }
                if (type == "object" || type == "array") label(getString(R.string.erp_json_hint), 12f, muted)
                readers[key] = {
                    val raw = if (secretField) edit.text.toString() else edit.text.toString().trim()
                    if (raw.isEmpty()) null else if (key == "quantityMilli") ConsoleQuantity.parse(raw, def.optLong("minimum", 0), def.optLong("maximum", 9_007_199_254_740_991L)) else when (type) {
                        "integer" -> raw.toLong()
                        "number" -> raw.toDouble().also { require(it.isFinite()) }
                        "array" -> JSONArray(raw)
                        "object" -> JSONObject(raw)
                        else -> raw
                    }
                }
            }
        }
        val version = if (contextItem == null && !oneShot) field(getString(R.string.erp_expected_version), InputType.TYPE_CLASS_NUMBER) else null
        var pending: JSONObject? = null; var pendingVersion: Int? = null; var key = UUID.randomUUID().toString()
        val transport = api
        val formScreen = screen; val formRevision = transport.sessionRevision()
        button(getString(R.string.erp_submit), primary = true) {
            if (api.hasPendingCommand() && pending == null && pendingRecovery != null) { showPendingRecovery(); return@button }
            if (pending == null) {
                try {
                    val input = JSONObject()
                    for ((field, read) in readers) {
                        val value = read()
                        if (value == null && field in mandatory) throw IllegalArgumentException()
                        if (value != null) input.put(field, value)
                    }
                    if (oneShot) ErpCommandSecrets.validateOneShot(name, input)
                    val rawVersion = version?.text?.toString()?.trim().orEmpty()
                    pendingVersion = if (contextItem != null) contextItem.getInt("version").also { require(it > 0) }
                        else if (rawVersion.isEmpty()) null else rawVersion.toInt().also { require(it > 0) }
                    pending = JSONObject(input.toString())
                } catch (_: Exception) { status(getString(R.string.error_validation)); return@button }
            }
            val payload = pending!!
            val submit = submit@{
                if (api !== transport || screen != formScreen || transport.sessionRevision() != formRevision || isDestroyed) return@submit
                if (oneShot) {
                    val requestVersion = pendingVersion
                    controls.filterIsInstance<EditText>().forEach { it.setText("") }
                    pending = null; pendingVersion = null; pendingRecovery = null
                    run({ transport.command(name, payload, requestVersion, key) }, changing = true, expectedTransport = transport, failed = { error ->
                        api.clear(); actor = null; showLogin()
                        val unknown = (error as? ErpConsoleTransport.Failure)?.outcomeUnknown == true
                        status((if (unknown) getString(R.string.erp_unknown_result) + " " else "") + getString(R.string.erp_account_change_reauth))
                    }) { api.clear(); actor = null; showLogin(); status(getString(R.string.erp_account_change_reauth), true) }
                } else {
                    pendingRecovery = PendingMutation(commandTitle(name), name, payload.toString(), pendingVersion, key)
                    run({ transport.command(name, payload, pendingVersion, key) }, changing = true, expectedTransport = transport, failed = { error ->
                        val failure = error as? ErpConsoleTransport.Failure
                        if (failure?.outcomeUnknown == true || failure?.code == "IDEMPOTENCY_CONFLICT") controls.filterNot { it is Button }.forEach { it.isEnabled = false }
                        else { pending = null; pendingVersion = null; pendingRecovery = null; key = UUID.randomUUID().toString() }
                    }) { pendingRecovery = null; if (contextItem == null) showActions() else showRecords(contextKind, contextTitle); status(getString(R.string.erp_saved), true) }
                }
            }
            if (command.optBoolean("highRisk")) {
                val summary = commandTitle(name) + if (contextItem == null) "" else "\n" + recordTitle(contextItem) + "\n" + getString(R.string.erp_record_version, contextItem.getInt("version"))
                AlertDialog.Builder(this).setTitle(R.string.erp_confirm_sensitive).setMessage(summary)
                    .setNegativeButton(R.string.erp_cancel) { _, _ -> if (!uncertain) { pending = null; pendingVersion = null } }
                    .setPositiveButton(R.string.erp_confirm) { _, _ -> submit() }.show()
            } else submit()
        }
    }
    private fun showPendingRecovery() {
        if (api.hasNativeMediaPending()) { showMedia(); return }
        val pending = pendingRecovery ?: return showDashboard()
        heading(getString(R.string.erp_unknown_title), getString(R.string.erp_unknown_result), ::showDashboard, showPending = false)
        label(pending.title, 20f)
        showValues(JSONObject(pending.input), panel())
        val transport = api
        button(getString(R.string.erp_retry_pending), primary = true) {
            run({ transport.command(pending.name, JSONObject(pending.input), pending.version, pending.key) }, changing = true, expectedTransport = transport, failed = { error ->
                val failure = error as? ErpConsoleTransport.Failure
                if (failure?.outcomeUnknown != true && failure?.code != "IDEMPOTENCY_CONFLICT") pendingRecovery = null
            }) { pendingRecovery = null; showDashboard(); status(getString(R.string.erp_saved), true) }
        }
        label(getString(R.string.erp_unknown_leave), 13f, muted)
    }
    private fun displayTime(value: String): String = try {
        java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm z", resources.configuration.locales[0])
            .withZone(java.time.ZoneId.of("Europe/Berlin")).format(java.time.Instant.parse(value))
    } catch (_: Exception) { value }
    private fun fieldLabel(key: String): String {
        val resource = when (key) {
            "name", "title" -> R.string.erp_field_name
            "text", "description" -> R.string.erp_field_description
            "status", "state" -> R.string.erp_field_status
            "email" -> R.string.erp_email
            "currentPassword" -> R.string.erp_current_password
            "newPassword" -> R.string.erp_new_password
            "secret" -> R.string.erp_mfa_secret
            "otp" -> R.string.erp_otp
            "phone" -> R.string.erp_field_phone
            "address" -> R.string.erp_field_address
            "siteId", "site_id" -> R.string.erp_sites
            "taskId", "task_id" -> R.string.erp_task_id
            "quantityMilli" -> R.string.erp_quantity
            "plannedQuantityMilli" -> R.string.erp_planned_quantity
            "reportedQuantityMilli" -> R.string.erp_reported_quantity
            "acceptedQuantityMilli" -> R.string.erp_accepted_quantity
            "id" -> R.string.erp_record_id
            else -> return human(key)
        }
        return getString(resource)
    }
    private fun quantityUnit(value: String): String = when (value) {
        "M2" -> "m²"
        "HOUR" -> "h"
        else -> human(value)
    }
    private fun commandTitle(name: String): String {
      val title = when (name) {
        "task.start" -> getString(R.string.erp_start_task)
        "task.worklog" -> getString(R.string.erp_log_work)
        "task.submit" -> getString(R.string.erp_submit_task)
        "user.password.rotate" -> getString(R.string.erp_change_password)
        "user.mfa.configure" -> getString(R.string.erp_configure_mfa)
        "request.submit", "request.batch.submit", "payout.submit", "order.submit", "issue.submit" -> getString(R.string.erp_action_submit)
        "quote.approve", "payout.approve", "report.approve", "procurement.approve" -> getString(R.string.erp_action_approve)
        "request.approve", "request.batch.approve", "timesheet.review", "report.review", "order.review", "trip.approve" -> getString(R.string.erp_action_review)
        "request.close", "request.batch.close", "procurement.close" -> getString(R.string.erp_action_close)
        "request.ack", "payout.ack", "report.ack" -> getString(R.string.erp_action_receipt)
        "payout.ack_amend" -> getString(R.string.erp_action_receipt_amend)
        "quote.send" -> getString(R.string.erp_action_send)
        "quote.accept", "crew_assignment.acknowledge" -> getString(R.string.erp_action_accept)
        "quote.reject", "crew_assignment.decline" -> getString(R.string.erp_action_decline)
        "quote.expire", "crew_assignment.expire" -> getString(R.string.erp_action_expire)
        "crew_assignment.start" -> getString(R.string.erp_action_start)
        "dispatch.reschedule" -> getString(R.string.erp_action_reschedule)
        "order.confirm" -> getString(R.string.erp_action_confirm)
        "order.link_site", "issue.link_work" -> getString(R.string.erp_action_link)
        "order.transition" -> getString(R.string.erp_action_status)
        "timesheet.lock" -> getString(R.string.erp_action_lock)
        "timesheet.correction" -> getString(R.string.erp_action_correct)
        "timesheet.correction.bulk" -> getString(R.string.erp_action_correct_bulk)
        "payout.cancel" -> getString(R.string.erp_action_cancel)
        "payout.record" -> getString(R.string.erp_action_record_payment)
        "payout.reconcile", "procurement.reconcile" -> getString(R.string.erp_action_reconcile)
        "payout.reverse" -> getString(R.string.erp_action_reverse)
        "procurement.order" -> getString(R.string.erp_action_order)
        "procurement.receive" -> getString(R.string.erp_action_receive)
        "procurement.confirm_delivery", "report.delivered" -> getString(R.string.erp_action_delivery)
        "report.refresh" -> getString(R.string.erp_action_refresh)
        "report.publish" -> getString(R.string.erp_action_publish)
        "report.revise" -> getString(R.string.erp_action_revise)
        "issue.qualify" -> getString(R.string.erp_action_classify)
        "issue.resolve" -> getString(R.string.erp_action_resolve)
        "issue.reopen" -> getString(R.string.erp_action_reopen)
        "trip.destination" -> getString(R.string.erp_action_destination)
        "trip.stop" -> getString(R.string.erp_action_stop)
        "trip.resume" -> getString(R.string.erp_action_resume)
        "trip.arrive" -> getString(R.string.erp_action_arrive)
        "trip.end" -> getString(R.string.erp_action_end)
        else -> human(name)
      }
      val kind = ConsoleRecordActions.kind(name)
      if (kind == null || kind == "task") return title
      val module = modules.firstOrNull { it.kind == kind } ?: return title
      return getString(module.title) + " · " + title
    }
    private fun human(value: String): String = when (value) {
        "ASSIGNED" -> getString(R.string.erp_state_assigned)
        "IN_PROGRESS" -> getString(R.string.erp_state_progress)
        "SUBMITTED_FOR_REVIEW" -> getString(R.string.erp_state_review)
        "ACCEPTED" -> getString(R.string.erp_state_accepted)
        "REJECTED" -> getString(R.string.erp_state_rejected)
        "CANCELLED" -> getString(R.string.erp_state_cancelled)
        "ACTIVE" -> getString(R.string.erp_state_active)
        "OPEN" -> getString(R.string.erp_state_open)
        "EMPLOYEE" -> getString(R.string.erp_role_employee)
        else -> value.replace(Regex("([a-z])([A-Z])"), "$1 $2").replace('_', ' ').replace('.', ' ').lowercase(resources.configuration.locales[0]).replaceFirstChar { it.titlecase(resources.configuration.locales[0]) }
    }
    private fun signOut(confirmed: Boolean = false) {
        if (mutation && busy) { status(getString(R.string.erp_wait)); return }
        if (!confirmed && api.hasPendingCommand()) {
            val dialogScreen = screen; val dialogTransport = api; val dialogRevision = api.federationAuthorityRevision()
            AlertDialog.Builder(this).setTitle(R.string.erp_unknown_title).setMessage(R.string.erp_unknown_leave)
                .setNegativeButton(R.string.erp_cancel, null).setPositiveButton(R.string.erp_logout) { _, _ ->
                    if (!isDestroyed && screen == dialogScreen && api === dialogTransport && dialogTransport.federationAuthorityRevision() == dialogRevision) signOut(true)
                }.show()
            return
        }
        val logout = api.detachSessionForLogout()
        screen++; actor = null; demoMode = false; pendingRecovery = null; api = newTransport(); worker.execute(logout); showLogin()
    }
    private fun stopFederation() {
        main.removeCallbacks(federationTick)
        federation?.let { it.cancel(); ErpFederationBrowser.forget(it) }
        federation = null; federationRendered = ""
    }
    private fun leaveFederation() {
        stopFederation()
        if (api.isSignedIn && actor != null) {
            if (pendingRecovery != null && api.hasPendingCommand()) showPendingRecovery() else showDashboard()
        } else showLogin()
    }
    private fun openFederation(origin: String) {
        if (!BuildConfig.DEBUG || BuildConfig.APPLICATION_ID != "de.knaba.mobile.test" || demoMode) return
        stopFederation(); api.configure(origin)
        val flow = api.federationLogin(true)
        federation = flow; federationRendered = ""
        updateFederation()
        federationWork(flow) { flow.discover() }
    }
    /** Separate from run(): a candidate 401/403 must never clear the existing account. */
    private fun federationWork(flow: ErpFederationLogin, operation: () -> Unit) {
        if (!flow.reserveWork()) return
        loading(true)
        worker.execute {
            try { operation() } catch (_: Exception) { /* The typed attempt exposes only a safe code/state. */ }
            finally { flow.finishWork() }
            main.post { if (federation === flow && !isDestroyed) updateFederation() }
        }
        main.removeCallbacks(federationTick)
        if (foreground) main.postDelayed(federationTick, 200)
    }
    private fun updateFederation() {
        val flow = federation ?: return
        if (isDestroyed) return
        val phase = flow.phase()
        if (phase == ErpFederationLogin.Phase.VERIFIED && foreground) {
            try {
                val adopted = flow.adopt()
                val profile = adopted.profile
                api = adopted.transport
                actor = profile.getJSONObject("actor"); demoMode = false; readRetryAt = 0
                recoverPending()
                if (pendingRecovery != null) showPendingRecovery() else showDashboard()
            } catch (_: Exception) { federationRendered = ""; updateFederation() }
            return
        }
        if (phase == ErpFederationLogin.Phase.ADOPTED) {
            val profile = flow.adoptedProfile()
            if (profile != null) {
                actor = profile.getJSONObject("actor"); demoMode = false; readRetryAt = 0
                recoverPending()
                if (pendingRecovery != null) showPendingRecovery() else showDashboard()
                return
            }
            leaveFederation(); return
        }
        val state = phase.name + ":" + flow.errorCode()
        if (state != federationRendered) {
            heading(getString(R.string.erp_federation_title), getString(R.string.erp_federation_intro),
                back = { leaveFederation() }, showPending = false, keepFederation = true)
            federationRendered = state
            label(getString(R.string.erp_federation_test), 13f, muted)
            when (phase) {
                ErpFederationLogin.Phase.READY -> {
                    label(getString(R.string.erp_federation_source), 16f)
                    flow.authorities().forEach { source ->
                        label(source.siteOrigin, 13f, muted)
                        button(getString(R.string.erp_federation_continue, source.label), primary = true) {
                            federationWork(flow) { flow.start(source.id) }
                        }
                    }
                }
                ErpFederationLogin.Phase.BROWSER -> label(getString(R.string.erp_federation_wait), 16f)
                ErpFederationLogin.Phase.RECOVERABLE -> {
                    status(getString(R.string.erp_federation_unknown))
                    button(getString(R.string.erp_federation_check), primary = true) { federationWork(flow) { flow.recover() } }
                }
                ErpFederationLogin.Phase.UNAVAILABLE -> status(getString(R.string.erp_federation_unavailable))
                ErpFederationLogin.Phase.RESTART_REQUIRED, ErpFederationLogin.Phase.CANCELLED -> {
                    status(getString(when (flow.errorCode()) {
                        "FEDERATION_EXPIRED" -> R.string.erp_federation_expired
                        "FEDERATION_BROWSER_UNAVAILABLE" -> R.string.erp_federation_browser_missing
                        "FEDERATION_UNAVAILABLE", "FEDERATION_INVALID_CONFIG" -> R.string.erp_federation_unavailable
                        else -> R.string.erp_federation_failed
                    }))
                    button(getString(R.string.erp_federation_restart)) { openFederation(api.origin()) }
                }
                else -> { label(getString(R.string.erp_loading), 16f); progress.visibility = View.VISIBLE }
            }
            // Cancellation remains available during network I/O; it invalidates adoption immediately.
            button(getString(R.string.erp_federation_cancel), navigation = true) { leaveFederation() }
        }
        loading(flow.workPending())
        if (!foreground) return
        if (phase == ErpFederationLogin.Phase.BROWSER) {
            try {
                flow.takeBrowserLaunch()?.let { address ->
                    ErpFederationBrowser.arm(flow)
                    startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(address)).addCategory(Intent.CATEGORY_BROWSABLE))
                }
            } catch (_: android.content.ActivityNotFoundException) { flow.browserUnavailable(); federationRendered = ""; updateFederation(); return }
            catch (_: SecurityException) { flow.browserUnavailable(); federationRendered = ""; updateFederation(); return }
            catch (_: Exception) { federationRendered = ""; updateFederation(); return }
        }
        if (phase == ErpFederationLogin.Phase.CALLBACK && flow.takeCallback()) federationWork(flow) { flow.redeem() }
        main.removeCallbacks(federationTick)
        if (phase in setOf(ErpFederationLogin.Phase.NEW, ErpFederationLogin.Phase.DISCOVERING, ErpFederationLogin.Phase.STARTING,
                ErpFederationLogin.Phase.BROWSER, ErpFederationLogin.Phase.CALLBACK, ErpFederationLogin.Phase.REDEEMING,
                ErpFederationLogin.Phase.CHECKING, ErpFederationLogin.Phase.RECOVERABLE))
            main.postDelayed(federationTick, if (phase == ErpFederationLogin.Phase.BROWSER || phase == ErpFederationLogin.Phase.RECOVERABLE) 5_000 else 250)
    }
    private fun goBack() {
        if (mutation && busy) { status(getString(R.string.erp_wait)); return }
        val action = backAction
        val dialogScreen = screen; val dialogTransport = api; val dialogRevision = api.federationAuthorityRevision()
        val current = { !isDestroyed && screen == dialogScreen && api === dialogTransport && dialogTransport.federationAuthorityRevision() == dialogRevision }
        if (uncertain || api.hasPendingCommand()) {
            AlertDialog.Builder(this).setTitle(R.string.erp_unknown_title).setMessage(R.string.erp_unknown_leave)
                .setNegativeButton(R.string.erp_cancel, null).setPositiveButton(R.string.erp_confirm) { _, _ -> if (current()) { uncertain = false; if (action == null) signOut(true) else action() } }.show()
        } else if (action != null) action() else if (actor != null) {
            AlertDialog.Builder(this).setTitle(R.string.erp_logout).setMessage(R.string.erp_logout_question)
                .setNegativeButton(R.string.erp_cancel, null).setPositiveButton(R.string.erp_logout) { _, _ -> if (current()) signOut() }.show()
        } else finish()
    }
    // API 33+ is handled by the registered platform OnBackInvokedCallback above.
    // Retain the legacy key/fallback path for any platform that dispatches it;
    // the lint rule cannot infer the separate platform dispatcher registration.
    @SuppressLint("GestureBackNavigation")
    @Deprecated("Compatibility fallback; modern gestures use the platform back dispatcher")
    override fun onBackPressed() { goBack() }
    override fun onStart() {
        super.onStart(); foreground = true
        if (federation != null) { updateFederation(); return }
        mediaScreen?.onForeground()
        // Start deferred initial work or resume an idle screen only while visible.
        if (!busy && !discoveryBusy) scheduleRefresh(if (startedOnce) 0 else nextRefreshDelay)
        startedOnce = true
    }
    override fun onStop() {
        foreground = false; mediaScreen?.onBackground(); main.removeCallbacks(refreshTick); main.removeCallbacks(federationTick); super.onStop()
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(Intent()) // The callback's only input is the process-owned, validated attempt.
        if (foreground && federation != null) updateFederation()
    }
    @Suppress("DEPRECATION")
    @Deprecated("Platform Activity picker callback; this application does not depend on AndroidX Activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (mediaScreen?.result(requestCode, resultCode, data) != true) super.onActivityResult(requestCode, resultCode, data)
    }
    override fun onRetainNonConfigurationInstance(): Any = RetainedSession(api, discovery, actor, demoMode, pendingRecovery, federation)
    override fun onDestroy() {
        mediaScreen?.close(); mediaScreen = null
        removePlatformBackCallback?.invoke(); removePlatformBackCallback = null
        screen++; if (!isChangingConfigurations) { stopFederation(); api.clear() }
        foreground = false; refreshRead = null
        main.removeCallbacksAndMessages(null); worker.shutdown(); configWorker.shutdownNow(); super.onDestroy()
    }
}
