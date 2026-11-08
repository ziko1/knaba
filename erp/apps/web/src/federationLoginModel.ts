import {ApiError,type Session} from './api';

export type LoginClient={clientId:string;kind:'WEB'|'NATIVE';platform:'WEB'|'ANDROID'|'IOS';label:string;redirectUri?:string};
export type LoginAuthority={authorityId:string;label:string;siteOrigin:string};
export type LoginConfiguration={enabled:false}|{enabled:true;authorizationIssuer:string;authorities:LoginAuthority[];clients:LoginClient[]};
export type LoginState='CREATED'|'BROWSER_BOUND'|'SOURCE_APPROVED'|'CODE_ISSUED'|'COMPLETE'|'CANCELLED'|'EXPIRED'|'DENIED';
export type LoginRequest={requestId:string;state:LoginState;version:number;expiresAt:string;client:LoginClient;companyLabel:string;
  erpUserLabel?:string;siteLabel?:string;requiresErpMfa?:boolean;authorizationIssuer:string;callbackState?:string;csrfToken:string;sourceAuthorizationUrl:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const identifier=/^[A-Za-z0-9_-]{1,64}$/,nonce=/^[A-Za-z0-9_-]{43}$/;
const states=new Set<LoginState>(['CREATED','BROWSER_BOUND','SOURCE_APPROVED','CODE_ISSUED','COMPLETE','CANCELLED','EXPIRED','DENIED']);
const record=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=160):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
function requireValue(value:unknown):asserts value{if(!value)throw new ApiError('FEDERATION_INVALID',502);}
function exact(value:unknown,required:string[],optional:string[]=[]):asserts value is Record<string,any>{
  requireValue(record(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key)));
}
function url(value:unknown){requireValue(text(value,2048));try{return new URL(value);}catch{throw new ApiError('FEDERATION_INVALID',502);}}
function client(value:unknown):LoginClient{
  exact(value,['clientId','kind','platform','label'],['redirectUri']);requireValue(identifier.test(value.clientId)&&text(value.label,80));
  if(value.kind==='WEB')requireValue(value.platform==='WEB'&&value.redirectUri===undefined);
  else{
    requireValue(value.kind==='NATIVE'&&['ANDROID','IOS'].includes(value.platform));
    const destination=url(value.redirectUri);
    requireValue(!destination.username&&!destination.password&&!destination.search&&!destination.hash&&destination.pathname.startsWith('/')&&
      (destination.protocol==='https:'&&Boolean(destination.hostname)||/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+:$/.test(destination.protocol)&&!destination.host));
  }
  return Object.freeze({...value}) as LoginClient;
}
export function parseLoginConfiguration(value:unknown,origin:string):LoginConfiguration{
  if(record(value)&&value.enabled===false){exact(value,['enabled']);return {enabled:false};}
  exact(value,['enabled','authorizationIssuer','authorities','clients']);requireValue(value.enabled===true&&value.authorizationIssuer===origin+'/auth/federation');
  requireValue(Array.isArray(value.authorities)&&value.authorities.length>0&&value.authorities.length<=8&&Array.isArray(value.clients)&&value.clients.length>0&&value.clients.length<=16);
  const authorities:LoginAuthority[]=value.authorities.map((row:unknown)=>{
    exact(row,['authorityId','label','siteOrigin']);requireValue(identifier.test(row.authorityId)&&text(row.label,160));
    const source=url(row.siteOrigin);requireValue(source.protocol==='https:'&&source.origin===row.siteOrigin&&!source.username&&!source.password);
    return {...row} as LoginAuthority;
  });
  const clients:LoginClient[]=value.clients.map(client);
  requireValue(new Set(authorities.map(row=>row.authorityId)).size===authorities.length&&new Set(clients.map(row=>row.clientId)).size===clients.length);
  return {enabled:true,authorizationIssuer:value.authorizationIssuer,authorities,clients};
}
export function loginRequestId(search:string){
  const params=new URLSearchParams(search),keys=[...params.keys()];
  requireValue(keys.length===1&&keys[0]==='request_id'&&uuid.test(params.get('request_id')??''));return params.get('request_id')!;
}
export function parseLoginStart(value:unknown,origin:string){
  exact(value,['requestId','authorizationUrl','expiresAt']);requireValue(uuid.test(value.requestId)&&text(value.expiresAt,32)&&Number.isFinite(Date.parse(value.expiresAt)));
  requireValue(value.authorizationUrl===origin+'/auth/federation/authorize?request_id='+value.requestId);
  return {...value} as {requestId:string;authorizationUrl:string;expiresAt:string};
}
export function parseLoginRequest(value:unknown,id:string,configuration:LoginConfiguration):LoginRequest{
  requireValue(configuration.enabled);
  exact(value,['requestId','state','version','expiresAt','client','companyLabel','authorizationIssuer','csrfToken','sourceAuthorizationUrl'],
    ['erpUserLabel','siteLabel','requiresErpMfa','callbackState']);
  requireValue(value.requestId===id&&uuid.test(id)&&states.has(value.state)&&Number.isSafeInteger(value.version)&&value.version>0&&
    text(value.expiresAt,32)&&Number.isFinite(Date.parse(value.expiresAt))&&text(value.companyLabel,160)&&text(value.csrfToken,200)&&
    value.authorizationIssuer===configuration.authorizationIssuer);
  const currentClient=client(value.client),registered=configuration.clients.find(row=>row.clientId===currentClient.clientId);
  requireValue(registered&&['kind','platform','label','redirectUri'].every(key=>registered[key as keyof LoginClient]===currentClient[key as keyof LoginClient]));
  if(currentClient.kind==='NATIVE')requireValue(nonce.test(value.callbackState));else requireValue(value.callbackState===undefined);
  for(const key of ['erpUserLabel','siteLabel'])if(value[key]!==undefined)requireValue(text(value[key],160));
  if(value.requiresErpMfa!==undefined)requireValue(typeof value.requiresErpMfa==='boolean');
  if(value.state==='SOURCE_APPROVED')requireValue(value.erpUserLabel!==undefined&&value.siteLabel!==undefined&&typeof value.requiresErpMfa==='boolean');
  const source=url(value.sourceAuthorizationUrl),authority=configuration.authorities.find(row=>row.siteOrigin===source.origin&&row.authorityId===source.searchParams.get('authority_id'));
  requireValue(authority&&value.sourceAuthorizationUrl===authority.siteOrigin+'/account/erp-login/?authority_id='+authority.authorityId+'&request_id='+id);
  return {...value,client:currentClient} as LoginRequest;
}
export function nativeAuthorizationResponse(value:unknown,request:LoginRequest){
  exact(value,['requestId','state','version','authorizationResponseUrl']);
  requireValue(request.client.kind==='NATIVE'&&value.requestId===request.requestId&&value.state==='CODE_ISSUED'&&Number.isSafeInteger(value.version)&&value.version>request.version);
  const response=url(value.authorizationResponseUrl),registered=url(request.client.redirectUri),params=response.searchParams;
  requireValue(!response.username&&!response.password&&!response.hash&&response.protocol===registered.protocol&&response.host===registered.host&&response.pathname===registered.pathname&&
    [...params.keys()].length===3&&['code','state','iss'].every(key=>params.getAll(key).length===1)&&
    /^K3C\.[A-Za-z0-9_-]{43}$/.test(params.get('code')??'')&&params.get('state')===request.callbackState&&params.get('iss')===request.authorizationIssuer);
  // Compare the exact registered base, not a normalized/decoded approximation.
  requireValue(value.authorizationResponseUrl.slice(0,value.authorizationResponseUrl.indexOf('?'))===request.client.redirectUri);
  return value.authorizationResponseUrl as string;
}
export function webAuthorizationResponse(value:unknown):{session:Session;returnPath:string}{
  exact(value,['actor','user','mode','csrfToken','expiresAt','returnPath']);
  requireValue(record(value.actor)&&record(value.user)&&text(value.actor.userId)&&text(value.actor.companyId)&&text(value.mode,32)&&text(value.csrfToken,200)&&
    typeof value.returnPath==='string'&&/^\/[A-Za-z0-9/_-]{0,160}$/.test(value.returnPath)&&!value.returnPath.startsWith('//')&&
    text(value.expiresAt,32)&&Number.isFinite(Date.parse(value.expiresAt)));
  for(const key of ['roles','permissions','siteIds','customerIds','warehouseIds'])requireValue(Array.isArray(value.actor[key])&&value.actor[key].every((item:unknown)=>text(item,200)));
  return {session:value as unknown as Session,returnPath:value.returnPath};
}
/** Isolated flow CSRF never overwrites the application's ERP/guest CSRF state. */
export async function federationRequest(path:string,{body,csrfToken,idempotencyKey,signal}: {body?:unknown;csrfToken?:string;idempotencyKey?:string;signal?:AbortSignal}={}){
  requireValue(/^\/api\/v1\/auth\/federation\/(?:config|start|requests\/[a-f0-9-]{36}(?:\/(?:bind|confirm|cancel))?)$/.test(path));
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,10000);
  if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
  try{
    const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,
      headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(csrfToken?{'X-CSRF-Token':csrfToken}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    requireValue(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()==='application/json');
    const reader=response.body?.getReader();requireValue(reader);let count=0;const chunks:Uint8Array[]=[];
    try{for(;;){const part=await reader.read();if(part.done)break;count+=part.value.byteLength;if(count>32768){await reader.cancel();throw new ApiError('FEDERATION_INVALID',502);}chunks.push(part.value);}}
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ApiError('FEDERATION_INVALID',502);}
    if(!response.ok){const code=record(value)?value.error?.code??value.code:null;throw new ApiError(typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code)?code:'FEDERATION_UNAVAILABLE',response.status);}
    return value;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
