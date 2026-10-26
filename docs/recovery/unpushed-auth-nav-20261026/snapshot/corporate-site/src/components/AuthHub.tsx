import {createMemo,createSignal,onMount,Show,Switch,Match} from 'solid-js';
import {navigate} from 'astro:transitions/client';
import '../styles/auth-hub.css';

type Lang='de'|'en'|'uk'|'ru';
type Role='client'|'worker'|'partner';
type Props={mode:'login'|'register';locale?:Lang};
type Providers={email:boolean;google:boolean;facebook:boolean;microsoft:boolean;apple:boolean;sms:boolean};
const tr={
 de:{login:'Anmelden',register:'Konto erstellen',hello:'Willkommen bei KnaBa',intro:'Ein sicherer Zugang für Kunden, Mitarbeitende und Partner.',name:'Vollständiger Name',
   email:'E-Mail-Adresse',password:'Passwort',repeat:'Passwort wiederholen',pwHint:'Mindestens 15 Zeichen. Das Passwort wird niemals per E-Mail verschickt.',
   role:'Ich registriere mich als',client:'Neuer Kunde',worker:'Mitarbeitende/r mit Einladung',partner:'Geschäftspartner',
   invite:'Einladungscode der Verwaltung',company:'Unternehmen',privacy:'Ich habe die Datenschutzhinweise gelesen und bin mit der Verarbeitung meiner Registrierungsdaten einverstanden.',
   verify:'E-Mail bestätigen',code:'8-stelliger Bestätigungscode',check:'Code bestätigen',sent:'Falls die Registrierung zulässig ist, erhalten Sie einen Code per E-Mail. Gültig 10 Minuten.',
   back:'Zur Anmeldung',signUp:'Noch kein Konto? Registrieren',hasAccount:'Bereits registriert? Anmelden',website:'Zur Website',loading:'Bitte warten…',
   disabled:'Die sichere Registrierung ist derzeit nicht freigeschaltet. Der Mail-Anbieter und die Kontofreigabe werden eingerichtet.',
   error:'Anfrage konnte nicht abgeschlossen werden. Bitte Eingaben prüfen oder später erneut versuchen.',invalid:'E-Mail oder Passwort falsch.',
   completed:'E-Mail bestätigt. Ihr Konto wartet auf die Freigabe des KnaBa-Inhabers.',
   social:'Anmeldung mit Konto',google:'Mit Google fortfahren',googleDisabled:'Google-Anmeldung wird nach Bestätigung der Unternehmenszugänge aktiviert.',
   language:'Sprache',submit:'Anmelden',registerSubmit:'Bestätigungscode senden',smsDisabled:'SMS-Verifizierung wird erst nach Freigabe eines sicheren Anbieters angeboten.'},
 en:{login:'Sign in',register:'Create account',hello:'Welcome to KnaBa',intro:'Secure access for customers, employees and partners.',name:'Full name',
   email:'Email address',password:'Password',repeat:'Confirm password',pwHint:'At least 15 characters. Your password is never sent by email.',
   role:'Register as',client:'New customer',worker:'Employee with invite',partner:'Business partner',
   invite:'Administrator invitation code',company:'Company',privacy:'I have read the privacy policy and agree to processing of my registration data.',
   verify:'Verify your email',code:'8-digit verification code',check:'Verify code',sent:'If registration is allowed, an email code will arrive. Valid for 10 minutes.',
   back:'Back to sign in',signUp:'New here? Register',hasAccount:'Already have an account? Sign in',website:'View website',loading:'Please wait…',
   disabled:'Secure registration is not active yet. The email provider and account approvals are being configured.',
   error:'Unable to complete the request. Check your details or try again later.',invalid:'Incorrect email or password.',
   completed:'Email verified. Your account is pending KnaBa owner approval.',
   social:'Account sign-in',google:'Continue with Google',googleDisabled:'Google sign-in requires verified business provider setup.',
   language:'Language',submit:'Sign in',registerSubmit:'Send verification code',smsDisabled:'SMS verification requires an approved provider.'},
 uk:{login:'Увійти',register:'Створити акаунт',hello:'Вітаємо в KnaBa',intro:'Безпечний доступ для клієнтів, працівників і партнерів.',name:'Повне ім’я',
   email:'Електронна пошта',password:'Пароль',repeat:'Повторіть пароль',pwHint:'Щонайменше 15 символів. Пароль ніколи не надсилається електронною поштою.',
   role:'Тип реєстрації',client:'Новий клієнт',worker:'Працівник із кодом',partner:'Діловий партнер',
   invite:'Код запрошення адміністратора',company:'Компанія',privacy:'Я прочитав(-ла) політику конфіденційності та погоджуюся на обробку реєстраційних даних.',
   verify:'Підтвердити email',code:'8-значний код підтвердження',check:'Підтвердити код',sent:'Якщо реєстрацію дозволено, код надійде на email. Дійсний 10 хвилин.',
   back:'Повернутися до входу',signUp:'Немає акаунта? Зареєструватися',hasAccount:'Уже є акаунт? Увійти',website:'На сайт',loading:'Зачекайте…',
   disabled:'Безпечну реєстрацію поки не активовано. Налаштовується поштовий провайдер та погодження акаунтів.',
   error:'Не вдалося завершити запит. Перевірте дані або повторіть пізніше.',invalid:'Неправильна пошта або пароль.',
   completed:'Пошту підтверджено. Акаунт очікує погодження власника KnaBa.',
   social:'Вхід через акаунт',google:'Продовжити з Google',googleDisabled:'Вхід через Google буде доступним після авторизації корпоративного провайдера.',
   language:'Мова',submit:'Увійти',registerSubmit:'Надіслати код',smsDisabled:'SMS-підтвердження потребує авторизованого провайдера.'},
 ru:{login:'Войти',register:'Создать аккаунт',hello:'Добро пожаловать в KnaBa',intro:'Безопасный доступ для клиентов, сотрудников и партнёров.',name:'Полное имя',
   email:'Электронная почта',password:'Пароль',repeat:'Повторите пароль',pwHint:'Не меньше 15 символов. Пароль никогда не отправляется по почте.',
   role:'Тип регистрации',client:'Новый клиент',worker:'Сотрудник по коду',partner:'Бизнес-партнёр',
   invite:'Код приглашения администратора',company:'Компания',privacy:'Я прочитал(а) политику конфиденциальности и согласен(-на) на обработку регистрационных данных.',
   verify:'Подтверждение email',code:'8-значный код подтверждения',check:'Подтвердить код',sent:'Если регистрация допустима, код придёт по email. Действует 10 минут.',
   back:'Назад ко входу',signUp:'Нет аккаунта? Зарегистрироваться',hasAccount:'Уже есть аккаунт? Войти',website:'На сайт',loading:'Подождите…',
   disabled:'Безопасная регистрация пока недоступна: настраивается почтовый провайдер и подтверждение аккаунтов.',
   error:'Не удалось выполнить запрос. Проверьте данные или повторите позже.',invalid:'Неверная почта или пароль.',
   completed:'Почта подтверждена. Аккаунт ожидает согласования владельца KnaBa.',
   social:'Вход с аккаунтом',google:'Продолжить с Google',googleDisabled:'Для входа через Google нужно подключить корпоративный провайдер.',
   language:'Язык',submit:'Войти',registerSubmit:'Отправить код',smsDisabled:'Для SMS-подтверждения нужен авторизованный провайдер.'}
};
const isLang=(s:string|null):s is Lang=>!!s&&['de','en','uk','ru'].includes(s);
const isRole=(s:string|null):s is Role=>!!s&&['client','worker','partner'].includes(s);
const safeReturn=(s:string|null):string=>{
 if(!s||s.length>180||!s.startsWith('/')||s.startsWith('//')||s.includes('\\')||/[\r\n\0]/.test(s))return '/konto/';
 return s;
};
async function send(path:string,value:Record<string,unknown>){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(value),signal:controller.signal});
  if(!response.ok)throw new Error(String(response.status));
  return response.json() as Promise<Record<string,unknown>>;
 } finally {clearTimeout(timeout);}
}
export default function AuthHub(props:Props){
 const [lang,setLang]=createSignal<Lang>(props.locale||'de');
 const [role,setRole]=createSignal<Role>('client');
 const [email,setEmail]=createSignal('');
 const [name,setName]=createSignal('');
 const [company,setCompany]=createSignal('');
 const [invite,setInvite]=createSignal('');
 const [password,setPassword]=createSignal('');
 const [confirmation,setConfirmation]=createSignal('');
 const [code,setCode]=createSignal('');
 const [privacy,setPrivacy]=createSignal(false);
 const [busy,setBusy]=createSignal(false);
 const [stage,setStage]=createSignal<'form'|'code'|'done'>('form');
 const [message,setMessage]=createSignal('');
 const [error,setError]=createSignal('');
 const [providers,setProviders]=createSignal<Providers>({email:false,google:false,facebook:false,microsoft:false,apple:false,sms:false});
 const t=createMemo(()=>tr[lang()]);
 const mode=props.mode;
 const target=()=>safeReturn(typeof window==='undefined'?null:new URLSearchParams(location.search).get('return_to'));
 const at=(kind:'login'|'register')=>{
   const url=new URL('/'+kind+'/','https://knaba.invalid');
   url.searchParams.set('lang',lang());
   if(kind==='login')url.searchParams.set('return_to',target());
   return url.pathname+url.search;
 };
 onMount(()=>{
  const params=new URLSearchParams(location.search);
  const requested=params.get('lang');
  if(isLang(requested))setLang(requested);
  const requestedRole=params.get('role');
  if(isRole(requestedRole))setRole(requestedRole);
  void fetch('/auth/providers',{credentials:'same-origin',cache:'no-store'})
   .then(async r=>r.ok?await r.json() as Providers:null).then(data=>{if(data)setProviders(data)})
   .catch(()=>undefined);
 });
 async function submit(event:SubmitEvent){
  event.preventDefault();
  if(busy())return;
  setBusy(true);setError('');setMessage('');
  try{
   if(mode==='login'){
    await send('/auth/login',{email:email(),password:password()});
    await navigate(target());
   }else if(stage()==='form'){
    if(!providers().email){setError(t().disabled);return;}
    await send('/auth/register/start',{name:name().trim(),email:email().trim(),password:password(),
      passwordConfirmation:confirmation(),role:role(),inviteCode:invite().trim(),companyName:company().trim(),privacyAccepted:privacy()});
    setPassword('');setConfirmation('');setStage('code');setMessage(t().sent);
   }else if(stage()==='code'){
    await send('/auth/register/verify',{email:email().trim(),code:code()});
    setStage('done');setMessage(t().completed);
   }
  }catch(err){
   const http=err instanceof Error?err.message:'';
   setError(mode==='login'&&http==='401'?t().invalid:t().error);
  }finally{setBusy(false);}
 }
 return <div class="kauth" lang={lang()} translate="no">
  <div class="kauth-shell">
   <aside class="kauth-side">
    <span class="kauth-mark" aria-hidden="true">✳</span>
    <span class="kauth-overline">KNABA · BAUREINIGUNG & BAUSERVICE</span>
    <h2>{t().hello}</h2><p>{t().intro}</p>
    <a href="/">{t().website} ↗</a>
   </aside>
   <div class="kauth-main">
    <div class="kauth-top"><a href="/" class="kauth-mobile-brand" aria-label="KnaBa">✳ KNABA</a>
     <label><span>{t().language}</span><select aria-label={t().language} value={lang()} onChange={event=>setLang(event.currentTarget.value as Lang)}>
      <option value="de">DE</option><option value="en">EN</option><option value="uk">UK</option><option value="ru">RU</option>
     </select></label>
    </div>
    <h2>{mode==='login'?t().login:stage()==='code'?t().verify:t().register}</h2>
    <Show when={error()}><p class="kauth-alert kauth-error" role="alert">{error()}</p></Show>
    <Show when={message()}><p class="kauth-alert" role="status">{message()}</p></Show>
    <Show when={stage()==='done'}>
      <div class="kauth-finished"><span aria-hidden="true">✓</span><p>{t().completed}</p><a href="/konto/" class="kauth-submit">{t().login} →</a></div>
    </Show>
    <Show when={stage()!=='done'}>
     <form class="kauth-form" onSubmit={submit}>
      <Show when={mode==='register' && stage()==='form'}>
       <label>{t().role}<select value={role()} onChange={event=>setRole(event.currentTarget.value as Role)}>
         <option value="client">{t().client}</option><option value="worker">{t().worker}</option><option value="partner">{t().partner}</option>
       </select></label>
       <label>{t().name}<input type="text" autocomplete="name" required minLength={2} maxLength={80} value={name()} onInput={event=>setName(event.currentTarget.value)}/></label>
       <Show when={role()==='partner'}><label>{t().company}<input type="text" required maxLength={100} value={company()} onInput={event=>setCompany(event.currentTarget.value)}/></label></Show>
       <Show when={role()==='worker'}><label>{t().invite}<input type="text" required minLength={24} maxLength={24} autocomplete="off" value={invite()} onInput={event=>setInvite(event.currentTarget.value)}/></label></Show>
      </Show>
      <label>{t().email}<input type="email" autocomplete="email" required maxLength={320} value={email()} readOnly={stage()==='code'} onInput={event=>setEmail(event.currentTarget.value)}/></label>
      <Show when={stage()==='code'}>
       <label>{t().code}<input type="text" required inputmode="numeric" pattern="[0-9]{8}" maxLength={8} autocomplete="one-time-code" value={code()} onInput={event=>setCode(event.currentTarget.value)}/></label>
      </Show>
      <Show when={stage()==='form'}>
       <label>{t().password}<input type="password" autocomplete={mode==='register'?'new-password':'current-password'} required minLength={mode==='register'?15:1} maxLength={256} value={password()} onInput={event=>setPassword(event.currentTarget.value)}/></label>
       <Show when={mode==='register'}>
        <label>{t().repeat}<input type="password" autocomplete="new-password" required minLength={15} maxLength={256} value={confirmation()} onInput={event=>setConfirmation(event.currentTarget.value)}/></label>
        <p class="kauth-hint">{t().pwHint}</p>
        <label class="kauth-consent"><input type="checkbox" required checked={privacy()} onChange={event=>setPrivacy(event.currentTarget.checked)}/>
          <span>{t().privacy} <a href="/datenschutz/">{lang()==='uk'?'Конфіденційність':lang()==='ru'?'Конфиденциальность':'Datenschutz'} ↗</a></span></label>
       </Show>
      </Show>
      <button type="submit" class="kauth-submit" disabled={busy()||(mode==='register'&&stage()==='form'&&!providers().email)}>
       {busy()?t().loading:mode==='login'?t().submit:stage()==='code'?t().check:t().registerSubmit}
      </button>
      <Show when={mode==='register'&&stage()==='form'&&!providers().email}><p class="kauth-hint" role="status">{t().disabled}</p></Show>
     </form>
     <Show when={mode==='login'}>
       <Show when={providers().google}><div class="kauth-social"><p>{t().social}</p><a href={'/auth/google/start?return_to='+encodeURIComponent(target())} class="kauth-social-button">{t().google}</a></div></Show>
     </Show>
     <p class="kauth-switch"><a href={at(mode==='login'?'register':'login')}>{mode==='login'?t().signUp:t().hasAccount} ↗</a></p>
     <Show when={mode==='register'&&!providers().sms}><p class="kauth-small">{t().smsDisabled}</p></Show>
    </Show>
   </div>
  </div>
 </div>;
}
