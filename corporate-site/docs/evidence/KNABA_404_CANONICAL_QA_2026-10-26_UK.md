# KNABA — 404 canonical/OG metadata QA, 26.10.2026

## Дефект і мінімальне виправлення
- Base: PR #83, source HEAD 3bb3e0332912d2a0041ea7f64e5b767ede64e697.
- До виправлення згенерована 404-сторінка мала robots noindex, але також canonical та og:url на https://kneba.vsp.rest/404/ — неіснуючу звичайну SEO-сторінку.
- У src/layouts/Layout.astro додано опціональний omitCanonical=false, який приховує тільки canonical і og:url; src/pages/404.astro вмикає noindex + omitCanonical.
- Чинний tests/verify-build.mjs доповнено двома регресіями: відсутність canonical/og:url на 404 і збереження canonical на 121 інших сторінках. Немає нових компонентів, залежностей або дубльованого QA механізму.

## TDD і виконані перевірки
- RED відтворено на старому dist: Node24 verifier exit 1, 404 must not publish canonical URL. Некоректний початковий regex тестового harness виправлено перед достовірним RED.
- На незмінних вихідних змінах: Node v24.22.1, pinned npm ci, npm run check, npm test успішні в першому циклі.
- Перша збірка була BLOCKED_BY_LOCAL_FIXTURE: успадкований з immutable stage режим 0555 тестової копії dist/.openai спричинив EACCES. Права змінено лише в окремому /tmp QA checkout, не в активній версії.
- Після виправлення тестового каталогу: KNABA_RELEASE_MODE=vsp npm run build; npm run i18n:verify; npm run verify:build; npm run test:vps — exit 0, VPS тести 24/24 PASS.
- Незалежний postbuild audit: 122 HTML, з них 121 з canonical + og:url та одна 404 без обох полів із noindex; для кожної сторінки по 1 H1 і 1 tel; жодного старого домену в outbound customer anchors.
- Верифікований artifact SHA256 d8cbf28ac3cc5f8bfd34ca0a41926bbe7f88667dea30a237e4cddd7bd74a2fae. Через randomized Astro island UID повторний build може мати іншу byte identity — прив'язувати deploy лише до конкретного tested artifact.
- Результати й журнали: VPS /srv/knaba/vps/evidence/knaba-pr84-404-20261026. Ці файли не містять приватної БД чи паролів.

## Реальні обмеження / RELEASE HOLD
- Ніяких змін owner data, SQLite, DNS, секретів, платних API, production merge або публічного preview cutover.
- Чинний kneba.vsp.rest лишається старим runtime. Source/isolated QA не дорівнює live acceptance.
- Chromium із увімкненим sandbox у наявному Docker BLOCKED; минулі no-sandbox-запуски не вважаються secure browser PASS. Physical device, browser zoom і screen-reader — NOT_RUN.
- Off-host DB backup+restore, права клієнта на зображення/логотипи, owner UAT, live delivery, незалежний review, lease/CAS і rollback залишаються OPEN.
