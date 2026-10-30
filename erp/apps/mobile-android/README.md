# KNABA DE Android

Actual Kotlin application, package `de.knaba.mobile`, min API 31 / compile and target API 36. Java 17, Gradle 8.13, Android Gradle Plugin 8.13.0, Kotlin 2.2.20 are pinned. No boot receiver, no sticky hidden GPS restart, no background-location permission. Location foreground service starts only from a visible activity after explicit activation. Android Keystore AES-GCM protects device credentials and the ordered durable offline queue.

Install Gradle 8.13 and Android SDK 36 then run `gradle --no-daemon :app:assembleDebug` from this directory. Production signing must use KNABA DE-controlled stable key; no fabricated release signing is included. Run `apksigner verify --print-certs app/build/outputs/apk/debug/app-debug.apk`, record SHA-256 and install on a physical approved test device. See `docs/MOBILE.md` for contract and field tests. Build and physical tests remain NOT_RUN until the recorded checks actually execute.

The app has a language selector in the requested order DE/EN/PL/LT/RU/UK. A new installation starts in German. Device language is an explicit final option; existing saved choices are preserved. The preference contains only the language. All screen, privacy, action, status, error and visible foreground notification texts use the six complete Android resource catalogs. Changing language refreshes an already-active notification and never starts tracking.

“My shift” displays only the fresh device-session `shiftSummary` for the bound employee and device. Site/travel/private break/pending/service/waiting durations are chronological server values as of `asOf`, with distinct classifications. Display-only shift and current-activity timers use the server clock plus monotonic elapsed time, capped at five minutes and the session lease. Expired/invalid clocks hide timers. Summary availability while mode OFF never authorizes GPS, payroll or customer billing.

Explicit GPS activation requires fine-location permission, Android13+ notification permission, enabled application notifications and an unblocked tracking notification channel. The service checks these at start, heartbeat and each callback and stops on revocation. This source guard does not replace physical OEM/background/privacy testing.

Every vault/API instance shares an authentication generation fence. Logout invalidates pending work before clearing credentials; request responses, enrollment, queue acknowledgments, summary publication and location queue writes from an older generation cannot modify a new account. Re-enrollment requires sign-out first. Device credentials remain Android Keystore-protected; no plaintext token fallback was added.

Run `bash scripts/test-localization.sh` for actual XML catalog/format/reference checks plus36 compiled Java locale, display-clock and delayed-response generation regressions. Run `bash scripts/test-vectors.sh` for the unchanged16 geofence vectors. Both are CPU/JVM checks, not Android-runtime, APK, physical GPS or provider acceptance. The current localization/auth-generation Kotlin source needs a fresh hosted Android compile; historical APKs do not prove this source.


## KNABA Mobile workspace handoff

The app keeps its existing native device enrollment, offline work-time queue and explicit GPS controls. A new public **KNABA website HTTPS origin** (separate from the existing ERP device origin) opens the mobile role entry \`/app/\` or \`/konto/\` in the OS browser. \`/console\` uses the existing ERP origin, if configured. No device bearer token, Android Keystore material or GPS consent is passed to a browser session. Roles and browser authentication are enforced by their respective servers. Website and ERP identity are **not yet unified**. Site-origin preference is non-secret and can be updated after a hosting move. The Android app still requires its own server enrollment to use shift/location functions.

## Prototype 0.3.0 / versionCode 3 — distribution

Run `bash scripts/package.sh prototype` with JDK17, pinned Gradle8.13 and Android SDK36/build-tools35.0.0. The script builds and lints, verifies APK identity and v2 signature, and writes the APK, source-file hashes, certificate SHA256 and receipt to `build/distribution/prototype/`. It is signed with an Android debug key for evaluation, not an owner-controlled production release.

For owner signing, provide `KNABA_ANDROID_KEYSTORE`, `KNABA_ANDROID_KEY_ALIAS`, `KNABA_ANDROID_STORE_PASSWORD`, `KNABA_ANDROID_KEY_PASSWORD` through a private environment and run `bash scripts/package.sh release`. Passwords are read by apksigner through environment references, never echoed or written into source. Retain the same owner signing key for updates. The prototype debug certificate may differ from an older APK: do not assume in-place updates or advise removal of existing app data; verify the certificate and make an approved backup first. Physical install, update/data retention and customer acceptance require their own evidence.

For a customer server move, sign out of the ERP console and enter the new HTTPS ERP origin. The existing employee device enrollment has its own protected sign-out/re-enrollment flow; a website login is not an ERP login. See `docs/mobile/DISTRIBUTION_2026-10-28_UK.md` from the repository root.
