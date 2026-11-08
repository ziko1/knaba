package de.knaba.mobile;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/** One retry layer for foreground GETs. Writes never call this policy. */
final class ErpReadRetry {
    private ErpReadRetry() { }
    static long delay(long interval, int failures, long serverDelay, double jitter) {
        long base = Math.min(120000, interval * (1L << Math.min(3, Math.max(1, failures))));
        long local = Math.min(120000, base + (long)(base * .2 * Math.max(0, Math.min(1, jitter))));
        return Math.max(local, serverDelay);
    }
    static long retryAfter(String value, long nowMillis) {
        if (value == null || value.length() > 128) return 0;
        try {
            String text = value.trim();
            if (text.matches("[0-9]{1,9}")) return Long.parseLong(text) * 1000;
            return Math.max(0, ZonedDateTime.parse(text, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() - nowMillis);
        } catch (RuntimeException invalid) { return 0; }
    }
}
