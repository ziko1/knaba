# KNABA — інтеграція FAQ Studio + верифікації артефактів (25.10.2026)

## Мета та точна база

- Відомий GitHub base: `5f4e3d1a8ce100578c90453c7e68bc3f59df91e7` — Draft PR #51.
- Інтегрований executable SHA: `b3e676dc411bac8c494b6f0b4aefbfd467b8b69c`.
- Reuse-first: точний код із Draft PR #53 (read-only pin SHA256/verifier/tests) та Draft PR #57 (безпечне редагування FAQ-питання/відповіді, contract/SSR/UX tests). Жодного broad merge.
- Порівняння з base: 1 commit, **10 змінених шляхів** — `package.json` test script, `scripts/verify-live-artifact.mjs`, тести, одна граматика Studio selector, project memory, roadmap та evidence docs. No DB/Auth/Worker/DNS/Compose/official-domain changes.

## Фактичний QA на точному коді

- Node.js `v24.22.1`, ізольований RAM-backed checkout на SentinelX під час перевірок.
- `npm ci` PASS, `npm run check` Astro/Vue/Svelte: **0 errors, 0 warnings**.
- `npm test`: **147/147 Vitest**, **16/16 Node** (8 inquiry + 8 artifact audit) PASS.
- `npm run build` + `npm run verify:build`, `KNABA_RELEASE_MODE=vsp`: **103 pages**, `VSP_PENDING_APPROVAL`, `internalLinks=PASS`, tree SHA256 `8b504d87663ba71505cf017c3f997f2b52ead267dc5d7566438ca312f0d13243`.
- `node --test vps/*.test.mjs` після збірки: **18/18 PASS**.
- `npm run build` + `npm run verify:build`, `KNABA_RELEASE_MODE=vsp KNABA_VSP_INDEX_APPROVED=1`: **103 pages**, `VSP_PUBLIC`, `internalLinks=PASS`, tree SHA256 `708d73ac1bcb71c47ab29726d50a7f38d22de0f45aea0faac79d82399b125b6f`.
- Перший окремий запуск `vps/*.test.mjs` до збірки завершився ненульовим кодом (відсутній build-time `dist/vps/render-page.mjs`). Порядок змінено на build → verify → server tests і вся suite пройшла; не рахувати початковий запуск як product-regression.
- Клієнтська механіка FAQ Studio `select/apply/Undo` у браузері була PASS на першоджерелі PR #57 (того самого source blob validator). Це попередній доказ, **не** новий live owner UAT інтегрованого коміту.
- Build SHA в цій таблиці — **кандидатні артефакти**, не хеш поточного live.

## P0 блокер безпечного розгортання — активна версія не збігається з GitHub джерелом

Під час поточного читання developer VPS `kneba.vsp.rest` був перемкнений паралельним процесом на каталог:
`/srv/knaba/vps/releases/visual-card-8668458cb06f-20261025`.
Це label, не перевірений SHA GitHub commit. Готовий код не слід розгортати шляхом заміни `current`, доки немає source-to-artifact receipt новішого релізу.

Захищене порівняння: зібраний із PR #51 `VSP_PUBLIC` артефакт проти збереженого попереднього live `7e774c32863ad6b9f90a95288b5bd3495d941a51`: live мав 161 файл, кандидат 160; **лише 43 збіглися побайтово**, 129 відрізнялися в об'єднанні. Значні зміни: 8 сервісних HTML, клієнтські JS/CSS, SEO headers, що підтверджує ризик перезапису свіжих дизайнів. Файли `vps/server.mjs`, `vps/seo.mjs`, `vps/render-page.mjs` при цьому збігалися з PR #51, що не доводить повну тотожність application build.

Окрема read-only фіксація новішого `visual-card-...` каталогу: **162 файли**, з них **103 HTML**, 2,995,891 байт і обчислений фактичний tree hash `b09858bd6e2f9620f07ca8351d4704478a828dec359867d53f59042417b683d0`. Цей hash підтверджує лише прочитані байти і **НЕ** доводить походження з певного GitHub commit чи незалежно схваленої збірки. Під час останнього HTTP smoke всі `/`, `/faq/`, `/en/faq/`, `/uk/faq/`, `/ru/faq/`, `/studio/`, `/healthz` відповідали 200, `/readyz` відповідав 503; публічна головна містила `index, follow`.

## Дозволений наступний крок

1. Встановити точну Git source tree/branch, source manifest та reproducible artifact record активного dev-релізу, а не призначати новий SHA за назвою папки.
2. Інтегрувати ці два ізольовані patch scopes поверх цього **найновішого** source snapshot, не змінюючи SEO/Studio/API/Turnstile/CRM/Nav.
3. Запустити Node24 QA, privacy/public SEO modes, synthetic owner SSR Studio FAQ question/answer publish/restore з disposable SQLite, Chromium/390/320/200% і перевірку можливості rollback.
4. Перед будь-яким VPS web-only switch: спільний release lock між усіма агентами, exact expected-current source, незалежний artifact SHA, SQLite online backup з перевіркою, disk headroom, canary й HTTP smoke. Зміна активної версії під час підготовки = ABORT, без перезапису новішого релізу.
5. Real KNABA owner login / authenticated UAT, physical device/screen reader, legal/GDPR/field CWV і офіційний `knaba.de` — окремі не закриті ворота.

Нічого не merge в main, production не змінювати, secrets не читати/публікувати, дані й інші VPS-проєкти не видаляти, платні API не активувати.
