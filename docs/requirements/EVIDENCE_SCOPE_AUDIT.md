# Evidence scope and remaining acceptance

This audit preserves 432 requirements and 475 source acceptance tests. It records 4 PASSED paragraph criteria and 5 PASSED named scenarios for exact historical source `942b3b2fc575b34b565fff2f4a1cd4d417d5e06b`; 428 requirements and 466 acceptance tests remain NOT_RUN. A source PASSED row is not current-product acceptance.

[Hosted CI37525960411](https://github.com/ziko1/knaba/actions/runs/37525960411) executed 439 implementation assertions: 400 CPU/in-memory/document/transport-double cases and 39 real PostgreSQL cases. All 439 passed. Actual rendered browser result was 6 passed / 7 failed, so the overall isolated live run FAILED. Browser discovery/listing files are not runtime evidence. The uploaded artifact is independently hash-verified, with PR merge SHA in its name but actual source 942b3b2 in runtime/stages.

[Native CI37525960129](https://github.com/ziko1/knaba/actions/runs/37525960129) built Android debug APK and iOS unsigned simulator bundle, executing 16 host-JVM classifier cases and 4 simulator XCTest cases. Artifact/payload checksums were independently verified. Physical permissions/background/GPS/battery/offline/release signing/App Store acceptance is NOT_RUN.

The actual historical encrypted empty-database restore stage is evidence for narrow T-OPS-02. The mocked PostgreSQL subprocess transport tests in worker-retention.test.ts are CPU tests and cannot be substituted for that real restore. New erasure-aware migration/reconciliation behavior requires a subsequent actual restore run.

## Narrow completed criteria

| Source test | Environment | Scope |
|---|---|---|
| T-REQ-11-004 | HOSTED_CI_CPU_DOMAIN_FIXTURE | Full synthetic integer-cent calculator example, including explicitly synthetic tax; no company tariff/legal profile implied. |
| T-REQ-30-002 | HOSTED_CI_CPU_DOMAIN_FIXTURE | Full source-defined synthetic chronology and separately approved paid-travel arithmetic; no real payroll policy implied. |
| T-REQ-30-013 | HOSTED_CI_CPU_DOMAIN_FIXTURE | Full synthetic 8:00/6:55/0:30/0:30/0:05 arithmetic, 7:25 explicitly approved payability and preserved pending interval. |
| T-REQ-30-017 | HOSTED_CI_CPU_DOMAIN_FIXTURE | Full synthetic physical/transit/use/return ledger quantities and duplicate callback rejection; physical stock not audited. |
| T-SALES-01 | HOSTED_CI_CPU_DOMAIN_FIXTURE | Canonical server-price/approved-version acceptance yields exactly one dispatch/order under replay, tested through domain handlers with in-memory transaction fixture. |
| T-SALES-02 | HOSTED_CI_CPU_DOMAIN_FIXTURE | Expired/stale and superseded exact quote versions rejected before dispatch effects, through domain handler fixture. |
| T-SALES-05 | HOSTED_CI_CPU_DOMAIN_FIXTURE | Fixed 1200 remains unchanged by raw time/draft extras; separately approved and accepted120 addition produces1320 exactly once, in domain fixture. |
| T-REPORT-03 | HOSTED_CI_CPU_DOMAIN_FIXTURE | Delivery, document receipt, hours confirmation and legal work acceptance remain distinct domain actions; no actual customer receipt claimed. |
| T-OPS-02 | HOSTED_CI_ACTUAL_ISOLATED_POSTGRES_ENCRYPTED_EMPTY_DB_RESTORE | Actual historical hosted-CI isolated empty-database encrypted restore passed with database/media reference and byte-checksum checks. Current erasure-aware restore changes and public infrastructure are not covered. |

## Module readiness limits

This table describes available evidence, not a production-ready label. Source acceptance status remains open unless a narrow closure above applies.

| Module | Historical implementation tests | Remaining acceptance limit |
|---|---|---|
| delivery/specification | Document/source pointers; runtime acceptance separate | Full source preserved; product acceptance and handover remain open. |
| delivery/product | Document/source pointers; runtime acceptance separate | Implemented modules require final candidate acceptance; no production readiness inferred. |
| delivery/autonomy | Document/source pointers; runtime acceptance separate | Delivery records exist; the user's final deployment goal requires final live evidence. |
| approvals/automations | commerce.test.ts, governance.test.ts, integrations.test.ts | Domain approval and scheduling invariants executed; current automation/provider effects need final acceptance. |
| architecture | engine.integration.test.ts, integrations.test.ts | 39 real PostgreSQL cases belong to exact historical source; new migrations/handlers need current CI. |
| identity/rbac | identity.test.ts, engine.integration.test.ts, governance.test.ts | Historical current-rights/MFA/tenant cases passed; AI bridge and all role UI paths are not thereby accepted. |
| channels/conversation-router | commerce.test.ts, communications.test.ts | New standalone WhatsApp router and guest assistant changes await final CI; no official provider session acceptance. |
| integrations/whatsapp | integrations.test.ts, communications.test.ts | Raw HMAC and channel policy executed with synthetic transport; Meta credentials/account/templates/live callbacks unverified. |
| messaging/translation | communications.test.ts, integrations.test.ts, engine.integration.test.ts | Versioned ACL/cache and fact guards executed; real multilingual/provider quality and full WhatsApp UX remain open. |
| assistant-config/knowledge | commerce.test.ts, integrations.test.ts | Config preview/publish and synthetic AI guards executed; newly added tool bridge/atomic approval paths require final CI and provider evaluation. |
| leads/handoff | commerce.test.ts, communications.test.ts, integrations.test.ts | Lead and human ownership domain checks executed; complete guest/router lead continuation remains candidate acceptance. |
| pricing/quotations | commerce.test.ts | Exact cents and narrow synthetic sales scenarios passed; report/UI/provider equivalence is separate. |
| dispatch/scheduling | commerce.test.ts, operations.test.ts | Canonical dispatch/task domain roundtrips executed; simultaneous independent dispatcher reservations not verified as that whole scenario. |
| client-portal | commerce.test.ts, resources.test.ts, engine.integration.test.ts | Historical customer ACL projections executed; report download/browser and new assistant paths need final live acceptance. |
| sites/site-locations | operations.test.ts, imports.test.ts | Tree/import validation executed; full KNB-014 navigation and issued-report reparent fixture not accepted. |
| tasks/quality/rework | operations.test.ts, task-calendar.test.ts | Historical pure calendar and task invariants passed; current atomic catchup handlers pending, accepted-template/rework-photo/time/report criteria partial. |
| timekeeping | operations.test.ts, engine.integration.test.ts | Two full source synthetic arithmetic paragraphs passed; legal rules, all boundary corrections and final role UI remain separate. |
| geolocation/geofences/travel/native | operations.test.ts, gps-retention.test.ts | 10 historical real PG GPS cases and native classifier tests passed; physical permissions/background/battery/offline tracking and legal activation remain open. |
| reporting/statistics | resources.test.ts, operations.test.ts | Exact domain snapshots/export artifacts executed; complete analytics/role UI acceptance pending. |
| inventory/procurement | resources.test.ts, engine.integration.test.ts | Full synthetic 10-liter criterion passed; PG concurrent stock race passed, physical barcode/procurement and final browser paths remain separate. |
| notifications/automations | communications.test.ts, integrations.test.ts | Retries/quiet periods/domain rule matching executed; real delivery/receipt/escalation provider acceptance pending. |
| media | resources.test.ts, media-scanner.test.ts, media-ingest.test.ts, engine.integration.test.ts | Private storage/scanner boundaries executed and historical browser upload passed; real S3/scanner/provider operations and complete export/search leakage acceptance remain open. |
| payroll/payouts | resources.test.ts, engine.integration.test.ts | Synthetic payroll/partial payout/ACL executed; no real bank transfer, employee receipt or accountant legal approval claimed. |
| reporting/documents | resources.test.ts, engine.integration.test.ts | Actual CPU PDF/CSV/XLSX artifacts executed; historical browser download failed before scenario at login throttling; final browser rerun required. |
| bot-admin | governance.test.ts, identity.test.ts, commerce.test.ts, engine.integration.test.ts | Versioned configs/delegation/backend finance denial executed; full admin UX/AI denial path not accepted by backend tests alone. |
| web/pwa/widget/native | Document/source pointers; runtime acceptance separate | Historical browser 6 passed / 7 failed; native simulator/debug build passed. Current browser fixes and physical/release-signed mobile remain unverified. |
| privacy/ai | governance.test.ts, engine.integration.test.ts, gps-retention.test.ts | Historical privacy export/hold/GPS boundaries executed; new transactional CHAT/MEDIA erasure and in-flight retention need real current PG CI. External backups/processors are not erased by a live-source purge. |
| legal/policies | governance.test.ts, operations.test.ts | Software policy gates tested; company-specific legal advice/agreements/DPIA/tax/payroll/Betriebsrat approval not obtained. |
| security/resilience | identity.test.ts, engine.integration.test.ts, backup-target.test.ts, worker-retention.test.ts | Historical actual isolated encrypted backup/restore passed; restore transport CPU fixtures are not real PG restore. New erasure-aware restore reconciliation awaits current run. |
| domain/contracts | engine.integration.test.ts, commerce.test.ts, operations.test.ts, resources.test.ts | Historical typed commands/transaction/precision invariants executed; full canonical model and new handler contracts remain source reviewed, not all accepted. |
| acceptance/quality | Document/source pointers; runtime acceptance separate | 475 source acceptance criteria are tracked separately from 439 implementation test assertions; nine narrowly scoped criteria closed here. |
| delivery/documentation | Document/source pointers; runtime acceptance separate | Required project records exist; final SHA/deployment evidence and handover audit still pending. |
| infra/deployment | Document/source pointers; runtime acceptance separate | Historical hosted CI/local isolated runtime and native artifacts verified; current final CI and public staging acceptance are independent. |
| handover | Document/source pointers; runtime acceptance separate | Final per-module handover cannot be declared complete from the historical run or allocated cloud domain. |

## Candidate changes awaiting final CI

| Area | Current test pointers | What remains unverified |
|---|---|---|
| router | tests/whatsapp-router.test.ts | Authorized manual role/menu routing, bound invitations, canonical command effects and durable policy-checked replies. Current source only; historical run predates router. |
| calendar_atomic_catchup | tests/task-calendar.test.ts; tests/operations.test.ts:101; tests/engine-preconditions.integration.test.ts | Historical 27 pure planner assertions do not cover newly added actual Engine catchup/cursor transactions. New guards and worker wiring require current hosted CI. |
| assistant_tool_bridge | tests/assistant-tools.test.ts:135; tests/assistant-runtime.integration.test.ts; tests/engine-preconditions.integration.test.ts | Bounded server tools, human confirmation and source-bound private cache. CPU provider doubles are not live DeepSeek, model quality or actual SQL/provider acceptance. |
| privacy_erasure | tests/privacy-erasure.test.ts; tests/privacy-erasure.integration.test.ts; tests/worker-retention.test.ts | Current CHAT/MEDIA source/derivative erasure, exact revision permits, in-flight quiescence and fresh retry preview; current real PG execution pending. 92 pure-core and 2 storage-fencing local CPU cases passed, 19 PG skipped locally. External processor/backups and physical S3 deletion are separate pending evidence. |

## Updating this audit

`build_traceability.py` regenerates only the original NOT_RUN baseline; it must not overwrite an evidence-enriched matrix. Run `python docs/requirements/update_evidence_traceability.py` to reproduce these audited attachments and renderings using the checked-in historical index. To independently reconstruct that index from the verified historical artifact, pass `--hosted-unit-json PATH --hosted-live-json PATH`. The updater checks all 432/475 IDs and original source criteria fingerprints before and after enrichment.

A later CI source SHA needs a separately reviewed evidence mapping. Do not change this historical run's SHA/counts, reuse its passes for changed handlers, or mark external processor/backups deletion, legal approval, bank payouts or physical native checks complete from synthetic/local tests. Root-owned TEST_EVIDENCE.md, roadmap and handover carry later deployment evidence.
