package de.knaba.mobile

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** Native role console. Never embeds a website, WebView, or passes GPS credentials to ERP login. */
class ErpConsoleActivity : Activity() {
    private val api = ErpConsoleTransport()
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private lateinit var content: LinearLayout
    private lateinit var notice: TextView
    @Volatile private var epoch = 0
    private var actor: JSONObject? = null
    private var catalog = JSONArray()
    private var selectedChannel = ""
    private val modules = listOf(
        Triple("decision", R.string.erp_decisions, "decisions.read"),
        Triple("site", R.string.erp_sites, "site.read"),
        Triple("lead", R.string.erp_requests, "lead.read"),
        Triple("order", R.string.erp_orders, "order.manage"),
        Triple("task", R.string.erp_tasks, "task.read"),
        Triple("crew_assignment", R.string.erp_crew, "crew.assign"),
        Triple("employee", R.string.erp_people, "operations.read"),
        Triple("shift", R.string.erp_shifts, "shift.read"),
        Triple("presence", R.string.erp_presence, "location.presence.read"),
        Triple("customer", R.string.erp_customers, "customer.manage"),
        Triple("channel", R.string.erp_messages, "chat.read"),
        Triple("notification", R.string.erp_alerts, "notifications.manage"),
        Triple("user", R.string.erp_users, "identity.manage"),
        Triple("bot_config", R.string.erp_settings, "bot.manage")
    )
    override fun attachBaseContext(newBase: Context) { super.attachBaseContext(NativeLocale.wrap(newBase)) }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val edge = (18 * resources.displayMetrics.density).toInt()
            setPadding(edge, edge, edge, edge)
        }
        val scroller = ScrollView(this).apply { isFillViewport = true; addView(content) }
        setContentView(scroller)
        showLogin()
    }
    private fun heading(label: String, subtitle: String = "") {
        content.removeAllViews()
        content.setBackgroundColor(Color.rgb(247, 250, 248))
        content.addView(TextView(this).apply {
            text = label; textSize = 25f; setTextColor(Color.rgb(20, 57, 52))
            setPadding(0, 0, 0, 14)
        })
        if (subtitle.isNotEmpty()) content.addView(TextView(this).apply {
            text = subtitle; textSize = 14f; setTextColor(Color.rgb(78, 106, 94))
            setPadding(0, 0, 0, 16)
        })
        notice = TextView(this).apply { setPadding(0, 10, 0, 14); setTextColor(Color.rgb(122, 60, 43)) }
        content.addView(notice)
    }
    private fun row(text: String, action: () -> Unit) {
        content.addView(Button(this).apply {
            this.text = text; isAllCaps = false; minHeight = (48 * resources.displayMetrics.density).toInt()
            setTextColor(Color.rgb(20, 57, 52))
            setOnClickListener { action() }
        })
    }
    private fun label(value: String) {
        content.addView(TextView(this).apply { text = value; textSize = 15f; setTextColor(Color.rgb(34, 58, 57)); setPadding(0, 10, 0, 10) })
    }
    private fun field(hint: String, inputType: Int = InputType.TYPE_CLASS_TEXT): EditText {
        val value = EditText(this).apply {
            this.hint = hint; this.inputType = inputType
            setSingleLine(true)
        }
        content.addView(value)
        return value
    }
    private fun run(operation: () -> JSONObject, done: (JSONObject) -> Unit) {
        val ticket = epoch
        notice.setText(R.string.erp_loading)
        worker.execute {
            try {
                val result = operation()
                main.post { if (ticket == epoch && !isDestroyed) done(result) }
            } catch (failure: Exception) {
                val details = (failure.message ?: "NETWORK_ERROR").take(150)
                main.post {
                    if (ticket == epoch && !isDestroyed) {
                        if (details.contains("401") || details.contains("ACCESS_CHANGED")) {
                            epoch++; actor = null; api.clear(); showLogin()
                        }
                        notice.text = getString(R.string.erp_error, details)
                    }
                }
            }
        }
    }
    private fun showLogin() {
        heading(getString(R.string.erp_title), getString(R.string.erp_login_intro))
        val server = field(getString(R.string.erp_server), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        server.setText(getPreferences(Context.MODE_PRIVATE).getString("erp-origin", ""))
        val email = field(getString(R.string.erp_email), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val password = field(getString(R.string.erp_password), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        val code = field(getString(R.string.erp_otp), InputType.TYPE_CLASS_NUMBER)
        row(getString(R.string.erp_sign_in)) {
            val url = server.text.toString().trim()
            val address = email.text.toString().trim()
            val secret = password.text.toString()
            val otp = code.text.toString()
            if (url.isBlank() || address.isBlank() || secret.isBlank()) {
                notice.setText(R.string.erp_fields_required); return@row
            }
            run({
                api.configure(url)
                api.login(address, secret, otp)
            }) { response ->
                actor = response.optJSONObject("actor")
                getPreferences(Context.MODE_PRIVATE).edit().putString("erp-origin", url).apply()
                password.setText(""); code.setText("")
                showDashboard()
            }
        }
        label(getString(R.string.erp_privacy))
    }
    private fun permitted(permission: String): Boolean {
        val user = actor ?: return false
        val roles = user.optJSONArray("roles") ?: JSONArray()
        val permissions = user.optJSONArray("permissions") ?: JSONArray()
        val prefix = permission.substringBefore('.')
        for (i in 0 until permissions.length()) {
            val value = permissions.optString(i)
            if (value == "*" || value == permission || value == "$prefix.*") return true
        }
        return false
    }
    private fun showDashboard() {
        heading(getString(R.string.erp_title), getString(R.string.erp_role) + ": " + (actor?.optJSONArray("roles")?.toString() ?: "?"))
        row(getString(R.string.erp_refresh)) {
            run({ val who = api.me(); api.dashboard().put("_actor", who.getJSONObject("actor")) }) { result ->
                actor = result.optJSONObject("_actor")
                showDashboard(); notice.text = getString(R.string.erp_active_shifts) + ": " + result.optInt("activeShifts", 0)
            }
        }
        for ((kind, name, permission) in modules) {
            if (permitted(permission) || (kind == "task" && permitted("task.assign")) || (kind == "shift" && permitted("shift.manage")))
                row(getString(name)) { if (kind == "channel") showChannels() else showRecords(kind, getString(name)) }
        }
        row(getString(R.string.erp_actions)) { showActions() }
        row(getString(R.string.erp_time_tools)) { startActivity(Intent(this, MainActivity::class.java)) }
        row(getString(R.string.erp_logout)) {
            epoch++; actor = null; catalog = JSONArray()
            worker.execute { api.logout() }
            showLogin()
        }
        label(getString(R.string.erp_presence_notice))
    }
    private fun showRecords(kind: String, title: String) {
        heading(title, getString(R.string.erp_server_scope))
        row(getString(R.string.erp_back)) { showDashboard() }
        run({ JSONObject().put("items", api.entities(kind)) }) { result ->
            val items = result.optJSONArray("items") ?: JSONArray()
            notice.text = getString(R.string.erp_count, items.length())
            if (items.length() == 0) label(getString(R.string.erp_empty))
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                val data = item.optJSONObject("data") ?: JSONObject()
                val name = data.optString("name", data.optString("title", data.optString("code", data.optString("status", item.optString("id").take(8)))))
                val state = data.optString("state", data.optString("activity", data.optString("status")))
                row("$name · $state") {
                    AlertDialog.Builder(this).setTitle(title).setMessage(item.toString(2)).setPositiveButton(R.string.erp_close, null).show()
                }
            }
        }
    }
    private fun showChannels() {
        heading(getString(R.string.erp_messages), getString(R.string.erp_server_scope))
        row(getString(R.string.erp_back)) { showDashboard() }
        run({ JSONObject().put("items", api.entities("channel")) }) { result ->
            val list = result.optJSONArray("items") ?: JSONArray()
            if (list.length() == 0) label(getString(R.string.erp_empty))
            for (i in 0 until list.length()) {
                val channel = list.optJSONObject(i) ?: continue
                val id = channel.optString("id")
                val title = channel.optJSONObject("data")?.optString("name", id.take(8)) ?: id.take(8)
                row(title) { selectedChannel = id; showConversation(id, title) }
            }
        }
    }
    private fun showConversation(channel: String, title: String) {
        heading(title, getString(R.string.erp_messages))
        row(getString(R.string.erp_back)) { showChannels() }
        val composer = field(getString(R.string.erp_message))
        row(getString(R.string.erp_send)) {
            val text = composer.text.toString().trim()
            if (text.isEmpty()) return@row
            run({ api.sendMessage(channel, text) }) { composer.setText(""); showConversation(channel, title) }
        }
        run({ JSONObject().put("items", api.messages(channel)) }) { result ->
            val list = result.optJSONArray("items") ?: JSONArray()
            if (list.length() == 0) label(getString(R.string.erp_empty))
            for (i in 0 until list.length()) {
                val data = list.optJSONObject(i)?.optJSONObject("data") ?: continue
                label(data.optString("text", getString(R.string.erp_message)))
            }
        }
    }
    private fun showActions() {
        heading(getString(R.string.erp_actions), getString(R.string.erp_actions_intro))
        row(getString(R.string.erp_back)) { showDashboard() }
        run({ JSONObject().put("items", api.catalog()) }) { result ->
            catalog = result.optJSONArray("items") ?: JSONArray()
            for (index in 0 until catalog.length()) {
                val command = catalog.optJSONObject(index) ?: continue
                row(command.optString("name")) { showCommand(command) }
            }
        }
    }
    private fun showCommand(command: JSONObject) {
        val title = command.optString("name")
        heading(title, getString(R.string.erp_server_scope))
        row(getString(R.string.erp_back)) { showActions() }
        val properties = command.optJSONObject("schema")?.optJSONObject("properties") ?: JSONObject()
        val required = command.optJSONObject("schema")?.optJSONArray("required") ?: JSONArray()
        val form = mutableMapOf<String, EditText>()
        for (key in properties.keys().asSequence().sorted()) {
            val def = properties.optJSONObject(key) ?: JSONObject()
            val type = def.optString("type", "string")
            val mandatory = (0 until required.length()).any { required.optString(it) == key }
            form[key] = field("$key (${type})" + if (mandatory) " *" else "")
        }
        val version = field(getString(R.string.erp_expected_version), InputType.TYPE_CLASS_NUMBER)
        row(getString(R.string.erp_submit)) {
            val input = JSONObject()
            try {
                for ((key, edit) in form) {
                    val raw = edit.text.toString().trim()
                    val definition = properties.optJSONObject(key) ?: JSONObject()
                    val type = definition.optString("type", "string")
                    if (raw.isEmpty()) {
                        if ((0 until required.length()).any { required.optString(it) == key }) throw IllegalArgumentException("Required: $key")
                        continue
                    }
                    input.put(key, when (type) {
                        "integer" -> raw.toInt()
                        "number" -> raw.toDouble()
                        "boolean" -> if (raw == "true" || raw == "false") raw.toBoolean() else throw IllegalArgumentException("Use true/false")
                        "array" -> JSONArray(raw)
                        "object" -> JSONObject(raw)
                        else -> raw
                    })
                }
            } catch (error: Exception) { notice.text = error.message; return@row }
            val apply = {
                run({ api.command(title, input, version.text.toString().toIntOrNull()) }) {
                    showActions(); notice.setText(R.string.erp_saved)
                }
            }
            if (command.optBoolean("highRisk")) {
                AlertDialog.Builder(this).setTitle(R.string.erp_confirm_sensitive).setMessage(title)
                    .setNegativeButton(R.string.erp_cancel, null).setPositiveButton(R.string.erp_confirm) { _, _ -> apply() }.show()
            } else apply()
        }
    }
    override fun onDestroy() { epoch++; main.removeCallbacksAndMessages(null); worker.shutdown(); super.onDestroy() }
}
