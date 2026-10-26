# KNABA — відновлення правильного порядку блоків (26.10.2026)

## Джерела і збережені вимоги
- Репозиторій: ziko1/knaba. База: 2164b9505f824486594b2633a05f5fd91aee8c04 (Draft PR #85), звірено з активним release symlink і HTTP.
- UX-джерело: PR #84 commit c1a742c2f5a5a1409cc975172ad5a82d93324c50, перенесено потрібні зміни поверх актуальної бази без втрати PR #83 (точні 01–06) чи PR #85 (404 без canonical).
- З історії користувача: зберегти всі шість карток з четвертою проєктною, п'ять партнерів, відгуки, FAQ, галерею, 2D-слайдер і KNABA Assistant, чотири мови, не дублювати телефони/CTA, не змішувати з AVENQO.
- Порядок: hero → шість послуг → додаткові роботи → процес → компанія → партнери → відгуки → FAQ → фінальна заявка. Контекстний CTA для додаткових робіт, єдина кнопка каталогу в hero, семантичні секції, фокус і мобільна ширина.
- Конфлікти у CSS, регресіях і i18n вирішено вибірково. Дубль перевірок каталогу усунено без втрати перевірки порядку.

## Відтворений QA на ізольованому checkout VPS
- Node v24.21.0, npm 9.2.0. npm ci --ignore-scripts --no-audit --no-fund за lockfile: PASS.
- npm run check: PASS (Astro 0 errors / 0 warnings / 4 hints, Vue та Svelte також PASS).
- npm test: PASS (196 Vitest + 39 Node + 27 Node + 9 Node), усі без збоїв.
- KNABA_RELEASE_MODE=vsp npm run build: PASS; зібрано 122 HTML.
- npm run i18n:extract + i18n:verify: PASS; 26 DE routes, 944 текстові одиниці; digest 35b54617da4cb66728419a2b971f9cc2bd72a6341f058ed619027cad0d0395aa. Застарілого 04 / KnaBa немає, 95 неперекладених мов лишаються pending.
- KNABA_RELEASE_MODE=vsp npm run verify:build: PASS; 122 HTML, 8 home/catalogue точних нумерацій, 52 SVG placements, SEO та перевірки порядку/дублювань.
- KNABA_RELEASE_MODE=vsp npm run test:vps: PASS 24/24.
- Окрема HTMLParser-перевірка чотирьох зібраних головних сторінок: 9 правильних секцій, 5 партнерів, 1 телефонне посилання кожною мовою.
- Разом 295 окремих тестових випадків (196+39+27+9+24), HTMLParser та збірка не додаються до цього числа.
- Верифікований artifact SHA256: 0c2f4bed4d02e1dfc2792af7283d3c18c883d53d645a70a161f927ee36c8da7f. Це саме зібраний static artifact, не live і не git commit.
- Під час QA виправлено початкове подвійне оголошення extrasLabel у verify-build та повторено команду verify:build з тим самим KNABA_RELEASE_MODE=vsp, що й build.
- git diff --cached --check: PASS після завершення підготовки.

## Межі
- Немає підтвердженого реального браузерного скріншотного QA, фізичного мобільного тесту, zoom 200%, screen reader, незалежного review чи UAT клієнта (NOT_RUN/BLOCKED_BY_BROWSER). Обмежень browser sandbox не обходили.
- Не підтверджено в цій задачі права на медіа, наскрізну доставку заявки/авторизацію власника, backup+restore і rollback.
- Не змінено DNS, БД, власницькі дані, платні API, ERP, knaba.de або публічний VPS. Лише підготовка Draft PR; production merge/cutover потребує окремого дозволу.
