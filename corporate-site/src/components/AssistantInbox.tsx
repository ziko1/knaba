import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { PortalSession } from '../lib/portal-contract';
import '../styles/assistant-inbox.css';

type ThreadItem={id:string;locale:string;status:string;contactName:string;contactEmail:string;contactPhone:string;createdAt:string;updatedAt:string;preview:string|null};
type Message={id:string;sender:'assistant'|'customer'|'owner';content:string;createdAt:string};
type Offer={id:string;content:string;state:string;createdAt:string;decidedAt:string|null};
type Thread={conversation:ThreadItem;messages:Message[];offers:Offer[]};
type NotificationStatus={enabled:boolean;counts:Record<string,number>};
async function call<T>(path:string,method='GET',data?:unknown):Promise<T>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-KnaBa-Request':'portal-v1'},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  }finally{clearTimeout(timer);}
}
export default function AssistantInbox(props:{locale?:'de'|'ru'}){
  const ru=props.locale==='ru';
  const [role,setRole]=createSignal('loading'),[list,setList]=createSignal<ThreadItem[]>([]),[active,setActive]=createSignal(''),[thread,setThread]=createSignal<Thread|null>(null);
  const [answer,setAnswer]=createSignal(''),[proposal,setProposal]=createSignal(''),[answerKey,setAnswerKey]=createSignal(''),[offerKey,setOfferKey]=createSignal('');
  const [busy,setBusy]=createSignal(false),[fault,setFault]=createSignal(''),[updated,setUpdated]=createSignal(false);
  const [notifications,setNotifications]=createSignal<NotificationStatus|null>(null);
  const label={
    title:ru?'Сообщения клиентов':'Kundenanfragen',
    update:ru?'Обновить':'Aktualisieren',need:ru?'Войдите как владелец KnaBa, чтобы видеть сообщения.':'Melden Sie sich als KnaBa-Inhaber an, um die Nachrichten zu sehen.',
    login:ru?'Перейти к входу':'Zur Anmeldung',none:ru?'Обращений пока нет':'Noch keine Gespräche',
    reply:ru?'Ваш ответ':'Ihre Antwort',submit:ru?'Отправить владельцем':'Als Inhaber antworten',
    offer:ru?'Текст условий для согласования':'Inhalt des Vorschlags für die Abstimmung',
    propose:ru?'Передать клиенту для подтверждения':'Dem Kunden zur Bestätigung senden',
    pending:ru?'Ожидает решения клиента':'Wartet auf Kundenentscheidung',
    accepted:ru?'Клиент подтвердил содержание':'Kunde hat den Inhalt bestätigt',
    declined:ru?'Клиент отклонил':'Kunde hat abgelehnt',
    closed:ru?'Закрыть диалог':'Gespräch schließen',reopen:ru?'Открыть снова':'Gespräch wieder öffnen',
    info:ru?'Подтверждение текста не создаёт автоматически договор, заказ или счёт.':'Eine Inhaltsbestätigung erzeugt nicht automatisch Vertrag, Auftrag oder Rechnung.',
    loadError:ru?'Не удалось загрузить данные. Проверьте соединение.':'Laden fehlgeschlagen. Bitte Verbindung prüfen.',
    limit:ru?'Показаны последние 100 диалогов.':'Die neuesten 100 Gespräche werden angezeigt.',
    notificationOn:ru?'Email-уведомления подключены':'E-Mail-Mitteilungen aktiviert',
    notificationOff:ru?'Email-уведомления ещё не подключены':'E-Mail-Mitteilungen noch nicht aktiviert',
    pendingNotice:ru?'В очереди':'In Warteschlange',
    retry:ru?'Повторить отправку':'Versand erneut versuchen',
  };
  onMount(()=>{
    void (async()=>{
      try{
        const session=await call<PortalSession>('/api/portal/session');
        setRole(session.role);
        if(session.role==='owner'){
          await refresh();
          const deepLink=new URLSearchParams(window.location.search).get('conversation');
          if(deepLink && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(deepLink))await openConversation(deepLink);
        }
      }catch{setFault(label.loadError);setRole('error');}
    })();
    const timer=setInterval(()=>{if(role()==='owner'&&!document.hidden)void refresh(true);},10000);
    onCleanup(()=>clearInterval(timer));
  });
  async function refresh(silent=false){
    try{
      const result=await call<{conversations:ThreadItem[];limited:boolean}>('/api/assistant/owner/conversations');
      setList(result.conversations);if(!silent)setUpdated(result.limited);
      try{setNotifications(await call<NotificationStatus>('/api/assistant/owner/notifications'));}catch{setNotifications(null);}
      if(active())await openConversation(active(),true);
      if(!silent)setFault('');
    }catch{if(!silent)setFault(label.loadError);}
  }
  async function retryNotifications(){
    if(busy()||!notifications()?.enabled)return;
    setBusy(true);setFault('');
    try {
      await call('/api/assistant/owner/notifications/dispatch','POST',{});
      await refresh(true);
    }catch{setFault(label.loadError);}finally{setBusy(false);}
  }
  async function openConversation(id:string,silent=false){
    if(!silent){setActive(id);setThread(null);setFault('');setAnswerKey('');setOfferKey('');}
    try{const data=await call<Thread>(`/api/assistant/owner/conversations/${id}`);if(active()===id)setThread(data);}
    catch{if(!silent)setFault(label.loadError);}
  }
  async function send(kind:'messages'|'offers',text:string){
    const id=active();if(!id||busy()||!text.trim())return;
    setBusy(true);setFault('');
    const selectedKey=kind==='messages'?answerKey():offerKey(),key=selectedKey||crypto.randomUUID();
    if(kind==='messages')setAnswerKey(key);else setOfferKey(key);
    try{
      const result=await call<Thread>(`/api/assistant/owner/conversations/${id}/${kind}`,'POST',{content:text.trim(),idempotencyKey:key});
      setThread(result);if(kind==='messages'){setAnswer('');setAnswerKey('');}else{setProposal('');setOfferKey('');}
      await refresh(true);
    }catch{setFault(label.loadError);}
    finally{setBusy(false);}
  }
  async function setStatus(status:'human'|'closed'){
    const id=active();if(!id||busy())return;setBusy(true);setFault('');
    try{setThread(await call<Thread>(`/api/assistant/owner/conversations/${id}/status`,'POST',{status}));await refresh(true);}
    catch{setFault(label.loadError);}finally{setBusy(false);}
  }
  const date=(value:string)=>{const d=new Date(value);return Number.isNaN(d.valueOf())?value:d.toLocaleString(ru?'ru-RU':'de-DE');};
  return <section class="ki-shell">
    <h2>{label.title}</h2>
    <Show when={role()==='owner'} fallback={<div class="ki-empty">{label.need} <a href={ru?'/ru/konto/':'/konto/'}>{label.login} ↗</a></div>}>
      <div class="ki-toolbar"><button type="button" onClick={()=>void refresh()}>{label.update} ↻</button><Show when={notifications()}>{status=><div class="ki-notification-status" aria-live="polite"><span>{status().enabled?label.notificationOn:label.notificationOff} · {label.pendingNotice}: {status().counts.pending??0}</span><Show when={status().enabled && (status().counts.pending??0)>0}><button type="button" disabled={busy()} onClick={()=>void retryNotifications()}>{label.retry}</button></Show></div>}</Show><Show when={updated()}><span>{label.limit}</span></Show></div>
      <div class="ki-grid">
        <aside class="ki-list"><Show when={list().length} fallback={<p>{label.none}</p>}><For each={list()}>{item=><button type="button" classList={{'ki-list-entry':true,'is-selected':active()===item.id}} onClick={()=>void openConversation(item.id)}><strong>{item.contactName||item.contactEmail||'KnaBa Besucher'}</strong><span>{item.preview||item.status}</span><small>{date(item.updatedAt)}</small><em>{item.status==='human'?'●':item.status==='closed'?'○':'✳'}</em></button>}</For></Show></aside>
        <div class="ki-body">
          <Show when={thread()} fallback={<p class="ki-empty">{ru?'Выберите диалог слева.':'Bitte ein Gespräch auswählen.'}</p>}>
            <header class="ki-thread-head"><div><strong>{thread()!.conversation.contactName||'KnaBa Besucher'}</strong><small>{thread()!.conversation.contactEmail} {thread()!.conversation.contactPhone}</small></div><button type="button" disabled={busy()} onClick={()=>void setStatus(thread()!.conversation.status==='closed'?'human':'closed')}>{thread()!.conversation.status==='closed'?label.reopen:label.closed}</button></header>
            <div class="ki-messages"><For each={thread()!.messages}>{m=><article class={`ki-message ki-from-${m.sender}`}><small>{m.sender==='owner'?'KnaBa':m.sender==='assistant'?'KNABA Assistant':ru?'Клиент':'Kunde'} · {date(m.createdAt)}</small><p>{m.content}</p></article>}</For></div>
            <Show when={thread()!.offers?.length}><h3>{label.offer}</h3><For each={thread()!.offers}>{o=><div class="ki-offer"><p>{o.content}</p><small>{o.state==='accepted'?label.accepted:o.state==='declined'?label.declined:label.pending}</small></div>}</For></Show>
            <Show when={thread()!.conversation.status!=='closed'}>
              <form class="ki-form" onSubmit={e=>{e.preventDefault();void send('messages',answer());}}><label>{label.reply}<textarea value={answer()} onInput={e=>{setAnswer(e.currentTarget.value);setAnswerKey('');}} rows={3} maxLength={1200}/></label><button disabled={busy()||!answer().trim()}>{label.submit}</button></form>
              <Show when={!thread()!.offers.some(o=>o.state==='pending')}><form class="ki-form" onSubmit={e=>{e.preventDefault();void send('offers',proposal());}}><label>{label.offer}<textarea value={proposal()} onInput={e=>{setProposal(e.currentTarget.value);setOfferKey('');}} rows={4} maxLength={1400}/></label><button disabled={busy()||!proposal().trim()}>{label.propose}</button></form></Show>
            </Show>
            <p class="ki-info">{label.info}</p>
          </Show>
        </div>
      </div>
    </Show>
    <Show when={fault()}><p role="alert" class="ki-error">{fault()}</p></Show>
  </section>;
}
