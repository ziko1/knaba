plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "de.knaba.mobile"
    compileSdk = 36
    defaultConfig { applicationId = "de.knaba.mobile"; minSdk = 31; targetSdk = 36; versionCode = 9; versionName = "0.5.2" }
    buildFeatures { buildConfig = true }
    bundle { language { enableSplit = false } }
    buildTypes {
        debug {
            applicationIdSuffix = ".test"
            versionNameSuffix = "-test"
            manifestPlaceholders["appLabel"] = "KNABA Test"
        }
        release { isMinifyEnabled = false; manifestPlaceholders["appLabel"] = "@string/app_name" }
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.systemProperty("robolectric.dependency.repo.url", "https://repo.maven.apache.org/maven2")
            it.maxHeapSize = "2g"
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16.1")
}
