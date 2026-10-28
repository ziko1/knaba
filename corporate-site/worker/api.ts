import type { ApprovedRole, ChecklistItem, CleaningRequest, PortalDashboard, PortalProfile, PortalRole, PortalSession, RequestStatus } from '../src/lib/portal-contract';
import { approvedRoles, checklistItems, requestStatuses } from '../src/lib/portal-contract';
import { validateInquiry, type InquiryData } from '../src/lib/inquiry';
import type { D1Database, D1Statement, WorkerEnv, WorkerContext } from './types';
import { handleAssistant } from './assistant';
import { handleStudio, StudioFault } from './studio';
import { handleCrmApi } from './crm';
import { handleReviews, ReviewFault } from './reviews';

type Row = Record<string, unknown>;
const PRIVACY_VERSION = '2026-10-24';
const MAX_BODY = 12_288;
const MAX_ROWS = 200;
class ApiFault extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: Record<string,string>) { super(message); }
}
const fail = (status: number,code: string,message: string): never => { throw new ApiFault(status,code,message); };
const response = (body: unknown,status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
const iso = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const str = (value: unknown) => typeof value === 'string' ? value : '';
const normalizeEmail = (value: string) => value.trim().toLowerCase();
function textField(value: unknown,label: string,max: number,required=false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (required && !value.trim())) fail(422,'validation',`${label} ist ungültig.`);
  return (value as string).trim();
}
function allowedKeys(body: Row, keys: string[]) {
  if (Object.keys(body).some(k => !keys.includes(k))) fail(422,'unknown_field','Die Anfrage enthält ein nicht erlaubtes Feld.');
}
function dbFor(env: WorkerEnv): D1Database { if (!env.DB) fail(503,'unavailable','Der Dienst ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.'); return env.DB!; }
async function sha(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function profile(row: Row): PortalProfile {
  const role=approvedRoles.includes(row.role as ApprovedRole)?row.role as ApprovedRole:null;
  const status=['pending','approved','suspended'].includes(str(row.status))?row.status as PortalProfile['status']:'suspended';
  return {id:str(row.id),name:str(row.name),email:str(row.email),requestedRole:row.requested_role==='worker'?'worker':row.requested_role==='partner'?'partner':'client',role,status,createdAt:str(row.created_at),updatedAt:str(row.updated_at),version:Number(row.version)};
}
function requestView(row: Row,role: PortalRole): CleaningRequest {
  const result: CleaningRequest = {id:str(row.id),clientId:row.client_id as string|null,service:str(row.service),objectType:str(row.object_type),postcode:str(row.postcode),area:str(row.area),frequency:str(row.frequency),message:str(row.message),contactName:str(row.contact_name),address:str(row.address),status:row.status as RequestStatus,assignedWorkerId:row.assigned_worker_id as string|null,scheduledAt:row.scheduled_at as string|null,checklist:JSON.parse(str(row.checklist)||'[]') as ChecklistItem[],customerFeedback:str(row.customer_feedback),adminReply:str(row.admin_reply),createdAt:str(row.created_at),updatedAt:str(row.updated_at),version:Number(row.version)};
  if (role === 'owner' || role === 'admin' || role === 'client' || role === 'partner') { result.email=str(row.email); result.phone=str(row.phone); }
  if (role !== 'client' && role !== 'partner') result.workerNote=str(row.worker_note);
  if (role === 'worker') { result.customerFeedback=''; result.adminReply=''; result.clientId=null; }
  return result;
}
async function session(request: Request,env: WorkerEnv): Promise<PortalSession> {
  const userId=request.headers.get('oai-authenticated-user-id');
  const email=request.headers.get('oai-authenticated-user-email');
  if (!userId || !email) return {user:null,profile:null,role:'anonymous'};
  if (userId.length>200 || email.length>320) fail(401,'unauthenticated','Bitte melden Sie sich erneut an.');
  let name=email;
  if (request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8') {
    try { name=decodeURIComponent(request.headers.get('oai-authenticated-user-full-name')||email); } catch { name=email; }
  }
  const row=await dbFor(env).prepare('SELECT * FROM profiles WHERE id=?').bind(userId).first<Row>();
  const p=row?profile(row):null;
  const owner=(Boolean(env.OWNER_EMAIL?.trim()) && normalizeEmail(email)===normalizeEmail(env.OWNER_EMAIL!)) ||
    (Boolean(env.DELEGATED_OWNER_ID) && env.DELEGATED_OWNER_ID===userId &&
      Boolean(env.DEVELOPER_EMAIL) && normalizeEmail(email)===normalizeEmail(env.DEVELOPER_EMAIL!));
  // An identity email change never transfers a previously approved profile.
  const identityChanged=Boolean(p && normalizeEmail(p.email)!==normalizeEmail(email));
  const corruptMembership=Boolean(row && (!['pending','approved','suspended'].includes(str(row.status)) || (row.role!==null&&!approvedRoles.includes(row.role as ApprovedRole)) || (row.status==='approved'&&!approvedRoles.includes(row.role as ApprovedRole))));
  const role: PortalRole=owner?'owner':identityChanged||corruptMembership?'suspended':p?.status==='approved' && p.role?p.role:p?.status==='suspended'?'suspended':'pending';
  return {user:{id:userId,email,name:name.slice(0,160)},profile:p,role};
}
function signed(s: PortalSession) { if (!s.user) fail(401,'unauthenticated','Bitte melden Sie sich an.'); return s.user!; }
function requireRole(s: PortalSession,roles: PortalRole[]) { signed(s); if (!roles.includes(s.role)) fail(403,'forbidden','Für diese Aktion fehlt die Freigabe.'); }
function mutationGuard(request: Request) {
  const origin=request.headers.get('origin');
  if (!origin || origin!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site' || request.headers.get('x-knaba-request')!=='portal-v1') fail(403,'origin','Diese Anfrage ist nicht erlaubt. Bitte laden Sie die Seite erneut.');
  if (!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) fail(415,'content_type','Bitte senden Sie JSON-Daten.');
}
async function readBody(request: Request,maxBytes=MAX_BODY): Promise<Row> {
  mutationGuard(request);
  if (Number(request.headers.get('content-length')||0)>maxBytes) fail(413,'body_size','Die Anfrage ist zu groß.');
  if (!request.body) fail(400,'json','Die Anfrage enthält keine Daten.');
  const reader=request.body!.getReader(); let size=0; const chunks: Uint8Array[]=[];
  try { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>maxBytes) { await reader.cancel(); fail(413,'body_size','Die Anfrage ist zu groß.'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  let body: unknown; try {body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch { fail(400,'json','Die Anfrage enthält ungültige Daten.'); }
  if (!body || typeof body!=='object' || Array.isArray(body)) fail(400,'json','Die Anfrage enthält ungültige Daten.');
  return body as Row;
}
async function rateLimit(db: D1Database,key: string,limit: number,seconds=3600) {
  const now=Math.floor(Date.now()/1000), bucket=Math.floor(now/seconds), rateKey=`${key}:${bucket}`;
  const row=await db.prepare('INSERT INTO portal_rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(rateKey,(bucket+1)*seconds,limit).first<Row>();
  if (!row) fail(429,'rate_limit','Zu viele Anfragen. Bitte versuchen Sie es später erneut oder rufen Sie uns an.');
  await db.prepare('DELETE FROM portal_rate_limits WHERE expires_at < ?').bind(now-3600).run();
}
function auditStatement(db: D1Database,actorId: string,action: string,entityId: string,mutation: string,table: 'profiles'|'cleaning_requests',time: string): D1Statement {
  return db.prepare(`INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id=? AND last_mutation=?)`).bind(id(),actorId,action,entityId,time,entityId,mutation);
}
function privacy(body: Row) { if(body.privacyAccepted!==true) fail(422,'privacy','Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.'); }
function validVersion(value: unknown): number { if(!Number.isSafeInteger(value)||Number(value)<1) fail(422,'version','Bitte laden Sie den aktuellen Datensatz erneut.');return Number(value); }
function idempotency(body: Row): string { const key=str(body.idempotencyKey);if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))fail(422,'idempotency','Die Anfragekennung ist ungültig. Bitte laden Sie die Seite erneut.');return key; }
function allowedStatus(from: RequestStatus,to: RequestStatus): boolean {
  const transitions: Record<RequestStatus,RequestStatus[]>={new:['reviewing','cancelled'],reviewing:['scheduled','cancelled'],scheduled:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:[],cancelled:[]};
  return from===to || transitions[from]?.includes(to);
}
async function register(request: Request,env: WorkerEnv,s: PortalSession) {
  const user=signed(s), db=dbFor(env),body=await readBody(request);
  allowedKeys(body,['name','requestedRole','privacyAccepted']);privacy(body);
  const name=textField(body.name,'Name',80,true);
  if(!['client','worker','partner'].includes(String(body.requestedRole))) fail(422,'validation','Bitte wählen Sie Kunde, Partner oder Mitarbeitende.');
  if(s.profile) return response({profile:s.profile});
  await rateLimit(db,`register:${await sha(user.id)}`,10);
  const time=iso(),mutation=id();
  await db.batch([
    db.prepare('INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,NULL,?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING').bind(user.id,name,normalizeEmail(user.email),body.requestedRole,'pending',PRIVACY_VERSION,time,time,mutation),
    auditStatement(db,user.id,'profile.registered',user.id,mutation,'profiles',time),
  ]);
  const p=await db.prepare('SELECT * FROM profiles WHERE id=?').bind(user.id).first<Row>();
  return response({profile:profile(p!)},201);
}
async function dashboard(env: WorkerEnv,s: PortalSession) {
  signed(s);const db=dbFor(env);
  const data: PortalDashboard={session:s,requests:[],profiles:[],audit:[],limited:false};
  // Partner is a distinct approved identity without cross-client/ERP read permissions.
  if(['pending','suspended'].includes(s.role)) return response(data);
  requireRole(s,['client','partner','worker','admin','owner']);
  const filters=(s.role==='client'||s.role==='partner')?' WHERE client_id=?':s.role==='worker'?" WHERE assigned_worker_id=? AND status IN ('scheduled','in_progress','completed')":'';
  const bind=filters?[s.user!.id]:[];
  const rows=(await db.prepare(`SELECT * FROM cleaning_requests${filters} ORDER BY updated_at DESC,id DESC LIMIT ?`).bind(...bind,MAX_ROWS+1).all<Row>()).results||[];
  data.limited=rows.length>MAX_ROWS;data.requests=rows.slice(0,MAX_ROWS).map(row=>requestView(row,s.role));
  if(s.role==='owner') {
    const profiles=(await db.prepare('SELECT * FROM profiles ORDER BY created_at DESC,id LIMIT ?').bind(MAX_ROWS+1).all<Row>()).results||[];
    data.limited ||= profiles.length>MAX_ROWS;data.profiles=profiles.slice(0,MAX_ROWS).map(profile);
    data.audit=((await db.prepare('SELECT id,actor_id,action,entity_id,created_at FROM portal_audit ORDER BY created_at DESC,id DESC LIMIT 100').all<Row>()).results||[]).map(r=>({id:str(r.id),actorId:str(r.actor_id),action:str(r.action),entityId:str(r.entity_id),createdAt:str(r.created_at)}));
  } else if(s.role==='admin') {
    // Only the assignment directory is visible to admins, not pending accounts.
    data.profiles=((await db.prepare("SELECT * FROM profiles WHERE role='worker' AND status='approved' ORDER BY name LIMIT ?").bind(MAX_ROWS).all<Row>()).results||[]).map(r=>({...profile(r),email:''}));
  }
  return response(data);
}
function cleanInput(body: Row,s: PortalSession|null): InquiryData {
  const data: InquiryData={service:str(body.service),objectType:str(body.objectType),postcode:str(body.postcode),area:str(body.area),frequency:str(body.frequency),message:str(body.message),name:s?.profile?.name||str(body.name),email:s?.user?.email||str(body.email),phone:s?'':str(body.phone)};
  for(const key of ['service','objectType','postcode','area','frequency','message']) if(typeof body[key]!=='string') fail(422,'validation','Bitte füllen Sie alle Pflichtfelder aus.');
  const errors=validateInquiry(data);if(Object.keys(errors).length)throw new ApiFault(422,'validation','Bitte prüfen Sie Ihre Angaben.',errors as Record<string,string>);
  return {...data,name:data.name.trim(),email:normalizeEmail(data.email),postcode:data.postcode.trim(),message:data.message.trim(),phone:data.phone.trim()};
}
async function createRequest(request: Request,env: WorkerEnv,s: PortalSession|null) {
  const db=dbFor(env);if(s)requireRole(s,['client','partner']);const body=await readBody(request);
  allowedKeys(body,['service','objectType','postcode','area','frequency','message','address','idempotencyKey','privacyAccepted',...(s?[]:['name','email','phone','website'])]);
  privacy(body);
  if(!s&&str(body.website).trim()) fail(422,'validation','Die Anfrage konnte nicht verarbeitet werden. Bitte kontaktieren Sie uns telefonisch.');
  const data=cleanInput(body,s);const address=body.address===undefined?'':textField(body.address,'Objektadresse',200);
  const key=idempotency(body);
  const scope=s?`client:${s.user!.id}`:`lead:${await sha(data.email)}`;
  const payloadHash=await sha(JSON.stringify({...data,address}));
  const existing=await db.prepare('SELECT * FROM cleaning_requests WHERE dedupe_scope=? AND idempotency_key=?').bind(scope,key).first<Row>();
  if(existing){if(existing.payload_hash!==payloadHash)fail(409,'idempotency_conflict','Diese Anfragekennung wurde bereits für andere Angaben verwendet.');return s?response({request:requestView(existing,s.role)}):response({id:existing.id,received:true});}
  if(s)await rateLimit(db,`request:${await sha(s.user!.id)}`,20);
  else {
    // Sites guarantees identity headers, but an IP header is optional. Never
    // collapse visitors without one into a shared five-request global bucket.
    const day=new Date().toISOString().slice(0,10);
    await rateLimit(db,`lead-email:${await sha(data.email+day)}`,5);
    const ip=request.headers.get('cf-connecting-ip')?.trim();
    if(ip)await rateLimit(db,`lead-ip:${await sha(ip+day)}`,20);
  }
  const requestId=id(),time=iso(),mutation=id();
  const values=[requestId,s?.user!.id||null,data.service,data.objectType,data.postcode,data.area,data.frequency,data.message,data.name,data.email,data.phone,address,scope,key,payloadHash,PRIVACY_VERSION,time,time,mutation];
  const guard=s?" WHERE EXISTS (SELECT 1 FROM profiles WHERE id=? AND role=? AND status='approved')":'';
  const insert=db.prepare(`INSERT INTO cleaning_requests (id,client_id,service,object_type,postcode,area,frequency,message,contact_name,email,phone,address,status,assigned_worker_id,scheduled_at,checklist,worker_note,customer_feedback,admin_reply,dedupe_scope,idempotency_key,payload_hash,privacy_version,created_at,updated_at,version,last_mutation) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'new',NULL,NULL,'[]','','','',?,?,?,?,?,?,1,?${guard} ON CONFLICT(dedupe_scope,idempotency_key) DO NOTHING`).bind(...values,...(s?[s.user!.id,s.role]:[]));
  await db.batch([insert,auditStatement(db,s?.user!.id||'public','request.created',requestId,mutation,'cleaning_requests',time)]);
  const result=await db.prepare('SELECT * FROM cleaning_requests WHERE dedupe_scope=? AND idempotency_key=?').bind(scope,key).first<Row>();
  if(!result)fail(403,'forbidden','Die Freigabe wurde geändert. Bitte laden Sie die Seite erneut.');
  if(result!.payload_hash!==payloadHash)fail(409,'idempotency_conflict','Die Anfragekennung ist bereits belegt.');
  return s?response({request:requestView(result!,s.role)},201):response({id:result!.id,received:true},201);
}
async function setRole(request: Request,env: WorkerEnv,s: PortalSession) {
  requireRole(s,['owner']);const db=dbFor(env),body=await readBody(request);
  allowedKeys(body,['userId','role','status','version']);const version=validVersion(body.version),targetId=textField(body.userId,'Benutzerkennung',200,true);
  if(body.status!=='approved'&&body.status!=='suspended')fail(422,'validation','Der Freigabestatus ist ungültig.');
  if(body.role!==null&&!approvedRoles.includes(body.role as ApprovedRole))fail(422,'validation','Diese Rolle ist nicht erlaubt.');
  if(body.status==='approved'&&body.role===null)fail(422,'validation','Bitte wählen Sie eine Rolle.');
  const target=await db.prepare('SELECT * FROM profiles WHERE id=?').bind(targetId).first<Row>();
  if(!target)fail(404,'not_found','Der Datensatz wurde nicht gefunden.');
  if(targetId===s.user!.id||normalizeEmail(str(target!.email))===normalizeEmail(env.OWNER_EMAIL||'')||
    (Boolean(env.DEVELOPER_EMAIL)&&normalizeEmail(str(target!.email))===normalizeEmail(env.DEVELOPER_EMAIL!)))
    fail(403,'owner_protected','Geschützte Verwaltungsidentitäten können hier nicht geändert werden.');
  const time=iso(),mutation=id();
  const results=await db.batch([
    db.prepare('UPDATE profiles SET role=?,status=?,updated_at=?,version=version+1,last_mutation=? WHERE id=? AND version=?').bind(body.role,body.status,time,mutation,targetId,version),
    auditStatement(db,s.user!.id,body.status==='suspended'?'role.suspended':`role.approved.${body.role}`,targetId,mutation,'profiles',time),
  ]);
  if(!results[0]?.meta?.changes)fail(409,'conflict','Der Datensatz wurde inzwischen geändert. Bitte aktualisieren Sie die Ansicht.');
  return response({profile:profile((await db.prepare('SELECT * FROM profiles WHERE id=?').bind(targetId).first<Row>())!)});
}
async function patchRequest(request: Request,env: WorkerEnv,s: PortalSession,requestId: string) {
  requireRole(s,['client','partner','worker','admin','owner']);const db=dbFor(env),body=await readBody(request),version=validVersion(body.version);
  const permissions=(s.role==='client'||s.role==='partner')?['status','customerFeedback']:s.role==='worker'?['status','checklist','workerNote']:['status','assignedWorkerId','scheduledAt','adminReply'];
  allowedKeys(body,['version',...permissions]);
  if(Object.keys(body).length<2)fail(422,'validation','Bitte wählen Sie eine Änderung.');
  const row=await db.prepare('SELECT * FROM cleaning_requests WHERE id=?').bind(requestId).first<Row>();
  if(!row||((s.role==='client'||s.role==='partner')&&row.client_id!==s.user!.id)||(s.role==='worker'&&row.assigned_worker_id!==s.user!.id))fail(404,'not_found','Der Auftrag wurde nicht gefunden.');
  const current=row!;const from=current.status as RequestStatus;
  if(s.role==='worker'&&!['scheduled','in_progress'].includes(from))fail(409,'state','Dieser Auftrag kann nicht mehr bearbeitet werden.');
  const next={status:from,assignedWorkerId:current.assigned_worker_id,scheduledAt:current.scheduled_at,checklist:str(current.checklist),workerNote:str(current.worker_note),customerFeedback:str(current.customer_feedback),adminReply:str(current.admin_reply)};
  if(body.status!==undefined){
    if(!requestStatuses.includes(body.status as RequestStatus))fail(422,'validation','Der Status ist ungültig.');
    const to=body.status as RequestStatus;
    if((s.role==='client'||s.role==='partner')&&(to!=='cancelled'||!['new','reviewing'].includes(from)))fail(403,'forbidden','Eine Absage ist hier nur vor der Einsatzplanung möglich. Bitte kontaktieren Sie uns.');
    if(s.role==='worker'&&!((from==='scheduled'&&to==='in_progress')||(from==='in_progress'&&to==='completed')||from===to))fail(403,'forbidden','Dieser Statuswechsel ist nicht erlaubt.');
    if(!allowedStatus(from,to))fail(409,'state','Dieser Statuswechsel ist nicht möglich.');
    next.status=to;
  }
  if(body.customerFeedback!==undefined){if(from!=='completed')fail(409,'state','Rückmeldungen sind nach Abschluss des Auftrags möglich.');next.customerFeedback=textField(body.customerFeedback,'Rückmeldung',1000,true);}
  if(body.workerNote!==undefined)next.workerNote=textField(body.workerNote,'Einsatznotiz',1000);
  if(body.adminReply!==undefined)next.adminReply=textField(body.adminReply,'Antwort',1000);
  if(body.checklist!==undefined){if(!Array.isArray(body.checklist)||body.checklist.some(v=>!checklistItems.includes(v as ChecklistItem))||new Set(body.checklist).size!==body.checklist.length)fail(422,'validation','Die Checkliste ist ungültig.');next.checklist=JSON.stringify(body.checklist);}
  if(s.role==='worker'&&next.status==='completed'&&JSON.parse(next.checklist).length!==checklistItems.length)fail(422,'checklist','Bitte schließen Sie vor dem Abschluss alle vier Prüfpunkte ab.');
  if(body.assignedWorkerId!==undefined){
    if(['completed','cancelled'].includes(from))fail(409,'state','Abgeschlossene Aufträge können nicht neu zugeteilt werden.');
    if(body.assignedWorkerId!==null){
      const workerId=textField(body.assignedWorkerId,'Mitarbeiterkennung',200,true);
      const worker=await db.prepare("SELECT id FROM profiles WHERE id=? AND role='worker' AND status='approved'").bind(workerId).first<Row>();
      if(!worker)fail(422,'worker','Bitte wählen Sie eine freigegebene Arbeitskraft.');
      next.assignedWorkerId=workerId;
    } else next.assignedWorkerId=null;
  }
  if(body.scheduledAt!==undefined){
    if(['completed','cancelled'].includes(from))fail(409,'state','Abgeschlossene Aufträge können nicht neu terminiert werden.');
    if(body.scheduledAt===null)next.scheduledAt=null;
    else {const value=str(body.scheduledAt);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail(422,'date','Bitte geben Sie einen gültigen Termin mit Zeitzone an.');next.scheduledAt=new Date(value).toISOString();}
  }
  if(next.assignedWorkerId!==current.assigned_worker_id){
    if(['completed','cancelled'].includes(next.status))fail(409,'assignment','Ein Auftrag kann nicht gleichzeitig abgeschlossen und neu zugeteilt werden.');
    next.checklist='[]';next.workerNote='';
  }
  const needsActiveWorker=['scheduled','in_progress'].includes(next.status);
  if(needsActiveWorker){
    if(!next.assignedWorkerId||!next.scheduledAt)fail(422,'schedule','Für geplante Einsätze sind ein Termin und eine freigegebene Arbeitskraft nötig.');
    const activeWorker=await db.prepare("SELECT id FROM profiles WHERE id=? AND role='worker' AND status='approved'").bind(next.assignedWorkerId).first<Row>();
    if(!activeWorker)fail(422,'worker','Die zugeteilte Arbeitskraft ist nicht mehr freigegeben. Bitte teilen Sie den Auftrag neu zu.');
  }
  if((s.role==='admin'||s.role==='owner')&&next.status==='completed'&&JSON.parse(next.checklist).length!==checklistItems.length)fail(422,'checklist','Vor dem Abschluss muss die Arbeitskraft die vier Prüfpunkte abschließen.');
  const time=iso(),mutation=id();
  const roleGuard=s.role==='owner'?'':" AND EXISTS (SELECT 1 FROM profiles WHERE id=? AND role=? AND status='approved')";
  const scopeGuard=(s.role==='client'||s.role==='partner')?' AND client_id=?':s.role==='worker'?' AND assigned_worker_id=?':'';
  const workerGuard=needsActiveWorker?" AND EXISTS (SELECT 1 FROM profiles WHERE id=? AND role='worker' AND status='approved')":'';
  const bindings=[next.status,next.assignedWorkerId,next.scheduledAt,next.checklist,next.workerNote,next.customerFeedback,next.adminReply,time,mutation,requestId,version,...(s.role==='owner'?[]:[s.user!.id,s.role]),...(scopeGuard?[s.user!.id]:[]),...(needsActiveWorker?[next.assignedWorkerId]:[])];
  const result=await db.batch([
    db.prepare(`UPDATE cleaning_requests SET status=?,assigned_worker_id=?,scheduled_at=?,checklist=?,worker_note=?,customer_feedback=?,admin_reply=?,updated_at=?,version=version+1,last_mutation=? WHERE id=? AND version=?${roleGuard}${scopeGuard}${workerGuard}`).bind(...bindings),
    auditStatement(db,s.user!.id,'request.updated',requestId,mutation,'cleaning_requests',time),
  ]);
  if(!result[0]?.meta?.changes)fail(409,'conflict','Der Auftrag oder Ihre Freigabe wurde inzwischen geändert. Bitte aktualisieren Sie die Ansicht.');
  return response({request:requestView((await db.prepare('SELECT * FROM cleaning_requests WHERE id=?').bind(requestId).first<Row>())!,s.role)});
}
export async function handleApi(request: Request,env: WorkerEnv,ctx?:WorkerContext): Promise<Response> {
  try {
    const path=new URL(request.url).pathname.replace(/\/$/,'');
    if(path==='/api/portal/health'&&request.method==='GET'){
      if(!env.OWNER_EMAIL?.trim())fail(503,'unavailable','Der Dienst wird eingerichtet.');
      await dbFor(env).prepare('SELECT id FROM profiles LIMIT 1').first();return response({ready:true});
    }
    if(path==='/api/leads'&&request.method==='POST')return await createRequest(request,env,null);
    if(path==='/api/reviews'||path==='/api/reviews/captcha')return await handleReviews(request,env,{owner:false,id:null});
    if(path==='/api/studio/published' && request.method==='GET') return await handleStudio(request,env,{owner:false,id:null},req=>readBody(req,32768));
    const s=await session(request,env);
    if(path.startsWith('/api/reviews/'))return await handleReviews(request,env,{owner:s.role==='owner',id:s.user?.id||null});
    if(path.startsWith('/api/crm/'))return await handleCrmApi(request,env,s,{readBody,rateLimit:(key,limit)=>rateLimit(dbFor(env),key,limit)});
    if(path.startsWith('/api/studio/'))return await handleStudio(request,env,{owner:s.role==='owner',id:s.user?.id||null},req=>readBody(req,32768));
    if(path.startsWith('/api/assistant/'))return await handleAssistant(request,env,{isOwner:s.role==='owner',id:s.user?.id??null},ctx);
    if(path==='/api/portal/session'&&request.method==='GET')return response(s);
    if(path==='/api/portal/register'&&request.method==='POST')return await register(request,env,s);
    if(path==='/api/portal/dashboard'&&request.method==='GET')return await dashboard(env,s);
    if(path==='/api/portal/requests'&&request.method==='POST')return await createRequest(request,env,s);
    if(path==='/api/portal/roles'&&request.method==='POST')return await setRole(request,env,s);
    const match=path.match(/^\/api\/portal\/requests\/([a-zA-Z0-9_-]{1,100})$/);
    if(match&&request.method==='PATCH')return await patchRequest(request,env,s,match[1]);
    return response({error:{code:'not_found',message:'Dieser Endpunkt ist nicht verfügbar.'}},404);
  } catch(error) {
    if(error instanceof ReviewFault)return response({error:{code:error.code,message:error.message}},error.status);
    if(error instanceof StudioFault)return response({error:{code:error.code,message:error.message}},error.status);
    if(error instanceof ApiFault)return response({error:{code:error.code,message:error.message,...(error.fields?{fields:error.fields}:{})}},error.status);
    // Never expose database errors, identities, SQL or raw payloads in responses/logs.
    return response({error:{code:'unavailable',message:'Der Dienst ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.'}},503);
  }
}
