package de.knaba.mobile;

import java.time.Instant;
import java.time.Duration;

/** Display-only elapsed time, never paid time or permission to collect location. */
public final class ShiftClock {
    private ShiftClock() {}
    public static Long elapsedSeconds(String startAt, String serverNow, String expiresAt, long receivedElapsedMs, long nowElapsedMs) {
        try {
            long elapsedMs = nowElapsedMs - receivedElapsedMs;
            if (elapsedMs < 0 || elapsedMs > 300_000) return null;
            Instant estimated = Instant.parse(serverNow).plusMillis(elapsedMs);
            if (!estimated.isBefore(Instant.parse(expiresAt))) return null;
            long seconds = Duration.between(Instant.parse(startAt), estimated).getSeconds();
            return seconds < 0 ? null : seconds;
        } catch (RuntimeException invalid) { return null; }
    }
    public static String duration(long seconds) {
        if (seconds < 0) throw new IllegalArgumentException("INVALID_DURATION");
        return String.format(java.util.Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60);
    }
}
