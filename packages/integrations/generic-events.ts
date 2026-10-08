import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {assert,DomainError} from '../domain/core.ts';

export const INTEGRATION_REPLAY_WINDOW_SECONDS=300;
export const INTEGRATION_MAX_BODY_BYTES=262144;
export const integrationSourceSchema=z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const keyId=z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const credentialSchema=z.object({source:integrationSourceSchema,companyId:z.string().min(1).max(100),keyId,
 secret:z.string().min(32).max(4096),enabled:z.boolean().default(true),
 notBefore:z.string().datetime({offset:true}).optional(),notAfter:z.string().datetime({offset:true}).optional()}).strict();
export type IntegrationCredential=z.infer<typeof credentialSchema>;

/** Credentials come from the server secret store, never a request or domain config. */
export function parseIntegrationCredentials(serialized:string|undefined):IntegrationCredential[]{
 if(!serialized)return [];
 let value:unknown;try{value=JSON.parse(serialized);}catch{throw new DomainError('MISSING_CONFIGURATION',{reason:'INVALID_INTEGRATION_CREDENTIALS'});}
 const result=z.array(credentialSchema).max(100).safeParse(value);
 assert(result.success,'MISSING_CONFIGURATION',{reason:'INVALID_INTEGRATION_CREDENTIALS'});
 const identities=new Set<string>(),companies=new Map<string,string>();
 for(const credential of result.data){
  const identity=JSON.stringify([credential.source,credential.keyId]);
  assert(!identities.has(identity)&&(!companies.has(credential.source)||companies.get(credential.source)===credential.companyId),'MISSING_CONFIGURATION',{reason:'AMBIGUOUS_INTEGRATION_CREDENTIALS'});
  assert(!credential.notBefore||!credential.notAfter||Date.parse(credential.notAfter)>Date.parse(credential.notBefore),'MISSING_CONFIGURATION',{reason:'INVALID_INTEGRATION_KEY_WINDOW'});
  identities.add(identity);companies.set(credential.source,credential.companyId);
 }
 return result.data;
}
export function selectIntegrationCredential(credentials:IntegrationCredential[],source:string,requestedKeyId:unknown,nowMs=Date.now()):IntegrationCredential{
 assert(typeof requestedKeyId==='string'&&keyId.safeParse(requestedKeyId).success&&integrationSourceSchema.safeParse(source).success&&Number.isSafeInteger(nowMs),'ACCESS_DENIED');
 const credential=credentials.find(key=>key.source===source&&key.keyId===requestedKeyId&&key.enabled&&(!key.notBefore||Date.parse(key.notBefore)<=nowMs)&&(!key.notAfter||Date.parse(key.notAfter)>nowMs));
 assert(credential,'ACCESS_DENIED');return credential;
}
export function signIntegrationEvent(rawBody:Uint8Array,timestamp:string,secret:string):string{
 assert(rawBody instanceof Uint8Array&&rawBody.byteLength>0&&rawBody.byteLength<=INTEGRATION_MAX_BODY_BYTES&&/^\d{10}$/.test(timestamp)&&secret.length>=32,'VALIDATION_ERROR');
 return 'sha256='+createHmac('sha256',secret).update(timestamp+'.').update(rawBody).digest('hex');
}
/** Signature covers the timestamp and exact bytes. No JSON reserialization before auth. */
export function verifyIntegrationEventSignature(rawBody:unknown,timestamp:unknown,signature:unknown,secret:string,nowMs=Date.now()):boolean{
 if(!(rawBody instanceof Uint8Array)||!rawBody.byteLength||rawBody.byteLength>INTEGRATION_MAX_BODY_BYTES||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature)||secret.length<32||!Number.isSafeInteger(nowMs))return false;
 if(Math.abs(nowMs-Number(timestamp)*1000)>INTEGRATION_REPLAY_WINDOW_SECONDS*1000)return false;
 const expected=Buffer.from(signIntegrationEvent(rawBody,timestamp,secret).slice(7),'hex');
 return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}

/** Reject UTF-8 corruption and prototype keys instead of silently dropping them. */
export function parseSignedIntegrationJson(rawBody:Uint8Array):unknown{
 assert(rawBody.byteLength>0&&rawBody.byteLength<=INTEGRATION_MAX_BODY_BYTES,'VALIDATION_ERROR');
 try{
  const json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(rawBody));let nodes=0;
  const check=(value:unknown,depth:number)=>{
   assert(++nodes<=10000&&depth<=20,'VALIDATION_ERROR');
   if(value===null||typeof value!=='object')return;
   for(const [key,child]of Object.entries(value)){assert(!['__proto__','prototype','constructor'].includes(key),'VALIDATION_ERROR');check(child,depth+1);}
  };check(json,0);return json;
 }catch(error){if(error instanceof DomainError)throw error;throw new DomainError('VALIDATION_ERROR',{reason:'INVALID_INTEGRATION_JSON'});}
}
