import Foundation

enum NativeLanguage: String, CaseIterable, Identifiable {
    case de, uk, ru, pl, lt, en
    var id: String { rawValue }
    var name: String { switch self { case .de: return "Deutsch"; case .uk: return "Українська"; case .ru: return "Русский"; case .pl: return "Polski"; case .lt: return "Lietuvių"; case .en: return "English" } }
    static func device(_ preferred: [String] = Locale.preferredLanguages) -> NativeLanguage {
        for value in preferred { if let language = NativeLanguage(rawValue: value.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map({ String($0) }) ?? "") { return language } }
        return .de
    }
    static func selected(_ value: String, preferred: [String] = Locale.preferredLanguages) -> NativeLanguage { NativeLanguage(rawValue: value) ?? device(preferred) }
}

enum NativeText: String, CaseIterable {
    case language, deviceLanguage, status, locationOn, locationOff, queued, synchronize
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
        .language: ["Sprache", "Мова", "Язык", "Język", "Kalba", "Language"],
        .deviceLanguage: ["Gerätesprache", "Мова пристрою", "Язык устройства", "Język urządzenia", "Įrenginio kalba", "Device language"],
        .status: ["Status", "Стан", "Состояние", "Stan", "Būsena", "Status"],
        .locationOn: ["Standort sichtbar aktiv", "Геолокацію явно ввімкнено", "Геолокация явно включена", "Lokalizacja widocznie włączona", "Vieta matomai įjungta", "Location visibly active"],
        .locationOff: ["Standort OFF", "Геолокація OFF", "Геолокация OFF", "Lokalizacja OFF", "Vieta OFF", "Location OFF"],
        .queued: ["Offline gespeichert: %@", "Збережено офлайн: %@", "Сохранено офлайн: %@", "Zapisano offline: %@", "Išsaugota neprisijungus: %@", "Saved offline: %@"],
        .synchronize: ["Status / Offline synchronisieren", "Оновити стан / синхронізувати офлайн", "Обновить состояние / синхронизировать офлайн", "Odśwież stan / synchronizuj offline", "Atnaujinti būseną / sinchronizuoti", "Refresh status / sync offline"],
        .enrollment: ["Gerät einmalig verknüpfen", "Одноразове прив’язування пристрою", "Одноразовая привязка устройства", "Jednorazowe powiązanie urządzenia", "Vienkartinis įrenginio susiejimas", "Link this device once"],
        .origin: ["HTTPS Server-Adresse", "HTTPS-адреса сервера", "HTTPS-адрес сервера", "Adres serwera HTTPS", "HTTPS serverio adresas", "HTTPS server address"],
        .enrollmentCode: ["Einmaliger Code aus dem Webkonto", "Одноразовий код із вебкабінету", "Одноразовый код из вебкабинета", "Jednorazowy kod z konta internetowego", "Vienkartinis kodas iš žiniatinklio paskyros", "One-time code from your web account"],
        .enroll: ["Gerät verknüpfen", "Прив’язати пристрій", "Привязать устройство", "Powiąż urządzenie", "Susieti įrenginį", "Link device"],
        .enrollmentNotice: ["Der Code bindet dieses Gerät an Ihren Beschäftigtenzugang. Eine neue Verknüpfung widerruft das alte Gerät. GPS startet dadurch nicht.", "Код прив’язує пристрій до вашого облікового запису працівника. Нове прив’язування відкликає попередній пристрій. GPS від цього не вмикається.", "Код привязывает устройство к вашей учётной записи сотрудника. Новая привязка отзывает прежнее устройство. GPS при этом не включается.", "Kod wiąże urządzenie z kontem pracownika. Nowe powiązanie unieważnia stare urządzenie. Nie uruchamia GPS.", "Kodas susieja įrenginį su jūsų darbuotojo paskyra. Naujas susiejimas atšaukia seną įrenginį. GPS neįjungiamas.", "The code binds this device to your employee account. Linking a new device revokes the old one. It does not start GPS."],
        .timeWithoutGPS: ["Arbeitszeit ohne GPS", "Робочий час без GPS", "Рабочее время без GPS", "Czas pracy bez GPS", "Darbo laikas be GPS", "Work time without GPS"],
        .siteInput: ["Zugewiesene Objekt-ID", "ID призначеного об’єкта", "ID назначенного объекта", "ID przypisanego obiektu", "Priskirto objekto ID", "Assigned site ID"],
        .startShift: ["Schicht START", "Зміна START", "Смена START", "Zmiana START", "Pamaina START", "Shift START"],
        .privateBreak: ["Private Pause / Mittag", "Приватна перерва / обід", "Личный перерыв / обед", "Przerwa prywatna / obiad", "Privati pertrauka / pietūs", "Private break / lunch"],
        .returnToWork: ["Zurück zur Arbeit", "Повернутися до роботи", "Вернуться к работе", "Wróć do pracy", "Grįžti į darbą", "Return to work"],
        .endShift: ["Schicht END", "Зміна END", "Смена END", "Zmiana END", "Pamaina END", "Shift END"],
        .businessTravel: ["Dienstfahrt", "Службова поїздка", "Служебная поездка", "Przejazd służbowy", "Darbinė kelionė", "Business travel"],
        .destinationInput: ["Genehmigte Ziel-Objekt-ID", "ID погодженого об’єкта призначення", "ID согласованного объекта назначения", "ID zatwierdzonego obiektu docelowego", "Patvirtinto paskirties objekto ID", "Approved destination site ID"],
        .startTrip: ["Dienstfahrt starten", "Почати службову поїздку", "Начать служебную поездку", "Rozpocznij przejazd służbowy", "Pradėti darbinę kelionę", "Start business travel"],
        .arrive: ["Ankunft bestätigen und Arbeit beginnen", "Підтвердити прибуття й почати роботу", "Подтвердить прибытие и начать работу", "Potwierdź przyjazd i rozpocznij pracę", "Patvirtinti atvykimą ir pradėti darbą", "Confirm arrival and start work"],
        .arrivalNotice: ["Ankunft erfolgt ausdrücklich. GPS-Eintritt beginnt keine Schicht und beendet keine private Pause.", "Прибуття підтверджується явно. GPS-вхід не починає зміну й не завершує приватну перерву.", "Прибытие подтверждается явно. GPS-вход не начинает смену и не завершает личный перерыв.", "Przyjazd wymaga potwierdzenia. Wejście GPS nie rozpoczyna zmiany ani nie kończy prywatnej przerwy.", "Atvykimas patvirtinamas aiškiai. GPS įėjimas nepradeda pamainos ir neužbaigia privačios pertraukos.", "Arrival needs explicit confirmation. GPS entry does not start a shift or end a private break."],
        .locationControl: ["Standort bewusst steuern", "Свідоме керування геолокацією", "Осознанное управление геолокацией", "Świadoma kontrola lokalizacji", "Sąmoningas vietos valdymas", "Control location explicitly"],
        .privacyNotice: ["GPS benötigt Ihre Aktivierung und eine genehmigte Server-Richtlinie. Am Objekt werden nur Abstand und Qualität übertragen, kein genauer Verlauf. Genaue Punkte nur für ausdrücklich erlaubte Dienstfahrten. Pausen und Schichtende stoppen lokal sofort.", "GPS потребує вашого ввімкнення й погодженої серверної політики. На об’єкті передаються лише відстань і якість, без точного маршруту. Точні точки — лише для явно дозволених службових поїздок. Перерва й кінець зміни негайно зупиняють збір локально.", "GPS требует вашего включения и согласованной серверной политики. На объекте передаются только расстояние и качество, без точного маршрута. Точные точки — только для явно разрешённых служебных поездок. Перерыв и конец смены немедленно останавливают сбор локально.", "GPS wymaga Twojego włączenia i zatwierdzonej polityki serwera. Na obiekcie przesyłane są tylko odległość i jakość, bez dokładnej trasy. Dokładne punkty tylko dla wyraźnie dozwolonych przejazdów służbowych. Przerwa i koniec zmiany natychmiast zatrzymują zbieranie lokalnie.", "GPS reikia jūsų įjungimo ir patvirtintos serverio politikos. Objekte siunčiami tik atstumas ir kokybė, be tikslaus maršruto. Tikslūs taškai tik aiškiai leistoms darbinėms kelionėms. Pertrauka ir pamainos pabaiga iškart sustabdo rinkimą įrenginyje.", "GPS requires your activation and an approved server policy. At the site only distance and quality are sent, not an exact route. Exact points are only for explicitly permitted business trips. Breaks and shift end stop collection locally at once."],
        .enableGPS: ["GPS ausdrücklich aktivieren", "Явно ввімкнути GPS", "Явно включить GPS", "Wyraźnie włącz GPS", "Aiškiai įjungti GPS", "Explicitly enable GPS"],
        .backgroundPermission: ["Erfassung im Hintergrund erlauben", "Дозволити збір у фоні", "Разрешить сбор в фоне", "Zezwól na zbieranie w tle", "Leisti rinkimą fone", "Allow background collection"],
        .gpsOff: ["GPS OFF", "GPS OFF", "GPS OFF", "GPS OFF", "GPS OFF", "GPS OFF"],
        .operatingSystemNotice: ["iOS kann Erfassung durch Berechtigungen, Akku, Force-Stop oder Neustart begrenzen. Fehlende Position ist unbekannt und keine Abwesenheit.", "iOS може обмежити збір через дозволи, батарею, примусову зупинку або перезапуск. Відсутня позиція означає невідомість, а не відсутність працівника.", "iOS может ограничить сбор из-за разрешений, батареи, принудительной остановки или перезапуска. Отсутствие позиции означает неизвестность, а не отсутствие сотрудника.", "iOS może ograniczyć zbieranie przez uprawnienia, baterię, wymuszone zamknięcie lub restart. Brak pozycji oznacza brak danych, nie nieobecność.", "iOS gali riboti rinkimą dėl leidimų, akumuliatoriaus, priverstinio uždarymo ar perkrovimo. Trūkstama vieta yra nežinoma, o ne darbuotojo nebuvimas.", "iOS may limit collection because of permissions, battery, force-stop or restart. A missing position means unknown, not employee absence."],
        .reconcile: ["Zur Klärung", "Потребує уточнення", "Требует уточнения", "Do wyjaśnienia", "Reikia paaiškinti", "Needs review"],
        .signOut: ["Abmelden / lokale Daten löschen", "Вийти / видалити локальні дані", "Выйти / удалить локальные данные", "Wyloguj / usuń dane lokalne", "Atsijungti / pašalinti vietinius duomenis", "Sign out / clear local data"],
        .myShift: ["Meine Schicht", "Моя зміна", "Моя смена", "Moja zmiana", "Mano pamaina", "My shift"],
        .site: ["Objekt", "Об’єкт", "Объект", "Obiekt", "Objektas", "Site"],
        .activity: ["Aktivität", "Діяльність", "Деятельность", "Aktywność", "Veikla", "Activity"],
        .siteTime: ["Objektzeit", "Час на об’єкті", "Время на объекте", "Czas na obiekcie", "Laikas objekte", "Site time"],
        .travelTime: ["Fahrtzeit", "Час поїздок", "Время поездок", "Czas przejazdu", "Kelionės laikas", "Travel time"],
        .breakTime: ["Pausenzeit", "Час перерв", "Время перерывов", "Czas przerw", "Pertraukų laikas", "Break time"],
        .pendingTime: ["Ungeklärte Zeit", "Нерозібраний час", "Неразобранное время", "Czas niewyjaśniony", "Neišaiškintas laikas", "Unresolved time"],
        .snapshot: ["Serverstand: %@", "Стан сервера: %@", "Состояние сервера: %@", "Stan serwera: %@", "Serverio būsena: %@", "Server snapshot: %@"],
        .noSummary: ["Keine bestätigte Schichtübersicht verfügbar. Synchronisieren Sie; fehlende Daten sind keine Nullzeit.", "Підтверджений підсумок зміни недоступний. Синхронізуйте; відсутні дані не означають нульовий час.", "Подтверждённый итог смены недоступен. Синхронизируйте; отсутствие данных не означает нулевое время.", "Brak potwierdzonego podsumowania zmiany. Synchronizuj; brak danych nie oznacza zerowego czasu.", "Patvirtintos pamainos suvestinės nėra. Sinchronizuokite; trūkstami duomenys nereiškia nulinio laiko.", "No confirmed shift summary is available. Sync; missing data does not mean zero time."],
        .provisional: ["Nur Anzeige seit dem Serverstand; keine Lohnberechnung. Lokale Aktionen bleiben bis Bestätigung unbestätigt.", "Лише показ від останнього стану сервера; не розрахунок зарплати. Локальні дії не підтверджені до відповіді сервера.", "Только отображение от последнего состояния сервера; не расчёт зарплаты. Локальные действия не подтверждены до ответа сервера.", "Wyświetlanie od ostatniego stanu serwera; nie naliczanie płac. Działania lokalne są niepotwierdzone do odpowiedzi serwera.", "Tik rodoma nuo serverio suvestinės; tai ne atlyginimo skaičiavimas. Vietiniai veiksmai nepatvirtinti iki serverio atsakymo.", "Display since the server snapshot only; not payroll. Local actions remain unconfirmed until the server responds."],
        .staleSummary: ["Veralteter Serverstand — Anzeige läuft nicht weiter. Synchronisieren.", "Застарілий стан сервера — показ часу зупинено. Синхронізуйте.", "Устаревшее состояние сервера — показ времени остановлен. Синхронизируйте.", "Nieaktualny stan serwera — wyświetlany czas zatrzymany. Synchronizuj.", "Pasenusi serverio būsena — laiko rodymas sustabdytas. Sinchronizuokite.", "Stale server snapshot — display time is frozen. Sync again."],
        .localPending: ["Lokale Aktion wartet auf Bestätigung; Timer bleibt am Serverstand.", "Локальна дія очікує підтвердження; таймер показує стан сервера.", "Локальное действие ждёт подтверждения; таймер показывает состояние сервера.", "Działanie lokalne czeka na potwierdzenie; licznik pokazuje stan serwera.", "Vietinis veiksmas laukia patvirtinimo; laikmatis rodo serverio būseną.", "A local action awaits confirmation; the timer stays at the server snapshot."],
        .permission: ["Standortberechtigung", "Дозвіл геолокації", "Разрешение геолокации", "Uprawnienie lokalizacji", "Vietos leidimas", "Location permission"],
        .permissionUnknown: ["Noch nicht angefragt", "Ще не запитано", "Ещё не запрошено", "Jeszcze nie zapytano", "Dar neprašyta", "Not requested yet"],
        .permissionWhileUsing: ["Nur bei Nutzung", "Лише під час використання", "Только при использовании", "Tylko podczas używania", "Tik naudojant", "While using the app only"],
        .permissionAlways: ["Im Hintergrund erlaubt", "Дозволено у фоні", "Разрешено в фоне", "Dozwolone w tle", "Leidžiama fone", "Background permitted"],
        .permissionDenied: ["Verweigert oder eingeschränkt — manueller Ablauf bleibt verfügbar", "Відмовлено або обмежено — ручний облік доступний", "Отказано или ограничено — ручной учёт доступен", "Odmowa lub ograniczenie — ręczna ewidencja dostępna", "Atmesta arba apribota — rankinė apskaita veikia", "Denied or restricted — manual time remains available"],
        .position: ["Lokale Positionsqualität", "Якість локальної позиції", "Качество локальной позиции", "Jakość pozycji lokalnej", "Vietinės padėties kokybė", "Local position quality"],
        .freshPosition: ["Frisch · %@", "Свіжа · %@", "Свежая · %@", "Aktualna · %@", "Nauja · %@", "Fresh · %@"],
        .stalePosition: ["Veraltet; keine Abwesenheit ableiten", "Застаріла; не означає відсутності", "Устарела; не означает отсутствия", "Nieaktualna; nie oznacza nieobecności", "Pasenusi; nereiškia nebuvimo", "Stale; do not infer absence"],
        .unknownPosition: ["Unbekannt; keine Abwesenheit ableiten", "Невідома; не означає відсутності", "Неизвестна; не означает отсутствия", "Nieznana; nie oznacza nieobecności", "Nežinoma; nereiškia nebuvimo", "Unknown; do not infer absence"],
        .serviceTime: ["Servicezeit", "Час службових задач", "Время служебных задач", "Czas zadań służbowych", "Tarnybinių užduočių laikas", "Service task time"],
        .waitingTime: ["Arbeitsbereitschaft", "Час робочого очікування", "Время рабочего ожидания", "Czas oczekiwania w pracy", "Laukimo darbe laikas", "Work waiting time"],
        .notEnrolled: ["Gerät verknüpfen. GPS bleibt OFF.", "Прив’яжіть пристрій. GPS залишається OFF.", "Привяжите устройство. GPS остаётся OFF.", "Powiąż urządzenie. GPS pozostaje OFF.", "Susiekite įrenginį. GPS lieka OFF.", "Link device. GPS stays OFF."],
        .enrolled: ["Gerät verknüpft · GPS OFF", "Пристрій прив’язано · GPS OFF", "Устройство привязано · GPS OFF", "Urządzenie powiązane · GPS OFF", "Įrenginys susietas · GPS OFF", "Device linked · GPS OFF"],
        .storageUnavailable: ["Geschützter Speicher nicht verfügbar", "Захищене сховище недоступне", "Защищённое хранилище недоступно", "Pamięć chroniona niedostępna", "Apsaugota saugykla neprieinama", "Protected storage is unavailable"],
        .synchronized: ["%@ · %@ synchronisiert", "%@ · синхронізовано %@", "%@ · синхронизировано %@", "%@ · zsynchronizowano %@", "%@ · sinchronizuota %@", "%@ · %@ synced"],
        .syncFailed: ["Nicht synchronisiert. Gespeicherte Aktionen bleiben prüfbar; manueller Ablauf bleibt verfügbar.", "Не синхронізовано. Збережені дії можна перевірити; ручний облік доступний.", "Не синхронизировано. Сохранённые действия можно проверить; ручной учёт доступен.", "Nie zsynchronizowano. Zapisane działania można sprawdzić; ewidencja ręczna dostępna.", "Nesinchronizuota. Išsaugotus veiksmus galima peržiūrėti; rankinė apskaita veikia.", "Not synced. Saved actions remain reviewable; manual time remains available."],
        .actionSaved: ["Aktion sicher gespeichert · Synchronisierung folgt", "Дію безпечно збережено · очікує синхронізації", "Действие безопасно сохранено · ждёт синхронизации", "Działanie bezpiecznie zapisane · oczekuje synchronizacji", "Veiksmas saugiai išsaugotas · laukia sinchronizavimo", "Action safely saved · awaiting sync"],
        .actionFailed: ["Aktion nicht gespeichert", "Дію не збережено", "Действие не сохранено", "Działanie nie zostało zapisane", "Veiksmas neišsaugotas", "Action was not saved"],
        .siteRequired: ["Zugewiesene Objekt-ID erforderlich", "Потрібен ID призначеного об’єкта", "Нужен ID назначенного объекта", "Wymagane ID przypisanego obiektu", "Reikia priskirto objekto ID", "Assigned site ID required"],
        .noShift: ["Keine aktive bestätigte Schicht", "Немає активної підтвердженої зміни", "Нет активной подтверждённой смены", "Brak aktywnej potwierdzonej zmiany", "Nėra aktyvios patvirtintos pamainos", "No active confirmed shift"],
        .destinationRequired: ["Schicht und genehmigte Ziel-Objekt-ID erforderlich", "Потрібні зміна й ID погодженого об’єкта призначення", "Нужны смена и ID согласованного объекта назначения", "Wymagane zmiana i ID zatwierdzonego celu", "Reikia pamainos ir patvirtinto paskirties objekto ID", "Shift and approved destination site ID required"],
        .noTrip: ["Keine aktive Fahrt. Fahrtbeginn zuerst synchronisieren.", "Немає активної поїздки. Спочатку синхронізуйте її початок.", "Нет активной поездки. Сначала синхронизируйте её начало.", "Brak aktywnego przejazdu. Najpierw zsynchronizuj początek.", "Nėra aktyvios kelionės. Pirma sinchronizuokite pradžią.", "No active trip. Sync its start first."],
        .gpsRequested: ["Standorterfassung ausdrücklich angefordert", "Збір геолокації явно запитано", "Сбор геолокации явно запрошен", "Wyraźnie zażądano lokalizacji", "Vietos rinkimas aiškiai paprašytas", "Location collection explicitly requested"],
        .signedOut: ["Abgemeldet · lokale Daten gelöscht · GPS OFF", "Вихід виконано · локальні дані видалено · GPS OFF", "Выход выполнен · локальные данные удалены · GPS OFF", "Wylogowano · dane lokalne usunięte · GPS OFF", "Atsijungta · vietiniai duomenys pašalinti · GPS OFF", "Signed out · local data cleared · GPS OFF"],
        .clearFailed: ["Lokale Löschung fehlgeschlagen", "Локальне видалення не вдалося", "Локальное удаление не удалось", "Usuwanie lokalne nie powiodło się", "Vietinis šalinimas nepavyko", "Local clearing failed"],
        .permissionRequired: ["Standortfreigabe erforderlich", "Потрібен дозвіл геолокації", "Нужно разрешение геолокации", "Wymagane uprawnienie lokalizacji", "Reikia vietos leidimo", "Location permission required"],
        .activateFirst: ["Zuerst eine freigegebene Erfassung sichtbar aktivieren", "Спочатку явно ввімкніть дозволений збір", "Сначала явно включите разрешённый сбор", "Najpierw widocznie włącz dozwolone zbieranie", "Pirma matomai įjunkite leistą rinkimą", "First visibly activate approved collection"],
        .activeUntil: ["%@ · sichtbar aktiv bis %@", "%@ · явно активно до %@", "%@ · явно активно до %@", "%@ · widocznie aktywne do %@", "%@ · matomai aktyvu iki %@", "%@ · visibly active until %@"],
        .stopped: ["OFF · %@", "OFF · %@", "OFF · %@", "OFF · %@", "OFF · %@", "OFF · %@"],
        .leaseOnly: ["Offline · Erfassung nur bis zum bestehenden Ablauf", "Офлайн · збір лише до завершення чинного дозволу", "Офлайн · сбор только до окончания действующего разрешения", "Offline · zbieranie tylko do bieżącego terminu", "Neprisijungus · rinkimas tik iki galiojančio termino", "Offline · collection only until the existing lease expires"],
        .simulatedLocation: ["Unsichere Position · simulierte Quelle nicht automatisch verwendet", "Непевна позиція · імітоване джерело автоматично не використовується", "Ненадёжная позиция · имитированный источник автоматически не используется", "Niepewna pozycja · źródło symulowane nie jest używane automatycznie", "Neaiški padėtis · imituotas šaltinis automatiškai nenaudojamas", "Uncertain location · simulated source not used automatically"],
        .locationUnknown: ["Position unbekannt · manueller Zeitablauf bleibt verfügbar", "Позиція невідома · ручний облік часу доступний", "Позиция неизвестна · ручной учёт времени доступен", "Pozycja nieznana · ręczna ewidencja czasu dostępna", "Vieta nežinoma · rankinė laiko apskaita veikia", "Location unknown · manual time remains available"],
        .serverChecked: ["Serverstatus geprüft", "Стан сервера перевірено", "Состояние сервера проверено", "Stan serwera sprawdzony", "Serverio būsena patikrinta", "Server status checked"],
        .active: ["Aktiv", "Активна", "Активна", "Aktywna", "Aktyvi", "Active"],
        .working: ["Arbeit", "Робота", "Работа", "Praca", "Darbas", "Working"],
        .travelling: ["Dienstfahrt", "Службова поїздка", "Служебная поездка", "Przejazd służbowy", "Darbinė kelionė", "Business travel"],
        .onBreak: ["Private Pause · GPS OFF", "Приватна перерва · GPS OFF", "Личный перерыв · GPS OFF", "Przerwa prywatna · GPS OFF", "Privati pertrauka · GPS OFF", "Private break · GPS OFF"],
        .pending: ["Ungeklärt — Zeit bleibt erhalten", "Нерозібрано — час збережено", "Не разобрано — время сохранено", "Niewyjaśnione — czas zachowany", "Neišaiškinta — laikas išsaugotas", "Unresolved — time is retained"],
        .off: ["Erfassung gestoppt", "Збір зупинено", "Сбор остановлен", "Zbieranie zatrzymane", "Rinkimas sustabdytas", "Collection stopped"],
        .accessRevoked: ["Zugang entzogen — neu anmelden", "Доступ відкликано — увійдіть знову", "Доступ отозван — войдите снова", "Dostęp cofnięty — zaloguj ponownie", "Prieiga atšaukta — prisijunkite iš naujo", "Access revoked — sign in again"],
        .leaseExpired: ["Serverfreigabe abgelaufen — erneut prüfen", "Серверний дозвіл минув — перевірте знову", "Серверное разрешение истекло — проверьте снова", "Zgoda serwera wygasła — sprawdź ponownie", "Serverio leidimas baigėsi — patikrinkite vėl", "Server permission expired — check again"],
        .serverGate: ["GPS nicht freigegeben; manueller Ablauf bleibt verfügbar", "GPS не дозволено; ручний облік доступний", "GPS не разрешён; ручной учёт доступен", "GPS niedozwolony; ręczna ewidencja dostępna", "GPS neleidžiamas; rankinė apskaita veikia", "GPS is not approved; manual time remains available"],
        .invalidOrigin: ["Gültige HTTPS-Adresse ohne Zugangsdaten erforderlich", "Потрібна чинна HTTPS-адреса без облікових даних", "Нужен действующий HTTPS-адрес без учётных данных", "Wymagany prawidłowy adres HTTPS bez danych logowania", "Reikia galiojančio HTTPS adreso be prisijungimo duomenų", "Valid HTTPS address without credentials required"],
        .generalError: ["Aktion fehlgeschlagen. Prüfen und erneut versuchen.", "Дія не вдалася. Перевірте й спробуйте знову.", "Действие не удалось. Проверьте и повторите.", "Działanie nie powiodło się. Sprawdź i spróbuj ponownie.", "Veiksmas nepavyko. Patikrinkite ir bandykite vėl.", "Action failed. Check and try again."],
        .deviceChange: ["Vor Geräte- oder Serverwechsel synchronisieren und abmelden", "Перед зміною пристрою або сервера синхронізуйте й вийдіть", "Перед сменой устройства или сервера синхронизируйте и выйдите", "Przed zmianą urządzenia lub serwera synchronizuj i wyloguj", "Prieš keisdami įrenginį ar serverį sinchronizuokite ir atsijunkite", "Sync and sign out before changing device or server"],
        .queueFull: ["Offline-Speicher voll oder nicht verfügbar; synchronisieren", "Офлайн-сховище повне або недоступне; синхронізуйте", "Офлайн-хранилище полное или недоступно; синхронизируйте", "Pamięć offline pełna lub niedostępna; synchronizuj", "Neprisijungus saugykla pilna arba neprieinama; sinchronizuokite", "Offline storage is full or unavailable; sync"],
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
