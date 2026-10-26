# KNABA DE — звірка реалізованої V3 та нової V4

Дата: **08.10.2026 UTC**. Це перевірка джерел і план змін, а не нове приймання застосунку. Оригінальна V3 збережена без змін; **72 критерії V4 мають NOT_RUN**. Попередні ca9 assertion IDs в JSON є навігацією до часткових технічних доказів, а не PASS за V4.

## Дві різні гілки та ідентичності

- Продукт у `knaba-staging`: перевірений код `ca9ed79ff4c0429223eb60754289ee1132088361`, попередня документація `e18f293ac1527fff0910a86cd3049bef8bd4a03f`; 34 модулі, 432 вимоги та 475 критеріїв V3. PR1 open/draft/unmerged.
- `main`: окремий commit `ff748a2e5731e973883344ed28f3e82cf8a3bc06`, tree `1d708588f17f390c5e55460841af633d607d9e42`, parent початкового README. Це документація V4 із 24 блоками й 72 критеріями; там немає application source.
- [V4 reference/provenance](../specification-v4-reference/REFERENCE_PROVENANCE.json): повний текст, CSV і документні receipts збережені byte-for-byte та перевірені за хешами/Git blobs. [PDF/ZIP transfer receipt](../evidence/v4-document-binary-read-2026-10-08.json) чесно фіксує UTF-8-only обмеження конектора: binary bytes не отримані, reported hashes не підтверджені.
- [Повний 72-критерієвий реєстр](V3_V4_RECONCILIATION.json) містить дослівні CSV text/IDs, related V3 IDs/modules, source evidence, prior test navigation та відсутні частини. [Backlog](DEVELOPMENT_BACKLOG.json) пов’язує це з PLAN-28/03 та фінальними gates.

## Як приймати рішення й виконувати зміни

Користувач затвердив **V4 як цільову специфікацію зі збереженням працюючого стеку через погоджені ADR**. [Decision receipt](V4_SCOPE_DECISION.json) та [ADR-0002](../adr/0002-v4-target-and-preserved-runtime.md) фіксують це рішення. NestJS/PostgreSQL SQL/outbox зберігаються; повторне затвердження версії або цього вибору стеку не потрібне. PLAN-28 уточнює решту конкретних контрактів, а PLAN-03 реалізує прийняті зміни. Усі 72 application criteria лишаються NOT_RUN; незаперечені функції й історія V3 збережені.

Для кожної прийнятої відмінності PLAN-03 створює конкретний contract/migration/UI/native patch, regression case та нову code SHA із потрібними hosted/native/live перевірками. Зовнішня deployment-only конфігурація має окремий digest/read-back при незмінній code SHA. Зберігаємо цілі EUR cents/base units, історію, audit/outbox/lease та права; десяткові вхідні значення можна точно перетворювати без float-арифметики.

NestJS уже реалізований. ADR-0002 затверджує існуючу SQL/outbox архітектуру замість автоматичної міграції Prisma/Redis. Це рішення не скасовує V4 functional, concurrency, retry, recovery і measured-load gates та не збільшує бюджет.

## Конкретні 22 відмінності контрактів

Стек V4-D01 погоджений через ADR-0002; решта контрактів обрана як ціль V4, реалізація та виконання **NOT_RUN**. Це source-level спостереження; підтвердження конкретного сценарію потребує нового виконання.

| ID / V4 | Зараз у перевіреному коді | Ціль V4 | Конкретна наступна дія |
| --- | --- | --- | --- |
| V4-D01 / KNB-02 | NestJS уже працює. PostgreSQL через pg та транзакційний outbox свідомо замінюють Prisma і Redis/BullMQ. | V4 називає Prisma і Redis/BullMQ обов’язковими складниками стеку. | Дотриматися затвердженого ADR-0002: зберегти NestJS/PostgreSQL SQL/outbox; перевірити функціональні, concurrency, recovery і measured-load вимоги V4 без автоматичної міграції Prisma/Redis. (PLAN-28, PLAN-03) |
| V4-D02 / KNB-02/08/16/17 | Гроші зберігаються у цілих центах, матеріали — у базових одиницях; десятковий ввід конвертується точно. | V4 задає decimal для ставок і кількостей та округлення HALF_UP на документованому рівні. | Узгодити допустиму точність і точки округлення, відобразити їх у схемах і прикладах; не вводити похибку float. (PLAN-28, PLAN-03) |
| V4-D03 / KNB-03/04 | Привілейована дія приймає MFA віком до 15 хвилин. | V4 вимагає посилену автентифікацію не старшу 10 хвилин. | Після фіксації контракту змінити межу точково й перевірити дії на 09:59, 10:00 та зі старою сесією. (PLAN-28, PLAN-03) |
| V4-D04 / KNB-06 | SITE_VISIT_REQUIRED і HUMAN_REVIEW_REQUIRED записуються у Lead.status замість попередньої стадії. | V4 зберігає lifecycle окремо від review_state. | Додати версійовану проєкцію і міграцію, що зберігають попередню стадію та явне відновлення. (PLAN-28, PLAN-03) |
| V4-D05 / KNB-06 | Атомарний claim, HANDOFF_PENDING і блокування AI працюють; ціль за робочим календарем не підтверджена. | V4 використовує HUMAN_QUEUED і цілі 15 робочих хвилин / нагадування після 30. | Узгодити назви станів і календар компанії; не обіцяти строк без налаштованого календаря. (PLAN-28, PLAN-03) |
| V4-D06 / KNB-08 | quote.send записує SENT у транзакції, що ставить подію у чергу доставки. | V4 дозволяє SENT після прийняття провайдером або публікації у власному порталі. | Розділити queued, provider acceptance і публікацію; невизначений timeout потребує звірки, а не сліпого повтору. (PLAN-28, PLAN-03) |
| V4-D07 / KNB-10 | Order.transition має загальні переходи; усі передумови resume_state, client review і закриття потребують окремого аудиту. | V4 задає конкретні guards для PAUSED, WORK_SUBMITTED, CLIENT_REVIEW і CLOSED. | Перевірити повну матрицю станів, accepted scope, блокуючі дефекти й повноваження клієнта; виправити лише виявлені розбіжності. (PLAN-28, PLAN-03) |
| V4-D08 / KNB-11 | Окремі defect/rework є, але task.reopen може повернути прийняте первинне завдання в IN_PROGRESS. | V4 зберігає первинне ACCEPTED і створює пов’язане REWORK з власним циклом. | Узгодити виправлення помилкового приймання окремо від пізнішого дефекту, зберігаючи первинні факти. (PLAN-28, PLAN-03) |
| V4-D09 / KNB-14 | Backend та iOS підтверджують стан після двох придатних точок і dwell; межі 90 с між точками немає. | V4: щонайменше 3 точки протягом щонайменше 120 с, проміжок до 90 с, тиша 300 с — UNKNOWN. | Зробити спільний версійований контракт server/native і вектори для кількості, проміжку, прикордонної точки та тиші. (PLAN-28, PLAN-03) |
| V4-D10 / KNB-14 | Серверний tracking lease — 5 хвилин; локальні location events закінчуються через 24 години. | V4 задає lease 15 хвилин / поновлення через 5 хвилин і GPS-чергу до 72 годин. | Зафіксувати суворіші поточні межі як ADR або погодити зміну; не подовжувати збір і retention без політики компанії. (PLAN-28, PLAN-03) |
| V4-D11 / KNB-14 | Проєкти можуть встановлюватися від Android 8 та iOS 16; перевірено debug APK і конкретний симулятор iOS 18.5. | V4: підтримка Android 12+, iOS 17+, мінімальна та актуальна стабільна версії в матриці. | Розрізнити мінімальний install target і підтверджений support target; додати потрібні реальні пристрої/версії. (PLAN-28, PLAN-03) |
| V4-D12 / KNB-16 | payroll.calculation відхиляє зміну ставки всередині періоду з SPLIT_PERIOD_REQUIRED. | V4 автоматично розбиває сегмент у точці зміни ставки і відтворює gross preview. | Додати явну проєкцію інтервалів ставок і правила округлення, не змінюючи первинний табель чи офіційне net. (PLAN-28, PLAN-03) |
| V4-D13 / KNB-16 | Перший own receipt дозволений лише при UNCONFIRMED; явного payout.reconcile і версійованого amendment не знайдено. | V4 має RECONCILED та зміну заяви працівника новою версією. | Додати звірку/нову заяву з посиланням на первинний запис, не підміняючи зафіксовану виплату й не допускаючи повторної видачі. (PLAN-28, PLAN-03) |
| V4-D14 / KNB-17 | Один material_request представляє один SKU зі своїми partial facts. | V4 має заявку з багатьма рядками й незалежні approval та fulfillment. | Погодити сумісну проєкцію або parent/line adapter, зберігши ledger, часткові рухи та dedup. (PLAN-28, PLAN-03) |
| V4-D15 / KNB-18 | Завантаження має загальну межу 25 MiB; сканування і MIME перевіряються. | V4: фото 10 MiB, PDF 20 MiB і суворіший ліміт каналу. | Додати типові ліміти за MIME, перевірити карантин/реальний ClamAV і зрозумілий retry. (PLAN-28, PLAN-03) |
| V4-D16 / KNB-19 | Тихі години за замовчуванням 22–07; retry експоненційний. Bridge дає початкове WEB-повідомлення, точний geo schedule не прийнятий. | V4: 20–07, retry 1/5/15 хв, geo +5/+15, максимум 3 працівнику і 1 відповідальному. | Зафіксувати політику компанії, recipient, cause/revision і скасування; зберегти WEB-only default і поточну перевірку прав. (PLAN-28, PLAN-03) |
| V4-D17 / KNB-21/22 | Офіційний Meta webhook є; нормалізований зовнішній endpoint з timestamp/HMAC/mapping quarantine не знайдено. | V4 задає envelope, replay window 5 хвилин, credential mapping, source/event dedup і outbound webhook. | Реалізувати обмежений generic connector через ті самі команди; конкретні CRM залежать від mapping і провайдера. (PLAN-28, PLAN-03) |
| V4-D18 / KNB-22 | Є 257 generic commands і runtime OpenAPI; HTTP mapping відрізняється, entities без cursor, message limit до 200, body до 8 MiB. | V4 називає REST endpoints, 422/409 semantics, default50/max100 cursor і batch до 1 MiB. | Зробити версійований crosswalk контрактів, сумісні тонкі routes і bounded pagination; не створювати другий domain executor. (PLAN-28, PLAN-03) |
| V4-D19 / KNB-21 | Основні мобільні дії вже мають 44 px, але деякі icon widths 30/35 і buttons 42; усі три ширини не підтверджені. | V4: 360/768/1440, keyboard/focus/довгі DE-тексти та touch targets від 44 px. | Виміряти реальні області натискання й основні flows; виправити CSS точково, без повного redesign. (PLAN-28, PLAN-03) |
| V4-D20 / KNB-23 | Реальний hosted restore пройшов; цільові throughput, PITR, offsite і RPO/RTO не виміряні. | V4: 100 sessions, 10 cmd/s 15 хв на 100k segments; p95/p99, PDF3 jobs, RPO15 хв / media24 год / RTO4 год. | Додати відтворюване load acceptance, виміряти serialization/PDF і погодити backup strategy в дозволеному бюджеті. (PLAN-28, PLAN-27) |
| V4-D21 / KNB-23 | Retention налаштовується; core startup перевіряє auth/origin/SHA/owner, але не всю матрицю retention. | V4 дає пілотні строки та вимагає approved matrix до production; водночас відсутня конфігурація блокує лише залежні процеси. | Узгодити неоднозначність startup/process gating; прийняти конкретну матрицю від компанії, не вигадувати юридичне погодження. (PLAN-28, PLAN-03) |
| V4-D22 / KNB-24 | main містить окремий V4 document-only commit, а продукт knaba-staging зберігає перевірений код ca9 та його докази. Оригінальний V3 master збережений; історії не об’єднані. | Користувач затвердив V4 як цільову специфікацію; KNABA_DE_TARGET_SPEC.md містить її точні байти, ADR-0002 зберігає працюючий стек. | Виконати 72 цільові критерії V4 та застосовні несуперечливі регресії V3 з бази 475 критеріїв. Зберегти V3 master, crosswalk і точні SHA доказів; не reset/merge main і не переносити результати старих тестів на нові сценарії. (PLAN-28, PLAN-01) |

Source paths/line references і часткові proof links для кожної відмінності містяться в JSON. Рішення не можна замінювати загальною кількістю тестів.

## Усі 72 критерії: що лишилося перевірити або змінити

| Критерій | V4 блоки | Наступна робота / доказ | Статус приймання |
| --- | --- | --- | --- |
| AC-01 | KNB-01/02 | Повторити запуск чистого тестового середовища й production bootstrap без синтетичних користувачів. Застосувати прийнятий ADR-0002 щодо SQL/outbox, перевірити його функціональні гарантії та незалежність від AVENQO. | NOT_RUN |
| AC-02 | KNB-03 | Виконати дозволену й заборонену API-дію для кожної ролі V4. Перевірити чужі company/site IDs, експорти, файли та відсутність змін у БД після відмови. | NOT_RUN |
| AC-03 | KNB-03/22 | Виконати один сценарій відкликання доступу для callback, перекладу в черзі, завантаження файлу і live subscription. Виміряти закриття підписки не пізніше 60 с. | NOT_RUN |
| AC-04 | KNB-03/04 | Повторити через API спроби самопідвищення ролі, видалення останнього OWNER та самопогодження табеля чи виплати. Перевірити аудит відмов. | NOT_RUN |
| AC-05 | KNB-04 | Узгодити межу свіжої MFA: 10 хв у V4 проти поточних 15 хв. Перевірити активацію запрошеного контакту, TTL токена, повторне використання, чужу identity та відкликання сесій. | NOT_RUN |
| AC-06 | KNB-04/06 | Пройти перше українське повідомлення, явний вибір PL, цитату німецькою, коротке OK і повтор START. Новий Lead має створюватися лише за явним новим запитом. | NOT_RUN |
| AC-07 | KNB-04/21 | Виконати реальний перехід web→WhatsApp з підтвердженням у двох каналах. Перевірити TTL токена 10 хв, гостьову сесію, membership і відмову для викраденого токена. | NOT_RUN |
| AC-08 | KNB-05 | Повторити рівно 10 валідно підписаних webhooks та перевірити відмову БД. Має бути одна логічна бізнес-дія і жодного 2xx за незбережену подію. | NOT_RUN |
| AC-09 | KNB-05/19 | Перевірити чинні шаблони компанії, opt-out і callbacks провайдера на межі 23:59/24:00. Статус READ не має створювати договірне приймання. | NOT_RUN |
| AC-10 | KNB-06 | Відокремити review_state від lifecycle Lead. Пройти кваліфікацію, кошторис, згоду та dispatch зі збереженими джерелами вимірів у UI, API і БД. | NOT_RUN |
| AC-11 | KNB-06/07 | Пройти запити непідтвердженої послуги, відсутньої ціни та обов’язкового огляду. AI має передати запит людині й не називати непідтверджену остаточну ціну чи час бригади. | NOT_RUN |
| AC-12 | KNB-06 | Узгодити назви HUMAN_QUEUED/HANDOFF_PENDING і бізнес-календар. Повторити одночасний claim двома операторами, блокування відповідей AI та явне повернення до AI. | NOT_RUN |
| AC-13 | KNB-07 | Виконати prompt injection у чаті та knowledge file. Зафіксувати фактичний prompt провайдера і підтвердити відсутність чужих секретів та payroll. | NOT_RUN |
| AC-14 | KNB-07/21 | Перевірити timeout 20 с, один безпечний повтор, invalid JSON, budget=0 і rollback конфігурації. START/END, форма та передавання людині мають залишатися доступними. | NOT_RUN |
| AC-15 | KNB-08 | Звірити кошторис €240 net + €45,60 tax = €285,60 gross у PDF, API та UI. Ставка 19% має належати лише тестовому tax profile. | NOT_RUN |
| AC-16 | KNB-08 | Узгодити queued, provider acceptance і публікацію в порталі перед статусом SENT. Двічі прийняти чинну версію; expired/superseded мають повертати HTTP 409 без нового order. | NOT_RUN |
| AC-17 | KNB-08 | Повторити fixed price €1 200 + прийнятий Nachtrag €120 = €1 320 у UI, API та PDF. Години, включені матеріали та REWORK не нараховуються двічі. | NOT_RUN |
| AC-18 | KNB-09 | Виконати повну матрицю CLIENT A / EXTERNAL_BAULEITER A проти клієнта B через прямі URL, API, export і files. Перевірити internal chat, payroll та GPS. | NOT_RUN |
| AC-19 | KNB-09/20 | Перевірити окремі acknowledgments для отримання звіту, погодження годин і приймання робіт. Issue на report v1 не змінює байти v1 або табель. | NOT_RUN |
| AC-20 | KNB-10 | Виконати реальну PostgreSQL гонку двох диспетчерів за працівника. Перевірити звільнення резерву після TTL і відмову SCHEDULED без підтвердження працівника. | NOT_RUN |
| AC-21 | KNB-10/19 | Перевірити resume_state, guards переходів і schedule revision. Скасувати старі reminders та майбутні резерви без стирання виконаних робочих фактів. | NOT_RUN |
| AC-22 | KNB-10/11 | Перезапустити scheduler і двічі створити occurrence для того самого періоду та location. Після зміни template прийняте завдання залишається незмінним. | NOT_RUN |
| AC-23 | KNB-11 | Повторити відмову циклу і cross-site parent, збереження EG/1. OG та імпорт CSV/XLSX. Перевірити row errors, upsert і відсутність записів до commit. | NOT_RUN |
| AC-24 | KNB-11 | Узгодити task.reopen зі збереженням первинного ACCEPTED. Незалежний QC і пов’язане REWORK мають зберігати попередній цикл перевірки та витрати. | NOT_RUN |
| AC-25 | KNB-11/13 | Перевірити: троє працівників по 2 год і спільні 100 м² дають 6 людино-год, 2 год elapsed та один результат 100 м². Відхилити розподіл 70 хв із сегмента 60 хв. | NOT_RUN |
| AC-26 | KNB-12 | Перевірити SITE_INTERNAL, SITE_CLIENT та history_from нового учасника. Попередня історія відкривається тільки явним дозволом з аудитом. | NOT_RUN |
| AC-27 | KNB-07/12 | Перевірити реальний переклад DE→UK/PL/LT для 5 л, 14:30 та «не мити» з мовною перевіркою людини. Reply має правильний TASK_THREAD, оригінал доступний. | NOT_RUN |
| AC-28 | KNB-07/12 | Виконати 10 натискань «Перекласти» з одним фактичним запитом провайдера. Edit version створює новий запит, а відкликана membership блокує текст і переклад. | NOT_RUN |
| AC-29 | KNB-12/18 | Перевірити текст і фото без reply context та повторне отримання власного provider ID бота. Жодного випадкового site або relay loop. | NOT_RUN |
| AC-30 | KNB-12 | Двічі підтвердити preview із трьох завдань, змінити command hash і надіслати «готово» без task_id. Має бути рівно три створені завдання і жодного зайвого завершення. | NOT_RUN |
| AC-31 | KNB-13 | Виконати одночасні реальні START із WhatsApp і native та повтор END. Одна Shift, незмінна тривалість; відсутнє фото не блокує END. | NOT_RUN |
| AC-32 | KNB-13 | Відтворити всі сегменти контрольного дня: elapsed 8:00, WORK 6:55, TRIP 0:30, BREAK 0:30, AWAY 0:05. За тестовим правилом оплачуваний час становить 7:25. | NOT_RUN |
| AC-33 | KNB-13 | Виконати конкретні DST-приклади 25.10.2026 і 29.03.2026 та перевірити межі місяця з інтервалами [start,end), без дублювання секунд. | NOT_RUN |
| AC-34 | KNB-13/16 | Перевірити author, reason та первинні події correction, незалежне погодження і окремий adjustment для LOCKED period. Тихе перезаписування заборонено. | NOT_RUN |
| AC-35 | KNB-14 | Узгодити й реалізувати спільний classifier: щонайменше 3 точки протягом щонайменше 120 с, проміжок до 90 с. Поточні backend/iOS допускають 2 точки; перевірити тишу 300 с. | NOT_RUN |
| AC-36 | KNB-14 | Після оновлення classifier перевірити EXIT→GEO-AWAY та ENTER у той самий site. Ручні BREAK, TRIP і OFF_DUTY ніколи не переходять автоматично у WORKING. | NOT_RUN |
| AC-37 | KNB-14 | На пристроях перевірити негайну локальну зупинку GPS при BREAK/END, відмову приватних координат за event-time і синхронізацію раніше дозволених trip points після END. | NOT_RUN |
| AC-38 | KNB-14 | Узгодити суворіший поточний lease 5 хв проти явно заданих у V4 15 хв. Фізично перевірити remote END офлайн, expiry, GPS stop і чесний stale UI. | NOT_RUN |
| AC-39 | KNB-14/22 | Перевірити out-of-order, duplicates, чужий device, clock shift і revoked lease. Перевірити boot/session ID та monotonic metadata; LOCKED history незмінна. | NOT_RUN |
| AC-40 | KNB-14 | Виконати фізичні випробування на Android та iPhone: по 20 переходів, щонайменше 18 виявлених до 5 хв і жодної хибної паузи за 2 год. Окремо записати lock screen, denial, battery saver, reboot, OS stop та 30 хв offline. | NOT_RUN |
| AC-41 | KNB-15 | Перевірити атомарний TRIP_START, пропозицію arrival і проїзд повз об’єкт без автоматичного WORKING. ETA не входить у табель. | NOT_RUN |
| AC-42 | KNB-15/17 | Пройти отримання матеріалів, SERVICE та приватний BREAK із неперекривними сегментами. GPS вимкнений під час BREAK; receipt відокремлений від arrival. | NOT_RUN |
| AC-43 | KNB-15 | Перевірити: троє пасажирів по 30 хв дають 1,5 людино-год і один vehicle trip 20 км. За відсутнього track відстань залишається unknown або estimated. | NOT_RUN |
| AC-44 | KNB-16 | Додати або узгодити розбиття сегмента за зміною ставки замість поточного SPLIT_PERIOD_REQUIRED. Перевірити €150 gross preview; офіційне net має source/version. | NOT_RUN |
| AC-45 | KNB-16 | Перевірити €1 000 net, €400 recorded/reconciled, €600 outstanding та €300 approved: доступно до нової видачі €300. Approved не відображається як фактично виплачене. | NOT_RUN |
| AC-46 | KNB-16 | Узгодити нову версію зміненої заяви одержувача та reconciliation виплати. €400 recorded, €300 partial receipt і €100 disputed не дозволяють повторної видачі. | NOT_RUN |
| AC-47 | KNB-03/16 | Виконати відмову чужому user/admin для acknowledge, одночасні реальні PostgreSQL approvals, balance cap і незмінний reversal. Перевірити свіжу MFA. | NOT_RUN |
| AC-48 | KNB-17 | Повторити 10 л приходу, 4 л у transit, receipt, usage 1,5 л і return 0,5 л: physical total 8,5 л. Повторні API keys не змінюють кількості. | NOT_RUN |
| AC-49 | KNB-17 | Перевірити usable 4 л, чужий reserve 1 л і demand 5 л: free 3 л, shortage 2 л до та після reserve 3 л. Task demand і linked request не подвоюються. | NOT_RUN |
| AC-50 | KNB-17 | Виконати одночасні резерви останніх 2 л, конфлікт offline issue та виключення blocked batch. Stock не стає від’ємним. | NOT_RUN |
| AC-51 | KNB-17 | Перевірити 5 л − 2 000 мл = 3 л, відмову конверсії без density, повернення інструмента без USAGE та звірку рухів після inventory cutoff. | NOT_RUN |
| AC-52 | KNB-17 | Перевірити approved PO, partial receipt, overdue inbound і GPS arrival. Physical stock збільшується тільки на підтверджену receipt qty. | NOT_RUN |
| AC-53 | KNB-18 | Узгодити ліміти фото 10 MiB/PDF 20 MiB проти поточних 25 MiB. Перевірити реальний scanner/quarantine, MIME, ACL та retry без блокування обліку часу. | NOT_RUN |
| AC-54 | KNB-18/20 | Перевірити лише approved client photos, очищення EXIF, незмінний original/hash і повтор фото без додаткового виконаного обсягу. | NOT_RUN |
| AC-55 | KNB-19 | Точний GEO reminder +5/+15 хв і максимум 3 повідомлення працівнику / 1 відповідальному ще не підтверджені. Налаштувати cause/version/recipient і скасування після пояснення, Trip або END. | NOT_RUN |
| AC-56 | KNB-05/19 | Узгодити початок quiet hours о 20:00 проти поточних 22:00 та retry 1/5/15 хв. Перевірити actual template rejection, timeout, opt-out, fallback і UNKNOWN зі скінченними повторами. | NOT_RUN |
| AC-57 | KNB-20 | Звірити погоджений DE report у PDF, CSV, XLSX і порталі. Перевірити JSON/PDF на відсутність payroll, margin, приватних GPS та reasons. | NOT_RUN |
| AC-58 | KNB-20 | Змінити профіль компанії й джерела після v1 та випустити v2. Байти, hash і номер v1 незмінні; retry send не створює нового номера. | NOT_RUN |
| AC-59 | KNB-21 | Виміряти інтерфейс на 360, 768 і 1440 px: keyboard, focus, довгі DE-тексти, Back/Resume та offline. Виправити області натискання менші 44 px за результатами вимірів. | NOT_RUN |
| AC-60 | KNB-21 | Пройти однакові approval/stock commands у web і WhatsApp. Permissions, БД та audit однакові; змінені після preview параметри відхиляються. | NOT_RUN |
| AC-61 | KNB-21/22 | Реалізувати універсальний signed integration envelope із timestamp, source mapping, quarantine і dedup. Наявний Meta webhook не покриває цей окремий endpoint. | NOT_RUN |
| AC-62 | KNB-21 | Перевірити фактично отримані referral, UTM та source у Lead. Просте відкриття QR/wa.me не створює вхідної розмови або marketing consent. | NOT_RUN |
| AC-63 | KNB-22 | Узгодити named REST, HTTP error codes, cursor із default 50/max 100 та batch 1 MiB з поточним command API. Повторити реальні PostgreSQL перевірки idempotency, version і schemas. | NOT_RUN |
| AC-64 | KNB-22/23 | Виміряти навантаження AI/media зі збереженням доступних START/END. Виконати SQL, XSS, SSRF та cross-company attacks і перевірити захист секретів у логах/артефактах. | NOT_RUN |
| AC-65 | KNB-23 | Пройти approved retention expiry для GPS, presence, chat, translations та indexes, а також scoped legal hold/export. Device, provider і offsite fulfillment підтверджуються окремо. | NOT_RUN |
| AC-66 | KNB-23 | Пройти test labor profile без вигаданих BREAK або стирання overtime. Узгодити core startup із блокуванням залежних процесів за GPS/retention/tax gates. | NOT_RUN |
| AC-67 | KNB-23 | Виміряти 100 працівників, 20 об’єктів, 100 sessions і 10 команд/с протягом 15 хв на 100 000 TimeSegments. Перевірити p95/p99, errors, queue lag, збереження всіх acknowledged commands і 3 паралельні PDF jobs до 60 с. | NOT_RUN |
| AC-68 | KNB-23/24 | Поточне відновлення 17 таблиць і 10 приватних blobs пройшло. Налаштовані PITR/offsite, RPO 15 хв для БД / 24 год для медіа, RTO 4 год і replay outbox без повторних payouts/stock/tasks ще не прийняті. | NOT_RUN |
| AC-69 | KNB-24 | Після явно дозволеного нового обмеженого вікна і Dashboard MFA перевірити migration на копії, сумісний rollback, restart API/worker, точний /version SHA та startup без AI. | NOT_RUN |
| AC-70 | KNB-14/24 | Потрібні стабільний підпис компанії для Android, install/update зі збереженням даних, дозволений signed iOS install та фізичні permissions/sync. Debug/simulator proof залишається окремим. | NOT_RUN |
| AC-71 | KNB-01/24 | Пройти один live flow на точному SHA: клієнт, quote, crew, task, shift/trip, material/photo, review, DE report, офіційний payroll record і receipt працівника. | NOT_RUN |
| AC-72 | KNB-24 | Додати окрему V4-матрицю 24 KNB / 72 AC зі статусами й evidence. Зберегти первинні 432 вимоги / 475 критеріїв та їхню історію; company handover підтвердити окремо. | NOT_RUN |

Ці 72 рядки не додаються автоматично до 475 критеріїв V3: вони можуть перетинатися, уточнювати або змінювати старий контракт. Version decision і точні requirement links визначають спільний застосовний обсяг. V3 історія 10 PASSED / 465 NOT_RUN залишається без змін.

Відкриті company/provider/legal/signing/physical входи залишаються в єдиному [EXTERNAL_PREREQUISITES.md](../EXTERNAL_PREREQUISITES.md). Публічний Railway NOT_READY; минулий cutoff не продовжений. Готовий продукт вимагає реального runtime, перевірених застосовних контрактів та company acceptance, а не тільки цієї звірки.
