# KNABA: хмарний аудит і кандидат виправлень — 26.10.2026

## Доручення й межі
Користувач доручив повний аудит kneba.vsp.rest як відвідувач, усі сторінки у хмарному браузері, виправлення коду, запис у репозиторій і тестове розгортання. Це чинний KNABA, не AVENQO. Base і фактично перевірений live: `2164b9505f824486594b2633a05f5fd91aee8c04`. Запит дозволяє тестовий домен; main/офіційний knaba.de, платні провайдери та реальні повідомлення третім особам не виконувались.

## Зроблено
- UX-01: хмарний Chrome відкрив 98 маршрутів із посилань і ще24 маршрути з фактичної збірки (122 усього). На desktop1348px не виявлено горизонтального переповнення чи помилок кількості H1; перевірка завантажених зображень на98 відкритих публічних маршрутах не дала помилок. Це DOM/route audit, не візуальне ручне приймання кожного пікселя.
- UX-02: п’ять основних послуг одразу показуються в планувальнику без зайвого API-запиту. Спільний topic передається у чекліст і заявку; стабільний CRM enum збережений. Bauhelfer та розчищення мають окремі DE/EN/UK/RU чеклісти. Назва планувальника відповідає його призначенню.
- UX-03: вибірково перенесено порядок секцій PR84: послуги → додаткові роботи → процес → компанія/партнери → відгуки → FAQ → фінальний контакт. Збережені актуальні логотипи, шість карток01–06, усі блоки. Видалений зайвий телефонний абзац після успішної заявки.
- UX-04: фактично відтворений дефект Escape в Assistant. Додано закриття клавіатурою, початковий фокус у діалозі, повернення фокуса на launcher та зупинку голосу при закритті. Чат не відправляється автоматично.
- API-01: Studio коректно приймає до32KiB UTF-8. Потоковий ліміт більше не обрізає дозволені дані до12KiB; звичайні API зберігають12KiB. RED2/13 → GREEN13/13; розширена перевірка Studio/portal/CRM43/43.
- DB-01: вибірково перевикористано generic guard PR87 без SQL/journal/snapshot змін. Невідомі applied migration, checksum drift і некоректна послідовність блокуються до pending SQL; з’єднання закривається при помилці. Поточні6 міграцій, включно0005_public_reviews, збережені. Цільові19/19, усі VPS41/41.
- OPS-01: під перевіркою використання очищено лише3 старі /tmp/node_modules. Вільне місце20,043,157,504→22,131,494,912B; doctor strict exit0. Дані, вихідний код, uploads, backups і релізи не видалялися.

## Перевірено
Node24.22.1. `npm run check`:0 errors/0 warnings,4 existing hints. Vitest204/204; основні Node28/28; browser-policy/assets27/27; i18n9/9; `KNABA_RELEASE_MODE=vsp npm run test:vps`:41/41. Повна VSP build і verify:build пройшли,122 HTML, чотири опубліковані мови/95 pending, без зміни залежностей. Два початкові виклики verifier/VPS tests без KNABA_RELEASE_MODE не відповідали вже зібраному VSP artifact і правильно не пройшли crawler assertions; повтор із відповідним режимом PASS. Це не вимикання перевірок.

Хмарні взаємодії baseline: вибір послуги → контактний message з темою; перехід3 кроків і валідація порожнього обов’язкового поля; FAQ пошук Bauhelfer→2 відповіді й розкриття; Assistant відкриття/форма власника без надсилання; галерея з4 явно позначеними ілюстраціями. Escape до виправлення FAIL. Post-deploy receipt додається окремо.

Незалежний review: project_audit прийняв UI/Assistant/Inquiry; release_audit прийняв API з власним повтором13/13; root прочитав generic migration guard і перевірив повний VPS suite. Модель не підмінялася зовнішніми Claude/Gemini; платних dispatch не було.

## Rollout і відкат
Новий immutable release прив’язати до опублікованого source SHA; перед перемиканням два чинні deployment locks, CAS очікуваного current, doctor strict, онлайн SQLite backup+integrity і повторна перевірка відсутності Studio homepage overlays. Read-only preflight26.10 повернув0 записів для /,/en/,/uk/,/ru/; нові записи блокують перестановку через позиційні селектори. Змінюється лише web; старий release зберігається. Rollback коду без автоматичного відновлення БД.

## Залишок — весь продукт ще НЕ прийнято
- P1 proxy/IP: сайт використовує адресу Traefik для visitor buckets; усі відвідувачі можуть ділити20 заявок/год,20 відгуків/год,10 чатів/год. Потрібен перевірений trusted-proxy contract, strict bounded XFF parsing і тест spoofing; довіряти довільним заголовкам не можна. У цьому кандидатові захист не послаблювався.
- Voice/ERP: поточний Assistant rule-based + browser dictation/TTS; реальні website/WhatsApp voice calls/переведення оператору і єдиний ERP workflow не підтверджені. Окремі PR67/87/86 не означають прийняту інтеграцію; не переносити їхні міграції поверх public_reviews.
- Справжня доставка заявок власнику, його авторизований Studio/CRM UAT, людська CAPTCHA, фізичні пристрої/скрінрідер, юридичне приймання/права брендів,95 додаткових мов, field CWV, перевірене off-host restore та бізнес-UAT залишаються NOT_RUN/UNKNOWN. Health200 не доводить ці критерії.
- SEO: фактичний VSP artifact має92 sitemap URL, включно з4 галереями. Старі повідомлення про88 застаріли; окрему SEO-гілку слід зіставити перед новою інтеграцією. Індексацію Google не перевірено.

## Джерела для перевірки рішень
- https://www.w3.org/WAI/tutorials/carousels/ — клавіатура, керування й повідомлення стану.
- https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html — зрозумілі поля/інструкції.
- https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html — текстове визначення помилок.
- https://developers.google.com/search/docs/essentials — корисний контент і доступні посилання.
Офіційний knaba.de не відкрився через research tool в цьому запуску; нових бізнес-тверджень, партнерів чи ліцензій не додано. Чинні матеріали збережено.

## Forward integration після concurrent rollout
Перший rollout2ad00f69 безпечно зупинив CAS: інша сесія розгорнула cecb321ac41106c7a4f6da2d4a98308508852b38. Жодного перемикання чи відкату чужого релізу не виконано. Зібрано merge обох гілок: збережено8 тем заявки, локалізований summary, незмінний CRM enum і бюджет500 символів із префіксом; прийнято поточний assistantDialogControls із focus/IME/Escape/speech cleanup та його6 regression tests. Наші5 негайно доступних основних виборів, спеціальні чеклісти, порядок головної, один телефон, API32KiB і DB guard збережено.

Об’єднаний кандидат: check0 errors/0 warnings,4 existing hints; Vitest222/222; explicit Node28/28+27/27+9/9; build122 HTML; i18n944 units/26 DE routes,4 published/95 pending; VPS41/41. Фінальний client digest записано в docs/build-verification.json. Старі evidence залишені як історія, а нові forward-*.log.gz стосуються merge. Фізичні пристрої/zoom і реальні owner/submission workflows залишаються неперевіреними. Proxy/IP P1 має окремий PROXY_IP_FOLLOWUP.md.

## Реальний rollout і cloud post-check
73755d15 розгорнуто на kneba.vsp.rest. Точний server artifact f687ce5c39f2f677ecfcc6d79a7a86dad852d09307b01ea07b535ccd9df0c950; резервна копія перевірена. Перша спроба дала transient Traefik503 до Dockerhealthy, code-only rollback спрацював. Після bounded readiness wait повторний rollout пройшов127 внутрішніх і10 публічних перевірок. Повні receipts збережені поруч; офіційний домен не змінювався.

Cloud Chrome відкрив саме122 HTML-шляхи фінальної збірки, включно404.html, legacy й protected guest surfaces:122/122 одинH1, одинtel, без horizontal overflow; broken loaded images0. Дві чинні office-cleaning адреси редиректять у каталог.65 lazy images при top-of-page ще не були завантажені; окремий повний scroll-прохід перервався тайм-аутом браузерного інструмента, його не позначено PASS.20/20 planner topics,4 локалізовані review-summary та4 Assistant keyboard/draft сценарії пройшли без надсилання.

Окремо швидкий перший клік fresh UKplanner відтворив hydration race. Вузький followup активує Catalogue через client:load і тримає кнопки disabled до mount/підписки на store. Перше enabled натискання треба прийняти після rollout. Дві проміжні збірки відхилено чинним40KiB CSSbudget: серед assets були дві версії Layout CSS. Необов’язковий cursor style прибрано; остаточна чиста повторна збірка має40,810B gzip і проходить незмінений бюджет. Причину проміжного дублювання не видаємо за доведену runtime помилку.

Hydration followup: незалежний source review ACCEPT; check0 errors/0warnings,222 Vitest,28 native,41 VPS,122HTML/i18n/icon build gates PASS. Client artifact dd81b22a791d9921427f3a2044651fc88377f97a4d774954bbeca6715e3aeb68. Runtime diff лише Catalogue та ConstructionPlanner; решта вже прийнятого737 коду незмінна.
