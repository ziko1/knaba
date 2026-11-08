package de.knaba.mobile

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger

/** Native media UI. One selected file is read at a time; system picker return never submits a write. */
internal class ConsoleMediaScreen(
    private val activity: Activity,
    private val api: ErpConsoleTransport,
    private val root: LinearLayout,
    private val hostCurrent: () -> Boolean,
    private val expired: (Exception) -> Unit,
    private val openRecord: (JSONObject) -> Unit
) {
    companion object { private val requestIds = AtomicInteger(18_000) }
    private data class Context(val kind: String, val id: String, val siteId: String, val title: String)
    private data class Row(var uri: Uri?, var name: String, var record: ErpMedia.Record? = null,
                           var state: Int = R.string.erp_media_selected, var warning: Boolean = false)
    private data class Pick(val request: Int, val generation: Long, val context: String, val input: JSONObject,
                            val ticket: ErpConsoleTransport.MediaTicket, val reselect: Row?)
    private data class Export(val request: Int, val generation: Long, val id: String, val version: Int,
                              val ticket: ErpConsoleTransport.MediaTicket)
    private data class Loaded(val actor: JSONObject, val catalog: JSONArray, val contexts: List<Context>, val assets: JSONArray,
                              val records: List<ErpMedia.Record>, val recoveryError: Boolean)
    private data class Transfer(val record: ErpMedia.Record?, val recoveryPending: Boolean = false,
                                val error: Exception? = null)
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var generation = 0L
    @Volatile private var closed = false
    private var ticket: ErpConsoleTransport.MediaTicket? = null
    private var busy = false
    private var processing = false
    private var actor = JSONObject()
    private var catalog = JSONArray()
    private var contexts = emptyList<Context>()
    private var context: Context? = null
    private var assets = JSONArray()
    private val rows = mutableListOf<Row>()
    private var picker: Pick? = null
    private var export: Export? = null
    private var recoveryBlocked = false
    private var caption = ""
    private var purpose = ""
    private var stage = "AFTER"
    private var visibility = "INTERNAL"
    private var redaction = false
    private var notice = ""
    private var search = ""
    private var visibleAssets = 40
    private var foreground = true
    private var authorityChecking = false
    private var statusText: TextView? = null
    private var retryLoad: (() -> Unit)? = null
    private val authorityTick = Runnable { checkAuthority() }
    private val teal = Color.rgb(0, 105, 94)
    private val ink = Color.rgb(24, 52, 52)
    private fun text(id: Int, vararg args: Any) = activity.getString(id, *args)
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
    private fun current(expected: Long = generation): Boolean = !closed && expected == generation && hostCurrent()
    private fun valid(expected: Long, proof: ErpConsoleTransport.MediaTicket): Boolean {
        if (!current(expected)) return false
        return try { api.requireMediaTicket(proof); true } catch (_: Exception) { false }
    }
    fun close() {
        closed = true; generation++; ticket?.let(api::cancelMediaTicket)
        ErpMediaIo.SHARED.cancel(this)
        main.removeCallbacks(authorityTick)
        picker = null; export = null; retryLoad = null; rows.clear(); assets = JSONArray(); contexts = emptyList(); processing = false
    }
    fun onForeground() {
        foreground = true; scheduleAuthority(0)
    }
    fun onBackground() { foreground = false; main.removeCallbacks(authorityTick) }
    private fun scheduleAuthority(delay: Long = 30_000) {
        main.removeCallbacks(authorityTick)
        if (foreground && current()) main.postDelayed(authorityTick, delay)
    }
    private fun checkAuthority() {
        val proof = ticket ?: return
        if (busy || authorityChecking) { scheduleAuthority(1_000); return }
        val expected = generation; authorityChecking = true
        val accepted = ErpMediaIo.SHARED.submit(this) {
            try {
                if (!current(expected)) return@submit
                api.requireMediaTicket(proof); api.me(); api.requireMediaTicket(proof)
                main.post { authorityChecking = false; if (current()) scheduleAuthority() }
            } catch (error: Exception) {
                main.post {
                    authorityChecking = false
                    if (current(expected)) {
                        val rejection = error as? ErpConsoleTransport.Failure
                        if (rejection?.code in setOf("ACCESS_CHANGED", "NEEDS_REAUTH") || rejection?.status == 401) failure(error)
                        else {
                            statusText?.apply { text = text(R.string.erp_sync_waiting); visibility = View.VISIBLE }
                            scheduleAuthority(maxOf(30_000, rejection?.retryAfterMillis ?: 0))
                        }
                    } else if (current()) scheduleAuthority()
                }
            }
        }
        if (!accepted) { authorityChecking = false; scheduleAuthority() }
    }
    fun open(initial: JSONObject? = null) {
        if (!current()) return
        val proof = try { api.mediaTicket() } catch (error: Exception) { expired(error); return }
        ticket = proof
        retryLoad = { open(initial) }
        io(proof, {
            val who = api.me().getJSONObject("actor"); api.requireMediaTicket(proof)
            val commands = api.catalog(); val choices = mutableListOf<Context>()
            if (ErpMedia.permitted(who, "media.upload")) {
                if (ErpMedia.permitted(who, "site.read") || ErpMedia.permitted(who, "customer.portal")) {
                    val sites = api.entities("site")
                    for (i in 0 until sites.length()) { val item = sites.getJSONObject(i); requireCompany(item, proof); choices.add(Context("site", item.getString("id"), item.getString("id"), title(item))) }
                }
                if (!ErpMedia.external(who) && (ErpMedia.permitted(who, "task.read") || ErpMedia.permitted(who, "task.assign"))) {
                    val tasks = api.entities("task")
                    for (i in 0 until tasks.length()) {
                        val item = tasks.getJSONObject(i); val site = item.optJSONObject("data")?.optString("siteId").orEmpty()
                        requireCompany(item, proof)
                        if (ErpMedia.validId(site)) choices.add(Context("task", item.getString("id"), site, title(item)))
                    }
                }
            }
            val gallery = api.entities("media_asset")
            for (i in 0 until gallery.length()) requireCompany(gallery.getJSONObject(i), proof)
            var recoveryError = false
            val records = try {
                api.mediaRecords(proof).filter { record ->
                    val input = record.input()
                    val accessible = choices.any { it.siteId == input.optString("siteId") &&
                        (if (input.has("taskId")) it.kind == "task" && it.id == input.optString("taskId") else it.kind == "site") }
                    if (!accessible) recoveryError = true
                    accessible
                }
            } catch (_: Exception) { recoveryError = true; emptyList() }
            api.requireMediaTicket(proof)
            Loaded(who, commands, choices, gallery, records, recoveryError)
        }) { loaded ->
            retryLoad = null
            actor = loaded.actor; catalog = loaded.catalog; contexts = loaded.contexts; assets = loaded.assets; recoveryBlocked = loaded.recoveryError
            if (ErpMedia.external(actor)) { stage = "DEFECT"; visibility = "INTERNAL" }
            context = initial?.let { wanted -> contexts.firstOrNull { it.kind == wanted.optString("kind") && it.id == wanted.optString("id") } }
                ?: context?.let { previous -> contexts.firstOrNull { it.kind == previous.kind && it.id == previous.id } }
            rows.clear(); loaded.records.forEach { record -> rows.add(Row(null, record.name(), record, phaseLabel(record.phase()), record.phase() == "REGISTERED")) }
            render(); scheduleAuthority()
        }
    }
    private fun title(item: JSONObject): String {
        val data = item.optJSONObject("data") ?: JSONObject()
        return listOf("name", "title", "code").map { data.optString(it) }.firstOrNull { it.isNotBlank() } ?: item.optString("id")
    }
    private fun requireCompany(item: JSONObject, proof: ErpConsoleTransport.MediaTicket) {
        if (item.optString("companyId") != proof.companyId) throw ErpConsoleTransport.Failure(403, "ACCESS_CHANGED", false)
    }
    private fun requiredTicket(): ErpConsoleTransport.MediaTicket = ticket ?: throw ErpMedia.invalid("NEEDS_REAUTH")
    private fun input(): JSONObject {
        val selected = context ?: throw ErpMedia.invalid("INVALID_MEDIA_CONTEXT")
        val result = JSONObject().put("siteId", selected.siteId).put("stage", stage).put("visibility", visibility).put("caption", caption).put("retentionPurpose", purpose)
        if (selected.kind == "task") result.put("taskId", selected.id)
        ErpMedia.validateCatalog(catalog, result)
        return result
    }
    private fun label(value: String, parent: LinearLayout = root, heading: Boolean = false): TextView = TextView(activity).apply {
        text = value; textSize = if (heading) 18f else 15f; setTextColor(ink); setPadding(0, dp(8), 0, dp(8))
        if (heading) setTypeface(null, Typeface.BOLD)
        parent.addView(this, LinearLayout.LayoutParams(-1, -2))
    }
    private fun button(id: Int, parent: LinearLayout = root, enabled: Boolean = !busy, action: () -> Unit): Button = Button(activity).apply {
        text = text(id); isAllCaps = false; minHeight = dp(48); isEnabled = enabled; setTextColor(teal)
        parent.addView(this, LinearLayout.LayoutParams(-1, -2)); setOnClickListener { action() }
    }
    private fun edit(id: Int, value: String, maximum: Int, change: (String) -> Unit) {
        val captionView = label(text(id))
        EditText(activity).apply {
            this.id = View.generateViewId(); captionView.labelFor = this.id; setText(value); minHeight = dp(48)
            filters = arrayOf(android.text.InputFilter.LengthFilter(maximum)); isEnabled = !busy && !processing
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            setSelectAllOnFocus(false)
            addTextChangedListener(object : TextWatcher { override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {} ; override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { change(s.toString()) }; override fun afterTextChanged(s: Editable?) {} })
            root.addView(this, LinearLayout.LayoutParams(-1, -2))
        }
    }
    private fun choice(id: Int, values: List<String>, selected: String, names: (String) -> String, changed: (String) -> Unit) {
        val captionView = label(text(id))
        Spinner(activity).apply {
            this.id = View.generateViewId(); captionView.labelFor = this.id; contentDescription = text(id); minimumHeight = dp(48)
            adapter = ArrayAdapter(activity, android.R.layout.simple_spinner_dropdown_item, values.map(names))
            setSelection(values.indexOf(selected).coerceAtLeast(0)); isEnabled = !busy && !processing
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onNothingSelected(parent: AdapterView<*>?) {}
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) { if (values[position] != selected) changed(values[position]) }
            }
            root.addView(this, LinearLayout.LayoutParams(-1, -2))
        }
    }
    private fun render() {
        if (!current()) return
        root.removeAllViews()
        if (busy) root.addView(ProgressBar(activity).apply { contentDescription = text(R.string.erp_loading) })
        statusText = label(notice).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE; visibility = if (notice.isBlank()) View.GONE else View.VISIBLE }
        if (recoveryBlocked) label(text(R.string.erp_media_recovery_blocked))
        val canUpload = ErpMedia.permitted(actor, "media.upload") && (0 until catalog.length()).any { catalog.optJSONObject(it)?.optString("name") == "media.register" }
        if (canUpload && !recoveryBlocked) {
            label(text(R.string.erp_media_add), heading = true)
            label(text(R.string.erp_media_limits))
            if (ErpMedia.external(actor)) label(text(R.string.erp_media_external))
            val tokens = listOf("") + contexts.map { it.kind + ":" + it.id }
            val selected = context?.let { it.kind + ":" + it.id }.orEmpty()
            choice(R.string.erp_media_context, tokens, selected, { key ->
                contexts.firstOrNull { it.kind + ":" + it.id == key }?.let { (if (it.kind == "task") text(R.string.erp_tasks) else text(R.string.erp_sites)) + " · " + it.title }
                    ?: text(R.string.erp_media_choose_context)
            }) { key ->
                context = contexts.firstOrNull { it.kind + ":" + it.id == key }; generation++; picker = null
                rows.removeAll { it.record == null }; render()
            }
            if (contexts.isEmpty()) label(text(R.string.erp_media_empty_context))
            val stages = if (ErpMedia.external(actor)) listOf("DEFECT") else listOf("BEFORE", "AFTER", "DEFECT", "MATERIALS", "DOCUMENT")
            val visibilities = if (ErpMedia.external(actor)) listOf("INTERNAL") else listOf("INTERNAL", "CLIENT_AFTER_APPROVAL", "CONFIDENTIAL")
            choice(R.string.erp_media_stage, stages, stage, ::stageTitle) { stage = it }
            choice(R.string.erp_media_visibility, visibilities, visibility, ::visibilityTitle) { visibility = it }
            edit(R.string.erp_media_caption, caption, 2000) { caption = it }
            edit(R.string.erp_media_purpose, purpose, 2000) { purpose = it }
            CheckBox(activity).apply {
                text = text(R.string.erp_media_redaction); isChecked = redaction; isEnabled = !busy && !processing; minHeight = dp(48)
                setOnCheckedChangeListener { _, value -> redaction = value }; root.addView(this)
            }
            button(R.string.erp_media_choose_photos, enabled = !busy && context != null && rows.size < ErpMedia.QUEUE_LIMIT) { choose(true) }
            button(R.string.erp_media_choose_files, enabled = !busy && context != null && rows.size < ErpMedia.QUEUE_LIMIT) { choose(false) }
            button(R.string.erp_media_send, enabled = !busy && rows.any { it.record == null && it.uri != null }) { sendSelected() }
        }
        if (rows.isNotEmpty()) {
            label(text(R.string.erp_media_queue, rows.size), heading = true)
            for (row in rows) {
                label(row.name)
                label(text(row.state))
                row.record?.let { record ->
                    val bound = record.input(); label(text(R.string.erp_media_bound_context, bound.optString("siteId"), bound.optString("taskId")))
                    if (record.assetId().isNotEmpty()) label(text(R.string.erp_media_receipt, record.assetId()))
                    if (row.warning) {
                        label(text(R.string.erp_media_recovery_warning))
                        button(R.string.erp_media_recovery_save) { val proof = requiredTicket(); io(proof, { api.checkpointMedia(proof, record) }) { row.warning = false; render() } }
                    } else if (record.phase() != "REGISTERED") {
                        button(if (record.uploadId().isEmpty() && row.uri == null) R.string.erp_media_reselect else R.string.erp_media_retry) {
                            if (record.uploadId().isEmpty() && row.uri == null) choose(!record.mime().equals("application/pdf"), row)
                            else { processing = true; resume(row) }
                        }
                    }
                }
            }
            button(R.string.erp_media_cancel_queue, enabled = true) { stopLocalQueue() }
        }
        label(text(R.string.erp_media_gallery), heading = true)
        button(R.string.erp_refresh) { val retry = retryLoad; if (retry != null) retry() else refreshGallery() }
        val gallery = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        val searchLabel = label(text(R.string.erp_search))
        EditText(activity).apply {
            id = View.generateViewId(); searchLabel.labelFor = id; setText(search); minHeight = dp(48)
            addTextChangedListener(object : TextWatcher { override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {} ; override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { search = s.toString(); visibleAssets = 40; renderGallery(gallery) }; override fun afterTextChanged(s: Editable?) {} })
            root.addView(this, LinearLayout.LayoutParams(-1, -2))
        }
        root.addView(gallery); renderGallery(gallery)
    }
    private fun renderGallery(parent: LinearLayout) {
        parent.removeAllViews()
        val matching = (0 until assets.length()).mapNotNull { assets.optJSONObject(it) }.filter { item ->
            val data = item.optJSONObject("data") ?: JSONObject()
            search.isBlank() || listOf(data.optString("caption"), data.optString("fileName"), data.optString("siteId"), data.optString("taskId"), item.optString("id")).any { it.lowercase(Locale.ROOT).contains(search.lowercase(Locale.ROOT)) }
        }.sortedByDescending { it.optJSONObject("data")?.optString("uploadedAt").orEmpty() }
        if (matching.isEmpty()) { label(text(R.string.erp_media_no_files), parent); return }
        val grouped = matching.take(visibleAssets).groupBy { item ->
            val data = item.optJSONObject("data") ?: JSONObject()
            listOf(data.optString("siteId"), data.optString("taskId"), data.optString("uploadedAt").take(10), data.optString("stage"))
        }
        for ((group, items) in grouped) {
            val site = contexts.firstOrNull { it.kind == "site" && it.id == group[0] }?.title ?: group[0]
            val task = contexts.firstOrNull { it.kind == "task" && it.id == group[1] }?.title ?: group[1]
            label(listOf(site, task, group[2], stageTitle(group[3])).filter { it.isNotBlank() }.joinToString(" · "), parent, true)
            for (item in items) {
                val data = item.optJSONObject("data") ?: JSONObject()
                label(data.optString("caption").ifBlank { data.optString("fileName").ifBlank { item.optString("id") } }, parent)
                label(text(when (data.optString("state")) { "APPROVED_FOR_CLIENT" -> R.string.erp_media_approved; "RECEIVED" -> R.string.erp_media_received; else -> R.string.erp_media_status_unknown }), parent)
                if (!data.isNull("duplicateOf") && data.optString("duplicateOf").isNotBlank()) label(text(R.string.erp_media_duplicate), parent)
                button(R.string.erp_media_details, parent) { openRecord(JSONObject(item.toString())) }
                button(R.string.erp_media_save, parent) { saveCopy(item) }
            }
        }
        if (matching.size > visibleAssets) button(R.string.erp_media_more, parent) { visibleAssets += 40; renderGallery(parent) }
    }
    @Suppress("DEPRECATION")
    private fun choose(photos: Boolean, reselect: Row? = null) {
        if (busy) return
        val proof: ErpConsoleTransport.MediaTicket; val frozen: JSONObject
        try { proof = requiredTicket(); frozen = reselect?.record?.input() ?: input() }
        catch (error: Exception) { failure(error); return }
        io(proof, { api.mediaPreflight(proof, frozen) }) {
            val code = requestIds.updateAndGet { if (it >= 60_000) 18_000 else it + 1 }
            val count = if (reselect != null) 1 else ErpMedia.QUEUE_LIMIT - rows.size
            val intent = if (photos && Build.VERSION.SDK_INT >= 33) Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                type = "image/*"
                if (count > 1) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, minOf(count, MediaStore.getPickImagesMaxLimit()))
            } else documents(photos, count > 1)
            val chosen = if (intent.resolveActivity(activity.packageManager) != null) intent else documents(photos, count > 1)
            picker = Pick(code, generation, frozen.optString("siteId") + ":" + frozen.optString("taskId"), frozen, proof, reselect)
            try { activity.startActivityForResult(chosen, code) }
            catch (_: Exception) { picker = null; notice = text(R.string.erp_media_picker_unavailable); render() }
        }
    }
    private fun documents(photos: Boolean, multiple: Boolean) = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE); type = if (photos) "image/*" else "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, if (photos || ErpMedia.external(actor)) arrayOf("image/jpeg", "image/png", "image/webp") else arrayOf("image/jpeg", "image/png", "image/webp", "application/pdf"))
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
    }
    fun result(requestCode: Int, resultCode: Int, result: Intent?): Boolean {
        val saving = export
        if (saving?.request == requestCode) { export = null; saveResult(saving, resultCode, result?.data); return true }
        val selecting = picker ?: return false
        if (selecting.request != requestCode) return false
        picker = null
        if (!valid(selecting.generation, selecting.ticket)) return true
        if (resultCode != Activity.RESULT_OK) { notice = text(R.string.erp_media_selection_cancelled); render(); return true }
        val uris = result?.clipData?.let { data -> (0 until data.itemCount).map { data.getItemAt(it).uri } } ?: listOfNotNull(result?.data)
        if (uris.isEmpty() || uris.size > (if (selecting.reselect != null) 1 else ErpMedia.QUEUE_LIMIT - rows.size) || uris.any { it.scheme != "content" }) {
            notice = text(R.string.erp_media_queue_full); render(); return true
        }
        io(selecting.ticket, {
            api.mediaPreflight(selecting.ticket, selecting.input)
            uris.map { uri ->
                var name = ""
                activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) name = cursor.getString(0).orEmpty() }
                if (selecting.reselect?.record != null) {
                    val exact = ErpMedia.read(activity.contentResolver.openInputStream(uri), name)
                    selecting.reselect.record!!.requireFile(exact) // Exact-byte check before accepting a restored selection; never sends.
                }
                Row(uri, ErpMedia.fileName(name, "image/jpeg"))
            }
        }) { selected ->
            if (selecting.reselect != null) { selecting.reselect.uri = selected.single().uri; selecting.reselect.state = phaseLabel(selecting.reselect.record!!.phase()) }
            else rows.addAll(selected)
            notice = text(R.string.erp_media_selected_count, selected.size); render()
        }
        return true
    }
    private fun sendSelected() {
        try { input() } catch (error: Exception) { failure(error); return }
        processing = true; resumeNext()
    }
    private fun resumeNext() {
        val next = rows.firstOrNull { it.record == null && it.uri != null }
        if (processing && next != null) resume(next) else { processing = false; refreshGallery() }
    }
    private fun resume(row: Row) {
        val proof = requiredTicket()
        if (row.record?.uploadId()?.isNotEmpty() == true) { register(row, proof); return }
        val uri = row.uri ?: run { processing = false; choose(true, row); return }
        val frozen = try { row.record?.input() ?: input() } catch (error: Exception) { processing = false; failure(error); return }
        val checkedRedaction = redaction
        val originalRecord = row.record
        val originalName = row.name
        row.state = R.string.erp_media_uploading
        io(proof, {
            var record = originalRecord
            try {
                // Original bytes stay in this serial job, never in a queued main callback.
                val file = ErpMedia.read(activity.contentResolver.openInputStream(uri), originalName)
                api.requireMediaTicket(proof)
                val prepared = record ?: api.prepareMedia(proof, frozen, file, checkedRedaction)
                record = prepared
                prepared.requireFile(file)
                val progress = api.uploadMedia(proof, prepared, file)
                Transfer(progress.record, progress.recoveryPending)
            } catch (error: Exception) {
                // Keep the original key/context after an unknown upload without retaining bytes.
                Transfer(record, error = error)
            }
        }, { row.state = R.string.erp_media_failed; processing = false }) { transfer ->
            transfer.record?.let { row.record = it; row.name = it.name() }
            val error = transfer.error
            if (error != null) {
                processing = false
                row.state = if ((error as? ErpConsoleTransport.Failure)?.outcomeUnknown == true) R.string.erp_media_upload_unknown else R.string.erp_media_failed
                failure(error)
            } else {
                row.state = R.string.erp_media_uploaded; row.warning = transfer.recoveryPending
                if (transfer.recoveryPending) { processing = false; render() } else register(row, proof)
            }
        }
    }
    private fun register(row: Row, proof: ErpConsoleTransport.MediaTicket) {
        val record = row.record ?: return
        if (record.phase() == "REGISTERED") { resumeNext(); return }
        row.state = R.string.erp_media_registering
        io(proof, { api.registerMedia(proof, record) }, { error ->
            processing = false; row.state = if ((error as? ErpConsoleTransport.Failure)?.outcomeUnknown == true) R.string.erp_media_register_unknown else R.string.erp_media_register_failed
        }) { progress ->
            row.record = progress.record; row.state = R.string.erp_media_registered; row.warning = progress.recoveryPending; row.uri = null
            if (progress.recoveryPending) { processing = false; render() } else resumeNext()
        }
    }
    private fun stopLocalQueue() {
        generation++; ticket?.let(api::cancelMediaTicket); ErpMediaIo.SHARED.cancel(this); picker = null; export = null; rows.clear(); busy = false; processing = false
        notice = text(R.string.erp_media_cancelled_unknown)
        open()
    }
    private fun refreshGallery() {
        if (busy || !current()) return
        val proof = requiredTicket()
        io(proof, { api.me(); val items = api.entities("media_asset"); for (i in 0 until items.length()) requireCompany(items.getJSONObject(i), proof); api.requireMediaTicket(proof); items }, { notice = text(R.string.erp_media_refresh_warning) }) { assets = it; render() }
    }
    @Suppress("DEPRECATION")
    private fun saveCopy(item: JSONObject) {
        val proof = requiredTicket(); val data = item.optJSONObject("data") ?: JSONObject()
        val mime = if (data.optString("mimeType") == "application/pdf") "application/pdf" else "image/jpeg"
        AlertDialog.Builder(activity).setTitle(R.string.erp_media_save).setMessage(R.string.erp_media_export_notice)
            .setNegativeButton(R.string.erp_cancel, null).setPositiveButton(R.string.erp_confirm) { _, _ ->
                if (!valid(generation, proof)) return@setPositiveButton
                val code = requestIds.updateAndGet { if (it >= 60_000) 18_000 else it + 1 }
                export = Export(code, generation, item.optString("id"), item.optInt("version"), proof)
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = mime; putExtra(Intent.EXTRA_TITLE, ErpMedia.fileName("KNABA-" + item.optString("id") + ErpMedia.extension(mime), mime)) }
                try { activity.startActivityForResult(intent, code) } catch (_: Exception) { export = null; notice = text(R.string.erp_media_picker_unavailable); render() }
            }.show()
    }
    private fun saveResult(saving: Export, result: Int, uri: Uri?) {
        if (!valid(saving.generation, saving.ticket)) return
        if (result != Activity.RESULT_OK || uri == null) { notice = text(R.string.erp_media_selection_cancelled); render(); return }
        if (uri.scheme != "content") { failure(ErpMedia.invalid("INVALID_MEDIA")); return }
        io(saving.ticket, {
            try {
                val file = api.mediaFile(saving.ticket, saving.id, saving.version)
                api.requireMediaTicket(saving.ticket)
                activity.contentResolver.openOutputStream(uri, "w")?.use { output ->
                    var offset = 0
                    while (offset < file.bytes.size) { api.requireMediaTicket(saving.ticket); val count = minOf(8192, file.bytes.size - offset); output.write(file.bytes, offset, count); offset += count }
                    api.requireMediaTicket(saving.ticket); output.flush()
                } ?: throw ErpMedia.invalid("MEDIA_UNAVAILABLE")
                api.requireMediaTicket(saving.ticket)
            } catch (error: Exception) {
                // ACTION_CREATE_DOCUMENT creates a new user-selected document, never overwrites an existing one.
                try { DocumentsContract.deleteDocument(activity.contentResolver, uri) } catch (_: Exception) { }
                throw error
            }
        }) { notice = text(R.string.erp_media_saved); render() }
    }
    private fun <T> io(proof: ErpConsoleTransport.MediaTicket, operation: () -> T, onFailure: ((Exception) -> Unit)? = null, done: (T) -> Unit) {
        if (busy || !current()) return
        if (notice == text(R.string.erp_media_io_busy)) notice = ""
        val expected = generation; busy = true; render()
        val accepted = ErpMediaIo.SHARED.submit(this) {
            try {
                if (!current(expected)) return@submit
                api.requireMediaTicket(proof)
                val result = operation()
                main.post {
                    if (current(expected)) {
                        busy = false
                        try { api.requireMediaTicket(proof); done(result); if (!busy) render() }
                        catch (error: Exception) { failure(error) }
                    }
                }
            } catch (error: Exception) {
                main.post { if (current(expected)) { busy = false; processing = false; failure(error); if (current(expected)) { onFailure?.invoke(error); render() } } }
            }
        }
        if (!accepted) {
            busy = false; processing = false
            notice = text(R.string.erp_media_io_busy)
            onFailure?.invoke(ErpMedia.invalid("MEDIA_IO_BUSY")); render()
        }
    }
    private fun failure(error: Exception) {
        val failure = error as? ErpConsoleTransport.Failure
        if (failure?.code in setOf("ACCESS_CHANGED", "NEEDS_REAUTH") || failure?.status == 401) { close(); expired(error); return }
        notice = text(when (failure?.code) {
            "MEDIA_UNSUPPORTED" -> R.string.erp_media_unsupported
            "MEDIA_TOO_LARGE", "RESPONSE_TOO_LARGE" -> R.string.erp_media_too_large
            "MEDIA_RESELECT_MISMATCH" -> R.string.erp_media_mismatch
            "MEDIA_RECOVERY_AUTHORITY_CHANGED", "MEDIA_RECOVERY_INVALID", "MEDIA_RECOVERY_CONFLICT", "MEDIA_RECOVERY_UNAVAILABLE" -> R.string.erp_media_recovery_blocked
            "ACCESS_DENIED", "MEDIA_FORBIDDEN", "IDEMPOTENCY_CONFLICT", "NOT_FOUND_SAFE" -> R.string.erp_media_denied
            "MEDIA_QUEUE_FULL" -> R.string.erp_media_queue_full
            "MEDIA_IO_BUSY" -> R.string.erp_media_io_busy
            "INVALID_MEDIA_CONTEXT", "MEDIA_SCHEMA_CHANGED", "INVALID_MEDIA" -> R.string.erp_media_invalid
            "MEDIA_CANCELLED" -> R.string.erp_media_cancelled_unknown
            else -> if (failure?.outcomeUnknown == true) R.string.erp_unknown_result else R.string.erp_media_failed
        })
        render()
    }
    private fun phaseLabel(phase: String) = when (phase) {
        "UPLOADED" -> R.string.erp_media_uploaded
        "REGISTER_PENDING" -> R.string.erp_media_register_unknown
        "REGISTERED" -> R.string.erp_media_registered
        else -> R.string.erp_media_upload_unknown
    }
    private fun stageTitle(value: String) = text(when (value) { "BEFORE" -> R.string.erp_media_before; "AFTER" -> R.string.erp_media_after; "DEFECT" -> R.string.erp_media_defect; "MATERIALS" -> R.string.erp_media_materials; "DOCUMENT" -> R.string.erp_media_document; else -> R.string.erp_media_stage_unknown })
    private fun visibilityTitle(value: String) = text(when (value) { "CLIENT_AFTER_APPROVAL" -> R.string.erp_media_client_approval; "CONFIDENTIAL" -> R.string.erp_media_confidential; else -> R.string.erp_media_internal })
}
