// Shared, server-rendered labels for KNABA account entry points.
// These are presentation strings; authorization always comes from a verified session / invitation.
const labels = Object.freeze({
  de: {
    language: 'Sprache', signIn:'Anmelden',
    signInTitle:'KnaBa · sicher anmelden',
    signInIntro:'Ein Zugang für Kunden, Mitarbeitende und berechtigte Verwaltung. Zugriffsrechte werden serverseitig geprüft.',
    invalid:'Anmeldung fehlgeschlagen. Prüfen Sie E-Mail und Passwort. Neue Benutzer benötigen eine persönliche Einladung.',
    email:'E-Mail', password:'Passwort', inviteLink:'Konto mit Einladung erstellen',
    inviteHelp:'Noch keine Einladung?', contact:'KNABA kontaktieren', website:'Zur Website',
    registrationTitle:'KnaBa · Registrierung',
    registrationIntro:'Kunden, Partner und Mitarbeitende registrieren sich mit einer persönlichen Einladung. Die angeforderte Rolle wird anhand der Einladung erkannt und nach Prüfung durch den Inhaber freigegeben.',
    tokenNote:'Ohne eine gültige persönliche Einladung ist keine Kontoaktivierung möglich.',
    name:'Vollständiger Name', invitedEmail:'E-Mail (wie in der Einladung)',
    newPassword:'Passwort (8–256 Zeichen)', confirm:'Passwort bestätigen',
    privacyBefore:'Ich habe die', privacyLink:'Datenschutzhinweise',
    privacyAfter:'gelesen und stimme der Verarbeitung meiner Registrierungsdaten zu.',
    register:'Konto erstellen', backLogin:'Bereits registriert? Anmelden'
  },
  uk: {
    language:'Мова', signIn:'Увійти',
    signInTitle:'KnaBa · безпечний вхід',
    signInIntro:'Єдиний вхід для клієнтів, працівників і уповноважених адміністраторів. Права доступу визначає сервер.',
    invalid:'Не вдалося увійти. Перевірте електронну пошту та пароль. Для нового облікового запису потрібне персональне запрошення.',
    email:'Електронна пошта', password:'Пароль', inviteLink:'Створити обліковий запис за запрошенням',
    inviteHelp:'Ще немає запрошення?', contact:'Зв’язатися з KNABA', website:'На сайт',
    registrationTitle:'KnaBa · реєстрація',
    registrationIntro:'Клієнти, партнери й працівники реєструються за персональним запрошенням. Запитувана роль визначається за запрошенням і набирає чинності лише після погодження власником.',
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
    signInIntro:'One account entry for clients, workers and authorized administration. Access is checked by the server.',
    invalid:'Sign-in failed. Check your email and password. New accounts require a personal invitation.',
    email:'Email address', password:'Password', inviteLink:'Create an account with an invitation',
    inviteHelp:'No invitation yet?', contact:'Contact KNABA', website:'Back to website',
    registrationTitle:'KnaBa · account registration',
    registrationIntro:'Clients, partners and workers register using personal invitations. Requested role is derived from the invitation and takes effect only after owner approval.',
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
    signInIntro:'Единый вход для клиентов, сотрудников и уполномоченной администрации. Доступ определяется на сервере.',
    invalid:'Не удалось войти. Проверьте почту и пароль. Новым пользователям нужно персональное приглашение.',
    email:'Электронная почта', password:'Пароль', inviteLink:'Создать аккаунт по приглашению',
    inviteHelp:'Нет приглашения?', contact:'Связаться с KNABA', website:'На сайт',
    registrationTitle:'KnaBa · регистрация',
    registrationIntro:'Клиенты, партнёры и сотрудники регистрируются по личному приглашению. Роль Клиент/сотрудник определяется приглашением и действует только после подтверждения владельца.',
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
    title:'KnaBa · Zugang anfragen',intro:'Fordern Sie einen Kunden- oder Mitarbeiterzugang an. KNABA prüft die Anfrage und sendet bei bestätigter Identität eine persönliche Einladung. Hier wird noch kein Konto erstellt.',
    fullName:'Vollständiger Name',email:'E-Mail-Adresse',kind:'Ich interessiere mich für',
    client:'Kundenzugang',worker:'Mitarbeiterzugang',partner:'Geschäftspartner',
    privacy:'Ich habe die Datenschutzhinweise gelesen und stimme der Bearbeitung meiner Zugangs-Anfrage zu.',
    submit:'Anfrage senden',ok:'Die Anfrage wurde entgegengenommen. Falls ein Zugang eingerichtet werden kann, meldet sich KNABA nach Prüfung. Es wurde noch kein Benutzerkonto erstellt.',
    back:'Zur Anmeldung',contact:'KNABA kontaktieren',
    lostTitle:'KnaBa · Passwort vergessen',lostIntro:'Ohne bestätigte E-Mail-Zustellung können wir keinen sicheren automatischen Passwort-Reset versenden. Bitte kontaktieren Sie KNABA über den verifizierten Kontaktweg. Geben Sie niemandem Ihr Passwort bekannt.',
    passwordChange:'Mit bestehender Sitzung: Passwort ändern'
  },
  uk:{
    joinLink:'Подати заявку на доступ',forgotLink:'Забули пароль?',
    title:'KnaBa · заявка на доступ',intro:'Подайте заявку на доступ клієнта або працівника. KNABA перевірить звернення й після підтвердження особи надасть персональне запрошення. Обліковий запис ще не створюється.',
    fullName:'Повне ім’я',email:'Електронна пошта',kind:'Потрібен доступ',
    client:'Клієнта',worker:'Працівника',partner:'Партнера',
    privacy:'Я прочитав(-ла) політику конфіденційності та погоджуюся на обробку заявки на доступ.',
    submit:'Надіслати заявку',ok:'Заявку прийнято. Якщо доступ можна надати, KNABA зв’яжеться після перевірки. Обліковий запис ще не створено.',
    back:'До входу',contact:'Зв’язатися з KNABA',
    lostTitle:'KnaBa · забули пароль',lostIntro:'Без підтвердженого каналу email безпечне автоматичне скидання пароля недоступне. Зверніться до KNABA перевіреним способом. Нікому не надсилайте пароль.',
    passwordChange:'Якщо ви вже увійшли: змінити пароль'
  },
  en:{
    joinLink:'Request account access',forgotLink:'Forgot your password?',
    title:'KnaBa · request access',intro:'Request client or worker access. KNABA will review your request and provide a personal invitation after checking your identity. This does not create an account yet.',
    fullName:'Full name',email:'Email address',kind:'Requested access',
    client:'Client',worker:'Worker',partner:'Business partner',
    privacy:'I have read the privacy notice and agree to the processing of my access request.',
    submit:'Send request',ok:'Your request was received. If access can be granted, KNABA will contact you after verification. No account has been created.',
    back:'Back to sign-in',contact:'Contact KNABA',
    lostTitle:'KnaBa · forgot password',lostIntro:'Without a verified email-delivery channel we cannot send a secure automatic password reset. Contact KNABA through the verified contact channel. Never share your password.',
    passwordChange:'Already signed in? Change your password'
  },
  ru:{
    joinLink:'Запросить доступ',forgotLink:'Забыли пароль?',
    title:'KnaBa · запрос доступа',intro:'Запросите доступ клиента или сотрудника. KNABA рассмотрит заявку и после проверки личности выдаст персональное приглашение. Аккаунт пока не создаётся.',
    fullName:'Полное имя',email:'Электронная почта',kind:'Какой доступ нужен',
    client:'Клиент',worker:'Сотрудник',partner:'Партнёр',
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
