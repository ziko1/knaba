# KNABA — inline owner/customer login on current FAQ / Studio Pro baseline

**Date:** 2026-10-25. **Project:** KNABA (separate from AVENQO).
**Source base:** `7f886606d5711ac93a88d3d93b54a0a9b5638525` (103 public static HTML, four-language FAQ, corrected footer).
**Tested executable code commit:** `eeb015461be87e91fc6129fd3f5d5d90b43e47b3`.
**Additional test-only commits ending at:** `4a31a86f41ba677158969cf223f65070b559029e` (GitHub compare: only `tests/vps-browser-e2e.cjs` after executable code SHA).

## Implemented (8 changed source/test paths)
- First-party customer/owner inline account sign-in on `/konto/` with DE/EN/UK/RU localized labels, in-place session refresh, generic errors, no fake open-registration guarantee. Legacy `/login/` HTML form remains available.
- VPS `POST /login/` recognizes `Accept: application/json` and returns 200 or generic 401 JSON using the existing `createLogin` contract: salted password verification, preexisting rate limiting, origin/Sec-Fetch-Site/Host guard, bounded form sizes, HttpOnly session cookie. Old HTML POST redirects unchanged.
- Shared header gets a visible account CTA and mobile-menu access request; subtle VSP Studio credit in footer; preserve actual EN/UK translated FAQ/footer labels from live 7f release.
- Reuse PR #52's Studio SEO editor copy clarifying draft/PUBLISH boundary and the inability to create arbitrary new routes. Existing SEO/source VSP index **approval gate retained**: no blanket index unlock in this branch.
- Added malicious-Origin / cross-site JSON POST regression tests, plus synthetic HTTPS Playwright browser tests for invalid and successful inline login, signed cookie, no full-document reload and existing Studio Pro edit/publish/restore.

## QA evidence and limits
- Tested code exact SHA `eeb015461be87e91fc6129fd3f5d5d90b43e47b3`: isolated Docker Node24 with reused pinned dependencies and no external network; `npm run check && npm test && npm run build && npm run verify:build && node --test vps/*.test.mjs` **exit 0**, **23 Vitest test files** PASS; built **103 HTML** pages (source build mode VSP, `KNABA_VSP_INDEX_APPROVED=0`). Dist/client 160 files, 2,661,229 B, deterministic path+content tree SHA256 `948c9386fd535866213a59637272e7245672a7e864edb88798d6e0087701617e`.
- Isolated test-only SHA `4a31a86f41ba677158969cf223f65070b559029e`: fresh 103-page build/verification PASS; offline Chromium at 390×844 with synthetic `knaba.test` self-signed ephemeral TLS certificate and isolated SQLite test owner. Invalid credentials do not create session; valid login produces real owner role, HttpOnly Secure `__Host-` cookie and private portal; browser's window document survives; existing Studio Pro SSR published metadata and content, undo, link selection, 0 JS page errors retained. **No real user data touched**; synthetic test cert and SQLite deleted.
- Early browser attempts blocked by disposable TLS fixture filesystem permissions, later resolved. Test erroneously waited for a mobile-hidden badge and counted same-document Astro navigation events as reload; corrected to verify actual owner session, visible private shell, and preservation of a window-scoped document marker.
- Scope pinned by GitHub compare to exactly eight changed app/test paths; no `drizzle/`, paid AI/email/WhatsApp, passwords, OAuth client, billing, cross-tenant or production database modifications. External provider budget EUR0; actual runtime costs/quotas remain unknown.

## Concurrent live release blocker
- The actual `kneba.vsp.rest` dev server **moved concurrently** to `/srv/knaba/vps/releases/7e774c32863ad6b9f90a95288b5bd3495d941a51`. This release is healthy and serves public HTML with `index, follow` and sitemap; private routes remain noindex and sensitive anonymous APIs 401. The active `vps/server.mjs` does **not** include `const jsonLogin=`. GitHub exact-commit fetch for active release ID returned 404; selected local worktrees did not identify a corresponding commit.
- This branch starts from earlier reproducible GitHub `7f886...` and **MUST NOT** overwrite the currently deployed 7e... release. Runtime provenance and index approval must be reconciled first; tracked separately in [Issue #54](https://github.com/ziko1/knaba/issues/54).
- Full source merge/rebase onto the verified live source (or an explicitly approved release branch), rebuild & re-test on exact final SHA, online SQLite backup/integrity, Compose/TLS/robots audit, code-only rollback and independent review before any dev deployment.

## Open acceptance
Real authenticated owner/staff/customer UAT, owner identity provisioned via protected private stdin, email/Google OAuth/social login (not implemented), user data export from prior Sites/D1, physical Android/iOS, accessibility/screen reader, full GDPR/legal approval, external backups, source-controlled production release, p95/field CWV and final customer handover **NOT_READY**. No merge to `main`, official `knaba.de` cutover, DNS mutation or paid provider activation performed.

## Subsequent P0 private HEAD/noindex parity fix — 2026-10-25
- **RED on actual current development host:** `HEAD /login/` returned HTTP405 with no `X-Robots-Tag`; `GET /login/` returned HTTP200 and `noindex,nofollow`. The same source handler existed for `/logout/`. Other private routes continued to return `noindex`.
- The source changes now handle both GET and HEAD for `/login/` and `/logout/`, retaining the original noindex headers and without processing credentials or performing logout as a side effect. No live VPS code was modified.
- **Newest executable code commit:** `0bf7b0d0b539ab2931be880df78fb165a3331c89`; following test-only commit `a15323ff1ca7322ab67b01143150c84da895dbb6` adds HEAD200/noindex/empty-body regression for both private routes. GitHub compare confirms test-only delta. Old code SHA `eeb015...` above is a historical earlier checkpoint, not this package's final executable identity.
- **Fresh exact-source QA on a153 test commit:** isolated Node24 check, all 23 Vitest test files, inquiry Node, 103 HTML build+verify, VPS Node test suite **exit 0**; sandboxed real Chromium synthetic-HTTPS login and Studio edit/publish/undo **PASS**, no external network or real user data. Static `dist/client` tree digest unchanged `948c9386fd535866213a59637272e7245672a7e864edb88798d6e0087701617e` (160 files, 2,661,229 bytes), since the fix is only in the Node server.
- **Live release still blocked:** current public release `7e774c32863ad6b9f90a95288b5bd3495d941a51` source ancestry unresolved, contains older Node login handler. No regression claim for live until code-only replay on reconciled source; Issue #54.
- Operational readonly scan: /tmp ~14GiB, Docker ~17GiB, KNABA ~1.8GiB; most /tmp includes distinct old QA folders but retention/active-handle ownership has not been certified, so **no file deletion**. Current free disk later observed ~8.1GiB/96%.
