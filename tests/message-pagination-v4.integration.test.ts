import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import type {Actor,Data} from '../packages/domain/core.ts';

// Genuine PostgreSQL and fresh Engine authorization. No provider or socket doubles.
// With no QA DATABASE_URL these discovered cases are NOT_RUN, never a PostgreSQL PASS.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 message pagination on real PostgreSQL with millisecond keyset and scope',()=>{
 let db:Database,engine:Engine,company:string,actor:Actor;
 const time='2026-10-08T11:00:00.000Z';
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company='message-page-qa-'+randomUUID();
  await db.transaction(company,'SYNTHETIC_PAGE_FIXTURE',async tx=>{
   await tx.add('user',{name:'Synthetic employee',roles:['EMPLOYEE'],active:true,synthetic:true,siteIds:[]},'employee');
   await tx.add('channel',{type:'DIRECT',name:'Synthetic direct',members:[{user_id:'employee',history_from:'2026-10-01T00:00:00.000Z'}]},'channel');
   for(let n=0;n<120;n++)await tx.add('message',{channel_id:'channel',author_id:'employee',text:'Boden '+n,language:'DE',message_version:1},String(n).padStart(3,'0'));
   // Different raw PostgreSQL microseconds round to the same public millisecond timestamp.
   await tx.query("UPDATE aggregates SET created_at=$2::timestamptz+(id::int%10)*interval '1 microsecond',updated_at=$2::timestamptz WHERE company_id=$1 AND kind='message'",[company,time]);
  });
  actor=await engine.getActor('employee',company);
 });
 afterAll(async()=>{await db?.close();});
 const read=(input:Data={})=>engine.execute(actor,'message.read',{input:{channel_id:'channel',...input},idempotency_key:randomUUID()});
 it('default latest50/max100 are enforced by actual SQL and use a deterministic public millisecond order',async()=>{
  expect((await read()).map((row:any)=>row.id)).toEqual(Array.from({length:50},(_,n)=>String(n+70).padStart(3,'0')));
  expect(await read({limit:100})).toHaveLength(100);
  await expect(read({limit:101})).rejects.toThrow();
 });
 it('traverses equal public timestamps without missing/repeating raw microsecond rows',async()=>{
  const one=await read({after:time,after_id:'019',limit:50}),two=await read({after:time,after_id:one.at(-1).id,limit:50});
  expect([...one,...two].map(row=>row.id)).toEqual(Array.from({length:100},(_,n)=>String(n+20).padStart(3,'0')));
 });
 it('PostgreSQL C order agrees with UTF8 cursor boundaries for BMP and astral identifiers',async()=>{
  await db.transaction(company,'SYNTHETIC_UNICODE_PAGE_FIXTURE',async tx=>{
   await tx.add('channel',{type:'DIRECT',name:'Synthetic Unicode IDs',members:[{user_id:'employee',history_from:'2026-01-01T00:00:00.000Z'}]},'unicode-channel');
   for(const id of ['a','\uE000','\u{10000}'])await tx.add('message',{channel_id:'unicode-channel',author_id:'employee',text:'Synthetic Unicode ID',language:'DE',message_version:1},id);
   await tx.query("UPDATE aggregates SET created_at=$2::timestamptz,updated_at=$2::timestamptz WHERE company_id=$1 AND kind='message' AND data->>'channel_id'='unicode-channel'",[company,time]);
  });
  expect((await read({channel_id:'unicode-channel',limit:3})).map((row:any)=>row.id)).toEqual(['a','\uE000','\u{10000}']);
  expect((await read({channel_id:'unicode-channel',after:time,after_id:'\uE000',limit:3})).map((row:any)=>row.id)).toEqual(['\u{10000}']);
 });
 it('current deletion/channel/history/query filtering precedes the bounded SQL page',async()=>{
  await db.transaction(company,'SYNTHETIC_PAGE_SCOPE_UPDATE',async tx=>{
   for(const [id,patch]of [['119',{deleted_at:time}],['118',{channel_id:'other-channel'}],['117',{text:'Wall'}]] as const){const previous=await tx.get('message',id);await tx.save(previous,{...previous.data,...patch},previous.version);}
   await tx.query("UPDATE aggregates SET created_at='2026-09-01T00:00:00Z' WHERE company_id=$1 AND kind='message' AND id='116'",[company]);
  });
  const rows=await read({query:'boden',limit:100});
  expect(rows).toHaveLength(100);expect(rows.at(-1).id).toBe('115');
  expect(rows.some((row:any)=>['116','117','118','119'].includes(row.id))).toBe(false);
 });
 it('a cached actor cannot read after membership revocation; fresh channel check prevents any message result',async()=>{
  await db.transaction(company,'SYNTHETIC_PAGE_REVOKE',async tx=>{const channel=await tx.get('channel','channel');await tx.save(channel,{...channel.data,members:[{...channel.data.members[0],revoked_at:time}]},channel.version);});
  await expect(read({after:time,after_id:'019'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
});
