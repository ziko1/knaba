import {afterEach,expect,it,vi} from 'vitest';
import {api,clearSession} from './api';
import {federationRequest,loginRequestId,nativeAuthorizationResponse,parseLoginConfiguration,parseLoginRequest,parseLoginStart,webAuthorizationResponse} from './federationLoginModel';

const origin='https://erp.example.test',id='239fa9de-232a-4144-a969-425b929a4f6a',state='s'.repeat(43),code='K3C.'+'c'.repeat(43);
const web={clientId:'knaba-web-v1',kind:'WEB',platform:'WEB',label:'KNABA Web'};
const native={clientId:'knaba-android-v1',kind:'NATIVE',platform:'ANDROID',label:'KNABA Android',redirectUri:'https://app.example.test/auth/knaba/android'};
const config={enabled:true,authorizationIssuer:origin+'/auth/federation',authorities:[{authorityId:'site',label:'Synthetic Company',siteOrigin:'https://site.example.test'}],clients:[web,native]};
const status=(client=web)=>({requestId:id,state:'SOURCE_APPROVED',version:3,expiresAt:new Date(Date.now()+300000).toISOString(),client,
  companyLabel:'Synthetic Company',erpUserLabel:'Synthetic ERP account',siteLabel:'Synthetic site account',requiresErpMfa:true,authorizationIssuer:config.authorizationIssuer,
  csrfToken:'synthetic-flow-csrf',sourceAuthorizationUrl:'https://site.example.test/account/erp-login/?authority_id=site&request_id='+id,...(client.kind==='NATIVE'?{callbackState:state}:{})});
const nativeRequest=()=>parseLoginRequest(status(native),id,parseLoginConfiguration(config,origin));
const callback=()=>native.redirectUri+'?'+new URLSearchParams({code,state,iss:config.authorizationIssuer}).toString();
const response=(authorizationResponseUrl=callback())=>({requestId:id,state:'CODE_ISSUED',version:4,authorizationResponseUrl});
afterEach(()=>{clearSession();vi.unstubAllGlobals();vi.useRealTimers();});

it('discovery is default-off and permits only registered, bounded server-owned metadata',()=>{
  expect(parseLoginConfiguration({enabled:false},origin)).toEqual({enabled:false});
  expect(parseLoginConfiguration(config,origin)).toEqual(config);
  for(const value of [{enabled:false,clients:[native]},{...config,authorizationIssuer:'https://site.example.test/identity'},
    {...config,clients:[native,native]},{...config,authorities:[{...config.authorities[0],siteOrigin:'https://site.example.test/path'}]},
    {...config,clients:[{...native,redirectUri:'javascript:alert(1)'}]},{...config,clients:[{...native,redirectUri:native.redirectUri+'?redirect=other'}]}])
    expect(()=>parseLoginConfiguration(value,origin)).toThrow();
});
it('pending handles reject duplicate/query-injected IDs and start URLs on a different origin or path',()=>{
  expect(loginRequestId('?request_id='+id)).toBe(id);
  for(const input of ['?request_id='+id+'&request_id='+id,'?request_id='+id+'&code=secret','?request_id=other',''])expect(()=>loginRequestId(input)).toThrow();
  const started={requestId:id,authorizationUrl:origin+'/auth/federation/authorize?request_id='+id,expiresAt:status().expiresAt};
  expect(parseLoginStart(started,origin)).toEqual(started);
  for(const authorizationUrl of ['https://attacker.example.test/auth/federation/authorize?request_id='+id,started.authorizationUrl+'&return_to=/console',origin+'/auth/federation/return?request_id='+id])
    expect(()=>parseLoginStart({...started,authorizationUrl},origin)).toThrow();
});
it('status binds the source URL, exact registered client, issuer, pending handle and explicit account labels',()=>{
  const policy=parseLoginConfiguration(config,origin),valid=status();expect(parseLoginRequest(valid,id,policy)).toEqual(valid);
  const {erpUserLabel,...missing}=valid;
  for(const value of [missing,{...valid,requestId:'00000000-0000-4000-8000-000000000000'},{...valid,client:native},
    {...valid,sourceAuthorizationUrl:'https://attacker.example.test/account/erp-login/?authority_id=site&request_id='+id},
    {...valid,sourceAuthorizationUrl:valid.sourceAuthorizationUrl+'&return_to='+encodeURIComponent(origin)},
    {...valid,authorizationIssuer:origin+'/other'},{...valid,requiresErpMfa:'false'},{...valid,callbackState:state}])
    expect(()=>parseLoginRequest(value,id,policy)).toThrow();
});
it('native response allows a one-use code only on the exact registered callback and checks state and ERP issuer',()=>{
  expect(nativeAuthorizationResponse(response(),nativeRequest())).toBe(callback());
});
it.each([
  ['wrong issuer',()=>callback().replace(encodeURIComponent(config.authorizationIssuer),encodeURIComponent('https://site.example.test/identity'))],
  ['wrong state',()=>callback().replace('state='+state,'state='+'q'.repeat(43))],
  ['wrong redirect path',()=>callback().replace('/auth/knaba/android?','/auth/knaba/ios?')],
  ['wrong origin',()=>callback().replace('app.example.test','attacker.example.test')],
  ['normalized path alias',()=>callback().replace('/auth/knaba/android?','/auth/other/../knaba/android?')],
  ['userinfo',()=>callback().replace('https://','https://user:pass@')],
  ['fragment',()=>callback()+'#secret'],
  ['duplicate code',()=>callback()+'&code='+code],
  ['additional query',()=>callback()+'&return_to=/console'],
  ['actual session credential',()=>callback().replace(code,'KF3.'+'c'.repeat(43))],
  ['missing code',()=>callback().replace('code='+code+'&','')],
])('native callback rejects %s without returning a navigation target',(_name,make)=>{
  expect(()=>nativeAuthorizationResponse(response(make()),nativeRequest())).toThrow();
});
it('native response never repurposes a WEB request or an unchanged/foreign request version',()=>{
  expect(()=>nativeAuthorizationResponse(response(),parseLoginRequest(status(),id,parseLoginConfiguration(config,origin)))).toThrow();
  for(const patch of [{version:3},{requestId:'00000000-0000-4000-8000-000000000000'},{state:'COMPLETE'},{token:'secret'}])
    expect(()=>nativeAuthorizationResponse({...response(),...patch},nativeRequest())).toThrow();
});
it('WEB completion requires a current session shape and a safe server-owned return path',()=>{
  const value={actor:{userId:'synthetic-user',companyId:'synthetic-company',roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],customerIds:[],warehouseIds:[]},
    user:{name:'Synthetic'},mode:'TEST',csrfToken:'synthetic-erp-proof',expiresAt:status().expiresAt,returnPath:'/console'};
  expect(webAuthorizationResponse(value).returnPath).toBe('/console');
  for(const returnPath of ['//attacker.example.test','https://attacker.example.test','/console?token=secret','/../admin','/\\attacker.example.test'])expect(()=>webAuthorizationResponse({...value,returnPath})).toThrow();
  expect(()=>webAuthorizationResponse({...value,actor:{...value.actor,roles:'OWNER'}})).toThrow();
});
it('flow CSRF remains isolated from ERP and guest proofs; private flow fetch never follows redirects',async()=>{
  const calls:Array<{path:string;options:RequestInit}>=[];
  vi.stubGlobal('fetch',async(path:string,options:RequestInit)=>{
    calls.push({path,options});return Response.json(path==='/api/v1/me'?{csrfToken:'ERP_CSRF'}:path==='/api/v1/public/leads'?{csrfToken:'GUEST_CSRF'}:
      path.includes('/auth/federation/')?{csrfToken:'FLOW_CSRF'}:{});
  });
  await api('/api/v1/me');await api('/api/v1/public/leads',{method:'POST',body:'{}'});
  await federationRequest('/api/v1/auth/federation/requests/'+id);
  await federationRequest('/api/v1/auth/federation/requests/'+id+'/confirm',{body:{expectedVersion:3,confirmed:true},csrfToken:'FLOW_CSRF'});
  await api('/api/v1/commands/task.start',{method:'POST',body:'{}'});await api('/api/v1/public/chat',{method:'POST',body:'{}'});
  expect((calls[3].options.headers as any)['X-CSRF-Token']).toBe('FLOW_CSRF');
  expect((calls[4].options.headers as any)['X-CSRF-Token']).toBe('ERP_CSRF');expect((calls[5].options.headers as any)['X-CSRF-Token']).toBe('GUEST_CSRF');
  expect(calls[3].options).toMatchObject({credentials:'same-origin',cache:'no-store',redirect:'error'});
});
it('source and arbitrary external endpoints cannot be reached through the flow transport',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  for(const path of ['https://attacker.example.test/api','/api/v1/auth/federation/requests/'+id+'?code=secret','/api/v1/auth/logout','/api/v1/auth/federation/token'])
    await expect(federationRequest(path)).rejects.toMatchObject({code:'FEDERATION_INVALID'});
  expect(fetch).not.toHaveBeenCalled();
});
it('oversized bodies are bounded cumulatively, including absent content-length, before JSON parsing',async()=>{
  let cancelled=false;
  vi.stubGlobal('fetch',async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(20000));controller.enqueue(new Uint8Array(20000));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}}));
  await expect(federationRequest('/api/v1/auth/federation/config')).rejects.toMatchObject({code:'FEDERATION_INVALID'});expect(cancelled).toBe(true);
});
it('malformed encoding/JSON and non-JSON redirect pages cannot become successful flow objects',async()=>{
  for(const response of [new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}}),
    new Response(new Uint8Array([0xff,0xfe]),{headers:{'Content-Type':'application/json'}}),
    new Response('{broken',{headers:{'Content-Type':'application/json'}})]){
    vi.stubGlobal('fetch',async()=>response);await expect(federationRequest('/api/v1/auth/federation/config')).rejects.toMatchObject({code:'FEDERATION_INVALID'});
  }
});
it('public errors are bounded codes and caller cancellation cannot leave an active flow request',async()=>{
  vi.stubGlobal('fetch',async()=>Response.json({error:{code:'FEDERATION_CONFLICT',privateDetail:'synthetic secret'}},{status:409}));
  await expect(federationRequest('/api/v1/auth/federation/config')).rejects.toMatchObject({code:'FEDERATION_CONFLICT',status:409,details:{}});
  vi.stubGlobal('fetch',async(_path:string,{signal}:{signal:AbortSignal})=>new Promise((_resolve,reject)=>{
    if(signal.aborted)reject(new DOMException('Aborted','AbortError'));else signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  }));
  const controller=new AbortController(),pending=federationRequest('/api/v1/auth/federation/config',{signal:controller.signal});controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});
});
