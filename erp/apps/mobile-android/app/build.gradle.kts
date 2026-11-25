plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
val parallelPartnerTest = providers.gradleProperty("knabaParallelPartnerTest").orNull == "true"
val partnerDiscoveryHost = providers.gradleProperty("knabaPartnerDiscoveryHost").orNull
if (partnerDiscoveryHost != null) {
    require(parallelPartnerTest) { "knabaPartnerDiscoveryHost requires knabaParallelPartnerTest=true" }
    require(Regex("""[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.knaba\.de""").matches(partnerDiscoveryHost)) {
        "knabaPartnerDiscoveryHost must be a lowercase DNS label under knaba.de"
    }
}
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
        buildConfigField("String", "PARTNER_DISCOVERY_HOST", "null")
    }
    buildFeatures { buildConfig = true }
    bundle { language { enableSplit = false } }
    buildTypes {
        debug {
            buildConfigField("boolean", "PARTNER_TEST_ONLY", parallelPartnerTest.toString())
            partnerDiscoveryHost?.let { host -> buildConfigField("String", "PARTNER_DISCOVERY_HOST", "\"$host\"") }
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
// Only the separately issued partner debug APK advances beyond the ordinary build.
androidComponents.onVariants(androidComponents.selector().withBuildType("debug")) { variant ->
    if (partnerDiscoveryHost != null) {
        for (output in variant.outputs) {
            output.versionCode.set(output.versionCode.get() + 1)
            output.versionName.set(output.versionName.get() + ".1")
        }
    }
}
dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16.1")
}
