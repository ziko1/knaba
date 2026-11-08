/** Server-rendered account pages. This module renders no credentials or capabilities. */
import {authLanguage} from './auth-locale.mjs';

const languages=Object.freeze({de:'Deutsch',en:'English',pl:'Polski',lt:'Lietuvių',ru:'Русский',uk:'Українська'});
const words={
  de:{
    settingsTitle:'Kontoeinstellungen',settingsIntro:'Ihre persönlichen Angaben, Anmeldung und aktiven Sitzungen an einem Ort.',
    account:'Mein KNABA-Konto',backWorkspace:'Zu meinem Arbeitsbereich',backSettings:'Zu den Kontoeinstellungen',backLogin:'Zur Anmeldung',skip:'Zum Inhalt',sections:'Kontobereiche',
    profile:'Profil',security:'Sicherheit',sessions:'Sitzungen',profileIntro:'Halten Sie Ihre Kontaktdaten aktuell. Mit einem Stern markierte Felder sind erforderlich.',
    name:'Vollständiger Name',phone:'Telefon',company:'Unternehmen / Organisation',address:'Kontaktadresse',optional:'optional',contactNote:'Diese Angaben ändern keine Berechtigungen oder Unternehmenszuordnungen.',
    language:'Bevorzugte Sprache',timeZone:'Zeitzone',timeZoneHelp:'Zum Beispiel Europe/Berlin. Die Sitzungszeiten unten verwenden diese Zeitzone.',save:'Änderungen speichern',
    email:'E-Mail',currentEmail:'Aktuelle Anmeldeadresse',newEmail:'Neue E-Mail-Adresse',emailIntro:'Bestätigen Sie die Änderung mit Ihrem aktuellen Passwort und anschließend über den Link an die neue Adresse. Nach der Bestätigung werden alle Sitzungen beendet.',emailSubmit:'Bestätigungslink anfordern',
    protected:'Die Anmeldeadresse dieses Verwaltungszugangs wird von KNABA verwaltet. Eine Änderung erfordert eine gesonderte Identitätsprüfung.',
    oidc:'Dieses Konto ist mit Google oder Microsoft verknüpft. Bitte stimmen Sie eine Änderung der Anmeldeadresse mit KNABA ab, damit der Zugang erhalten bleibt.',
    emailUnavailable:'Die Bestätigung einer neuen E-Mail-Adresse ist zurzeit nicht verfügbar. Ihre aktuelle Adresse bleibt gültig.',emailRequested:'Falls die neue Adresse verwendet werden kann, wurde eine Bestätigung angefordert. Die aktuelle Adresse bleibt bis zur Bestätigung gültig.',
    passwordTitle:'Passwort ändern',passwordIntro:'Bestätigen Sie Ihre Identität mit dem aktuellen Passwort. Nach der Änderung müssen Sie sich auf allen Sitzungen neu anmelden.',
    currentPassword:'Aktuelles Passwort',newPassword:'Neues Passwort',confirmPassword:'Neues Passwort wiederholen',passwordRules:'8–256 Zeichen. Wählen Sie ein neues, einzigartiges Passwort.',passwordMismatch:'Die Passwörter stimmen nicht überein.',passwordSubmit:'Passwort ändern',passwordChanged:'Ihr Passwort wurde geändert. Melden Sie sich mit dem neuen Passwort an.',
    recoverTitle:'Passwort vergessen?',recoveryIntro:'Geben Sie die E-Mail-Adresse Ihres KNABA-Kontos ein. Sofern eine Wiederherstellung möglich ist, erhalten Sie einen einmaligen Link.',recoverySubmit:'Link zur Wiederherstellung anfordern',
    recoverySent:'Die Anfrage wurde angenommen. Falls für diese Adresse eine Wiederherstellung möglich ist, erhalten Sie eine Anleitung. Prüfen Sie auch den Spamordner. Ein Link gilt 30 Minuten.',
    recoveryUnavailable:'Die Wiederherstellung per E-Mail ist zurzeit nicht verfügbar. Wenden Sie sich über einen verifizierten Kontaktweg an KNABA.',contact:'KNABA kontaktieren',
    resetTitle:'Neues Passwort festlegen',resetIntro:'Verwenden Sie Ihren persönlichen Wiederherstellungslink. Nach dem Speichern werden alle bisherigen Sitzungen beendet.',resetSubmit:'Neues Passwort speichern',resetDone:'Ihr Passwort wurde zurückgesetzt. Melden Sie sich mit Ihrem neuen Passwort an.',
    confirmEmailTitle:'Neue E-Mail-Adresse bestätigen',confirmEmailIntro:'Bestätigen Sie nur eine Änderung, die Sie selbst angefordert haben. Danach melden Sie sich mit Ihrer neuen E-Mail-Adresse erneut an.',confirmEmailSubmit:'Adressänderung bestätigen',confirmEmailDone:'Die neue E-Mail-Adresse wurde bestätigt. Melden Sie sich mit der neuen Adresse an.',
    token:'Persönlicher Code',tokenHelp:'Öffnen Sie den vollständigen Link aus Ihrer E-Mail oder fügen Sie dessen 43-stelligen Code hier ein. Der Code ist einmalig und 30 Minuten gültig.',tokenReady:'Der Code aus Ihrem Link ist bereit.',enterToken:'Anderen Code eingeben',invalidToken:'Dieser Link ist ungültig, abgelaufen oder bereits verwendet. Fordern Sie einen neuen Link an.',
    sessionsIntro:'Prüfen Sie Ihre aktiven Anmeldungen und beenden Sie Sitzungen, die Sie nicht mehr benötigen.',sessionStarted:'Angemeldet am',sessionExpires:'Gültig bis',sessionCurrent:'Diese Sitzung',sessionOther:'Weitere Sitzung',sessionEnd:'Sitzung beenden',sessionsOthers:'Andere Sitzungen beenden',sessionsAll:'Überall abmelden',sessionsAllHint:'„Überall abmelden“ beendet auch diese Sitzung.',sessionsEmpty:'Keine aktiven Sitzungen.',sessionZone:'Zeitzone',sessionsLimited:'Angezeigt: {count} von {total} aktiven Sitzungen, einschließlich dieser Sitzung. „Andere Sitzungen beenden“ erfasst auch weitere, hier nicht angezeigte Sitzungen.',
    validation:'Prüfen Sie Ihre Angaben und die Passwortanforderungen.',conflict:'Die Angaben haben sich inzwischen geändert. Laden Sie die Einstellungen neu und prüfen Sie Ihre Eingabe.',unavailable:'Die Änderung ist derzeit nicht möglich. Bitte versuchen Sie es später erneut.',limited:'Zu viele Versuche. Bitte warten Sie und versuchen Sie es später erneut.',unauthenticated:'Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an.',saved:'Ihre Einstellungen wurden gespeichert.',sessionsRevoked:'Die ausgewählten Sitzungen wurden beendet.',
    roleLabel:'Zugang',statusLabel:'Status',managedAccess:'Ihre Zugriffsrechte werden von KNABA freigegeben.',
    roles:{owner:'Inhaber',admin:'Administration',client:'Kunde',worker:'Mitarbeiter',partner:'Partner',bauleiter:'Bauleiter'},statuses:{pending:'Freigabe ausstehend',approved:'Freigegeben',suspended:'Zugang pausiert'}
  },
  en:{
    settingsTitle:'Account settings',settingsIntro:'Your personal details, sign-in and active sessions in one place.',
    account:'My KNABA account',backWorkspace:'Back to my workspace',backSettings:'Back to account settings',backLogin:'Back to sign-in',skip:'Skip to content',sections:'Account sections',
    profile:'Profile',security:'Security',sessions:'Sessions',profileIntro:'Keep your contact details up to date. Fields marked with an asterisk are required.',
    name:'Full name',phone:'Phone',company:'Company / organisation',address:'Contact address',optional:'optional',contactNote:'These details do not change your permissions or company access.',
    language:'Preferred language',timeZone:'Time zone',timeZoneHelp:'For example, Europe/Berlin. The session times below use this time zone.',save:'Save changes',
    email:'Email',currentEmail:'Current sign-in address',newEmail:'New email address',emailIntro:'Confirm with your current password, then follow the link sent to the new address. All sessions end when you confirm the change.',emailSubmit:'Request confirmation link',
    protected:'KNABA manages the sign-in address for this administrative account. Changing it requires a separate identity check.',
    oidc:'This account is linked to Google or Microsoft. Please arrange a sign-in address change with KNABA to keep access to your account.',
    emailUnavailable:'Email address confirmation is currently unavailable. Your current address remains active.',emailRequested:'If the new address can be used, confirmation has been requested. Your current address remains active until you confirm.',
    passwordTitle:'Change password',passwordIntro:'Confirm your identity with your current password. After the change, you must sign in again in every session.',
    currentPassword:'Current password',newPassword:'New password',confirmPassword:'Repeat new password',passwordRules:'8–256 characters. Choose a new, unique password.',passwordMismatch:'The passwords do not match.',passwordSubmit:'Change password',passwordChanged:'Your password has been changed. Sign in with your new password.',
    recoverTitle:'Forgot password?',recoveryIntro:'Enter the email address of your KNABA account. If recovery is available, you will receive a single-use link.',recoverySubmit:'Request recovery link',
    recoverySent:'Your request has been accepted. If this address is eligible for recovery, you will receive instructions. Check your spam folder too. A link expires after 30 minutes.',
    recoveryUnavailable:'Email recovery is currently unavailable. Contact KNABA through a verified channel.',contact:'Contact KNABA',
    resetTitle:'Set a new password',resetIntro:'Use your personal recovery link. Saving a new password ends all previous sessions.',resetSubmit:'Save new password',resetDone:'Your password has been reset. Sign in with your new password.',
    confirmEmailTitle:'Confirm new email address',confirmEmailIntro:'Confirm only a change that you requested. You will then sign in again with your new email address.',confirmEmailSubmit:'Confirm address change',confirmEmailDone:'Your new email address has been confirmed. Sign in with the new address.',
    token:'Personal code',tokenHelp:'Open the complete link from your email or paste its 43-character code here. The code is single-use and expires after 30 minutes.',tokenReady:'The code from your link is ready.',enterToken:'Enter a different code',invalidToken:'This link is invalid, expired or already used. Request a new link.',
    sessionsIntro:'Review your active sign-ins and end sessions you no longer need.',sessionStarted:'Signed in',sessionExpires:'Expires',sessionCurrent:'This session',sessionOther:'Other session',sessionEnd:'End session',sessionsOthers:'End other sessions',sessionsAll:'Sign out everywhere',sessionsAllHint:'Signing out everywhere also ends this session.',sessionsEmpty:'No active sessions.',sessionZone:'Time zone',sessionsLimited:'Active sessions shown: {count} of {total}, including this session. Ending other sessions also revokes any additional sessions not shown here.',
    validation:'Check your details and the password requirements.',conflict:'Your details have changed since you opened this page. Reload settings and review your input.',unavailable:'This change is currently unavailable. Please try again later.',limited:'Too many attempts. Please wait and try again later.',unauthenticated:'Your session has expired. Sign in again.',saved:'Your settings have been saved.',sessionsRevoked:'The selected sessions have been ended.',
    roleLabel:'Access',statusLabel:'Status',managedAccess:'KNABA approves your access permissions.',
    roles:{owner:'Owner',admin:'Administration',client:'Client',worker:'Worker',partner:'Partner',bauleiter:'Site manager'},statuses:{pending:'Awaiting approval',approved:'Approved',suspended:'Access paused'}
  },
  uk:{
    settingsTitle:'Налаштування облікового запису',settingsIntro:'Ваші особисті дані, вхід і активні сесії в одному місці.',
    account:'Мій обліковий запис KNABA',backWorkspace:'До мого кабінету',backSettings:'До налаштувань',backLogin:'До входу',skip:'Перейти до вмісту',sections:'Розділи облікового запису',
    profile:'Профіль',security:'Безпека',sessions:'Сесії',profileIntro:'Підтримуйте контактні дані актуальними. Поля із зірочкою обов’язкові.',
    name:'Ім’я та прізвище',phone:'Телефон',company:'Компанія / організація',address:'Контактна адреса',optional:'необов’язково',contactNote:'Ці дані не змінюють ваші права доступу чи належність до компанії.',
    language:'Бажана мова',timeZone:'Часовий пояс',timeZoneHelp:'Наприклад, Europe/Berlin. Час сесій нижче показано в цьому часовому поясі.',save:'Зберегти зміни',
    email:'Електронна пошта',currentEmail:'Поточна адреса для входу',newEmail:'Нова електронна адреса',emailIntro:'Підтвердьте зміну поточним паролем, а потім перейдіть за посиланням на новій пошті. Після підтвердження всі сесії буде завершено.',emailSubmit:'Отримати посилання для підтвердження',
    protected:'Адресою входу цього адміністративного облікового запису керує KNABA. Її зміна потребує окремої перевірки особи.',
    oidc:'Обліковий запис пов’язано з Google або Microsoft. Узгодьте зміну адреси входу з KNABA, щоб зберегти доступ.',
    emailUnavailable:'Підтвердження нової електронної адреси зараз недоступне. Поточна адреса залишається чинною.',emailRequested:'Якщо нову адресу можна використовувати, підтвердження запитано. До підтвердження чинною залишається поточна адреса.',
    passwordTitle:'Змінити пароль',passwordIntro:'Підтвердьте особу поточним паролем. Після зміни потрібно повторно увійти в усіх сесіях.',
    currentPassword:'Поточний пароль',newPassword:'Новий пароль',confirmPassword:'Повторіть новий пароль',passwordRules:'8–256 символів. Оберіть новий унікальний пароль.',passwordMismatch:'Паролі не збігаються.',passwordSubmit:'Змінити пароль',passwordChanged:'Пароль змінено. Увійдіть із новим паролем.',
    recoverTitle:'Забули пароль?',recoveryIntro:'Введіть адресу облікового запису KNABA. Якщо відновлення доступне, ви отримаєте одноразове посилання.',recoverySubmit:'Отримати посилання для відновлення',
    recoverySent:'Запит прийнято. Якщо для цієї адреси доступне відновлення, ви отримаєте інструкцію. Перевірте також папку «Спам». Посилання діє 30 хвилин.',
    recoveryUnavailable:'Відновлення через email зараз недоступне. Зверніться до KNABA перевіреним способом.',contact:'Зв’язатися з KNABA',
    resetTitle:'Установити новий пароль',resetIntro:'Скористайтеся персональним посиланням відновлення. Збереження нового пароля завершить усі попередні сесії.',resetSubmit:'Зберегти новий пароль',resetDone:'Пароль відновлено. Увійдіть із новим паролем.',
    confirmEmailTitle:'Підтвердити нову електронну адресу',confirmEmailIntro:'Підтверджуйте лише ту зміну, яку ви запросили особисто. Потім увійдіть повторно з новою адресою.',confirmEmailSubmit:'Підтвердити зміну адреси',confirmEmailDone:'Нову електронну адресу підтверджено. Увійдіть із новою адресою.',
    token:'Персональний код',tokenHelp:'Відкрийте повне посилання з листа або вставте тут його код із 43 символів. Код одноразовий і діє 30 хвилин.',tokenReady:'Код із вашого посилання готовий.',enterToken:'Ввести інший код',invalidToken:'Посилання недійсне, прострочене або вже використане. Запросіть нове посилання.',
    sessionsIntro:'Переглядайте активні входи й завершуйте сесії, які більше не потрібні.',sessionStarted:'Вхід виконано',sessionExpires:'Діє до',sessionCurrent:'Поточна сесія',sessionOther:'Інша сесія',sessionEnd:'Завершити сесію',sessionsOthers:'Завершити інші сесії',sessionsAll:'Вийти всюди',sessionsAllHint:'Дія «Вийти всюди» завершить і поточну сесію.',sessionsEmpty:'Активних сесій немає.',sessionZone:'Часовий пояс',sessionsLimited:'Показано {count} із {total} активних сесій, включно з поточною. Дія «Завершити інші сесії» також охоплює додаткові сесії, які не відображаються в списку.',
    validation:'Перевірте введені дані та вимоги до пароля.',conflict:'Дані вже змінилися. Оновіть сторінку налаштувань і перевірте введене.',unavailable:'Зараз не вдалося виконати зміну. Спробуйте пізніше.',limited:'Забагато спроб. Зачекайте та спробуйте пізніше.',unauthenticated:'Сесію завершено. Увійдіть повторно.',saved:'Налаштування збережено.',sessionsRevoked:'Вибрані сесії завершено.',
    roleLabel:'Доступ',statusLabel:'Статус',managedAccess:'Ваші права доступу затверджує KNABA.',
    roles:{owner:'Власник',admin:'Адміністрація',client:'Клієнт',worker:'Працівник',partner:'Партнер',bauleiter:'Бауляйтер'},statuses:{pending:'Очікує схвалення',approved:'Схвалено',suspended:'Доступ призупинено'}
  },
  ru:{
    settingsTitle:'Настройки учётной записи',settingsIntro:'Ваши личные данные, вход и активные сессии в одном месте.',
    account:'Моя учётная запись KNABA',backWorkspace:'В мой кабинет',backSettings:'К настройкам',backLogin:'К входу',skip:'Перейти к содержимому',sections:'Разделы учётной записи',
    profile:'Профиль',security:'Безопасность',sessions:'Сессии',profileIntro:'Поддерживайте контактные данные актуальными. Поля со звёздочкой обязательны.',
    name:'Имя и фамилия',phone:'Телефон',company:'Компания / организация',address:'Контактный адрес',optional:'необязательно',contactNote:'Эти данные не меняют ваши права доступа или принадлежность к компании.',
    language:'Предпочитаемый язык',timeZone:'Часовой пояс',timeZoneHelp:'Например, Europe/Berlin. Время сессий ниже показано в этом часовом поясе.',save:'Сохранить изменения',
    email:'Электронная почта',currentEmail:'Текущий адрес для входа',newEmail:'Новый электронный адрес',emailIntro:'Подтвердите изменение текущим паролем, затем перейдите по ссылке на новой почте. После подтверждения все сессии завершатся.',emailSubmit:'Запросить ссылку для подтверждения',
    protected:'Адресом входа этой административной учётной записи управляет KNABA. Его изменение требует отдельной проверки личности.',
    oidc:'Учётная запись связана с Google или Microsoft. Согласуйте изменение адреса входа с KNABA, чтобы сохранить доступ.',
    emailUnavailable:'Подтверждение нового электронного адреса сейчас недоступно. Текущий адрес остаётся действующим.',emailRequested:'Если новый адрес можно использовать, подтверждение запрошено. До подтверждения действует текущий адрес.',
    passwordTitle:'Изменить пароль',passwordIntro:'Подтвердите личность текущим паролем. После изменения потребуется повторно войти во всех сессиях.',
    currentPassword:'Текущий пароль',newPassword:'Новый пароль',confirmPassword:'Повторите новый пароль',passwordRules:'8–256 символов. Выберите новый уникальный пароль.',passwordMismatch:'Пароли не совпадают.',passwordSubmit:'Изменить пароль',passwordChanged:'Пароль изменён. Войдите с новым паролем.',
    recoverTitle:'Забыли пароль?',recoveryIntro:'Введите адрес учётной записи KNABA. Если восстановление доступно, вы получите одноразовую ссылку.',recoverySubmit:'Запросить ссылку для восстановления',
    recoverySent:'Запрос принят. Если для этого адреса доступно восстановление, вы получите инструкцию. Проверьте также папку «Спам». Ссылка действует 30 минут.',
    recoveryUnavailable:'Восстановление по email сейчас недоступно. Свяжитесь с KNABA проверенным способом.',contact:'Связаться с KNABA',
    resetTitle:'Установить новый пароль',resetIntro:'Используйте персональную ссылку восстановления. Сохранение нового пароля завершит все предыдущие сессии.',resetSubmit:'Сохранить новый пароль',resetDone:'Пароль восстановлен. Войдите с новым паролем.',
    confirmEmailTitle:'Подтвердить новый электронный адрес',confirmEmailIntro:'Подтверждайте только то изменение, которое вы запросили лично. Затем войдите повторно с новым адресом.',confirmEmailSubmit:'Подтвердить изменение адреса',confirmEmailDone:'Новый электронный адрес подтверждён. Войдите с новым адресом.',
    token:'Персональный код',tokenHelp:'Откройте полную ссылку из письма или вставьте здесь её код из 43 символов. Код одноразовый и действует 30 минут.',tokenReady:'Код из вашей ссылки готов.',enterToken:'Ввести другой код',invalidToken:'Ссылка недействительна, просрочена или уже использована. Запросите новую ссылку.',
    sessionsIntro:'Просматривайте активные входы и завершайте сессии, которые больше не нужны.',sessionStarted:'Вход выполнен',sessionExpires:'Действует до',sessionCurrent:'Текущая сессия',sessionOther:'Другая сессия',sessionEnd:'Завершить сессию',sessionsOthers:'Завершить другие сессии',sessionsAll:'Выйти везде',sessionsAllHint:'Действие «Выйти везде» завершит и текущую сессию.',sessionsEmpty:'Активных сессий нет.',sessionZone:'Часовой пояс',sessionsLimited:'Показано {count} из {total} активных сессий, включая текущую. Действие «Завершить другие сессии» также завершает дополнительные сессии, которых нет в списке.',
    validation:'Проверьте введённые данные и требования к паролю.',conflict:'Данные уже изменились. Обновите страницу настроек и проверьте введённое.',unavailable:'Сейчас не удалось выполнить изменение. Попробуйте позже.',limited:'Слишком много попыток. Подождите и попробуйте позже.',unauthenticated:'Сессия завершена. Войдите повторно.',saved:'Настройки сохранены.',sessionsRevoked:'Выбранные сессии завершены.',
    roleLabel:'Доступ',statusLabel:'Статус',managedAccess:'Ваши права доступа утверждает KNABA.',
    roles:{owner:'Владелец',admin:'Администрация',client:'Клиент',worker:'Работник',partner:'Партнёр',bauleiter:'Бауляйтер'},statuses:{pending:'Ожидает одобрения',approved:'Одобрено',suspended:'Доступ приостановлен'}
  },
  pl:{
    settingsTitle:'Ustawienia konta',settingsIntro:'Dane osobowe, logowanie i aktywne sesje w jednym miejscu.',
    account:'Moje konto KNABA',backWorkspace:'Wróć do mojego panelu',backSettings:'Wróć do ustawień konta',backLogin:'Wróć do logowania',skip:'Przejdź do treści',sections:'Sekcje konta',
    profile:'Profil',security:'Bezpieczeństwo',sessions:'Sesje',profileIntro:'Aktualizuj swoje dane kontaktowe. Pola oznaczone gwiazdką są wymagane.',
    name:'Imię i nazwisko',phone:'Telefon',company:'Firma / organizacja',address:'Adres kontaktowy',optional:'opcjonalnie',contactNote:'Te dane nie zmieniają uprawnień ani dostępu do firmy.',
    language:'Preferowany język',timeZone:'Strefa czasowa',timeZoneHelp:'Na przykład Europe/Berlin. Godziny sesji poniżej są wyświetlane w tej strefie.',save:'Zapisz zmiany',
    email:'E-mail',currentEmail:'Aktualny adres logowania',newEmail:'Nowy adres e-mail',emailIntro:'Potwierdź zmianę obecnym hasłem, a następnie użyj linku wysłanego na nowy adres. Po potwierdzeniu wszystkie sesje zostaną zakończone.',emailSubmit:'Poproś o link potwierdzający',
    protected:'KNABA zarządza adresem logowania tego konta administracyjnego. Zmiana wymaga osobnej weryfikacji tożsamości.',
    oidc:'To konto jest połączone z Google lub Microsoft. Uzgodnij zmianę adresu logowania z KNABA, aby zachować dostęp.',
    emailUnavailable:'Potwierdzanie nowego adresu e-mail jest obecnie niedostępne. Obecny adres pozostaje aktywny.',emailRequested:'Jeśli nowy adres może być używany, zgłoszono prośbę o potwierdzenie. Do potwierdzenia obowiązuje obecny adres.',
    passwordTitle:'Zmień hasło',passwordIntro:'Potwierdź tożsamość obecnym hasłem. Po zmianie trzeba zalogować się ponownie we wszystkich sesjach.',
    currentPassword:'Obecne hasło',newPassword:'Nowe hasło',confirmPassword:'Powtórz nowe hasło',passwordRules:'8–256 znaków. Wybierz nowe, unikalne hasło.',passwordMismatch:'Hasła nie są takie same.',passwordSubmit:'Zmień hasło',passwordChanged:'Hasło zostało zmienione. Zaloguj się nowym hasłem.',
    recoverTitle:'Nie pamiętasz hasła?',recoveryIntro:'Podaj adres e-mail swojego konta KNABA. Jeśli odzyskanie dostępu jest możliwe, otrzymasz jednorazowy link.',recoverySubmit:'Poproś o link do odzyskania dostępu',
    recoverySent:'Zgłoszenie zostało przyjęte. Jeśli dla tego adresu dostępne jest odzyskanie konta, otrzymasz instrukcję. Sprawdź też folder spamu. Link jest ważny przez 30 minut.',
    recoveryUnavailable:'Odzyskiwanie dostępu przez e-mail jest obecnie niedostępne. Skontaktuj się z KNABA sprawdzonym sposobem.',contact:'Skontaktuj się z KNABA',
    resetTitle:'Ustaw nowe hasło',resetIntro:'Użyj osobistego linku odzyskiwania. Zapisanie nowego hasła zakończy wszystkie wcześniejsze sesje.',resetSubmit:'Zapisz nowe hasło',resetDone:'Hasło zostało zresetowane. Zaloguj się nowym hasłem.',
    confirmEmailTitle:'Potwierdź nowy adres e-mail',confirmEmailIntro:'Potwierdź tylko zmianę zleconą przez Ciebie. Następnie zaloguj się ponownie nowym adresem.',confirmEmailSubmit:'Potwierdź zmianę adresu',confirmEmailDone:'Nowy adres e-mail został potwierdzony. Zaloguj się nowym adresem.',
    token:'Osobisty kod',tokenHelp:'Otwórz pełny link z wiadomości lub wklej tutaj jego 43-znakowy kod. Kod jest jednorazowy i ważny przez 30 minut.',tokenReady:'Kod z Twojego linku jest gotowy.',enterToken:'Wprowadź inny kod',invalidToken:'Link jest nieprawidłowy, wygasł lub został już użyty. Poproś o nowy link.',
    sessionsIntro:'Sprawdzaj aktywne logowania i kończ sesje, których już nie potrzebujesz.',sessionStarted:'Zalogowano',sessionExpires:'Ważna do',sessionCurrent:'Bieżąca sesja',sessionOther:'Inna sesja',sessionEnd:'Zakończ sesję',sessionsOthers:'Zakończ inne sesje',sessionsAll:'Wyloguj się wszędzie',sessionsAllHint:'Wylogowanie wszędzie zakończy też bieżącą sesję.',sessionsEmpty:'Brak aktywnych sesji.',sessionZone:'Strefa czasowa',sessionsLimited:'Wyświetlono {count} z {total} aktywnych sesji, w tym bieżącą. Zakończenie innych sesji obejmie również dodatkowe sesje niewidoczne na liście.',
    validation:'Sprawdź dane i wymagania dotyczące hasła.',conflict:'Dane zostały już zmienione. Odśwież ustawienia i sprawdź wprowadzone dane.',unavailable:'Zmiana jest obecnie niedostępna. Spróbuj ponownie później.',limited:'Zbyt wiele prób. Poczekaj i spróbuj ponownie później.',unauthenticated:'Sesja wygasła. Zaloguj się ponownie.',saved:'Ustawienia zostały zapisane.',sessionsRevoked:'Wybrane sesje zostały zakończone.',
    roleLabel:'Dostęp',statusLabel:'Status',managedAccess:'KNABA zatwierdza Twoje uprawnienia dostępu.',
    roles:{owner:'Właściciel',admin:'Administracja',client:'Klient',worker:'Pracownik',partner:'Partner',bauleiter:'Kierownik budowy'},statuses:{pending:'Oczekuje na zatwierdzenie',approved:'Zatwierdzony',suspended:'Dostęp wstrzymany'}
  },
  lt:{
    settingsTitle:'Paskyros nustatymai',settingsIntro:'Jūsų asmens duomenys, prisijungimas ir aktyvūs seansai vienoje vietoje.',
    account:'Mano KNABA paskyra',backWorkspace:'Grįžti į mano darbo erdvę',backSettings:'Grįžti į paskyros nustatymus',backLogin:'Grįžti prie prisijungimo',skip:'Pereiti prie turinio',sections:'Paskyros skyriai',
    profile:'Profilis',security:'Saugumas',sessions:'Seansai',profileIntro:'Atnaujinkite savo kontaktinius duomenis. Žvaigždute pažymėti laukai yra privalomi.',
    name:'Vardas ir pavardė',phone:'Telefonas',company:'Įmonė / organizacija',address:'Kontaktinis adresas',optional:'neprivaloma',contactNote:'Šie duomenys nekeičia jūsų teisių ar prieigos prie įmonės.',
    language:'Pageidaujama kalba',timeZone:'Laiko juosta',timeZoneHelp:'Pavyzdžiui, Europe/Berlin. Toliau pateikti seansų laikai rodomi šioje laiko juostoje.',save:'Išsaugoti pakeitimus',
    email:'El. paštas',currentEmail:'Dabartinis prisijungimo adresas',newEmail:'Naujas el. pašto adresas',emailIntro:'Patvirtinkite pakeitimą dabartiniu slaptažodžiu, tada paspauskite į naują adresą atsiųstą nuorodą. Patvirtinus visi seansai bus baigti.',emailSubmit:'Prašyti patvirtinimo nuorodos',
    protected:'Šios administravimo paskyros prisijungimo adresą tvarko KNABA. Norint jį pakeisti, reikia atskirai patikrinti tapatybę.',
    oidc:'Ši paskyra susieta su Google arba Microsoft. Prisijungimo adreso keitimą suderinkite su KNABA, kad išsaugotumėte prieigą.',
    emailUnavailable:'Naujo el. pašto adreso patvirtinimas šiuo metu negalimas. Dabartinis adresas lieka galiojantis.',emailRequested:'Jei naują adresą galima naudoti, paprašyta patvirtinimo. Iki patvirtinimo galioja dabartinis adresas.',
    passwordTitle:'Keisti slaptažodį',passwordIntro:'Patvirtinkite tapatybę dabartiniu slaptažodžiu. Pakeitus jį reikės iš naujo prisijungti visuose seansuose.',
    currentPassword:'Dabartinis slaptažodis',newPassword:'Naujas slaptažodis',confirmPassword:'Pakartokite naują slaptažodį',passwordRules:'8–256 simboliai. Pasirinkite naują, unikalų slaptažodį.',passwordMismatch:'Slaptažodžiai nesutampa.',passwordSubmit:'Keisti slaptažodį',passwordChanged:'Slaptažodis pakeistas. Prisijunkite nauju slaptažodžiu.',
    recoverTitle:'Pamiršote slaptažodį?',recoveryIntro:'Įveskite savo KNABA paskyros el. pašto adresą. Jei atkūrimas galimas, gausite vienkartinę nuorodą.',recoverySubmit:'Prašyti atkūrimo nuorodos',
    recoverySent:'Prašymas priimtas. Jei šiuo adresu galima atkurti prieigą, gausite instrukcijas. Patikrinkite ir šlamšto aplanką. Nuoroda galioja 30 minučių.',
    recoveryUnavailable:'Atkūrimas el. paštu šiuo metu negalimas. Susisiekite su KNABA patikrintu būdu.',contact:'Susisiekti su KNABA',
    resetTitle:'Nustatyti naują slaptažodį',resetIntro:'Naudokite asmeninę atkūrimo nuorodą. Išsaugojus naują slaptažodį bus baigti visi ankstesni seansai.',resetSubmit:'Išsaugoti naują slaptažodį',resetDone:'Slaptažodis atkurtas. Prisijunkite nauju slaptažodžiu.',
    confirmEmailTitle:'Patvirtinti naują el. pašto adresą',confirmEmailIntro:'Patvirtinkite tik pakeitimą, kurio paprašėte patys. Tada iš naujo prisijunkite nauju adresu.',confirmEmailSubmit:'Patvirtinti adreso pakeitimą',confirmEmailDone:'Naujas el. pašto adresas patvirtintas. Prisijunkite nauju adresu.',
    token:'Asmeninis kodas',tokenHelp:'Atidarykite visą el. laiško nuorodą arba čia įklijuokite jos 43 simbolių kodą. Kodas yra vienkartinis ir galioja 30 minučių.',tokenReady:'Kodas iš jūsų nuorodos paruoštas.',enterToken:'Įvesti kitą kodą',invalidToken:'Nuoroda netinkama, nebegalioja arba jau panaudota. Paprašykite naujos nuorodos.',
    sessionsIntro:'Peržiūrėkite aktyvius prisijungimus ir baikite seansus, kurių nebereikia.',sessionStarted:'Prisijungta',sessionExpires:'Galioja iki',sessionCurrent:'Šis seansas',sessionOther:'Kitas seansas',sessionEnd:'Baigti seansą',sessionsOthers:'Baigti kitus seansus',sessionsAll:'Atsijungti visur',sessionsAllHint:'Atsijungus visur bus baigtas ir šis seansas.',sessionsEmpty:'Aktyvių seansų nėra.',sessionZone:'Laiko juosta',sessionsLimited:'Rodoma {count} iš {total} aktyvių seansų, įskaitant dabartinį. Baigus kitus seansus, bus baigti ir papildomi seansai, kurių nėra sąraše.',
    validation:'Patikrinkite duomenis ir slaptažodžio reikalavimus.',conflict:'Duomenys jau pasikeitė. Atnaujinkite nustatymų puslapį ir patikrinkite įvestus duomenis.',unavailable:'Šiuo metu pakeisti nepavyko. Bandykite vėliau.',limited:'Per daug bandymų. Palaukite ir bandykite vėliau.',unauthenticated:'Seansas baigėsi. Prisijunkite iš naujo.',saved:'Nustatymai išsaugoti.',sessionsRevoked:'Pasirinkti seansai baigti.',
    roleLabel:'Prieiga',statusLabel:'Būsena',managedAccess:'Jūsų prieigos teises patvirtina KNABA.',
    roles:{owner:'Savininkas',admin:'Administracija',client:'Klientas',worker:'Darbuotojas',partner:'Partneris',bauleiter:'Statybos vadovas'},statuses:{pending:'Laukiama patvirtinimo',approved:'Patvirtinta',suspended:'Prieiga pristabdyta'}
  }
};
for(const value of Object.values(words)){
  Object.freeze(value.roles);Object.freeze(value.statuses);Object.freeze(value);
}
Object.freeze(words);
export function accountWords(lang='de'){return words[authLanguage(lang)];}

const escapeHTML=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const e=escapeHTML;
const accountLink=(path,lang)=>path+'?lang='+authLanguage(lang);
const contactLink=lang=>(authLanguage(lang)==='de'?'':'/'+authLanguage(lang))+'/kontakt/';
const css=`
:root{color-scheme:light;--ink:#193e32;--muted:#4a655a;--green:#155b46;--line:#d2e2d7;--surface:#fff;--wash:#f2f6f2;--danger:#8c272d}
*{box-sizing:border-box}html{scroll-padding-top:1rem}body{margin:0;background:var(--wash);color:var(--ink);font:1rem/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--green);text-underline-offset:.2em}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}:focus-visible{outline:3px solid #117a57;outline-offset:3px}[hidden]{display:none!important}.skip{position:absolute;left:1rem;top:-10rem;background:var(--surface);padding:.65rem 1rem;border:2px solid var(--green);z-index:2}.skip:focus{top:1rem}.account-wrap{width:min(1060px,calc(100% - 2rem));margin:0 auto;padding:2rem 0 3rem;min-width:0}.account-top{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:2rem}.brand{font-size:1.3rem;font-weight:850;letter-spacing:.08em;text-decoration:none;color:var(--green)}.account-back{font-size:.9rem;font-weight:650;max-width:100%;overflow-wrap:anywhere}.eyebrow{margin:0 0 .35rem;color:var(--green);font-size:.75rem;font-weight:750;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(1.8rem,5vw,2.4rem);line-height:1.18;letter-spacing:-.035em;margin:.25rem 0 .85rem;overflow-wrap:anywhere}h2{font-size:1.25rem;line-height:1.3;margin:0 0 .55rem}h3{font-size:1rem;line-height:1.4;margin:0 0 .45rem}p{margin:.5rem 0 1rem}header .intro{max-width:62ch;color:var(--muted);margin-bottom:1.5rem}.account-layout{display:grid;grid-template-columns:minmax(0,210px) minmax(0,1fr);gap:1.5rem;align-items:start}.account-side{position:sticky;top:1rem;min-width:0}.section-nav{display:grid;gap:.4rem}.section-nav a{padding:.75rem 1rem;border:1px solid var(--line);border-radius:.75rem;background:#ffffff90;text-decoration:none;font-weight:700;overflow-wrap:anywhere}.section-nav a:hover{background:#e5f1e9;border-color:#92b5a2}.account-meta{padding:1rem;margin:1rem 0 0;border-left:2px solid #a7c7b4;font-size:.85rem;overflow-wrap:anywhere}.account-meta p{margin:0 0 .7rem;color:var(--muted)}.account-meta dl{margin:0;display:grid;gap:.2rem}.account-meta dt{color:var(--muted);font-size:.8rem}.account-meta dd{font-weight:650;margin:0 0 .65rem}.account-main{min-width:0}.card{padding:1.6rem;border:1px solid var(--line);border-radius:1rem;background:var(--surface);box-shadow:0 8px 28px #193e3205;min-width:0;margin-bottom:1.25rem;scroll-margin-top:1rem}.card>p,.help{color:var(--muted);font-size:.9rem}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.field{min-width:0}.full{grid-column:1/-1}label{display:block;font-size:.9rem;font-weight:650;margin-bottom:.35rem;overflow-wrap:anywhere}.optional{font-size:.8rem;font-weight:400;color:var(--muted)}input,select{display:block;width:100%;max-width:100%;min-width:0;padding:.72rem .8rem;min-height:46px;border:1px solid #9eb7a9;border-radius:.55rem;background:#fff;color:var(--ink)}input[readonly]{background:#f1f5f2;color:var(--muted)}input[type=hidden]{display:none}.help{margin:.4rem 0 .75rem;overflow-wrap:anywhere}fieldset{border:0;margin:0;padding:0;min-width:0}legend{font-weight:700;padding:0;margin:0 0 1rem}.form-actions{display:flex;gap:.7rem;align-items:center;flex-wrap:wrap;margin-top:1.2rem}button,.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:.72rem 1rem;border:1px solid var(--green);border-radius:.6rem;background:var(--green);color:#fff;font-weight:650;line-height:1.35;cursor:pointer;text-decoration:none;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:center}button:hover,.button:hover{background:#104b39}.secondary{color:var(--green);background:#fff}.secondary:hover{background:#edf5ef}.danger{color:var(--danger);background:#fff;border-color:#d9b2b4}.danger:hover{background:#fff3f3}.status{border:1px solid #91bfa6;border-radius:.7rem;background:#edf8f1;color:#185137;padding:.85rem 1rem;margin:0 0 1.25rem;overflow-wrap:anywhere}.error{border-color:#d9a6ab;background:#fff0f1;color:#87232d}.info{border-left:3px solid #9abda9;border-radius:0 .5rem .5rem 0;background:#f4f8f5;padding:.8rem 1rem;color:var(--muted);font-size:.9rem;overflow-wrap:anywhere}.security-block+.security-block{border-top:1px solid var(--line);padding-top:1.25rem;margin-top:1.25rem}.security-block p{font-size:.9rem;color:var(--muted)}.session-list{list-style:none;padding:0;margin:1rem 0}.session-item{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0;border-top:1px solid var(--line);min-width:0}.session-item>div{min-width:0}.session-item p{font-size:.85rem;margin:.2rem 0;color:var(--muted);overflow-wrap:anywhere}.session-item form{flex-shrink:0}.current-badge{display:inline-block;font-size:.75rem;border-radius:99px;background:#e1f1e6;color:#175137;padding:.18rem .6rem;margin-bottom:.4rem;font-weight:650}.session-actions{padding-top:.25rem}.session-actions form{max-width:100%}.single{max-width:600px}.single .card{padding:1.75rem}.single header .intro{margin-bottom:1.25rem}.single .field+.field{margin-top:1rem}.standalone-links{display:flex;flex-wrap:wrap;gap:.7rem 1.25rem;font-size:.9rem;margin-top:1.25rem}.token-field input{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9rem}.token-ready{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:0 0 1rem}.token-ready p{margin:0;color:var(--green);font-size:.9rem}.token-ready button{font-size:.8rem;min-height:44px;padding:.45rem .7rem}.security-links{display:flex;flex-wrap:wrap;gap:.7rem 1.2rem;align-items:center}.required{color:#8b3034}
@media(max-width:760px){.account-layout{grid-template-columns:minmax(0,1fr)}.account-side{position:static}.section-nav{grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem}.section-nav a{text-align:center;padding:.7rem .35rem;font-size:.85rem}.account-meta{margin:.85rem 0 0;padding:.6rem .85rem}.account-meta p{margin-bottom:.4rem}.account-meta dl{display:flex;gap:.3rem .6rem;align-items:baseline;flex-wrap:wrap}.account-meta dd{margin:0 .65rem 0 0}.account-top{margin-bottom:1.5rem}.card{padding:1.25rem}.session-item{align-items:start;flex-direction:column;gap:.6rem}}
@media(max-width:480px){.account-wrap{width:calc(100% - 1.5rem);padding-top:1.25rem}.form-grid{grid-template-columns:minmax(0,1fr)}.single .card{padding:1.25rem}.form-actions>button,.session-actions form,.session-actions button{width:100%}.account-top{align-items:start}.section-nav a{font-size:.8rem}.session-item form,.session-item button{width:100%}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

function message(content,{error=false}={}){
  if(!content)return '';
  return '<p id="'+(error?'account-error':'account-notice')+'" class="status'+(error?' error':'')+'" role="'+(error?'alert':'status')+'"'+(error?' tabindex="-1"':'')+'>'+e(content)+'</p>';
}
function shell({lang,title,intro,content,backPath,backLabel,single=false,error=''}){
  const locale=authLanguage(lang),w=accountWords(locale);
  return '<!doctype html><html lang="'+locale+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+e(title)+' · KNABA</title><style>'+css+'</style></head><body><a class="skip" href="#account-main">'+e(w.skip)+'</a><div class="account-wrap'+(single?' single':'')+'"><div class="account-top"><a class="brand" href="'+accountLink('/konto/',locale)+'" aria-label="KNABA">KNABA</a><a class="account-back" href="'+e(backPath)+'">← '+e(backLabel)+'</a></div><header><p class="eyebrow">'+e(w.account)+'</p><h1>'+e(title)+'</h1><p class="intro">'+e(intro)+'</p></header>'+content+'</div>'+(error?'<script>document.getElementById("account-error")?.focus();</script>':'')+'</body></html>';
}
function requiredLabel(label){return e(label)+' <span class="required" aria-hidden="true">*</span>';}
function field({name,label,value='',type='text',required=false,min,max,autocomplete,help='',list,mismatchMessage}){
  const id='account-'+name;
  return '<div class="field"><label for="'+id+'">'+(required?requiredLabel(label):e(label))+'</label><input id="'+id+'" name="'+name+'" type="'+type+'"'+(type==='password'?'':' value="'+e(value)+'"')+
    (required?' required':'')+(min!==undefined?' minlength="'+min+'"':'')+(max!==undefined?' maxlength="'+max+'"':'')+
    (autocomplete?' autocomplete="'+autocomplete+'"':'')+(type==='email'?' inputmode="email" autocapitalize="none" spellcheck="false"':'')+
    (type==='tel'?' inputmode="tel"':'')+(list?' list="'+list+'" autocapitalize="none" spellcheck="false"':'')+(help?' aria-describedby="'+id+'-help"':'')+(mismatchMessage?' data-mismatch-message="'+e(mismatchMessage)+'"':'')+'>'+
    (help?'<p class="help" id="'+id+'-help">'+e(help)+'</p>':'')+'</div>';
}
function passwordFields(w,{current=false}={}){
  return (current?field({name:'current',label:w.currentPassword,type:'password',required:true,max:256,autocomplete:'current-password'}):'')+
    field({name:'new',label:w.newPassword,type:'password',required:true,min:8,max:256,autocomplete:'new-password',help:w.passwordRules})+
    field({name:'confirm',label:w.confirmPassword,type:'password',required:true,min:8,max:256,autocomplete:'new-password',mismatchMessage:w.passwordMismatch});
}
function timeZone(raw){
  try{if(typeof raw==='string'&&raw.length<=100){new Intl.DateTimeFormat('en',{timeZone:raw});return raw;}}catch{/* A malformed stored preference must not break the account page. */}
  return 'Europe/Berlin';
}
function sessionTime(seconds,lang,zone){
  if(typeof seconds!=='number'||!Number.isFinite(seconds))return '—';
  const date=new Date(seconds*1000);
  if(!Number.isFinite(date.valueOf()))return '—';
  const text=new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(date);
  return '<time datetime="'+e(date.toISOString())+'">'+e(text)+'</time>';
}
function sessionForm(target,label,lang,{danger=false,describedBy=''}={}){
  return '<form method="post" action="'+accountLink('/account/sessions/',lang)+'"><input type="hidden" name="target" value="'+e(target)+'"><button type="submit" class="'+(danger?'danger':'secondary')+'"'+(describedBy?' aria-describedby="'+describedBy+'"':'')+'>'+e(label)+'</button></form>';
}

export {shell as accountShell,field as accountField,escapeHTML as accountEscape,accountLink};

export function accountSettingsPage({account,lang='de',notice='',error='',mailEnabled=false,federationEnabled=false,federationLabel=''}){
  const locale=authLanguage(lang),w=accountWords(locale),zone=timeZone(account.timeZone);
  const accessLabel=Object.hasOwn(w.roles,account.role)?w.roles[account.role]:'',statusLabel=Object.hasOwn(w.statuses,account.status)?w.statuses[account.status]:'';
  const meta='<div class="account-meta"><p>'+e(w.managedAccess)+'</p><dl>'+(accessLabel?'<dt>'+e(w.roleLabel)+'</dt><dd>'+e(accessLabel)+'</dd>':'')+(statusLabel?'<dt>'+e(w.statusLabel)+'</dt><dd>'+e(statusLabel)+'</dd>':'')+'</dl></div>';
  const profile='<section id="profile" class="card" aria-labelledby="profile-title"><h2 id="profile-title">'+e(w.profile)+'</h2><p>'+e(w.profileIntro)+'</p><form method="post" action="'+accountLink('/account/settings/',locale)+'"'+(error?' aria-describedby="account-error"':'')+'><input type="hidden" name="version" value="'+e(account.version)+'"><div class="form-grid">'+
    field({name:'name',label:w.name,value:account.name,required:true,min:2,max:160,autocomplete:'name'})+
    field({name:'phone',label:w.phone+' ('+w.optional+')',value:account.phone,type:'tel',max:40,autocomplete:'tel'})+
    field({name:'company',label:w.company+' ('+w.optional+')',value:account.company,max:160,autocomplete:'organization'})+
    field({name:'address',label:w.address+' ('+w.optional+')',value:account.address,max:500,autocomplete:'street-address'})+
    '<div class="field"><label for="account-locale">'+requiredLabel(w.language)+'</label><select name="locale" id="account-locale" required>'+Object.entries(languages).map(([code,label])=>'<option value="'+code+'"'+(code===authLanguage(account.locale)?' selected':'')+'>'+e(label)+'</option>').join('')+'</select></div>'+
    field({name:'timeZone',label:w.timeZone,value:zone,required:true,max:100,help:w.timeZoneHelp,list:'account-time-zones'})+
    '<datalist id="account-time-zones">'+['Europe/Berlin','Europe/Kyiv','Europe/Vilnius','Europe/Warsaw','Europe/Prague','Europe/London','UTC'].map(value=>'<option value="'+value+'"></option>').join('')+'</datalist></div><p class="help">'+e(w.contactNote)+'</p><div class="form-actions"><button type="submit">'+e(w.save)+'</button></div></form></section>';
  const emailBlocked=account.emailChangeBlockedReason==='oidc'?w.oidc:w.protected;
  const emailForm=mailEnabled&&account.emailChangeAllowed
    ?'<p>'+e(w.emailIntro)+'</p><form method="post" action="'+accountLink('/account/email/',locale)+'"><div class="form-grid">'+field({name:'email',label:w.newEmail,type:'email',required:true,max:320,autocomplete:'email'})+field({name:'current',label:w.currentPassword,type:'password',required:true,max:256,autocomplete:'current-password'})+'</div><div class="form-actions"><button type="submit" class="secondary">'+e(w.emailSubmit)+'</button></div></form>'
    :'<p class="info">'+e(account.emailChangeAllowed?w.emailUnavailable:emailBlocked)+'</p>';
  const security='<section id="security" class="card" aria-labelledby="security-title"><h2 id="security-title">'+e(w.security)+'</h2><div class="security-block"><h3>'+e(w.email)+'</h3><label for="account-current-email">'+e(w.currentEmail)+'</label><input id="account-current-email" type="email" readonly value="'+e(account.email)+'">'+emailForm+'</div><div class="security-block"><h3>'+e(w.passwordTitle)+'</h3><p>'+e(w.passwordIntro)+'</p><div class="security-links"><a class="button secondary" href="'+accountLink('/account/password/',locale)+'">'+e(w.passwordTitle)+'</a><a href="'+accountLink('/forgot-password/',locale)+'">'+e(w.recoverTitle)+'</a></div></div></section>';
  const records=Array.isArray(account.sessions)?account.sessions:[];
  const sessionList=records.length?'<ul class="session-list">'+records.map(session=>'<li class="session-item"><div>'+(session.current?'<span class="current-badge">'+e(w.sessionCurrent)+'</span>':'<h3>'+e(w.sessionOther)+'</h3>')+'<p>'+e(w.sessionStarted)+': '+sessionTime(session.createdAt,locale,zone)+'</p><p>'+e(w.sessionExpires)+': '+sessionTime(session.expiresAt,locale,zone)+'</p></div>'+sessionForm(session.id,w.sessionEnd,locale,{describedBy:session.current?'sessions-all-help':''})+'</li>').join('')+'</ul>':'<p class="help">'+e(w.sessionsEmpty)+'</p>';
  const sessionsLimited=account.sessionsLimited===true;
  const formatNumber=new Intl.NumberFormat(locale),sessionTotal=Number.isSafeInteger(account.sessionCount)&&account.sessionCount>=records.length?formatNumber.format(account.sessionCount):'…';
  const sessions='<section id="sessions" class="card" aria-labelledby="sessions-title"><h2 id="sessions-title">'+e(w.sessions)+'</h2><p>'+e(w.sessionsIntro)+'</p><p class="help">'+e(w.sessionZone)+': '+e(zone)+'</p>'+(sessionsLimited?'<p class="info">'+e(w.sessionsLimited.replace('{count}',formatNumber.format(records.length)).replace('{total}',sessionTotal))+'</p>':'')+sessionList+(records.length||sessionsLimited?'<div class="form-actions session-actions">'+(sessionsLimited||records.some(session=>!session.current)?sessionForm('others',w.sessionsOthers,locale):'')+sessionForm('all',w.sessionsAll,locale,{danger:true,describedBy:'sessions-all-help'})+'</div><p id="sessions-all-help" class="help">'+e(w.sessionsAllHint)+'</p>':'')+'</section>';
  return shell({lang:locale,title:w.settingsTitle,intro:w.settingsIntro,backPath:accountLink('/konto/',locale),backLabel:w.backWorkspace,error,
    content:'<div class="account-layout"><aside class="account-side"><nav class="section-nav" aria-label="'+e(w.sections)+'"><a href="#profile">'+e(w.profile)+'</a><a href="#security">'+e(w.security)+'</a><a href="#sessions">'+e(w.sessions)+'</a>'+(federationEnabled?'<a href="'+accountLink('/account/erp-link/',locale)+'">'+e(federationLabel)+'</a>':'')+'</nav>'+meta+'</aside><main class="account-main" id="account-main" tabindex="-1">'+message(error,{error:true})+message(notice)+profile+security+sessions+'</main></div>'});
}

export function accountRecoveryPage({lang='de',sent=false,error='',mailEnabled=false}={}){
  const locale=authLanguage(lang),w=accountWords(locale);
  const content=mailEnabled?(sent?message(w.recoverySent):'<form method="post" action="'+accountLink('/forgot-password/',locale)+'"'+(error?' aria-describedby="account-error"':'')+'>'+field({name:'email',label:w.email,type:'email',required:true,max:320,autocomplete:'username'})+'<div class="form-actions"><button type="submit">'+e(w.recoverySubmit)+'</button></div></form>'):'<p class="info">'+e(w.recoveryUnavailable)+'</p><a class="button secondary" href="'+contactLink(locale)+'">'+e(w.contact)+'</a>';
  return shell({lang:locale,title:w.recoverTitle,intro:w.recoveryIntro,backPath:accountLink('/login/',locale),backLabel:w.backLogin,single:true,error,
    content:'<main id="account-main" tabindex="-1" class="card">'+message(error,{error:true})+content+'<div class="standalone-links"><a href="'+accountLink('/account/password/',locale)+'">'+e(w.passwordTitle)+'</a></div></main>'});
}

export function accountPasswordPage({lang='de',error=''}={}){
  const locale=authLanguage(lang),w=accountWords(locale);
  return shell({lang:locale,title:w.passwordTitle,intro:w.passwordIntro,backPath:accountLink('/account/settings/',locale),backLabel:w.backSettings,single:true,error,
    content:'<main id="account-main" tabindex="-1" class="card">'+message(error,{error:true})+'<form method="post" action="'+accountLink('/account/password/',locale)+'"'+(error?' aria-describedby="account-error"':'')+'>'+passwordFields(w,{current:true})+'<div class="form-actions"><button type="submit">'+e(w.passwordSubmit)+'</button></div></form><div class="standalone-links"><a href="'+accountLink('/forgot-password/',locale)+'">'+e(w.recoverTitle)+'</a></div><script>(function(){'+passwordValidation+'})();</script></main>'});
}

// Native validity prevents a confirmation typo from consuming a round trip after
// a fragment was cleared. The server still validates every posted credential.
const passwordValidation=`
  const next=document.getElementById('account-new');
  const confirm=document.getElementById('account-confirm');
  if(next&&confirm){
    const validate=function(){
      confirm.setCustomValidity(confirm.value&&confirm.value!==next.value?confirm.dataset.mismatchMessage:'');
    };
    next.addEventListener('input',validate);confirm.addEventListener('input',validate);
  }
`;

// The original HTML supports manual entry without JavaScript. A valid URL fragment
// is moved into the POST field and removed from browser history; no request occurs.
const tokenScript=`(function(){${passwordValidation}
  const field=document.getElementById('account-token');
  const entry=document.getElementById('account-token-entry');
  const ready=document.getElementById('account-token-ready');
  const edit=document.getElementById('account-token-edit');
  const fragment=new URLSearchParams(location.hash.slice(1));
  const values=fragment.getAll('token');
  const token=values.length===1&&[...fragment.keys()].length===1?values[0]:'';
  history.replaceState(null,'',location.pathname+location.search);
  if(!field||!entry||!ready||!edit)return;
  if(/^[A-Za-z0-9_-]{43}$/.test(token)){
    field.value=token;field.type='hidden';entry.hidden=true;ready.hidden=false;
  }
  edit.addEventListener('click',function(){
    field.type='text';field.value='';entry.hidden=false;ready.hidden=true;field.focus();
  });
})();`;

export function accountTokenPage({kind,lang='de',done=false,error=''}){
  if(kind!=='password_reset'&&kind!=='email_change')throw new TypeError('Unknown account capability kind');
  const locale=authLanguage(lang),w=accountWords(locale),reset=kind==='password_reset';
  const title=reset?w.resetTitle:w.confirmEmailTitle,intro=reset?w.resetIntro:w.confirmEmailIntro;
  const target=reset?'/reset-password/':'/account/email/confirm/';
  const content=done?message(reset?w.resetDone:w.confirmEmailDone)+'<a class="button" href="'+accountLink('/login/',locale)+'">'+e(w.backLogin)+'</a>':
    '<form method="post" action="'+accountLink(target,locale)+'"'+(error?' aria-describedby="account-error"':'')+'><div class="field token-field" id="account-token-entry"><label for="account-token">'+requiredLabel(w.token)+'</label><input id="account-token" name="token" type="text" required minlength="43" maxlength="43" pattern="[A-Za-z0-9_\\-]{43}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="account-token-help"><p id="account-token-help" class="help">'+e(w.tokenHelp)+'</p></div><div id="account-token-ready" class="token-ready" hidden><p role="status">'+e(w.tokenReady)+'</p><button id="account-token-edit" class="secondary" type="button">'+e(w.enterToken)+'</button></div>'+(reset?passwordFields(w):'')+'<div class="form-actions"><button type="submit">'+e(reset?w.resetSubmit:w.confirmEmailSubmit)+'</button></div></form><div class="standalone-links"><a href="'+accountLink(reset?'/forgot-password/':'/account/settings/',locale)+'">'+e(reset?w.recoverTitle:w.backSettings)+'</a></div><script>'+tokenScript+'</script>';
  return shell({lang:locale,title,intro,backPath:accountLink('/login/',locale),backLabel:w.backLogin,single:true,error,
    content:'<main id="account-main" tabindex="-1" class="card">'+message(error,{error:true})+content+'</main>'});
}
