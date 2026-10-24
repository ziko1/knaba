import type { D1Database, D1Statement, WorkerEnv } from './types';

export type NoticeKind = 'owner_handoff' | 'customer_message' | 'offer_decision';

/** Write to the D1 outbox, keyed by the committed domain event. No contact or chat text. */
export function ownerNotice(db: D1Database, conversationId: string, eventKey: string, kind: NoticeKind): D1Statement {
  const created = new Date().toISOString();
  return db.prepare("INSERT OR IGNORE INTO assistant_notifications (id,conversation_id,event_key,kind,status,attempts,next_attempt_at,last_error,created_at,updated_at,sent_at) VALUES (?,?,?,?,'pending',0,0,'',?,?,NULL)")
    .bind(crypto.randomUUID(),conversationId,eventKey,kind,created,created);
}

type Row = {id:string;conversation_id:string;event_key:string;kind:NoticeKind;attempts:number};
type DeliveryConfig = {from:string;to:string;origin:string;apiKey:string;dailyLimit:number};
export type DeliveryResult = {sent:number;failed:number;disabled:boolean;quotaExhausted:boolean};
const MAX_ATTEMPTS = 5;
const MAX_PER_RUN = 3;
const EMAIL_API = 'https://api.resend.com/emails';
const emailPattern = /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/;

function configured(env: WorkerEnv): DeliveryConfig | null {
  // All conditions mandatory: a misconfigured install must never send an email.
  if(env.ASSISTANT_NOTIFICATIONS_ENABLED!=='approved' || !env.RESEND_API_KEY) return null;
  const from=env.ASSISTANT_NOTIFY_FROM?.trim()??'',to=env.ASSISTANT_NOTIFY_TO?.trim()??'';
  const fromEmail=from.match(/^(?:[^<>\r\n]{1,80} <)?([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>?$/)?.[1];
  if(!fromEmail || !emailPattern.test(fromEmail) || !emailPattern.test(to))return null;
  const dailyLimit=Number(env.ASSISTANT_EMAIL_DAILY_LIMIT);
  if(!Number.isSafeInteger(dailyLimit) || dailyLimit<1 || dailyLimit>100)return null;
  try {
    const url=new URL(env.ASSISTANT_PUBLIC_ORIGIN??'');
    if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || url.pathname!=='/')return null;
    return {from,to,origin:url.origin,apiKey:env.RESEND_API_KEY,dailyLimit};
  } catch {return null;}
}

export function notificationDeliveryEnabled(env:WorkerEnv):boolean { return configured(env)!==null && Boolean(env.DB); }

function textForNotice(row:Row,origin:string):{subject:string;text:string} {
  // The URL is only an owner inbox pointer, never the customer's bearer token.
  const url=new URL('/postfach/',origin);
  url.searchParams.set('conversation',row.conversation_id);
  const label:Record<NoticeKind,string>={owner_handoff:'Neue Bitte um Kontakt',customer_message:'Neue Nachricht im Kundengespräch',offer_decision:'Kunde hat einen Vorschlag beantwortet'};
  return {
    subject:`KnaBa: ${label[row.kind]??'Neues Ereignis'}`,
    text:`Ein Ereignis wartet im geschützten KNABA-Postfach.\nTyp: ${label[row.kind]??'Nachricht'}\nZum Anmelden und Antworten: ${url.toString()}\n\nEs werden keine Inhalte oder Kontaktdaten per E-Mail versendet.`,
  };
}

/** Bounded at-least-once delivery. DB lease + provider idempotency prevents concurrent duplicates. */
export async function drainOwnerNotifications(env:WorkerEnv,transport:typeof fetch=fetch):Promise<DeliveryResult> {
  const result:DeliveryResult={sent:0,failed:0,disabled:false,quotaExhausted:false};
  const config=configured(env);
  if(!config || !env.DB){result.disabled=true;return result;}
  const db=env.DB,now=Math.floor(Date.now()/1000);
  const due=(await db.prepare("SELECT id,conversation_id,event_key,kind,attempts FROM assistant_notifications WHERE status IN ('pending','sending') AND next_attempt_at<=? AND attempts<? ORDER BY created_at ASC,id ASC LIMIT ?")
    .bind(now,MAX_ATTEMPTS,MAX_PER_RUN).all<Row>()).results??[];
  for(const item of due){
    // Count every provider attempt against a hard per-UTC-day budget (including retries).
    const utcDay=Math.floor(Date.now()/86400000),start=utcDay*86400;
    const quota=await db.prepare('INSERT INTO portal_rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count')
      .bind(`assistant:email:${utcDay}`,start+172800,config.dailyLimit).first<{count:number}>();
    if(!quota){result.quotaExhausted=true;break;}
    const claim=await db.prepare("UPDATE assistant_notifications SET status='sending',attempts=attempts+1,next_attempt_at=?,updated_at=? WHERE id=? AND status IN ('pending','sending') AND next_attempt_at<=? AND attempts<? RETURNING id,conversation_id,event_key,kind,attempts")
      .bind(now+120,new Date().toISOString(),item.id,now,MAX_ATTEMPTS).first<Row>();
    if(!claim)continue;
    const content=textForNotice(claim,config.origin);
    let response:Response|null=null,reason='network';
    try {
      response=await transport(EMAIL_API,{
        method:'POST',
        headers:{'Authorization':`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':claim.id},
        body:JSON.stringify({from:config.from,to:[config.to],subject:content.subject,text:content.text}),
        redirect:'error',signal:AbortSignal.timeout(5000),
      });
      reason=`http_${response.status}`;
    }catch {reason='network';}
    // HTTP 200 alone is not evidence the provider accepted this email.
    let acknowledged=false;
    if(response?.ok){
      try {
        const receipt=await response.json() as {id?:unknown};
        acknowledged=typeof receipt?.id==='string' && /^[a-zA-Z0-9_-]{8,128}$/.test(receipt.id);
      } catch { /* malformed provider acknowledgement: retry with the same idempotency key */ }
      if(!acknowledged)reason='invalid_ack';
    }
    const stamp=new Date().toISOString();
    if(acknowledged){
      await db.prepare("UPDATE assistant_notifications SET status='sent',sent_at=?,last_error='',updated_at=? WHERE id=? AND status='sending'")
        .bind(stamp,stamp,claim.id).run();
      result.sent++;continue;
    }
    const permanent=Boolean(response && response.status>=400 && response.status<500 && ![408,409,429].includes(response.status));
    const stopped=permanent || claim.attempts>=MAX_ATTEMPTS;
    const delay=Math.min(3600,60*2**Math.max(0,claim.attempts-1));
    await db.prepare("UPDATE assistant_notifications SET status=?,last_error=?,next_attempt_at=?,updated_at=? WHERE id=? AND status='sending'")
      .bind(stopped?'stopped':'pending',reason,now+delay,stamp,claim.id).run();
    result.failed++;
  }
  return result;
}
