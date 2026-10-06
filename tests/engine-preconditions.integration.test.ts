import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import type {Actor,Entity} from '../packages/domain/core.ts';

const sql=process.env.DATABASE_URL?describe:describe.skip;
sql('PostgreSQL claimed WhatsApp authority and bounded company serialization',()=>{
 let db:Database,engine:Engine,company:string,actor:Actor,action:Entity;
 beforeAll(()=>{db=new Database();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company=`claimed-action-${randomUUID()}`;
  await db.transaction(company,'FIXTURE',async tx=>{
   await tx.add('user',{name:'Synthetic owner',roles:['OWNER'],active:true,siteIds:['site']},'owner');
   await tx.add('site',{name:'Synthetic site',code:'TEST',address:'Berlin',active:true},'site');
   await tx.add('contact_identity',{userId:'owner',type:'WHATSAPP',value:'491234567890',active:true,verified:true},'contact');
   action=await tx.add('whatsapp_router_action',{user_id:'owner',sender:'491234567890',status:'CLAIMED',expires_at:new Date(Date.now()+60000).toISOString()},'action');
  });actor=await engine.getActor('owner',company);
 });
 afterAll(async()=>{await db?.close();});
 const command=()=>engine.execute(actor,'task.create',{input:{siteId:'site',title:'Only the current verified phone may confirm'},idempotency_key:randomUUID(),preconditions:[{kind:'whatsapp_router_action',id:action.id,version:action.version}]});
 it.each(['REVOKED','REBOUND','EXPIRED','AMBIGUOUS'] as const)('refuses %s identity changed after CLAIMED, before any command effect',async change=>{
  await db.transaction(company,'FIXTURE',async tx=>{
   const contact=await tx.get('contact_identity','contact');
   if(change==='AMBIGUOUS')await tx.add('contact_identity',{userId:'different-owner',type:'PHONE',value:contact.data.value,verified:true,active:true},'other-contact');
   else await tx.save(contact,{...contact.data,...change==='REVOKED'?{revokedAt:new Date().toISOString()}:change==='REBOUND'?{userId:'different-owner'}:{expires_at:new Date(Date.now()-1000).toISOString()}});
  });
  await expect(command()).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await db.transaction(company,'ASSERT',tx=>tx.list('task'))).toHaveLength(0);
  expect((await db.query('SELECT idempotency_key FROM command_receipts WHERE company_id=$1',[company])).rows).toHaveLength(0);
 });
 it('expires a claimed callback inside the actual command transaction',async()=>{
  action=await db.transaction(company,'FIXTURE',async tx=>{const old=await tx.get('whatsapp_router_action',action.id);return tx.save(old,{...old.data,expires_at:new Date(Date.now()-1000).toISOString()});});
  await expect(command()).rejects.toMatchObject({code:'CALLBACK_EXPIRED'});
  expect(await db.transaction(company,'ASSERT',tx=>tx.list('task'))).toHaveLength(0);
 });
 it('bounds a wait before the SERIALIZABLE snapshot and releases the session lock safely',async()=>{
  const barrier=await db.pool.connect();
  try{
   await barrier.query('SELECT pg_advisory_lock(hashtext($1))',[company]);
   const start=Date.now();
   await expect(db.transaction(company,'WAIT',tx=>tx.add('bounded_probe',{}),1000)).rejects.toMatchObject({code:expect.stringMatching(/^(55P03|57014)$/)});
   expect(Date.now()-start).toBeLessThan(4000);
   await barrier.query('SELECT pg_advisory_unlock(hashtext($1))',[company]);
   await db.transaction(company,'AFTER',tx=>tx.add('bounded_probe',{afterTimeout:true}),1000);
   expect(await db.transaction(company,'ASSERT',tx=>tx.list('bounded_probe'))).toHaveLength(1);
  }finally{await barrier.query('SELECT pg_advisory_unlock_all()');barrier.release();}
 });
});
