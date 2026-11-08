# KNABA Mobile — roadmap

## 08.11.2026 — спільний source і native CI прийнято

Source `bb223af67af9eae5f11e7ca225f89ddf97a8e4e2`, [PR133](https://github.com/ziko1/knaba/pull/133). Native run [42486326902](https://github.com/ziko1/knaba/actions/runs/42486326902): Android 0.5.0-test/code6 — 32 JUnit PASS, lint 0 errors/20 warnings, hosted signature/AAB integrity; iOS 0.5.1/build7 — 67 actual XCTest PASS на iPhone 16/iOS 18.5/arm64, Xcode 16.4. Repository run [42486326925](https://github.com/ziko1/knaba/actions/runs/42486326925): ERP2969, bridge82, site732+90+297, root30; усі required jobs SUCCESS без acceptance skips.

Незалежно звірено artifact bytes, 53 Android source files, 48 compiled iOS bundle files, 65 consolidation inputs і raw logs. [Повний receipt](evidence/native-consolidation-20261108/accepted-bb223af.json). Підготовчий iOS NOT_RUN збережено як історичний стан; фактичні 67 XCTest доведено completed summary/log.

M1 identity issuance, повні M2/M3 role journeys і M4 signing/physical/company handover залишаються OPEN. Android DEBUG_EVALUATION_ONLY; iOS unsigned simulator, без installable signed IPA. Debug certificate може відрізнятися від старого пакета: не видаляти pending journal чи дані задля update. Whole product NOT_READY. Наступний backend-only KN-C08-B має власний source/CI і не переприв’язує ці артефакти.

## 08.11.2026 — native completion execution

MOBILE-004/011/012 now have active implementation: 39 permission-based modules, Android contextual record actions, iOS durable recovery/session fencing, canonical icons and verified packaging. Current candidate 0.5.0 / build6 is awaiting exact-source native CI and owner/device gates. M1 shared identity, all specialist M2/M3 lifecycle journeys, partner integration and M4 signing/handover are still open; this increment does not replace the full system scope.

## 08.11.2026 — recovery continuation

MOBILE-010 adds durable encrypted Android ERP command recovery and identity fences; source/JVM/Robolectric/build evidence is separate from real device acceptance. MOBILE-011 prioritizes iOS unknown-write retry + logout epoch, followed by Xcode/device verification. Unified site/ERP identity and customer role lifecycle remain prerequisites for complete product handover.

- M0 Candidate: website `/app/` localization and installation entry; native secure URL handoff, tests, safe release-link configuration. Target: inspectable Draft PR, source validation and build evidence.
- M1 Portable site+ERP authentication: verified operator accounts, invitations, PKCE/OIDC & explicit account migration; independent security tests.
- M2 Role data parity: real approved client order state and correspondence, worker job assignment/reporting, partner isolation, operator dispatch. Versioned authoritative ERP bridging only after integration tests.
- M3 Native role screens & offline: on-device role-specific dashboards, encrypted outbox and safe updates, push only with opt-in and verified quota.
- M4 Ownership handover: new server, environment config, backed up data, signed Android/iOS packages, mobile hardware UAT, release and rollback.

**Gates:** no synthetic pass replacing real backend, no own-domain OAuth until credentials and consent confirmed, no implicit deploy/merge.

## Customer prototype continuation —28.10.2026

- SOURCE_LOCAL_QA: native0.3.0/build3; six-language order DE/EN/PL/LT/RU/UK; defaultGerman with preserved existing preference; iOS ERP labels/errors and selected-language messages.
- SOURCE_LOCAL_QA: verified APK packaging and owner-key recipe; Xcode archive/export recipe; explicitly source-only iOS archive. Canonical instruction `DISTRIBUTION_2026-10-28_UK.md`.
- Android SDK/Gradle build: release coordinator produces fresh exact-source receipt; local Java/XML PASS is not an APK compile claim.
- BLOCKED_EXTERNAL: macOS/Xcode compile+XCTest and owner Apple provisioning/IPA; Android owner release key; physical install/update/data-retention, device/privacy and customer-server role UAT remain separate gates.

### Android artifact checkpoint

- ANDROID_DEBUG_APK_BUILD_AND_SOURCE_BINDING_PASS at `b88766108684b6fd78a1cca81642ab512903bdeb`: actual build+lint,0errors/18warnings; v2-debug-signed0.3.0/code3 APK; downloaded hash and all33input files independently matched. Evidence `evidence/prototype-20261028/independent-binding.json` and unchanged raw receipts.
- Owner signing / physical installation and update retention remain separate pending gates. iOS is source-only pending real Mac/Xcode/Apple signing; final snapshot source archive must not be labelled an IPA.

### Android 0.4.0 test candidate — 2026-11-07

MOBILE-009 tracks current Android continuation: coherent native task/chat journeys, explicit offline demo, separate test package and session/retry safeguards. See `TEST_ANDROID_0.4.0_UK.md` and exact results in `evidence/android-test-20261107/verification.json`. This candidate does not accept M1 identity unification, all M2 role parity, M4 company handover or full-product requirements. Live ERP/physical-device/company tests and durable ambiguous-write recovery remain open.
