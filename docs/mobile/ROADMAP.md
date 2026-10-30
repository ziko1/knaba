# KNABA Mobile — roadmap

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
