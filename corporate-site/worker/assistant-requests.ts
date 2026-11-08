import type {D1Database,D1Statement} from './types';
import {requestStatuses} from '../src/lib/portal-contract';
import type {AssistantRequestSummary,AssistantRequestPage,AssistantTransferStatus} from '../src/lib/assistant-request-contract';

type Row=Record<string,unknown>;
export class AssistantRequestFault extends Error {
  constructor(readonly status:number,readonly code:string,message:string){super(message);}
}
function fail(status:number,code:string,message:string):never{throw new AssistantRequestFault(status,code,message);}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** Only constructed by the existing server-side conversation capability/owner guard. */
export interface AssistantRequestAuthority {
  readonly db:D1Database;readonly id:string;
  assert(writable?:boolean):Promise<Row>;
  fence(writable?:boolean):{sql:string;values:unknown[]};
}
export const ASSISTANT_REQUEST_CONSENT_VERSION='assistant-request-v1/2026-11-08';
// This list describes the existing ERP envelope, not the local enquiry message.
export const ASSISTANT_REQUEST_TRANSFER_FIELDS=Object.freeze([
  'contact.name','contact.email','contact.phone','serviceIds','language',
  'facts.propertyType','facts.area','facts.address','facts.recurring',
]);
const transferStatuses=new Set<AssistantTransferStatus>(['PENDING','LEASED','APPLIED','REVIEW','BLOCKED','UNKNOWN','NOT_QUEUED']);
const summary=(row:Row):AssistantRequestSummary=>{
  if(!uuid(row.id)||!requestStatuses.includes(row.status as never)||!Number.isSafeInteger(row.version)||Number(row.version)<1||typeof row.created_at!=='string')
    fail(503,'unavailable','Der Anfragestatus ist derzeit nicht verfügbar.');
  const status=row.transfer_status==null?'NOT_QUEUED':row.transfer_status;
  if(!transferStatuses.has(status as AssistantTransferStatus))fail(503,'unavailable','Der Übertragungsstatus ist derzeit nicht verfügbar.');
  return {id:row.id,status:row.status as AssistantRequestSummary['status'],version:Number(row.version),createdAt:row.created_at,
    erpTransfer:{status:status as AssistantTransferStatus}};
};
const columns='r.id,r.status,r.version,r.created_at,o.status AS transfer_status';
const joins='assistant_request_links l JOIN cleaning_requests r ON r.id=l.request_id LEFT JOIN site_erp_outbox o ON o.request_id=r.id';
type Cursor={at:string;id:string};
function encodeCursor(cursor:Cursor){return btoa(JSON.stringify(cursor)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decodeCursor(value:string|null):Cursor|null {
  if(value===null)return null;
  try{
    if(value.length>256||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error();
    const cursor=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/'))) as Cursor;
    if(!cursor||Array.isArray(cursor)||Object.keys(cursor).sort().join(',')!=='at,id'||!uuid(cursor.id)||
      typeof cursor.at!=='string'||!Number.isFinite(Date.parse(cursor.at))||new Date(cursor.at).toISOString()!==cursor.at||encodeCursor(cursor)!==value)throw new Error();
    return cursor;
  }catch{fail(422,'cursor','Bitte laden Sie die Anfragen erneut.');}
}
export async function assistantRequestPage(authority:AssistantRequestAuthority,cursorValue:string|null=null):Promise<{requests:AssistantRequestSummary[];requestPage:AssistantRequestPage}> {
  await authority.assert();
  const cursor=decodeCursor(cursorValue),fence=authority.fence();
  const where=`l.conversation_id=? AND r.client_id IS NULL AND ${fence.sql}`,values=[authority.id,...fence.values];
  const count=await authority.db.prepare(`SELECT count(*) AS total FROM ${joins} WHERE ${where}`).bind(...values).first<{total:number}>();
  const after=cursor?' AND (l.created_at<? OR (l.created_at=? AND l.request_id<?))':'';
  const rows=(await authority.db.prepare(`SELECT ${columns},l.created_at AS origin_created_at FROM ${joins} WHERE ${where}${after} ORDER BY l.created_at DESC,l.request_id DESC LIMIT 21`)
    .bind(...values,...(cursor?[cursor.at,cursor.at,cursor.id]:[])).all<Row>()).results??[];
  await authority.assert();
  const selected=rows.slice(0,20),last=selected.at(-1);
  return {requests:selected.map(summary),requestPage:{limit:20,total:Number(count?.total??0),
    nextCursor:rows.length>20&&last?encodeCursor({at:String(last.origin_created_at),id:String(last.id)}):null}};
}
export async function assistantRequestReceipt(authority:AssistantRequestAuthority,requestId:string):Promise<AssistantRequestSummary> {
  if(!uuid(requestId))fail(404,'not_found','Anfrage nicht gefunden.');
  await authority.assert();const fence=authority.fence();
  const row=await authority.db.prepare(`SELECT ${columns} FROM ${joins} WHERE l.conversation_id=? AND r.id=? AND r.client_id IS NULL AND ${fence.sql}`)
    .bind(authority.id,requestId,...fence.values).first<Row>();
  await authority.assert();if(!row)fail(404,'not_found','Anfrage nicht gefunden.');
  return summary(row!);
}
export function assistantRequestOriginStatement(authority:AssistantRequestAuthority,input:{requestId:string;key:string;mutation:string;time:string}):D1Statement {
  const fence=authority.fence(true);
  return authority.db.prepare(`INSERT INTO assistant_request_links(request_id,conversation_id,request_key,mutation_id,consent_version,consent_fields_json,created_at)
    SELECT ?,?,?,?,?,?,? WHERE ${fence.sql} ON CONFLICT(conversation_id,request_key) DO NOTHING`)
    .bind(input.requestId,authority.id,input.key,input.mutation,ASSISTANT_REQUEST_CONSENT_VERSION,JSON.stringify(ASSISTANT_REQUEST_TRANSFER_FIELDS),input.time,...fence.values);
}
export async function cancelAssistantRequest(authority:AssistantRequestAuthority,requestId:string,version:unknown):Promise<AssistantRequestSummary> {
  if(!Number.isSafeInteger(version)||Number(version)<1)fail(422,'version','Bitte aktualisieren Sie die Anfrage.');
  const current=await assistantRequestReceipt(authority,requestId);
  if(current.status==='cancelled')return current;
  if(current.version!==version)fail(409,'conflict','Die Anfrage wurde inzwischen geändert. Bitte aktualisieren Sie die Ansicht.');
  if(!['new','reviewing'].includes(current.status))fail(409,'state','Eine Absage ist nur vor der Einsatzplanung möglich. Bitte kontaktieren Sie uns.');
  const mutation=crypto.randomUUID(),time=new Date().toISOString(),fence=authority.fence();
  const result=await authority.db.batch([
    authority.db.prepare(`UPDATE cleaning_requests SET status='cancelled',updated_at=?,version=version+1,last_mutation=?
      WHERE id=? AND version=? AND client_id IS NULL AND status IN ('new','reviewing')
        AND EXISTS (SELECT 1 FROM assistant_request_links WHERE conversation_id=? AND request_id=cleaning_requests.id) AND ${fence.sql}`)
      .bind(time,mutation,requestId,version,authority.id,...fence.values),
    authority.db.prepare(`INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at)
      SELECT ?,?,'request.cancelled',id,? FROM cleaning_requests WHERE id=? AND last_mutation=?`)
      .bind(crypto.randomUUID(),'assistant:'+authority.id,time,requestId,mutation),
  ]);
  await authority.assert();
  if(!result[0]?.meta?.changes){
    const fresh=await assistantRequestReceipt(authority,requestId);
    if(fresh.status==='cancelled')return fresh;
    fail(409,'conflict','Die Anfrage wurde inzwischen geändert. Bitte aktualisieren Sie die Ansicht.');
  }
  // The existing dispatcher rechecks cancelled sources before dispatch and
  // settlement. An APPLIED/possibly-sent event is not a remote erasure receipt.
  return assistantRequestReceipt(authority,requestId);
}
