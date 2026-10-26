# KNABA — продовження контенту й функцій, 26.10.2026

Доручення: продовжити розвиток чинного KNABA, перевірити прогалини й доповнити продукт. Гілка `feat/knaba-content-refinement-20261026`, початковий HEAD `d48cc81ca3db4f689c3126ec60dd17a4192319b7`; live на початку `cecb321ac41106c7a4f6da2d4a98308508852b38`. Зберігаємо попередній аудит, корпоративний сайт, портал і наявні контракти.

| ID | Зміна | Критерій | Власник / стан |
|---|---|---|---|
| REUSE-01 | Інтегрувати чинні PR89/90 без втрати PR91 | Збережені точні теми/межі форми, keyboard Assistant, нові body/migration guards, тематична підготовка та 4 локалізовані workflows; усі регресії проходять | root / інтеграційна база ac21d63 |
| CONTENT-01 | Змістовна підказка Finder для типу об’єкта | Кожен із 4 типів змінює підготовчі поради DE/EN/UK/RU; потреба окремо визначає послугу; незмінний CRM enum | ux_research / DONE; 12 нових перевірок |
| CONTENT-02 | Підготовка заявки на Bauhelfer | Один новий практичний порадник у 4 мовах, пов’язаний із реальною послугою, каталогом, sitemap, формою, друком і Studio route metadata | root / DONE; 4 нові локалізовані сторінки |
| CHAT-01 | Усунути застарілі async-відповіді Assistant | Single-flight polling; старі success/error після mutation/reset/restore/unmount не змінюють поточний діалог; deterministic race tests | code_audit / DONE; 16 race-сценаріїв |
| QA-01 | Прийняти об’єднаний кандидат | Node24 check/test/build/i18n/verify/VPS, independent review, exact SHA/artifact; runtime/device/live відокремлено | root + reviewers / PASS source/build/server; browser/device окремо |
| OPS-01 | Зберегти й перевірити дозволене тестове оновлення | Remote git readback; перед будь-яким cutover — healthy storage, current-source CAS, backup/restore й rollback | root / PREPARED; fresh canonical storage gate healthy89.64%, повторити під lock |

Команда: Codex `/root` — інтеграція/контент/QA, `/root/ux_research` — Finder, `/root/code_audit` — concurrency fix. Спільні scoped AGENTS і чинні ai-team-orchestrator/coding-autopilot/verify-repository-readiness. Платні сервіси/провайдери не активуються; фактичні runtime витрати невідомі. Власник інтеграційних файлів/канонічних документів — root; агенти не перетинають файли.

Факти Bauhelfer і регіону перевірено за https://knaba.de/ та https://knaba.de/leistungen. Новий текст — редакційна підготовка розмови, не твердження про виконані об’єкти, ліцензії, ціни або гарантовану доступність. Вигадані відгуки й клієнтські фото не додаються. Попередній mobile sandbox blocker не обходиться; реальне owner/device/provider приймання залишається окремим.


## Реалізовано та перевірено

- Повторно використано PR89 (`73755d1`) і PR90 (`1fd5860`), зберігши всі зміни попереднього PR91. Новіший live73755d1 є предком кандидата. Галерея тепер пояснює чотири напрями роботи й прямо позначає схематичні ілюстрації; це не портфоліо вигаданих об’єктів.
- Новий `bauhelfer-einsatz-vorbereiten`: 4 мови, 4 розділи, 6 пунктів підготовки; правильні service/contact links, sitemap, hreflang, Article metadata та Studio whitelist. Загалом 5 порадників / 20 локалізованих маршрутів і 96 маршрутів Studio.
- Finder: чотири типи об’єкта змінюють підготовку; фаза роботи має окрему підказку. Технічні роботи відділено від прибирання. Чинні CRM/service enums збережено.
- Assistant: single-flight polling і foreground actions, AbortController та generation/request identity guards; старі відповіді після reset/restore/unmount і застарілий clipboard result не змінюють поточний стан. Надсилання не стирає нову чернетку. Consent, bearer auth, CAPTCHA й 12-секундний timeout збережено.
- Незалежний взаємний review: code_audit перевірив Finder/порадник, ux_research — реальний diff Assistant і 16 race-тестів; блокерів немає. Уточнено текст про першу заявку й прибрано неточну обіцянку хронологічної послідовності ілюстрацій.

## Локальна QA

Node24.22.1; наявні pinned dependencies. `check`: Astro/Vue/Svelte0 errors/0warnings (4existinghints). `npm test`: Vitest250/250 у38файлах +Node32/32,27/27,9/9. VSP build і `verify:build`:126HTML, internal links/metadata/CTA/icons PASS. DEsource27routes/982units; 99targets/4published/95pending. VPS41/41. Загалом359автоматизованих тестів.

Початковий build verifier FAIL стосувався застарілого Russian route count35→36 після додавання порадника; виправлено і весь verifier повторно PASS. Немає schema/runtime backend/dependency changes проти73755d1; package.json змінює лише test script для успадкованої gallery regression.

Client artifact SHA256 `6a5fecdda37dbc4f273f03502116bf9b6d7bac6b317f15621c8083276530bbdc`; CSS40,891B gzip; all emitted JS191,544B gzip (це не network transfer/CWV). QA receipt і знебарвлені logs: `docs/evidence/content-continuation-20261026/`.

## Межі приймання

- Browser сценарії exact live artifact будуть записані окремо після дозволеного тестового rollout; source/unit PASS їх не замінює.
- Responsive320/390/768/1440, фізичні пристрої, screen reader/zoom, реальний owner/login/delivery/roles, legal/rightsholder review, offsite restore та field CWV лишаються OPEN. Відомий sandbox blocker не обходили.
- Наступні окремі прогалини: trusted-proxy rate-limit contract, OG raster compatibility, реальні затверджені кейси/медіа, owner і provider acceptance. Нові мови або підтверджені кейси не оголошено готовими.
- Read-only storage review не виявив активних посилань на старі dependency caches, але cleanup не потрібний за поточним canonical gate і не виконувався. Число89.64% отримано саме через чинний `inspectStorage`, не з округленого `df` чи іншої формули. Повторна перевірка під release lock обов’язкова.
