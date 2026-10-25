import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { assistantGreeting, assistantLocale, type AssistantLocale } from '../lib/assistant-knowledge';
import { formatRecoveryCode,parseRecoveryCode,type AssistantTicket } from '../lib/assistant-recovery';
import '../styles/assistant.css';
import AssistantCaptcha, {type CaptchaState} from './AssistantCaptcha';
import AssistantLead, {type LeadAction} from './AssistantLead';
import type { ErpLeadView } from '../lib/assistant-erp-contract';

type Message = {id:string;sender:'customer'|'assistant'|'owner';content:string;createdAt:string};
type Offer = {id:string;content:string;state:'pending'|'accepted'|'declined'};
type Thread = {conversation:{id:string;status:'assistant'|'human'|'closed'};messages:Message[];offers:Offer[];lead?:ErpLeadView|null};
type Ticket = AssistantTicket;
const STORAGE='knaba-assistant-ticket-v1';
const captions = {
  de: {tag:'Digitale Beratung · Direktkontakt',open:'Chat öffnen',close:'Schließen',welcome:'Hallo! Ich kann Sie zu den KnaBa-Leistungen beraten.',placeholder:'Ihre Frage oder Wünsche …',privacy:'Ich habe die Datenschutzhinweise gelesen und möchte meine Unterhaltung an KnaBa übermitteln.',captcha:'Bitte schließen Sie die Sicherheitsprüfung ab.',captchaPrompt:'Nach der Datenschutzbestätigung erscheint die Sicherheitsprüfung.',send:'Senden',human:'Mit dem Inhaber sprechen',name:'Name (optional)',email:'E-Mail (optional)',phone:'Telefon (optional)',request:'An Inhaber weiterleiten',notice:'Automatische Antworten sind unverbindlich. Preise und Termine werden nur persönlich bestätigt.',hold:'Die Nachricht ist im Inhaber-Postfach. Antworten erscheinen hier.',no:'Die Verbindung ist unterbrochen. Bitte erneut versuchen.',agreement:'Angebot zur Abstimmung',pending:'Bitte den Inhalt prüfen. Dies ist noch keine automatische Auftrags- oder Vertragsbestätigung.',accept:'Inhalt bestätigen',decline:'Ablehnen',accepted:'Bestätigt',declined:'Abgelehnt',mic:'Diktieren',speak:'Vorlesen',recording:'Die Spracherkennung kann Daten an den Browserhersteller übertragen. Fortfahren?',unsupported:'Spracherkennung wird in diesem Browser nicht unterstützt.',new:'Neues Gespräch',fresh:'Neues Gespräch beginnen? Ohne gesicherten Zugangscode können Sie das bisherige nicht wiederherstellen.',privacyLink:'Datenschutz',session:'Sichern Sie den privaten Zugangscode, um den Chat nach Schließen des Browsers wiederherzustellen.',closed:'Dieses Gespräch wurde geschlossen.',copyCode:'Zugangscode sichern',copied:'Code kopiert',manualCopy:'Zugangscode selbst kopieren',restoreTitle:'Vorheriges Gespräch wiederherstellen',restorePlaceholder:'KNABA-Zugangscode',restoreAction:'Gespräch öffnen',codeWarning:'Wer diesen Zugangscode kennt, kann Ihre Unterhaltung lesen. Bewahren Sie ihn privat auf.',invalidCode:'Ungültiger oder abgelaufener Zugangscode.',},
  en: {tag:'Digital guidance · Contact owner',open:'Open chat',close:'Close',welcome:'Hello! I can help with construction cleaning and site services.',placeholder:'Your question or request …',privacy:'I have read the privacy notice and agree to send this conversation to KnaBa.',captcha:'Please complete the security check.',captchaPrompt:'The security check appears after you acknowledge the privacy notice.',send:'Send',human:'Speak to the owner',name:'Name (optional)',email:'Email (optional)',phone:'Phone (optional)',request:'Send to owner',notice:'Automatic replies are not binding. Only KnaBa can confirm prices and appointments.',hold:'Your request is in the owner inbox. Replies will appear here.',no:'Connection lost. Please try again.',agreement:'Terms to review',pending:'Review the terms. This is not an automatic contract or order.',accept:'Confirm content',decline:'Decline',accepted:'Confirmed',declined:'Declined',mic:'Dictate',speak:'Read aloud',recording:'Speech recognition may share audio with your browser provider. Continue?',unsupported:'Speech recognition is not supported in this browser.',new:'New conversation',fresh:'Start a new conversation? Without a saved access code, you may lose access to the previous one.',privacyLink:'Privacy',session:'Save your private access code to resume the conversation after closing the browser.',closed:'This conversation is closed.',copyCode:'Save access code',copied:'Code copied',manualCopy:'Copy this access code',restoreTitle:'Resume a previous conversation',restorePlaceholder:'KNABA access code',restoreAction:'Open conversation',codeWarning:'Anyone with this code can read your conversation. Keep it private.',invalidCode:'Invalid or expired access code.',},
  uk: {tag:'Онлайн-консультація · Зв’язок із власником',open:'Відкрити чат',close:'Закрити',welcome:'Вітаю! Підкажу щодо послуг KnaBa.',placeholder:'Ваше питання чи побажання …',privacy:'Я ознайомився з політикою конфіденційності та хочу надіслати цю розмову KnaBa.',captcha:'Пройдіть перевірку безпеки.',captchaPrompt:'Після підтвердження ознайомлення з політикою з’явиться перевірка безпеки.',send:'Надіслати',human:'Зв’язатися з власником',name:'Ім’я (необов’язково)',email:'Email (необов’язково)',phone:'Телефон (необов’язково)',request:'Передати власнику',notice:'Автоматичні відповіді не є офертою. Ціни й час підтверджує лише KnaBa.',hold:'Запит у кабінеті власника. Відповідь з’явиться тут.',no:'З’єднання втрачено. Спробуйте ще раз.',agreement:'Умови для погодження',pending:'Перевірте умови. Це не автоматичне укладення договору чи замовлення.',accept:'Підтвердити зміст',decline:'Відхилити',accepted:'Підтверджено',declined:'Відхилено',mic:'Диктувати',speak:'Озвучити',recording:'Розпізнавання голосу може передати аудіо постачальнику браузера. Продовжити?',unsupported:'Ваш браузер не підтримує розпізнавання голосу.',new:'Нова розмова',fresh:'Почати нову розмову? Без збереженого коду ви можете втратити доступ до попередньої.',privacyLink:'Конфіденційність',session:'Збережіть приватний код доступу, щоб відновити розмову після закриття браузера.',closed:'Цю розмову закрито.',copyCode:'Зберегти код доступу',copied:'Код скопійовано',manualCopy:'Скопіюйте цей код доступу',restoreTitle:'Відновити попередню розмову',restorePlaceholder:'Код доступу KNABA',restoreAction:'Відкрити розмову',codeWarning:'Кожен, хто знає цей код, зможе читати розмову. Бережіть його.',invalidCode:'Недійсний або прострочений код доступу.',},
  ru: {tag:'Онлайн-консультация · Связь с владельцем',open:'Открыть чат',close:'Закрыть',welcome:'Здравствуйте! Помогу с услугами KnaBa.',placeholder:'Ваш вопрос или пожелание …',privacy:'Я ознакомился с политикой конфиденциальности и хочу отправить эту беседу KnaBa.',captcha:'Пройдите проверку безопасности.',captchaPrompt:'После подтверждения ознакомления с политикой появится проверка безопасности.',send:'Отправить',human:'Связаться с владельцем',name:'Имя (необязательно)',email:'Email (необязательно)',phone:'Телефон (необязательно)',request:'Передать владельцу',notice:'Автоматические ответы не являются офертой. Цены и сроки подтверждает только KnaBa.',hold:'Обращение есть в кабинете владельца. Ответ появится здесь.',no:'Нет соединения. Повторите попытку.',agreement:'Условия для согласования',pending:'Проверьте условия. Это не автоматическое заключение договора или заказа.',accept:'Подтвердить содержание',decline:'Отклонить',accepted:'Подтверждено',declined:'Отклонено',mic:'Диктовать',speak:'Озвучить',recording:'Распознавание речи может передать аудио поставщику браузера. Продолжить?',unsupported:'Ваш браузер не поддерживает распознавание речи.',new:'Новая беседа',fresh:'Начать новую беседу? Без сохранённого кода доступ к прежнему разговору может быть утрачен.',privacyLink:'Конфиденциальность',session:'Сохраните личный код доступа, чтобы восстановить переписку после закрытия браузера.',closed:'Этот разговор закрыт.',copyCode:'Сохранить код доступа',copied:'Код скопирован',manualCopy:'Скопируйте код доступа',restoreTitle:'Восстановить прошлый разговор',restorePlaceholder:'Код доступа KNABA',restoreAction:'Открыть разговор',codeWarning:'Любой, у кого есть этот код, сможет прочитать переписку. Храните его в тайне.',invalidCode:'Неверный или устаревший код доступа.',}
} as const;
async function http<T>(path:string,method='GET',data?:unknown,token?:string):Promise<T>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-KnaBa-Request':'portal-v1',...(token?{'X-KnaBa-Conversation':token}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
    if(!r.ok)throw new Error(String(r.status));
    return await r.json() as T;
  }finally{clearTimeout(timeout);}
}
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onend:(()=>void)|null;onerror:(()=>void)|null;start:()=>void;stop:()=>void};
export default function KnabaAssistant(props:{locale?:AssistantLocale;initialOpen?:boolean}){
  const locale=assistantLocale(props.locale),t=captions[locale],speechLocale={de:'de-DE',en:'en-GB',uk:'uk-UA',ru:'ru-RU'}[locale];
  const [open,setOpen]=createSignal(props.initialOpen??false),[ticket,setTicket]=createSignal<Ticket|null>(null),[thread,setThread]=createSignal<Thread|null>(null);
  const [draft,setDraft]=createSignal(''),[key,setKey]=createSignal(''),[accepted,setAccepted]=createSignal(false),[busy,setBusy]=createSignal(false),[error,setError]=createSignal('');
  const [human,setHuman]=createSignal(false),[name,setName]=createSignal(''),[email,setEmail]=createSignal(''),[phone,setPhone]=createSignal('');
  const [recording,setRecording]=createSignal(false);
  const [captchaStatus,setCaptchaStatus]=createSignal<CaptchaState>('loading'),[captchaToken,setCaptchaToken]=createSignal('');
  const [captchaResetVersion,setCaptchaResetVersion]=createSignal(0);
  const captchaChanged=(status:CaptchaState,token='')=>{setCaptchaStatus(status);setCaptchaToken(token);};
  const [recoveryInput,setRecoveryInput]=createSignal(''),[codeCopied,setCodeCopied]=createSignal(false);
  let recognition:Recognition|null=null,log:HTMLDivElement|undefined;
  let conversationRevision=0;
  const privacyPath=locale==='ru'?'/ru/datenschutz/':'/datenschutz/';
  onMount(()=>{
    try {
      const value=JSON.parse(sessionStorage.getItem(STORAGE)||'null') as Ticket|null;
      if(value&&/^[a-f0-9-]{36}$/i.test(value.id)&&/^[a-f0-9]{64}$/i.test(value.token)){setTicket(value);setAccepted(true);void load(value);}
    }catch{}
    const timer=setInterval(()=>{const current=ticket();if(open()&&current&&!document.hidden)void load(current);},8000);
    onCleanup(()=>{clearInterval(timer);recognition?.stop();window.speechSynthesis?.cancel();});
  });
  createEffect(()=>{thread()?.messages.length;thread()?.offers.length;queueMicrotask(()=>{if(log)log.scrollTop=log.scrollHeight;});});
  async function load(current:Ticket):Promise<boolean>{
    const revision=conversationRevision;
    try{const result=await http<Thread>(`/api/assistant/conversations/${current.id}`,'GET',undefined,current.token);if(ticket()?.id===current.id&&revision===conversationRevision){setThread(result);setError('');}return true;}
    catch{if(open()&&ticket()?.id===current.id&&revision===conversationRevision)setError(t.no);return false;}
  }
  async function leadAction(action:LeadAction,input:unknown):Promise<ErpLeadView|null>{
    if(busy())throw Error('busy');
    if(!accepted()){setError(t.privacy);throw Error('privacy_required');}
    setBusy(true);setError('');conversationRevision++;
    try{
      const current=await ensure();
      const result=await http<{lead:ErpLeadView|null}>(`/api/assistant/conversations/${current.id}/lead/${action}`,'POST',input,current.token);
      // Invalidate polling started while the mutation was pending.
      conversationRevision++;
      if(ticket()?.id===current.id){
        setThread(previous=>previous?.conversation.id===current.id?{...previous,lead:result.lead}:{conversation:{id:current.id,status:'assistant'},messages:[],offers:[],lead:result.lead});
        void load(current);
      }
      return result.lead;
    }finally{setBusy(false);}
  }
  async function refreshLead(){
    const current=ticket();
    if(!current||!await load(current))throw Error('unavailable');
  }
  async function ensure():Promise<Ticket>{
    if(ticket())return ticket()!;
    if(captchaStatus()!=='disabled' && (captchaStatus()!=='verified'||!captchaToken())){
      throw Error('captcha_required');
    }
    const captcha=captchaStatus()==='verified'?captchaToken():undefined;
    let created:Ticket;
    try{
      created=await http<Ticket>('/api/assistant/conversations','POST',{locale,privacyAccepted:accepted(),website:'',...(captcha?{captchaToken:captcha}:{})});
    }catch(error){
      if(captcha){setCaptchaToken('');setCaptchaStatus('pending');setCaptchaResetVersion(n=>n+1);}
      throw error;
    }
    setTicket(created);
    try{sessionStorage.setItem(STORAGE,JSON.stringify(created));}catch{}
    return created;
  }
  async function send(event:Event){
    event.preventDefault();if(busy()||!draft().trim())return;
    if(!accepted()){setError(t.privacy);return;}
    setBusy(true);setError('');
    try{
      const current=await ensure(),requestKey=key()||crypto.randomUUID();
      setKey(requestKey);
      setThread(await http<Thread>(`/api/assistant/conversations/${current.id}/messages`,'POST',{content:draft().trim(),idempotencyKey:requestKey},current.token));
      setKey('');setDraft('');
    }catch(problem){setError(problem instanceof Error && problem.message==='captcha_required'?t.captcha:t.no);}finally{setBusy(false);}
  }
  async function handoff(event:Event){
    event.preventDefault();if(!accepted()){setError(t.privacy);return;}
    setBusy(true);setError('');
    try{
      const current=await ensure();
      setThread(await http<Thread>(`/api/assistant/conversations/${current.id}/handoff`,'POST',{name:name().trim(),email:email().trim(),phone:phone().trim()},current.token));
      setHuman(false);
    }catch(problem){setError(problem instanceof Error && problem.message==='captcha_required'?t.captcha:t.no);}finally{setBusy(false);}
  }
  async function decide(offer:Offer,decision:'accepted'|'declined'){
    const current=ticket();if(!current||busy())return;
    setBusy(true);setError('');
    try{setThread(await http<Thread>(`/api/assistant/conversations/${current.id}/offers/${offer.id}/decision`,'POST',{decision},current.token));}
    catch{setError(t.no);}finally{setBusy(false);}
  }
  function speak(){
    if(!('speechSynthesis' in window))return;
    const answer=[...(thread()?.messages||[])].reverse().find(m=>m.sender!=='customer')?.content||assistantGreeting(locale);
    window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(answer);utterance.lang=speechLocale;window.speechSynthesis.speak(utterance);
  }
  function dictate(){
    if(recording()){recognition?.stop();return;}
    const w=window as Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
    const speechCtor=w.SpeechRecognition||w.webkitSpeechRecognition;
    if(!speechCtor){setError(t.unsupported);return;}
    if(!window.confirm(t.recording))return;
    const active=new speechCtor();recognition=active;active.lang=speechLocale;active.continuous=false;active.interimResults=false;
    active.onresult=e=>{setDraft(e.results[0]?.[0]?.transcript??'');setKey('');};
    active.onend=()=>setRecording(false);active.onerror=()=>setRecording(false);
    try{active.start();setRecording(true);}catch{setRecording(false);}
  }
  async function restore(event:Event){
    event.preventDefault();if(busy())return;
    const recovered=parseRecoveryCode(recoveryInput());
    if(!recovered){setError(t.invalidCode);return;}
    setBusy(true);setError('');conversationRevision++;
    try {
      // Server validates the bearer token before storing or displaying a conversation.
      const result=await http<Thread>(`/api/assistant/conversations/${recovered.id}`,'GET',undefined,recovered.token);
      setTicket(recovered);setThread(result);setAccepted(true);setRecoveryInput('');setHuman(false);
      try{sessionStorage.setItem(STORAGE,JSON.stringify(recovered));}catch{}
    }catch{setError(t.invalidCode);}finally{setBusy(false);}
  }
  async function copyRecovery(){
    const current=ticket();if(!current)return;
    const code=formatRecoveryCode(current);
    setCodeCopied(false);
    try{
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
    }catch{
      window.prompt(t.manualCopy,code);
    }
  }
  function reset(){
    if(!window.confirm(t.fresh))return;
    try{sessionStorage.removeItem(STORAGE);}catch{}
    conversationRevision++;
    setTicket(null);setThread(null);setAccepted(false);setDraft('');setHuman(false);setError('');setKey('');setRecoveryInput('');setCodeCopied(false);
    setCaptchaToken('');setCaptchaStatus('loading');setCaptchaResetVersion(v=>v+1);
  }
  return <aside class="ka-wrap" lang={locale}>
    <Show when={open()} fallback={<button type="button" class="ka-launcher" onClick={()=>setOpen(true)} aria-label={t.open}><span aria-hidden="true">✳</span> KNABA Assistant</button>}>
      <section role="dialog" aria-modal="false" aria-label="KNABA Assistant" class="ka-panel">
        <header class="ka-header"><div><strong>✳ KNABA Assistant</strong><small>{t.tag}</small></div><button type="button" class="ka-icon" onClick={()=>{setOpen(false);setCaptchaToken('');setCaptchaStatus('loading');}} aria-label={t.close}>×</button></header>
        <div ref={log} class="ka-history" aria-live="polite" aria-relevant="additions">
          <p class="ka-message ka-assistant"><span>KNABA Assistant</span>{assistantGreeting(locale)}</p>
          <For each={thread()?.messages??[]}>{item=><p class={`ka-message ka-${item.sender}`}><span>{item.sender==='owner'?'KnaBa':item.sender==='assistant'?'KNABA Assistant':''}</span>{item.content}</p>}</For>
          <For each={thread()?.offers??[]}>{offer=><div class="ka-offer"><strong>{t.agreement}</strong><p>{offer.content}</p><Show when={offer.state==='pending'} fallback={<small>{offer.state==='accepted'?t.accepted:t.declined}</small>}><small>{t.pending}</small><div class="ka-row"><button type="button" disabled={busy()} onClick={()=>void decide(offer,'accepted')}>{t.accept}</button><button type="button" disabled={busy()} onClick={()=>void decide(offer,'declined')}>{t.decline}</button></div></Show></div>}</For>
          <Show when={thread()?.conversation.status==='human'}><p class="ka-status">{t.hold}</p></Show>
          <Show when={thread()?.conversation.status==='closed'}><p class="ka-status">{t.closed}</p></Show>
        </div>
        <Show when={error()}><p class="ka-error" role="alert">{error()}</p></Show>
        <div class="ka-bottom">
          <p class="ka-note">{t.notice}</p>
          <Show when={!ticket()}><label class="ka-consent"><input type="checkbox" checked={accepted()} onChange={e=>{const next=e.currentTarget.checked;setAccepted(next);if(!next){setCaptchaToken('');setCaptchaStatus('loading');}}}/><span>{t.privacy} <a href={privacyPath}>↗ {t.privacyLink}</a></span></label></Show>
          <Show when={!ticket() && !accepted()}><p class="ka-captcha-hint">{t.captchaPrompt}</p></Show>
          <Show when={!ticket() && accepted()}>
            <AssistantCaptcha locale={locale} resetVersion={captchaResetVersion()} onChange={captchaChanged}/>
          </Show>
          <Show when={!ticket()}>
            <form class="ka-recovery" onSubmit={e=>void restore(e)}>
              <label for="ka-recovery-code">{t.restoreTitle}</label>
              <div class="ka-recovery-row"><input id="ka-recovery-code" type="password" autocomplete="off" spellcheck={false} maxLength={140} placeholder={t.restorePlaceholder} value={recoveryInput()} onInput={e=>setRecoveryInput(e.currentTarget.value)}/><button type="submit" disabled={busy()||!recoveryInput().trim()}>{t.restoreAction}</button></div>
            </form>
          </Show>
          <Show when={human()}>
            <form class="ka-handoff-form" onSubmit={e=>void handoff(e)}>
              <input aria-label={t.name} placeholder={t.name} maxLength={80} value={name()} onInput={e=>setName(e.currentTarget.value)}/>
              <input type="email" aria-label={t.email} placeholder={t.email} maxLength={254} value={email()} onInput={e=>setEmail(e.currentTarget.value)}/>
              <input type="tel" aria-label={t.phone} placeholder={t.phone} maxLength={35} value={phone()} onInput={e=>setPhone(e.currentTarget.value)}/>
              <button type="submit" class="ka-main-button" disabled={busy()}>{t.request} →</button>
            </form>
          </Show>
          <Show when={thread()?.conversation.status!=='closed'}>
            <form onSubmit={e=>void send(e)} class="ka-chat-form">
              <label class="sr-only" for="ka-input">{t.placeholder}</label>
              <textarea id="ka-input" rows={2} maxLength={1000} placeholder={t.placeholder} value={draft()} onInput={e=>{setDraft(e.currentTarget.value);setKey('');}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
              <div class="ka-form-row"><button type="button" class="ka-icon" onClick={dictate} aria-label={t.mic} title={t.mic}>🎙</button><button type="button" class="ka-icon" onClick={speak} aria-label={t.speak} title={t.speak}>🔊</button><button type="submit" class="ka-main-button" disabled={busy()||!draft().trim()}>{t.send} ↗</button></div>
            </form>
            <button type="button" class="ka-contact-owner" onClick={()=>setHuman(v=>!v)} disabled={busy()}>{t.human} ↗</button>
          </Show>
          <AssistantLead locale={locale} conversationKey={ticket()?.id??'new'} lead={thread()?.lead} canStart={accepted()&&Boolean(ticket()||captchaStatus()==='disabled'||captchaStatus()==='verified'&&captchaToken())} busy={busy()} closed={thread()?.conversation.status==='closed'} onAction={leadAction} onRefresh={refreshLead}/>
          <nav aria-label="KnaBa"><a href="tel:+493067933054">☎ +49 (30) 679 330 54</a><a href="mailto:kontakt@knaba.de">✉ kontakt@knaba.de</a></nav>
          <Show when={ticket()}><div class="ka-recovery-save"><button type="button" onClick={()=>void copyRecovery()}>{codeCopied()?t.copied:t.copyCode} ↗</button><small>{t.codeWarning}</small></div><button type="button" class="ka-reset" disabled={busy()} onClick={reset}>{t.new}</button><p class="ka-ephemeral">{t.session}</p></Show>
        </div>
      </section>
    </Show>
  </aside>;
}
