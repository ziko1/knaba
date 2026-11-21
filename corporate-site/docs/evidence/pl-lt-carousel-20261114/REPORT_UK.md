# KNABA — блок ілюстрацій PL/LT, 14.11.2026

Запит: «виправ де блок картинок на польський и литовський локализации», три screenshots PL/EN/LT. Project: KNABA, не AVENQO. Source base — remote PR141 `16e72ae4ecbbf9a382512a2e7fb88129c74b0803`. Source fix — `bc919ecba405c71b22798f62e8023ec6aaa5c9f7`. Гілка `fix/pl-lt-home-carousel-20261114`; чужі незавершені зміни іншого checkout не переносились.

## План та приймання

| ID | Вимога | Реалізація та докази | Статус |
|---|---|---|---|
| IMG-01 | Повернути блок картинок на /pl/ і /lt/ | Спільний ServiceCarousel лише на regional homepage; 8 оригінальних зображень, eager перше/lazy решта; built HTML gate | SOURCE PASS |
| IMG-02 | Зберегти локалізацію | Чинні PL/LT назви/описи, нові переклади кнопок, ARIA, alt і підказки; focused tests | SOURCE PASS |
| IMG-03 | Дійсні посилання, без вигаданих статей | Німецькі detail routes з видимим (DE) і hreflang=de; усі assets/посилання перевірені у build | SOURCE PASS |
| IMG-04 | Адаптивність та керування | Спільна чинна JS-логіка, responsive hero grid, розширений browser script; післявиправні interaction/viewport checks не завершені | BLOCKED_ENV |
| IMG-05 | Внести на живий knaba.de та перевірити | SentinelX read allowlist порожній; /srv/knaba повернув path_not_allowed. Runtime lineage/config не прочитані | BLOCKED_ACCESS |

## Причина та зміни

PL/LT маршрути використовували RegionalPublicPage без ServiceCarousel. Англійська використовує ConstructionHome зі слайдером. Живий CUA DOM підтвердив PL=0, LT=0, EN=1 carousel/8 slides. Нова реалізація повторно використовує наявний carousel, ілюстрації та PL/LT словники, не розширює ConstructionLocale для неперекладених статей. Інші regional pages залишаються без carousel. Auth, дані, міграції, DNS, dependencies та провайдери не змінені.

Координатор `/root` — реалізація/інтеграція; незалежний `/root/carousel_review` — source review, повторні 13 focused tests, читання зібраних HTML, перевірка CSS-витрат. Reviewer також прибрав застарілі перекриті mobile CSS; координатор перевірив diff і повторно зібрав artifact. Знайдене reviewer перекриття home h1 виправлене окремою специфічністю.

## Фактичні перевірки

- Node 24.22.1; check: 0 errors, 0 warnings, 29 hints.
- Site: 749 Vitest + 92 Node tests PASS; root: 36 PASS. Після цих запусків змінювалися лише CSS, build assertions та документи; логіка slides/локалізації незмінна.
- VPS: фінальний запуск після завершеного build — 406/406 PASS. TMPDIR розміщений на workspace filesystem з достатнім вільним місцем; production disk guard не змінений.
- `KNABA_RELEASE_MODE=official npm run build` і `verify:build`: PASS, 161 HTML; source catalog 28 routes/1102 units; i18n 36 pages/24 SVG/6 social assets; CTA/icon gates PASS.
- Static artifact SHA-256 з build verifier: `cf2f78f396f43b5a4ebcad06156864194b00417d05a3088cddf6e3321e225a04`. Це локальна official-mode збірка, не deployment.
- Source snapshot/module gates PASS на clean committed `17d4461826a417de30c4aad54e8b0992ad3e4fd3`; наступний commit змінює тільки тестовий CSS budget. Фінальна clean-source перевірка фіксується при передачі.
- Independent focused Vitest 13/13 PASS; PL/LT built output: по одному carousel, 8 існуючих images і 8 existing German destinations; по 5 інших regional routes без carousel.

## Попередні невдалі перевірки, збережені чесно

1. Перший VPS run почався до завершення build: missing dist/vps/render-page.mjs. Частина backup tests також зупинилась на справжньому guard 5 GiB, оскільки /tmp filesystem має лише 4.9 GiB. Послідовність виправлена, тимчасові test databases перенесені до workspace; фінальний run PASS.
2. Build checker спочатку не дозволяв decorative carousel images на PL/LT homepages. Allowlist розширено рівно двома домашніми маршрутами та додано assertions: один carousel, вісім слайдів, видима мова DE, реальні routes. Перевірки інших сторінок залишені строгими.
3. Старий CSS budget 40 KiB перевищено через витягнення shared carousel stylesheet. Після видалення перекритих CSS і незалежних вимірювань погоджено окрему feature revision до 40.5 KiB (+512 B ceiling), не заявляється PASS проти старого ліміту.
4. Source catalog спочатку не збігався через staging build domain: рівно 6 source-text differences kneba.vsp.rest vs knaba.de, кількість 1102 незмінна. Final build виконаний у official mode; source catalog не перегенеровували для приховання різниці.
5. CUA live baseline доступний, але loopback preview недоступний (connection refused). Локальний Chromium test gate завершився exit 1 до відкриття сторінки: socket() Operation not permitted. WebKit/Firefox binaries відсутні. Налаштування захисту не змінювали; browser-after = BLOCKED_ENV, не PASS.

## Розмір CSS — feature budget revision

Порівняння Node gzipSync, сума emitted CSS; baseline — наявний попередній build у checkout mobile-account-locale, CSS inputs baseline не зачеплені його account fix.

| Метрика | До, B | Після, B | Зміна |
|---|---:|---:|---:|
| Усі CSS assets | 40930 | 41247 | +317 (+0.775%) |
| EN referenced stylesheets | 22918 | 23235 | +317 |
| PL/LT referenced stylesheets | 15458 | 17153 | +1695 |

Shared carousel CSS =1695 B gzip, доданий у дві локалі. Layout byte-identical SHA-256 `4454a3caba47840ea6cd4ec90a583637b813fa49446d8d04ba1c2f2e8d856a4c`. Нових images або dependencies немає. Ceiling41472 B, залишок225 B. Це оцінка зібраних assets, не network transfer, p95 чи field Web Vitals.

## Межі, наступний крок і rollback

Результат: source candidate, не LIVE_VERIFIED і не production-ready release. Потрібен доступний preview browser для widths320/390/768/1280, всіх image decode, arrows/dots/Home/End та реального переходу CTA; потім штатний scoped доступ до серверного release path, звірка фактичного runtime source/artifact і погоджений rollout. Не застосовувати весь PR141 наосліп: серверний стан невідомий.

Source rollback: revert тільки commits цієї гілки або повернення до вказаного base у candidate. Production rollback не виконувався; поточний server artifact не встановлений. No merge, production deploy, paid service activation, live messages or data mutation. Витрати сторонніх API не активовано; runtime credit usage невідоме.
