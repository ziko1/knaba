# Незалежне рев’ю F3 VPS

**Вердикт: ACCEPT_SOURCE_SCOPED. Блокерів у перевірених 13 VPS-файлах не виявлено.** Це приймання поточного source-контракту сайту для входу з паролем. Повний F3, F1/PostgreSQL, браузер, native PKCE, privacy, live/device та whole-AC ним не закриваються.

## Прив’язка до коду

- Worktree: `/workspace/scratch/c56161c95e04/knaba-federation-login`.
- Base: `b3cbb24a33b5c9e677ae2db10fc29e506e8529a1`.
- Frozen manifest SHA-256: `d078795f6b2218436b696b48c565388d7fd689f9b0e532c2e5495ad88945889f`.
- Усі 13 хешів перевірено до та після власних тестів. Окремо звірено вісім залежностей; їхні хеші за час прогону не змінилися. Повний список містить `source-review.json`.
- Shared login protocol із UTF-8 subject limit: `b57a22a578e4859e2bd423000f30c33a359f969fc43c8a74c1851750b730fd81`.

## Власні виконані перевірки

Команда `node --test source-boundaries.test.mjs`: **8 PASS, 0 FAIL, 0 SKIP**, Node v24.22.1. Прогін використовує поточний VPS runtime, справжню SQLite та підписаний loopback HTTP до явно синтетичної ERP authority. Він не виконує PostgreSQL/F1 чи браузер.

1. Незмінний deadline обмежує новий SESSION_ISSUE; SESSION_USE залишається залежним від початкової чинної сесії, без продовження вікна видачі.
2. Строк початкової сесії обмежує proof; на точній межі expiry відповідь неактивна.
3. Прострочена inspection не створює approval row і не надсилає LOGIN_APPROVE.
4. Після втрати ACK прострочена CLAIMING-операція не повторюється й не подовжує grant; журнал збережено.
5. Нова сесія того самого користувача не перебирає approval старої; після відкликання старої SESSION_USE неактивний.
6. Запізніла автентична відповідь SOURCE_APPROVED після нового CANCELLED не перекриває terminal DENIED у SQLite.
7. MAC перевірено до розбору недовіреного raw body; підписаний неправильний action не створює proof або nonce effect.
8. Незмінні модулі попереднього F2 з точного base SHA відкривають additive F3 database без міграцій, але відхиляють обидва нові proof purposes підписаним 400. Approval та canonical ledger збережено. Це синтетичний rollback у scratch, без операцій над реальними даними.

Для expiry тестовий source clock зсунуто не більше ніж на три секунди; жоден тест не очікує 300 секунд і не змінює product clock.

## Source review

Перевірено точне володіння source session, current password і підтвердження; immutable request/source/policy/generation bindings; повтор саме зафіксованого CLAIMING operation ID/body перед свіжим owned LOGIN_STATUS; terminal SQL monotonicity; current P/registration/configuration guards і повторну MAC clock-перевірку після SQLite lock. GET не надає дозволу. Форми мають строгі ключі й same-origin/Host/fetch-site CSRF; зовнішній URL повернення обмежено зареєстрованим ERP origin/path; дані в HTML екрановано, шість локалей наявні. Source approval не є ERP credential і сама не створює ролей або F1 binding.

Власні тести не підміняють авторські 16 source + 8 HTTP або комбіновані 74; ці набори перетинаються та не підсумовуються. Авторський build не названо власною компіляційною перевіркою.

## Межі приймання

Потрібні фактичні integrated PostgreSQL/runtime-pair та окремі browser/native callback перевірки. У цьому рев’ю не виконано зовнішніх provider calls, нових CI, push, deploy чи production restore. Політика retention/erase для нових metadata залишається відкритою; tombstones/audit не видалялися. Runtime-файли не змінено; нові незалежні probes і receipts записано лише у scratch verification.
