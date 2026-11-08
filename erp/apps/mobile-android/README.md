## 0.6.0 test candidate — final reconciliation

Android versionCode9 avoids the already issued divergent code8. On launch the app reads the official KNABA public release configuration, accepts only the reviewed HTTPS KNABA host policy, and checks ERP readiness before enabling account login. A missing/unready official configuration remains an explicit waiting/error state. Debug synthetic demo is available for UI/task/chat evaluation without a live account. Manual server entry is no longer the normal console flow; the separate shift companion still uses its existing device enrollment contract.

The website theme is retained alongside the existing foreground-only refresh, bounded read retry, credential-safe one-shot password/MFA changes and shared vehicle-trip navigation. There are60 framework tests in source, pending execution for this reconciled build. Android12/API31 remains minimum; a fresh debug certificate does not upgrade an earlier APK signed with a different key. Never delete customer data to bypass that mismatch. Signed APK install/emulator evidence is recorded separately from physical and live-company acceptance.

## Current Android candidate — 0.6.0-test / versionCode8

The native ERP workspace and employee tools now share the current KNABA website style: canonical compact wordmark, deep teal/lime identity, paper surfaces, pastel metrics, accessible controls and adaptive module cards. A scoped workspace search filters only authorized modules. At narrow widths or large text, metrics/navigation use one column; tablets retain a readable maximum content width. The light appearance is explicit, consistent with the current website and prior Android theme.

The package remains `de.knaba.mobile.test`, Android12/API31 minimum, with a clearly marked optional synthetic offline demo. Login, server scopes, record identity/version, unknown-write recovery, encrypted storage and explicit GPS consent are preserved. New rendered UI checks include320dp/font2, six-locale resources and worker GPS-off state. Exact-source CI must verify build, tests, APK signature and emulator install/launch; physical installation, live company UAT and upgrade compatibility remain separate.

[0.6.0 scope and delivery gates](../../../docs/mobile/MOBILE_BRAND_0.6.0_UK.md). Test artifacts use a debug certificate; an old KNABA Test can only be updated with a compatible signer. Preserve existing data if Android rejects an incompatible update. No owner production signing or store upload is implied. Historical notes follow.

## Current Android candidate — 0.5.0 / build 6

Native discovery now covers 39 ERP entity kinds, including customer quotes/reports, warehouse, purchasing, time and finance. Fifteen record types expose schema-checked contextual actions with the opened record ID/version; quote and personal crew revisions stay bound to the displayed snapshot. Visibility follows permissions, never the role name. Every request is still authorized and scoped by ERP.

The canonical three-building KNABA mark replaces the stale launcher artwork and supports adaptive/themed icons. `scripts/package.sh prototype` verifies debug APK **and AAB**, matching signer, complete signed payloads and tamper rejection. `release` requires the owner's stable key. Version metadata comes from Gradle; a failed build cannot retain a stale final receipt, and source hashes are rechecked before the receipt is committed.

[Current Ukrainian guide](../../../docs/mobile/TEST_CANDIDATE_0.5.0_UK.md). This is a source/test candidate. Shared site/ERP SSO, full specialist mobile forms, signed owner distribution, physical device and company acceptance remain separate gates. Historical receipts below keep their original source.

## Historical Android test candidate — 0.4.1

This candidate keeps the isolated **KNABA Test** package (`de.knaba.mobile.test`, versionCode 5) and the same verified debug certificate as 0.4.0. Uncertain ERP writes now retain their original input, version and idempotency key in a separate encrypted device journal. Reauthentication to the same server/company/user restores an explicit recovery screen; retry is never automatic. Different identities cannot see or replay the record. `/me` identity drift and interrupted AtomicFile backup restoration fail safely.

[Ukrainian installation and testing guide](../../../docs/mobile/TEST_ANDROID_0.4.1_UK.md) · [Source/build evidence](../../../docs/mobile/evidence/android-recovery-20261108/verification.json).

Local evidence: actual debug APK and v2 signature verified; 21 Robolectric cases (16 UI + 5 storage), 74 HTTP/journal-double transport assertions, 38 demo checks, 39 locale/clock/auth vectors and 30 synthetic geometry cases passed. The storage cases use actual AES-GCM/AtomicFile with an explicit test Keystore provider, not hardware Keystore. Lint: 0 errors / 15 retained warnings. Live ERP, actual OS process death, physical install/update/GPS, owner signing, iOS and whole-product acceptance remain open. No production deployment.

## Previous Android test candidate — 0.4.0

The test build installs as **KNABA Test** (`de.knaba.mobile.test`) beside the production package. It includes an explicitly marked, memory-only demo with task and chat journeys, and retains the separate HTTPS ERP login. German default; six UI languages. See [Ukrainian testing guide](../../../docs/mobile/TEST_ANDROID_0.4.0_UK.md) and the [current evidence](../../../docs/mobile/evidence/android-test-20261107/verification.json). Whole-product/live/device acceptance is separate. Historical 0.3.0 notes below are retained as history.

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
