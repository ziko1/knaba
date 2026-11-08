package de.knaba.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.io.File
import java.time.Instant

/** AES-GCM ciphertext only; key never leaves Android Keystore. No backup/cleartext fallback. */
class SecureStore(context: Context, namespace: String = "") {
    init { require(namespace in setOf("", "console-recovery", "console-media-recovery")) { "INVALID_STORAGE_NAMESPACE" } }
    private val mediaRecovery = namespace == "console-media-recovery"
    companion object { private val storageLock = Any(); private val authGeneration = GenerationFence(); val bootSessionId: String = java.util.UUID.randomUUID().toString() }
    private val file = AtomicFile(File(context.filesDir, if (namespace.isEmpty()) "knaba-secure-v1.bin" else "knaba-$namespace-v1.bin"))
    private val keyAlias = "de.knaba.mobile.storage.v1" + if (namespace.isEmpty()) "" else ".$namespace"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    fun read(): JSONObject = synchronized(storageLock) {
        // AtomicFile.openRead restores a legacy .bak left by an interrupted write.
        // A missing base alone must not be interpreted as an empty recovery queue.
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) {
            if (mediaRecovery) {
                val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                require(!keys.containsAlias(keyAlias)) { "MEDIA_RECOVERY_MISSING" }
            }
            return@synchronized JSONObject().put("sequence", 0).put("queue", JSONArray())
        }
        val bytes = file.openRead().use { input ->
            val limit = 4 * 1024 * 1024 + 29
            val result = java.io.ByteArrayOutputStream()
            val chunk = ByteArray(8192)
            while (true) {
                val count = input.read(chunk)
                if (count < 0) break
                require(result.size() + count <= limit) { "SECURE_STORAGE_TOO_LARGE" }
                result.write(chunk, 0, count)
            }
            result.toByteArray()
        }
        require(bytes.size >= 29 && bytes[0].toInt() == 1) { "SECURE_STORAGE_INVALID" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
        JSONObject(String(cipher.doFinal(bytes.copyOfRange(13, bytes.size)), Charsets.UTF_8)).also {
            if (mediaRecovery) require(it.opt("media") is JSONObject) { "MEDIA_RECOVERY_INVALID" }
        }
    }
    fun update(transform: (JSONObject) -> Unit) = synchronized(storageLock) {
        val value = read(); transform(value)
        val plaintext = value.toString().toByteArray(Charsets.UTF_8)
        require(plaintext.size <= 4 * 1024 * 1024) { "OFFLINE_QUEUE_FULL" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val bytes = byteArrayOf(1) + cipher.iv + cipher.doFinal(plaintext)
        val output = file.startWrite()
        try { output.write(bytes); file.finishWrite(output) } catch (error: Exception) { file.failWrite(output); throw error }
    }
    fun generation(): Long = synchronized(storageLock) { authGeneration.capture() }
    fun requireGeneration(expected: Long) = synchronized(storageLock) { authGeneration.requireCurrent(expected) }
    fun rotateGeneration() = synchronized(storageLock) { authGeneration.invalidate() }
    fun withGeneration(expected: Long, action: () -> Unit) = synchronized(storageLock) { authGeneration.run(expected) { action() } }
    fun updateForGeneration(expected: Long, transform: (JSONObject) -> Unit) = withGeneration(expected) { update(transform) }
    fun enqueue(command: String, input: JSONObject, kind: String = "EVENT") = synchronized(storageLock) {
        update { state ->
            val queue = state.optJSONArray("queue") ?: JSONArray()
            require(queue.length() < 5000) { "OFFLINE_QUEUE_FULL" }
            if (kind == "EVENT") {
                val sequence = state.optLong("sequence", 0) + 1
                state.put("sequence", sequence); input.put("sequenceNumber", sequence)
            }
            queue.put(JSONObject().put("id", java.util.UUID.randomUUID().toString()).put("kind", kind).put("command", command).put("input", input))
            state.put("queue", queue)
        }
    }
    fun remove(ids: Set<String>) = synchronized(storageLock) { update { state ->
        val remaining = JSONArray(); val queue = state.optJSONArray("queue") ?: JSONArray()
        for (i in 0 until queue.length()) { val item = queue.getJSONObject(i); if (!ids.contains(item.getString("id"))) remaining.put(item) }
        state.put("queue", remaining)
    } }
    fun purgeLocationSince(instant: String) = synchronized(storageLock) { update { state ->
        val remaining = JSONArray(); val queue = state.optJSONArray("queue") ?: JSONArray()
        for (i in 0 until queue.length()) {
            val item = queue.getJSONObject(i); val input = item.getJSONObject("input")
            if (item.getString("kind") != "EVENT" || Instant.parse(input.getString("observedAt")).isBefore(Instant.parse(instant))) remaining.put(item)
        }
        state.put("queue", remaining)
    } }
    fun reject(item: JSONObject, code: String) = synchronized(storageLock) { update { state ->
        val rejected = state.optJSONArray("reconciliation") ?: JSONArray()
        val evidence = JSONObject().put("id", item.getString("id")).put("command", item.getString("command")).put("code", code)
            .put("observedAt", item.getJSONObject("input").optString("observedAt", item.getJSONObject("input").optString("occurredAt"))).put("receivedAt", Instant.now().toString())
        rejected.put(evidence)
        val bounded = JSONArray(); for (i in maxOf(0, rejected.length() - 200) until rejected.length()) bounded.put(rejected.getJSONObject(i))
        state.put("reconciliation", bounded).put("lastRejectedEvent", code)
    } }
    fun expireLocationEvents() = synchronized(storageLock) { update { state ->
        val queue = state.optJSONArray("queue") ?: JSONArray(); val remaining = JSONArray()
        val reconciliation = state.optJSONArray("reconciliation") ?: JSONArray(); val now = System.currentTimeMillis()
        for (i in 0 until queue.length()) { val item = queue.getJSONObject(i)
            if (item.getString("kind") != "EVENT") { remaining.put(item); continue }
            val observedAt = item.getJSONObject("input").optString("observedAt")
            val observedMillis = runCatching { Instant.parse(observedAt).toEpochMilli() }.getOrNull()
            val input = item.getJSONObject("input")
            val missingAuthority = input.optString("trackingSessionId").isEmpty() || runCatching { java.util.UUID.fromString(input.optString("bootSessionId")) }.isFailure || !input.has("monotonicElapsedMs") || input.optLong("monotonicElapsedMs", -1) < 0 || item.optString("command") == "presence.ingest" && input.optString("geofenceVersionId").isEmpty()
            if (!missingAuthority && observedMillis != null && !NativeTrackingPolicy.gpsExpired(now, observedMillis)) remaining.put(item)
            else {
                val code = if (missingAuthority) "LEGACY_EVENT_LEASE_REVIEW_REQUIRED" else if (observedMillis == null || observedMillis > now) "INVALID_EVENT_TIME" else "LOCAL_RETENTION_EXPIRED"
                reconciliation.put(JSONObject().put("id", item.getString("id")).put("command", item.getString("command"))
                    .put("code", code).put("observedAt", observedAt).put("receivedAt", Instant.ofEpochMilli(now).toString()))
                state.put("lastRejectedEvent", code)
            }
        }
        val bounded = JSONArray(); for (i in maxOf(0, reconciliation.length() - 200) until reconciliation.length()) bounded.put(reconciliation.getJSONObject(i))
        state.put("queue", remaining).put("reconciliation", bounded)
    } }
    fun clear() = synchronized(storageLock) { authGeneration.invalidate(); file.delete(); val vault = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }; vault.deleteEntry(keyAlias) }
}
