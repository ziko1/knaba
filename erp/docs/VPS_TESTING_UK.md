# KNABA DE — ізольований VPS тест, 2026-10-13

Статус: PREPARED; фактичний SHA, запуск і результати перевірок додаються в окремий receipt після виконання. Це не підтвердження повної production-готовності V4/V3.

## Доступ та керування

- Панель: https://panel.avenqo.pro — наявний обліковий запис власника. Нову реєстрацію вимкнено; пароль власника не змінювався. HTTPS перевірено; прямі HTTP/realtime порти панелі прив'язані до localhost.
- Проєкт Coolify: **KNABA DE** → **testing** → **KNABA DE Test**.
- Тестова адреса: https://knaba.avenqo.pro. Окремий DNS A-запис; жодної заміни AVENQO.
- Compose, змінні середовища, домен, логи, старт/стоп/перезапуск і scheduled tasks доступні через панель. Власник може додавати/редагувати/видаляти проєкти стандартними засобами Coolify.
- Вебтест закритий додатковим BasicAuth, бо DEMO містить загальновідомі синтетичні облікові записи. Секрет доступу зберігається приватно на VPS; у Git його немає.
- BasicAuth перед cookie-based web API не підтверджує роботу native Bearer-клієнтів чи provider webhooks через цю адресу. Їх зовнішня приймальна перевірка залишається NOT_RUN.

## Відтворюване розгортання

1. Взяти чистий commit; зберегти точний 40-символьний `GIT_SHA`.
2. Побудувати `infra/Dockerfile.railway` з `--build-arg GIT_SHA` і тегом `knaba-de-api:<SHA>`. Він використовує звичайний npm registry з перевіркою TLS й сумісний із наявним builder VPS.
3. Побудувати `infra/Dockerfile.backup` з `--build-arg KNABA_IMAGE=knaba-de-api:<SHA>` та тегом `knaba-de-backup:<SHA>`.
4. Імпортувати `infra/compose.coolify.yml` у вказаний сервіс Coolify; зафіксувати обидва image tags і `GIT_SHA` на тому самому commit. `pull_policy: never` не дозволяє випадково підмінити локальний образ registry-образом.
5. Задати приватні випадкові `POSTGRES_PASSWORD`, `AUTH_ENCRYPTION_KEY`, окремий `BACKUP_PASSPHRASE` та `DATABASE_URL` з hostname `knaba-postgres`. Режим **DEMO**, компанія `knaba-demo`; зовнішні AI/WhatsApp відправлення вимкнені.
6. До запуску перевірити middleware `knaba-test-access@file` і його приватний password file. Домен API — `https://knaba.avenqo.pro:3000`; зовні лише HTTPS через proxy.
7. Виконати повну перевірку точного commit із реальною окремою PostgreSQL, браузером, backup/tamper/restore та worker restart. Окремо перевірити deployed version/readiness, TLS і відмову неавторизованому запиту.

## Дані та резервні копії

PostgreSQL 17.11 має окремий постійний volume; host port відсутній. Приватні зображення/документи за відсутності S3 зберігаються в PostgreSQL і входять у узгоджений snapshot. API, worker, bootstrap не мають додаткових незалежних сховищ даних.

Окремий `backup` контейнер має Node 24 і PostgreSQL 17.11 clients, працює без root у приватній мережі сервісу. `KNABA_PG_TRANSPORT=native` зберігає чинні захисні перевірки transport; база не відкривається назовні заради backup. Призначення — приватний `backups_data` volume. Панель запускає `bash infra/backup-daily.sh` за розкладом. Після успішної копії очищення обмежене автентифікованими парами архівів старшими за 14 днів лише у власному `/backups`; сім найновіших завжди зберігаються. Пошкоджені файли не видаляються автоматично. Архів зашифрований та автентифікований; restore дозволено лише в окрему порожню ціль із актуальними privacy-ledger перевірками.

Локальний volume на тому самому VPS не є offsite backup. Підтвердження offsite-відновлення, RPO/RTO та політики retention — окремі production gates; не оголошувати їх виконаними за локальним тестом.

## Межі авторизації та готовності

Цей VPS тест прямо дозволений запитом користувача від 2026-10-13. Історичне Railway-вікно й його обмеження не змінювалися; Railway не запускали. AVENQO зберігає свої ресурси. Немає дозволу на автоматичний merge основної гілки чи нові платні послуги.

Обов'язкові зовнішні production gates залишаються в `docs/EXTERNAL_PREREQUISITES.md`: справжня компанія та її юридичні/retention-рішення, recovery/MFA, провайдери/мандати й погодження реальних відправлень, фізичні Android/iPhone, production signing, навантаження й операційне приймання. Статуси всіх 72 V4/475 V3 критеріїв не підвищуються масово на підставі CI або доступного домену.
