import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {AuthService,SESSION_COOKIE} from '../apps/api/auth.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';

// Genuine PostgreSQL Database/Engine/commands/receipts and authenticated API
// sessions. Only Express transport is doubled; no provider or HTTP socket is
// used. All six discovered fixtures remain SQL_NOT_RUN without DATABASE_URL.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const ORIGIN='https://activity-center.qa.example.test';
type Session={token:string;csrfToken:string};
function request(session:Session,method='GET'):Request {
 const headers:Record<string,string>={origin:ORIGIN,host:new URL(ORIGIN).host,cookie:`${SESSION_COOKIE}=${session.token}`,'x-csrf-token':session.csrfToken};
 return {method,protocol:'https',ip:'192.0.2.47',headers,get:(name:string)=>headers[name.toLowerCase()]} as unknown as Request;
}

postgres('activity center: real PostgreSQL Engine/API own read acknowledgment and fresh source authority',()=>{
 let db:Database,engine:Engine,api:ApiController,foreignApi:ApiController,company:string,foreignCompany:string,owner:Actor,manager:Actor;
 let ownSession:Session,peerSession:Session,clientSession:Session,foreignSession:Session;
 let channel:Entity,message:Entity,messageNotice:Entity,siteNotice:Entity;
 let provider:ReturnType<typeof vi.fn>;
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','');vi.stubEnv('WHATSAPP_ACCESS_TOKEN','');
  provider=vi.fn(async()=>{throw new Error('ACTIVITY_QA_MUST_NOT_CONTACT_EXTERNAL_PROVIDER');});vi.stubGlobal('fetch',provider);
  company='activity-qa-'+randomUUID();foreignCompany='activity-foreign-qa-'+randomUUID();engine=new Engine(db,'TEST');
  await db.transaction(company,'SYNTHETIC_ACTIVITY_FIXTURE',async tx=>{
   await tx.add('company',{name:'Synthetic isolated activity QA',operatingMode:'TEST',synthetic:true},company);
   await tx.add('customer',{name:'Synthetic customer',active:true},'customer');
   await tx.add('site',{name:'Synthetic scoped site',code:'ACTIVITY-QA',customerId:'customer',active:true},'site');
   for(const id of ['owner','peer'])await tx.add('user',{name:'Synthetic '+id,roles:['EMPLOYEE'],siteIds:['site'],active:true,synthetic:true},id);
   await tx.add('user',{name:'Synthetic client',roles:['CLIENT'],siteIds:[],active:true,synthetic:true},'client');
   await tx.add('customer_membership',{userId:'client',customerId:'customer',siteIds:['site'],permissions:['VIEW'],active:true},'client-membership');
   await tx.add('user',{name:'Synthetic scoped manager',roles:['DIRECTOR'],siteIds:['site'],active:true,synthetic:true},'manager');
  });
  await db.transaction(foreignCompany,'SYNTHETIC_FOREIGN_ACTIVITY_FIXTURE',async tx=>{
   await tx.add('company',{name:'Unrelated synthetic company',operatingMode:'TEST',synthetic:true},foreignCompany);
   await tx.add('user',{name:'Same-looking foreign owner',roles:['EMPLOYEE'],siteIds:[],active:true,synthetic:true},'owner');
  });
  owner=await engine.getActor('owner',company);manager=await engine.getActor('manager',company);
  channel=await execute(manager,'channel.create',{type:'SITE_INTERNAL',name:'Synthetic private activity source',site_id:'site',member_ids:['owner']});
  message=await execute(manager,'message.send',{channel_id:channel.id,text:'PRIVATE_SOURCE_ORIGINAL_NOT_ACKNOWLEDGMENT_PAYLOAD',language:'DE'});
  messageNotice=await execute(manager,'notifications.schedule',{recipient_id:'owner',event:'chat.important_instruction',category:'CHAT',scheduled_at:new Date().toISOString(),dedup_key:randomUUID(),channel:'WEB',message_id:message.id});
  siteNotice=await execute(manager,'notifications.schedule',{recipient_id:'owner',event:'site.work_review_requested',category:'WORK',scheduled_at:new Date().toISOString(),dedup_key:randomUUID(),channel:'WEB',related_kind:'site',related_id:'site'});
  const options={companyId:company,appMode:'TEST',publicOrigin:ORIGIN,encryptionKey:'SYNTHETIC_ACTIVITY_AUTH_KEY_NOT_A_REAL_SECRET'};
  api=new ApiController({db,engine,...options,buildSha:'0'.repeat(40)});const auth=new AuthService(db,engine,options);
  ownSession=await auth.createSession('owner');peerSession=await auth.createSession('peer');clientSession=await auth.createSession('client');
  const foreignOptions={...options,companyId:foreignCompany};foreignApi=new ApiController({db,engine,...foreignOptions,buildSha:'0'.repeat(40)});
  foreignSession=await new AuthService(db,engine,foreignOptions).createSession('owner');
 });
 afterEach(()=>{expect(provider).not.toHaveBeenCalled();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
 afterAll(async()=>{await db?.close();});
 const execute=(actor:Actor,name:string,input:Data)=>engine.execute(actor,name,{input,idempotency_key:randomUUID()});
 const row=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_ACTIVITY_ASSERT',tx=>tx.get(kind,id));
 const update=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_ACTIVITY_UPDATE',async tx=>{const current=await tx.get(kind,id);return tx.save(current,{...current.data,...patch},current.version);});
 const ack=(session:Session,item:Entity,key=randomUUID(),version=item.version,controller=api)=>controller.command(request(session,'POST'),'notification.read',{input:{notification_id:item.id},expected_version:version,idempotency_key:key});
 async function fingerprint(){
  const values:Record<string,Data>={};for(const table of ['aggregates','aggregate_revisions','audit_log','command_receipts','outbox','auth_sessions'])values[table]=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=ANY($1::text[])`,[[company,foreignCompany]])).rows[0];return values;
 }

 it('own API activity changes unread to a persisted read timestamp and returns only the minimal acknowledgment',async()=>{
  const first=(await api.entities(request(ownSession),'notification')).items.find((item:Entity)=>item.id===messageNotice.id);expect(first.data.read_at).toBeUndefined();
  const result=await ack(ownSession,messageNotice);expect(Object.keys(result).sort()).toEqual(['notification_id','read_at','version']);
  expect(result).toEqual({notification_id:messageNotice.id,read_at:expect.any(String),version:messageNotice.version+1});expect(Number.isFinite(Date.parse(result.read_at))).toBe(true);
  const stored=await row('notification',messageNotice.id);expect(stored.version).toBe(result.version);expect(stored.data.read_at).toBe(result.read_at);
  expect(stored.data.status).toBe('PENDING');expect(stored.data.message_id).toBe(message.id);expect(await row('message',message.id)).toEqual(message);
  const listed=(await api.entities(request(ownSession),'notification')).items.find((item:Entity)=>item.id===messageNotice.id);expect(listed.data.read_at).toBe(result.read_at);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_SOURCE_ORIGINAL');expect(JSON.stringify(result)).not.toContain('recipient_id');
 });

 it('peer, customer and same-looking foreign-company sessions cannot read or acknowledge another recipient activity and create no effects',async()=>{
  const before=await fingerprint();for(const session of [peerSession,clientSession]){
   expect((await api.entities(request(session),'notification')).items).toEqual([]);
   await expect(ack(session,messageNotice)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  }
  expect((await foreignApi.entities(request(foreignSession),'notification')).items).toEqual([]);
  await expect(ack(foreignSession,messageNotice,randomUUID(),messageNotice.version,foreignApi)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(await fingerprint()).toEqual(before);expect((await row('notification',messageNotice.id)).data.read_at).toBeUndefined();
 });

 it('stale versions fail before unread or already-read effects, while exact receipt replay never duplicates a revision, audit or receipt',async()=>{
  const changed=await update('notification',siteNotice.id,{event:'site.changed_review_request'}),before=await fingerprint();
  await expect(ack(ownSession,siteNotice)).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(await fingerprint()).toEqual(before);
  const key=randomUUID(),result=await ack(ownSession,changed,key),after=await fingerprint();
  expect(await ack(ownSession,changed,key)).toEqual(result);expect(await fingerprint()).toEqual(after);
  await expect(ack(ownSession,changed,randomUUID())).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(await fingerprint()).toEqual(after);
  const receipts=(await db.query("SELECT result FROM command_receipts WHERE company_id=$1 AND actor_id='owner' AND idempotency_key=$2",[company,key])).rows;expect(receipts).toEqual([{result}]);
 });

 it('source channel membership revocation hides its notification metadata and blocks fresh acknowledgment and the old cached receipt',async()=>{
  const key=randomUUID();await ack(ownSession,messageNotice,key);
  await execute(manager,'channel.membership',{channel_id:channel.id,user_id:'owner',action:'REVOKE'});const before=await fingerprint();
  const listed=(await api.entities(request(ownSession),'notification')).items;expect(listed.map((item:Entity)=>item.id)).toEqual([siteNotice.id]);
  expect(await engine.readEntities(owner,'message')).toEqual([]);expect(JSON.stringify(listed)).not.toContain(message.id);
  await expect(ack(ownSession,messageNotice,key)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  await expect(ack(ownSession,await row('notification',messageNotice.id))).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(await fingerprint()).toEqual(before);
 });

 it('fresh site revocation hides related and message-source metadata even for a previously resolved actor and blocks receipt replay without writes',async()=>{
  const key=randomUUID();await ack(ownSession,siteNotice,key);await update('user','owner',{siteIds:[]});const before=await fingerprint();
  expect((await api.entities(request(ownSession),'notification')).items).toEqual([]);expect(await engine.readEntities(owner,'notification')).toEqual([]);
  await expect(ack(ownSession,siteNotice,key)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  await expect(ack(ownSession,messageNotice)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});expect(await fingerprint()).toEqual(before);
 });

 it('a corrupt cyclic chain of own linked notifications stays hidden and cannot produce an acknowledgment or stack overflow',async()=>{
  const cyclic=await db.transaction(company,'SYNTHETIC_CORRUPT_LINK_FIXTURE',async tx=>{
   const a=await tx.add('notification',{recipient_id:'owner',event:'PRIVATE_CYCLIC_A',category:'WORK',channel:'WEB',status:'PENDING',related_kind:'notification',related_id:'cycle-b'},'cycle-a');
   const b=await tx.add('notification',{recipient_id:'owner',event:'PRIVATE_CYCLIC_B',category:'WORK',channel:'WEB',status:'PENDING',related_kind:'notification',related_id:'cycle-a'},'cycle-b');return [a,b];
  });
  const before=await fingerprint(),listed=(await api.entities(request(ownSession),'notification')).items;
  expect(listed.map((item:Entity)=>item.id).sort()).toEqual([messageNotice.id,siteNotice.id].sort());expect(JSON.stringify(listed)).not.toContain('PRIVATE_CYCLIC');
  for(const item of cyclic)await expect(ack(ownSession,item)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(await fingerprint()).toEqual(before);
 });
});
