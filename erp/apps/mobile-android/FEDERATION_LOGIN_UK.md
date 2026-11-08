# Android: вхід через сайт у TEST

Цей адаптер використовує чинний F3 ERP контракт. Підтриманий лише явно зареєстрований сервером клієнт `knaba-android-test-v1`, `kind=NATIVE`, `platform=ANDROID`, з callback `de.knaba.mobile.test:/auth/federation/callback`. Потрібні одночасно Debug application ID `de.knaba.mobile.test`, поточний ERP mode `TEST` і точний запис у `/api/v1/auth/federation/config`. Release не має callback Activity або активного registry. Production App Links, домени, signing ownership і provider activation цим кодом не встановлюються.

## Шлях користувача

На екрані входу або в робочому просторі TEST користувач обирає «Увійти через сайт», перевіряє адресу доступного сайту та явно продовжує. Застосунок перевіряє свіжий `/api/v1/health` і registry, створює один S256 attempt та відкриває exact ERP authorization URL у системному браузері. Browser flow виконує підтвердження акаунтів і потрібний ERP MFA. Паролі сайту не вводяться в native формі. Повернення з браузера без callback залишає очікування; окрема дія скасування припиняє спробу.

Hostless TEST scheme має scheme-only manifest filter: Android не застосовує path filter без host. Тому Activity передає тільки URI внутрішньому process coordinator, який строго перевіряє точний scheme/path, відсутність host/fragment, рівно `code`, `state`, `iss`, одноразовий стан і pinned ERP issuer. Caller extras, nested Intent, selector і URI grants не пересилаються. Внутрішній Intent до вже відкритого console не містить callback URI чи секретів.

## Cookie, authority та відновлення

Browser cookies і app transport не обмінюються cookie jars. Native start/token надсилаються без старого app cookie, з власним ERP Origin. Start має один stable body/key; автоматичного повтору POST немає. Code, verifier, state та candidate зберігаються лише в RAM; їх немає в preferences, savedInstanceState, recovery journal чи логах. Втрата процесу означає нову спробу.

Token приймається тільки з exact HTTP 200 і одним новим `knaba_session=KF3.<43 base64url>`: host-only, `Path=/`, `Secure`, `HttpOnly`, `SameSite=Strict`. Значення має відрізнятися від захопленого попереднього cookie, навіть для того самого користувача. Headers перевіряються до читання body. Якщо body втрачено, UI дозволяє лише явну перевірку `/me` з цим candidate; за відсутності нового cookie потрібно почати знову. Старий `/me` не є доказом нового входу. Token POST ніколи не повторюється автоматично.

Локальне candidate recovery вікно — максимум 120 секунд monotonic time, додатково обмежене відомими cookie/server expiry та початковим attempt deadline. Це не новий строк серверної сесії. `/me` не зобов’язаний містити `expiresAt`. Якщо повний token body уже відомий, його immutable user/company мають збігатися з candidate `/me`.

Кожний асинхронний результат перевіряє attempt, origin, стару сесію та повну authority revision. Навіть same-user current-profile refresh скасовує стару можливість adoption. Помилка, cancel, старий callback, candidate 401/403 або storage failure не очищують попередній app account. Мережевий worker залишає доведений `/me` у стані `VERIFIED`: він ще не змінює app session. Лише foreground main-thread callback після повторної перевірки та успішного читання account-scoped journal атомарно змінює cookie/actor/CSRF, recovery binding і UI actor. Cancel до цієї межі лишає стару сесію; затримка main loop не дає прихованого switch. Старі journal bytes зберігаються у своєму account scope. Terminal attempt відпускає захоплені credentials; гарантії фізичного zeroization immutable JVM strings не заявлено.

Перед adoption перевіряються обидва encrypted journals, зокрема media journal без пов’язаної команди. Недоступне сховище, помилка структури або втрачений/несумісний linked descriptor зупиняють switch до retirement старого transport. Валідний historical/UNKNOWN запис того самого account scope із попередньою authority зберігається як заблоковане відновлення: його bytes/key/uploadId не змінюються, повторної мутації немає. Звичайний password login зберігає чинну поведінку recovery. Підтвердження виходу й навігації захоплюють screen, точний transport і authority revision; старе підтвердження після switch нічого не виконує.

Вхід не видає employee device token, не відкриває зміну та не активує GPS. Self-device enrollment, якщо сервер його запитує, потребує окремого локального ERP proof.

## Перевірка

`bash scripts/test-federation.sh` запускає pure protocol/transport regressions, actual loopback HTTP fixture і source variant policy. Потрібні наявний JDK17 та `KNABA_JSON_TEST_JAR` із чинним pinned org.json; нові runtime dependencies не додаються. Desktop JDK HTTP fixture окремо дозволяє заголовок Origin через test JVM property; production Android не використовує цей параметр.

`bash gradlew --offline --no-daemon :app:testDebugUnitTest :app:lintDebug :app:processReleaseMainManifest` перевіряє наявний Android toolchain. `ErpFederationActivityTest` — Robolectric simulation, а не фізичний браузер або пристрій. `python3 scripts/test-federation-policy.py --merged-debug <AGP-debug-manifest> --merged-release <AGP-release-manifest>` перевіряє фактичне злиття manifests. При зміні source потрібні свіжі журнали та source hashes. Новий APK/AAB, CI, physical callback routing, production verified links, signing/store та live acceptance залишаються окремими gates.

## Official API references

- Android [`<data>`](https://developer.android.com/guide/topics/manifest/data-element): залежність path filters від host.
- Android [Intent](https://developer.android.com/reference/android/content/Intent): ACTION_VIEW/BROWSABLE, CLEAR_TOP/SINGLE_TOP та контроль новоствореного внутрішнього Intent.
- Android [Intents and intent filters](https://developer.android.com/guide/components/intents-filters): ActivityNotFoundException та безпечна обробка зовнішніх Intent.

API documentation перевірено 08.11.2026. Новий SDK, AndroidX, WebView чи framework migration для адаптера не потрібні.

На фінальній main-thread межі створюється окремий transport із тими самими scoped journals. Попередній transport безповоротно переходить у retired state: пізні read/command/login/configure не можуть отримати новий cookie або відновити старий instance. Цей перехід локальний; автоматичного server logout чи скасування вже committed бізнес-команд немає. Звичайні console jobs захоплюють конкретний transport до постановки в worker та звіряють його перед виконанням, success і error callback. System picker/media jobs додатково зберігають свої чинні context/session tickets. Employee GPS transport залишається окремим.
