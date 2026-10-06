import { describe, expect, it, vi } from 'vitest';
import { authorityFingerprint } from '../apps/api/authority-fingerprint.ts';
import type { EngineLike, SqlTransaction } from '../apps/api/auth.ts';
import { assert, type Actor, type Data, type Entity, type CommandContext } from '../packages/domain/core.ts';
import { delegationScope, effectiveDelegations, governanceCommands, type EffectiveDelegations } from '../packages/domain/governance.ts';
import { ROLE_PERMISSIONS } from '../packages/domain/permissions.ts';

const NOW='2026-10-06T10:00:00.000Z',LATER='2026-10-06T11:00:00.000Z',FUTURE='2026-10-07T10:00:00.000Z';
class Memory implements SqlTransaction {
  rows=new Map<string,Entity>();writes=0;sequence=0;reads:string[]=[];
  put(kind:string,id:string,data:Data,companyId='company'){const row={kind,id,data:structuredClone(data),companyId,version:1,createdAt:NOW,updatedAt:NOW};this.rows.set(kind+':'+id,row);return row;}
  async get<T extends Data=Data>(kind:string,id:string){const row=this.rows.get(kind+':'+id);assert(row,'NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
  async list<T extends Data=Data>(kind:string){this.reads.push(kind);return [...this.rows.values()].filter(r=>r.kind===kind).map(r=>structuredClone(r) as Entity<T>);}
  async add<T extends Data=Data>(kind:string,data:T,id='row-'+ ++this.sequence){this.writes++;return this.put(kind,id,data) as Entity<T>;}
  async save(row:Entity,data:Data){this.writes++;return this.put(row.kind,row.id,data);}
  async event(){this.writes++;}
}
function fixture(){
  const tx=new Memory();let clock=NOW;
  const user=tx.put('user','self',{active:true,roles:['EMPLOYEE'],permissions:[],siteIds:['A'],warehouseIds:['W']});
  for(const id of ['A','B','C'])tx.put('site',id,{active:true});
  tx.put('channel','channel',{type:'SITE_INTERNAL',site_id:'A',members:[{user_id:'self',history_from:NOW,expires_at:FUTURE},{user_id:'other',history_from:NOW}],name:'PRIVATE_NAME',handoff:{state:'AI_ACTIVE'}});
  tx.put('customer_membership','membership',{userId:'self',customerId:'customer',siteIds:['A'],permissions:['VIEW'],active:true,expiresAt:FUTURE,privateContact:'PRIVATE_CONTACT'});
  const authority=new WeakMap<Actor,{base:Actor;effective:EffectiveDelegations}>();
  const actorIn=vi.fn(async (_tx:SqlTransaction,userId:string)=>{
    const row=await tx.get('user',userId);assert(row.data.active===true,'ACCESS_DENIED');
    const base:Actor={userId,companyId:row.companyId,roles:row.data.roles,permissions:[...new Set([...row.data.roles.flatMap((r:string)=>ROLE_PERMISSIONS[r]??[]),...row.data.permissions])],siteIds:row.data.siteIds,warehouseIds:row.data.warehouseIds,customerIds:(await tx.list('customer_membership')).filter(m=>m.companyId===row.companyId&&m.data.userId===userId&&m.data.active&&!m.data.revokedAt&&(!m.data.expiresAt||Date.parse(m.data.expiresAt)>Date.parse(clock))&&m.data.permissions.includes('VIEW')).map(m=>m.data.customerId)};
    const effective=await effectiveDelegations(tx,base,clock),fresh={...base,permissions:[...new Set([...base.permissions,...effective.grants.flatMap(g=>g.permissions)])]};authority.set(fresh,{base,effective});return fresh;
  });
  const scope=(a:Actor,p:string)=>{const state=authority.get(a)!;return delegationScope(state.base,state.effective,p);};
  const engine={actorIn,scope,visible:async(_tx:SqlTransaction,a:Actor,row:Entity):Promise<boolean>=>{const scoped=scope(a,'chat.read');return scoped.permissions.includes('chat.read')&&(scoped.permissions.includes('scope.company')||scoped.siteIds.includes(row.data.site_id));},registry:{},execute:vi.fn(),getActor:vi.fn(),readEntities:vi.fn()} satisfies EngineLike;
  const stale:Actor={userId:'self',companyId:'company',roles:['OWNER'],permissions:['scope.company'],siteIds:['STALE'],warehouseIds:[],customerIds:[]};
  const read=(at=NOW)=>{clock=at;return authorityFingerprint(tx,engine,stale,at);};
  return {tx,user,engine,read,stale};
}
describe('read-only hash of current stream authority (CPU, not PostgreSQL)',()=>{
  it('reloads the current actor instead of fingerprinting stale auth and returns only a SHA256',async()=>{
    const f=fixture(),hash=await f.read();expect(hash).toMatch(/^[a-f0-9]{64}$/);expect(f.engine.actorIn).toHaveBeenCalledWith(f.tx,'self');expect(f.tx.writes).toBe(0);expect(f.engine.execute).not.toHaveBeenCalled();
    f.stale.roles=['CLIENT'];f.stale.permissions=[];f.stale.siteIds=[];expect(await f.read()).toBe(hash);
  });
  it.each(['roles','permissions','siteIds','warehouseIds'] as const)('detects a freshly changed %s without any notification or message',async(field)=>{
    const f=fixture(),before=await f.read();f.user.data[field]=field==='roles'?['QUALITY_CONTROL']:field==='permissions'?['assistant.usage']:['NEW'];expect(await f.read()).not.toBe(before);
  });
  it('stays stable across new messages, channel versions, names, handoff data and unrelated users',async()=>{
    const f=fixture(),before=await f.read(),channel=f.tx.rows.get('channel:channel')!;
    channel.version=999;channel.updatedAt=FUTURE;channel.data.name='UPDATED_PRIVATE_NAME';channel.data.handoff={state:'HUMAN_ACTIVE',owner_id:'other'};channel.data.members[1].revoked_at=NOW;
    f.tx.put('message','new',{channel_id:'channel',text:'PRIVATE_CHAT_TEXT'});f.tx.put('user','other',{roles:['OWNER'],permissions:['assistant.usage'],siteIds:['C']});f.tx.put('customer_membership','other',{userId:'other',customerId:'other-customer',active:true,permissions:['VIEW']});
    expect(await f.read()).toBe(before);expect(f.tx.reads).not.toContain('message');
  });
  it('ignores arbitrary profile/credentials/private content, inactive historical memberships and foreign-company rows',async()=>{
    const f=fixture(),before=await f.read();Object.assign(f.user.data,{name:'PRIVATE_NAME',tokenHash:'PRIVATE_TOKEN',passwordHash:'PRIVATE_PASSWORD',language:'RU'});
    f.tx.put('customer_membership','old',{userId:'self',customerId:'old',active:false,permissions:['VIEW']});f.tx.put('channel','foreign',{members:[{user_id:'self'}],type:'DIRECT'},'other-company');
    expect(await f.read()).toBe(before);
  });
  it('uses canonical set/row ordering without entity revisions or ticking server time',async()=>{
    const f=fixture();f.user.data.permissions=['custom.b','custom.a'];f.user.data.siteIds=['A','B'];f.user.data.warehouseIds=['W','X'];
    const before=await f.read();f.user.data.permissions.reverse();f.user.data.siteIds=['B','A','A'];f.user.data.warehouseIds.reverse();f.tx.rows=new Map([...f.tx.rows.entries()].reverse());
    expect(await f.read('2026-10-06T10:00:10Z')).toBe(before);
  });
  it.each(['REVOKE','EXPIRY','VIEW','SITE','CUSTOMER'] as const)('detects own customer membership %s with unchanged message digest',async(change)=>{
    const f=fixture(),before=await f.read(),d=f.tx.rows.get('customer_membership:membership')!.data;
    if(change==='REVOKE')d.revokedAt=NOW;else if(change==='EXPIRY')d.expiresAt=NOW;else if(change==='VIEW')d.permissions=[];else if(change==='SITE')d.siteIds=['B'];else d.customerId='new-customer';expect(await f.read()).not.toBe(before);
  });
  it('expiry transitions require no source write and close exactly at the server timestamp',async()=>{
    const f=fixture();f.tx.rows.get('customer_membership:membership')!.data.expiresAt=LATER;f.tx.rows.get('channel:channel')!.data.members[0].expires_at=LATER;
    const before=await f.read('2026-10-06T10:59:59.999Z');expect(await f.read(LATER)).not.toBe(before);expect(f.tx.writes).toBe(0);
  });
  it.each(['REVOKE','HISTORY','TYPE','SITE','TASK','CONFIDENTIAL'] as const)('detects own channel %s ACL change, excluding other-member changes',async(change)=>{
    const f=fixture(),before=await f.read(),d=f.tx.rows.get('channel:channel')!.data;
    if(change==='REVOKE')d.members[0].revoked_at=NOW;else if(change==='HISTORY')d.members[0].history_from=LATER;else if(change==='TYPE')d.type='SITE_CLIENT';else if(change==='SITE')d.site_id='B';else if(change==='TASK')d.task_id='task';else d.confidential=true;
    expect(await f.read()).not.toBe(before);
  });
  it('permission-specific delegation changes are detected even when the permission union remains unchanged',async()=>{
    const f=fixture();f.tx.put('user','grantor',{active:true,roles:[],permissions:['role.manage','task.read'],siteIds:['B','C'],warehouseIds:[]});
    const grantor:Actor={userId:'grantor',companyId:'company',roles:['OWNER'],permissions:[...ROLE_PERMISSIONS.OWNER!,'task.read'],siteIds:['B','C'],warehouseIds:[],customerIds:[],mfaVerified:true};
    const ctx:CommandContext={tx:f.tx,actor:grantor,now:NOW,idempotencyKey:'synthetic',requireSite:()=>{},requireOwn:()=>{}};
    const definition=governanceCommands['delegation.create']!,draft=await definition.handler(ctx,definition.schema.parse({granteeId:'self',permissions:['task.read'],siteIds:['B'],startsAt:NOW,expiresAt:LATER,reason:'Synthetic authority regression'}));
    f.tx.rows.get('delegation:'+draft.id)!.data.state='APPROVED';
    const before=await f.read();let fresh=await f.engine.actorIn(f.tx,'self');expect(f.engine.scope(fresh,'task.read').siteIds).toEqual(['A','B']);expect(f.engine.scope(fresh,'shift.read').siteIds).toEqual(['A']);
    // Current grantor rights disappear; fresh validation removes the effective grant.
    f.tx.rows.get('user:grantor')!.data.permissions=[];expect(await f.read()).not.toBe(before);
  });
  it('actual delegation TTL expiry changes permission scopes without modifying a source row',async()=>{
    const f=fixture();f.tx.put('user','grantor',{active:true,roles:['OWNER'],permissions:['task.review'],siteIds:['B'],warehouseIds:[]});
    const actor:Actor={userId:'grantor',companyId:'company',roles:['OWNER'],permissions:[...ROLE_PERMISSIONS.OWNER!,'task.review'],siteIds:['B'],warehouseIds:[],customerIds:[],mfaVerified:true},ctx:CommandContext={tx:f.tx,actor,now:NOW,idempotencyKey:'qa',requireSite:()=>{},requireOwn:()=>{}};
    const def=governanceCommands['delegation.create']!,d=await def.handler(ctx,def.schema.parse({granteeId:'self',permissions:['task.review'],siteIds:['B'],expiresAt:LATER,reason:'Synthetic bounded TTL'}));f.tx.rows.get('delegation:'+d.id)!.data.state='APPROVED';
    const before=await f.read('2026-10-06T10:59:59.999Z'),writes=f.tx.writes;expect(await f.read(LATER)).not.toBe(before);expect(f.tx.writes).toBe(writes);
  });
  it.each(['STATUS','ROLE','PRESENCE','ROUTE','RETURN','EXPIRY','LEGAL'] as const)('fingerprints effective GPS policy %s without raw coordinates or private evidence',async(change)=>{
    const f=fixture();const p=f.tx.put('tracking_policy','policy',{state:'APPROVED',enabled:true,approvedAt:NOW,expiresAt:FUTURE,accessRoles:['EMPLOYEE'],allowPresence:true,allowBusinessRoute:true,allowMinimalReturn:false,legalApprovalReference:'legal',purpose:'PRIVATE_GPS_PURPOSE',latitude:52.3});
    const legal=f.tx.put('legal_approval','legal',{subject:'GPS_LEGAL_PROCESS',status:'APPROVED',active:true,expiresAt:FUTURE,evidence:'PRIVATE_LEGAL_FILE'}),before=await f.read();
    if(change==='STATUS')p.data.state='DISABLED';else if(change==='ROLE')p.data.accessRoles=[];else if(change==='PRESENCE')p.data.allowPresence=false;else if(change==='ROUTE')p.data.allowBusinessRoute=false;else if(change==='RETURN')p.data.allowMinimalReturn=true;else if(change==='EXPIRY')p.data.expiresAt=NOW;else legal.data.status='REVOKED';expect(await f.read()).not.toBe(before);
  });
  it('does not scan GPS policies or approvals when fresh actor has no location-related permission',async()=>{
    const f=fixture();f.user.data.roles=['QUALITY_CONTROL'];const before=await f.read();f.tx.put('tracking_policy','irrelevant',{state:'APPROVED',enabled:true,expiresAt:FUTURE,accessRoles:['OWNER']});expect(await f.read()).toBe(before);expect(f.tx.reads).not.toContain('tracking_policy');expect(f.tx.reads).not.toContain('legal_approval');
  });
  it('GPS effective expiry changes only at the deadline and ignores evidence/text/coordinate changes',async()=>{
    const f=fixture(),p=f.tx.put('tracking_policy','policy',{state:'APPROVED',enabled:true,approvedAt:NOW,expiresAt:LATER,accessRoles:['EMPLOYEE'],allowPresence:true});const before=await f.read('2026-10-06T10:59:00Z');p.data.purpose='PRIVATE';p.data.latitude=1;p.version++;expect(await f.read('2026-10-06T10:59:59Z')).toBe(before);expect(await f.read(LATER)).not.toBe(before);
  });
  it('fails closed on disabled identity, foreign reloaded actor, unavailable scope and malformed/oversized current authority',async()=>{
    const f=fixture();f.user.data.active=false;await expect(f.read()).rejects.toMatchObject({code:'ACCESS_DENIED'});f.user.data.active=true;
    await expect(authorityFingerprint(f.tx,{...f.engine,scope:undefined},f.stale,NOW)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(authorityFingerprint(f.tx,{...f.engine,actorIn:async()=>({...f.stale,companyId:'foreign'})},f.stale,NOW)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    f.user.data.siteIds=Array.from({length:2501},(_,i)=>'site-'+i);await expect(f.read()).rejects.toMatchObject({code:'ACCESS_DENIED'});f.user.data.siteIds=[null];await expect(f.read()).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
});
