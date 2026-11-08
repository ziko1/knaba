import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export const MAX_PROOF_AGE_MS=5*60_000;
const paths={erp:new Set(['/api/v1/auth/site-links/inspect-challenge']),site:new Set(['/auth/site-identity/inspect','/auth/site-identity/redeem','/auth/site-identity/introspect-session'])};
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const opaque=()=>randomBytes(32).toString('base64url');
export const proofHash=/^[a-f0-9]{64}$/;
export const challengeTokenPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.[A-Za-z0-9_-]{43}$/;
export class FederationError extends Error {constructor(code='ACCESS_DENIED'){super(code);this.code=code;}}
export function requireValue(condition,code='ACCESS_DENIED'){if(!condition)throw new FederationError(code);}
export function exactObject(value,keys){requireValue(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key)),'VALIDATION_ERROR');return value;}
const bounded=(value,max)=>typeof value==='string'&&Buffer.byteLength(value)>0&&Buffer.byteLength(value)<=max&&!/[\u0000-\u0020\u007f]/.test(value);
export function secureEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
/** Independent operator opt-in; F2 peer.active never enables session authority. */
export function parseSessionAuthorityEnabled(value){
 if(value===undefined||value===null||value===''||value==='false')return false;
 if(value==='true')return true;
 throw new FederationError('MISSING_CONFIGURATION');
}
function origin(value,localTest){try{const url=new URL(value);return value===url.origin&&!url.username&&!url.password&&!url.search&&!url.hash&&(url.protocol==='https:'||(localTest===true&&url.protocol==='http:'&&url.hostname==='127.0.0.1'));}catch{return false;}}
export function trustFingerprint(config){return digest(JSON.stringify([config.companyId,config.issuer,config.audience,'site-user-id-v1',config.version,config.active,config.expiresAt??null]));}
export function transportFingerprint(config){return digest(JSON.stringify([trustFingerprint(config),config.erpOrigin,config.siteOrigin,config.keyId,digest(config.secret),config.ownerUserId??null]));}

/** Trusted operator configuration only; neither Host nor a browser field selects a peer. */
export function parsePeerConfig(input,{localTest=false}={}){
 if(input===undefined||input===null||input==='')return null;
 let raw=input;if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{throw new FederationError('MISSING_CONFIGURATION');}}
 const row=exactObject(raw,['companyId','issuer','audience','version','active','expiresAt','erpOrigin','siteOrigin','keyId','secret','ownerUserId']);
 let issuer;try{issuer=new URL(row.issuer);}catch{throw new FederationError('MISSING_CONFIGURATION');}
 requireValue(bounded(row.companyId,128)&&bounded(row.issuer,512)&&issuer.protocol==='https:'&&!issuer.username&&!issuer.password&&!issuer.search&&!issuer.hash&&
  bounded(row.audience,256)&&Number.isInteger(row.version)&&row.version>0&&row.version<=2_147_483_647&&typeof row.active==='boolean'&&
  origin(row.erpOrigin,localTest)&&origin(row.siteOrigin,localTest)&&row.erpOrigin!==row.siteOrigin&&
  /^knaba-federation-[A-Za-z0-9_-]{1,64}$/.test(row.keyId)&&/^[A-Za-z0-9_-]{43}$/.test(row.secret)&&Buffer.from(row.secret,'base64url').length===32&&Buffer.from(row.secret,'base64url').toString('base64url')===row.secret&&
  (row.ownerUserId===undefined||bounded(row.ownerUserId,200)),'MISSING_CONFIGURATION');
 if(row.expiresAt!==undefined){const parsed=Date.parse(row.expiresAt);requireValue(Number.isFinite(parsed)&&new Date(parsed).toISOString()===row.expiresAt,'MISSING_CONFIGURATION');}
 return Object.freeze({...row});
}
export function requireActive(config,now=Date.now()){
 requireValue(config?.active===true&&Number.isFinite(now)&&(!config.expiresAt||Date.parse(config.expiresAt)>now),'MISSING_CONFIGURATION');return config;
}
const mac=(config,value)=>createHmac('sha256',Buffer.from(config.secret,'base64url')).update(value).digest('base64url');
const frame=(config,direction,path,nonce,time,status,bytes)=>JSON.stringify(['KNABA-SITE-IDENTITY-V1',transportFingerprint(config),direction,'POST',path,nonce,String(time),status,digest(bytes)]);
const requestKeys=['keyId','nonce','time','signature'];
export function signRequest(config,path,bytes,now=Date.now()){
 requireActive(config,now);requireValue([...paths.erp,...paths.site].includes(path)&&Buffer.byteLength(bytes)<=8192,'VALIDATION_ERROR');
 const nonce=opaque(),time=String(now);return {keyId:config.keyId,nonce,time,signature:mac(config,frame(config,'REQUEST',path,nonce,time,0,bytes))};
}
export function verifyRequest(config,path,bytes,proof,now=Date.now()){
 requireActive(config,now);exactObject(proof,requestKeys);
 requireValue(proof.keyId===config.keyId&&typeof proof.nonce==='string'&&typeof proof.time==='string'&&/^[A-Za-z0-9_-]{43}$/.test(proof.nonce)&&/^\d{13}$/.test(proof.time)&&
  Math.abs(now-Number(proof.time))<=15_000&&Buffer.byteLength(bytes)<=8192&&[...paths.erp,...paths.site].includes(path)&&
  secureEqual(proof.signature,mac(config,frame(config,'REQUEST',path,proof.nonce,proof.time,0,bytes))));
 return Object.freeze({...proof});
}
export function signResponse(config,path,bytes,request,status=200){return mac(config,frame(config,'RESPONSE',path,request.nonce,request.time,status,bytes));}
export function proofHeaders(proof){return {'x-knaba-federation-key':proof.keyId,'x-knaba-federation-nonce':proof.nonce,'x-knaba-federation-time':proof.time,'x-knaba-federation-signature':proof.signature};}
export function readProof(headers){const value=name=>typeof headers.get==='function'?headers.get(name):headers[name];return {keyId:value('x-knaba-federation-key'),nonce:value('x-knaba-federation-nonce'),time:value('x-knaba-federation-time'),signature:value('x-knaba-federation-signature')};}

/** One bounded no-redirect call. Only configured origins and protocol paths are reachable. */
export async function peerRequest(config,target,path,body,{fetchImpl=fetch,timeoutMs=1500}={}){
 requireActive(config);requireValue(paths[target]?.has(path)&&Number.isInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=3000,'VALIDATION_ERROR');
 const bytes=Buffer.from(JSON.stringify(body));requireValue(bytes.length<=8192,'VALIDATION_ERROR');
 const proof=signRequest(config,path,bytes),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const url=(target==='site'?config.siteOrigin:config.erpOrigin)+path;
  const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',...proofHeaders(proof)},body:bytes,redirect:'error',signal:controller.signal});
  requireValue(response.url===url&&response.status===200&&response.body,'DEPENDENCY_UNAVAILABLE');
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;requireValue(size<=8192,'DEPENDENCY_UNAVAILABLE');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});}
  const returned=Buffer.concat(chunks);requireActive(config);
  requireValue(Date.now()-Number(proof.time)<=timeoutMs+1000&&secureEqual(response.headers.get('x-knaba-federation-response'),signResponse(config,path,returned,proof)),'DEPENDENCY_UNAVAILABLE');
  try{return JSON.parse(returned.toString('utf8'));}catch{throw new FederationError('DEPENDENCY_UNAVAILABLE');}
 }catch(error){if(error instanceof FederationError)throw error;throw new FederationError('DEPENDENCY_UNAVAILABLE');}
 finally{clearTimeout(timer);controller.abort();}
}
