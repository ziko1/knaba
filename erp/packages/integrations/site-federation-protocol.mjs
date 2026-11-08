import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';

export const FEDERATION_ERP_PATH='/api/v1/federation/authority';
export const FEDERATION_SITE_PATH='/api/federation/introspect';
export const FEDERATION_MAX_BYTES=32768;
export const FEDERATION_ACTIONS=Object.freeze(['BOOTSTRAP_AUTHORITY','RECONCILE_PAGE','ACTIVATE_AUTHORITY','LOOKUP_PRINCIPAL','REGISTER_SESSION','FENCE','ACTIVATE_EPOCH','INSPECT_CHALLENGE','CLAIM','LINK_STATUS','INTROSPECT']);
const verifiedRequests=new WeakSet();
const headerPrefix='x-knaba-federation-';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hex=/^[a-f0-9]{64}$/;
const noncePattern=/^[A-Za-z0-9_-]{43}$/;
export class FederationProtocolError extends Error {
  constructor(code='FEDERATION_INVALID'){super(code);this.name='FederationProtocolError';this.code=code;}
}
const fail=code=>{throw new FederationProtocolError(code);};
const requireValue=(condition,code)=>{if(!condition)fail(code);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function exact(value,keys){requireValue(plain(value),'FEDERATION_INVALID');requireValue(Object.keys(value).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(value,k)),'FEDERATION_INVALID');return value;}
const bounded=(value,max=128)=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value,'utf8')<=max&&!/[\u0000-\u0020\u007f]/.test(value);
const sha=value=>createHash('sha256').update(value).digest('hex');
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function canonicalJson(value,depth=0){
  requireValue(depth<=16,'FEDERATION_INVALID');
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){requireValue(Number.isFinite(value),'FEDERATION_INVALID');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(item=>canonicalJson(item,depth+1)).join(',')+']';
  requireValue(plain(value),'FEDERATION_INVALID');
  const keys=Object.keys(value).sort();requireValue(keys.length<=256&&!keys.some(k=>['__proto__','constructor','prototype'].includes(k)),'FEDERATION_INVALID');
  return '{'+keys.map(k=>JSON.stringify(k)+':'+canonicalJson(value[k],depth+1)).join(',')+'}';
}
export function sessionReference(issuer,subject,storedTokenHash){
  requireValue(bounded(issuer,512)&&bounded(subject)&&hex.test(storedTokenHash),'FEDERATION_INVALID');
  return createHash('sha256').update(`KNABA-FEDERATION-SESSION-v1\0${issuer}\0${subject}\0${storedTokenHash}`,'utf8').digest('base64url');
}
export function securityFingerprint(snapshot){
  exact(snapshot,['v','issuer','subject','policyVersion','credential','email','profile','staffGrant','ownerPolicy','oidcLinks']);
  requireValue(snapshot.v===1&&bounded(snapshot.issuer,512)&&bounded(snapshot.subject)&&Number.isSafeInteger(snapshot.policyVersion)&&snapshot.policyVersion>0,'FEDERATION_INVALID');
  exact(snapshot.credential,['salt','passwordHash','disabled']);requireValue(typeof snapshot.credential.salt==='string'&&typeof snapshot.credential.passwordHash==='string'&&typeof snapshot.credential.disabled==='boolean','FEDERATION_INVALID');
  if(snapshot.profile!==null)exact(snapshot.profile,['id','email','role','status']);
  if(snapshot.staffGrant!==null)exact(snapshot.staffGrant,['email','purpose','active']);
  exact(snapshot.ownerPolicy,['ownerUserId','ownerEmail','developerEmail']);
  requireValue(Array.isArray(snapshot.oidcLinks)&&snapshot.oidcLinks.length<=32,'FEDERATION_INVALID');
  const links=snapshot.oidcLinks.map(link=>exact(link,['issuer','subject','userId']));
  links.sort((a,b)=>{const left=canonicalJson([a.issuer,a.subject,a.userId]),right=canonicalJson([b.issuer,b.subject,b.userId]);return left<right?-1:left>right?1:0;});
  return sha('KNABA-FEDERATION-SECURITY-v1\0'+canonicalJson({...snapshot,oidcLinks:links}));
}
function origin(value,mode,testLoopback){
  requireValue(bounded(value,512),'FEDERATION_INVALID');let parsed;try{parsed=new URL(value);}catch{fail('FEDERATION_INVALID');}
  requireValue(parsed.origin===value&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash,'FEDERATION_INVALID');
  requireValue(parsed.protocol==='https:'||mode==='TEST'&&testLoopback===true&&parsed.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(parsed.hostname),'FEDERATION_INVALID');return value;
}
function key(value){
  exact(value,['kid','secret']);requireValue(typeof value.kid==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(value.kid)&&typeof value.secret==='string'&&/^[A-Za-z0-9_-]{43,86}$/.test(value.secret),'FEDERATION_INVALID');
  const bytes=Buffer.from(value.secret,'base64url');requireValue(bytes.length>=32&&bytes.length<=64&&bytes.toString('base64url')===value.secret,'FEDERATION_INVALID');return {...value};
}
export function normalizeAuthority(value,mode='PRODUCTION'){
  const allowed=['authorityId','companyId','issuer','siteOrigin','erpOrigin','erpAudience','siteAudience','policyVersion','siteToErp','erpToSite'];
  requireValue(plain(value)&&Object.keys(value).every(k=>allowed.includes(k)||k==='testLoopback')&&allowed.every(k=>Object.hasOwn(value,k)),'FEDERATION_INVALID');
  requireValue(typeof value.authorityId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value.authorityId)&&bounded(value.companyId)&&bounded(value.issuer,512)&&bounded(value.erpAudience,256)&&bounded(value.siteAudience,256)&&value.erpAudience!==value.siteAudience&&Number.isSafeInteger(value.policyVersion)&&value.policyVersion>=1,'FEDERATION_INVALID');
  requireValue(value.testLoopback===undefined||value.testLoopback===false||mode==='TEST'&&value.testLoopback===true,'FEDERATION_INVALID');
  const siteOrigin=origin(value.siteOrigin,mode,value.testLoopback),erpOrigin=origin(value.erpOrigin,mode,value.testLoopback);
  let issuer;try{issuer=new URL(value.issuer);}catch{fail('FEDERATION_INVALID');}
  requireValue(issuer.origin===siteOrigin&&!issuer.username&&!issuer.password&&!issuer.hash&&!issuer.search,'FEDERATION_INVALID');
  const siteToErp=key(value.siteToErp),erpToSite=key(value.erpToSite);requireValue(siteToErp.secret!==erpToSite.secret,'FEDERATION_INVALID');
  return freeze({...value,siteOrigin,erpOrigin,siteToErp,erpToSite});
}
export function authorityFingerprint(config){
  const {siteToErp,erpToSite,...publicFields}=config;
  return sha('KNABA-FEDERATION-CONFIG-v1\0'+canonicalJson({...publicFields,siteToErp:{kid:siteToErp.kid,keyHash:sha(Buffer.from(siteToErp.secret,'base64url'))},erpToSite:{kid:erpToSite.kid,keyHash:sha(Buffer.from(erpToSite.secret,'base64url'))}}));
}
function direction(config,value){
  requireValue(value==='SITE_TO_ERP'||value==='ERP_TO_SITE','FEDERATION_INVALID');
  return value==='SITE_TO_ERP'?{key:config.siteToErp,responseKey:config.erpToSite,audience:config.erpAudience,path:FEDERATION_ERP_PATH,origin:config.erpOrigin}:{key:config.erpToSite,responseKey:config.siteToErp,audience:config.siteAudience,path:FEDERATION_SITE_PATH,origin:config.siteOrigin};
}
function hmac(key,frame){return createHmac('sha256',Buffer.from(key.secret,'base64url')).update(frame,'utf8').digest('hex');}
function equalSignature(actual,expected){return typeof actual==='string'&&hex.test(actual)&&timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));}
function time(value,now){requireValue(typeof value==='string'&&/^\d{13}$/.test(value),'FEDERATION_AUTH_FAILED');const parsed=Number(value);requireValue(Number.isSafeInteger(now)&&now-parsed<=60000&&parsed-now<=5000,'FEDERATION_AUTH_FAILED');return parsed;}
const get=(headers,name)=>typeof headers?.get==='function'?headers.get(headerPrefix+name):headers?.[headerPrefix+name];
function requestFrame(config,dir,generation,issuedAt,nonce,body){return ['KNABA-FEDERATION-REQUEST-v1',config.authorityId,config.companyId,config.issuer,dir.audience,dir.key.kid,String(generation),String(issuedAt),nonce,'POST',dir.path,sha(body)].join('\n');}
function responseFrame(config,context,status,issuedAt,body){const dir=direction(config,context.direction);return ['KNABA-FEDERATION-RESPONSE-v1',config.authorityId,config.companyId,config.issuer,dir.audience,dir.responseKey.kid,String(context.generation),context.nonce,'POST',dir.path,String(status),String(issuedAt),sha(body)].join('\n');}
function encode(value){const body=Buffer.from(canonicalJson(value),'utf8');requireValue(body.length<=FEDERATION_MAX_BYTES,'FEDERATION_INVALID');return body;}
function parse(body){
  requireValue(Buffer.isBuffer(body)&&body.length>0&&body.length<=FEDERATION_MAX_BYTES,'FEDERATION_INVALID');let parsed;
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{fail('FEDERATION_INVALID');}
  requireValue(canonicalJson(parsed)===body.toString('utf8'),'FEDERATION_INVALID');return parsed;
}
function envelope(config,dir,value){
  exact(value,['v','companyId','issuer','audience','operationId','action','payload']);
  requireValue(value.v===1&&value.companyId===config.companyId&&value.issuer===config.issuer&&value.audience===dir.audience&&uuid.test(value.operationId)&&FEDERATION_ACTIONS.includes(value.action)&&plain(value.payload),'FEDERATION_AUTH_FAILED');return value;
}
export function makeFederationRequest(config,requestDirection,action,payload,{operationId=randomUUID(),generation,now=Date.now(),nonce=randomBytes(32).toString('base64url')}={}){
  const dir=direction(config,requestDirection);
  requireValue(Number.isSafeInteger(generation)&&generation>=0&&(action==='BOOTSTRAP_AUTHORITY'?generation===0:generation>0)&&Number.isSafeInteger(now)&&/^\d{13}$/.test(String(now))&&typeof nonce==='string'&&noncePattern.test(nonce),'FEDERATION_INVALID');
  const value=envelope(config,dir,{v:1,companyId:config.companyId,issuer:config.issuer,audience:dir.audience,operationId,action,payload});
  const body=encode(value),context=freeze({direction:requestDirection,generation,nonce,issuedAt:now,operationId,configFingerprint:authorityFingerprint(config)});
  return {body,context,headers:{'content-type':'application/json','cache-control':'no-store',[headerPrefix+'authority']:config.authorityId,[headerPrefix+'key']:dir.key.kid,[headerPrefix+'generation']:String(generation),[headerPrefix+'time']:String(now),[headerPrefix+'nonce']:nonce,[headerPrefix+'signature']:hmac(dir.key,requestFrame(config,dir,generation,now,nonce,body))}};
}
export function verifyFederationRequest(config,requestDirection,headers,body,now=Date.now()){
  const dir=direction(config,requestDirection),nonce=get(headers,'nonce'),stamp=get(headers,'time'),generationText=get(headers,'generation');
  requireValue(Buffer.isBuffer(body)&&body.length>0&&body.length<=FEDERATION_MAX_BYTES,'FEDERATION_AUTH_FAILED');
  requireValue(get(headers,'authority')===config.authorityId&&get(headers,'key')===dir.key.kid&&typeof nonce==='string'&&noncePattern.test(nonce)&&typeof generationText==='string'&&/^(?:0|[1-9]\d{0,14})$/.test(generationText),'FEDERATION_AUTH_FAILED');
  const issuedAt=time(stamp,now),generation=Number(generationText);requireValue(Number.isSafeInteger(generation),'FEDERATION_AUTH_FAILED');
  requireValue(equalSignature(get(headers,'signature'),hmac(dir.key,requestFrame(config,dir,generation,issuedAt,nonce,body))),'FEDERATION_AUTH_FAILED');
  const value=envelope(config,dir,parse(body));requireValue(value.action==='BOOTSTRAP_AUTHORITY'?generation===0:generation>0,'FEDERATION_AUTH_FAILED');
  const result=freeze({direction:requestDirection,generation,nonce,issuedAt,operationId:value.operationId,configFingerprint:authorityFingerprint(config),envelope:value,nonceHash:sha('KNABA-FEDERATION-NONCE-v1\0'+nonce),operationDigest:sha('KNABA-FEDERATION-OPERATION-v1\0'+canonicalJson(value))});
  verifiedRequests.add(result);return result;
}
export function isVerifiedFederationRequest(value){return verifiedRequests.has(value);}
export function makeFederationResponse(config,context,value,status=200,now=Date.now()){
  requireValue(isVerifiedFederationRequest(context)&&context.configFingerprint===authorityFingerprint(config),'FEDERATION_AUTH_FAILED');
  requireValue(Number.isInteger(status)&&status>=200&&status<=599,'FEDERATION_INVALID');const body=encode(value),dir=direction(config,context.direction);
  return {body,status,headers:{'content-type':'application/json','cache-control':'no-store',[headerPrefix+'authority']:config.authorityId,[headerPrefix+'key']:dir.responseKey.kid,[headerPrefix+'time']:String(now),[headerPrefix+'nonce']:context.nonce,[headerPrefix+'signature']:hmac(dir.responseKey,responseFrame(config,context,status,now,body))}};
}
export function verifyFederationResponse(config,context,status,headers,body,now=Date.now()){
  requireValue(Buffer.isBuffer(body)&&body.length>0&&body.length<=FEDERATION_MAX_BYTES,'FEDERATION_AUTH_FAILED');
  const dir=direction(config,context.direction);requireValue(context.configFingerprint===authorityFingerprint(config)&&get(headers,'authority')===config.authorityId&&get(headers,'key')===dir.responseKey.kid&&get(headers,'nonce')===context.nonce,'FEDERATION_AUTH_FAILED');
  const issuedAt=time(get(headers,'time'),now);requireValue(Number.isInteger(status)&&status>=200&&status<=599&&equalSignature(get(headers,'signature'),hmac(dir.responseKey,responseFrame(config,context,status,issuedAt,body))),'FEDERATION_AUTH_FAILED');return parse(body);
}
export async function sendFederation(config,requestDirection,action,payload,options={}){
  const request=makeFederationRequest(config,requestDirection,action,payload,options),dir=direction(config,requestDirection),abort=new AbortController();
  const timeout=setTimeout(()=>abort.abort(),3000);let response;
  try{
    response=await (options.fetchImpl??fetch)(dir.origin+dir.path,{method:'POST',headers:request.headers,body:request.body,redirect:'manual',signal:abort.signal});
    requireValue(response.status<300||response.status>=400,'FEDERATION_UNAVAILABLE');requireValue(response.body,'FEDERATION_UNAVAILABLE');
    const chunks=[];let size=0;const reader=response.body.getReader();
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>FEDERATION_MAX_BYTES){await reader.cancel();fail('FEDERATION_UNAVAILABLE');}chunks.push(Buffer.from(value));}
    const body=Buffer.concat(chunks),result=verifyFederationResponse(config,request.context,response.status,response.headers,body);
    return {status:response.status,result,context:request.context};
  }catch(error){if(error instanceof FederationProtocolError)throw error;fail('FEDERATION_UNAVAILABLE');}
  finally{clearTimeout(timeout);}
}
