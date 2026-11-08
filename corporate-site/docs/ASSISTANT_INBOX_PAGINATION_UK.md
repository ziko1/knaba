# Assistant inbox: сторінки та шість мов

Дата: 2026-11-08. Окремий KN-C05 slice після lifecycle commit
`422c292b426ff8f4bf8c249e643d9bdb5b11871e` і coverage checkpoint
`ab26e5eec6ce8d0bdbec7f1ea71accc170645b83`.
Статус: source реалізований; локальні цільові перевірки пройдено;
незалежне review, integrated build/budgets та actual browser окремо.

## API

`GET /api/assistant/owner/conversations` повертає до 100 діалогів,
сумісні `conversations`/`limited` та новий `nextCursor` (`string | null`).
Наступна сторінка: той самий маршрут із `?cursor=...`.
Сервер читає максимум 101 рядок результату, щоб розрізняти рівно 100 записів
і наявність наступної сторінки. `limited` означає фактичну наступну сторінку.

Порядок: timestamp оновлення за спаданням, потім UUID за спаданням.
Cursor — base64url JSON `{v:1, updatedAt, id}`. Він містить тільки позицію,
не містить contact data, conversation token чи hash та не є дозволом.
Версія, повний набір полів, довжина до 512 символів, канонічна дата з
мілісекундами й UUID перевіряються; повторний query parameter або некоректний
cursor дає `422`. SQL використовує параметри.

Міграція lifecycle зберігає старі некоректні дати. Щоб вони не блокували
переходи між сторінками, тільки sort key такого рядка нормалізується до
`0001-01-01T00:00:00.000Z`. Stored `updated_at` та історія не змінюються.
Додаткової міграції цей slice не має. В інтерфейсі некоректна дата має
локалізований стан «Дата недоступна».

Кожна сторінка вимагає поточного owner. Worker перевіряє роль до SQL та
перед відповіддю; VPS request-local DB fence й фінальна HTTP перевірка
залишаються чинними. Cursor з іншої сесії не обходить ці перевірки.

Це live keyset, а не незмінний snapshot всієї історії: нове повідомлення
може пересунути діалог угору. UI refresh перечитує вже завантажене вікно,
прибирає дублікати та показує актуальний порядок.

## UI і concurrency

- «Завантажити ще розмови» додає наступну сторінку без втрати відкритого
  діалогу та drafts. Одночасно виконується один load-more або list refresh.
- Poll/refresh читає тільки вже завантажену кількість сторінок. Результати
  накопичуються й замінюють список одним оновленням; проміжна перша сторінка
  не обрізає переглянуту історію. Повторні IDs не дублюються.
- Owner mutation інвалідовує незавершений list read. Пізня сторінка не
  замінює стан після дії, втрати доступу чи navigation/unmount.
- `401/403` очищає приватний кеш і cursor. Transient `5xx` зберігає поточну
  сторінку та cursor для повторної спроби.
- У чинному `/postfach/` та `/ru/postfach/` є доступний селектор усіх шести
  мов. Whitelisted вибір зберігається для вкладки; sign-in URL зберігає мову.
  Section `lang`, усі дії, стани, помилки, date locale, порожній список,
  pagination та expiry/revoke copy локалізовано.

У `src/data/assistant-inbox-locales/` є DE/EN/PL/LT/RU/UK packs,
по 38 plain-text labels. Їхні ключі перевіряються TypeScript і тестами.
Це розширює попередній DE/RU inbox із lifecycle checkpoint; воно не означає
повної локалізації всіх інших приватних сторінок сайту.

## Перевірки та межі

До реалізації зафіксовано шість SQL/API regressions: відсутня наступна
сторінка, phantom-limit metadata для 0/1/100 рядків, прийняття некоректного
cursor та неможливість перевірити later-page owner fence.

Після реалізації:

- 64 цільові Vitest: `assistant-capability`, `assistant`,
  `assistant-async-state`, `assistant-inbox-i18n`.
- 6 VPS HTTP tests з worker, зібраним із поточного source: lifecycle,
  межі current-owner/SQL/response, усі 205 розмов за три сторінки,
  відкликання на пізнішій сторінці.
- `npm run check`: 0 errors. Існуючі поза цим slice hints залишаються.
- Перевірено ties/UUID, точність мілісекунд, legacy malformed date,
  malformed/duplicate/oversize cursor, guest denial, dedupe, retry,
  load-more/poll/mutation races і шість комплектних мов.

Logs/source manifest цього локального кандидата розміщені у workspace
`verification/assistant-inbox/`. Вони не є production або full-acceptance
receipt; кінцевий commit/artifact і integrated CI додає координатор.

Нормалізований legacy sort обчислює вираз; p95 на великій реальній історії
не вимірювався. Refresh коштує пропорційно кількості сторінок, які власник
уже завантажив. Client gzip/CSS budgets не змінювалися; додану локалізацію
та scoped controls треба виміряти у фінальній інтегрованій збірці.
Browser/device/provider готовність та весь KN-C05 цими тестами не закрито:
conversation→ERP mapping і visitor acknowledgement лишаються окремими кроками.
