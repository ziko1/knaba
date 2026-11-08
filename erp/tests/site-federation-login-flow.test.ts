import {describe,it,expect} from 'vitest';
import type {Request} from 'express';
import {createHash,randomUUID} from 'node:crypto';
import * as OTPAuth from 'otpauth';
import {defer,lastValueFrom} from 'rxjs';
import {csrfFor,hashToken,sealSecret} from '../apps/api/auth.ts';
import {loginSourceDataSchema} from '../apps/api/site-federation-login-model.ts';
import {siteLinkCredentialFingerprint} from '../apps/api/site-link-reauth.ts';
import {RequestAuthorityInterceptor} from '../apps/api/request-authority-interceptor.ts';
import {federationLoginRequestBinding,pkceS256} from '../packages/integrations/site-federation-login-protocol.mjs';
import {federatedSessionFixture} from './fixtures/site-federated-session.ts';

const hash=(domain:string,value:string)=>createHash('sha256').update(domain+'\0'+value).digest('hex');
function approvedFixture(kind:'WEB'|'NATIVE'='WEB',mfa=false){
 const f=federatedSessionFixture(),id=randomUUID(),flow='g'.repeat(43),verifier='v'.repeat(43),state='n'.repeat(43),now=new Date().toISOString(),expiresAt=new Date(Date.now()+300000).toISOString();
 f.db.put('company',f.db.companyId,{name:'Human Company Name'});
 if(mfa)f.db.credentials.get('erp-user')!.totp_secret=sealSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',f.auth.options.encryptionKey);
 const source=loginSourceDataSchema.strip().parse({...f.data,erpCredentialFingerprint:siteLinkCredentialFingerprint(f.db.entities.get('user:erp-user')!,f.db.credentials.get('erp-user'))});
 const data={authorityConfigFingerprint:f.data.authorityConfigFingerprint,loginPolicyFingerprint:f.data.loginPolicyFingerprint,clientId:kind==='WEB'?'web':'android',clientKind:kind,platform:kind==='WEB'?'WEB':'ANDROID',clientLabel:kind==='WEB'?'KNABA Web':'KNABA Android',authorizationIssuer:f.config.erpOrigin+'/auth/federation',redirectUri:kind==='NATIVE'?'https://app.example.test/auth/android':null,codeChallenge:kind==='NATIVE'?pkceS256(verifier):null,nativeState:kind==='NATIVE'?state:null,returnPath:kind==='WEB'?'/console':null,parentSessionHash:null,parentSessionPresent:false};
 const binding=federationLoginRequestBinding({companyId:f.db.companyId,authorityId:f.config.authorityId,requestId:id,clientId:data.clientId,kind,platform:data.platform as any,redirectUri:data.redirectUri,codeChallenge:data.codeChallenge,stateHash:kind==='NATIVE'?hashToken(state):null,expiresAt,loginPolicyFingerprint:data.loginPolicyFingerprint});
 const row={company_id:f.db.companyId,id,start_key_hash:'a'.repeat(64),input_hash:'b'.repeat(64),authority_id:f.config.authorityId,request_binding:binding,request_data:data,flow_hash:hash('KNABA-F3-FLOW-v1',flow),source_data:source,state:'SOURCE_APPROVED',version:3,inspect_count:1,code_hash:null,code_expires_at:null,erp_mfa_at:null,result_session_id:null,created_at:now,expires_at:expiresAt};f.db.requests.set(id,row);
 const headers:Record<string,string>={origin:f.config.erpOrigin,cookie:'__Host-knaba-federation-flow='+flow,'x-csrf-token':csrfFor(flow),'idempotency-key':'synthetic-flow-start-key'};
 const request=()=>({get:(name:string)=>headers[name.toLowerCase()],ip:'127.0.0.1',query:{}} as unknown as Request);
 const invoke=<T>(req:Request,fn:()=>Promise<T>)=>lastValueFrom(new RequestAuthorityInterceptor().intercept({switchToHttp:()=>({getRequest:()=>req,getResponse:()=>f.res})} as any,{handle:()=>defer(fn)})) as Promise<T>;
 const confirm=(otp?:string)=>{const req=request();return invoke(req,()=>f.logins.confirm(req,f.res,id,{expectedVersion:3,confirmed:true,...(otp?{otp}:{})}));};
 const redeem=(code:string,codeVerifier=verifier)=>{const req=request();return invoke(req,()=>f.logins.redeem(req,f.res,{grantType:'authorization_code',clientId:'android',redirectUri:data.redirectUri,code,codeVerifier}));};
 return {...f,id,flow,verifier,state,row,approvalSource:source,data,headers,request,invoke,confirm,redeem};
}

describe('F3 issuance flow with explicit SQL doubles and real service/crypto/egress checks',()=>{
 it('starts idempotently, binds once and rejects another browser',async()=>{
  const f=approvedFixture();const body={authorityId:f.config.authorityId,clientId:'web'},first=await f.logins.start(f.request(),body),again=await f.logins.start(f.request(),body);expect(again).toEqual(first);
  const bound=await f.logins.bind(f.request(),f.res,first.requestId,{});expect(bound.state).toBe('BROWSER_BOUND');const cookie=f.res.cookie.mock.calls.at(-1)![1];
  f.headers.cookie='__Host-knaba-federation-flow='+cookie;const calls=f.res.cookie.mock.calls.length;expect((await f.logins.bind(f.request(),f.res,first.requestId,{})).version).toBe(bound.version);expect(f.res.cookie.mock.calls.length).toBe(calls);
  f.headers.cookie='__Host-knaba-federation-flow='+'z'.repeat(43);await expect(f.logins.bind(f.request(),f.res,first.requestId,{})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('shows the current human company name, explicit boolean MFA and canonical source URL',async()=>{
  const f=approvedFixture(),req=f.request(),result=await f.invoke(req,()=>f.logins.status(req,f.id));
  expect(result).toMatchObject({companyLabel:'Human Company Name',requiresErpMfa:false,sourceAuthorizationUrl:f.config.siteOrigin+'/account/erp-login/?authority_id='+f.config.authorityId+'&request_id='+f.id});
 });
 it('completes WEB with a mandatory child, strict cookie and no durable raw credentials',async()=>{
  const f=approvedFixture(),before=f.db.children.size,result=await f.confirm();expect(result).toMatchObject({actor:{userId:'erp-user',companyId:f.db.companyId},returnPath:'/console'});
  expect(f.db.children.size).toBe(before+1);expect(f.db.requests.get(f.id)!.state).toBe('COMPLETE');
  const cookie=f.res.cookie.mock.calls.at(-1)!;expect(cookie[0]).toBe('knaba_session');expect(cookie[1]).toMatch(/^KF3\.[A-Za-z0-9_-]{43}$/);expect(cookie[2]).toMatchObject({sameSite:'strict',httpOnly:true,secure:true});
  const stored=JSON.stringify({requests:[...f.db.requests.values()],children:[...f.db.children.values()],sessions:[...f.db.authSessions.values()],audit:f.db.audits});expect(stored).not.toContain(cookie[1]);expect(stored).not.toContain(cookie[1].slice(4));
 });
 it('issues a JSON callback then a separate one-use native PKCE session',async()=>{
  const f=approvedFixture('NATIVE');f.headers.cookie+='; knaba_session=unrelated-invalid-browser-cookie';
  const before=f.db.children.size,confirmed:any=await f.confirm();expect(confirmed.state).toBe('CODE_ISSUED');expect(f.res.cookie).not.toHaveBeenCalled();expect(f.db.children.size).toBe(before);
  const url=new URL(confirmed.authorizationResponseUrl),code=url.searchParams.get('code')!;expect([...url.searchParams.keys()].sort()).toEqual(['code','iss','state']);expect(url.searchParams.get('state')).toBe(f.state);expect(url.searchParams.get('iss')).toBe(f.config.erpOrigin+'/auth/federation');
  await expect(f.redeem(code,'w'.repeat(43))).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(f.db.children.size).toBe(before);
  expect(await f.redeem(code)).toMatchObject({actor:{userId:'erp-user'}});expect(f.db.children.size).toBe(before+1);await expect(f.redeem(code)).rejects.toMatchObject({code:'FEDERATION_CONFLICT'});
  const stored=JSON.stringify({requests:[...f.db.requests.values()],children:[...f.db.children.values()],audit:f.db.audits});expect(stored).not.toContain(code);expect(stored).not.toContain(code.slice(4));expect(stored).not.toContain(f.verifier);
 });
 it('rejects late native code before any source call or new session',async()=>{
  const f=approvedFixture('NATIVE'),confirmed:any=await f.confirm(),code=new URL(confirmed.authorizationResponseUrl).searchParams.get('code')!,calls=f.source.calls,before=f.db.children.size;
  f.db.clockOffset=61000;await expect(f.redeem(code)).rejects.toMatchObject({code:'FEDERATION_CONFLICT'});expect(f.source.calls).toBe(calls);expect(f.db.children.size).toBe(before);
 });
 it('requires actual current TOTP, consumes its counter and keeps the true verification time',async()=>{
  const f=approvedFixture('NATIVE',true),before=f.db.children.size;await expect(f.confirm()).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(f.db.children.size).toBe(before);
  const otp=new OTPAuth.TOTP({issuer:'KNABA DE',algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')}).generate();
  const confirmed:any=await f.confirm(otp),mfaAt=f.db.requests.get(f.id)!.erp_mfa_at;expect(mfaAt).toBeTruthy();expect(f.db.credentials.get('erp-user')!.totp_last_counter).toBeGreaterThan(0);
  const body=await f.redeem(new URL(confirmed.authorizationResponseUrl).searchParams.get('code')!);expect(body).toMatchObject({actor:{mfaVerified:true,mfaVerifiedAt:mfaAt}});
 });
 it('rejects a WEB account appearing after the original no-cookie start before source I/O',async()=>{
  const f=approvedFixture();f.headers.cookie+='; knaba_session='+f.token;await expect(f.confirm()).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(f.source.calls).toBe(0);
 });
 it('cannot issue after an actual fresh signed proof loses its ledger authority',async()=>{
  const f=approvedFixture(),before=f.db.children.size;let changed=false;f.source.mutate=proof=>{if(proof.purpose==='SESSION_ISSUE'){f.db.sourceSession.state='REVOKED';changed=true;}};
  await expect(f.confirm()).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(changed).toBe(true);expect(f.db.children.size).toBe(before);expect(f.res.cookie).not.toHaveBeenCalled();
 });
 it('leaves a committed but unreachable child when egress loses authority and never emits the cookie',async()=>{
  const f=approvedFixture(),before=f.db.children.size;let changed=false;f.source.mutate=proof=>{if(proof.purpose==='SESSION_USE'){f.db.sourceSession.state='REVOKED';changed=true;}};
  await expect(f.confirm()).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(changed).toBe(true);expect(f.db.children.size).toBe(before+1);expect(f.res.cookie).not.toHaveBeenCalled();
 });
 it('can cancel its own pending flow while source and policy are unavailable',async()=>{
  const f=approvedFixture();f.source.outage=true;f.disablePolicy();expect(await f.logins.cancel(f.request(),f.res,f.id,{expectedVersion:3})).toMatchObject({state:'CANCELLED'});expect(f.source.calls).toBe(0);expect(f.db.requests.get(f.id)!.state).toBe('CANCELLED');
 });
});
