import 'reflect-metadata';
import {randomUUID,createHmac} from 'node:crypto';
import {NestFactory} from '@nestjs/core';
import express from 'express';
import type {Request} from 'express';
import {AuthService,csrfFor,hashToken,type DatabaseLike,type SqlTransaction} from '../../apps/api/auth.ts';
import {Engine} from '../../apps/api/engine.ts';
import {createApiModule} from '../../apps/api/http.ts';
import {whatsAppIngressHandler,whatsAppRawBody} from '../../apps/api/whatsapp-ingress.ts';
import {assert,type Data,type Entity} from '../../packages/domain/core.ts';

/** Explicit CPU SQL/transaction double. Genuine PostgreSQL cases live separately. */
export class TransferMemory implements DatabaseLike,SqlTransaction {
 companyId='guest-transfer-company';actorId='FIXTURE';clock?:Date;rows=new Map<string,Entity>();sessions=new Map<string,Data>();inbox=new Map<string,Data>();jobs=new Map<string,Data>();audit:Data[]=[];receipts:Data[]=[];
 private queue:Promise<unknown>=Promise.resolve();
 put(kind:string,id:string,data:Data){const row:Entity={id,kind,companyId:this.companyId,version:1,data:structuredClone(data),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};this.rows.set(`${kind}:${id}`,row);return row;}
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const row=this.rows.get(`${kind}:${id}`);assert(row,'NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.rows.values()].filter(row=>row.kind===kind).map(row=>structuredClone(row) as Entity<T>);}
 async add<T extends Data=Data>(kind:string,data:T,id:string=randomUUID()):Promise<Entity<T>>{assert(!this.rows.has(`${kind}:${id}`),'VERSION_CONFLICT');return this.put(kind,id,data) as Entity<T>;}
 async save(row:Entity,data:Data,expectedVersion=row.version):Promise<Entity>{const current=await this.get(row.kind,row.id);assert(row.companyId===this.companyId&&current.version===expectedVersion,'VERSION_CONFLICT');const next={...current,version:current.version+1,data:structuredClone(data),updatedAt:new Date().toISOString()};this.rows.set(`${row.kind}:${row.id}`,next);return structuredClone(next);}
 async event(type:string,data:Data){const id=randomUUID();this.jobs.set(id,{id,company_id:this.companyId,type,data:structuredClone(data),status:'PENDING',attempts:0});}
 async transaction<T>(companyId:string,actorId:string,fn:(tx:SqlTransaction)=>Promise<T>):Promise<T>{
  const run=this.queue.then(async()=>{assert(companyId===this.companyId,'ACCESS_DENIED');const before=structuredClone({rows:this.rows,sessions:this.sessions,inbox:this.inbox,jobs:this.jobs,audit:this.audit,receipts:this.receipts});this.actorId=actorId;try{return await fn(this);}catch(error){Object.assign(this,before);throw error;}});
  this.queue=run.catch(()=>undefined);return run;
 }
 async query(sql:string,params:any[]=[]):Promise<{rows:Data[]}>{
  if(sql.startsWith('SELECT clock_timestamp()'))return {rows:[{now:this.clock??new Date()}]};
  if(sql.startsWith('SELECT')&&sql.includes('FROM auth_sessions')){const s=this.sessions.get(params[0]);return {rows:s&&s.company_id===params[1]&&(!params[2]||s.user_id===params[2])&&!s.revoked_at&&Date.parse(s.expires_at)>Date.now()?[structuredClone(s)]:[]};}
  if(sql.startsWith('INSERT INTO webhook_inbox')){const key=`${params[0]}:${params[1]}`;if(this.inbox.has(key))return {rows:[]};this.inbox.set(key,{provider:params[0],event_id:params[1],company_id:params[2],payload:JSON.parse(params[3])});return {rows:[{event_id:params[1]}]};}
  if(sql.startsWith('SELECT payload FROM webhook_inbox')){const literal=sql.includes("provider='WHATSAPP'");const row=this.inbox.get(`${literal?'WHATSAPP':params[0]}:${literal?params[1]:params[1]}`);const company=literal?params[0]:params[2];return {rows:row&&row.company_id===company?[{payload:structuredClone(row.payload)}]:[]};}
  if(sql.startsWith('UPDATE webhook_inbox SET payload=')){const row=this.inbox.get(`WHATSAPP:${params[2]}`);if(row&&row.company_id===params[1])row.payload=JSON.parse(params[0]);return {rows:[]};}
  if(sql.startsWith('SELECT id,type,data FROM outbox')||sql.startsWith('SELECT id FROM outbox')){const row=this.jobs.get(params[1]);return {rows:row&&row.company_id===params[0]&&row.status==='RUNNING'&&row.lease_token===params[2]&&Date.parse(row.leased_until)>Date.now()?[structuredClone(row)]:[]};}
  if(sql.startsWith('INSERT INTO audit_log')){this.audit.push({params:structuredClone(params)});return {rows:[]};}
  if(sql.startsWith('SELECT command,input_hash'))return {rows:[]};
  if(sql.startsWith('INSERT INTO command_receipts')){this.receipts.push(structuredClone(params));return {rows:[]};}
  throw new Error(`Unexpected fixture SQL: ${sql.slice(0,110)}`);
 }
}

export const transferOrigin='https://erp.example.test';
export const transferPhone='4915700000099';
export const transferSender='4915700000011';
export const syntheticAppSecret='synthetic-transfer-app-secret-only';
export const syntheticPhoneId='synthetic-business-phone';
export const transferCookie='synthetic_guest_session_for_transfer_123456789';
export function transferFixture(){
 const db=new TransferMemory();
 db.put('user','guest',{name:'Same synthetic name',active:true,guest:true,roles:['GUEST','CLIENT'],permissions:['chat.read','chat.write','lead.create','lead.manage','commerce.read','assistant.read'],siteIds:[],customerIds:[],warehouseIds:[]});
 db.put('user','knaba-integration-service',{name:'Synthetic integration',active:true,roles:['SERVICE_ACCOUNT'],permissions:['integration.process','scope.company'],siteIds:[],customerIds:[],warehouseIds:[]});
 db.put('channel','guest-channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',name:'Private fixture',created_by:'guest',members:[{user_id:'guest',external:true,joined_at:new Date().toISOString(),history_from:'2026-01-01T00:00:00.000Z'}],handoff:{state:'AI_ACTIVE',owner_id:null}});
 db.put('message','private-history',{channel_id:'guest-channel',author_id:'guest',text:'Synthetic private history',deleted_at:null});
 const session={user_id:'guest',company_id:db.companyId,revoked_at:null,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),mfa_verified:false};db.sessions.set(hashToken(transferCookie),session);
 const engine=new Engine(db as any,'TEST'),options={companyId:db.companyId,appMode:'TEST',publicOrigin:transferOrigin};
 const auth=new AuthService(db,engine,options);
 const headers:Record<string,string>={origin:transferOrigin,'x-csrf-token':csrfFor(transferCookie),cookie:`knaba_guest=${transferCookie}`,'content-type':'application/json'};
 const makeRequest=(values:Record<string,string>=headers)=>({get:(name:string)=>values[name.toLowerCase()],query:{},ip:'127.0.0.1'}) as unknown as Request;
 return {db,engine,auth,options,headers,req:makeRequest(),makeRequest,session};
}
export async function transferHttp(f:ReturnType<typeof transferFixture>){
 const app=await NestFactory.create(createApiModule({...f.options,db:f.db,engine:f.engine,buildSha:'0'.repeat(40)}),{logger:false,bodyParser:false,abortOnError:false});
 app.use(['/webhooks/whatsapp','/api/v1/webhooks/whatsapp'],whatsAppRawBody());app.use(express.json({verify:(req:any,_res,raw)=>{req.rawBody=raw;}}));
 app.getHttpAdapter().getInstance().post(['/webhooks/whatsapp','/api/v1/webhooks/whatsapp'],whatsAppIngressHandler(f.db,f.db.companyId,()=>({appSecret:syntheticAppSecret,phoneNumberId:syntheticPhoneId})));
 await app.listen(0,'127.0.0.1');const base=await app.getUrl();
 return {app,base,request:(path:string,body?:unknown,headers:Record<string,string>=f.headers)=>fetch(`${base}/api/v1/public/chat/guest-channel/transfer${path}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)})};
}
export function transferEnvelope(text:string,sender=transferSender,id='wamid.synthetic-transfer'){
 return {object:'whatsapp_business_account',entry:[{id:'synthetic-account',changes:[{field:'messages',value:{metadata:{phone_number_id:syntheticPhoneId},messages:[{id,from:sender,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:text}}]}}]}]};
}
export function signedTransferBody(body:unknown){const raw=Buffer.from(JSON.stringify(body));return {raw,signature:`sha256=${createHmac('sha256',syntheticAppSecret).update(raw).digest('hex')}`};}
