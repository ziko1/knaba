import type { ErpLeadConfig } from './erp-lead-contract';

export interface ErpLeadDelivery { eventId:string; body:string; bindingHash:string }
export type ErpLeadDeliveryResult =
  | {status:'APPLIED';effectId:string;duplicate:boolean}
  | {status:'QUARANTINED';quarantineId:string;reason:string;duplicate:boolean}
  | {status:'RETRY'|'BLOCKED';reason:string};
export interface ErpLeadTransportOptions {
  /** Trusted in-process test dependency only; never accepted from HTTP or env. */
  fetch?:typeof fetch;
  now?:()=>number;
  currentConfig?:()=>Promise<ErpLeadConfig|null>;
}
export const ERP_INTAKE_HTTP_TIMEOUT_MS=5000;
export const ERP_INTAKE_MAX_RESPONSE_BYTES=4096;
const maxBodyBytes=262144;
const encoder=new TextEncoder();
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);
const reason=(value:unknown):value is string=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,99}$/.test(value);
const blocked=(reason:string):ErpLeadDeliveryResult=>({status:'BLOCKED',reason});
const retry=(reason:string):ErpLeadDeliveryResult=>({status:'RETRY',reason});

function usable(config:ErpLeadConfig,at:number):boolean {
  if(!Number.isSafeInteger(at)||typeof config.secret!=='string'||config.secret.length<32||config.secret.length>4096||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.keyId)||!/^[a-z][a-z0-9_-]{0,63}$/.test(config.source)||
    !/^[a-f0-9]{64}$/.test(config.bindingHash)||!identifier(config.companyId)||config.companyId.length>100||
    (config.keyNotBefore!==undefined&&(!Number.isFinite(config.keyNotBefore)||at<config.keyNotBefore))||
    (config.keyNotAfter!==undefined&&(!Number.isFinite(config.keyNotAfter)||at>=config.keyNotAfter)))return false;
  try {
    const url=new URL(config.endpoint),origin=new URL(config.origin),host=url.hostname.toLowerCase();
    // Destination is an operator-owned origin, never a field from an intake.
    // Private/IP/local names are refused. This is not a DNS-rebinding assertion:
    // deployment must restrict outbound DNS/network to the approved ERP host.
    return url.protocol==='https:'&&origin.protocol==='https:'&&!url.port&&!origin.port&&!url.username&&!url.password&&!url.search&&!url.hash&&
      !origin.username&&!origin.password&&!origin.search&&!origin.hash&&origin.pathname==='/'&&
      url.origin===origin.origin&&url.href===origin.origin+'/api/v1/integrations/'+config.source+'/events'&&
      host.includes('.')&&!host.includes(':')&&!/^\d+(?:\.\d+)*$/.test(host)&&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)&&!host.endsWith('.');
  } catch {return false;}
}
function sameAuthority(a:ErpLeadConfig,b:ErpLeadConfig):boolean {
  return a.bindingHash===b.bindingHash&&a.origin===b.origin&&a.endpoint===b.endpoint&&a.source===b.source&&a.companyId===b.companyId&&
    a.keyId===b.keyId&&a.secret===b.secret&&a.keyNotBefore===b.keyNotBefore&&a.keyNotAfter===b.keyNotAfter;
}
function receipt(value:unknown,eventId:string):ErpLeadDeliveryResult|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const data=value as Record<string,unknown>;
  if(data.event_id!==eventId||typeof data.duplicate!=='boolean')return null;
  const keys=Object.keys(data);
  if(data.status==='APPLIED'&&identifier(data.effect_id)&&keys.every(key=>['event_id','status','duplicate','effect_id'].includes(key)))
    return {status:'APPLIED',effectId:data.effect_id,duplicate:data.duplicate};
  if(data.status==='QUARANTINED'&&identifier(data.quarantine_id)&&reason(data.reason)&&keys.every(key=>['event_id','status','duplicate','quarantine_id','reason'].includes(key)))
    return {status:'QUARANTINED',quarantineId:data.quarantine_id,reason:data.reason,duplicate:data.duplicate};
  return null;
}
async function boundedJson(response:Response,signal:AbortSignal):Promise<unknown> {
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>ERP_INTAKE_MAX_RESPONSE_BYTES))throw Error('INVALID_RECEIPT');
  if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!response.body)throw Error('INVALID_RECEIPT');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let total=0,complete=false;
  const abort=()=>{void reader.cancel().catch(()=>undefined);};
  signal.addEventListener('abort',abort,{once:true});
  try {
    while(true){
      if(signal.aborted)throw Error('TRANSPORT_TIMEOUT');
      const result=await reader.read();
      if(signal.aborted)throw Error('TRANSPORT_TIMEOUT');
      if(result.done)break;
      total+=result.value.byteLength;
      if(total>ERP_INTAKE_MAX_RESPONSE_BYTES)throw Error('INVALID_RECEIPT');
      chunks.push(result.value);
    }
    const bytes=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));complete=true;return parsed;
  } finally {
    signal.removeEventListener('abort',abort);
    if(!complete)void reader.cancel().catch(()=>undefined);
    reader.releaseLock();
  }
}

/** One bounded attempt. Retries belong to the durable leased outbox, never here. */
export async function deliverErpLead(config:ErpLeadConfig,delivery:ErpLeadDelivery,options:ErpLeadTransportOptions={}):Promise<ErpLeadDeliveryResult> {
  const now=options.now??Date.now,transport=options.fetch??fetch,currentConfig=options.currentConfig??(async()=>config);
  if(!usable(config,now())||delivery.bindingHash!==config.bindingHash||!identifier(delivery.eventId)||typeof delivery.body!=='string')return blocked('CONFIG_CHANGED');
  const body=encoder.encode(delivery.body);
  if(!body.length||body.byteLength>maxBodyBytes)return blocked('INVALID_ENVELOPE');
  try {
    const envelope=JSON.parse(delivery.body);
    if(envelope?.event_id!==delivery.eventId||envelope?.source!==config.source||envelope?.target_company_id!==config.companyId||envelope?.event_type!=='lead.upsert'||envelope?.schema_version!=='1')return blocked('INVALID_ENVELOPE');
  } catch {return blocked('INVALID_ENVELOPE');}
  let current:ErpLeadConfig|null;
  try{current=await currentConfig();}catch{return blocked('CONFIG_CHANGED');}
  if(!current||!usable(current,now())||current.bindingHash!==delivery.bindingHash||current.endpoint!==config.endpoint||current.source!==config.source||current.companyId!==config.companyId)return blocked('CONFIG_CHANGED');
  // Snapshot authority, so a mutable env/config object cannot replace the signed key.
  current={...current};
  const timestamp=String(Math.floor(now()/1000));
  if(!/^\d{10}$/.test(timestamp))return blocked('INVALID_CLOCK');
  const prefix=encoder.encode(timestamp+'.'),signed=new Uint8Array(prefix.length+body.length);signed.set(prefix);signed.set(body,prefix.length);
  const key=await crypto.subtle.importKey('raw',encoder.encode(current.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature='sha256='+Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,signed)),byte=>byte.toString(16).padStart(2,'0')).join('');
  let fresh:ErpLeadConfig|null;
  try{fresh=await currentConfig();}catch{return blocked('CONFIG_CHANGED');}
  if(!fresh||!usable(fresh,now())||!sameAuthority(current,fresh))return blocked('CONFIG_CHANGED');
  const controller=new AbortController();
  let response:Response|undefined;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const expired=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('TRANSPORT_TIMEOUT'));},ERP_INTAKE_HTTP_TIMEOUT_MS);});
  const attempt=(async():Promise<ErpLeadDeliveryResult>=>{
    try {
      response=await transport(current!.endpoint,{method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json','Accept':'application/json','X-Knaba-Key-Id':current!.keyId,'X-Knaba-Timestamp':timestamp,'X-Knaba-Signature':signature},body,signal:controller.signal});
      if(controller.signal.aborted)return retry('TRANSPORT_TIMEOUT');
      if(response.redirected||response.type==='opaqueredirect')return blocked('REDIRECT_REJECTED');
      if(!response.ok){
        if([408,429].includes(response.status)||response.status>=500)return retry('HTTP_'+response.status);
        return blocked(response.status>=300&&response.status<400?'REDIRECT_REJECTED':'HTTP_'+response.status);
      }
      try{return receipt(await boundedJson(response,controller.signal),delivery.eventId)??retry('INVALID_RECEIPT');}
      catch{return retry(controller.signal.aborted?'TRANSPORT_TIMEOUT':'INVALID_RECEIPT');}
    } catch {return retry(controller.signal.aborted?'TRANSPORT_TIMEOUT':'TRANSPORT_ERROR');}
    finally{if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>undefined);}
  })();
  try{return await Promise.race([attempt,expired]);}
  catch{return retry('TRANSPORT_TIMEOUT');}
  finally{if(timeout!==undefined)clearTimeout(timeout);}
}
