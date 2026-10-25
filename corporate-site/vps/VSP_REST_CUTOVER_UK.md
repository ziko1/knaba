# KNABA — цільовий сайт kneba.vsp.rest на чинному VPS

**Стан: source-only, локальні тести, публічний cutover ЗАБОРОНЕНО до виконання воріт.**
**Дата:** 2026-10-25. Документ доповнює `RELEASE_AND_CUTOVER_UK.md`, а не замінює його історію. Користувацька ціль — **`https://kneba.vsp.rest/`**, не зміна діючого `knaba.de` на One.com.

## Фактичний baseline

- Cloudflare `vsp.rest`: `kneba.vsp.rest CNAME custom-domains.chatgpt.site`, DNS-only, TTL 300. Поточний HTTPS з VPS дає **403**. **DNS не змінено**.
- На VPS: `knaba-vps-internal` (Node 24, Docker healthy), порт **тільки 127.0.0.1:19110**, збірка попередньо створена для `knaba.de`, `/readyz=503` через відсутність справжнього власника. `/healthz=200`. Захищені дані VPS SQLite збережені, контроль цілісності `ok`. Локальні резервні копії VPS не є експортом старої Sites/D1.
- Жодного підтвердженого експорту/restore старого ChatGPT Sites `appgprj_6adc346d6f8881918b73ac79ebc5d759`, тому **видаляти його або змінювати DNS передчасно**.
- Додаткові зміни PR #26/#27 (recovery/outbox) мають іншу гілку міграцій; не накладати ці SQL автоматично на цю VPS-гілку.

## Єдиний VPS runtime без другого CMS/CRM

- Збирати з `KNABA_RELEASE_MODE=vsp`: канонічна адреса `https://kneba.vsp.rest`, 51 статична сторінка, чотири мови, no preview banner, robots/sitemap для цільового домену. Не використовувати `official` (він означає `knaba.de`) і не використовувати `preview` (він має noindex і попереджувальну смугу).
- Приватний Docker env `KNABA_PUBLIC_ORIGIN=https://kneba.vsp.rest`, healthcheck з Host `kneba.vsp.rest`. **Не** монтувати provider AI ключі в контейнер.
- Reuse: `corporate-site/vps/server.mjs`, `dist/server/index.js`, D1-compatible SQLite, чинні Studio/CRM/Portal і їхній ledger. Ніякого другого публічного Gateway/черги.
- Strict host: хости, відмінні від `kneba.vsp.rest`, відповідають 421; `www.knaba.de` редирект дозволено лише при окремому `knaba.de` релізі. Тільки довірений proxy виставляє `X-Forwarded-Proto=https` із перезаписом вхідного заголовка. Старі клієнтські `oai-authenticated-*` не є авторизацією.
- Сторінки Datenschutz/Impressum мають кандидатні тексти для VPS і **вимагають юридичного схвалення власника**. Старі зображення й послуги також мають бути погоджені. Припущення про країну зберігання не робити.

## Перевірки в тимчасовому середовищі

1. Взяти лише перевірений source HEAD і `package-lock.json`; запускати Node 24 із зафіксованими залежностями.
2. `KNABA_RELEASE_MODE=vsp npm run check`, `npm test`, `npm run build`, `npm run verify:build`, `node --test vps/server.test.mjs`. Фіксувати точні вихідні SHA/artifact hash та warnings.
3. Використовувати тестовий контейнер `--network none`, read-only root, drop caps, обмежені CPU/RAM/PIDs і **окрему SQLite backup-копію**. Не передавати production credentials.
4. Перевіряти Host/HTTPS/Origin/CSRF/анонімні права, а в disposable копії — синтетичного owner, secure cookie, CRM, доступні ролі та відновлення. Тести не означають реального UAT.
5. На VPS перед cutover зберегти source+artifact SHA256, повний перевірений backup+restore, стан worker і диск. Не вважати `docker healthy` доказом `readyz`.

## Окрема згода на SEO-індексацію (fail-closed)

- Виробнича збірка для VPS повинна явно задавати KNABA_RELEASE_MODE=vsp. Поки власник не затвердив політики, бренд, права на дані та публічний реліз, не задавати KNABA_VSP_INDEX_APPROVED.
- За замовчуванням VSP має canonical kneba.vsp.rest, без preview-банера, але public HTML noindex, глобальний X-Robots-Tag: noindex, follow, sitemap із 0 адресами. Це дозволяє перевіряти сайт без передчасного SEO-опублікування.
- Значення KNABA_VSP_INDEX_APPROVED=1 при побудові release-артефакта перемикає лише індексацію: HTML index/follow, sitemap 44 адреси, Sitemap у robots.txt. Це НЕ є підтвердженням згоди власника: прапорець виставляє оператор тільки після проходження всіх P0 воріт та окремого approval receipt.
- Будь-яке інше значення, зокрема 0, true або yes, має залишати VSP у стані VSP_PENDING_APPROVAL. Потрібно перевірити npm run verify:build і фактичний HTML на точному побудованому артефакті. Режим official knaba.de не змінювався і не дає права оновлювати офіційний домен.
- У жодному разі не використовувати динамічну зміну змінної середовища контейнера як доказ, що вже зібрані статичні сторінки змінили robots/sitemap: це виключно build-time gate. Доки approval не завершено, діюче public noindex залишити без змін.

## Cutover — лише після зняття блокерів

1. **Письмове погодження власника KnaBa:** права на бренд і матеріали, обробка даних, юридичні тексти, реальна адреса owner та тестування клієнт/власник. Відновити стару Sites/D1 базу в ізольоване середовище та зіставити структуру й counts. Перенести лише дозволені дані з таблиць, включно з заявками, користувачами, чатами й consent.
2. Реальний owner enrollment через приватний stdin в уже наявний `vps/manage.mjs init-owner`, без пароля у командному рядку/чаті. Підтвердити `/readyz=200`, власник/клієнт/працівник/адмін, листування й публікацію CMS, backup/restore. `OWNER_EMAIL` не може бути вигаданим тестовим значенням.
3. Додати **один** маршрутизований HTTPS Host в наявний Coolify/Traefik до вже існуючого контейнера через перевірену приватну Docker network; не відкривати додатковий публічний порт. Переконатися в реальному TLS сертифікаті/Full (strict), конфігурації proxy, Host та CSRF; перевірити `curl --resolve kneba.vsp.rest:443:<VPS_IP> https://kneba.vsp.rest/` до DNS-зміни. Не перекидати клієнтські identity-заголовки.
4. Зберегти DNS baseline/rollback й лише після green stage перевести **тільки** `kneba.vsp.rest` з Sites CNAME на затверджену VPS-ціль у зоні `vsp.rest`. Не чіпати `knaba.de`, www, MX, SPF, DKIM, DMARC та інші DNS-імена.
5. Після DNS перевірити ззовні HTTPS, /, сторінки, robots, sitemap, legal, нову заявку з її серверним записом, рольові заборони, owner reply і restore на реальному браузері/телефоні. Відстежити latency/5xx й перевірити відкат.
6. **Старий ChatGPT Sites видаляти тільки** після повного експорту, звірки/відновлення даних, UAT, стабільного cutover та реального інструмента видалення у провайдера. DNS-видалення ≠ видалення Sites/D1.

## Rollback

- Якщо ще до DNS: вимкнути тільки новий маршрут, залишити Sites CNAME без змін.
- Після DNS: повернути збережений CNAME `custom-domains.chatgpt.site` через Cloudflare (після підтвердження доступності старого Sites); зберегти нову й стару бази незмінними, не стирати повідомлення, журнали та резервні копії.
- Не зупиняти `ai-team.service`, AVENQO та інші контейнери. Окремий AI Gateway залишається disabled; відсутні затверджені provider-кредити, budget/grant/remote trust.
- Якщо доступ до старого Sites/D1 export/rollback невідомий — `CUTOVER=HOLD`.

## Поточна межа приймання

Внутрішнє API й кандидатний збірний реліз перевіряються незалежно від публічного DNS. **Немає підстав позначати production/client handover PASS** до отримання юридичного схвалення, реальних даних, власника та підтвердженого HTTPS маршруту.
