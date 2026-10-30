import Foundation

enum NativeLanguage: String, CaseIterable, Identifiable {
    case de, en, pl, lt, ru, uk
    var id: String { rawValue }
    var name: String { switch self { case .de: return "Deutsch"; case .uk: return "Українська"; case .ru: return "Русский"; case .pl: return "Polski"; case .lt: return "Lietuvių"; case .en: return "English" } }
    static func device(_ preferred: [String] = Locale.preferredLanguages) -> NativeLanguage {
        for value in preferred { if let language = NativeLanguage(rawValue: value.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map({ String($0) }) ?? "") { return language } }
        return .de
    }
    static func selected(_ value: String, preferred: [String] = Locale.preferredLanguages) -> NativeLanguage {
        if value == "system" { return device(preferred) }
        return NativeLanguage(rawValue: value) ?? .de
    }
}

enum NativeText: String, CaseIterable {
    case language, deviceLanguage, status, locationOn, locationOff, queued, synchronize
    case mobileWorkspace, mobileWebsiteHint, mobilePortal, mobileAccount, mobileErp, mobileLoginNotice
    case enrollment, origin, enrollmentCode, enroll, enrollmentNotice, timeWithoutGPS, siteInput
    case startShift, privateBreak, returnToWork, endShift, businessTravel, destinationInput, startTrip, arrive, arrivalNotice
    case locationControl, privacyNotice, enableGPS, backgroundPermission, gpsOff, operatingSystemNotice, reconcile, signOut
    case myShift, site, activity, siteTime, travelTime, breakTime, pendingTime, snapshot, noSummary, provisional, staleSummary, localPending
    case permission, permissionUnknown, permissionWhileUsing, permissionAlways, permissionDenied, position, freshPosition, stalePosition, unknownPosition, serviceTime, waitingTime
    case notEnrolled, enrolled, storageUnavailable, synchronized, syncFailed, actionSaved, actionFailed, siteRequired, noShift, destinationRequired, noTrip, gpsRequested, signedOut, clearFailed
    case permissionRequired, activateFirst, activeUntil, stopped, leaseOnly, simulatedLocation, locationUnknown, serverChecked
    case active, working, travelling, onBreak, pending, off, accessRevoked, leaseExpired, serverGate, invalidOrigin, generalError, deviceChange, queueFull
}

enum NativeStrings {
    // Every row has exactly six reviewed language slots in NativeLanguage order.
    // No fallback to German is used for a supported selected language.
    static let rows: [NativeText: [String]] = [
        .language: ["Sprache", "Language", "Język", "Kalba", "Язык", "Мова"],
        .mobileWorkspace: ["KNABA Arbeitsbereich", "KNABA workspace", "Panel KNABA", "KNABA darbo vieta", "Рабочая система KNABA", "Робочий простір KNABA"],
        .mobileWebsiteHint: ["HTTPS-Adresse der KNABA-Website", "KNABA website HTTPS address", "Adres HTTPS strony KNABA", "KNABA svetainės HTTPS adresas", "HTTPS-адрес сайта KNABA", "HTTPS-адреса сайту KNABA"],
        .mobilePortal: ["KNABA Mobile öffnen", "Open KNABA Mobile", "Otwórz KNABA Mobile", "Atidaryti KNABA Mobile", "Открыть KNABA Mobile", "Відкрити KNABA Mobile"],
        .mobileAccount: ["Mein KnaBa Konto", "My KnaBa account", "Moje konto KnaBa", "Mano KNABA paskyra", "Мой кабинет KNABA", "Мій кабінет KNABA"],
        .mobileErp: ["KNABA ERP öffnen", "Open KNABA ERP", "Otwórz KNABA ERP", "Atidaryti KNABA ERP", "Открыть KNABA ERP", "Відкрити KNABA ERP"],
        .mobileLoginNotice: ["Geben Sie die HTTPS-Website-Adresse ein. Der sichere Browser öffnet die Anmeldung; Berechtigungen vergibt nur der Server.", "Enter the HTTPS website address. The browser handles sign-in; only the server grants roles.", "Podaj adres HTTPS witryny. Bezpieczna przeglądarka otworzy logowanie; role nadaje serwer.", "Įveskite HTTPS svetainės adresą. Saugi naršyklė atvers prisijungimą; teises skiria serveris.", "Введите HTTPS-адрес сайта. Безопасный браузер откроет вход; права назначает только сервер.", "Вкажіть HTTPS-адресу сайту. Захищений браузер відкриє вхід; права призначає лише сервер."],
        .deviceLanguage: ["Gerätesprache", "Device language", "Język urządzenia", "Įrenginio kalba", "Язык устройства", "Мова пристрою"],
        .status: ["Status", "Status", "Stan", "Būsena", "Состояние", "Стан"],
        .locationOn: ["Standort sichtbar aktiv", "Location visibly active", "Lokalizacja widocznie włączona", "Vieta matomai įjungta", "Геолокация явно включена", "Геолокацію явно ввімкнено"],
        .locationOff: ["Standort OFF", "Location OFF", "Lokalizacja OFF", "Vieta OFF", "Геолокация OFF", "Геолокація OFF"],
        .queued: ["Offline gespeichert: %@", "Saved offline: %@", "Zapisano offline: %@", "Išsaugota neprisijungus: %@", "Сохранено офлайн: %@", "Збережено офлайн: %@"],
        .synchronize: ["Status / Offline synchronisieren", "Refresh status / sync offline", "Odśwież stan / synchronizuj offline", "Atnaujinti būseną / sinchronizuoti", "Обновить состояние / синхронизировать офлайн", "Оновити стан / синхронізувати офлайн"],
        .enrollment: ["Gerät einmalig verknüpfen", "Link this device once", "Jednorazowe powiązanie urządzenia", "Vienkartinis įrenginio susiejimas", "Одноразовая привязка устройства", "Одноразове прив’язування пристрою"],
        .origin: ["HTTPS Server-Adresse", "HTTPS server address", "Adres serwera HTTPS", "HTTPS serverio adresas", "HTTPS-адрес сервера", "HTTPS-адреса сервера"],
        .enrollmentCode: ["Einmaliger Code aus dem Webkonto", "One-time code from your web account", "Jednorazowy kod z konta internetowego", "Vienkartinis kodas iš žiniatinklio paskyros", "Одноразовый код из вебкабинета", "Одноразовий код із вебкабінету"],
        .enroll: ["Gerät verknüpfen", "Link device", "Powiąż urządzenie", "Susieti įrenginį", "Привязать устройство", "Прив’язати пристрій"],
        .enrollmentNotice: ["Der Code bindet dieses Gerät an Ihren Beschäftigtenzugang. Eine neue Verknüpfung widerruft das alte Gerät. GPS startet dadurch nicht.", "The code binds this device to your employee account. Linking a new device revokes the old one. It does not start GPS.", "Kod wiąże urządzenie z kontem pracownika. Nowe powiązanie unieważnia stare urządzenie. Nie uruchamia GPS.", "Kodas susieja įrenginį su jūsų darbuotojo paskyra. Naujas susiejimas atšaukia seną įrenginį. GPS neįjungiamas.", "Код привязывает устройство к вашей учётной записи сотрудника. Новая привязка отзывает прежнее устройство. GPS при этом не включается.", "Код прив’язує пристрій до вашого облікового запису працівника. Нове прив’язування відкликає попередній пристрій. GPS від цього не вмикається."],
        .timeWithoutGPS: ["Arbeitszeit ohne GPS", "Work time without GPS", "Czas pracy bez GPS", "Darbo laikas be GPS", "Рабочее время без GPS", "Робочий час без GPS"],
        .siteInput: ["Zugewiesene Objekt-ID", "Assigned site ID", "ID przypisanego obiektu", "Priskirto objekto ID", "ID назначенного объекта", "ID призначеного об’єкта"],
        .startShift: ["Schicht START", "Shift START", "Zmiana START", "Pamaina START", "Смена START", "Зміна START"],
        .privateBreak: ["Private Pause / Mittag", "Private break / lunch", "Przerwa prywatna / obiad", "Privati pertrauka / pietūs", "Личный перерыв / обед", "Приватна перерва / обід"],
        .returnToWork: ["Zurück zur Arbeit", "Return to work", "Wróć do pracy", "Grįžti į darbą", "Вернуться к работе", "Повернутися до роботи"],
        .endShift: ["Schicht END", "Shift END", "Zmiana END", "Pamaina END", "Смена END", "Зміна END"],
        .businessTravel: ["Dienstfahrt", "Business travel", "Przejazd służbowy", "Darbinė kelionė", "Служебная поездка", "Службова поїздка"],
        .destinationInput: ["Genehmigte Ziel-Objekt-ID", "Approved destination site ID", "ID zatwierdzonego obiektu docelowego", "Patvirtinto paskirties objekto ID", "ID согласованного объекта назначения", "ID погодженого об’єкта призначення"],
        .startTrip: ["Dienstfahrt starten", "Start business travel", "Rozpocznij przejazd służbowy", "Pradėti darbinę kelionę", "Начать служебную поездку", "Почати службову поїздку"],
        .arrive: ["Ankunft bestätigen und Arbeit beginnen", "Confirm arrival and start work", "Potwierdź przyjazd i rozpocznij pracę", "Patvirtinti atvykimą ir pradėti darbą", "Подтвердить прибытие и начать работу", "Підтвердити прибуття й почати роботу"],
        .arrivalNotice: ["Ankunft erfolgt ausdrücklich. GPS-Eintritt beginnt keine Schicht und beendet keine private Pause.", "Arrival needs explicit confirmation. GPS entry does not start a shift or end a private break.", "Przyjazd wymaga potwierdzenia. Wejście GPS nie rozpoczyna zmiany ani nie kończy prywatnej przerwy.", "Atvykimas patvirtinamas aiškiai. GPS įėjimas nepradeda pamainos ir neužbaigia privačios pertraukos.", "Прибытие подтверждается явно. GPS-вход не начинает смену и не завершает личный перерыв.", "Прибуття підтверджується явно. GPS-вхід не починає зміну й не завершує приватну перерву."],
        .locationControl: ["Standort bewusst steuern", "Control location explicitly", "Świadoma kontrola lokalizacji", "Sąmoningas vietos valdymas", "Осознанное управление геолокацией", "Свідоме керування геолокацією"],
        .privacyNotice: ["GPS benötigt Ihre Aktivierung und eine genehmigte Server-Richtlinie. Am Objekt werden nur Abstand und Qualität übertragen, kein genauer Verlauf. Genaue Punkte nur für ausdrücklich erlaubte Dienstfahrten. Pausen und Schichtende stoppen lokal sofort.", "GPS requires your activation and an approved server policy. At the site only distance and quality are sent, not an exact route. Exact points are only for explicitly permitted business trips. Breaks and shift end stop collection locally at once.", "GPS wymaga Twojego włączenia i zatwierdzonej polityki serwera. Na obiekcie przesyłane są tylko odległość i jakość, bez dokładnej trasy. Dokładne punkty tylko dla wyraźnie dozwolonych przejazdów służbowych. Przerwa i koniec zmiany natychmiast zatrzymują zbieranie lokalnie.", "GPS reikia jūsų įjungimo ir patvirtintos serverio politikos. Objekte siunčiami tik atstumas ir kokybė, be tikslaus maršruto. Tikslūs taškai tik aiškiai leistoms darbinėms kelionėms. Pertrauka ir pamainos pabaiga iškart sustabdo rinkimą įrenginyje.", "GPS требует вашего включения и согласованной серверной политики. На объекте передаются только расстояние и качество, без точного маршрута. Точные точки — только для явно разрешённых служебных поездок. Перерыв и конец смены немедленно останавливают сбор локально.", "GPS потребує вашого ввімкнення й погодженої серверної політики. На об’єкті передаються лише відстань і якість, без точного маршруту. Точні точки — лише для явно дозволених службових поїздок. Перерва й кінець зміни негайно зупиняють збір локально."],
        .enableGPS: ["GPS ausdrücklich aktivieren", "Explicitly enable GPS", "Wyraźnie włącz GPS", "Aiškiai įjungti GPS", "Явно включить GPS", "Явно ввімкнути GPS"],
        .backgroundPermission: ["Erfassung im Hintergrund erlauben", "Allow background collection", "Zezwól na zbieranie w tle", "Leisti rinkimą fone", "Разрешить сбор в фоне", "Дозволити збір у фоні"],
        .gpsOff: ["GPS OFF", "GPS OFF", "GPS OFF", "GPS OFF", "GPS OFF", "GPS OFF"],
        .operatingSystemNotice: ["iOS kann Erfassung durch Berechtigungen, Akku, Force-Stop oder Neustart begrenzen. Fehlende Position ist unbekannt und keine Abwesenheit.", "iOS may limit collection because of permissions, battery, force-stop or restart. A missing position means unknown, not employee absence.", "iOS może ograniczyć zbieranie przez uprawnienia, baterię, wymuszone zamknięcie lub restart. Brak pozycji oznacza brak danych, nie nieobecność.", "iOS gali riboti rinkimą dėl leidimų, akumuliatoriaus, priverstinio uždarymo ar perkrovimo. Trūkstama vieta yra nežinoma, o ne darbuotojo nebuvimas.", "iOS может ограничить сбор из-за разрешений, батареи, принудительной остановки или перезапуска. Отсутствие позиции означает неизвестность, а не отсутствие сотрудника.", "iOS може обмежити збір через дозволи, батарею, примусову зупинку або перезапуск. Відсутня позиція означає невідомість, а не відсутність працівника."],
        .reconcile: ["Zur Klärung", "Needs review", "Do wyjaśnienia", "Reikia paaiškinti", "Требует уточнения", "Потребує уточнення"],
        .signOut: ["Abmelden / lokale Daten löschen", "Sign out / clear local data", "Wyloguj / usuń dane lokalne", "Atsijungti / pašalinti vietinius duomenis", "Выйти / удалить локальные данные", "Вийти / видалити локальні дані"],
        .myShift: ["Meine Schicht", "My shift", "Moja zmiana", "Mano pamaina", "Моя смена", "Моя зміна"],
        .site: ["Objekt", "Site", "Obiekt", "Objektas", "Объект", "Об’єкт"],
        .activity: ["Aktivität", "Activity", "Aktywność", "Veikla", "Деятельность", "Діяльність"],
        .siteTime: ["Objektzeit", "Site time", "Czas na obiekcie", "Laikas objekte", "Время на объекте", "Час на об’єкті"],
        .travelTime: ["Fahrtzeit", "Travel time", "Czas przejazdu", "Kelionės laikas", "Время поездок", "Час поїздок"],
        .breakTime: ["Pausenzeit", "Break time", "Czas przerw", "Pertraukų laikas", "Время перерывов", "Час перерв"],
        .pendingTime: ["Ungeklärte Zeit", "Unresolved time", "Czas niewyjaśniony", "Neišaiškintas laikas", "Неразобранное время", "Нерозібраний час"],
        .snapshot: ["Serverstand: %@", "Server snapshot: %@", "Stan serwera: %@", "Serverio būsena: %@", "Состояние сервера: %@", "Стан сервера: %@"],
        .noSummary: ["Keine bestätigte Schichtübersicht verfügbar. Synchronisieren Sie; fehlende Daten sind keine Nullzeit.", "No confirmed shift summary is available. Sync; missing data does not mean zero time.", "Brak potwierdzonego podsumowania zmiany. Synchronizuj; brak danych nie oznacza zerowego czasu.", "Patvirtintos pamainos suvestinės nėra. Sinchronizuokite; trūkstami duomenys nereiškia nulinio laiko.", "Подтверждённый итог смены недоступен. Синхронизируйте; отсутствие данных не означает нулевое время.", "Підтверджений підсумок зміни недоступний. Синхронізуйте; відсутні дані не означають нульовий час."],
        .provisional: ["Nur Anzeige seit dem Serverstand; keine Lohnberechnung. Lokale Aktionen bleiben bis Bestätigung unbestätigt.", "Display since the server snapshot only; not payroll. Local actions remain unconfirmed until the server responds.", "Wyświetlanie od ostatniego stanu serwera; nie naliczanie płac. Działania lokalne są niepotwierdzone do odpowiedzi serwera.", "Tik rodoma nuo serverio suvestinės; tai ne atlyginimo skaičiavimas. Vietiniai veiksmai nepatvirtinti iki serverio atsakymo.", "Только отображение от последнего состояния сервера; не расчёт зарплаты. Локальные действия не подтверждены до ответа сервера.", "Лише показ від останнього стану сервера; не розрахунок зарплати. Локальні дії не підтверджені до відповіді сервера."],
        .staleSummary: ["Veralteter Serverstand — Anzeige läuft nicht weiter. Synchronisieren.", "Stale server snapshot — display time is frozen. Sync again.", "Nieaktualny stan serwera — wyświetlany czas zatrzymany. Synchronizuj.", "Pasenusi serverio būsena — laiko rodymas sustabdytas. Sinchronizuokite.", "Устаревшее состояние сервера — показ времени остановлен. Синхронизируйте.", "Застарілий стан сервера — показ часу зупинено. Синхронізуйте."],
        .localPending: ["Lokale Aktion wartet auf Bestätigung; Timer bleibt am Serverstand.", "A local action awaits confirmation; the timer stays at the server snapshot.", "Działanie lokalne czeka na potwierdzenie; licznik pokazuje stan serwera.", "Vietinis veiksmas laukia patvirtinimo; laikmatis rodo serverio būseną.", "Локальное действие ждёт подтверждения; таймер показывает состояние сервера.", "Локальна дія очікує підтвердження; таймер показує стан сервера."],
        .permission: ["Standortberechtigung", "Location permission", "Uprawnienie lokalizacji", "Vietos leidimas", "Разрешение геолокации", "Дозвіл геолокації"],
        .permissionUnknown: ["Noch nicht angefragt", "Not requested yet", "Jeszcze nie zapytano", "Dar neprašyta", "Ещё не запрошено", "Ще не запитано"],
        .permissionWhileUsing: ["Nur bei Nutzung", "While using the app only", "Tylko podczas używania", "Tik naudojant", "Только при использовании", "Лише під час використання"],
        .permissionAlways: ["Im Hintergrund erlaubt", "Background permitted", "Dozwolone w tle", "Leidžiama fone", "Разрешено в фоне", "Дозволено у фоні"],
        .permissionDenied: ["Verweigert oder eingeschränkt — manueller Ablauf bleibt verfügbar", "Denied or restricted — manual time remains available", "Odmowa lub ograniczenie — ręczna ewidencja dostępna", "Atmesta arba apribota — rankinė apskaita veikia", "Отказано или ограничено — ручной учёт доступен", "Відмовлено або обмежено — ручний облік доступний"],
        .position: ["Lokale Positionsqualität", "Local position quality", "Jakość pozycji lokalnej", "Vietinės padėties kokybė", "Качество локальной позиции", "Якість локальної позиції"],
        .freshPosition: ["Frisch · %@", "Fresh · %@", "Aktualna · %@", "Nauja · %@", "Свежая · %@", "Свіжа · %@"],
        .stalePosition: ["Veraltet; keine Abwesenheit ableiten", "Stale; do not infer absence", "Nieaktualna; nie oznacza nieobecności", "Pasenusi; nereiškia nebuvimo", "Устарела; не означает отсутствия", "Застаріла; не означає відсутності"],
        .unknownPosition: ["Unbekannt; keine Abwesenheit ableiten", "Unknown; do not infer absence", "Nieznana; nie oznacza nieobecności", "Nežinoma; nereiškia nebuvimo", "Неизвестна; не означает отсутствия", "Невідома; не означає відсутності"],
        .serviceTime: ["Servicezeit", "Service task time", "Czas zadań służbowych", "Tarnybinių užduočių laikas", "Время служебных задач", "Час службових задач"],
        .waitingTime: ["Arbeitsbereitschaft", "Work waiting time", "Czas oczekiwania w pracy", "Laukimo darbe laikas", "Время рабочего ожидания", "Час робочого очікування"],
        .notEnrolled: ["Gerät verknüpfen. GPS bleibt OFF.", "Link device. GPS stays OFF.", "Powiąż urządzenie. GPS pozostaje OFF.", "Susiekite įrenginį. GPS lieka OFF.", "Привяжите устройство. GPS остаётся OFF.", "Прив’яжіть пристрій. GPS залишається OFF."],
        .enrolled: ["Gerät verknüpft · GPS OFF", "Device linked · GPS OFF", "Urządzenie powiązane · GPS OFF", "Įrenginys susietas · GPS OFF", "Устройство привязано · GPS OFF", "Пристрій прив’язано · GPS OFF"],
        .storageUnavailable: ["Geschützter Speicher nicht verfügbar", "Protected storage is unavailable", "Pamięć chroniona niedostępna", "Apsaugota saugykla neprieinama", "Защищённое хранилище недоступно", "Захищене сховище недоступне"],
        .synchronized: ["%@ · %@ synchronisiert", "%@ · %@ synced", "%@ · zsynchronizowano %@", "%@ · sinchronizuota %@", "%@ · синхронизировано %@", "%@ · синхронізовано %@"],
        .syncFailed: ["Nicht synchronisiert. Gespeicherte Aktionen bleiben prüfbar; manueller Ablauf bleibt verfügbar.", "Not synced. Saved actions remain reviewable; manual time remains available.", "Nie zsynchronizowano. Zapisane działania można sprawdzić; ewidencja ręczna dostępna.", "Nesinchronizuota. Išsaugotus veiksmus galima peržiūrėti; rankinė apskaita veikia.", "Не синхронизировано. Сохранённые действия можно проверить; ручной учёт доступен.", "Не синхронізовано. Збережені дії можна перевірити; ручний облік доступний."],
        .actionSaved: ["Aktion sicher gespeichert · Synchronisierung folgt", "Action safely saved · awaiting sync", "Działanie bezpiecznie zapisane · oczekuje synchronizacji", "Veiksmas saugiai išsaugotas · laukia sinchronizavimo", "Действие безопасно сохранено · ждёт синхронизации", "Дію безпечно збережено · очікує синхронізації"],
        .actionFailed: ["Aktion nicht gespeichert", "Action was not saved", "Działanie nie zostało zapisane", "Veiksmas neišsaugotas", "Действие не сохранено", "Дію не збережено"],
        .siteRequired: ["Zugewiesene Objekt-ID erforderlich", "Assigned site ID required", "Wymagane ID przypisanego obiektu", "Reikia priskirto objekto ID", "Нужен ID назначенного объекта", "Потрібен ID призначеного об’єкта"],
        .noShift: ["Keine aktive bestätigte Schicht", "No active confirmed shift", "Brak aktywnej potwierdzonej zmiany", "Nėra aktyvios patvirtintos pamainos", "Нет активной подтверждённой смены", "Немає активної підтвердженої зміни"],
        .destinationRequired: ["Schicht und genehmigte Ziel-Objekt-ID erforderlich", "Shift and approved destination site ID required", "Wymagane zmiana i ID zatwierdzonego celu", "Reikia pamainos ir patvirtinto paskirties objekto ID", "Нужны смена и ID согласованного объекта назначения", "Потрібні зміна й ID погодженого об’єкта призначення"],
        .noTrip: ["Keine aktive Fahrt. Fahrtbeginn zuerst synchronisieren.", "No active trip. Sync its start first.", "Brak aktywnego przejazdu. Najpierw zsynchronizuj początek.", "Nėra aktyvios kelionės. Pirma sinchronizuokite pradžią.", "Нет активной поездки. Сначала синхронизируйте её начало.", "Немає активної поїздки. Спочатку синхронізуйте її початок."],
        .gpsRequested: ["Standorterfassung ausdrücklich angefordert", "Location collection explicitly requested", "Wyraźnie zażądano lokalizacji", "Vietos rinkimas aiškiai paprašytas", "Сбор геолокации явно запрошен", "Збір геолокації явно запитано"],
        .signedOut: ["Abgemeldet · lokale Daten gelöscht · GPS OFF", "Signed out · local data cleared · GPS OFF", "Wylogowano · dane lokalne usunięte · GPS OFF", "Atsijungta · vietiniai duomenys pašalinti · GPS OFF", "Выход выполнен · локальные данные удалены · GPS OFF", "Вихід виконано · локальні дані видалено · GPS OFF"],
        .clearFailed: ["Lokale Löschung fehlgeschlagen", "Local clearing failed", "Usuwanie lokalne nie powiodło się", "Vietinis šalinimas nepavyko", "Локальное удаление не удалось", "Локальне видалення не вдалося"],
        .permissionRequired: ["Standortfreigabe erforderlich", "Location permission required", "Wymagane uprawnienie lokalizacji", "Reikia vietos leidimo", "Нужно разрешение геолокации", "Потрібен дозвіл геолокації"],
        .activateFirst: ["Zuerst eine freigegebene Erfassung sichtbar aktivieren", "First visibly activate approved collection", "Najpierw widocznie włącz dozwolone zbieranie", "Pirma matomai įjunkite leistą rinkimą", "Сначала явно включите разрешённый сбор", "Спочатку явно ввімкніть дозволений збір"],
        .activeUntil: ["%@ · sichtbar aktiv bis %@", "%@ · visibly active until %@", "%@ · widocznie aktywne do %@", "%@ · matomai aktyvu iki %@", "%@ · явно активно до %@", "%@ · явно активно до %@"],
        .stopped: ["OFF · %@", "OFF · %@", "OFF · %@", "OFF · %@", "OFF · %@", "OFF · %@"],
        .leaseOnly: ["Offline · Erfassung nur bis zum bestehenden Ablauf", "Offline · collection only until the existing lease expires", "Offline · zbieranie tylko do bieżącego terminu", "Neprisijungus · rinkimas tik iki galiojančio termino", "Офлайн · сбор только до окончания действующего разрешения", "Офлайн · збір лише до завершення чинного дозволу"],
        .simulatedLocation: ["Unsichere Position · simulierte Quelle nicht automatisch verwendet", "Uncertain location · simulated source not used automatically", "Niepewna pozycja · źródło symulowane nie jest używane automatycznie", "Neaiški padėtis · imituotas šaltinis automatiškai nenaudojamas", "Ненадёжная позиция · имитированный источник автоматически не используется", "Непевна позиція · імітоване джерело автоматично не використовується"],
        .locationUnknown: ["Position unbekannt · manueller Zeitablauf bleibt verfügbar", "Location unknown · manual time remains available", "Pozycja nieznana · ręczna ewidencja czasu dostępna", "Vieta nežinoma · rankinė laiko apskaita veikia", "Позиция неизвестна · ручной учёт времени доступен", "Позиція невідома · ручний облік часу доступний"],
        .serverChecked: ["Serverstatus geprüft", "Server status checked", "Stan serwera sprawdzony", "Serverio būsena patikrinta", "Состояние сервера проверено", "Стан сервера перевірено"],
        .active: ["Aktiv", "Active", "Aktywna", "Aktyvi", "Активна", "Активна"],
        .working: ["Arbeit", "Working", "Praca", "Darbas", "Работа", "Робота"],
        .travelling: ["Dienstfahrt", "Business travel", "Przejazd służbowy", "Darbinė kelionė", "Служебная поездка", "Службова поїздка"],
        .onBreak: ["Private Pause · GPS OFF", "Private break · GPS OFF", "Przerwa prywatna · GPS OFF", "Privati pertrauka · GPS OFF", "Личный перерыв · GPS OFF", "Приватна перерва · GPS OFF"],
        .pending: ["Ungeklärt — Zeit bleibt erhalten", "Unresolved — time is retained", "Niewyjaśnione — czas zachowany", "Neišaiškinta — laikas išsaugotas", "Не разобрано — время сохранено", "Нерозібрано — час збережено"],
        .off: ["Erfassung gestoppt", "Collection stopped", "Zbieranie zatrzymane", "Rinkimas sustabdytas", "Сбор остановлен", "Збір зупинено"],
        .accessRevoked: ["Zugang entzogen — neu anmelden", "Access revoked — sign in again", "Dostęp cofnięty — zaloguj ponownie", "Prieiga atšaukta — prisijunkite iš naujo", "Доступ отозван — войдите снова", "Доступ відкликано — увійдіть знову"],
        .leaseExpired: ["Serverfreigabe abgelaufen — erneut prüfen", "Server permission expired — check again", "Zgoda serwera wygasła — sprawdź ponownie", "Serverio leidimas baigėsi — patikrinkite vėl", "Серверное разрешение истекло — проверьте снова", "Серверний дозвіл минув — перевірте знову"],
        .serverGate: ["GPS nicht freigegeben; manueller Ablauf bleibt verfügbar", "GPS is not approved; manual time remains available", "GPS niedozwolony; ręczna ewidencja dostępna", "GPS neleidžiamas; rankinė apskaita veikia", "GPS не разрешён; ручной учёт доступен", "GPS не дозволено; ручний облік доступний"],
        .invalidOrigin: ["Gültige HTTPS-Adresse ohne Zugangsdaten erforderlich", "Valid HTTPS address without credentials required", "Wymagany prawidłowy adres HTTPS bez danych logowania", "Reikia galiojančio HTTPS adreso be prisijungimo duomenų", "Нужен действующий HTTPS-адрес без учётных данных", "Потрібна чинна HTTPS-адреса без облікових даних"],
        .generalError: ["Aktion fehlgeschlagen. Prüfen und erneut versuchen.", "Action failed. Check and try again.", "Działanie nie powiodło się. Sprawdź i spróbuj ponownie.", "Veiksmas nepavyko. Patikrinkite ir bandykite vėl.", "Действие не удалось. Проверьте и повторите.", "Дія не вдалася. Перевірте й спробуйте знову."],
        .deviceChange: ["Vor Geräte- oder Serverwechsel synchronisieren und abmelden", "Sync and sign out before changing device or server", "Przed zmianą urządzenia lub serwera synchronizuj i wyloguj", "Prieš keisdami įrenginį ar serverį sinchronizuokite ir atsijunkite", "Перед сменой устройства или сервера синхронизируйте и выйдите", "Перед зміною пристрою або сервера синхронізуйте й вийдіть"],
        .queueFull: ["Offline-Speicher voll oder nicht verfügbar; synchronisieren", "Offline storage is full or unavailable; sync", "Pamięć offline pełna lub niedostępna; synchronizuj", "Neprisijungus saugykla pilna arba neprieinama; sinchronizuokite", "Офлайн-хранилище полное или недоступно; синхронизируйте", "Офлайн-сховище повне або недоступне; синхронізуйте"],
    ]
    static func text(_ key: NativeText, _ language: NativeLanguage, _ arguments: String...) -> String {
        let index = NativeLanguage.allCases.firstIndex(of: language)!
        let format = rows[key]![index]
        return arguments.isEmpty ? format : String(format: format, locale: Locale(identifier: language.rawValue), arguments: arguments.map { $0 as CVarArg })
    }
    static func code(_ code: String?, _ language: NativeLanguage) -> String {
        let key: NativeText
        switch code ?? "" {
        case "ACTIVE": key = .active
        case "WORKING", "SERVICE_TASK", "WAITING_WORK", "SITE_PRESENCE": key = .working
        case "TRAVELLING", "BUSINESS_TRAVEL": key = .travelling
        case "ON_BREAK", "PRIVATE_BREAK": key = .onBreak
        case "AWAY_PENDING_REASON": key = .pending
        case "OFF", "USER_STOPPED", "SIGNED_OUT", "SHIFT_ENDED", "PRIVATE_OR_OFF_DUTY", "MANUAL_RETURN_REQUIRES_NEW_ACTIVATION", "MODE_CHANGE_REQUIRES_NEW_ACTIVATION", "ARRIVAL_REQUIRES_NEW_ACTIVATION": key = .off
        case "ACCESS_REVOKED", "ACCESS_DENIED", "NEEDS_REAUTH", "DEVICE_REVOKED": key = .accessRevoked
        case "SESSION_EXPIRED", "TRACKING_LEASE_EXPIRED", "SESSION_CHANGED", "INVALID_OR_FOREIGN_SESSION": key = .leaseExpired
        case "PERMISSION_DENIED", "LOCATION_PERMISSION_DENIED_MANUAL_TIME_AVAILABLE": key = .permissionDenied
        case "GPS_LEGAL_GATE_CLOSED", "GPS_NOT_AUTHORIZED", "SERVER_OFF", "GEOFENCE_NOT_CONFIGURED", "INCOMPLETE_SESSION": key = .serverGate
        case "NO_ACTIVE_SHIFT": key = .noShift
        case "HTTPS_ORIGIN_REQUIRED", "INVALID_API_URL": key = .invalidOrigin
        case "DEVICE_NOT_ENROLLED": key = .notEnrolled
        case "SYNC_QUEUE_BEFORE_ENROLLMENT", "SYNC_OR_RECONCILE_QUEUE_BEFORE_DEVICE_CHANGE", "SIGN_OUT_BEFORE_ORIGIN_CHANGE": key = .deviceChange
        case "OFFLINE_QUEUE_FULL", "OFFLINE_QUEUE_FULL_OR_STORAGE_UNAVAILABLE", "QUEUE_TOO_LARGE": key = .queueFull
        case "KEYCHAIN_UNAVAILABLE", "KEYCHAIN_WRITE_FAILED", "INVALID_QUEUE_KEY", "ENCRYPTION_FAILED": key = .storageUnavailable
        case "": key = .serverChecked
        default: key = .generalError
        }
        return text(key, language)
    }
    static func command(_ name: String, _ language: NativeLanguage) -> String {
        let key: NativeText
        switch name {
        case "shift.start": key = .startShift
        case "shift.end": key = .endShift
        case "shift.activity": key = .activity
        case "trip.start": key = .startTrip
        case "trip.arrive": key = .arrive
        case "trip.stop": key = .privateBreak
        case "trip.resume": key = .returnToWork
        case "presence.ingest", "trip.sample": key = .position
        default: key = .reconcile
        }
        return text(key, language)
    }
}
