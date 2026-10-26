import {afterEach,describe,expect,it,vi} from 'vitest';
import {Engine} from '../apps/api/engine.ts';
import type {Database} from '../apps/api/database.ts';
import {internalAssistantHost} from '../apps/api/internal-assistant.ts';
import {prepareInternalAssistant,persistInternalAssistantDraft,internalAssistantVisible} from '../packages/integrations/internal-assistant.ts';
import {parseInternalDraftProposal} from '../packages/integrations/internal-assistant-provider.ts';
import {assert,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';
import type {SqlTransaction} from '../apps/api/auth.ts';

// Actual Engine authorization + internal handlers with an in-memory transaction.
// This tests cache disclosure, not PostgreSQL, transport or live-provider behavior.
const NOW='2026-10-06T10:00:00.000Z';
class MemoryTransaction implements Transaction {
 companyId='synthetic-visibility';rows=new Map<string,Entity>();events:Data[]=[];sequence=0;
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const row=this.rows.get(kind+':'+id);assert(row&&row.companyId===this.companyId,'NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.rows.values()].filter(row=>row.kind===kind&&row.companyId===this.companyId).map(row=>structuredClone(row) as Entity<T>);}
 async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+(++this.sequence)):Promise<Entity<T>>{const row={id,kind,companyId:this.companyId,version:1,data:structuredClone(data),createdAt:NOW,updatedAt:NOW};this.rows.set(kind+':'+id,row);return structuredClone(row);}
 async save<T extends Data=Data>(row:Entity,data:T,expected=row.version):Promise<Entity<T>>{const previous=await this.get(row.kind,row.id);assert(previous.version===expected,'VERSION_CONFLICT');const next={...previous,version:previous.version+1,data:structuredClone(data)};this.rows.set(row.kind+':'+row.id,next);return structuredClone(next);}
 async event(type:string,data:Data){this.events.push({type,data:structuredClone(data)});}
 async query(){throw new Error('This pure visibility fixture must not issue SQL');}
}
async function fixture(){
 const tx=new MemoryTransaction(),db={transaction:async(_company:string,_actor:string,fn:(tx:MemoryTransaction)=>Promise<unknown>)=>fn(tx)} as unknown as Database;
 const engine=new Engine(db,'TEST');
 await tx.add('user',{active:true,roles:['INTERNAL_BAULEITER'],siteIds:['site'],name:'Synthetic foreman'},'foreman');
 await tx.add('user',{active:true,roles:['INTERNAL_BAULEITER'],siteIds:['site'],name:'Synthetic other'},'other');
 await tx.add('site',{active:true,code:'A',name:'Haus A'},'site');
 await tx.add('location',{siteId:'site',active:true,name:'EG',floorLabelDe:'EG',code:'EG',parentId:null,nodeType:'FLOOR'},'floor');
 await tx.add('channel',{type:'COMPANY_GENERAL',members:[{user_id:'foreman',history_from:'2020-01-01T00:00:00Z'}]},'channel');
 await tx.add('message',{channel_id:'channel',author_id:'foreman',message_version:1,source:'HUMAN',text:'Haus A EG reinigen',language:'DE'},'message');
 await tx.add('assistant_config',{status:'ACTIVE',configVersion:1,model:'synthetic-model',timeoutMs:1000,tone:'PROFESSIONAL',addressForm:'Sie',humanHours:[],testOnly:true,provider:'DEEPSEEK'},'config');
 const actor=await engine.getActor('foreman',tx.companyId),host=internalAssistantHost(db,engine,'TEST',()=>new Date(NOW),async()=>{});
 const def=engine.registry['internal_assistant.request']!;
 const input=def.schema.parse({messageId:'message',messageVersion:1,channelId:'channel',configId:'config',configVersion:1,kind:'TASK_BATCH',siteIds:['site'],context:{locationIds:['floor']}});
 const request=await def.handler(host.context(tx as unknown as SqlTransaction,actor,'synthetic-request',undefined,NOW,def.permission),input);
 const prepared=await prepareInternalAssistant(tx.companyId,request.id,host);assert(!prepared.done,'INVALID_STATE');
 const proposal=parseInternalDraftProposal({kind:'TASK_BATCH',needsClarification:false,clarification:null,input:{tasks:[{siteId:'site',locationId:'floor',title:'EG reinigen',sourceQuote:'Haus A EG reinigen'}]}},prepared.providerInput);
 const draft=await persistInternalAssistantDraft(tx.companyId,request.id,prepared.contextHash,{proposal,provider:'synthetic-fixture-no-provider-call',model:'synthetic-model'},host);
 const update=async(kind:string,id:string,patch:Data)=>{const old=await tx.get(kind,id);return tx.save(old,{...old.data,...patch});};
 const snapshot=()=>structuredClone({rows:tx.rows,events:tx.events});
 return {tx,engine,actor,host,requestId:request.id,draftId:draft.draftId,update,snapshot};
}
afterEach(()=>vi.restoreAllMocks());
describe('current Engine internal-cache visibility (CPU; SQL/provider not covered)',()=>{
 it('returns only the current owner snapshot without provider, handler or write effects',async()=>{
  const f=await fixture(),provider=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('PROVIDER_MUST_NOT_BE_INVOKED'));
  const before=f.snapshot();expect(await f.engine.readEntities(f.actor,'internal_assistant_request')).toHaveLength(1);expect(await f.engine.readEntities(f.actor,'internal_assistant_draft')).toHaveLength(1);
  expect(f.snapshot()).toEqual(before);expect(provider).not.toHaveBeenCalled();
  const other=await f.engine.getActor('other',f.tx.companyId);expect(await f.engine.readEntities(other,'internal_assistant_draft')).toEqual([]);
 });
 it.each(['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','EMPLOYEE','BOT_ADMIN'] as const)('removes %s former-owner access even if draft/create rights are injected',async role=>{
  const f=await fixture();await f.update('user','foreman',{roles:[role],permissions:['assistant.read','chat.read','task.create','task.assign']});const before=f.snapshot();
  expect(await f.engine.readEntities(f.actor,'internal_assistant_request')).toEqual([]);expect(await f.engine.readEntities(f.actor,'internal_assistant_draft')).toEqual([]);expect(f.snapshot()).toEqual(before);
 });
 it.each(['SITE','MEMBERSHIP','SOURCE_VERSION','SOURCE_DELETE','CONFIG','LOCATION','HISTORY','CONFIDENTIAL'] as const)('invalidates cached request/draft after current %s changes',async change=>{
  const f=await fixture();
  if(change==='SITE')await f.update('user','foreman',{siteIds:[]});
  if(change==='MEMBERSHIP')await f.update('channel','channel',{members:[{user_id:'foreman',revoked_at:NOW,history_from:'2020-01-01T00:00:00Z'}]});
  if(change==='SOURCE_VERSION')await f.update('message','message',{message_version:2,text:'Changed current source'});
  if(change==='SOURCE_DELETE')await f.update('message','message',{deleted_at:NOW});
  if(change==='CONFIG')await f.update('assistant_config','config',{status:'RETIRED'});
  if(change==='LOCATION')await f.update('location','floor',{name:'Renamed current floor'});
  if(change==='HISTORY')await f.update('channel','channel',{members:[{user_id:'foreman',history_from:'2026-10-07T00:00:00Z'}]});
  if(change==='CONFIDENTIAL')await f.update('channel','channel',{confidential:true});
  const before=f.snapshot();expect(await f.engine.readEntities(f.actor,'internal_assistant_request')).toEqual([]);expect(await f.engine.readEntities(f.actor,'internal_assistant_draft')).toEqual([]);expect(f.snapshot()).toEqual(before);
 });
 it('denies a missing canonical kind permission and foreign/caller-altered cache entity, preserving lead-own behavior',async()=>{
  const f=await fixture(),row=await f.tx.get('internal_assistant_draft',f.draftId);
  expect(await internalAssistantVisible(f.tx,f.actor,{...row,companyId:'foreign'},f.host as any,NOW)).toBe(false);
  expect(await internalAssistantVisible(f.tx,f.actor,{...row,version:row.version+1},f.host as any,NOW)).toBe(false);
  await f.update('user','foreman',{roles:['TEAM_LEADER']});expect(await f.engine.readEntities(f.actor,'internal_assistant_draft')).toEqual([]);
  await f.tx.add('assistant_lead_draft',{ownerUserId:'foreman',preview:{synthetic:true}},'own-lead');expect(await f.engine.readEntities(f.actor,'assistant_lead_draft')).toHaveLength(1);
 });
 it('rejects a cached draft whose preview was modified after creation before any disclosure',async()=>{
  const f=await fixture(),row=await f.tx.get('internal_assistant_draft',f.draftId);await f.update('internal_assistant_draft',f.draftId,{preview:{...row.data.preview,privateCopy:'Tampered source'}});
  const before=f.snapshot();expect(await f.engine.readEntities(f.actor,'internal_assistant_draft')).toEqual([]);expect(f.snapshot()).toEqual(before);
 });
});
