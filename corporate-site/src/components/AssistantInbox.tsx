import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { PortalSession } from '../lib/portal-contract';
import '../styles/private-workspace.css';
import {createAsyncViewScope} from '../lib/async-view-scope';
import {INBOX_LOCALES,INBOX_LOCALE_NAMES,INBOX_DATE_LOCALES,assistantInboxLocale,createInboxLocaleStore,fetchInboxLabels,type InboxLocale,type InboxLabels} from '../lib/assistant-inbox-i18n';
import {mergeAssistantRequests,type AssistantRequestSummary,type AssistantRequestPage,type AssistantRequestContext} from '../lib/assistant-request-contract';

type ThreadItem={id:string;locale:string;status:string;contactName:string;contactEmail:string;contactPhone:string;createdAt:string;updatedAt:string;preview:string|null;expiresAt:string|null;revokedAt:string|null};
type Message={id:string;sender:'assistant'|'customer'|'owner';content:string;createdAt:string;guestDisplayedAt?:string|null};
type Offer={id:string;content:string;state:string;createdAt:string;decidedAt:string|null};
type Thread={conversation:ThreadItem;messages:Message[];offers:Offer[];requests?:AssistantRequestSummary[];requestPage?:AssistantRequestPage};
type InboxPage={conversations:ThreadItem[];limited:boolean;nextCursor?:string|null};
type NotificationStatus={enabled:boolean;counts:Record<string,number>};
class InboxHttpError extends Error {
  constructor(readonly status:number){super(`HTTP ${status}`);}
}
async function call<T>(path:string,method='GET',data?:unknown):Promise<T>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-KnaBa-Request':'portal-v1'},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
    if(!r.ok)throw new InboxHttpError(r.status);
    return await r.json() as T;
  }finally{clearTimeout(timer);}
}
export default function AssistantInbox(props:{locale?:InboxLocale;initialLocale?:InboxLocale;initialLabels:InboxLabels}){
  const initialLocale=assistantInboxLocale(props.initialLocale??props.locale);
  const languages=createInboxLocaleStore(initialLocale,props.initialLabels,fetchInboxLabels);
  const [locale,setLocale]=createSignal(initialLocale),[labels,setLabels]=createSignal(languages.initial);
  const [requestedLocale,setRequestedLocale]=createSignal(initialLocale),[languageBusy,setLanguageBusy]=createSignal(false),[languageFault,setLanguageFault]=createSignal(false);
  const [role,setRole]=createSignal('loading'),[list,setList]=createSignal<ThreadItem[]>([]),[active,setActive]=createSignal(''),[thread,setThread]=createSignal<Thread|null>(null);
  const [answer,setAnswer]=createSignal(''),[proposal,setProposal]=createSignal(''),[answerKey,setAnswerKey]=createSignal(''),[offerKey,setOfferKey]=createSignal('');
  const [busy,setBusy]=createSignal(false),[fault,setFault]=createSignal(''),[updated,setUpdated]=createSignal(false);
  const [notifications,setNotifications]=createSignal<NotificationStatus|null>(null);
  const [nextCursor,setNextCursor]=createSignal<string|null>(null),[loadingMore,setLoadingMore]=createSignal(false),[refreshing,setRefreshing]=createSignal(false);
  const [requestLoading,setRequestLoading]=createSignal(false);
  const reads=createAsyncViewScope(),threads=createAsyncViewScope();
  const drafts=new Map<string,{answer:string;proposal:string;answerKey:string;offerKey:string}>();
  let disposed=false,loadedPages=1,languageAttempt=0,requestPages=1;
  onCleanup(()=>{disposed=true;languageAttempt++;reads.dispose();threads.dispose();});
  const label=labels;
  async function changeLocale(value:string,persist=true){
    if(disposed)return;
    const selected=assistantInboxLocale(value),attempt=++languageAttempt;
    setRequestedLocale(selected);setLanguageBusy(true);setLanguageFault(false);
    try{
      const pack=await languages.ensure(selected);
      if(disposed||attempt!==languageAttempt)return;
      setLabels(pack);setLocale(selected);
      if(persist)try{sessionStorage.setItem('knaba-inbox-locale-v1',selected);}catch{}
    }catch{
      if(!disposed&&attempt===languageAttempt){setRequestedLocale(locale());setLanguageFault(true);}
    }finally{if(!disposed&&attempt===languageAttempt)setLanguageBusy(false);}
  }
  const loginPath=()=>'/login/?lang='+locale()+'&return_to='+encodeURIComponent(locale()==='ru'?'/ru/postfach/':'/postfach/');
  onMount(()=>{
    let preferred=assistantInboxLocale(props.locale??initialLocale);
    try{const saved=sessionStorage.getItem('knaba-inbox-locale-v1');if(saved&&INBOX_LOCALES.includes(saved as InboxLocale))preferred=assistantInboxLocale(saved);}catch{}
    if(preferred!==locale())void changeLocale(preferred,false);
    void (async()=>{
      try{
        const session=await call<PortalSession>('/api/portal/session');
        if(disposed)return;
        setRole(session.role);
        if(session.role==='owner'){
          await refresh();
          const deepLink=new URLSearchParams(window.location.search).get('conversation');
          if(!disposed&&deepLink && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(deepLink))await openConversation(deepLink);
        }
      }catch{if(!disposed){setFault(label().loadError);setRole('error');}}
    })();
    const timer=setInterval(()=>{if(role()==='owner'&&!document.hidden)void refresh(true);},10000);
    onCleanup(()=>clearInterval(timer));
  });
  function expireAccess(problem:unknown){
    if(!(problem instanceof InboxHttpError)||![401,403].includes(problem.status))return false;
    reads.invalidate();threads.invalidate();drafts.clear();
    languageAttempt++;setLanguageBusy(false);setLanguageFault(false);setRequestedLocale(locale());
    setRole('guest');setList([]);setActive('');setThread(null);setNotifications(null);
    setNextCursor(null);setLoadingMore(false);loadedPages=1;
    requestPages=1;setRequestLoading(false);
    setAnswer('');setProposal('');setAnswerKey('');setOfferKey('');setUpdated(false);setBusy(false);setFault('');
    return true;
  }
  async function refresh(silent=false){
    if(busy()||disposed||refreshing()||loadingMore()||requestLoading()||role()!=='owner')return;
    setRefreshing(true);
    const latest=reads.begin();
    try{
      const staged:ThreadItem[]=[];
      let cursor:string|null=null,result:InboxPage|undefined,pages=0;
      // Refresh the loaded window, not the entire inbox. Publish it as one view.
      for(let index=0;index<loadedPages;index++){
        result=await call<InboxPage>('/api/assistant/owner/conversations'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
        if(!latest())return;
        staged.push(...result.conversations);pages++;
        cursor=result.nextCursor??null;
        if(!cursor)break;
      }
      if(!result||!latest())return;
      setList(uniqueRows(staged));setUpdated(result.limited);setNextCursor(cursor);loadedPages=pages;
      try{
        const status=await call<NotificationStatus>('/api/assistant/owner/notifications');
        if(!latest())return;
        setNotifications(status);
      }catch(problem){if(!latest()||expireAccess(problem))return;setNotifications(null);}
      if(active())await openConversation(active(),true);
      if(latest()&&!silent)setFault('');
    }catch(problem){if(latest()&&!expireAccess(problem)&&!silent)setFault(label().loadError);}finally{setRefreshing(false);}
  }
  function uniqueRows(rows:ThreadItem[]):ThreadItem[]{
    const unique=new Map<string,ThreadItem>();
    for(const row of rows)if(!unique.has(row.id))unique.set(row.id,row);
    return [...unique.values()];
  }
  async function loadMore(){
    const cursor=nextCursor();
    if(!cursor||busy()||disposed||loadingMore()||refreshing()||requestLoading()||role()!=='owner')return;
    const latest=reads.begin();setLoadingMore(true);setFault('');
    try{
      const result=await call<InboxPage>('/api/assistant/owner/conversations?cursor='+encodeURIComponent(cursor));
      if(!latest())return;
      setList(uniqueRows([...list(),...result.conversations]));setNextCursor(result.nextCursor??null);setUpdated(result.limited);loadedPages++;
    }catch(problem){if(latest()&&!expireAccess(problem))setFault(label().loadError);}
    finally{setLoadingMore(false);}
  }
  async function retryNotifications(){
    if(busy()||requestLoading()||disposed||!notifications()?.enabled)return;
    reads.invalidate();threads.invalidate();
    setBusy(true);setFault('');
    try {
      await call('/api/assistant/owner/notifications/dispatch','POST',{});
    }catch(problem){if(!disposed&&!expireAccess(problem))setFault(label().loadError);}finally{if(!disposed)setBusy(false);}
    if(!disposed)await refresh(true);
  }
  async function openConversation(id:string,silent=false){
    if(busy()||disposed)return;
    const latest=threads.begin();
    if(!silent){
      requestPages=1;setRequestLoading(false);
      if(id!==active()){
        if(active())drafts.set(active(),{answer:answer(),proposal:proposal(),answerKey:answerKey(),offerKey:offerKey()});
        const saved=drafts.get(id);
        setAnswer(saved?.answer??'');setProposal(saved?.proposal??'');setAnswerKey(saved?.answerKey??'');setOfferKey(saved?.offerKey??'');
      }
      setActive(id);setThread(null);setFault('');
    }
    try{
      let data=await call<Thread>(`/api/assistant/owner/conversations/${id}`),pages=1;
      if(!latest()||active()!==id)return;
      while(pages<requestPages&&data.requestPage?.nextCursor){
        const next=await call<AssistantRequestContext>(`/api/assistant/owner/conversations/${id}/request-context?requestCursor=`+encodeURIComponent(data.requestPage.nextCursor));
        if(!latest()||active()!==id)return;
        if(next.conversation.id!==id)throw Error('Unexpected request conversation');
        data={...data,requests:mergeAssistantRequests([...(data.requests??[]),...next.requests]),requestPage:next.requestPage};pages++;
      }
      if(latest()&&active()===id){requestPages=pages;setThread(data);}
    }
    catch(problem){if(latest()&&active()===id&&!expireAccess(problem)&&!silent)setFault(label().loadError);}
  }
  async function loadMoreRequests(){
    const id=active(),cursor=thread()?.requestPage?.nextCursor;
    if(!id||!cursor||busy()||requestLoading()||refreshing()||loadingMore()||disposed||role()!=='owner')return;
    const latest=threads.begin();reads.invalidate();setRequestLoading(true);setFault('');
    try{
      const page=await call<AssistantRequestContext>(`/api/assistant/owner/conversations/${id}/request-context?requestCursor=`+encodeURIComponent(cursor));
      if(!latest()||active()!==id||thread()?.conversation.id!==id)return;
      if(page.conversation.id!==id)throw Error('Unexpected request conversation');
      setThread(value=>value?{...value,requests:mergeAssistantRequests([...(value.requests??[]),...page.requests]),requestPage:page.requestPage}:value);requestPages++;
    }catch(problem){if(latest()&&active()===id&&!expireAccess(problem))setFault(label().loadError);}
    finally{if(latest())setRequestLoading(false);}
  }
  async function send(kind:'messages'|'offers',text:string){
    const id=active();if(!id||busy()||requestLoading()||disposed||!text.trim())return;
    const latest=threads.begin();reads.invalidate();
    setBusy(true);setFault('');
    const selectedKey=kind==='messages'?answerKey():offerKey(),key=selectedKey||crypto.randomUUID();
    if(kind==='messages')setAnswerKey(key);else setOfferKey(key);
    try{
      const result=await call<Thread>(`/api/assistant/owner/conversations/${id}/${kind}`,'POST',{content:text.trim(),idempotencyKey:key});
      if(!latest()||active()!==id)return;
      setThread(result);
      if(kind==='messages'){
        if(answerKey()===key){if(answer()===text)setAnswer('');setAnswerKey('');}
      }else{
        if(offerKey()===key){if(proposal()===text)setProposal('');setOfferKey('');}
      }
    }catch(problem){if(latest()&&active()===id&&!expireAccess(problem))setFault(label().loadError);}
    finally{if(latest())setBusy(false);}
    if(latest())await refresh(true);
  }
  async function setStatus(status:'human'|'closed'){
    const id=active();if(!id||busy()||requestLoading()||disposed)return;
    const latest=threads.begin();reads.invalidate();setBusy(true);setFault('');
    try{const result=await call<Thread>(`/api/assistant/owner/conversations/${id}/status`,'POST',{status});if(latest()&&active()===id)setThread(result);}
    catch(problem){if(latest()&&active()===id&&!expireAccess(problem))setFault(label().loadError);}finally{if(latest())setBusy(false);}
    if(latest())await refresh(true);
  }
  async function revokeAccess(){
    const id=active();
    if(!id||busy()||requestLoading()||disposed||thread()?.conversation.revokedAt||!window.confirm(label().confirmRevoke))return;
    const latest=threads.begin();reads.invalidate();setBusy(true);setFault('');
    try{
      const result=await call<Thread>(`/api/assistant/owner/conversations/${id}/access/revoke`,'POST',{});
      if(latest()&&active()===id)setThread(result);
    }catch(problem){if(latest()&&active()===id&&!expireAccess(problem))setFault(label().loadError);}
    finally{if(latest())setBusy(false);}
    if(latest())await refresh(true);
  }
  const statusLabel=(status:string)=>status==='human'?label().statusHuman:status==='closed'?label().statusClosed:status==='assistant'?label().statusAssistant:label().unknownStatus;
  const date=(value:string)=>{const d=new Date(value);return Number.isNaN(d.valueOf())?label().unknownDate:d.toLocaleString(INBOX_DATE_LOCALES[locale()]);};
  return <section class="ki-shell" lang={locale()}>
    <h2>{label().title}</h2>
    <label class="ki-language">{label().language} <select value={requestedLocale()} aria-busy={languageBusy()} onChange={event=>void changeLocale(event.currentTarget.value)}><For each={INBOX_LOCALES}>{value=><option value={value}>{INBOX_LOCALE_NAMES[value]}</option>}</For></select></label>
    <Show when={languageFault()}><p role="alert" class="ki-error">{label().loadError}</p></Show>
    <Show when={role()==='owner'} fallback={<div class="ki-empty">{label().need} <a href={loginPath()}>{label().login} ↗</a></div>}>
      <div class="ki-toolbar"><button type="button" disabled={busy()||refreshing()||loadingMore()||requestLoading()} onClick={()=>void refresh()}>{label().update} ↻</button><Show when={notifications()}>{status=><div class="ki-notification-status" aria-live="polite"><span>{status().enabled?label().notificationOn:label().notificationOff} · {label().pendingNotice}: {status().counts.pending??0}</span><Show when={status().enabled && (status().counts.pending??0)>0}><button type="button" disabled={busy()||requestLoading()} onClick={()=>void retryNotifications()}>{label().retry}</button></Show></div>}</Show><Show when={updated()}><span>{label().limit}</span></Show></div>
      <div class="ki-grid">
        <aside class="ki-list"><Show when={list().length} fallback={<p>{label().none}</p>}><For each={list()}>{item=><button type="button" classList={{'ki-list-entry':true,'is-selected':active()===item.id}} disabled={busy()} onClick={()=>void openConversation(item.id)}><strong>{item.contactName||item.contactEmail||label().visitor}</strong><span>{item.preview||statusLabel(item.status)}</span><small>{date(item.updatedAt)}</small><em>{item.status==='human'?'●':item.status==='closed'?'○':'✳'}</em></button>}</For></Show><Show when={nextCursor()}><button type="button" class="ki-load-more" disabled={busy()||loadingMore()||refreshing()||requestLoading()} aria-busy={loadingMore()} onClick={()=>void loadMore()}>{loadingMore()?label().loadingMore:label().loadMore}</button></Show></aside>
        <div class="ki-body">
          <Show when={thread()} fallback={<p class="ki-empty">{label().selectConversation}</p>}>
            <header class="ki-thread-head"><div><strong>{thread()!.conversation.contactName||label().visitor}</strong><small>{thread()!.conversation.contactEmail} {thread()!.conversation.contactPhone}</small></div><button type="button" disabled={busy()||requestLoading()} onClick={()=>void setStatus(thread()!.conversation.status==='closed'?'human':'closed')}>{thread()!.conversation.status==='closed'?label().reopen:label().closed}</button></header>
            <div class="ki-toolbar">
              <p role="status">{thread()!.conversation.revokedAt?label().accessRevoked:!thread()!.conversation.expiresAt||Date.parse(thread()!.conversation.expiresAt!)<=Date.now()?label().accessExpired:`${label().accessExpires}: ${date(thread()!.conversation.expiresAt!)}`}</p>
              <button type="button" disabled={busy()||requestLoading()||Boolean(thread()!.conversation.revokedAt)} onClick={()=>void revokeAccess()}>{label().revoke}</button>
            </div>
            <Show when={thread()!.requestPage}><section aria-label={label().requestHeading} aria-busy={requestLoading()}>
              <h3>{label().requestHeading}</h3><p class="ki-info">{label().requestSource}</p>
              <For each={thread()!.requests??[]}>{request=><article class="ki-offer" data-assistant-request={request.id}>
                <strong><code>{request.id}</code></strong><small>{date(request.createdAt)}</small>
                <p>{label().requestSiteStatus}: {label()[`request_${request.status}`]}</p>
                <p>{label().requestERPStatus}: {label()[`transfer_${request.erpTransfer.status}`]}</p>
              </article>}</For>
              <p class="ki-info">{label().requestCount.replace('{loaded}',String(thread()!.requests?.length??0)).replace('{total}',String(thread()!.requestPage!.total))}</p>
              <Show when={thread()!.requestPage?.nextCursor}><button type="button" class="ki-load-more" disabled={busy()||requestLoading()||refreshing()||loadingMore()} onClick={()=>void loadMoreRequests()}>{label().requestMore}</button></Show>
            </section></Show>
            <div class="ki-messages"><For each={thread()!.messages}>{m=><article class={`ki-message ki-from-${m.sender}`}><small>{m.sender==='owner'?'KnaBa':m.sender==='assistant'?'KNABA Assistant':label().customer} · {date(m.createdAt)}</small><p>{m.content}</p><Show when={m.sender==='owner'}><small>{m.guestDisplayedAt?`${label().displayed} · ${date(m.guestDisplayedAt)}`:label().displayUnconfirmed}</small></Show></article>}</For></div>
            <Show when={thread()!.offers?.length}><h3>{label().offer}</h3><For each={thread()!.offers}>{o=><div class="ki-offer"><p>{o.content}</p><small>{o.state==='accepted'?label().accepted:o.state==='declined'?label().declined:label().pending}</small></div>}</For></Show>
            <Show when={thread()!.conversation.status!=='closed'}>
              <form class="ki-form" onSubmit={e=>{e.preventDefault();void send('messages',answer());}}><label>{label().reply}<textarea value={answer()} onInput={e=>{setAnswer(e.currentTarget.value);setAnswerKey('');}} rows={3} maxLength={1200}/></label><button disabled={busy()||requestLoading()||!answer().trim()}>{label().submit}</button></form>
              <Show when={!thread()!.offers.some(o=>o.state==='pending')}><form class="ki-form" onSubmit={e=>{e.preventDefault();void send('offers',proposal());}}><label>{label().offer}<textarea value={proposal()} onInput={e=>{setProposal(e.currentTarget.value);setOfferKey('');}} rows={4} maxLength={1400}/></label><button disabled={busy()||requestLoading()||!proposal().trim()}>{label().propose}</button></form></Show>
            </Show>
            <p class="ki-info">{label().info}</p>
          </Show>
        </div>
      </div>
    </Show>
    <Show when={fault()}><p role="alert" class="ki-error">{fault()}</p></Show>
  </section>;
}
