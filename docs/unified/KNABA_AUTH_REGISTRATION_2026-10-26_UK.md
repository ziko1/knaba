# KNABA — реєстрація та авторизація: доповнення до чинної системи

**Статус:** Source-only candidate, Draft PR (ще не merge/deploy).
**Перевірений GitHub base:** dbff693216c3c6b53a38ef9fed0ab919fd54d095, feat/knaba-owner-invite-safe-port-20261026, stacked on попередні Draft.
**Раніше створені CMS/ERP/CRM/Portal і історичні міграції збережені.**

## Аудит / REUSE-FIRST
- Чинний VPS логін: corporate-site/vps/auth.mjs — salted scrypt, 12-годинні HttpOnly SameSite сесії, rate limiting і перевірка disabled; reused.
- Власник: owner-invite.mjs і forward-only 0006_owner_invite.sql — залишені без змін; тільки перевірений власник.
- Ролі: corporate-site/worker/api.ts — pending/approved/suspended, owner-only рольова згода, profiles/audit, per-request auth. Після нового signup використовуємо саме цей контракт.
- Історичний Draft #95 має збережений, але незавершений AuthHub/email sign-up source snapshot з відсутніми auth-hub.css, provider authorization; не копіювати поверх нових виправлень.
- ERP PostgreSQL і D1/SQLite не мають сертифікованої спільної identity; email alone не є tenant membership, повний site↔ERP SSO/BFF окремо.

## Реалізований сценарій
1. Owner входить через старий /login/ та на поточному порталі отримує посилання /invite-user/. Лише справжня cookie-session + db owner ID/email має право запрошувати.
2. Власник обирає client/worker + адресу. Сервер перевіряє у транзакції identity, disabled, ролі, дублікати, власну адресу; ліміт 20/24h на власника, попередній втрачений токен цієї адреси інвалідовується.
3. Рандомний 256-бітний токен (32 bytes), у БД лише SHA256, TTL 7 днів, email- і role-scoped, одноразовий. Приватна сторінка власника показує URL https://.../register/#token=..., ніякого автоматичного листа. Фрагмент прихований від HTTP і відразу забирається з browser history. Це **не** доказ email ownership: передавати лише особисто перевіреному адресату.
4. /register/ POST: одна форма з ім'ям, email, паролем 16–256 + confirmation, privacy consent, токеном; max size, exact keys, same-origin/CSRF. Одна SQLite BEGIN IMMEDIATE транзакція створює vps_users через чинний salted scrypt, pending profiles + audit, витрачає токен. Жодного admin/owner elevation і session auto-issue.
5. Користувач сам входить через старий /login/, бачить статус pending і не може керувати ERP/CRM. Власник через existing /api/portal/roles призначає роль; токен і username не надають права.
6. У наявний портал додано тільки owner invite link і гостьовий activate-existing-invite link DE/EN/UK/RU; дизайн системи не замінювався.

## Міграція, сумісність, rollback
- Add-only SQL 0007_account_invites.sql, journal idx7 і новий Drizzle snapshot з prevId. Старі SQL 0000...0006, DB users/profiles, сторінки, ERP source tree не змінені. Міграція спільна для D1 і Node, тому не додає FK до Node-only vps_users; власник/користувач перевіряється серверною транзакцією.
- Local Node SQLite fresh, upgrade baseline1/5/7→8, integrity, backup/restore тести. Prod migration guard продовжує fail-closed, requires owner-approved offline verified backup + реальну перевірку ledger перед будь-якою зміною.
- До rollout: Draft PR відкласти без наслідків. Після rollout: code rollback не означає автоматичний DROP таблиці; inactive schema залишити до окремо погодженої reversible migration.

## QA — лише ізольований local synthetic environment
- Node 24.22.1 із перевіреним офіційним SHA256, isolated checkout і npm ci.
- Реальний RED-first test за відсутнього модуля; новий module 5/5 PASS.
- localhost HTTP/Worker/SQLite E2E 1/1 PASS: owner invite → pending worker → owner approval; forbidden forged owner, CSRF, duplicate, token replay, admin role injection.
- KNABA_RELEASE_MODE=vsp npm run test:vps: 55/55 PASS.
- npm test у site: 39 Vitest files/256 PASS + Node 32+27+9 PASS, exit0.
- npm run check: exit0, zero errors/warnings, 4 hints; KNABA_RELEASE_MODE=vsp npm run build exit0 (130 pages); verify:build exit0.
- root npm test: 25/25 PASS; source provenance policy preserved.
- Це перевірка робочого source tree до GitHub publish; точний Github HEAD/tree, незалежний review та реальний browser/device/UAT треба перевірити окремо.

## Не готове до релізу
- Немає верифікованого KNABA email sender/OTP/Google OIDC та customer mailbox ownership: **public self-signup вимкнений**.
- Partner registration, password-recovery provider, owner account human verification, localization dynamic SSR onboarding and secure automated mail pending. Не вигадувати доступність.
- ERP PostgreSQL tenant/company/site scoped identity & data bridge; real secrets/providers/quota/cost, GDPR/AVV retention, actual live DB backup/migration/rollback/owner UAT, independent security review, physical/browser/accessibility tests, public production deploy — BLOCKED/NOT_RUN.
- No paid integrations, no credential changes, no production SQL/data actions, no main merge/DNS or site release.
