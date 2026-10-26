import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {executeV4Rest} from '../apps/api/v4-rest.ts';
import type {Actor} from '../packages/domain/core.ts';

// Actual SQL, Engine registry/permissions/versions, audit and receipts. Transport actor/header
// are explicit fixtures: HTTP session/CSRF middleware is tested in the parent integration suite.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 named REST adaptor using actual PostgreSQL Engine and resource guards',()=>{
 let db:Database,engine:Engine,company:string,operator:Actor,second:Actor;
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company='v4-rest-qa-'+randomUUID();
  await db.transaction(company,'SYNTHETIC_NAMED_REST_FIXTURE',async tx=>{
   for(const id of ['operator','second'])await tx.add('user',{name:'Synthetic '+id,roles:['DIRECTOR'],active:true,siteIds:[],synthetic:true},id);
   await tx.add('user',{name:'Synthetic guest',roles:['GUEST'],active:true,synthetic:true},'guest');
   await tx.add('channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',name:'Synthetic private pending handoff',created_by:'guest',members:[{user_id:'guest',history_from:'2026-01-01T00:00:00.000Z'}],handoff:{state:'HANDOFF_PENDING',owner_id:null,requested_at:new Date().toISOString()}},'private');
   await tx.add('message',{channel_id:'private',author_id:'guest',text:'Synthetic private original',language:'DE',message_version:1,revisions:[{version:1,text:'Synthetic private original',language:'DE'}]},'message');
  });
  operator=await engine.getActor('operator',company);second=await engine.getActor('second',company);
 });
 afterAll(async()=>{await db?.close();});
 const call=(actor:Actor,path:string,body:unknown,key=randomUUID())=>executeV4Rest(engine,actor,{method:'POST',path,body,idempotencyKey:key});
 const get=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_NAMED_REST_ASSERT',tx=>tx.get(kind,id));
 it('an authorized pending operator can claim an intentionally invisible nonmember channel with its displayed version',async()=>{
  const channel=await get('channel','private');
  expect(await engine.readEntities(operator,'channel')).toEqual([]);
  const result=await call(operator,'/api/v1/handoffs/private/claim',{expected_version:channel.version});
  expect(result.status).toBe(200);
  expect((await get('channel','private')).data.handoff).toMatchObject({state:'HUMAN_ACTIVE',owner_id:operator.userId});
  expect((await engine.readEntities(operator,'message')).map(row=>row.id)).toEqual(['message']);
 });
 it('second-operator stale claim cannot create membership/effects after a winning named claim',async()=>{
  const channel=await get('channel','private');await call(operator,'/handoffs/private/claim',{expected_version:channel.version});
  await expect(call(second,'/handoffs/private/claim',{expected_version:channel.version})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect((await get('channel','private')).data.members.some((member:any)=>member.user_id===second.userId)).toBe(false);
  expect((await db.query("SELECT count(*)::int AS count FROM command_receipts WHERE company_id=$1 AND command='handoff.take'",[company])).rows[0].count).toBe(1);
 });
 it('foreign/private resource scopes are checked before a wrong version is revealed or a translation is queued',async()=>{
  await expect(call(operator,'/messages/message/translations',{target_language:'UK',expected_version:999})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(await db.transaction(company,'SYNTHETIC_NAMED_REST_ASSERT',tx=>tx.list('translation_request'))).toEqual([]);
  expect((await db.query("SELECT count(*)::int AS count FROM outbox WHERE company_id=$1 AND type='translation.requested'",[company])).rows[0].count).toBe(0);
 });
 it('a current visible source version is enforced before an asynchronous translation receipt is created',async()=>{
  const channel=await get('channel','private');await call(operator,'/handoffs/private/claim',{expected_version:channel.version});
  const message=await get('message','message');
  await expect(call(operator,'/messages/message/translations',{target_language:'UK',expected_version:message.version+1})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect(await db.transaction(company,'SYNTHETIC_NAMED_REST_ASSERT',tx=>tx.list('translation_request'))).toEqual([]);
  const key=randomUUID(),result=await call(operator,'/messages/message/translations',{target_language:'UK',expected_version:message.version},key);
  const response=result.body as {request_id:string};
  expect(response.request_id).toBeTruthy();expect((await get('translation_request',response.request_id)).data).toMatchObject({status:'PENDING',user_id:operator.userId,channel_id:'private'});
  await expect(call(operator,'/messages/message/translations',{target_language:'EN',expected_version:message.version},key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect(await db.transaction(company,'SYNTHETIC_NAMED_REST_ASSERT',tx=>tx.list('translation_request'))).toHaveLength(1);
 });
});
