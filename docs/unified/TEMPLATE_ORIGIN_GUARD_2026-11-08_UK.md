# KNABA — KN-C08-C: адреса в шаблонній доставці

Прийнята база: `d76bb939c83103fcbf4ed4374a48f4ea85b920d2`, PR134, CI42489218942: ERP3118, bridge82, site732+90+297, root30, independent ACCEPT. Це продовження підтвердженого consumer gap із production configuration audit.

## Контракт

WorkerRunner не підставляє вигаданий public origin у WhatsApp template. Лише TEMPLATE потребує явного origin, перевіреного чинним shared runtime contract у свіжій leased transaction до SENDING, increment attempts або provider pins. Відсутня/неправильна конфігурація дає FAILED / DEFINITIVE з фіксованим error; пов’язане notification відображає цей стан. Існуючі consent, message-version, recipient, permission, lease й quiet-hour guards зберігаються.

Валідний raw origin фіксується у claim snapshot і саме він потрапляє в provider output. Пізніша зміна mutable worker options не змінює вже перевірене посилання. TEXT/WEB jobs без публічної адреси продовжують працювати. Abandoned SENDING лишається UNKNOWN без повторного надсилання. Після definitive configuration failure новий delivery job не відновлює send автоматично.

Цей контракт не додає DNS ownership/hostname allowlists, production provider activation, template catalog/UI або legal approval. API, native source, schema та dependencies не змінюються.

## Перевірка й бюджет

Спочатку meaningful RED на фактичному WorkerRunner.handle з явними SQL/actor/provider doubles; після виправлення — негативні origin cases, positive raw snapshot, TEXT/WEB compatibility і відсутність SENDING/provider effect. Actual PostgreSQL acceptance розширює чинний notification-policy integration suite: fresh lease, status/revision/notification projection, valid template та duplicate protection. Fake provider HTTP не є live Meta acceptance.

Один source checkpoint і максимум один correction для конкретного failure; максимум чотири automatic existing public standard Ubuntu repository runs, чинні timeouts, native runs не плануються. Діючий public access і official standard-runner тариф перевірені 08.11.2026; новий paid/provider activation EUR0, model/account balance UNKNOWN. Перед публікацією — input hashes, TypeScript, source review, current budget/memory та окремий exact-source CI. Whole product NOT_READY; original72 V4/475 V3 не перепозначаються.

## Source checkpoint

Root відтворив RED на actual WorkerRunner.handle із явними SQL/actor/provider doubles: missing origin призводив до SENDING/attempts1. Після fix237/237 focused PASS у5 файлах, включно з19 новими consumer cases. Незалежний reviewer прийняв runner та CPU tests; root перевірив independently authored7 нових PostgreSQL cases у notification-policy suite (21 total), їх locally NOT_RUN. Фінальні TypeScript та root30 PASS, diff clean. Source review не замінює exact-commit hosted acceptance.

До SENDING додається лише required origin guard; значення raw зберігається у transaction snapshot. Фіксований error не пише URL credentials до revisions/notifications. SQL schema не змінюється. Потенційний source rollback до d76 повертає historical placeholder consumer, тому operator review має зберегти валідну адресу або вимкнену template delivery. Production rollback тут не авторизовано.
