package de.knaba.mobile

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.pm.ProviderInfo
import android.content.pm.ResolveInfo
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowAlertDialog
import org.robolectric.shadows.ShadowContentResolver
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64
import java.util.concurrent.TimeUnit
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

/** Native View/picker/lifecycle paths and the real ERP client, with explicit provider/HTTP doubles. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
class ConsoleMediaScreenTest {
    private lateinit var controller: ActivityController<Activity>
    private lateinit var activity: Activity
    private lateinit var root: LinearLayout
    private lateinit var api: ErpConsoleTransport
    private lateinit var screen: ConsoleMediaScreen
    private lateinit var server: Server
    private val journal = ErpMedia.MemoryJournal()
    private var alive = true
    private var expired = false
    private lateinit var provider: Provider
    private val image = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZr8AAAAASUVORK5CYII=")
    private class Commands : ErpConsoleTransport.Journal {
        val entries = mutableMapOf<String, String>()
        override fun read(scope: String) = entries[scope]
        override fun write(scope: String, envelope: String) {
            require(entries[scope] == null || entries[scope] == envelope)
            entries[scope] = envelope
        }
        override fun remove(scope: String, key: String) { entries.remove(scope) }
    }
    private class Provider : ContentProvider() {
        val names = mutableMapOf<String, String>()
        var queries = 0
        override fun onCreate() = true
        override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, order: String?): Cursor {
            queries++
            return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME)).apply { addRow(arrayOf(names[uri.toString()] ?: "selected.png")) }
        }
        override fun getType(uri: Uri) = "image/png"
        override fun insert(uri: Uri, values: ContentValues?): Uri? = null
        override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?) = 0
        override fun delete(uri: Uri, selection: String?, args: Array<out String>?) = 0
    }
    private data class Call(val path: String, val body: String, val key: String?)
    private data class Reply(val body: ByteArray, val status: Int = 200, val mime: String = "application/json", val lost: Boolean = false)
    private class Server : ErpConsoleTransport.ConnectionFactory {
        val calls = mutableListOf<Call>()
        val registered = linkedMapOf<String, JSONObject>()
        val uploadInputs = linkedMapOf<String, String>()
        val registerInputs = linkedMapOf<String, String>()
        @Volatile var loseUploadOnce = false
        @Volatile var loseRegisterOnce = false
        @Volatile var failGalleryOnce = false
        @Volatile var taskAvailable = true
        private fun actor() = JSONObject().put("userId", "worker-1").put("companyId", "company-1").put("roles", JSONArray(listOf("WORKER")))
            .put("permissions", JSONArray(listOf("media.read", "media.upload", "task.read", "site.read"))).put("siteIds", JSONArray(listOf("site-1")))
        private fun identity() = JSONObject().put("actor", actor()).put("csrfToken", "c".repeat(43))
        private fun page(items: Collection<JSONObject>) = JSONObject().put("items", JSONArray(items)).put("has_more", false)
        private fun task() = JSONObject().put("id", "task-1").put("kind", "task").put("companyId", "company-1").put("version", 1)
            .put("data", JSONObject().put("siteId", "site-1").put("title", "Fixture task"))
        private fun site() = JSONObject().put("id", "site-1").put("kind", "site").put("companyId", "company-1").put("version", 1)
            .put("data", JSONObject().put("name", "Fixture site"))
        private fun catalog(): JSONObject {
            val properties = JSONObject().put("uploadId", JSONObject().put("type", "string")).put("siteId", JSONObject().put("type", "string"))
                .put("stage", JSONObject().put("type", "string").put("enum", JSONArray(listOf("BEFORE", "AFTER", "DEFECT", "MATERIALS", "DOCUMENT"))))
                .put("visibility", JSONObject().put("type", "string").put("enum", JSONArray(listOf("INTERNAL", "CLIENT_AFTER_APPROVAL", "CONFIDENTIAL"))))
                .put("caption", JSONObject().put("type", "string").put("maxLength", 2000))
                .put("retentionPurpose", JSONObject().put("type", "string").put("minLength", 3).put("maxLength", 2000))
            return JSONObject().put("items", JSONArray().put(JSONObject().put("name", "media.register").put("permission", "media.upload")
                .put("schema", JSONObject().put("type", "object").put("properties", properties))))
        }
        @Synchronized fun allCalls() = calls.toList()
        @Synchronized private fun reply(url: URL, body: String, key: String?): Reply {
            calls.add(Call(url.path + (url.query?.let { "?$it" } ?: ""), body, key))
            fun json(value: JSONObject, status: Int = 200, lost: Boolean = false) = Reply(value.toString().toByteArray(), status, lost = lost)
            return when (url.path) {
                "/api/v1/auth/login", "/api/v1/me" -> json(identity())
                "/api/v1/commands" -> json(catalog())
                "/api/v1/entities/site" -> json(page(listOf(site())))
                "/api/v1/entities/task" -> json(page(if (taskAvailable) listOf(task()) else emptyList()))
                "/api/v1/entities/media_asset" -> if (failGalleryOnce && registered.isNotEmpty()) { failGalleryOnce = false; json(JSONObject().put("code", "TEMPORARY_FAILURE"), 503) } else json(page(registered.values))
                "/api/v1/media/uploads" -> {
                    val k = requireNotNull(key); val input = JSONObject(body)
                    require(uploadInputs[k] == null || uploadInputs[k] == body); uploadInputs[k] = body
                    val lose = loseUploadOnce; loseUploadOnce = false
                    json(JSONObject().put("uploadId", "upload-" + k).put("byteSize", Base64.getDecoder().decode(input.getString("base64")).size)
                        .put("metadataStripped", true).put("scanState", "CLEAN"), lost = lose)
                }
                "/api/v1/commands/media.register" -> {
                    val envelope = JSONObject(body); val k = envelope.getString("idempotency_key")
                    require(registerInputs[k] == null || registerInputs[k] == body); registerInputs[k] = body
                    val asset = registered.getOrPut(k) {
                        val data = JSONObject(envelope.getJSONObject("input").toString()).put("state", "RECEIVED").put("mimeType", "image/png").put("uploadedAt", "2026-11-08T12:00:00Z")
                        JSONObject().put("id", "asset-" + k).put("kind", "media_asset").put("companyId", "company-1").put("version", 1).put("data", data)
                    }
                    val lose = loseRegisterOnce; loseRegisterOnce = false; json(asset, lost = lose)
                }
                else -> if (url.path.startsWith("/api/v1/media/") && url.path.endsWith("/file") && url.query == "copy=client") Reply(byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte(), 1, 2, 3), mime = "image/jpeg")
                    else throw AssertionError("Unexpected fixture endpoint ${url.path}")
            }
        }
        override fun open(url: URL): HttpURLConnection = object : HttpURLConnection(url) {
            val request = ByteArrayOutputStream(); var answer: Reply? = null
            override fun connect() {}
            override fun disconnect() {}
            override fun usingProxy() = false
            override fun getOutputStream(): OutputStream = request
            override fun getResponseCode(): Int { answer = reply(url, request.toString("UTF-8"), getRequestProperty("Idempotency-Key")); return answer!!.status }
            override fun getInputStream(): InputStream { if (answer!!.lost) throw IOException("Synthetic lost acknowledgement"); return ByteArrayInputStream(answer!!.body) }
            override fun getErrorStream(): InputStream = ByteArrayInputStream(answer!!.body)
            override fun getHeaderField(name: String?): String? = when {
                name.equals("Content-Type", true) -> answer?.mime
                else -> null
            }
            override fun getHeaderFields(): MutableMap<String, MutableList<String>> = mutableMapOf("Set-Cookie" to mutableListOf("knaba_session=" + "t".repeat(43) + "; Secure; HttpOnly"))
        }
    }
    @Before fun setup() {
        controller = Robolectric.buildActivity(Activity::class.java).setup(); activity = controller.get()
        root = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }; activity.setContentView(root)
        provider = Provider(); provider.attachInfo(activity, ProviderInfo().apply { authority = "native.media.fixture" })
        ShadowContentResolver.registerProviderInternal("native.media.fixture", provider)
        server = Server(); api = ErpConsoleTransport(server, Commands(), journal)
        api.configure("https://erp.example.invalid"); api.login("worker@example.invalid", "fixture-password", "")
        val resolve = ResolveInfo().apply { activityInfo = ActivityInfo().apply { packageName = "native.picker.fixture"; name = "Picker"; exported = true; applicationInfo = ApplicationInfo() } }
        Shadows.shadowOf(activity.packageManager).addResolveInfoForIntent(Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*"), resolve)
        screen = ConsoleMediaScreen(activity, api, root, { alive }, { expired = true }, {})
        screen.open(JSONObject().put("kind", "task").put("id", "task-1"))
        await { buttonOrNull(R.string.erp_media_choose_photos)?.isEnabled == true }
        edit(R.string.erp_media_purpose).setText("Documented task evidence")
    }
    @After fun close() {
        alive = false; screen.close()
        controller.pause().stop().destroy()
    }
    private fun views(view: View = root): List<View> = listOf(view) + if (view is ViewGroup) (0 until view.childCount).flatMap { views(view.getChildAt(it)) } else emptyList()
    private fun buttonOrNull(id: Int) = views().filterIsInstance<Button>().firstOrNull { it.text.toString() == activity.getString(id) }
    private fun button(id: Int) = requireNotNull(buttonOrNull(id))
    private fun edit(label: Int): EditText {
        val heading = views().filterIsInstance<TextView>().first { it.text.toString() == activity.getString(label) && it.labelFor != View.NO_ID }
        return root.findViewById(heading.labelFor)
    }
    private fun hasText(id: Int) = views().filterIsInstance<TextView>().any { it.text.toString() == activity.getString(id) }
    private fun await(predicate: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(6)
        while (System.nanoTime() < deadline) {
            Shadows.shadowOf(Looper.getMainLooper()).idle()
            if (predicate()) return
            Thread.sleep(5)
        }
        fail("Native media view did not reach the expected observable state")
    }
    private fun uri(name: String): Uri {
        val value = Uri.parse("content://native.media.fixture/$name"); provider.names[value.toString()] = name
        Shadows.shadowOf(activity.contentResolver).registerInputStreamSupplier(value) { ByteArrayInputStream(image) }
        return value
    }
    private fun choose(vararg values: Uri) {
        button(R.string.erp_media_choose_photos).performClick()
        await { Shadows.shadowOf(activity).peekNextStartedActivityForResult() != null }
        val launched = Shadows.shadowOf(activity).nextStartedActivityForResult
        val result = if (values.size == 1) Intent().setData(values[0]) else Intent().apply {
            clipData = ClipData.newRawUri("selected", values[0]).apply { values.drop(1).forEach { addItem(ClipData.Item(it)) } }
        }
        screen.result(launched.requestCode, Activity.RESULT_OK, result)
        await { button(R.string.erp_media_send).isEnabled }
    }
    @Test fun pickerReturnAcrossForegroundDoesNotUploadAndCancellationHasNoMutation() {
        button(R.string.erp_media_choose_photos).performClick()
        await { Shadows.shadowOf(activity).peekNextStartedActivityForResult() != null }
        val launched = Shadows.shadowOf(activity).nextStartedActivityForResult
        assertEquals(MediaStore.ACTION_PICK_IMAGES, launched.intent.action)
        assertEquals(8, launched.intent.getIntExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 0))
        screen.onBackground(); screen.onForeground()
        screen.result(launched.requestCode, Activity.RESULT_CANCELED, null)
        await { hasText(R.string.erp_media_selection_cancelled) }
        assertTrue(server.allCalls().none { it.path == "/api/v1/media/uploads" })
        assertTrue(activity.contentResolver.persistedUriPermissions.isEmpty())
        assertFalse(expired)
    }
    @Test @Config(sdk = [32]) fun api32UsesSystemDocumentFallbackWithoutStoragePermission() {
        button(R.string.erp_media_choose_photos).performClick()
        await { Shadows.shadowOf(activity).peekNextStartedActivityForResult() != null }
        val launched = Shadows.shadowOf(activity).nextStartedActivityForResult
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, launched.intent.action)
        assertTrue(launched.intent.hasCategory(Intent.CATEGORY_OPENABLE))
        assertTrue(launched.intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false))
        assertArrayEquals(arrayOf("image/jpeg", "image/png", "image/webp"), launched.intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES))
        assertTrue(server.allCalls().none { it.path == "/api/v1/media/uploads" })
    }
    @Test fun twoPhotosAreExplicitlySentSequentiallyWithIndependentReceipts() {
        choose(uri("first.png"), uri("second.png"))
        assertTrue(server.allCalls().none { it.path == "/api/v1/media/uploads" })
        button(R.string.erp_media_send).performClick()
        await { server.allCalls().count { it.path == "/api/v1/commands/media.register" } == 2 && views().filterIsInstance<TextView>().count { it.text.toString() == activity.getString(R.string.erp_media_registered) } == 2 }
        val writes = server.allCalls().filter { it.path == "/api/v1/media/uploads" || it.path.startsWith("/api/v1/commands/") }
        assertEquals(listOf("/api/v1/media/uploads", "/api/v1/commands/media.register", "/api/v1/media/uploads", "/api/v1/commands/media.register"), writes.map { it.path })
        assertEquals(2, writes.filter { it.path.endsWith("uploads") }.map { it.key }.toSet().size)
        val registrations = writes.filter { it.path.endsWith("media.register") }.map { JSONObject(it.body) }
        assertEquals(2, registrations.map { it.getString("idempotency_key") }.toSet().size)
        registrations.forEach { assertEquals("site-1", it.getJSONObject("input").getString("siteId")); assertEquals("task-1", it.getJSONObject("input").getString("taskId")); assertFalse(it.has("expected_version")); assertFalse(it.has("nativeMedia")) }
        assertTrue(journal.read(api.mediaTicket().scope).isEmpty())
        assertFalse(expired)
    }
    @Test fun unknownRegistrationRetriesSameRequestWithoutUploadingAgainAndKeepsAckOnReadFailure() {
        server.loseRegisterOnce = true
        choose(uri("evidence.png")); button(R.string.erp_media_send).performClick()
        await { hasText(R.string.erp_media_register_unknown) && buttonOrNull(R.string.erp_media_retry)?.isEnabled == true }
        assertEquals(1, server.allCalls().count { it.path == "/api/v1/media/uploads" })
        server.failGalleryOnce = true
        button(R.string.erp_media_retry).performClick()
        await { hasText(R.string.erp_media_registered) && hasText(R.string.erp_media_refresh_warning) }
        val attempts = server.allCalls().filter { it.path == "/api/v1/commands/media.register" }
        assertEquals(2, attempts.size); assertEquals(attempts[0].body, attempts[1].body)
        assertEquals(1, server.allCalls().count { it.path == "/api/v1/media/uploads" })
        assertTrue(journal.read(api.mediaTicket().scope).isEmpty())
    }
    @Test fun combinedFileJobKeepsUnknownUploadDescriptorForManualExactRetry() {
        server.loseUploadOnce = true
        choose(uri("upload-ack-lost.png")); button(R.string.erp_media_send).performClick()
        await { hasText(R.string.erp_media_upload_unknown) && buttonOrNull(R.string.erp_media_retry)?.isEnabled == true }
        val original = server.allCalls().single { it.path == "/api/v1/media/uploads" }
        val pending = journal.read(api.mediaTicket().scope).single()
        assertEquals(original.key, pending.key()); assertEquals("UPLOAD_PENDING", pending.phase())
        assertTrue(server.allCalls().none { it.path == "/api/v1/commands/media.register" })
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertEquals("An unknown result must wait for an explicit retry", 1, server.allCalls().count { it.path == "/api/v1/media/uploads" })
        button(R.string.erp_media_retry).performClick()
        await { hasText(R.string.erp_media_registered) }
        val attempts = server.allCalls().filter { it.path == "/api/v1/media/uploads" }
        assertEquals(2, attempts.size); assertEquals(original.key, attempts[1].key); assertEquals(original.body, attempts[1].body)
        assertEquals(1, server.allCalls().count { it.path == "/api/v1/commands/media.register" })
        assertTrue(journal.read(api.mediaTicket().scope).isEmpty())
    }
    @Test fun removedTaskBeforeSendPreventsAnyUploadAndClearsPrivateScreen() {
        choose(uri("revoked.png")); server.taskAvailable = false
        button(R.string.erp_media_send).performClick()
        await { expired }
        assertTrue(server.allCalls().none { it.path == "/api/v1/media/uploads" })
        assertTrue(journal.read(api.mediaTicket().scope).isEmpty())
    }
    @Test fun stalePickerResultAfterExitCannotRestoreSelectionOrReadTheProvider() {
        button(R.string.erp_media_choose_photos).performClick()
        await { Shadows.shadowOf(activity).peekNextStartedActivityForResult() != null }
        val launched = Shadows.shadowOf(activity).nextStartedActivityForResult
        val queries = provider.queries; screen.close(); alive = false; root.removeAllViews()
        screen.result(launched.requestCode, Activity.RESULT_OK, Intent().setData(uri("old-private-name.png")))
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertEquals(queries, provider.queries); assertEquals(0, root.childCount)
        assertTrue(server.allCalls().none { it.path == "/api/v1/media/uploads" })
    }
    @Test fun explicitSaveRechecksCurrentAssetAndUsesOnlyClientCopy() {
        choose(uri("saved.png")); button(R.string.erp_media_send).performClick()
        await { buttonOrNull(R.string.erp_media_save)?.isEnabled == true }
        button(R.string.erp_media_save).performClick()
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        await { Shadows.shadowOf(activity).peekNextStartedActivityForResult() != null }
        val launched = Shadows.shadowOf(activity).nextStartedActivityForResult
        assertEquals(Intent.ACTION_CREATE_DOCUMENT, launched.intent.action)
        val target = Uri.parse("content://native.media.fixture/exported.jpg"); val output = ByteArrayOutputStream()
        Shadows.shadowOf(activity.contentResolver).registerOutputStream(target, output)
        screen.result(launched.requestCode, Activity.RESULT_OK, Intent().setData(target))
        await { hasText(R.string.erp_media_saved) }
        assertArrayEquals(byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte(), 1, 2, 3), output.toByteArray())
        assertTrue(server.allCalls().filter { it.path.contains("/file?") }.all { it.path.endsWith("?copy=client") })
    }
    @Test fun savePickerReturnedAfterLogoutCannotWriteOrDownload() {
        choose(uri("before-exit.png")); button(R.string.erp_media_send).performClick()
        await { buttonOrNull(R.string.erp_media_save)?.isEnabled == true }
        button(R.string.erp_media_save).performClick(); ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        await { Shadows.shadowOf(activity).peekNextStartedActivityForResult() != null }
        val launched = Shadows.shadowOf(activity).nextStartedActivityForResult
        val target = Uri.parse("content://native.media.fixture/no-export.jpg"); val output = ByteArrayOutputStream()
        Shadows.shadowOf(activity.contentResolver).registerOutputStream(target, output)
        api.clear(); screen.close(); alive = false; root.removeAllViews()
        screen.result(launched.requestCode, Activity.RESULT_OK, Intent().setData(target)); Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertEquals(0, output.size()); assertTrue(server.allCalls().none { it.path.contains("/file?") }); assertEquals(0, root.childCount)
    }
    @Test fun restoredAcknowledgedReceiptOffersOnlyLocalCleanup() {
        val proof = api.mediaTicket()
        val input = JSONObject().put("siteId", "site-1").put("taskId", "task-1").put("stage", "AFTER")
            .put("visibility", "INTERNAL").put("caption", "").put("retentionPurpose", "Documented task evidence")
        val record = ErpMedia.Record.create(proof.scope, proof.authority, input, ErpMedia.FileData(image, "acknowledged.png"), false)
            .uploaded(JSONObject().put("uploadId", "known-upload").put("byteSize", image.size).put("scanState", "CLEAN").put("metadataStripped", true))
            .registering().registered(JSONObject().put("id", "known-asset").put("kind", "media_asset").put("companyId", "company-1").put("version", 1)
                .put("data", JSONObject(input.toString()).put("uploadId", "known-upload")))
        journal.save(record)
        screen.close()
        screen = ConsoleMediaScreen(activity, api, root, { alive }, { expired = true }, {})
        screen.open(JSONObject().put("kind", "task").put("id", "task-1"))
        await { buttonOrNull(R.string.erp_media_recovery_save)?.isEnabled == true }
        assertTrue(hasText(R.string.erp_media_registered))
        button(R.string.erp_media_recovery_save).performClick()
        await { buttonOrNull(R.string.erp_media_recovery_save) == null }
        assertTrue(journal.read(api.mediaTicket().scope).isEmpty())
        assertTrue(server.allCalls().none { it.path == "/api/v1/media/uploads" || it.path == "/api/v1/commands/media.register" })
    }
    @Test fun activityRecreationDrainsOldProviderReadBeforeNewMediaWork() {
        val entered = CountDownLatch(1); val release = CountDownLatch(1)
        val activeReads = AtomicInteger(); val maximumReads = AtomicInteger()
        val oldUri = uri("slow-old-provider.png")
        Shadows.shadowOf(activity.contentResolver).registerInputStreamSupplier(oldUri) {
            val count = activeReads.incrementAndGet(); maximumReads.updateAndGet { maxOf(it, count) }
            object : ByteArrayInputStream(image) {
                private var held = false
                override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                    if (!held) { held = true; entered.countDown(); check(release.await(4, TimeUnit.SECONDS)) }
                    return super.read(buffer, offset, length)
                }
                override fun close() { activeReads.decrementAndGet(); super.close() }
            }
        }
        try {
            choose(oldUri); button(R.string.erp_media_send).performClick()
            assertTrue(entered.await(2, TimeUnit.SECONDS))
            val oldRequestCount = server.allCalls().size
            screen.close(); root.removeAllViews()
            screen = ConsoleMediaScreen(activity, api, root, { alive }, { expired = true }, {})
            screen.open(JSONObject().put("kind", "task").put("id", "task-1"))
            val pauseUntil = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(250)
            while (System.nanoTime() < pauseUntil) { Shadows.shadowOf(Looper.getMainLooper()).idle(); Thread.sleep(5) }
            assertEquals("Recreated screen must drain the old provider before any new media work", oldRequestCount, server.allCalls().size)
            assertTrue(buttonOrNull(R.string.erp_media_choose_photos)?.isEnabled != true)
            release.countDown()
            await { buttonOrNull(R.string.erp_media_choose_photos)?.isEnabled == true }
            edit(R.string.erp_media_purpose).setText("Fresh task evidence")
            val freshUri = uri("fresh-after-drain.png")
            Shadows.shadowOf(activity.contentResolver).registerInputStreamSupplier(freshUri) {
                val count = activeReads.incrementAndGet(); maximumReads.updateAndGet { maxOf(it, count) }
                object : ByteArrayInputStream(image) { override fun close() { activeReads.decrementAndGet(); super.close() } }
            }
            choose(freshUri); button(R.string.erp_media_send).performClick()
            await { hasText(R.string.erp_media_registered) }
            assertEquals(0, activeReads.get()); assertEquals(1, maximumReads.get())
            assertEquals(1, server.allCalls().count { it.path == "/api/v1/media/uploads" })
        } finally { release.countDown() }
    }
    @Test fun fullMediaIoQueueShowsBusyAndRequiresAnExplicitReadRetry() {
        val owner = Any(); val entered = CountDownLatch(1); val release = CountDownLatch(1); val drained = CountDownLatch(7)
        try {
            assertTrue(ErpMediaIo.SHARED.submit(owner) { entered.countDown(); check(release.await(4, TimeUnit.SECONDS)) })
            assertTrue(entered.await(2, TimeUnit.SECONDS))
            repeat(7) { assertTrue(ErpMediaIo.SHARED.submit(owner) { drained.countDown() }) }
            val before = server.allCalls().size
            screen.open(JSONObject().put("kind", "task").put("id", "task-1"))
            assertTrue(hasText(R.string.erp_media_io_busy)); assertEquals(before, server.allCalls().size)
            release.countDown(); assertTrue(drained.await(2, TimeUnit.SECONDS))
            Shadows.shadowOf(Looper.getMainLooper()).idle()
            assertEquals("Capacity becoming available must not retry a user action", before, server.allCalls().size)
            button(R.string.erp_refresh).performClick()
            await { buttonOrNull(R.string.erp_media_choose_photos)?.isEnabled == true && !hasText(R.string.erp_media_io_busy) }
            assertTrue(server.allCalls().size > before)
            assertTrue(server.allCalls().none { it.path == "/api/v1/media/uploads" || it.path == "/api/v1/commands/media.register" })
        } finally { release.countDown(); ErpMediaIo.SHARED.cancel(owner) }
    }
    @Test fun pausedMainTwoPreparedScreensNeverCarryOriginalBytesBetweenJobs() {
        val otherRoot = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        val other = ConsoleMediaScreen(activity, api, otherRoot, { alive }, { expired = true }, {})
        fun otherButton(id: Int) = views(otherRoot).filterIsInstance<Button>().first { it.text.toString() == activity.getString(id) }
        try {
            other.open(JSONObject().put("kind", "task").put("id", "task-1"))
            await { views(otherRoot).filterIsInstance<Button>().any { it.text.toString() == activity.getString(R.string.erp_media_choose_photos) && it.isEnabled } }
            val purpose = views(otherRoot).filterIsInstance<TextView>().first { it.text.toString() == activity.getString(R.string.erp_media_purpose) && it.labelFor != View.NO_ID }
            otherRoot.findViewById<EditText>(purpose.labelFor).setText("Second prepared screen evidence")
            choose(uri("first-prepared.png"))
            otherButton(R.string.erp_media_choose_photos).performClick()
            await { Shadows.shadowOf(activity).peekNextStartedActivityForResult() != null }
            val launched = Shadows.shadowOf(activity).nextStartedActivityForResult
            val secondUri = uri("second-prepared.png")
            val secondRead = CountDownLatch(1); val uploadsBeforeSecondRead = AtomicInteger(-1)
            Shadows.shadowOf(activity.contentResolver).registerInputStreamSupplier(secondUri) {
                uploadsBeforeSecondRead.set(server.allCalls().count { it.path == "/api/v1/media/uploads" }); secondRead.countDown()
                ByteArrayInputStream(image)
            }
            other.result(launched.requestCode, Activity.RESULT_OK, Intent().setData(secondUri))
            await { otherButton(R.string.erp_media_send).isEnabled }
            button(R.string.erp_media_send).performClick()
            otherButton(R.string.erp_media_send).performClick()
            // Do not dispatch main callbacks: a FileData posted from the first
            // read would remain retained here while the next job opens a provider.
            assertTrue(secondRead.await(3, TimeUnit.SECONDS))
            assertEquals("Original read+upload must finish in one IO job before a second provider opens", 1, uploadsBeforeSecondRead.get())
            assertTrue("Registration still waits for the metadata callback, never runs inside the file job", server.allCalls().none { it.path == "/api/v1/commands/media.register" })
            await {
                (views(root) + views(otherRoot)).filterIsInstance<TextView>().count { it.text.toString() == activity.getString(R.string.erp_media_registered) } == 2
            }
            assertEquals(2, server.allCalls().count { it.path == "/api/v1/media/uploads" })
            assertEquals(2, server.allCalls().count { it.path == "/api/v1/commands/media.register" })
        } finally { other.close() }
    }
}
