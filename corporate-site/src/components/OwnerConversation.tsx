import { createMemo, createSignal, For, onMount, Show, type Accessor } from 'solid-js';
import { conversationCopy, createCapability, createRequestKey, createVisitorThread, listOwnerThreads, loadOwnerThread, loadVisitorThread, restoreConversation, sendOwnerMessage, sendVisitorMessage, sessionStorageKey, ConversationHttpError, type ConversationDetails, type ConversationIdentity, type ConversationLocale, type ConversationMessage, type ConversationThread } from '../lib/assistant-conversation';
import { formatRecoveryCode, parseRecoveryCode } from '../lib/assistant-recovery';
import '../styles/owner-conversation.css';

function MessageHistory(props:{messages:ConversationMessage[];locale:ConversationLocale;hasMore:boolean}){
  const labels=()=>conversationCopy[props.locale];
  return <><Show when={props.hasMore}><p class="knaba-owner-caption">{labels().more}</p></Show><div class="knaba-owner-history" role="log" aria-live="polite" aria-relevant="additions"><For each={props.messages}>{m=><article classList={{'knaba-owner-bubble':true,'from-owner':m.author==='owner'}}><span class="knaba-owner-speaker">{m.author==='owner'?labels().owner:labels().guest}</span><p>{m.message}</p><time datetime={m.createdAt}>{new Date(m.createdAt).toLocaleString(props.locale)}</time></article>}</For></div></>;
}

export function VisitorOwnerChat(props:{locale:Accessor<ConversationLocale>}){
  const [identity,setIdentity]=createSignal<ConversationIdentity|null>(null);
  const [messages,setMessages]=createSignal<ConversationMessage[]>([]);
  const [hasMore,setHasMore]=createSignal(false);
  const [draft,setDraft]=createSignal('');
  const [consent,setConsent]=createSignal(false);
  const [busy,setBusy]=createSignal(false);
  const [error,setError]=createSignal('');
  const [notice,setNotice]=createSignal('');
  const [recoveryCode,setRecoveryCode]=createSignal('');
  const [recoveryDraft,setRecoveryDraft]=createSignal('');
  let recoveryInput:HTMLInputElement|undefined;

  const t=createMemo(()=>conversationCopy[props.locale()]);
  let pendingStart:{capability:string;idempotencyKey:string;locale:ConversationLocale;message:string;consentAccepted:true}|null=null;
  let pendingReply:{idempotencyKey:string;message:string}|null=null;
  async function refresh(target=identity()) {
    if(!target)return;
    setBusy(true);setError('');
    try {const response=await loadVisitorThread(target.id,target.capability);setMessages(response.messages);setHasMore(response.hasMore);}
    catch(problem){setError(problem instanceof ConversationHttpError&&problem.status===404?t().unavailable:t().failure);}
    finally{setBusy(false);}
  }
  onMount(()=>{
    let stored:string|null=null;
    try{stored=sessionStorage.getItem(sessionStorageKey);}catch{/* Private session storage may be disabled. */}
    const value=restoreConversation(stored);
    if(value){setIdentity(value);void refresh(value);}
  });
  async function send(event:Event) {
    event.preventDefault();if(busy())return;
    const text=draft().trim();
    if(text.length<2||text.length>1500){setError(t().tooLong);return;}
    if(!identity()&&!consent()){setError(t().guestPrivacy);return;}
    setBusy(true);setError('');setNotice('');
    let delivered=false;
    try{
      const current=identity();
      let target:ConversationIdentity;
      if(!current){
        if(!pendingStart)pendingStart={capability:createCapability(),idempotencyKey:createRequestKey(),locale:props.locale(),message:text,consentAccepted:true};
        if(pendingStart.message!==text||pendingStart.locale!==props.locale())throw new Error('retry-with-original-message');
        const ack=await createVisitorThread(pendingStart);
        delivered=true;
        target={id:ack.id,capability:pendingStart.capability};setIdentity(target);
        try{sessionStorage.setItem(sessionStorageKey,JSON.stringify(target));}catch{/* Ephemeral access is still held in memory. */}
        pendingStart=null;
      }else{
        if(!pendingReply)pendingReply={message:text,idempotencyKey:createRequestKey()};
        if(pendingReply.message!==text)throw new Error('retry-with-original-message');
        await sendVisitorMessage(current.id,current.capability,pendingReply);
        delivered=true;pendingReply=null;target=current;
      }
      // A successful write ACK is final; failed history refresh must never send again.
      setDraft('');setNotice(t().received);
      const view=await loadVisitorThread(target.id,target.capability);
      setMessages(view.messages);setHasMore(view.hasMore);
    }catch{setError(delivered?t().refreshFailure:t().failure);}
    finally{setBusy(false);}
  }
  function forget(){
    if(!confirm(t().forgetNotice))return;
    try{sessionStorage.removeItem(sessionStorageKey);}catch{}
    setIdentity(null);setMessages([]);setHasMore(false);setDraft('');setRecoveryCode('');setRecoveryDraft('');setError('');setNotice('');pendingStart=null;pendingReply=null;setConsent(false);
  }

  function revealRecovery() {
    const current=identity();
    if(!current)return;
    try {setRecoveryCode(formatRecoveryCode(current));setError('');}
    catch {setError(t().unavailable);}
  }
  async function copyRecovery() {
    const code=recoveryCode();
    if(!code || !identity())return;
    try {
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(code);
      setNotice(t().copiedCode);setError('');
    }catch{
      setError(t().copyManual);
      recoveryInput?.focus();recoveryInput?.select();
    }
  }
  async function recover(event:Event) {
    event.preventDefault();
    if(busy()||identity())return;
    const target=parseRecoveryCode(recoveryDraft());
    if(!target){setError(t().restoreInvalid);return;}
    setBusy(true);setError('');setNotice('');
    try {
      // Verify ownership of the bearer capability against D1 *before* persisting locally.
      const view=await loadVisitorThread(target.id,target.capability);
      setIdentity(target);setMessages(view.messages);setHasMore(view.hasMore);
      setDraft('');setRecoveryDraft('');setRecoveryCode('');setConsent(false);
      pendingStart=null;pendingReply=null;
      try{sessionStorage.setItem(sessionStorageKey,JSON.stringify(target));}catch{/* User may block tab storage. */}
      setNotice(t().restoreSuccess);
    }catch {
      // Deliberately indistinguishable for unknown, expired, or incorrect credentials.
      setError(t().restoreInvalid);
    }finally{setBusy(false);}
  }
  return <section class="knaba-owner-chat" aria-label={t().title}>
    <div class="knaba-owner-intro"><h3>{t().title}</h3><p>{t().intro}</p></div>
    <Show when={identity()}>
      <MessageHistory messages={messages()} locale={props.locale()} hasMore={hasMore()}/>
      <div class="knaba-owner-actions">
        <button type="button" onClick={()=>void refresh()} disabled={busy()}>{t().refresh}</button>
        <button type="button" onClick={revealRecovery} disabled={busy()}>{t().saveCode}</button>
        <button type="button" onClick={forget} disabled={busy()}>{t().forget}</button>
      </div>
      <Show when={recoveryCode()}>
        <div class="knaba-owner-recovery-code">
          <label for="knaba-owner-recovery-code">{t().restoreInput}</label>
          <input id="knaba-owner-recovery-code" ref={recoveryInput} type="text" value={recoveryCode()} readOnly spellcheck={false} autocomplete="off" aria-describedby="knaba-owner-code-warning"/>
          <button type="button" onClick={()=>void copyRecovery()}>{t().copyCode}</button>
          <p id="knaba-owner-code-warning">{t().codeWarning}</p>
        </div>
      </Show>
    </Show>
    <Show when={!identity()}>
      <p class="knaba-owner-caption">{t().privacy}</p>
      <form class="knaba-owner-restore" onSubmit={recover}>
        <label for="knaba-restore-code">{t().restoreTitle}</label>
        <div>
          <input id="knaba-restore-code" type="password" spellcheck={false} autocomplete="off" value={recoveryDraft()} onInput={e=>{setRecoveryDraft(e.currentTarget.value);setError('');}} disabled={busy()} aria-label={t().restoreInput}/>
          <button type="submit" disabled={busy()||!recoveryDraft().trim()}>{t().restoreAction}</button>
        </div>
      </form>
    </Show>
    <form class="knaba-owner-compose" onSubmit={send}>
      <label for="owner-visitor-message">{t().placeholder}</label>
      <textarea id="owner-visitor-message" rows={3} minLength={2} maxLength={1500} required value={draft()} onInput={e=>setDraft(e.currentTarget.value)} disabled={busy()}/>
      <Show when={!identity()}><label class="knaba-owner-consent"><input type="checkbox" checked={consent()} onChange={e=>setConsent(e.currentTarget.checked)} disabled={busy()}/><span>{t().consent} <a href={props.locale()==='ru'?'/ru/datenschutz/':'/datenschutz/'}>{props.locale()==='ru'?'Политика конфиденциальности':'Datenschutz'}</a></span></label></Show>
      <button class="button button-dark" type="submit" disabled={busy()||draft().trim().length<2||(!identity()&&!consent())}>{identity()?t().send:t().begin}</button>
    </form>
    <Show when={notice()}><p role="status" class="knaba-owner-success">{notice()}</p></Show><Show when={error()}><p role="alert" class="knaba-owner-error">{error()}</p></Show>
    <p class="knaba-owner-caption">{t().privacy}</p>
  </section>;
}

export function OwnerInbox(props:{locale:Accessor<ConversationLocale>}){
  const t=createMemo(()=>conversationCopy[props.locale()]);
  const [threads,setThreads]=createSignal<ConversationThread[]>([]);
  const [selected,setSelected]=createSignal<string|null>(null);
  const [conversation,setConversation]=createSignal<ConversationDetails|null>(null);
  const [draft,setDraft]=createSignal('');
  const [busy,setBusy]=createSignal(false);
  const [error,setError]=createSignal('');
  const [notice,setNotice]=createSignal('');
  let pending:{message:string;idempotencyKey:string}|null=null;
  async function refreshList(){setBusy(true);setError('');try{const list=await listOwnerThreads();setThreads(list.threads);}catch{setError(t().failure);}finally{setBusy(false);}}
  async function selectThread(id:string){setBusy(true);setError('');setSelected(id);try{setConversation(await loadOwnerThread(id));}catch{setConversation(null);setError(t().unavailable);}finally{setBusy(false);}}
  async function refreshThread(){const id=selected();if(id)await selectThread(id);}
  onMount(()=>void refreshList());
  async function reply(event:Event){
    event.preventDefault();const id=selected(),text=draft().trim();
    if(!id||busy())return;
    if(text.length<2||text.length>1500){setError(t().tooLong);return;}
    setBusy(true);setError('');setNotice('');
    let delivered=false;
    try{
      if(!pending)pending={message:text,idempotencyKey:createRequestKey()};
      if(pending.message!==text)throw new Error('retry original');
      await sendOwnerMessage(id,pending);delivered=true;pending=null;
      setDraft('');setNotice(t().received);
      setConversation(await loadOwnerThread(id));
    }catch{setError(delivered?t().refreshFailure:t().failure);}finally{setBusy(false);}
  }
  function back(){setSelected(null);setConversation(null);setError('');setNotice('');setDraft('');pending=null;void refreshList();}
  return <section class="knaba-owner-inbox" aria-label={t().inbox}>
    <Show when={!selected()}><div class="knaba-owner-actions"><button type="button" onClick={()=>void refreshList()} disabled={busy()}>{t().refresh}</button></div><Show when={threads().length===0}><p>{t().inboxEmpty}</p></Show><div class="knaba-owner-thread-list"><For each={threads()}>{item=><button type="button" onClick={()=>void selectThread(item.id)} disabled={busy()}><strong>{t().subject} #{item.id.slice(0,8)}</strong><span>{item.locale.toUpperCase()} · {item.status}</span><time datetime={item.lastMessageAt}>{new Date(item.lastMessageAt).toLocaleString(props.locale())}</time><span>{t().open} ↗</span></button>}</For></div></Show>
    <Show when={selected()}><div class="knaba-owner-actions"><button type="button" onClick={back} disabled={busy()}>{t().back}</button><button type="button" onClick={()=>void refreshThread()} disabled={busy()}>{t().refresh}</button></div><Show when={conversation()}>{item=><><p class="knaba-owner-caption">#{item().thread.id.slice(0,8)} · {t().status}: {item().thread.status}</p><MessageHistory messages={item().messages} hasMore={item().hasMore} locale={props.locale()}/><form onSubmit={reply} class="knaba-owner-compose"><label for="knaba-owner-reply">{t().reply}</label><textarea id="knaba-owner-reply" rows={3} minLength={2} maxLength={1500} required value={draft()} onInput={e=>setDraft(e.currentTarget.value)} disabled={busy()}/><button type="submit" class="button button-dark" disabled={busy()||draft().trim().length<2}>{t().send}</button></form></>}</Show></Show>
    <Show when={notice()}><p role="status" class="knaba-owner-success">{notice()}</p></Show><Show when={error()}><p role="alert" class="knaba-owner-error">{error()}</p></Show>
  </section>;
}
