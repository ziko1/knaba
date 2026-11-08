# KNABA DE — наступний крок після 0.5.2/build9

## Рішення та provenance

Повне приймання — **HOLD / NOT_READY**. Це сукупний source checkpoint на baseline `e57be50eb833bbb6c86d0ed4809d0756e793073a`, продовження [draft PR137](https://github.com/ziko1/knaba/pull/137). Fresh repository CI для нового commit є окремим gate; його exact SHA, run IDs і фактичні counts записуються після публікації у PR та фінальному handoff annex. Цей документ не стверджує результат ще не завершеного CI.

Frozen native/test source — `55b4231c870c2f302548381294967edfbe380db7`, tree `f0ed7b37b735ab0d697df85ebf6038900840559b`, версія 0.5.2/build9. Android/iOS application inputs і версії цим checkpoint не змінюються. Локально нових native artifacts не створено; cumulative PR path filter може автоматично запустити native CI й upload із retention1day. Для нього зарезервовано один existing standard runner run (30+50min); його actual source/results/artifacts фіксуються окремо, frozen55b не ретегуються. Repository run42494336968 і native run42494336965 лишаються доказами саме старого source. [Frozen final verification](evidence/release-continuation-20261108/final-verification.json).

## Виконано та перевірено

### Release SHA guard

`requireReleaseSha` / `resolveBuildSha` відхиляють explicit empty/null/coerced/uppercase/не40hex/all-zero значення та mismatch env/compiled SHA; перевірка відбувається до створення DB. PRODUCTION зберігає explicit env SHA requirement. DEMO/TEST із двома відсутніми inputs зберігають старий zero sentinel лише для сумісності direct-source запуску. Це не атестація справжності Git/source або readiness. Company/origin, worker, SQL та bundler contract не змінено.

На старому runtime дві регресії (zero SHA та mismatch) реально дійшли explicit PG constructor trap. На patch `21105df7660d5af90f02af98f0f6700898f6bf9a6caea2c1cc910bc81da36f93` — 262/262 focused cases у 5 файлах, 0 FAIL/skips, TypeScript PASS; 65 cases перевіряють compiled entrypoints. Це локальні process/trap checks, а не реальний PostgreSQL startup. Root незалежно перевірив source, negative/positive controls і точні байти інтеграції. Під час deployment explicit GIT_SHA має відповідати реально зібраному runtime; stale mismatch тепер fail closed.

### Recovery browser harness

Opt-in команда `npm --prefix corporate-site run test:recovery:browser` призначена для вже встановленого browser runtime. Fixture використовує actual VPS server, ephemeral SQLite, loopback HTTPS, synthetic users, справжній mail adapter із captured provider transport. План охоплює DE/EN/PL/LT/RU/UK, mobile/desktop forms, fragment binding, invalid/success/replay reset, session revocation, ізоляцію користувачів і незмінність profiles/staff grants, no-JS flow і disabled-mailer state. Це опис перевірок, не результати виконання.

Reviewed v1 harness SHA256 `5ec4c56f712dd498e02f77235f27afbbff7c74d58b42ea8a92bdf5f33359b6d0` запущено на існуючому Docker QA image `sha256:c28822481b78f5a917cb269bec78e43f62923117b35a53e32cc9dcf53a85fe75`. Source inventory: 487 exact path/hash/size inputs = 145 tracked e57 sources + 339 generated build files + 3 harness/package files. Незалежний review звірив усі 487.

| Attempt | Фактичний результат | Продуктові сценарії |
|---|---|---:|
| 1, 16:43 UTC | FAIL_SETUP, exit1: crashpad «--database is required» + SIGTRAP; окремий metadata probe виявив UID без passwd і HOME=/ | 0 |
| 2, 16:46 UTC | BLOCKED, exit2: POLICY_OR_SANDBOX_BLOCKED; інших installed engines немає | 0 |

Обидва attempts мають 0 screenshots, 0 captured messages, 0 browser HTTP requests. Attempt1 збережено. Корекція user/home в attempt2 незалежно перевірена; network none, read-only root/source, sandbox true і resource ceilings збережені. Attempt2 зберіг classifier та лише перший загальний рядок launch error, тому конкретніший OS/kernel mechanism не стверджується. Після policy block запусків Chromium у цьому environment більше не буде; `KNABA_BROWSER_SKIP=chromium` потрібен для будь-якого наступного invocation тут. Нові browser binaries не встановлювалися, захист не послаблювався.

V2 harness SHA256 `83d34241cca7b1188c6a95a1c89f35eef67e50421a6cdc5fe1192aaf9e6d70d3` виправляє тільки strict40/nonempty operator SHA та повне safe-redacted error/stage logging. Syntax/source review PASS; **V2 browser NOT_RUN**. Старі receipts не ретеговані на V2. Browser/keyboard/screenreader acceptance і реальна email доставка — BLOCKED.

### Native/runtime доступ

На доступному Linux host `adb devices -l` exit0 повернув порожній список. Installed emulator acceleration check exit11: KVM permission denied для поточного identity; доступ/групи не змінювалися. Фізичний Android, hardware Keystore/reboot/GPS/battery та install/update/data retention не перевірені. Локальний debug certificate `db2f5fb3f756c05a51169c412f9bd93c9f229af10b55c406030736adcd69daa8` відрізняється від frozen APK signer `3e97214d11edd33b9734e8fdefe0361f02832f4a093ab34e41bc4cefddd647f7`; owner signer continuity не доведена. Не видаляти старий app/data для обходу mismatch.

Доступного owner Mac/Xcode/signing metadata і physical iPhone не підтверджено. Existing iOS simulator app / 69 XCTest — попередній обмежений доказ, а не signed IPA або iPhone install. Власник має надати authorized Apple team/provisioning/device capability без передачі ключів у звіт.

Read-only TEST health/ready/version повернули 200, TEST, database CONNECTED, SHA `89366d0a440fe1507bef65806da2364027d6edc1`. Цей паралельно розгорнутий runtime не дорівнює frozen mobile source; авторизований company/role/version-pair journey не виконувався. Інші активні стеки, private env/config, production та дані не змінено.

## Матриця та межі

| Шар | Усього | PASS | FAIL | BLOCKED |
|---|---:|---:|---:|---:|
| Основні вимоги | 143 | 5 | 0 | 138 |
| Technical checks | 43 | 31 | 0 | 12 |
| V3 requirements | 432 | 0 | 0 | 432 |
| V3 acceptance | 475 | 0 | 0 | 475 |
| Quality | 55 | 2 | 0 | 53 |

Всі frozen IDs/statuses збережені. Шари перетинаються; глобальний відсоток не обчислюється. Новий narrow SHA-startup PASS записано лише у supplement, жодного parent criterion ним не прийнято. Initial setup FAIL не приховано й не записано як продуктову регресію. Browser і physical/live/signing gates лишаються BLOCKED. V4/V3, M1–M4, site/ERP identity і повні specialist workflows не скорочуються.

## Наступні конкретні передумови

1. Завершити existing repository CI на exact новому commit; при FAIL виправити конкретний дефект і зберегти обидва receipts. Cumulative PR filter може також автоматично запустити native CI: зберегти його окремий exact-source receipt, без manual unchanged rerun і без ретегування frozen artifacts.
2. Для browser gate надати інше вже дозволене середовище зі справним sandbox/browser; повторити harness, звірити actual input hashes, пройти окремі keyboard/screenreader checks. У поточному середовищі Chromium не повторювати.
3. Для Android підключити дозволений physical device, звірити встановлений package/signer/version без видалення даних; виконати install/update/role/offline/recovery/GPS-battery protocol і зафіксувати exact APK hash.
4. Для iOS потрібні owner Mac/Xcode, team/provisioning і physical iPhone; використати чинний archive/export recipe, отримати signed IPA receipt та device UAT. Simulator zip не можна встановити на iPhone.
5. Для integration потрібні approved TEST company/role accounts і узгоджені app/backend versions; перевірити RBAC/isolation, persistence, session revocation, retry/idempotency і complete user journeys. Real mail gate потребує підтвердженого provider entitlement/quota та дозволених адрес.
6. Після доказів і незалежного review оновити лише відповідні matrix rows. Повний handoff і production рішення залишаються окремими gates.

Source rollback цього supplement — revert лише чотирьох backend файлів і трьох harness/package файлів без DB migration; повернення старого SHA guard відновлює відому слабкість. Попередня SQLite002 recovery migration лишається несумісною зі старим PR133 code-only rollback: потрібен compatible forward fix або погоджене узгоджене code+DB restore. Жодних production, signing, store/provider або client-message дій цим checkpoint не виконано.
