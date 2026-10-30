# KNABA -> VPS. Handover and cutover gates, 24.10.2026

## Current reality

- Actual corporate domain knaba.de and www.knaba.de use One.com, A 46.30.213.20, NS ns01.one.com / ns02.one.com. VPS IPv4 is 51.77.35.6.
- Connected Cloudflare can administer vsp.rest and avenqo.pro, but not knaba.de. No approved One.com DNS write interface currently available.
- Separate old Sites preview kneba.vsp.rest points to custom-domains.chatgpt.site, project appgprj_6adc346d6f8881918b73ac79ebc5d759. This session cannot export/backup/delete that provider project.
- The owner requested no new preview. VPS candidate binds only 127.0.0.1:19110 and has no public Traefik route. Never equate an internal healthy container with completed public domain migration.

## Architecture (reuse first)

- Official Astro static site build KNABA_RELEASE_MODE=official -> https://knaba.de canonical, no temporary preview banner.
- Same existing Cloudflare Worker API bundle loaded inside Node24. Its D1-style API is backed by ONE persistent local SQLite file (WAL, foreign keys, sync transactions, checksummed additive Drizzle 0000-0004). Corporate marketing, Site Studio, owner chat, portal and existing CRM operate on the same storage. ERP PostgreSQL remains separate and is not claimed synchronized.
- Dedicated password owner login uses scrypt salted hash, 256-bit random session secrets (database stores only SHA256), HttpOnly Secure SameSite Strict cookie, CSRF origin guard, no trust in public oai-authenticated headers. Real owner enrollment is intentionally not faked.
- Docker Node24 image is cached; run as nonroot, readonly root filesystem, all Linux capabilities dropped, loopback only, bounded 1 CPU / 512MiB / 96 PIDs. Persistent state and backups separate from app release folders.
- PR22's visual editor is canonical; PR23 CRM is imported without duplicating its CMS. PR21 public source + original SVG artwork imported. AI email/WhatsApp provider calls disabled.

## Mandatory BEFORE cutover

1. Obtain written site owner authority and access to One.com DNS. Archive existing official site, DNS baseline, One.com content and its TLS configuration. Preserve all MX, DKIM, SPF, DMARC, NS, TXT and mailing settings.
2. Obtain verified ChatGPT Sites project export including ALL D1 records (leads, portal users, messages, offers, notifications), exact backup, independent restore and schema+row count reconciliation. Without this data export, existing private data cannot be honestly migrated. Do not delete old Sites or replace datasets with empty SQLite.
3. Confirm who controls the real KNABA owner account. Configure OWNER_EMAIL in the server-only environment and enroll owner via private stdin to init-owner; never create a default real owner from synthetic test identity. Test real owner, admin, client and staff roles.
4. Prove reverse-proxy IP header provenance, HTTPS X-Forwarded-Proto, secure session/cookie policy, Chrome/Firefox/Safari mobile+desktop, genuine owner/client messaging and CRM, draft->publish->restore, security and GDPR, backup/restore. No forged oai-authenticated headers must elevate a role.
5. Review exact merged source identity, accepted German/Bauhelfer facts, artwork usage rights and content/legal approvals. Run performance p95, Web Vitals, physical device/screen-reader/keyboard and an independent security review.
6. Configure a guarded Coolify/Traefik HTTPS route to the private KNABA container ONLY after certification and signed owner approval. Verify the cert and actual host responses at the VPS IP before any DNS mutation.
7. Through actual authorized One.com DNS interface, switch apex A from 46.30.213.20 to 51.77.35.6, adjust www A/CNAME after confirming current records, review any AAAA, keep mail DNS untouched. Wait for propagation and verify HTTPS, real leads, authenticated owner, search SEO, mail and uptime. Record provider version, rollback evidence and deployment SHA.
8. Rollback: revert to documented original One.com A records, preserve BOTH SQLite datasets, avoid deleting any old data, restore prior VPS image if verified acceptance fails.
9. Old ChatGPT Sites and kneba.vsp.rest can be retired ONLY after reconciled backup/import, production soak, real client signoff and working rollback, using the Sites provider management interface. No such delete/publish controls available in this session.

## Private VPS operations

- Immutable source releases under /srv/knaba/vps/releases/COMMIT_SHA, symlink /srv/knaba/vps/current, persistent /srv/knaba/vps/state, protected config /srv/knaba/vps/config/site.env, compose /srv/knaba/vps/docker-compose.yml.
- First-time local migrate through Node24: node /app/vps/manage.mjs migrate. For any preexisting database, this command creates a separate SHA256-verified full SQLite backup before running a single pending migration. Normal web startup fails closed on migration drift/missing schema.
- Audit and backup CLI: node /app/vps/manage.mjs audit and node /app/vps/manage.mjs backup. Owner setup: node /app/vps/manage.mjs init-owner, credential read only from standard input, not CLI arguments.
- Internal endpoints require Host: knaba.de and X-Forwarded-Proto: https over private loopback on http://127.0.0.1:19110. Test /healthz for liveness; /readyz remains 503 until real owner is enrolled. Site/CRM/Studio on VPS loopback are not a public customer release.
- Source code and tests are public in repo; no owner passwords, runtime env, production DB or backups in GitHub. Only root/authorized VPS operators may access config/state.
- Resource budget: existing host/disk, no new paid vendors, AI OFF; disk was 93% full (~14 GiB free) at intake. Provider quotas and site owner privileges UNKNOWN.

Status remains INTERNAL_CANDIDATE until each mandatory gate has real evidence, not only synthetic tests.
