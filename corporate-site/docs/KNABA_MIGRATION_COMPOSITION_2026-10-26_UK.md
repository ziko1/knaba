# KNABA: композиція bridge + owner migration

Статус: SOURCE CANDIDATE / NOT DEPLOYED / RELEASE HOLD. Не AVENQO.

## Походження
База PR67 `3e76dec480a87dc9314c267deb78eb86925f4baa`; вибірково перенесено source owner-invite/manage/server та owner tests з PR58 `41e91d4e972a3e5d847cfd569f83b2e91979cb9c`. Новіші незалежні UI-гілки та live preview не замінені. Історичні PR/evidence збережені.

## Рішення
`0000`–`0005_assistant_erp_bridge.sql` залишаються байт-у-байт незмінними. Owner SQL із PR58 перенесено без зміни SQL-байтів під НОВИМ іменем `0006_owner_invite.sql` у цьому source-кандидаті. Drizzle journal отримав idx6 і наступну timestamp; custom snapshot зберігає попередню ORM-схему з новим id/prevId, бо таблиця owner invitations є VPS-only, не D1 identity model. Немає повторного паралельного `0005` у дереві кандидата.

Дозволені синтетичні upgrade paths: чиста база; база з 0000–0004; база з незміненими 0000–0005 bridge. Кожен SQL застосовується рівно один раз; історичні checksum/installed_at не змінюються. Перед новими SQL runner звіряє ВЕСЬ наявний ledger, а не перевіряє файли поступово після можливого часткового upgrade. Невідомий `0005_owner_invite.sql`, невідомі історичні filenames або checksum drift — STOP до будь-якого pending SQL. Ніякого автоматичного перейменування записів ledger чи alias old→new.

## Rollout: НЕ виконувати автоматично
Поточна live schema/ledger НЕ читалася та має статус UNKNOWN. Для бази, де вже застосовано старий PR58 `0005_owner_invite.sql`, цей кандидат навмисно відмовляється стартувати. Потрібен окремо погоджений, перевірений план reconciliation з online backup, schema/receipt inventory і rollback; не видаляти та не переписувати ledger для обходу gate. Так само заборонено відкатом на код без 0006 приховувати нову таблицю/receipt.

Інтеграційний сайт не є повним поточним UI-релізом і не включає PR41 ERP runtime. Snapshot source repair окремо на PR41. Реальні owner identity/email, D1/Cloudflare CLI, ERP full PostgreSQL, browser/device, independent review, provider/WhatsApp/DeepSeek та production acceptance залишаються NOT_RUN/BLOCKED до конкретного доказу.

## Фактичний TDD checkpoint
Node24.22.1; тести використовують тільки mkdtemp synthetic SQLite. До виправлення 9 FAIL/1 PASS у новому migration suite. Після виправлення 24/24 targeted Node cases PASS (guard + upgrades + CLI audit + owner invites); онлайн backup/restore і PRAGMA integrity/foreign_key_check PASS. Перший owner-port прогін мав 3 FAIL через старе очікування 6 migrations; після явного оновлення до 7 усі пройшли. Функціональні assertions не прибрані.

Повний npm test на точному робочому дереві: cached 509 installed packages звірено з незміненим package-lock (0 missing/mismatch), Docker Node24 із network=none, readonly root, caps=none, uid998, CPU/RAM/PID limits. Фінальні exact commit/commands/counts записуються в evidence після повного прогону; жодної заяви live-ready.
