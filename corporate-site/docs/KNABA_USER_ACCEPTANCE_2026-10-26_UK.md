# KNABA — користувацький аудит і тестове приймання 26.10.2026

Доручення: перевірити весь `kneba.vsp.rest` як клієнт, усі сторінки й основні сценарії, виправити недоліки, зберегти роботу в `ziko1/knaba` і перевірити на чинному тестовому сервері. Офіційний `knaba.de`, production merge, платні провайдери та реальні повідомлення клієнтам не входять у цей тестовий випуск.

База: `2164b9505f824486594b2633a05f5fd91aee8c04`; це фактичний target `/srv/knaba/vps/current` під час аудиту. Старі повідомлення про відсутню галерею/неправильні номери вже не відображають live. Гілка: `fix/knaba-user-acceptance-20261026`.

| ID | Вимога й критерій | Власник | Стан / доказ |
|---|---|---|---|
| UA01 | Інвентар усіх доступних маршрутів, посилання, мови, 404, images | root | 122 HTML у збірці; 95 сторінок baseline у браузері; після випуску 127/127 HTTP probes, 22/22 public/media checks. Mobile BLOCKED |
| UA02 | Клієнт може вибрати кожну з 8 будівельних послуг і перевірити точну тему заявки; CRM enum збережено | root | FIXED + LIVE: 8 тем, локалізований підсумок, динамічний ліміт повідомлення, сумісність старих заявок |
| UA03 | 5 основних послуг планувальника синхронізують єдину точну тему й перехід до заявки | root | FIXED + LIVE: 5 карток, лише одна обрана, локалізований handoff; DE перехід підтверджено у формі |
| UA04 | Помічник: фокус при відкритті, Escape, повернення фокусу, припинення мікрофона при закритті | ux_research | FIXED + LIVE keyboard/draft DE/EN/UK/RU. Lifecycle unit перевіряє cleanup callback; recognition/synthesis cleanup — static review; реальний аудіотест NOT_RUN |
| UA05 | Послідовність блоків головної: послуги → додаткові роботи → процес → компанія → партнери → відгуки → FAQ → контакт | root | FIXED + LIVE; вибіркове повторне використання PR84 зі збереженням новіших змін |
| UA06 | Exact-source check/test/build/i18n/VPS + незалежний review; desktop/mobile інтеракції | code_audit / root | PASS source/build/integration/review/live desktop; isolated mobile BLOCKED: Chromium No usable sandbox |
| UA07 | Тестове розгортання з перевіркою поточної версії, збереженням даних і rollback; повторна live перевірка | root | TEST DEPLOYED cecb321; lock/CAS, backup + незалежне відновлення, HTTPS та live UI PASS |
| UA08 | Готовність усього проєкту: чесний список ERP/provider/owner/device/rights gaps | code_audit / root | DOCUMENTED нижче. Приймання всього продукту залишається OPEN |

Команда: Codex runtime `/root` — інтеграція/браузер/реліз; `/root/ux_research` — офіційні джерела й вузьке виправлення помічника; `/root/code_audit` — незалежний аудит і review. Нові платні API/CI: EUR 0 дозволених витрат; фактична вартість runtime невідома.

Джерела перевірки: https://knaba.de/ (факти компанії), https://www.w3.org/WAI/tutorials/forms/notifications/ (помилки й підтвердження форми), https://www.w3.org/WAI/WCAG22/Understanding/reflow.html (320 CSS px), https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites (локалізовані URL). Це критерії, а не сертифікація WCAG чи юридичне приймання.

Opera Connector: UNAVAILABLE, Browser not connected. Cloud Chromium відкрив чинний сайт без policy error. Автоматичні UI перевірки й людське UAT звітуються окремо.

## Результат випуску

На `https://kneba.vsp.rest/` розгорнуто **тестовий** release `cecb321ac41106c7a4f6da2d4a98308508852b38`. Runtime зібрано з `c6277c94b9dd69ee036a41e84a1d2ca1f64363f8`; наступні `88b0eee` і `cecb321` змінюють лише браузерний тест. Пізніший коміт доказів/документації не змінює runtime. Незалежний review не знайшов блокувальних дефектів для цього тестового розгортання. Це не сертифікація готовності всього продукту до передачі замовнику.

Архів runtime: SHA256 `ceab809aafa13092332bc00f2400268f66247ba954466f6e94fde0ac319529a8`, 1 307 351 B. Файли `vps/`, `drizzle/`, `package.json` і конфігурація сервера не змінені. Збережено шість установлених міграцій. Подальші правки browser harness лише уточнюють фактичні locators, прокручування до `client:visible` і exit 2 для заблокованого середовища.

## Виявлені й виправлені проблеми

| Пріоритет | Що бачив клієнт до змін | Що реалізовано й чим перевірено |
|---|---|---|
| P1 | Сайт пропонував 8 напрямів, але контактна форма давала вибрати лише загальний клінінг | 8 точних тем у формі; `anliegen` проходить allowlist; тип об’єкта за замовчуванням Baustelle. У CRM збережено чинну категорію, точна тема додається до повідомлення. Unit matrix 8 × 4 мови; live повний шлях до review у 4 мовах |
| P1 | Каталог планувальника не представляв усі основні роботи | 5 карток із спільним станом, точна тема в посиланні, одна активна картка. Live 4 мови; DE натискання посилання → правильна тема у формі |
| P1 | Помічник не закривався Escape; фокус лишався поза відкритою панеллю, після закриття губився | Фокус панелі при відкритті, Escape, повернення до дійсної кнопки запуску; збереження чернетки. Live 4 мови. Static review: закриття/cleanup зупиняє speech recognition/synthesis і від’єднує callbacks. Unit lifecycle перевіряє виклик cleanup callback; реальний аудіотест NOT_RUN |
| P2 | Завершальний заклик до заявки з’являвся до частини доказових блоків | Головна: послуги → додаткові роботи → процес → компанія → партнери → відгуки → FAQ → заявка. Збережено актуальні телефони, галерею й усунення повторів CTA; source/built HTML regressions PASS |
| P2 | Точна тема могла зменшити доступний ліміт тексту й спричинити серверну відмову | Динамічний maxlength = 500 мінус локалізований префікс. При зміні теми текст не обрізається; помилка пояснює актуальну межу. Boundary tests для всіх тем і мов |
| P2 | Заміна загальних формулювань могла змінити старі двоаргументні виклики `buildInquiry` | Legacy subject/intro збережено. Нейтральна «Проєктна заявка» використовується тільки для точної будівельної теми. Старі RU regressions проходять без послаблення assertions |

## Охоплення проєкту

| Частина | Результат / межі |
|---|---|
| Головна, каталог, 8 service detail, компанія, галерея, регіон, галузі, кар’єра | Інвентар HTML, посилання, мови, заголовки, існуючі contact/CTA/icon gates; public desktop browser traversal. У галереї залишено чесні ілюстративні матеріали; реальні кейси/відгуки не вигадувалися |
| Планувальник, FAQ, контакт | Live інтерактивний сценарій планувальника/заявки, CTA, focus і помічник. П’ять основних та три спеціальні роботи відображаються окремо з наявними умовами погодження |
| 4 поради × 4 мови, legal pages | Static/build та всі опубліковані URL через HTTPS. На baseline browser шлях `/ru/ratgeber/baureinigung-phasen/` дав `ERR_HTTP_RESPONSE_CODE_FAILURE`; читання error page відхилене політикою протоколу. Не обходили обмеження. Два наступні RU guide URL не пройшли браузерний обхід; після релізу HTTP для цих адрес PASS |
| Мови й SEO | DE/EN/UK/RU — 4 опубліковані мови; 95 інших у каталозі залишаються pending. i18n source 26 маршрутів / 944 одиниці. Hreflang/canonical, sitemap, noindex private/error pages — built gates. `/404.html` як прямий статичний документ повертає 200, має noindex і не має canonical; невідомий URL повертає 404 |
| Публічний кабінет, Studio, CRM, inbox, media | URL smoke і анонімні API guards, статичний review та наявний isolated VPS integration suite. Реальні owner/admin/client/staff workflows у live не заявляються перевіреними; автентифікацію не обходили |
| Заявка й дані | Окремий локальний Node server + нова SQLite: POST 201, повтор того самого idempotency key 200 з тією самою квитанцією, точна українська тема збережена. Компанії нічого не надсилали; real delivery/inbox acceptance OPEN |
| ERP, voice, провайдери | Окремі гілки/інтеграції не означають інтегрований продукт. У цій гілці не доведено наскрізний ERP/voice/WhatsApp процес і реальну доставку через провайдерів |

## Перевірки та докази

| Перевірка | Результат |
|---|---|
| Node 24.22.1, `npm run check` | PASS: 0 errors, 0 warnings, 4 наявні hints |
| `npm test` | PASS: 36 Vitest files / 214 tests; Node suites 28 + 27 + 9 |
| `KNABA_RELEASE_MODE=vsp npm run build` | PASS: 122 HTML documents |
| i18n extract + verify | PASS: 26 source routes / 944 units, sourceDigest `d5f995a1504c9f46cc6709579cf2bd0c2b20a72c7884c7e730cd8695ee9dfe20` |
| `KNABA_RELEASE_MODE=vsp npm run verify:build` | PASS; mode збірки й перевірки збігається |
| `KNABA_RELEASE_MODE=vsp npm run test:vps` | PASS: 24/24; isolated auth, role guards, Studio publish/restart/restore й інші інтеграційні regressions |
| Baseline cloud browser | 95 сторінок: один H1, правильні lang/title, без горизонтального overflow на доступному desktop viewport; перевірка видимих/завантажених images. Не доводить декодування всіх lazy images |
| Candidate live cloud browser | Form review, planner selection/handoff, Assistant keyboard/draft DE/EN/UK/RU PASS; без реального submit або доступу до приватних записів |
| Candidate live HTTPS | 127/127: 121 index routes + static error document + unknown URL + health/ready + 2 owner API guards; 22/22 home/gallery/media/health/ready gate |
| Isolated responsive suite 320/390/768/1440 | BLOCKED до початку UI assertions: cached Chromium `No usable sandbox`. Sandbox увімкнено, захист не змінювали, браузери не завантажували. Не PASS |
| Фізичні Android/iOS, Safari, screen reader, native zoom, польові CWV | NOT_RUN |

Перший ізольований запуск виявив неправильний entrypoint контейнера, другий — відсутній headless shell; обрано вже встановлений full Chromium channel. Після фактичної sandbox failure повторних запусків із вимкненим sandbox не було. Це проблема доступного QA середовища, а не доведений дефект сайту.

Артефакт має CSS 40 890 B gzip, сукупний emitted JS 195 442 B gzip. Це обсяг збірки, не LCP/INP чи реальні витрати завантаження конкретної сторінки.

Докази в `docs/evidence/`:

- `user-acceptance-baseline-browser-20261026.json` — точний список 95 сторінок і пропусків.
- `user-acceptance-live-browser-20261026.json` — значення підсумків, focus/draft і planner handoff.
- `user-acceptance-live-http-20261026.json` — статус кожної з 127 адрес.
- `user-acceptance-live-media-20261026.json` — 22 публічні/media checks.
- `user-acceptance-deployment-20261026.json` — artifact/backup, 279 runtime hashes, фактичні storage gates і isolated persistence.
- `user-acceptance-planner-20261026.jpg` — п’ять карток на live українській сторінці.

## Збереження даних і відкат

Перед перемиканням: live pointer точно `2164b9505f824486594b2633a05f5fd91aee8c04`; встановлено `flock`, повторний compare-and-swap pointer; storage gate <90% і >10 GiB; SHA256 архіву перевірено. Незалежно звірено незмінність `vps/` та `drizzle/` проти live release.

Online backup `knaba-2026-10-26T14-25-34-892Z.sqlite`, 233 472 B, SHA256 `7549611309deb63cec95f56796aac7b7cd28863544ffc9a89e885114c0a3455d`. Копію відновлено в окремий файл на VPS, `integrity_check=ok`, шість міграцій. Приватний backup не додається в репозиторій. Після release `integrity_check=ok`. Це перевірка відновлення на тому самому хості; offsite restore OPEN.

Rollback: під тим самим lock перевірити, що current досі `cecb321...`, атомарно повернути symlink на попередній immutable `2164b95...`, виконати `docker compose -f /srv/knaba/vps/docker-compose.yml up -d --no-deps --force-recreate web`, перевірити HTTPS/health. Дані не відкочувати: схема незмінна. Автоматичний rollback trap був установлений на час переключення й первинного smoke; не спрацював, оскільки smoke пройшов. Реальний rollback rehearsal цього випуску не виконувався.

## Що ще потрібно до остаточної здачі

| Пріоритет | Дія | Критерій завершення |
|---|---|---|
| P1 | Responsive/a11y на доступному захищеному браузері й реальних телефонах | 320/390/768/1440, 200% zoom, keyboard, screen reader; скріншоти й жодного overflow/недоступної дії |
| P1 | Приймання реальним власником | Контрольна заявка погодженими тестовими даними → квитанція → inbox/CRM → відповідь → перегляд клієнтом; перевірені ролі без обходу auth |
| P1 | Визначити довірений reverse proxy для rate limit | Нині `vps/server.mjs` передає socket peer як `cf-connecting-ip`: за Traefik користувачі можуть ділити bucket 20 заявок/год. Потрібні перевірена топологія, allowlist proxy і тести двох клієнтів/підробленого header. Не довіряти довільному X-Forwarded-For |
| P2 | Усунути stale polling у Assistant | Інтервал 8 s при timeout 12 s може дозволяти старій GET-відповіді перезаписати новіші дані. Single-flight/sequence guard і тест переставлених відповідей |
| P2 | Уточнити логіку Finder | Тип об’єкта зараз переважно повторюється в описі, рекомендацію визначає потреба. Або дати реальну object-specific пораду, або пояснити вплив двох відповідей точніше |
| P2 | Соціальні прев’ю та реальні докази роботи | Узгоджений PNG/JPEG OG, справжні кейси/фото з дозволами, підтверджені відгуки; не підміняти ілюстрації реальними проєктами |
| P1 | Інфраструктура й дані | Контроль запасу диска (перед release 89.87%, близько до 90% gate), перевірений offsite backup/restore, реальні CWV/p95; без видалення даних/backup заради проходження gate |
| P1 | Юридичне й контентне приймання | Власник підтверджує реквізити, права на фото/логотипи/відгуки, privacy/processors. Автоматичний аудит цього не засвідчує |
| P1 | Окремо прийняти ERP/voice/providers | Підтверджений source/integration contract, доступи, бюджет і sandbox tests; тільки тоді реальне підключення |

Нові npm залежності, платні API, домени та хмарні сервіси не додавалися. Публікація `main`, зміна офіційного `knaba.de`, owner credentials і приватних даних не виконувалися.

Фінальна повторна перевірка: контейнер healthy, current=cecb321, усі 279 runtime hashes збігаються. Диск після розгортання/під час паралельної роботи сервера зріс до **90.236%** (20 628 119 552 B доступно): стан WARNING, нові cutovers HOLD до відновлення запасу. Перед цим переключенням gate проходив; подальших переключень чи видалень не виконано.
