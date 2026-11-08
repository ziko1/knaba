# KNABA DE — F3 та мобільні файли: кандидат для сукупної перевірки

## Статус і межі

**SOURCE_REVIEWED_CANDIDATE; AGGREGATE_CI_PENDING; PRODUCT_NOT_READY.** Цей запис
описує наступний спільний source checkpoint у [draft PR129](https://github.com/ziko1/knaba/pull/129).
Попередній прийнятий F2 runtime залишається прив'язаним до
`e03d2be0d0ea1ae7ced90f50631c7b81cd34c5b5` і main run42485949823. Його успіх
не є результатом нового кандидата. Локальна інтеграція native media збережена
в `44f1539ced6b36da009341f199dc8d780c7af656`; F3 переноситься точними байтами
з окремо перевірених ERP26, VPS13 і web/bridge16 manifests.

Реєстр зберігає114 trace rows:42 IN_PROGRESS та72 AC NOT_RUN. Ціль V4 —24 KNB
і72 складені acceptance; збережена V3 —432 вимоги/475 acceptance/34 модулі.
Цей checkpoint не закриває складений критерій за одним unit test або build.
Нормативні специфікації, чинні permissions, scope і попередні докази збережені.

## Реалізована поведінка

### F3: вхід через вже зв'язані акаунти

ERP видає похідну сесію лише для чинного незмінного F1 binding і поточної F2
source authority. Користувач бачить компанію та обидва акаунти, повторно підтверджує
обліковий запис сайту, явно підтверджує вхід і проходить потрібний ERP MFA. Email не
використовується для автоматичного об'єднання акаунтів; source identity не
надає нових ERP ролей. Функція залишається disabled за замовчуванням.

Pending flow живе до300с, одноразовий native code — до60с у межах flow.
Сервер зв'язує issuer, company, client, точний callback, S256 challenge, binding,
generation, source session і чинні credentials. ERP cookie `KF3.` має
обов'язковий дочірній запис source lineage. Source logout, unlink, restart,
зміна credentials або політики позбавляють похідну сесію чинності. Перевірки
виконуються на запиті та перед видачею захищеної відповіді; невідомий результат
чи недоступність source не перетворюються на дозволений доступ. Локальний logout
завершується без залежності від source RPC.

Вебсценарій використовує окремий flow cookie і явний same-origin Continue для
переходу між сайтами. Після WEB confirm свіжий `/me` мусить підтвердити actor,
company і token-derived CSRF саме нової сесії. Старий cookie того самого
користувача не завершує новий flow. При невідомому ACK доступні явний новий вхід
та окрема перевірка поточного акаунта. Вони не позначають попередню спробу успішною.

Native server protocol і top-level callback у вебінтерфейсі реалізовано.
**Android/iOS адаптери F3 ще не реалізовано.** Для них підготовлено окремі TEST
контракти; їхня реалізація залежить від actual F3 PostgreSQL/pair/browser PASS
та незалежного прийняття. Production callback registry, власність доменів,
підписи та app links не вигадуються.

### Мобільні фото й файли

Android і iOS використовують чинні ERP media prepare/upload/register contracts,
actor/company scope, стани невідомого ACK, явний retry та відновлення локального
стану. API класифікує CUSTOMER поряд з іншими зовнішніми identities, зберігаючи
чинні обмеження доступу до внутрішніх файлів. Виправлення має13 негативних і
дозволених controller/ACL CPU-сценаріїв із SQL/blob doubles. Actual HTTP
listener/transport у цій групі не виконувався.

На Android читання оригіналу, підготовка та upload виконуються одним process-wide
IO job. Передавання byte payload у Main callback усунено; в UI надходять лише
metadata, receipt або помилка. Черга має обмеження, скасована queued робота
видаляється, а вже активний provider read повинен фактично завершитися перед
допуском іншого оригіналу. Відомий register ACK не губиться при помилці очищення
журналу. Невідомий upload повторюється лише явно з початковими descriptor/key/body.

На iOS process-wide import queue зберігає worker до завершення читання та
відкидання застарілого результату. Скасування очікування не звільняє зайнятий
provider lane завчасно. File coordination виконується поза MainActor. Це
source-level реалізація; нові52 XCTest потребують фактичного Xcode виконання.

Поточний media slice не є доказом повного AC-53/54: camera, masks/annotations,
trusted capture time, worklog attachments, client approval та physical-provider
сценарії мають окремі вимоги й докази.

## Фактично виконані перевірки до CI

| Область | Результат | Точна межа доказу |
|---|---|---|
| VPS |354 PASS,0 FAIL/SKIP |Повна локальна VPS suite з перебудованим чинним federation bundle; SQLite та synthetic ERP HTTP |
| ERP F3 |178 CPU на першому freeze;41 після auth-status delta |Перетин груп збережено;179 distinct cases across runs не названо одним aggregate run |
| Незалежний ERP review |66 CPU на першому freeze;9 HTTP на фінальній delta |Source-scoped review; SQL doubles не замінюють PostgreSQL |
| Web models/API |24 PASS |Моделі й transport CPU, без rendered browser |
| WEB-SESSION-01 |RED до виправлення;3 independent probe PASS після |Handler source extraction; не browser execution |
| TypeScript |PASS на фінальному ERP/web source |Повний `tsc --noEmit`,0 diagnostics |
| Browser/manifest guards |18 PASS після корекції |Історичний independent17/18 FAIL збережено; bounded READY handshake усуває припущення про запуск за800мс |
| ERP CI inventory guard |19 synthetic cases PASS |Тести самого fail-closed gate, не actual PostgreSQL |
| Browser discovery |19 required cases/3files |4 transfer+5 F2+10 F3; тільки `--list`, actual NOT_RUN |
| Integrated media contracts |147 PASS,0 FAIL/SKIP |134 shared/native schema/source cases+13 API cases з doubles |
| Android media |13/13 Robolectric;71 media+17 IO assertions |Actual JVM/Android framework tests;20MiB streaming sink під heap96MiB; не physical-device acceptance |
| iOS media |52 authored XCTest, NOT_RUN |Source review, plist/localization/input checks; compilation потребує Xcode |

Наведені групи не додаються в одну «загальну кількість»: вони мають перетини,
різні source freezes та різні рівні доказу. Початкові failures, виправлення й
кінцеві manifests збережено в `evidence/full-completion-20261108/federation-f3/`
та сусідньому `native-media/`.

## Обов'язкова наступна сукупна перевірка

Чинний CI мусить перебудувати точний clean committed source і виконати:

- усі ERP тести з реальною PostgreSQL, включно з18 новими F3 cases та24 F2 cases;
- actual VPS SQLite → signed ERP HTTP → PostgreSQL pair, включно з8 F3 та7 F2;
-19 required rendered HTTP-fixture cases, включно з10 F3, без skip/retry/flaky;
- чинні site/root/build/manifest/browser gates без послаблення бюджетів;
- Android pipeline та нові iOS compilation/XCTest/simulator gates.

F3 browser fixtures блокують service worker, бо worker-owned traffic обходить
`page.route`. Вони перевіряють реальну браузерну Strict/Lax поведінку на
контрольованих synthetic HTTPS origins. Actual TLS deployment, source provider,
native callbacks, service-worker runtime і physical devices — окремі scopes.

## Збереження даних і rollback

F3 схеми additive; source receipts, terminal bindings, generations, registry
digests, security fences та pending intents не очищуються для зручності тесту
або rollback. Старі ERP binaries відхиляють `KF3.` tokens до SQL lookup. Після
rollback похідний вхід потребує нового flow; ordinary ERP password sessions
і дані не переписуються. Реальне повернення target runtime потребує власного
backup/restore та exact-artifact acceptance; у цьому checkpoint deployment немає.

## Черга після actual F3 gate

1. Окремі Android/iOS TEST adapters: S256, exact callback/state/issuer,
   staged candidate cookie, atomic session switch і cancellation fence.
2. Versioned own-user privacy export/inventory для F1/F2/F3 через чинний
   privacy request/review/export/download pipeline. V1 approvals зберігаються;
   нові v2 поля потребують явного v2 legal scope. Невідомі metadata-retention
   правила не замінюються довільним TTL або DELETE.
3. Решта F4 background/subscription/push enforcement і повні compound AC,
   далі дозволені physical-device, provider, restore/load/legal та company UAT.

Цей source checkpoint використовує одну вже зарезервовану стандартну GitHub
run set. Нові paid activations —0; actual balances/quotas і total existing costs
UNKNOWN. Main merge, production/DNS/live data, магазини й customer messaging
не входять до цієї публікації. Загальний release gate залишається NOT_READY.
