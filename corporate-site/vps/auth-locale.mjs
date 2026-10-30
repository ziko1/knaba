// Shared, server-rendered labels for KNABA account entry points.
// These are presentation strings; authorization always comes from a verified session / invitation.
const labels = Object.freeze({
  de: {
    language: 'Sprache', signIn:'Anmelden',
    signInTitle:'KnaBa · sicher anmelden',
    signInIntro:'Ein Zugang für Kunden, Mitarbeitende, Partner, Bauleiter und berechtigte Verwaltung. Zugriffsrechte werden serverseitig geprüft.',
    invalid:'Anmeldung fehlgeschlagen. Prüfen Sie E-Mail und Passwort. Neue Benutzer benötigen eine persönliche Einladung.',
    email:'E-Mail', password:'Passwort', inviteLink:'Konto mit Einladung erstellen',
    inviteHelp:'Noch keine Einladung?', contact:'KNABA kontaktieren', website:'Zur Website',
    registrationTitle:'KnaBa · Registrierung',
    registrationIntro:'Kunden, Partner, Bauleiter und Mitarbeitende registrieren sich mit einer persönlichen Einladung. Die angeforderte Rolle wird anhand der Einladung erkannt und nach Prüfung durch den Inhaber freigegeben.',
    tokenNote:'Ohne eine gültige persönliche Einladung ist keine Kontoaktivierung möglich.',
    name:'Vollständiger Name', invitedEmail:'E-Mail (wie in der Einladung)',
    newPassword:'Passwort (8–256 Zeichen)', confirm:'Passwort bestätigen',
    privacyBefore:'Ich habe die', privacyLink:'Datenschutzhinweise',
    privacyAfter:'gelesen und stimme der Verarbeitung meiner Registrierungsdaten zu.',
    register:'Konto erstellen', backLogin:'Bereits registriert? Anmelden'
  },
  pl: {
    language:'Język',signIn:'Zaloguj się',signInTitle:'KnaBa · bezpieczne logowanie',
    signInIntro:'Jeden dostęp dla klientów, pracowników, partnerów, kierowników budowy i uprawnionej administracji. Uprawnienia sprawdza serwer.',
    invalid:'Logowanie nie powiodło się. Sprawdź e-mail i hasło. Nowe konta wymagają osobistego zaproszenia.',
    email:'Adres e-mail',password:'Hasło',inviteLink:'Utwórz konto z zaproszenia',inviteHelp:'Nie masz zaproszenia?',contact:'Skontaktuj się z KNABA',website:'Wróć do strony',
    registrationTitle:'KnaBa · rejestracja',registrationIntro:'Klienci, partnerzy, kierownicy budowy i pracownicy rejestrują się z osobistego zaproszenia. Rola wynika z zaproszenia i obowiązuje po zatwierdzeniu przez właściciela.',
    tokenNote:'Do aktywacji konta wymagane jest ważne osobiste zaproszenie.',name:'Imię i nazwisko',invitedEmail:'Adres e-mail (jak w zaproszeniu)',newPassword:'Hasło (8–256 znaków)',confirm:'Potwierdź hasło',
    privacyBefore:'Zapoznałem(-am) się z',privacyLink:'informacją o ochronie danych (DE)',privacyAfter:'i zgadzam się na przetwarzanie moich danych rejestracyjnych.',register:'Utwórz konto',backLogin:'Masz już konto? Zaloguj się'
  },
  lt: {
    language:'Kalba',signIn:'Prisijungti',signInTitle:'KnaBa · saugus prisijungimas',
    signInIntro:'Viena prieiga klientams, darbuotojams, partneriams, statybos vadovams ir įgaliotai administracijai. Teises tikrina serveris.',
    invalid:'Prisijungti nepavyko. Patikrinkite el. paštą ir slaptažodį. Naujoms paskyroms reikia asmeninio kvietimo.',
    email:'El. pašto adresas',password:'Slaptažodis',inviteLink:'Sukurti paskyrą su kvietimu',inviteHelp:'Dar neturite kvietimo?',contact:'Susisiekti su KNABA',website:'Grįžti į svetainę',
    registrationTitle:'KnaBa · registracija',registrationIntro:'Klientai, partneriai, statybos vadovai ir darbuotojai registruojasi su asmeniniu kvietimu. Vaidmuo nustatomas pagal kvietimą ir įsigalioja tik savininkui patvirtinus.',
    tokenNote:'Paskyrai aktyvinti būtinas galiojantis asmeninis kvietimas.',name:'Vardas ir pavardė',invitedEmail:'El. pašto adresas (kaip kvietime)',newPassword:'Slaptažodis (8–256 simboliai)',confirm:'Patvirtinkite slaptažodį',
    privacyBefore:'Perskaičiau',privacyLink:'privatumo pranešimą (DE)',privacyAfter:'ir sutinku su mano registracijos duomenų tvarkymu.',register:'Sukurti paskyrą',backLogin:'Jau turite paskyrą? Prisijunkite'
  },
  uk: {
    language:'Мова', signIn:'Увійти',
    signInTitle:'KnaBa · безпечний вхід',
    signInIntro:'Єдиний вхід для клієнтів, робітників, партнерів, бауляйтерів і уповноважених адміністраторів. Права доступу визначає сервер.',
    invalid:'Не вдалося увійти. Перевірте електронну пошту та пароль. Для нового облікового запису потрібне персональне запрошення.',
    email:'Електронна пошта', password:'Пароль', inviteLink:'Створити обліковий запис за запрошенням',
    inviteHelp:'Ще немає запрошення?', contact:'Зв’язатися з KNABA', website:'На сайт',
    registrationTitle:'KnaBa · реєстрація',
    registrationIntro:'Клієнти, партнери, бауляйтери й працівники реєструються за персональним запрошенням. Запитувана роль визначається за запрошенням і набирає чинності лише після погодження власником.',
    tokenNote:'Без чинного персонального запрошення активувати обліковий запис неможливо.',
    name:'Повне ім’я', invitedEmail:'Електронна пошта (як у запрошенні)',
    newPassword:'Пароль (8–256 символів)', confirm:'Підтвердіть пароль',
    privacyBefore:'Я прочитав(-ла)', privacyLink:'політику конфіденційності',
    privacyAfter:'та погоджуюся на обробку моїх даних для реєстрації.',
    register:'Створити обліковий запис', backLogin:'Уже маєте обліковий запис? Увійти'
  },
  en: {
    language:'Language', signIn:'Sign in',
    signInTitle:'KnaBa · secure sign-in',
    signInIntro:'One account entry for clients, workers, partners, site managers and authorized administration. Access is checked by the server.',
    invalid:'Sign-in failed. Check your email and password. New accounts require a personal invitation.',
    email:'Email address', password:'Password', inviteLink:'Create an account with an invitation',
    inviteHelp:'No invitation yet?', contact:'Contact KNABA', website:'Back to website',
    registrationTitle:'KnaBa · account registration',
    registrationIntro:'Clients, partners, site managers and workers register using personal invitations. Requested role is derived from the invitation and takes effect only after owner approval.',
    tokenNote:'A valid personal invitation is required to activate an account.',
    name:'Full name', invitedEmail:'Email address (as in your invitation)',
    newPassword:'Password (8–256 characters)', confirm:'Confirm password',
    privacyBefore:'I have read the', privacyLink:'privacy notice',
    privacyAfter:'and agree to the processing of my registration details.',
    register:'Create account', backLogin:'Already have an account? Sign in'
  },
  ru: {
    language:'Язык', signIn:'Войти',
    signInTitle:'KnaBa · безопасный вход',
    signInIntro:'Единый вход для клиентов, работников, партнёров, бауляйтеров и уполномоченной администрации. Доступ определяется на сервере.',
    invalid:'Не удалось войти. Проверьте почту и пароль. Новым пользователям нужно персональное приглашение.',
    email:'Электронная почта', password:'Пароль', inviteLink:'Создать аккаунт по приглашению',
    inviteHelp:'Нет приглашения?', contact:'Связаться с KNABA', website:'На сайт',
    registrationTitle:'KnaBa · регистрация',
    registrationIntro:'Клиенты, партнёры, бауляйтеры и сотрудники регистрируются по личному приглашению. Роль определяется приглашением и действует только после подтверждения владельца.',
    tokenNote:'Без действующего приглашения создать активный аккаунт нельзя.',
    name:'Полное имя', invitedEmail:'Электронная почта (из приглашения)',
    newPassword:'Пароль (8–256 символов)', confirm:'Подтвердите пароль',
    privacyBefore:'Я прочитал(а)', privacyLink:'политику конфиденциальности',
    privacyAfter:'и согласен(согласна) на обработку моих регистрационных данных.',
    register:'Создать аккаунт', backLogin:'Уже есть аккаунт? Войти'
  }
});
export function authLanguage(raw){
  return typeof raw==='string'&&Object.hasOwn(labels,raw)?raw:'de';
}
export function authWords(raw){
  return labels[authLanguage(raw)];
}

/** Requesting access is not self-provisioning an account or role. */
const accessLabels=Object.freeze({
  de:{
    joinLink:'Zugang anfragen',forgotLink:'Passwort vergessen?',
    title:'KnaBa · Zugang anfragen',intro:'Fordern Sie Zugang als Kunde, Mitarbeiter, Partner oder Bauleiter an. KNABA prüft die Anfrage und sendet bei bestätigter Identität eine persönliche Einladung. Hier wird noch kein Konto erstellt.',
    fullName:'Vollständiger Name',email:'E-Mail-Adresse',kind:'Ich interessiere mich für',
    client:'Kundenzugang',worker:'Mitarbeiterzugang',partner:'Geschäftspartner',bauleiter:'Bauleiter',
    privacy:'Ich habe die Datenschutzhinweise gelesen und stimme der Bearbeitung meiner Zugangs-Anfrage zu.',
    submit:'Anfrage senden',ok:'Die Anfrage wurde entgegengenommen. Falls ein Zugang eingerichtet werden kann, meldet sich KNABA nach Prüfung. Es wurde noch kein Benutzerkonto erstellt.',
    back:'Zur Anmeldung',contact:'KNABA kontaktieren',
    lostTitle:'KnaBa · Passwort vergessen',lostIntro:'Ohne bestätigte E-Mail-Zustellung können wir keinen sicheren automatischen Passwort-Reset versenden. Bitte kontaktieren Sie KNABA über den verifizierten Kontaktweg. Geben Sie niemandem Ihr Passwort bekannt.',
    passwordChange:'Mit bestehender Sitzung: Passwort ändern'
  },
  pl:{
    joinLink:'Poproś o dostęp',forgotLink:'Nie pamiętasz hasła?',title:'KnaBa · wniosek o dostęp',intro:'Poproś o dostęp klienta, pracownika, partnera lub kierownika budowy. KNABA sprawdzi wniosek i po potwierdzeniu tożsamości przekaże osobiste zaproszenie. Konto nie jest jeszcze tworzone.',
    fullName:'Imię i nazwisko',email:'Adres e-mail',kind:'Wnioskowany dostęp',client:'Klient',worker:'Pracownik',partner:'Partner biznesowy',bauleiter:'Kierownik budowy',privacy:'Zapoznałem(-am) się z informacją o ochronie danych i zgadzam się na przetworzenie wniosku o dostęp.',
    submit:'Wyślij wniosek',ok:'Wniosek otrzymany. Jeśli dostęp będzie możliwy, KNABA skontaktuje się po weryfikacji. Konto nie zostało jeszcze utworzone.',back:'Wróć do logowania',contact:'Skontaktuj się z KNABA',
    lostTitle:'KnaBa · zapomniane hasło',lostIntro:'Bez potwierdzonego kanału dostarczania e-mail nie możemy wysłać bezpiecznego automatycznego resetowania hasła. Skontaktuj się z KNABA sprawdzonym kanałem. Nikomu nie udostępniaj hasła.',passwordChange:'Masz aktywną sesję? Zmień hasło'
  },
  lt:{
    joinLink:'Prašyti prieigos',forgotLink:'Pamiršote slaptažodį?',title:'KnaBa · prieigos prašymas',intro:'Prašykite kliento, darbuotojo, partnerio ar statybos vadovo prieigos. KNABA patikrins prašymą ir patvirtinusi tapatybę pateiks asmeninį kvietimą. Paskyra dar nesukuriama.',
    fullName:'Vardas ir pavardė',email:'El. pašto adresas',kind:'Pageidaujama prieiga',client:'Klientas',worker:'Darbuotojas',partner:'Verslo partneris',bauleiter:'Statybos vadovas',privacy:'Perskaičiau privatumo pranešimą ir sutinku su prieigos prašymo tvarkymu.',
    submit:'Siųsti prašymą',ok:'Prašymas gautas. Jei prieiga galima, KNABA susisieks po patikrinimo. Paskyra dar nesukurta.',back:'Grįžti į prisijungimą',contact:'Susisiekti su KNABA',
    lostTitle:'KnaBa · pamirštas slaptažodis',lostIntro:'Be patvirtinto el. pašto pristatymo kanalo negalime išsiųsti saugaus automatinio slaptažodžio atkūrimo. Susisiekite su KNABA patikimu kanalu. Niekam neatskleiskite slaptažodžio.',passwordChange:'Jau prisijungę? Keisti slaptažodį'
  },
  uk:{
    joinLink:'Подати заявку на доступ',forgotLink:'Забули пароль?',
    title:'KnaBa · заявка на доступ',intro:'Подайте заявку на доступ клієнта, робітника, партнера або бауляйтера. KNABA перевірить звернення й після підтвердження особи надасть персональне запрошення. Обліковий запис ще не створюється.',
    fullName:'Повне ім’я',email:'Електронна пошта',kind:'Потрібен доступ',
    client:'Клієнта',worker:'Працівника',partner:'Партнера',bauleiter:'Бауляйтера',
    privacy:'Я прочитав(-ла) політику конфіденційності та погоджуюся на обробку заявки на доступ.',
    submit:'Надіслати заявку',ok:'Заявку прийнято. Якщо доступ можна надати, KNABA зв’яжеться після перевірки. Обліковий запис ще не створено.',
    back:'До входу',contact:'Зв’язатися з KNABA',
    lostTitle:'KnaBa · забули пароль',lostIntro:'Без підтвердженого каналу email безпечне автоматичне скидання пароля недоступне. Зверніться до KNABA перевіреним способом. Нікому не надсилайте пароль.',
    passwordChange:'Якщо ви вже увійшли: змінити пароль'
  },
  en:{
    joinLink:'Request account access',forgotLink:'Forgot your password?',
    title:'KnaBa · request access',intro:'Request client, worker, partner or site manager access. KNABA will review your request and provide a personal invitation after checking your identity. This does not create an account yet.',
    fullName:'Full name',email:'Email address',kind:'Requested access',
    client:'Client',worker:'Worker',partner:'Business partner',bauleiter:'Site manager',
    privacy:'I have read the privacy notice and agree to the processing of my access request.',
    submit:'Send request',ok:'Your request was received. If access can be granted, KNABA will contact you after verification. No account has been created.',
    back:'Back to sign-in',contact:'Contact KNABA',
    lostTitle:'KnaBa · forgot password',lostIntro:'Without a verified email-delivery channel we cannot send a secure automatic password reset. Contact KNABA through the verified contact channel. Never share your password.',
    passwordChange:'Already signed in? Change your password'
  },
  ru:{
    joinLink:'Запросить доступ',forgotLink:'Забыли пароль?',
    title:'KnaBa · запрос доступа',intro:'Запросите доступ клиента, работника, партнёра или бауляйтера. KNABA рассмотрит заявку и после проверки личности выдаст персональное приглашение. Аккаунт пока не создаётся.',
    fullName:'Полное имя',email:'Электронная почта',kind:'Какой доступ нужен',
    client:'Клиент',worker:'Сотрудник',partner:'Партнёр',bauleiter:'Бауляйтер',
    privacy:'Я прочитал(а) политику конфиденциальности и согласен(согласна) на обработку заявки.',
    submit:'Отправить заявку',ok:'Заявка получена. Если доступ может быть предоставлен, KNABA свяжется с вами после проверки. Аккаунт пока не создан.',
    back:'К входу',contact:'Связаться с KNABA',
    lostTitle:'KnaBa · забыли пароль',lostIntro:'Без проверенного канала электронной почты безопасный автоматический сброс пароля недоступен. Свяжитесь с KNABA проверенным способом. Никому не сообщайте пароль.',
    passwordChange:'Если вы уже вошли: изменить пароль'
  }
});
export function accessWords(raw){
  return accessLabels[authLanguage(raw)];
}
