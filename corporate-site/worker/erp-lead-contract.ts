import { services } from '../src/data/company.ts';
import type { WorkerEnv } from './types';

export interface ErpLeadConfig {
  origin:string; endpoint:string; source:string; companyId:string; keyId:string; secret:string;
  bindingHash:string; mappingVersion:string; privacyVersion:string; serviceMap:Record<string,string[]>;
  keyNotBefore?:number; keyNotAfter?:number;
}
export async function erpLeadHash(value:string):Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
const cleanId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(v);

/** Configuration is an operator capability, never parsed from the public request. */
export async function readErpLeadConfig(env:WorkerEnv,nowMs=Date.now()):Promise<ErpLeadConfig|null> {
  if(!erpBridgeApproved(env)||!Number.isFinite(nowMs))return null;
  try {
    const origin=new URL(env.KNABA_ERP_ALLOWED_ORIGIN??'');
    const host=origin.hostname.toLowerCase();
    if(origin.protocol!=='https:'||origin.port||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||
      !host.includes('.')||host.includes(':')||/^\d+(?:\.\d+)*$/.test(host)||host.endsWith('.')||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host))return null;
    const companyId=env.KNABA_ERP_COMPANY_ID??'';
    const source='knaba_site',keyId=env.KNABA_ERP_KEY_ID??'',secret=env.KNABA_ERP_SECRET??'',mappingVersion=env.KNABA_ERP_MAPPING_VERSION??'';
    const privacyVersion=env.KNABA_ERP_APPROVED_PRIVACY_VERSION??'';
    if(env.KNABA_ERP_URL!==origin.origin+'/api/v1/integrations/knaba_site/events'||!/^\d{4}-\d{2}-\d{2}$/.test(privacyVersion))return null;
    if(!cleanId(companyId)||!/^[a-z][a-z0-9_-]{0,63}$/.test(source)||!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)||secret.length<32||secret.length>4096||!cleanId(mappingVersion))return null;
    const raw=env.KNABA_ERP_SERVICE_MAP_JSON??'';
    if(raw.length>16384)return null;
    const parsed=JSON.parse(raw) as unknown;
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
    const serviceMap:Record<string,string[]>={};
    for(const [slug,id] of Object.entries(parsed).sort(([a],[b])=>a<b?-1:a>b?1:0)) {
      const ids=[id];
      if(!services.some(s=>s.slug===slug)||!Array.isArray(ids)||!ids.length||ids.length>20||!ids.every(cleanId)||new Set(ids).size!==ids.length)return null;
      serviceMap[slug]=[...ids].sort();
    }
    if(!Object.keys(serviceMap).length)return null;
    const date=(v:string|undefined)=>v===undefined?undefined:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)?Date.parse(v):NaN;
    const keyNotBefore=date(env.KNABA_ERP_KEY_NOT_BEFORE),keyNotAfter=date(env.KNABA_ERP_KEY_NOT_AFTER);
    if(keyNotBefore!==undefined&&(!Number.isFinite(keyNotBefore)||nowMs<keyNotBefore))return null;
    if(keyNotAfter!==undefined&&(!Number.isFinite(keyNotAfter)||nowMs>=keyNotAfter))return null;
    if(keyNotBefore!==undefined&&keyNotAfter!==undefined&&keyNotBefore>=keyNotAfter)return null;
    const bindingHash=await erpLeadHash(JSON.stringify({origin:origin.origin,source,companyId,mappingVersion,privacyVersion,serviceMap}));
    return {origin:origin.origin,endpoint:origin.origin+'/api/v1/integrations/'+source+'/events',source,companyId,keyId,secret,mappingVersion,privacyVersion,serviceMap,bindingHash,keyNotBefore,keyNotAfter};
  } catch {return null;}
}

export const erpBridgeApproved=(env:WorkerEnv)=>env.KNABA_ERP_BRIDGE_ENABLED==='true'&&env.KNABA_ERP_TRANSFER_APPROVED==='true';
export class ErpLeadInputError extends Error {code:string;constructor(code:string){super(code);this.code=code;}}
export interface ErpLeadSource {
 id:string; client_id:string|null; status:string; created_at:string; privacy_version:string;
 service:string; contact_name:string; email:string; phone:string; object_type:string;
 postcode:string; address:string; area:string; frequency:string;
}
export interface ErpLeadReference {id:string;locale:string;source_json:string}
const safeText=(v:unknown,n:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
/** Rebuild exact bytes from the original source; no free text, quantities, identities or money. */
export function erpLeadEnvelope(config:ErpLeadConfig,row:ErpLeadSource,claim:ErpLeadReference):string {
 const reject=(code:string):never=>{throw new ErpLeadInputError(code);};
 if(row.status==='cancelled')reject('SOURCE_CANCELLED');
 if(row.client_id!==null)reject('ANONYMOUS_SOURCE_REQUIRED');
 if(row.privacy_version!==config.privacyVersion)reject('PRIVACY_VERSION_NOT_APPROVED');
 const serviceIds=config.serviceMap[row.service];
 if(!serviceIds)reject('SERVICE_UNMAPPED');
 if(!safeText(row.id,100)||claim.id!==row.id||!Number.isFinite(Date.parse(row.created_at))||new Date(row.created_at).toISOString()!==row.created_at||
  !safeText(row.contact_name,200)||!safeText(row.email,254)||!safeText(row.object_type,4000)||!/^\d{5}$/.test(row.postcode)||
  !['Einmalig','Regelmäßig','Noch offen'].includes(row.frequency)||!['DE','EN','PL','LT','RU','UK'].includes(claim.locale))reject('SOURCE_MAPPING_INVALID');
 if(row.area&&(!/^\d{1,7}$/.test(row.area)||Number(row.area)<1||Number(row.area)>1000000))reject('SOURCE_MAPPING_INVALID');
 let attribution:Record<string,string>;
 try {attribution=JSON.parse(claim.source_json);}catch{return reject('SOURCE_MAPPING_INVALID');}
 if(!attribution||typeof attribution!=='object'||Array.isArray(attribution)||Object.keys(attribution).some(k=>!['landingPage','campaign','referralCode'].includes(k))||
  Object.entries(attribution).some(([k,v])=>!safeText(v,k==='landingPage'?2000:100)))reject('SOURCE_MAPPING_INVALID');
 if(attribution.landingPage){try{const url=new URL(attribution.landingPage);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)reject('SOURCE_MAPPING_INVALID');}catch{return reject('SOURCE_MAPPING_INVALID');}}
 const address=[row.postcode,row.address].filter(v=>safeText(v,4000)).join(', ');
 return JSON.stringify({schema_version:'1',target_company_id:config.companyId,event_id:claim.id,event_type:'lead.upsert',source:config.source,
  occurred_at:row.created_at,external_id:row.id,payload:{contact:{name:row.contact_name,email:row.email,...(row.phone.length>=5&&safeText(row.phone,40)?{phone:row.phone}:{})},
   serviceIds,language:claim.locale,facts:{propertyType:row.object_type,...(row.area?{area:row.area+' m²'}:{}),...(address?{address}:{}),
   ...(row.frequency==='Einmalig'?{recurring:false}:row.frequency==='Regelmäßig'?{recurring:true}:{})},source:attribution}});
}
