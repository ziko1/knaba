import {describe,expect,it} from 'vitest';
import {botChannelPolicyCommands,botChannelPolicyFor,botAllowsPublicAutoReply} from '../packages/domain/bot-channel-policy.ts';
import {DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';
class Tx implements Transaction {
  rows=new Map<string,Entity>();events:Array<{type:string;data:Data}>=[];
  constructor(readonly companyId:string){}
  async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{
    const row=this.rows.get(kind+':'+id);if(!row||row.companyId!==this.companyId)throw new DomainError('NOT_FOUND_SAFE');
    return row as Entity<T>;
  }
  async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{
    return [...this.rows.values()].filter(x=>x.kind===kind&&x.companyId===this.companyId) as Entity<T>[];
  }
  async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+this.rows.size):Promise<Entity<T>>{
    const row:Entity<T>={kind,id,companyId:this.companyId,version:1,data,
      createdAt:'2026-10-28T05:00:00.000Z',updatedAt:'2026-10-28T05:00:00.000Z'};
    this.rows.set(kind+':'+id,row);return row;
  }
  async save(row:Entity,data:Data,expectedVersion?:number):Promise<Entity>{
    const old=await this.get(row.kind,row.id);
    if(expectedVersion!==undefined&&old.version!==expectedVersion)throw new DomainError('VERSION_CONFLICT');
    const next={...old,version:old.version+1,data};
    this.rows.set(row.kind+':'+row.id,next);return next;
  }
  async event(type:string,data:Data){this.events.push({type,data});}
}
const owner:Actor={userId:'owner',companyId:'company-a',roles:['OWNER'],
  permissions:['bot.settings.manage'],siteIds:[],customerIds:[],warehouseIds:[],
  mfaVerified:true,mfaVerifiedAt:'2026-10-28T05:00:00.000Z'};
const policy={channel:'TELEGRAM',defaultLanguage:'RU',
  workerRequestsEnabled:false,partnerRequestsEnabled:true,
  humanEscalationEnabled:true,replyMode:'RULE_BASED' as const};
const ctx=(tx:Tx,actor:Actor=owner,version?:number):CommandContext=>({
  tx,actor,expectedVersion:version,idempotencyKey:'bounded-test-credential-free',
  now:'2026-10-28T05:00:00.000Z',requireSite:()=>{},requireOwn:()=>{}
});
async function call(tx:Tx,name:string,input:unknown,actor:Actor=owner,version?:number){
  const command=botChannelPolicyCommands[name]!;
  expect(command).toBeDefined();
  return command.handler(ctx(tx,actor,version),command.schema.parse(input));
}
describe('owner-managed channel preferences are safe to save before server provider credentials exist',()=>{
  it('starts with safe defaults and no server-key material',async()=>{
    const tx=new Tx('company-a');
    expect(await botChannelPolicyFor(tx,'TELEGRAM')).toMatchObject({
      channel:'TELEGRAM',defaultLanguage:'DE',workerRequestsEnabled:true,
      partnerRequestsEnabled:true,humanEscalationEnabled:true,replyMode:'HUMAN_FIRST'});
    expect(await call(tx,'bot.channel.preferences.read',{channel:'TELEGRAM'}))
      .toMatchObject({channel:'TELEGRAM',version:0,providerReady:false});
    expect(await tx.list('bot_config')).toHaveLength(0);
  });
  it('stores an owner preference for Telegram, consumes it through the canonical resolver, and audits safely',async()=>{
    const tx=new Tx('company-a');
    const saved=await call(tx,'bot.channel.preferences.configure',policy);
    expect(saved).toMatchObject({channel:'TELEGRAM',version:1,providerReady:false});
    const resolved=await botChannelPolicyFor(tx,'TELEGRAM');
    expect(resolved).toMatchObject(policy);
    expect((await botChannelPolicyFor(tx,'WHATSAPP')).defaultLanguage).toBe('DE');
    expect(tx.events).toEqual([{type:'bot.channel_preferences_updated',data:{
      channel:'TELEGRAM',config_id:expect.any(String),version:1,updated_by:'owner'
    }}]);
    expect(JSON.stringify([...tx.rows.values()])).not.toContain('accessToken');
    expect(JSON.stringify([...tx.rows.values()])).not.toContain('TELEGRAM_BOT_TOKEN');
  });
  it('requires expected previous version for rotation; stale values never overwrite',async()=>{
    const tx=new Tx('company-a');
    await call(tx,'bot.channel.preferences.configure',policy);
    await expect(call(tx,'bot.channel.preferences.configure',{...policy,partnerRequestsEnabled:false}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    await expect(call(tx,'bot.channel.preferences.configure',{...policy,partnerRequestsEnabled:false},owner,3))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    await call(tx,'bot.channel.preferences.configure',{...policy,partnerRequestsEnabled:false},owner,1);
    expect((await botChannelPolicyFor(tx,'TELEGRAM')).partnerRequestsEnabled).toBe(false);
  });
  it('no bot sender, guest or developer without explicit owner-granted permission can save settings',async()=>{
    const tx=new Tx('company-a');
    const actors=[
      {...owner,roles:['GUEST']},
      {...owner,roles:['DEVELOPER_SUPPORT'],permissions:['integration.status']},
      {...owner,mfaVerified:false},
      {...owner,companyId:'other-company'}
    ];
    for(const actor of actors)
      await expect(call(tx,'bot.channel.preferences.configure',policy,actor))
        .rejects.toMatchObject({code:expect.stringMatching(/ACCESS_DENIED|NEEDS_REAUTH/)});
    expect(await tx.list('bot_config')).toHaveLength(0);
  });
  it('allows explicit, MFA-verified developer technical delegation, never inherited owner rights',async()=>{
    const tx=new Tx('company-a');
    const dev={...owner,userId:'developer',roles:['DEVELOPER_SUPPORT'],permissions:['bot.settings.manage']};
    const saved=await call(tx,'bot.channel.preferences.configure',policy,dev);
    expect(saved).toMatchObject({version:1,providerReady:false});
    expect((await tx.get('bot_config','knaba-channel-telegram')).data.updatedBy).toBe('developer');
    expect(dev.permissions).not.toContain('identity.manage');
  });
  it('rejects raw secrets, invented channel modes and disabling human escalation',async()=>{
    const tx=new Tx('company-a');
    for(const invalid of [
      {...policy,token:'secret123'},{...policy,publicAccessToken:'xyz'},
      {...policy,replyMode:'UNRESTRICTED_AI'},
      {...policy,humanEscalationEnabled:false},
      {...policy,channel:'SIGNAL'}
    ])expect(()=>botChannelPolicyCommands['bot.channel.preferences.configure']!.schema.parse(invalid))
      .toThrow();
    expect(await tx.list('bot_config')).toHaveLength(0);
  });

  it('owner mode controls automatic public replies without disabling manual handoff',async()=>{
    const tx=new Tx('company-a');
    const initial=await botChannelPolicyFor(tx,'TELEGRAM');
    expect(botAllowsPublicAutoReply(initial)).toBe(false);
    await call(tx,'bot.channel.preferences.configure',policy);
    const enabled=await botChannelPolicyFor(tx,'TELEGRAM');
    expect(botAllowsPublicAutoReply(enabled)).toBe(true);
    expect(enabled.humanEscalationEnabled).toBe(true);
  });
});
