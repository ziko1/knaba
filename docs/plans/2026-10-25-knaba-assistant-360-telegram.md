# KNABA Assistant 360 — Telegram Channel Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) for tracking. No production deploy, paid provider activation, merge, or real user-data migration is authorized by this plan.

**Goal:** Safely add Telegram as an optional private messaging channel to existing KNABA DE, reusing the ERP inbox, outbox, contact scope, human-handoff and public Assistant 360 plan.

**Architecture:** The official Telegram Bot API `setWebhook` forwards HTTPS updates with a shared `X-Telegram-Bot-Api-Secret-Token` header. Ingress accepts only private user-to-bot updates, inserts a deduplicated record and a worker event in the existing PostgreSQL transaction, then the existing ERP worker stores a *guest-scoped* conversation. Outbound sending is independently disabled and additionally requires a verified private recipient, opt-in and explicit recipient allowlist; this plan does not create a second CRM or database.

**Tech Stack:** Existing KNABA V4 TypeScript/Node 24, Nest/Express, PostgreSQL, worker, canonical identity/command engine. No new production dependency. The standalone module and inbox tests use Node built-in `node:test`.

## Global constraints

- Parent: [KNABA Assistant 360 voice plan](2026-10-25-knaba-assistant-360-voice.md), source candidate Draft PR #38. Preserve the authoritative `erp/AGENTS.md`, ERP V4 target, original V3 acceptance and unified memory/roadmap. Do not substitute this Telegram plan for them.
- Separate source candidate from the *currently deployed* branded VPS website PR #36/#37. This work is not deployed and must be reconciled with the live site/CRM and earlier integration PR #12.
- Server-configured company ID is authoritative. A Telegram `from.id` establishes only a channel identifier, NOT worker identity, customer ownership, tenant membership, prices, payroll or a GPS permission.
- Secret header verifies possession of a private `setWebhook` secret; it is not an HMAC body signature. Use HTTPS, a high-entropy random secret and a single verified KNABA-controlled bot. Never put Bot tokens or secret values in GitHub, browser, logs, or AI context.
- `webhook_inbox(provider,event_id)` is authoritative ingress; database + outbox event commit together. `accepted:true` means an inbox receipt, *not* Telegram message delivery or human/AI response.
- Human operator response, Bot API outbound, Telegram account linking, media downloads, voice transcription and real phone calls are disabled until separately accepted. All monetary/authorization/ERP commands require existing server permissions.
- Provider balances, data processing approval, KNABA bot ownership, number of allowed real recipients and GDPR retention are UNKNOWN. Authorized new external spending EUR 0.

---

## Task 1 — Private webhook boundary and inbox

**Files:** `erp/packages/integrations/telegram.ts`, `erp/apps/api/telegram-ingress.ts`, `erp/apps/api/main.ts`, `erp/tests/telegram.boundary.node-cases.ts`, `erp/tests/telegram.ingress.node-cases.ts`.

**Interfaces:**
- Consumes: `X-Telegram-Bot-Api-Secret-Token`, canonical raw HTTPS JSON bytes and server-scoped `COMPANY_ID`.
- Produces: `acceptTelegramWebhook(db,companyId,bytes,header,secret)` and on a new private event `webhook_inbox` + `telegram.inbound`.

- [x] Step 1: Negative focused tests for invalid/missing secret, bad update/JSON, non-private chats, identity mismatch, oversize body, duplicate/collision and DB outage.
- [x] Step 2: Implement strict private parser, 64-KiB route body limit, constant-time header comparison, bounded fields, receipt only after transactional database insert.
- [x] Step 3: Exact replay produces no second outbox event; changed replay rejects; no signed provider proof or media fetching is claimed.
- [x] Step 4: Local isolated Node 22 experimental TypeScript strip tests: `node --experimental-strip-types --test erp/tests/telegram.*.node-cases.ts` — 14/14 PASS in this development session (unsupported project engine; does not count as Node 24 full suite).
- [ ] Step 5: Run full `cd erp && npm ci && npm run typecheck && npm test` on Node 24 from this exact branch, then real PostgreSQL rollback/replay tests, review raw request response and verified webhook route.

## Task 2 — Scoped worker reception / human queue

**Files:** `erp/apps/worker/runner.ts` (new `telegram.inbound` case only), existing V4 worker/Engine unchanged.

**Interfaces:** Consumes `telegram.inbound` with matching `webhook_inbox` record. Produces one `conversation_input` and private channel, authenticated Engine `message.send` receipt (text) or manual-review flag (voice/media/callback).

- [x] Step 1: Add company/event/source assertions and reuse canonical DB transaction + lease-bound Engine command.
- [x] Step 2: Create a guest with no verified KNABA customer membership; preserve a distinct Telegram-sourced channel so unrelated web/WhatsApp discussions are not implicitly linked.
- [x] Step 3: Mark attachments/voice/callback for manual review; callback text cannot execute ERP commands. A new private thread enters the protected human queue.
- [ ] Step 4: Run integration with actual PostgreSQL/worker restart, assert 1 user/channel/message per replay, race/revocation/cross-company isolation, operator inbox, no accidental AI or outbound sends. Source-only logic is NOT certified end-to-end.

## Task 3 — Outbound Telegram policy (disabled by default)

**Files:** `erp/packages/integrations/telegram.ts`, separate `TelegramBotAdapter.sendText` and unit boundary fixtures.

**Interfaces:** Consumes approved runtime Bot token, allowlisted private chat ID, explicit `consent`, `verifiedPrivateRecipient`, `optedOut` policy. Produces only an `API_ACCEPTED` receipt for a synthetically successful Bot API response, NOT a delivery/read confirmation.

- [x] Step 1: Reject unenabled service, missing consent, unverified recipient, opt-out, foreign chat, invalid input without provider request.
- [x] Step 2: Bound HTTPS request and result schema; unknown timeout is `PROVIDER_OUTCOME_UNKNOWN`, never assumed delivered, and never blindly retried.
- [ ] Step 3: Implement server-backed delivery preferences, durable outbox reconciliation, revocation, quotas and operator reply UI before any production outbound. A standalone adapter alone does NOT activate sending.

## Task 4 — KNABA provider, legal and integration acceptance

**Files:** Canonical ERP external prerequisites, unified release receipts, retained KNABA CMS/CRM integration contract.

- [ ] Verify a KNABA-controlled Telegram bot in BotFather; generate and store a random secret and Bot token only in the chosen runtime secret manager.
- [ ] Verify `setWebhook` HTTPS domain and explicitly allowed update types (`message`, `callback_query`), with Bot API `getWebhookInfo` and a *permitted* real recipient; no real activation until data/privacy approval.
- [ ] Reconcile legacy D1/VPS data, operator account, recipient membership linking (explicit identity challenge and expiry), retention/DSAR and GDPR DPA/AVV.
- [ ] E2E: client Telegram text -> exactly one authorized guest conversation -> real owner claim/reply -> confirmed Telegram receipt; real media/calls have separate acceptance and data approval.
- [ ] Reconcile branch with the actual VPS website and existing WhatsApp source, independently review security and full regression at exact source SHA, test backup/restore and only then request separate release permission.

## Evidence and current limits

New code path is a **source-only implementation candidate**, not a live bot. Local 14 Node built-in security/ingress cases passed under Node 22, while mandatory project Node 24 typecheck, Vitest, actual PostgreSQL, full worker E2E, operator/physical device, live provider, voice and official release are **NOT_RUN / BLOCKED_EXTERNAL**. Outbound is not configured in the worker; enabling a token alone must not create a send. PR remains Draft; no website or other project deployed or changed.

**External documentation:** [Telegram Bot API](https://core.telegram.org/bots/api), `setWebhook(secret_token)` and `sendMessage`.

**Rollback:** Do not configure the webhook secret / setWebhook while unapproved. On an accepted future release, disable delivery before provider switch; preserve inbound/outbox entries and revert source routing without destructive DB migration.
