# KNABA DE

KNABA — платформа будівельних послуг і прибирання: багатомовний корпоративний сайт, кабінети клієнтів і команди, Studio для власника та окремий ERP-модуль. Ця гілка містить інтеграційний кандидат, а не підтверджений production-реліз.

**Статус: NOT READY FOR CLIENT DELIVERY.** Реалізація й локальні перевірки не підтверджують роботу на сервері замовника, пристроях або в зовнішніх сервісах. Поточні результати та блокери: [звіт про готовність](docs/unified/COMPLETION_STATUS_2026-11-07_UK.md). Поточна консолідація й перевірки точного SHA публікуються у [Draft PR #123](https://github.com/ziko1/knaba/pull/123); історичний зелений checkpoint шаблонів — [PR #121](https://github.com/ziko1/knaba/pull/121).

## Що є в репозиторії

| Каталог | Призначення |
| --- | --- |
| `corporate-site/` | Astro/TypeScript, Worker API та VPS runtime, SQLite/D1, публічні сторінки DE/EN/PL/LT/RU/UK, кабінети, CMS/CRM та Studio |
| `erp/` | Окремий PostgreSQL ERP, API, операційні модулі й автоматичні тести |
| `erp/apps/mobile-android/`, `erp/apps/mobile-ios/` | Наявний native workspace; його пристроєва й релізна готовність перевіряється окремо |
| `ops/`, `deploy/` | Наявні засоби експлуатації та опис модулів; самі файли не означають розгортання |
| `docs/unified/` | Межі інтеграції, roadmap, backlog, memory та правила приймання |

Сайт зберігає звернення у SQLite/D1. Єдина стійка черга нових погоджених анонімних заявок передає мінімальний підписаний envelope до PostgreSQL ERP з прив’язкою компанії, незмінним ключем повтору та перевіркою квитанції. Доставка вимкнена за замовчуванням; потрібні погоджені server-side mapping/keys/privacy settings. Спільна ідентичність сайт↔ERP і повне приймання інтеграції залишаються відкритими. PostgreSQL є джерелом операційних даних.

## Вибір і завантаження оформлення сайту

У Studio додано `/studio/templates/`: три вбудовані оформлення, завантаження власного ZIP-пакета KNABA v1, ізольований перегляд, чернетку, явну публікацію та історію з відкатом. Доступ до API має власник. Зміна оформлення зберігає контент, заявки та кабінети.

Формат v1 містить `template.json` і необов'язковий `LICENSE.txt`; він задає перевірені кольори, радіуси, щільність і один із довірених пресетів. Довільні HTML/JS, теми WordPress і додаткові assets не імпортуються. [Формат, користування, API та rollback](corporate-site/docs/SITE_TEMPLATES_UK.md).

## Локальна перевірка

Використовуйте Node.js 24.22.1 та lockfile кожного модуля. Root не має спільної команди встановлення залежностей для всіх застосунків.

```sh
npm test
npm run audit:source
npm run verify:modules
cd corporate-site
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
ASTRO_TELEMETRY_DISABLED=1 KNABA_RELEASE_MODE=official npm run build
KNABA_RELEASE_MODE=official npm run verify:build
npm run test:vps
```

`official` лише збирає canonical URL knaba.de та відповідні метадані, не публікує сайт. Для preview використовуйте `KNABA_RELEASE_MODE=vsp`. Браузерний сценарій шаблонів: `node tests/site-templates-browser.cjs`; він потребує встановленого дозволеного браузера й повертає BLOCKED, якщо його немає.

ERP: у `erp/` виконайте `npm ci --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, `npm run build`, `npm test`. SQL-сценарії потребують окремої порожньої тестової PostgreSQL і міграцій; SKIP не є PASS. Точний CI з PostgreSQL описано в [CI_SETUP](docs/unified/CI_SETUP_2026-11-07_UK.md).

## Безпека поточного кандидата

ERP обмежує складність JSON перед Zod і розмір відповідей AI/Maps/WhatsApp. Це mitigation; dependency advisory Zod3 лишається відкритим. [Обсяг і межі захисту](erp/docs/VALIDATION_RESOURCE_BUDGET_2026-11-07_UK.md).

## Передача та експлуатація

Історичні acceptance-документи нижче залишаються вимогами, а не доказом виконання. Production, DNS, платні провайдери, merge та реальні дані потребують окремого погодження. Секрети зберігаються поза git. Перед розгортанням потрібні резервна копія, перевірка міграцій, відповідність artifact/SHA та план відновлення. Єдиного готового клієнтського архіву ця гілка ще не засвідчує.

## Консолідація завершених частин — 08.11.2026

Ця інтеграційна гілка поєднує [PR #121](https://github.com/ziko1/knaba/pull/121) із [PR #122](https://github.com/ziko1/knaba/pull/122): керування оформленням, ресурсні обмеження ERP, Android 0.4.1 із відновленням незавершених команд, атомарну публікацію Studio, контакти/footer/favicon та передавання заявок. Середовище замовника не змінено. Приймання попередніх гілок не переноситься автоматично на цю композицію.

Збережені аудит і план: [COMPLETION_PLAN](docs/unified/COMPLETION_PLAN_2026-11-08_UK.md), [реєстр 114 вимог](docs/unified/REQUIREMENTS_TRACEABILITY.csv), [карта 72 критеріїв V4](docs/unified/AC_EVIDENCE_MAP_2026-11-08_UK.md). Історичні позначки відсутнього template manager або bridge оцінюйте разом із новим кодом і його власними тестами; вони описують попередні snapshots.

Сайтова передача використовує одну чергу `site_erp_outbox` і чинний підписаний ERP endpoint. Запуск вимкнений до явної конфігурації перевіреного призначення. Передаються мінімальні поля Lead і посилання на початкову заявку; це не видає ERP-прав користувачу сайту. Автоматичне перенесення історичних записів відсутнє. Єдина авторизація, зовнішні канали, повні browser/device/restore/load перевірки й приймання замовником залишаються окремими незавершеними частинами.

[Android 0.4.1](docs/mobile/TEST_ANDROID_0.4.1_UK.md) має окремі source/artifact receipts; його попередній debug APK не є релізною збіркою всього інтегрованого кандидата. [Максимальний строк запрошень ERP](erp/docs/INVITATION_TTL_2026-11-08_UK.md) узгоджується з вимогою 24 годин.

## Технічне завдання V4 — 08.10.2026

- [Повна нормативна специфікація](KNABA_DE_MASTER_SPEC.md): 24 блоки вимог, 72 acceptance criteria, API-контракти, ролі, стани, формули та умови приймання.
- [Реєстр приймальних перевірок](docs/specification/KNABA_DE_Acceptance_V4.csv).
- [Короткий PDF-огляд на 3 сторінках](docs/specification/KNABA_DE_Developer_Brief_V4_UK.pdf).
- [Повний пакет для розробника (ZIP)](docs/specification/KNABA_DE_Developer_Package_V4_UK.zip).
- [Перевірки узгодженості документа](docs/specification/DOCUMENT_VALIDATION.json).
- [Контрольні суми опублікованих файлів](docs/specification/SHA256SUMS.txt) — перевірка від кореня репозиторію: `sha256sum -c docs/specification/SHA256SUMS.txt`.

Канонічна специфікація в репозиторії — `KNABA_DE_MASTER_SPEC.md`; у ZIP її первинна назва — `KNABA_DE_Technical_Spec_V4_UK.md`.

Це історичний комплект ТЗ. Контрольні розрахунки та комплектність документа перевірено; початкові тести продукту в CSV мають статус `NOT_RUN`. Їх не можна автоматично закрити результатами unit-тестів або збірки.
