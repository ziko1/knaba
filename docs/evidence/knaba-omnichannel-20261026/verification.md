# KNABA Omnichannel Bots — evidence & release gates (26.10.2026)

**TESTED_SOURCE_COMMIT:** `8e36c07584ec98ce39de3a09c49b2ca3765c5eb2`
**ERP_GIT_TREE:** `9b7c03ee57695a3b2bd1ff9f4c819a820f72ded5`
**CORPORATE_SITE_GIT_TREE:** `4b60d0db5595f71ba2e73f2b0e67f30835363ff4`
**Historical import ancestor:** `66b07fb46d23c7110473c51fc23ce58d3c40a1b1` (not rebased / not advanced).
Isolated **existing VPS** worktree: `/tmp/knaba-omnichannel-20261026`; source checked out directly from GitHub branch, detached from production and other working trees. Node.js 24.22.1 public npm binary. Preview-only site deployment: **NONE**. No provider calls.

| Check | Status & evidence | Coverage limitation |
|---|---|---|
| `cd erp && npm run typecheck` | **PASS** | No real ERP/Postgres auth |
| `cd erp && npx vitest run tests/whatsapp-router.test.ts tests/bot-module-catalog.test.ts tests/telegram-public-navigation.test.ts` | **87 passed / 0 failed**; includes 62 WhatsApp-router, 19 Telegram intent and 6 catalog cases | No real Meta/Telegram delivery; owner DRAFT confirmation in real DB NOT_RUN |
| `cd erp && npm test` | **1889 passed, 2 failed, 439 skipped / 2330** | 1 failure `spawnSync pdftotext ENOENT`: Poppler binary missing on current VPS. 1 failure `tests/resources.test.ts` photo XLSX: expected embedded image 1, got 0; needs isolated root-cause, not marked PASS. Skips include PostgreSQL integration. Python `openpyxl==3.1.5` was installed only in temporary `/tmp/knaba-omnichannel-pyqa-20261026` virtualenv; four prior missing-openpyxl failures then passed |
| `cd corporate-site && npm run check` | **PASS** | No mobile/assistive-tech physical test |
| `cd corporate-site && npm test` | **PASS**: 269 Vitest plus 32+27+9 Node native tests = **337 passed** | No live Cloudflare/owner session |
| `cd corporate-site && npm run build` (default/noindex preview) | **PASS** | Sitemap intentionally zero URLs in unreleased/noindex mode |
| `cd corporate-site && KNABA_RELEASE_MODE=vsp npm run build && npm run verify:build` | **PASS**: 100 sitemap URLs, 28 DE routes, 1001 localization units, 4 published/95 pending languages, 8 home/catalogue routes; test-only artifact SHA256 `c18d823131aa3ce917c918fc4931717c48207a2e5b0ec09e346c3c0b932529ac` | TEST BUILD ONLY, not deployed or production field measurements. Baseline without `vsp` predictably raises `SITEMAP_EMPTY`; not a live defect |
| `cd corporate-site && npx vitest run tests/messenger-links.test.ts` | **13 passed / 0 failed** | Links intentionally hidden until verified official provider numbers/username configured |
| root `npm test` | **25 passed / 0 failed** | Integration product launch gate separate |
| root `npm run audit:source` after unshallow clone | **PASS**, exact git commit `8e36c...`, 0 uncommitted; original ERP/site import trees preserved as historical baseline | Source provenance is NOT runtime readiness; the first shallow clone run failed because original import anchor was not fetched. Reran successfully with full historical Git objects |

### Critical remaining gates — do not claim product complete
- No canonical D1 ↔ PostgreSQL cross-runtime bridge/release; no owner+worker real registration and approval flow accepted.
- No WhatsApp Cloud API verified WABA sender, BotFather outbound credentials/consents, legal/privacy provider gate, real delivery receipts, AI service, WebRTC Calling or SIP/PSTN; none activated here.
- Native owner rule creation via real Postgres was not exercised; unit test verified preview/no-side-effect/revocation only. Activation still explicitly requires separate canonical preview/authorization.
- ERP full suite has 2 red tests; source release blocker until environment and embedded-photo regression separately resolved.
- 439 skipped SQL integration tests; real browser, multi-tenant negative DB tests, real mobile browser/microphone tests and independent review/UAT NOT_RUN.
- No committed code or source provenance was overwritten, no main merge, no release production, no migration, no database access; provider prices/balances UNKNOWN.

**Verdict: DRAFT_SOURCE_READY_FOR_REVIEW; INTEGRATED_CUSTOMER_DELIVERY_NOT_READY.**
Route follow-up: `docs/plans/2026-10-26-knaba-omnichannel-assistant-360.md`, canonical KN-U20 backlog.
