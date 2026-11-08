import XCTest
@testable import KNABADE

final class ERPConsoleTests: XCTestCase {
    func testEveryERPLabelHasSixCompleteTranslationsInTheDisplayOrder() {
        XCTAssertEqual(Set(ERPStrings.rows.keys), Set(ERPText.allCases))
        for key in ERPText.allCases {
            let row = ERPStrings.rows[key]!
            XCTAssertEqual(row.count, NativeLanguage.allCases.count, key.rawValue)
            XCTAssertTrue(row.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }, key.rawValue)
            XCTAssertEqual(Set(row.map { $0.components(separatedBy: "%@").count }).count, 1, key.rawValue)
        }
        XCTAssertEqual(ERPStrings.text(.signIn, .de), "Sicher anmelden")
        XCTAssertEqual(ERPStrings.text(.authorizedCount, .en, "4"), "Authorized records: 4")
        XCTAssertEqual(ERPStrings.text(.authorizedCount, .uk, "4"), "Доступні записи: 4")
    }
    @MainActor func testDashboardRoleLabelsFollowSixLanguagesWithoutChangingAuthority() {
        // Expected visible names are explicit: raw canonical IDs were previously rendered here.
        let roles = ["OWNER", "DIRECTOR", "OPERATIONS_MANAGER", "DISPATCHER", "INTERNAL_BAULEITER", "TEAM_LEADER", "EMPLOYEE", "STOREKEEPER", "PROCUREMENT", "ACCOUNTANT", "CLIENT", "EXTERNAL_BAULEITER", "BOT_ADMIN", "QUALITY_CONTROL", "AUDITOR", "DEVELOPER_SUPPORT", "GUEST", "SERVICE_ACCOUNT"]
        let permissions = ["task.read"]
        let model = ERPConsoleModel()
        model.identity = ERPIdentity(
            actor: ERPActor(userId: "synthetic-user", companyId: "synthetic-company", roles: roles,
                            permissions: permissions, siteIds: [], customerIds: []),
            user: ERPUser(id: "synthetic-user", name: "Synthetic user", email: nil), csrfToken: nil, mode: "TEST")
        let visibleModules = model.modules.map(\.id)
        let expected: [NativeLanguage: [String]] = [
            .de: ["Inhaber", "Geschäftsleitung", "Betriebsleitung", "Disposition", "Interne Bauleitung", "Teamleitung", "Mitarbeiter", "Lagerverwaltung", "Einkauf", "Buchhaltung", "Kunde", "Externe Bauleitung", "Bot-Administration", "Qualitätskontrolle", "Prüfung", "Technischer Support", "Gast", "Dienstkonto"],
            .en: ["Owner", "Director", "Operations manager", "Dispatcher", "Internal site supervisor", "Team leader", "Employee", "Storekeeper", "Procurement", "Accountant", "Client", "External site supervisor", "Bot administrator", "Quality control", "Auditor", "Technical support", "Guest", "Service account"],
            .pl: ["Właściciel", "Dyrektor", "Kierownik operacyjny", "Dyspozytor", "Wewnętrzny kierownik budowy", "Lider zespołu", "Pracownik", "Magazynier", "Zaopatrzenie", "Księgowy", "Klient", "Zewnętrzny kierownik budowy", "Administrator bota", "Kontrola jakości", "Audytor", "Wsparcie techniczne", "Gość", "Konto usługi"],
            .lt: ["Savininkas", "Direktorius", "Veiklos vadovas", "Dispečeris", "Vidaus statybos vadovas", "Komandos vadovas", "Darbuotojas", "Sandėlininkas", "Pirkimai", "Buhalteris", "Klientas", "Išorinis statybos vadovas", "Boto administratorius", "Kokybės kontrolė", "Auditorius", "Techninė pagalba", "Svečias", "Paslaugos paskyra"],
            .ru: ["Владелец", "Директор", "Операционный руководитель", "Диспетчер", "Внутренний руководитель объекта", "Руководитель бригады", "Работник", "Кладовщик", "Снабжение", "Бухгалтер", "Клиент", "Внешний руководитель объекта", "Администратор бота", "Контроль качества", "Аудитор", "Техническая поддержка", "Гость", "Сервисная учётная запись"],
            .uk: ["Власник", "Директор", "Операційний керівник", "Диспетчер", "Внутрішній керівник об’єкта", "Керівник бригади", "Працівник", "Комірник", "Закупівлі", "Бухгалтер", "Клієнт", "Зовнішній керівник об’єкта", "Адміністратор бота", "Контроль якості", "Аудитор", "Технічна підтримка", "Гість", "Службовий обліковий запис"],
        ]
        for language in NativeLanguage.allCases {
            model.language = language
            XCTAssertEqual(model.roleLabel, expected[language]!.joined(separator: " · "), language.rawValue)
            XCTAssertEqual(model.identity?.actor.roles, roles)
            XCTAssertEqual(model.identity?.actor.permissions, permissions)
            XCTAssertEqual(model.modules.map(\.id), visibleModules)
            XCTAssertFalse(model.isOperator, "A translated operations role must not grant an operations permission")
        }
    }
    @MainActor func testDashboardRoleAliasesAndUnknownValuesUseSafeLocalizedLabels() {
        let model = ERPConsoleModel()
        XCTAssertEqual(model.roleLabel, "")
        let roles = ["FOREMAN", "TEAM_LEAD", "WAREHOUSE", "UNTRUSTED_SERVER_ROLE_DETAIL"]
        model.identity = ERPIdentity(
            actor: ERPActor(userId: "synthetic-user", companyId: "synthetic-company", roles: roles,
                            permissions: [], siteIds: [], customerIds: []),
            user: ERPUser(id: "synthetic-user", name: nil, email: nil), csrfToken: nil, mode: "DEMO")
        let expected: [NativeLanguage: [String]] = [
            .de: ["Interne Bauleitung", "Teamleitung", "Lagerverwaltung", "Unbekannte Rolle"],
            .en: ["Internal site supervisor", "Team leader", "Storekeeper", "Unknown role"],
            .pl: ["Wewnętrzny kierownik budowy", "Lider zespołu", "Magazynier", "Nieznana rola"],
            .lt: ["Vidaus statybos vadovas", "Komandos vadovas", "Sandėlininkas", "Nežinomas vaidmuo"],
            .ru: ["Внутренний руководитель объекта", "Руководитель бригады", "Кладовщик", "Неизвестная роль"],
            .uk: ["Внутрішній керівник об’єкта", "Керівник бригади", "Комірник", "Невідома роль"],
        ]
        for language in NativeLanguage.allCases {
            model.language = language
            XCTAssertEqual(model.roleLabel, expected[language]!.joined(separator: " · "), language.rawValue)
            XCTAssertFalse(model.roleLabel.contains("UNTRUSTED_SERVER_ROLE_DETAIL"))
            XCTAssertEqual(ERPStrings.role("", language), expected[language]!.last!)
            XCTAssertEqual(model.identity?.actor.roles, roles)
            XCTAssertEqual(model.identity?.actor.permissions, [])
            XCTAssertTrue(model.modules.isEmpty)
            XCTAssertFalse(model.isOperator)
        }
        model.identity = ERPIdentity(
            actor: ERPActor(userId: "synthetic-user", companyId: "synthetic-company", roles: [],
                            permissions: [], siteIds: [], customerIds: []),
            user: ERPUser(id: "synthetic-user", name: nil, email: nil), csrfToken: nil, mode: "TEST")
        XCTAssertEqual(model.roleLabel, "")
    }
    func testERPErrorLocalizationDoesNotExposeRawServerMessage() {
        let failure = ERPFailure.http(403, "PRIVATE_SERVER_DETAIL")
        for language in NativeLanguage.allCases {
            let rendered = ERPStrings.error(failure, language)
            XCTAssertTrue(rendered.contains("403"))
            XCTAssertFalse(rendered.contains("PRIVATE_SERVER_DETAIL"))
        }
        XCTAssertNotEqual(ERPStrings.error(ERPFailure.expired, .de), ERPStrings.error(ERPFailure.expired, .lt))
    }
    func testPortableServerOriginRejectsUnsafeRedirectAndCredentials() {
        XCTAssertEqual(ERPOrigin.validate("https://new-owner.example")?.absoluteString, "https://new-owner.example")
        XCTAssertEqual(ERPOrigin.validate("https://erp.knaba.de/")?.absoluteString, "https://erp.knaba.de")
        for bad in ["", "http://knaba.de", "https://user:password@knaba.de", "https://knaba.de/path", "https://knaba.de?token=x", "https://knaba.de/#secret", "javascript:alert(1)", "https://knaba.de:8080"] {
            XCTAssertNil(ERPOrigin.validate(bad), bad)
        }
    }
    func testDecodesServerRoleAndEntityWithoutClientPermissionClaims() throws {
        let identity = try JSONDecoder().decode(ERPIdentity.self, from: Data(#"{"actor":{"userId":"u","companyId":"c","roles":["OWNER"],"permissions":["*"]},"user":{"id":"u","name":"Test Owner"},"csrfToken":"xyz","mode":"DEMO"}"#.utf8))
        XCTAssertEqual(identity.actor.companyId, "c")
        XCTAssertEqual(identity.actor.roles, ["OWNER"])
        let page = try JSONDecoder().decode(ERPPage.self, from: Data(#"{"items":[{"id":"t","kind":"task","version":3,"data":{"title":"Site job","state":"ASSIGNED","count":3}}],"has_more":false,"next_cursor":null}"#.utf8))
        XCTAssertEqual(page.items.first?.title, "Site job")
        XCTAssertEqual(page.items.first?.version, 3)
    }
}
