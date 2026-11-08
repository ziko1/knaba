import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import type {Request,Response} from 'express';
import {AuthService,hashToken,type DatabaseLike,type SqlTransaction} from '../apps/api/auth.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {assert,type Data,type Entity} from '../packages/domain/core.ts';
import {roles} from '../packages/domain/identity.ts';
import type {PrivateBlobStore} from '../packages/storage/index.ts';

/** Synthetic CPU boundary fixture: real AuthService, Engine ACL and file handler;
 * the SQL store and distinct original/client bytes are explicit test doubles.
 * It does not establish PostgreSQL isolation, image sanitization or live roles. */
class MediaReadDatabase implements DatabaseLike,SqlTransaction {
 companyId='synthetic-media-company';rows=new Map<string,Entity>();sessions=new Map<string,Data>();
 put(kind:string,id:string,data:Data,companyId=this.companyId){const row:Entity={id,kind,companyId,version:1,data:structuredClone(data),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};this.rows.set(kind+':'+id,row);return row;}
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const row=this.rows.get(kind+':'+id);assert(row?.companyId===this.companyId,'NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.rows.values()].filter(row=>row.companyId===this.companyId&&row.kind===kind).map(row=>structuredClone(row) as Entity<T>);}
 async add<T extends Data=Data>():Promise<Entity<T>>{throw Error('READ_ONLY_MEDIA_FIXTURE');}
 async save<T extends Data=Data>():Promise<Entity<T>>{throw Error('READ_ONLY_MEDIA_FIXTURE');}
 async event():Promise<void>{throw Error('READ_ONLY_MEDIA_FIXTURE');}
 async transaction<T>(companyId:string,_actorId:string,fn:(tx:SqlTransaction)=>Promise<T>):Promise<T>{expect(companyId).toBe(this.companyId);return fn(this);}
 async query(sql:string,params:unknown[]=[]):Promise<{rows:Data[]}>{
  if(sql.startsWith('SELECT')&&sql.includes('FROM auth_sessions')){
   const row=this.sessions.get(String(params[0]));return {rows:row&&row.company_id===params[1]&&(!params[2]||row.user_id===params[2])&&row.revoked_at===null&&Date.parse(row.expires_at)>Date.now()?[structuredClone(row)]:[]};
  }
  throw Error('UNEXPECTED_MEDIA_READ_SQL');
 }
}

const token='synthetic_media_session_12345678901234567890';
const original=Buffer.from('synthetic private original, distinct from approved client bytes');
const client=Buffer.from('synthetic approved client copy');
function fixture(role='CUSTOMER',device=false){
 const db=new MediaReadDatabase();
 const user=db.put('user','viewer',{active:true,roles:[role],permissions:[],siteIds:['site'],warehouseIds:[]});
 db.put('site','site',{customerId:'customer',active:true});
 const membership=db.put('customer_membership','membership',{userId:user.id,customerId:'customer',siteIds:['site'],permissions:['VIEW'],active:true});
 const asset=db.put('media_asset','asset',{siteId:'site',uploadedBy:'another-user',visibility:'CLIENT_AFTER_APPROVAL',state:'APPROVED_FOR_CLIENT',blobKey:'original',clientBlobKey:'client'});
 const session={user_id:user.id,company_id:db.companyId,revoked_at:null,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),mfa_verified:false};
 db.sessions.set(hashToken(token),session);
 if(device)db.put('device','device',{employeeId:user.id,active:true,tokenHash:hashToken(token),tokenExpiresAt:session.expires_at,revokedAt:null});
 const engine=new Engine(db as any,'TEST'),options={companyId:db.companyId,appMode:'TEST',publicOrigin:'https://erp.example.test'};
 const auth=new AuthService(db,engine,options);
 const headers:Record<string,string>=device?{authorization:'Bearer '+token}:{cookie:'knaba_session='+token};
 const request=()=>({get:(name:string)=>headers[name.toLowerCase()],query:{},ip:'127.0.0.1'} as unknown as Request);
 const res={set:vi.fn(),send:vi.fn()} as unknown as Response;
 let afterRead:undefined|(()=>void);
 const get=vi.fn(async(companyId:string,id:string)=>{expect(companyId).toBe(db.companyId);assert(['original','client'].includes(id),'NOT_FOUND_SAFE');const bytes=id==='original'?original:client;afterRead?.();return {id,companyId,ownerId:'another-user',bytes,mimeType:'image/jpeg',sha256:createHash('sha256').update(bytes).digest('hex'),provider:'POSTGRES' as const};});
 const storage={provider:'POSTGRES',get} as unknown as PrivateBlobStore;
 const controller=new ApiController({db,engine,...options,buildSha:'synthetic-media-cpu',storage});
 return {db,user,membership,asset,engine,auth,request,res,get,controller,onRead:(callback:()=>void)=>{afterRead=callback;}};
}

describe('media file copy selection with actual stored actor roles and current ACL',()=>{
 for(const role of ['CUSTOMER','CLIENT','EXTERNAL_BAULEITER','GUEST'])it('serves only client bytes for a permitted non-owner '+role,async()=>{
  const f=fixture(role),req=f.request(),authenticated=await f.auth.authenticate(req);
  expect(authenticated.actor.roles).toEqual([role]);
  if(role==='CUSTOMER')expect((roles as readonly string[]).includes(role)).toBe(false);
  const allowed=await f.auth.transaction(authenticated.actor,tx=>f.engine.authorizeEntity(tx as any,authenticated.actor.userId,'media_asset',f.asset.id),10000,true);
  expect(allowed.entity.id).toBe(f.asset.id);
  await f.controller.file(req,f.res,f.asset.id);
  expect(f.get).toHaveBeenCalledExactlyOnceWith(f.db.companyId,'client');
  expect(f.res.send).toHaveBeenCalledExactlyOnceWith(client);
  expect(f.res.send).not.toHaveBeenCalledWith(original);
  expect(f.res.set).toHaveBeenCalledWith(expect.objectContaining({'Cache-Control':'private, no-store','Content-Type':'image/jpeg','ETag':'"'+createHash('sha256').update(client).digest('hex')+'"'}));
 });

 it('keeps the same legacy classification for an actual enrolled bearer actor',async()=>{
  const f=fixture('CUSTOMER',true);await f.controller.file(f.request(),f.res,f.asset.id);
  expect(f.get).toHaveBeenCalledExactlyOnceWith(f.db.companyId,'client');expect(f.res.send).toHaveBeenCalledExactlyOnceWith(client);
 });

 it('preserves an internal scoped reader’s original and explicit client-copy choices',async()=>{
  const f=fixture('EMPLOYEE');f.user.data.permissions=['media.read'];
  await f.controller.file(f.request(),f.res,f.asset.id);expect(f.res.send).toHaveBeenLastCalledWith(original);
  const req=f.request();req.query={copy:'client'};await f.controller.file(req,f.res,f.asset.id);expect(f.res.send).toHaveBeenLastCalledWith(client);
 });

 it('preserves the existing own-original policy without granting another customer’s asset',async()=>{
  const f=fixture();f.asset.data.uploadedBy=f.user.id;
  await f.controller.file(f.request(),f.res,f.asset.id);expect(f.res.send).toHaveBeenCalledExactlyOnceWith(original);
 });

 for(const condition of ['unapproved','confidential','foreign-site','revoked-membership','foreign-company'])it('denies '+condition+' before reading any private blob',async()=>{
  const f=fixture();
  if(condition==='unapproved')f.asset.data.state='RECEIVED';
  if(condition==='confidential')f.asset.data.visibility='CONFIDENTIAL';
  if(condition==='foreign-site'){f.db.put('site','other-site',{customerId:'other-customer'});f.asset.data.siteId='other-site';}
  if(condition==='revoked-membership')f.membership.data.revokedAt=new Date().toISOString();
  if(condition==='foreign-company')f.asset.companyId='different-company';
  await expect(f.controller.file(f.request(),f.res,f.asset.id)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(f.get).not.toHaveBeenCalled();expect(f.res.set).not.toHaveBeenCalled();expect(f.res.send).not.toHaveBeenCalled();
 });

 it('does not serve a client copy after approval changes during asynchronous blob retrieval',async()=>{
  const f=fixture();f.onRead(()=>{f.asset.data.state='RECEIVED';f.asset.version++;});
  await expect(f.controller.file(f.request(),f.res,f.asset.id)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(f.get).toHaveBeenCalledOnce();expect(f.res.set).not.toHaveBeenCalled();expect(f.res.send).not.toHaveBeenCalled();
 });
});
