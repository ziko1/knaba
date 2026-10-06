package de.knaba.mobile

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

object NativeLocale {
    const val CHANGED = "de.knaba.mobile.LANGUAGE_CHANGED"
    private const val FILE = "knaba-language-v1"
    private const val KEY = "language"
    fun selected(context: Context): String = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, "") ?: ""
    fun choose(context: Context, language: String) {
        require(language.isEmpty() || LanguagePolicy.SUPPORTED.contains(language))
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, language).apply()
    }
    fun wrap(context: Context): Context {
        val device = context.resources.configuration.locales
        val tags = (0 until device.size()).map { device[it].toLanguageTag() }
        val tag = LanguagePolicy.resolve(selected(context), tags)
        val configuration = Configuration(context.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(tag))
        return context.createConfigurationContext(configuration)
    }
}
