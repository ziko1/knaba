import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {lastValueFrom,of} from 'rxjs';
import {AuthService,csrfFor,hashToken,parseCookies,SESSION_COOKIE,GUEST_COOKIE} from '../apps/api/auth.ts';
import {RequestAuthorityInterceptor} from '../apps/api/request-authority-interceptor.ts';
import {assertIndependentDeviceAuthority,assertResponseAuthority,carryRequestAuthority} from '../apps/api/request-authority.ts';
import {assert} from '../packages/domain/core.ts';
import {federatedSessionFixture} from './fixtures/site-federated-session.ts';

const command={input:{},idempotency_key:'federated-effect-once'};
describe('F3 original source authority on the existing ERP request path',()=>{
 it('authenticates a mandatory child through the real signed source protocol outside SQL',async()=>{
  const f=federatedSessionFixture(),req=f.request(),result=await f.auth.authenticate(req);
  expect(result.actor.userId).toBe('erp-user');expect(result.actor.companyId).toBe(f.db.companyId);expect(result.actor.roles).toEqual(['EMPLOYEE']);
  expect(f.source.calls).toBe(1);expect(JSON.stringify(result.actor)).not.toContain('immutable-site-user');expect(JSON.stringify(result.actor)).not.toContain(f.tokenHash);
  expect(await f.engine.execute({...result.actor},'federated.probe',command)).toEqual({private:'protected'});expect(f.db.effects).toBe(1);expect(f.source.calls).toBe(2);
  await assertResponseAuthority(req);expect(f.source.calls).toBe(3);
 });
 it('does not fall back to an ordinary auth_sessions row when the mandatory child is absent',async()=>{
  const f=federatedSessionFixture();f.db.children.clear();await expect(f.auth.authenticate(f.request())).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(f.source.calls).toBe(0);
  const old=new AuthService(f.db,f.engine,f.auth.options);await expect(old.authenticate(f.request())).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('keeps the exact archived pre-F3 authenticator unable to accept the new credential',async()=>{
  const archived=JSON.parse(readFileSync(new URL('./fixtures/pre-f3-authenticate.json',import.meta.url),'utf8'));
  expect(createHash('sha256').update(archived.method).digest('hex')).toBe(archived.methodSha256);
  expect(archived.methodSha256).toBe('843d5a91b1b5e5fc66db4ce69faf22fc56f65bb92a26dd2fecdebeef12366c33');
  expect(archived.sourceCommit).toBe('b3cbb24a33b5c9e677ae2db10fc29e506e8529a1');
  const js=ts.transpileModule('class LegacyAuth {'+archived.method+'}; globalThis.LegacyAuth=LegacyAuth;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const sandbox:any={assert,parseCookies,SESSION_COOKIE,GUEST_COOKIE};runInNewContext(js,sandbox);
  const f=federatedSessionFixture(),legacy=new sandbox.LegacyAuth();let calls=0;
  legacy.db={query:()=>{calls++;throw Error('Unexpected old-binary SQL');},transaction:()=>{calls++;throw Error('Unexpected old-binary transaction');}};legacy.options=f.auth.options;
  await expect(legacy.authenticate(f.request())).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(calls).toBe(0);
  f.headers.authorization='Bearer '+f.token;await expect(legacy.authenticate(f.request())).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(calls).toBe(0);
 });
 it.each(['cookie','bearer','guest'] as const)('never allows malformed or repurposed KF3 through %s authentication',async kind=>{
  const f=federatedSessionFixture();if(kind==='cookie')f.headers.cookie='knaba_session=KF3.bad';
  if(kind==='bearer')f.headers.authorization='Bearer '+f.token;if(kind==='guest')f.headers.cookie='knaba_guest='+f.token;
  await expect(f.auth.authenticate(f.request(),kind==='guest')).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(f.source.calls).toBe(0);
 });
 it.each(['auth-session','child','source-session','source-epoch','binding','user','generation','credentials','policy'] as const)('denies current %s revocation before calling the source',async kind=>{
  const f=federatedSessionFixture();
  if(kind==='auth-session')f.db.authSessions.get(f.tokenHash)!.revoked_at=new Date().toISOString();
  if(kind==='child')f.db.children.get(f.tokenHash)!.state='REVOKED';
  if(kind==='source-session')f.db.sourceSession.state='REVOKED';
  if(kind==='source-epoch')f.db.principal.minimum_epoch=2;
  if(kind==='binding')f.db.binding.status='REVOKED';
  if(kind==='user')f.db.entities.get('user:erp-user')!.data.active=false;
  if(kind==='generation')f.db.authority.generation=2;
  if(kind==='credentials')f.db.credentials.get('erp-user')!.password_hash='a changed verifier';
  if(kind==='policy')f.disablePolicy();
  await expect(f.auth.authenticate(f.request())).rejects.toBeDefined();expect(f.source.calls).toBe(0);
 });
 it.each(['inactive','outage'] as const)('fails closed for source %s without a cached allow',async kind=>{
  const f=federatedSessionFixture(),{actor}=await f.auth.authenticate(f.request());if(kind==='inactive')f.source.active=false;else f.source.outage=true;
  await expect(f.engine.execute(actor,'federated.probe',command)).rejects.toMatchObject({code:kind==='inactive'?'NEEDS_REAUTH':'FEDERATION_UNAVAILABLE'});
  expect(f.db.effects).toBe(0);expect(f.db.receipts.size).toBe(0);
 });
 it.each(['purpose','erpSessionId','sourceLoginPolicyFingerprint','requestBinding','expired'] as const)('rejects a signed proof for a mismatched %s',async field=>{
  const f=federatedSessionFixture();f.source.mutate=value=>{
   if(field==='purpose')value.purpose='SESSION_ISSUE';else if(field==='expired'){value.checkedAt=new Date(Date.now()-11000).toISOString();value.validUntil=new Date(Date.now()-1000).toISOString();}
   else value[field]=field==='erpSessionId'?'11111111-1111-4111-8111-111111111111':'0'.repeat(64);
  };
  await expect(f.auth.authenticate(f.request())).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('does not let another local session replace a revoked original source session',async()=>{
  const f=federatedSessionFixture(),{actor}=await f.auth.authenticate(f.request());
  f.db.authSessions.set(hashToken('replacement-local-token-with-enough-characters'),{...f.db.authSessions.get(f.tokenHash)!});f.db.sourceSession.state='REVOKED';
  await expect(f.engine.execute({...actor},'federated.probe',command)).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(f.db.effects).toBe(0);
 });
 it('rolls back an effect if the source witness expires during the transaction',async()=>{
  const f=federatedSessionFixture(),{actor}=await f.auth.authenticate(f.request()),definition=f.engine.registry['federated.probe']!;
  const handler=definition.handler;definition.handler=async(ctx,input)=>{const result=await handler(ctx,input);f.db.clockOffset=11000;return result;};
  await expect(f.engine.execute(actor,'federated.probe',command)).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(f.db.effects).toBe(0);expect(f.db.receipts.size).toBe(0);
 });
 it('rechecks the source after a private read and suppresses response data after revocation',async()=>{
  const f=federatedSessionFixture(),req=f.request(),{actor}=await f.auth.authenticate(req);await f.engine.readEntities(actor,'user');f.db.sourceSession.state='REVOKED';
  await expect(assertResponseAuthority(req)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('does not emit a new cookie before the final source/PG egress decision',async()=>{
  const f=federatedSessionFixture(),req=f.request(),body=await f.logins.sessions.response(req,f.res,{id:f.sessionId,token:f.token,expiresAt:f.expiresAt},false);
  expect(f.res.cookie).not.toHaveBeenCalled();f.source.active=false;
  const context:any={switchToHttp:()=>({getRequest:()=>req,getResponse:()=>f.res})};
  await expect(lastValueFrom(new RequestAuthorityInterceptor().intercept(context,{handle:()=>of(body)}))).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(f.res.cookie).not.toHaveBeenCalled();
 });
 it('emits the separately bound cookie only after the successful interceptor fence',async()=>{
  const f=federatedSessionFixture(),req=f.request(),body=await f.logins.sessions.response(req,f.res,{id:f.sessionId,token:f.token,expiresAt:f.expiresAt},false);
  const context:any={switchToHttp:()=>({getRequest:()=>req,getResponse:()=>f.res})};expect(await lastValueFrom(new RequestAuthorityInterceptor().intercept(context,{handle:()=>of(body)}))).toMatchObject({csrfToken:csrfFor(f.token)});
  expect(f.res.cookie).toHaveBeenCalledWith('knaba_session',f.token,expect.objectContaining({httpOnly:true,secure:true,sameSite:'strict'}));
 });
 it('logs out locally while source and login policy are unavailable',async()=>{
  const f=federatedSessionFixture();f.source.outage=true;f.disablePolicy();expect(await f.auth.logout(f.request(),f.res)).toEqual({ok:true});
  expect(f.source.calls).toBe(0);expect(f.db.authSessions.get(f.tokenHash)!.revoked_at).toBeTruthy();expect(f.db.children.get(f.tokenHash)!.state).toBe('REVOKED');expect(f.res.clearCookie).toHaveBeenCalled();
 });
 it('acknowledges committed logout without source renewal even if that request was authenticated earlier',async()=>{
  const f=federatedSessionFixture(),req=f.request();await f.auth.authenticate(req);f.source.outage=true;const calls=f.source.calls;
  const result=await f.auth.logout(req,f.res);await expect(assertResponseAuthority(req,result)).resolves.toBeUndefined();expect(result).toEqual({ok:true});expect(f.source.calls).toBe(calls);
  await expect(assertResponseAuthority(req,{ok:true,private:'not an acknowledged response'})).rejects.toBeDefined();
 });
 it('requires cookie possession/CSRF for source-independent logout',async()=>{
  const f=federatedSessionFixture();delete f.headers['x-csrf-token'];await expect(f.auth.logout(f.request(),f.res)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(f.db.authSessions.get(f.tokenHash)!.revoked_at).toBeNull();expect(f.res.clearCookie).not.toHaveBeenCalled();
 });
 it('blocks self-derived enrollment before a receipt can replay an independent device secret',async()=>{
  const f=federatedSessionFixture(),{actor}=await f.auth.authenticate(f.request()),before=f.db.receiptReads;
  await expect(f.engine.execute(actor,'device.enroll',{input:{employeeId:actor.userId},idempotency_key:'already-local-enrollment'})).rejects.toMatchObject({code:'LOCAL_ERP_REAUTH_REQUIRED'});
  expect(f.db.receiptReads).toBe(before);expect(f.db.effects).toBe(0);
  expect(()=>assertIndependentDeviceAuthority(actor,'user.invite',{email:'other@example.test'})).not.toThrow();
  expect(()=>assertIndependentDeviceAuthority(actor,'user.password.rotate',{currentPassword:'synthetic'})).not.toThrow();
  expect(()=>assertIndependentDeviceAuthority(actor,'device.enroll',{employeeId:'another-authorized-user'})).not.toThrow();
 });
 it('cannot carry the bound proof to a different actor or company',async()=>{
  const f=federatedSessionFixture(),{actor}=await f.auth.authenticate(f.request());
  expect(()=>carryRequestAuthority(actor,{...actor,userId:'other'})).toThrow();expect(()=>carryRequestAuthority(actor,{...actor,companyId:'other'})).toThrow();
 });
});
