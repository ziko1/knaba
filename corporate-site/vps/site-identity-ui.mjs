/** Neutral landing pages never inspect cookies or mutate identity on cross-site GET.
 * Both independent deployments package these exact bytes; the root sync gate checks drift. */
export function renderSiteIdentityPage(mode){
 if(!['site','erp'].includes(mode))throw Error('INVALID_IDENTITY_PAGE');
 return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>KNABA DE · Konten verbinden</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f3f7f5;color:#173b30;font:16px/1.6 system-ui,sans-serif}main{width:min(720px,calc(100% - 32px));margin:32px auto;padding:28px;background:#fff;border:1px solid #d2e2d9;border-radius:18px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}h1{font-size:1.8rem;line-height:1.25}h2{font-size:1.15rem}label{display:block;margin:16px 0}input,select,button{font:inherit;border-radius:8px;padding:10px 14px;border:1px solid #9fb8ac}input{display:block;width:100%;margin-top:5px}button{cursor:pointer;background:#155b46;color:#fff;margin:8px 8px 8px 0}button:disabled{opacity:.5;cursor:default}a{color:#155b46}a,button,input,select{outline-offset:4px}:focus-visible{outline:3px solid #b27f16}.card{border:1px solid #d2e2d9;border-radius:12px;padding:16px;margin:16px 0;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(100px,1fr) minmax(0,3fr);gap:8px}dt{font-weight:650}dd{margin:0;overflow-wrap:anywhere}.note{font-size:.9rem}#message{min-height:1.6em}#message[data-error=true]{color:#942a29}footer{border-top:1px solid #d2e2d9;margin-top:24px;padding-top:16px} [hidden]{display:none!important}@media(max-width:420px){main{padding:20px 16px;margin:16px auto}dl{display:block}dd{margin-bottom:12px}button{width:100%}}</style></head>
 <body data-mode="${mode}"><main><header><strong>KNABA DE</strong><label><span data-i18n="language">Sprache</span> <select id="language" aria-label="Sprache"><option value="de">Deutsch</option><option value="en">English</option><option value="uk">Українська</option><option value="ru">Русский</option><option value="pl">Polski</option><option value="lt">Lietuvių</option></select></label></header>
 <h1 data-i18n="title">Konten verbinden</h1><p data-i18n="intro"></p><p id="message" role="status" aria-live="polite"></p><button id="refresh" type="button" data-i18n="refresh"></button>
 <section id="accounts" hidden></section><section id="proof" hidden><h2 data-i18n="reauth"></h2><label><span data-i18n="password"></span><input id="password" type="password" autocomplete="current-password" maxlength="128"></label><label><span data-i18n="otp"></span><input id="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></label><button id="begin" type="button" data-i18n="begin"></button></section>
 <section id="consent" hidden><p data-i18n="consentText"></p><p id="expires" class="note"></p><button id="confirm" type="button" data-i18n="confirm"></button><a id="cancel" data-i18n="cancel" href="${mode==='erp'?'/app':'/konto/'}"></a></section>
 <section id="links" hidden><h2 data-i18n="links"></h2><div id="items"></div></section><footer><a id="login" href="${mode==='erp'?'/login':'/login/'}" target="_blank" rel="noopener noreferrer" data-i18n="login"></a><p class="note" data-i18n="loginHelp"></p></footer><noscript>Bitte JavaScript aktivieren. Enable JavaScript to review and confirm the account link.</noscript>
 </main><script src="${mode==='erp'?'/site-identity-ui.js':'/auth/site-identity-ui.js'}"></script></body></html>`;
}

function identityClient(){
 'use strict';
 const languages=['de','en','uk','ru','pl','lt'];
 const words={
  language:['Sprache','Language','Мова','Язык','Język','Kalba'],
  title:['Konten verbinden','Link accounts','Прив’язка акаунтів','Привязка аккаунтов','Połącz konta','Susieti paskyras'],
  intro:['Bestätigen Sie beide bestehenden Konten. Berechtigungen und Daten bleiben bei ihrem jeweiligen Konto.','Confirm both existing accounts. Each account keeps its own permissions and data.','Підтвердьте обидва наявні акаунти. Права й дані залишаються за відповідними акаунтами.','Подтвердите оба существующих аккаунта. Права и данные остаются у соответствующих аккаунтов.','Potwierdź oba istniejące konta. Każde zachowuje swoje uprawnienia i dane.','Patvirtinkite abi esamas paskyras. Kiekviena išlaiko savo teises ir duomenis.'],
  refresh:['Erneut prüfen','Check again','Перевірити знову','Проверить снова','Sprawdź ponownie','Tikrinti dar kartą'],
  reauth:['ERP-Konto erneut bestätigen','Confirm your ERP account again','Повторне підтвердження ERP-акаунта','Повторное подтверждение ERP-аккаунта','Potwierdź ponownie konto ERP','Dar kartą patvirtinkite ERP paskyrą'],
  password:['ERP-Passwort','ERP password','Пароль ERP','Пароль ERP','Hasło ERP','ERP slaptažodis'],
  otp:['MFA-Code, falls eingerichtet','MFA code, if configured','Код MFA, якщо налаштовано','Код MFA, если настроен','Kod MFA, jeśli skonfigurowano','MFA kodas, jei nustatytas'],
  begin:['Mit Website-Konto verbinden','Link to website account','Прив’язати акаунт сайту','Привязать аккаунт сайта','Połącz z kontem witryny','Susieti su svetainės paskyra'],
  consentText:['Prüfen Sie Firma und beide Konten. Bestätigen Sie nur Ihre eigenen Konten.','Review the company and both accounts. Confirm only accounts that you own.','Перевірте компанію й обидва акаунти. Підтверджуйте лише власні акаунти.','Проверьте компанию и оба аккаунта. Подтверждайте только свои аккаунты.','Sprawdź firmę i oba konta. Potwierdzaj wyłącznie własne konta.','Patikrinkite įmonę ir abi paskyras. Patvirtinkite tik savo paskyras.'],
  confirm:['Diese Konten bestätigen','Confirm these accounts','Підтвердити ці акаунти','Подтвердить эти аккаунты','Potwierdź te konta','Patvirtinti šias paskyras'],
  cancel:['Abbrechen','Cancel','Скасувати','Отменить','Anuluj','Atšaukti'],
  links:['Verknüpfte Konten','Linked accounts','Прив’язані акаунти','Привязанные аккаунты','Połączone konta','Susietos paskyros'],
  unlink:['Verknüpfung aufheben','Unlink account','Відкликати прив’язку','Отозвать привязку','Odłącz konto','Atsieti paskyrą'],
  login:['Anmeldung in neuem Tab öffnen','Open sign-in in a new tab','Відкрити вхід у новій вкладці','Открыть вход в новой вкладке','Otwórz logowanie w nowej karcie','Atidaryti prisijungimą naujame skirtuke'],
  loginHelp:['Nach der Anmeldung hier erneut prüfen. Die Bestätigung läuft nach höchstens fünf Minuten ab.','After signing in, check again here. The confirmation expires within five minutes.','Після входу перевірте знову тут. Підтвердження діє не довше п’яти хвилин.','После входа проверьте снова здесь. Подтверждение действует не дольше пяти минут.','Po zalogowaniu sprawdź ponownie tutaj. Potwierdzenie wygasa w ciągu pięciu minut.','Prisijungę patikrinkite čia dar kartą. Patvirtinimas galioja ne ilgiau kaip penkias minutes.'],
  company:['Firma','Company','Компанія','Компания','Firma','Įmonė'],site:['Website-Konto','Website account','Акаунт сайту','Аккаунт сайта','Konto witryny','Svetainės paskyra'],erp:['ERP-Konto','ERP account','ERP-акаунт','ERP-аккаунт','Konto ERP','ERP paskyra'],
  loading:['Wird geprüft…','Checking…','Перевіряю…','Проверяю…','Sprawdzanie…','Tikrinama…'],
  done:['Verknüpfung bestätigt.','Account link confirmed.','Прив’язку підтверджено.','Привязка подтверждена.','Połączenie kont potwierdzone.','Paskyrų susiejimas patvirtintas.'],
  revoked:['Verknüpfung aufgehoben.','Account unlinked.','Прив’язку відкликано.','Привязка отозвана.','Konto odłączone.','Paskyra atsieta.'],
  savedRefresh:['Änderung gespeichert. Die aktuelle Liste konnte nicht geladen werden; bitte erneut prüfen.','Change saved. The current list could not be loaded; check again.','Зміну збережено. Не вдалося завантажити поточний список; перевірте знову.','Изменение сохранено. Не удалось загрузить текущий список; проверьте снова.','Zmiana zapisana. Nie udało się wczytać bieżącej listy; sprawdź ponownie.','Pakeitimas išsaugotas. Nepavyko įkelti dabartinio sąrašo; patikrinkite dar kartą.'],
  expired:['Bestätigung abgelaufen. Starten Sie erneut im ERP.','Confirmation expired. Start again in ERP.','Строк підтвердження минув. Почніть знову в ERP.','Срок подтверждения истёк. Начните снова в ERP.','Potwierdzenie wygasło. Rozpocznij ponownie w ERP.','Patvirtinimas nebegalioja. Pradėkite iš naujo ERP.'],
  error:['Nicht bestätigt. Prüfen Sie Anmeldung, Passwort und MFA; laden Sie die Konten erneut.','Not confirmed. Check your sign-in, password and MFA; refresh the accounts.','Не підтверджено. Перевірте вхід, пароль і MFA; повторно завантажте акаунти.','Не подтверждено. Проверьте вход, пароль и MFA; загрузите аккаунты снова.','Nie potwierdzono. Sprawdź logowanie, hasło i MFA; odśwież konta.','Nepatvirtinta. Patikrinkite prisijungimą, slaptažodį ir MFA; atnaujinkite paskyras.'],
  unavailable:['Verknüpfungen sind derzeit nicht eingerichtet. Vorhandene Verknüpfungen können aufgehoben werden.','Linking is not currently configured. Existing links can still be revoked.','Прив’язку зараз не налаштовано. Наявні прив’язки можна відкликати.','Привязка сейчас не настроена. Существующие привязки можно отозвать.','Łączenie nie jest obecnie skonfigurowane. Istniejące połączenia można odwołać.','Susiejimas šiuo metu nesukonfigūruotas. Esamas sąsajas galima atšaukti.'],
  start:['Starten Sie die Verknüpfung in Ihrem ERP-Konto.','Start linking from your ERP account.','Почніть прив’язку у своєму ERP-акаунті.','Начните привязку в своём ERP-аккаунте.','Rozpocznij łączenie na swoim koncie ERP.','Pradėkite susiejimą savo ERP paskyroje.'],
  until:['Gültig bis','Valid until','Діє до','Действует до','Ważne do','Galioja iki'],
  empty:['Keine aktiven Verknüpfungen.','No active account links.','Активних прив’язок немає.','Активных привязок нет.','Brak aktywnych połączeń.','Aktyvių sąsajų nėra.']
 };
 const $=id=>document.getElementById(id),mode=document.body.dataset.mode;
 const originalHash=location.hash.slice(1),queryLanguage=new URLSearchParams(location.search).get('lang');
 // Transfer secrets exist only in this document's memory. Never put them in
 // query strings, history state, logs, cookies, storage or subsequent referrers.
 history.replaceState(null,'',location.pathname);
 let lang=languages.includes(queryLanguage)?queryLanguage:(languages.includes(navigator.language?.slice(0,2))?navigator.language.slice(0,2):'de');
 const t=key=>words[key]?.[languages.indexOf(lang)]??key;
 let csrf='',grant='',challenge='',previewProof='',expiresAt=0,pending=false,configured=false,previewReady=false,dead=false;
 const controller=new AbortController();
 const fields=new URLSearchParams(originalHash),pattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.[A-Za-z0-9_-]{43}$/;
 let malformed=false;
 if(originalHash){
  const allowed=mode==='site'?['link']:['challenge','grant'];
  malformed=[...fields.keys()].some(key=>!allowed.includes(key))||allowed.some(key=>fields.getAll(key).length!==1||!pattern.test(fields.get(key)||''));
  if(!malformed){challenge=fields.get(mode==='site'?'link':'challenge')||'';grant=fields.get('grant')||'';}
 }
 function translate(){document.documentElement.lang=lang;document.title='KNABA DE · '+t('title');document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=t(node.dataset.i18n));$('language').value=lang;$('language').setAttribute('aria-label',t('language'));}
 function message(key,error=false){$('message').textContent=t(key);$('message').dataset.error=String(error);}
 function controls(){document.querySelectorAll('button').forEach(button=>button.disabled=pending||dead);$('begin').disabled=pending||dead||!configured;$('confirm').disabled=pending||dead||!previewReady||Date.now()>=expiresAt;}
 async function run(operation){if(pending||dead)return;pending=true;controls();message('loading');try{await operation();}catch(error){previewReady=false;$('consent').hidden=true;message(error.code==='CALLBACK_EXPIRED'?'expired':error.code==='MISSING_CONFIGURATION'?'unavailable':'error',true);}finally{pending=false;controls();}}
 async function api(path,body){const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
  headers:body===undefined?{accept:'application/json'}:{accept:'application/json','content-type':'application/json','x-csrf-token':csrf,'x-knaba-request':'site-identity-v1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok){const error=new Error('ACCOUNT_LINK_REJECTED');error.code=value.code??value.error?.code;throw error;}if(dead)throw Error('CLOSED');return value;}
 function accounts(data){const root=$('accounts');root.replaceChildren();root.hidden=false;
  for(const [key,value]of [['company',data.company],['erp',data.user],['site',data.site]]){if(!value)continue;const card=document.createElement('section');card.className='card';const title=document.createElement('h2');title.textContent=t(key);card.append(title);const dl=document.createElement('dl');for(const [name,text]of [['ID',value.id??value.subject],['',value.displayName??value.name],['',value.email]]){if(!text)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=String(text);dl.append(dt,dd);}card.append(dl);root.append(card);}}
 function confirmation(value){expiresAt=value.expiresAt;previewReady=true;$('consent').hidden=false;$('expires').textContent=t('until')+' '+new Date(expiresAt).toLocaleString(lang);}
 function credentials(){const password=$('password').value,otp=$('otp').value;$('password').value='';$('otp').value='';if(!password)throw Error('PASSWORD_REQUIRED');return {password,...(otp?{otp}:{})};}
 function redirect(value){const target=new URL(value);if(target.protocol!=='https:'&&!(target.protocol==='http:'&&target.hostname==='127.0.0.1'))throw Error('INVALID_REDIRECT');location.assign(target.href);}
 async function refresh(){previewReady=false;$('consent').hidden=true;$('accounts').hidden=true;$('proof').hidden=true;$('links').hidden=true;
  if(malformed){message('expired',true);return;}
  if(mode==='site'){
   const state=await api('/auth/site-identity/session');csrf=state.csrfToken;
   if(!challenge){accounts({site:state.user});message('start');return;}
   const view=await api('/auth/site-identity/preview',{challengeToken:challenge});previewProof=view.previewProof;accounts(view);confirmation(view);message('consentText');
  }else{
   const me=await api('/api/v1/me');csrf=me.csrfToken;const state=await api('/api/v1/auth/site-links');configured=state.configured;accounts(state);
   let recovered='';
   if(challenge&&grant){
    if(state.challenges.some(item=>item.id===challenge.split('.')[0]&&item.status==='CONSUMED')){
     const result=await api('/api/v1/auth/site-links/status',{challengeToken:challenge,grantToken:grant});recovered=result.binding.status==='ACTIVE'?'done':'revoked';challenge='';grant='';
    }else{const view=await api('/api/v1/auth/site-links/preview',{challengeToken:challenge,grantToken:grant});accounts(view);confirmation(view);message('consentText');return;}
   }
   $('proof').hidden=false;$('links').hidden=false;$('items').replaceChildren();const active=state.items.filter(item=>item.status==='ACTIVE');
   if(!active.length){const text=document.createElement('p');text.textContent=t('empty');$('items').append(text);}
   for(const item of active){const card=document.createElement('div');card.className='card';const detail=document.createElement('p');detail.textContent=item.issuer+' · '+item.subject;const button=document.createElement('button');button.type='button';button.textContent=t('unlink');button.addEventListener('click',()=>run(async()=>{await api('/api/v1/auth/site-links/unlink',{id:item.id,expectedVersion:item.version,...credentials()});await afterAcknowledgement('revoked');}));card.append(detail,button);$('items').append(card);}
   message(recovered||(configured?'start':'unavailable'));
  }
 }
 async function afterAcknowledgement(key){try{await refresh();message(key);}catch{previewReady=false;$('consent').hidden=true;message('savedRefresh',true);}}
 $('begin').addEventListener('click',()=>run(async()=>{const result=await api('/api/v1/auth/site-links/challenges',credentials());redirect(result.redirectUrl);}));
 $('confirm').addEventListener('click',()=>run(async()=>{
  if(!previewReady||Date.now()>=expiresAt){const error=new Error();error.code='CALLBACK_EXPIRED';throw error;}
  if(mode==='site'){const result=await api('/auth/site-identity/consent',{challengeToken:challenge,previewProof,confirmed:true});redirect(result.redirectUrl);}
  else{await api('/api/v1/auth/site-links/confirm',{challengeToken:challenge,grantToken:grant,confirmed:true});challenge='';grant='';await afterAcknowledgement('done');}
 }));
 $('refresh').addEventListener('click',()=>run(refresh));$('language').addEventListener('change',()=>{lang=$('language').value;translate();void run(refresh);});
 const timer=setInterval(()=>{if(previewReady&&Date.now()>=expiresAt){previewReady=false;message('expired',true);controls();}},1000);
 addEventListener('pagehide',()=>{dead=true;challenge='';grant='';previewProof='';csrf='';controller.abort();clearInterval(timer);$('password').value='';$('otp').value='';});
 translate();void run(refresh);
}
export const siteIdentityClient='('+identityClient.toString()+')();';
