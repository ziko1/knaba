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
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private lateinit var content: LinearLayout
    private lateinit var notice: TextView
    private lateinit var progress: ProgressBar
    private lateinit var scroller: ScrollView
    private var screen = 0L
    private var actor: JSONObject? = null
    private var demoMode = false
    private var busy = false
    private var mutation = false
    private var uncertain = false
    private var backAction: (() -> Unit)? = null
    private var removePlatformBackCallback: (() -> Unit)? = null
    private data class PendingMutation(val title: String, val name: String, val input: String, val version: Int?, val key: String)
    private data class RetainedSession(val transport: ErpConsoleTransport, val actor: JSONObject?, val demo: Boolean, val pending: PendingMutation?)
    private var pendingRecovery: PendingMutation? = null
    private val controls = mutableListOf<View>()
    private val ink = Color.rgb(24, 52, 52)
    private val teal = Color.rgb(0, 105, 94)
    private val muted = Color.rgb(86, 109, 107)
    private val modules = listOf(
        Triple("task", R.string.erp_tasks, "task.read"),
        Triple("site", R.string.erp_sites, "site.read"),
        Triple("order", R.string.erp_orders, "order.manage"),
        Triple("lead", R.string.erp_requests, "lead.read"),
        Triple("channel", R.string.erp_messages, "chat.read"),
        Triple("decision", R.string.erp_decisions, "decisions.read"),
        Triple("crew_assignment", R.string.erp_crew, "crew.assign"),
        Triple("employee", R.string.erp_people, "operations.read"),
        Triple("shift", R.string.erp_shifts, "shift.read"),
        Triple("presence", R.string.erp_presence, "location.presence.read"),
        Triple("customer", R.string.erp_customers, "customer.manage"),
        Triple("notification", R.string.erp_alerts, "notifications.manage"),
        Triple("user", R.string.erp_users, "identity.manage"),
        Triple("bot_config", R.string.erp_settings, "bot.manage")
    )

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
            api = retained.transport; actor = retained.actor; demoMode = retained.demo; pendingRecovery = retained.pending
            if (actor != null) { if (pendingRecovery != null && api.hasPendingCommand()) showPendingRecovery() else showDashboard() }
            else showLogin()
        } else showLogin()
    }
    private fun newTransport() = ErpConsoleTransport(ConsoleRecoveryJournal(applicationContext))
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
    private fun heading(title: String, subtitle: String = "", back: (() -> Unit)? = null, showPending: Boolean = true) {
        screen++
        busy = false; mutation = false; uncertain = false; controls.clear(); backAction = back
        content.removeAllViews()
        if (demoMode) label(getString(R.string.erp_demo_banner), color = Color.rgb(104, 62, 0)).apply {
            background = shape(Color.rgb(255, 239, 197)); setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        if (back != null) button(getString(R.string.erp_back), navigation = true) { goBack() }
        label("KNABA DE", 12f, teal).apply { letterSpacing = .14f; setTypeface(null, Typeface.BOLD) }
        label(title, 28f).apply { setTypeface(null, Typeface.BOLD); setPadding(0, dp(4), 0, dp(8)) }
        if (subtitle.isNotEmpty()) label(subtitle, 14f, muted)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true; visibility = View.GONE
        }
        content.addView(progress, LinearLayout.LayoutParams(-1, dp(4)))
        notice = label("", 14f, Color.rgb(142, 48, 35)).apply {
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE; visibility = View.GONE
        }
        if (showPending && pendingRecovery != null && api.hasPendingCommand()) {
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
        this.text = text; isAllCaps = false; textSize = 15f; minHeight = dp(50)
        setTextColor(if (primary) Color.WHITE else teal)
        background = shape(if (primary) teal else Color.WHITE, if (primary) null else Color.rgb(213, 228, 223))
        setPadding(dp(14), dp(8), dp(14), dp(8))
        parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9); bottomMargin = dp(3) })
        if (!navigation) { controls.add(this); isEnabled = !busy }
        setOnClickListener { if (!busy || navigation) action() }
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
    private fun loading(value: Boolean) {
        busy = value; progress.visibility = if (value) View.VISIBLE else View.GONE
        controls.forEach { it.isEnabled = !value }
    }
    private fun run(operation: () -> JSONObject, changing: Boolean = false, failed: ((Exception) -> Unit)? = null, done: (JSONObject) -> Unit) {
        if (busy) return
        val ticket = screen
        mutation = changing; loading(true); status(getString(R.string.erp_loading))
        worker.execute {
            try {
                val result = operation()
                main.post {
                    if (ticket == screen && !isDestroyed) {
                        loading(false); mutation = false; uncertain = false; status(""); done(result)
                    }
                }
            } catch (error: Exception) {
                main.post {
                    if (ticket == screen && !isDestroyed) {
                        loading(false); mutation = false
                        val failure = error as? ErpConsoleTransport.Failure
                        uncertain = changing && (failure?.outcomeUnknown == true || failure?.code == "IDEMPOTENCY_CONFLICT")
                        if (failure?.status == 401 || failure?.code in setOf("NEEDS_REAUTH", "ACCESS_CHANGED")) {
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
            failure?.status == 403 -> R.string.erp_access_denied
            failure?.status == 409 -> R.string.error_conflict
            failure?.status == 429 -> R.string.erp_rate_limit
            failure?.status == 400 || failure?.status == 422 -> R.string.error_validation
            error is java.io.IOException || failure?.outcomeUnknown == true || (failure?.status ?: 0) >= 500 -> R.string.erp_connection_error
            else -> R.string.erp_request_failed
        })
    }
    private fun showLogin() {
        actor = null; pendingRecovery = null
        heading(getString(R.string.erp_title), getString(R.string.erp_login_intro))
        if (BuildConfig.DEBUG) {
            button(getString(R.string.erp_try_demo), primary = true) { enterDemo() }
            label(getString(R.string.erp_demo_intro), 13f, muted)
        }
        button(getString(R.string.language_label)) { chooseLanguage() }
        val server = field(getString(R.string.erp_server), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        server.setText(getPreferences(Context.MODE_PRIVATE).getString("erp-origin", ""))
        val email = field(getString(R.string.erp_email), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val password = field(getString(R.string.erp_password), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        val code = field(getString(R.string.erp_otp), InputType.TYPE_CLASS_NUMBER).apply { filters = arrayOf(InputFilter.LengthFilter(6)) }
        button(getString(R.string.erp_sign_in), primary = true) {
            val url = server.text.toString().trim(); val address = email.text.toString().trim()
            val secret = password.text.toString(); val otp = code.text.toString()
            if (url.isBlank() || address.isBlank() || secret.isBlank()) { status(getString(R.string.erp_fields_required)); return@button }
            val transport = api
            run({ transport.configure(url); transport.login(address, secret, otp) }, failed = { password.setText(""); code.setText("") }) { response ->
                actor = response.optJSONObject("actor")
                getPreferences(Context.MODE_PRIVATE).edit().putString("erp-origin", transport.origin()).apply()
                password.setText(""); code.setText(""); recoverPending()
                if (pendingRecovery != null) showPendingRecovery() else showDashboard()
            }
        }
        label(getString(R.string.erp_privacy), 13f, muted)
    }
    private fun enterDemo() {
        if (!BuildConfig.DEBUG) return
        api.clear(); api = DemoConsoleTransport(); demoMode = true
        val transport = api
        run({ transport.login("", "", "") }) { result -> actor = result.getJSONObject("actor"); showDashboard() }
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
        button(getString(R.string.erp_refresh)) { showDashboard() }
        val destinations = panel()
        renderModules(destinations, null)
        button(getString(R.string.erp_actions)) { showActions() }
        if (!demoMode) button(getString(R.string.erp_time_tools)) { startActivity(Intent(this, MainActivity::class.java)) }
        button(getString(if (demoMode) R.string.erp_exit_demo else R.string.erp_logout)) { signOut() }
        label(getString(if (demoMode) R.string.erp_demo_intro else R.string.erp_presence_notice), 13f, muted)
        val transport = api
        run({ val who = transport.me(); transport.dashboard().put("_actor", who.getJSONObject("actor")) }) { result ->
            actor = result.getJSONObject("_actor")
            summary.removeAllViews()
            label(getString(R.string.erp_active_sites, result.optInt("activeSites")), 18f, ink, summary)
            label(getString(R.string.erp_active_shifts) + ": " + result.optInt("activeShifts"), 16f, muted, summary)
            label(getString(R.string.erp_open_decisions, result.optInt("openDecisions")), 16f, muted, summary)
            clearList(destinations); renderModules(destinations, result.optJSONObject("counts"))
        }
    }
    private fun renderModules(parent: LinearLayout, counts: JSONObject?) {
        for ((kind, name, permission) in modules) {
            if (permitted(permission) || (kind == "task" && permitted("task.assign")) || (kind == "shift" && permitted("shift.manage"))) {
                val count = if (counts?.has(kind) == true) " · " + counts.optInt(kind) else ""
                button(getString(name) + count, parent = parent) { if (kind == "channel") showChannels() else showRecords(kind, getString(name)) }
            }
        }
    }
    private fun showRecords(kind: String, title: String) {
        heading(title, getString(R.string.erp_server_scope), ::showDashboard)
        button(getString(R.string.erp_refresh)) { showRecords(kind, title) }
        val search = field(getString(R.string.erp_search))
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; content.addView(this) }
        val transport = api
        run({ JSONObject().put("items", transport.entities(kind)) }) { result ->
            val items = result.getJSONArray("items"); var limit = 40
            fun render() {
                clearList(list)
                val query = search.text.toString().trim().lowercase(Locale.ROOT)
                val selected = (0 until items.length()).mapNotNull { items.optJSONObject(it) }.filter {
                    query.isEmpty() || (recordTitle(it) + " " + recordState(it) + " " + it.optString("id")).lowercase(Locale.ROOT).contains(query)
                }
                status(getString(R.string.erp_count, selected.size), success = true)
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
            render()
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
        val data = item.optJSONObject("data") ?: JSONObject()
        showValues(data, card)
        label(getString(R.string.erp_record_id), 12f, muted, card)
        label(item.optString("id"), 14f, ink, card).setTextIsSelectable(true)
        if (item.has("version")) label(getString(R.string.erp_record_version, item.optInt("version")), 13f, muted, card)
        if (item.optString("kind") == "task") {
            val transport = api
            run({ JSONObject().put("items", transport.catalog()) }) { result ->
                val list = result.getJSONArray("items")
                val state = data.optString("status", data.optString("state"))
                val applicable = when (state) {
                    "ASSIGNED" -> setOf("task.start")
                    "IN_PROGRESS" -> setOf("task.worklog", "task.submit")
                    else -> emptySet()
                }
                for (i in 0 until list.length()) {
                    val command = list.optJSONObject(i) ?: continue
                    if (command.optString("name") in applicable) button(commandTitle(command.optString("name")), primary = true) { showCommand(command, item) }
                }
            }
        }
        button(getString(R.string.erp_actions)) { showActions() }
    }
    private fun showValues(data: JSONObject, parent: LinearLayout, depth: Int = 0) {
        data.keys().asSequence().sorted().take(40).forEach { key ->
            if (key.lowercase(Locale.ROOT).contains("token") || key.lowercase(Locale.ROOT).contains("password") || key.lowercase(Locale.ROOT).contains("secret")) return@forEach
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
        button(getString(R.string.erp_refresh)) { showChannels() }
        val transport = api
        run({ JSONObject().put("items", transport.entities("channel")) }) { result ->
            val list = result.getJSONArray("items")
            if (list.length() == 0) label(getString(R.string.erp_empty), color = muted)
            for (i in 0 until list.length()) {
                val channel = list.optJSONObject(i) ?: continue
                val id = channel.optString("id"); val title = recordTitle(channel)
                button(title) { showConversation(id, title) }
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
            run({ transport.sendMessage(channel, text, language, key) }, changing = true, failed = { error ->
                val failure = error as? ErpConsoleTransport.Failure
                if (failure?.outcomeUnknown == true || failure?.code == "IDEMPOTENCY_CONFLICT") composer.isEnabled = false
                else { pendingText = null; pendingRecovery = null; key = UUID.randomUUID().toString() }
            }) { pendingRecovery = null; composer.setText(""); showConversation(channel, title); status(getString(R.string.erp_sent), true) }
        }
        button(getString(R.string.erp_refresh)) {
            if (pendingText != null) status(getString(R.string.erp_unknown_result)) else showConversation(channel, title)
        }
        run({ JSONObject().put("items", transport.messages(channel)) }) { result ->
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
        button(getString(R.string.erp_refresh)) { showActions() }
        val transport = api
        run({ JSONObject().put("items", transport.catalog()) }) { result ->
            val catalog = result.getJSONArray("items")
            if (catalog.length() == 0) label(getString(R.string.erp_empty), color = muted)
            for (index in 0 until catalog.length()) {
                val command = catalog.optJSONObject(index) ?: continue
                button(commandTitle(command.optString("name"))) { showCommand(command) }
            }
        }
    }
    private fun showCommand(command: JSONObject, contextItem: JSONObject? = null) {
        val name = command.optString("name")
        heading(commandTitle(name), getString(R.string.erp_server_scope), if (contextItem == null) ::showActions else { { showDetail(contextItem, getString(R.string.erp_tasks)) { showRecords("task", getString(R.string.erp_tasks)) } } })
        val schema = command.optJSONObject("schema") ?: JSONObject()
        val properties = schema.optJSONObject("properties") ?: JSONObject()
        val required = schema.optJSONArray("required") ?: JSONArray()
        val mandatory = (0 until required.length()).map { required.optString(it) }.toSet()
        val readers = linkedMapOf<String, () -> Any?>()
        for (key in properties.keys().asSequence().sorted()) {
            val def = properties.optJSONObject(key) ?: JSONObject(); val type = def.optString("type", "string")
            if (key == "taskId" && contextItem != null) {
                readers[key] = { contextItem.getString("id") }
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
                val inputType = if (key == "quantityMilli") InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL else when (type) {
                    "integer" -> InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_SIGNED
                    "number" -> InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_SIGNED or InputType.TYPE_NUMBER_FLAG_DECIMAL
                    else -> InputType.TYPE_CLASS_TEXT
                }
                val edit = field(caption, inputType, multiline = type == "object" || type == "array")
                val defaultValue = def.opt("default")
                if (defaultValue != null && defaultValue != JSONObject.NULL) {
                    edit.setText(if (key == "quantityMilli" && defaultValue is Number) ConsoleQuantity.display(defaultValue.toLong()) else defaultValue.toString())
                }
                if (type == "object" || type == "array") label(getString(R.string.erp_json_hint), 12f, muted)
                readers[key] = {
                    val raw = edit.text.toString().trim()
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
        val version = if (contextItem == null) field(getString(R.string.erp_expected_version), InputType.TYPE_CLASS_NUMBER) else null
        var pending: JSONObject? = null; var pendingVersion: Int? = null; var key = UUID.randomUUID().toString()
        val transport = api
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
                    val rawVersion = version?.text?.toString()?.trim().orEmpty()
                    pendingVersion = if (contextItem != null) contextItem.getInt("version").also { require(it > 0) }
                        else if (rawVersion.isEmpty()) null else rawVersion.toInt().also { require(it > 0) }
                    pending = JSONObject(input.toString())
                } catch (_: Exception) { status(getString(R.string.error_validation)); return@button }
            }
            val payload = pending!!
            val submit = {
                pendingRecovery = PendingMutation(commandTitle(name), name, payload.toString(), pendingVersion, key)
                run({ transport.command(name, payload, pendingVersion, key) }, changing = true, failed = { error ->
                    val failure = error as? ErpConsoleTransport.Failure
                    if (failure?.outcomeUnknown == true || failure?.code == "IDEMPOTENCY_CONFLICT") controls.filterNot { it is Button }.forEach { it.isEnabled = false }
                    else { pending = null; pendingVersion = null; pendingRecovery = null; key = UUID.randomUUID().toString() }
                }) { pendingRecovery = null; if (contextItem == null) showActions() else showRecords("task", getString(R.string.erp_tasks)); status(getString(R.string.erp_saved), true) }
            }
            if (command.optBoolean("highRisk")) {
                AlertDialog.Builder(this).setTitle(R.string.erp_confirm_sensitive).setMessage(commandTitle(name))
                    .setNegativeButton(R.string.erp_cancel) { _, _ -> if (!uncertain) { pending = null; pendingVersion = null } }
                    .setPositiveButton(R.string.erp_confirm) { _, _ -> submit() }.show()
            } else submit()
        }
    }
    private fun showPendingRecovery() {
        val pending = pendingRecovery ?: return showDashboard()
        heading(getString(R.string.erp_unknown_title), getString(R.string.erp_unknown_result), ::showDashboard, showPending = false)
        label(pending.title, 20f)
        showValues(JSONObject(pending.input), panel())
        val transport = api
        button(getString(R.string.erp_retry_pending), primary = true) {
            run({ transport.command(pending.name, JSONObject(pending.input), pending.version, pending.key) }, changing = true, failed = { error ->
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
    private fun commandTitle(name: String): String = when (name) {
        "task.start" -> getString(R.string.erp_start_task)
        "task.worklog" -> getString(R.string.erp_log_work)
        "task.submit" -> getString(R.string.erp_submit_task)
        else -> human(name)
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
            AlertDialog.Builder(this).setTitle(R.string.erp_unknown_title).setMessage(R.string.erp_unknown_leave)
                .setNegativeButton(R.string.erp_cancel, null).setPositiveButton(R.string.erp_logout) { _, _ -> signOut(true) }.show()
            return
        }
        val logout = api.detachSessionForLogout()
        screen++; actor = null; demoMode = false; pendingRecovery = null; api = newTransport(); worker.execute(logout); showLogin()
    }
    private fun goBack() {
        if (mutation && busy) { status(getString(R.string.erp_wait)); return }
        val action = backAction
        if (uncertain || api.hasPendingCommand()) {
            AlertDialog.Builder(this).setTitle(R.string.erp_unknown_title).setMessage(R.string.erp_unknown_leave)
                .setNegativeButton(R.string.erp_cancel, null).setPositiveButton(R.string.erp_confirm) { _, _ -> uncertain = false; if (action == null) signOut(true) else action() }.show()
        } else if (action != null) action() else if (actor != null) {
            AlertDialog.Builder(this).setTitle(R.string.erp_logout).setMessage(R.string.erp_logout_question)
                .setNegativeButton(R.string.erp_cancel, null).setPositiveButton(R.string.erp_logout) { _, _ -> signOut() }.show()
        } else finish()
    }
    // API 33+ is handled by the registered platform OnBackInvokedCallback above.
    // Retain the legacy key/fallback path for any platform that dispatches it;
    // the lint rule cannot infer the separate platform dispatcher registration.
    @SuppressLint("GestureBackNavigation")
    @Deprecated("Compatibility fallback; modern gestures use the platform back dispatcher")
    override fun onBackPressed() { goBack() }
    override fun onRetainNonConfigurationInstance(): Any = RetainedSession(api, actor, demoMode, pendingRecovery)
    override fun onDestroy() {
        removePlatformBackCallback?.invoke(); removePlatformBackCallback = null
        screen++; if (!isChangingConfigurations) api.clear()
        main.removeCallbacksAndMessages(null); worker.shutdown(); super.onDestroy()
    }
}
