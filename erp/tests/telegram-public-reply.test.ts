import {describe,it,expect} from 'vitest';
import {DomainError,type Actor,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';
import type {Engine} from '../apps/api/engine.ts';
import type {PgTransaction} from '../apps/api/database.ts';
import {stageTelegramPublicReplyIn,prepareTelegramPublicReplyIn} from '../apps/worker/telegram-public-reply.ts';
import {telegramPublicReply} from '../packages/integrations/telegram-public-navigation.ts';

class MemoryTx implements Transaction {
  records=new Map<string,Entity>();events:Array<{type:string;data:Data}>=[];
  constructor(readonly companyId:string){}
  async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{
    const row=this.records.get(kind+':'+id);
    if(!row||row.companyId!==this.companyId)throw new DomainError('NOT_FOUND_SAFE');
    return row as Entity<T>;
  }
  async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{
    return [...this.records.values()].filter(x=>x.kind===kind&&x.companyId===this.companyId) as Entity<T>[];
  }
  async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+this.records.size):Promise<Entity<T>>{
    if(this.records.has(kind+':'+id))throw new DomainError('VERSION_CONFLICT');
    const row={kind,id,data,companyId:this.companyId,version:1,
      createdAt:'2026-10-26T19:00:00.000Z',updatedAt:'2026-10-26T19:00:00.000Z'};
    this.records.set(kind+':'+id,row);return row;
  }
  async save(row:Entity,data:Data):Promise<Entity>{
    const existing=await this.get(row.kind,row.id);
    if(existing.version!==row.version)throw new DomainError('VERSION_CONFLICT');
    const current={...row,data,version:row.version+1};this.records.set(row.kind+':'+row.id,current);return current;
  }
  async event(type:string,data:Data){this.events.push({type,data});}
}
const t='2026-10-26T19:05:00.000Z',approved='TEST_ONLY_NOTICE_2026';
async function fixture(){
 const tx=new MemoryTx('company-a'),chat='187650211';
 const actor:Actor={userId:'guest',companyId:'company-a',roles:['GUEST'],
   permissions:['chat.read','chat.write','lead.create'],siteIds:[],customerIds:[],warehouseIds:[]};
 const user=await tx.add('user',{name:'guest',roles:['GUEST'],guest:true,active:true},'guest');
 await tx.add('contact_identity',{type:'TELEGRAM',value:chat,userId:'guest',verified:true,active:true},'identity');
 const setting=await tx.add('notification_setting',{user_id:'guest',language:'DE',
   telegram_consent:true,telegram_opted_out:false,telegram_consent_version:approved},'setting');
 const channel=await tx.add('channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',source_provider:'TELEGRAM',
   created_by:'guest',members:[{user_id:'guest',external:true,joined_at:t}],
   handoff:{state:'HANDOFF_PENDING',owner_id:null}},'channel');
 const source=await tx.add('conversation_input',{provider:'TELEGRAM',provider_event_id:'TELEGRAM:77',
    user_id:'guest',channel_id:'channel',status:'PROCESSED',
    input:{kind:'MESSAGE',id:'TELEGRAM:77',sender:chat,chat_id:chat,text:'/register'}},'input');
 const engine={actorIn:async()=>actor} as unknown as Engine;
 const opts={now:t,publicOrigin:'https://kneba.vsp.rest/',approvedConsentVersion:approved};
 const stage=()=>stageTelegramPublicReplyIn(tx,source,opts);
 const prepare=(ticket:Entity,options:Record<string,unknown>={})=>
   prepareTelegramPublicReplyIn(tx as unknown as PgTransaction,engine,ticket,{...opts,...options});
 return {tx,source,channel,setting,user,engine,opts,stage,prepare,chat};
}
describe('existing Telegram outbox, deterministic opt-in public responses',()=>{
 it('stages exactly one private navigation ticket and no provider call or employee creation',async()=>{
   const f=await fixture(),staged=await f.stage();
   expect(staged).toMatchObject({status:'PENDING'});
   expect(await f.stage()).toEqual(staged);
   const ticket=await f.tx.get('telegram_delivery',(staged as {delivery_id:string}).delivery_id);
   expect(ticket.data).toMatchObject({provider:'TELEGRAM',purpose:'PUBLIC_NAVIGATION',
     recipient_user_id:'guest',public_intent:'REGISTER',status:'PENDING'});
   expect(f.tx.events).toEqual([{type:'telegram.outbound_requested',data:{delivery_id:ticket.id}}]);
   expect((await f.prepare(ticket)).status).toBe('READY');
   expect((await f.prepare(ticket) as {text:string}).text)
     .toBe(telegramPublicReply('REGISTER','DE',f.opts.publicOrigin));
   expect(await f.tx.list('user')).toHaveLength(1);
   expect(await f.tx.list('user_invitation')).toHaveLength(0);
 });
 it('never stages guest navigation until versioned consent and verified provider config',async()=>{
   const f=await fixture();
   expect(await stageTelegramPublicReplyIn(f.tx,f.source,{now:t})).toEqual({status:'NOT_APPLICABLE'});
   await f.tx.save(f.setting,{...f.setting.data,telegram_consent:false});
   expect(await f.stage()).toEqual({status:'NOT_APPLICABLE'});
   expect(f.tx.events).toHaveLength(0);
 });
 it('revoked user scope, channel membership, identity or consent blocks queued output',async()=>{
   for(const mode of ['role','channel','identity','consent','origin'] as const){
     const f=await fixture(),staged=await f.stage(),
       ticket=await f.tx.get('telegram_delivery',(staged as {delivery_id:string}).delivery_id);
     if(mode==='role')await f.tx.save(f.user,{...f.user.data,roles:['OWNER']});
     if(mode==='channel')await f.tx.save(f.channel,{...f.channel.data,members:[]});
     if(mode==='identity'){const id=await f.tx.get('contact_identity','identity');await f.tx.save(id,{...id.data,revokedAt:t});}
     if(mode==='consent')await f.tx.save(f.setting,{...f.setting.data,telegram_opted_out:true});
     const prep=mode==='origin'?await f.prepare(ticket,{publicOrigin:'https://evil.example/'})
       :await f.prepare(ticket);
     expect(prep.status).toBe('BLOCKED');
   }
 });
 it('does not send expired/replayed/out-of-context or tampered source replies',async()=>{
   const f=await fixture(),staged=await f.stage(),
     ticket=await f.tx.get('telegram_delivery',(staged as {delivery_id:string}).delivery_id);
   expect((await f.prepare(ticket,{now:'2026-10-26T19:30:01.000Z'})).status).toBe('BLOCKED');
   expect((await f.prepare({...ticket,data:{...ticket.data,response_hash:'wrong'}})).status).toBe('BLOCKED');
   await f.tx.save(f.source,{...f.source.data,input:{...f.source.data.input,text:'/owner'}});
   expect((await f.prepare(ticket)).status).toBe('BLOCKED');
 });
 it('does not stage unrecognized chat text as a bot response',async()=>{
   const f=await fixture(),source={...f.source,data:{...f.source.data,
     input:{...f.source.data.input,text:'Need a construction quotation tomorrow'}}};
   expect(await stageTelegramPublicReplyIn(f.tx,source,f.opts)).toEqual({status:'NOT_APPLICABLE'});
   expect(f.tx.events).toHaveLength(0);
 });
});
