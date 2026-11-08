import Foundation

enum ERPFederationText: String, CaseIterable {
    case title, intro, preserve, website, begin, openBrowser, retryStart, checkSession, browser, checking, cancel, connected, scope
    case unavailable, invalid, expired, changed, presentation, startUnknown, sessionUnknown, restart, failed, localPassword
}
enum ERPFederationStrings {
    // DE / EN / PL / LT / RU / UK, matching NativeLanguage.allCases.
    static let rows: [ERPFederationText: [String]] = [
        .title: ["Website-Anmeldung · TEST", "Website sign-in · TEST", "Logowanie przez stronę · TEST", "Prisijungimas per svetainę · TEST", "Вход через сайт · TEST", "Вхід через сайт · TEST"],
        .intro: ["Öffnen Sie die freigegebene KNABA-Website im Systembrowser. Prüfen und bestätigen Sie dort das verknüpfte ERP-Konto.", "Open the configured KNABA website in the system browser. Review and confirm the linked ERP account there.", "Otwórz skonfigurowaną stronę KNABA w przeglądarce systemowej. Sprawdź i potwierdź tam połączone konto ERP.", "Atverkite sukonfigūruotą KNABA svetainę sistemos naršyklėje. Ten patikrinkite ir patvirtinkite susietą ERP paskyrą.", "Откройте настроенный сайт KNABA в системном браузере. Проверьте и подтвердите там связанный аккаунт ERP.", "Відкрийте налаштований сайт KNABA в системному браузері. Перевірте й підтвердьте там пов’язаний обліковий запис ERP."],
        .preserve: ["Ihr aktuelles App-Konto bleibt bis zum vollständig geprüften Wechsel aktiv.", "Your current app account stays active until the new session is fully verified.", "Obecne konto aplikacji pozostaje aktywne do pełnego sprawdzenia nowej sesji.", "Dabartinė programėlės paskyra lieka aktyvi, kol nauja sesija bus visiškai patikrinta.", "Текущий аккаунт приложения останется активным до полной проверки новой сессии.", "Поточний обліковий запис застосунку залишиться активним до повної перевірки нової сесії."],
        .website: ["Website", "Website", "Strona", "Svetainė", "Сайт", "Сайт"],
        .begin: ["Mit der Website anmelden", "Sign in with the website", "Zaloguj przez stronę", "Prisijungti per svetainę", "Войти через сайт", "Увійти через сайт"],
        .openBrowser: ["Im Systembrowser fortfahren", "Continue in the system browser", "Kontynuuj w przeglądarce systemowej", "Tęsti sistemos naršyklėje", "Продолжить в системном браузере", "Продовжити в системному браузері"],
        .retryStart: ["Denselben Start prüfen", "Retry the same start", "Ponów ten sam początek", "Pakartoti tą pačią pradžią", "Повторить тот же запуск", "Повторити той самий початок"],
        .checkSession: ["Nur die neue Sitzung prüfen", "Check only the new session", "Sprawdź tylko nową sesję", "Patikrinti tik naują sesiją", "Проверить только новую сессию", "Перевірити лише нову сесію"],
        .browser: ["Bestätigung im Systembrowser erwartet…", "Waiting for confirmation in the system browser…", "Oczekiwanie na potwierdzenie w przeglądarce systemowej…", "Laukiama patvirtinimo sistemos naršyklėje…", "Ожидание подтверждения в системном браузере…", "Очікування підтвердження в системному браузері…"],
        .checking: ["Anmeldung wird geprüft…", "Verifying sign-in…", "Sprawdzanie logowania…", "Tikrinamas prisijungimas…", "Проверка входа…", "Перевірка входу…"],
        .cancel: ["Anmeldung abbrechen", "Cancel sign-in", "Anuluj logowanie", "Atšaukti prisijungimą", "Отменить вход", "Скасувати вхід"],
        .connected: ["Die neue ERP-Sitzung wurde geprüft und übernommen.", "The new ERP session was verified and adopted.", "Nowa sesja ERP została sprawdzona i przyjęta.", "Nauja ERP sesija patikrinta ir pritaikyta.", "Новая сессия ERP проверена и принята.", "Нову сесію ERP перевірено й прийнято."],
        .scope: ["Nur TEST. Dieser Eingang aktiviert weder GPS noch Geräteberechtigungen. Der getrennte ERP-Passwortzugang bleibt verfügbar.", "TEST only. This sign-in grants no GPS or device permission. The separate ERP password sign-in remains available.", "Tylko TEST. To logowanie nie nadaje uprawnień GPS ani urządzenia. Oddzielne logowanie hasłem ERP pozostaje dostępne.", "Tik TEST. Šis prisijungimas nesuteikia GPS ar įrenginio leidimų. Atskiras ERP prisijungimas slaptažodžiu lieka prieinamas.", "Только TEST. Этот вход не даёт разрешений GPS или устройства. Отдельный вход с паролем ERP остаётся доступным.", "Лише TEST. Цей вхід не надає дозволів GPS чи пристрою. Окремий вхід із паролем ERP залишається доступним."],
        .unavailable: ["Diese TEST-Anmeldung ist für den gewählten Server nicht freigegeben.", "This TEST sign-in is not enabled for the selected server.", "To logowanie TEST nie jest włączone dla wybranego serwera.", "Šis TEST prisijungimas neįjungtas pasirinktam serveriui.", "Этот TEST-вход не включён для выбранного сервера.", "Цей TEST-вхід не ввімкнено для вибраного сервера."],
        .invalid: ["Die Antwort konnte nicht sicher zugeordnet werden. Starten Sie die Anmeldung neu.", "The response could not be safely matched. Start sign-in again.", "Nie udało się bezpiecznie dopasować odpowiedzi. Rozpocznij logowanie ponownie.", "Atsakymo nepavyko saugiai susieti. Pradėkite prisijungimą iš naujo.", "Не удалось безопасно сопоставить ответ. Начните вход заново.", "Не вдалося безпечно зіставити відповідь. Почніть вхід заново."],
        .expired: ["Dieser Anmeldeversuch ist abgelaufen. Ihr bisheriges Konto wurde nicht ersetzt.", "This sign-in attempt expired. Your previous account was not replaced.", "Ta próba logowania wygasła. Poprzednie konto nie zostało zastąpione.", "Šis prisijungimo bandymas baigėsi. Ankstesnė paskyra nepakeista.", "Срок попытки входа истёк. Прежний аккаунт не заменён.", "Строк спроби входу сплив. Попередній обліковий запис не замінено."],
        .changed: ["Konto, Server oder Berechtigungen haben sich geändert. Beginnen Sie einen neuen Versuch.", "The account, server or permissions changed. Begin a new attempt.", "Konto, serwer lub uprawnienia uległy zmianie. Rozpocznij nową próbę.", "Pasikeitė paskyra, serveris ar leidimai. Pradėkite naują bandymą.", "Аккаунт, сервер или права изменились. Начните новую попытку.", "Обліковий запис, сервер або права змінилися. Почніть нову спробу."],
        .presentation: ["Der Systembrowser konnte in diesem Fenster nicht gestartet werden. Versuchen Sie es erneut.", "The system browser could not start in this window. Try again.", "Nie można uruchomić przeglądarki systemowej w tym oknie. Spróbuj ponownie.", "Šiame lange nepavyko paleisti sistemos naršyklės. Bandykite dar kartą.", "Не удалось открыть системный браузер в этом окне. Повторите попытку.", "Не вдалося відкрити системний браузер у цьому вікні. Спробуйте знову."],
        .startUnknown: ["Der Start ist unbestätigt. Sie können nur denselben Versuch erneut anfragen oder abbrechen.", "The start is unconfirmed. You may retry only this same attempt or cancel.", "Początek nie został potwierdzony. Możesz ponowić tylko tę samą próbę albo anulować.", "Pradžia nepatvirtinta. Galite pakartoti tik tą patį bandymą arba atšaukti.", "Запуск не подтверждён. Можно повторить только ту же попытку или отменить её.", "Початок не підтверджено. Можна повторити лише ту саму спробу або скасувати її."],
        .sessionUnknown: ["Die neue Sitzung ist noch nicht bestätigt. Eine Prüfung verwendet nur den neuen Sitzungskandidaten; der Code wird nicht erneut gesendet.", "The new session is unconfirmed. A check uses only the new session candidate; the code is not sent again.", "Nowa sesja nie jest potwierdzona. Sprawdzenie użyje tylko nowego kandydata sesji; kod nie zostanie wysłany ponownie.", "Nauja sesija nepatvirtinta. Tikrinama tik nauja galima sesija; kodas pakartotinai nesiunčiamas.", "Новая сессия не подтверждена. Проверяется только новый кандидат сессии; код не отправляется повторно.", "Нову сесію не підтверджено. Перевіряється лише новий кандидат сесії; код повторно не надсилається."],
        .restart: ["Keine neue Sitzung wurde sicher bestätigt. Starten Sie die Anmeldung neu; Ihr bisheriges Konto bleibt erhalten.", "No new session was safely confirmed. Restart sign-in; your previous account is preserved.", "Nie potwierdzono bezpiecznie nowej sesji. Rozpocznij logowanie ponownie; poprzednie konto zostaje zachowane.", "Nauja sesija nebuvo saugiai patvirtinta. Prisijunkite iš naujo; ankstesnė paskyra išsaugota.", "Новая сессия не подтверждена безопасно. Начните вход заново; прежний аккаунт сохранён.", "Нову сесію не підтверджено безпечно. Почніть вхід заново; попередній обліковий запис збережено."],
        .failed: ["Die Anmeldung wurde nicht abgeschlossen. Ihr bisheriges Konto bleibt erhalten.", "Sign-in did not complete. Your previous account is preserved.", "Logowanie nie zostało zakończone. Poprzednie konto zostaje zachowane.", "Prisijungimas nebaigtas. Ankstesnė paskyra išsaugota.", "Вход не завершён. Прежний аккаунт сохранён.", "Вхід не завершено. Попередній обліковий запис збережено."],
        .localPassword: ["Diese Aktion erfordert den getrennten lokalen ERP-Passwortzugang. Die Website-Anmeldung erteilt keine Gerätefreigabe.", "This action requires the separate local ERP password sign-in. Website sign-in does not authorize a device.", "Ta czynność wymaga oddzielnego lokalnego logowania hasłem ERP. Logowanie przez stronę nie autoryzuje urządzenia.", "Šiam veiksmui reikia atskiro vietinio ERP prisijungimo slaptažodžiu. Svetainės prisijungimas nesuteikia įrenginio leidimo.", "Для этого действия нужен отдельный локальный вход с паролем ERP. Вход через сайт не разрешает устройство.", "Для цієї дії потрібен окремий локальний вхід із паролем ERP. Вхід через сайт не дозволяє пристрій."]
    ]
    static func text(_ key: ERPFederationText, _ language: NativeLanguage) -> String {
        rows[key]![NativeLanguage.allCases.firstIndex(of: language)!]
    }
    static func errorKey(_ error: Error) -> ERPFederationText {
        if let failure = error as? ERPFederationFailure {
            switch failure {
            case .disabled: return .unavailable
            case .invalidResponse, .invalidCallback: return .invalid
            case .expired: return .expired
            case .changed: return .changed
            case .presentation: return .presentation
            case .startUnknown: return .startUnknown
            case .sessionUnknown: return .sessionUnknown
            case .restartRequired: return .restart
            case .cancelled: return .failed
            }
        }
        if error as? ERPFailure == .accessChanged { return .changed }
        return .failed
    }
}
