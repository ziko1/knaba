# KnaBa Unified Integration & Customer Handover Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Об'єднати KnaBa public site, owner communications, role portal і KNABA DE V4 ERP у перевірений, безпечний продукт із доведеною готовністю до передачі замовнику.

**Architecture:** Тимчасово зберегти `corporate-site/` (Astro/Solid/Worker/D1) і ERP `apps/` + `packages/` (Node/NestJS/PostgreSQL/worker) як окремі deployables. Об'єднати bounded authenticated versioned event bridge, server-side identity/role mapping, shared audit, owner inbox. Не переписувати існуючі схеми чи весь стек заради однакових технологій.

**Tech Stack:** Astro 7, TypeScript 5.9, SolidJS, Vue/Svelte лише в уже існуючих island, D1/SQLite, Worker, Node 24 + PostgreSQL 17 (ERP), Vitest/Playwright, Android/iOS на наявній базі.

## Global Constraints
- Ніяких merge, production deploy, платних активацій, прямої зміни реальних даних без explicit approval. Зберегти ERP `AGENTS.md`, `KNABA_DE_TARGET_SPEC.md`, `PROJECT_MEMORY.md` та історичні тест receipts.
- Backend deny-by-default company/site/customer scopes, owner-only approval, stable identity, mutation CSRF/origin validation, role revocation, SQL parameters. Money integer cents, UTC storage; AI не визначає гроші/доступи.
- Current `/api/leads` contract і `/api/portal/*` не ламати. Public assistant без акаунта не має доступу до private ERP. Pending chat/WhatsApp/AI не позначати PASS.
- Усі тести на exact SHA; document docs-only commits separately. Fresh quota before paid provider. Кожен task — незалежне review і evidence.

---

### Task 1: Canonical branch + contract reconciliation
**Files:**
- Existing read: `KNABA_DE_TARGET_SPEC.md`, `AGENTS.md` (V4 deploy branch), `corporate-site/PROJECT_MEMORY.md`, `corporate-site/ROADMAP.md`
- Create/revise: `docs/unified/BRANCH_AUDIT_2026-10-24.md`, `docs/unified/INTEGRATION_CONTRACT.md`, `docs/unified/PROJECT_MEMORY.md`
- Proposed test: `scripts/verify-knaba-lineage.mjs`

**Interfaces:** Consumes actual git tree/PR chain + existing `/api/leads` / V4 command shapes; produces approved ADR, source/dependency map, conflict table.
- [ ] **Step 1: Add failing check.** Parse machine-readable branch manifest with each of 14 names and HEADs; assert every source ref resolves, V4 AGENTS exists in source, corporate assistant descends from RU. Fail on stale/unknown refs.
- [ ] **Step 2: Verify failure.** Run `node scripts/verify-knaba-lineage.mjs`; expected nonzero if manifest missing or head does not match.
- [ ] **Step 3: Implement.** Commit manifest and exact-read GitHub comparison receipts; classify PR #2/#3 vs #4 and deploy path, preserve separate memories; unresolved semantic differences recorded as an ADR.
- [ ] **Step 4: Focused pass.** Same command prints individual matches and zero status; **only** with fresh GitHub compare evidence.
- [ ] **Step 5: Integration gate.** Review `git diff --check`, verify no code/secret/binary touched. Review by a different agent/person.
- [ ] **Step 6: Commit.** `git add docs/unified scripts/verify-knaba-lineage.mjs && git commit -m 'docs: reconcile KnaBa lineage and contracts'`.

### Task 2: Public Assistant → owner conversation
**Files:**
- Existing modify: `corporate-site/worker/index.ts`, `worker/api.ts`, `src/components/PublicAssistant.tsx`, `src/components/Portal.tsx`
- Proposed create: `corporate-site/worker/assistant-threads.ts`, `corporate-site/db/schema.ts` additions, `corporate-site/drizzle/0001_assistant_threads.sql`, `corporate-site/src/lib/assistant-thread-contract.ts`
- Proposed test: `corporate-site/tests/assistant-threads.test.ts`

**Interfaces:** Consumes current same-Origin mutation guard, D1 DB, verified owner session, public locale; produces POST thread, GET thread with capability, POST visitor reply, owner GET/list/reply, bounded pagination and immutable audit.
- [ ] **Step 1: Failing tests.** Anonymous create with explicit consent, message idempotent replay, rejected changed-key payload; owner can reply; visitor with correct secret reads only own thread; token from another thread/expired returns 404; worker/client/anonymous denied owner read; cross-origin/oversized/invalid JSON rejected; concurrent duplicate produces one message.
- [ ] **Step 2: Verify failure.** `cd corporate-site && npm test -- --run tests/assistant-threads.test.ts` using a compatible pinned Node runtime; test must fail for missing endpoints.
- [ ] **Step 3: Implement.** D1 migration to separate threads/messages with hashed CSPRNG capability, no bearer in URL/log; never copy local FAQ dialogue without consent. Owner role revalidated each call; owner response committed with idempotency+audit. Display manual retry/reconnect; disable send on uncertain submit until idempotency readback; localizations DE/RU/EN/UK.
- [ ] **Step 4: Focused pass.** Same test now passes including real D1/local SQL, not only mocked store.
- [ ] **Step 5: Integration.** `npm run check && npm test && npm run build && npm run verify:build`; browser screenshots/functional reply; 320px/200% zoom/keyboard; cloud/dev preview only (no production deployment).
- [ ] **Step 6: Commit.** Stage exact edited source/tests/migration and source-bound evidence; separate schema migration rollback policy.

### Task 3: D1 → ERP durable lead intake
**Files:**
- Existing: `corporate-site/worker/api.ts`, `apps/api/v4-rest.ts`, `apps/api/engine.ts`, `apps/worker/runner.ts` on V4 candidate
- Proposed create: `corporate-site/worker/erp-outbox.ts`, `corporate-site/db/0002_erp_outbox.sql`, `apps/api/lead-intake.ts`, `tests/lead-intake.integration.test.ts`

**Interfaces:** consumes immutable D1 lead receipt; emits `KNABA_LEAD_V1` signed server event; ERP server maps trusted tenant/company/site and atomically commits PostgreSQL inbox+lead+audit.
- [ ] **Step 1:** Test duplicate same event→one lead and same ACK, forged signature→401, tenant mismatch→403/404, changed payload for same ID→409, provider timeout→safe replay, D1 write but ERP down→pending outbox.
- [ ] **Step 2:** Run focused real D1/PG tests before implementation; expect missing route/schema failure (not harness failure).
- [ ] **Step 3:** Implement versioned outbox with HMAC verified raw bytes, timestamp skew bound, strict allowlist and server-configured target, bounded retries and quarantine; never expose secret browser-side.
- [ ] **Step 4:** Repeat focused tests on real PostgreSQL 17 and local D1, assert exactly-once *effect* even under retry and same request ID.
- [ ] **Step 5:** Run affected ERP unit/integration/browsers and site tests at single SHA; compare invoices/money/worker rights unchanged; record performance p95 baseline only from measurements.
- [ ] **Step 6:** Commit separate source + migration with non-destructive rollback.

### Task 4: ERP V3/V4 feature reconciliation and portal identity
**Files:**
- Existing read/compare: PR #2/#3 modified domain/tests; V4 `apps/api/auth.ts`, `apps/api/engine.ts`, `packages/domain/`; `corporate-site/worker/api.ts`, `src/lib/portal-contract.ts`.
- Proposed tests: `tests/unified-identity.integration.test.ts`, `tests/erp-regression.integration.test.ts`

**Interfaces:** stable subject provider ID, company/site membership, role revocation; ERP is authoritative order/workflow owner.
- [ ] **Step 1:** Case inventory: each behavior unique to #2/#3 explicitly accepted/rejected by V4; tests for simultaneous logins, revoked worker, wrong tenant, expired lease and accountant export purpose/site scope.
- [ ] **Step 2:** Run mapped tests on V4 candidate before port; save observed failures and actual versions.
- [ ] **Step 3:** Port minimal missing behaviors; consolidate duplicate responsive fixes without copying alternative framework implementation; enforce purpose-based permissions server-side.
- [ ] **Step 4:** Run actual PostgreSQL suite, browser and worker restart; exact receipts.
- [ ] **Step 5:** Independent accounting/security/source review, regression mapping 72 V4/475 V3 separately.
- [ ] **Step 6:** Commit only passing scoped changes in integration candidate.

### Task 5: Email/WhatsApp and optional AI
**Files:**
- Existing: `apps/worker/runner.ts`, corporate worker event module (Task 2)
- Proposed: `packages/integrations/knaba-owner-notifications.ts`, `corporate-site/worker/assistant-provider.ts`, notification provider contract tests.

**Interfaces:** committed owner events into durable outbox; opt-in per channel, dispatch receipts, provider budgets, human takeover; no async processing claim until enabled and observed.
- [ ] **Step 1:** Failing fake-transport tests: dedup, invalid provider creds disabled, opt-out, rate limit, retries, unknown delivery, no charge without reserved budget.
- [ ] **Step 2:** Run and record failing targeted test; no real send.
- [ ] **Step 3:** Implement provider adapters behind disabled-by-default gates. Require owner-confirmed credentials, legal opt-in, valid WhatsApp template and measured tariff before test/live sending; AI must cite verified site facts and defer negotiating binding prices to human.
- [ ] **Step 4:** Fake transport tests pass, credential redaction and auth checks pass.
- [ ] **Step 5:** After explicit owner approval, test one real staged message/receipt and provider billing; until then mark BLOCKED_EXTERNAL, not PASS.
- [ ] **Step 6:** Commit isolated source with no secret in git.

### Task 6: Product acceptance and customer handover
**Files:**
- Create: `docs/unified/HANDOVER_CHECKLIST.md`, `docs/unified/RELEASE_RECEIPT.json` after verified runs
- Existing: `docs/EXTERNAL_PREREQUISITES.md`, site legal audit, V4 acceptance ledger.

**Interfaces:** inputs exact integrated source SHA, env artifact hashes and migration state; produces independently reviewed release packet and explicit approval gate.
- [ ] **Step 1:** Define failing acceptance: broken request, wrong role, refused owner reply, stale bot provider, offline worker, backfill, audit/erasure, D1/Postgres mismatch, absent legal approval → release blocked.
- [ ] **Step 2:** Run full requirements matrix against staging and actual devices; failing/missing/blocked remains NOT_READY.
- [ ] **Step 3:** Prepare backups, documented rollback and threat model, build signed release artifacts, user training and admin manual. No fake credentials.
- [ ] **Step 4:** Verify restore in isolated env and owner real UAT (lead→response→job→invoice), browser a11y and p95/CWV thresholds approved after baseline.
- [ ] **Step 5:** Independent security/QA/product review with exact SHA/artifact/date/signatures; fix/retest issues to closure.
- [ ] **Step 6:** Explicit customer acceptance and separate production deploy approval are required before any promotion.

## Externally visible decisions awaiting owner
Official domain/cutover and company/legal owner sign-off; hosting data processing/retention and actual provider contracts; operator notification channel/WhatsApp Business registration and API credentials; billing and consent; client identity migration/invites; app signing and live-provider/device UAT. These are **gates**, not implicit permission to spend or deploy.

## Execution status
This plan is saved on an unmerged integration candidate branch. Plan-writing itself does not fulfill Tasks 2–6. Exact source, test, deployment and acceptance evidence must be updated per completed increment.
