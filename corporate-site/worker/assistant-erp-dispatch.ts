import type { D1Database, WorkerEnv } from './types';
import { erpScopeHash, getErpConfig } from './assistant-erp';

type Row = Record<string, unknown>;
export type DispatchResult = {disabled:boolean;processed:number;applied:number;review:number;retry:number};
const MAX_ATTEMPTS=6, LEASE_MS=45_000, TIMEOUT_MS=10_000, RECEIPT_LIMIT=65_536;
const retryDelays=[5_000,30_000,120_000,600_000,1_800_000];

export async function signErpEvent(body:string,timestamp:string,secret:string):Promise<string>{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+body));
  return 'sha256='+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}

async function boundedJson(response:Response):Promise<unknown>{
  if(Number(response.headers.get('content-length')||0)>RECEIPT_LIMIT)throw Error('receipt_size');
  const reader=response.body?.getReader();if(!reader)throw Error('receipt_empty');
  const chunks:Uint8Array[]=[];let size=0;
  try{
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;
      if(size>RECEIPT_LIMIT){await reader.cancel();throw Error('receipt_size');}chunks.push(part.value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function receipt(value:unknown,eventId:string):Row|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Row;
  if(r.event_id!==eventId||typeof r.duplicate!=='boolean')return null;
  const id=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f\u007f]/u.test(v);
  if(r.status==='APPLIED'&&id(r.effect_id))return {event_id:eventId,status:r.status,duplicate:r.duplicate,effect_id:r.effect_id};
  if(r.status==='QUARANTINED'&&id(r.quarantine_id))return {event_id:eventId,status:r.status,duplicate:r.duplicate,quarantine_id:r.quarantine_id};
  return null;
}

/** A private scheduler calls this, never a public request. No configuration means no network. */
export async function drainErpLeads(env:WorkerEnv,options:{transport?:typeof fetch;now?:()=>number;random?:()=>number;limit?:number}={}):Promise<DispatchResult>{
  const result:DispatchResult={disabled:true,processed:0,applied:0,review:0,retry:0};
  const config=getErpConfig(env),db=env.DB;
  if(!config||!db)return result;
  result.disabled=false;
  const clock=options.now??Date.now,transport=options.transport??fetch,random=options.random??Math.random;
  const scope=await erpScopeHash(config),time=clock();
  // A dead lease may already have committed in ERP. Reconcile only through the same event.
  await db.prepare("UPDATE assistant_erp_requests SET state=CASE WHEN revoked_at IS NOT NULL OR attempts>=? THEN 'UNKNOWN' ELSE 'RETRY' END,lease_token=NULL,lease_until=NULL,next_attempt_at=?,last_error='lease_expired',updated_at=? WHERE state='SENDING' AND lease_until<=?")
    .bind(MAX_ATTEMPTS,time,time,time).run();
  const due=(await db.prepare("SELECT id FROM assistant_erp_requests WHERE state IN ('QUEUED','RETRY') AND next_attempt_at<=? ORDER BY created_at,id LIMIT ?")
    .bind(time,Math.min(10,Math.max(1,Math.floor(options.limit??5)))).all<{id:string}>()).results??[];
  for(const candidate of due){
    const lease=crypto.randomUUID(),at=clock();
    // A scope/config change cannot silently send a previously approved request elsewhere.
    await db.prepare("UPDATE assistant_erp_requests SET state=CASE WHEN attempts>0 THEN 'UNKNOWN' ELSE 'BLOCKED' END,last_error='approval_or_scope_changed',updated_at=? WHERE id=? AND state IN ('QUEUED','RETRY') AND (scope_hash!=? OR consent_at IS NULL OR revoked_at IS NOT NULL OR attempts>=? OR NOT EXISTS (SELECT 1 FROM assistant_conversations c WHERE c.id=conversation_id AND c.status!='closed'))")
      .bind(at,candidate.id,scope,MAX_ATTEMPTS).run();
    const row=await db.prepare("UPDATE assistant_erp_requests SET state='SENDING',lease_token=?,lease_until=?,updated_at=? WHERE id=? AND state IN ('QUEUED','RETRY') AND next_attempt_at<=? AND scope_hash=? AND consent_at IS NOT NULL AND revoked_at IS NULL AND attempts<? AND EXISTS (SELECT 1 FROM assistant_conversations c WHERE c.id=conversation_id AND c.status!='closed') RETURNING *")
      .bind(lease,at+LEASE_MS,at,candidate.id,at,scope,MAX_ATTEMPTS).first<Row>();
    if(!row)continue;
    const body=String(row.envelope_json),eventId=String(row.event_id);
    const timestamp=String(Math.floor(clock()/1000));
    const signature=await signErpEvent(body,timestamp,config.secret);
    // Final local authority fence after asynchronous signing and before starting transport.
    const current=getErpConfig(env),currentScope=current?await erpScopeHash(current):null;
    if(!current||currentScope!==scope||current.secret!==config.secret){await releaseBlocked(db,candidate.id,lease,clock());continue;}
    const permitted=await db.prepare("UPDATE assistant_erp_requests SET attempts=attempts+1,updated_at=? WHERE id=? AND state='SENDING' AND lease_token=? AND lease_until>? AND revoked_at IS NULL AND consent_at IS NOT NULL AND scope_hash=? AND EXISTS (SELECT 1 FROM assistant_conversations c WHERE c.id=conversation_id AND c.status!='closed') RETURNING attempts")
      .bind(clock(),candidate.id,lease,clock(),scope).first<{attempts:number}>();
    if(!permitted){await releaseBlocked(db,candidate.id,lease,clock());continue;}
    result.processed++;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    let state='UNKNOWN',error='transport_unknown',savedReceipt:Row|null=null;
    try{
      const operation=(async()=>{
        const response=await transport(current.endpoint,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
          headers:{'Content-Type':'application/json','x-knaba-key-id':current.keyId,'x-knaba-timestamp':timestamp,'x-knaba-signature':signature},body,signal:controller.signal});
        if(response.ok){
          let json:unknown;
          try{json=await boundedJson(response);}catch{return {state:'UNKNOWN',error:'invalid_receipt',savedReceipt:null};}
          const parsed=receipt(json,eventId);
          if(!parsed)return {state:'UNKNOWN',error:'invalid_receipt',savedReceipt:null};
          return {state:String(parsed.status),error:'',savedReceipt:parsed};
        }
        // Do not persist external response text: it can contain personal data or credentials.
        await response.body?.cancel();
        if(response.status===429||response.status>=500)return {state:'RETRY',error:'provider_transient',savedReceipt:null};
        return {state:'BLOCKED',error:'provider_rejected',savedReceipt:null};
      })();
      const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},TIMEOUT_MS);});
      const outcome=await Promise.race([operation,timeout]);
      state=outcome.state;error=outcome.error;savedReceipt=outcome.savedReceipt;
    }catch{state='RETRY';error='transport_unknown';}
    finally{if(timer)clearTimeout(timer);controller.abort();}
    if(state==='RETRY'&&permitted.attempts>=MAX_ATTEMPTS)state='UNKNOWN';
    const next=state==='RETRY'?clock()+retryDelays[Math.min(permitted.attempts-1,retryDelays.length-1)]*(1+Math.min(1,Math.max(0,random()))*.2):0;
    // Cancel after transport began cannot promise undelivery; retain any receipt for owner reconciliation.
    const finalized=await db.prepare("UPDATE assistant_erp_requests SET state=CASE WHEN revoked_at IS NOT NULL THEN 'UNKNOWN' ELSE ? END,receipt_json=?,last_error=CASE WHEN revoked_at IS NOT NULL THEN 'cancel_raced_transport' ELSE ? END,next_attempt_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND state IN ('SENDING','UNKNOWN') RETURNING state")
      .bind(state,savedReceipt?JSON.stringify(savedReceipt):null,error,next,clock(),candidate.id,lease).first<{state:string}>();
    if(finalized?.state==='APPLIED')result.applied++;
    else if(finalized?.state==='RETRY')result.retry++;
    else result.review++;
  }
  return result;
}
async function releaseBlocked(db:D1Database,id:string,lease:string,time:number){
  await db.prepare("UPDATE assistant_erp_requests SET state=CASE WHEN attempts>0 THEN 'UNKNOWN' WHEN revoked_at IS NOT NULL THEN 'CANCELLED' ELSE 'BLOCKED' END,lease_token=NULL,lease_until=NULL,last_error='authority_changed_before_send',updated_at=? WHERE id=? AND lease_token=? AND state='SENDING'")
    .bind(time,id,lease).run();
}
