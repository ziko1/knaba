# KNABA Mobile — module memory

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
