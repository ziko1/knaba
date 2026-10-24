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
