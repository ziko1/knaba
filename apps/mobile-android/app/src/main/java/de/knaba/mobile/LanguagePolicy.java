package de.knaba.mobile;

import java.util.List;
import java.util.Locale;
import java.util.Arrays;
import java.util.Collections;

/** Locale choice contains no actor, device token or tracking authorization. */
public final class LanguagePolicy {
    public static final List<String> SUPPORTED = Collections.unmodifiableList(Arrays.asList("de", "uk", "ru", "pl", "lt", "en"));
    private LanguagePolicy() {}
    public static String supportedTag(String tag) {
        if (tag == null) return null;
        String language = tag.trim().replace('_', '-').split("-", 2)[0].toLowerCase(Locale.ROOT);
        return SUPPORTED.contains(language) ? language : null;
    }
    public static String resolve(String selected, List<String> deviceLanguages) {
        String explicit = supportedTag(selected);
        if (explicit != null) return explicit;
        if (deviceLanguages != null) for (String tag : deviceLanguages) {
            String supported = supportedTag(tag);
            if (supported != null) return supported;
        }
        return "de";
    }
}
