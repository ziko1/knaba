# iOS: відновлення ERP-команд і рольова навігація

Обсяг: `MOBILE-011 / KN-C06`, частина `MOBILE-004…006`. Це реалізаційний інкремент KNABA DE; він не закриває повну функціональну parity, SSO, фізичні випробування або передачу продукту.

## Поведінка

- Перед ERP POST застосунок атомарно зберігає точні origin/company/user, назву команди, JSON body, idempotency key та expected_version. Повтор використовує ці самі байти.
- Журнал AES-GCM знаходиться в `Application Support/KNABADE/erp-pending-command-v1.aesgcm`. Його ключ — окремий Keychain account `erp-pending-command-key-v1`, device-only. Файл виключений із backup; GPS-черга, її ключ та device bearer не змінені.
- У журналі немає session cookie, CSRF, пароля входу або GPS credentials. Business payload зберігається зашифрованим. Повний command body обмежено 65 536 байтами, expected_version — додатне ціле або відсутній.
- Один невирішений запис блокує нові ERP writes. Вихід, restart, зміна origin та вхід іншого користувача не видаляють запис і не повторюють його автоматично. Інший origin/company/user не отримує payload та не може замінити запис.
- Явний повтор спочатку виконує `/api/v1/me`, перевіряє точну identity, а потім передає збережений запит. Server permissions/MFA залишаються авторитетними.
- Після timeout, неправильного receipt або попереднього невідомого результату журнал зберігається. Пізні 401/403/409 не доводять відсутності попереднього ефекту. Першу однозначну транзакційну відмову можна завершити без повтору; невизначений запис не має автоматичного expiry чи кнопки discard.
- Logout очищає локальну сесію й UI до мережевого очікування. Epoch-перевірки відкидають пізні login/refresh/read/write відповіді; завершення старого logout не очищає новий login. Journal resolve перевіряє поточний epoch та точний immutable запис.
- Redirect delegate відхиляє переспрямування; transport також відхиляє відповідь з іншої URL.

## Навігація

`ERPModuleCatalog.swift` містить 39 entity kinds за чинними ERP read policies, включно зі складом, закупівлями, табелями, поїздками, пропозиціями, виплатами, звітами та файлами. Видимість визначається actual permissions із server identity. Назва OWNER або іншої ролі нічого не надає сама по собі.

Це доступність розділів і читання серверно обмежених даних; вона не є доказом завершення всіх спеціалізованих мобільних форм. Сервер перевіряє company/site/customer/self scope для кожного запиту. Нові назви та recovery-повідомлення мають DE/EN/PL/LT/RU/UK переклади.

## Перевірки та межі

- `ERPCommandRecoveryTests`: реальний client + керований HTTP double, підрахунок POST і effects, точність body/key/version, process recreation, storage failure, invalid /me, 401/403/409 після unknown, конкурентні команди, керовані logout/login/refresh/write races та модель SwiftUI.
- `ERPPendingStorageTests`: справжні file/AES-GCM операції з тестовим key provider; recreation, corruption, missing key, bounds, conditional resolve, збереження GPS-файла та відсутність expiry.
- `ERPModuleCatalogTests`: позитивна/негативна видимість для client, accountant, storekeeper/procurement, employee, OWNER без permissions та namespace wildcards.

Виконувати через чинний XcodeGen/XCTest workflow на macOS із фактичним booted Simulator; source-only перевірка на Linux не є XCTest PASS. Для повної готовності окремо потрібні signed iPhone install/update, Keychain/file-protection поведінка на телефоні, реальний тестовий ERP, втрачений ACK із PostgreSQL commit, ролі/MFA та device/UAT.

## Відновлення та downgrade

Невизначений запис не видаляти вручну й не обходити новим key. Увійти тим самим акаунтом на той самий origin та явно повторити збережений запит. Якщо доступ відкликаний або файл/ключ недоступний, потрібне контрольоване звіряння з ERP; автоматично відкидати запис заборонено.

Старі версії до цього інкременту не розуміють ERP journal. Перед downgrade необхідно підтвердити результат невирішеної команди та збереження даних; просте повернення старого binary не є безпечним recovery-планом для такого запису. Міграцій серверної БД цей інкремент не додає.
