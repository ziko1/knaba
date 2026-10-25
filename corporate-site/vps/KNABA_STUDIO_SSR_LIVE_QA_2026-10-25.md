# KNABA VPS Studio SSR — live QA receipt, 2026-10-25

## Scope / source identity
- Development site: https://kneba.vsp.rest/ on existing VPS `51.77.35.6`; official `knaba.de` is a different website and its DNS, content, mail and ERP remain unchanged.
- Integrated exact tested and deployed **application source** commit `417f40bba42f26ff88c620edba22a92f58f5213a` (merge of pre-existing PR #30 with already-deployed PR #29 and targeted Host/HSTS/canonical test fixes).
- Immutable deployed release: `/srv/knaba/vps/releases/417f40bba42f26ff88c620edba22a92f58f5213a`.
- Prior known working release retained at `/srv/knaba/vps/releases/695a58077cf119096301c268c017d0d392712b71`. Production compose/DNS/Traefik routers unchanged during this application-only rollout.

## Functionality
- Existing Studio/CRM/Portal reused, no duplicate CMS. Published Studio leaf text, safe href/src/alt/color and SEO title/description can be reflected directly in server-returned HTML with an esbuild-bundled parse5 parser. Draft content is not public. Existing Astro hydration remains intact.
- HSTS `max-age=604800` on HTTPS responses for development host; no includeSubDomains/preload. Correct hostile Host rejection: `www.knaba.de` is **not** treated as alias for `kneba.vsp.rest`. Owner-editable links to `https://kneba.vsp.rest` accepted; lookalikes, HTTP, username/password, alternate ports denied.
- Source-bound built client tree SHA256 `c69d1d3d4abdce19441fb02319a0ef36b780f316d47eb1be2b1589de66e3ac8c`. Exact Worker `ad234dfc4212b83d9611d4f9d589abbbb3ce8958c0d4e3ee6a3ad7f31a708a29`; VPS renderer `4313a678824926f93b09e417bd65d58844e33bb602952d4c22cfe180f2f7ed64`; homepage `81983650bdcf3dccc9f158c8c94136292621b8301e8eee114f88a6d9a857e8a4`.

## Test results / limits
- Node 24.22.1: Astro/Vue/Svelte check 111 files, 0 errors, 0 warnings, 4 hints. 102/102 Vitest + 8/8 inquiry Node tests PASS. 51 HTML build + Worker + VPS bundled parser PASS; static verifier internal links/metadata PASS. Node VPS 14/14 tests PASS, including owner/synthetic SEO publish and restore. Production-only npm audit reported zero vulnerabilities. Separate red-green behavior test: VSP href initially rejected, then green after domain allowlist correction.
- Real VPS running immutable release: all 51 built public HTML routes requested against https://kneba.vsp.rest with **default system CA/TLS validation**, all HTTP200; `/healthz`=200, `/readyz`=503 because real owner is intentionally not enrolled. `/api/studio/content` anonymous=401, `/api/assistant/owner/notifications` anonymous=403.
- HTTPS verified Let's Encrypt YR1 certificate for kneba.vsp.rest, trust chain OK (verify=0), valid 2026-10-24 to 2027-01-22; real HTTP redirects to HTTPS. Public response has CSP and HSTS, canonical=https://kneba.vsp.rest/, `noindex, follow`, no stale ChatGPT branding in the published homepage.
- Isolated private staging on a copied database passed 11 anonymous routes, HSTS, wrong-host 421 and forged identity 401. Synthetic owner CLI enrollment in staging verified readiness 503→200. **Additional HTTP owner login→Studio publish smoke NOT_RUN**: script could not write to its test output directory; a subsequent attempt was blocked by tool permissions. The independent Node automated test covers synthetic owner editing, publish/restore and persistence, but that is not a live owner/device acceptance test.
- Opera Browser Connector opened real HTTPS login page and exposed expected email/password form in accessibility tree. **Physical Android/iOS and full 320/390 desktop/mobile accessibility UX NOT_RUN** this turn.
- Current VPS SQLite at cutover: `vps_users`, `profiles`, `cleaning_requests`, `assistant_conversations`, `assistant_messages`, `crm_contact_notes`, `studio_pages` each had zero records (read-only counts). Former provider D1 is not directly accessible, so no claim about its data. Do not delete any old provider project or data.
- Latest on-VPS pre-upgrade backup `/srv/knaba/vps/state/backups/knaba-2026-10-25T00-16-01-227Z.sqlite`, SHA256 `d5f4e30851ed8bf0f981d26615910263f786d67095be4b0d387b83f58991ef56`, SQLite integrity=ok; not a replacement for a separate external/offsite backup.
- Disk ~94% used, ~12 GiB free; storage doctor reports WARNING/cutoverAllowed=false by its conservative 90% threshold. No user data, application backups or unrelated container caches deleted.
- Existing providers/AI/email/WhatsApp untouched; no billable provider activated. Actual quota/cost balance UNKNOWN. No main merge.

## Remaining release gates
1. Provide real authorized owner email and privately provision unique credentials via protected stdin to `node /app/vps/manage.mjs init-owner` (not in code/CLI args, no default account). Verify `/readyz` 200 and full human owner/CRM/Studio mobile UAT.
2. Reconcile optional newer PR #26/#27 Assistant recovery and owner outbox against current VPS SQLite migrations 0000..0004, using diff/ADR, additive migrations, backups, isolated tests.
3. Legal/GDPR retention/export/delete, verified rights to copy and business accuracy, data processor approval and on-device testing. Continue development with existing noindex; launch on knaba.de is not authorized.
4. Review performance measured baseline and storage pressure before optimizing or cleaning. No paid provider activation without confirmed permission and quotas.

## Rollback
Only if a regression is confirmed: preserve existing `/srv/knaba/vps/state`, switch `/srv/knaba/vps/current` symlink back to the prior immutable release, then recreate **only** the KnaBa Docker service with its current compose. This code update does not require any database migrations, proxy/DNS/cert changes or modification of other projects.
