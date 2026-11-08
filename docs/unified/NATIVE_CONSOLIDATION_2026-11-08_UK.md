# KNABA — зведення перевірених mobile та backend джерел

Це продовження KNABA DE. База — прийнятий KN-C08 `e747fd94e219e09faffea96c2f9f84be15a6def1`, tree `80d27a93057f368908b9e267f241ba02ed4d1b07`, [PR132](https://github.com/ziko1/knaba/pull/132), [CI42483792274](https://github.com/ziko1/knaba/actions/runs/42483792274). Окрема гілка: `feat/knaba-native-backend-consolidation-20261108`.

## Навіщо потрібне зведення

Backend із F2, F4-A, F4-B та C08 розвивався від Android/iOS 0.5.0. Прийняте iOS-доповнення 0.5.1 залишалося в [PR127](https://github.com/ziko1/knaba/pull/127) на `65f341e76749a03fc62997da5a77e17b84caf8ba`. Один узгоджений source повинен містити обидва набори змін.

Перенесено 15 файлів iOS commit: контекстні дії, immutable record/quote/crew snapshots, current permissions/catalog та session guards, локалізацію, recovery/record-action tests і source packager. Два конфлікти стосувалися лише mobile backlog та memory; збережено повнішу історію прийнятих native checkpoints. Сім historical evidence файлів від native-гілки також перенесено без зміни байтів, щоб їхні посилання залишалися доступними.

## Межі джерел

| Частина | Джерело | Перевірена властивість зведення |
|---|---|---|
| API, worker, сайт | `e747fd94…` | Файли не змінюються цим зведенням |
| Android 0.5.0 / code 6 | `fb4be719…`, також незмінний у `65f341e…` | Native tree залишається тим самим |
| iOS 0.5.1 / build 7 | `65f341e…` | Повний native tree, ERP native contract test і source packager перенесено точно |
| Документи й докази | Окремі історичні checkpoints | Старі results зберігають власні commit/artifact identities |

Portable iOS source manifest містить **44 вихідні файли**; вони збігаються з Git `65f341e…` та поточним worktree. Окремий native receipt містить **48 файлів зібраного simulator .app**. Це два різні набори: compiled bundle hashes не є hashes вихідного коду.

## Прийняті попередні результати

- C08 на `e747fd94…`: ERP 2905/124 файли, bridge 82, site 732+90+297, root 30; усі чотири required jobs SUCCESS, independent ACCEPT. Це база, а не acceptance нового consolidated source.
- Android на `fb4be719…`, native run 42463090142: 32 Robolectric, 74 transport/journal assertions з явними doubles, lint 0 errors / 17 warnings, APK/AAB. Це debug test artifacts, не owner-signed release.
- iOS на `65f341e…`, native run 42467913707: iOS job 128691606881 SUCCESS, **67/67 actual XCTest** на iPhone 16 / iOS 18.5 Simulator, Xcode 16.4. Паралельний Android job цього run завершився infrastructure HTTP504 до compilation; повний native workflow не оголошується SUCCESS.
- iOS simulator ZIP від `65f341e…`: SHA256 `9f8b0d201138cb389bc6a93389dd504f55e29b16dab38a6a2218a97f4af66d7e`, 6 620 402 bytes. Portable source archive: SHA256 `5c9328181f34a5dac4ada029abab9aaa1b52192c2f6102cb4b960463a44d0a5a`. Це окремі історичні artifacts, не нові пакети consolidated source.

Original native receipt зберігає preparation state до запуску XCTest. Фактичний результат 67/67 встановлено за окремим XCTest summary та завершеним CI log; preparation `NOT_RUN` не переписується заднім числом.

## Локальна перевірка й наступний gate

Незалежний source review прийняв 38/38 iOS файлів, 53/53 Android файли, усі 44 portable inputs і окремі 48 historical compiled bundle hashes. [Повний manifest, команди й журнали](../mobile/evidence/native-consolidation-20261108/verification.json).

У поточному candidate виконано 126/126 native-console contract tests, TypeScript exit 0 і root 30/30 без skips. Contract suite перевіряє відповідність native bindings фактичному ERP registry; це не Swift compilation і не фізичний mobile journey.

Перед прийманням потрібні нові exact-source repository jobs та існуючий native workflow: Android build/lint/tests/package і iOS simulator build/actual XCTest. Обидві гілки source мають пройти новий combined checkpoint; старі artifacts не перейменовуються як результати нового commit.

## Відкриті вимоги й повернення до бази

Whole product залишається **NOT_READY**. F3 session issuance, решта F4 privacy/background policies, specialist workflows, actual UI→API→SQL/company acceptance, physical GPS/offline/battery, stable owner signing, iPhone IPA/store distribution, load/restore та legal/provider gates не закриті. Окремий [configuration audit](PRODUCTION_CONFIGURATION_AUDIT_2026-11-08_UK.md) поставлено в чергу; цей consolidation не змінює company/origin guards.

Нових DB migrations або live operations немає. Source rollback повертає прийнятий backend `e747fd94…` з його mobile 0.5.0; історичні iOS 0.5.1 artifacts лишаються з власними identities. Повернення коду не видаляє дані чи незавершені native journals. Merge, production deployment, owner signing та store upload потребують окремого дозволу.
