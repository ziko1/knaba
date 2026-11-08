import Foundation

/// Six explicit translations in DE, EN, PL, LT, RU, UK order; server identifiers stay canonical.
enum ERPText: String, CaseIterable {
    case acceptedQuantity, actionAccept, actionApprove, actionArrive, actionCancel, actionClassify, actionClose, actionConfirm, actionCorrect, actionCorrectBulk, actionDecline, actionDelivery, actionDestination, actionEnd, actionExpire, actionLink, actionLock, actionOrder, actionPublish, actionReceipt, actionReceiptAmend, actionReceive, actionReconcile, actionRecordPayment, actionRefresh, actionReopen, actionReschedule, actionResolve, actionResume, actionReverse, actionReview, actionRevise, actionSend, actionStart, actionStatus, actionStop, actionSubmit, fieldAddress, fieldDescription, fieldName, fieldPhone, fieldStatus, plannedQuantity, recordId, reportedQuantity, taskId
    case sharedTrips
    case changes, defects, files, goodsReceipts, knowledge, payouts, payroll, payslips, purchaseOrders, purchaseRequests, receipts, requestBatches, stockLocations, stockMovements, stockReservations, suppliers, timesheets, trips, worklogs
    case title, server, email, password, otp, signIn, refresh
    case roles, activeShifts, decisions, sites, requests, orders, tasks
    case crew, employees, shifts, presence, customers, messages, notifications
    case users, automation, actions, signOut, presenceNotice, empty, message
    case send, actionsIntro, expectedVersion, submit, confirmSensitive, cancel, confirm
    case saved, loading, loginIntro, roleHeading, account, connected, sent
    case shiftNotice, module, overview, records, permissions, signedIn, company
    case liveOverview, unavailable, areas, authorizedCount, version, fields, object
    case list, conversation, channel, noMessages, reply, reports, jsonArray
    case jsonObject, booleanHint, actionTitle, confirmNotice, errorOrigin, errorPath, errorExpired
    case errorResponse, errorSize, errorAccess, errorInput, errorHTTP, errorNetwork
    case pendingDetails
    case quotes, issues, publishedReports, materials, startTask, logWork, submitTask
    case checklist, reviewTask, changePassword, configureMFA, clientPortal, accessUpdated, reauthRequired
    case pendingTitle, pendingNotice, errorRecovery, retryOriginal, recovered, errorPending, errorInFlight
    case noPending, errorSensitive, serverNotice, search, choose, yes, no
    case result, quantityHint, previewLimit, quantity, remainingQuantity, description, problems
    case delayReason, currentPassword, newPassword, errorConflict, clearValue
}

enum ERPStrings {
    static let rows: [ERPText: [String]] = [
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
        .fieldAddress: ["Adresse", "Address", "Adres", "Adresas", "Адрес", "Адреса"],
        .fieldDescription: ["Beschreibung", "Description", "Opis", "Aprašymas", "Описание", "Опис"],
        .fieldName: ["Name", "Name", "Nazwa", "Pavadinimas", "Название", "Назва"],
        .fieldPhone: ["Telefon", "Phone", "Telefon", "Telefonas", "Телефон", "Телефон"],
        .fieldStatus: ["Status", "Status", "Status", "Būsena", "Статус", "Статус"],
        .plannedQuantity: ["Geplante Menge", "Planned quantity", "Planowana ilość", "Planuotas kiekis", "Плановое количество", "Запланована кількість"],
        .recordId: ["Datensatz-ID", "Record ID", "ID rekordu", "Įrašo ID", "ID записи", "ID запису"],
        .reportedQuantity: ["Gemeldete Menge", "Reported quantity", "Zgłoszona ilość", "Užregistruotas kiekis", "Выполненное количество", "Виконана кількість"],
        .taskId: ["Aufgaben-ID", "Task ID", "ID zadania", "Užduoties ID", "ID задания", "ID завдання"],
        .sharedTrips: ["Gemeinsame Fahrzeugfahrten", "Shared vehicle journeys", "Wspólne przejazdy samochodem", "Bendros kelionės automobiliu", "Совместные поездки на автомобиле", "Спільні поїздки автомобілем"],
        .changes: ["Nachträge", "Change orders", "Zlecenia dodatkowe", "Papildomi užsakymai", "Дополнительные заказы", "Додаткові замовлення"],
        .defects: ["Mängel und Nacharbeit", "Defects and rework", "Usterki i poprawki", "Defektai ir taisymas", "Дефекты и доработка", "Дефекти й доопрацювання"],
        .files: ["Fotos und Dateien", "Photos and files", "Zdjęcia i pliki", "Nuotraukos ir failai", "Фото и файлы", "Фото й файли"],
        .goodsReceipts: ["Wareneingänge", "Goods receipts", "Przyjęcia towaru", "Prekių priėmimas", "Приёмка товаров", "Приймання товарів"],
        .knowledge: ["Wissensbasis", "Knowledge base", "Baza wiedzy", "Žinių bazė", "База знаний", "База знань"],
        .payouts: ["Auszahlungen", "Payouts", "Wypłaty", "Išmokos", "Выплаты", "Виплати"],
        .payroll: ["Lohnberechnungen", "Pay calculations", "Naliczanie wynagrodzeń", "Atlygio skaičiavimai", "Расчёты оплаты", "Розрахунки оплати"],
        .payslips: ["Lohnabrechnungen", "Payslips", "Paski wynagrodzeń", "Atlyginimo lapeliai", "Расчётные листки", "Розрахункові листки"],
        .purchaseOrders: ["Bestellungen", "Purchase orders", "Zamówienia zakupu", "Pirkimo užsakymai", "Заказы поставщикам", "Замовлення постачальникам"],
        .purchaseRequests: ["Bestellanforderungen", "Purchase requests", "Wnioski zakupowe", "Pirkimo užklausos", "Заявки на закупку", "Заявки на закупівлю"],
        .receipts: ["Empfangsbestätigungen", "Payment receipts", "Potwierdzenia odbioru", "Gavimo patvirtinimai", "Подтверждения получения", "Підтвердження отримання"],
        .requestBatches: ["Sammelanforderungen", "Grouped requests", "Zbiorcze zapotrzebowania", "Jungtinės užklausos", "Групповые заявки", "Групові заявки"],
        .stockLocations: ["Lagerorte", "Stock locations", "Lokalizacje magazynowe", "Sandėliavimo vietos", "Места хранения", "Місця зберігання"],
        .stockMovements: ["Lagerbewegungen", "Stock movements", "Ruchy magazynowe", "Atsargų judėjimas", "Движение материалов", "Рух матеріалів"],
        .stockReservations: ["Materialreservierungen", "Stock reservations", "Rezerwacje materiałów", "Medžiagų rezervacijos", "Резервы материалов", "Резерви матеріалів"],
        .suppliers: ["Lieferanten", "Suppliers", "Dostawcy", "Tiekėjai", "Поставщики", "Постачальники"],
        .timesheets: ["Stundenzettel", "Timesheets", "Ewidencja czasu", "Darbo laiko apskaita", "Табели", "Табелі"],
        .trips: ["Dienstfahrten", "Business trips", "Przejazdy służbowe", "Darbo kelionės", "Рабочие поездки", "Робочі поїздки"],
        .worklogs: ["Arbeitsnachweise", "Work logs", "Wykonane prace", "Atlikti darbai", "Выполненные работы", "Виконані роботи"],
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
        .roleHeading: ["Ihr KNABA-Arbeitsbereich", "Your KNABA workspace", "Twoja przestrzeń pracy KNABA", "Jūsų KNABA darbo sritis", "Ваше рабочее пространство KNABA", "Ваш робочий простір KNABA"],
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
        .quotes: ["Angebote", "Quotes", "Oferty", "Pasiūlymai", "Предложения", "Пропозиції"],
        .issues: ["Reklamationen", "Issues", "Zgłoszenia", "Problemos", "Обращения", "Звернення"],
        .publishedReports: ["Veröffentlichte Berichte", "Published reports", "Opublikowane raporty", "Paskelbtos ataskaitos", "Опубликованные отчёты", "Опубліковані звіти"],
        .materials: ["Materialanfragen", "Material requests", "Zapotrzebowanie materiałowe", "Medžiagų užklausos", "Заявки на материалы", "Заявки на матеріали"],
        .startTask: ["Arbeit beginnen", "Start task", "Rozpocznij zadanie", "Pradėti užduotį", "Начать задачу", "Почати завдання"],
        .logWork: ["Ergebnis erfassen", "Record work", "Zapisz wynik pracy", "Įrašyti darbą", "Записать результат", "Записати результат"],
        .submitTask: ["Zur Prüfung einreichen", "Submit for review", "Przekaż do kontroli", "Pateikti patikrai", "Передать на проверку", "Передати на перевірку"],
        .checklist: ["Checkliste", "Checklist", "Lista kontrolna", "Kontrolinis sąrašas", "Чеклист", "Чекліст"],
        .reviewTask: ["Arbeit prüfen", "Review work", "Sprawdź pracę", "Patikrinti darbą", "Проверить работу", "Перевірити роботу"],
        .changePassword: ["Passwort ändern", "Change password", "Zmień hasło", "Keisti slaptažodį", "Изменить пароль", "Змінити пароль"],
        .configureMFA: ["Zwei-Faktor-Schutz", "Two-factor security", "Zabezpieczenie dwuskładnikowe", "Dviejų veiksnių apsauga", "Двухфакторная защита", "Двофакторний захист"],
        .clientPortal: ["Mein Kundenbereich", "My client workspace", "Mój panel klienta", "Mano kliento erdvė", "Мой кабинет клиента", "Мій кабінет клієнта"],
        .accessUpdated: ["Ihre Zugriffsrechte wurden aktualisiert. Laden Sie den Bereich erneut.", "Your access changed. Reload the section.", "Uprawnienia zmieniono. Odśwież sekcję.", "Prieigos teisės pasikeitė. Atnaujinkite skiltį.", "Права изменились. Обновите раздел.", "Права змінилися. Оновіть розділ."],
        .reauthRequired: ["Bitte erneut anmelden. Prüfen Sie bei einem Verbindungsabbruch, ob die Sicherheitsänderung bereits erfolgt ist.", "Sign in again. If the connection was interrupted, verify whether the security change was applied.", "Zaloguj się ponownie. Po utracie połączenia sprawdź, czy zmiana zabezpieczeń została zastosowana.", "Prisijunkite iš naujo. Nutrūkus ryšiui patikrinkite, ar saugos pakeitimas pritaikytas.", "Войдите заново. При обрыве связи проверьте, применилось ли изменение защиты.", "Увійдіть знову. Після обриву зв’язку перевірте, чи застосувалася зміна захисту."],
        .pendingTitle: ["Bestätigung ausstehend", "Awaiting confirmation", "Oczekiwanie na potwierdzenie", "Laukiama patvirtinimo", "Ожидает подтверждения", "Очікує підтвердження"],
        .pendingNotice: ["Eine Aktion ist noch unbestätigt. Wiederholen Sie ausdrücklich dieselbe gespeicherte Aktion; erstellen Sie sie nicht neu. Der Server prüft Ihre aktuellen Rechte.", "An action is unconfirmed. Explicitly retry the original saved action; do not create it again. The server checks your current access.", "Operacja jest niepotwierdzona. Ponów oryginalną zapisaną operację, nie twórz nowej. Serwer sprawdzi bieżące uprawnienia.", "Veiksmas nepatvirtintas. Pakartokite pradinį išsaugotą veiksmą, nekurkite naujo. Serveris tikrina dabartines teises.", "Действие не подтверждено. Повторите исходное сохранённое действие, не создавая новое. Сервер проверит текущие права.", "Дію не підтверджено. Повторіть початкову збережену дію, не створюючи нову. Сервер перевірить поточні права."],
        .errorRecovery: ["Die gesicherte Aktion kann nicht gelesen werden. Neue Änderungen sind gesperrt. Melden Sie sich erneut an; löschen Sie keine App-Daten.", "The protected action could not be read. New changes are blocked. Sign in again; do not delete app data.", "Nie można odczytać zabezpieczonej operacji. Nowe zmiany są zablokowane. Zaloguj się ponownie; nie usuwaj danych aplikacji.", "Apsaugoto veiksmo nuskaityti nepavyko. Nauji pakeitimai užblokuoti. Prisijunkite iš naujo; netrinkite programėlės duomenų.", "Не удалось прочитать защищённое действие. Новые изменения заблокированы. Войдите заново; не удаляйте данные приложения.", "Не вдалося прочитати захищену дію. Нові зміни заблоковані. Увійдіть знову; не видаляйте дані застосунку."],
        .retryOriginal: ["Gespeicherte Aktion wiederholen", "Retry saved action", "Ponów zapisaną operację", "Kartoti išsaugotą veiksmą", "Повторить сохранённое действие", "Повторити збережену дію"],
        .recovered: ["Gespeicherte Aktion vom Server bestätigt", "Saved action confirmed by the server", "Serwer potwierdził zapisaną operację", "Serveris patvirtino išsaugotą veiksmą", "Сервер подтвердил сохранённое действие", "Сервер підтвердив збережену дію"],
        .errorPending: ["Bestätigen Sie zuerst die noch offene Aktion.", "Resolve the pending action first.", "Najpierw rozstrzygnij oczekującą operację.", "Pirmiausia užbaikite laukiantį veiksmą.", "Сначала разрешите ожидающее действие.", "Спочатку з’ясуйте результат попередньої дії."],
        .errorInFlight: ["Die Aktion wird bereits gesendet.", "This action is already being submitted.", "Operacja jest już wysyłana.", "Veiksmas jau siunčiamas.", "Действие уже отправляется.", "Дія вже надсилається."],
        .noPending: ["Keine gespeicherte Aktion vorhanden.", "No saved action is pending.", "Brak oczekującej zapisanej operacji.", "Nėra laukiančio išsaugoto veiksmo.", "Нет ожидающего сохранённого действия.", "Немає збереженої дії для повтору."],
        .errorSensitive: ["Für diesen Sicherheitsvorgang verwenden Sie den geschützten Web-Kontobereich.", "Use the protected web account area for this security operation.", "Wykonaj tę operację w chronionym panelu konta w przeglądarce.", "Šiam saugos veiksmui naudokite apsaugotą internetinę paskyrą.", "Выполните эту операцию в защищённом веб-кабинете.", "Виконайте цю дію в захищеному вебкабінеті."],
        .serverNotice: ["Die freigegebene ERP-Adresse erhalten Sie von KNABA. Website und ERP können getrennte Anmeldungen verwenden.", "Use the ERP address approved by KNABA. Website and ERP may use separate sign-ins.", "Użyj adresu ERP zatwierdzonego przez KNABA. Strona i ERP mogą mieć oddzielne logowanie.", "Naudokite KNABA patvirtintą ERP adresą. Svetainės ir ERP prisijungimai gali skirtis.", "Используйте подтверждённый KNABA адрес ERP. Сайт и ERP могут иметь отдельный вход.", "Використовуйте підтверджену KNABA адресу ERP. Сайт і ERP можуть мати окремий вхід."],
        .search: ["Einträge suchen", "Search records", "Szukaj wpisów", "Ieškoti įrašų", "Поиск записей", "Пошук записів"],
        .choose: ["Auswählen", "Choose", "Wybierz", "Pasirinkti", "Выберите", "Виберіть"],
        .clearValue: ["Wert löschen", "Clear value", "Wyczyść wartość", "Išvalyti reikšmę", "Очистить значение", "Очистити значення"],
        .yes: ["Ja", "Yes", "Tak", "Taip", "Да", "Так"],
        .no: ["Nein", "No", "Nie", "Ne", "Нет", "Ні"],
        .result: ["Serverergebnis", "Server result", "Wynik serwera", "Serverio rezultatas", "Результат сервера", "Результат сервера"],
        .quantityHint: ["Bis zu 3 Nachkommastellen, z. B. 2,5.", "Up to 3 decimal places, for example 2.5.", "Do 3 miejsc po przecinku, np. 2,5.", "Iki 3 skaitmenų po kablelio, pvz., 2,5.", "До 3 знаков после запятой, например 2,5.", "До 3 знаків після коми, наприклад 2,5."],
        .previewLimit: ["Vorschau begrenzt. Öffnen Sie den vollständigen Datensatz im ERP.", "Preview is limited. Open the full record in ERP.", "Podgląd jest ograniczony. Otwórz pełny wpis w ERP.", "Peržiūra ribota. Visą įrašą atidarykite ERP.", "Предпросмотр ограничен. Откройте полную запись в ERP.", "Перегляд обмежений. Відкрийте повний запис в ERP."],
        .quantity: ["Erledigte Menge", "Completed quantity", "Wykonana ilość", "Atliktas kiekis", "Выполненный объём", "Виконаний обсяг"],
        .remainingQuantity: ["Restmenge", "Remaining quantity", "Pozostała ilość", "Likęs kiekis", "Оставшийся объём", "Залишок обсягу"],
        .description: ["Beschreibung", "Description", "Opis", "Aprašymas", "Описание", "Опис"],
        .problems: ["Probleme", "Problems", "Problemy", "Problemos", "Проблемы", "Проблеми"],
        .delayReason: ["Verzögerungsgrund", "Reason for delay", "Powód opóźnienia", "Vėlavimo priežastis", "Причина задержки", "Причина затримки"],
        .currentPassword: ["Aktuelles Passwort", "Current password", "Obecne hasło", "Dabartinis slaptažodis", "Текущий пароль", "Поточний пароль"],
        .newPassword: ["Neues Passwort", "New password", "Nowe hasło", "Naujas slaptažodis", "Новый пароль", "Новий пароль"],
        .errorConflict: ["Der Datensatz wurde geändert. Aktualisieren Sie ihn vor einer neuen Aktion.", "The record changed. Refresh it before a new action.", "Wpis się zmienił. Odśwież go przed nową operacją.", "Įrašas pasikeitė. Prieš naują veiksmą jį atnaujinkite.", "Запись изменилась. Обновите её перед новым действием.", "Запис змінився. Оновіть його перед новою дією."],
        .pendingDetails: ["Gespeicherte Aktion prüfen", "Review saved action", "Sprawdź zapisaną operację", "Peržiūrėti išsaugotą veiksmą", "Проверить сохранённое действие", "Переглянути збережену дію"],
    ]
    static func text(_ key: ERPText, _ language: NativeLanguage, _ arguments: String...) -> String {
        let format = rows[key]![NativeLanguage.allCases.firstIndex(of: language)!]
        return arguments.isEmpty ? format : String(format: format, locale: Locale(identifier: language.rawValue), arguments: arguments.map { $0 as CVarArg })
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
        case .pendingCommand: return text(.errorPending, language)
        case .commandInFlight: return text(.errorInFlight, language)
        case .recoveryUnavailable, .recoveryInvalid: return text(.errorRecovery, language)
        case .noPendingCommand: return text(.noPending, language)
        case .sensitiveCommand: return text(.errorSensitive, language)
        case .http(let status, let code):
            if code == "LOCAL_ERP_REAUTH_REQUIRED" { return ERPFederationStrings.text(.localPassword, language) }
            if code == "VERSION_CONFLICT" { return text(.errorConflict, language) }
            if code == "NEEDS_REAUTH" { return text(.reauthRequired, language) }
            return text(.errorHTTP, language, String(status))
        }
    }
}
