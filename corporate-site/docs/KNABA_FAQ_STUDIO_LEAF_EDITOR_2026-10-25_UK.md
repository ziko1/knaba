# KNABA — виправлення візуального редагування FAQ у Studio

Дата: 25.10.2026. Підготовлено окремо від релізу `kneba.vsp.rest` та офіційного `knaba.de`.

## Вихідний дефект та точний scope

У PR #51 чотири FAQ-шляхи були включені до переліку доступних публічних сторінок власника (72 варіанти), але перевірка `validateStudioEntries` блокувала текст усередині семантичних FAQ-акордеонів, тому що selector path містив `details` та `summary` — теги були відсутні в переліку безпечних ancestry tags.

Ізольований Chromium на реально доступному `/uk/faq/` підтвердив актуальні DOM-селектори:
- Запитання: `#main > section:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > section:nth-of-type(1) > div:nth-of-type(1) > details:nth-of-type(1) > summary:nth-of-type(1) > span:nth-of-type(1)`.
- Відповідь: той самий шлях до `details`, далі `> p:nth-of-type(1)`.

На момент підтвердження активний VPS pointer зберігався на `7e774c32863ad6b9f90a95288b5bd3495d941a51`; реліз не оновлювали через невідповідність між його SHA і доступними GitHub commit refs.

## Мінімальне виправлення

`corporate-site/src/lib/site-studio-contract.ts`:
- `details` і `summary` дозволені **лише як сегменти безпечного шляху до leaf-тексту**;
- пряме редагування `details` чи `summary` (текст, стилі або підміна блоку) завжди відхиляється;
- фактично редаговані вузли залишилися штатними `span` та `p`, з обмеженням довжини, перевіркою тексту і HTML-екрануванням;
- не додавали довільного HTML, CSS, JS, зовнішнього медіа, endpoint, ролей, міграцій, нових бібліотек чи функцій масової заміни FAQ.

## TDD, вихідний SHA і перевірки

Тестуваний executable SHA: `1d58071edecd79870c1f1bcd563e54ed70b35805`. База — PR #51 HEAD `5f4e3d1a8ce100578c90453c7e68bc3f59df91e7`.

**RED** до виправлення: Vitest `tests/faq-studio-edit.test.ts` — 1 failed, 2 passed, помилка `StudioInputError: Dieser Seitenbereich darf nicht bearbeitet werden.`; Node SSR `vps/faq-studio-editor.test.mjs` — 1 failed, 1 passed, відсутня підміна запитання через ранній reject.

**GREEN** після зміни:
- Vitest focus **3/3**, SSR Node focus **2/2**;
- повний Node24.22.1 `npm run check`: Astro/Vue/Svelte 0 errors, 0 warnings;
- `npm test`: **147/147 Vitest**, **8/8 inquiry Node**;
- `KNABA_RELEASE_MODE=vsp npm run build && npm run verify:build`: **103 pages**, `VSP_PENDING_APPROVAL`, links PASS;
- `node --test vps/*.test.mjs`: **18/18 PASS**;
- кандидатний (не встановлений на VPS) build artifact SHA256: `f6722b4c304b63293b3fddaa067a4a2c54f9b9ac16925fc9e926fbe54dd5929a`.

**Ізольований Chromium UI smoke**: локальна копія `/uk/faq/?knaba_studio_preview=1` (без owner cookies/production data), 390×844. `PREVIEW_LEAF_EDIT_PASS`: редактор виділив leaf `span`, передав правильний selector, застосував валідовану текстову зміну через message contract, відновив оригінал через пустий draft, збережені 42 пункти і горизонтальний overflow=0. Це тестує механіку редактора, **не** реальну авторизацію або write API.

## Незакриті релізні ворота

- **NOT_DEPLOYED**: source-only candidate, чинний `kneba.vsp.rest` не перемикали.
- Реальний owner акаунт ще не підтверджений; `/readyz` раніше повертав 503. Не створювати акаунт із публічного email та не дублювати/надсилати пароль у чат.
- Запис/публікація/відновлення історії через справжнього авторизованого власника не проходили UAT.
- Сам Studio зараз **не** дозволяє додавати/видаляти FAQ-пункти довільно: зміна вже наявних Q/A і SEO тексту, а не повний структурований FAQ CMS. Для CRUD потрібні окремі контракт, авторизація, журналювання та rollback.
- Попередньо виявлено live SHA, відсутній у remote GitHub. До будь-якого VPS deploy потрібен свіжий remote commit, source-to-artifact receipt, незалежне review, online SQLite backup, release lock, безпечне атомарне перемикання і QA на точному SHA.
- Основний `knaba.de`, `main`, DNS, email, Stripe, зовнішні платні AI-провайдери, поточні SQLite дані й резервні копії не змінювалися.
