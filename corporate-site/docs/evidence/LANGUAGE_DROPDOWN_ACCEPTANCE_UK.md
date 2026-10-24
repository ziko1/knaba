# LANG-UI-01 — dropdown мов KNABA (ізольований acceptance, 24.10.2026)

## Контракт
На всіх сторінках корпоративного сайту одна кнопка мови у шапці замість повноширинної смуги DE/EN/UK/RU; без дублюючого меню у футері. Повний список Deutsch / English / Українська / Русский, виділена поточна мова, навігація до існуючих еквівалентних сторінок. Плаваючий KNABA Assistant, кабінет власника, API та міграції PR #13 повинні лишитися без змін.

## Ідентичність
- Джерело: `ziko1/knaba`, вихідний head PR #13 `5b5f1dca323eca371a7c3f160e1614ac46e7c41b`.
- Кандидат: `codex/knaba-assistant-language-dropdown-20261024`. Фінальний commit SHA фіксується в GitHub PR, не передбачається наперед.
- Статичний артефакт `dist/client` після фінальної збірки (об'єднаний SHA-256 перевіряльника): `49655ac869a431f4f05c999d07c11e62a24a05e5a1f7c2dfe3d31f83b9a962ad`.
- Версії: Node 24 Docker, Astro 7.4.2, Vite 8.3.5; залежності з наявного `package-lock.json`. Додаткових пакетів не встановлено в продукт.

## Запущені перевірки
- TDD RED: на вихідному `dist/client` статичний тест завершився з кодом 1: `404.html: language dropdown must exist`. Після реалізації той самий `npm run verify:build` — exit 0 для 49 сторінок.
- `npm run check` — Astro (81 файлів) 0 errors/warnings/hints, Vue TypeScript 0, Svelte 0 errors/warnings.
- `npm test` — 55/55 Vitest та 8/8 Node-тестів, exit 0.
- `npm run build` — 49 HTML, exit 0. `npm run verify:build` — посилання/метадані/тимчасовий noindex PASS, CSS 19 454 bytes gzip сукупно, усі JS 138 279 bytes gzip (не є реальним завантаженням однієї сторінки).
- Playwright Chromium із локальним HTTP сервером, без доступу до зовнішньої мережі: 4 мови × 320/360/390/768/1280 px = 20/20; кнопка, чотири посилання, активна мова, відсутність overflow, Escape, click-outside, клавіатура Enter/Tab, повернення фокуса, DE→RU і збереження `leistung=bueroreinigung` — PASS. Кнопка KNABA Assistant, локалізована RU-панель, телефон та email в ній — PASS. Мобільні стани переглянуті в двох тимчасових знімках на VPS, але скриншоти не опубліковані.
- `git diff --check` — без помилок пробілів.

## Межі приймання
- Немає merge, official або preview deploy, змін D1/Postgres чи ввімкнення оплачуваних постачальників.
- Портал власника і реальні повідомлення користувача в production, screen reader, фізичний Android, 200% zoom, field Core Web Vitals та юридичне погодження — NOT_RUN для цього об'єднаного кандидата.
- Відома окрема попереджувальна діагностика Vite щодо import without extension (`configLoader: native`), не заважає поточній збірці.
- Rollback: не зливати цей PR, або відкотити його вузькі UI-зміни після окремого review; жодних даних база не торкається.
- PR #14 — паралельна версія перемикача на базі public assistant; цей кандидат переносить UX на PR #13, без втрати плаваючого чату та owner inbox.
