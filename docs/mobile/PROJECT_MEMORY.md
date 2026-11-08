# KNABA Mobile — module memory

## 08.11.2026 — exact-source native and SQL CI completed

Runtime/test source `fb4be719fc6f777138cb93837fc41729f9104c09`, tree `00f1af8f6dc3c8dcf19154ac163c7e8c5a7c9a68`, Draft PR127. Native run 42463090142: Android 32 tests and iOS 49 actual XCTest PASS; simulator build PASS. Repository run 42463090119: all 4 mandatory jobs PASS, ERP 2739 with PostgreSQL 17.6, bridge 9, site 732 + 90 + 197, root 28; 0 fail/skip in acceptance tests. Local APK/AAB and iOS source archives independently bound to 53 + 1 and 40 exact Git inputs. Evidence: `evidence/native-candidate-20261108/verification.json`. Physical devices, owner signing/UAT, full shared identity and specialist journeys remain open; full product NOT_READY.

## 08.11.2026 — native completion candidate 0.5.0

Existing KNABA project; isolated branch `feat/knaba-mobile-completion-20261108`, based on `9ff77d7b0161a4dde84314f2df327e4594e0eb0c`. Android/iOS have 39 permission-based discovery modules. Android adds 61 contextual record actions across 15 entity types, immutable ID/version binding and native confirmation; iOS adds durable unknown-write recovery, fresh identity/pagination/logout fences and 26 new XCTest methods (execution pending macOS CI at this checkpoint). Both use the current canonical logo. APK/AAB verification and owner IPA/source packaging now bind receipts to immutable inputs. Fresh local Android clean build/lint: 32 Robolectric tests, zero failures/skips; lint 0 errors / 17 warnings. ERP native API contract: 62 tests; TypeScript and root 28 tests pass. These are source/host evidence, not full mobile parity or production acceptance. Current instructions: `TEST_CANDIDATE_0.5.0_UK.md`; final exact-source and CI receipts will be recorded separately. The two failed intermediate Android attempts were cache-lock contention and duplicate generated R dex after cache relocation; a clean isolated build passed without dependency or application-contract changes.

## 08.11.2026 — Android0.4.1 recovery candidate

Encrypted actor-scoped ERP pending-command journal, persisted before request; process/activity recreation recovers original version/payload/idempotency key. Reauthentication must resolve the same origin/company/user; no automatic replay and no GPS namespace collision. AtomicFile backup recovery, bounded storage and delayed/malformed /me session checks covered by targeted regressions. Exact artifact/build/tests: `evidence/android-recovery-20261108/verification.json`; instructions `TEST_ANDROID_0.4.1_UK.md`. Separate package `de.knaba.mobile.test`, versionCode5, same debug certificate as0.4.0; not owner-signed production.

Android physical install/update, hardware Keystore/reboot/GPS and actual ERP UAT remain NOT_RUN. iOS source review identified unresolved fresh retry key after unknown write and logout/session race; no claim of iOS readiness. All older receipts below remain historical.

Project: KNABA DE (separate from AVENQO). Mobile module inside `ziko1/knaba`, not a new standalone business domain. Candidate based on `feat/knaba-customer-release-20261028`; work in `feat/knaba-android-ios-workspace-20261028` one stacked Draft PR. Read canonical repo rules first.

Existing Android `de.knaba.mobile` and iOS `de.knaba.mobile` native apps implement employee device enrollment, work-time/GPS/offline sync, **not full native role parity**. Existing Astro role portal `/konto/` and owner Control Center `/admin/` provide login/role views via browser; ERP `/console` separate login. PR #110 contains pending user/partner/owner grant and OIDC changes, not customer-live. New `/app/` acts as role-aware installable mobile web entry and native system-browser handoff. No backend unification or website-to-ERP SSO.

Next security/release tasks: verify site build and PWA manifest; browser UAT; actual Android SDK/Gradle and Xcode builds; server migration, auth bridge and full role API; signed distributions and owner acceptance. GPS stays opt-in/OFF unless explicitly authorized. No production deploy or paid vendor activation.

## 28.10.2026 — prototype0.3.0/build3, six-language distribution continuation

User requested current Android/iOS packages for customer-server handover, exact DE/EN/PL/LT/RU/UK order and German default. Existing native role console and employee/GPS models preserved. New installations default DE; previously selected/system preference preserved. Android login has explicit language choice; iOS ERP and companion share preference. Added76six-language ERP labels/errors and locale-correct message metadata;95legacy iOS rows retained without translation loss. Android/iOS version0.3.0/build3.

Packaging: Android `scripts/package.sh prototype|release` with source-file manifest, v2 signature, certSHA256, package/version and fail-closed owner signing; iOS `scripts/archive-release.sh` requires owner Mac/Apple team and reviewed export plist; `scripts/mobile/package-ios-source.py` emits explicitly source-only archive. Full instructions `DISTRIBUTION_2026-10-28_UK.md`. No fake APK/IPA/link or production signing claim.

Actual local checks: Android XML144×6;39Java locale/clock/auth-generation;30Java geometry PASS; iOS static95companion+76ERP key/format/order/plist/version PASS; package shell syntax PASS; iOS archive execution BLOCKED_EXTERNAL exit69(macOS/Xcode absent). Added2ERP localization/error XCTest cases; execution NOT_RUN without Mac. All95prior iOS translations byte-preserved under reordering. Parent release coordinator owns actual Android SDK build/artifact receipt and final exact Git SHA; mobile work was initially based onf57f04f and continued in shared release branch, so use final file hashes/commit rather than attributing dirty edits to that older SHA.

Open: real macOS compile/XCTest, Apple owner signing/IPA, owner Android stable signing, physical installation and update/data preservation, backend/tenant role UAT. Debug cert can differ from previous artifact; do not recommend deleting existing application data to force an update. Source-only archive is not installable on iPhone.

## 28.10.2026 — actual Android prototype build accepted in its narrow scope

Android source bound to `b88766108684b6fd78a1cca81642ab512903bdeb`. Actual `assembleDebug`+`lintDebug`47tasks succeeded; lint0errors/18warnings retained. Delivered `knaba-android-0.3.0-prototype.apk`,2,658,684bytes, SHA256`3e62935cafed829430f8f5384f24ac9ea964d2d4b4b680de283de7e7e9a37564`, package`de.knaba.mobile`,version0.3.0/code3,minSDK31/target36. Verified v2 debug signature, certificate SHA256`d722a33a214628af4dedab7d9251dca0695fb513885246bc581bd06702cac532`.

Independent LOCAL recheck hashed both delivered APK copies and compared all33builder-input hashes to exact Git blobs at b887661 and current native files, all match. Original builder receipt sourceGitSha:null is preserved because build used source archive; derivative commit binding is explicitly separate, not a fabricated original build SHA. Evidence `docs/mobile/evidence/prototype-20261028/{receipt.json,source.json,commit-binding.json,independent-binding.json,signature.txt,package.txt,build.log,lint-results-debug.txt}`; language/geometry logs included. This supersedes the previous Android SDK-build-pending statement only. Later documentation SHA must not retag APK provenance.

Scope: ANDROID_DEBUG_APK_BUILD_AND_SOURCE_BINDING_PASS. Owner release signing, physical installation, upgrade/data retention, customer acceptance remain NOT_RUN/BLOCKED_EXTERNAL. iOS Mac compile/XCTest and signed IPA remain BLOCKED_EXTERNAL; final iOS source-only archive must be generated after final repository snapshot and labelled XCODE_SOURCE_ONLY_NOT_IPA.

## 2026-11-07 — Android test candidate 0.4.0

User request: «зроби логично закинчене приложение для кнаба де и дай для теста». Verified current GitHub base: `87fdba936bb8ed7d9b8c7493c49895c48395250b` (cabinet continuation). Candidate branch: `feat/knaba-android-test-20261107`. Existing full scope and mobile M0–M4 remain unchanged.

Native console now has readable dashboard/records, search, contextual task Start→worklog→Submit, original-message chat, six locales, screen/session fences, explicit-key retry and recovery after configuration change. Separate debug package `de.knaba.mobile.test` keeps old installation intact. Clearly marked memory-only synthetic demo supports test journeys without credentials; no network/GPS/provider effects and no implicit company acceptance. Exact decimal quantity conversion uses integer thousandths internally.

Agents: `/root/android_ui` UI/locales; `/root/android_transport` API/retry; `/root/android_demo` synthetic adapter; `/root/android_qa` independent UI tests/review; `/root` integration/toolchain/distribution. No external paid model or service activated. Required test results/source and artifact binding are recorded in `evidence/android-test-20261107/verification.json`; pending results are not PASS.

Open: real ERP origin/accounts and live tenant/role UAT, process-death recovery of ambiguous ERP writes, stable owner signing, physical install/update/GPS/battery, iOS signing and whole-product requirements. Both known domain probes returned Cloudflare403/1010 from this workspace; this is an access observation, not proof that public sites are down. No merge/production deploy. Current verification: build+lint PASS (0 errors, 15 retained non-blocking warnings); 15 Robolectric UI cases PASS on API32/35 simulation, root 28 PASS, transport39 HTTP-double assertions, demo38 JVM checks, locale200×6 plus39 vectors, geofence30 synthetic vectors. Actual APK/hash/signature are in the receipt. Next: physical test installation and approved test ERP/account UAT; deliver the candidate and `TEST_ANDROID_0.4.0_UK.md`.
