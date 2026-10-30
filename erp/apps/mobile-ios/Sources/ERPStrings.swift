import Foundation

/// Six explicit translations in DE, EN, PL, LT, RU, UK order; server identifiers stay canonical.
enum ERPText: String, CaseIterable {
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
}

enum ERPStrings {
    static let rows: [ERPText: [String]] = [
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
        .roleHeading: ["Inhaber · Team · Kunde · Partner", "Owner · Team · Client · Partner", "Właściciel · Zespół · Klient · Partner", "Savininkas · Komanda · Klientas · Partneris", "Владелец · Команда · Клиент · Партнёр", "Власник · Команда · Клієнт · Партнер"],
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
        case .http(let status, _): return text(.errorHTTP, language, String(status))
        }
    }
}
