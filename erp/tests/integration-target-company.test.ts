import {describe,expect,it,vi} from 'vitest';
import {acceptIntegrationEvent} from '../apps/api/integration-events.ts';
import type {Database} from '../apps/api/database.ts';
import {DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';
import {applyIntegrationEnvelope,integrationCommands,integrationEnvelopeSchema,type IntegrationEnvelope} from '../packages/domain/integrations.ts';
import {signIntegrationEvent,type IntegrationCredential} from '../packages/integrations/generic-events.ts';

// Real signed adapter and canonical integration commands with explicit CPU storage.
// These tests do not replace the HTTP/PostgreSQL bridge acceptance suite.
const NOW='2026-11-08T00:00:00.000Z',NOW_MS=Date.parse(NOW),STAMP=String(NOW_MS/1000);
const SOURCE='synthetic_site',COMPANY='company_a';
const original:IntegrationCredential={source:SOURCE,companyId:COMPANY,keyId:'key_1',secret:'synthetic-original-key-for-tests-only-123456789',enabled:true};
const rotated:IntegrationCredential={...original,keyId:'key_2',secret:'synthetic-rotated-key-for-tests-only-123456789'};
const actor:Actor={companyId:COMPANY,userId:'owner',roles:['OWNER'],permissions:['bot.settings.manage'],siteIds:[],warehouseIds:[],customerIds:[],mfaVerified:true};

function envelope(target=COMPANY):IntegrationEnvelope {
  return integrationEnvelopeSchema.parse({schema_version:'1',event_id:'site-lead-request_1',event_type:'lead.upsert',source:SOURCE,
    occurred_at:NOW,external_id:'request_1',target_company_id:target,
    payload:{contact:{name:'Synthetic intake contact',email:'intake@example.test'},serviceIds:['service_1']}});
}
function signed(body:Buffer,key:IntegrationCredential) {
  return {keyId:key.keyId,timestamp:STAMP,signature:signIntegrationEvent(body,STAMP,key.secret)};
}
class CpuTransaction implements Transaction {
  companyId=COMPANY;rows=new Map<string,Entity>();events:{type:string;data:Data}[]=[];sequence=0;
  async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>> {
    const row=this.rows.get(`${kind}:${id}`);
    if(!row||row.companyId!==this.companyId)throw new DomainError('NOT_FOUND_SAFE');
    return structuredClone(row) as Entity<T>;
  }
  async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]> {
    return [...this.rows.values()].filter(row=>row.companyId===this.companyId&&row.kind===kind).map(row=>structuredClone(row) as Entity<T>);
  }
  async add<T extends Data=Data>(kind:string,data:T,id=`row_${++this.sequence}`):Promise<Entity<T>> {
    if(this.rows.has(`${kind}:${id}`))throw new DomainError('VERSION_CONFLICT');
    const row={companyId:this.companyId,kind,id,data:structuredClone(data),version:1,createdAt:NOW,updatedAt:NOW};
    this.rows.set(`${kind}:${id}`,row);return structuredClone(row);
  }
  async save(entity:Entity,data:Data,expectedVersion=entity.version):Promise<Entity> {
    const previous=await this.get(entity.kind,entity.id);
    if(previous.version!==expectedVersion)throw new DomainError('VERSION_CONFLICT');
    const row={...previous,data:structuredClone(data),version:previous.version+1,updatedAt:NOW};
    this.rows.set(`${entity.kind}:${entity.id}`,row);return structuredClone(row);
  }
  async event(type:string,data:Data){this.events.push({type,data:structuredClone(data)});}
}
async function setup() {
  const tx=new CpuTransaction();
  await tx.add('user',{roles:['OWNER'],active:true},'owner');await tx.add('service',{active:true},'service_1');
  const context:CommandContext={tx,actor,now:NOW,idempotencyKey:'synthetic-target-config',requireOwn(){throw Error('Unexpected own access');},requireSite(){throw Error('Unexpected site access');}};
  const command=async(name:string,input:Data)=>{const definition=integrationCommands[name]!;return definition.handler(context,definition.schema.parse(input));};
  const draft=await command('integration_config.create',{source:SOURCE,ownerUserId:'owner',allowedServiceIds:['service_1'],credentialKeyIds:['key_1','key_2']});
  const preview=await command('integration_config.preview',{id:draft.id,example:envelope()});
  const active=await command('integration_config.activate',{id:draft.id,command_hash:preview.command_hash,expected_version:preview.expected_version});
  const transaction=vi.fn(async(companyId:string,_actorId:string,fn:(current:Transaction)=>Promise<unknown>)=>{
    expect(companyId).toBe(COMPANY);const before=structuredClone({rows:tx.rows,events:tx.events,sequence:tx.sequence});
    try{return await fn(tx);}catch(error){Object.assign(tx,before);throw error;}
  });
  return {tx,active,command,transaction,db:{transaction} as unknown as Pick<Database,'transaction'>};
}

describe('signed integration destination remains pinned through credential rotation',()=>{
  it('rejects a correctly signed old event if the rotated key now maps to another company, before opening any transaction',async()=>{
    const body=Buffer.from(JSON.stringify(envelope())),retargeted={...rotated,companyId:'company_b'},transaction=vi.fn();
    await expect(acceptIntegrationEvent({transaction} as unknown as Pick<Database,'transaction'>,[retargeted],SOURCE,body,signed(body,retargeted),NOW_MS)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect(transaction).not.toHaveBeenCalled();
  });
  it('keeps legacy envelopes without a destination compatible with the real signed adapter',async()=>{
    const f=await setup(),legacy=envelope();delete legacy.target_company_id;
    const body=Buffer.from(JSON.stringify(legacy)),receipt=await acceptIntegrationEvent(f.db,[original],SOURCE,body,signed(body,original),NOW_MS);
    expect(receipt).toMatchObject({event_id:legacy.event_id,status:'APPLIED',duplicate:false});
    expect(f.transaction).toHaveBeenCalledTimes(1);expect(await f.tx.list('lead')).toHaveLength(1);
  });
  it('accepts same-company key rotation and deduplicates the exact immutable body without a second lead or event',async()=>{
    const f=await setup(),body=Buffer.from(JSON.stringify(envelope()));
    const first=await acceptIntegrationEvent(f.db,[original],SOURCE,body,signed(body,original),NOW_MS);
    const second=await acceptIntegrationEvent(f.db,[rotated],SOURCE,body,signed(body,rotated),NOW_MS);
    expect(first).toMatchObject({status:'APPLIED',duplicate:false});
    expect(second).toEqual({...first,duplicate:true});
    expect(await f.tx.list('lead')).toHaveLength(1);expect(await f.tx.list('integration_event')).toHaveLength(1);
    expect(f.tx.events.filter(event=>event.type==='lead.created')).toHaveLength(1);
    expect((await f.tx.list('lead'))[0]!.data.marketingConsent).toBe(false);
    expect(await f.tx.list('user')).toHaveLength(1);expect(await f.tx.list('contact_identity')).toEqual([]);
  });
  it('rejects a foreign signed destination through direct domain application without persisting quarantine or business effects',async()=>{
    const f=await setup(),before=structuredClone({rows:f.tx.rows,events:f.tx.events});
    await expect(applyIntegrationEnvelope(f.tx,f.active,envelope('company_b'),'key_1',NOW)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect({rows:f.tx.rows,events:f.tx.events}).toEqual(before);
  });
  it('does not advertise a successful dry run for an example targeting another company',async()=>{
    const f=await setup(),draft=await f.command('integration_config.create',{source:SOURCE,ownerUserId:'owner',allowedServiceIds:['service_1'],credentialKeyIds:['key_2']});
    const before=structuredClone({rows:f.tx.rows,events:f.tx.events});
    await expect(f.command('integration_config.preview',{id:draft.id,example:envelope('company_b')})).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect({rows:f.tx.rows,events:f.tx.events}).toEqual(before);
  });
});
