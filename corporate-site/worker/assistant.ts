import { assistantAnswer, assistantLocale } from '../src/lib/assistant-knowledge';
import type { WorkerEnv, D1Database } from './types';

/** Scoped public conversations + owner inbox. Never trust client-provided identity or role. */
type Row = Record<string, unknown>;
type Owner = { isOwner: boolean; id: string | null };
const MAX_BODY = 4096, MAX_HISTORY = 120, MAX_INBOX = 100;
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const string = (value: unknown) => typeof value === 'string' ? value : '';
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
function requireOwner(owner:Owner) { if(!owner.isOwner || !owner.id)fail(403,'forbidden','Nur der Inhaber kann diese Daten sehen.'); }
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
async function requireConversation(db:D1Database,id:string,request:Request,owner:Owner,asOwner=false):Promise<Row> {
  if(!uuid(id))fail(404,'not_found','Gespräch nicht gefunden.');
  const row=await db.prepare('SELECT * FROM assistant_conversations WHERE id=?').bind(id).first<Row>();
  if(!row)fail(404,'not_found','Gespräch nicht gefunden.');
  if(asOwner){requireOwner(owner);return row!;}
  const token=request.headers.get('x-knaba-conversation');
  if(!token || !/^[0-9a-f]{64}$/.test(token) || await digest(token)!==string(row!.token_hash))
    fail(404,'not_found','Gespräch nicht gefunden.');
  return row!;
}
async function thread(db:D1Database,row:Row):Promise<Response> {
  const conversation={id:row.id,locale:row.locale,status:row.status,contactName:row.contact_name,contactEmail:row.contact_email,contactPhone:row.contact_phone,createdAt:row.created_at,updatedAt:row.updated_at};
  const messages=(await db.prepare('SELECT id,sender,kind,content,created_at AS createdAt FROM assistant_messages WHERE conversation_id=? ORDER BY created_at ASC,rowid ASC LIMIT ?').bind(row.id,MAX_HISTORY).all<Row>()).results||[];
  const offers=(await db.prepare('SELECT id,content,state,created_at AS createdAt,decided_at AS decidedAt FROM assistant_offers WHERE conversation_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20').bind(row.id).all<Row>()).results||[];
  return reply({conversation,messages,offers});
}
async function createConversation(request:Request,env:WorkerEnv) {
  const db=database(env),b=await bodyOf(request);
  fields(b,['locale','privacyAccepted','website']);
  if(b.privacyAccepted!==true)fail(422,'privacy','Datenschutzhinweise bitte bestätigen.');
  if(b.website!==undefined && b.website!=='')fail(422,'validation','Anfrage ungültig.');
  await throttle(db,request,'create',10,3600);
  // Expired buckets can be removed without touching active requests or chat records.
  await db.prepare('DELETE FROM portal_rate_limits WHERE expires_at < ?').bind(Math.floor(Date.now()/1000)-3600).run();
  const token=secret(),id=newId(),time=now(),locale=assistantLocale(b.locale);
  await db.prepare('INSERT INTO assistant_conversations (id,token_hash,locale,status,contact_name,contact_email,contact_phone,privacy_version,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id,await digest(token),locale,'assistant','','','','2026-10-24',time,time).run();
  return reply({id,token,locale,status:'assistant'},201);
}
async function guestMessage(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),row=await requireConversation(db,id,request,owner);
  const b=await bodyOf(request);fields(b,['content','idempotencyKey']);
  const content=text(b.content,1000),requestKey=key(b.idempotencyKey);
  if(row.status==='closed')fail(409,'closed','Dieses Gespräch ist geschlossen.');
  const existing=await db.prepare('SELECT id,content FROM assistant_messages WHERE conversation_id=? AND request_key=?').bind(id,requestKey).first<Row>();
  if(existing){
    if(existing.content!==content)fail(409,'idempotency_conflict','Diese Anfragekennung gehört zu einer anderen Nachricht.');
    return thread(db,await requireConversation(db,id,request,owner));
  }
  await throttle(db,request,'message',45,3600);
  const count=await db.prepare('SELECT COUNT(*) AS n FROM assistant_messages WHERE conversation_id=?').bind(id).first<Row>();
  if(Number(count?.n)>=MAX_HISTORY-2)fail(429,'limit','Gesprächslimit erreicht. Bitte kontaktieren Sie KnaBa direkt.');
  const time=now();
  const result=await db.prepare("INSERT OR IGNORE INTO assistant_messages (id,conversation_id,sender,kind,content,request_key,created_at) VALUES (?,?,'customer','text',?,?,?)")
    .bind(newId(),id,content,requestKey,time).run();
  if(!result.meta?.changes) {
    const replay=await db.prepare('SELECT content FROM assistant_messages WHERE conversation_id=? AND request_key=?').bind(id,requestKey).first<Row>();
    if(replay && replay.content!==content)fail(409,'idempotency_conflict','Diese Anfragekennung gehört zu einer anderen Nachricht.');
  }
  if(result.meta?.changes) {
    if(row.status==='assistant') {
      const answer=assistantAnswer(content,assistantLocale(row.locale));
      await db.prepare("INSERT OR IGNORE INTO assistant_messages (id,conversation_id,sender,kind,content,request_key,created_at) VALUES (?,?,'assistant','text',?,?,?)")
        .bind(newId(),id,answer.text,'reply:'+requestKey,now()).run();
      if(answer.handoff)await db.prepare("UPDATE assistant_conversations SET status='human',updated_at=? WHERE id=? AND status='assistant'").bind(now(),id).run();
    }
    await db.prepare('UPDATE assistant_conversations SET updated_at=? WHERE id=?').bind(now(),id).run();
  }
  return thread(db,(await db.prepare('SELECT * FROM assistant_conversations WHERE id=?').bind(id).first<Row>())!);
}
async function handoff(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),row=await requireConversation(db,id,request,owner);
  if(row.status==='closed')fail(409,'closed','Dieses Gespräch ist geschlossen.');
  const b=await bodyOf(request);fields(b,['name','email','phone']);
  const name=text(b.name??'',80,false),email=text(b.email??'',254,false),phone=text(b.phone??'',35,false);
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(422,'validation','Ungültige E-Mail.');
  if(phone && !/^\+?[0-9().\s-]{5,35}$/.test(phone))fail(422,'validation','Ungültige Telefonnummer.');
  await throttle(db,request,'handoff',12,3600);
  const time=now();
  await db.prepare("UPDATE assistant_conversations SET status='human',contact_name=?,contact_email=?,contact_phone=?,updated_at=? WHERE id=? AND status!='closed'")
    .bind(name,email.toLowerCase(),phone,time,id).run();
  await db.prepare("INSERT OR IGNORE INTO assistant_messages (id,conversation_id,sender,kind,content,request_key,created_at) VALUES (?,?,'assistant','text',?,'handoff',?)")
    .bind(newId(),id,assistantAnswer('human',assistantLocale(row.locale)).text,time).run();
  return thread(db,(await db.prepare('SELECT * FROM assistant_conversations WHERE id=?').bind(id).first<Row>())!);
}
async function inbox(env:WorkerEnv,owner:Owner) {
  requireOwner(owner);
  const db=database(env);
  const data=(await db.prepare("SELECT c.id,c.locale,c.status,c.contact_name AS contactName,c.contact_email AS contactEmail,c.contact_phone AS contactPhone,c.created_at AS createdAt,c.updated_at AS updatedAt, (SELECT content FROM assistant_messages WHERE conversation_id=c.id ORDER BY created_at DESC,rowid DESC LIMIT 1) AS preview FROM assistant_conversations c WHERE c.status!='assistant' ORDER BY c.updated_at DESC,c.id DESC LIMIT ?")
    .bind(MAX_INBOX).all<Row>()).results||[];
  return reply({conversations:data,limited:data.length>=MAX_INBOX});
}
async function ownerMessage(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),row=await requireConversation(db,id,request,owner,true);
  if(row.status==='closed')fail(409,'closed','Dieses Gespräch ist geschlossen.');
  const b=await bodyOf(request);fields(b,['content','idempotencyKey']);
  const content=text(b.content,1200),requestKey=key(b.idempotencyKey);
  const count=await db.prepare('SELECT COUNT(*) AS n FROM assistant_messages WHERE conversation_id=?').bind(id).first<Row>();
  if(Number(count?.n)>=MAX_HISTORY-1)fail(429,'limit','Gesprächslimit erreicht.');
  const result=await db.prepare("INSERT OR IGNORE INTO assistant_messages (id,conversation_id,sender,kind,content,request_key,created_at) VALUES (?,?,'owner','text',?,?,?)")
    .bind(newId(),id,content,requestKey,now()).run();
  if(!result.meta?.changes){
    const replay=await db.prepare('SELECT content FROM assistant_messages WHERE conversation_id=? AND request_key=?').bind(id,requestKey).first<Row>();
    if(replay?.content!==content)fail(409,'idempotency_conflict','Diese Anfragekennung gehört zu einer anderen Nachricht.');
  }
  await db.prepare("UPDATE assistant_conversations SET status='human',updated_at=? WHERE id=? AND status!='closed'").bind(now(),id).run();
  return thread(db,(await db.prepare('SELECT * FROM assistant_conversations WHERE id=?').bind(id).first<Row>())!);
}
async function ownerOffer(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env),row=await requireConversation(db,id,request,owner,true);
  if(row.status==='closed')fail(409,'closed','Dieses Gespräch ist geschlossen.');
  const b=await bodyOf(request);fields(b,['content','idempotencyKey']);
  const content=text(b.content,1400),requestKey=key(b.idempotencyKey);
  const duplicate=await db.prepare('SELECT id,content FROM assistant_offers WHERE conversation_id=? AND request_key=?').bind(id,requestKey).first<Row>();
  if(duplicate){if(duplicate.content!==content)fail(409,'conflict','Anfragekennung wurde für andere Bedingungen verwendet.');return thread(db,row);}
  const pending=await db.prepare("SELECT id FROM assistant_offers WHERE conversation_id=? AND state='pending'").bind(id).first<Row>();
  if(pending)fail(409,'pending_offer','Ein Angebot wartet bereits auf Entscheidung.');
  const result=await db.prepare("INSERT OR IGNORE INTO assistant_offers (id,conversation_id,content,state,request_key,created_at,decided_at) SELECT ?,?,?,'pending',?,?,NULL WHERE NOT EXISTS (SELECT 1 FROM assistant_offers WHERE conversation_id=? AND state='pending')")
    .bind(newId(),id,content,requestKey,now(),id).run();
  if(!result.meta?.changes)fail(409,'conflict','Bitte laden Sie die Angebote neu.');
  await db.prepare("UPDATE assistant_conversations SET status='human',updated_at=? WHERE id=?").bind(now(),id).run();
  return thread(db,(await db.prepare('SELECT * FROM assistant_conversations WHERE id=?').bind(id).first<Row>())!);
}
async function decide(request:Request,env:WorkerEnv,id:string,offerId:string,owner:Owner) {
  const db=database(env),row=await requireConversation(db,id,request,owner);
  if(row.status==='closed')fail(409,'closed','Dieses Gespräch ist geschlossen.');
  if(!uuid(offerId))fail(404,'not_found','Angebot nicht gefunden.');
  const b=await bodyOf(request);fields(b,['decision']);
  if(b.decision!=='accepted'&&b.decision!=='declined')fail(422,'validation','Entscheidung ungültig.');
  const result=await db.prepare("UPDATE assistant_offers SET state=?,decided_at=? WHERE id=? AND conversation_id=? AND state='pending'")
    .bind(b.decision,now(),offerId,id).run();
  if(!result.meta?.changes) {
    const existing=await db.prepare('SELECT state FROM assistant_offers WHERE id=? AND conversation_id=?').bind(offerId,id).first<Row>();
    if(existing?.state!==b.decision)fail(409,'conflict','Angebot wurde bereits entschieden.');
  }
  await db.prepare('UPDATE assistant_conversations SET updated_at=? WHERE id=?').bind(now(),id).run();
  return thread(db,(await db.prepare('SELECT * FROM assistant_conversations WHERE id=?').bind(id).first<Row>())!);
}
async function ownerStatus(request:Request,env:WorkerEnv,id:string,owner:Owner) {
  const db=database(env);await requireConversation(db,id,request,owner,true);
  const b=await bodyOf(request);fields(b,['status']);
  if(b.status!=='human'&&b.status!=='closed')fail(422,'validation','Status ungültig.');
  await db.prepare('UPDATE assistant_conversations SET status=?,updated_at=? WHERE id=?').bind(b.status,now(),id).run();
  return thread(db,(await db.prepare('SELECT * FROM assistant_conversations WHERE id=?').bind(id).first<Row>())!);
}
export async function handleAssistant(request:Request,env:WorkerEnv,owner:Owner):Promise<Response> {
  try {
    const path=new URL(request.url).pathname.replace(/\/$/,'');
    if(path==='/api/assistant/conversations'&&request.method==='POST')return await createConversation(request,env);
    if(path==='/api/assistant/owner/conversations'&&request.method==='GET')return await inbox(env,owner);
    const ownerThread=path.match(/^\/api\/assistant\/owner\/conversations\/([0-9a-f-]{36})$/i);
    if(ownerThread&&request.method==='GET'){
      const db=database(env);return thread(db,await requireConversation(db,ownerThread[1],request,owner,true));
    }
    const ownerMatch=path.match(/^\/api\/assistant\/owner\/conversations\/([0-9a-f-]{36})\/(messages|offers|status)$/i);
    if(ownerMatch&&request.method==='POST'){
      if(ownerMatch[2]==='messages')return await ownerMessage(request,env,ownerMatch[1],owner);
      if(ownerMatch[2]==='offers')return await ownerOffer(request,env,ownerMatch[1],owner);
      return await ownerStatus(request,env,ownerMatch[1],owner);
    }
    const threadMatch=path.match(/^\/api\/assistant\/conversations\/([0-9a-f-]{36})$/i);
    if(threadMatch&&request.method==='GET'){
      const db=database(env);return thread(db,await requireConversation(db,threadMatch[1],request,owner));
    }
    const messageMatch=path.match(/^\/api\/assistant\/conversations\/([0-9a-f-]{36})\/(messages|handoff)$/i);
    if(messageMatch&&request.method==='POST')return messageMatch[2]==='messages'?await guestMessage(request,env,messageMatch[1],owner):await handoff(request,env,messageMatch[1],owner);
    const decisionMatch=path.match(/^\/api\/assistant\/conversations\/([0-9a-f-]{36})\/offers\/([0-9a-f-]{36})\/decision$/i);
    if(decisionMatch&&request.method==='POST')return decide(request,env,decisionMatch[1],decisionMatch[2],owner);
    return reply({error:{code:'not_found',message:'Nicht verfügbar.'}},404);
  } catch(error) {
    if(error instanceof Fault)return reply({error:{code:error.code,message:error.message}},error.status);
    return reply({error:{code:'unavailable',message:'Der Dienst ist derzeit nicht verfügbar.'}},503);
  }
}