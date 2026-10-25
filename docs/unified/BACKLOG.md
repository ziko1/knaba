# KnaBa — implementation backlog, 2026-10-24

Стани: `DOCUMENTED` — інвентар/документ є; `PENDING` — реалізація не прийнята; `BLOCKED_EXTERNAL` — потрібне власникове/provider підтвердження; `UNKNOWN` — не перевірено. Контракт для виконання в `docs/plans/2026-10-24-knaba-integration-handover.md`.

| ID | Priority | Залежність | Зміна, точний acceptance test | Стан |
|---|---|---|---|---|
| KN-U00 | P0 | — | Branch inventory, 10 PR, source SHA, збереження історії без злиття | DOCUMENTED |
| KN-U01 | P0 | U00 | Source-led ADR/monorepo boundaries, verify V4 AGENTS and canonical specs | PENDING |
| KN-U02 | P0 | U01 | Add site-to-ERP V1 event/inbox/outbox contract; check tenant/company/site isolation, signed transport | PENDING |
| KN-U03 | P0 | U01 | Contact owner from Assistant with real D1 message and owner inbox receipt; 0 ghost success | PENDING |
| KN-U04 | P0 | U03 | Human two-way chat with scoped capabilities; owner reply visible, no data leakage or replay | PENDING |
| KN-U05 | P0 | U03 | Operator notifications via configurable email with opt-in, outbox and delivery status; disabled when credentials missing | BLOCKED_EXTERNAL |
| KN-U06 | P1 | U04/U05 | WhatsApp Business Cloud API consent/template/token/verification; receive and send receipts, no bypass | BLOCKED_EXTERNAL |
| KN-U07 | P0 | U02 | Real D1 → ERP Postgres lead bridge with idempotent retry, scoped permissions, audit | PENDING |
| KN-U08 | P0 | U07 | Diff PR2/3 vs V4/deploy, port only missing domain behavior with tests; do not regress PR5/6 | PENDING |
| KN-U09 | P0 | U07 | Contractually correct role mapping; stable ID federation, invite/revocation, no email-only trust | PENDING |
| KN-U10 | P1 | U03/U09 | Owner/admin/worker/client dashboards, complete workflows and EN/DE/RU/UK copy and mobile states | PENDING |
| KN-U11 | P1 | U10 | PVUX91/A11Y keyboard, assistive tech, zoom, device viewport, E2E localization and link audits | PENDING |
| KN-U12 | P1 | U07 | GDPR privacy: approved retention, export/erase incl backups, cookie and AVV/transfer review | BLOCKED_EXTERNAL |
| KN-U13 | P1 | U10 | SEO verified copy/schema, official URL/hreflang/redirect strategy, field CWV and indexing after official release | BLOCKED_EXTERNAL |
| KN-U14 | P0 | U08/U10 | Integrated exact SHA verification: unit, actual PG/D1, browser, worker restart, load baseline, native/device; independent reviewer | PENDING |
| KN-U15 | P0 | U14 | Restore/offsite RPO/RTO rehearsal, security incident/rollback plan, keep existing data | PENDING |
| KN-U16 | P0 | U14/U15 | Client UAT, role accounts, invoices/contract, real owner response, company approvals and documentation | BLOCKED_EXTERNAL |
| KN-U17 | P0 | U16 | Explicit production approval -> staged release, watch p95/errors/backups, tested rollback, handover | BLOCKED_EXTERNAL |

Кожен acceptance має source SHA, artifact hash (де є), команду, expected/actual, дату, reviewer, PASS/FAIL/NOT_RUN і критерій відкату. У разі quota exhaustion ставити `BLOCKED_QUOTA`, не видавати мок за live PASS. Ідеї збирати в IDEA_INTAKE без переривання дозволеної активної роботи.

## Додатковий безпечний контроль, KN-U18
| KN-U18 | P0 | U00 | Fail-closed machine-readable release receipt and CLI; 11 mandatory gates, exact source SHA, artifact digest, evidence paths/digests, owner approval; negative test ensures unverified candidate always blocked | POLICY_CODE_TESTED (5 Node built-in unit PASS); RELEASE_BLOCKED_BY_DESIGN |

До повного G8–G10 readiness цей check повертає exit=1 навмисно. Шлях: `scripts/verify-release-readiness.mjs`; status `docs/unified/RELEASE_READINESS.json`. Позитивний structural test доводить лише правило парсингу, НЕ справжнє погодження або факт проходження browser/native/SQL/UAT.

## Реалізаційний прогрес KN-U03/KN-U04 (2026-10-24)
- KN-U03: `IMPLEMENTED_LOCAL_UNDEPLOYED` — діалог відвідувача/повідомлення в ізольованій SQLite-backed D1-імітації та реальному локальному Wrangler HTTP, token header, explicit consent, idempotency; реальний Sites edge/PII/UAT залишаються `NOT_RUN`.
- KN-U04: `IMPLEMENTED_LOCAL_UNDEPLOYED` — owner-only endpoints і вкладка owner Portal, replies і guest manual refresh; human-real-owner UAT, legal/retention, 50/80 pagination and archiving remain `PENDING`.
- KN-U05/U06: зовнішні email/WhatsApp delivery/receipts `BLOCKED_EXTERNAL`; не вдавати, що власник отримує push (доступна лише ручна перевірка inbox).
- KN-U07: D1→ERP PostgreSQL міст **НЕ реалізовано**; наступний самостійний P0 з окремими E2E SQL тестами.
- KN-U18 fail-closed release check обов'язковий незалежно від будь-яких локальних PASS.


## KN-VOICE-360 — 2026-10-25 scoped queue (feature branch)
- KN-V01: Safe DE/EN/RU/UK public role and intent router; local TDD tests passed; independent acceptance pending.
- KN-V02: Web Speech browser button, multilingual synthesis, localized UI, explicit microphone permission, owner chat anchor; local type/test/build passed before final site nav update; real device test pending.
- KN-V03: Localized assistant link on site header/mobile nav; candidate code, final check and responsive review pending.
- KN-V04: True browser WebRTC media gateway with session auth, STT/TTS budget fencing and human softphone; NOT_IMPLEMENTED, requires verified provider/consent.
- KN-V05: WhatsApp Business Calling/Messaging provider with eligible WABA, signed webhook, provider-aware VoIP handoff; BLOCKED_EXTERNAL credentials/quotas/pricing.
- KN-V06: D1→ERP outbox/inbox, HR/worker reports, CRM/quotes, scoped operator queue; NOT_IMPLEMENTED, requires ERP business contract and synthetic SQL acceptance.
- KN-V07: GDPR/§201 StGB legal/recording policy, company owner UAT, devices, field p95/CWV, disaster/rollback and explicit production release; BLOCKED_EXTERNAL/NOT_RUN.

## 2026-10-25 — Assistant 360 Telegram channel (source-only)
- **KN-U19 / P1**: private Telegram Bot API ingress with constant-time shared webhook header, safe update validation, duplicate/cross-company guard, atomic PostgreSQL inbox + outbox and guest-scoped handoff. New adapter/route/worker code is an unmerged Draft PR stacked on voice PR #38; no live activation.
- **KN-U20 / P1**: integrate actual authenticated worker and manager operator UAT, Telegram outbound outbox + callback receipts, approved BotFather account, GDPR retention and consent, bounded quota, real PostgreSQL replay and full Node24 QA. **PENDING / BLOCKED_EXTERNAL**. Telegram sender helper alone is disabled and no provider calls are authorized.
- Preserve existing KN-U06 WhatsApp scope and original ERP V4/V3 acceptance. Detail: `docs/plans/2026-10-25-knaba-assistant-360-telegram.md`.

## 2026-10-25 — Telegram continuation evidence

- `KN-U19` **IMPLEMENTED_SOURCE / SQL_TARGETED_QA_PASS / DEPLOY_NOT_RUN**: signed-by-secret private webhook (Telegram shared header), strict scoped normalization, durable Postgres inbox/worker/guest conversation; actual PostgreSQL 17.11 duplicate/cross-company smoke PASS on source `8d7f5530067ddead1164b26ff4cc7a45f65e6e04`. Final full acceptance still PENDING.
- `KN-U20` **IMPLEMENTED_SOURCE_PARTIAL**: one human-owned private outbound ticket per message, lease/restart fencing and states `BLOCKED/API_ACCEPTED/UNKNOWN`, mocked Bot API with current opt-in and revocation; 5/5 targeted PG tests PASS. **BLOCKED_EXTERNAL**: real operator enrollment, user-facing opt-in, live BotFather/test recipient, real delivery reconciliation, GDPR retention/export/deletion, independent reviewer and deploy.
- KNABA remains `RELEASE_BLOCKED`: broad Node24 no-PG Vitest has 6 environment failures due missing `openpyxl`; do not translate 1858 local passing cases into product acceptance. No release or billing activation.

## 2026-10-25 — verified Telegram/ERP QA progress

- **KN-U19 source candidate / QA PASS** at code SHA `7c79bca070c782c6a95a5c4e42b9776d9efd9991`: private signed-by-header Telegram ingress, dedupe, isolated guest/owner handoff. All 2300/2300 ERP tests PASS on genuine PostgreSQL17; source not deployed/accepted.
- **KN-U20 source candidate / QA PASS, external delivery BLOCKED**: authorized human replies stage one durable Telegram send ticket; source, consent/version, active identity and current membership gates; provider absence BLOCKED, unknown outcome UNKNOWN. No real Telegram Bot API send performed, no test recipient or company legal approval.
- **KN-U21 privacy opt-out / QA PASS**: private `STOP` and `/stop` revoke Telegram consent atomically, no unintended re-opt-in from `/start` and no message relay of STOP. Verified failing-before/fixed-after genuine PostgreSQL tests. Actual user-visible opt-in/retention policy and legal sign-off still outstanding.
- **QA-ENV-001 RESOLVED (isolated QA only)**: repeatable Node24 + Python/openpyxl/Pillow/pdftotext recipe; 68/68 resources cases and full 2300/2300 after adding missing QA-only tools. No new runtime dependency.
- **PERF-001 P1 pending**: Vite bundle minified 653.95 KB / gzip 207.75 KB and 4m54s Vite build. Profile actual cold mobile startup, interaction, CWV and chunk graph before code splitting; do not adjust warnings without measured improvement.
- **Release unchanged BLOCKED**: 5/5 release policy tests PASS; actual release gate exit 1 on source-bound checks. Independent security reviewer, real KNABA owner accounts, protected D1↔ERP reconciliation, company consent/GDPR, live provider/device and backup/rollback remain NOT_RUN/BLOCKED_EXTERNAL. Artifact SHA checks are development receipts, not customer acceptance.

## Security continuation — Telegram provider authentication and human takeover (25.10.2026)

- **SEC-TG-AUTH-001 — CODE + TARGETED SQL PASS:** Telegram ingress no longer imports existing KNABA `DIRECTOR`/client/worker principals by numeric `contact_identity` alone. A Telegram sender gets only a bounded `GUEST` principal and a separate private thread; unsafe prelinked identities fail closed rather than impersonating an employee. Genuine SQL red/green proof and full 2303/2303 regression at code SHA `683c09d0346fd05e0f2cd323da640bbb176c5c47`.
- **SEC-TG-OPERATOR-002 — CODE + TARGETED SQL PASS:** stage/send now requires current active human owner membership in the exact claimed conversation. A role plus stale `HUMAN_ACTIVE` owner_id is insufficient; revoked operator yields blocked delivery and zero provider calls. Targeted RED prior to fix, 10/10 Telegram SQL GREEN at code SHA above.
- **P1 future authenticated linking — NOT_RUN:** For KNABA employees, clients and owners, implement server-authorized one-time expiring identity challenge, tenant-scoped confirmation and MFA/consent as necessary. Do not treat Telegram contact identity or `/start` as portal/ERP login; do not bypass the guest-only model or expose payroll/GPS from bot prompts. Existing KNABA Studio source PR #64 and ERP PR #41 must be reconciled through an additive versioned event bridge after verified owner enrollment, never by blind merging.
- **Security/release gate — BLOCKED:** external code reviewer, actual BotFather/Meta credentials, permitted test recipients, GDPR/AVV and retention, independent restore, real owner and device/UAT, server-to-server site/ERP bridge and exact deployed-artifact attestation remain pending. These source fixes are not a product-release PASS.
