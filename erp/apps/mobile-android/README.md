## Current Android test candidate — 0.5.0

VersionCode 8 retains the isolated `de.knaba.mobile.test` package, the existing company launcher icon and the existing test signing identity. The console exposes 40 navigation modules, including the generic `vehicle_trip` read contract. Contextual actions use the executable ERP catalog, permission hints, the freshly read primary record ID and its expected version; the ERP still authorizes every request. The global action search preserves its query across foreground refresh. Forms and uncertain mutations never submit or retry themselves.

Automatic official-server discovery, bounded read retries and the foreground guard remain in place. An initial read starts on `onStart`; a late login while stopped cannot launch another authenticated read. A changed complete authority snapshot, including MFA validity or future authority fields, invalidates older transport responses. Reporting-only `mfaVerifiedAt` and ordering of equivalent role/scope lists do not change authority.

Password rotation and MFA configuration are validated one-shot commands. They freshly verify `/me`, keep credential input only in memory, clear the input controls and require a new login after submission or an unknown outcome. They never enter durable or UI recovery. Arbitrary nested credential fields are rejected before journal/network access. Legacy credential-bearing recovery envelopes fail with `RECOVERY_STORAGE_INVALID` and are left untouched; this is not a completed device-upgrade acceptance test.

`package.sh` now emits both APK and AAB plus source/input hashes, APK installer checks and signer-matched AAB integrity evidence. A debug AAB is an evaluation artifact; Play upload, physical installation, upgrade retention, real server sessions and GPS acceptance require separate evidence.

## Previous Android test candidate — 0.4.3

VersionCode 7 preserves the package, test signing identity and official launcher icon. The workspace now discovers its ERP origin from the fixed `https://knaba.de/api/public/release` endpoint. It accepts only an HTTPS origin on `knaba.de` or its subdomains and verifies the existing ERP `/ready` response before enabling a credential submission. No manual ERP address, guessed host, persisted server override or automatic demo fallback is used.

After explicit ERP sign-in, the dashboard, record lists/details and command catalogue load automatically and refresh every 30 seconds while visible; an open conversation refreshes every 15 seconds. Returning from the background refreshes immediately. Read failures use backoff with jitter up to 120 seconds; a longer valid server Retry-After takes priority. ERP requests are serialized; the search input, loaded-page count, scroll and chat composer are preserved. Command forms and uncertain writes never automatically submit or retry. Authentication or scope revocation removes private content. Passwords and sessions are not persisted by this workspace; process restart requires sign-in again.

**Live connection is still blocked:** the read-only public probe on 2026-11-08 returned `erpOrigin: null`. App code and local fixtures cannot provide a real ERP deployment, company account or website-to-ERP SSO. The application displays the actual configuration state and retries public discovery every 60 seconds while visible. It does not claim to be connected when configuration is absent.

See [automatic connection contract and operator steps](../../../docs/mobile/AUTOMATIC_SYNC_2026-11-08_UK.md) and [evidence](../../../docs/mobile/evidence/android-autosync-20261108/). Build, independent review, physical phone and live acceptance have distinct statuses in `docs/mobile/BACKLOG.json`.

## Previous Android test candidate — 0.4.2

VersionCode 6 retains `de.knaba.mobile.test` and the existing test signing identity. The launcher and round adaptive icons use the current three-building company logo, copied byte-for-byte from the website favicon. The existing package script now verifies the compiled manifest, standalone APK/launcher, ZIP integrity/alignment and optional previous-certificate fingerprint in addition to the v2 signature. These are static packaging checks, not a claim that the reported phone installation failure has been reproduced or resolved.

[Ukrainian installation guide](../../../docs/mobile/TEST_ANDROID_0.4.2_UK.md) · [Current verification](../../../docs/mobile/evidence/android-install-icon-20261108/verification.json).

For an update candidate, pass `KNABA_ANDROID_EXPECTED_CERT_SHA256` with the independently checked previous certificate digest to `bash scripts/package.sh prototype`. Keep the previous signing key; do not remove an installed app or clear its data as an installation workaround. Open the downloaded standalone `.apk` from the phone's Files/Downloads app if direct opening from an attachment does not show the installer. Physical install/update and actual downloaded-file handoff remain separate gates.

## Previous Android test candidate — 0.4.1

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

## Reproducible prototype packaging

Run `bash scripts/package.sh prototype` from a clean committed snapshot with JDK17, pinned Gradle8.13 and Android SDK36/build-tools35.0.0. Supply `KNABA_JSON_TEST_JAR` pointing to the pinned org.json 20240303 test JAR (verified by `test-transport.sh`), and `KNABA_ANDROID_EXPECTED_CERT_SHA256` for the verified previous signing identity. The script runs vectors, six-language checks, transport/discovery and demo checks, the framework suite and lint. It writes APK/AAB, source/input hashes, certificate SHA256 and an atomic receipt to `build/distribution/prototype/`; a failed attempt clears the old receipt. Both artifacts use the same debug signing identity. AAB payload signature, required entries and altered-copy negative checks complement the unchanged compiled-APK installer/signature/alignment checks.

For owner signing, provide `KNABA_ANDROID_KEYSTORE`, `KNABA_ANDROID_KEY_ALIAS`, `KNABA_ANDROID_STORE_PASSWORD`, `KNABA_ANDROID_KEY_PASSWORD` through a private environment and run `bash scripts/package.sh release`. Passwords are read by apksigner through environment references, never echoed or written into source. Retain the same owner signing key for updates. The prototype debug certificate may differ from an older APK: do not assume in-place updates or advise removal of existing app data; verify the certificate and make an approved backup first. Physical install, update/data retention and customer acceptance require their own evidence.

For a customer server move in 0.4.3+, sign out of the ERP console; the operator updates the verified `KNABA_ERP_PUBLIC_ORIGIN` on the official server, then the app discovers and checks it automatically. The previously supported manual console-origin entry is removed. The existing employee device enrollment has its own protected sign-out/re-enrollment flow; a website login is not an ERP login. See `docs/mobile/DISTRIBUTION_2026-10-28_UK.md` from the repository root.
