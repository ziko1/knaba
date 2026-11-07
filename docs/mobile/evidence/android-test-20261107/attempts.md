# Validation attempts retained

1. Initial Gradle plugin resolution failed because the runtime default proxy hostname was not available to the downloaded JDK. Workspace proxy and its supplied CA were configured in a scratch-only launcher; no TLS verification disabled and no repository network bypass.
2. Actual Kotlin compilation found Spinner.minHeight (TextView-specific property). Corrected to View.minimumHeight.
3. Root static source checks: 27/28 before adapting command call guard from api.command to captured transport.command; the latter protects async session isolation. No behavioral assertion removed; independent reviewer checked the adaptation.
4. Robolectric test manifest required android.useAndroidX=true for its AndroidX test-only dependencies. No runtime AndroidX library added.
5. Initial Robolectric class setup failed UnknownHostException before any UI case. Added supplied proxy/trust configuration to child JVM environment and verified the official Android-all runtime checksum. This was NOT_RUN UI acceptance.
6. Incremental packageDebug reported NoSuchFileException on a transient .classes.dex file. Rebuilt generated outputs from clean with filesystem watching disabled; source unchanged.
7. First clean build produced the APK and passed all 13 then-existing Robolectric cases, but lint failed with GestureBackNavigation (1 error/19 warnings). The Activity already registered a platform callback; the final revision makes lifecycle cleanup and API31/32 fallback explicit, opts in via the manifest, and narrowly documents the lint limitation. Added dispatcher/legacy-key regressions. Also guarded API33 receiver flags, excluded protected data from Android12+ backups/transfers, and retained all languages in future bundles. Final results below are separate from this failed lint attempt.

8. Additional Back tests initially failed 4/15 because the test harness inspected the Activity proxy dispatcher as if it were the attached window dispatcher. Installed SDK35 framework bytecode confirmed the distinction. Corrected the test helper to use the public attached View dispatcher; production APK inputs were unchanged. The API32 legacy key test already passed. The failed attempt remains distinct from the final rerun.

9. Subsequent Back tests found the simulator was rejecting app callbacks: its runtime ApplicationInfo lacked the opt-in although the compiled manifest contained it. Narrow diagnostic runs retained this failure. The final harness verifies the compiled manifest and initializes the runtime with Robolectric’s supported ShadowApplication.setEnableOnBackInvokedCallback API. The app now declares opt-in at application and activity levels and retains the legacy key fallback. No failed attempt is presented as physical-device evidence.

10. A narrow registration test initially checked the proxy callback list after Android had already transferred and cleared it. Installed framework bytecode confirmed the lifecycle. The corrected test checks the actual window callback is not the legacy Compat fallback and verifies navigation and unregistration. Narrow test then passed; full final suite is recorded separately.

The final verification receipt records final results separately; these failures are not reclassified as passing attempts.
