> Інвентар бази до виправлень; актуальний результат кандидата — verification.json і COMPLETION_PLAN_2026-11-08_UK.md. Датовані вихідні findings збережено.

# KNABA mobile / operations audit — 8 November 2026 (Berlin)

Source baseline: `557838e23356cb463f273803099ab6321e675019`, isolated integration branch `feat/knaba-completion-audit-20261108`. Runtime source now has Android working-tree changes described below; do not attribute them to baseline SHA. Audit by `/root/mobile_audit`.

## What exists and what is actually proved

| Area | Source implementation | Fresh evidence / remaining gap |
|---|---|---|
| Android native ERP | Kotlin Activity with actual ERP HTTP transport, permission-scoped modules, task Start/worklog/Submit, original-text chat, search and pagination; 0.4.0/code4 test package `de.knaba.mobile.test` | New actual Gradle compile, Robolectric and lint attempt logged separately. Real ERP/account/role UAT and physical installation remain NOT_RUN. |
| Android synthetic demo | Explicit debug-only, RAM-only `DemoConsoleTransport`; isolated task/chat fixture, no network/GPS activation | Demo is not ERP readiness. Existing implementation and tests preserved. |
| Android localization | DE/EN/PL/LT/RU/UK, German first-run, previous language choice retained | Fresh six catalog×200 string parity +39 Java locale/clock/generation vectors PASS; synthetic geometry+lease30 vectors PASS. |
| Android time/GPS companion | `MainActivity.kt`, `ApiClient.kt`, visible non-sticky `TrackingService.kt`; encrypted queue, device enrollment, manual commands, current lease,5min renewal/15min maximum, local BREAK/END stop,72h GPS retention; no covert restart | Strong source safeguards and CPU vectors, not AC40 physical performance. Permission/OEM reboot/battery/offline/data-retention tests need actual devices. |
| Native storage | Android AES-GCM+Keystore AtomicFile; iOS AES-GCM and device-only Keychain, encrypted bounded queue and reconciliation | Source proof; encryption hardware and OS restart/upgrade acceptance still required. |
| Android ambiguity after restart | Baseline kept console pending state only in RAM/Activity recreation, losing key after process termination | Reproduced with baseline transport and HTTP doubles. New durable actor+origin-scoped recovery implemented; details below. |
| iOS ERP | SwiftUI console, separate RAM actor session, ERP lists/command forms/chat; project target iOS17+, current version0.3.0/build3 | No macOS/Xcode in current runtime. Source-only; no current compile or IPA claim. Two concrete transport safety gaps below. |
| Identity integration | Native employee-device enrollment distinct from ERP actor authentication; website session and ERP session separate | M1 identity unification, owner/client/company migration/revocation needs shared integration contract+real tests. Do not call this SSO. |
| Release signing | Android package.sh validates APK and supports owner supplied signature; iOS archive-release.sh fails closed without Mac/owner Apple Team/reviewed export options | Current debug signature only. Stable owner Android release key, signed iOS channel, hardware install/update, owner acceptance blocked externally. |
| Customer operations | `ops/customer/knaba.py` artifact manifests, checksums, isolated scope, operator lock, additive orchestration, config backup/rollback, provider approval boundaries | Fresh27 tests PASS; genuine local SQLite backup test, other Docker/provider cases use declared doubles. Actual customer-host install/reboot/restore is not established. |
| Scoped site panel | Unix peer-credential authorization, per-owner registry, approved systemd/container controls, durable unknown-action guards | Fresh47 Python tests PASS (runtime doubles/path+ownership checks). Live PAM/root permissions/container namespaces/reboot not tested. |
| Backup | Canonical ERP pg_dump manifest+file checksums+encrypted CBC with separate HMAC verifier; customer SQLite online backup and archive hashes | Backup implementation exists. Current offhost production backup and clean-host complete restore not verified. |
| CI/publication | Tracked workflows only under `erp/.github/workflows/`; root `.github/workflows/` absent | A push of the current root repo does not activate nested workflow YAML. Existing workflows also assume `apps/` root paths. Do not copy them to root without adapting paths, scope and quota; no hosted CI PASS inferred. External GitHub apps/webhooks unknown beyond connector metadata. |

## Concrete prioritized gaps

1. **P1 Android console restart duplication (addressed by candidate):** transport `PendingCommand` and UI `pendingRecovery` were RAM-only. If write reached ERP but response was lost, app termination followed by reauthentication could send same action with a fresh key. Baseline reproduction logs `mobile-baseline/repro.log`.
2. **P1 iOS same duplication risk remains:** `erp/apps/mobile-ios/Sources/ERPConsoleCore.swift:execute` creates `UUID()` for every invocation; there is no durable pending record or reused key on ambiguous retry. Implement equivalent identity-bound encrypted recovery and test real Swift URLProtocol/XCTest plus actual Mac build before acceptance.
3. **P1 iOS logout race remains:** `ERPConsoleClient.logout()` awaits remote request before `reset()`. Swift actors are reentrant, so concurrent requests/new login may overlap; delayed old logout can reset a newer identity. Invalidate locally first, detach old session for best-effort revocation, and prove delayed-response behavior with XCTest.
4. **P1 identity/data parity:** website/ERP/native scopes are not unified by matching email. Role dashboards do not constitute tested operator→employee→client workflow against real database. Need M1 before M2 full role acceptance.
5. **P1 AC40/AC70 physical:** no evidence in this run for Android+iPhone20 exit/entry field samples,2h stationary control, lock screen, denial, battery saver, reboot, OS stop,30min offline, stable-signature upgrade retention.
6. **P1 AC69/AC71 target:** no current known customer-host artifact identity, full rollback/migration rehearsal or cross-interface real test flow. Source/build evidence cannot close these.
7. **P2 native input/response budgets:** iOS uses `URLSession.data(for:)` then checks2MiB after buffering. A huge response allocates before rejection; use bounded streaming delegate. Android API transport already bounds stream; Android encrypted vault read now similarly bounded for recovery state safety.
8. **P2 native list UX:** both clients hard-stop after10×100 rows, reporting error instead of user-visible incremental pagination. Android prevents only immediate repeated cursor; longer cycles hit cap. Existing behavior is bounded but limits large production datasets.
9. **P2 CI:** root safe validation workflow can be added once execution/quota is explicitly established; preserve nested source workflow history. No auto-deploy is needed to make QA work.

## Android continuation implemented (working tree)

- New `ConsoleRecoveryJournal.kt` uses a separate `SecureStore` file and Keystore alias; never stores session cookie, CSRF or login password.
- Journal key binds normalized HTTPS origin+companyId+userId with SHA256. The authenticated login response supplies identities; client cannot select another journal scope.
- Original command input/version/key is written atomically before any network mutation. Storage failure blocks sending; no fake success.
- Same actor login on a fresh transport restores the pending command. UI shows original input and requires explicit Retry. Different user/company/origin sees no record and cannot replay it.
- Logout/Activity destruction clears RAM session but preserves encrypted unresolved command. Successful same-key response clears the durable record. A definitive first-attempt rejection clears it; a rejection after an earlier unknown result does not pretend the earlier write never committed.
- Separate vault retains up to16 identity/origin scopes; bounded requests/4MiB ciphertext input; no arbitrary cleanup of unresolved operations.
- Six-language explanation now describes encrypted recovery and same-account reauthentication.
- `SecureStore.read` now bounds ciphertext reading to its4MiB payload+29-byte envelope limit before allocating an unbounded byte array.

## Evidence available to integration owner

- Baseline reproduction: `/workspace/scratch/fe1b7c871eec/mobile-baseline/repro.log`; source files loaded via `git show 557838e...`.
- CPU transport74 assertions PASS after new restart/isolation/journal-failure scenarios. HTTP and storage doubles, explicitly not live ERP or OS process kill.
-21 Robolectric tests report0 failures/errors/skips (16 UI+5 AES-GCM/AtomicFile tests with explicit test Keystore provider), including restored-command UI and exact original envelope. Framework simulation on API32/35, not physical device.
- Actual Gradle assemble+lint build log `/workspace/scratch/fe1b7c871eec/mobile-recovery-build.log`; final exit and lint counts to be supplied after process completes.
- Original27 customer+47 sitepanel Python suite calls completed exit0. These only establish their declared local/double scope.
- Tools reused: Gradle8.13/AGP8.13.0/Kotlin2.2.20, Android SDK36/buildtools35, Temurin17.0.21+9 cached at `/workspace/scratch/e89483c70645/toolchain`; no downloads, provider activation or paid service dispatch.

No main merge, deployment, live data, provider webhook, server permissions or signing key changes. Independent review by `/root/web_audit` accepted the final recovery source;74 transport assertions independently rerun. Canonical roadmap/memory/backlog remain integration owner's scope.

Final Android candidate:0.4.1/code5; same debug certificate as0.4.0;APK SHA256`d7d452189331e4b2bfd0f8f0772b297db8cac0bca69825d876a87f01fc6a2b4b`. Legacy AtomicFile backup-only restoration reproduced and fixed,21 tests PASS; /me type/actor/epoch guard rejects stale or malformed identity without discarding unresolved durable records.
