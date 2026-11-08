/** Localized recovery pages. Credentials and capabilities are never rendered into HTML. */
import {authLanguage} from './auth-locale.mjs';

const words={
  "de": {
    "account": "Mein KNABA-Konto",
    "backLogin": "Zur Anmeldung",
    "skip": "Zum Inhalt",
    "email": "E-Mail",
    "passwordTitle": "Passwort ändern",
    "currentPassword": "Aktuelles Passwort",
    "newPassword": "Neues Passwort",
    "confirmPassword": "Neues Passwort wiederholen",
    "passwordRules": "8–256 Zeichen. Wählen Sie ein neues, einzigartiges Passwort.",
    "passwordMismatch": "Die Passwörter stimmen nicht überein.",
    "recoverTitle": "Passwort vergessen?",
    "recoveryIntro": "Geben Sie die E-Mail-Adresse Ihres KNABA-Kontos ein. Sofern eine Wiederherstellung möglich ist, erhalten Sie einen einmaligen Link.",
    "recoverySubmit": "Link zur Wiederherstellung anfordern",
    "recoverySent": "Die Anfrage wurde angenommen. Falls für diese Adresse eine Wiederherstellung möglich ist, erhalten Sie eine Anleitung. Prüfen Sie auch den Spamordner. Ein Link gilt 30 Minuten.",
    "recoveryUnavailable": "Die Wiederherstellung per E-Mail ist zurzeit nicht verfügbar. Wenden Sie sich über einen verifizierten Kontaktweg an KNABA.",
    "contact": "KNABA kontaktieren",
    "resetTitle": "Neues Passwort festlegen",
    "resetIntro": "Verwenden Sie Ihren persönlichen Wiederherstellungslink. Nach dem Speichern werden alle bisherigen Sitzungen beendet.",
    "resetSubmit": "Neues Passwort speichern",
    "resetDone": "Ihr Passwort wurde zurückgesetzt. Melden Sie sich mit Ihrem neuen Passwort an.",
    "token": "Persönlicher Code",
    "tokenHelp": "Öffnen Sie den vollständigen Link aus Ihrer E-Mail oder fügen Sie dessen 43-stelligen Code hier ein. Der Code ist einmalig und 30 Minuten gültig.",
    "tokenReady": "Der Code aus Ihrem Link ist bereit.",
    "enterToken": "Anderen Code eingeben",
    "invalidToken": "Dieser Link ist ungültig, abgelaufen oder bereits verwendet. Fordern Sie einen neuen Link an.",
    "validation": "Prüfen Sie Ihre Angaben und die Passwortanforderungen.",
    "unavailable": "Die Änderung ist derzeit nicht möglich. Bitte versuchen Sie es später erneut.",
    "unauthenticated": "Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an."
  },
  "en": {
    "account": "My KNABA account",
    "backLogin": "Back to sign-in",
    "skip": "Skip to content",
    "email": "Email",
    "passwordTitle": "Change password",
    "currentPassword": "Current password",
    "newPassword": "New password",
    "confirmPassword": "Repeat new password",
    "passwordRules": "8–256 characters. Choose a new, unique password.",
    "passwordMismatch": "The passwords do not match.",
    "recoverTitle": "Forgot password?",
    "recoveryIntro": "Enter the email address of your KNABA account. If recovery is available, you will receive a single-use link.",
    "recoverySubmit": "Request recovery link",
    "recoverySent": "Your request has been accepted. If this address is eligible for recovery, you will receive instructions. Check your spam folder too. A link expires after 30 minutes.",
    "recoveryUnavailable": "Email recovery is currently unavailable. Contact KNABA through a verified channel.",
    "contact": "Contact KNABA",
    "resetTitle": "Set a new password",
    "resetIntro": "Use your personal recovery link. Saving a new password ends all previous sessions.",
    "resetSubmit": "Save new password",
    "resetDone": "Your password has been reset. Sign in with your new password.",
    "token": "Personal code",
    "tokenHelp": "Open the complete link from your email or paste its 43-character code here. The code is single-use and expires after 30 minutes.",
    "tokenReady": "The code from your link is ready.",
    "enterToken": "Enter a different code",
    "invalidToken": "This link is invalid, expired or already used. Request a new link.",
    "validation": "Check your details and the password requirements.",
    "unavailable": "This change is currently unavailable. Please try again later.",
    "unauthenticated": "Your session has expired. Sign in again."
  },
  "pl": {
    "account": "Moje konto KNABA",
    "backLogin": "Wróć do logowania",
    "skip": "Przejdź do treści",
    "email": "E-mail",
    "passwordTitle": "Zmień hasło",
    "currentPassword": "Obecne hasło",
    "newPassword": "Nowe hasło",
    "confirmPassword": "Powtórz nowe hasło",
    "passwordRules": "8–256 znaków. Wybierz nowe, unikalne hasło.",
    "passwordMismatch": "Hasła nie są takie same.",
    "recoverTitle": "Nie pamiętasz hasła?",
    "recoveryIntro": "Podaj adres e-mail swojego konta KNABA. Jeśli odzyskanie dostępu jest możliwe, otrzymasz jednorazowy link.",
    "recoverySubmit": "Poproś o link do odzyskania dostępu",
    "recoverySent": "Zgłoszenie zostało przyjęte. Jeśli dla tego adresu dostępne jest odzyskanie konta, otrzymasz instrukcję. Sprawdź też folder spamu. Link jest ważny przez 30 minut.",
    "recoveryUnavailable": "Odzyskiwanie dostępu przez e-mail jest obecnie niedostępne. Skontaktuj się z KNABA sprawdzonym sposobem.",
    "contact": "Skontaktuj się z KNABA",
    "resetTitle": "Ustaw nowe hasło",
    "resetIntro": "Użyj osobistego linku odzyskiwania. Zapisanie nowego hasła zakończy wszystkie wcześniejsze sesje.",
    "resetSubmit": "Zapisz nowe hasło",
    "resetDone": "Hasło zostało zresetowane. Zaloguj się nowym hasłem.",
    "token": "Osobisty kod",
    "tokenHelp": "Otwórz pełny link z wiadomości lub wklej tutaj jego 43-znakowy kod. Kod jest jednorazowy i ważny przez 30 minut.",
    "tokenReady": "Kod z Twojego linku jest gotowy.",
    "enterToken": "Wprowadź inny kod",
    "invalidToken": "Link jest nieprawidłowy, wygasł lub został już użyty. Poproś o nowy link.",
    "validation": "Sprawdź dane i wymagania dotyczące hasła.",
    "unavailable": "Zmiana jest obecnie niedostępna. Spróbuj ponownie później.",
    "unauthenticated": "Sesja wygasła. Zaloguj się ponownie."
  },
  "lt": {
    "account": "Mano KNABA paskyra",
    "backLogin": "Grįžti prie prisijungimo",
    "skip": "Pereiti prie turinio",
    "email": "El. paštas",
    "passwordTitle": "Keisti slaptažodį",
    "currentPassword": "Dabartinis slaptažodis",
    "newPassword": "Naujas slaptažodis",
    "confirmPassword": "Pakartokite naują slaptažodį",
    "passwordRules": "8–256 simboliai. Pasirinkite naują, unikalų slaptažodį.",
    "passwordMismatch": "Slaptažodžiai nesutampa.",
    "recoverTitle": "Pamiršote slaptažodį?",
    "recoveryIntro": "Įveskite savo KNABA paskyros el. pašto adresą. Jei atkūrimas galimas, gausite vienkartinę nuorodą.",
    "recoverySubmit": "Prašyti atkūrimo nuorodos",
    "recoverySent": "Prašymas priimtas. Jei šiuo adresu galima atkurti prieigą, gausite instrukcijas. Patikrinkite ir šlamšto aplanką. Nuoroda galioja 30 minučių.",
    "recoveryUnavailable": "Atkūrimas el. paštu šiuo metu negalimas. Susisiekite su KNABA patikrintu būdu.",
    "contact": "Susisiekti su KNABA",
    "resetTitle": "Nustatyti naują slaptažodį",
    "resetIntro": "Naudokite asmeninę atkūrimo nuorodą. Išsaugojus naują slaptažodį bus baigti visi ankstesni seansai.",
    "resetSubmit": "Išsaugoti naują slaptažodį",
    "resetDone": "Slaptažodis atkurtas. Prisijunkite nauju slaptažodžiu.",
    "token": "Asmeninis kodas",
    "tokenHelp": "Atidarykite visą el. laiško nuorodą arba čia įklijuokite jos 43 simbolių kodą. Kodas yra vienkartinis ir galioja 30 minučių.",
    "tokenReady": "Kodas iš jūsų nuorodos paruoštas.",
    "enterToken": "Įvesti kitą kodą",
    "invalidToken": "Nuoroda netinkama, nebegalioja arba jau panaudota. Paprašykite naujos nuorodos.",
    "validation": "Patikrinkite duomenis ir slaptažodžio reikalavimus.",
    "unavailable": "Šiuo metu pakeisti nepavyko. Bandykite vėliau.",
    "unauthenticated": "Seansas baigėsi. Prisijunkite iš naujo."
  },
  "ru": {
    "account": "Моя учётная запись KNABA",
    "backLogin": "К входу",
    "skip": "Перейти к содержимому",
    "email": "Электронная почта",
    "passwordTitle": "Изменить пароль",
    "currentPassword": "Текущий пароль",
    "newPassword": "Новый пароль",
    "confirmPassword": "Повторите новый пароль",
    "passwordRules": "8–256 символов. Выберите новый уникальный пароль.",
    "passwordMismatch": "Пароли не совпадают.",
    "recoverTitle": "Забыли пароль?",
    "recoveryIntro": "Введите адрес учётной записи KNABA. Если восстановление доступно, вы получите одноразовую ссылку.",
    "recoverySubmit": "Запросить ссылку для восстановления",
    "recoverySent": "Запрос принят. Если для этого адреса доступно восстановление, вы получите инструкцию. Проверьте также папку «Спам». Ссылка действует 30 минут.",
    "recoveryUnavailable": "Восстановление по email сейчас недоступно. Свяжитесь с KNABA проверенным способом.",
    "contact": "Связаться с KNABA",
    "resetTitle": "Установить новый пароль",
    "resetIntro": "Используйте персональную ссылку восстановления. Сохранение нового пароля завершит все предыдущие сессии.",
    "resetSubmit": "Сохранить новый пароль",
    "resetDone": "Пароль восстановлен. Войдите с новым паролем.",
    "token": "Персональный код",
    "tokenHelp": "Откройте полную ссылку из письма или вставьте здесь её код из 43 символов. Код одноразовый и действует 30 минут.",
    "tokenReady": "Код из вашей ссылки готов.",
    "enterToken": "Ввести другой код",
    "invalidToken": "Ссылка недействительна, просрочена или уже использована. Запросите новую ссылку.",
    "validation": "Проверьте введённые данные и требования к паролю.",
    "unavailable": "Сейчас не удалось выполнить изменение. Попробуйте позже.",
    "unauthenticated": "Сессия завершена. Войдите повторно."
  },
  "uk": {
    "account": "Мій обліковий запис KNABA",
    "backLogin": "До входу",
    "skip": "Перейти до вмісту",
    "email": "Електронна пошта",
    "passwordTitle": "Змінити пароль",
    "currentPassword": "Поточний пароль",
    "newPassword": "Новий пароль",
    "confirmPassword": "Повторіть новий пароль",
    "passwordRules": "8–256 символів. Оберіть новий унікальний пароль.",
    "passwordMismatch": "Паролі не збігаються.",
    "recoverTitle": "Забули пароль?",
    "recoveryIntro": "Введіть адресу облікового запису KNABA. Якщо відновлення доступне, ви отримаєте одноразове посилання.",
    "recoverySubmit": "Отримати посилання для відновлення",
    "recoverySent": "Запит прийнято. Якщо для цієї адреси доступне відновлення, ви отримаєте інструкцію. Перевірте також папку «Спам». Посилання діє 30 хвилин.",
    "recoveryUnavailable": "Відновлення через email зараз недоступне. Зверніться до KNABA перевіреним способом.",
    "contact": "Зв’язатися з KNABA",
    "resetTitle": "Установити новий пароль",
    "resetIntro": "Скористайтеся персональним посиланням відновлення. Збереження нового пароля завершить усі попередні сесії.",
    "resetSubmit": "Зберегти новий пароль",
    "resetDone": "Пароль відновлено. Увійдіть із новим паролем.",
    "token": "Персональний код",
    "tokenHelp": "Відкрийте повне посилання з листа або вставте тут його код із 43 символів. Код одноразовий і діє 30 хвилин.",
    "tokenReady": "Код із вашого посилання готовий.",
    "enterToken": "Ввести інший код",
    "invalidToken": "Посилання недійсне, прострочене або вже використане. Запросіть нове посилання.",
    "validation": "Перевірте введені дані та вимоги до пароля.",
    "unavailable": "Зараз не вдалося виконати зміну. Спробуйте пізніше.",
    "unauthenticated": "Сесію завершено. Увійдіть повторно."
  }
};
for(const value of Object.values(words))Object.freeze(value);
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
export function accountRecoveryPage({lang='de',sent=false,error='',mailEnabled=false}={}){
  const locale=authLanguage(lang),w=accountWords(locale);
  const content=mailEnabled?(sent?message(w.recoverySent):'<form method="post" action="'+accountLink('/forgot-password/',locale)+'"'+(error?' aria-describedby="account-error"':'')+'>'+field({name:'email',label:w.email,type:'email',required:true,max:320,autocomplete:'username'})+'<div class="form-actions"><button type="submit">'+e(w.recoverySubmit)+'</button></div></form>'):'<p class="info">'+e(w.recoveryUnavailable)+'</p><a class="button secondary" href="'+contactLink(locale)+'">'+e(w.contact)+'</a>';
  return shell({lang:locale,title:w.recoverTitle,intro:w.recoveryIntro,backPath:accountLink('/login/',locale),backLabel:w.backLogin,single:true,error,
    content:'<main id="account-main" tabindex="-1" class="card">'+message(error,{error:true})+content+'<div class="standalone-links"><a href="'+accountLink('/account/password/',locale)+'">'+e(w.passwordTitle)+'</a></div></main>'});
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

export function accountResetPage({lang='de',done=false,error=''}={}){
  const locale=authLanguage(lang),w=accountWords(locale);
  const title=w.resetTitle,intro=w.resetIntro;
  const target='/reset-password/';
  const content=done?message(w.resetDone)+'<a class="button" href="'+accountLink('/login/',locale)+'">'+e(w.backLogin)+'</a>':
    '<form method="post" action="'+accountLink(target,locale)+'"'+(error?' aria-describedby="account-error"':'')+'><div class="field token-field" id="account-token-entry"><label for="account-token">'+requiredLabel(w.token)+'</label><input id="account-token" name="token" type="text" required minlength="43" maxlength="43" pattern="[A-Za-z0-9_\\-]{43}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="account-token-help"><p id="account-token-help" class="help">'+e(w.tokenHelp)+'</p></div><div id="account-token-ready" class="token-ready" hidden><p role="status">'+e(w.tokenReady)+'</p><button id="account-token-edit" class="secondary" type="button">'+e(w.enterToken)+'</button></div>'+passwordFields(w)+'<div class="form-actions"><button type="submit">'+e(w.resetSubmit)+'</button></div></form><div class="standalone-links"><a href="'+accountLink('/forgot-password/',locale)+'">'+e(w.recoverTitle)+'</a></div><script>'+tokenScript+'</script>';
  return shell({lang:locale,title,intro,backPath:accountLink('/login/',locale),backLabel:w.backLogin,single:true,error,
    content:'<main id="account-main" tabindex="-1" class="card">'+message(error,{error:true})+content+'</main>'});
}
