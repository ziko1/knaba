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
| BRAND-04 | Android0.6.0/code8 APK з перевіреним підписом і metadata | Exact-source CI, APK hash/certificate, install/launch evidence | IN_PROGRESS |
| BRAND-05 | iOS0.6.0/build8 встановлюваний замовником IPA | Owner signing/profile/channel + install receipt | BLOCKED_EXTERNAL — owner signing assets не доступні |
| BRAND-06 | Справжня Swift compilation/XCTest та visual evidence | Actual Mac/Simulator CI, hash-bound PNG/app | IN_PROGRESS |
| BRAND-07 | Два customer-installable файли та інструкція | Independent artifact review, persistent links | BLOCKED_BY_BRAND-05 |
| BRAND-08 | Physical/device/live/company UAT | Версія + пристрій + реальний approved test backend | NOT_RUN |

Root інтегрує Android ERP UI/theme, source/artifacts і evidence. `ios_brand` — SwiftUI; `brand_design_audit` — shared visual contract і Android worker UI; `release_capabilities` — capability audit/CI capture й незалежний app review. Reviewer не приймає власну реалізацію. Застосовано ai-team-orchestrator, app-release, ecc-frontend-mobile (SwiftUI/Kotlin/design/a11y), kotlin-platform-engineering (поточний Gradle), Android skill за фактичними Views межами. Окремої архітектурної міграції або платних cloud model calls немає.

Budget: zero new paid services; використовуються вже доступні штатні public GitHub runners з чинними timeout30/50min, без збільшення paid capacity. User credentials, signing keys, PII та .env у пакети не включаються. No main merge / production / live data / store upload. iOS unsigned Simulator і source ZIP не замінюють IPA та не встановлюються на iPhone.

## Rollback і наступне

Source rollback до bb223af зберігає дані, попередні артефакти та історію. Android update можливий лише з сумісним package/certificate; не радити видаляти чинні дані для обходу підпису. Остаточні SHA/artifact hashes, виконані перевірки й незалежне review додаються після збірки. Невиконані physical, signing та full-product критерії не стають PASS від зеленого CI.
