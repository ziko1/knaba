# KNABA Mobile — roadmap

## 2026-11-08 — verified test artifacts; iPhone and live acceptance remain open

**PARTIAL_TEST_ARTIFACTS_VERIFIED_IPHONE_AND_LIVE_UAT_BLOCKED** at binary source `2a9038e14d5dba47ba636556e905ae36144c266e`, tree `303585bf7cec5e381a5908a20407c2cce4f067af`.

- **Closed within test-artifact scope:** native run `42497195566` Android 60/60 and iOS 91/91; repository run `42497195695` root 30, site 1119, ERP/PostgreSQL 3000, HTTP bridge 82. Exact APK source/signature/hash and ordinary emulator installation, installed-byte equality, process/resumed Activity passed. The iOS Simulator bundle/source archive retain their own verified hashes; 48 bundle hashes and 15 PNG identities were accepted.
- **Visual acceptance remains bounded:** 14 Android fixture renders are accepted. The actual emulator PNG retains a Pixel Launcher ANR overlay, so unobstructed Android runtime visuals are not accepted. These fixture/Simulator checks do not close physical-device or customer interaction gates.
- **Stored partial deliverables:** independent kit review PASS on subject `851d9ad59c3fc926575d1c9bccb44d9bd503a49483011c7658647dd97d697044`; `KNABA-DE-Test-Kit-0.6.0.zip` integrity passed (149 files, 148 inventory entries, CRC and every-entry byte match). Both APK and ZIP upload helpers returned `succeeded` with `local_metadata_applied: true`. The release gate remains **EVIDENCE_INCOMPLETE: 2 PASS / 7 BLOCKED / 0 FAIL**. Customer sharing/download/installation are not claimed.
- **Next release-coordinator step:** publish documentation/evidence only with `[skip ci]`; binaries remain bound to `2a9038e`, and a later documentation HEAD has no new CI result. Four bounded native checkpoints are complete; no further rerun is authorized or needed for this candidate.
- **Owner-dependent iPhone gate:** provide authorized Apple distribution/signing. Ad Hoc requires the customer's registered iPhone UDID in the provisioning profile; TestFlight is an alternative owner-controlled distribution route. Export and verify the signed device build and actual installation. No private keys or account passwords in chat. Simulator/source archives do not close the two-installable-file request.
- **Live/customer gates:** configure an approved ERP origin and test accounts, then execute agreed role, device-enrollment, physical install/update/data-retention and GPS protocols. The public endpoint still advertised `erpOrigin: null` at 15:58:00 UTC on 2026-11-08. Android offline demo task/chat checks are local only; the worker screen is unavailable in that demo.

Evidence: [Android](evidence/brand-20261108/android-final-artifact-review-2a9038e1.json), [iOS](evidence/brand-20261108/ios-artifact-review-2a9038e.json), [repository CI](evidence/brand-20261108/repo-ci-42497195695-report.json), [public connection](evidence/brand-20261108/knaba-public-connection-handoff-20261108.json). Final package evidence: [independent review](evidence/brand-20261108/independent-kit-review.json), [integrity report](evidence/brand-20261108/brand-final-delivery-integrity.json), [release gate](evidence/brand-20261108/RELEASE_GATE.json). Gate-relative paths refer to the supplied ZIP; binaries are intentionally absent from Git. Artifact hashes, sizes and remaining limits are recorded in [module memory](PROJECT_MEMORY.md). Existing M1 identity, M2 role lifecycle, M3 offline/specialist journeys and M4 ownership/full-system acceptance remain unchanged and open; this checkpoint does not replace them.

## 2026-11-08 — AVD location follow-up

On b9bacbcc actual Android60/60, iOS91/91 with clean Simulator launch, and all four repository jobs passed. Android installation did not start: emulator37.2.13 could not discover the AVD created by avdmanager. Scope the two tools to the same temporary paths and verify AVD visibility before boot; keep product code and install/hash assertions unchanged. Then verify exact downloaded artifacts and produce the customer kit, retaining missing signed iPhone IPA, public ERP configuration and physical/full-product acceptance as explicit blockers.

## 2026-11-08 — final fixture correction gate

a632 repository/source/site/ERP/PostgreSQL/HTTP bridge checks passed. Native Android still needs the60-case rerun after a test-only latch-shadow correction, then ordinary APK installation/launch and exact binary review. iOS job128773630570 actually passed91 XCTest, attachment export and clean simulator install/launch on sourcea632; later artifacts retain their own source identities. Final delivery must identify Android APK versus iOS Simulator/source and retain missing owner-signed IPA, public ERP configuration, physical/live UAT and full-system coverage as open requirements.

## 2026-11-08 — branded native reconciliation checkpoint

First brand source0234895: Android36/36 Robolectric and APK/AAB build succeeded; iOS74/74 XCTest and Simulator launch succeeded, with independently viewed native PNGs. Android emulator failed before install on missing libpulse.so.0; inherited Telegram exact-replay fixture failed in ERP CI (2968/2969). Both concrete corrections are prepared without weakening production equality.

A divergent already-built Android0.5.0/code8 line at dc54f109 contains additional security/discovery/foreground-refresh/vehicle functionality. Current base F1/F2/F4/C08 remains; compatible Android and narrow vehicle backend pieces are reconciled into0.6.0/code9, preserving brand UI. iOS0.6.0/build8 adds vehicle navigation parity. New source needs its own complete CI; old build results are not transferred.198 focused worktree checks pass after independently discovered external-role vehicle-write rejection is fixed. All source/review hashes are recorded before publication.

Next: exact-source native/repository runs, final artifact hashes/signature/ordinary APK install + launch, image review, customer instructions and durable files. Signed iPhone IPA and two installable-file delivery remain BLOCKED by owner Apple distribution prerequisites; full-product/physical/live/company acceptance remains open. No merge, production or provider activation.


## 08.11.2026 — Native0.6.0 website style and customer-test artifacts

MOBILE-BRAND-20261108 adds a consistent native visual system on PR133 without resetting prior requirements. [Acceptance](MOBILE_BRAND_0.6.0_UK.md): source/visual/functional gates → exact build/signature → Android emulator installation → persistent files; customer iPhone installation requires owner signing/profile/channel, currently BLOCKED_EXTERNAL. Full device/live/SSO/specialist product acceptance remains open. Neither simulator nor source archive closes the two-installable-file requirement.

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
