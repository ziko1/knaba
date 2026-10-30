import {describe,it,expect} from 'vitest';
import {DomainError,type Actor,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';
import {captureMessengerWorkerInterest,captureMessengerPartnerInterest} from '../packages/integrations/messenger-worker-interest.ts';

class MemoryTx implements Transaction {
  private entries=new Map<string,Entity>();
  events:Array<{type:string;data:Data}>=[];
  constructor(readonly companyId:string){}
  key(kind:string,id:string){return kind+':'+id;}
  async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{
    const row=this.entries.get(this.key(kind,id));
    if(!row||row.companyId!==this.companyId)throw new DomainError('NOT_FOUND_SAFE');
    return row as Entity<T>;
  }
  async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{
    return [...this.entries.values()].filter(x=>x.kind===kind&&x.companyId===this.companyId) as Entity<T>[];
  }
  async add<T extends Data=Data>(kind:string,data:T,id='id-'+this.entries.size):Promise<Entity<T>>{
    if(this.entries.has(this.key(kind,id)))throw new DomainError('VERSION_CONFLICT');
    const row={kind,id,data,companyId:this.companyId,version:1,createdAt:'2026-10-26T17:00:00.000Z',updatedAt:'2026-10-26T17:00:00.000Z'};
    this.entries.set(this.key(kind,id),row);return row;
  }
  async save(entity:Entity,data:Data):Promise<Entity>{
    const current=await this.get(entity.kind,entity.id);
    if(current.version!==entity.version)throw new DomainError('VERSION_CONFLICT');
    const row={...current,data,version:current.version+1};this.entries.set(this.key(entity.kind,entity.id),row);return row;
  }
  async event(type:string,data:Data){this.events.push({type,data});}
}
const now='2026-10-26T17:05:00.000Z';
async function setup(provider:'TELEGRAM'|'WHATSAPP'='TELEGRAM',company='site-a'){
  const tx=new MemoryTx(company),sender=provider==='TELEGRAM'?'187650211':'4915700000001',userId='guest-a';
  const roles=provider==='TELEGRAM'?['GUEST']:['GUEST','CLIENT'];
  const actor:Actor={userId,companyId:company,roles,permissions:['chat.read','chat.write'],
    siteIds:[],customerIds:[],warehouseIds:[]};
  await tx.add('user',{roles,active:true,guest:true,siteIds:[],warehouseIds:[],customerIds:[]},userId);
  await tx.add('contact_identity',{type:provider,value:sender,verified:true,active:true,userId},'contact-a');
  const source=await tx.add('conversation_input',{provider,provider_event_id:'event-1',user_id:userId,
    channel_id:'channel-1',status:'PENDING',input:{kind:'MESSAGE',id:'event-1',sender,text:'/register'}},'input-1');
  return {tx,actor,source,sender,company};
}
describe('KNABA messenger worker interest; no role changes',()=>{
  it.each(['TELEGRAM','WHATSAPP'] as const)('%s guest intent creates one pending receipt and no account',async provider=>{
    const f=await setup(provider);
    const receipt=await captureMessengerWorkerInterest(f.tx,f.actor,f.source,now);
    expect(receipt).toMatchObject({state:'REQUESTED',created:true});
    expect(f.tx.events).toHaveLength(1);
    expect(f.tx.events[0]?.type).toBe('worker.registration_requested');
    expect(f.tx.events[0]?.data).not.toHaveProperty('sender');
    const [request]=(await f.tx.list('worker_registration_interest'));
    expect(request!.data).toMatchObject({source_provider:provider,guest_user_id:'guest-a',
      roles_granted:[],site_ids_granted:[],employee_created:false,requires_owner_review:true});
    expect(await f.tx.list('user')).toHaveLength(1);
    expect(await f.tx.list('user_invitation')).toHaveLength(0);
  });
  it('replayed sender request is deduped across distinct provider messages and creates no new outbox event',async()=>{
    const f=await setup();
    const first=await captureMessengerWorkerInterest(f.tx,f.actor,f.source,now);
    const second=await f.tx.add('conversation_input',{...f.source.data,provider_event_id:'event-2',
      input:{...f.source.data.input,id:'event-2'}},'input-2');
    const replay=await captureMessengerWorkerInterest(f.tx,f.actor,second,now);
    expect(replay).toEqual({id:first.id,state:'REQUESTED',created:false});
    expect(f.tx.events).toHaveLength(1);
  });
  it('different companies and channel providers cannot collide',async()=>{
    const a=await setup('TELEGRAM','company-a'),b=await setup('TELEGRAM','company-b');
    const c=await setup('WHATSAPP','company-a');
    const ids=await Promise.all([captureMessengerWorkerInterest(a.tx,a.actor,a.source,now),
      captureMessengerWorkerInterest(b.tx,b.actor,b.source,now),
      captureMessengerWorkerInterest(c.tx,c.actor,c.source,now)]);
    expect(new Set(ids.map(x=>x.id)).size).toBe(3);
    await expect(captureMessengerWorkerInterest(a.tx,b.actor,a.source,now))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('rejects impersonated privileged roles even if guest flag is copied',async()=>{
    const f=await setup();
    await f.tx.save(await f.tx.get('user','guest-a'),{roles:['GUEST','DIRECTOR'],guest:true,active:true});
    await expect(captureMessengerWorkerInterest(f.tx,{...f.actor,roles:['GUEST','DIRECTOR']},f.source,now))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('rejects ambiguous, revoked and mismatched identities and a processed inbound source',async()=>{
    const f=await setup();
    await f.tx.add('contact_identity',{type:'TELEGRAM',value:f.sender,verified:true,active:true,userId:'other'},'other');
    await expect(captureMessengerWorkerInterest(f.tx,f.actor,f.source,now))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
    await f.tx.save(await f.tx.get('contact_identity','other'),{type:'TELEGRAM',value:f.sender,verified:true,active:false,userId:'other'});
    const identity=await f.tx.get('contact_identity','contact-a');
    await f.tx.save(identity,{...identity.data,revoked_at:now});
    await expect(captureMessengerWorkerInterest(f.tx,f.actor,f.source,now))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(captureMessengerWorkerInterest(f.tx,f.actor,{...f.source,data:{...f.source.data,status:'PROCESSED'}},now))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('does not reopen a rejected application without a separate privileged owner decision',async()=>{
    const f=await setup(),receipt=await captureMessengerWorkerInterest(f.tx,f.actor,f.source,now);
    const row=await f.tx.get('worker_registration_interest',receipt.id);
    await f.tx.save(row,{...row.data,state:'REJECTED'});
    const again=await captureMessengerWorkerInterest(f.tx,f.actor,f.source,now);
    expect(again).toMatchObject({state:'REJECTED',created:false});
    expect(f.tx.events).toHaveLength(1);
  });
});


describe('partner registration uses the existing messenger intake and owner-review boundary',()=>{
  it.each(['TELEGRAM','WHATSAPP'] as const)('records %s partner request without issuing an account or rights',async provider=>{
    const f=await setup(provider);
    const receipt=await captureMessengerPartnerInterest(f.tx,f.actor,f.source,now);
    expect(receipt).toMatchObject({state:'REQUESTED',created:true});
    const rows=await f.tx.list('partner_registration_interest');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data).toMatchObject({
      source_provider:provider,guest_user_id:'guest-a',requires_owner_review:true,
      requires_verified_portal_identity:true,roles_granted:[],partner_created:false
    });
    expect(f.tx.events).toHaveLength(1);
    expect(f.tx.events[0]!.type).toBe('partner.registration_requested');
    expect(f.tx.events[0]!.data).not.toHaveProperty('sender');
    expect(await f.tx.list('user_invitation')).toHaveLength(0);
    expect(await f.tx.list('user')).toHaveLength(1);
  });
  it('does not multiply partner requests on replay and does not merge worker and partner identities',async()=>{
    const f=await setup();
    const p=await captureMessengerPartnerInterest(f.tx,f.actor,f.source,now);
    const w=await captureMessengerWorkerInterest(f.tx,f.actor,f.source,now);
    expect(p.id).not.toBe(w.id);
    const replay=await captureMessengerPartnerInterest(f.tx,f.actor,f.source,now);
    expect(replay).toEqual({...p,created:false});
    expect(f.tx.events).toHaveLength(2);
  });
  it('rejects forged company scope, elevated roles or revoked identity',async()=>{
    const f=await setup();
    await expect(captureMessengerPartnerInterest(f.tx,{...f.actor,companyId:'other'},f.source,now))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(captureMessengerPartnerInterest(f.tx,{...f.actor,roles:['OWNER']},f.source,now))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
    const identity=await f.tx.get('contact_identity','contact-a');
    await f.tx.save(identity,{...identity.data,revokedAt:now});
    await expect(captureMessengerPartnerInterest(f.tx,f.actor,f.source,now))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
});
