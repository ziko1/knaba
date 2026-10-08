import {describe,it,expect,vi} from 'vitest';
import {communicationsCommands} from '../packages/domain/communications.ts';
import {readChannelMessages} from '../packages/domain/message-pagination.ts';
import {DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';

const actor:Actor={companyId:'company-a',userId:'employee-a',roles:['EMPLOYEE'],permissions:['chat.read'],siteIds:[],customerIds:[],warehouseIds:[]};
const time='2026-10-09T11:00:00.000Z';
const entity=(kind:string,id:string,data:Data,createdAt=time):Entity=>({companyId:actor.companyId,kind,id,data,createdAt,updatedAt:createdAt,version:1});
function fixture(){
 const channel=entity('channel','channel-a',{type:'DIRECT',members:[{user_id:actor.userId,history_from:'2026-10-09T10:00:00.000Z'}]});
 const rows=[channel];
 const tx:Transaction={get:async<T extends Data>(kind:string,id:string)=>{const row=rows.find(row=>row.kind===kind&&row.id===id);if(!row)throw new DomainError('NOT_FOUND_SAFE');return row as Entity<T>;},list:async<T extends Data>(kind:string)=>rows.filter(row=>row.kind===kind) as Entity<T>[],add:async()=>{throw new Error('READ_MUST_NOT_WRITE');},save:async()=>{throw new Error('READ_MUST_NOT_WRITE');},event:async()=>{throw new Error('READ_MUST_NOT_EMIT');}};
 const ctx:CommandContext={tx,actor,now:'2026-10-09T12:00:00.000Z',idempotencyKey:'read-only-fixture',requireSite:()=>{throw new DomainError('ACCESS_DENIED');},requireOwn:id=>{if(id!==actor.userId)throw new DomainError('ACCESS_DENIED');}};
 const read=async(input:Data)=>{const command=communicationsCommands['message.read']!;return command.handler(ctx,command.schema.parse({channel_id:channel.id,...input})) as Promise<Entity[]>;};
 return {rows,channel,tx,ctx,read};
}

describe('V4 message read CPU transaction fixture and explicit SQL transport fixture',()=>{
 it('keeps a bounded latest default page, maximum100 and deterministic timestamp/id order',async()=>{
  const f=fixture();for(let n=0;n<150;n++)f.rows.push(entity('message',String(n).padStart(3,'0'),{channel_id:f.channel.id,text:'Message '+n}));
  expect((await f.read({})).map(row=>row.id)).toEqual(Array.from({length:50},(_,i)=>String(i+100).padStart(3,'0')));
  expect(await f.read({limit:100})).toHaveLength(100);
  await expect(f.read({limit:101})).rejects.toThrow();
 });
 it('after_id traverses tied timestamps in forward pages without skipping the boundary siblings',async()=>{
  const f=fixture();for(let n=0;n<120;n++)f.rows.push(entity('message',String(n).padStart(3,'0'),{channel_id:f.channel.id,text:'Message '+n}));
  const first=await f.read({after:time,after_id:'019',limit:50}),second=await f.read({after:time,after_id:first.at(-1)!.id,limit:50});
  expect([...first,...second].map(row=>row.id)).toEqual(Array.from({length:100},(_,i)=>String(i+20).padStart(3,'0')));
  await expect(f.read({after_id:'019'})).rejects.toThrow();
 });
 it('CPU fallback agrees with PostgreSQL UTF8 C byte order across BMP and astral after_id boundaries',async()=>{
  const f=fixture();for(const id of ['\u{10000}','\uE000','a'])f.rows.push(entity('message',id,{channel_id:f.channel.id,text:'Unicode ID'}));
  expect((await f.read({limit:3})).map(row=>row.id)).toEqual(['a','\uE000','\u{10000}']);
  expect((await f.read({after:time,after_id:'\uE000',limit:3})).map(row=>row.id)).toEqual(['\u{10000}']);
 });
 it('filters current membership history, deleted/cross-channel/cross-company records and query before counting a page',async()=>{
  const f=fixture();
  for(const record of [entity('message','old',{channel_id:f.channel.id,text:'Boden'},'2026-10-09T09:00:00.000Z'),entity('message','deleted',{channel_id:f.channel.id,text:'Boden',deleted_at:time}),entity('message','other-channel',{channel_id:'channel-b',text:'Boden'}),{...entity('message','other-company',{channel_id:f.channel.id,text:'Boden'}),companyId:'company-b'},entity('message','different-query',{channel_id:f.channel.id,text:'Wall'}),entity('message','allowed',{channel_id:f.channel.id,text:'BODEN'})])f.rows.push(record);
  expect((await f.read({query:'boden'})).map(row=>row.id)).toEqual(['allowed']);
 });
 it('checks fresh channel access before reading any messages or issuing SQL after revoke',async()=>{
  const f=fixture(),query=vi.fn();(f.tx as any).query=query;
  f.channel.data.members[0].revoked_at=time;
  await expect(f.read({})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(query).not.toHaveBeenCalled();
 });
 it('uses a parameterized company/channel/history/query keyset and SQL LIMIT without tx.list(message)',async()=>{
  const f=fixture(),record=entity('message','m-055',{channel_id:f.channel.id,text:'Boden'});
  const query=vi.fn(async(_statement:string,_parameters:unknown[])=>({rows:[{company_id:record.companyId,kind:record.kind,id:record.id,version:record.version,data:record.data,created_at:new Date(time),updated_at:new Date(time)}]}));
  (f.tx as any).query=query;f.tx.list=vi.fn(async()=>{throw new Error('UNBOUNDED_MESSAGE_LIST_FORBIDDEN');});
  const rows=await f.read({after:time,after_id:'m-050',query:'Boden',limit:50});
  expect(rows).toEqual([record]);
  expect(query).toHaveBeenCalledOnce();
  expect(query.mock.calls[0]![0]).toMatch(/company_id=\$1[\s\S]*data->>'channel_id'=\$2[\s\S]*date_trunc\('milliseconds',created_at AT TIME ZONE 'UTC'\)[\s\S]*ORDER BY[\s\S]*ASC[\s\S]*LIMIT \$7/);
  expect(query.mock.calls[0]![1]).toEqual([actor.companyId,f.channel.id,'2026-10-09T10:00:00.000Z',time,'m-050','Boden',50]);
  expect(f.tx.list).not.toHaveBeenCalled();
 });
 it('fails closed if a defective SQL adapter returns a foreign company/channel or more than the bound',async()=>{
  const f=fixture(),record=entity('message','m-055',{channel_id:f.channel.id,text:'Boden'});
  const sqlRow={company_id:record.companyId,kind:record.kind,id:record.id,version:record.version,data:record.data,created_at:new Date(time),updated_at:new Date(time)};
  for(const rows of [[{...sqlRow,company_id:'other-company'}],[{...sqlRow,data:{...record.data,channel_id:'other-channel'}}],Array.from({length:51},()=>sqlRow)]){
   (f.tx as any).query=async()=>({rows});
   await expect(readChannelMessages(f.ctx,{channel_id:f.channel.id,limit:50},'2026-10-09T10:00:00.000Z')).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  }
 });
});
