# Корпоративний шаблон KNABA — аудит і реалізація, 25.10.2026

Статус: **CANDIDATE_VERIFIED — перевірено в ізольованому середовищі; NOT_DEPLOYED**.
Проєкт ziko1/knaba, гілка `feat/knaba-corporate-template-20261025`.
Точний перевірений код: `addff803dcb537af7272d468ecd3dd4990f626d3`.
База: `7590f15db7e1590afe6eaef1388f1963a5042b66`.
Стабільний поточний dev-реліз: `5b5261e56ad4ae5122495cf3e9b0f87ea7f2d70c`.

## Висновок аудиту
Сайт уже має послуги, окремі сторінки будівельного клінінгу, FAQ, порадники, планувальник і форму. Не вистачало корпоративної ідентичності й послідовної навігації. Кар’єрні кнопки помилково спрямовували шукачів роботи в кошторисну заявку.

## Реалізовано
| ID | Критерій | Результат і доказ |
|---|---|---|
| CORP-01 | B2B-відвідувач знаходить підприємство, регіон, юридичні реквізити й прямий контакт | Профіль на company page + блок на головній, DE/EN/UK/RU. Browser home→company + семантичні dl, tel/mailto PASS |
| CORP-02 | Користувач розуміє поточний розділ і повертається вище | Breadcrumbs на 9 типах публічних сторінок ×4 локалі; схеми BreadcrumbList; поточний розділ у mobile/desktop; deep-послуги/статті збережено. Unit + Chromium PASS |
| CORP-03 | Кандидат звертається щодо роботи, а не прибирання | 4 локалізовані email-intent CTA на кожній сторінці кар’єри; належне кодування теми, без надсилання й нового збору даних. Unit + Chromium PASS |
| CORP-04 | Спільний дизайн і коректні переклади | М’який фон останньої картки каталогу, відповідний головній; локалізовано timeline, номер завершальної картки розраховується. Chromium mobile/desktop PASS |

Реквізити звірено з https://knaba.de/impressum 25.10.2026; не скопійовано його застарілі юридичні формулювання. Не додано фіктивних відгуків, стажу, нагород, сертифікатів чи цін. Не змінено БД, авторизацію, залежності, провайдерів і tracking.

## Фактична перевірка
Node v24.22.1, наявні pinned залежності. Усі команди — з `corporate-site`:
- `npm run check`: exit0, Astro/Vue/Svelte 0 errors, 0 warnings, 4 попередні advisory hints.
- `npm test`: exit0, 159/159 Vitest + 8/8 Node.
- `KNABA_RELEASE_MODE=vsp npm run build`: exit0.
- `KNABA_RELEASE_MODE=vsp npm run verify:build`: exit0; 117 HTML, внутрішні посилання, metadata та приватні noindex перевірені.
- `KNABA_RELEASE_MODE=vsp node --test vps/*.test.mjs`: exit0, 20/20. Початковий запуск без release-mode мав 19/20 через очікування preview noindex проти VSP-артефакту; узгодження режиму з build усунуло невідповідність без зміни коду/assertions.
- `node tests/corporate-template-browser.cjs`: exit0, 67/67; 4 локалі, 320/390/1440px, keyboard return, home→company, careers URLs, поточний розділ; 0 JS page errors, 0 POST.
- Збільшення root-font до200% перевірене окремо; це не hardware/browser zoom. Screenshot mobile/desktop переглянуто автором та незалежним reviewer.
- `git diff --check` і звірення tested working tree з code SHA — exit0.

Відтворення Chromium: задайте `PLAYWRIGHT_PATH` (встановлений модуль), `CHROMIUM_PATH` (сумісний executable), `ARTIFACT_ROOT`, `EVIDENCE_DIR`, `SOURCE_SHA`. Залежність Playwright не додавалась до продукту. Harness блокує non-GET і сторонні запити.

Артефакт SHA256: `fb374242c48c99eb73ee8dfd9b1cce2c59f0529f40890117f327224b730c16b6` (спосіб хешування — чинний verify-build.mjs).
VPS renderer не змінився: `d6925dcee8900ddd94ec61463b3e9e0b3a8b98a13d91243e02fcd79f579602c2`.
Build report: CSS gzip33950B, all emitted JS gzip169470B. Проти наявного guide-релізу CSS +78B; JS байт-у-байт незмінний. HTML головної 44023→48301B, company17213→21152B (без стиснення). Це розмір артефактів, не p95/CWV.

## Незалежне приймання
Codex `/root/corporate_audit`: read-only аудит і review diff, журналів та mobile/desktop screenshot; **ACCEPT у scope CORP-01..04**, без blocking findings. Автор root. Нова оплата чи зовнішні AI API не активувалися; фактичні квоти UNKNOWN.

## Межі та наступний крок
- Не було merge, public GitHub push, перемикання VPS чи зміни офіційного knaba.de. Попереднє блокування public-source publication збережене; повторних спроб не робили.
- Реальна перевірка VPS: 15045308416B доступно з211271204864B, використання92.88%; чинний `vps/storage.mjs` повертає `cutoverAllowed=false` при >=90%. Поріг не змінювався. До rollout потрібне безпечне звільнення перевірених непотрібних файлів або окреме рішення щодо storage policy, потім свіжий source/artifact/current CAS, backup і rollback.
- Справжні кейси/фото до-після, дозволені фото команди, підтверджені рекомендації й документи кваліфікації — матеріали власника, відкритий backlog.
- Реальний owner enrollment, human CAPTCHA, доставка звернень, physical Android/iOS, screen reader, field CWV, юридичне й людське UAT не перевірені цим інкрементом.
- PQ-B05/B06: NOT_RUN / INSUFFICIENT_DATA. Гіпотеза майбутнього UAT: B2B-клієнт без допомоги знаходить правильний контакт із головної за2 переходи, кандидат знаходить email для роботи; спершу погодити учасників/строк і виміряти baseline. Автотест не доводить приріст конверсій.

Rollback підготовленого коду: залишити поточний immutable release; у разі майбутнього rollout повертати саме попередній source/artifact, без SQL/schema змін. Перед застосуванням патча перевірити актуальний HEAD: паралельні гілки не перезаписувати.
