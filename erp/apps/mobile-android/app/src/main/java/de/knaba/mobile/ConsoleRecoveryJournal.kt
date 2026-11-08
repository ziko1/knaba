package de.knaba.mobile

import android.content.Context
import org.json.JSONObject

/** Separate Keystore key/file from GPS enrollment; never persists ERP cookies, CSRF or login passwords. */
internal class ConsoleRecoveryJournal(context: Context) : ErpConsoleTransport.Journal {
    private val vault = SecureStore(context.applicationContext, "console-recovery")
    override fun read(scope: String): String? {
        require(scope.matches(Regex("[a-f0-9]{64}")))
        return vault.read().optJSONObject("commands")?.optString(scope)?.takeIf { it.isNotEmpty() }
    }
    override fun write(scope: String, envelope: String) {
        require(scope.matches(Regex("[a-f0-9]{64}")) && envelope.toByteArray(Charsets.UTF_8).size <= 70000)
        vault.update { state ->
            val commands = state.optJSONObject("commands") ?: JSONObject()
            require(commands.has(scope) || commands.length() < 16) { "RECOVERY_STORAGE_FULL" }
            // Do not overwrite another unresolved request even if a second activity races this one.
            val existing = commands.optString(scope)
            require(existing.isEmpty() || existing == envelope) { "RECOVERY_COMMAND_CONFLICT" }
            commands.put(scope, envelope); state.put("commands", commands)
        }
    }
    override fun remove(scope: String, idempotencyKey: String) {
        vault.update { state ->
            val commands = state.optJSONObject("commands") ?: return@update
            val existing = commands.optString(scope)
            if (existing.isNotEmpty()) {
                require(JSONObject(existing).getJSONObject("body").getString("idempotency_key") == idempotencyKey) { "RECOVERY_COMMAND_CONFLICT" }
                commands.remove(scope)
            }
        }
    }
}
