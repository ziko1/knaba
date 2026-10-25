# KNABA — безпечна інтеграція дизайну й SEO PR #50 → PR #64

**Дата:** 25.10.2026. **Призначення:** технічний Draft-кандидат, НЕ live. Окремий проєкт KNABA, не AVENQO.

## Фактичні ідентичності

- Базовий PR [#64](https://github.com/ziko1/knaba/pull/64), коміт `6d3ca1193ff98ffc46e7688a74896789fd2fb6a3` (source recovery, FAQ Studio leaf editor, 103-page routes, immutable-artifact verifier).
- Джерело вибраних UX/SEO змін: [PR #50](https://github.com/ziko1/knaba/pull/50), незалежний перевірений код `34b2c4693a6ddfa986a9194c71689043cf826578`.
- Гілка-кандидат: `feat/knaba-reconciled-ui-seo-20261025`. **Browser-tested runtime SHA** `4580e30a4ea22c5fc4869b81b87e4bed7a59a373`; додано тільки source-only sitemap verifier/test і package scripts до `ac9da47cad26b65efef81afd08ad47bc4cb6bffe`. Документаційні коміти після цього не можуть бути підставою вважати runtime іншим.
- Поточний, ОКРЕМИЙ live release: `5b5261e56ad4ae5122495cf3e9b0f87ea7f2d70c`. Маніфест повідомляє `publicSourcePush: BLOCKED_BY_AUTO_REVIEW` — не публікувати його захищений bundle як обхід review.

## Що інтегровано без широкого merge

1. Чотиримовний hero, асиметричні пастельні service cards, дві контрастні B2B editorial картки, обережна мобільна типографіка.
2. Збережені шоста **світла** картка планування PR #59 та широка CTA «Leistungen entdecken», одночасно з більш динамічними кольорами й WCAG AA контрастом підписів.
3. У Studio власницькі title/description тепер синхронізуються з HTML/OG/Twitter метаданими, включно із самозакривними HTML meta тегами; HTML escaping, duplicate rejection, auth/CRM contracts не послаблено.
4. Підготовлені (не активовані!) webmaster proof meta для Google/Bing, `IndexNow` CLI тільки за окремим approve/key file із dry-run без мережі.
5. Від PR #64 byte-identical залишено `ConstructionDetail.astro`, `ConstructionFaq.astro`, `SiteStudio.tsx`, Studio Worker, VPS server, dynamic sitemap і `verify-live-artifact.mjs`. SQL-міграцій, нових пакетів і секретів немає.
6. Доданий **read-only parity gate** `scripts/verify-sitemap-parity.mjs`, що блокує непогоджене зникнення раніше опублікованих URL під час випуску. Немає override, автопублікації або мережевих звернень у CLI.

## QA точного джерела

- Node 24.22.1 cached Docker, `npm ci --offline --ignore-scripts`, no-network: Astro/Vue/Svelte check PASS; Vitest **151/151**, Node tests **30/30**, VPS auth/Studio/DB-backup integration **18/18**; build/static verifier **PASS** (103 HTML).
- Еквівалент reflow (не фізичний zoom): Chromium **24/24** сторінкові перевірки, **6/6** reflow/keyboard/reduced-motion, footer clearance PASS у чотирьох мовах. Не знайдено горизонтального переповнення на перевірених ширинах.
- Публічний VSP artifact із кодом `4580e30...`: SHA-256 `2df31ec03654f9e69e8e1ea8ec3d4e541602fcb8cbbcd0540fa96917d260c8e6`. З Dummy Google/Bing verification tags: окрема тестова збірка `bb6781ec7df756083be270519b48a6f64a9327fc26560af3a212bfd0380b27e3`.
- Після додавання sitemap gate: Node tests **35/35** та Vitest **151/151** на `ac9da47cad26b65efef81afd08ad47bc4cb6bffe`; `git diff --check` PASS.
- Стандартні обмеження: не перевірені фізичний пристрій, реальний 200% браузерний zoom, screen reader, 75th-percentile field CWV, особистий owner UAT та незалежне security acceptance.
- Машинні receipts: [evidence/pr50-pr64-reconciled-qa-20261025.json](evidence/pr50-pr64-reconciled-qa-20261025.json). Скриншоти з контрольними SHA256 збережено у захищеному QA-каталозі VPS (шляхи в JSON), без доступу до персональних даних.

## Підтверджений release blocker: **16 URL відсутні**

Реальний `https://kneba.vsp.rest/sitemap.xml`: **88 loc / 440 hreflang**. Поточний кандидат: **72 loc / 360 hreflang**.

Пропущено рівно чотири авторські статті в кожній з DE/EN/UK/RU:
- `/ratgeber/baureinigung-phasen/`
- `/ratgeber/baureinigung-kosten-planen/`
- `/ratgeber/bauuebergabe-checkliste/`
- `/ratgeber/bauendreinigung-vorbereiten/`

В ізольованій VPS-копії після build підтверджено: parity CLI повертає `FAIL / URL_REGRESSION` з **16 точними адресами**, current pointer `5b5261...` не змінювався. Це **коректний блокер, не FAIL тесту**. Зміст цих сторінок живе в поточному релізі, але його публічний source push має AUTO_REVIEW blocker; не копіювати його source bundle в GitHub без розв’язання цієї перевірки.

### Неприпустимі скорочення

Не розгортати candidate 72 URL поверх live 88. Не публікувати placeholder/thin/дубльовані SEO pages, не видавати показники GSC/WCV без підключень, не вимикати мережеву/бюджетну/owner safety gate. Не виконувати `docker prune`, не видаляти спільні VPS-релізи, кеші чи дані «для економії» без аудитованого переліку.

## Runbook: release acceptance (далі)

1. Завершити дозволене **review** source recovery `5b5261...`, перенести 4 доказові guide templates/контент 4 мовами або окремо формально погодити зміни URL.
2. Зібрати candidate і зробити **два окремо збережені sitemap snapshots**. З каталогу `corporate-site/`:
   ```bash
   node scripts/verify-sitemap-parity.mjs \
     --current /absolute/captured-live-sitemap.xml \
     --candidate /absolute/candidate-dist/client/sitemap.xml \
     --current-origin https://kneba.vsp.rest \
     --candidate-origin https://kneba.vsp.rest
   ```
   Очікуваний до випуску результат — `PASS`, **0 пропущених URL** (88+). Слід зафіксувати стабільний `/srv/knaba/vps/current` і достовірність незалежних hashes.
3. Після окремого UAT/security/legal та release approval — тільки керований dev preview deploy з поточним lock/CAS, online SQLite backup/restore, file hash readback, rollback і 4-мовним HTTPS smoke; ніякого автоматичного `main` merge.
4. Слідом, і лише після підтвердження власності та дозволу власника, налаштовувати GSC/Bing submit, CMP/consent analytics, IndexNow (якщо потрібно). Ключі не в Git і не в логах.

**Зараз:** Candidate reviewable, але `RELEASE_BLOCKED_URL_REGRESSION`. Платних provider dispatch немає, live/DB не змінено.

## Завершення відновлення 88 маршрутів — оновлення 25.10.2026

Цей розділ **замінює попередній статус `RELEASE_BLOCKED_URL_REGRESSION`** для нової гілки PR #66, але не стирає історичного факту виявленої регресії.

- Внесено чотири **нові оригінальні** інформаційні порадники DE/EN/UK/RU із реальними розгорнутими змістовими секціями, чеклістами, структурованими даними `Article`, перелінкуванням та локалізованими CTA. Приватний source bundle активного VPS не копійовано й не завантажено до GitHub; зафіксовано лише семантичні теми вже публічних сторінок.
- Статична збірка тепер має **117 HTML**, **88 `<loc>`**, **440 `xhtml:link`**. Дві попередні DE/RU legacy-заглушки відповідного slug замінені повноцінним матеріалом без дублювання маршрутів.
- Порівняння *фактично захопленого* `https://kneba.vsp.rest/sitemap.xml` із точним `dist/client/sitemap.xml` через `verify-sitemap-parity.mjs`: **PASS**, `currentCount:88, candidateCount:88, missing:[], added:[]`. Release pointer `b14b0be1cfd43100afb073780da7c4bd1e8e6c99` був сталим протягом цього порівняння. При новому релізі — повторити, не використовувати застарілий результат.
- **Повністю перевірений executable SHA:** `5f65461b2b1aee8c50c0876f1df2f1a2c05e34cc`. Node v24.22.1, cached offline dependencies: `npm run check`, `npm test`, `npm run build`, `npm run verify:build`, `node --test vps/*.test.mjs` — PASS. **157/157 Vitest, 35/35 Node, 18/18 VPS**.
- Статичний збірний артефакт SHA256: `22bdf11283cb7b98af9edc34aac416007bbef1d175fa4a4b4c2a3bc2473990f7`. CSS gzip 34 843 bytes, emitted client JS gzip 182 659 bytes — **не** польові Web Vitals.
- Chromium у приватній мережево-ізольованій тестовій копії: **22/22 guide scenarios**, **24/24 marketing scenarios**, **6/6 reflow** (еквівалент viewport, не фізичне масштабування). Додатково виправлено дворядкове `01` у мобільному чеклісті та локалізацію заголовка чекліста. Український 390px знімок візуально перевірено.
- IndexNow `--dry-run` з 88 публічними URL: **0 надсилань**. Жодного фактичного додавання до Google/Bing не відбулося.

**Поточний релізний стан: `DRAFT_REVIEW_READY_NOT_DEVICE_OR_OWNER_ACCEPTED`.** Новий blocking stage: незалежний code/security review, перевірка фактичним власником KnaBa чотирьох перекладів/заявлених послуг, GDPR/legal/consent, реальний мобільний/збільшений шрифт і screen reader, польові CWV, перевірена авторизація власника Studio, replay/CAS поточного релізу, backup+rollback. Права публікації на офіційному `knaba.de` та merge не надавалися.

Докази: [QA evidence](evidence/knaba-guides-88-route-parity-2026-10-25.json). Відновлені файли не містять секретів, платних зовнішніх AI SDK, платіжних викликів або доступу до live SQLite.
