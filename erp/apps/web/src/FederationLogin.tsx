import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Button} from '../../../packages/ui/index';
import {type Language} from '../../../packages/i18n/index';
import {api,ApiError,clearSession,type Session} from './api';
import {federationRequest,loginRequestId,nativeAuthorizationResponse,parseLoginConfiguration,parseLoginRequest,
  parseLoginStart,webAuthorizationResponse,type LoginConfiguration,type LoginRequest} from './federationLoginModel';

const copy={
 DE:{title:'Mit dem Website-Konto anmelden',intro:'Prüfen Sie beide Konten, das Unternehmen und die Anwendung.',start:'Über die Website anmelden',company:'Verbindung zum Unternehmen',application:'Anwendung',source:'Website-Konto',erp:'ERP-Konto',continue:'Weiter zur Website',confirm:'Anmeldung bestätigen',consent:'Ich habe die Konten, das Unternehmen und die Anwendung geprüft und möchte mich anmelden.',otp:'Code aus Ihrer ERP-Authentifikator-App',loading:'Verbindung wird geprüft …',refresh:'Status erneut prüfen',retry:'Dieselbe Anfrage erneut senden',cancel:'Anfrage abbrechen',local:'Mit ERP-Passwort anmelden',unavailable:'Die Anmeldung ist derzeit nicht verfügbar. Prüfen Sie den Status und versuchen Sie es erneut.',unknown:'Die Antwort fehlt. Der Vorgang kann bereits verarbeitet worden sein. Prüfen Sie zuerst den aktuellen Status.',expired:'Diese Anfrage kann nicht fortgesetzt werden. Starten Sie die Anmeldung erneut.',native:'Kehren Sie zur App zurück. Falls sie nicht geöffnet wurde, starten Sie dort eine neue Anmeldung.',complete:'Die Anfrage wurde abgeschlossen. Öffnen Sie Ihren Arbeitsbereich.',open:'Arbeitsbereich öffnen',disabled:'Diese Verbindung ist nicht aktiviert.',limited:'Zu viele Versuche. Bitte versuchen Sie es später erneut.'},
 EN:{title:'Sign in with your website account',intro:'Check both accounts, the company and the application.',start:'Sign in through the website',company:'Company connection',application:'Application',source:'Website account',erp:'ERP account',continue:'Continue to the website',confirm:'Confirm sign-in',consent:'I have checked the accounts, company and application and want to sign in.',otp:'Code from your ERP authenticator app',loading:'Checking the connection …',refresh:'Check status again',retry:'Retry the same request',cancel:'Cancel request',local:'Sign in with an ERP password',unavailable:'Sign-in is currently unavailable. Check the status and try again.',unknown:'The response is missing. The request may already have been processed. Check its current status first.',expired:'This request cannot continue. Start sign-in again.',native:'Return to the app. If it did not open, start a new sign-in there.',complete:'The request has completed. Open your workspace.',open:'Open workspace',disabled:'This connection is not enabled.',limited:'Too many attempts. Please try again later.'},
 PL:{title:'Zaloguj się kontem witryny',intro:'Sprawdź oba konta, firmę i aplikację.',start:'Zaloguj się przez witrynę',company:'Połączenie z firmą',application:'Aplikacja',source:'Konto witryny',erp:'Konto ERP',continue:'Przejdź do witryny',confirm:'Potwierdź logowanie',consent:'Sprawdziłem konta, firmę i aplikację i chcę się zalogować.',otp:'Kod z aplikacji uwierzytelniającej ERP',loading:'Sprawdzanie połączenia …',refresh:'Sprawdź stan ponownie',retry:'Ponów ten sam wniosek',cancel:'Anuluj wniosek',local:'Zaloguj się hasłem ERP',unavailable:'Logowanie jest obecnie niedostępne. Sprawdź stan i spróbuj ponownie.',unknown:'Brakuje odpowiedzi. Wniosek mógł już zostać przetworzony. Najpierw sprawdź jego aktualny stan.',expired:'Nie można kontynuować tego wniosku. Rozpocznij logowanie ponownie.',native:'Wróć do aplikacji. Jeśli się nie otworzyła, rozpocznij w niej nowe logowanie.',complete:'Wniosek został zakończony. Otwórz obszar roboczy.',open:'Otwórz obszar roboczy',disabled:'To połączenie nie jest włączone.',limited:'Zbyt wiele prób. Spróbuj ponownie później.'},
 LT:{title:'Prisijungti svetainės paskyra',intro:'Patikrinkite abi paskyras, įmonę ir programą.',start:'Prisijungti per svetainę',company:'Ryšys su įmone',application:'Programa',source:'Svetainės paskyra',erp:'ERP paskyra',continue:'Tęsti svetainėje',confirm:'Patvirtinti prisijungimą',consent:'Patikrinau paskyras, įmonę ir programą ir noriu prisijungti.',otp:'Kodas iš ERP autentifikavimo programos',loading:'Tikrinamas ryšys …',refresh:'Dar kartą patikrinti būseną',retry:'Pakartoti tą patį prašymą',cancel:'Atšaukti prašymą',local:'Prisijungti ERP slaptažodžiu',unavailable:'Prisijungimas šiuo metu nepasiekiamas. Patikrinkite būseną ir bandykite dar kartą.',unknown:'Atsakymo nėra. Prašymas jau galėjo būti apdorotas. Pirmiausia patikrinkite dabartinę jo būseną.',expired:'Šio prašymo tęsti negalima. Pradėkite prisijungimą iš naujo.',native:'Grįžkite į programą. Jei ji neatsidarė, pradėkite joje naują prisijungimą.',complete:'Prašymas užbaigtas. Atidarykite darbo sritį.',open:'Atidaryti darbo sritį',disabled:'Šis ryšys neįjungtas.',limited:'Per daug bandymų. Bandykite vėliau.'},
 RU:{title:'Войти через аккаунт сайта',intro:'Проверьте оба аккаунта, компанию и приложение.',start:'Войти через сайт',company:'Подключение компании',application:'Приложение',source:'Аккаунт сайта',erp:'Аккаунт ERP',continue:'Перейти на сайт',confirm:'Подтвердить вход',consent:'Я проверил аккаунты, компанию и приложение и хочу войти.',otp:'Код из приложения аутентификации ERP',loading:'Проверяем подключение …',refresh:'Снова проверить состояние',retry:'Повторить тот же запрос',cancel:'Отменить запрос',local:'Войти с паролем ERP',unavailable:'Вход сейчас недоступен. Проверьте состояние и повторите попытку.',unknown:'Ответ не получен. Запрос уже мог быть обработан. Сначала проверьте его текущее состояние.',expired:'Этот запрос нельзя продолжить. Начните вход заново.',native:'Вернитесь в приложение. Если оно не открылось, начните в нём новый вход.',complete:'Запрос завершён. Откройте рабочее пространство.',open:'Открыть рабочее пространство',disabled:'Это подключение не включено.',limited:'Слишком много попыток. Повторите позже.'},
 UK:{title:'Увійти через акаунт сайту',intro:'Перевірте обидва акаунти, компанію та застосунок.',start:'Увійти через сайт',company:'Підключення компанії',application:'Застосунок',source:'Акаунт сайту',erp:'Акаунт ERP',continue:'Перейти на сайт',confirm:'Підтвердити вхід',consent:'Я перевірив акаунти, компанію та застосунок і хочу увійти.',otp:'Код із застосунку автентифікації ERP',loading:'Перевіряємо підключення …',refresh:'Знову перевірити стан',retry:'Повторити той самий запит',cancel:'Скасувати запит',local:'Увійти з паролем ERP',unavailable:'Вхід зараз недоступний. Перевірте стан і повторіть спробу.',unknown:'Відповідь не отримано. Запит уже міг бути оброблений. Спочатку перевірте його поточний стан.',expired:'Цей запит не можна продовжити. Почніть вхід заново.',native:'Поверніться до застосунку. Якщо він не відкрився, почніть у ньому новий вхід.',complete:'Запит завершено. Відкрийте робочий простір.',open:'Відкрити робочий простір',disabled:'Це підключення не ввімкнено.',limited:'Забагато спроб. Повторіть пізніше.'}
};
export const federationLoginCopy=(language:Language)=>copy[language];
const recoveryCopy:Record<Language,{restart:string;current:string}>={
  DE:{restart:'Eine neue Anmeldung starten',current:'Aktuelles Konto prüfen'},
  EN:{restart:'Start a new sign-in',current:'Check the current account'},
  PL:{restart:'Rozpocznij nowe logowanie',current:'Sprawdź bieżące konto'},
  LT:{restart:'Pradėti naują prisijungimą',current:'Patikrinti dabartinę paskyrą'},
  RU:{restart:'Начать новый вход',current:'Проверить текущий аккаунт'},
  UK:{restart:'Почати новий вхід',current:'Перевірити поточний акаунт'},
};
const message=(error:unknown,w:typeof copy.EN)=>error instanceof ApiError&&error.code==='RATE_LIMITED'?w.limited:w.unavailable;

export function FederationSignIn({language,disabled=false}:{language:Language;disabled?:boolean}){
  const w=copy[language],request=useRef<AbortController|null>(null),attempt=useRef<{body:{authorityId:string;clientId:string};key:string}|null>(null);
  const [configuration,setConfiguration]=useState<LoginConfiguration|null>(null),[authorityId,setAuthorityId]=useState(''),[clientId,setClientId]=useState('');
  const [error,setError]=useState<unknown>(),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false);
  async function discover(){
    request.current?.abort();const controller=new AbortController();request.current=controller;setError(undefined);
    try{
      const next=parseLoginConfiguration(await federationRequest('/api/v1/auth/federation/config',{signal:controller.signal}),location.origin);
      if(controller.signal.aborted)return;setConfiguration(next);
      if(next.enabled){setAuthorityId(next.authorities[0].authorityId);setClientId(next.clients.find(row=>row.kind==='WEB')?.clientId??'');}
    }catch(value){if(!controller.signal.aborted)setError(value);}
  }
  useEffect(()=>{void discover();return()=>{request.current?.abort();};},[]);
  async function start(){
    if(busy||disabled||!configuration?.enabled||!authorityId||!clientId)return;
    const current=attempt.current??{body:{authorityId,clientId},key:crypto.randomUUID()};attempt.current=current;
    const controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);setError(undefined);setUnknown(false);
    try{
      const result=parseLoginStart(await federationRequest('/api/v1/auth/federation/start',{body:current.body,idempotencyKey:current.key,signal:controller.signal}),location.origin);
      if(controller.signal.aborted)return;location.assign(result.authorizationUrl);
    }catch(value){if(!controller.signal.aborted){setError(value);setUnknown(true);}}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  if(configuration&&!configuration.enabled)return null;
  const clients=configuration?.enabled?configuration.clients.filter(row=>row.kind==='WEB'):[];
  if(configuration?.enabled&&!clients.length)return null;
  return <section className="federation-sign-in" aria-label={w.start}>
    {Boolean(error)&&<p className="notice warning" role="alert">{unknown?w.unknown:message(error,w)}</p>}
    {configuration?.enabled?<>
      {configuration.authorities.length>1&&<label className="field"><span>{w.company}</span><select disabled={busy||unknown||disabled} value={authorityId} onChange={e=>{attempt.current=null;setAuthorityId(e.target.value);}}>{configuration.authorities.map(row=><option key={row.authorityId} value={row.authorityId}>{row.label}</option>)}</select></label>}
      {clients.length>1&&<label className="field"><span>{w.application}</span><select disabled={busy||unknown||disabled} value={clientId} onChange={e=>{attempt.current=null;setClientId(e.target.value);}}>{clients.map(row=><option key={row.clientId} value={row.clientId}>{row.label}</option>)}</select></label>}
      <Button type="button" variant="secondary" className="full-width" disabled={busy||disabled} onClick={()=>void start()}>{busy?w.loading:unknown?w.retry:w.start}</Button>
    </>:Boolean(error)&&<Button type="button" variant="secondary" disabled={disabled} onClick={()=>void discover()}>{w.refresh}</Button>}
  </section>;
}

export function FederationAuthorization({language,header,onComplete,online}:{language:Language;header:ReactNode;onComplete:(session:Session,path:string)=>void;online:boolean}){
  const w=copy[language],recovery=recoveryCopy[language],alive=useRef(true),operation=useRef<AbortController|null>(null),serial=useRef(0);
  const [configuration,setConfiguration]=useState<LoginConfiguration|null>(null),[request,setRequest]=useState<LoginRequest|null>(null),[error,setError]=useState<unknown>();
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[finished,setFinished]=useState(false),[cancelled,setCancelled]=useState(false);
  const [otp,setOtp]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [unknownWeb,setUnknownWeb]=useState(false);
  let id:string|null=null;try{if(!location.hash)id=loginRequestId(location.search);}catch{/* Render a bounded invalid/expired state. */}
  function begin(){operation.current?.abort();const controller=new AbortController();operation.current=controller;return {controller,serial:++serial.current};}
  const current=(value:ReturnType<typeof begin>)=>alive.current&&!value.controller.signal.aborted&&value.serial===serial.current;
  async function load(){
    if(!id||!online){setLoading(false);setError(new ApiError('FEDERATION_UNAVAILABLE',503));return;}
    const generation=begin();setLoading(true);setBusy(false);setError(undefined);setRequest(null);setOtp('');setConfirmed(false);setUnknown(false);
    try{
      const config=parseLoginConfiguration(await federationRequest('/api/v1/auth/federation/config',{signal:generation.controller.signal}),location.origin);
      if(!current(generation))return;setConfiguration(config);if(!config.enabled)return;
      if(location.pathname==='/auth/federation/authorize')await federationRequest('/api/v1/auth/federation/requests/'+id+'/bind',{body:{},signal:generation.controller.signal});
      const value=parseLoginRequest(await federationRequest('/api/v1/auth/federation/requests/'+id,{signal:generation.controller.signal}),id,config);
      if(current(generation)){setRequest(value);setUnknownWeb(false);}
    }catch(value){if(current(generation))setError(value);}
    finally{if(current(generation))setLoading(false);}
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;serial.current++;operation.current?.abort();};},[id]);
  useEffect(()=>{
    if(!online){serial.current++;operation.current?.abort();setRequest(null);setOtp('');setConfirmed(false);setBusy(false);setLoading(false);setError(new ApiError('FEDERATION_UNAVAILABLE',503));}
  },[online]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden){serial.current++;operation.current?.abort();setRequest(null);setOtp('');setConfirmed(false);setLoading(false);setBusy(false);}};
    document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden);
  },[]);
  async function confirm(){
    if(!request||!configuration?.enabled||request.state!=='SOURCE_APPROVED'||!confirmed||busy||unknown||!online)return;
    const pinned=request,generation=begin();setBusy(true);setError(undefined);setOtp('');setUnknownWeb(false);
    try{
      const value=await federationRequest('/api/v1/auth/federation/requests/'+pinned.requestId+'/confirm',{
        body:{expectedVersion:pinned.version,confirmed:true,...(otp?{otp}: {})},csrfToken:pinned.csrfToken,signal:generation.controller.signal});
      if(!current(generation))return;
      if(pinned.client.kind==='NATIVE'){
        const destination=nativeAuthorizationResponse(value,pinned);setFinished(true);setRequest(null);setConfirmed(false);
        location.assign(destination);
      }else{
        const result=webAuthorizationResponse(value);clearSession();
        const session=await api<Session>('/api/v1/me',{signal:generation.controller.signal});
        if(!current(generation))return;
        // Token-derived CSRF binds this check to the newly issued cookie even
        // when an older browser session belongs to the same ERP account.
        if(session.actor.userId!==result.session.actor.userId||session.actor.companyId!==result.session.actor.companyId||session.csrfToken!==result.session.csrfToken)throw new ApiError('FEDERATION_CONFLICT',409);
        onComplete(session,result.returnPath);
      }
    }catch(value){if(current(generation)){setError(value);setUnknown(true);setUnknownWeb(pinned.client.kind==='WEB');setRequest(null);setConfirmed(false);}}
    finally{if(current(generation))setBusy(false);}
  }
  async function cancel(){
    if(!request||busy||!online)return;const pinned=request,generation=begin();setBusy(true);setError(undefined);
    try{
      const value:any=await federationRequest('/api/v1/auth/federation/requests/'+pinned.requestId+'/cancel',{
        body:{expectedVersion:pinned.version},csrfToken:pinned.csrfToken,signal:generation.controller.signal});
      if(!current(generation))return;
      if(value?.requestId!==pinned.requestId||value?.state!=='CANCELLED'||!Number.isSafeInteger(value.version)||value.version<pinned.version)throw new ApiError('FEDERATION_INVALID',502);
      setCancelled(true);setRequest(null);setOtp('');setConfirmed(false);
    }catch(value){if(current(generation)){setError(value);setUnknown(true);setRequest(null);}}
    finally{if(current(generation))setBusy(false);}
  }
  const terminal=cancelled||!id||request&&['CANCELLED','EXPIRED','DENIED'].includes(request.state);
  const nativeFinished=finished||request?.client.kind==='NATIVE'&&['CODE_ISSUED','COMPLETE'].includes(request.state);
  return <div className="login-page">{header}<main className="login-layout federation-layout"><section className="login-box" aria-busy={loading||busy}>
    <h1>{w.title}</h1><p>{w.intro}</p>
    {Boolean(error)&&<p className="notice danger" role="alert">{unknown?w.unknown:message(error,w)}</p>}
    {loading?<p role="status">{w.loading}</p>:configuration&&!configuration.enabled?<p role="status">{w.disabled}</p>:terminal?<p role="status">{w.expired}</p>:nativeFinished?<p role="status">{w.native}</p>:request?.state==='COMPLETE'?<><p role="status">{w.complete}</p><a className="text-link" href="/console">{w.open}</a></>:<>
      {request&&<dl className="federation-account-summary"><dt>{w.company}</dt><dd>{request.companyLabel}</dd><dt>{w.application}</dt><dd>{request.client.label}</dd>
        {request.siteLabel&&<><dt>{w.source}</dt><dd>{request.siteLabel}</dd></>}{request.erpUserLabel&&<><dt>{w.erp}</dt><dd>{request.erpUserLabel}</dd></>}
      </dl>}
      {request?.state==='BROWSER_BOUND'&&<a className="button primary" href={request.sourceAuthorizationUrl} rel="noreferrer">{w.continue}</a>}
      {request?.state==='SOURCE_APPROVED'&&!unknown&&<form onSubmit={event=>{event.preventDefault();void confirm();}}>
        <label className="checkbox-field"><input type="checkbox" checked={confirmed} required disabled={busy||!online} onChange={e=>setConfirmed(e.target.checked)}/>{w.consent}</label>
        {request.requiresErpMfa&&<label className="field"><span>{w.otp}</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy||!online} value={otp} onChange={e=>setOtp(e.target.value)}/></label>}
        <Button className="full-width" disabled={busy||!online||!confirmed}>{busy?w.loading:w.confirm}</Button>
      </form>}
      <div className="form-actions"><Button type="button" variant="secondary" disabled={loading||busy||!online} onClick={()=>void load()}>{w.refresh}</Button>
        {request&&<Button type="button" variant="ghost" disabled={busy||!online} onClick={()=>void cancel()}>{w.cancel}</Button>}</div>
    </>}
    {unknownWeb&&<a className="text-link" href="/console">{recovery.current}</a>}
    <a className="text-link" href="/login">{recovery.restart}</a>
    <a className="text-link" href="/login?method=password">{w.local}</a>
  </section></main></div>;
}
