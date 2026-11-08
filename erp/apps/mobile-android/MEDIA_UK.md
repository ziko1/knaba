# Нативні фото та файли Android

Цей source slice додає шлях фото й файлів до чинного нативного ERP-входу KNABA DE: KN-C06, mobile master §§3/6, KNABA-R-21-001/004/006 та AC-53/54. Він не закриває весь acceptance цих вимог. Новий source потребує окремої збірки APK/AAB з точного commit, перевірок на пристрої та чинному ERP. Старі артефакти 0.5.0 і попередні native/CI результати не доводять готовність цього шляху.

## Дії користувача

Відкрийте модуль фото/файлів або дію додавання медіа з чинної картки об’єкта чи завдання. Клієнт оновлює `/me`, перевіряє фактичне право `media.upload`, каталог `media.register` і поточні доступні записи. Завдання надає власний `data.siteId`; окреме право `site.read` для такого контексту не додається.

Перед вибором файлів користувач обирає дозволений об’єкт/завдання, етап BEFORE/AFTER/DEFECT/MATERIALS/DOCUMENT, видимість INTERNAL/CLIENT_AFTER_APPROVAL/CONFIDENTIAL, опис та явну мету зберігання. Для CLIENT/CUSTOMER/EXTERNAL_BAULEITER/GUEST цей шлях пропонує лише об’єкт, зображення, DEFECT та INTERNAL. Завдання для зовнішньої ролі потребувало б окремого чинного published-report witness, якого цей інтерфейс не вигадує.

Кнопка вибору відкриває системний Photo Picker на Android33+ або Storage Access Framework на Android31/32 та за відсутності доступного Photo Picker. Одночасний вибір обмежено вісьмома файлами. Застосунок не просить широкий доступ до сховища і не зберігає URI grants. Повернення чи скасування системного вікна не надсилає мутацію.

«Надіслати вибране» послідовно виконує для кожного файлу дві незалежні операції:

1. Keyed `POST /api/v1/media/uploads` отримує оригінальні bytes, MIME, назву і `redactionConfirmed`. Успішний `uploadId` означає, що файл отримано; він ще не зареєстрований у галереї.
2. `POST /api/v1/commands/media.register` з іншим стабільним ключем реєструє цей `uploadId` у зафіксованому контексті. Перевіряються company, site/task, uploadId, stage, visibility та Entity receipt. Лише цей результат називається зареєстрованим.

Ці операції не створюють worklog, обсяг роботи, вкладення повідомлення або клієнтське схвалення. `redactionConfirmed` початково false; перемикач означає, що людина вже приховала видимі чутливі дані. Серверне очищення EXIF не приховує обличчя, номери чи текст документа.

Галерея групує дозволені записи за об’єктом, завданням, днем отримання та етапом. RECEIVED, APPROVED_FOR_CLIENT, невідомий стан і `duplicateOf` розрізняються. Повторний файл не називається додатковим виконаним обсягом. Є пошук, порційне відображення, чинна картка запису та явне збереження клієнтської копії.

## Точний повтор і відновлення

Кожен файл має два незалежні UUID-ключі: upload та register. Після першої спроби незмінні SHA256 оригіналу, розмір, MIME, ім’я, `redactionConfirmed`, контекст і тіло реєстрації. Невідомий результат зберігається як невідомий; клієнт не створює інший ключ і не повторює мутації автоматично.

Після перезапуску потрібні новий чинний вхід того самого actor/company/origin, та сама повна поточна authority і явна дія користувача. Для невідомого upload треба повторно вибрати точно ті самі bytes. Назва й метадані wire залишаються оригінальними навіть якщо провайдер показує іншу локальну назву. Схоже, перекодоване або змінене фото не підходить. Підтверджений `uploadId` дозволяє продовжити реєстрацію без повторного надсилання файлу.

Відмови ACCESS_DENIED, NOT_FOUND_SAFE та IDEMPOTENCY_CONFLICT не дозволяють обійти reconciliation новим ключем. У API немає окремого endpoint читання upload receipt або гарантованого TTL. Видалення/retention на сервері можуть зробити старий receipt недоступним.

Окремий Keystore/AtomicFile vault `console-media-recovery` містить лише зашифровані метадані формату1: hashes scope/authority, ключі, SHA256/розмір/MIME/ім’я, підтвердження, контекст, phase та відомі upload/asset receipt. Оригінальні bytes, URI, cookie, CSRF і пароль не записуються. Сховище має до восьми descriptor на scope, до16 scopes і чинний загальний обмежений розмір. Невірний формат, втрата ciphertext за наявності ключа або пошкоджений descriptor блокують відновлення; вони не перетворюються на порожню чергу.

У чинному encrypted command envelope typed `media.register` має optional marker `nativeMedia:true`. Він не входить до HTTP payload. Такий запис не показує приватне input у generic editor і може повторюватися лише через точний media descriptor. Відсутність descriptor або зміна повної authority блокує цей шлях. Generic нова реєстрація з uploadId незавершеного descriptor, включно з відомим ACK, який ще потребує локального cleanup, теж блокується. Старі unmarked generic команди зберігають чинну поведінку.

Помилка локального запису чи очищення не скасовує відомий серверний ACK. UI зберігає receipt і показує окреме попередження. Для REGISTERED залишаються лише локальне збереження/очищення; ця дія не робить повторного POST. Відновлений після перезапуску REGISTERED також має цю дію. Помилка наступного читання галереї не перетворює успіх реєстрації на повторюваний write failure.

## Межі пам’яті та життєвого циклу

Оригінальні JPEG/PNG/WebP обмежені10MiB, PDF20MiB. MIME перевіряється за bytes; HEIC не перетворюється мовчки. На сервері додатково діють24MP decode bound і перевірка scan state; Android не стверджує локальне антивірусне сканування. Typed upload пише base64 блоками без повного проміжного base64 String, JSONObject або повторного decode. Generic64KiB command/2MiB response limits не збільшено.

Один process-owned serial media IO executor обслуговує всі екрани, включно з Activity recreation. Максимум — один активний і сім очікуваних jobs. Переповнення дає явний busy/retry стан; звільнення слота не запускає дію автоматично. Скасування видаляє queued closures і їхні буфери; старий активний provider read має завершитися перед наступним media IO. Невідповідний провайдер може затримати очікування, але не дозволяє створити додатковий паралельний import. Звичайний console worker та незалежні GPS/time workers не змінено.

Читання оригіналу, підготовка незмінного upload descriptor і upload виконуються в одному media IO job. До main callback передаються лише metadata, receipt або помилка; FileData і його bytes не виходять із цього job. Тому затриманий main looper чи два вже відкриті екрани не накопичують оригінальні файли між читанням та upload. Реєстрація залишається окремим кроком після підтвердженого upload ACK; невизначений результат зберігає початковий key/context для явного повтору.

Кожна операція прив’язана до captured client/session/origin/full authority та context ticket. Logout, зміна origin, виявлена зміна прав/області доступу, вихід зі сторінки чи скасування роблять старі callbacks неактуальними. Системний picker і `onStop` самі по собі не означають logout. Перед відображенням/надсиланням результату вибору контекст перевіряється заново. Скасування після початку мережевого запису не доводить server rollback.

## Збереження копії

Кнопка збереження пояснює, що користувач створює власну зовнішню копію, яку подальший logout не видаляє. Системний ACTION_CREATE_DOCUMENT вибирає новий документ. Після повернення клієнт заново перевіряє чинний asset/version/company і завантажує лише `/api/v1/media/{encoded-id}/file?copy=client` із налаштованого HTTPS origin. ID — один percent-encoded компонент, а не URL чи шлях. Немає redirect, URL token, blobKey або довіри до серверного filename.

Binary read обмежено25MiB, незалежно від Content-Length; приймаються лише перевірені JPEG/PDF bytes. Стан перевіряється під час читання/запису та перед завершенням. Пізній callback після logout не відкриває файл для запису. Невдалу часткову копію в щойно створеному документі клієнт намагається видалити; недоступний провайдер може завадити цьому cleanup, тому вже експортовані копії не називаються відкликаними.

## Перевірки та відкриті gates

- `scripts/test-transport.sh`: actual Java transport із позначеними HTTP/journal doubles; exact key/body, ACK/cleanup, descriptor corruption, authority/cancel, legacy compatibility, redirects/MIME та bounded process media queue. Окремий JVM з `-Xmx96m` перевіряє streaming20MiB PDF і ранню image bound після часткового першого header chunk.
- `ConsoleMediaScreenTest`: реальні Android View callbacks під Robolectric із явними provider/HTTP fixtures: picker32/35, multi-file sequencing, unknown register retry, receipt reopen, explicit export, stale callback та delayed-provider Activity recreation. Це не фізичний Photo Picker чи реальний storage provider.
- `ConsoleRecoveryJournalTest`: actual AES-GCM/AtomicFile із явним test Keystore provider, metadata-only persistence, namespace isolation, malformed/missing vault та незмінність ACK/version.
- `tests/native-console-contract.test.ts`: native values/fields/limits проти executable ERP schemas; це не запуск Swift або PostgreSQL.

Canonical keyed upload наразі потребує POSTGRES blob store. PDF потребує налаштованого scanner. S3 повертає MISSING_CONFIGURATION; fallback на старий неідемпотентний endpoint не додано.

Actual нові APK/AAB, встановлення/оновлення зі збереженням даних, OEM/provider поведінка, фізична камера/галерея, device memory/performance, live ERP/scanner та повні AC-53/54 залишаються окремими gates. Цей slice не додає camera capture, візуальне редагування/маски, GPS/time grants, push, browser/native PKCE або автентифікацію через сайт.

## Первинні API-джерела

- [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photopicker): системний вибір і обмежений доступ до обраних фото.
- [MediaStore ACTION_PICK_IMAGES](https://developer.android.com/reference/android/provider/MediaStore#ACTION_PICK_IMAGES): platform picker та multi-select limit.
- [Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files): ACTION_OPEN_DOCUMENT, CATEGORY_OPENABLE та ACTION_CREATE_DOCUMENT.
- [Java ThreadPoolExecutor](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html): bounded queue та відмова перед виконанням переповненої роботи.
