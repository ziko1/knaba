import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {WorkerRunner,serviceId,type OutboxJob,type WorkerOptions} from '../apps/worker/runner.ts';
import type {Database,PgTransaction} from '../apps/api/database.ts';
import type {Engine} from '../apps/api/engine.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';
import type {WhatsAppCloudAdapter} from '../packages/integrations/whatsapp.ts';

beforeEach(()=>vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('REAL_NETWORK_MUST_NOT_BE_USED');})));
afterEach(()=>vi.unstubAllGlobals());

// Actual WorkerRunner.handle and delivery policy, with explicit in-memory
// SQL/actor/provider doubles. This is not PostgreSQL, real authorization or Meta.
function fixture(input:{origin?:string;mode?:string;kind?:'TEMPLATE'|'TEXT'|'WEB';afterClaim?:(options:WorkerOptions)=>void}={}){
  const company='synthetic-template-company',now='2026-11-08T12:00:00.000Z';
  const kind=input.kind??'TEMPLATE';
  const make=(entityKind:string,id:string,data:Data):Entity=>({kind:entityKind,id,companyId:company,version:1,data,createdAt:now,updatedAt:now});
  const initial=[
    make('delivery','delivery',{status:'PENDING',attempts:0,message_id:'message',message_version:1,recipient_id:'recipient',channel:kind==='WEB'?'WEB':'WHATSAPP',approved_template:'synthetic_template'}),
    make('message','message',{message_version:1,text:'Synthetic original text',channel_id:'channel'}),
    make('notification_setting','setting',{user_id:'recipient',language:'UK',whatsapp_consent:true,opted_out:false,quiet_start:0,quiet_end:0,...kind==='TEXT'?{last_inbound_at:now}:{}}),
    make('contact_identity','identity',{userId:'recipient',type:'WHATSAPP',value:'49123456789',verified:true,active:true}),
    make('whatsapp_template','template',{name:'synthetic_template',status:'APPROVED'}),
    make('notification','notice',{recipient_id:'recipient',delivery_id:'delivery',status:'AWAITING_DELIVERY'})
  ];
  const state=new Map(initial.map(e=>[`${e.kind}:${e.id}`,structuredClone(e)]));
  const changes:Entity[]=[];
  const job:OutboxJob={id:'synthetic-job',company_id:company,type:'delivery.requested',data:{delivery_id:'delivery'},attempts:1,leased_until:'2026-11-08T12:02:00.000Z',lease_token:'synthetic-lease'};
  const query=vi.fn(async(sql:string,params:unknown[])=>{
    expect(params).toEqual([company,job.id,job.lease_token]);
    if(sql.startsWith('SELECT id,type,data FROM outbox ')&&sql.endsWith(' FOR UPDATE'))return {rows:[{id:job.id,type:job.type,data:job.data}]};
    if(sql.startsWith('SELECT id FROM outbox '))return {rows:[{id:job.id}]};
    throw new Error('UNEXPECTED_SQL_DOUBLE_QUERY');
  });
  const tx={
    get:vi.fn(async(entityKind:string,id:string)=>{
      const found=state.get(`${entityKind}:${id}`);if(!found)throw new Error('UNKNOWN_SYNTHETIC_ENTITY');return structuredClone(found);
    }),
    list:vi.fn(async(entityKind:string)=>[...state.values()].filter(e=>e.kind===entityKind).map(e=>structuredClone(e))),
    save:vi.fn(async(entity:Entity,data:Data)=>{
      const current=state.get(`${entity.kind}:${entity.id}`)!;expect(entity.version).toBe(current.version);
      const next={...entity,version:entity.version+1,data:structuredClone(data)};state.set(`${entity.kind}:${entity.id}`,next);changes.push(structuredClone(next));return structuredClone(next);
    }),query
  } as unknown as PgTransaction;
  const send=vi.fn(async()=>({status:'API_ACCEPTED',provider_message_id:'synthetic-provider-id'}));
  const provider={phoneNumberId:'synthetic-provider-account',send} as unknown as WhatsAppCloudAdapter;
  const options:WorkerOptions={companyId:company,appMode:input.mode??'TEST',publicOrigin:input.origin,whatsapp:provider,testRecipients:['49123456789'],now:()=>new Date(now)};
  let mutated=false;
  const db={query,transaction:vi.fn(async(companyId:string,actorId:string,callback:(transaction:PgTransaction)=>Promise<unknown>)=>{
    expect(companyId).toBe(company);expect(actorId).toBe(serviceId);
    const result=await callback(tx);
    if(!mutated&&changes.some(e=>e.kind==='delivery'&&e.data.status==='SENDING')){mutated=true;input.afterClaim?.(options);}
    return result;
  })} as unknown as Database;
  const actor=(id:string):Actor=>({userId:id,companyId:company,roles:[id===serviceId?'SERVICE_ACCOUNT':'EMPLOYEE'],permissions:['integration.process','chat.read'],siteIds:[],customerIds:[],warehouseIds:[]});
  const execute=vi.fn(async()=>undefined);
  const engine={actorIn:vi.fn(async(_tx:unknown,id:string)=>actor(id)),getActor:vi.fn(async(id:string)=>actor(id)),
    scope:vi.fn((a:Actor)=>a),visible:vi.fn(async()=>true),execute} as unknown as Engine;
  const worker=new WorkerRunner(db,engine,options);
  return {worker,job,send,changes,execute,options,current:(entityKind='delivery',id='delivery')=>structuredClone(state.get(`${entityKind}:${id}`)!)};
}

describe('template origin boundary at the actual delivery consumer',()=>{
  it('rejects a missing template origin before SENDING or provider invocation',async()=>{
    const f=fixture();await f.worker.handle(f.job);
    expect(f.current().data).toMatchObject({status:'FAILED',failure_class:'DEFINITIVE',error:'PUBLIC_ORIGIN_REQUIRED_OR_INVALID',attempts:0});
    expect(f.send).not.toHaveBeenCalled();
    expect(f.changes.filter(e=>e.kind==='delivery').map(e=>e.data.status)).toEqual(['FAILED']);
    expect(f.current('notification','notice').data).toMatchObject({status:'FAILED',delivery_status:'FAILED',attempts:0});
  });
  it.each([
    ['empty','TEST',''],['whitespace','TEST',' '],['credentials','TEST','https://user:SYNTHETIC_SECRET@erp.example.test/'],
    ['path','TEST','https://erp.example.test/jobs'],['normalized path','TEST','https://erp.example.test/a/..'],
    ['query','TEST','https://erp.example.test/?'],['fragment','TEST','https://erp.example.test/#'],
    ['userinfo','TEST','https://@erp.example.test/'],['backslash','TEST','https://erp.example.test\\'],
    ['insecure production','PRODUCTION','http://erp.example.test/'],['invalid scheme','TEST','ftp://erp.example.test/']
  ])('rejects %s origin before the send claim even when WorkerRunner is directly injected',async(_label,mode,origin)=>{
    const f=fixture({mode,origin});await f.worker.handle(f.job);
    expect(f.current().data).toMatchObject({status:'FAILED',failure_class:'DEFINITIVE',error:'PUBLIC_ORIGIN_REQUIRED_OR_INVALID',attempts:0});
    for(const key of ['sending_started_at','sending_job_id','sending_lease_hash','provider_account_id','provider_recipient_phone'])expect(f.current().data[key]).toBeUndefined();
    expect(f.send).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
    expect(f.changes.filter(e=>e.kind==='delivery').map(e=>e.data.status)).toEqual(['FAILED']);
  });
  it.each([
    ['PRODUCTION','https://ERP.example.test:443/'],['TEST','http://127.0.0.1:3030/']
  ])('sends the explicit raw %s origin %s after its validated claim',async(mode,origin)=>{
    const f=fixture({mode,origin});await f.worker.handle(f.job);
    expect(f.send).toHaveBeenCalledExactlyOnceWith('49123456789',{
      kind:'TEMPLATE',name:'synthetic_template',language:'uk',approved:true,parameters:[origin]
    },{kind:'TEMPLATE',template:'synthetic_template'});
    expect(f.current().data).toMatchObject({status:'SENDING',attempts:1});
    expect(f.execute).toHaveBeenCalledWith(expect.anything(),'delivery.status',expect.objectContaining({
      input:{delivery_id:'delivery',status:'API_ACCEPTED',provider_message_id:'synthetic-provider-id'}
    }));
  });
  it('uses the validated snapshot even when mutable options change immediately after claim',async()=>{
    const origin='https://erp.example.test/';
    const f=fixture({origin,mode:'PRODUCTION',afterClaim:options=>{options.publicOrigin='https://different.example.test/';}});
    await f.worker.handle(f.job);
    expect(f.options.publicOrigin).toBe('https://different.example.test/');
    expect(f.send).toHaveBeenCalledWith('49123456789',expect.objectContaining({parameters:[origin]}),expect.anything());
  });
  it('keeps missing-origin text delivery available inside the permitted conversation window',async()=>{
    const f=fixture({kind:'TEXT'});await f.worker.handle(f.job);
    expect(f.send).toHaveBeenCalledExactlyOnceWith('49123456789',{kind:'TEXT',text:'Synthetic original text'},{kind:'TEXT',template:undefined});
    expect(f.current().data).toMatchObject({status:'SENDING',attempts:1});
  });
  it('keeps missing-origin WEB delivery independent of the external provider',async()=>{
    const f=fixture({kind:'WEB'});await f.worker.handle(f.job);
    expect(f.send).not.toHaveBeenCalled();
    expect(f.execute).toHaveBeenCalledWith(expect.anything(),'delivery.status',expect.objectContaining({input:{delivery_id:'delivery',status:'DELIVERED'}}));
  });
  it('does not retry a definitively failed delivery after configuration is later supplied',async()=>{
    const f=fixture();await f.worker.handle(f.job);const failed=f.current(),count=f.changes.length;
    f.options.publicOrigin='https://erp.example.test/';await f.worker.handle({...f.job,id:'new-synthetic-job'});
    expect(f.current()).toEqual(failed);expect(f.changes).toHaveLength(count);expect(f.send).not.toHaveBeenCalled();
  });
  it('preserves the existing provider-disabled gate before template configuration errors',async()=>{
    const f=fixture();f.options.whatsapp=undefined;await f.worker.handle(f.job);
    expect(f.current().data).toMatchObject({status:'FAILED',error:'PROVIDER_DISABLED',attempts:0});
    expect(f.send).not.toHaveBeenCalled();
  });
});
