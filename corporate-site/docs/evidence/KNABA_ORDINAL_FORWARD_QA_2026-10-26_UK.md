# KNABA — точна нумерація карток у forward-інтеграції (26.10.2026)

## Мета та межі
- Фото дефекту: у четвертій картці на головній та в каталозі показано `04 / KnaBa` замість лише `04`. Старіше виправлення PR #77 не входило в актуальнішу PR #82; цей документ фіксує перенесення у Draft PR #83.
- База `5d52c75dc3ea383c5726c8ea284f98ea52923bde` (PR #82). У `ConstructionHome.astro` і `ConstructionCatalog.astro` видалено лише візуальний суфікс до `constructionGridOrdinal(i)`; решта структури, логотипів, іконок, карток, href, телефонів, чотирьох локалізацій, API, авторизації й ERP не змінена.
- Посилено існуючий `tests/check-project-cta.mjs`: на всіх восьми побудованих DE/EN/UK/RU home/catalogue сторінках вимагається точна мітка `01`…`06`, не лише її перші два символи.

## Перевірка першопричини та i18n
- До змін HTTP-запити до `https://kneba.vsp.rest` повернули HTTP 200 для 8/8 home/catalogue URL, кожен мав маркер `04 / KnaBa`. Для home було 4 tel anchors, для catalogue 2. Це живий старіший реліз, не новий source.
- У чистому QA checkout при першому `verify:build` був справжній FAIL `SOURCE_CATALOG_STALE_RUN_EXTRACT`; тест не позначено PASS.
- Штатні `scripts/i18n-source-catalog.mjs extract` / `verify-source` підтвердили новий каталог: 26 маршрутів (було 26), 945 німецьких статичних одиниць (було 946), **видалено рівно одну** одиницю `04 / KnaBa`, жодної нової та жодної іншої зміненої. Каталог Git blob `5217c8ec95aea383039924441c39c2dece51c644` побайтово збігається з реально згенерованим на VPS. Цільові мови: 99, з них 4 опубліковані та 95 pending, без створення/перезапису draft-перекладів.

## QA на ізольованому VPS checkout
- QA робоча директорія `/tmp/knaba-forward-ordinal-qa-20261026`, вихідна база до regenerating i18n `048fe76a38e296f720802fbe75a48c395ca5d06e`; відповідний сформований i18n-блоб збережений наступним commit `e6f7c9a0c232c74d7e29ff1c4a05e130055cd327`. Важливо: це зафіксований source + каталог; остаточний HEAD після документування треба перевірити повторно.
- Node v24.21.0, npm v10.9.9; чистий `npm ci` 509 пакетів, без engine mismatch; `npm run check` PASS: Astro 0 errors / 0 warnings / 4 hints, Vue + Svelte також PASS.
- `npm test` PASS: 196 Vitest, 25 + 27 + 9 native Node.
- `KNABA_RELEASE_MODE=vsp npm run build` PASS: 122 HTML сторінки.
- Після штатної актуалізації каталогу: `npm run verify:build` PASS (включно з 8 повними цифровими підписами та 52 SVG icon placements); `npm run i18n:verify` PASS; `npm run test:vps` PASS (24/24); `git diff --check` PASS.
- Згенерований, **не розгорнутий** локальний артефакт має SHA-256 `203ec177fa190aa27221f43f80e73e901988eea14c5b49dc7c10a01795d345c2`; field CWV і network transfer НЕ виміряні.
- Звіти лежать лише в тимчасовому QA workspace і не є published artefacts; команди відтворення нижче, підсумок фіксується також у PR #83.

## Повторити на Node >=22.23.4 та npm >=9.6.5
```bash
cd corporate-site
npm ci --no-audit --no-fund
npm run check
npm test
KNABA_RELEASE_MODE=vsp npm run build
KNABA_RELEASE_MODE=vsp npm run verify:build
npm run i18n:verify
npm run test:vps
```

## Не закриті релізні gates
- На момент HTTP-аудиту live `/healthz` і `/readyz` = 200; `/galerie/` і `/uk/galerie/` = 404. Це невідповідність старого live релізу, а не доведений дефект нового build.
- Live source/manifest, незакомічені зміни іншого QA checkout, права на медіа, user/browser/device acceptance на **точному** кандидатові, screen reader, власник/доставка заявок, незалежний review, off-host backup+restore, release lease/rollback і дозвіл власника ще відкриті.
- **RELEASE HOLD:** не merge PR #83 або PR #82, не розгортати, не міняти DNS, БД, секрети, права браузера чи оплачувані сервіси. Спочатку завершити gates, далі окремий дозвіл на контрольований preview cutover.
