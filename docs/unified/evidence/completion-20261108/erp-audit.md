> Інвентар бази до виправлень; актуальний результат кандидата — verification.json і COMPLETION_PLAN_2026-11-08_UK.md. Датовані вихідні findings збережено.

# ERP audit — KNABA candidate 557838e23356cb463f273803099ab6321e675019

Audit source base 557838e23356cb463f273803099ab6321e675019; current working-tree changes described separately. Audit date 2026-11-08 UTC/Berlin. No live/customer/device or external provider acceptance established by this audit.

## Principal findings

1. **P0 bootstrap safety defect reproduced and fixed locally:** `erp/infra/seed.ts:10` allowed absent APP_MODE via `??'DEMO'` despite requiring an explicit DEMO/TEST environment. New `erp/tests/seed-mode.test.ts` first reproduced this (1 fail/6 pass); correction `??''` now refuses before transaction access. Existing canonical seed test now explicitly chooses TEST. GREEN:32 passed/27 genuine PostgreSQL skipped in two files; `/workspace/scratch/fe1b7c871eec/seed-mode-{red,green}.log`. No database or deployment touched.
2. **P0 whole-site/ERP integration remains incomplete:** website SQLite identities and ERP PostgreSQL users are separate; do not trust matching emails. Root unified INTEGRATION_CONTRACT.md is stale proposed API: current ERP actual endpoint is POST `/api/v1/integrations/:source/events`, HMAC is timestamp + `.` + exact bytes, envelope snake_case `schema_version:'1'`, `event_type:'lead.upsert'`. Server credential selects company. Integration config requires preview/activation, owner/services validation, idempotent inbox/upsert and quarantine. Code: `erp/apps/api/integration-events.ts`, `erp/packages/integrations/generic-events.ts`, `erp/packages/domain/integrations.ts`.
3. **Existing D07 functionality must not be rewritten:** old ERP memory/roadmap still call offers DECLINED/EXPIRED, scoped unbound-order site linking, report remainder and late materials callback pending. Current code implements them: `crew_assignment.decline/expire`, `order.link_site`, `dispatch.readiness` in commerce.ts; `CrewOffersPanel.tsx`; `ReportRemainingScope.tsx`; `report-remaining-scope.ts`; integration tests `order-lifecycle-v4.integration.test.ts` (decline/expiry lines85–92, scoped site linking lines100–102, callback line59). Update docs to source-implemented, awaiting current layered acceptance.
4. **P1 implicit runtime mode deserves follow-up:** API main.ts:18 and worker/main.ts:12 default missing APP_MODE to DEMO. Auth demo itself still requires synthetic/demo-marked active user (`auth.ts:46`), so this is not proof of arbitrary production account bypass. Explicit runtime mode would prevent misconfiguration bypassing PRODUCTION-only startup controls. No runtime-mode edit made under seed-only scope.
5. **Readiness ledger is stale, not absent implementation:** canonical V4 acceptance CSV has72 NOT_RUN rows; preserved V3 has432 requirements/475 criteria. Existing ERP docs contain historical2228/2242/2452/2510 counts at different sources. None is fresh proof for current aggregate. Required current SQL/browser/native/provider/load/restoration and company acceptance must remain explicit.
6. **P1 performance needs measurement:** complete ERP web build historically emits ~666kB uncompressed JS; `Engine`/domain paths frequently load full aggregate kinds via tx.list and filter in memory. Do not claim p95 improvement without scoped100-session/100k-segment15-minute test from `scripts/v4-load.mts`. Current syntax/source evidence does not close AC67.

## 24 KNB source map (implemented source ≠ acceptance PASS)

| KNB | Existing implementation navigation | Required remaining proof / work |
|---|---|---|
|01 Product/business journey|API engine, web App, domain commands, workers, native apps|AC71 same-artifact UI/API/DB journey through receipt; actual owner/UAT and website bridge|
|02 Architecture|database.ts,001_init.sql, registry.ts, transactional outbox, infra containers|Current clean PostgreSQL/API/worker start, clean seed boundary, durable worker restart|
|03 RBAC|permissions.ts, engine.actorIn/context/visible, authority-fingerprint.ts, auth.ts|Role matrix positive/negative HTTP, cross-tenant read/write/media/export, revocation intervals|
|04 Identity/language|identity.ts, auth.ts, http.ts, six locale catalogs, activation UI|Real owner enrollment/recovery/MFA; website↔ERP stable subjects and revocation; guest handoff|
|05 WhatsApp|integrations/whatsapp.ts, whatsapp-router.ts, main.ts ingress, WorkerRunner|Approved WABA/templates/capabilities/test numbers and actual delivery/status/window receipts|
|06 Lead/human handoff|commerce.ts lead commands, handoff-calendar.ts, assistant-runtime.ts, OperatorInbox|Website lead ingress integration; real operator-customer journey; approved catalog/business authority|
|07 AI/knowledge/translation|communications.ts, internal-assistant.ts, assistant-tools.ts, deepseek.ts, assistant playground|Explicit configured endpoint/quota/data approval, actual multilingual quality, budget0/failure fallback; no paid calls made|
|08 Quotes/Nachtrag|commerce.ts, commerce-v4 tests, export pipeline|Approved company rates/tax/templates; same-version PDF/API/UI; real permitted acceptance|
|09 Client/Bauleiter|engine client projections, commerce.ts issues/report access, client web|Real customer memberships/mandates; cross-customer URL/media/export and immutable report acknowledgment journey|
|10 Dispatch/crew|commerce.ts reservations/assignment/offers/order transitions, crew-offers.ts, CrewOffersPanel|Current SQL conflict/replay and rendered offer decline/expiry, site-link, material callback; real crew data|
|11 Tasks/QC|operations.ts, task-calendar.ts, order-lifecycle.ts, LocationImport|Current synthetic complete assign→work→submit→independent accept→rework and import loops/upsert|
|12 Chat|communications.ts, message-pagination.ts, web chat, router adapters|Current membership/history/edit/translation replay and actual channel-specific bot receipt; no inferred last-channel routing|
|13 Time|operations.ts, device-events.ts, working-time-advisory.ts, mobile-shift-summary.ts|Current concurrent START/END and DST/correction/LOCKED tests across interfaces; no fabricated lunch|
|14 GPS/offline|gps.ts, device-events.ts, device-batch.ts, native GPS/outbox|Physical Android/iPhone, permission/OEM kill/private-break/remote-END lease/72h retention and7-day replay; legal config|
|15 Travel/maps|operations.ts trip commands, gps.ts, maps.ts, RouteMapView|Real device trips, trip/break/service boundaries; external routes/geocoding only with approved config/budget|
|16 Payroll/payout|resources.ts, payroll-v4 tests, accounting export|Company rates/net import, separation of duty, parallel overpayment prevention and real employee receipt/dispute test|
|17 Stock/procurement|resources.ts, material-request-batches.ts, scanner and inventory UI|Current genuine SQL reserve/move/partial receipt/cutoff/negative-stock conflicts and full AC48–52|
|18 Media|media-upload.ts, storage/media-ingest.ts, scanner.ts, client-redaction.ts|Current private upload/media ACL/MIME/limits/EXIF/redaction and approved-photo report flow; provider scanner configuration|
|19 Notifications|notification-policy.ts, work-notifications.ts, automation-authority/schedule.ts, ActivityCenter|Real recipient/channel config, opt-out/quiet hours/unknown outcome, scheduler restart and bounded delivery|
|20 Reports/statistics|report-export.ts, report-remaining-scope.ts, exporters.ts, xlsx.ts, DigestPanel|Current PDF/CSV/XLSX/portal totals, published v1 immutability, no payroll/margin leak; approved company requisites|
|21 Admin/site/integrations|v4-rest.ts/http.ts, web CommandForm, integration-events.ts, corporate-site Studio|Intake→ERP bridge (active work), remaining assistant bridge, SSO mappings and18 site-template requirements; actual responsive browser|
|22 API/security/concurrency|engine.ts, database.ts advisory transaction locks, v4-rest.ts, auth, media handlers|Fresh PostgreSQL races, key conflict/CAS/revocation, SQL/XSS/SSRF and artifacts secrecy; endpoint contracts refreshed|
|23 Privacy/operations|privacy-erasure.ts, gps retention, production-readiness.ts, backup/restore scripts, load runner|Company approval, actual offhost restore/RPO/RTO,15min load/SLO/cost; no new runtime/billing activation|
|24 Handover|canonical specs/72AC, source evidence, native deliverables, ops/customer|All required exact-source checks, signed/installed artifacts, recoverability, company acceptance; source/build ≠ live|

## Bridge implementation plan and contract compatibility

- Reuse `origin/feat/knaba-site-erp-intake-bridge-20261025` reference-only `site_erp_outbox` + explicit `vps/erp-bridge.mjs --once`. Port only named feature files/hunks, not unrelated stale site/auth changes. Root delegated this implementation now.
- Current site migration ledger ends0012; old bridge0006 conflicts with owner invite. Add0013 with generated table SQL and chained snapshot/journal; retain0000–0012 byte hashes. New requests only, no automatic historical backfill/sends.
- Persist request+outbox+audit atomically; replay creates one reference. Preserve current profile/email/role transaction guards, including partner/Bauleiter changes.
- Current ERP generic credential/config/inbox pipeline is reused, with company server-resolved; sending to a new endpoint after unknown outcome must not duplicate the request across ERP tenants.
- Fix legacy dispatcher exhausted-final-lease handling and ambiguous delivery classification; bound whole network+receipt processing, use exact event fingerprint and configuration destination binding, and distinguish UNKNOWN from APPLIED/BLOCKED. Cancellation during transport must not promise undelivery.
- Capture only real same-origin browser attribution; preserve six locales, do not infer campaign/referral absent evidence. No duplicate message/contact/private worker data in outbox. Queue statuses exposed to owner only.
- Assistant-specific bridge remains a separate next slice from `origin/feat/knaba-erp-lead-bridge-forward-20261026` (`fa9ea67`), not silently included. Old assistant migration0007 collides with accounts; it also only supports four locales and needs six-language/modern-schema reconciliation.

## Fresh checks performed by ERP agent

| Check | Result | Boundary |
|---|---|---|
|Seed safety RED|1 fail/6 pass, exit1|Missing APP_MODE reached database boundary|
|Seed safety + existing engine fixture GREEN|32 pass/27 PostgreSQL skipped, exit0|2 files; CPU/explicit transaction doubles, no PostgreSQL at this time|
|Order lifecycle + generic integration contracts|184 pass/9 PostgreSQL skipped, exit0|3 actual files; explicit doubles, no provider sends; log erp-contract-audit-tests.log|
|ERP TypeScript|PASS exit0 after seed and integration-test additions|erp-seed-typecheck.log and erp-bridge-typecheck.log; no PostgreSQL/runtime acceptance|
|Website request+CRM tests|54/54 PASS exit0|Real SQLite D1-compatible batches,6locale attribution, atomic rollback, revoked role, owner-only aggregate status; intake-api-tests.log|
|Dispatcher regression|20/20 PASS exit0|Real SQLite with injected synthetic transport; no external HTTPS; bridge-tests.log|
|VPS Referer forwarding|1/1 PASS exit0 after RED DE≠UK|Actual loopback HTTP→VPS proxy→current built Worker→SQLite, UK+PL attribution/query stripping; bridge-referer-{red,green}.log|
|Website check|PASS exit0|Astro432files0errors0warnings9hints, Vue, Svelte0errors0warnings; site-bridge-check.log|
|New actual PostgreSQL bridge cases|4 SKIP locally|No DATABASE_URL locally; site-bridge-pg-local.log. Remote real-PG QA pending frozen root artifact; do not count as pass.|

No count above accepts whole AC scenarios. Later root aggregate runs take precedence for the final integrated candidate. Audit source views found no evidence to assert current live host identity, provider operation, physical device behavior, company approvals or production readiness.

## Implemented bridge slice and frozen review handoff

The current working tree adds0013 `site_erp_outbox` plus snapshot/journal, references new cleaning requests atomically with their audit, and keeps old0000–0012 SQL unchanged. Full Drizzle regeneration exposed existing legacy schema/snapshot drift; only the generated additive table/index definitions were merged into the previous snapshot, preserving all prior tables. Current migration fixtures expect14entries; no historical backfill and no production migrations occurred.

`vps/erp-bridge.mjs --once` is an explicit single-row command. Runtime gates are disabled by default, before DB opening/claim: BRIDGE_ENABLED and TRANSFER_APPROVED exactly true, HTTPS exact endpoint+allowed origin, nonempty safe key+secret, approved privacy-version and service map. Actual source privacy version is currently **2026-10-28** (`worker/api.ts:13`); synthetic tests also deliberately cover older matching versions. Operators must configure the version actually reviewed, never copy a synthetic fixture version as live approval. CLI requires absolute DB path and will not auto-migrate. The site request handler never sends.

Queue retries reuse exact event bytes/fingerprint, timestamp+dot HMAC and request UUID; each lease has a token;5attempts max;10second total response budget;8KB receipt cap. Expired final leases, source change/cancellation after possible send, changed endpoint/key/secret/privacy config, and permanent rejection after an earlier ambiguous send become UNKNOWN. First definitive4xx rejection becomes BLOCKED. Valid matching APPLIED receipt is required for success; canonical quarantine becomes REVIEW. Root independent review found missing VPS Referer forwarding, credential-secret destination binding and retry4xx ambiguity; each was reproduced with a failing regression and fixed. Late stale-lease receipt cannot overwrite a newer completed claim.

Canonical metadata uses DE/EN/PL/LT/RU/UK, same-origin referrer path only, optional bounded real `utm_campaign`/`ref`, no query/hash/tokens, no invented campaign. ERP server config still sets originChannel WEB by default; referralCode remains attribution, never membership/price authority. Outbox stores source reference/attribution plus digests/status, not copied contact/message. Envelope includes minimal contact, mapped service, customer-stated property/address/period/area, never worker notes, assignment, private message, payroll, money or GPS. Marketing consent remains false in ERP.

Owner-only `/api/crm/bridge-status` returns local aggregate counts and `automaticDelivery:false`; CRM shows counts and uncertainty. This is not actual provider health or ERP-wide counters; viewing it never sends. Existing role/session/rate guards remain active. Actual1run HTTPS deployment, owner transfer/legal approval, credential/company/service config, backfill/reconciliation interface, bidirectional status/cancellation/GDPR erasure, common site↔ERP identity and the separate assistant bridge remain unaccepted. Local source deletion cascades the local reference only; it cannot promise remote erasure after delivery.

`erp/tests/site-intake-bridge.integration.test.ts` adds4 actual-PostgreSQL scenarios via the real signed adapter with **in-process injected transport**: lost response after commit and exact one durable lead/outbox effect; rollback before commit followed by one retry effect; unsigned tenant/body tamper rejected; changed source bytes after unknown outcome held with no new ERP effect. Requires full sibling corporate-site source+drizzle in the frozen artifact. This covers storage/adapter behavior only, not live HTTPS/provider/browser acceptance.

Rollback limitation: pre0013 runtime's strict migration ledger rejects14-entry database, so an old-code-only restart is not a valid rollback. Use a coordinated pre-migration backup restore with acknowledged data-loss boundary or a reviewed forward fix. Never drop the queue/migration to manufacture compatibility; ensure uncertain remote outcomes are reconciled first.

Scope frozen after parent review fixes. Parent owns final aggregate source hash, complete build/test receipts, independent review and canonical requirement traceability. No commits/deploys/provider enablement performed by this worker.
