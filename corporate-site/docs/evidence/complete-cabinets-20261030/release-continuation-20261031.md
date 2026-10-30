# KNABA: підготовка релізу кабінетів — 31.10.2026
Час контрольних перевірок: 30.10.2026 23:05–23:08 UTC / 31.10.2026 00:05–00:08 Europe/Berlin.

## Результат
**TEST DEPLOYED; PRODUCTION HOLD.** Поточне доручення користувача дозволяє розгортання. Повторний дозвіл від користувача не потрібний. Не завершені браузерне приймання та окреме підтвердження замовника, передбачене встановленим контролером.

## Точна версія
- PR: https://github.com/ziko1/knaba/pull/119 (Draft, open, unmerged).
- Перевірений runtime source: `2b4190591463d748533b073f2377d1716035bef8`.
- GitHub documentation HEAD на початку перевірки: `10189d8e958cbb3a4c2f3a1bc4ed4fafbfb1902a`; п'ять доданих/змінених файлів є документацією та доказами.
- Кандидат, уже встановлений у TEST: `198400c15ae399f2e28445c47e12be7534a15c2bfd3366ab66ffd034e3767af3`.
- Чинний production: `71fd88c71f67e13f81ecacb5340b1b19eebcdb90bd35217efc75cc42bf20b383`.
- Production configuration: `b660fd7b8b7cc9df3ef6bb255cdec8d63de06a71c02a64cb565c58dbd7b2488e`.
- Target: `host_007b016d01b5066b`, фізичний KNABA, https://knaba.de/.

## Що перевірено цього разу
| Критерій | Результат і межі |
|---|---|
| Повний artifact manifest | PASS; незалежний reviewer /root/release_review підтвердив точні production/TEST manifests |
| Сумісність схеми | PASS; усі 24 drizzle-файли ідентичні, міграція для цього кандидата не потрібна |
| HTTPS/SQLite сценарії | PASS; 7 груп, 9 синтетичних облікових записів, фактичні паролі/сесії, заявки, призначення, повідомлення, приватність, checklist і feedback |
| Середовище повторного тесту | Node22.23.4, command `node tests/cabinets-http.mjs`, exit0; це додаткова перевірка сумісності, не новий запуск Node24 |
| Compiled Worker | SHA256 `0f003a167913ecee44f86ad60b5d0168213f59a06a697bb16849a6e69ef58f8c`, збігається з попереднім acceptance receipt |
| Production | /healthz200, /readyz200; браузер відкрив живу /login/ і показав шість мов |
| TEST | /healthz200, /readyz503: owner enrollment required; не активовано необхідного TEST-власника/оператора |
| Приватність TEST | Gateway401/noindex; cloud browser показав Cloudflare Access email-code login |
| Попередні 750 тестів | Докази збережені для того самого runtime source; усі 750 заново не запускались |
| Незалежне review | /root/release_review: нового критичного source-дефекту не виявлено; UI acceptance не підтверджено |

## Зроблено
Штатний `knabactl.py backup production` завершився exit0. Нова локальна резервна копія:
`/srv/knaba/customer/backups/production/20261030T230804.440789Z-scheduled.sqlite`
- 364544 bytes.
- SHA256 `93e866b6657642227f06438b770516228cd582bd5a2aed02ef874f73a2fe98f3`.
- SQLite integrity `ok`, foreign-key errors0.
Це підтвердження локальної копії, не нового off-host restore.

Production-код, конфігурація, DNS, облікові записи та клієнтські записи не змінювались. Тестовий сценарій використовував тимчасову синтетичну БД. Нові credentials/approval receipts не створювались.

## Що залишається
1. Авторизований вхід до Cloudflare Access для testing.knaba.de.
2. Завершення чинного onboarding TEST-власника і розділених тестових ролей; production-credentials не копіювати.
3. Браузерні сценарії кабінетів, мобільні ширини, клавіатура та фокус на цьому артефакті.
4. Справжнє підтвердження замовника на публікацію вказаного кандидата на knaba.de. У перевіреній Gmail-гілці звернення PR119 є тільки вихідний лист, відповіді немає. Єдиний старий серверний receipt уже використаний та стосується іншого артефакту.
5. Перед активацією повторно звірити target/current/config; штатний activate production із чинним receipt, потім живі сценарії й health/readiness.

Встановлений `/srv/knaba/customer/ops/knabactl.py`, SHA256 `0c08f9e3a426adb15fd8fce9504d8128ffa7cbaec29ef9e10260f074672c7202`, рядки449–469 вимагає: “Both explicit user approval and customer confirmation are required.” Receipt має відповідати candidate/current/config, бути невикористаним, root0600 та чинним не довше48 годин. Поточне доручення є user approval; customer confirmation не підмінялось.

## Відновлення
Попередній production-artifact збережений. Контролер перед активацією робить SQLite online backup; за невдалого smoke автоматично повертає код без відновлення старої БД. Пізніше ручне повернення коду є окремою активацією з відповідним receipt. Небезпечних міграцій/видалення даних у цьому пакеті немає.

## Примітки до діагностики
Первинна перевірка Git очікувала документаційний HEAD на runtime-worktree; її зупинено assertion до тестів. Перевірено фактичний чистий runtime-source2b419059, після чого сценарії виконались успішно.
Команда bootstrap `preflight` повернула “Planned port19120 is already occupied”: це очікувано для вже встановленого production, не його несправність. Для чинної установки перевірено штатний `status`.
Раніше зафіксований дефект www/readyz та його окремий підготовлений worktree не інтегрувались у цей незмінний кандидат.

## Блокер авторизації браузера
Після читання browserAuth та огляду чинної email-форми запит захищеного входу відхилений автоматичною перевіркою безпеки до створення користувацької форми або надсилання коду. Причина: немає конкретного дозволу на email-акаунт і запит login-коду. Це не ручна відмова користувача. Автоматизація входу зупинена; потрібен дозвіл на запит коду для tracker.gigamax@gmail.com. Захист Cloudflare Access не змінювався.
