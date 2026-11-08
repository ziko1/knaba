# KNABA DE iOS 0.4.0 / build 4 — кандидат для перевірки

Дата: 08.11.2026, Europe/Berlin. Проєкт: **KNABA DE**, не AVENQO або VSP.

Доручення: «продовжуй розроботку и ос приложения для кнеба де и дай мени фай робочої версии з всим шо має система кнаба де для иос».

**Повна передача на iPhone залишається BLOCKED.** Вихідний ZIP і simulator `.app.zip` не встановлюються на iPhone. Для телефона потрібен підписаний компанією IPA з відповідним provisioning або дозволений канал TestFlight, перевірений сервер і перевірка на пристрої. Цей документ не замінює канонічні `erp/KNABA_DE_TARGET_SPEC.md`, V3/V4 acceptance, `docs/mobile/ROADMAP.md` та unified backlog.

## Що змінює кандидат

- Нативні SwiftUI-розділи відповідають фактичним permissions ERP. OWNER не отримує клієнтський wildcard; клієнт і зовнішній Bauleiter можуть відкрити проєкції своїх об’єктів, замовлень, пропозицій і опублікованих звітів. Остаточну перевірку membership/company/site виконує сервер.
- Додано пошук записів, читабельні вкладені результати команд і звітів, власні сповіщення, пропозиції бригад. Дані отримуються з чинного ERP API; фіктивних записів немає.
- Із завдання доступні дозволені сервером Start, worklog, checklist, submit/review. Запит містить справжні ID і version; кількість з трьома десятковими знаками переводиться в тисячні одиниці без floating-point округлення. Після успіху список/картка оновлюються.
- Nullable поля мають явне «Очистити значення». Лише дозволене схемою очищення надсилає JSON null; порожнє необов’язкове поле пропускається, а текст «null» зберігається як текст. Складні непідтримувані unions не підміняються рядками.
- Незавершена зміна шифрується AES-GCM перед передаванням. Зберігаються початкові payload, version та idempotency key, прив’язані до HTTPS origin/company/user. Відновлення після входу не виконує автоматичного повтору. Інший користувач не читає й не повторює чужу дію.
- При невідомому результаті нова зміна заблокована; користувач переглядає початкову дію й явно підтверджує повтор із тим самим ключем. Після вже невідомого результату пізніша відмова не означає, що попереднього ефекту не було.
- Недоступне або пошкоджене сховище відновлення не блокує підтверджений вхід і читання. Усі бізнес-записи, включно з password/MFA та повідомленнями, залишаються заблокованими; ключ і файл не видаляються. Для розв’язання втраченої операції потрібна серверна звірка.
- Пароль/MFA вводяться через SecureField; точні пробіли пароля збережено. Дві чинні команди захисту виконуються одноразово в пам’яті, без збереження секретів у журналі, після чого потрібен новий вхід. При обриві відповіді успіх не заявляється.
- Вихід одразу очищає приватний UI; пізні відповіді не повертають стару сесію. Повна ревізія серверних прав, включно зі складськими scope/MFA, очищає дані та відкриті картки.
- Збережено окрему employee/GPS-сесію, шифровану чергу змін, добровільну геолокацію та DE/EN/PL/LT/RU/UK. ERP-вхід не активує GPS.

## Поточні межі повноти

| Обсяг початкового запиту | Реалізація / необхідний доказ |
| --- | --- |
| Нативний вхід, ролі, серверні записи/команди, чат | Код існує; актуальні compile/XCTest та реальний ERP UAT потрібні окремо |
| Employee shift/GPS/offline | Чинний модуль збережено; фон, reboot, battery, permissions — фізична перевірка |
| Client / зовнішній Bauleiter | ERP membership projections; приймання із справжніми тестовими акаунтами ще потрібне |
| Partner корпоративного сайту | Окрема ERP-роль Partner і site↔ERP SSO не реалізовані; це відкритий integration scope |
| Вкладення, складні бізнес-форми, документи/експорти | Повна спеціалізована native parity не підтверджена загальною формою command catalog |
| Запрошення й адміністративне зарахування пристроїв | Generic results приховують одноразові токени `user.invite` / `device.enroll`; завершений безпечний сценарій передавання ще потрібен. Для цих дій використовувати чинний погоджений адміністративний workflow |
| Voice, WhatsApp, Telegram, AI | Серверні модулі/провайдери мають власні відкриті gates; мобільна збірка їх не активує |
| Профіль, password reset, site account | Чинні ERP password/MFA команди підтримано; нового recovery endpoint або shared identity не вигадано |
| Повний V4/V3 продукт, юридичне й owner UAT | Незакриті канонічні вимоги збережено. Успішний simulator CI не закриває весь продукт |
| Файл для iPhone | Apple team, certificate/profile, export, install/update/launch та channel receipt необхідні; поки BLOCKED |

## Перевірки кандидата

Перевірений native source: `134d208bb1908b7ba6470b48928759ed865d2616`. Xcode26.6, iPhone17 Simulator/iOS26.5: **74/74 XCTest PASS**, 0 failures/skips, встановлення й запуск PASS. Завантажені архіви звірено за SHA-256; усі36 native build inputs збіглися з Git. Root29 і21 Python packaging cases PASS (Python suite входить до root wrapper і не рахується двічі). Чотири основні repository CI jobs, включно з PostgreSQL та HTTP bridge acceptance, PASS. Це unit/model і simulator-докази; physical iPhone та live ERP UAT не виконані.

Актуальні exact source, CI runs, artifact hashes, незалежний review та відкриті gates: `evidence/ios-20261108/verification.json`. Native run: https://github.com/ziko1/knaba/actions/runs/42463393159. Repository run: https://github.com/ziko1/knaba/actions/runs/42463393097. Пізніші документаційні коміти не змінюють походження вже зібраних байтів.

Локальні команди з кореня репозиторію:

```sh
npm test
python3 -m unittest discover -s tests/ios -p 'test_*.py' -v
bash -n erp/apps/mobile-ios/scripts/build.sh erp/apps/mobile-ios/scripts/archive-release.sh
```

Root wrapper `scripts/ios-distribution.test.mjs` викликає ту саму Python suite; її cases не рахуються двічі. SwiftUI/transport/recovery XCTest виконуються лише на фактичному macOS runner.

## Отримання й запуск на Mac

Канонічне джерело — iOS candidate branch у `ziko1/knaba`, stacked на актуальний PR123. Root `.github/workflows/ios.yml` збирає точний commit і зберігає `.app.zip`, `.xcresult.zip` та source/test receipts. Формат результату — **IOS_SIMULATOR_ONLY_NOT_IPA**.

Для source package:

```sh
python3 scripts/mobile/package-ios-source.py /absolute/knaba-ios-0.4.0-source.zip
cd erp/apps/mobile-ios
bash scripts/build.sh
```

Потрібні Mac, Xcode26+ та XcodeGen2.43.0. `build.sh` без test destination збирає лише симулятор. Для XCTest передати реальний `KNABA_IOS_TEST_DESTINATION`, отриманий із `xcodebuild -showdestinations`/`simctl`; не вгадувати UUID. Generated project: `KNABADE.xcodeproj`, scheme: `KNABADE`.

Якщо отримано готовий GitHub artifact, розпакувати зовнішній ZIP, а потім вкладений `KNABADE-simulator.app.zip`. На Mac вибрати сумісний симулятор із фактичного списку та вказати його UUID замість `ACTUAL_SIMULATOR_UDID`:

```sh
ditto -x -k KNABADE-simulator.app.zip simulator-app
xcrun simctl list devices available
xcrun simctl boot 'ACTUAL_SIMULATOR_UDID'
xcrun simctl bootstatus 'ACTUAL_SIMULATOR_UDID' -b
xcrun simctl install 'ACTUAL_SIMULATOR_UDID' simulator-app/KNABADE.app
xcrun simctl launch 'ACTUAL_SIMULATOR_UDID' de.knaba.mobile
```

Якщо вибраний симулятор уже запущений, пропустити `boot`. Такий `.app` працює лише в сумісному iOS Simulator на Mac.

## Підписаний IPA

На дозволеному Mac установити signing assets компанії через стандартний Apple workflow. Секретні ключі, паролі, профілі та токени не передавати в чат і не додавати в Git/пакет.

У reviewed `ExportOptions.plist` потрібні `destination=export`, `signingStyle=manual`, `manageAppVersionAndBuildNumber=false`, owner `teamID` і provisioning profile для `de.knaba.mobile`. Метод: `debugging`, `release-testing` або `app-store-connect` відповідно до погодженого каналу. App Store export не є файлом для довільного ручного встановлення.

Замінити `OWNER_TEAM_ID` на власний підтверджений Apple Team ID. Команди виконувати з кореня checkout:

```sh
cd erp/apps/mobile-ios
KNABA_APPLE_TEAM_ID='OWNER_TEAM_ID' \
KNABA_IOS_EXPORT_OPTIONS=/absolute/ExportOptions.plist \
bash scripts/archive-release.sh
```

Скрипт перевіряє final IPA bundle/version/build, codesign, profile expiry/team, entitlements, certificate і SHA-256. Результати — `build/distribution/export/*.ipa` і `build/distribution/receipt.json`. Він не створює профілі/сертифікати, не реєструє телефони й не завантажує build у TestFlight/App Store. Окремо потрібна перевірка конкретного iPhone, інсталяції/оновлення та прав користувача.

## Ручне приймання на iPhone з дозволеним тестовим ERP

1. Перевірити artifact SHA-256, bundle/version4, канал і profile; встановити без видалення попередніх даних, перевірити upgrade.
2. Увійти тестовими ролями Client, Employee, Internal/External Bauleiter та уповноваженим адміністратором. Звірити зі справжнім сервером дозволені записи і відсутність чужої компанії/customer/site.
3. Завдання: Start → worklog → checklist → submit → review іншим уповноваженим. Звірити остаточні записи/versions, а не лише повідомлення UI.
4. Перервати відповідь після серверного запису, закрити/відкрити застосунок, увійти тим самим actor і явно повторити збережену дію. Підтвердити один бізнес-ефект. Увійти іншим actor: чужа дія не показується.
5. Відкликати доступ, змінити warehouse/site scope, вийти під час повільної відповіді. Старі записи, чат, result/detail не повертаються.
6. Перевірити пароль/MFA й невідому відповідь без збереження credentials; відновити вхід через підтверджений стан сервера.
7. Перевірити шість мов, Dynamic Type, VoiceOver, keyboard, loading/empty/error, offline/reconnect; окремо GPS consent/background/reboot за затвердженою політикою компанії.

## Відновлення й дозволи

Production, DNS, база й server configuration цим кандидатом не змінюються. Зміни native є окремою кандидатною гілкою. Не видаляти дані застосунку для обходу pending command або storage failure: спочатку звірити серверний результат, зберегти evidence й узгодити recovery. Попередній binary можна повернути лише зі збереженням signing identity та оцінкою сумісності нового encrypted journal; downgrade сам собою не відновлює невідому операцію.
