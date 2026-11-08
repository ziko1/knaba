# KNABA iOS 0.5.1 — дії з картки запису

Продовження MOBILE-004/005/012 у чинній ізольованій гілці PR127. База `d9cb200410897177454f256a09909e000a7d2647`; Android 0.5.0 та його перевірені артефакти не змінено. Цей запис не закриває весь backlog і не означає готовий реліз на iPhone.

## Реалізація

iOS використовує ті самі 61 команду та 15 типів записів, що вже підтримуються Android: завдання, кошториси, замовлення, призначення бригади, матеріальні заявки/пакети, закупівлі й приймання, табелі, поїздки, виплати, звіти/версії та звернення. Команди перевіряються за фактичним `registry.ts`, required primary-ID field і permission; назва ролі сама не відкриває дію. Для завдань видимі переходи відповідають отриманому стану; повні правила повторно перевіряє ERP.

Картка відкриває форму зі збереженим snapshot: ID і `expected_version`, а для відповідних схем також `quoteVersion`, `employeeId`, `scheduleVersion`. Ці поля не редагуються. Відсутній або некоректний обов'язковий snapshot не перетворюється на довільне поле вводу. Конфлікт із новішим серверним станом повинен повернути VERSION_CONFLICT; клієнт не підставляє нову версію для автоматичного повтору.

Безпосередньо перед надсиланням перевіряються поточний `/me`, server command catalog, permission, sensitive flag та початкова сесія. Окрема client authority generation закриває паузу між MainActor UI та actor транспортом: відкладена форма не може виконатись під новою сесією, навіть того самого користувача. Вихід перебудовує navigation stack і прибирає приватні картки.

Після підтвердженої команди оновлюється початковий тип запису, незалежно від типу повернутого результату. Помилка цього окремого читання не скасовує вже отриманий commit receipt і не пропонує нову операцію. Timeout/невідома відповідь зберігає точний encrypted journal; тільки явне відновлення використовує первинний payload, version та idempotency key.

Інтерфейс додає вибір boolean/enum, пошук дій і 54 рядки з наявних Android перекладів DE/EN/PL/LT/RU/UK. ERP-словник тепер має 162 ключі. Значення `quantityMilli` та відповідних планових/звітних полів вводяться у звичних одиницях із максимум трьома десятковими знаками та перетворюються в integer thousandths без floating-point округлення. Канонічні server IDs, невідомі команди та спеціальні schema fields залишаються технічними значеннями; це не повна заміна всіх спеціалізованих форм.

## Критерії та докази

Локальні фактичні перевірки до source freeze: TypeScript exit0; 126 native contract assertions PASS (обидві платформи проти executable ERP registry); статична перевірка 162×6 непорожніх перекладів і placeholders PASS. Це не Swift build і не пристрій.

Додано XCTest для фіксованих ID/версій, current permissions, malformed schemas/snapshots, quote/crew context, точного decimal input, типів/enum/defaults, stale session/authority, sensitive confirmation, lost acknowledgement recovery, late catalog та read failure після commit. Незалежне source review `/root/knaba_prompt_review` прийняло виправлений snapshot після перевірки session race, точного quote contract, неоднозначних назв та комплектності source archive. Actual XCTest на macOS на момент цього source checkpoint ще NOT_RUN і потребує окремого receipt; source review не замінює компіляцію.

Приймання на живому ERP, VoiceOver/клавіатурі та фізичному iPhone залишається NOT_RUN. Підпис власника, provisioning, установка/оновлення й збереження даних не доводяться Simulator. Повний shared login F2–F5, спеціалізовані mobile/media/partner/provider сценарії та компанійний UAT відкриті.

## Відновлення

Серверну схему, API, permissions і Android-код не змінено. Для source rollback повернути попередню версію iOS у кандидатній гілці; не видаляти encrypted pending journal. Уже відправлені бізнес-команди не скасовуються rollback клієнта і повинні звірятися через чинний idempotency/recovery flow. Production/store promotion потребує окремого погодженого кандидата та не виконувалась.
