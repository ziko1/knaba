plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "de.knaba.mobile"
    compileSdk = 36
    defaultConfig { applicationId = "de.knaba.mobile"; minSdk = 31; targetSdk = 36; versionCode = 1; versionName = "0.1.0" }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
