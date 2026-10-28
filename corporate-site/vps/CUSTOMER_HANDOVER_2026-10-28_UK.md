# KNABA DE — customer handover release candidate (28 October 2026)

Scope: **only** `ziko1/knaba` corporate-site; AVENQO and other products remain untouched.
Canonical project instructions: repo `AGENTS.md`, `corporate-site/AGENTS.md`, existing project memory/roadmap/backlog; no replacement.

## What the customer can do

- Company owner: protected one-time, 2-hour, high-entropy server-issued `/activate-owner/#token=...` enrollment, independent verified identity and password of at least 8 characters (prefer a longer randomly generated password; require MFA for privileged production access). Operator only displays token inside private mode-0600 local handoff artifact. No password, token or secret stored in GitHub.
- Developer: separate **optional** `KNABA_DEVELOPER_EMAIL`, a second one-use `/activate-developer/#token=...` identity, durable `vps_staff_grants` grant in SQLite. Their portal and studio authorization matches the owner only when BOTH the server-pinned email and active grant match the authenticated internal user ID. `revoke-developer` immediately removes the grant and invalidates the developer's sessions. They do not share a password.
- Owner/developer can invite a person as **client, partner or worker**, after checking the recipient out of band. The invitation is one-use, email-scoped, 7-day and hash-only in the database. The invitee cannot change the role with a forged form field; the profile remains pending until the owner/developer approves it.
- A public /join/ request may identify as client, partner or worker, but grants **no login or role**. Social registration with a verified provider email can create a new pending client or partner account. Partner access is deliberately data-isolated (no cross-customer requests, CRM, studio or role administration).
- Google OIDC and *single-tenant* Microsoft OIDC are server-configurable, using authorization code + PKCE S256, nonce, browser-bound state, limited one-use state storage, bounded provider requests, RSA-signed JWT validation (issuer/audience/nonce/expiry/email verification) and `issuer+sub` linking. Email match alone NEVER links an existing account or elevates to owner/developer. To explicitly link a social provider, sign in with credentials first and visit `/auth/oidc/google/?mode=link` (or Microsoft). Without configured credentials, provider links are hidden.
- Domain / source code can change without losing owner/developer identities: credentials, active grants, profiles, access requests and OIDC links all persist in the **same portable SQLite**. A future host/domain switch updates protected env + compose config; it MUST migrate verified state rather than start with an empty database. The old browser session may require a fresh sign-in.

## Exact server-only configuration (never commit real values)

`/srv/knaba/vps/config/site.env` (root:root, 0600):
```dotenv
OWNER_EMAIL=<verified real owner email>
KNABA_DEVELOPER_EMAIL=<verified separate developer email>
TURNSTILE_SITE_KEY=<key for final domain>
TURNSTILE_SECRET_KEY=<private key>
KNABA_GOOGLE_CLIENT_ID=<OAuth web application ID>
KNABA_GOOGLE_CLIENT_SECRET=<OAuth web application secret>
# optional; tenant must be a specific GUID:
KNABA_MICROSOFT_TENANT_ID=
KNABA_MICROSOFT_CLIENT_ID=
KNABA_MICROSOFT_CLIENT_SECRET=
```
Only set OAuth pair/tenant once actually provisioned. Google console: HTTPS authorized redirect `https://knaba.de/auth/oidc/google/callback/`; Microsoft Entra for a **single selected tenant**: `https://knaba.de/auth/oidc/microsoft/callback/`. If the final hostname changes, register the exact new HTTPS redirect URIs with both providers. No broad wildcard redirect and no open Microsoft tenant setting. Microsoft email claims may not carry verified-email status for all tenants; sign-in intentionally fails closed unless an acceptable verified claim is available; perform real-provider UAT before promising Microsoft sign-in. Do not assume customer OAuth application/consent configuration or quota exists.

Use `/srv/knaba/vps/.env` (root:root 0600) solely for Docker Compose interpolation:
```dotenv
KNABA_PUBLIC_HOST=knaba.de
KNABA_PUBLIC_ORIGIN=https://knaba.de
# Existing reverse-proxy network on the owner machine (default Coolify):
KNABA_PROXY_NETWORK=coolify
KNABA_RUNTIME_UID=<id -u knaba>
KNABA_RUNTIME_GID=<id -g knaba>
```
The compose file uses these variables rather than `kneba.vsp.rest` or UID/GID `1000`. Verify ownership and do not paste actual secret values into logs.

## Customer server bootstrap (NEW authorized server only)

1. Provision system packages after reviewing provider and license terms: Docker + Compose, modern OpenSSH, GNU tar, coreutils, git, useradd; configure SSH firewall, backups, DNS and TLS separately. Verify at least 8GiB free space before copying data.
2. On the **customer** server (not the existing VPS), the owner supplies two different vetted SSH public key files. With a privileged session:
   ```bash
   sudo KNABA_INSTALL_ROOT=/srv/knaba/vps \
     OWNER_SSH_PUBKEY_FILE=/root/owner_key.pub \
     DEVELOPER_SSH_PUBKEY_FILE=/root/developer_key.pub \
     bash vps/owner-server-setup.sh prepare
   ```
   This creates two separate OS accounts `knaba` and `vsp`, only SSH public-key access, private state/config, and release directories. No docker-group or general sudo privileges for either OS user. Run `preflight` first. Existing running KNABA installations are protected against unintended re-preparation. It does **not** run a site, deploy code or change DNS.
3. After the exact release Git commit is reviewed and clean and the code/tests/build verified, invoke `vps/owner-server-setup.sh bundle` in the checked-out project, with a private `KNABA_BUNDLE_DIR`. It archives only `dist/`, `vps/`, `drizzle/`, `package.json`; never database/config/secrets. Copy over pinned/verified SSH host key with the matching `*.sha256`. The checksum file MUST contain only the archive basename, not an absolute path from the old host.
4. On the owner server, `KNABA_BUNDLE_FILE=/private/knaba-candidate-....tar.gz KNABA_EXPECTED_SHA=<exact reviewed commit SHA> sudo bash vps/owner-server-setup.sh stage`. This validates the archive checksum and **stages** `/srv/knaba/vps/releases/<SHA>` without switching `current`, migrating DB or modifying production.
5. Transfer private **data separately** over encrypted, authenticated SSH from a verified SQLite online backup, never by copying open SQLite/WAL files. Include attachments, other backed-up volumes, verified migrations and row counts. Offline migrations remain a separate owner-approved step. Use `node vps/manage.mjs backup` and `migrate` from Node24 with protected `KNABA_DB_PATH` and `KNABA_BACKUP_DIR`; migration automatically saves an additional checksummed pre-migrate backup. Check `PRAGMA integrity_check`, `foreign_key_check`, source/destination SHA256 and operator credentials before switch.
6. Before **any** public cutover: confirm the existing owner and developer identities, acceptance on actual owner and test devices, OAuth callback functionality, mail/Turnstile config, data import from old Sites/D1, backup/restore and rollback. Review official `knaba.de` DNS/MX/TXT records with site owner; never change email DNS, domain ownership or production without explicit acceptance.
7. Only after acceptance: authorized root deploy operator activates reviewed code, starts the existing protected Docker Compose service, verifies HTTPS/Host/proxy provenance, owner/developer sign-in, client/partner approval, CRM, studio, voice/ERP integration gates, status/health, then changes domain DNS in a separately approved step. Back out using the previous immutable `current` and verified DB backup, without deleting either copy.

## CLI with protected server environment

```bash
node vps/manage.mjs migrate
node vps/manage.mjs audit
node vps/manage.mjs invite-owner
# after owner has activated:
node vps/manage.mjs invite-developer
# if needed, immediately revoke elevated rights and all developer sessions:
node vps/manage.mjs revoke-developer
node vps/manage.mjs backup
```

Use Node24 and the correct already-migrated persistent database; in the production deployment container those commands need the state volume and protected env. Do not run `init-owner` with a default password or on a customer already enrolled. Invitation URLs appear **only** in root/private 0600 files and expire after 2 hours. The owner/developer's real verified emails cannot be invented by automation.

## QA and acceptance

- Automated local Node24 + SQLite fresh/upgrade/restart tests, role isolation, sign-in, invitation replay, forged identity headers, developer revocation, secret file mode 0600, OIDC signed tokens/PKCE/CSRF/issuer/audience/nonce and idempotent migration: verified on synthetic data only.
- Astro/Vue/Svelte check, site Vitest, public locale build, i18n catalog, artifact integrity + static SEO: automated. Unit/build PASS **is not** device, live OAuth, real customer sign-off, WhatsApp voice quality, ERP/Postgres synchronization, mail delivery, Lighthouse/Web Vitals or production performance.
- REQUIRED OWNER ACCEPTANCE: activate verified owner and developer independently, complete two-browser login + logout, owner grants/pauses accounts, partner cannot read any other customer, manually create/revoke links, real Google/Microsoft provider callback, consent/privacy link, owner studio + CRM, real lead form, mobile keyboard/accessibility, back up+restore, rollback on new host.
- KNABA assistant calls/WhatsApp provider routing, existing ERP integration, actual mailbox delivery and older Sites data export remain separate audited gates. A published customer release cannot claim those fully operational from these tests.
- Do not merge to `main`, change `knaba.de`/DNS or discard current data until the canonical project approval and PERSIST–VERIFY–PUBLISH–REVERIFY gates pass.

## 28.10.2026 — інтеграційне доповнення для сьогоднішньої передачі (без production cutover)

- На основі вже існуючого customer candidate PR #110 інтегровано в цій же лінії розробки незалежні правові зміни PR #111 і read-only аудит термінів заявок PR #109; конфлікт CLI manage.mjs вирішено зі збереженням invite-developer, revoke-developer, access-audit, backup, audit, migrate.
- Виправлено підтверджений дефект: після затвердження partner користувач не потрапляв у жодну гілку інтерфейсу. Тепер показується особистий захищений партнерський екран із дією зв’язатися з KNABA. Це **не** ERP-кабінет партнерських замовлень; не вигадувати інтеграцію, оплати, розклад або дозволи бачити чужі дані.
- Регресія партнерської гілки перевіряється окремо, у backend збережено правило default-deny для запитів/CRM/Studio і не виконуються mutation-запити від імені partner.
- Ізольовано на наявному VPS, Docker Node 24.22.1, без зовнішніх AI/OIDC/email/provider-запитів і без production даних: npm run check — 0 errors/warnings, npm test — PASS, npm run build — PASS, npm run verify:build — PASS, KNABA_RELEASE_MODE=vsp npm run test:vps — 76/76 PASS, кореневі node --test scripts/*.test.mjs — 25/25 PASS; юридичні та партнерські focused — 8/8 PASS. Точні журнали та source SHA необхідно звіряти зі staging receipt після публікації.
- i18n source catalog синхронізовано з фактичним джерелом: 1023 одиниці / 28 маршрутизованих категорій, source verify PASS; чотири поточні опубліковані мови, решта 95 — pending, **не** готові.
- Публічний self-service парольний signup/recovery без перевіреного каналу email і реальний соціальний вхід **не перевірені**: KNABA-specific OAuth client IDs/secret та другий verified developer email на тестовому VPS не налаштовані. Штатний безпечний fallback — індивідуальне запрошення й ручна ідентифікація; реальні два акаунти власник/розробник не створювалися автоматично.
- Власник має пройти приймальні сценарії на своїх пристроях і затвердити реальні юридичні реквізити, AVV, hosting transfer, data import, OIDC redirect URI, backup/restore та production cutover. Справжні браузерні OAuth, фізичні пристрої, legal sign-off, старий D1/ERP/WhatsApp міст та міграція на сервер власника залишаються відкритими.


## 28.10.2026 — партнерські проєктні заявки у спільному Portal (SOURCE QA)

- Затверджена роль partner використовує існуючий /konto/ (DE/EN/UK/RU), заявляє власні проєктні потреби, бачить тільки власні запити та статуси, може скасувати new/reviewing і залишити відгук після завершення. Це НЕ ERP-облік договорів, рахунків або оплати.
- Повторно використано чинні cleaning_requests, client_id, власницький dashboard та idempotency, без нових SQL-міграцій і другого бізнес-стору. Партнеру відмовлено у доступі до чужих запитів, worker_note, CRM, Studio, списків людей та управління ролями. Новий запит проходить перевірку актуального partner+approved в SQLite/Worker, а не довіряє браузеру. Власник може переглядати його через існуючий Portal.
- Перевірки: окремий HTTP+SQLite тест спочатку відтворив 403 (RED), після виправлення запит 201, ідемпотентний replay 200, scoped dashboard, чужий PATCH 404, заборонені поля 422, відкликана роль 403; статичні frontend/security регресії. На інтегрованій базі з 8-символьною політикою паролів перевірено Node24: VPS 80/80, root 25/25, 40 файлів site tests, 0 errors/warnings, build+verify PASS; Chromium 320/390/768/1440 без JS-помилок/переповнення, власна заявка реально відправлена та видима в кабінеті на синтетичній БД. Це не live owner UAT.
- Продовжують діяти customer UAT, законність обробки персональних даних, перевірка власника, offhost restore, role/ERP identity bridge та production gates. Не використовувати цей локальний тест як доказ фактичного платного сервісу або завершеної інтеграції PostgreSQL/WhatsApp.
