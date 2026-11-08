import express from 'express';
import {afterEach,describe,expect,it} from 'vitest';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {randomUUID} from 'node:crypto';
import {DomainError} from '../packages/domain/core.ts';
import {FEDERATION_ERP_PATH,makeFederationRequest,verifyFederationResponse} from '../packages/integrations/site-federation-protocol.mjs';
import {FederationAuthorities} from '../apps/api/site-federation-config.ts';
import {federationIngress,federationRawBody} from '../apps/api/site-federation-ingress.ts';
import {validationInputBudgetMiddleware} from '../apps/api/validation-budget.ts';
import {federationAuthorityFixture} from './fixtures/site-federation.ts';

const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>((resolve,reject)=>{server.closeAllConnections();server.close(error=>error?reject(error):resolve());})));});
async function fixture(enabled=true,failure?:Error){
 const config=federationAuthorityFixture('http-company'),registry=new FederationAuthorities(enabled?[config]:[],'http-company','TEST');
 let dispatched=0;
 const app=express();app.use(FEDERATION_ERP_PATH,federationRawBody());app.use(express.json());app.use(validationInputBudgetMiddleware);
 app.post(FEDERATION_ERP_PATH,federationIngress(()=>registry,async request=>{dispatched++;if(failure)throw failure;return {ok:true,receipt:{operationId:request.operationId,action:request.envelope.action,generation:1,revision:1,result:{accepted:true}},current:{generation:1,revision:1,phase:'RECONCILING',policyVersion:1}};}));
 const server=createServer(app);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {config,base:`http://127.0.0.1:${(server.address() as AddressInfo).port}`,dispatched:()=>dispatched};
}
describe('actual HTTP federation raw authentication boundary',()=>{
 it('authenticates bounded raw bytes before global JSON and structural validation, and signs its response',async()=>{
  const f=await fixture(),wire=makeFederationRequest(f.config,'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{instanceId:randomUUID(),syntheticPadding:'x'.repeat(16000)},{generation:0});
  const response=await fetch(f.base+FEDERATION_ERP_PATH,{method:'POST',headers:wire.headers,body:wire.body});
  expect(response.status).toBe(200);const body=Buffer.from(await response.arrayBuffer());expect(verifyFederationResponse(f.config,wire.context,response.status,response.headers,body)).toMatchObject({ok:true,current:{generation:1}});expect(f.dispatched()).toBe(1);
 });
 it.each(['changed-body','bad-mac','wrong-direction','query','trailing-slash'] as const)('rejects %s before any authority operation',async attack=>{
  const f=await fixture(),wire=makeFederationRequest(f.config,attack==='wrong-direction'?'ERP_TO_SITE':'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},{generation:0});
  const response=await fetch(f.base+FEDERATION_ERP_PATH+(attack==='query'?'?code=private-synthetic':attack==='trailing-slash'?'/':''),{method:'POST',headers:{...wire.headers,...attack==='bad-mac'?{'x-knaba-federation-signature':'0'.repeat(64)}:{}},body:attack==='changed-body'?Buffer.from(wire.body.toString()+' '):wire.body});
  expect(response.status).toBe(401);expect(f.dispatched()).toBe(0);expect(await response.text()).not.toContain('private-synthetic');
 });
 it('rejects invalid JSON by signature first and never exposes its content',async()=>{
  const f=await fixture(),wire=makeFederationRequest(f.config,'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},{generation:0});
  const response=await fetch(f.base+FEDERATION_ERP_PATH,{method:'POST',headers:wire.headers,body:'{"password":"synthetic-sensitive-malformed"'});
  expect(response.status).toBe(401);expect(await response.json()).toEqual({ok:false,error:{code:'FEDERATION_AUTH_FAILED'}});expect(f.dispatched()).toBe(0);
 });
 it('rejects oversized or compressed bodies without operation dispatch',async()=>{
  const f=await fixture(),wire=makeFederationRequest(f.config,'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},{generation:0});
  const large=await fetch(f.base+FEDERATION_ERP_PATH,{method:'POST',headers:wire.headers,body:Buffer.alloc(32769,120)});expect(large.status).toBe(413);
  const compressed=await fetch(f.base+FEDERATION_ERP_PATH,{method:'POST',headers:{...wire.headers,'content-encoding':'gzip'},body:wire.body});expect(compressed.status).toBe(400);expect(f.dispatched()).toBe(0);
 });
 it('is disabled by default with no authority or database operation',async()=>{
  const f=await fixture(false),wire=makeFederationRequest(f.config,'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},{generation:0});
  const response=await fetch(f.base+FEDERATION_ERP_PATH,{method:'POST',headers:wire.headers,body:wire.body});expect(response.status).toBe(404);expect(f.dispatched()).toBe(0);
 });
 it.each([new DomainError('FEDERATION_GENERATION'),new Error('synthetic-secret-database-detail')])('returns a signed bounded failure without internal exception details',async failure=>{
  const f=await fixture(true,failure),wire=makeFederationRequest(f.config,'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},{generation:0});
  const response=await fetch(f.base+FEDERATION_ERP_PATH,{method:'POST',headers:wire.headers,body:wire.body}),body=Buffer.from(await response.arrayBuffer());
  expect(response.status).toBe(failure instanceof DomainError?409:503);expect(verifyFederationResponse(f.config,wire.context,response.status,response.headers,body)).toMatchObject({ok:false});expect(body.toString()).not.toContain('synthetic-secret');
 });
});
