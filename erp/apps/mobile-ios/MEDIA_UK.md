# Нативні фото та файли iOS — контракт і межі перевірки

Цей source slice реалізує нативний шлях медіа для чинного ERP-входу. Він належить до KN-C06, mobile master §3/§6, R-21-001/004/006 та AC-53/54. Повний acceptance цих вимог цим документом не закривається. Browser-to-native SSO/F3, push, підписаний IPA, фізичний пристрій і live ERP залишаються окремими перевірками.

## Дії користувача

1. Відкрити «Фото та файли» у модулі Media, з картки доступного об’єкта/завдання або з дії `media.register`.
2. Клієнт оновлює `/me`, перевіряє `media.upload`, фактичний каталог `media.register` і доступні записи. Для завдання використовується його `data.siteId`; окреме право `site.read` не вимагається. Зовнішні CLIENT/CUSTOMER/EXTERNAL_BAULEITER/GUEST можуть вибирати лише об’єкт, зображення, DEFECT та INTERNAL.
3. Вибрати до восьми файлів через системні PhotosPicker або Files. Вибір сам нічого не надсилає. Файли обробляються послідовно; перед переходом до наступного очищаються байти попереднього. Черга системних ідентифікаторів/URL існує лише в RAM.
4. Перевірити файл, прив’язку, етап, видимість, опис і явно вказати мету зберігання. Згода на передавання та підтвердження вже виконаного видимого приховування даних — різні перемикачі. Початково обидва вимкнені. Видалення EXIF не є приховуванням людей чи вмісту документа.
5. «Надіслати цей файл» викликає keyed `/api/v1/media/uploads`. Підтверджений `uploadId` означає отриманий файл, який ще не зареєстрований у галереї.
6. Окрема дія реєструє файл через `/api/v1/commands/media.register` із зафіксованою прив’язкою та іншим стабільним ключем. Лише перевірений Entity з очікуваними company/site/task/uploadId підтверджує реєстрацію. Це не створює worklog, кількість, вкладення повідомлення або клієнтське схвалення.
7. Галерея групує записи за об’єктом, завданням, днем отримання та етапом. RECEIVED, APPROVED_FOR_CLIENT і duplicateOf показуються окремо. Невідомий серверний стан не називається отриманим чи схваленим.
8. «Зберегти клієнтську копію» заново перевіряє поточний asset/version і сесію, завантажує лише `file?copy=client` із налаштованого origin та відкриває системне збереження. Користувач створює окрему зовнішню копію; подальша зміна доступу не видаляє вже експортовані файли.

## Ліміти та пам’ять

JPEG/PNG/WebP: максимум 10 MiB та 24 MP; PDF: максимум 20 MiB. Файл перевіряється за сигнатурою, читається обмеженими блоками та не перекодовується. HEIC не перетворюється мовчки. Для Photos використано `preferredItemEncoding: .current` і `FileRepresentation`; системний тимчасовий файл читається всередині importing closure. Files використовує збалансований security-scoped доступ і NSFileCoordinator.

Upload JSON має окремий ліміт 28 MiB. Base64 додається в один зарезервований HTTP Data блоками по 48 KiB. Production-код не створює повного проміжного base64 String і не декодує заново великий JSON. Основні app-owned payload allocations: поточні original bytes та один HTTP body, плюс малий блок. Фактичний peak RSS/URLSession allocation на iPhone тут не виміряний. Звичайні 65 536-byte input, 70 000-byte command envelope і 2 MiB JSON-response ліміти не збільшені.

Binary download має окремий cumulative cap 25 MiB, перевірку оголошеного Content-Length, якщо він є, та дозволяє лише JPEG/PDF. Невідповідний успішний MIME відхиляється до читання тіла. HTTP-помилки мають звичайну 2 MiB межу. Немає HTTP redirect, shared cookie/cache, URL credentials або довільного download URL. Галерея не декодує повні 24 MP bitmap для перегляду.

## Відновлення та гонки

Перед першим mutation зберігається AES-GCM metadata-only descriptor під окремим Keychain-ключем і з file protection. Він містить SHA-256 оригіналу, розмір/MIME/назву, дві незмінні idempotency пари, поточний origin/company/user/full-authority fingerprint і поля реєстрації. Байти, URI/bookmark, cookie, CSRF, пароль і OTP до нього не потрапляють. Максимум — 16 scope без автоматичного витіснення невирішених операцій.

Після втрати процесу відновлення потребує свіжого входу того самого actor/company/origin з тими самими повними правами, site/customer/warehouse/delegation полями; інший session ID дозволений. Невідомий upload потребує ручного повторного вибору точних original bytes з однаковими SHA-256/розміром/MIME. Уже відомий uploadId ніколи не запускає повторне завантаження. Автоматичних mutation retries і нового ключа після 403/404/409 немає. 429 потребує явного повтору пізніше тим самим ключем.

Typed registration використовує чинний encrypted command journal з metadata-only `nativeMedia: true`. Позначка не входить до wire body. Загальний retry/editor не виконує таку команду; потрібний відповідний descriptor, ключ, body та поточний full authority. Відсутній/пошкоджений descriptor або невідповідні права блокують відновлення та приховують старі private inputs. Новий generic `media.register` для uploadId із незавершеного typed descriptor також блокується. Старі unmarked generic команди залишаються сумісними.

Підтвердження сервера зберігається в RAM до локального очищення. Помилка запису/очищення journal показується окремим попередженням і не перетворює відомий результат на новий upload. Помилка наступного gallery read не скасовує відому реєстрацію. Видалення descriptor дозволене лише після підтвердженої реєстрації.

Кожен picker/read/upload/register/download прив’язаний до concrete client, session revision, повного authority hash та поточного контексту. Synchronous session fence змінюється до suspension під час logout/origin/виявленої зміни прав; його перевіряє також `FileDocument` перед наданням export bytes. Скасування або вихід зі сторінки очищає private view/buffers і робить пізні callbacks неактуальними. Після вже надісланого mutation скасування не доводить server rollback. Чинний незалежний NativeAPI/GPS/time queue не змінювався; generic ERP command journal зберігає свою чинну послідовність незавершених команд.

Читання вибраного файлу має окремий process-wide serial barrier: максимум одна активна й одна очікувана операція. Cancel прибирає view state і скасовує його waiter, але внутрішній worker дочікується завершення provider та відкидання неактуальних bytes. Нова сторінка Media також користується цим barrier. Скасування саме по собі не звільняє слот для другого оригіналу. При переповненні показується локалізований busy; ще не прочитані URL/PhotosPicker identifiers залишаються лише у bounded view queue і очищаються при Cancel. File/NSFileCoordinator I/O виконується у detached worker; main actor лише координує очікування. Якщо provider ще завершує стару операцію, наступний імпорт очікує; решта програми, time та GPS не залежать від цього barrier. Це гарантія source-архітектури; фактичний RSS і системні буфери PhotosPicker потребують device-вимірювання.

## Перевірки

Нові XCTest-файли перевіряють DTO/ліміти, encrypted metadata, два ключі й два ACK, точний повтор після рестарту, no-reupload, marker isolation, cancel/double-tap, context/permission/warehouse races, помилку збереження після ACK, незалежність наступного read та 6 мов. Transport doubles прямо позначені як HTTP fixtures; вони не є actual PG/live доказом.

Окремі authored regressions моделюють затриманий provider, Cancel→повторний вибір, заміну двох view-owned screen models та переповнення import queue. Вони викликають production queue/model і перевіряють відкидання старого результату до другого читання. Реальну PhotosPicker UI-взаємодію вони не відтворюють; локально ці XCTest також NOT_RUN.

У поточному Linux-середовищі немає Swift, Xcode, xcodegen або iOS simulator. Нові XCTest, compilation, реальна системна picker/export взаємодія, device memory/latency і live upload/download тут **NOT_RUN**. Source/locale перевірки та незалежний code review не підміняють Xcode CI. Чинний `project.yml` включає всі Sources/Tests автоматично; min iOS17, Swift5, signing, capabilities, version/build і зовнішні залежності не змінено.

## Первинні API-джерела

- [Apple: PhotosPicker multiple selection](https://developer.apple.com/documentation/swiftui/view/photospicker(ispresented:selection:maxselectioncount:selectionbehavior:matching:preferreditemencoding:)) — обмеження кількості, системний доступ до вибраного, current encoding.
- [Apple: FileRepresentation importing](https://developer.apple.com/documentation/coretransferable/filerepresentation/init(importedcontenttype:shouldattempttoopeninplace:importing:)) — lifetime системного URL усередині importing closure.
- [Apple: fileImporter with cancellation](https://developer.apple.com/documentation/swiftui/view/fileimporter(ispresented:allowedcontenttypes:allowsmultipleselection:oncompletion:oncancellation:)) — completion/cancellation та security-scoped URLs; primary metadata підтверджує iOS17.
- [Apple: fileExporter with cancellation](https://developer.apple.com/documentation/swiftui/view/fileexporter(ispresented:document:contenttypes:defaultfilename:oncompletion:oncancellation:)-34bd6) — FileDocument та окрема cancellation callback; primary metadata підтверджує iOS17.
- [Swift: Concurrency](https://docs.swift.org/swift-book/LanguageGuide/Concurrency.html) та [Apple: Task](https://developer.apple.com/documentation/swift/task/) — unstructured task має власний lifetime; cancellation кооперативна, очікування `value` дочікується завершення роботи.
