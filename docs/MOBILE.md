# KNABA DE mobile companions

The repository contains a Kotlin Android app in `apps/mobile-android` and a SwiftUI/Core Location iOS app in `apps/mobile-ios`, package/bundle `de.knaba.mobile`. They are separate from AVENQO and share the same freshly authorized device bearer API. Android uses a visible foreground service and Android Keystore AES-GCM storage. iOS uses explicit visible Core Location activation, Keychain tokens and CryptoKit AES-GCM storage. Both stop location locally before private break and END requests.

| Component | Actual readiness |
| --- | --- |
| Android source, API/manual actions, encrypted queue, visible native tracking | IMPLEMENTED_SOURCE; Android compile/runtime NOT_RUN |
| iOS source, SwiftUI/manual actions, Keychain/CryptoKit queue, Core Location | IMPLEMENTED_SOURCE; Xcode compile/simulator/runtime NOT_RUN |
| Native conservative geofence math | PASSED: actual Android Java classifier compiled on host JVM; 16 synthetic vectors |
| iOS property lists, shared JSON and executable scripts | PASSED: syntax/static validation |
| Android APK / production signed bundle | BLOCKED_EXTERNAL: no cached Android SDK/Gradle; signing identity unavailable |
| iOS .app / signed IPA | BLOCKED_EXTERNAL: macOS/Xcode/XcodeGen/Apple team unavailable |
| Physical phones, background battery/permission/force-stop behavior | NOT_RUN / BLOCKED_EXTERNAL; no reliability claim |

## Enrollment and command contract

A company-authorized one-use code is submitted to `POST /api/v1/mobile/enroll` as `{code,platform:'ANDROID'|'IOS',deviceName}`. The opaque returned `deviceToken`, `deviceId` and `employeeId` bind the native client. The server hashes the token, expires it and checks current device/employee/role authorization on every request. Old devices are revoked on replacement. Clients refuse non-HTTPS origins and redirects. A configured origin cannot change while its bearer credential remains. A new enrollment requires an empty reconciled local queue so another identity does not inherit queued employee records.

`GET /api/v1/mobile/session` returns device/employee IDs, API version 1, active shift/trip, approved policy/geofence, mode and bounded expiry. Modes are OFF, PRIVATE_BREAK, SITE_PRESENCE and BUSINESS_TRAVEL. Its renewable lease is at most five minutes; the shift-level hard limit is at most 16 hours. Server authority wins over stale state, but receiving a server mode never remotely activates previously stopped GPS. Enrollment does not authorize GPS. Effective legal approval records and an allowed active shift/activity are required.

Manual actions use `POST /api/v1/commands` with `{command,input,idempotency_key}` and a stable locally persisted command key. Native events use `POST /api/v1/mobile/events` with `{events:[{command,input}]}`, stable eventId/sequence/observedAt/policyVersionId. Events leave the queue only after an exact eventId receipt with recognized ACCEPTED/REJECTED status. Rejected events keep capped coordinate-free reconciliation metadata; transport failures preserve IDs/time/order. Observed and received timestamps remain separate. Manual trips use `destination:{kind:'SITE',id}`. Private travel pauses use `trip.stop`/`trip.resume`; `trip.arrive` explicitly confirms arrival/work. Geofence entry cannot shortcut arrival, end lunch or start a shift.

## Privacy, native operation and offline resilience

The Android foreground service is activated from a visible activity after user permission. It has a persistent KNABA notification and Stop control, no boot receiver, no sticky hidden restart and no background-location permission request. Android source targets API 36, minimum API 26, and guards API 31 mock-location APIs. iOS starts Core Location only from an explicit activation action. Optional Always authorization is a separate user action after approved tracking starts. When-In-Use access never promises locked-screen delivery. Both clients stop native subscriptions on private lunch, END, explicit OFF, revoked access or expired lease. They retain an ordinary offline queue after network loss only until the current bounded lease expires.

SITE_PRESENCE sends the primary-circle distance/accuracy and actual haversine distances for every configured approved exception circle as `zoneDistances:[{zoneIndex,distanceM,accuracyM}]`. Latitude/longitude stay out of those network/storage payloads. No invented nearest-zone distance is substituted. Entry can use an approved exception circle; exit requires conservative margins outside all approved circles. Missing or uncertain measurement cannot prove exit. The server confirms dwell from increasing observations independently. BUSINESS_TRAVEL may transmit exact route points only for explicitly permitted business-trip intervals. Coordinates are not evidence that a named person holds the device, and site GPS cannot reliably determine rooms/floors.

Queue capacity is 5000 items/4 MiB, with a 24-hour local location retention limit. Android mutations serialize across Activity/Service instances. iOS persistence uses an actor, atomic AES-GCM files, Keychain device-bound keys, file protection and backup exclusion. Tokens/raw points are not logged. Lawfully collected trip events can arrive after END, while private/post-END points are rejected by observed event time. Private breaks/end stop locally before network work and purge queued forbidden events. Transport errors retain ordered records; explicit server rejections create redacted reconciliation evidence. Logout removes local encrypted state and credentials/keys. A server-side lost-device revoke remains a separate authorized company action.

The OS can delay or stop delivery after permission changes, battery restrictions, force-stop, reboot, process termination or native-session expiry. No uninterrupted GPS reliability is claimed from source code or synthetic tests.

## Reproducible native builds

Android pins Gradle 8.13, AGP 8.13.0, Kotlin 2.2.20, SDK 36 and Java 17 bytecode. After provisioning a company-authorized SDK/JDK toolchain, run `apps/mobile-android/gradlew --no-daemon :app:assembleDebug`. The checked-in shell/batch launcher and `gradle/wrapper/gradle-wrapper.properties` accept an installed/cached Gradle or canonical wrapper JAR. The official binary JAR was not downloaded into this environment; generate it with an authorized Gradle installation using `gradle wrapper --gradle-version 8.13`. `KNABA_GRADLE_HOME` may point to a pinned cached installation. The launcher fails explicitly with exit 69 if missing, and does not silently download an unverified toolchain. Inspect the actual resulting APK with `apksigner verify --print-certs` and record its SHA-256. A debug certificate is a test identity; production requires KNABA-controlled signing/distribution.

On macOS with Xcode and XcodeGen 2.43.0, run `bash apps/mobile-ios/scripts/build.sh`. Versioned `project.yml` generates `KNABADE.xcodeproj` and an unsigned simulator app. Optional `KNABA_IOS_TEST_DESTINATION` runs XCTest and preserves `.xcresult`. iOS target is 16.0+, Swift language mode 5.9. Sources include SwiftUI forms/navigation, manual time/trip actions, HTTPS enrollment, Keychain/CryptoKit queue, exact receipts and leased Core Location. Production requires the KNABA Apple team, provisioning profiles, signing and review of Info.plist/privacy declarations. Simulator builds do not establish signed-phone usability.

## Actual checks in this environment

On 2026-10-06 the following results were observed:

| Command/check | Exit | Actual evidence and limit |
| --- | --- | --- |
| `bash apps/mobile-android/scripts/test-vectors.sh` | 0 | Compiles actual `ConservativeGeofence.java` using installed `jdk.compiler`; 16 synthetic vectors pass. Includes uncertain/equal boundaries, missing accuracy, primary/exception-circle margin and latitude/metre arithmetic. Compiler notes source/target bootclasspath warning. No Android runtime claim. |
| `apps/mobile-android/gradlew --offline :app:assembleDebug` | 69 | BLOCKED_EXTERNAL: no cached Gradle 8.13 or wrapper JAR; SDK is also unavailable. No APK produced. |
| `bash apps/mobile-ios/scripts/build.sh` | 69 | BLOCKED_EXTERNAL: macOS + Xcode required. No .app/IPA produced. |
| Python plistlib parsing on Info.plist/PrivacyInfo.xcprivacy and shared JSON checks | 0 | Apple property lists parse; synthetic provenance/five-minute lease fixture validates. Syntax verification only. |
| bash/sh syntax checks on build/vector scripts and Android launcher | 0 | Executable scripts parse. |

An initial javac-binary invocation failed; the available jdk.compiler module was then discovered and used successfully. Native SDK network provisioning stalled and was stopped. No build artifact is claimed from that attempt. Shared iOS XCTest source covers the same vectors, dwell and lease/privacy guards, but XCTest cannot run without Xcode.

## Required physical acceptance evidence

Use specifically authorized test employees/devices. Record OS version/model, app SHA, backend Git SHA, effective tracking approval/policy ID and bounded test interval. Verify enrollment and old-device revocation; permission deny/grant; explicit on/off and visible notification/indicator; uncertainty and dwell; approved exception-circle presence; business travel; private lunch/end cessation; offline replay and idempotency; locked screen; force-stop/task removal; battery saver; reboot; role/device revocation; outage and expired lease. Measure observation/delivery delay and battery consumption. Verify private/no-GPS events never appear in server storage and retention/redaction actually occurs.

Physical Android/iPhone checks are BLOCKED_EXTERNAL without approved phones, company tracking approvals and OS interaction. Do not mark them passed based on generated coordinates, a screenshot, web tests, JVM math or source existence.
