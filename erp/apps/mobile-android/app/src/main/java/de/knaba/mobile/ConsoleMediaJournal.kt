package de.knaba.mobile

import android.content.Context
import org.json.JSONObject

/** Metadata only, with a separate Keystore key/AtomicFile from GPS and ordinary commands. */
internal class ConsoleMediaJournal(context: Context) : ErpMedia.Journal {
    private val vault = SecureStore(context.applicationContext, "console-media-recovery")
    private fun scopes(state: JSONObject): JSONObject {
        if (!state.has("media")) return JSONObject() // Only a never-created vault can omit this field.
        val scopes = state.getJSONObject("media")
        require(scopes.length() <= 16) { "MEDIA_RECOVERY_INVALID" }
        for (scope in scopes.keys()) {
            require(scope.matches(Regex("[a-f0-9]{64}"))) { "MEDIA_RECOVERY_INVALID" }
            val records = scopes.getJSONObject(scope)
            require(records.length() <= ErpMedia.QUEUE_LIMIT) { "MEDIA_RECOVERY_INVALID" }
            for (key in records.keys()) {
                val record = ErpMedia.Record(records.getJSONObject(key))
                require(record.scope() == scope && record.key() == key) { "MEDIA_RECOVERY_INVALID" }
            }
        }
        return scopes
    }
    override fun read(scope: String): List<ErpMedia.Record> {
        require(scope.matches(Regex("[a-f0-9]{64}")))
        val records = scopes(vault.read()).optJSONObject(scope) ?: return emptyList()
        require(records.length() <= ErpMedia.QUEUE_LIMIT)
        return records.keys().asSequence().map { key ->
            ErpMedia.Record(records.getJSONObject(key)).also { require(it.scope() == scope && it.key() == key) }
        }.toList()
    }
    override fun save(record: ErpMedia.Record) {
        val next = ErpMedia.Record(record.json())
        vault.update { state ->
            val scopes = scopes(state)
            require(scopes.has(next.scope()) || scopes.length() < 16) { "MEDIA_QUEUE_FULL" }
            val records = scopes.optJSONObject(next.scope()) ?: JSONObject()
            val prior = records.optJSONObject(next.key())
            if (prior != null) ErpMedia.Record(prior).accepts(next)
            else require(records.length() < ErpMedia.QUEUE_LIMIT) { "MEDIA_QUEUE_FULL" }
            records.put(next.key(), next.json()); scopes.put(next.scope(), records); state.put("media", scopes)
        }
    }
    override fun remove(scope: String, uploadKey: String) {
        vault.update { state ->
            val scopes = scopes(state)
            state.put("media", scopes)
            val records = scopes.optJSONObject(scope) ?: return@update
            val prior = records.optJSONObject(uploadKey) ?: return@update
            val record = ErpMedia.Record(prior)
            require(record.scope() == scope && record.key() == uploadKey && record.phase() == "REGISTERED") { "MEDIA_RECOVERY_CONFLICT" }
            records.remove(uploadKey)
            // Keep the authenticated empty file: loss is not an empty recovery queue.
            scopes.put(scope, records)
        }
    }
}
