import { assistantAnswer, assistantLocale } from '../src/lib/assistant-knowledge';
import type { WorkerEnv, D1Database, D1Statement, WorkerContext } from './types';
import { drainOwnerNotifications,notificationDeliveryEnabled, type NoticeKind } from './notifications';
import { captchaConfig, verifyCaptcha } from './turnstile';

/** Scoped public conversations + owner inbox. Never trust client-provided identity or role. */
type Row = Record<string, unknown>;
type Owner = { isOwner: boolean; id: string | null; verify?: () => boolean };
type ConversationAccess = { db: D1Database; id: string; tokenHash?: string; owner?: Owner };
const MAX_BODY = 4096, MAX_HISTORY = 120, MAX_INBOX = 100;
// Implementation policy, not a WhatsApp-transfer or account-invitation lifetime.
const CAPABILITY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
class Fault extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function fail(status: number, code: string, message: string): never { throw new Fault(status,code,message); }
function reply(body: unknown, status=200): Response {
  return new Response(JSON.stringify(body),{status,headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store, max-age=0',
    'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
    'Vary':'Cookie, Authorization, X-Knaba-Conversation',
  }});
}
function database(env: WorkerEnv): D1Database {
  if (!env.DB) fail(503,'unavailable','Die Unterhaltung ist derzeit nicht verfügbar.');
  return env.DB!;
}
async function digest(value: string): Promise<string> {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  return Array.from(bytes,part=>part.toString(16).padStart(2,'0')).join('');
}
function secret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),part=>part.toString(16).padStart(2,'0')).join('');
}
function guard(request: Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin ||
     request.headers.get('sec-fetch-site')==='cross-site' ||
     request.headers.get('x-knaba-request')!=='portal-v1')
    fail(403,'origin','Die Anfrage muss von der KnaBa-Website kommen.');
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
    fail(415,'content_type','JSON ist erforderlich.');
}
async function bodyOf(request: Request): Promise<Row> {
  guard(request);
  if(Number(request.headers.get('content-length')||0)>MAX_BODY) fail(413,'body_size','Nachricht zu lang.');
  if(!request.body) fail(400,'json','Nachricht fehlt.');
  const reader=request.body.getReader(); const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true) {
      const part=await reader.read();if(part.done)break;
      size+=part.value.length;
      if(size>MAX_BODY){await reader.cancel();fail(413,'body_size','Nachricht zu lang.');}
      chunks.push(part.value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let json:unknown;
  try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{fail(400,'json','Ungültige JSON-Nachricht.');}
  if(!json||typeof json!=='object'||Array.isArray(json))fail(400,'json','Ungültige JSON-Nachricht.');
  return json as Row;
}
function fields(body:Row, allowed:string[]) {
  if(Object.keys(body).some(key=>!allowed.includes(key)))fail(422,'unknown_field','Unbekanntes Datenfeld.');
}
function text(value:unknown,max:number,required=true):string {
  if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)|| (required&&!value.trim()))fail(422,'validation','Bitte Eingaben prüfen.');
  return value.trim();
}
function key(value:unknown):string {
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(value))fail(422,'idempotency','Ungültige Anfragekennung.');
  return value;
}
function uuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
function requireOwner(owner:Owner) {
  if(!owner.isOwner || !owner.id || (owner.verify && owner.verify()!==true))
    fail(403,'forbidden','Nur der Inhaber kann diese Daten sehen.');
}
async function throttle(db:D1Database,request:Request,operation:string,limit:number,seconds:number) {
  const ip=request.headers.get('cf-connecting-ip')?.trim().slice(0,64);
  // Never put unrelated visitors into one global 'unknown IP' quota bucket.
  if(!ip)return;
  const bucket=Math.floor(Date.now()/1000/seconds);
  const scope=await digest(operation+':'+ip+':'+bucket);
  const sql='INSERT INTO portal_rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count';
  const accepted=await db.prepare(sql).bind('assistant:'+scope,(bucket+1)*seconds,limit).first<Row>();
  if(!accepted)fail(429,'rate_limit','Zu viele Nachrichten. Bitte später erneut versuchen.');
}
/** The predicate is evaluated by SQLite with the data read/write, not by a stale JS row. */
function accessPredicate(access:ConversationAccess,writable=false,alias='cap'):{sql:string;values:unknown[]} {
  if(access.owner)requireOwner(access.owner);
  let sql=`${alias}.id=?`;
  const values:unknown[]=[access.id];
  if(!access.owner){
    sql+=` AND ${alias}.token_hash=? AND ${alias}.token_revoked_at IS NULL
      AND ${alias}.created_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND ${alias}.token_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND strftime('%Y-%m-%dT%H:%M:%fZ',${alias}.token_expires_at)=${alias}.token_expires_at`;
    values.push(access.tokenHash);
  }
  if(writable)sql+=` AND ${alias}.status!='closed'`;
  return {sql,values};
}
function accessExists(access:ConversationAccess,writable=false):{sql:string;values:unknown[]} {
  const predicate=accessPredicate(access,writable);
  return {sql:`EXISTS (SELECT 1 FROM assistant_conversations cap WHERE ${predicate.sql})`,values:predicate.values};
}
async function readConversation(access:ConversationAccess,writable=false):Promise<Row> {
  const predicate=accessPredicate(access);
  const row=await access.db.prepare(`SELECT cap.* FROM assistant_conversations cap WHERE ${predicate.sql}`).bind(...predicate.values).first<Row>();
  if(access.owner)requireOwner(access.owner);
  if(!row)fail(404,'not_found','Gespräch nicht gefunden.');
  if(writable && row.status==='closed')fail(409,'closed','Dieses Gespräch ist geschlossen.');
  return row;
}
async function requireConversation(db:D1Database,id:string,request:Request,owner:Owner,asOwner=false):Promise<ConversationAccess> {
  if(asOwner)requireOwner(owner);
  if(!uuid(id))fail(404,'not_found','Gespräch nicht gefunden.');
  if(asOwner)return {db,id,owner};
  const token=request.headers.get('x-knaba-conversation');
  if(!token || !/^[0-9a-f]{64}$/.test(token))fail(404,'not_found','Gespräch nicht gefunden.');
  return {db,id,tokenHash:await digest(token)};
}
function conversationView(row:Row) {
  return {id:row.id,locale:row.locale,status:row.status,contactName:row.contact_name,contactEmail:row.contact_email,contactPhone:row.contact_phone,createdAt:row.created_at,updatedAt:row.updated_at,expiresAt:row.token_expires_at,revokedAt:row.token_revoked_at};
}
async function thread(access:ConversationAccess):Promise<Response> {
  await readConversation(access);
  let fence=accessExists(access);
  const messages=(await access.db.prepare(`SELECT id,sender,kind,content,created_at AS createdAt FROM assistant_messages WHERE conversation_id=? AND ${fence.sql} ORDER BY created_at ASC,rowid ASC LIMIT ?`).bind(access.id,...fence.values,MAX_HISTORY).all<Row>()).results||[];
  fence=accessExists(access);
  const offers=(await access.db.prepare(`SELECT id,content,state,created_at AS createdAt,decided_at AS decidedAt FROM assistant_offers WHERE conversation_id=? AND ${fence.sql} ORDER BY created_at DESC,rowid DESC LIMIT 20`).bind(access.id,...fence.values).all<Row>()).results||[];
  // A revocation between reads must not release the already assembled private payload.
  const row=await readConversation(access);
  return reply({conversation:conversationView(row),messages,offers});
}
function notice(access:ConversationAccess,eventKey:string,kind:NoticeKind,extraSql='1',extraValues:unknown[]=[]):D1Statement {
  const fence=accessExists(access,true),created=now();
  return access.db.prepare(`INSERT OR IGNORE INTO assistant_notifications (id,conversation_id,event_key,kind,status,attempts,next_attempt_at,last_error,created_at,updated_at,sent_at)
    SELECT ?,?,?,?,'pending',0,0,'',?,?,NULL WHERE ${fence.sql} AND (${extraSql})`)
    .bind(newId(),access.id,eventKey,kind,created,created,...fence.values,...extraValues);
}
async function createConversation(request:Request,env:WorkerEnv) {
  const db=database(env),b=await bodyOf(request);
  fields(b,['locale','privacyAccepted','website','captchaToken']);
  if(b.privacyAccepted!==true)fail(422,'privacy','Datenschutzhinweise bitte bestätigen.');
  if(b.website!==undefined && b.website!=='')fail(422,'validation','Anfrage ungültig.');
  await throttle(db,request,'create',10,3600);
  const captcha=await verifyCaptcha(request,env,b.captchaToken);
  if(captcha==='unavailable')fail(503,'captcha_unavailable','Sicherheitsprüfung ist derzeit nicht erreichbar.');
  if(captcha!=='ok')fail(422,'captcha_required','Bitte die Sicherheitsprüfung abschließen.');
  // Expired buckets can be removed without touching active requests or chat records.
  await db.prepare('DELETE FROM portal_rate_limits WHERE expires_at < ?').bind(Math.floor(Date.now()/1000)-3600).run();
  const token=secret(),id=newId(),time=now(),locale=assistantLocale(b.locale);
  const expiresAt=new Date(Date.parse(time)+CAPABILITY_LIFETIME_MS).toISOString();
  await db.prepare('INSERT INTO assistant_conversations (id,token_hash,token_expires_at,locale,status,contact_name,contact_email,contact_phone,privacy_version,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id,await digest(token),expiresAt,locale,'assistant','','','','2026-10-28',time,time).run();
  return reply({id,token,locale,status:'assistant',expiresAt},201);
}
async function guestMessage(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),access=await requireConversation(db,id,request,owner);
  await readConversation(access,true);
  const b=await bodyOf(request);fields(b,['content','idempotencyKey']);
  const content=text(b.content,1000),requestKey=key(b.idempotencyKey);
  const row=await readConversation(access,true);
  let fence=accessExists(access,true);
  const existing=await db.prepare(`SELECT id,content FROM assistant_messages WHERE conversation_id=? AND request_key=? AND ${fence.sql}`).bind(id,requestKey,...fence.values).first<Row>();
  await readConversation(access,true);
  if(existing){
    if(existing.content!==content)fail(409,'idempotency_conflict','Diese Anfragekennung gehört zu einer anderen Nachricht.');
    return thread(access);
  }
  await throttle(db,request,'message',45,3600);
  fence=accessExists(access,true);
  const count=await db.prepare(`SELECT COUNT(*) AS n FROM assistant_messages WHERE conversation_id=? AND ${fence.sql}`).bind(id,...fence.values).first<Row>();
  await readConversation(access,true);
  if(Number(count?.n)>=MAX_HISTORY-2)fail(429,'limit','Gesprächslimit erreicht. Bitte kontaktieren Sie KnaBa direkt.');
  const time=now();
  const committed='EXISTS (SELECT 1 FROM assistant_messages WHERE conversation_id=? AND request_key=? AND content=?)';
  const committedValues=[id,requestKey,content];
  fence=accessExists(access,true);
  const writes=[db.prepare(`INSERT OR IGNORE INTO assistant_messages (id,conversation_id,sender,kind,content,request_key,created_at)
    SELECT ?,?,'customer','text',?,?,? WHERE ${fence.sql} AND (SELECT COUNT(*) FROM assistant_messages WHERE conversation_id=?)<?`)
    .bind(newId(),id,content,requestKey,time,...fence.values,id,MAX_HISTORY-2)];
  writes.push(notice(access,`message:${id}:${requestKey}`,'customer_message',`${committed} AND EXISTS (SELECT 1 FROM assistant_conversations WHERE id=? AND status='human')`,[...committedValues,id]));
  if(row.status==='assistant'){
    const answer=assistantAnswer(content,assistantLocale(row.locale));
    writes.push(db.prepare(`INSERT OR IGNORE INTO assistant_messages (id,conversation_id,sender,kind,content,request_key,created_at)
      SELECT ?,?,'assistant','text',?,?,? WHERE ${fence.sql} AND ${committed} AND EXISTS (SELECT 1 FROM assistant_conversations WHERE id=? AND status='assistant')`)
      .bind(newId(),id,answer.text,'reply:'+requestKey,time,...fence.values,...committedValues,id));
    if(answer.handoff){
      writes.push(db.prepare(`UPDATE assistant_conversations SET status='human',updated_at=? WHERE id=? AND status='assistant' AND ${fence.sql} AND ${committed}`)
        .bind(time,id,...fence.values,...committedValues));
      writes.push(notice(access,`handoff:${id}`,'owner_handoff',committed,committedValues));
    }
  }
  writes.push(db.prepare(`UPDATE assistant_conversations SET updated_at=? WHERE id=? AND ${fence.sql} AND ${committed}`).bind(time,id,...fence.values,...committedValues));
  // The message, automatic response and minimal outbox event commit together.
  const saved=await db.batch(writes);
  await readConversation(access,true);
  if(!saved[0].meta?.changes){
    fence=accessExists(access,true);
    const replay=await db.prepare(`SELECT content FROM assistant_messages WHERE conversation_id=? AND request_key=? AND ${fence.sql}`).bind(id,requestKey,...fence.values).first<Row>();
    await readConversation(access,true);
    if(replay && replay.content!==content)fail(409,'idempotency_conflict','Diese Anfragekennung gehört zu einer anderen Nachricht.');
    if(!replay)fail(429,'limit','Gesprächslimit erreicht. Bitte kontaktieren Sie KnaBa direkt.');
  }
  return thread(access);
}
async function handoff(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),access=await requireConversation(db,id,request,owner);
  const row=await readConversation(access,true);
  const b=await bodyOf(request);fields(b,['name','email','phone']);
  const name=text(b.name??'',80,false),email=text(b.email??'',254,false),phone=text(b.phone??'',35,false);
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(422,'validation','Ungültige E-Mail.');
  if(phone && !/^\+?[0-9().\s-]{5,35}$/.test(phone))fail(422,'validation','Ungültige Telefonnummer.');
  await throttle(db,request,'handoff',12,3600);
  const time=now(),fence=accessExists(access,true);
  await db.batch([
    db.prepare(`UPDATE assistant_conversations SET status='human',contact_name=?,contact_email=?,contact_phone=?,updated_at=? WHERE id=? AND ${fence.sql}`)
      .bind(name,email.toLowerCase(),phone,time,id,...fence.values),
    db.prepare(`INSERT OR IGNORE INTO assistant_messages (id,conversation_id,sender,kind,content,request_key,created_at) SELECT ?,?,'assistant','text',?,'handoff',? WHERE ${fence.sql}`)
      .bind(newId(),id,assistantAnswer('human',assistantLocale(row.locale)).text,time,...fence.values),
    notice(access,`handoff:${id}`,'owner_handoff'),
  ]);
  await readConversation(access,true);
  return thread(access);
}
async function inbox(env:WorkerEnv,owner:Owner) {
  requireOwner(owner);
  const db=database(env);
  const data=(await db.prepare("SELECT c.id,c.locale,c.status,c.contact_name AS contactName,c.contact_email AS contactEmail,c.contact_phone AS contactPhone,c.created_at AS createdAt,c.updated_at AS updatedAt,c.token_expires_at AS expiresAt,c.token_revoked_at AS revokedAt, (SELECT content FROM assistant_messages WHERE conversation_id=c.id ORDER BY created_at DESC,rowid DESC LIMIT 1) AS preview FROM assistant_conversations c WHERE c.status!='assistant' ORDER BY c.updated_at DESC,c.id DESC LIMIT ?")
    .bind(MAX_INBOX).all<Row>()).results||[];
  requireOwner(owner);
  return reply({conversations:data,limited:data.length>=MAX_INBOX});
}
async function ownerMessage(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),access=await requireConversation(db,id,request,owner,true);
  await readConversation(access,true);
  const b=await bodyOf(request);fields(b,['content','idempotencyKey']);
  const content=text(b.content,1200),requestKey=key(b.idempotencyKey);
  let fence=accessExists(access,true);
  const count=await db.prepare(`SELECT COUNT(*) AS n FROM assistant_messages WHERE conversation_id=? AND ${fence.sql}`).bind(id,...fence.values).first<Row>();
  await readConversation(access,true);
  if(Number(count?.n)>=MAX_HISTORY-1)fail(429,'limit','Gesprächslimit erreicht.');
  fence=accessExists(access,true);
  const saved=await db.batch([
    db.prepare(`INSERT OR IGNORE INTO assistant_messages (id,conversation_id,sender,kind,content,request_key,created_at) SELECT ?,?,'owner','text',?,?,? WHERE ${fence.sql} AND (SELECT COUNT(*) FROM assistant_messages WHERE conversation_id=?)<?`)
      .bind(newId(),id,content,requestKey,now(),...fence.values,id,MAX_HISTORY-1),
    db.prepare(`UPDATE assistant_conversations SET status='human',updated_at=? WHERE id=? AND ${fence.sql} AND EXISTS (SELECT 1 FROM assistant_messages WHERE conversation_id=? AND request_key=? AND content=?)`)
      .bind(now(),id,...fence.values,id,requestKey,content),
  ]);
  await readConversation(access,true);
  if(!saved[0].meta?.changes){
    fence=accessExists(access,true);
    const replay=await db.prepare(`SELECT content FROM assistant_messages WHERE conversation_id=? AND request_key=? AND ${fence.sql}`).bind(id,requestKey,...fence.values).first<Row>();
    requireOwner(owner);
    if(replay?.content!==content)fail(409,'idempotency_conflict','Diese Anfragekennung gehört zu einer anderen Nachricht.');
  }
  return thread(access);
}
async function ownerOffer(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),access=await requireConversation(db,id,request,owner,true);
  await readConversation(access,true);
  const b=await bodyOf(request);fields(b,['content','idempotencyKey']);
  const content=text(b.content,1400),requestKey=key(b.idempotencyKey);
  let fence=accessExists(access,true);
  const duplicate=await db.prepare(`SELECT id,content FROM assistant_offers WHERE conversation_id=? AND request_key=? AND ${fence.sql}`).bind(id,requestKey,...fence.values).first<Row>();
  await readConversation(access,true);
  if(duplicate){if(duplicate.content!==content)fail(409,'conflict','Anfragekennung wurde für andere Bedingungen verwendet.');return thread(access);}
  fence=accessExists(access,true);
  const pending=await db.prepare(`SELECT id FROM assistant_offers WHERE conversation_id=? AND state='pending' AND ${fence.sql}`).bind(id,...fence.values).first<Row>();
  requireOwner(owner);
  if(pending)fail(409,'pending_offer','Ein Angebot wartet bereits auf Entscheidung.');
  fence=accessExists(access,true);
  const saved=await db.batch([
    db.prepare(`INSERT OR IGNORE INTO assistant_offers (id,conversation_id,content,state,request_key,created_at,decided_at) SELECT ?,?,?,'pending',?,?,NULL WHERE ${fence.sql} AND NOT EXISTS (SELECT 1 FROM assistant_offers WHERE conversation_id=? AND state='pending')`)
      .bind(newId(),id,content,requestKey,now(),...fence.values,id),
    db.prepare(`UPDATE assistant_conversations SET status='human',updated_at=? WHERE id=? AND ${fence.sql} AND EXISTS (SELECT 1 FROM assistant_offers WHERE conversation_id=? AND request_key=? AND content=?)`)
      .bind(now(),id,...fence.values,id,requestKey,content),
  ]);
  await readConversation(access,true);
  if(!saved[0].meta?.changes)fail(409,'conflict','Bitte laden Sie die Angebote neu.');
  return thread(access);
}
async function decide(request:Request,env:WorkerEnv,id:string,offerId:string,owner:Owner) {
  const db=database(env),access=await requireConversation(db,id,request,owner);
  await readConversation(access,true);
  if(!uuid(offerId))fail(404,'not_found','Angebot nicht gefunden.');
  const b=await bodyOf(request);fields(b,['decision']);
  if(b.decision!=='accepted'&&b.decision!=='declined')fail(422,'validation','Entscheidung ungültig.');
  let fence=accessExists(access,true);
  const time=now(),committed='EXISTS (SELECT 1 FROM assistant_offers WHERE id=? AND conversation_id=? AND state=?)';
  const committedValues=[offerId,id,b.decision];
  const saved=await db.batch([
    db.prepare(`UPDATE assistant_offers SET state=?,decided_at=? WHERE id=? AND conversation_id=? AND state='pending' AND ${fence.sql}`)
      .bind(b.decision,time,offerId,id,...fence.values),
    db.prepare(`UPDATE assistant_conversations SET updated_at=? WHERE id=? AND ${fence.sql} AND ${committed}`).bind(time,id,...fence.values,...committedValues),
    notice(access,`decision:${offerId}`,'offer_decision',committed,committedValues),
  ]);
  await readConversation(access,true);
  if(!saved[0].meta?.changes){
    fence=accessExists(access,true);
    const existing=await db.prepare(`SELECT state FROM assistant_offers WHERE id=? AND conversation_id=? AND ${fence.sql}`).bind(offerId,id,...fence.values).first<Row>();
    await readConversation(access,true);
    if(existing?.state!==b.decision)fail(409,'conflict','Angebot wurde bereits entschieden.');
  }
  return thread(access);
}
async function ownerStatus(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),access=await requireConversation(db,id,request,owner,true);
  await readConversation(access);
  const b=await bodyOf(request);fields(b,['status']);
  if(b.status!=='human'&&b.status!=='closed')fail(422,'validation','Status ungültig.');
  const fence=accessExists(access);
  await db.prepare(`UPDATE assistant_conversations SET status=?,updated_at=? WHERE id=? AND ${fence.sql}`).bind(b.status,now(),id,...fence.values).run();
  return thread(access);
}
async function ownerRevoke(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),access=await requireConversation(db,id,request,owner,true);
  await readConversation(access);
  const b=await bodyOf(request);fields(b,[]);
  const time=now(),fence=accessExists(access);
  await db.batch([
    db.prepare(`UPDATE assistant_conversations SET token_hash='',token_revoked_at=?,updated_at=? WHERE id=? AND token_revoked_at IS NULL AND ${fence.sql}`)
      .bind(time,time,id,...fence.values),
    db.prepare("INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) SELECT ?,?,'assistant.access.revoke',?,? WHERE changes()=1")
      .bind(newId(),owner.id,id,time),
  ]);
  return thread(access);
}
async function flushAfter(response:Promise<Response>,env:WorkerEnv,ctx?:WorkerContext):Promise<Response> {
  const result=await response;
  if(result.ok && ctx && notificationDeliveryEnabled(env)){
    ctx.waitUntil(drainOwnerNotifications(env).then(()=>undefined).catch(()=>undefined));
  }
  return result;
}

export async function handleAssistant(request:Request,env:WorkerEnv,owner:Owner,ctx?:WorkerContext):Promise<Response> {
  try {
    const path=new URL(request.url).pathname.replace(/\/$/,'');
    if(path==='/api/assistant/captcha'&&request.method==='GET'){
      const config=captchaConfig(env);
      return reply(config,config.unavailable?503:200);
    }
    if(path==='/api/assistant/conversations'&&request.method==='POST')return await createConversation(request,env);
    if(path==='/api/assistant/owner/notifications'&&request.method==='GET'){
      requireOwner(owner);
      const rows=(await database(env).prepare('SELECT status,COUNT(*) AS count FROM assistant_notifications GROUP BY status').all<{status:string;count:number}>()).results??[];
      requireOwner(owner);
      return reply({enabled:notificationDeliveryEnabled(env),counts:Object.fromEntries(rows.map(r=>[r.status,r.count]))});
    }
    if(path==='/api/assistant/owner/notifications/dispatch'&&request.method==='POST'){
      requireOwner(owner);
      const b=await bodyOf(request);fields(b,[]);
      requireOwner(owner);
      const delivery=await drainOwnerNotifications(env);
      requireOwner(owner);
      return reply({...delivery,enabled:notificationDeliveryEnabled(env)});
    }
    if(path==='/api/assistant/owner/conversations'&&request.method==='GET')return await inbox(env,owner);
    const ownerThread=path.match(/^\/api\/assistant\/owner\/conversations\/([0-9a-f-]{36})$/i);
    if(ownerThread&&request.method==='GET'){
      const db=database(env);return await thread(await requireConversation(db,ownerThread[1],request,owner,true));
    }
    const ownerMatch=path.match(/^\/api\/assistant\/owner\/conversations\/([0-9a-f-]{36})\/(messages|offers|status|access\/revoke)$/i);
    if(ownerMatch&&request.method==='POST'){
      if(ownerMatch[2]==='messages')return await ownerMessage(request,env,ownerMatch[1],owner);
      if(ownerMatch[2]==='offers')return await ownerOffer(request,env,ownerMatch[1],owner);
      if(ownerMatch[2]==='access/revoke')return await ownerRevoke(request,env,ownerMatch[1],owner);
      return await ownerStatus(request,env,ownerMatch[1],owner);
    }
    const threadMatch=path.match(/^\/api\/assistant\/conversations\/([0-9a-f-]{36})$/i);
    if(threadMatch&&request.method==='GET'){
      const db=database(env);return await thread(await requireConversation(db,threadMatch[1],request,owner));
    }
    const messageMatch=path.match(/^\/api\/assistant\/conversations\/([0-9a-f-]{36})\/(messages|handoff)$/i);
    if(messageMatch&&request.method==='POST')return await flushAfter(messageMatch[2]==='messages'?guestMessage(request,env,messageMatch[1],owner):handoff(request,env,messageMatch[1],owner),env,ctx);
    const decisionMatch=path.match(/^\/api\/assistant\/conversations\/([0-9a-f-]{36})\/offers\/([0-9a-f-]{36})\/decision$/i);
    if(decisionMatch&&request.method==='POST')return await flushAfter(decide(request,env,decisionMatch[1],decisionMatch[2],owner),env,ctx);
    return reply({error:{code:'not_found',message:'Nicht verfügbar.'}},404);
  } catch(error) {
    if(error instanceof Fault)return reply({error:{code:error.code,message:error.message}},error.status);
    if(error && typeof error==='object' && 'code' in error && error.code==='session_revoked')
      return reply({error:{code:'forbidden',message:'Nur der Inhaber kann diese Daten sehen.'}},403);
    return reply({error:{code:'unavailable',message:'Der Dienst ist derzeit nicht verfügbar.'}},503);
  }
}
