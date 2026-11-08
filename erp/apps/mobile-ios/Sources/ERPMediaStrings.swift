import Foundation

enum ERPMediaText: String, CaseIterable {
    case title, intro, context, site, task, chooseContext, photos, files, limits, externalNotice
    case selected, stage, visibility, caption, retention, privacy, redaction, redactionHelp
    case upload, register, retryUpload, retryRegister, unknown, uploadReceived, registered
    case received, approved, duplicate, notAttached, recovery, reselect, recoveryWarning, clearRecovery
    case cancel, refresh, queue, nextFile, saveCopy, exportNotice, exported, empty, dateUnknown, noTask, loading
    case unsupported, tooLarge, unavailable, invalidMetadata, differentFile, accessChanged, denied, catalogChanged
    case invalidReceipt, recoveryBlocked, failure, uploading, registering, before, after, defect, materials, document
    case internalVisibility, clientAfterApproval, confidential, rateLimited, unconfirmed, invalidFileName, uploadID, mediaID, importBusy
}

enum ERPMediaStrings {
    // DE / EN / PL / LT / RU / UK. Server enums remain canonical only in wire DTOs.
    static let rows: [ERPMediaText: [String]] = [
        .importBusy: ["Die vorherige Dateiauswahl wird noch beendet. Versuchen Sie es danach erneut.", "The previous file selection is still finishing. Try again after it completes.", "Poprzedni wybór pliku jest jeszcze kończony. Spróbuj ponownie po jego zakończeniu.", "Ankstesnio failo pasirinkimas dar baigiamas. Jam pasibaigus bandykite dar kartą.", "Предыдущий выбор файла ещё завершается. Повторите попытку после его завершения.", "Попередній вибір файлу ще завершується. Повторіть спробу після його завершення."],
        .invalidFileName: ["Der Dateiname muss 1–200 Zeichen lang sein. Benennen Sie die Originaldatei um und wählen Sie sie erneut.", "The filename must contain 1–200 characters. Rename the original file and select it again.", "Nazwa pliku musi mieć 1–200 znaków. Zmień nazwę oryginału i wybierz go ponownie.", "Failo vardas turi būti 1–200 ženklų. Pervadinkite originalą ir pasirinkite iš naujo.", "Имя файла должно содержать 1–200 символов. Переименуйте оригинал и выберите его снова.", "Назва файлу має містити 1–200 символів. Перейменуйте оригінал і виберіть його знову."],
        .uploadID: ["Upload-Kennung", "Upload ID", "ID przesyłania", "Įkėlimo ID", "ID загрузки", "ID завантаження"],
        .mediaID: ["Medienkennung", "Media ID", "ID pliku", "Medijos ID", "ID медиафайла", "ID медіафайлу"],
        .unconfirmed: ["Status unbestätigt", "Status unconfirmed", "Status niepotwierdzony", "Būsena nepatvirtinta", "Статус не подтверждён", "Статус не підтверджено"],
        .title: ["Fotos und Dateien", "Photos and files", "Zdjęcia i pliki", "Nuotraukos ir failai", "Фото и файлы", "Фото та файли"],
        .intro: ["Wählen Sie einen freigegebenen Ort oder eine Aufgabe und prüfen Sie jede Datei vor dem Senden.", "Choose an allowed site or task and review each file before sending.", "Wybierz dostępny obiekt lub zadanie i sprawdź każdy plik przed wysłaniem.", "Pasirinkite leidžiamą objektą ar užduotį ir peržiūrėkite kiekvieną failą prieš siųsdami.", "Выберите доступный объект или задачу и проверьте каждый файл перед отправкой.", "Виберіть доступний об’єкт або завдання та перевірте кожен файл перед надсиланням."],
        .context: ["Zuordnung", "Context", "Powiązanie", "Susiejimas", "Привязка", "Прив’язка"],
        .site: ["Objekt", "Site", "Obiekt", "Objektas", "Объект", "Об’єкт"],
        .task: ["Aufgabe", "Task", "Zadanie", "Užduotis", "Задача", "Завдання"],
        .chooseContext: ["Objekt oder Aufgabe auswählen", "Select a site or task", "Wybierz obiekt lub zadanie", "Pasirinkite objektą ar užduotį", "Выберите объект или задачу", "Виберіть об’єкт або завдання"],
        .photos: ["Fotos auswählen", "Choose photos", "Wybierz zdjęcia", "Pasirinkti nuotraukas", "Выбрать фото", "Вибрати фото"],
        .files: ["Dateien auswählen", "Choose files", "Wybierz pliki", "Pasirinkti failus", "Выбрать файлы", "Вибрати файли"],
        .limits: ["Bis zu 8 Dateien, einzeln gesendet: JPEG/PNG/WebP bis 10 MiB und 24 MP; PDF bis 20 MiB. HEIC wird nicht konvertiert.", "Up to 8 files, sent individually: JPEG/PNG/WebP up to 10 MiB and 24 MP; PDF up to 20 MiB. HEIC is not converted.", "Do 8 plików, wysyłanych pojedynczo: JPEG/PNG/WebP do 10 MiB i 24 MP; PDF do 20 MiB. HEIC nie jest konwertowany.", "Iki 8 failų, siunčiamų po vieną: JPEG/PNG/WebP iki 10 MiB ir 24 MP; PDF iki 20 MiB. HEIC nekonvertuojamas.", "До 8 файлов, по одному: JPEG/PNG/WebP до 10 MiB и 24 Мп; PDF до 20 MiB. HEIC не преобразуется.", "До 8 файлів, по одному: JPEG/PNG/WebP до 10 MiB і 24 Мп; PDF до 20 MiB. HEIC не перетворюється."],
        .externalNotice: ["Externer Zugang: nur Mängelfotos zum Objekt, intern sichtbar. Keine PDF-Dateien oder Aufgabenzuordnung.", "External access: site defect images only, internal visibility. No PDFs or task binding.", "Dostęp zewnętrzny: tylko zdjęcia usterek obiektu, widoczność wewnętrzna. Bez PDF i powiązań z zadaniami.", "Išorinė prieiga: tik objekto defektų vaizdai, vidinis matomumas. Be PDF ir užduoties susiejimo.", "Внешний доступ: только фото дефектов объекта, внутренняя видимость. Без PDF и привязки к задаче.", "Зовнішній доступ: лише фото дефектів об’єкта, внутрішня видимість. Без PDF і прив’язки до завдання."],
        .selected: ["Ausgewählte Datei", "Selected file", "Wybrany plik", "Pasirinktas failas", "Выбранный файл", "Вибраний файл"],
        .stage: ["Phase", "Stage", "Etap", "Etapas", "Этап", "Етап"],
        .visibility: ["Sichtbarkeit", "Visibility", "Widoczność", "Matomumas", "Видимость", "Видимість"],
        .caption: ["Beschreibung (bis 2000 Zeichen)", "Caption (up to 2000 characters)", "Opis (do 2000 znaków)", "Aprašas (iki 2000 ženklų)", "Описание (до 2000 символов)", "Опис (до 2000 символів)"],
        .retention: ["Aufbewahrungszweck (3–2000 Zeichen)", "Retention purpose (3–2000 characters)", "Cel przechowywania (3–2000 znaków)", "Saugojimo tikslas (3–2000 ženklų)", "Цель хранения (3–2000 символов)", "Мета зберігання (3–2000 символів)"],
        .privacy: ["Ich darf diese Datei für den angegebenen Zweck an KNABA senden und habe ihren Inhalt geprüft.", "I may send this file to KNABA for the stated purpose and have reviewed its contents.", "Mogę przesłać ten plik do KNABA we wskazanym celu i sprawdzono jego treść.", "Galiu siųsti šį failą KNABA nurodytu tikslu ir peržiūrėjau jo turinį.", "Я вправе передать этот файл KNABA для указанной цели и проверил его содержимое.", "Я маю право передати цей файл KNABA для вказаної мети й перевірив його вміст."],
        .redaction: ["Ich bestätige, dass nötige sichtbare Schwärzungen bereits vorgenommen wurden.", "I confirm that any necessary visible redactions have already been made.", "Potwierdzam wykonanie niezbędnego widocznego zamazania danych.", "Patvirtinu, kad reikalingi matomi uždengimai jau atlikti.", "Подтверждаю, что необходимые видимые данные уже скрыты на изображении.", "Підтверджую, що необхідні видимі дані вже приховано на зображенні."],
        .redactionHelp: ["Dies bearbeitet die Datei nicht. Das Entfernen von EXIF-Daten verdeckt keine Personen, Gesichter oder Dokumentinhalte. Das Original bleibt erhalten.", "This does not edit the file. Removing EXIF does not hide people, faces or document contents. The original is retained.", "To nie edytuje pliku. Usunięcie EXIF nie ukrywa osób, twarzy ani treści dokumentu. Oryginał jest zachowany.", "Tai neredaguoja failo. EXIF pašalinimas nepaslepia žmonių, veidų ar dokumento turinio. Originalas išsaugomas.", "Это не редактирует файл. Удаление EXIF не скрывает людей, лица или содержание документа. Оригинал сохраняется.", "Це не редагує файл. Видалення EXIF не приховує людей, обличчя чи вміст документа. Оригінал зберігається."],
        .upload: ["Diese Datei senden", "Send this file", "Wyślij ten plik", "Siųsti šį failą", "Отправить этот файл", "Надіслати цей файл"],
        .register: ["In dieser Galerie registrieren", "Register in this gallery", "Zarejestruj w tej galerii", "Registruoti šioje galerijoje", "Зарегистрировать в этой галерее", "Зареєструвати в цій галереї"],
        .retryUpload: ["Ursprüngliche Übertragung erneut prüfen", "Retry the original upload", "Ponów pierwotne wysyłanie", "Kartoti pradinį įkėlimą", "Повторить исходную загрузку", "Повторити початкове завантаження"],
        .retryRegister: ["Ursprüngliche Registrierung wiederholen", "Retry the original registration", "Ponów pierwotną rejestrację", "Kartoti pradinę registraciją", "Повторить исходную регистрацию", "Повторити початкову реєстрацію"],
        .unknown: ["Das Ergebnis ist noch unbestätigt. Wiederholen verwendet dieselben Daten und Schlüssel. Abbrechen beweist keine Rücknahme auf dem Server.", "The result is unconfirmed. Retry uses the same data and keys. Cancel does not prove a server rollback.", "Wynik jest niepotwierdzony. Ponowienie używa tych samych danych i kluczy. Anulowanie nie oznacza cofnięcia na serwerze.", "Rezultatas nepatvirtintas. Kartojami tie patys duomenys ir raktai. Atšaukimas nepatvirtina serverio pakeitimų atšaukimo.", "Результат не подтверждён. Повтор использует те же данные и ключи. Отмена не доказывает откат на сервере.", "Результат не підтверджено. Повтор використовує ті самі дані й ключі. Скасування не доводить відкат на сервері."],
        .uploadReceived: ["Datei empfangen; noch nicht in der Galerie registriert.", "File received; not yet registered in the gallery.", "Plik odebrany; jeszcze niezarejestrowany w galerii.", "Failas gautas; dar neregistruotas galerijoje.", "Файл получен; ещё не зарегистрирован в галерее.", "Файл отримано; ще не зареєстровано в галереї."],
        .registered: ["In der Galerie registriert", "Registered in the gallery", "Zarejestrowano w galerii", "Užregistruota galerijoje", "Зарегистрировано в галерее", "Зареєстровано в галереї"],
        .received: ["Empfangen", "Received", "Odebrano", "Gauta", "Получено", "Отримано"],
        .approved: ["Für Kunden freigegeben", "Approved for clients", "Zatwierdzono dla klientów", "Patvirtinta klientams", "Одобрено для клиентов", "Схвалено для клієнтів"],
        .duplicate: ["Duplikat erkannt", "Duplicate identified", "Wykryto duplikat", "Aptiktas dublikatas", "Обнаружен дубликат", "Виявлено дублікат"],
        .notAttached: ["Die Registrierung erstellt keinen Arbeitsnachweis und versendet keine Nachricht. Kundenfreigabe ist ein eigener Schritt.", "Registration does not create a worklog or send a message. Client approval is a separate step.", "Rejestracja nie tworzy raportu pracy ani nie wysyła wiadomości. Zatwierdzenie dla klienta jest osobnym krokiem.", "Registracija nesukuria darbo įrašo ir nesiunčia žinutės. Patvirtinimas klientui yra atskiras veiksmas.", "Регистрация не создаёт запись о работе и не отправляет сообщение. Одобрение для клиента — отдельный шаг.", "Реєстрація не створює запис про роботу й не надсилає повідомлення. Схвалення для клієнта — окремий крок."],
        .recovery: ["Gespeicherter Übertragungsstatus", "Saved transfer state", "Zapisany stan wysyłania", "Išsaugota perdavimo būsena", "Сохранённое состояние передачи", "Збережений стан передавання"],
        .reselect: ["Wählen Sie dieselbe Originaldatei erneut. Hash, Größe und Typ müssen übereinstimmen; der ursprüngliche Dateiname bleibt erhalten.", "Reselect the same original file. Hash, size and type must match; the original filename is retained.", "Wybierz ponownie ten sam oryginalny plik. Skrót, rozmiar i typ muszą się zgadzać; pierwotna nazwa zostaje zachowana.", "Vėl pasirinkite tą patį originalą. Maiša, dydis ir tipas turi sutapti; išlaikomas pradinis failo vardas.", "Выберите тот же исходный файл. Хеш, размер и тип должны совпасть; исходное имя сохраняется.", "Виберіть той самий оригінальний файл. Хеш, розмір і тип мають збігатися; початкова назва зберігається."],
        .recoveryWarning: ["Der Server hat bestätigt, aber der lokale Wiederherstellungsstatus konnte nicht vollständig gespeichert werden. Den bekannten Empfang nicht erneut als neuen Upload senden.", "The server acknowledged the operation, but local recovery storage could not be completed. Do not send a known receipt as a new upload.", "Serwer potwierdził operację, lecz zapis odzyskiwania jest niepełny. Nie wysyłaj potwierdzonego pliku jako nowego.", "Serveris patvirtino veiksmą, bet vietinis atkūrimo įrašas nebaigtas. Nesiųskite patvirtinto failo kaip naujo.", "Сервер подтвердил операцию, но локальное сохранение восстановления не завершено. Не отправляйте подтверждённый файл как новый.", "Сервер підтвердив операцію, але локальне збереження відновлення не завершено. Не надсилайте підтверджений файл як новий."],
        .clearRecovery: ["Bestätigten lokalen Status abschließen", "Finish acknowledged local recovery", "Zakończ potwierdzone odzyskiwanie", "Užbaigti patvirtintą vietinį atkūrimą", "Завершить подтверждённое восстановление", "Завершити підтверджене відновлення"],
        .cancel: ["Abbrechen und private Ansicht leeren", "Cancel and clear private view", "Anuluj i wyczyść prywatny widok", "Atšaukti ir išvalyti privatų rodinį", "Отменить и очистить приватный экран", "Скасувати й очистити приватний екран"],
        .refresh: ["Aktualisieren", "Refresh", "Odśwież", "Atnaujinti", "Обновить", "Оновити"],
        .queue: ["Auswahl", "Selection", "Wybór", "Pasirinkimas", "Выбор", "Вибір"],
        .nextFile: ["Nächste Datei prüfen", "Review next file", "Sprawdź następny plik", "Peržiūrėti kitą failą", "Проверить следующий файл", "Перевірити наступний файл"],
        .saveCopy: ["Kundenkopie speichern", "Save client copy", "Zapisz kopię dla klienta", "Išsaugoti kliento kopiją", "Сохранить клиентскую копию", "Зберегти клієнтську копію"],
        .exportNotice: ["Speichern erstellt eine eigene Kopie außerhalb der App. Spätere Zugriffsänderungen entfernen diese Kopie nicht.", "Saving creates a separate copy outside the app. Later access changes do not remove that copy.", "Zapis tworzy osobną kopię poza aplikacją. Późniejsze zmiany dostępu nie usuwają jej.", "Išsaugoma atskira kopija už programėlės ribų. Vėlesni prieigos pakeitimai jos nepašalina.", "Сохранение создаёт отдельную копию вне приложения. Последующее изменение доступа её не удаляет.", "Збереження створює окрему копію поза застосунком. Подальша зміна доступу її не видаляє."],
        .exported: ["Kopie gespeichert", "Copy saved", "Zapisano kopię", "Kopija išsaugota", "Копия сохранена", "Копію збережено"],
        .empty: ["Keine freigegebenen Dateien", "No available files", "Brak dostępnych plików", "Nėra prieinamų failų", "Нет доступных файлов", "Немає доступних файлів"],
        .dateUnknown: ["Datum nicht verfügbar", "Date unavailable", "Data niedostępna", "Data nežinoma", "Дата недоступна", "Дата недоступна"],
        .noTask: ["Ohne Aufgabe", "No task", "Bez zadania", "Be užduoties", "Без задачи", "Без завдання"],
        .loading: ["Wird geprüft …", "Checking…", "Sprawdzanie…", "Tikrinama…", "Проверка…", "Перевірка…"],
        .unsupported: ["Dateityp oder Bildmaße werden nicht unterstützt. Das Original wird nicht konvertiert.", "Unsupported file type or image dimensions. The original is not converted.", "Nieobsługiwany typ pliku lub wymiary obrazu. Oryginał nie jest konwertowany.", "Nepalaikomas failo tipas ar vaizdo matmenys. Originalas nekonvertuojamas.", "Тип файла или размер изображения не поддерживается. Оригинал не преобразуется.", "Тип файлу або розмір зображення не підтримується. Оригінал не перетворюється."],
        .tooLarge: ["Datei oder Antwort überschreitet das zulässige Limit.", "File or response exceeds the allowed limit.", "Plik lub odpowiedź przekracza limit.", "Failas ar atsakymas viršija leidžiamą ribą.", "Файл или ответ превышает допустимый лимит.", "Файл або відповідь перевищує дозволений ліміт."],
        .unavailable: ["Datei nicht lesbar. Erneut auswählen oder Dateizugriff prüfen.", "File cannot be read. Reselect it or check file access.", "Nie można odczytać pliku. Wybierz go ponownie lub sprawdź dostęp.", "Failo nepavyksta perskaityti. Pasirinkite iš naujo arba patikrinkite prieigą.", "Файл не читается. Выберите его снова или проверьте доступ.", "Файл не читається. Виберіть його знову або перевірте доступ."],
        .invalidMetadata: ["Prüfen Sie Zuordnung, Phase, Sichtbarkeit, Beschreibung und Aufbewahrungszweck.", "Check context, stage, visibility, caption and retention purpose.", "Sprawdź powiązanie, etap, widoczność, opis i cel przechowywania.", "Patikrinkite susiejimą, etapą, matomumą, aprašą ir saugojimo tikslą.", "Проверьте привязку, этап, видимость, описание и цель хранения.", "Перевірте прив’язку, етап, видимість, опис і мету зберігання."],
        .differentFile: ["Diese Datei stimmt nicht mit dem gespeicherten Original überein.", "This file does not match the saved original.", "Ten plik nie odpowiada zapisanemu oryginałowi.", "Šis failas neatitinka išsaugoto originalo.", "Этот файл не совпадает с сохранённым оригиналом.", "Цей файл не збігається зі збереженим оригіналом."],
        .accessChanged: ["Konto, Zugriff oder Zuordnung wurde geändert. Ansicht erneut öffnen; es erfolgt kein automatischer Wiederholungsversuch.", "Account, access or context changed. Reopen the view; no retry is automatic.", "Konto, dostęp lub powiązanie uległy zmianie. Otwórz widok ponownie; bez automatycznych ponowień.", "Paskyra, prieiga ar susiejimas pasikeitė. Atidarykite rodinį iš naujo; automatinio kartojimo nėra.", "Аккаунт, доступ или привязка изменились. Откройте экран заново; автоматического повтора нет.", "Обліковий запис, доступ або прив’язка змінилися. Відкрийте екран знову; автоматичного повтору немає."],
        .denied: ["Der aktuelle Zugriff erlaubt diese Medienaktion nicht.", "Current access does not permit this media action.", "Obecny dostęp nie pozwala na tę operację.", "Dabartinė prieiga neleidžia šio veiksmo.", "Текущий доступ не разрешает это действие с файлами.", "Поточний доступ не дозволяє цю дію з файлами."],
        .catalogChanged: ["Der Server bietet keinen kompatiblen Medienbefehl an.", "The server has no compatible media command.", "Serwer nie udostępnia zgodnego polecenia multimediów.", "Serveris nepateikia suderinamos medijos komandos.", "Сервер не предоставляет совместимую команду для файлов.", "Сервер не надає сумісну команду для файлів."],
        .invalidReceipt: ["Die Serverbestätigung konnte dieser Datei und Zuordnung nicht sicher zugeordnet werden.", "The server receipt could not be verified for this file and context.", "Nie można potwierdzić odpowiedzi serwera dla tego pliku i powiązania.", "Serverio patvirtinimo nepavyko patikrinti šiam failui ir susiejimui.", "Подтверждение сервера не удалось проверить для этого файла и привязки.", "Підтвердження сервера не вдалося перевірити для цього файлу та прив’язки."],
        .recoveryBlocked: ["Gespeicherte Übertragung benötigt Prüfung. Ohne passende aktuelle Berechtigung oder sichere Speicherung wird nichts erneut gesendet.", "Saved transfer needs review. Nothing is resent without matching current authority and secure storage.", "Zapisana operacja wymaga sprawdzenia. Bez zgodnych uprawnień i bezpiecznego zapisu nic nie zostanie wysłane ponownie.", "Išsaugotą perdavimą reikia patikrinti. Be atitinkančių teisių ir saugios saugyklos niekas nekartojama.", "Сохранённая передача требует проверки. Без соответствующего доступа и безопасного хранения ничего не отправляется повторно.", "Збережене передавання потребує перевірки. Без відповідного доступу й безпечного сховища нічого не надсилається повторно."],
        .failure: ["Die Aktion konnte nicht bestätigt werden. Verbindung und gespeicherten Status prüfen.", "The action could not be confirmed. Check the connection and saved state.", "Nie można potwierdzić operacji. Sprawdź połączenie i zapisany stan.", "Veiksmo patvirtinti nepavyko. Patikrinkite ryšį ir išsaugotą būseną.", "Действие не удалось подтвердить. Проверьте соединение и сохранённое состояние.", "Дію не вдалося підтвердити. Перевірте з’єднання та збережений стан."],
        .uploading: ["Datei wird gesendet …", "Sending file…", "Wysyłanie pliku…", "Siunčiamas failas…", "Отправка файла…", "Надсилання файлу…"],
        .registering: ["Galerie-Registrierung wird geprüft …", "Confirming gallery registration…", "Potwierdzanie rejestracji w galerii…", "Tikrinama registracija galerijoje…", "Подтверждение регистрации в галерее…", "Підтвердження реєстрації в галереї…"],
        .before: ["Vorher", "Before", "Przed", "Prieš", "До", "До"],
        .after: ["Nachher", "After", "Po", "Po", "После", "Після"],
        .defect: ["Mangel", "Defect", "Usterka", "Defektas", "Дефект", "Дефект"],
        .materials: ["Materialien", "Materials", "Materiały", "Medžiagos", "Материалы", "Матеріали"],
        .document: ["Dokument", "Document", "Dokument", "Dokumentas", "Документ", "Документ"],
        .internalVisibility: ["Intern", "Internal", "Wewnętrzna", "Vidinis", "Внутренняя", "Внутрішня"],
        .clientAfterApproval: ["Kunden nach Freigabe", "Clients after approval", "Klienci po zatwierdzeniu", "Klientams po patvirtinimo", "Клиентам после одобрения", "Клієнтам після схвалення"],
        .confidential: ["Vertraulich", "Confidential", "Poufna", "Konfidencialus", "Конфиденциальная", "Конфіденційна"],
        .rateLimited: ["Upload-Limit erreicht. Später ausdrücklich mit demselben Schlüssel wiederholen.", "Upload rate limit reached. Retry explicitly later with the same key.", "Osiągnięto limit wysyłania. Później ponów ręcznie z tym samym kluczem.", "Pasiektas įkėlimo dažnio limitas. Vėliau aiškiai kartokite tuo pačiu raktu.", "Достигнут лимит загрузок. Позже повторите вручную с тем же ключом.", "Досягнуто ліміт завантажень. Пізніше повторіть вручну з тим самим ключем."]
    ]
    static func text(_ key: ERPMediaText, _ language: NativeLanguage) -> String {
        rows[key]![NativeLanguage.allCases.firstIndex(of: language)!]
    }
    static func stage(_ value: String, _ language: NativeLanguage) -> String {
        let key: ERPMediaText = ["BEFORE": .before, "AFTER": .after, "DEFECT": .defect, "MATERIALS": .materials, "DOCUMENT": .document][value] ?? .unavailable
        return text(key, language)
    }
    static func visibility(_ value: String, _ language: NativeLanguage) -> String {
        let key: ERPMediaText = ["INTERNAL": .internalVisibility, "CLIENT_AFTER_APPROVAL": .clientAfterApproval, "CONFIDENTIAL": .confidential][value] ?? .unavailable
        return text(key, language)
    }
    static func error(_ error: Error, _ language: NativeLanguage) -> String {
        let key: ERPMediaText
        if let value = error as? ERPMediaFailure {
            switch value {
            case .unsupportedType: key = .unsupported
            case .fileUnavailable: key = .unavailable
            case .invalidFileName: key = .invalidFileName
            case .invalidMetadata, .missingSelection, .privacyRequired: key = .invalidMetadata
            case .differentFile: key = .differentFile
            case .contextChanged: key = .accessChanged
            case .noUploadPermission: key = .denied
            case .unsupportedCatalog: key = .catalogChanged
            case .receiptInvalid: key = .invalidReceipt
            case .importBusy: key = .importBusy
            case .recoveryMismatch, .pendingMedia: key = .recoveryBlocked
            }
        } else if let value = error as? ERPFailure {
            switch value {
            case .tooLarge: key = .tooLarge
            case .accessChanged, .expired, .invalidOrigin: key = .accessChanged
            case .recoveryInvalid, .recoveryUnavailable, .pendingCommand: key = .recoveryBlocked
            case .http(let status, _): key = status == 429 ? .rateLimited : ([401,403,404].contains(status) ? .denied : .failure)
            default: key = .failure
            }
        } else { key = .failure }
        return text(key, language)
    }
}
