# KNABA Studio Pro — Implementation Plan

> **For agentic workers:** Perform each deliverable with focused RED/GREEN tests, independent review and source-pinned release evidence.

**Goal:** Extend KNABA's existing owner-only Site Studio with practical visual and structured manual editing, immediate private preview, page discovery, a safe bundled media picker and AI readiness — without disrupting the existing public site, CRM or assistant.

**Architecture:** Reuse the existing Solid Studio, Worker authenticated owner APIs, D1/SQLite versioned drafts, and parse5 server-side published renderer. Define allowlisted presentation mutations in the same StudioEntry schema; restore preview state deterministically before applying each draft snapshot. Keep paid AI suggestions optional and provider-authorization gated; keep database, customer data and official-domain cutover unchanged.

**Tech Stack:** Astro 7, SolidJS, TypeScript, Node 24, parse5, SQLite/D1 Worker adapter, Vitest + Node tests, Playwright Chromium; no new package dependencies.

## Global Constraints
- Base live development SHA `77c2a96a870d1ba0e5a0bf766dee1aca541ada8a`; Studio executable source SHA `24dd7fc826ff50c3fab9273ce9e654fbee2095b6`.
- Never write a live owner/CRM/customer record in tests. Existing owner-only identity, CSRF/origin, optimistic revisions and explicit PUBLISH remain mandatory.
- No arbitrary HTML, JavaScript, CSS, remote image uploads, service prices, legal/policy or business-logic editing. Never infer rights to edit owner data by selecting a DOM node.
- No paid provider calls until server-secret authorization, a fresh actual quota check, privacy assessment and spending cap.
- Developer VPS `kneba.vsp.rest` is not the official `knaba.de`. Do not merge main or cut over official DNS without separate customer acceptance.
- Existing VPS is ~96% full with `/readyz=503`. A source build or mocked owner is not proof of full live-device readiness.

---

### Task 1 — Bounded safe design tokens (implemented; GREEN)
**Files:** `src/lib/site-studio-contract.ts`, `vps/render-page.mjs`; tests: `tests/site-studio-contract.test.ts`, `vps/render-page-design.test.mjs`.

**Interfaces:** `StudioEntry {selector,kind,value}` gains `background`, `padding`, `fontSize`; preserve existing `text/href/src/alt/color`.
- [x] RED: valid section background + padding + headline font size initially rejected; style combination missing in source renderer.
- [x] GREEN: only HEX colors and numeric design-system presets, bounded selectors and allowed tags; reject CSS expressions, HTML, forbidden tags, oversized values.
- [x] Existing style declarations preserved; multiple edits to one node yield one escaped style patch without destroying Astro client hydration.
- [x] Focused Vitest and Node SSR tests PASS at code SHA pinned above.

### Task 2 — Visual/manual editor and reliable live preview (implemented; GREEN)
**Files:** `src/components/SiteStudio.tsx`, `src/scripts/site-studio-live.ts`, `src/lib/studio-pages.ts`, `src/styles/site-studio.css`, `tests/studio-pages.test.ts`, `tests/vps-browser-e2e.cjs`.

**Interfaces:** Authenticated Studio page picker exposes 68 actual current public routes. The manual panel accepts validated `StudioEntry[]` JSON only and has separate explicit Apply → Save draft → Confirm PUBLISH states; postMessage checked for exact same-origin frame/window.
- [x] RED: static picker had 10 routes, undo left transient content in preview, icon-bearing CTA links weren't selectable.
- [x] GREEN: 68 public routes, click-to-select text/link/image or parent section, responsive style controls, visual + manual modes and undo baseline replay.
- [x] Manual invalid JSON, scripts and disallowed selectors are rejected without changing preview or publishing.
- [x] Isolated HTTPS Chromium synthetic owner: first-party cookie, editor, undo, manual JSON, public SSR SEO/body, 320/390/768 overflow and no JS exceptions PASS.

### Task 3 — Safe AI readiness and bundled media inventory (implemented; GREEN)
**Files:** `worker/studio.ts`, `tests/studio-api.test.ts`, `src/lib/studio-media.ts`, `src/pages/studio-media.json.ts`, `tests/studio-media.test.ts`, plus existing Studio UI.
- [x] RED: anonymous/admin AI readiness denial not implemented; no safe curated public image inventory.
- [x] GREEN: GET `/api/studio/ai-status` owner-only, returns readiness flags but never keys or actual balances. Existing `POST /assist` returns only a reviewable text suggestion, saves/publishes nothing.
- [x] Public static media JSON contains only validated bundled image paths; Studio can choose existing local image files and preview them.
- [ ] Actual paid AI provider activation and real billed-call evidence require verified key, quota, price cap, owner/provider permissions; none were used.

### Task 4 — Release and customer handover (staging/acceptance gated)
**Files:** `PROJECT_MEMORY.md`, `ROADMAP.md`, `vps/BACKLOG.md`, `docs/evidence/studio-pro-20261025.json`.
- [x] Exact integration/source SHA verified against GitHub; Node24 Astro/Vue/Svelte checks 0 errors/warnings, 137 Vitest, 8 inquiry, 16 VPS tests, 99-page build/static verification PASS.
- [x] Isolated Chromium passes authenticated synthetic owner and draft → publish → SSR. This doesn't establish real live owner or screen-reader/device UAT.
- [ ] Independent security/product review and full 320/390/768 + keyboard/screen-reader/200%-zoom owner UAT.
- [ ] Review 96%-used VPS storage budget; backup & restore rehearsal; verify current active release SHA and immutable rollback before any dev-host code deployment. Do not silently override `cutoverAllowed:false`.
- [ ] Provision correct genuine KNABA owner only after verified email/authorization and private passphrase via protected stdin; /readyz=200 plus real Studio/CRM login UAT.
- [ ] Official `knaba.de` DNS cutover, GDPR sign-off, data reconciliation and full handover remain separate decisions.

## Still-open product decisions
- Shared header/footer/menu and legal/global changes need company permission, cross-page component contracts and independent review.
- Arbitrary section composition/drag-and-drop, audited media uploads and full HTML/CSS source editing need explicit XSS/CSP/schema/rollback contracts, not an unbounded preview API.
- AI provider selection, data/transfer authorization, fresh quota, prices and the maximum billing cap need owner approval.
- Owner username/email and secret are not inferred from public business contact information.
