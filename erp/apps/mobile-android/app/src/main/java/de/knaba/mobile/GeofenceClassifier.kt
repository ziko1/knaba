package de.knaba.mobile

/** Shared conservative classifier: units metres, latitude then longitude. No automatic shift start. */
object GeofenceClassifier {
    fun distance(latitude: Double, longitude: Double, centerLatitude: Double, centerLongitude: Double): Double {
        return ConservativeGeofence.distance(latitude, longitude, centerLatitude, centerLongitude)
    }
    fun classify(distance: Double, accuracy: Double?, enter: Double, exit: Double, maxAccuracy: Double): String {
        return ConservativeGeofence.classify(distance, accuracy, enter, exit, maxAccuracy)
    }
}
