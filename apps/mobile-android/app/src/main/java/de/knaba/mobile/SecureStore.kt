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
class SecureStore(context: Context) {
    companion object { private val storageLock = Any(); private val authGeneration = GenerationFence() }
    private val file = AtomicFile(File(context.filesDir, "knaba-secure-v1.bin"))
    private val keyAlias = "de.knaba.mobile.storage.v1"
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
        if (!file.baseFile.exists()) return@synchronized JSONObject().put("sequence", 0).put("queue", JSONArray())
        val bytes = file.readFully()
        require(bytes.size >= 29 && bytes[0].toInt() == 1) { "SECURE_STORAGE_INVALID" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
        JSONObject(String(cipher.doFinal(bytes.copyOfRange(13, bytes.size)), Charsets.UTF_8))
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
        val queue = state.optJSONArray("queue") ?: JSONArray(); val remaining = JSONArray(); val cutoff = Instant.now().minusSeconds(86400)
        for (i in 0 until queue.length()) { val item = queue.getJSONObject(i)
            if (item.getString("kind") != "EVENT" || !Instant.parse(item.getJSONObject("input").getString("observedAt")).isBefore(cutoff)) remaining.put(item)
            else state.put("lastRejectedEvent", "LOCAL_RETENTION_EXPIRED")
        }
        state.put("queue", remaining)
    } }
    fun clear() = synchronized(storageLock) { authGeneration.invalidate(); file.delete(); val vault = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }; vault.deleteEntry(keyAlias) }
}
