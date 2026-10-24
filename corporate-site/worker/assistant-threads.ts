import type { PortalSession } from '../src/lib/portal-contract';
import type { D1Database, D1Statement } from './types';
import { enqueueOwnerNotice, ownerNotificationStatus } from './owner-notifications';

type Body = Record<string,unknown>;
type ThreadRow = Record<string,unknown>;
type ThreadMessage = {id:string;author:'visitor'|'owner';message:string;createdAt:string};
type Dependencies = {
  db:D1Database;
  readBody:(request:Request)=>Promise<Body>;
  rateLimit:(key:string,limit:number)=>Promise<void>;
  response:(body:unknown,status?:number)=>Response;
  fail:(status:number,code:string,message:string)=>never;
};
const SCOPE='/api/assistant/';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[a-zA-Z0-9_-]{16,100}$/;
const CAPABILITY=/^[a-zA-Z0-9_-]{43}$/;
const EXPIRATION_DAYS=7;
const PRIVACY_VERSION='2026-10-24';
const utc=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
const value=(v:unknown)=>typeof v==='string'?v:'';
async function sha(v:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
function messageValue(v:unknown,d:Dependencies):string {
  if(typeof v!=='string'||v.trim().length<2||v.trim().length>1500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))d.fail(422,'validation','Bitte geben Sie eine Nachricht mit 2 bis 1500 Zeichen ein.');
  return (v as string).trim().replace(/\r\n/g,'\n');
}
function keys(v:Body,allowed:string[],d:Dependencies){if(Object.keys(v).some(k=>!allowed.includes(k)))d.fail(422,'unknown_field','Unzulässiges Eingabefeld.');}
function idempotency(v:Body,d:Dependencies){if(!KEY.test(value(v.idempotencyKey)))d.fail(422,'idempotency','Ungültige Anfragekennung.');return value(v.idempotencyKey);}
function requireOwner(s:PortalSession,d:Dependencies){if(s.role!=='owner'||!s.user)d.fail(403,'forbidden','Keine Berechtigung.');return s.user!.id;}
function requireId(v:string,d:Dependencies){if(!UUID.test(v))d.fail(404,'not_found','Unterhaltung nicht gefunden.');return v;}
function viewMessage(r:ThreadRow):ThreadMessage{return {id:value(r.id),author:r.author==='owner'?'owner':'visitor',message:value(r.body),createdAt:value(r.created_at)};}
function viewThread(r:ThreadRow){return {id:value(r.id),locale:value(r.locale),status:value(r.status),createdAt:value(r.created_at),expiresAt:value(r.expires_at),lastMessageAt:value(r.last_message_at)};}
function audit(db:D1Database,actor:string,action:string,threadId:string,messageId:string,mutation:string,now:string):D1Statement {
  return db.prepare('INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM assistant_messages WHERE id=? AND last_mutation=?)').bind(uuid(),actor,action,threadId,now,messageId,mutation);
}
async function openThread(request:Request,d:Dependencies):Promise<Response> {
  const body=await d.readBody(request);
  keys(body,['capability','idempotencyKey','consentAccepted','locale','message'],d);
  if(body.consentAccepted!==true)d.fail(422,'consent_required','Bitte bestätigen Sie die Datenschutzhinweise.');
  if(!['de','ru','uk','en'].includes(value(body.locale)))d.fail(422,'validation','Die Sprache ist ungültig.');
  if(!CAPABILITY.test(value(body.capability)))d.fail(422,'capability','Ungültige private Zugriffskennung.');
  const key=idempotency(body,d),msg=messageValue(body.message,d),locale=value(body.locale),hash=await sha(value(body.capability));
  const payloadHash=await sha(JSON.stringify([key,msg,locale,PRIVACY_VERSION]));
  const previous=await d.db.prepare('SELECT id,opening_hash FROM assistant_threads WHERE capability_hash=?').bind(hash).first<ThreadRow>();
  if(previous){if(previous.opening_hash!==payloadHash)d.fail(409,'idempotency_conflict','Die Anfrage wurde bereits mit anderem Inhalt gesendet.');return d.response({id:previous.id,received:true},200);}
  await d.rateLimit(`assistant-create:${hash}`,8);
  // Sites/Cloudflare supplies a trusted client address. Per-capability limits alone
  // would allow infinite new secrets from the same visitor. Never store raw IPs.
  const ip=request.headers.get('cf-connecting-ip')?.trim();
  if(!ip||ip.length>128)d.fail(503,'abuse_protection_unavailable','Der Dialog ist vorübergehend nicht verfügbar.');
  await d.rateLimit(`assistant-ip:${await sha(ip!)}`,15);
  const now=utc(),expires=new Date(Date.now()+EXPIRATION_DAYS*86400000).toISOString(),threadId=uuid(),messageId=uuid(),mutation=uuid();
  const result=await d.db.batch([
    d.db.prepare('INSERT INTO assistant_threads (id,capability_hash,opening_hash,opening_key,locale,status,consent_version,created_at,expires_at,last_message_at) VALUES (?,?,?,?,?,\'open\',?,?,?,?) ON CONFLICT(capability_hash) DO NOTHING').bind(threadId,hash,payloadHash,key,locale,PRIVACY_VERSION,now,expires,now),
    d.db.prepare('INSERT INTO assistant_messages (id,thread_id,author,body,idempotency_key,payload_hash,created_at,last_mutation) SELECT ?,id,\'visitor\',?,?,?,?,? FROM assistant_threads WHERE id=? AND capability_hash=? ON CONFLICT(thread_id,author,idempotency_key) DO NOTHING').bind(messageId,msg,key,await sha(msg),now,mutation,threadId,hash),
    audit(d.db,'visitor','assistant.message.visitor',threadId,messageId,mutation,now),
    enqueueOwnerNotice(d.db,threadId,messageId,mutation,'new_thread',now),
  ]);
  const stored=await d.db.prepare('SELECT id,opening_hash FROM assistant_threads WHERE capability_hash=?').bind(hash).first<ThreadRow>();
  if(!stored)d.fail(503,'unavailable','Bitte versuchen Sie es erneut.');
  if(stored!.opening_hash!==payloadHash)d.fail(409,'idempotency_conflict','Die Anfrage wurde bereits mit anderem Inhalt gesendet.');
  return d.response({id:stored!.id,received:true},result[0]?.meta?.changes?201:200);
}
async function findThread(id:string,request:Request,owner:boolean,d:Dependencies):Promise<ThreadRow> {
  requireId(id,d);
  if(owner){const row=await d.db.prepare('SELECT * FROM assistant_threads WHERE id=?').bind(id).first<ThreadRow>();if(!row)d.fail(404,'not_found','Unterhaltung nicht gefunden.');return row!;}
  const capability=request.headers.get('X-KnaBa-Thread-Capability')||'';
  if(!CAPABILITY.test(capability))d.fail(404,'not_found','Unterhaltung nicht gefunden.');
  const hash=await sha(capability);
  const row=await d.db.prepare('SELECT * FROM assistant_threads WHERE id=? AND capability_hash=? AND expires_at>?').bind(id,hash,utc()).first<ThreadRow>();
  if(!row)d.fail(404,'not_found','Unterhaltung nicht gefunden.');
  return row!;
}
async function readThread(id:string,request:Request,owner:boolean,d:Dependencies):Promise<Response>{
  const thread=await findThread(id,request,owner,d);
  const rows=(await d.db.prepare('SELECT id,author,body,created_at FROM assistant_messages WHERE thread_id=? ORDER BY created_at DESC,id DESC LIMIT 81').bind(id).all<ThreadRow>()).results||[];
  return d.response({thread:viewThread(thread),messages:rows.slice(0,80).reverse().map(viewMessage),hasMore:rows.length>80});
}
async function listOwnerThreads(d:Dependencies):Promise<Response>{
  const rows=(await d.db.prepare('SELECT id,locale,status,created_at,expires_at,last_message_at FROM assistant_threads ORDER BY last_message_at DESC,id DESC LIMIT 51').all<ThreadRow>()).results||[];
  return d.response({threads:rows.slice(0,50).map(viewThread),hasMore:rows.length>50});
}
async function sendMessage(id:string,request:Request,ownerId:string|null,d:Dependencies):Promise<Response>{
  const thread=await findThread(id,request,Boolean(ownerId),d);
  if(thread.status!=='open')d.fail(409,'closed','Die Unterhaltung ist geschlossen.');
  const body=await d.readBody(request);
  keys(body,['idempotencyKey','message'],d);
  const key=idempotency(body,d),msg=messageValue(body.message,d),author=ownerId?'owner':'visitor';
  const payloadHash=await sha(msg);
  const existing=await d.db.prepare('SELECT * FROM assistant_messages WHERE thread_id=? AND author=? AND idempotency_key=?').bind(id,author,key).first<ThreadRow>();
  if(existing){if(existing.payload_hash!==payloadHash)d.fail(409,'idempotency_conflict','Die Anfragekennung wurde wiederverwendet.');return d.response({message:viewMessage(existing)},200);}
  await d.rateLimit(`assistant-message:${ownerId||value(thread.capability_hash)}`,ownerId?120:40);
  const now=utc(),messageId=uuid(),mutation=uuid();
  const existsGuard=ownerId?'id=? AND status=\'open\'':'id=? AND capability_hash=? AND expires_at>? AND status=\'open\'';
  const bound=ownerId?[id]:[id,thread.capability_hash,now];
  const result=await d.db.batch([
    d.db.prepare(`INSERT INTO assistant_messages (id,thread_id,author,body,idempotency_key,payload_hash,created_at,last_mutation) SELECT ?,id,?,?,?,?,?,? FROM assistant_threads WHERE ${existsGuard} ON CONFLICT(thread_id,author,idempotency_key) DO NOTHING`).bind(messageId,author,msg,key,payloadHash,now,mutation,...bound),
    d.db.prepare('UPDATE assistant_threads SET last_message_at=? WHERE id=? AND EXISTS (SELECT 1 FROM assistant_messages WHERE id=? AND last_mutation=?)').bind(now,id,messageId,mutation),
    audit(d.db,ownerId||'visitor',`assistant.message.${author}`,id,messageId,mutation,now),
    ...(!ownerId?[enqueueOwnerNotice(d.db,id,messageId,mutation,'visitor_message',now)]:[]),
  ]);
  const stored=await d.db.prepare('SELECT * FROM assistant_messages WHERE thread_id=? AND author=? AND idempotency_key=?').bind(id,author,key).first<ThreadRow>();
  if(!stored)d.fail(409,'closed','Die Unterhaltung kann derzeit nicht geändert werden.');
  if(stored!.payload_hash!==payloadHash)d.fail(409,'idempotency_conflict','Die Anfragekennung wurde wiederverwendet.');
  return d.response({message:viewMessage(stored!)},result[0]?.meta?.changes?201:200);
}

export async function handleAssistantApi(request:Request,session:PortalSession,d:Dependencies):Promise<Response> {
  const path=new URL(request.url).pathname.replace(/\/$/,'');
  if(path===`${SCOPE}threads` && request.method==='POST')return openThread(request,d);
  if(path===`${SCOPE}owner/threads` && request.method==='GET') {requireOwner(session,d);return listOwnerThreads(d);}
  if(path===`${SCOPE}owner/notifications` && request.method==='GET') {
    requireOwner(session,d);
    return d.response(await ownerNotificationStatus(d.db));
  }
  const ownerPath=path.match(/^\/api\/assistant\/owner\/threads\/([^/]+)(\/messages)?$/);
  if(ownerPath){const actor=requireOwner(session,d);if(ownerPath[2]&&request.method==='POST')return sendMessage(ownerPath[1],request,actor,d);if(!ownerPath[2]&&request.method==='GET')return readThread(ownerPath[1],request,true,d);}
  const visitorPath=path.match(/^\/api\/assistant\/threads\/([^/]+)(\/messages)?$/);
  if(visitorPath){if(visitorPath[2]&&request.method==='POST')return sendMessage(visitorPath[1],request,null,d);if(!visitorPath[2]&&request.method==='GET')return readThread(visitorPath[1],request,false,d);}
  return d.response({error:{code:'not_found',message:'Dieser Endpunkt ist nicht verfügbar.'}},404);
}
