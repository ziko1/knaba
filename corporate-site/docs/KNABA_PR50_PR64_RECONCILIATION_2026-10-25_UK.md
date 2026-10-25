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
