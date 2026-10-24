# LANG-UI-01 — KNABA: випадаючий список мов та локальна релізна перевірка

**Дата:** 24.10.2026. **Репозиторій:** `ziko1/knaba`. **Статус:** `LOCAL_PASS / LIVE_NOT_DEPLOYED`.

## Обсяг та контракти

- Чотири мови (`DE`, `EN`, `UK`, `RU`) зберігаються; верхню повноширинну смугу та дубль футера замінено на один dropdown у header. Поточну мову відзначено; клавіатура `Enter`/`Tab`/`Escape`, відновлення фокуса та закриття назовні перевірені.
- За ширини до 700 CSS px посилання на кабінет показується в мобільному меню, а не дублюється у шапці. Плаваючий KNABA Assistant, клієнтський/owner портал, D1-таблиці та API PR #13 не замінено.
- `src/styles/global.css` тепер використовує `@import "tailwindcss" source(none)` та `@source "../"`: Tailwind 4 сканує лише `corporate-site/src`. Це ізолює CSS від `docs/`, тестових логів і тимчасових QA-файлів та робить відтворення артефакту стабільнішим.

## Ідентичність результату

- Точна вихідна база PR #13: `5b5f1dca323eca371a7c3f160e1614ac46e7c41b`.
- Після першого етапу PR #15 мав head `b98ddb67a1f9396b539505ae314796cf78b5e49e`. Оновлений head потрібно звірити в GitHub після публікації цих виправлень.
- Релізний кандидат тестовано в окремому checkout `/tmp/knaba-pr15-release-qa-20261024` на VPS; `Node 24`, `Astro 7.4.2`, `Vite 8.3.5`, пакети з чинного lockfile; нових production-залежностей немає.
- Фінальний локальний `dist/client` SHA-256 з `verify:build`: **`ca5fa570b4d12d71c673c1fdd7886a384c049e7dd4a1c5b32425e58d509a7903`**. 49 HTML-сторінок; CSS **19 407** байтів gzip сумарно; JS **138 279** байтів gzip сумарно. Це не розмір одного page load або вимір field CWV.

## Фактично виконані перевірки

| Gate | Статус | Доказ |
|---|---|---|
| TDD dropdown | PASS | На вихідному рендері тест `404.html: language dropdown must exist` мав exit 1; після впровадження `verify:build` exit 0 |
| Typecheck | PASS | `npm run check`: Astro 81 файлів, 0 errors/warnings/hints; Vue + Svelte без помилок |
| Unit/integration | PASS | `npm test`: 55/55 Vitest + 8/8 Node |
| Build + static | PASS | `npm run build` + `npm run verify:build`, 49 HTML, посилання, метадані, тимчасовий noindex |
| Browser | PASS (обмежений) | Локальний Chromium/HTTP без мережі: 4 мови × 15 CSS-ширин (320…1440 px) = 60/60; відкриття, active locale, Escape, outside click, Enter/Tab, DE→RU і `leistung=bueroreinigung`; після переходу KNABA Assistant відкривається та показує RU, email і телефон |
| Збільшення тексту | PASS (імітація) | `font-size:200%` у Chromium на 640 CSS px: dropdown і шапка без горизонтального overflow. Це **не** реальний 200% браузерний zoom або тест скринридера |
| Tailwind відтворюваність | PASS (локально) | Два build+verify з доданим QA-файлом поза `src` дали **ідентичний** SHA-256 `ca5fa570…509a7903`; попередній хеш `49655ac8…` належав робочій директорії з додатковими файлами та більше не є актуальним |
| SQLite schema migration | PASS (локально) | `0000_needy_war_machine.sql` → `0001_lazy_angel.sql` у in-memory `node:sqlite`: 7 старих об'єктів незмінні, попередній профіль збережений; 3 нові таблиці, unique retry та FK перевірено |
| Worker HTTP + D1 | PASS (локально) | Окремий `wrangler d1 migrations apply --local` + `wrangler dev --local`, isolated `--persist-to /tmp/knaba-pr15-qa-d1`, `Docker --network none`: create 201, відмова без consent 422, 404 без guest token, owner endpoint 403 для аноніма, reply/handoff 200, гість не може читати inbox |
| Workspace diff | PASS | `git diff --check`; runtime змінено лише CSS, схему/AI/ERP не редагували |

Ранній HTTP-smoke **спершу FAIL 503**, оскільки `wrangler dev` запустили без локальної міграції; після явного `d1 migrations apply --local` аналогічний сценарій PASS. Це не production-інцидент.

Точні SHA-256 тимчасових QA-скриптів на VPS (не включені до GitHub PR): browser `696b93dda895be76728c65e66f8804dd399b030e5b48332210c76bdc8a2c9c25`; HTTP `9c0239aa0ba376e6a1211be0a7d477ad761a6e30dafe9b466028cd67cfba24dc`; migration `cd073436b32f1c4f088c1bd2eadb8cbebedfe0b1937016001086572680f3ec3e`.

## Блокери та межі доказів

- `NOT_RUN`: реальний owner sign-in + клієнт↔власник↔клієнт на хостингу, Cloudflare D1 live schema upgrade, фізичний Android, screen reader, native browser zoom, field Core Web Vitals, резервне відновлення та юридичне/customer UAT.
- `BLOCKED_APPROVAL`: merge, публічне `kneba.vsp.rest`, official `knaba.de`, live D1-міграція. Зовнішня генеративна AI-модель/email/WhatsApp не активовані; невідомі витрати не припускати.
- Окремий Vite warning про майбутній `configLoader:native` та import без розширення не виправлявся в цьому UI PR.
- VPS диск під час перевірки: ~92% зайнято (16 ГБ вільно), `RESOURCE_WARNING`. Жодних видалень користувацьких даних не виконано.
- **Rollback:** PR не зливати/не розгортати до погодження, або після відокремленого релізу повернути попередній перевірений UI-артефакт; не видаляти D1-дані, не покладатися на SQL downgrade.

**Суміжні гілки:** PR #14 — UX на старішій базі; PR #15 — адаптований dropdown на PR #13 із плаваючим помічником. PR #12 містить окрему інтеграційну роботу, яку ще потрібно погодити з цим кандидатом; не зливати гілки навмання.
