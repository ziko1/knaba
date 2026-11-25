plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
val parallelPartnerTest = providers.gradleProperty("knabaParallelPartnerTest").orNull == "true"
android {
    namespace = "de.knaba.mobile"
    compileSdk = 36
    defaultConfig {
        applicationId = "de.knaba.mobile"
        minSdk = 31
        targetSdk = 36
        versionCode = 12
        versionName = "0.6.2"
        buildConfigField("boolean", "PARTNER_TEST_ONLY", "false")
    }
    buildFeatures { buildConfig = true }
    bundle { language { enableSplit = false } }
    buildTypes {
        debug {
            buildConfigField("boolean", "PARTNER_TEST_ONLY", parallelPartnerTest.toString())
            applicationIdSuffix = if (parallelPartnerTest) ".partner.test" else ".test"
            versionNameSuffix = "-test"
            manifestPlaceholders["appLabel"] = if (parallelPartnerTest) "KNABA Partner Test" else "KNABA Test"
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
