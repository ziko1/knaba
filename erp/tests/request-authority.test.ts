import {afterEach,describe,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {defer,lastValueFrom} from 'rxjs';
import {INTERCEPTORS_METADATA} from '@nestjs/common/constants';
import type {Request,Response} from 'express';
import {AuthService,csrfFor,hashToken,type DatabaseLike,type SqlTransaction} from '../apps/api/auth.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {RequestAuthorityInterceptor} from '../apps/api/request-authority-interceptor.ts';
import {assertResponseAuthority} from '../apps/api/request-authority.ts';
import {assert,DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';
import {governanceCommands} from '../packages/domain/governance.ts';
import type {PrivateBlobStore} from '../packages/storage/index.ts';

/** CPU transport fixture. The adjacent PG suite proves actual company-lock ordering. */
class Memory implements DatabaseLike,SqlTransaction {
 companyId='request-authority-company';rows=new Map<string,Entity>();sessions=new Map<string,Data>();receipts=new Map<string,Data>();
 inTransaction=false;sessionWritesInsideTransaction:boolean[]=[];receiptReads=0;effects=0;events:Data[]=[];
 put(kind:string,id:string,data:Data){const row:Entity={id,kind,companyId:this.companyId,version:1,data:structuredClone(data),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};this.rows.set(`${kind}:${id}`,row);return row;}
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const row=this.rows.get(`${kind}:${id}`);assert(row,'NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.rows.values()].filter(row=>row.kind===kind).map(row=>structuredClone(row) as Entity<T>);}
 async listPage<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return this.list<T>(kind);}
 async add<T extends Data=Data>(kind:string,data:T,id=`effect-${++this.effects}`):Promise<Entity<T>>{return this.put(kind,id,data) as Entity<T>;}
 async save<T extends Data=Data>(row:Entity,data:T):Promise<Entity<T>>{const next={...row,version:row.version+1,data:structuredClone(data)};this.rows.set(`${row.kind}:${row.id}`,next);return next as Entity<T>;}
 async event(type:string,data:Data){this.events.push({type,data});}
 async transaction<T>(companyId:string,_actorId:string,fn:(tx:SqlTransaction)=>Promise<T>):Promise<T>{
  expect(companyId).toBe(this.companyId);assert(!this.inTransaction,'INVALID_STATE');
  const before=structuredClone({rows:this.rows,sessions:this.sessions,receipts:this.receipts,effects:this.effects,events:this.events});this.inTransaction=true;
  try{return await fn(this);}catch(error){Object.assign(this,before);throw error;}finally{this.inTransaction=false;}
 }
 async query(sql:string,params:any[]=[]):Promise<{rows:Data[]}>{
  if(sql.startsWith('SELECT')&&sql.includes('FROM auth_sessions')){
   const row=this.sessions.get(params[0]);return {rows:row&&row.company_id===params[1]&&(!params[2]||row.user_id===params[2])&&row.revoked_at===null&&Date.parse(row.expires_at)>Date.now()?[structuredClone(row)]:[]};
  }
  if(sql.startsWith('UPDATE auth_sessions')){
   this.sessionWritesInsideTransaction.push(this.inTransaction);
   for(const [hash,row]of this.sessions)if((sql.includes('token_hash=$1')?hash===params[0]:row.user_id===params[0])&&row.company_id===params[1])row.revoked_at=new Date().toISOString();return {rows:[]};
  }
  if(sql.startsWith('SELECT command,input_hash')){this.receiptReads++;const row=this.receipts.get(JSON.stringify(params));return {rows:row?[structuredClone(row)]:[]};}
  if(sql.startsWith('INSERT INTO command_receipts')){this.receipts.set(JSON.stringify(params.slice(0,3)),{command:params[3],input_hash:params[4],result:JSON.parse(params[5]),authorization_hash:params[6],created_at:new Date().toISOString()});return {rows:[]};}
  if(sql.startsWith('INSERT INTO audit_log'))return {rows:[]};
  throw new Error(`Unexpected request-authority fixture SQL: ${sql.slice(0,80)}`);
 }
}

const token='original_session_token_12345678901234567890',replacement='replacement_session_token_12345678901234567';
function fixture(device=false,companyId='request-authority-company'){
 const db=new Memory();db.companyId=companyId;
 db.put('user','employee',{active:true,roles:['EMPLOYEE'],permissions:['identity.self','scope.company','media.read','device.manage'],siteIds:[]});
 const session={user_id:'employee',company_id:db.companyId,revoked_at:null,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),mfa_verified:false};
 db.sessions.set(hashToken(token),session);
 if(device)db.put('device','original-device',{active:true,employeeId:'employee',tokenHash:hashToken(token),tokenExpiresAt:session.expires_at,revokedAt:null});
 const engine=new Engine(db as any,'TEST');
 engine.registry['fence.probe']={permission:'identity.self',schema:z.object({}).strict(),handler:async c=>{await c.tx.add('fence_effect',{private:'synthetic protected result'});return {private:'synthetic protected result'};}};
 const options={companyId:db.companyId,appMode:'TEST',publicOrigin:'https://erp.example.test'};
 const auth=new AuthService(db,engine,options);
 const headers:Record<string,string>={origin:options.publicOrigin,'x-csrf-token':csrfFor(token),...(device?{authorization:`Bearer ${token}`}:{cookie:`knaba_session=${token}`})};
 const req={get:(name:string)=>headers[name.toLowerCase()],query:{},ip:'127.0.0.1'} as unknown as Request;
 const res={clearCookie:vi.fn(),set:vi.fn(),send:vi.fn()} as unknown as Response;
 return {db,engine,auth,req,res,options,session,headers};
}
const envelope={input:{},idempotency_key:'original-authority-probe'};
afterEach(()=>vi.useRealTimers());

describe('original authenticated authority at ERP transaction boundaries',()=>{
 it.each(['command','read','page','profile','receipt'] as const)('rejects a revoked original cookie before %s even when another session is valid',async kind=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req);
  if(kind==='receipt')await f.engine.execute(actor,'fence.probe',envelope);
  const before={effects:f.db.effects,receipts:f.db.receipts.size,reads:f.db.receiptReads};
  f.session.revoked_at=new Date().toISOString() as any;f.db.sessions.set(hashToken(replacement),{...f.session,revoked_at:null});
  const result=kind==='read'?f.engine.readEntities(actor,'user'):kind==='page'?f.engine.readEntitiesPage(actor,'user',{limit:10,snapshotAt:new Date().toISOString()}):kind==='profile'?f.auth.profile(actor):f.engine.execute(actor,'fence.probe',envelope);
  await expect(result).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect({effects:f.db.effects,receipts:f.db.receipts.size,reads:f.db.receiptReads}).toEqual(before);
 });

 it('retains the original authority through actor spread and permission scoping',async()=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req),spread={...actor};f.session.revoked_at=new Date().toISOString() as any;
  await expect(f.engine.execute(f.engine.scope(spread,'identity.self'),'fence.probe',envelope)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(f.db.effects).toBe(0);
 });

 it('keeps the binding in fresh/scoped command contexts and permission callbacks without serializing proof',async()=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req);let scoped!:Actor,callback!:Actor;
  f.engine.registry['fence.probe']={permission:'identity.self',schema:z.object({}),handler:async c=>{scoped=c.actor;callback=(await c.forPermission!('identity.self')).actor;return {ok:true};}};
  await f.engine.execute(actor,'fence.probe',envelope);
  expect(JSON.stringify(actor)).not.toContain(token);expect(JSON.stringify({...actor})).not.toContain(hashToken(token));
  f.session.revoked_at=new Date().toISOString() as any;
  for(const retained of [scoped,callback])await expect(f.engine.readEntities(retained,'user')).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it.each(['companyId','userId'] as const)('cannot reuse an original proof after changing actor %s',async field=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req);
  await expect(f.engine.readEntities({...actor,[field]:'different-identity'},'user')).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it.each([
  ['inactive',{active:false}],['revoked',{revokedAt:'2026-01-01T00:00:00Z'}],['legacy revoked',{revoked_at:'2026-01-01T00:00:00Z'}],
  ['malformed revocation',{revokedAt:false}],['token rotated',{tokenHash:hashToken(replacement)}],['owner changed',{employeeId:'another-user'}],
  ['expired',{tokenExpiresAt:'2000-01-01T00:00:00Z'}],['invalid expiry',{tokenExpiresAt:'invalid'}]
 ])('rejects the original device after it becomes %s',async(_label,change)=>{
  const f=fixture(true),{actor}=await f.auth.authenticate(f.req),device=f.db.rows.get('device:original-device')!;
  Object.assign(device.data,change);
  await expect(f.engine.execute({...actor},'fence.probe',envelope)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  await expect(f.engine.readEntities(actor,'user')).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(f.db.effects).toBe(0);
 });

 it('evaluates expiry at the operation boundary, not at authentication time',async()=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req);vi.useFakeTimers();vi.setSystemTime(Date.parse(f.session.expires_at));
  await expect(f.engine.execute(actor,'fence.probe',envelope)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(f.db.effects).toBe(0);
 });

 it.each([false,true])('rolls back command effects and receipts if authority expires during asynchronous work (device=%s)',async device=>{
  const f=fixture(device),{actor}=await f.auth.authenticate(f.req);vi.useFakeTimers();
  f.engine.registry['fence.probe']={permission:'identity.self',schema:z.object({}),handler:async c=>{await c.tx.add('fence_effect',{private:'synthetic'});vi.setSystemTime(Date.parse(f.session.expires_at));return {private:'synthetic'};}};
  await expect(f.engine.execute(actor,'fence.probe',envelope)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(f.db.effects).toBe(0);expect(f.db.receipts.size).toBe(0);expect(await f.db.list('fence_effect')).toEqual([]);
 });

 it('serializes logout revocation under the company transaction',async()=>{
  const f=fixture();await expect(f.auth.logout(f.req,f.res)).resolves.toEqual({ok:true});
  expect(f.db.sessionWritesInsideTransaction).toEqual([true]);expect(f.res.clearCookie).toHaveBeenCalledOnce();
 });

 it('commits self device revocation and returns only a server-bound minimal acknowledgement',async()=>{
  const f=fixture(true),{actor}=await f.auth.authenticate(f.req);
  const result=await f.engine.execute(actor,'device.revoke',{input:{deviceId:'original-device',reason:'Synthetic self revocation'},idempotency_key:'self-device-revoke'});
  expect(result).toEqual({ok:true,reauthenticationRequired:true});
  expect((await f.db.get('device','original-device')).data.active).toBe(false);expect(f.db.receipts.size).toBe(1);
  await expect(assertResponseAuthority(f.req,result)).resolves.toBeUndefined();
  await expect(assertResponseAuthority(f.req,{...result})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  await expect(f.engine.execute(actor,'device.revoke',{input:{deviceId:'original-device',reason:'Synthetic self revocation'},idempotency_key:'self-device-revoke'})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it('guards every automatic JSON response after the handler finishes, using the original credential',async()=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req),interceptor=new RequestAuthorityInterceptor();
  expect(Reflect.getMetadata(INTERCEPTORS_METADATA,ApiController)).toContain(RequestAuthorityInterceptor);
  const context={switchToHttp:()=>({getRequest:()=>f.req,getResponse:()=>({headersSent:false})})};
  const next={handle:()=>defer(async()=>{
   const result=await f.engine.execute(actor,'fence.probe',envelope);
   f.session.revoked_at=new Date().toISOString() as any;f.db.sessions.set(hashToken(replacement),{...f.session,revoked_at:null});
   f.headers.cookie=`knaba_session=${replacement}`;return result;
  })};
  await expect(lastValueFrom(interceptor.intercept(context as any,next))).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  // A revocation ordered after commit suppresses the response, not the prior commit.
  expect(f.db.effects).toBe(1);expect(f.db.receipts.size).toBe(1);
 });

 it('replaces detailed handler errors with opaque reauthentication after revocation',async()=>{
  const f=fixture();await f.auth.authenticate(f.req);
  const context={switchToHttp:()=>({getRequest:()=>f.req,getResponse:()=>({headersSent:false})})};
  const next={handle:()=>defer(async()=>{await Promise.resolve();f.session.revoked_at=new Date().toISOString() as any;throw new DomainError('VERSION_CONFLICT',{private:'synthetic protected details'});})};
  await expect(lastValueFrom(new RequestAuthorityInterceptor().intercept(context as any,next))).rejects.toMatchObject({code:'NEEDS_REAUTH',details:{}});
 });

 it.each(['role','site','customer'] as const)('suppresses a committed private read after %s authority is revoked while its session remains active',async kind=>{
  const f=fixture(),user=f.db.rows.get('user:employee')!;
  user.data.siteIds=['site-a'];user.data.permissions.push('commerce.read');
  if(kind==='customer'){user.data.roles=['CLIENT'];user.data.permissions=['identity.self','commerce.read'];}
  f.db.put('customer','customer-a',{name:'Synthetic private customer'});
  f.db.put('customer_membership','membership',{userId:'employee',customerId:'customer-a',permissions:['VIEW'],siteIds:['site-a'],active:true});
  const {actor}=await f.auth.authenticate(f.req);
  const result=await f.engine.readEntities(actor,'customer');expect(result).toHaveLength(1);
  if(kind==='role')user.data.roles=['GUEST'];
  else if(kind==='site')user.data.siteIds=[];
  else f.db.rows.get('customer_membership:membership')!.data.active=false;
  expect(f.session.revoked_at).toBeNull();
  await expect(assertResponseAuthority(f.req,result)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it('suppresses a committed private read when a permission-specific delegation is revoked with the session still active',async()=>{
  const f=fixture(),user=f.db.rows.get('user:employee')!;user.data.permissions=['identity.self','task.read'];user.data.siteIds=['site-a'];
  f.db.put('site','site-b',{active:true});
  f.db.put('task','private-task',{siteId:'site-b',name:'Synthetic delegated task'});
  f.db.put('user','grantor',{active:true,roles:[],permissions:['role.manage','task.read'],siteIds:['site-b']});
  const grantor=await f.engine.getActor('grantor',f.db.companyId),definition=governanceCommands['delegation.create']!;
  const grant=await definition.handler(f.engine.context(f.db as any,grantor,'synthetic-delegation'),definition.schema.parse({granteeId:'employee',permissions:['task.read'],siteIds:['site-b'],expiresAt:new Date(Date.now()+3600000).toISOString(),reason:'Synthetic response authority regression'}));
  f.db.rows.get(`delegation:${grant.id}`)!.data.state='APPROVED';
  const {actor}=await f.auth.authenticate(f.req),result=await f.engine.readEntities(actor,'task');expect(result).toHaveLength(1);
  f.db.rows.get('user:grantor')!.data.permissions=[];
  expect(f.session.revoked_at).toBeNull();
  await expect(assertResponseAuthority(f.req,result)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it('does not let a later read overwrite the authority that produced earlier private data',async()=>{
  const f=fixture(),user=f.db.rows.get('user:employee')!;user.data.roles=['CLIENT'];user.data.permissions=['commerce.read'];
  f.db.put('customer','customer-a',{name:'Synthetic private customer'});
  const membership=f.db.put('customer_membership','membership',{userId:'employee',customerId:'customer-a',permissions:['VIEW'],active:true});
  const {actor}=await f.auth.authenticate(f.req),first=await f.engine.readEntities(actor,'customer');expect(first).toHaveLength(1);
  membership.data.active=false;
  const second=await f.engine.readEntities(actor,'customer');expect(second).toEqual([]);
  await expect(assertResponseAuthority(f.req,{first,second})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it('retains the original response fence when the same HTTP request authenticates more than once',async()=>{
  const f=fixture();await f.auth.authenticate(f.req);const {actor}=await f.auth.authenticate(f.req);
  const result=await f.engine.readEntities(actor,'user');f.db.rows.get('user:employee')!.data.siteIds=['changed-scope'];
  await expect(assertResponseAuthority(f.req,result)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it.each([false,true])('does not replace the original proof when one request changes a valid credential (device: %s)',async device=>{
  const f=fixture(device);await f.auth.authenticate(f.req);
  if(device){f.db.rows.get('device:original-device')!.data.tokenHash=hashToken(replacement);f.headers.authorization=`Bearer ${replacement}`;}
  else{f.db.sessions.set(hashToken(replacement),{...f.session});f.headers.cookie=`knaba_session=${replacement}`;}
  await expect(f.auth.authenticate(f.req)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  // The same current credential is valid for a distinct HTTP request.
  expect((await f.auth.authenticate({...f.req} as Request)).actor).toMatchObject({companyId:f.db.companyId,userId:'employee'});
 });

 it('keeps an HTTP request bound to its original company even when another company has the same valid credential and user ID',async()=>{
  const first=fixture(),foreign=fixture(false,'request-authority-foreign');await first.auth.authenticate(first.req);
  await expect(foreign.auth.authenticate(first.req)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect((await foreign.auth.authenticate(foreign.req)).actor).toMatchObject({companyId:foreign.db.companyId,userId:'employee'});
 });

 it('rejects a private read when membership expires during asynchronous projection',async()=>{
  const f=fixture(),user=f.db.rows.get('user:employee')!;user.data.roles=['CLIENT'];user.data.permissions=['commerce.read'];
  const expiresAt=new Date(Date.now()+60000).toISOString();f.db.put('customer','customer-a',{name:'Synthetic private customer'});
  f.db.put('customer_membership','membership',{userId:'employee',customerId:'customer-a',permissions:['VIEW'],active:true,expiresAt});
  const {actor}=await f.auth.authenticate(f.req),project=f.engine.project.bind(f.engine);vi.useFakeTimers();
  f.engine.project=async(...args)=>{const result=await project(...args);vi.setSystemTime(Date.parse(expiresAt));return result;};
  await expect(f.engine.readEntities(actor,'customer')).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it('does not invalidate a response for unrelated profile/content updates',async()=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req),result=await f.engine.readEntities(actor,'user');
  f.db.rows.get('user:employee')!.data.name='Updated synthetic display name';f.db.put('message','unrelated-message',{text:'Synthetic unrelated content'});
  await expect(assertResponseAuthority(f.req,result)).resolves.toBeUndefined();
 });

 it('keeps a legitimate own-channel mutation readable and never publishes a rolled-back authority snapshot',async()=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req);
  const before=await f.engine.readEntities(actor,'user');
  f.engine.registry['fence.probe']={permission:'identity.self',schema:z.object({}),handler:async c=>c.tx.add('channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',created_by:actor.userId,members:[{user_id:actor.userId,active:true}]})};
  const transaction=f.db.transaction.bind(f.db);
  f.db.transaction=async(company,user,fn)=>transaction(company,user,async tx=>{await fn(tx);throw Error('Synthetic commit failure');});
  try{await expect(f.engine.execute(actor,'fence.probe',envelope)).rejects.toThrow('Synthetic commit failure');}finally{f.db.transaction=transaction;}
  await expect(assertResponseAuthority(f.req,before)).resolves.toBeUndefined();
  // A new HTTP request starts from the same valid session, with no stale read.
  const freshReq={...f.req} as unknown as Request,fresh=(await f.auth.authenticate(freshReq)).actor;
  const result=await f.engine.execute(fresh,'fence.probe',envelope);
  await expect(assertResponseAuthority(freshReq,result)).resolves.toBeUndefined();
 });

 it('returns current profile roles instead of the roles captured by initial authentication',async()=>{
  const f=fixture(),{actor}=await f.auth.authenticate(f.req);f.db.rows.get('user:employee')!.data.roles=['TEAM_LEADER'];
  expect((await f.auth.profile(actor)).roles).toEqual(['TEAM_LEADER']);
 });

 it('preserves explicitly server-created internal actors and ordinary receipt replay',async()=>{
  const f=fixture(),actor=await f.engine.getActor('employee',f.db.companyId);
  expect(await f.engine.execute(actor,'fence.probe',envelope)).toEqual({private:'synthetic protected result'});
  expect(await f.engine.execute(actor,'fence.probe',envelope)).toEqual({private:'synthetic protected result'});
  expect(f.db.effects).toBe(1);expect(f.db.receipts.size).toBe(1);
 });

 it('rechecks the original cookie after asynchronous private blob I/O before sending bytes',async()=>{
  const f=fixture();f.db.put('media_asset','private-media',{uploadedBy:'employee',blobKey:'private-blob',state:'READY'});
  const storage={provider:'POSTGRES',get:vi.fn(async()=>{f.session.revoked_at=new Date().toISOString() as any;return {bytes:Buffer.from('synthetic private bytes'),mimeType:'image/png',sha256:'synthetic-hash'};})} as unknown as PrivateBlobStore;
  // Entity policy is held constant; the regression specifically targets lost session authority.
  f.engine.authorizeEntity=async(tx,userId,kind,id)=>({actor:await f.engine.actorIn(tx,userId),entity:await tx.get(kind,id)});
  const controller=new ApiController({db:f.db,engine:f.engine,...f.options,buildSha:'synthetic-cpu',storage});
  await expect(controller.file(f.req,f.res,'private-media')).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(storage.get).toHaveBeenCalledOnce();expect(f.res.send).not.toHaveBeenCalled();expect(f.res.set).not.toHaveBeenCalled();
 });
});
