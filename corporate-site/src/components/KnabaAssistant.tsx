import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { assistantGreeting, assistantLocale, type AssistantLocale } from '../lib/assistant-knowledge';
import '../styles/assistant.css';

type Message = {id:string;sender:'customer'|'assistant'|'owner';content:string;createdAt:string};
type Offer = {id:string;content:string;state:'pending'|'accepted'|'declined'};
type Thread = {conversation:{id:string;status:'assistant'|'human'|'closed'};messages:Message[];offers:Offer[]};
type Ticket = {id:string;token:string};
const STORAGE='knaba-assistant-ticket-v1';
const captions = {
  de: {tag:'Digitale Beratung · Direktkontakt',open:'Chat öffnen',close:'Schließen',welcome:'Hallo! Ich kann Sie zu den KnaBa-Leistungen beraten.',placeholder:'Ihre Frage oder Wünsche …',privacy:'Ich habe die Datenschutzhinweise gelesen und möchte meine Unterhaltung an KnaBa übermitteln.',send:'Senden',human:'Mit dem Inhaber sprechen',name:'Name (optional)',email:'E-Mail (optional)',phone:'Telefon (optional)',request:'An Inhaber weiterleiten',notice:'Automatische Antworten sind unverbindlich. Preise und Termine werden nur persönlich bestätigt.',hold:'Die Nachricht ist im Inhaber-Postfach. Antworten erscheinen hier.',no:'Die Verbindung ist unterbrochen. Bitte erneut versuchen.',agreement:'Angebot zur Abstimmung',pending:'Bitte den Inhalt prüfen. Dies ist noch keine automatische Auftrags- oder Vertragsbestätigung.',accept:'Inhalt bestätigen',decline:'Ablehnen',accepted:'Bestätigt',declined:'Abgelehnt',mic:'Diktieren',speak:'Vorlesen',recording:'Die Spracherkennung kann Daten an den Browserhersteller übertragen. Fortfahren?',unsupported:'Spracherkennung wird in diesem Browser nicht unterstützt.',new:'Neues Gespräch',fresh:'Neues Gespräch beginnen? Auf das bisherige kann danach von diesem Browser aus nicht mehr zugegriffen werden.',privacyLink:'Datenschutz',session:'Der Gesprächszugang gilt nur für diese Browsersitzung. Halten Sie das Fenster offen, wenn Sie auf Antwort warten.',closed:'Dieses Gespräch wurde geschlossen.'},
  en: {tag:'Digital guidance · Contact owner',open:'Open chat',close:'Close',welcome:'Hello! I can help with KnaBa cleaning services.',placeholder:'Your question or request …',privacy:'I have read the privacy notice and agree to send this conversation to KnaBa.',send:'Send',human:'Speak to the owner',name:'Name (optional)',email:'Email (optional)',phone:'Phone (optional)',request:'Send to owner',notice:'Automatic replies are not binding. Only KnaBa can confirm prices and appointments.',hold:'Your request is in the owner inbox. Replies will appear here.',no:'Connection lost. Please try again.',agreement:'Terms to review',pending:'Review the terms. This is not an automatic contract or order.',accept:'Confirm content',decline:'Decline',accepted:'Confirmed',declined:'Declined',mic:'Dictate',speak:'Read aloud',recording:'Speech recognition may share audio with your browser provider. Continue?',unsupported:'Speech recognition is not supported in this browser.',new:'New conversation',fresh:'Start a new conversation? The old one will no longer be accessible from this browser.',privacyLink:'Privacy',session:'The chat access is available only for this browser session. Keep this tab open while waiting for a response.',closed:'This conversation is closed.'},
  uk: {tag:'Онлайн-консультація · Зв’язок із власником',open:'Відкрити чат',close:'Закрити',welcome:'Вітаю! Підкажу щодо послуг KnaBa.',placeholder:'Ваше питання чи побажання …',privacy:'Я ознайомився з політикою конфіденційності та хочу надіслати цю розмову KnaBa.',send:'Надіслати',human:'Зв’язатися з власником',name:'Ім’я (необов’язково)',email:'Email (необов’язково)',phone:'Телефон (необов’язково)',request:'Передати власнику',notice:'Автоматичні відповіді не є офертою. Ціни й час підтверджує лише KnaBa.',hold:'Запит у кабінеті власника. Відповідь з’явиться тут.',no:'З’єднання втрачено. Спробуйте ще раз.',agreement:'Умови для погодження',pending:'Перевірте умови. Це не автоматичне укладення договору чи замовлення.',accept:'Підтвердити зміст',decline:'Відхилити',accepted:'Підтверджено',declined:'Відхилено',mic:'Диктувати',speak:'Озвучити',recording:'Розпізнавання голосу може передати аудіо постачальнику браузера. Продовжити?',unsupported:'Ваш браузер не підтримує розпізнавання голосу.',new:'Нова розмова',fresh:'Почати нову розмову? Попередня стане недоступною з цього браузера.',privacyLink:'Конфіденційність',session:'Доступ до чату існує лише в поточній сесії браузера. Не закривайте вкладку, очікуючи відповідь.',closed:'Цю розмову закрито.'},
  ru: {tag:'Онлайн-консультация · Связь с владельцем',open:'Открыть чат',close:'Закрыть',welcome:'Здравствуйте! Помогу с услугами KnaBa.',placeholder:'Ваш вопрос или пожелание …',privacy:'Я ознакомился с политикой конфиденциальности и хочу отправить эту беседу KnaBa.',send:'Отправить',human:'Связаться с владельцем',name:'Имя (необязательно)',email:'Email (необязательно)',phone:'Телефон (необязательно)',request:'Передать владельцу',notice:'Автоматические ответы не являются офертой. Цены и сроки подтверждает только KnaBa.',hold:'Обращение есть в кабинете владельца. Ответ появится здесь.',no:'Нет соединения. Повторите попытку.',agreement:'Условия для согласования',pending:'Проверьте условия. Это не автоматическое заключение договора или заказа.',accept:'Подтвердить содержание',decline:'Отклонить',accepted:'Подтверждено',declined:'Отклонено',mic:'Диктовать',speak:'Озвучить',recording:'Распознавание речи может передать аудио поставщику браузера. Продолжить?',unsupported:'Ваш браузер не поддерживает распознавание речи.',new:'Новая беседа',fresh:'Начать новую беседу? Предыдущая станет недоступной из этого браузера.',privacyLink:'Конфиденциальность',session:'Доступ к диалогу есть только во время текущей сессии браузера. Не закрывайте вкладку в ожидании ответа.',closed:'Этот разговор закрыт.'}
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
  let recognition:Recognition|null=null,log:HTMLDivElement|undefined;
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
  async function load(current:Ticket){
    try{const result=await http<Thread>(`/api/assistant/conversations/${current.id}`,'GET',undefined,current.token);if(ticket()?.id===current.id){setThread(result);setError('');}}
    catch{if(open())setError(t.no);}
  }
  async function ensure():Promise<Ticket>{
    if(ticket())return ticket()!;
    const created=await http<Ticket>('/api/assistant/conversations','POST',{locale,privacyAccepted:accepted(),website:''});
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
    }catch{setError(t.no);}finally{setBusy(false);}
  }
  async function handoff(event:Event){
    event.preventDefault();if(!accepted()){setError(t.privacy);return;}
    setBusy(true);setError('');
    try{
      const current=await ensure();
      setThread(await http<Thread>(`/api/assistant/conversations/${current.id}/handoff`,'POST',{name:name().trim(),email:email().trim(),phone:phone().trim()},current.token));
      setHuman(false);
    }catch{setError(t.no);}finally{setBusy(false);}
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
  function reset(){
    if(!window.confirm(t.fresh))return;
    try{sessionStorage.removeItem(STORAGE);}catch{}
    setTicket(null);setThread(null);setAccepted(false);setDraft('');setHuman(false);setError('');setKey('');
  }
  return <aside class="ka-wrap" lang={locale}>
    <Show when={open()} fallback={<button type="button" class="ka-launcher" onClick={()=>setOpen(true)} aria-label={t.open}><span aria-hidden="true">✳</span> KNABA Assistant</button>}>
      <section role="dialog" aria-modal="false" aria-label="KNABA Assistant" class="ka-panel">
        <header class="ka-header"><div><strong>✳ KNABA Assistant</strong><small>{t.tag}</small></div><button type="button" class="ka-icon" onClick={()=>setOpen(false)} aria-label={t.close}>×</button></header>
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
          <Show when={!ticket()}><label class="ka-consent"><input type="checkbox" checked={accepted()} onChange={e=>setAccepted(e.currentTarget.checked)}/><span>{t.privacy} <a href={privacyPath} target="_blank" rel="noopener noreferrer">↗ {t.privacyLink}</a></span></label></Show>
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
          <nav aria-label="KnaBa"><a href="tel:+493067933054">☎ +49 (30) 679 330 54</a><a href="mailto:kontakt@knaba.de">✉ kontakt@knaba.de</a></nav>
          <Show when={ticket()}><button type="button" class="ka-reset" onClick={reset}>{t.new}</button><p class="ka-ephemeral">{t.session}</p></Show>
        </div>
      </section>
    </Show>
  </aside>;
}
