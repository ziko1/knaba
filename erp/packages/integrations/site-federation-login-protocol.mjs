import {createHash} from 'node:crypto';
import {canonicalJson,FederationProtocolError} from './site-federation-protocol.mjs';

export const FEDERATION_LOGIN_PENDING_MS=300000;
export const FEDERATION_LOGIN_CODE_MS=60000;
export const FEDERATION_LOGIN_PROOF_MS=10000;
export const FEDERATION_LOGIN_ACTIONS=Object.freeze(['LOGIN_INSPECT','LOGIN_APPROVE','LOGIN_STATUS']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hex=/^[a-f0-9]{64}$/,nonce=/^[A-Za-z0-9_-]{43}$/,identifier=/^[A-Za-z0-9_-]{1,64}$/;
const states=['CREATED','BROWSER_BOUND','SOURCE_APPROVED','CODE_ISSUED','COMPLETE','CANCELLED','EXPIRED','DENIED'];
const refKeys=['subject','sessionRef','epoch','securityFingerprint','sourcePolicyVersion'];
const policyKeys=['loginPolicyVersion','loginPolicyFingerprint','sourceLoginPolicyFingerprint'];
const fail=()=>{throw new FederationProtocolError('FEDERATION_INVALID');};
const requireValue=value=>{if(!value)fail();};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function exact(value,required,optional=[]){requireValue(plain(value)&&required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k)));return value;}
const integer=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;
const text=(value,max=128)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const subject=value=>text(value,128)&&Buffer.byteLength(value,'utf8')<=128&&!/[\u0000-\u0020\u007f]/.test(value);
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const sha=value=>createHash('sha256').update(value).digest('hex');
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const copy=value=>freeze(JSON.parse(canonicalJson(value)));
function url(value){requireValue(text(value,2048));try{return new URL(value);}catch{fail();}}
function webUrl(value){const u=url(value);requireValue(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash);return value;}
function authorityList(values,known){requireValue(Array.isArray(values)&&values.length>0&&values.length<=8&&values.every(v=>typeof v==='string'&&identifier.test(v)&&known.includes(v))&&new Set(values).size===values.length);return [...values].sort();}
function disabled(value){if(value===null||value===undefined)return true;if(plain(value)&&value.enabled===false){exact(value,['enabled']);return true;}return false;}

export function normalizeSourceLoginPolicy(value,{authorityIds}){
 if(disabled(value))return null;exact(value,['enabled','authorityIds','policyVersion']);requireValue(value.enabled===true&&integer(value.policyVersion));
 return copy({enabled:true,authorityIds:authorityList(value.authorityIds,authorityIds),policyVersion:value.policyVersion});
}
export function normalizeFederationLoginPolicy(value,{erpOrigin,authorityIds,appMode}){
 if(disabled(value))return null;exact(value,['enabled','policyVersion','authorizationIssuer','authorityIds','clients']);
 const origin=url(erpOrigin);requireValue(origin.origin===erpOrigin&&!origin.username&&!origin.password&&(origin.protocol==='https:'||appMode==='TEST'&&origin.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname)));
 requireValue(value.enabled===true&&integer(value.policyVersion)&&value.authorizationIssuer===erpOrigin+'/auth/federation');
 requireValue(Array.isArray(value.clients)&&value.clients.length>0&&value.clients.length<=16);
 const clients=value.clients.map(client=>{
  const native=client?.kind==='NATIVE';exact(client,['clientId','kind','platform','label',native?'redirectUri':'returnPath']);
  requireValue(identifier.test(client.clientId)&&text(client.label,80));
  if(native){
   requireValue(['ANDROID','IOS'].includes(client.platform));const target=url(client.redirectUri);
   requireValue(!target.username&&!target.password&&!target.search&&!target.hash&&target.pathname.startsWith('/'));
   requireValue(target.protocol==='https:'&&!!target.hostname||appMode==='TEST'&&/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+:$/.test(target.protocol)&&!target.host);
  }else requireValue(client.kind==='WEB'&&client.platform==='WEB'&&typeof client.returnPath==='string'&&/^\/[A-Za-z0-9/_-]{0,160}$/.test(client.returnPath)&&!client.returnPath.startsWith('//'));
  return client;
 });
 requireValue(new Set(clients.map(c=>c.clientId)).size===clients.length);
 return copy({enabled:true,policyVersion:value.policyVersion,authorizationIssuer:value.authorizationIssuer,authorityIds:authorityList(value.authorityIds,authorityIds),clients:[...clients].sort((a,b)=>a.clientId.localeCompare(b.clientId))});
}
export function federationLoginPolicyFingerprint(policy){requireValue(policy?.enabled===true);return sha('KNABA-ERP-FEDERATION-LOGIN-POLICY-v1\0'+canonicalJson(policy));}
export function sourceLoginPolicyFingerprint(policy){requireValue(policy?.enabled===true);return sha('KNABA-SOURCE-FEDERATION-LOGIN-POLICY-v1\0'+canonicalJson(policy));}
function sourceRef(value){requireValue(subject(value.subject)&&nonce.test(value.sessionRef)&&integer(value.epoch)&&hex.test(value.securityFingerprint)&&integer(value.sourcePolicyVersion));}
function loginPolicyRef(value){requireValue(integer(value.loginPolicyVersion)&&hex.test(value.loginPolicyFingerprint)&&hex.test(value.sourceLoginPolicyFingerprint));}
function requestRef(value){requireValue(uuid.test(value.requestId)&&hex.test(value.requestBinding));}

export function parseFederationLoginAction(action,payload){
 requireValue(FEDERATION_LOGIN_ACTIONS.includes(action));
 if(action==='LOGIN_INSPECT'){exact(payload,['requestId']);requireValue(uuid.test(payload.requestId));return copy(payload);}
 if(action==='LOGIN_STATUS'){exact(payload,['requestId','requestBinding',...refKeys]);requestRef(payload);sourceRef(payload);return copy(payload);}
 exact(payload,['requestId','requestBinding','expectedVersion',...refKeys,'reauthAt','sessionExpiresAt','siteLabel',...policyKeys]);
 requestRef(payload);sourceRef(payload);loginPolicyRef(payload);
 requireValue(integer(payload.expectedVersion)&&instant(payload.reauthAt)&&instant(payload.sessionExpiresAt)&&text(payload.siteLabel,120));return copy(payload);
}
function clientResult(value){exact(value,['clientId','kind','platform','label']);requireValue(identifier.test(value.clientId)&&text(value.label,80)&&((value.kind==='WEB'&&value.platform==='WEB')||(value.kind==='NATIVE'&&['ANDROID','IOS'].includes(value.platform))));}
export function parseFederationLoginActionResult(action,value){
 requireValue(FEDERATION_LOGIN_ACTIONS.includes(action));
 if(action==='LOGIN_INSPECT'){
  exact(value,['requestId','requestBinding','version','expiresAt','companyLabel','client','returnUrl','loginPolicyVersion','loginPolicyFingerprint']);requestRef(value);clientResult(value.client);
  requireValue(integer(value.version)&&instant(value.expiresAt)&&text(value.companyLabel,120)&&integer(value.loginPolicyVersion)&&hex.test(value.loginPolicyFingerprint));webUrl(value.returnUrl);
 }else if(action==='LOGIN_APPROVE'){
  exact(value,['requestId','state','version','expiresAt','returnUrl']);requireValue(uuid.test(value.requestId)&&value.state==='SOURCE_APPROVED'&&integer(value.version)&&instant(value.expiresAt));webUrl(value.returnUrl);
 }else{
  exact(value,['requestId','state','version','expiresAt']);requireValue(uuid.test(value.requestId)&&states.includes(value.state)&&integer(value.version)&&instant(value.expiresAt));
 }
 return copy(value);
}
export function parseFederationLoginIntrospection(payload){
 const use=payload?.purpose==='SESSION_USE';requireValue(use||payload?.purpose==='SESSION_ISSUE');
 exact(payload,['purpose','requestId','requestBinding',...refKeys,...policyKeys,...(use?['erpSessionId']:[])]);
 requestRef(payload);sourceRef(payload);loginPolicyRef(payload);if(use)requireValue(uuid.test(payload.erpSessionId));return copy(payload);
}
export function parseFederationLoginIntrospectionResult(value){
 if(value?.active===false){exact(value,['active']);return copy(value);}
 const use=value?.purpose==='SESSION_USE';requireValue(value?.active===true&&(use||value.purpose==='SESSION_ISSUE'));
 exact(value,['active','purpose','requestId','requestBinding',...refKeys,...policyKeys,'generation','checkedAt','validUntil','sessionExpiresAt','reauthAt',...(use?['erpSessionId']:[])]);
 requestRef(value);sourceRef(value);loginPolicyRef(value);if(use)requireValue(uuid.test(value.erpSessionId));
 requireValue(integer(value.generation)&&[value.checkedAt,value.validUntil,value.sessionExpiresAt,value.reauthAt].every(instant));
 requireValue(Date.parse(value.validUntil)>Date.parse(value.checkedAt)&&Date.parse(value.validUntil)-Date.parse(value.checkedAt)<=FEDERATION_LOGIN_PROOF_MS);
 return copy(value);
}
export function parseFederationLoginStart(value,policy){
 requireValue(policy?.enabled===true&&plain(value));const client=policy.clients.find(c=>c.clientId===value.clientId);requireValue(client&&policy.authorityIds.includes(value.authorityId));
 if(client.kind==='WEB')exact(value,['authorityId','clientId']);
 else{
  exact(value,['authorityId','clientId','redirectUri','state','codeChallenge','codeChallengeMethod']);
  requireValue(value.redirectUri===client.redirectUri&&nonce.test(value.state)&&nonce.test(value.codeChallenge)&&value.codeChallengeMethod==='S256');
 }
 return copy(value);
}
export function parseFederationLoginToken(value){
 exact(value,['grantType','clientId','redirectUri','code','codeVerifier']);
 requireValue(value.grantType==='authorization_code'&&identifier.test(value.clientId)&&text(value.redirectUri,2048)&&/^K3C\.[A-Za-z0-9_-]{43}$/.test(value.code));
 pkceS256(value.codeVerifier);return copy(value);
}
export function pkceS256(verifier){requireValue(typeof verifier==='string'&&/^[A-Za-z0-9._~-]{43,128}$/.test(verifier));return createHash('sha256').update(verifier,'ascii').digest('base64url');}
export function federationLoginRequestBinding(tuple){
 exact(tuple,['companyId','authorityId','requestId','clientId','kind','platform','redirectUri','codeChallenge','stateHash','expiresAt','loginPolicyFingerprint']);
 requireValue(subject(tuple.companyId)&&identifier.test(tuple.authorityId)&&uuid.test(tuple.requestId)&&identifier.test(tuple.clientId)&&instant(tuple.expiresAt)&&hex.test(tuple.loginPolicyFingerprint));
 if(tuple.kind==='WEB')requireValue(tuple.platform==='WEB'&&tuple.redirectUri===null&&tuple.codeChallenge===null&&tuple.stateHash===null);
 else requireValue(tuple.kind==='NATIVE'&&['ANDROID','IOS'].includes(tuple.platform)&&text(tuple.redirectUri,2048)&&nonce.test(tuple.codeChallenge)&&hex.test(tuple.stateHash));
 return sha('KNABA-FEDERATION-LOGIN-REQUEST-v1\0'+canonicalJson(tuple));
}
