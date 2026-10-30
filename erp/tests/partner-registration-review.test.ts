import {describe,it,expect} from 'vitest';
import {identityCommands} from '../packages/domain/identity.ts';
import {DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';

class MemoryTx implements Transaction {
  rows=new Map<string,Entity>();events:Array<{type:string;data:Data}>=[];
  constructor(readonly companyId='company-a'){}
  async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{
    const row=this.rows.get(kind+':'+id);
    if(!row||row.companyId!==this.companyId)throw new DomainError('NOT_FOUND_SAFE');
    return row as Entity<T>;
  }
  async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{
    return [...this.rows.values()].filter(row=>row.kind===kind&&row.companyId===this.companyId) as Entity<T>[];
  }
  async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+this.rows.size):Promise<Entity<T>>{
    const row:Entity<T>={kind,id,companyId:this.companyId,data,version:1,
      createdAt:'2026-10-28T04:00:00.000Z',updatedAt:'2026-10-28T04:00:00.000Z'};
    this.rows.set(kind+':'+id,row);return row;
  }
  async save(row:Entity,data:Data,version?:number):Promise<Entity>{
    const current=await this.get(row.kind,row.id);
    if(version!==undefined&&current.version!==version)throw new DomainError('VERSION_CONFLICT');
    const updated={...current,data,version:current.version+1};
    this.rows.set(row.kind+':'+row.id,updated);return updated;
  }
  async event(type:string,data:Data){this.events.push({type,data});}
}
const owner:Actor={userId:'owner',companyId:'company-a',roles:['OWNER'],
  permissions:['identity.manage','scope.company'],siteIds:[],customerIds:[],warehouseIds:[],
  mfaVerified:true,mfaVerifiedAt:'2026-10-28T04:01:00.000Z'};
const now='2026-10-28T04:01:00.000Z';
async function fixture(kind='partner_registration_interest'){
  const tx=new MemoryTx();
  await tx.add('user',{name:'Guest',roles:['GUEST'],active:true,guest:true},'guest-a');
  await tx.add('user',{name:'Owner',roles:['OWNER'],active:true},owner.userId);
  const registration=await tx.add(kind,{state:'REQUESTED',guest_user_id:'guest-a',
    source_provider:'TELEGRAM',channel_id:'channel-a',
    contact_identity_id:'contact-secret',requires_owner_review:true,
    requires_verified_portal_identity:true,roles_granted:[],partner_created:false},'request-a');
  const ctx:CommandContext={tx,actor:owner,now,idempotencyKey:'synthetic-review-key',
    expectedVersion:registration.version,requireSite:()=>{},requireOwn:()=>{}};
  const call=async(name:string,input:unknown,requester:CommandContext=ctx)=>{
    const def=identityCommands[name]!;
    expect(def).toBeDefined();
    return def.handler(requester,def.schema.parse(input));
  };
  return {tx,ctx,call,registration};
}
describe('company owner controls partner onboarding through one canonical command API',()=>{
  it('shows only redacted pending partner requests in company-scoped inbox',async()=>{
    const f=await fixture();
    const result=await f.call('partner_registration_interest.inbox',{limit:20});
    expect(result.items).toEqual([{id:'request-a',version:1,state:'REQUESTED',
      source_provider:'TELEGRAM',received_at:f.registration.createdAt,
      needs_portal_identity:false}]);
    expect(JSON.stringify(result)).not.toContain('contact-secret');
    expect(JSON.stringify(result)).not.toContain('guest-a');
    expect(JSON.stringify(result)).not.toContain('channel-a');
  });
  it('owner verified review only changes state and does not grant partner/company roles',async()=>{
    const f=await fixture();
    const result=await f.call('partner_registration_interest.review',{
      id:'request-a',decision:'REVIEW',reason:'Owner requested portal verification'});
    expect(result).toMatchObject({state:'AWAITING_IDENTITY_PROOF',
      partner_created:false,owner_verified:true,portal_identity_still_required:true});
    expect((await f.tx.get('partner_registration_interest','request-a')).data)
      .toMatchObject({reviewed_by:'owner',roles_granted:[],partner_created:false});
    expect(await f.tx.list('user_invitation')).toHaveLength(0);
    expect(await f.tx.list('user')).toHaveLength(2);
    expect(f.tx.events.map(e=>e.type)).toEqual(['partner.registration_reviewed']);
  });
  it('rejects denial decisions without a role or notification side effect',async()=>{
    const f=await fixture();
    const result=await f.call('partner_registration_interest.review',{
      id:'request-a',decision:'REJECT',reason:'Unable to verify'});
    expect(result.state).toBe('REJECTED');
    expect(await f.tx.list('user_invitation')).toHaveLength(0);
  });
  it('requires current owner MFA, matching version and guest identity',async()=>{
    const f=await fixture();
    const input={id:'request-a',decision:'REVIEW',reason:'Reviewed'};
    for(const patch of [{actor:{...owner,mfaVerified:false}},{actor:{...owner,roles:['GUEST']}},{expectedVersion:2}]){
      await expect(f.call('partner_registration_interest.review',input,{...f.ctx,...patch}))
        .rejects.toMatchObject({code:patch.expectedVersion?'VERSION_CONFLICT':patch.actor?.mfaVerified===false?'NEEDS_REAUTH':'NEEDS_REAUTH'});
    }
    const guest=await f.tx.get('user','guest-a');
    await f.tx.save(guest,{...guest.data,guest:false,roles:['OWNER']});
    await expect(f.call('partner_registration_interest.review',input))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('never exposes partner requests to outsider, bot ID, or unsupported role',async()=>{
    const f=await fixture();
    const outsider={...f.ctx,actor:{...owner,userId:'stranger',roles:['GUEST'],
      permissions:['identity.manage'],mfaVerified:true}};
    await expect(f.call('partner_registration_interest.inbox',{limit:20},outsider))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(f.call('partner_registration_interest.review',{
      id:'request-a',decision:'REVIEW',reason:'Not allowed'},outsider))
      .rejects.toMatchObject({code:'NEEDS_REAUTH'});
  });
  it('preserves worker review commands after adding partner intake',async()=>{
    const f=await fixture('worker_registration_interest');
    const result=await f.call('worker_registration_interest.review',{
      id:'request-a',decision:'REVIEW',reason:'Owner verified worker request'});
    expect(result.state).toBe('AWAITING_IDENTITY_PROOF');
    expect(result.employee_created).toBe(false);
  });
});
