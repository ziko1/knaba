import {useCallback,useEffect,useRef,useState} from 'react';
import {Badge,Button,Empty} from '../../../packages/ui/index';
import {languages,type Language} from '../../../packages/i18n/index';
import {api,ApiError,entities,type Entity,type Session} from './api';
import {errorText,type Translate} from './CommandForm';
import {Bell,Check,MessageSquare,RefreshCw} from './icons';

const copy:Record<string,string[]>={
 title:['Aktivität','Активність','Активность','Aktywność','Veikla','Activity'],
 description:['Ihre Benachrichtigungen und ungelesenen Nachrichten. Der Entscheidungsbereich bleibt separat.','Ваші сповіщення та непрочитані повідомлення. Центр рішень залишається окремим.','Ваши уведомления и непрочитанные сообщения. Центр решений остаётся отдельным.','Twoje powiadomienia i nieprzeczytane wiadomości. Centrum decyzji pozostaje osobne.','Jūsų pranešimai ir neskaitytos žinutės. Sprendimų centras lieka atskiras.','Your notifications and unread messages. The decision centre remains separate.'],
 notifications:['Benachrichtigungen','Сповіщення','Уведомления','Powiadomienia','Pranešimai','Notifications'],
 chats:['Ungelesene Chats','Непрочитані чати','Непрочитанные чаты','Nieprzeczytane czaty','Neskaityti pokalbiai','Unread chats'],
 unread:['Ungelesen','Непрочитане','Непрочитанное','Nieprzeczytane','Neskaityta','Unread'],
 read:['Gelesen','Прочитано','Прочитано','Przeczytane','Perskaityta','Read'],
 mark:['Als gelesen markieren','Позначити прочитаним','Отметить прочитанным','Oznacz jako przeczytane','Pažymėti perskaitytu','Mark as read'],
 open:['Zugehörigen Eintrag öffnen','Відкрити пов’язаний запис','Открыть связанный документ','Otwórz powiązany wpis','Atverti susijusį įrašą','Open related record'],
 openChat:['Chat öffnen','Відкрити чат','Открыть чат','Otwórz czat','Atverti pokalbį','Open chat'],
 empty:['Keine Benachrichtigungen','Немає сповіщень','Нет уведомлений','Brak powiadomień','Pranešimų nėra','No notifications'],
 noUnread:['Keine ungelesenen Chats','Немає непрочитаних чатів','Нет непрочитанных чатов','Brak nieprzeczytanych czatów','Neskaitytų pokalbių nėra','No unread chats'],
 delivery:['Zustellstatus','Стан доставки','Статус доставки','Stan dostarczenia','Pristatymo būsena','Delivery status'],
 PENDING:['Geplant / ausstehend','Заплановано / очікується','Запланировано / ожидается','Zaplanowane / oczekujące','Suplanuota / laukiama','Scheduled / pending'],
 RUNNING:['Verarbeitung','Обробляється','Обрабатывается','Przetwarzanie','Apdorojama','Processing'],
 FAILED:['Fehlgeschlagen','Помилка доставки','Ошибка доставки','Niepowodzenie','Nepavyko','Failed'],
 SUCCEEDED:['Zugestellt','Доставлено','Доставлено','Dostarczone','Pristatyta','Delivered'],
 CANCELLED:['Abgebrochen','Скасовано','Отменено','Anulowane','Atšaukta','Cancelled'],
 unknown:['Nicht bestätigt','Не підтверджено','Не подтверждено','Niepotwierdzone','Nepatvirtinta','Unconfirmed'],
 notice:['Gelesen bestätigt Ihre Kenntnisnahme, nicht die Zustellung oder Erledigung einer Aufgabe.','Позначка «прочитано» підтверджує ознайомлення, а не доставку чи виконання завдання.','Отметка «прочитано» подтверждает ознакомление, а не доставку или выполнение задачи.','Oznaczenie przeczytania potwierdza zapoznanie się, nie dostarczenie ani wykonanie zadania.','Perskaitymo žyma patvirtina susipažinimą, o ne pristatymą ar užduoties atlikimą.','Marking as read acknowledges this notice; it does not confirm delivery or task completion.'],
 asOf:['Stand','Оновлено','Обновлено','Stan na','Atnaujinta','As of']
};
export const activityLabel=(language:Language,key='title')=>copy[key]?.[languages.indexOf(language)]||key;
type Unread={channel_id:string;unread:number};
type Props={session:Session;language:Language;t:Translate;records:Record<string,Entity[]>;canRead:boolean;canChat:boolean;onOpenChat:(id:string)=>void;onOpenEntity:(entity:Entity)=>void;onSaved:()=>void};

export default function ActivityCenter({session,language,t,records,canRead,canChat,onOpenChat,onOpenEntity,onSaved}:Props){
 const c=(key:string)=>activityLabel(language,key);
 const [notifications,setNotifications]=useState<Entity[]>([]),[unread,setUnread]=useState<Unread[]>([]),[loading,setLoading]=useState(false),[reading,setReading]=useState(''),[error,setError]=useState<unknown>(),[asOf,setAsOf]=useState('');
 const sequence=useRef(0),abort=useRef<AbortController|undefined>(undefined),keys=useRef(new Map<string,string>()),readBusy=useRef(false);
 const load=useCallback(async()=>{
  if(!navigator.onLine||readBusy.current)return;const own=++sequence.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;const timeout=setTimeout(()=>controller.abort(),15_000);setLoading(true);setError(undefined);
  try{const results=await Promise.allSettled([entities('notification',{signal:controller.signal}),canChat?api<Unread[]>('/api/v1/commands/channel.unread',{method:'POST',signal:controller.signal,body:JSON.stringify({input:{},idempotency_key:crypto.randomUUID()})}):Promise.resolve([])]);if(own!==sequence.current)return;
   if(results[0].status==='fulfilled')setNotifications(results[0].value);else{setNotifications([]);throw results[0].reason;}
   if(results[1].status==='fulfilled'){const rows=results[1].value;setUnread(Array.isArray(rows)?rows.filter(row=>typeof row.channel_id==='string'&&Number.isSafeInteger(row.unread)&&row.unread>=0):[]);}else{setUnread([]);throw results[1].reason;}
   setAsOf(new Date().toISOString());
  }catch(e){if(own===sequence.current){if(e instanceof ApiError&&[401,403].includes(e.status)){setNotifications([]);setUnread([]);setAsOf('');keys.current.clear();}setError(e);}}finally{clearTimeout(timeout);if(own===sequence.current)setLoading(false);}
 },[canChat,session.actor.userId]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},30_000);return()=>{sequence.current++;abort.current?.abort();clearInterval(timer);keys.current.clear();}},[load]);
 async function mark(item:Entity){
  if(readBusy.current||!navigator.onLine)return;readBusy.current=true;const own=++sequence.current;setLoading(false);setReading(item.id);setError(undefined);const ref=`${item.id}:${item.version}`;let key=keys.current.get(ref);if(!key){key=crypto.randomUUID();keys.current.set(ref,key);}const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15_000);abort.current?.abort();abort.current=controller;
  try{const result=await api<{notification_id:string;read_at:string;version:number}>('/api/v1/commands/notification.read',{method:'POST',signal:controller.signal,body:JSON.stringify({input:{notification_id:item.id},expected_version:item.version,idempotency_key:key})});if(own!==sequence.current)return;if(result.notification_id!==item.id||!Number.isFinite(Date.parse(result.read_at))||!Number.isSafeInteger(result.version))throw new ApiError('INVALID_RESPONSE',502);setNotifications(rows=>rows.map(row=>row.id===item.id?{...row,version:result.version,data:{...row.data,read_at:result.read_at}}:row));onSaved();}
  catch(e){if(own===sequence.current){if(e instanceof ApiError&&[401,403].includes(e.status)){setNotifications([]);setUnread([]);setAsOf('');keys.current.clear();}setError(e);}}finally{clearTimeout(timeout);readBusy.current=false;if(own===sequence.current)setReading('');}
 }
 const channelRows=unread.filter(row=>row.unread>0).flatMap(row=>{const channel=records.channel?.find(item=>item.id===row.channel_id);return channel?[{...row,channel}]:[]});
 return <section className="content-panel activity-center" data-testid="activity-center" style={{minWidth:0,overflowWrap:'anywhere',padding:'clamp(16px,3vw,24px)'}}>
  <div className="panel-heading"><div><h2><Bell size={19}/> {c('title')}</h2><p>{c('description')}</p></div><Button variant="secondary" disabled={loading||!navigator.onLine} onClick={()=>void load()}><RefreshCw size={16}/>{t('refresh')}</Button></div>
  {Boolean(error)&&<div role="alert" className="notice danger">{errorText(error,t)}{error instanceof ApiError&&<small>{error.code}</small>}</div>}
  <p className="muted">{c('notice')}</p>{asOf&&<p className="muted">{c('asOf')}: {new Date(asOf).toLocaleString(language==='UK'?'uk-UA':language.toLowerCase(),{timeZone:'Europe/Berlin'})}</p>}
  <h3>{c('notifications')}</h3>{loading&&!asOf?<p role="status">{t('loading')}</p>:!notifications.length?<Empty title={c('empty')}/>:<div className="decision-grid">{[...notifications].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(item=>{const related=item.data.related_kind&&item.data.related_id?records[item.data.related_kind]?.find(entity=>entity.id===item.data.related_id):undefined;return <article className="decision-card" key={item.id} data-notification-id={item.id}>
   <div className="decision-top"><Badge tone={item.data.read_at?'neutral':'amber'}>{c(item.data.read_at?'read':'unread')}</Badge><small>{item.data.category||item.data.channel}</small></div><h3>{item.data.title||item.data.event||item.id}</h3>{item.data.text&&<p>{item.data.text}</p>}<p>{c('delivery')}: <span data-testid="notification-delivery">{c(item.data.status||'unknown')}</span></p><time>{new Date(item.createdAt).toLocaleString(language==='UK'?'uk-UA':language.toLowerCase(),{timeZone:'Europe/Berlin'})}</time><footer>{related&&<Button variant="secondary" onClick={()=>onOpenEntity(related)}>{c('open')}</Button>}{!item.data.read_at&&canRead&&<Button disabled={Boolean(reading)||!navigator.onLine} onClick={()=>void mark(item)}><Check size={15}/>{c('mark')}</Button>}</footer>
  </article>})}</div>}
  <h3>{c('chats')}</h3>{!channelRows.length?<Empty title={c('noUnread')}/>:<div className="compact-list">{channelRows.map(row=><button key={row.channel_id} onClick={()=>onOpenChat(row.channel_id)} aria-label={`${c('openChat')} · ${row.channel.data.name||row.channel.id}`}><MessageSquare size={18}/><span><b>{row.channel.data.name||row.channel.id}</b><small>{row.unread} · {c('unread')}</small></span></button>)}</div>}
 </section>;
}
