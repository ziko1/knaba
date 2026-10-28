# KNABA — автономний пакет для сервера власника

**Стан:** готовий перевірений тестовий артефакт, НЕ прийнятий production-реліз. Цей пакет не містить реальних облікових записів, БД, секретів, SSL-ключів або даних розробника.

## Що містить
- `knaba-owner-app-20261028.tar.gz` — зібраний сайт + Node24 backend + міграції (462 entries).
- `compose.owner.yaml` — автономний Docker Compose без Coolify/Traefik. Публічно не відкриває порт; лише `127.0.0.1:19110`.
- `site.env.example` — приклад змінних без секретів.
- `bundle-manifest.json` — SHA-256 та джерело.

## Підготовка
На чистому Linux VPS потрібні Docker Engine + Docker Compose plugin, окремий користувач, резервне копіювання, HTTPS reverse proxy, DNS-контроль власника. Зробіть архів чинного офіційного сайту та DNS, не змінюйте MX/SPF/DKIM/DMARC.

## Встановлення
```bash
mkdir -p ~/knaba-owner/{app,state,config}
cd ~/knaba-owner
sha256sum knaba-owner-app-20261028.tar.gz
# Очікуваний SHA-256 у bundle-manifest.json
tar -xzf knaba-owner-app-20261028.tar.gz
mv knaba-app/* app/
rmdir knaba-app
cp site.env.example config/site.env
chmod 600 config/site.env
# Заповніть OWNER_EMAIL лише після підтвердження власника.
# У .env (поруч з compose.owner.yaml) вкажіть KNABA_PUBLIC_ORIGIN=https://knaba.de
# Перед запуском перевірте власника каталогу state для UID 1000.
docker compose -f compose.owner.yaml config --quiet
# Обов’язково: міграції ДО запуску сервера. Зробіть резервну копію,
# якщо база вже існує; CLI створює pre-migrate backup для наявної БД.
docker compose -f compose.owner.yaml run --rm -T web node /app/vps/manage.mjs migrate
# Перший власник: OWNER_EMAIL у config/site.env; пароль лише через stdin,
# не в аргументах команди, .env, shell history або логах.
read -r -s -p 'Owner password: ' KNABA_OWNER_PASSWORD; echo
printf '%s\n' "$KNABA_OWNER_PASSWORD" | docker compose -f compose.owner.yaml run --rm -T web node /app/vps/manage.mjs init-owner
unset KNABA_OWNER_PASSWORD
docker compose -f compose.owner.yaml up -d
docker compose -f compose.owner.yaml ps
# Публічні запити потребують HTTPS proxy з правильними Host і X-Forwarded-Proto.
curl -f -H 'Host: knaba.de' -H 'X-Forwarded-Proto: https' http://127.0.0.1:19110/healthz
curl -f -H 'Host: knaba.de' -H 'X-Forwarded-Proto: https' http://127.0.0.1:19110/readyz
```

**Важливо:** команда `mv` вище призначена для нового порожнього каталогу `app`. Не застосовуйте поверх чинного розгортання. Для нової бази потрібні явна міграція та ініціалізація власника; без них /readyz повертає 503. На тестовому чистому сховищі перевірено: міграція PASS, /healthz 200, головна й /login/ 200 через HTTPS proxy headers, /readyz 503 до створення власника. Ініціалізацію власника не тестували наскрізно.

## Перевірки перед відкриттям домену
- HTTPS, canonical/robots/sitemap для `knaba.de`, коректний reverse proxy до loopback, сертифікат.
- Реальна реєстрація клієнта/партнера, owner approval, login/logout, password recovery, CSRF, доступи та ізоляція ролей.
- Реальна доставка email після авторизації KNABA SMTP/provider.
- Форма заявки та отримання звернення; мобільний і desktop QA, клавіатура, візуальне порівняння.
- Юридичні реквізити, відгуки, партнери та згода власника.
- Відкат: зберігати попередній `app` і резервну копію `state/site.sqlite`; не відновлювати стару БД поверх нових міграцій без перевірки сумісності.

**Не переносити** тестову SQLite БД зі сторонніми даними чи секрети VSP. Після погодженого перенесення реальних даних потрібен окремий захищений канал та перевірений план міграції.

## Підтверджений результат автономної репетиції
Архів SHA-256 перевірено, усі 462 entries без symlinks/path traversal; `docker compose config` PASS з тестовим origin; міграції чистої SQLite PASS; ізольований Node24 відповів 200 на /healthz, / і /login/ за правильних Host/HTTPS proxy headers. /readyz = 503 без owner enrollment — очікуваний захисний стан. Не підміняти його успішним end-to-end owner UAT.

## Пакет на VPS (підготовлений до передачі)
`/srv/knaba/vps/evidence/knaba-owner-handoff-20261028/KNABA_OWNER_HANDOFF_2026-10-28.zip`
SHA-256 ZIP: `40da67ba4777958eb36cae7475872ec3b5f1902120599b4e57bef41c9e36b230`.
SHA-256 app tar.gz: `6b6283d08efa95ae36a9ba9adb0dbccb0e702888c9ac69028a03cc5c6f5b415b`.
Файл приватний на VPS: скопіювати через авторизований SFTP/SCP, не відкривати публічне посилання.
