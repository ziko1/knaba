import Foundation

/// Six explicit translations in DE, EN, PL, LT, RU, UK order; server identifiers stay canonical.
enum ERPText: String, CaseIterable {
    case currentPassword, newPassword, mfaSecret, credentialOtp, changePassword, configureMFA, credentialOnce, credentialReauth, credentialUnknown, errorSensitiveCommand
    case acceptedQuantity, actionAccept, actionApprove, actionArrive, actionCancel, actionClassify, actionClose, actionConfirm, actionCorrect, actionCorrectBulk, actionDecline, actionDelivery, actionDestination, actionEnd, actionExpire, actionLink, actionLock, actionOrder, actionPublish, actionReceipt, actionReceiptAmend, actionReceive, actionReconcile, actionRecordPayment, actionRefresh, actionReopen, actionReschedule, actionResolve, actionResume, actionReverse, actionReview, actionRevise, actionSend, actionStart, actionStatus, actionStop, actionSubmit, choose, fieldAddress, fieldDescription, fieldName, fieldPhone, fieldStatus, logWork, no, plannedQuantity, quantity, recordId, reportedQuantity, search, startTask, submitTask, taskId, yes
    case title, server, email, password, otp, signIn, refresh
    case roles, activeShifts, decisions, sites, requests, orders, tasks
    case roleOwner, roleDirector, roleOperationsManager, roleDispatcher, roleInternalBauleiter, roleTeamLeader
    case roleEmployee, roleStorekeeper, roleProcurement, roleAccountant, roleClient, roleExternalBauleiter
    case roleBotAdmin, roleQualityControl, roleAuditor, roleDeveloperSupport, roleGuest, roleServiceAccount
    case roleUnknown
    case crew, employees, shifts, presence, customers, messages, notifications
    case users, automation, actions, signOut, presenceNotice, empty, message
    case send, actionsIntro, expectedVersion, submit, confirmSensitive, cancel, confirm
    case saved, loading, loginIntro, roleHeading, account, connected, sent
    case shiftNotice, module, overview, records, permissions, signedIn, company
    case liveOverview, unavailable, areas, authorizedCount, version, fields, object
    case list, conversation, channel, noMessages, reply, reports, jsonArray
    case jsonObject, booleanHint, actionTitle, confirmNotice, errorOrigin, errorPath, errorExpired
    case errorResponse, errorSize, errorAccess, errorInput, errorHTTP, errorNetwork
    case quotes, changes, timesheets, trips, vehicleTrips, defects, worklogs
    case materials, materialRequests, requestBatches, stockLocations, stockReservations, stockMovements
    case suppliers, purchaseRequests, purchaseOrders, goodsReceipts, payroll, payslips
    case payouts, receipts, reportVersions, issues, files, knowledge
    case recoveryTitle, recoveryNotice, recoveryRetry, recoveryResolved
    case errorPending, errorPendingActor, errorPendingStorage, errorPendingChanged
}

enum ERPStrings {
    static let rows: [ERPText: [String]] = [
        .currentPassword: ["Aktuelles Passwort", "Current password", "Obecne hasło", "Dabartinis slaptažodis", "Текущий пароль", "Поточний пароль"],
        .newPassword: ["Neues Passwort", "New password", "Nowe hasło", "Naujas slaptažodis", "Новый пароль", "Новий пароль"],
        .mfaSecret: ["Einrichtungsschlüssel der Authenticator-App", "Authenticator setup key", "Klucz konfiguracji aplikacji uwierzytelniającej", "Autentifikavimo programėlės nustatymo raktas", "Ключ настройки приложения-аутентификатора", "Ключ налаштування застосунку-автентифікатора"],
        .credentialOtp: ["Authenticator-Code", "Authenticator code", "Kod uwierzytelniający", "Autentifikavimo kodas", "Код аутентификатора", "Код автентифікатора"],
        .changePassword: ["Passwort ändern", "Change password", "Zmień hasło", "Keisti slaptažodį", "Изменить пароль", "Змінити пароль"],
        .configureMFA: ["Zwei-Faktor-Anmeldung einrichten", "Set up two-factor sign-in", "Skonfiguruj logowanie dwuetapowe", "Nustatyti dviejų veiksnių prisijungimą", "Настроить двухфакторный вход", "Налаштувати двофакторний вхід"],
        .credentialOnce: ["Diese Zugangsdaten werden einmal gesendet und nicht für eine Wiederholung gespeichert. Melden Sie sich danach erneut an.", "These credentials are sent once and are not saved for retry. Sign in again afterward.", "Te dane logowania są wysyłane jeden raz i nie są zapisywane do ponowienia. Następnie zaloguj się ponownie.", "Šie prisijungimo duomenys siunčiami vieną kartą ir nesaugomi kartoti. Po to prisijunkite iš naujo.", "Эти данные отправляются один раз и не сохраняются для повтора. После этого войдите снова.", "Ці дані надсилаються один раз і не зберігаються для повтору. Після цього увійдіть знову."],
        .credentialReauth: ["Melden Sie sich erneut an, um die Änderung Ihrer Zugangsdaten zu prüfen.", "Sign in again to check your credential change.", "Zaloguj się ponownie, aby sprawdzić zmianę danych logowania.", "Prisijunkite iš naujo ir patikrinkite prisijungimo duomenų pakeitimą.", "Войдите снова, чтобы проверить изменение данных входа.", "Увійдіть знову, щоб перевірити зміну даних входу."],
        .credentialUnknown: ["Die Zugangsdaten könnten bereits geändert sein. Melden Sie sich erneut an, um dies zu prüfen. Die Anfrage wird nicht wiederholt.", "The credentials may already have changed. Sign in again to check. The request will not be retried.", "Dane logowania mogły już zostać zmienione. Zaloguj się ponownie, aby to sprawdzić. Żądanie nie zostanie ponowione.", "Prisijungimo duomenys galėjo būti pakeisti. Prisijunkite iš naujo ir patikrinkite. Užklausa nebus kartojama.", "Данные входа могли уже измениться. Войдите снова и проверьте. Запрос не будет повторён.", "Дані входу могли вже змінитися. Увійдіть знову та перевірте. Запит не буде повторено."],
        .errorSensitiveCommand: ["Diese Aktion mit Zugangsdaten ist in der mobilen App nicht verfügbar. Verwenden Sie die sicheren Kontoeinstellungen von KNABA.", "This credential action is not available in the mobile app. Use KNABA’s secure account settings.", "To działanie dotyczące danych logowania nie jest dostępne w aplikacji. Użyj bezpiecznych ustawień konta KNABA.", "Šis prisijungimo duomenų veiksmas programėlėje negalimas. Naudokite saugius KNABA paskyros nustatymus.", "Это действие с данными входа недоступно в приложении. Используйте безопасные настройки аккаунта KNABA.", "Ця дія з даними входу недоступна в застосунку. Скористайтеся захищеними налаштуваннями облікового запису KNABA."],
        .roleOwner: ["Inhaber", "Owner", "Właściciel", "Savininkas", "Владелец", "Власник"],
        .roleDirector: ["Geschäftsleitung", "Director", "Dyrektor", "Direktorius", "Директор", "Директор"],
        .roleOperationsManager: ["Betriebsleitung", "Operations manager", "Kierownik operacyjny", "Veiklos vadovas", "Операционный руководитель", "Операційний керівник"],
        .roleDispatcher: ["Disposition", "Dispatcher", "Dyspozytor", "Dispečeris", "Диспетчер", "Диспетчер"],
        .roleInternalBauleiter: ["Interne Bauleitung", "Internal site supervisor", "Wewnętrzny kierownik budowy", "Vidaus statybos vadovas", "Внутренний руководитель объекта", "Внутрішній керівник об’єкта"],
        .roleTeamLeader: ["Teamleitung", "Team leader", "Lider zespołu", "Komandos vadovas", "Руководитель бригады", "Керівник бригади"],
        .roleEmployee: ["Mitarbeiter", "Employee", "Pracownik", "Darbuotojas", "Работник", "Працівник"],
        .roleStorekeeper: ["Lagerverwaltung", "Storekeeper", "Magazynier", "Sandėlininkas", "Кладовщик", "Комірник"],
        .roleProcurement: ["Einkauf", "Procurement", "Zaopatrzenie", "Pirkimai", "Снабжение", "Закупівлі"],
        .roleAccountant: ["Buchhaltung", "Accountant", "Księgowy", "Buhalteris", "Бухгалтер", "Бухгалтер"],
        .roleClient: ["Kunde", "Client", "Klient", "Klientas", "Клиент", "Клієнт"],
        .roleExternalBauleiter: ["Externe Bauleitung", "External site supervisor", "Zewnętrzny kierownik budowy", "Išorinis statybos vadovas", "Внешний руководитель объекта", "Зовнішній керівник об’єкта"],
        .roleBotAdmin: ["Bot-Administration", "Bot administrator", "Administrator bota", "Boto administratorius", "Администратор бота", "Адміністратор бота"],
        .roleQualityControl: ["Qualitätskontrolle", "Quality control", "Kontrola jakości", "Kokybės kontrolė", "Контроль качества", "Контроль якості"],
        .roleAuditor: ["Prüfung", "Auditor", "Audytor", "Auditorius", "Аудитор", "Аудитор"],
        .roleDeveloperSupport: ["Technischer Support", "Technical support", "Wsparcie techniczne", "Techninė pagalba", "Техническая поддержка", "Технічна підтримка"],
        .roleGuest: ["Gast", "Guest", "Gość", "Svečias", "Гость", "Гість"],
        .roleServiceAccount: ["Dienstkonto", "Service account", "Konto usługi", "Paslaugos paskyra", "Сервисная учётная запись", "Службовий обліковий запис"],
        .roleUnknown: ["Unbekannte Rolle", "Unknown role", "Nieznana rola", "Nežinomas vaidmuo", "Неизвестная роль", "Невідома роль"],
        .acceptedQuantity: ["Abgenommene Menge", "Accepted quantity", "Przyjęta ilość", "Priimtas kiekis", "Принятое количество", "Прийнята кількість"],
        .actionAccept: ["Annehmen", "Accept", "Zaakceptuj", "Priimti", "Принять", "Прийняти"],
        .actionApprove: ["Freigeben", "Approve", "Zatwierdź", "Patvirtinti", "Одобрить", "Схвалити"],
        .actionArrive: ["Ankunft bestätigen", "Confirm arrival", "Potwierdź przybycie", "Patvirtinti atvykimą", "Подтвердить прибытие", "Підтвердити прибуття"],
        .actionCancel: ["Stornieren", "Cancel", "Anuluj", "Atšaukti", "Отменить", "Скасувати"],
        .actionClassify: ["Einordnen", "Classify", "Sklasyfikuj", "Klasifikuoti", "Классифицировать", "Класифікувати"],
        .actionClose: ["Abschließen", "Close", "Zamknij", "Užbaigti", "Закрыть", "Закрити"],
        .actionConfirm: ["Bestätigen", "Confirm", "Potwierdź", "Patvirtinti", "Подтвердить", "Підтвердити"],
        .actionCorrect: ["Korrektur beantragen", "Request correction", "Zgłoś korektę", "Prašyti pataisos", "Запросить исправление", "Запросити виправлення"],
        .actionCorrectBulk: ["Mehrere Einträge korrigieren", "Correct multiple entries", "Popraw wiele wpisów", "Pataisyti kelis įrašus", "Исправить несколько записей", "Виправити кілька записів"],
        .actionDecline: ["Ablehnen", "Decline", "Odrzuć", "Atmesti", "Отклонить", "Відхилити"],
        .actionDelivery: ["Lieferung bestätigen", "Confirm delivery", "Potwierdź dostarczenie", "Patvirtinti pristatymą", "Подтвердить доставку", "Підтвердити доставку"],
        .actionDestination: ["Ziel ändern", "Change destination", "Zmień cel", "Pakeisti paskirties vietą", "Изменить пункт назначения", "Змінити пункт призначення"],
        .actionEnd: ["Fahrt beenden", "End trip", "Zakończ przejazd", "Baigti kelionę", "Завершить поездку", "Завершити поїздку"],
        .actionExpire: ["Ablauf bestätigen", "Confirm expiry", "Potwierdź wygaśnięcie", "Patvirtinti galiojimo pabaigą", "Подтвердить истечение срока", "Підтвердити завершення строку"],
        .actionLink: ["Verknüpfen", "Link record", "Powiąż zapis", "Susieti įrašą", "Связать запись", "Пов’язати запис"],
        .actionLock: ["Abschließen und sperren", "Finalize and lock", "Zatwierdź i zablokuj", "Užbaigti ir užrakinti", "Завершить и заблокировать", "Завершити й заблокувати"],
        .actionOrder: ["Bestellung erstellen", "Create purchase order", "Utwórz zamówienie zakupu", "Sukurti pirkimo užsakymą", "Создать заказ поставщику", "Створити замовлення постачальнику"],
        .actionPublish: ["Veröffentlichen", "Publish", "Opublikuj", "Paskelbti", "Опубликовать", "Опублікувати"],
        .actionReceipt: ["Empfang oder Abweichung melden", "Report receipt or discrepancy", "Zgłoś odbiór lub rozbieżność", "Pranešti apie gavimą ar neatitikimą", "Сообщить о получении или расхождении", "Повідомити про отримання чи розбіжність"],
        .actionReceiptAmend: ["Empfangsmeldung berichtigen", "Amend receipt statement", "Popraw potwierdzenie odbioru", "Pataisyti gavimo patvirtinimą", "Исправить подтверждение получения", "Виправити підтвердження отримання"],
        .actionReceive: ["Wareneingang erfassen", "Record goods receipt", "Zarejestruj przyjęcie towaru", "Užregistruoti prekių priėmimą", "Зафиксировать приёмку", "Зафіксувати приймання"],
        .actionReconcile: ["Abgleichen", "Reconcile", "Uzgodnij", "Suderinti", "Сверить", "Звірити"],
        .actionRecordPayment: ["Ausgeführte Zahlung erfassen", "Record completed payment", "Zarejestruj wykonaną płatność", "Užregistruoti atliktą mokėjimą", "Зафиксировать выполненную оплату", "Зафіксувати виконану оплату"],
        .actionRefresh: ["Inhalt aktualisieren", "Refresh contents", "Odśwież zawartość", "Atnaujinti turinį", "Обновить содержимое", "Оновити вміст"],
        .actionReopen: ["Erneut öffnen", "Reopen", "Otwórz ponownie", "Atidaryti iš naujo", "Открыть повторно", "Відкрити повторно"],
        .actionReschedule: ["Termin ändern", "Reschedule", "Zmień termin", "Pakeisti laiką", "Изменить расписание", "Змінити розклад"],
        .actionResolve: ["Lösung dokumentieren", "Document resolution", "Udokumentuj rozwiązanie", "Dokumentuoti sprendimą", "Зафиксировать решение", "Зафіксувати вирішення"],
        .actionResume: ["Fahrt fortsetzen", "Resume trip", "Wznów przejazd", "Tęsti kelionę", "Продолжить поездку", "Продовжити поїздку"],
        .actionReverse: ["Rückbuchung erfassen", "Record reversal", "Zarejestruj storno", "Užregistruoti atšaukimą", "Зафиксировать сторно", "Зафіксувати сторно"],
        .actionReview: ["Prüfen und entscheiden", "Review and decide", "Sprawdź i zdecyduj", "Peržiūrėti ir nuspręsti", "Проверить и решить", "Перевірити й ухвалити рішення"],
        .actionRevise: ["Neue Version erstellen", "Create revision", "Utwórz nową wersję", "Sukurti naują versiją", "Создать новую версию", "Створити нову версію"],
        .actionSend: ["Senden", "Send", "Wyślij", "Siųsti", "Отправить", "Надіслати"],
        .actionStart: ["Arbeitsbeginn bestätigen", "Confirm work started", "Potwierdź rozpoczęcie pracy", "Patvirtinti darbo pradžią", "Подтвердить начало работы", "Підтвердити початок роботи"],
        .actionStatus: ["Status ändern", "Change status", "Zmień status", "Pakeisti būseną", "Изменить статус", "Змінити статус"],
        .actionStop: ["Halt erfassen", "Record a stop", "Zarejestruj postój", "Užregistruoti sustojimą", "Зафиксировать остановку", "Зафіксувати зупинку"],
        .actionSubmit: ["Zur Prüfung senden", "Submit for review", "Przekaż do weryfikacji", "Pateikti peržiūrai", "Отправить на проверку", "Надіслати на перевірку"],
        .choose: ["Bitte auswählen", "Please choose", "Wybierz", "Pasirinkite", "Выберите", "Оберіть"],
        .fieldAddress: ["Adresse", "Address", "Adres", "Adresas", "Адрес", "Адреса"],
        .fieldDescription: ["Beschreibung", "Description", "Opis", "Aprašymas", "Описание", "Опис"],
        .fieldName: ["Name", "Name", "Nazwa", "Pavadinimas", "Название", "Назва"],
        .fieldPhone: ["Telefon", "Phone", "Telefon", "Telefonas", "Телефон", "Телефон"],
        .fieldStatus: ["Status", "Status", "Status", "Būsena", "Статус", "Статус"],
        .logWork: ["Arbeit dokumentieren", "Record work", "Zapisz wykonaną pracę", "Užregistruoti darbą", "Записать выполненную работу", "Записати виконану роботу"],
        .no: ["Nein", "No", "Nie", "Ne", "Нет", "Ні"],
        .plannedQuantity: ["Geplante Menge", "Planned quantity", "Planowana ilość", "Planuotas kiekis", "Плановое количество", "Запланована кількість"],
        .quantity: ["Menge", "Quantity", "Ilość", "Kiekis", "Количество", "Кількість"],
        .recordId: ["Datensatz-ID", "Record ID", "ID rekordu", "Įrašo ID", "ID записи", "ID запису"],
        .reportedQuantity: ["Gemeldete Menge", "Reported quantity", "Zgłoszona ilość", "Užregistruotas kiekis", "Выполненное количество", "Виконана кількість"],
        .search: ["Suchen", "Search", "Szukaj", "Ieškoti", "Поиск", "Пошук"],
        .startTask: ["Aufgabe beginnen", "Start task", "Rozpocznij zadanie", "Pradėti užduotį", "Начать задание", "Почати завдання"],
        .submitTask: ["Zur Prüfung einreichen", "Submit for review", "Przekaż do sprawdzenia", "Pateikti peržiūrai", "Передать на проверку", "Передати на перевірку"],
        .taskId: ["Aufgaben-ID", "Task ID", "ID zadania", "Užduoties ID", "ID задания", "ID завдання"],
        .yes: ["Ja", "Yes", "Tak", "Taip", "Да", "Так"],
        .quotes: ["Angebote", "Quotes", "Oferty", "Pasiūlymai", "Предложения", "Пропозиції"],
        .changes: ["Nachträge", "Change orders", "Zlecenia dodatkowe", "Papildomi užsakymai", "Дополнительные заказы", "Додаткові замовлення"],
        .timesheets: ["Stundenzettel", "Timesheets", "Ewidencja czasu", "Darbo laiko apskaita", "Табели", "Табелі"],
        .trips: ["Dienstfahrten", "Business trips", "Przejazdy służbowe", "Darbo kelionės", "Рабочие поездки", "Робочі поїздки"],
        .vehicleTrips: ["Gemeinsame Fahrten", "Shared vehicle trips", "Wspólne przejazdy", "Bendros kelionės", "Совместные поездки", "Спільні поїздки"],
        .defects: ["Mängel und Nacharbeit", "Defects and rework", "Usterki i poprawki", "Defektai ir taisymas", "Дефекты и доработка", "Дефекти й доопрацювання"],
        .worklogs: ["Arbeitsnachweise", "Work logs", "Wykonane prace", "Atlikti darbai", "Выполненные работы", "Виконані роботи"],
        .materials: ["Materialien", "Materials", "Materiały", "Medžiagos", "Материалы", "Матеріали"],
        .materialRequests: ["Materialanforderungen", "Material requests", "Zapotrzebowanie materiałowe", "Medžiagų užklausos", "Заявки на материалы", "Заявки на матеріали"],
        .requestBatches: ["Sammelanforderungen", "Grouped requests", "Zbiorcze zapotrzebowania", "Jungtinės užklausos", "Групповые заявки", "Групові заявки"],
        .stockLocations: ["Lagerorte", "Stock locations", "Lokalizacje magazynowe", "Sandėliavimo vietos", "Места хранения", "Місця зберігання"],
        .stockReservations: ["Materialreservierungen", "Stock reservations", "Rezerwacje materiałów", "Medžiagų rezervacijos", "Резервы материалов", "Резерви матеріалів"],
        .stockMovements: ["Lagerbewegungen", "Stock movements", "Ruchy magazynowe", "Atsargų judėjimas", "Движение материалов", "Рух матеріалів"],
        .suppliers: ["Lieferanten", "Suppliers", "Dostawcy", "Tiekėjai", "Поставщики", "Постачальники"],
        .purchaseRequests: ["Bestellanforderungen", "Purchase requests", "Wnioski zakupowe", "Pirkimo užklausos", "Заявки на закупку", "Заявки на закупівлю"],
        .purchaseOrders: ["Bestellungen", "Purchase orders", "Zamówienia zakupu", "Pirkimo užsakymai", "Заказы поставщикам", "Замовлення постачальникам"],
        .goodsReceipts: ["Wareneingänge", "Goods receipts", "Przyjęcia towaru", "Prekių priėmimas", "Приёмка товаров", "Приймання товарів"],
        .payroll: ["Lohnberechnungen", "Pay calculations", "Naliczanie wynagrodzeń", "Atlygio skaičiavimai", "Расчёты оплаты", "Розрахунки оплати"],
        .payslips: ["Lohnabrechnungen", "Payslips", "Paski wynagrodzeń", "Atlyginimo lapeliai", "Расчётные листки", "Розрахункові листки"],
        .payouts: ["Auszahlungen", "Payouts", "Wypłaty", "Išmokos", "Выплаты", "Виплати"],
        .receipts: ["Empfangsbestätigungen", "Payment receipts", "Potwierdzenia odbioru", "Gavimo patvirtinimai", "Подтверждения получения", "Підтвердження отримання"],
        .reportVersions: ["Veröffentlichte Berichte", "Published reports", "Opublikowane raporty", "Paskelbtos ataskaitos", "Опубликованные отчёты", "Опубліковані звіти"],
        .issues: ["Kundenmeldungen", "Customer issues", "Zgłoszenia klientów", "Klientų pranešimai", "Обращения клиентов", "Звернення клієнтів"],
        .files: ["Fotos und Dateien", "Photos and files", "Zdjęcia i pliki", "Nuotraukos ir failai", "Фото и файлы", "Фото й файли"],
        .knowledge: ["Wissensbasis", "Knowledge base", "Baza wiedzy", "Žinių bazė", "База знаний", "База знань"],
        .recoveryTitle: ["Gespeicherte Anfrage prüfen", "Check the saved request", "Sprawdź zapisane żądanie", "Patikrinkite išsaugotą užklausą", "Проверить сохранённый запрос", "Перевірити збережений запит"],
        .recoveryNotice: ["Der Server könnte diese Aktion bereits ausgeführt haben. Wiederholen Sie nur die gespeicherte Anfrage und erstellen Sie die Aktion nicht erneut.", "The server may already have applied this action. Retry only the saved request; do not create the action again.", "Serwer mógł już wykonać to działanie. Ponów tylko zapisane żądanie; nie twórz działania ponownie.", "Serveris galėjo jau atlikti šį veiksmą. Pakartokite tik išsaugotą užklausą; nekurkite veiksmo iš naujo.", "Сервер мог уже выполнить действие. Повторите только сохранённый запрос; не создавайте действие заново.", "Сервер міг уже виконати дію. Повторіть лише збережений запит; не створюйте дію заново."],
        .recoveryRetry: ["Gespeicherte Anfrage erneut prüfen", "Retry the saved request", "Ponów zapisane żądanie", "Pakartoti išsaugotą užklausą", "Повторить сохранённый запрос", "Повторити збережений запит"],
        .recoveryResolved: ["Der Server hat die gespeicherte Aktion bestätigt.", "The server confirmed the saved action.", "Serwer potwierdził zapisane działanie.", "Serveris patvirtino išsaugotą veiksmą.", "Сервер подтвердил сохранённое действие.", "Сервер підтвердив збережену дію."],
        .errorPending: ["Prüfen Sie zuerst die gespeicherte Anfrage, bevor Sie eine weitere Änderung senden.", "Resolve the saved request before sending another change.", "Najpierw rozstrzygnij zapisane żądanie, zanim wyślesz kolejną zmianę.", "Prieš siųsdami kitą pakeitimą išspręskite išsaugotą užklausą.", "Сначала проверьте сохранённый запрос, прежде чем отправлять новое изменение.", "Спочатку перевірте збережений запит, перш ніж надсилати нову зміну."],
        .errorPendingActor: ["Eine gespeicherte Anfrage gehört zu einem anderen Konto oder Server. Melden Sie sich mit dem ursprünglichen Konto am ursprünglichen Server an.", "A saved request belongs to another account or server. Sign in with the original account on the original server.", "Zapisane żądanie należy do innego konta lub serwera. Zaloguj się na pierwotne konto na pierwotnym serwerze.", "Išsaugota užklausa priklauso kitai paskyrai arba serveriui. Prisijunkite pradine paskyra prie pradinio serverio.", "Сохранённый запрос относится к другому аккаунту или серверу. Войдите в исходный аккаунт на исходном сервере.", "Збережений запит належить іншому обліковому запису або серверу. Увійдіть у початковий обліковий запис на початковому сервері."],
        .errorPendingStorage: ["Die Anfrage konnte nicht sicher gespeichert oder gelesen werden. Erstellen Sie sie nicht erneut.", "The request could not be safely stored or read. Do not create it again.", "Nie udało się bezpiecznie zapisać lub odczytać żądania. Nie twórz go ponownie.", "Nepavyko saugiai išsaugoti arba perskaityti užklausos. Nekurkite jos iš naujo.", "Не удалось безопасно сохранить или прочитать запрос. Не создавайте его заново.", "Не вдалося безпечно зберегти або прочитати запит. Не створюйте його заново."],
        .errorPendingChanged: ["Die gespeicherte Anfrage hat sich geändert. Aktualisieren Sie die Ansicht.", "The saved request changed. Refresh the current view.", "Zapisane żądanie uległo zmianie. Odśwież widok.", "Išsaugota užklausa pasikeitė. Atnaujinkite rodinį.", "Сохранённый запрос изменился. Обновите экран.", "Збережений запит змінився. Оновіть екран."],
        .title: ["KNABA · Control", "KNABA · Control", "KNABA · Zarządzanie", "KNABA · Valdymas", "KNABA · Управление", "KNABA · Керування"],
        .server: ["HTTPS-Adresse des ERP-Servers", "ERP server HTTPS address", "Adres HTTPS serwera ERP", "ERP serverio HTTPS adresas", "HTTPS-адрес сервера ERP", "HTTPS-адреса сервера ERP"],
        .email: ["E-Mail", "Email", "E-mail", "El. paštas", "Эл. почта", "Електронна пошта"],
        .password: ["Passwort", "Password", "Hasło", "Slaptažodis", "Пароль", "Пароль"],
        .otp: ["2FA-Code (falls erforderlich)", "2FA code (if required)", "Kod 2FA (jeśli wymagany)", "2FA kodas (jei reikia)", "Код 2FA (при необходимости)", "Код 2FA (за потреби)"],
        .signIn: ["Sicher anmelden", "Sign in securely", "Zaloguj bezpiecznie", "Prisijungti saugiai", "Безопасно войти", "Безпечно увійти"],
        .refresh: ["Aktualisieren", "Refresh", "Odśwież", "Atnaujinti", "Обновить", "Оновити"],
        .roles: ["Rolle", "Role", "Rola", "Rolė", "Роль", "Роль"],
        .activeShifts: ["Aktive Schichten", "Active shifts", "Aktywne zmiany", "Aktyvios pamainos", "Активные смены", "Активні зміни"],
        .decisions: ["Entscheidungen", "Decisions", "Decyzje", "Sprendimai", "Решения", "Рішення"],
        .sites: ["Objekte", "Sites", "Obiekty", "Objektai", "Объекты", "Об’єкти"],
        .requests: ["Anfragen", "Requests", "Zapytania", "Užklausos", "Заявки", "Заявки"],
        .orders: ["Aufträge", "Orders", "Zlecenia", "Užsakymai", "Заказы", "Замовлення"],
        .tasks: ["Aufgaben", "Tasks", "Zadania", "Užduotys", "Задачи", "Завдання"],
        .crew: ["Einsatzteams", "Crew assignments", "Przydziały ekip", "Komandų paskyrimai", "Назначения бригад", "Призначення бригад"],
        .employees: ["Mitarbeitende", "Workers", "Pracownicy", "Darbuotojai", "Сотрудники", "Працівники"],
        .shifts: ["Schichten", "Shifts", "Zmiany", "Pamainos", "Смены", "Зміни"],
        .presence: ["Anwesenheitsstatus", "Presence status", "Status obecności", "Buvimo būsena", "Статус присутствия", "Статус присутності"],
        .customers: ["Kunden", "Customers", "Klienci", "Klientai", "Клиенты", "Клієнти"],
        .messages: ["Nachrichten", "Messages", "Wiadomości", "Žinutės", "Сообщения", "Повідомлення"],
        .notifications: ["Mitteilungen", "Notifications", "Powiadomienia", "Pranešimai", "Уведомления", "Сповіщення"],
        .users: ["Benutzer & Rollen", "Users & roles", "Użytkownicy i role", "Naudotojai ir rolės", "Пользователи и роли", "Користувачі та ролі"],
        .automation: ["Einstellungen", "Settings", "Ustawienia", "Nustatymai", "Настройки", "Налаштування"],
        .actions: ["Freigegebene Aktionen", "Allowed actions", "Dozwolone działania", "Leidžiami veiksmai", "Разрешённые действия", "Дозволені дії"],
        .signOut: ["Abmelden", "Sign out", "Wyloguj", "Atsijungti", "Выйти", "Вийти"],
        .presenceNotice: ["GPS/Anwesenheit nur bei ausdrücklicher Zustimmung, gültiger Richtlinie und aktuellem Serverstatus. Fehlende Position ist unbekannt.", "Location requires explicit approval, valid policy and current server state. Missing location is unknown.", "Lokalizacja tylko za wyraźną zgodą, z ważną polityką i świeżym stanem serwera. Brak pozycji = nieznany.", "Vieta tik gavus aiškų leidimą, galiojant politikai ir esant naujai serverio būsenai. Jei vietos nėra – nežinoma.", "Геолокация только с явного согласия, действующей политикой и актуальным статусом сервера. Нет позиции — неизвестно.", "Геолокація — лише з явним дозволом, чинною політикою та свіжим станом сервера. Відсутня позиція — невідомо."],
        .empty: ["Keine verfügbaren Datensätze", "No accessible records", "Brak dostępnych rekordów", "Nėra prieinamų įrašų", "Нет доступных записей", "Немає доступних записів"],
        .message: ["Nachricht schreiben", "Write message", "Napisz wiadomość", "Rašyti žinutę", "Написать сообщение", "Написати повідомлення"],
        .send: ["Senden", "Send", "Wyślij", "Siųsti", "Отправить", "Надіслати"],
        .actionsIntro: ["Nur serverseitig freigegebene Aktionen. Empfindliche Aktionen erfordern Bestätigung.", "Only authorized server actions. Sensitive changes require confirmation.", "Wyłącznie dozwolone działania serwera. Wrażliwe operacje wymagają potwierdzenia.", "Tik serverio leisti veiksmai. Jautriems veiksmams reikia patvirtinimo.", "Только разрешённые сервером действия. Для чувствительных операций нужно подтверждение.", "Лише дозволені сервером дії. Чутливі операції потребують підтвердження."],
        .expectedVersion: ["Erwartete Version (optional)", "Expected version (optional)", "Oczekiwana wersja (opcjonalnie)", "Tikėtina versija (nebūtina)", "Ожидаемая версия (необязательно)", "Очікувана версія (необов’язково)"],
        .submit: ["An KNABA senden", "Submit to KNABA", "Wyślij do KNABA", "Siųsti KNABA", "Отправить KNABA", "Надіслати KNABA"],
        .confirmSensitive: ["Sensible Aktion bestätigen", "Confirm sensitive action", "Potwierdź wrażliwą operację", "Patvirtinti jautrų veiksmą", "Подтвердить чувствительную операцию", "Підтвердити чутливу дію"],
        .cancel: ["Abbrechen", "Cancel", "Anuluj", "Atšaukti", "Отмена", "Скасувати"],
        .confirm: ["Bestätigen", "Confirm", "Potwierdź", "Patvirtinti", "Подтвердить", "Підтвердити"],
        .saved: ["Gespeichert", "Saved", "Zapisano", "Išsaugota", "Сохранено", "Збережено"],
        .loading: ["Laden…", "Loading…", "Ładowanie…", "Įkeliama…", "Загрузка…", "Завантаження…"],
        .loginIntro: ["Melden Sie sich mit Ihrem freigegebenen KNABA-Konto an. Ihre Berechtigungen werden vom Server geprüft.", "Sign in with your approved KNABA account. The server verifies your permissions.", "Zaloguj się na zatwierdzone konto KNABA. Serwer sprawdza Twoje uprawnienia.", "Prisijunkite prie patvirtintos KNABA paskyros. Serveris tikrina jūsų teises.", "Войдите в подтверждённую учётную запись KNABA. Права доступа проверяет сервер.", "Увійдіть у підтверджений обліковий запис KNABA. Права доступу перевіряє сервер."],
        .roleHeading: ["Ihr KNABA-Arbeitsbereich", "Your KNABA workspace", "Twoje centrum KNABA", "Jūsų KNABA darbo vieta", "Ваше рабочее пространство KNABA", "Ваш робочий простір KNABA"],
        .account: ["Ihr Konto", "Your account", "Twoje konto", "Jūsų paskyra", "Ваша учётная запись", "Ваш обліковий запис"],
        .connected: ["Mit Ihrem KNABA-Konto verbunden", "Connected to your KNABA account", "Połączono z kontem KNABA", "Prisijungta prie jūsų KNABA paskyros", "Подключено к вашей учётной записи KNABA", "Підключено до вашого облікового запису KNABA"],
        .sent: ["Nachricht gesendet", "Message sent", "Wiadomość wysłana", "Žinutė išsiųsta", "Сообщение отправлено", "Повідомлення надіслано"],
        .shiftNotice: ["Die Schicht- und freiwilligen Standortfunktionen sind im zweiten Tab verfügbar. Die Anmeldung aktiviert kein GPS.", "Shift and optional location tools are available in the second tab. Signing in does not activate GPS.", "Funkcje zmian i dobrowolnej lokalizacji są w drugiej karcie. Logowanie nie włącza GPS.", "Pamainų ir pasirenkamos vietos funkcijos yra antrame skirtuke. Prisijungimas neįjungia GPS.", "Смены и добровольная передача геопозиции доступны во второй вкладке. Вход не включает GPS.", "Зміни та добровільне передавання геопозиції доступні на другій вкладці. Вхід не вмикає GPS."],
        .module: ["Bereich", "Module", "Moduł", "Modulis", "Раздел", "Розділ"],
        .overview: ["Übersicht", "Overview", "Przegląd", "Apžvalga", "Обзор", "Огляд"],
        .records: ["Einträge", "Records", "Wpisy", "Įrašai", "Записи", "Записи"],
        .permissions: ["Konto und Berechtigungen", "Account and permissions", "Konto i uprawnienia", "Paskyra ir teisės", "Учётная запись и права", "Обліковий запис і права"],
        .signedIn: ["Angemeldet als", "Signed in as", "Zalogowano jako", "Prisijungta kaip", "Вход выполнен как", "Вхід виконано як"],
        .company: ["Unternehmen", "Company", "Firma", "Įmonė", "Компания", "Компанія"],
        .liveOverview: ["Aktuelle Übersicht", "Live overview", "Aktualny przegląd", "Dabartinė apžvalga", "Текущий обзор", "Поточний огляд"],
        .unavailable: ["Serverdaten nicht verfügbar", "Server data unavailable", "Dane serwera niedostępne", "Serverio duomenys nepasiekiami", "Данные сервера недоступны", "Дані сервера недоступні"],
        .areas: ["Verfügbare Bereiche", "Available areas", "Dostępne obszary", "Galimos sritys", "Доступные разделы", "Доступні розділи"],
        .authorizedCount: ["Freigegebene Einträge: %@", "Authorized records: %@", "Dostępne wpisy: %@", "Leidžiami įrašai: %@", "Доступные записи: %@", "Доступні записи: %@"],
        .version: ["Version", "Version", "Wersja", "Versija", "Версия", "Версія"],
        .fields: ["Datenfelder", "Record fields", "Pola danych", "Įrašo laukai", "Поля записи", "Поля запису"],
        .object: ["Objekt", "Object", "Obiekt", "Objektas", "Объект", "Об’єкт"],
        .list: ["Liste", "List", "Lista", "Sąrašas", "Список", "Список"],
        .conversation: ["Unternehmensgespräch", "Company conversation", "Rozmowa firmowa", "Įmonės pokalbis", "Разговор компании", "Розмова компанії"],
        .channel: ["Kanal", "Channel", "Kanał", "Kanalas", "Канал", "Канал"],
        .noMessages: ["Keine Nachrichten", "No messages", "Brak wiadomości", "Žinučių nėra", "Нет сообщений", "Немає повідомлень"],
        .reply: ["Antworten", "Reply", "Odpowiedź", "Atsakyti", "Ответить", "Відповісти"],
        .reports: ["Berichte", "Reports", "Raporty", "Ataskaitos", "Отчёты", "Звіти"],
        .jsonArray: ["JSON-Liste, z. B. [\"id\"]", "JSON array, e.g. [\"id\"]", "Tablica JSON, np. [\"id\"]", "JSON masyvas, pvz. [\"id\"]", "Массив JSON, например [\"id\"]", "Масив JSON, наприклад [\"id\"]"],
        .jsonObject: ["JSON-Objekt", "JSON object", "Obiekt JSON", "JSON objektas", "Объект JSON", "Об’єкт JSON"],
        .booleanHint: ["true oder false eingeben", "Enter true or false", "Wpisz true lub false", "Įveskite true arba false", "Введите true или false", "Введіть true або false"],
        .actionTitle: ["KNABA-Aktion", "KNABA action", "Działanie KNABA", "KNABA veiksmas", "Действие KNABA", "Дія KNABA"],
        .confirmNotice: ["Diese Aktion ändert Unternehmensdaten. Prüfen Sie die Angaben vor der Bestätigung.", "This action changes company records. Check the details before confirming.", "To działanie zmienia dane firmy. Sprawdź szczegóły przed potwierdzeniem.", "Šis veiksmas pakeičia įmonės įrašus. Prieš patvirtindami patikrinkite duomenis.", "Это действие изменяет данные компании. Проверьте сведения перед подтверждением.", "Ця дія змінює дані компанії. Перевірте відомості перед підтвердженням."],
        .errorOrigin: ["Geben Sie die HTTPS-Adresse des KNABA-ERP-Servers ohne Pfad ein.", "Enter the KNABA ERP HTTPS server address without a path.", "Wpisz adres HTTPS serwera KNABA ERP bez ścieżki.", "Įveskite KNABA ERP serverio HTTPS adresą be kelio.", "Введите HTTPS-адрес сервера KNABA ERP без пути.", "Введіть HTTPS-адрес сервера KNABA ERP без шляху."],
        .errorPath: ["Nicht unterstützte Serveranfrage.", "Unsupported server request.", "Nieobsługiwane żądanie serwera.", "Nepalaikoma serverio užklausa.", "Неподдерживаемый запрос к серверу.", "Непідтримуваний запит до сервера."],
        .errorExpired: ["Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an.", "Your session expired. Sign in again.", "Sesja wygasła. Zaloguj się ponownie.", "Sesija baigėsi. Prisijunkite dar kartą.", "Сеанс истёк. Войдите снова.", "Сеанс завершився. Увійдіть знову."],
        .errorResponse: ["Ungültige Serverantwort.", "Invalid server response.", "Nieprawidłowa odpowiedź serwera.", "Netinkamas serverio atsakymas.", "Некорректный ответ сервера.", "Некоректна відповідь сервера."],
        .errorSize: ["Die Serverantwort ist zu groß.", "The server response is too large.", "Odpowiedź serwera jest zbyt duża.", "Serverio atsakymas per didelis.", "Ответ сервера слишком большой.", "Відповідь сервера завелика."],
        .errorAccess: ["Zugriff oder Server wurde geändert. Melden Sie sich erneut an.", "Access or server changed. Sign in again.", "Dostęp lub serwer uległ zmianie. Zaloguj się ponownie.", "Pasikeitė prieiga arba serveris. Prisijunkite dar kartą.", "Доступ или сервер изменился. Войдите снова.", "Доступ або сервер змінився. Увійдіть знову."],
        .errorInput: ["Prüfen Sie die Eingabefelder.", "Check the input fields.", "Sprawdź wprowadzone dane.", "Patikrinkite įvestus duomenis.", "Проверьте введённые данные.", "Перевірте введені дані."],
        .errorHTTP: ["Der Server hat die Anfrage abgelehnt (HTTP %@).", "The server rejected the request (HTTP %@).", "Serwer odrzucił żądanie (HTTP %@).", "Serveris atmetė užklausą (HTTP %@).", "Сервер отклонил запрос (HTTP %@).", "Сервер відхилив запит (HTTP %@)."],
        .errorNetwork: ["Verbindung fehlgeschlagen. Prüfen Sie die Serveradresse und das Netzwerk.", "Connection failed. Check the server address and network.", "Połączenie nie powiodło się. Sprawdź adres serwera i sieć.", "Prisijungti nepavyko. Patikrinkite serverio adresą ir tinklą.", "Не удалось подключиться. Проверьте адрес сервера и сеть.", "Не вдалося підключитися. Перевірте адресу сервера та мережу."],
    ]
    static func text(_ key: ERPText, _ language: NativeLanguage, _ arguments: String...) -> String {
        let format = rows[key]![NativeLanguage.allCases.firstIndex(of: language)!]
        return arguments.isEmpty ? format : String(format: format, locale: Locale(identifier: language.rawValue), arguments: arguments.map { $0 as CVarArg })
    }
    /// Display-only mapping: canonical roles and permissions remain unchanged.
    static func role(_ identifier: String, _ language: NativeLanguage) -> String {
        let key: ERPText
        switch identifier {
        case "OWNER": key = .roleOwner
        case "DIRECTOR": key = .roleDirector
        case "OPERATIONS_MANAGER": key = .roleOperationsManager
        case "DISPATCHER": key = .roleDispatcher
        case "INTERNAL_BAULEITER", "FOREMAN": key = .roleInternalBauleiter
        case "TEAM_LEADER", "TEAM_LEAD": key = .roleTeamLeader
        case "EMPLOYEE": key = .roleEmployee
        case "STOREKEEPER", "WAREHOUSE": key = .roleStorekeeper
        case "PROCUREMENT": key = .roleProcurement
        case "ACCOUNTANT": key = .roleAccountant
        case "CLIENT": key = .roleClient
        case "EXTERNAL_BAULEITER": key = .roleExternalBauleiter
        case "BOT_ADMIN": key = .roleBotAdmin
        case "QUALITY_CONTROL": key = .roleQualityControl
        case "AUDITOR": key = .roleAuditor
        case "DEVELOPER_SUPPORT": key = .roleDeveloperSupport
        case "GUEST": key = .roleGuest
        case "SERVICE_ACCOUNT": key = .roleServiceAccount
        default: key = .roleUnknown
        }
        return text(key, language)
    }
    static func error(_ error: Error, _ language: NativeLanguage) -> String {
        guard let failure = error as? ERPFailure else { return text(.errorNetwork, language) }
        switch failure {
        case .invalidOrigin: return text(.errorOrigin, language)
        case .invalidPath: return text(.errorPath, language)
        case .expired: return text(.errorExpired, language)
        case .invalidResponse: return text(.errorResponse, language)
        case .tooLarge: return text(.errorSize, language)
        case .accessChanged: return text(.errorAccess, language)
        case .invalidPayload: return text(.errorInput, language)
        case .confirmationRequired: return text(.confirmNotice, language)
        case .http(let status, _): return text(.errorHTTP, language, String(status))
        case .pendingExists: return text(.errorPending, language)
        case .pendingUnknown: return text(.recoveryNotice, language)
        case .pendingDifferentActor: return text(.errorPendingActor, language)
        case .pendingStorage: return text(.errorPendingStorage, language)
        case .pendingChanged: return text(.errorPendingChanged, language)
        case .sensitiveCommand: return text(.errorSensitiveCommand, language)
        case .credentialReauthenticationRequired: return text(.credentialReauth, language)
        case .credentialOutcomeUnknown: return text(.credentialUnknown, language)
        }
    }
}
