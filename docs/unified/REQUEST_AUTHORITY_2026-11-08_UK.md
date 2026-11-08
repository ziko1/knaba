# KNABA — поточна сесія під час ERP-операції (F4-A)

База: accepted F2 `1a6e837de7a351a67bf4bef3bda00961aed19d83`, tree `0bf71d43846899fd288c01b95a5f52f8a55d7977`. Це окремий незавершений source candidate. Його нові PostgreSQL/HTTP cases ще не прийняті; старий F2 CI не є доказом цього коду.

## Проблема й межі

AuthService перевіряв cookie/device до окремої бізнес-транзакції. Engine перечитував права, але не початкову сесію. Через паузу між цими кроками завершений logout міг лишити already-authenticated request зі старим proof; file storage I/O та SSE мали аналогічну межу перед відправленням bytes.

F4-A перевіряє **чинні локальні ERP cookie sessions і device credentials**. Не видає federated sessions, не додає SSO й не переносить site roles. F3 session exchange, current site introspection, повна policy/retention/background матриця та browser/device/company приймання лишаються відкритими.

## Обрана реалізація

Обов’язковий Nest interceptor створює окремий AsyncLocalStorage context для HTTP-запиту. Нові controller handlers за замовчуванням потребують proof; явний список public/invitation/enrollment/signed-server handlers зберігає їхні окремі чинні перевірки. Лише AuthService реєструє server-owned company/user/token hash і початковий expiry. Приватні proof не входять до Actor, JSON, журналів команд або ключа ідемпотентності.

Короткий authentication context дозволяє завантажити credential і user до реєстрації proof. Він не охоплює наступну business transaction. У кожній захищеній Database.transaction перевіряються exact company/actor, активна початкова session/device і user — до роботи, до cached receipt return і після async роботи перед COMMIT. Усі ці перевірки використовують поточну transaction, без вкладених company locks чи remote calls. Logout також переміщено під company transaction. Часова межа не розширюється всередині одного запиту.

Завершений logout перед початком бізнес-транзакції відхиляє запит. Logout, що очікує вже розпочату захищену транзакцію, впорядковується company lock: операція може комітитися перед logout, а наступний запит буде відхилено. Це визначена послідовність commit, не обіцянка скасувати вже комітований ефект. Розрив HTTP після commit потребує чинного idempotent recovery.

Зміна власного пароля/MFA та logout законно відкликають поточну сесію. Лише відповідний успішний server handler у тій самій transaction може зафіксувати точне own-revoke підтвердження. Фінальний guard допускає тільки minimal ACK; richer/private result відхиляється. ACK доступний після фактичного COMMIT; rollback/serialization retry не створює підтвердження. Browser flag або загальний список назв команд не дає bypass.

JSON має повторну session перевірку перед відповіддю. Для media/report/privacy download перевірки стоять до headers/body після storage I/O; media додатково звіряє поточну видимість, версію та blob key. SSE перевіряє session і поточний authority fingerprint перед update/heartbeat. Закриття response позначає request context закритим. Cookies, role/membership checks, native device contract та company scopes зберігають свої окремі перевірки.

## Відновлення мобільних команд

Legacy `device.bind` і `device.revoke` зберігають чинний Entity response contract навіть коли користувач сам відкликає поточний bearer. Окрема server-only capability перевіряє original device/company/user/token/expiry, actual inactive+revoked row та точний canonical hash persisted result; bind додатково звіряє replacement нового пристрою того самого користувача. Лише цей результат можна повернути після COMMIT; старий proof не відкриває наступної транзакції. Cookie logout явно не приймає GPS/device bearer; раніше він і так не відкликав такий credential.

SSE резервує слот тільки після успішного final guard і повторно читає count без async gap; відмова handshake не зменшує майбутню квоту користувача. Media file після storage I/O повторно обчислює external/own/requested-copy policy з актуального actor та asset, включно з CUSTOMER; старий вибір raw/client blob не переноситься через зміну ролі.

Ключ/тіло команди та company/actor receipt не прив’язуються до старої session. Новий вхід того самого користувача може відновити точний попередній результат після актуальної перевірки прав. Стара відкликана session, інший користувач/компанія або змінена авторизація не можуть отримати receipt через цей механізм. Unknown-write journal на Android/iOS залишається чинним.

## Перевірки, performance та rollback

CPU tests використовують явно позначені SQL/transaction doubles для AsyncLocalStorage isolation, required proof, expiry, guest/device відмов і own-revoke capabilities. Вони не доводять PostgreSQL atomicity. Окремі actual Nest/PostgreSQL/private-blob/SSE tests мають перевірити races, rollback, receipt recovery та exact failure codes. Незалежний source review та final exact-source CI обов’язкові перед прийманням.

Це correctness change, не оптимізація. Додано bounded local SQL checks; production p95/throughput тут ще не виміряно. Existing performance/load acceptance з канонічної специфікації не закривається числом unit tests.

SQL schema не змінюється. Source rollback вимкне новий fence, тому попередні довгі/in-flight request ризики знову з’являться; не активувати F3 sessions на runtime без прийнятого fence. Production/DNS/main/signing/store changes цим кодом не авторизовані та не виконані.
