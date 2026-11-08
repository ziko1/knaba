import 'reflect-metadata';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {NestFactory} from '@nestjs/core';
import {afterEach,describe,expect,it} from 'vitest';
import {createApiModule} from '../apps/api/http.ts';
import {federationRawBody} from '../apps/api/site-federation-ingress.ts';
import type {FederationResult} from '../apps/api/site-federation-ledger.ts';
import {loginSourceDataSchema} from '../apps/api/site-federation-login-model.ts';
import {FEDERATION_ERP_PATH,makeFederationRequest,verifyFederationResponse,type FederationRequestOptions} from '../packages/integrations/site-federation-protocol.mjs';
import {FEDERATION_LOGIN_ACTIONS,parseFederationLoginActionResult,type FederationLoginAction} from '../packages/integrations/site-federation-login-protocol.mjs';
import {federatedSessionFixture} from './fixtures/site-federated-session.ts';

const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{await Promise.all(cleanup.splice(0).map(close=>close()));});
const errorCodes=new Set(['VALIDATION_ERROR','FEDERATION_CONFLICT','FEDERATION_GENERATION','FEDERATION_RECONCILING','FEDERATION_REPLAY','NEEDS_REAUTH','ACCESS_DENIED','FEDERATION_UNAVAILABLE']);
type Received={status:number;body:FederationResult};
function diagnostic(action:FederationLoginAction,response:Received){
 const code=!response.body.ok&&errorCodes.has(response.body.error.code)?response.body.error.code:'UNKNOWN_OR_NONE';
 return `${action}: HTTP ${response.status}, signed error ${code}`;
}
function success(action:FederationLoginAction,response:Received){
 expect(response.status,diagnostic(action,response)).toBe(200);
 if(!response.body.ok)throw new Error(diagnostic(action,response));
 expect(response.body.receipt.action).toBe(action);
 return parseFederationLoginActionResult(action,response.body.receipt.result);
}

/** Real signed Nest ingress, ledger dispatch and login handlers; SQL/clock are explicit doubles. */
async function fixture(){
 const f=federatedSessionFixture();f.db.put('company',f.db.companyId,{name:'Dispatch Test Company'});
 const app=await NestFactory.create(createApiModule({db:f.db,engine:f.engine,companyId:f.db.companyId,appMode:'TEST',buildSha:'0'.repeat(40),publicOrigin:f.config.erpOrigin,federationAuthorities:()=>f.authorities,federationLoginPolicy:f.policy,federationFetch:f.fetchImpl}),{bodyParser:false,logger:false});
 app.use(FEDERATION_ERP_PATH,federationRawBody());app.use(express.json({limit:'32kb'}));await app.listen(0,'127.0.0.1');cleanup.push(()=>app.close());
 const base=await app.getUrl();
 const browser=async(path:string,body:unknown)=>fetch(base+'/api/v1/auth/federation'+path,{method:'POST',headers:{'content-type':'application/json',origin:f.config.erpOrigin,'idempotency-key':randomUUID()},body:JSON.stringify(body)});
 const started=await browser('/start',{authorityId:f.config.authorityId,clientId:'web'});expect(started.status).toBe(200);const {requestId}=await started.json();
 const bound=await browser('/requests/'+requestId+'/bind',{});expect(bound.status).toBe(200);expect(await bound.json()).toMatchObject({requestId,state:'BROWSER_BOUND',version:2});
 const row=()=>f.db.requests.get(requestId)!;
 const reference={subject:f.data.subject,sessionRef:f.data.sessionRef,epoch:f.data.epoch,securityFingerprint:f.data.securityFingerprint,sourcePolicyVersion:f.data.sourcePolicyVersion};
 const payload=(action:FederationLoginAction):Record<string,unknown>=>{
  if(action==='LOGIN_INSPECT')return {requestId};
  const common={requestId,requestBinding:row().request_binding,...reference};
  return action==='LOGIN_STATUS'?common:{...common,expectedVersion:2,reauthAt:f.data.reauthAt,sessionExpiresAt:f.data.sessionExpiresAt,siteLabel:f.data.siteLabel,loginPolicyVersion:f.data.loginPolicyVersion,loginPolicyFingerprint:f.data.loginPolicyFingerprint,sourceLoginPolicyFingerprint:f.data.sourceLoginPolicyFingerprint};
 };
 const send=async(wire:ReturnType<typeof makeFederationRequest>):Promise<Received>=>{
  const response=await fetch(base+FEDERATION_ERP_PATH,{method:'POST',headers:wire.headers,body:wire.body});
  const body=verifyFederationResponse(f.config,wire.context,response.status,response.headers,Buffer.from(await response.arrayBuffer())) as FederationResult;
  expect(response.headers.get('cache-control')).toBe('no-store');return {status:response.status,body};
 };
 const authority=(action:FederationLoginAction,options:Partial<FederationRequestOptions>={})=>send(makeFederationRequest(f.config,'SITE_TO_ERP',action,payload(action),{generation:1,...options}));
 return {...f,requestId,row,payload,send,authority};
}

describe('F3 accepted signed actions reach the real ledger callback',()=>{
 it.each(FEDERATION_LOGIN_ACTIONS)('%s passes actual signed HTTP dispatch with valid preconditions',async action=>{
  const f=await fixture(),sessions=f.db.authSessions.size;
  // This isolated STATUS case seeds an already-approved request. The next case
  // proves the complete INSPECT -> APPROVE -> STATUS transition without that seed.
  if(action==='LOGIN_STATUS')Object.assign(f.row(),{state:'SOURCE_APPROVED',version:3,source_data:loginSourceDataSchema.strip().parse(f.data)});
  const response=await f.authority(action),result=success(action,response);
  expect(result.requestId).toBe(f.requestId);expect(response.body.current).toMatchObject({generation:1,phase:'ACTIVE'});
  if(action==='LOGIN_INSPECT'){
   expect(result).toMatchObject({companyLabel:'Dispatch Test Company',client:{clientId:'web',kind:'WEB',platform:'WEB',label:'KNABA Web'}});
   expect(f.row()).toMatchObject({state:'BROWSER_BOUND',inspect_count:1,source_data:null});
  }else expect(f.row()).toMatchObject({state:'SOURCE_APPROVED',version:3});
  expect(f.db.authSessions.size).toBe(sessions);expect(f.source.calls).toBe(0);
 });

 it('inspects, approves and reads current status while preserving nonce/read replay denial and stable approval receipts',async()=>{
  const f=await fixture(),inspectId=randomUUID(),approveId=randomUUID(),statusId=randomUUID();
  const wire=makeFederationRequest(f.config,'SITE_TO_ERP','LOGIN_INSPECT',f.payload('LOGIN_INSPECT'),{generation:1,operationId:inspectId});
  const inspection=success('LOGIN_INSPECT',await f.send(wire));expect(inspection.requestBinding).toBe(f.row().request_binding);
  expect(await f.send(wire)).toMatchObject({status:409,body:{ok:false,error:{code:'FEDERATION_REPLAY'}}});
  expect(await f.authority('LOGIN_INSPECT',{operationId:inspectId})).toMatchObject({status:409,body:{ok:false,error:{code:'FEDERATION_REPLAY'}}});
  expect(f.row().inspect_count).toBe(1);
  const first=await f.authority('LOGIN_APPROVE',{operationId:approveId});success('LOGIN_APPROVE',first);const audits=f.db.audits.length;
  const retried=await f.authority('LOGIN_APPROVE',{operationId:approveId});success('LOGIN_APPROVE',retried);expect(retried.body).toEqual(first.body);expect(f.db.audits.length).toBe(audits);
  expect(f.row()).toMatchObject({state:'SOURCE_APPROVED',version:3,source_data:{userId:'erp-user',bindingId:f.db.binding.id,subject:f.data.subject,sessionRef:f.data.sessionRef}});
  expect(success('LOGIN_STATUS',await f.authority('LOGIN_STATUS',{operationId:statusId}))).toMatchObject({state:'SOURCE_APPROVED',version:3});
  expect(await f.authority('LOGIN_STATUS',{operationId:statusId})).toMatchObject({status:409,body:{ok:false,error:{code:'FEDERATION_REPLAY'}}});
  f.db.sourceSession.state='REVOKED';expect(await f.authority('LOGIN_STATUS')).toMatchObject({status:401,body:{ok:false,error:{code:'NEEDS_REAUTH'}}});
  expect(f.row()).toMatchObject({state:'SOURCE_APPROVED',version:3});expect(f.source.calls).toBe(0);
 });

 it.each([
  ['generation','FEDERATION_GENERATION'],['phase','FEDERATION_RECONCILING'],['configuration','FEDERATION_CONFLICT']
 ] as const)('keeps the current %s gate before the login callback',async(gate,code)=>{
  const f=await fixture();
  if(gate==='generation')f.db.authority.generation=2;
  else if(gate==='phase')f.db.authority.phase='RECONCILING';
  else f.db.authority.config_fingerprint='0'.repeat(64);
  expect(await f.authority('LOGIN_INSPECT')).toMatchObject({status:409,body:{ok:false,error:{code}}});
  expect(f.row()).toMatchObject({state:'BROWSER_BOUND',inspect_count:0,source_data:null});
  expect([...f.db.federationOperations.values()].every(row=>row.committed_at===null)).toBe(true);
 });
});
