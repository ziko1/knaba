import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { assistantGreeting, assistantLocale, type AssistantLocale } from '../lib/assistant-knowledge';
import { formatRecoveryCode,parseRecoveryCode,type AssistantTicket } from '../lib/assistant-recovery';
import { createAssistantRequestState,sameAssistantTicket,type AssistantRequestScope } from '../lib/assistant-request-state';
import {createAssistantDisplayReceipts,visibleOwnerMessageIds} from '../lib/assistant-display-receipts';
import {assistantTickets} from '../lib/assistant-ticket';
import {assistantInquiryAction} from '../lib/assistant-request-copy';
import AssistantCaptcha, {type CaptchaState} from './AssistantCaptcha';
import type widgetLabels from '../data/assistant-widget-locales/widget-de.json';

type WidgetLabels=Readonly<typeof widgetLabels>;
const captionKeys='tag open close welcome placeholder privacy captcha captchaPrompt send human name email phone request notice hold no agreement pending accept decline accepted declined mic speak recording unsupported new fresh privacyLink session closed copyCode copied manualCopy restoreTitle restorePlaceholder restoreAction codeWarning invalidCode'.split(' ');
export function parseAssistantLabels(value:unknown):WidgetLabels{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==captionKeys.length||captionKeys.some(key=>{
    const text=(value as Record<string,unknown>)[key];return typeof text!=='string'||!text.trim()||text.length>4000||/[<>]/.test(text);
  }))throw Error('Assistant labels unavailable');
  return value as WidgetLabels;
}

type Message = {id:string;sender:'customer'|'assistant'|'owner';content:string;createdAt:string;guestDisplayedAt?:string|null};
type Offer = {id:string;content:string;state:'pending'|'accepted'|'declined'};
type Thread = {conversation:{id:string;status:'assistant'|'human'|'closed'};messages:Message[];offers:Offer[]};
type Ticket = AssistantTicket;

class AssistantHttpError extends Error {
  constructor(readonly status:number){super(`HTTP ${status}`);}
}
async function http<T>(path:string,method='GET',data?:unknown,token?:string,signal?:AbortSignal):Promise<T>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  const abort=()=>controller.abort();
  if(signal?.aborted)abort();
  else signal?.addEventListener('abort',abort,{once:true});
  try {
    const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-KnaBa-Request':'portal-v1',...(token?{'X-KnaBa-Conversation':token}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
    if(!r.ok)throw new AssistantHttpError(r.status);
    return await r.json() as T;
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onend:(()=>void)|null;onerror:(()=>void)|null;start:()=>void;stop:()=>void};

// Keep focus in the ordinary tab order: this is a nonmodal, dismissible panel.
export function assistantDialogControls(options:{
  isOpen:()=>boolean;
  panel:()=>HTMLElement|undefined;
  launcher:()=>HTMLButtonElement|undefined;
  close:()=>void;
  stopSpeech:()=>void;
}) {
  const focus=(element:HTMLElement|undefined)=>{if(element?.isConnected)element.focus({preventScroll:true});};
  const close=()=>{
    options.stopSpeech();
    options.close();
    // Solid replaces the panel with a new launcher, including after lazy mount.
    queueMicrotask(()=>{if(!options.isOpen())focus(options.launcher());});
  };
  return {
    focusOnOpen:()=>queueMicrotask(()=>{if(options.isOpen())focus(options.panel());}),
    close,
    keydown:(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.isComposing||event.defaultPrevented)return;
      event.preventDefault();event.stopPropagation();close();
    },
  };
}
export default function KnabaAssistant(props:{locale?:AssistantLocale;initialOpen?:boolean;initialLabels:WidgetLabels}){
  const locale=assistantLocale(props.locale),t=parseAssistantLabels(props.initialLabels),speechLocale={de:'de-DE',en:'en-GB',pl:'pl-PL',lt:'lt-LT',ru:'ru-RU',uk:'uk-UA'}[locale];
  const [open,setOpen]=createSignal(props.initialOpen??false),[ticket,setTicket]=createSignal<Ticket|null>(null),[thread,setThread]=createSignal<Thread|null>(null);
  const [draft,setDraft]=createSignal(''),[key,setKey]=createSignal(''),[accepted,setAccepted]=createSignal(false),[busy,setBusy]=createSignal(false),[error,setError]=createSignal('');
  const [human,setHuman]=createSignal(false),[name,setName]=createSignal(''),[email,setEmail]=createSignal(''),[phone,setPhone]=createSignal('');
  const [recording,setRecording]=createSignal(false);
  const [captchaStatus,setCaptchaStatus]=createSignal<CaptchaState>('loading'),[captchaToken,setCaptchaToken]=createSignal('');
  const [captchaResetVersion,setCaptchaResetVersion]=createSignal(0);
  const captchaChanged=(status:CaptchaState,token='')=>{setCaptchaStatus(status);setCaptchaToken(token);};
  const [recoveryInput,setRecoveryInput]=createSignal(''),[codeCopied,setCodeCopied]=createSignal(false);
  const requests=createAssistantRequestState();
  let recognition:Recognition|null=null,log:HTMLDivElement|undefined,panel:HTMLElement|undefined,launcher:HTMLButtonElement|undefined,persistingTicket=false;
  const receipts=createAssistantDisplayReceipts({
    ticket,frame:callback=>requestAnimationFrame(callback),cancelFrame:id=>cancelAnimationFrame(id),
    displayedIds:()=>{
      const current=ticket(),snapshot=thread();
      if(!open()||document.visibilityState!=='visible'||!current||snapshot?.conversation.id!==current.id)return [];
      // Older servers omit this additive field; do not send unsupported receipt requests.
      const allowed=new Set(snapshot.messages.filter(message=>message.sender==='owner'&&message.guestDisplayedAt===null).map(message=>message.id));
      const viewport=window.visualViewport,left=viewport?.offsetLeft??0,top=viewport?.offsetTop??0;
      return visibleOwnerMessageIds(log,allowed,{left,top,right:left+(viewport?.width??window.innerWidth),bottom:top+(viewport?.height??window.innerHeight)});
    },
    send:async(current,messageIds,signal)=>{await http(`/api/assistant/conversations/${current.id}/displayed`,'POST',{messageIds},current.token,signal);},
    error:(problem,current)=>{expireGuestAccess(problem,current);},
  });
  onCleanup(()=>{requests.dispose();receipts.dispose();});
  function stopSpeech(){
    const active=recognition;recognition=null;
    if(active){
      // A final result may arrive after stop; never overwrite a closed draft.
      active.onresult=null;active.onend=null;active.onerror=null;
      try{active.stop();}catch{}
    }
    setRecording(false);
    window.speechSynthesis?.cancel();
  }
  const dialog=assistantDialogControls({
    isOpen:open,panel:()=>panel,launcher:()=>launcher,stopSpeech,
    close:()=>{setOpen(false);setCaptchaToken('');setCaptchaStatus('loading');},
  });
  const contactPath=locale==='de'?'/kontakt/':`/${locale}/kontakt/`;
  const contactLabel={de:'Alle Kontaktmöglichkeiten',en:'All contact options',pl:'Wszystkie możliwości kontaktu',lt:'Visi susisiekimo būdai',uk:'Усі способи зв’язку',ru:'Все способы связи'}[locale];
  const privacyPath=locale==='ru'?'/ru/datenschutz/':'/datenschutz/';
  onMount(()=>{
    const value=assistantTickets.current();
    if(value){setTicket(value);setAccepted(true);void load(value);}
    const unsubscribe=assistantTickets.subscribe(()=>{
      if(persistingTicket)return;
      const current=ticket();
      if(current&&!sameAssistantTicket(assistantTickets.current(),current))expireGuestAccess(new AssistantHttpError(404),current);
    });
    const timer=setInterval(()=>{const current=ticket();if(open()&&current&&!document.hidden)void load(current);},8000);
    const schedule=()=>receipts.schedule();
    document.addEventListener('visibilitychange',schedule);window.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
    onCleanup(()=>{
      unsubscribe();clearInterval(timer);stopSpeech();document.removeEventListener('visibilitychange',schedule);window.removeEventListener('resize',schedule);
      window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);
    });
  });
  createEffect(()=>{if(open())dialog.focusOnOpen();});
  createEffect(()=>{thread()?.messages.length;thread()?.offers.length;queueMicrotask(()=>{if(log)log.scrollTop=log.scrollHeight;});});
  createEffect(()=>{open();ticket();thread();receipts.schedule();});
  function persistTicket(value:Ticket|null){
    // Chat may continue in memory when session storage is unavailable. The
    // structured form still requires a successfully captured stored capability.
    persistingTicket=true;try{assistantTickets.write(value);}finally{persistingTicket=false;}
  }
  function expireGuestAccess(problem:unknown,current:Ticket|null):boolean{
    if(!(problem instanceof AssistantHttpError)||problem.status!==404||!current||!sameAssistantTicket(ticket(),current))return false;
    requests.reset();receipts.reset();stopSpeech();setBusy(false);
    setTicket(null);setThread(null);setHuman(false);setKey('');setCodeCopied(false);
    if(sameAssistantTicket(assistantTickets.current(),current))persistTicket(null);
    setAccepted(false);setCaptchaToken('');setCaptchaStatus('loading');setCaptchaResetVersion(v=>v+1);
    // Preserve text the visitor has typed; a new conversation needs fresh consent.
    setError(t.invalidCode);
    return true;
  }
  async function load(current:Ticket){
    if(!sameAssistantTicket(ticket(),current))return;
    await requests.run('poll',request=>http<Thread>(`/api/assistant/conversations/${current.id}`,'GET',undefined,current.token,request.signal),{
      success:result=>{if(sameAssistantTicket(ticket(),current)){setThread(result);setError('');}},
      error:problem=>{if(!expireGuestAccess(problem,current)&&open()&&sameAssistantTicket(ticket(),current))setError(t.no);},
    });
  }
  async function ensure(request:AssistantRequestScope):Promise<Ticket>{
    request.check();
    if(ticket())return ticket()!;
    if(captchaStatus()!=='disabled' && (captchaStatus()!=='verified'||!captchaToken())){
      throw Error('captcha_required');
    }
    const captcha=captchaStatus()==='verified'?captchaToken():undefined;
    let created:Ticket;
    try{
      created=await http<Ticket>('/api/assistant/conversations','POST',{locale,privacyAccepted:accepted(),website:'',...(captcha?{captchaToken:captcha}:{})},undefined,request.signal);
    }catch(error){
      if(request.isCurrent()&&captcha){setCaptchaToken('');setCaptchaStatus('pending');setCaptchaResetVersion(n=>n+1);}
      throw error;
    }
    request.check();
    setTicket(created);
    persistTicket(created);
    return created;
  }
  async function send(event:Event){
    event.preventDefault();if(busy()||!draft().trim())return;
    if(!accepted()){setError(t.privacy);return;}
    const submitted=draft(),content=submitted.trim(),requestKey=key()||crypto.randomUUID();
    let submittedTicket:Ticket|null=null;
    await requests.run('action',async request=>{
      const current=await ensure(request);request.check();
      submittedTicket=current;
      const result=await http<Thread>(`/api/assistant/conversations/${current.id}/messages`,'POST',{content,idempotencyKey:requestKey},current.token,request.signal);
      return {current,result};
    },{
      start:()=>{setBusy(true);setError('');setKey(requestKey);},
      success:({current,result})=>{
        if(!sameAssistantTicket(ticket(),current))return;
        setThread(result);
        // The visitor may already be writing the next message while this one sends.
        if(key()===requestKey){if(draft()===submitted)setDraft('');setKey('');}
      },
      error:problem=>{if(!expireGuestAccess(problem,submittedTicket))setError(problem instanceof Error && problem.message==='captcha_required'?t.captcha:t.no);},
      finish:()=>setBusy(false),
    });
  }
  async function handoff(event:Event){
    event.preventDefault();if(busy())return;
    if(!accepted()){setError(t.privacy);return;}
    const contact={name:name().trim(),email:email().trim(),phone:phone().trim()};
    let submittedTicket:Ticket|null=null;
    await requests.run('action',async request=>{
      const current=await ensure(request);request.check();
      submittedTicket=current;
      const result=await http<Thread>(`/api/assistant/conversations/${current.id}/handoff`,'POST',contact,current.token,request.signal);
      return {current,result};
    },{
      start:()=>{setBusy(true);setError('');},
      success:({current,result})=>{if(sameAssistantTicket(ticket(),current)){setThread(result);setHuman(false);}},
      error:problem=>{if(!expireGuestAccess(problem,submittedTicket))setError(problem instanceof Error && problem.message==='captcha_required'?t.captcha:t.no);},
      finish:()=>setBusy(false),
    });
  }
  async function decide(offer:Offer,decision:'accepted'|'declined'){
    const current=ticket();if(!current||busy())return;
    await requests.run('action',request=>http<Thread>(`/api/assistant/conversations/${current.id}/offers/${offer.id}/decision`,'POST',{decision},current.token,request.signal),{
      start:()=>{setBusy(true);setError('');},
      success:result=>{if(sameAssistantTicket(ticket(),current))setThread(result);},
      error:problem=>{if(!expireGuestAccess(problem,current))setError(t.no);},finish:()=>setBusy(false),
    });
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
    await requests.run('action',request=>http<Thread>(`/api/assistant/conversations/${recovered.id}`,'GET',undefined,recovered.token,request.signal),{
      start:()=>{setBusy(true);setError('');},
      success:result=>{
        // Server validates the bearer token before storing or displaying a conversation.
        setTicket(recovered);setThread(result);setAccepted(true);setRecoveryInput('');setHuman(false);
        persistTicket(recovered);
      },
      error:()=>setError(t.invalidCode),finish:()=>setBusy(false),
    });
  }
  async function copyRecovery(){
    const current=ticket();if(!current)return;
    const code=formatRecoveryCode(current);
    const isCurrent=requests.checkpoint();
    setCodeCopied(false);
    try{
      await navigator.clipboard.writeText(code);
      if(isCurrent()&&sameAssistantTicket(ticket(),current))setCodeCopied(true);
    }catch{
      if(isCurrent()&&sameAssistantTicket(ticket(),current))window.prompt(t.manualCopy,code);
    }
  }
  function reset(){
    if(!window.confirm(t.fresh))return;
    requests.reset();receipts.reset();stopSpeech();setBusy(false);
    setTicket(null);setThread(null);setAccepted(false);setDraft('');setHuman(false);setError('');setKey('');setRecoveryInput('');setCodeCopied(false);
    persistTicket(null);
    setCaptchaToken('');setCaptchaStatus('loading');setCaptchaResetVersion(v=>v+1);
  }
  function openInquiry(event:MouseEvent){
    const current=ticket();
    if(busy()){event.preventDefault();return;}
    if(!current||!assistantTickets.capture(current)){event.preventDefault();setError(t.invalidCode);}
  }
  return <aside class="ka-wrap" lang={locale}>
    <Show when={open()} fallback={<button ref={launcher} type="button" class="ka-launcher" onClick={()=>setOpen(true)} aria-label={t.open}><span aria-hidden="true">✳</span> KNABA Assistant</button>}>
      <section ref={panel} role="dialog" aria-modal="false" aria-label="KNABA Assistant" class="ka-panel" tabIndex={-1} onKeyDown={dialog.keydown}>
        <header class="ka-header"><div><strong>✳ KNABA Assistant</strong><small>{t.tag}</small></div><button type="button" class="ka-icon" onClick={dialog.close} aria-label={t.close}>×</button></header>
        <div ref={log} class="ka-history" aria-live="polite" aria-relevant="additions" onScroll={()=>receipts.schedule()}>
          <p class="ka-message ka-assistant"><span>KNABA Assistant</span>{assistantGreeting(locale)}</p>
          <For each={thread()?.messages??[]}>{item=><p data-owner-message-id={item.sender==='owner'?item.id:undefined} class={`ka-message ka-${item.sender}`}><span>{item.sender==='owner'?'KnaBa':item.sender==='assistant'?'KNABA Assistant':''}</span>{item.content}</p>}</For>
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
          <nav aria-label="KnaBa"><Show when={ticket()}><a href={contactPath+'?intent=assistant'} onClick={openInquiry}>{assistantInquiryAction[locale]} ↗</a></Show><a href={contactPath}>{contactLabel} ↗</a></nav>
          <Show when={ticket()}><div class="ka-recovery-save"><button type="button" onClick={()=>void copyRecovery()}>{codeCopied()?t.copied:t.copyCode} ↗</button><small>{t.codeWarning}</small></div><button type="button" class="ka-reset" onClick={reset}>{t.new}</button><p class="ka-ephemeral">{t.session}</p></Show>
        </div>
      </section>
    </Show>
  </aside>;
}
