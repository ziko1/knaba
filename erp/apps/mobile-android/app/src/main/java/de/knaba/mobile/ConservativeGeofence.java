package de.knaba.mobile;

/** Platform-independent native calculation; conservative quality filter, never an identity/attendance proof. */
public final class ConservativeGeofence {
    private ConservativeGeofence() {}
    public static String classify(double distance, Double accuracy, double enter, double exit, double maxAccuracy) {
        if (accuracy == null || !Double.isFinite(accuracy) || accuracy <= 0 || accuracy > maxAccuracy || !Double.isFinite(distance) || distance < 0 || enter <= 0 || enter >= exit) return "UNKNOWN";
        if (distance - accuracy > exit) return "OUTSIDE";
        if (distance + accuracy < enter) return "INSIDE";
        return "UNKNOWN";
    }
    public static double distance(double latitude, double longitude, double centerLatitude, double centerLongitude) {
        double a = Math.toRadians(latitude), b = Math.toRadians(centerLatitude), dLat = b - a, dLon = Math.toRadians(centerLongitude - longitude);
        double h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a) * Math.cos(b) * Math.pow(Math.sin(dLon / 2), 2);
        return 6371008.8 * 2 * Math.atan2(Math.sqrt(Math.max(0, Math.min(1, h))), Math.sqrt(Math.max(0, Math.min(1, 1 - h))));
    }
    public static String classifyZones(double distance, Double accuracy, double enter, double exit, double maxAccuracy, double[] radii, double[] distances) {
        if (radii == null || distances == null || radii.length != distances.length || accuracy == null || !Double.isFinite(accuracy) || accuracy <= 0 || accuracy > maxAccuracy || !Double.isFinite(distance) || distance < 0 || enter <= 0 || exit <= enter) return "UNKNOWN";
        String primary = classify(distance, accuracy, enter, exit, maxAccuracy); boolean inside = false, outside = true;
        for (int i = 0; i < radii.length; i++) {
            if (!Double.isFinite(radii[i]) || radii[i] <= 0 || !Double.isFinite(distances[i]) || distances[i] < 0) return "UNKNOWN";
            inside |= distances[i] + accuracy < radii[i]; outside &= distances[i] - accuracy > radii[i] + exit - enter;
        }
        if ("INSIDE".equals(primary) || inside) return "INSIDE";
        return "OUTSIDE".equals(primary) && outside ? "OUTSIDE" : "UNKNOWN";
    }
}
