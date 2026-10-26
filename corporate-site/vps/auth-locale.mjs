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
    registrationIntro:'Kunden und Mitarbeitende registrieren sich mit einer persönlichen Einladung. Die angeforderte Rolle wird anhand der Einladung erkannt und nach Prüfung durch den Inhaber freigegeben.',
    tokenNote:'Ohne eine gültige persönliche Einladung ist keine Kontoaktivierung möglich.',
    name:'Vollständiger Name', invitedEmail:'E-Mail (wie in der Einladung)',
    newPassword:'Passwort (16–256 Zeichen)', confirm:'Passwort bestätigen',
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
    registrationIntro:'Клієнти й працівники реєструються за персональним запрошенням. Запитувана роль визначається за запрошенням і набирає чинності лише після погодження власником.',
    tokenNote:'Без чинного персонального запрошення активувати обліковий запис неможливо.',
    name:'Повне ім’я', invitedEmail:'Електронна пошта (як у запрошенні)',
    newPassword:'Пароль (16–256 символів)', confirm:'Підтвердіть пароль',
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
    registrationIntro:'Clients and workers register using personal invitations. Requested role is derived from the invitation and takes effect only after owner approval.',
    tokenNote:'A valid personal invitation is required to activate an account.',
    name:'Full name', invitedEmail:'Email address (as in your invitation)',
    newPassword:'Password (16–256 characters)', confirm:'Confirm password',
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
    registrationIntro:'Клиент или сотрудник регистрируется по личному приглашению. Роль Клиент/сотрудник определяется приглашением и действует только после подтверждения владельца.',
    tokenNote:'Без действующего приглашения создать активный аккаунт нельзя.',
    name:'Полное имя', invitedEmail:'Электронная почта (из приглашения)',
    newPassword:'Пароль (16–256 символов)', confirm:'Подтвердите пароль',
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
