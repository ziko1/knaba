# AC-07: перенесення гостьової розмови ERP у WhatsApp

Дата зрізу: 2026-11-08. Статус: **SOURCE_IMPLEMENTED_LOCAL_VERIFIED_CI_PENDING**.
Цей запис не є production/provider/device acceptance і не закриває всю AC-07 для корпоративного сайту.

## Реалізований контракт

Використовується наявна ERP вебсесія `knaba_guest`, канонічний PostgreSQL User і його власний `PRIVATE_CUSTOMER_ASSISTANT` канал. Після перенесення User, канал, автори повідомлень, ролі та customer/site memberships залишаються тими самими.

1. Поточна гостьова cookie-сесія з CSRF створює одноразове посилання. Секрет має 256 біт випадковості; у БД потрапляє лише хеш із розділенням призначення. TTL — рівно 10 хвилин від серверного SQL clock. Запис зв’язаний із company, User, каналом, хешем **початкової** сесії та налаштованим business phone account.
2. Людина надсилає підготовлений текст у WhatsApp. Відкриття `wa.me` не створює claim, прив’язку чи згоду. Обидва aliases чинного webhook мають bounded raw-body middleware перед глобальним JSON parser: спочатку HMAC точних bytes, потім JSON і налаштований `phone_number_id`. Невірний підпис чи некоректний JSON не повертають parser diagnostics із вхідним текстом.
3. Службове повідомлення `KNABA_TRANSFER` перетворюється на хеш **до** inbox/outbox persistence. Некоректні та прострочені коди також зарезервовані: їхній текст не потрапляє у звичайну історію/AI та не створює нового WhatsApp гостя.
4. Лише worker із чинною lease, точним записом підписаного inbox і поточним `integration.process` може зафіксувати кандидата. Перший підтверджений sender закріплюється; другий не переписує його. Claim сам не відкриває історію, не створює контактну прив’язку та не вмикає згоду.
5. Початкова вебсесія показує точний номер. Людина явно підтверджує його та згоду продовжити цю розмову у WhatsApp. Сервер повторно перевіряє сесію, строк, поточного гостя, канал, відсутність клієнтської історії, версію claim і конфліктів identity. Consume, контактна прив’язка, точний route, згода й audit виконуються в одній company transaction.
6. Наступне звичайне повідомлення WhatsApp продовжує саме початковий канал. Автоматичного надсилання старої історії чи провайдерного повідомлення підтвердження цей зріз не робить.

Наявний sender може бути неприв’язаним або вже належати тому самому User. Прив’язка до іншого User, включно з відкликаною/простроченою, повертає безпечний конфлікт; вона не змінюється. Ім’я, email та збіг контактних даних не є підставою для об’єднання. Звичайне повідомлення від нового WhatsApp sender до завершення перенесення може пройти чинне створення окремого WhatsApp гостя; подальше перенесення тоді також відхиляється як конфлікт. Це свідоме обмеження першого зрізу.

Вже авторизована клієнтська історія, customer/site/task канали, підвищені ролі та інші memberships у цьому API заборонені. Для них потрібен окремий контракт із поточною membership цільової identity.

## API та стани

Усі endpoints належать чинному `/api/v1/public/chat/:channelId` і використовують поточну гостьову cookie; mutation endpoints додатково вимагають чинний CSRF/origin. Device bearer не замінює цю вебсесію.

| Метод і суфікс | Вхід | Результат |
|---|---|---|
| `POST /transfer` | `{}` | `ISSUED`, public ID, строк і одноразовий URL |
| `GET /transfer` | — | `available` і безпечний status DTO або `null`; без URL/хешів |
| `POST /transfer/:transferId/confirm` | `expectedVersion`, точний `targetSender`, `whatsappConsent: true` | Атомарний `CONFIRMED` або безпечний `CONFLICT` |
| `POST /transfer/:transferId/cancel` | `{}` | `CANCELLED`; завершений consume не відкочується |

Стани: `ISSUED → CLAIMED → CONFIRMED`; також `CANCELLED`, `EXPIRED`, `CONFLICT`. Повтор підтвердження завершеного переходу ідентичною чинною сесією не створює другого ефекту. Він не відновлює відкликану identity. Старий токен/інша сесія не отримують право повторного consume.

Є щонайбільше одна активна спроба на User і не більше п’яти видач на годину; ліміт зберігається транзакційно, додатково працює чинний HTTP limiter. Після невідомого результату видачі UI читає status. Секрет не відновлюється: користувач може скасувати спробу та видати нову.

Endpoints повертають `Cache-Control: no-store`. Одноразовий URL існує лише в первинній відповіді та пам’яті змонтованого UI. Він не проходить Engine command receipts, offline queue, audit або outbox. Після асинхронного I/O діє чинний original-session/authority response fence. Хеш сесії не експортується через Actor чи status DTO.

Внутрішні aggregate kinds `guest_conversation_transfer`, `guest_conversation_transfer_limit`, `guest_conversation_route` не мають generic Engine read ACL і залишаються default-deny навіть для identity manager. Семантичний audit містить ідентифікатори, стан і provider event ID, без raw code.

## Межа згоди WhatsApp

Підтвердження перенесення записує `whatsapp_consent_scope: {kind: 'CONVERSATION', channel_id, transfer_id}` із purpose `CONTINUE_GUEST_CONVERSATION` та source `DUAL_CHANNEL_GUEST_TRANSFER`. Дозвіл охоплює лише точний канонічний канал. Він не дозволяє digest, повідомлення іншого каналу чи notification без завантаженого канонічного message/channel context. Невідомі, неповні та некоректні scope records відхиляються; STOP блокує відправлення незалежно від scope.

Спільний predicate застосовується у fanout, `delivery.prepare`, `notifications.prepare`, digest configure/generate, WhatsApp-router та повторній перевірці worker перед provider I/O. Уже підготовлені delivery/router response повторно завантажують поточну згоду, контакт і відповідний source/access context після асинхронної перевірки lease. Для router контекст походить із його канонічного `conversation_input`, а не з переданого channel hint. Остання company transaction визначає межу перевірки; provider call починається після неї, без SQL transaction через зовнішнє I/O. Відкликання, committed до цієї перевірки, блокує відправлення. Механізм не обіцяє відкликати вже розпочатий зовнішній запит чи атомарність PostgreSQL із провайдером.

Звичайний `notifications.configure` зберігає conversation scope при зміні мови, тихих годин або повторному надсиланні наявного `whatsapp_consent: true`. Розширення до operational notifications вимагає окремого явного `all_operational_whatsapp_notifications: true` разом із consent=true та opted_out=false; цей intent flag не зберігається як preference для повторного submit. Чинна явна команда WhatsApp `OPTIN` використовує цей intent. Legacy records із попередньою unscoped operational consent залишаються сумісними. Маркетингових дозволів цей контракт не додає.

## Межі інтеграції

- Повторно використано той самий Meta webhook, `webhook_inbox`, `whatsapp.inbound` outbox і worker. Другого bridge, provider adapter чи credential issuer немає.
- ERP transfer використовує серверні `WHATSAPP_PUBLIC_NUMBER` і `WHATSAPP_PHONE_NUMBER_ID`; ingress — чинний `WHATSAPP_APP_SECRET`. Зміна business phone account не дозволяє підтвердити старий claim.
- Код/синтетичні тести не потребують `WHATSAPP_ACCESS_TOKEN`, дозволу live send, платного сервісу чи production доступу.
- Корпоративний `corporate-site` assistant має іншу D1 conversation capability (`x-knaba-conversation`), а наявний site→ERP bridge переносить лише `lead.upsert`. Його історія не стає доступною через `knaba_guest`. Цей зріз не створює federation proof, не змінює F1 і не підвищує F2–F5 зі статусу PROPOSED.
- Cross-site iframe із SameSite Strict cookie, live sender/account verification, конкретний callback/origin deployment та реальна доставка залишаються окремими браузерними/provider gates.

## Локально перевірено

Початкові дві регресії були RED: parser зберігав весь синтетичний secret у майбутньому inbox payload; новий guest transfer POST був відсутній і потрапляв у чинний 401 fallback. Після реалізації обидві перевірки GREEN.

Окремий ingress regression був RED: непідписаний malformed JSON оброблявся глобальним parser до автентифікації. Після raw-before-JSON виправлення він GREEN для обох route aliases. Початкові сім consent-scope регресій також були RED: інша розмова, scheduled notice, queued delivery, зміна scope перед egress, router response і digest отримували надмірний дозвіл; тепер вони GREEN.

Фінальний цільовий і суміжний набір — **428 PASS / 12 PostgreSQL SKIP / 0 FAIL**, 13 файлів: transfer, consent, integrations, communications, notification policy, digest, WhatsApp router/ingress, original request authority, identity. З них 74 нові transfer/consent CPU cases, включно з 16 actual Nest/Express HTTP перевірками зі явно контрольованою SQL fixture. Typecheck завершився з exit 0. SQL skips не є PASS. Раніший проміжний `npm run build` успішний; точний фінальний aggregate build залишається CI gate після інтеграції consent delta.

10 нових справжніх PostgreSQL cases підготовлено: підписаний HTTP повний цикл/10 повторів; конкуренція двох sender і confirm; original-session revocation під company lock; expiry після записів із rollback; immutable identity conflict; tenant isolation; реальний inbox/outbox rollback; expiry worker lease після claim write; два випадки signed transfer → збереження conversation scope після preferences update → відхилення іншого каналу → committed scope/STOP перед queued egress без provider call. Локально PostgreSQL відсутній, тому ці cases мають статус **NOT_RUN** до exact-candidate CI.

4 rendered browser cases підготовлено: явна згода/точний номер/CSRF, очищення UI після 401, пізня стара відповідь, невідомий результат видачі після offline/reconnect. Тут усі guest/transfer API відповіді — явно контрольовані HTTP fixtures. Вони перевіряють actual built React UI, а не SQL чи provider. Локальний Chrome не встановлений: **NOT_RUN**, без завантажень або sandbox bypass.

## Відтворення на точному candidate

Передумови: Node24, залежності з чинного ERP lockfile. Команди виконуються з `erp/`.

```sh
npm run typecheck
npm test -- tests/conversation-transfer.test.ts tests/conversation-transfer-security.test.ts tests/conversation-transfer-http.test.ts tests/conversation-transfer-consent.test.ts tests/whatsapp-ingress-service.test.ts tests/communications.test.ts tests/notification-policy.test.ts tests/operations-digest.test.ts tests/whatsapp-router.test.ts
```

Справжній PostgreSQL у дозволеному ізольованому TEST середовищі:

```sh
APP_MODE=TEST DATABASE_URL="$KNABA_TEST_DATABASE_URL" npm test -- tests/conversation-transfer.integration.test.ts
```

Rendered UI не потребує API/БД: spec сам перехоплює `/api/v1/me`, public config, guest chat/messages і transfer routes. Попередній catch-all дозволяє лише static same-origin requests, а будь-який неописаний API/external request блокує та провалює тест; query/token не потрапляють у diagnostics. Тести не натискають `wa.me`. Preview додатково вимикає успадкований `/api` proxy. Потрібні зібраний фронтенд та **вже встановлений** Chrome. У першому терміналі/CI service:

```sh
npm run build
node --input-type=module -e 'import {preview} from "vite"; await preview({configFile:"apps/web/vite.config.ts",preview:{host:"127.0.0.1",port:4177,strictPort:true,proxy:{}}});'
```

Після HTTP readiness сторінки `http://127.0.0.1:4177/`, в іншому терміналі/CI step:

```sh
E2E_BASE_URL=http://127.0.0.1:4177 PLAYWRIGHT_CHROMIUM_EXECUTABLE="$KNABA_EXISTING_CHROME" node node_modules/@playwright/test/cli.js test tests/conversation-transfer-ui.spec.ts --config playwright.config.ts
```

`KNABA_EXISTING_CHROME` — перевірений на runner шлях до наявного Chrome/чинного wrapper. `chromiumSandbox: true` збережено; завантаження браузера або `--no-sandbox` не є частиною цього контракту. Звичайний browser CI також включає новий spec через `testMatch`.

## Невирішені release gates

1. Незалежний review та PostgreSQL/rendered UI CI на точному commit після інтеграції; локальні результати не переносяться на змінений source автоматично.
2. Політика retention/erasure для identity/session proof metadata. Чинна erasure класифікація не покриває `contact_identity` та нові transfer/route/limit records. Хеші й sender у private metadata/inbox/revisions не отримали вигаданої CHAT категорії чи строку видалення. Потрібен окремо затверджений контракт; поточний metadata retention не є повним DSAR fulfillment.
3. Окреме володіння історією corporate-site assistant і federation/guest bridge. ERP-only proof не переносить чужу D1 capability чи клієнтську membership.
4. Live provider/iframe/device/deployment acceptance і дозвіл конкретного середовища.

Rollback source: повернути код до попереднього candidate, зберігши адитивні private records/audit. Нової схеми, міграції чи міграційного rollback немає. Перед операційним rollback потрібне quiescence worker/API: старий worker не розуміє reserved transfer payload та conversation consent scope. Відправлення WhatsApp для таких records мають залишатися зупиненими до scope-aware runtime; попередній boolean-only consumer не гарантує межу цієї згоди. Дані та audit не видаляти.
