import {useEffect,useSyncExternalStore} from 'react';
import {AlertTriangle,Check,RefreshCw,ShieldCheck,X} from './icons';
import {Badge,Button} from '../../../packages/ui/index';
import type {Translate} from './CommandForm';
import {SafeOfflineQueue} from './offlineQueue';

export default function OfflineQueuePanel({queue,t,online,onAcknowledged}:{queue:SafeOfflineQueue;t:Translate;online:boolean;onAcknowledged:()=>void}){
 const entries=useSyncExternalStore(queue.subscribe,queue.getSnapshot,queue.getSnapshot);
 useEffect(()=>{const expire=()=>queue.expire();const timer=setInterval(expire,30_000);window.addEventListener('focus',expire);document.addEventListener('visibilitychange',expire);return()=>{clearInterval(timer);window.removeEventListener('focus',expire);document.removeEventListener('visibilitychange',expire)}},[queue]);
 if(!entries.length)return null;
 return <section className="offline-queue" aria-label={t('queueTitle')}><details open><summary><AlertTriangle size={18}/><b>{t('queueTitle')}</b><Badge tone="amber">{entries.filter(entry=>entry.state!=='ACKNOWLEDGED').length}</Badge></summary><p className="offline-queue-lifetime">{t('queueLifetime')}</p><ul>{entries.map(entry=><li key={entry.id} data-queue-state={entry.state}><div className="offline-queue-reference"><code>{entry.name}</code><small>{String(entry.input.taskId||entry.input.requestId||'')}</small><Badge tone={entry.state==='ACKNOWLEDGED'?'green':['CONFLICT','DENIED','EXPIRED'].includes(entry.state)?'red':'amber'}>{entry.state==='ACKNOWLEDGED'?<Check size={12}/>:<ShieldCheck size={12}/>} {t(`queue${entry.state}`)}</Badge><p role={['CONFLICT','DENIED','UNKNOWN'].includes(entry.state)?'status':undefined}>{t(`queue${entry.state}Desc`)}</p>{entry.code&&<small>{entry.code}</small>}</div><div className="offline-queue-actions">{['UNSYNCED','UNKNOWN','RETRYING'].includes(entry.state)&&<Button disabled={!online||entry.state==='RETRYING'} onClick={async()=>{if(await queue.retry(entry.id))onAcknowledged()}}><RefreshCw size={14}/>{t(entry.state==='RETRYING'?'loading':entry.state==='UNKNOWN'?'queueCheckReceipt':'queueRetry')}</Button>}<Button variant="secondary" disabled={entry.state==='RETRYING'} onClick={()=>queue.remove(entry.id)}><X size={14}/>{t('queueRemove')}</Button></div></li>)}</ul></details></section>;
}
