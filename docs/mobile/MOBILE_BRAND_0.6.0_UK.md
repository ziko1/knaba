# KNABA Mobile 0.6.0 — стиль сайту та тестова передача

## Доручення й база

08.11.2026 користувач доручив максимально якісне оформлення iOS під стиль системи KNABA, Android у тому самому стилі та **два вже зібрані файли, які замовник може встановити для тестування**. Це продовження KNABA DE; AVENQO не входить до обсягу. Потреба у встановлюваному IPA залишається acceptance, навіть якщо підпис недоступний.

База: `bb223af67af9eae5f11e7ca225f89ddf97a8e4e2`, Draft PR133 — зведені актуальні backend contracts, iOS0.5.1 і Android0.5.0. Historical test receipts не переносяться на новий дизайн. 23 untracked legacy0.4 files з попереднього checkout збережено окремо поза build tree; вони не є частиною PR133 і не компілюються в новій версії.

## Дизайн і межі

Еталон — чинні `corporate-site/src/styles/global.css`, `portal.css`, `workspace.css` і реально підключені Layout assets. Темна бірюзова шапка `#11323b`, текст `#102f38`, action `#075f63`, lime `#d8f779`, paper `#fbfcf7`; білі/пастельні картки, native системні шрифти й масштабування. Canonical compact wordmark експортується без зміни геометрії; чинні app icons збережені. Website live Studio preset не спостерігався: відповідність перевіряється з exact committed source.

Native SwiftUI / Android Views збережено. Перевіряються login, overview, доступні за permissions modules, contextual actions, messages, recovery/error/empty states та shift/privacy UI. Команди, authorization, encrypted journals, session/actor/version fences, opt-in GPS і шість мов DE/EN/PL/LT/RU/UK залишаються обов'язковими. Новий dependency/provider не потрібний; backend auth/SSO/full-product backlog не оголошується завершеним.

## Приймання

| ID | Очікуваний результат | Доказ | Поточний стан |
|---|---|---|---|
| BRAND-01 | Обидва native UI відповідають актуальному сайту | Source tokens/assets + незалежний visual review | IN_PROGRESS |
| BRAND-02 | Narrow/large-font/keyboard/insets й 6 locales доступні | Actual native render + focused behavior tests | IN_PROGRESS |
| BRAND-03 | Поточні auth/recovery/scopes і функції збережені | Existing native suites, registry contracts, source review | IN_PROGRESS |
| BRAND-04 | Android0.6.0/code9 APK з перевіреним підписом і metadata | Exact-source CI, APK hash/certificate, install/launch evidence | IN_PROGRESS |
| BRAND-05 | iOS0.6.0/build8 встановлюваний замовником IPA | Owner signing/profile/channel + install receipt | BLOCKED_EXTERNAL — owner signing assets не доступні |
| BRAND-06 | Справжня Swift compilation/XCTest та visual evidence | Actual Mac/Simulator CI, hash-bound PNG/app | IN_PROGRESS |
| BRAND-07 | Два customer-installable файли та інструкція | Independent artifact review, persistent links | BLOCKED_BY_BRAND-05 |
| BRAND-08 | Physical/device/live/company UAT | Версія + пристрій + реальний approved test backend | NOT_RUN |
| BRAND-09 | Увесь наявний функціонал системи KNABA доступний і перевірений у native UI | Зіставлення modules/catalog/roles та реальні наскрізні сценарії | PARTIAL_CANDIDATE — generic native modules/actions реалізовані; повне role/live/device приймання відкрите |

Root інтегрує Android ERP UI/theme, source/artifacts і evidence. `ios_brand` — SwiftUI; `brand_design_audit` — shared visual contract і Android worker UI; `release_capabilities` — capability audit/CI capture й незалежний app review. Reviewer не приймає власну реалізацію. Застосовано ai-team-orchestrator, app-release, ecc-frontend-mobile (SwiftUI/Kotlin/design/a11y), kotlin-platform-engineering (поточний Gradle), Android skill за фактичними Views межами. Окремої архітектурної міграції або платних cloud model calls немає.

Budget: zero new paid services; використовуються вже доступні штатні public GitHub runners з чинними timeout30/50min, без збільшення paid capacity. User credentials, signing keys, PII та .env у пакети не включаються. No main merge / production / live data / store upload. iOS unsigned Simulator і source ZIP не замінюють IPA та не встановлюються на iPhone.

## Rollback і наступне

Source rollback до bb223af зберігає дані, попередні артефакти та історію. Android update можливий лише з сумісним package/certificate; не радити видаляти чинні дані для обходу підпису. Остаточні SHA/artifact hashes, виконані перевірки й незалежне review додаються після збірки. Невиконані physical, signing та full-product критерії не стають PASS від зеленого CI.

## Узгодження паралельної Android-лінії перед передачею

Після першого build candidate `0234895b0075b1bb7639fa27ded4c5168e519305` виявлено реальний паралельний Android artifact від `dc54f109c52e3b8f8a2e506821a6eb322b5417c4` із versionCode8. Це divergent branch, не новіша загальна база: повна заміна втратила б поточні F1/F2/F4/C08 guards. Тому Android0.6.0 отримує **versionCode9**, а iOS залишається0.6.0/build8; номер платформи не означає спільний store build.

Вузько перенесено вже реалізовані Android discovery, foreground refresh/bounded retry, screen/session fences, one-shot password/MFA commands без recovery journal для секретів, sensitive-field masking і APK standalone/alignment guards із відповідними тестами. Збережені canonical website logo/icons, нова тема, worker UI і чотири presentation/behavior tests. Спільна поїздка включає її domain commands та permission-specific Engine projection, а не лише порожню кнопку. `vehicle-trips.ts` і три початкові тести перенесено з точним hash; поточні request/device/federated-session guards не замінено кодом старішої лінії. Production/backend deploy не виконується.

Перший hosted source023: Android APK build/lint та36 Robolectric PASS, iOS74 XCTest PASS і simulator launch; Android emulator не стартував через відсутню `libpulse.so.0`. Required ERP CI:2968 PASS/1 FAIL у Telegram exact replay fixture, де повторний виклик генератора змінював timestamp. Виправлення зберігає original Buffer для повтору, не послаблює production equality. Ці факти не є прийманням наступного SHA. Новий checkpoint має пройти власні native та repository checks.

iOS screenshot pipeline тепер видаляє лише синтетичний sandbox XCTest-host застосунку на ізольованому CI Simulator перед встановленням і запуском: попередній screenshot успадкував `erp.knaba.test` із test preferences. Це не є чисткою даних користувача. Android libpulse0 prerequisite обмежений CI runner і timeout; фінальна перевірка встановлення лишається обов'язковою.

Незалежний review перенесеного vehicle contract відтворив зовнішні записи для змішаної ролі CLIENT+OPERATIONS_MANAGER. Шість доданих негативних regression cases реально впали до виправлення; `requireInternalActor` у create та scopedVehicle закриває create/distance/cancel/personal-trip link. Після виправлення198 цільових CPU/native-registry cases PASS,0 skip; додано окремий genuine PostgreSQL case, який ще очікує CI. iOS отримав відповідний vehicle_trip module і шість назв, один permission-navigation test (очікувано75 XCTest, не виконаний count).

Android installation flow після узгодження використовує офіційне автоматичне визначення ERP. Live readiness/configuration/account і phone UAT лишаються зовнішнім acceptance; debug demo дозволяє окремо перевірити UI без зовнішніх операцій. Уточнення не підміняє повну функціональність демонстраційними даними.

## Додаткова native credential correction

Перевірка поточного iOS generic execute виявила, що довільний input міг потрапити до encrypted recovery journal, включно з credential commands. Реалізовано вузький one-shot path для password/MFA із fresh identity/повним actor snapshot, generation/origin fences і очищенням лише captured session після dispatch. Секрети не persist/replay; unsupported secret-shaped commands відхиляються; legacy journal перевіряється до retry. SecureField, точні password bytes і очищення draft супроводжуються16 новими XCTest methods. Разом із navigation case очікуваний source inventory91; actual count визначить CI. Android tiny busy-discovery regression дає очікувано60 framework tests. Ці числа не позначають PASS до нової збірки.

### Публічне підключення станом на15:13:38 UTC

Один дозволений unauthenticated GET https://knaba.de/api/public/release повернув HTTP200, валідний schemaVersion1, stage prototype та **erpOrigin:null**. Тому автоматичне реальне ERP-підключення Android зараз не сконфігуроване. /ready/login/live data не перевірялися; жодної production зміни не виконано. Debug demo доступний окремо, не підміняє live acceptance. Доказ: evidence/brand-20261108/public-connection-prerequisite.json.
