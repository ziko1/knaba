# KNABA — kneba.vsp.rest VPS domain cutover, 2026-10-25

## Scope and authorization
The user explicitly requested removing legacy hosting references from the **active public site** and moving `kneba.vsp.rest` to existing VSP VPS. No changes to official `knaba.de`, mail DNS, ERP, AVENQO or other sites. Historical source/backup evidence is intentionally retained.

## Provenance and build
- Source base PR #25 `fd07d874aad254ff4b0f28df4450e0cc5b4a47bc`.
- Exactly tested application code commit `695a58077cf119096301c268c017d0d392712b71`; live immutable runtime release directory `/srv/knaba/vps/releases/695a58077cf119096301c268c017d0d392712b71`.
- Previous release preserved `/srv/knaba/vps/releases/638db18f04ed55f2a9452dd0a6db45560dc1540a`.
- Exact build report artifact SHA256 `a27e7a860e4c880ee24f1ad387ea611a22893fc6f398e960696b00df63097493`; compiled Worker SHA256 `efff0cb787bbdfe8ab60d1700536bde6712e709894b7eea575a13f1b941f35d7`; index SHA256 `e2abb3889ea58b01013f86774e8d072d030f239b91d3099a9c688467232fe9b1`.
- Isolated Node24.22.1/npm11.19.1: `npm run check` 102 Astro files (0 errors, 0 warnings, 4 hints), `npm test` 101/101 Vitest +8/8 Node inquiry, Node VPS E2E 1/1, `npm run build` 51 HTML + Worker and static verifier PASS; `npm audit --omit=dev` 0 reported production vulnerabilities.
- Active source and production HTML/JS assets contain zero stale provider brand/hostname references. First-party `/login/`, `/logout/`, DE/RU legal VPS and SQLite disclosures.

## Network/HTTPS receipts
- Cloudflare authoritative DNS `kneba.vsp.rest` switched from old CNAME to A `51.77.35.6`, `proxied=false`, TTL300. Original record saved privately as `/srv/knaba/vps/rollbacks/dns-before-kneba-vps-cutover-20261025.json`. Legacy TXT verification records retained for possible original provider data export.
- Private Node24 Docker service `knaba-vps-internal`, nonroot, readonly FS, dropped capabilities, CPU/memory/PID limits, host port `127.0.0.1:19110` and only internal `coolify` Docker network. Traefik router `knaba-vps-public` handles `kneba.vsp.rest`.
- Strict public HTTPS at `https://kneba.vsp.rest/`: HTTP200, TLS verification=0, origin remote IP `51.77.35.6`. Let's Encrypt certificate subject `kneba.vsp.rest`, issuer `YR1`, valid through 2027-01-22.
- 51/51 static HTML paths HTTP200 through Traefik (initial route audit with explicit TLS bypass during cert issuance); after certificate issuance, 17 main paths including all locales, legal, services, login, Studio, CRM, portal and healthz returned HTTP200 on strict HTTPS, /readyz=503 as designed, unauthenticated studio API=401.
- Synthetic forged owner headers rejected 401 during stage. All test routes have no duplicated /ru/ru/ prefix.
- Pre-change SQLite backup `/srv/knaba/vps/state/backups/knaba-2026-10-24T23-04-12-955Z.sqlite` SHA256 `d5f4e30851ed8bf0f981d26615910263f786d67095be4b0d387b83f58991ef56`. Persistent state reused; no database migrations or customer records deleted. No paid AI, email or WhatsApp providers activated; new spend/quota unknown.

## Unfinished P0 handover requirements
1. **Old hosting D1 user/leads/messages not exported or reconciled**; this is a DNS/app cutover, *not* complete customer-data migration. Keep original provider project and old TXT verification records until independent import/reconciliation.
2. **No real KNABA owner enrollment** (`OWNER_EMAIL` unset; `/readyz=503`). Real owner/admin/worker/client login, CRM and messages need authorized UAT.
3. PR #26/#27 assistant recovery/outbox was not unsafely cherry-picked: its D1 schema lineage differs from PR #25 SQLite migrations 0000..0004.
4. GDPR retention/deletion and DPA, legal/customer approval, independent security review, physical device/browser testing, field Web Vitals/p95 and end-to-end live inquiry acceptance are NOT_RUN.
5. Previous provider/hosting text in immutable historical docs is intentionally retained; it is not in active public site or first-party login.

## Recovery
- Previous Docker compose file at `/srv/knaba/vps/rollbacks/docker-compose.before-kneba-cutover-20261025.yml`, hash `097d56051356aa18a1733753970b8eafe3fe9c220260519a58e4644f6355f52a`.
- Preserve latest SQLite DB and all backups. A conditional app rollback must restore the old compose and point the `current` symlink to previous immutable release before recreating only `knaba-vps-internal`. Never replace real DB with an earlier snapshot without explicit operator restore plan.
- Prior DNS target produced Cloudflare 403/error1014; DNS rollback is not guaranteed to restore public availability.
- Official `knaba.de` and email DNS untouched. No merge to main.
