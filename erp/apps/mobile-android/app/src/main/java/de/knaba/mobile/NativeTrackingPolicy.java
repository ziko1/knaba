package de.knaba.mobile;

/** V4 bounds shared by the real native tracker and encrypted queue. */
public final class NativeTrackingPolicy {
    private NativeTrackingPolicy() {}
    public static final long LEASE_MILLIS = 15 * 60 * 1000L;
    public static final long RENEWAL_MILLIS = 5 * 60 * 1000L;
    public static final long GPS_RETENTION_MILLIS = 72 * 60 * 60 * 1000L;

    public static boolean validLease(long nowMillis, long expiryMillis) {
        return expiryMillis > nowMillis && expiryMillis - nowMillis <= LEASE_MILLIS;
    }
    public static boolean renewalDue(long elapsedMillis, long previousAttemptMillis) {
        return elapsedMillis >= previousAttemptMillis && elapsedMillis - previousAttemptMillis >= RENEWAL_MILLIS;
    }
    public static boolean gpsExpired(long nowMillis, long observedMillis) {
        return observedMillis > nowMillis || nowMillis - observedMillis >= GPS_RETENTION_MILLIS;
    }
}
