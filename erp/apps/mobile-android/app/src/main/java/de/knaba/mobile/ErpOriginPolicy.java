package de.knaba.mobile;

import java.net.URI;
import java.util.Locale;

/** Authoritative portable HTTPS-only origin validation for native company operations. */
public final class ErpOriginPolicy {
    private ErpOriginPolicy() {}
    public static String origin(String value) {
        if (value == null || value.trim().isEmpty() || value.length() > 512) throw new IllegalArgumentException("INVALID_ORIGIN");
        try {
            URI uri = new URI(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null ||
                uri.getRawQuery() != null || uri.getRawFragment() != null ||
                !(uri.getRawPath() == null || uri.getRawPath().isEmpty() || uri.getRawPath().equals("/")) ||
                (uri.getPort() != -1 && uri.getPort() != 443)) throw new IllegalArgumentException("INVALID_ORIGIN");
            return "https://" + uri.getHost().toLowerCase(Locale.ROOT);
        } catch (java.net.URISyntaxException invalid) { throw new IllegalArgumentException("INVALID_ORIGIN", invalid); }
    }
}
