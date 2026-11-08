# KNABA DE — кандидат 0.5.2 / build 9

Продовження погодженого релізного завдання від інтегрованого `bb223af67af9eae5f11e7ca225f89ddf97a8e4e2` (PR133). Збережено native recovery, contextual actions та актуальні server/session guards. Цей документ описує підготовлений кандидат; фактичні SHA, CI runs, хеші й межі перевірки записуються в остаточному handoff receipt. Статус повного продукту — **HOLD / NOT_READY**.

## Зміни

- Android та iOS мають версію **0.5.2**, номер збірки **9**. Попередні паралельні гілки містили номери до8; контракт `RELEASE_VERSIONS.json` перевіряє монотонність та відповідність конфігураціям.
- Штатна перевірка локалізації більше не очікує застарілу0.3.0. Збережено шість мов, німецьку за замовчуванням, повноту перекладів і placeholders. Gate запускається перед кожною native CI job.
- iOS receipt бере version/build/bundle ID із зібраного Info.plist та пов'язує фактичний XCTest summary йогоSHA-256. Нуль виконаних тестів, skips або failures блокують job. Попередній simulator-preparation receipt лишається окремим етапом, не остаточним результатом XCTest.
- Backend продовження перевіряє company/origin до запуску API/worker. Скидання пароля сайту інтегрується зі збереженням чинного session revocation; email delivery та live acceptance мають окремі зовнішні gates.

## Android

Тестовий пакет: `de.knaba.mobile.test`, minSDK31, targetSDK36, debug-підпис. APK призначений для тестового встановлення; AAB не встановлюється як APK. Для оновлення без втрати даних потрібні той самий package ID, сумісний підпис і більший versionCode. Номер9 сам по собі не доводить update compatibility: ключ hosted debug build може відрізнятися від старого APK. Не видаляти попередню інсталяцію або дані для обходу несумісного підпису; отримати збірку зі стабільним погодженим ключем і перевірити upgrade окремо.

Після перевірки SHA-256 у фінальному пакеті можна встановити APK на виділений тестовий пристрій. Синтетичний DEMO не доводить роботу реальної компанії. Для TEST ERP потрібні погоджені HTTPS origin, tenant, роль і тестовий обліковий запис. Перевірити task→worklog→submit, chat, session expiry, airplane mode/повтор, process restart та logout. GPS, батарея, фон, hardware Keystore і збереження даних потребують реального пристрою.

## iOS

Поточний автоматизований маршрут — **unsigned arm64 simulator `.app.zip`**, Xcode16.4 / iOS18.5 / iPhone16. Це **не IPA для iPhone** й не TestFlight. На сумісному Mac розпакувати app, завантажити відповідний симулятор і виконати `xcrun simctl install booted /absolute/path/KNABADE.app`; далі `xcrun simctl launch booted de.knaba.mobile`. Версію/платформу остаточно звірити за receipt зібраного artifact.

Source archive має окреме маркування `XCODE_SOURCE_ONLY_NOT_IPA`. Для signed device archive використати наявний `scripts/archive-release.sh` на owner Mac із дозволеними team/provisioning/export options. Apple credentials, signed IPA, physical iPhone acceptance і store upload тут не створюються й не заявляються.

## Передача та залишок

Фінальний handoff пакет має містити immutable artifact hashes, CI/log provenance, повну погоджену матрицю V4/V3/mobile/site, невиконані gates і independent review. Відкритими залишаються фізичні пристрої, реальний TEST ERP та company UAT, owner signing/distribution, підтверджені provider/retention/restore/load сценарії та незавершені business/SSO критерії. Green build/XCTest не замінює ці вимоги.
