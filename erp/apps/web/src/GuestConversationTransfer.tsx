import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {Button} from '../../../packages/ui/index';
import type {Language} from '../../../packages/i18n/index';
import {api,ApiError} from './api';

type TransferState='ISSUED'|'CLAIMED'|'CONFIRMED'|'CANCELLED'|'EXPIRED'|'CONFLICT';
interface TransferStatus {id:string;channelId:string;state:TransferState;version:number;expiresAt:string;sender?:string}
// Copy has its own declared order; the language selector has a different order.
const copyIndex:Record<Language,number>={DE:0,UK:1,RU:2,PL:3,LT:4,EN:5};
const copy:Record<string,[string,string,string,string,string,string]>={
 title:['Auf WhatsApp fortsetzen','Продовжити у WhatsApp','Продолжить в WhatsApp','Kontynuuj w WhatsApp','Tęsti per WhatsApp','Continue in WhatsApp'],
 intro:['Dieser private Chat bleibt derselbe. Senden Sie den einmaligen Code in WhatsApp und bestätigen Sie danach hier Ihre Nummer.','Ця приватна розмова залишиться тією самою. Надішліть одноразовий код у WhatsApp, а потім підтвердьте тут свій номер.','Это останется тем же личным чатом. Отправьте одноразовый код в WhatsApp, затем подтвердите здесь свой номер.','To pozostanie ten sam prywatny czat. Wyślij jednorazowy kod w WhatsApp, a następnie potwierdź tutaj swój numer.','Tai liks tas pats privatus pokalbis. Išsiųskite vienkartinį kodą per WhatsApp, tada čia patvirtinkite savo numerį.','This stays the same private conversation. Send the one-time code in WhatsApp, then confirm your number here.'],
 start:['Übergang vorbereiten','Підготувати перехід','Подготовить переход','Przygotuj przejście','Paruošti perėjimą','Prepare transfer'],
 open:['Code in WhatsApp senden','Надіслати код у WhatsApp','Отправить код в WhatsApp','Wyślij kod w WhatsApp','Siųsti kodą per WhatsApp','Send code in WhatsApp'],
 waiting:['Senden Sie die vorbereitete Nachricht. Kehren Sie anschließend zu dieser Seite zurück. Das Öffnen des Links bestätigt noch nichts.','Надішліть підготовлене повідомлення та поверніться на цю сторінку. Саме відкриття посилання нічого не підтверджує.','Отправьте подготовленное сообщение и вернитесь на эту страницу. Открытие ссылки само по себе ничего не подтверждает.','Wyślij przygotowaną wiadomość i wróć na tę stronę. Samo otwarcie linku niczego nie potwierdza.','Išsiųskite paruoštą žinutę ir grįžkite į šį puslapį. Vien nuorodos atidarymas nieko nepatvirtina.','Send the prepared message, then return to this page. Opening the link alone does not confirm anything.'],
 expiry:['Gültig bis','Дійсне до','Действует до','Ważne do','Galioja iki','Valid until'],
 number:['In WhatsApp bestätigte Nummer','Номер, підтверджений у WhatsApp','Номер, подтверждённый в WhatsApp','Numer potwierdzony w WhatsApp','WhatsApp patvirtintas numeris','Number confirmed in WhatsApp'],
 consent:['Das ist meine Nummer. Ich erlaube die Fortsetzung dieses Gesprächs auf WhatsApp. Keine Marketing-Einwilligung.','Це мій номер. Дозволяю продовжити цю розмову у WhatsApp. Це не згода на маркетингові повідомлення.','Это мой номер. Разрешаю продолжить эту беседу в WhatsApp. Это не согласие на маркетинговые сообщения.','To mój numer. Zgadzam się kontynuować tę rozmowę w WhatsApp. Nie wyrażam zgody na marketing.','Tai mano numeris. Sutinku tęsti šį pokalbį per WhatsApp. Tai nėra sutikimas rinkodaros žinutėms.','This is my number. I agree to continue this conversation in WhatsApp. This does not give marketing consent.'],
 confirm:['Diese Nummer bestätigen','Підтвердити цей номер','Подтвердить этот номер','Potwierdź ten numer','Patvirtinti šį numerį','Confirm this number'],
 cancel:['Abbrechen','Скасувати','Отменить','Anuluj','Atšaukti','Cancel'],
 refresh:['Status prüfen','Перевірити стан','Проверить статус','Sprawdź stan','Tikrinti būseną','Check status'],
 loading:['Bitte warten…','Зачекайте…','Подождите…','Proszę czekać…','Palaukite…','Please wait…'],
 confirmed:['Verbunden. Ihre nächste WhatsApp-Nachricht setzt genau diesen Chat fort.','Готово. Наступне повідомлення у WhatsApp продовжить саме цей чат.','Готово. Следующее сообщение в WhatsApp продолжит именно этот чат.','Gotowe. Następna wiadomość w WhatsApp będzie kontynuować ten czat.','Paruošta. Kita WhatsApp žinutė tęs būtent šį pokalbį.','Connected. Your next WhatsApp message will continue this exact chat.'],
 expired:['Der Code ist abgelaufen. Bereiten Sie bei Bedarf einen neuen Übergang vor.','Термін коду минув. За потреби підготуйте новий перехід.','Срок кода истёк. При необходимости подготовьте новый переход.','Kod wygasł. W razie potrzeby przygotuj nowe przejście.','Kodo galiojimas baigėsi. Jei reikia, paruoškite naują perėjimą.','The code has expired. Prepare a new transfer if needed.'],
 cancelled:['Übergang abgebrochen. Der Chat bleibt hier verfügbar.','Перехід скасовано. Чат залишається доступним тут.','Переход отменён. Чат остаётся доступным здесь.','Przejście anulowane. Czat pozostaje dostępny tutaj.','Perėjimas atšauktas. Pokalbis lieka pasiekiamas čia.','Transfer cancelled. The chat remains available here.'],
 conflict:['Dieser Übergang benötigt eine gesonderte Identitätsprüfung. Bitte wenden Sie sich an das Unternehmen.','Для цього переходу потрібне окреме підтвердження особи. Зверніться до компанії.','Для этого перехода необходимо отдельное подтверждение личности. Обратитесь в компанию.','To przejście wymaga osobnej weryfikacji tożsamości. Skontaktuj się z firmą.','Šiam perėjimui reikia atskiro tapatybės patvirtinimo. Kreipkitės į įmonę.','This transfer requires a separate identity check. Please contact the company.'],
 unavailable:['Der WhatsApp-Übergang ist derzeit nicht verfügbar. Sie können hier weiterschreiben.','Перехід у WhatsApp зараз недоступний. Можете продовжити спілкування тут.','Переход в WhatsApp сейчас недоступен. Можно продолжить общение здесь.','Przejście do WhatsApp jest teraz niedostępne. Możesz kontynuować tutaj.','Perėjimas į WhatsApp šiuo metu nepasiekiamas. Galite tęsti čia.','WhatsApp transfer is currently unavailable. You can continue here.'],
 lost:['Dieser Code kann nicht erneut angezeigt werden. Brechen Sie ab und bereiten Sie einen neuen Übergang vor.','Повторно показати цей код неможливо. Скасуйте спробу й підготуйте новий перехід.','Повторно показать этот код невозможно. Отмените попытку и подготовьте новый переход.','Tego kodu nie można wyświetlić ponownie. Anuluj próbę i przygotuj nowe przejście.','Šio kodo negalima parodyti dar kartą. Atšaukite bandymą ir paruoškite naują perėjimą.','This code cannot be shown again. Cancel this attempt and prepare a new transfer.'],
 offline:['Stellen Sie die Internetverbindung wieder her, bevor Sie fortfahren.','Відновіть інтернет-з’єднання, щоб продовжити.','Восстановите интернет-соединение, чтобы продолжить.','Przywróć połączenie z internetem, aby kontynuować.','Atkurkite interneto ryšį, kad galėtumėte tęsti.','Reconnect to the internet before continuing.'],
 denied:['Die ursprüngliche Websitzung hat keinen Zugriff mehr. Öffnen Sie den Chat erneut.','Початкова вебсесія більше не має доступу. Відкрийте чат знову.','Исходная веб-сессия больше не имеет доступа. Откройте чат снова.','Pierwotna sesja internetowa nie ma już dostępu. Otwórz czat ponownie.','Pradinė žiniatinklio sesija nebeturi prieigos. Atidarykite pokalbį iš naujo.','The original web session no longer has access. Open the chat again.'],
 limit:['Zu viele Versuche. Bitte versuchen Sie es später erneut.','Забагато спроб. Спробуйте пізніше.','Слишком много попыток. Попробуйте позже.','Zbyt wiele prób. Spróbuj później.','Per daug bandymų. Bandykite vėliau.','Too many attempts. Please try again later.'],
 changed:['Der Status hat sich geändert. Prüfen Sie die Nummer erneut.','Стан змінився. Перевірте номер ще раз.','Статус изменился. Проверьте номер ещё раз.','Stan się zmienił. Sprawdź numer ponownie.','Būsena pasikeitė. Dar kartą patikrinkite numerį.','The status changed. Check the number again.'],
 error:['Der Status konnte nicht bestätigt werden. Prüfen Sie ihn erneut.','Не вдалося підтвердити стан. Перевірте його ще раз.','Не удалось подтвердить статус. Проверьте его ещё раз.','Nie udało się potwierdzić stanu. Sprawdź ponownie.','Nepavyko patvirtinti būsenos. Patikrinkite dar kartą.','The status could not be confirmed. Check it again.']
};
const states:TransferState[]=['ISSUED','CLAIMED','CONFIRMED','CANCELLED','EXPIRED','CONFLICT'];
function checkedStatus(value:any,channelId:string):TransferStatus {
 if(!value||typeof value.id!=='string'||!/^[-a-f0-9]{36}$/i.test(value.id)||value.channelId!==channelId||!states.includes(value.state)||!Number.isInteger(value.version)||value.version<1||!Number.isFinite(Date.parse(value.expiresAt))||['CLAIMED','CONFIRMED'].includes(value.state)&&!/^\+\d{5,20}$/.test(value.sender??''))throw new ApiError('INVALID_RESPONSE',502);
 return {id:value.id,channelId,state:value.state,version:value.version,expiresAt:value.expiresAt,...value.sender?{sender:value.sender}:{}};
}
function checkedLink(value:unknown,status:TransferStatus):string {
 if(typeof value!=='string'||status.state!=='ISSUED')throw new ApiError('INVALID_RESPONSE',502);const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='wa.me'||url.username||url.password||url.port||url.hash||!/^\/\d{5,20}$/.test(url.pathname)||[...url.searchParams.keys()].join()!=='text'||!new RegExp(`^KNABA_TRANSFER ${status.id}\\.[A-Za-z0-9_-]{43}$`).test(url.searchParams.get('text')??''))throw new ApiError('INVALID_RESPONSE',502);return url.href;
}

/** The one-shot URL lives only in this mounted component, never in an offline queue. */
export default function GuestConversationTransfer({channelId,language,online}:{channelId:string;language:Language;online:boolean}){
 const headingId=useId(),sequence=useRef(0),working=useRef(false),current=useRef<TransferStatus|undefined>(undefined);
 const [status,setStatus]=useState<TransferStatus>(),[link,setLink]=useState<string>(),[available,setAvailable]=useState<boolean>(),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState<string>(),[now,setNow]=useState(Date.now());
 const text=(key:string)=>copy[key]?.[copyIndex[language]]??copy[key]?.[copyIndex.EN]??key;
 const accept=useCallback((next:TransferStatus|undefined)=>{const before=current.current;if(before?.id!==next?.id||before?.version!==next?.version||before?.sender!==next?.sender)setConsent(false);if(before?.id!==next?.id||next?.state!=='ISSUED')setLink(undefined);current.current=next;setStatus(next);setNow(Date.now());},[]);
 const failure=useCallback((reason:unknown)=>{const code=reason instanceof ApiError?reason.code:'';if(['NEEDS_REAUTH','ACCESS_DENIED','NOT_FOUND_SAFE'].includes(code)){accept(undefined);setLink(undefined);setAvailable(false);setError('denied');}else{setError(code==='RATE_LIMITED'?'limit':code==='VERSION_CONFLICT'?'changed':'error');setConsent(false);}},[accept]);
 const refresh=useCallback(async()=>{if(!online||working.current)return;const generation=++sequence.current;try{const result=await api<{available:boolean;transfer:unknown}>(`/api/v1/public/chat/${encodeURIComponent(channelId)}/transfer`,{cache:'no-store'});if(generation!==sequence.current)return;setAvailable(result.available===true);accept(result.transfer===null?undefined:checkedStatus(result.transfer,channelId));setError(undefined);}catch(reason){if(generation===sequence.current)failure(reason);}},[channelId,online,accept,failure]);
 useEffect(()=>{working.current=false;setBusy(false);setConsent(false);void refresh();const poll=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000),clock=setInterval(()=>setNow(Date.now()),1000);const focus=()=>{void refresh();};window.addEventListener('focus',focus);return()=>{sequence.current++;clearInterval(poll);clearInterval(clock);window.removeEventListener('focus',focus);};},[refresh]);
 async function mutate(action:'issue'|'confirm'|'cancel'){
  const snapshot=current.current;if(!online||working.current||action!=='issue'&&!snapshot||action==='confirm'&&(!consent||snapshot?.state!=='CLAIMED'||Date.parse(snapshot.expiresAt)<=Date.now()))return;
  const generation=++sequence.current;working.current=true;setBusy(true);setError(undefined);setConsent(false);
  try{const path=action==='issue'?'':`/${encodeURIComponent(snapshot!.id)}/${action}`,body=action==='confirm'?{expectedVersion:snapshot!.version,targetSender:snapshot!.sender,whatsappConsent:true}:{};
   const result=await api(`/api/v1/public/chat/${encodeURIComponent(channelId)}/transfer${path}`,{method:'POST',body:JSON.stringify(body),cache:'no-store'});if(generation!==sequence.current)return;
   const next=checkedStatus(result,channelId),url=action==='issue'?checkedLink(result.url,next):undefined;accept(next);setLink(url);
  }catch(reason){if(generation===sequence.current)failure(reason);}
  finally{if(generation===sequence.current){working.current=false;setBusy(false);}}
 }
 const expired=status&&['ISSUED','CLAIMED'].includes(status.state)&&Date.parse(status.expiresAt)<=now,state=expired?'EXPIRED':status?.state,pending=state==='ISSUED'||state==='CLAIMED';
 return <section className="public-chat-message public-lead-draft" aria-labelledby={headingId} aria-busy={busy}>
  <h3 id={headingId}>{text('title')}</h3><p className="public-chat-disclosure">{text('intro')}</p>
  {error&&<p className="notice danger" role="alert">{text(error)}</p>}{!online&&<p className="notice warning" role="status">{text('offline')}</p>}
  {available===false&&!error&&<p role="status">{text('unavailable')}</p>}
  {state==='ISSUED'&&<><p role="status">{link?text('waiting'):text('lost')}</p>{link&&online&&<a href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{text('open')}</a>}</>}
  {state==='CLAIMED'&&<><p>{text('number')}: <strong dir="ltr">{status?.sender}</strong></p><label className="checkbox-field"><input type="checkbox" checked={consent} disabled={busy||!online} onChange={event=>setConsent(event.target.checked)}/>{text('consent')}</label><Button type="button" disabled={!consent||busy||!online} onClick={()=>void mutate('confirm')}>{busy?text('loading'):text('confirm')}</Button></>}
  {state&&['CONFIRMED','EXPIRED','CANCELLED','CONFLICT'].includes(state)&&<p className={state==='CONFIRMED'?'notice success':'notice warning'} role="status">{text(state.toLowerCase())}</p>}
  {pending&&<p><small>{text('expiry')} <time dateTime={status!.expiresAt}>{new Date(status!.expiresAt).toLocaleTimeString(language==='UK'?'uk-UA':language.toLowerCase(),{hour:'2-digit',minute:'2-digit'})}</time></small></p>}
  <div className="public-draft-actions">
   {available&&!pending&&state!=='CONFIRMED'&&<Button type="button" variant="secondary" disabled={busy||!online} onClick={()=>void mutate('issue')}>{busy?text('loading'):text('start')}</Button>}
   {pending&&<Button type="button" variant="secondary" disabled={busy||!online} onClick={()=>void mutate('cancel')}>{text('cancel')}</Button>}
   {available!==false&&<Button type="button" variant="secondary" disabled={busy||!online} onClick={()=>void refresh()}>{text('refresh')}</Button>}
  </div>
 </section>;
}
