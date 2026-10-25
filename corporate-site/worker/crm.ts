import type { PortalSession } from '../src/lib/portal-contract';
import type { D1Database, WorkerEnv } from './types';

type Row = Record<string, unknown>;
type Stage = 'new'|'contacted'|'qualified'|'proposal'|'won'|'lost';
type Contact = {
  id: string; email: string; name: string; phone: string; lastAt: string;
  lastRequestId: string; latestService: string; latestRequestStatus: string;
  requestCount: number; stage: Stage; tags: string[]; version: number;
};
const stages: Stage[] = ['new','contacted','qualified','proposal','won','lost'];
const errorMessage = 'Die CRM-Aktion konnte nicht verarbeitet werden.';
class CrmFault extends Error {
  constructor(readonly status: number, readonly code: string, message = errorMessage) { super(message); }
}
function fail(status: number, code: string, message?: string): never {
  throw new CrmFault(status,code,message);
}
function response(data: unknown, status=200): Response {
  return new Response(JSON.stringify(data),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
    'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Vary':'Cookie'
  }});
}
function requireStaff(s: PortalSession): void {
  if (!s.user) fail(401,'unauthenticated','Bitte melden Sie sich an.');
  if (s.role!=='owner' && s.role!=='admin') fail(403,'forbidden','Nur die Websiteverwaltung hat Zugriff.');
}
function dbFor(env: WorkerEnv): D1Database {
  if (!env.DB) fail(503,'unavailable','CRM-Datenbank nicht verfügbar.');
  return env.DB!;
}
function text(value: unknown, max: number, required=true): string {
  if (typeof value!=='string' || value.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(422,'invalid_text');
  const out=value.trim();
  if (required && !out) fail(422,'invalid_text');
  return out;
}
function email(value: unknown): string {
  const out=text(value,320).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out)) fail(422,'email');
  return out;
}
function key(value: unknown): string {
  if(typeof value!=='string'|| !/^[a-f0-9]{64}$/.test(value)) fail(422,'contact_key');
  return value;
}
function version(value: unknown): number {
  if(!Number.isSafeInteger(value)|| Number(value)<0) fail(422,'version');
  return Number(value);
}
function stage(value: unknown): Stage {
  if(!stages.includes(value as Stage)) fail(422,'stage');
  return value as Stage;
}
function tags(value: unknown): string[] {
  if(!Array.isArray(value) || value.length>10) fail(422,'tags');
  const entries=value.map(v=>text(v,28)).filter(Boolean);
  if(entries.some(v=> !/^[\p{L}\p{N} _-]{1,28}$/u.test(v))) fail(422,'tags');
  if(new Set(entries.map(v=>v.toLocaleLowerCase())).size!==entries.length) fail(422,'tags');
  return entries;
}
function fields(body:Row, allowed:string[]): void {
  if(Object.keys(body).some(k=>!allowed.includes(k)) || allowed.some(k=>!(k in body))) fail(422,'fields');
}
async function hashEmail(normalized:string): Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function approved(db:D1Database,s:PortalSession):Promise<void> {
  requireStaff(s);
  if(s.role==='owner') return;
  const p=await db.prepare("SELECT id FROM profiles WHERE id=? AND lower(trim(email))=? AND role='admin' AND status='approved'")
    .bind(s.user!.id,s.user!.email.trim().toLowerCase()).first<Row>();
  if(!p) fail(403,'forbidden','Die Administratorfreigabe wurde geändert.');
}
function adminWhere(s:PortalSession):{sql:string;bindings:string[]} {
  if(s.role==='owner')return {sql:'',bindings:[]};
  return {sql:" AND EXISTS (SELECT 1 FROM profiles WHERE id=? AND lower(trim(email))=? AND role='admin' AND status='approved')",
    bindings:[s.user!.id,s.user!.email.trim().toLowerCase()]};
}
async function requireLead(db:D1Database,contactKey:string,contactEmail:string):Promise<void> {
  if(await hashEmail(contactEmail)!==contactKey) fail(422,'contact_key');
  const found=await db.prepare('SELECT id FROM cleaning_requests WHERE lower(trim(email))=? LIMIT 1')
    .bind(contactEmail).first<Row>();
  if(!found) fail(404,'not_found','Dieser Kontakt ist nicht vorhanden.');
}
function decodeTags(value: unknown):string[] {
  try { return tags(JSON.parse(String(value||'[]'))); } catch {return [];}
}
/** Owner-only aggregate; never expose a lead, provider token or fabricated ERP delivery. */
async function bridgeStatus(db:D1Database):Promise<Response> {
  const states={PENDING:'pending',LEASED:'leased',APPLIED:'applied',REVIEW:'review',BLOCKED:'blocked'} as const;
  const counts:{pending:number;leased:number;applied:number;review:number;blocked:number}={
    pending:0,leased:0,applied:0,review:0,blocked:0
  };
  const rows=(await db.prepare('SELECT status,COUNT(*) AS n FROM site_erp_outbox GROUP BY status').all<Row>()).results||[];
  for(const row of rows){
    const name=states[row.status as keyof typeof states];
    if(name&&Number.isSafeInteger(Number(row.n))&&Number(row.n)>=0)counts[name]=Number(row.n);
  }
  return response({scope:'SITE_OUTBOX_ONLY',counts});
}
async function listContacts(request:Request,db:D1Database):Promise<Response> {
  const query=new URL(request.url).searchParams.get('q')??'';
  if(query.length>70) fail(422,'search');
  const search=text(query,70,false).toLowerCase();
  const sql="WITH ranked AS (SELECT lower(trim(email)) AS email_key, contact_name, phone, id, service, status, updated_at, "+
    "ROW_NUMBER() OVER (PARTITION BY lower(trim(email)) ORDER BY updated_at DESC,id DESC) AS rn, "+
    "COUNT(*) OVER (PARTITION BY lower(trim(email))) AS request_count FROM cleaning_requests) "+
    "SELECT email_key,contact_name,phone,id,service,status,updated_at,request_count FROM ranked "+
    "WHERE rn=1 AND (?='' OR instr(lower(contact_name),?)>0 OR instr(email_key,?)>0) ORDER BY updated_at DESC,id DESC LIMIT 101";
  const rows=(await db.prepare(sql).bind(search,search,search).all<Row>()).results||[];
  const selected=rows.slice(0,100);
  const keys=await Promise.all(selected.map(r=>hashEmail(String(r.email_key))));
  const metas=keys.length?(await db.prepare('SELECT contact_key,stage,tags_json,version FROM crm_contact_state WHERE contact_key IN ('+
    keys.map(()=>'?').join(',')+')').bind(...keys).all<Row>()).results||[]:[];
  const byKey=new Map(metas.map(m=>[String(m.contact_key),m]));
  const contacts: Contact[]=selected.map((r,i)=>{
    const m=byKey.get(keys[i]);
    return {id:keys[i],email:String(r.email_key),name:String(r.contact_name),phone:String(r.phone),
      lastAt:String(r.updated_at),lastRequestId:String(r.id),latestService:String(r.service),
      latestRequestStatus:String(r.status),requestCount:Number(r.request_count),
      stage:m?stage(m.stage):'new',tags:m?decodeTags(m.tags_json):[],version:m?Number(m.version):0};
  });
  return response({contacts,limited:rows.length>100});
}
async function notes(db:D1Database,contactKey:string):Promise<Response> {
  const entries=(await db.prepare('SELECT id,body,created_at,actor_id FROM crm_contact_notes WHERE contact_key=? ORDER BY created_at DESC,id DESC LIMIT 41')
    .bind(contactKey).all<Row>()).results||[];
  return response({notes:entries.slice(0,40).map(r=>({id:String(r.id),body:String(r.body),
    createdAt:String(r.created_at),actorId:String(r.actor_id)})),limited:entries.length>40});
}
async function putState(db:D1Database,s:PortalSession,contactKey:string,body:Row):Promise<Response> {
  fields(body,['email','version','stage','tags']);
  const contactEmail=email(body.email),expected=version(body.version),nextStage=stage(body.stage),nextTags=tags(body.tags);
  await requireLead(db,contactKey,contactEmail);
  const g=adminWhere(s),now=new Date().toISOString(),mutation=crypto.randomUUID(),updatedBy=s.user!.id;
  let statement;
  if(expected===0) {
    statement=db.prepare("INSERT INTO crm_contact_state (contact_key,stage,tags_json,version,updated_by,updated_at,last_mutation) "+
      "SELECT ?,?,?,1,?,?,? WHERE EXISTS (SELECT 1 FROM cleaning_requests WHERE lower(trim(email))=?) "+
      (g.sql?"AND EXISTS (SELECT 1 FROM profiles WHERE id=? AND lower(trim(email))=? AND role='admin' AND status='approved') ":"")+
      "ON CONFLICT(contact_key) DO NOTHING")
      .bind(contactKey,nextStage,JSON.stringify(nextTags),updatedBy,now,mutation,contactEmail,...g.bindings);
  } else {
    statement=db.prepare("UPDATE crm_contact_state SET stage=?,tags_json=?,version=version+1,updated_by=?,updated_at=?,last_mutation=? "+
      "WHERE contact_key=? AND version=?"+g.sql)
      .bind(nextStage,JSON.stringify(nextTags),updatedBy,now,mutation,contactKey,expected,...g.bindings);
  }
  const audit=db.prepare("INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) "+
    "SELECT ?,?,'crm.contact.updated',contact_key,? FROM crm_contact_state WHERE contact_key=? AND last_mutation=?")
    .bind(crypto.randomUUID(),updatedBy,now,contactKey,mutation);
  const result=await db.batch([statement,audit]);
  if(result[0]?.meta?.changes!==1||result[1]?.meta?.changes!==1)
    fail(409,'conflict','Der Kontakt wurde geändert. Bitte aktualisieren.');
  return response({contact:{id:contactKey,email:contactEmail,stage:nextStage,tags:nextTags,version:expected+1}});
}
async function addNote(db:D1Database,s:PortalSession,contactKey:string,body:Row):Promise<Response> {
  fields(body,['email','body','idempotencyKey']);
  const contactEmail=email(body.email),noteText=text(body.body,1000),idem=body.idempotencyKey;
  if(typeof idem!=='string'|| !/^[a-zA-Z0-9_-]{16,100}$/.test(idem)) fail(422,'idempotency');
  await requireLead(db,contactKey,contactEmail);
  const actor=s.user!.id;
  const prev=await db.prepare('SELECT id,body,created_at FROM crm_contact_notes WHERE contact_key=? AND actor_id=? AND idempotency_key=?')
    .bind(contactKey,actor,idem).first<Row>();
  if(prev) {
    if(prev.body!==noteText) fail(409,'idempotency_conflict');
    return response({note:{id:String(prev.id),body:noteText,createdAt:String(prev.created_at),actorId:actor}});
  }
  const g=adminWhere(s),noteId=crypto.randomUUID(),now=new Date().toISOString();
  const insert=db.prepare("INSERT INTO crm_contact_notes (id,contact_key,body,actor_id,idempotency_key,created_at) "+
    "SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM cleaning_requests WHERE lower(trim(email))=?) "+
    (g.sql?"AND EXISTS (SELECT 1 FROM profiles WHERE id=? AND lower(trim(email))=? AND role='admin' AND status='approved') ":"")+
    "ON CONFLICT(contact_key,actor_id,idempotency_key) DO NOTHING")
    .bind(noteId,contactKey,noteText,actor,idem,now,contactEmail,...g.bindings);
  const audit=db.prepare("INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) "+
    "SELECT ?,?,'crm.note.created',contact_key,? FROM crm_contact_notes WHERE id=? AND actor_id=?")
    .bind(crypto.randomUUID(),actor,now,noteId,actor);
  const results=await db.batch([insert,audit]);
  if(results[0]?.meta?.changes===1&&results[1]?.meta?.changes===1)
    return response({note:{id:noteId,body:noteText,createdAt:now,actorId:actor}},201);
  const replay=await db.prepare('SELECT id,body,created_at FROM crm_contact_notes WHERE contact_key=? AND actor_id=? AND idempotency_key=?')
    .bind(contactKey,actor,idem).first<Row>();
  if(replay?.body===noteText)
    return response({note:{id:String(replay.id),body:noteText,createdAt:String(replay.created_at),actorId:actor}});
  fail(409,'conflict','Notiz konnte nicht gespeichert werden. Bitte aktualisieren.');
}
export async function handleCrmApi(request:Request,env:WorkerEnv,s:PortalSession,
  deps:{readBody:(r:Request)=>Promise<Row>;rateLimit:(key:string,limit:number)=>Promise<void>}):Promise<Response> {
  try {
    requireStaff(s);
    const db=dbFor(env);
    await approved(db,s);
    await deps.rateLimit('crm:'+s.user!.id+':'+(request.method==='GET'?'read':'write'),
      request.method==='GET'?500:120);
    const path=new URL(request.url).pathname.replace(/\/$/,'');
    if(path==='/api/crm/bridge-status'&&request.method==='GET'){
      if(s.role!=='owner')fail(403,'forbidden');
      return bridgeStatus(db);
    }
    if(path==='/api/crm/contacts'&&request.method==='GET')return await listContacts(request,db);
    const match=/^\/api\/crm\/contacts\/([a-f0-9]{64})(?:\/(notes))?$/.exec(path);
    if(!match)return response({error:{code:'not_found'}},404);
    const contactKey=key(match[1]);
    if(match[2]==='notes'&&request.method==='GET')return await notes(db,contactKey);
    if(match[2]==='notes'&&request.method==='POST')return await addNote(db,s,contactKey,await deps.readBody(request));
    if(!match[2]&&request.method==='PUT')return await putState(db,s,contactKey,await deps.readBody(request));
    return response({error:{code:'method_not_allowed'}},405);
  } catch(e) {
    if(e instanceof CrmFault)return response({error:{code:e.code,message:e.message}},e.status);
    // Reuse the portal's JSON/CSRF reader without swallowing its known, safe API faults.
    if(e instanceof Error) {
      const fault=e as Error & {status?:unknown;code?:unknown};
      if(typeof fault.status==='number' && [400,403,413,415,422,429].includes(fault.status)
         && typeof fault.code==='string'
         && ['origin','content_type','body_size','json','rate_limit'].includes(fault.code)) {
        return response({error:{code:fault.code,message:'Die Anfrage konnte nicht verarbeitet werden.'}},fault.status);
      }
    }
    return response({error:{code:'unavailable',message:'Das CRM ist zurzeit nicht verfügbar.'}},503);
  }
}
