# KNABA Mobile 0.3.0 — збірка, перевірка й перенесення

Дата: 28.10.2026. Платформи: Android API31+ (Android12+) та iOS17+. Ідентифікатор застосунку обох платформ: `de.knaba.mobile`. Android `versionName=0.3.0`, `versionCode=3`; iOS `MARKETING_VERSION=0.3.0`, `CURRENT_PROJECT_VERSION=3`.

## Що входить у поточний прототип

Наявні нативні рольові ERP-кабінети, серверна перевірка прав, списки й доступні команди, корпоративні розмови, окремий модуль змін/офлайн-черги та добровільної геопозиції збережено. Сервер залишається джерелом прав і даних. Сайт і ERP мають окремі облікові записи; користувач сайту не отримує доступ до ERP лише через однаковий email.

Мови вибору: **Deutsch → English → Polski → Lietuvių → Русский → Українська**. Нова інсталяція починається німецькою. Існуючий вибір користувача збережено; системна мова доступна окремою останньою опцією. В Android повні144ключі для кожної мови; iOS95ключів employee-модуля та76ключів інтерфейсу/помилок ERP. Назви команд, ідентифікатори й поля з сервера залишаються його канонічними даними.

## 1. Android: перевірювана збірка прототипу

Потрібні JDK17, Gradle8.13, Android SDK36, build-tools35.0.0. Наявний wrapper не містить стороннього завантаженого JAR; він використовує затверджений локальний Gradle через `KNABA_GRADLE_HOME` або перевіряє версію Gradle у PATH.

```bash
cd erp/apps/mobile-android
export JAVA_HOME=/path/to/jdk17
export ANDROID_HOME=/path/to/android-sdk
export KNABA_GRADLE_HOME=/path/to/gradle-8.13
export PATH="$JAVA_HOME/bin:$PATH"
bash scripts/package.sh prototype
```

Команда виконує Java-вектори та XML-перевірки, `assembleDebug`, `lintDebug`, перевіряє package/version і v2-підпис. Результат:

- `build/distribution/prototype/knaba-android-0.3.0-prototype.apk`;
- `receipt.json` із SHA256 APK, відбитком сертифіката, source SHA (за наявності Git), окремими хешами всіх мобільних вихідних файлів;
- `SHA256SUMS`, `signature.txt`, `package.txt`, журнали перевірок.

```bash
cd build/distribution/prototype
sha256sum -c SHA256SUMS
```

Це **APK для оцінювання з debug-підписом**. Наявність v2-підпису не робить debug-ключ виробничим ключем власника. Старі APK могли мати інший сертифікат: перед оновленням звірити відбитки. Не видаляти старий застосунок або його дані автоматично для обходу невідповідності ключів. Встановлення на фізичний пристрій, оновлення без втрати даних, GPS/батарея та приймання замовником мають окремі результати; скрипт позначає їх `NOT_RUN`.

## 2. Android: підпис власника

Використати вже затверджений стабільний keystore компанії. Для оновлення наявних встановлень потрібен сумісний ключ. Не генерувати тимчасовий ключ і не називати його ключем замовника.

```bash
export KNABA_ANDROID_KEYSTORE=/private/knaba-release.jks
export KNABA_ANDROID_KEY_ALIAS=knaba
read -r -s -p 'Keystore password: ' KNABA_ANDROID_STORE_PASSWORD
export KNABA_ANDROID_STORE_PASSWORD
read -r -s -p 'Key password: ' KNABA_ANDROID_KEY_PASSWORD
export KNABA_ANDROID_KEY_PASSWORD
bash scripts/package.sh release
unset KNABA_ANDROID_STORE_PASSWORD KNABA_ANDROID_KEY_PASSWORD
```

Паролі передаються `apksigner` через назви змінних оточення, не в аргументах командного рядка й не у файлах репозиторію. Результат `build/distribution/release/knaba-android-0.3.0.apk` має окремий receipt. AAB і публікація GooglePlay цим скриптом не виконуються.

## 3. iOS: симулятор

Потрібен дозволений Mac із Xcode та XcodeGen2.43.0. Linux-пакет вихідних файлів не є IPA. Збережений проєкт використовує iOS17+ та перевірений раніше recipe Xcode16.4; конкретний поточний Mac має виконати власну збірку та XCTest.

```bash
cd erp/apps/mobile-ios
bash scripts/build.sh
```

За потреби вказати існуючий дозволений симулятор:

```bash
KNABA_IOS_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 16' \
  bash scripts/build.sh
```

Файл `build/Build/Products/Debug-iphonesimulator/KNABADE.app` призначений для симулятора. Він не встановлюється на звичайний iPhone як підписаний реліз.

## 4. iOS: підписаний IPA

Власник надає Apple Developer Team, чинний signing certificate/private key і provisioning profile для `de.knaba.mobile`. Налаштувати їх через затверджений Apple/Xcode workflow на Mac. Експортувати з Xcode власний перевірений `ExportOptions.plist` з потрібним способом розповсюдження та правильним `teamID`; не використовувати чужий Team ID.

```bash
export KNABA_APPLE_TEAM_ID=YOURTEAMID
export KNABA_IOS_EXPORT_OPTIONS=/private/ExportOptions.plist
bash scripts/archive-release.sh
```

`YOURTEAMID` замінити на фактичний десятисимвольний Apple Team ID. Скрипт відмовляє без Mac/Xcode/параметрів власника, архівує Release, експортує IPA, перевіряє підпис архівного застосунку та package/version/наявність provisioning profile в IPA. SHA256 і метадані: `build/distribution/receipt.json`; IPA: `build/distribution/export/`. Не встановлює Apple credentials, не активує оплату, не завантажує в TestFlight/AppStore автоматично. Окремо виконати перевірку на iPhone та підтвердити доступність способу розповсюдження замовнику.

## 5. Окремий пакет вихідного коду для Mac

Із кореня репозиторію:

```bash
python3 scripts/mobile/package-ios-source.py \
  /private/output/knaba-ios-0.3.0-source.tar.gz
```

Архів містить Sources/Resources/Tests/scripts, проєкт XcodeGen, privacy/Info.plist, потрібні native-vectors та цю інструкцію. `IOS_SOURCE_MANIFEST.json` має тип `XCODE_SOURCE_ONLY_NOT_IPA` та SHA256 кожного файла. Публічна назва кнопки для такого архіву має бути «iOS — вихідний код для Xcode», доки реальний підписаний IPA/TestFlight не створено й не перевірено. Не називати його «Завантажити iPhone-застосунок».

## 6. Перенесення на сервер замовника

Для ERP-консолі вийти з облікового запису й указати HTTPS-origin нового ERP-сервера **без шляху**, наприклад `https://erp.customer.example`. Сервер має бути фактично розгорнутий і мати довірений TLS-сертифікат. Мобільні клієнти відмовляють HTTP, URL із credentials, query/fragment, зайвим шляхом і перенаправленнями; сайт `/konto/` не підходить як ERP API origin.

Відновити/перенести серверні облікові записи та дозволи штатними інструментами сервера. Не переносити сесію або bearer-токен вручну між сайтами. Employee-модуль має окреме захищене device enrollment; зміна його сервера потребує штатного виходу й нового одноразового коду, зі збереженням/узгодженням відкладених офлайн-операцій. GPS ніколи не активується самим входом або вибором мови.

Після перенесення перевірити: owner/client/worker ролі, відмову чужій компанії, login/logout/2FA, завантаження фактичних списків, дозволену команду, отримання та відповідь у власному каналі, відновлення після відсутності мережі. Фізичний GPS тестувати лише з погодженою політикою та явним увімкненням на пристрої.

## Поточні докази цього етапу

Локально виконано:144Android XMLключі×6;39Java locale/clock/auth-generation векторів;30Java geofence векторів; статична перевірка95+76iOSсловникових ключів, placeholder parity, порядку мов, версій і plist; shell syntax. Локальна команда iOS Release завершилась кодом69 з причиною відсутності macOS/Xcode. Це не Swift-компіляція й не підписаний IPA. Поточний Android APK фактично зібрано й перевірено на ізольованому KNABA builder; див. підтверджені метадані нижче. Історичні APK й попередні CI не використано як доказ цього пакета.

### Переданий Android APK — підтверджений результат

| Поле | Значення |
|---|---|
| APK | `knaba-android-0.3.0-prototype.apk` |
| Package | `de.knaba.mobile` |
| Версія / build | `0.3.0` / `3` |
| Мінімальний / target SDK | `31` / `36` |
| Розмір | `2 658 684` bytes |
| SHA256 APK | `3e62935cafed829430f8f5384f24ac9ea964d2d4b4b680de283de7e7e9a37564` |
| SHA256 сертифіката | `d722a33a214628af4dedab7d9251dca0695fb513885246bc581bd06702cac532` |
| Підпис | V2 PASS; **Android Debug / лише оцінювання** |
| Код збірки | `b88766108684b6fd78a1cca81642ab512903bdeb` |
| Build | `assembleDebug` і `lintDebug` PASS,47Gradle tasks |
| Lint | 0 errors,18 warnings |

Файл APK незалежно повторно хешовано після передачі. Усі33вхідні source-файли з receipt порівняно з Git blobs коміту `b88766108684b6fd78a1cca81642ab512903bdeb`; збігаються. Оригінальний receipt зберігає `sourceGitSha:null`, оскільки builder працював із source-архівом без `.git`. Це не переписано заднім числом: зв’язок із Git окремо засвідчують `evidence/prototype-20261028/commit-binding.json` та `independent-binding.json`. Raw build, lint, package і signature receipts збережено в тому самому каталозі.

18lint-попереджень залишаються видимими у звіті; успішна збірка не є результатом їх приховування. Фізичне встановлення, оновлення/збереження даних, customer UAT і підпис власника залишаються окремо `NOT_RUN` / `BLOCKED_EXTERNAL`. iOS `.ipa` у комплекті відсутній; source-only Xcode archive має окреме маркування.
