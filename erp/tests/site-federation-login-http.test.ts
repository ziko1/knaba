import 'reflect-metadata';
import express from 'express';
import {afterEach,describe,it,expect} from 'vitest';
import {NestFactory} from '@nestjs/core';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createApiModule} from '../apps/api/http.ts';
import {FederationAuthorities} from '../apps/api/site-federation-config.ts';
import {federationRawBody} from '../apps/api/site-federation-ingress.ts';
import {FEDERATION_ERP_PATH,makeFederationRequest} from '../packages/integrations/site-federation-protocol.mjs';
import {normalizeFederationLoginPolicy} from '../packages/integrations/site-federation-login-protocol.mjs';
import {federationAuthorityFixture} from './fixtures/site-federation.ts';
import {federatedSessionFixture} from './fixtures/site-federated-session.ts';

const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{await Promise.all(cleanup.splice(0).map(f=>f()));});
async function fixture(enabled=true){
 const config=federationAuthorityFixture('f3-http'),authorities=new FederationAuthorities([config],config.companyId,'TEST');let databaseCalls=0;
 const unexpected=async()=>{databaseCalls++;throw Error('Unexpected database access at unauthenticated boundary');};
 const db={query:unexpected,transaction:unexpected};
 const policy=enabled?normalizeFederationLoginPolicy({enabled:true,policyVersion:1,authorizationIssuer:config.erpOrigin+'/auth/federation',authorityIds:[config.authorityId],clients:[{clientId:'web',kind:'WEB',platform:'WEB',label:'KNABA Web',returnPath:'/console'}]},{erpOrigin:config.erpOrigin,authorityIds:[config.authorityId],appMode:'TEST'}):null;
 const app=await NestFactory.create(createApiModule({db,engine:{registry:{}} as any,companyId:config.companyId,appMode:'TEST',buildSha:'0'.repeat(40),publicOrigin:config.erpOrigin,federationAuthorities:()=>authorities,federationLoginPolicy:()=>policy}),{bodyParser:false,logger:false});
 app.use(FEDERATION_ERP_PATH,federationRawBody());app.use(express.json({limit:'32kb'}));await app.listen(0,'127.0.0.1');cleanup.push(()=>app.close());
 const base=await app.getUrl(),post=(path:string,body:unknown,headers:Record<string,string>={})=>fetch(base+'/api/v1/auth/federation'+path,{method:'POST',headers:{'content-type':'application/json',origin:config.erpOrigin,'idempotency-key':'f3-http-synthetic-key',...headers},body:JSON.stringify(body)});
 return {base,config,post,calls:()=>databaseCalls};
}
describe('F3 real HTTP unauthenticated boundaries',()=>{
 it('is default-off even when an F2 authority exists',async()=>{const f=await fixture(false);expect(await(await fetch(f.base+'/api/v1/auth/federation/config')).json()).toEqual({enabled:false});expect((await f.post('/start',{authorityId:f.config.authorityId,clientId:'web'})).status).toBe(503);expect(f.calls()).toBe(0);});
 it('publishes only safe registered client/authority discovery fields',async()=>{
  const f=await fixture(),r=await fetch(f.base+'/api/v1/auth/federation/config'),body=await r.json();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('referrer-policy')).toBe('no-referrer');
  expect(body).toEqual({enabled:true,authorizationIssuer:f.config.erpOrigin+'/auth/federation',authorities:[{authorityId:f.config.authorityId,label:'site.example.invalid',siteOrigin:f.config.siteOrigin}],clients:[{clientId:'web',kind:'WEB',platform:'WEB',label:'KNABA Web'}]});
  expect(JSON.stringify(body)).not.toContain(f.config.siteToErp.secret);expect(f.calls()).toBe(0);
 });
 it('requires an exact same-origin browser start and bounded printable key before opening SQL',async()=>{const f=await fixture();const r=await f.post('/start',{authorityId:f.config.authorityId,clientId:'web'},{origin:'https://other.example.invalid'});expect(r.status).toBe(403);expect((await f.post('/start',{authorityId:f.config.authorityId,clientId:'web'},{'idempotency-key':'short'})).status).toBe(400);expect(f.calls()).toBe(0);});
 it('rejects browser-provided company, role and platform overrides',async()=>{const f=await fixture();for(const key of ['companyId','roles','platform'])expect((await f.post('/start',{authorityId:f.config.authorityId,clientId:'web',[key]:'injected'})).status).toBe(400);expect(f.calls()).toBe(0);});
 it('does not turn a public request ID into a status or confirmation credential',async()=>{
  const f=await fixture(),id=randomUUID();expect((await fetch(f.base+'/api/v1/auth/federation/requests/'+id)).status).toBe(401);
  expect((await f.post('/requests/'+id+'/confirm',{expectedVersion:1,confirmed:true})).status).toBe(401);expect(f.calls()).toBe(0);
 });
 it('bind accepts only the empty DTO and exact origin',async()=>{const f=await fixture(),id=randomUUID();expect((await f.post('/requests/'+id+'/bind',{userId:'other'})).status).toBe(400);expect((await f.post('/requests/'+id+'/bind',{}, {origin:'https://foreign.example.invalid'})).status).toBe(403);expect(f.calls()).toBe(0);});
 it('rejects malformed redemption or cookie-only token exchange before SQL',async()=>{
  const f=await fixture();expect((await f.post('/token',{grantType:'authorization_code',clientId:'web',redirectUri:f.config.erpOrigin,code:'KF3.'+'k'.repeat(43),codeVerifier:'v'.repeat(43)})).status).toBe(400);
  expect((await f.post('/token',{}, {cookie:'knaba_session=some_other_cookie'})).status).toBe(400);expect(f.calls()).toBe(0);
 });
 it('verifies the existing signed ingress before a new LOGIN action can dispatch',async()=>{
  const f=await fixture(),wire=makeFederationRequest(f.config,'SITE_TO_ERP','LOGIN_INSPECT',{requestId:randomUUID()},{generation:1});
  const r=await fetch(f.base+FEDERATION_ERP_PATH,{method:'POST',headers:{...wire.headers,'x-knaba-federation-signature':'0'.repeat(64)},body:wire.body});expect(r.status).toBe(401);expect(f.calls()).toBe(0);
 });
 it('normalizes a terminal binding loss to 401 only for a derived session, preserving business 403 and outage 503',async()=>{
  const f=federatedSessionFixture();let effects=0;
  f.engine.registry['federated.denied']={permission:'synthetic.forbidden',schema:z.object({}).strict(),handler:async()=>{effects++;return {private:'unreachable'};}};
  const app=await NestFactory.create(createApiModule({db:f.db,engine:f.engine,companyId:f.db.companyId,appMode:'TEST',buildSha:'0'.repeat(40),publicOrigin:f.config.erpOrigin,federationAuthorities:()=>f.authorities,federationLoginPolicy:f.policy,federationFetch:f.fetchImpl}),{bodyParser:false,logger:false});
  app.use(express.json({limit:'32kb'}));await app.listen(0,'127.0.0.1');cleanup.push(()=>app.close());const base=await app.getUrl();
  const me=()=>fetch(base+'/api/v1/me',{headers:f.headers});
  const active=await me();expect(active.status).toBe(200);expect((await active.json()).actor.userId).toBe('erp-user');
  const denied=await fetch(base+'/api/v1/commands/federated.denied',{method:'POST',headers:{...f.headers,'content-type':'application/json'},body:JSON.stringify({input:{},idempotency_key:'f3-business-permission-denied'})});
  expect(denied.status).toBe(403);expect((await denied.json()).code).toBe('ACCESS_DENIED');expect(effects).toBe(0);
  f.source.outage=true;const unavailable=await me();expect(unavailable.status).toBe(503);expect((await unavailable.json()).code).toBe('FEDERATION_UNAVAILABLE');f.source.outage=false;
  f.db.binding.status='REVOKED';f.db.binding.version=2;f.db.binding.revoked_at=new Date().toISOString();const calls=f.source.calls;
  const stale=await me();expect(stale.status).toBe(401);expect(await stale.json()).toMatchObject({code:'NEEDS_REAUTH'});expect(stale.headers.get('set-cookie')).toBeNull();
  expect(f.source.calls).toBe(calls);expect(f.db.authSessions.get(f.tokenHash)!.revoked_at).toBeNull();
 });
});
