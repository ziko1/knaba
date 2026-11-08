import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {openLocalDatabase} from '../vps/database.mjs';
import {handleApi} from '../worker/api';
import {drainErpLeads} from '../worker/erp-lead-outbox';
import {erpLeadEnvelope,readErpLeadConfig,type ErpLeadSource} from '../worker/erp-lead-contract';
import {ASSISTANT_REQUEST_TRANSFER_FIELDS} from '../worker/assistant-requests';
import type {WorkerEnv,D1Statement} from '../worker/types';

const origin='https://knaba.example.com';
type Ticket={id:string;token:string};
let folder:string,db:DatabaseSync,env:WorkerEnv;
const owner={'oai-authenticated-user-id':'synthetic-owner','oai-authenticated-user-email':'owner@example.test'};
const configuration=()=>({KNABA_ERP_BRIDGE_ENABLED:'true',KNABA_ERP_TRANSFER_APPROVED:'true',KNABA_ERP_URL:'https://erp.example.com/api/v1/integrations/knaba_site/events',KNABA_ERP_ALLOWED_ORIGIN:'https://erp.example.com',KNABA_ERP_COMPANY_ID:'synthetic-company',
  KNABA_ERP_KEY_ID:'test_1',KNABA_ERP_SECRET:'synthetic-only-no-real-credentials-123456789',KNABA_ERP_MAPPING_VERSION:'v1',KNABA_ERP_APPROVED_PRIVACY_VERSION:'2026-10-28',KNABA_ERP_SERVICE_MAP_JSON:'{"baureinigung":"synthetic-service"}'});
const data=()=>({service:'baureinigung',objectType:'Baustelle',postcode:'10115',area:'100',frequency:'Einmalig',message:'Synthetic private local enquiry text',name:'Synthetic visitor',email:'visitor@example.test',phone:'+49301234567',idempotencyKey:crypto.randomUUID(),privacyAccepted:true,transferAccepted:true,website:''});
function call(path:string,body?:unknown,ticket?:Ticket,extra:Record<string,string>={}){
  return handleApi(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',origin,'x-knaba-request':'portal-v1',referer:origin+'/pl/kontakt/?intent=assistant&utm_campaign=private-campaign',...(ticket?{'x-knaba-conversation':ticket.token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)}),env);
}
const rows=(table:string)=>db.prepare('SELECT * FROM '+table).all() as Record<string,unknown>[];
const createdRows=()=>['cleaning_requests','assistant_request_links','portal_audit','site_erp_outbox'].map(table=>rows(table).length);
async function start():Promise<Ticket>{
  const response=await call('/api/assistant/conversations',{locale:'uk',privacyAccepted:true,website:''});
  expect(response.status,await response.clone().text()).toBe(201);return response.json() as Promise<Ticket>;
}
const submit=(ticket:Ticket,body:unknown=data(),headers:Record<string,string>={})=>call(`/api/assistant/conversations/${ticket.id}/requests`,body,ticket,headers);
async function accepted(ticket:Ticket){const response=await submit(ticket);expect(response.status,await response.clone().text()).toBe(201);return response.json() as Promise<any>;}
async function expiredTicket():Promise<Ticket>{
  // Model an honestly old issuance; the immutable expiry trigger stays enabled.
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2000-01-01T00:00:00.000Z'));
  try{return await start();}finally{vi.useRealTimers();}
}
function copyHistoricalRequest(requestId:string,conversationId:string){
  const source=db.prepare('SELECT * FROM cleaning_requests WHERE id=?').get(requestId) as Record<string,unknown>;
  const id=crypto.randomUUID(),mutation=crypto.randomUUID(),key=crypto.randomUUID();
  const row={...source,id,dedupe_scope:'assistant:'+conversationId,idempotency_key:key,last_mutation:mutation};
  db.prepare(`INSERT INTO cleaning_requests (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row) as never[]);
  db.prepare(`INSERT INTO assistant_request_links(request_id,conversation_id,request_key,mutation_id,consent_version,consent_fields_json,created_at)
    SELECT ?,?,?,?,consent_version,consent_fields_json,created_at FROM assistant_request_links WHERE request_id=?`).run(id,conversationId,key,mutation,requestId);
  return id;
}
function afterRequestPageRead(callback:()=>void){
  const original=env.DB!;let changed=false;
  env.DB={batch:original.batch.bind(original),prepare(sql){
    const source=original.prepare(sql);
    if(!sql.includes('l.created_at AS origin_created_at'))return source;
    const wrap=(statement:D1Statement):D1Statement=>({
      bind:(...values)=>wrap(statement.bind(...values)),
      first:statement.first.bind(statement),run:statement.run.bind(statement),
      async all(){const result=await statement.all();if(!changed){changed=true;callback();}return result as never;},
    });return wrap(source);
  }};
}
beforeEach(()=>{
  folder=mkdtempSync(join(tmpdir(),'knaba-assistant-requests-'));
  const local=openLocalDatabase(join(folder,'site.sqlite'));db=local.db;
  env={DB:local.d1,OWNER_EMAIL:'owner@example.test',...configuration()};
});
afterEach(()=>{vi.restoreAllMocks();db.close();rmSync(folder,{recursive:true,force:true});});

describe('explicit assistant request conversion with actual SQLite transactions',()=>{
  it('creates one anonymous request, immutable origin/consent, audit and existing outbox even with an owner cookie',async()=>{
    const ticket=await start(),input=data();
    const response=await submit(ticket,input,owner);expect(response.status,await response.clone().text()).toBe(201);
    const receipt=await response.json() as any;
    expect(receipt).toMatchObject({id:receipt.request.id,received:true,conversationId:ticket.id,request:{status:'new',version:1,erpTransfer:{status:'PENDING'}}});
    expect(response.headers.get('cache-control')).toContain('no-store');expect(createdRows()).toEqual([1,1,1,1]);
    const request=rows('cleaning_requests')[0],link=rows('assistant_request_links')[0];
    expect(request).toMatchObject({id:receipt.id,client_id:null,dedupe_scope:'assistant:'+ticket.id,message:input.message});
    expect(link).toMatchObject({conversation_id:ticket.id,request_id:receipt.id,request_key:input.idempotencyKey,consent_version:'assistant-request-v1/2026-11-08'});
    expect(JSON.parse(String(link.consent_fields_json))).toEqual(ASSISTANT_REQUEST_TRANSFER_FIELDS);
    expect(()=>db.prepare('UPDATE assistant_request_links SET conversation_id=?').run(crypto.randomUUID())).toThrow(/immutable/);
    expect(JSON.stringify([...rows('portal_audit'),link,rows('site_erp_outbox')])).not.toContain(ticket.token);
    expect(rows('profiles')).toHaveLength(0);
  });
  it('keeps explicit consent, strict fields, same-origin and privacy checks before creating anything',async()=>{
    const ticket=await start();
    for(const patch of [{transferAccepted:false},{transferAccepted:undefined},{privacyAccepted:false},{companyId:'foreign'},{clientId:'owner'},{locale:'de'},{address:'Undisclosed extra address'},{address:''}]){
      const response=await submit(ticket,{...data(),...patch});expect(response.status).toBe(422);expect(createdRows()).toEqual([0,0,0,0]);
    }
    expect((await submit(ticket,data(),{origin:'https://foreign.example'})).status).toBe(403);
    expect(createdRows()).toEqual([0,0,0,0]);
  });
  it('retains the existing public address contract while assistant consent covers only its actual postcode field',async()=>{
    const {transferAccepted,...publicData}=data();
    const response=await call('/api/leads',{...publicData,address:'Explicit public address'});
    expect(response.status).toBe(201);expect(rows('cleaning_requests')[0].address).toBe('Explicit public address');
    expect(rows('assistant_request_links')).toHaveLength(0);
  });
  it('shows initial pending and maintenance-blocked states while disabled bridge configuration makes no delivery',async()=>{
    env.KNABA_ERP_BRIDGE_ENABLED='false';env.KNABA_ERP_TRANSFER_APPROVED='false';
    const ticket=await start(),created=await accepted(ticket);
    expect(created.request.erpTransfer.status).toBe('PENDING');
    expect(rows('site_erp_outbox')[0]).toMatchObject({status:'PENDING',envelope_sha256:null,delivery_scope_sha256:null});
    const transport=vi.fn();expect(await drainErpLeads(env,{transport})).toMatchObject({disabled:true,claimed:0,applied:0,blocked:1});expect(transport).not.toHaveBeenCalled();
    expect(rows('site_erp_outbox')[0]).toMatchObject({status:'BLOCKED',last_error:'MAPPING_NOT_PINNED'});
    const context=await (await call(`/api/assistant/conversations/${ticket.id}/request-context`,undefined,ticket)).json() as any;
    expect(context.requests[0].erpTransfer.status).toBe('BLOCKED');
  });
  it.each(['foreign','missing','expired','revoked','closed'] as const)('does not create with %s guest authority or replace it with owner authority',async change=>{
    const ticket=change==='expired'?await expiredTicket():await start();let sent:Ticket|undefined=ticket;
    if(change==='foreign')sent={id:ticket.id,token:(await start()).token};
    if(change==='missing')sent=undefined;
    if(change==='revoked')db.prepare('UPDATE assistant_conversations SET token_revoked_at=? WHERE id=?').run(new Date().toISOString(),ticket.id);
    if(change==='closed')db.prepare("UPDATE assistant_conversations SET status='closed' WHERE id=?").run(ticket.id);
    const response=await call(`/api/assistant/conversations/${ticket.id}/requests`,data(),sent,owner);
    expect(response.status).toBe(change==='closed'?409:404);expect(createdRows()).toEqual([0,0,0,0]);
  });
  it('deduplicates identical retries and rejects conflicting content without a second request or consent',async()=>{
    const ticket=await start(),input=data(),first=await submit(ticket,input),receipt=await first.json() as any;
    expect(first.status).toBe(201);
    const retry=await submit(ticket,input);expect(retry.status).toBe(200);expect(await retry.json()).toEqual(receipt);
    expect((await submit(ticket,{...input,message:'Different synthetic text'})).status).toBe(409);
    expect(createdRows()).toEqual([1,1,1,1]);
  });
  it('deduplicates five concurrently admitted submissions at the actual SQLite unique constraints',async()=>{
    const ticket=await start(),input=data();
    const responses=await Promise.all(Array.from({length:5},()=>submit(ticket,input)));
    expect(responses.every(response=>[200,201].includes(response.status))).toBe(true);
    const receipts=await Promise.all(responses.map(response=>response.json() as Promise<any>));
    expect(new Set(receipts.map(receipt=>receipt.id)).size).toBe(1);
    expect(createdRows()).toEqual([1,1,1,1]);expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('serializes conflicting concurrent payloads under one origin/key without overwriting the winner',async()=>{
    const ticket=await start(),input=data();
    const responses=await Promise.all([submit(ticket,input),submit(ticket,{...input,message:'Other synthetic message'})]);
    expect(responses.map(response=>response.status).sort()).toEqual([201,409]);
    expect(createdRows()).toEqual([1,1,1,1]);
    const stored=rows('cleaning_requests')[0];expect([input.message,'Other synthetic message']).toContain(stored.message);
  });
  it('fences a genuine revocation after preflight and before the atomic write',async()=>{
    const ticket=await start(),original=env.DB!;let changed=false;
    env.DB={prepare:original.prepare.bind(original),batch:async statements=>{
      if(!changed){changed=true;db.prepare('UPDATE assistant_conversations SET token_revoked_at=? WHERE id=?').run(new Date().toISOString(),ticket.id);}
      return original.batch(statements);
    }};
    expect((await submit(ticket)).status).toBe(404);expect(changed).toBe(true);expect(createdRows()).toEqual([0,0,0,0]);
  });
  it('rolls back origin, request and audit when the actual outbox insert fails',async()=>{
    const ticket=await start();db.exec("CREATE TRIGGER synthetic_outbox_failure BEFORE INSERT ON site_erp_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    const response=await submit(ticket);expect(response.status).toBe(503);expect(createdRows()).toEqual([0,0,0,0]);
    expect(await response.text()).not.toMatch(/SQL|synthetic failure|token/);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('returns scoped safe receipt metadata and preserves the original mapping after source metadata is cleared',async()=>{
    const ticket=await start(),created=await accepted(ticket),foreign=await start();
    db.prepare("UPDATE site_erp_outbox SET status='APPLIED',erp_effect_id='private-erp-id',last_error='private-error',source_json='{}'").run();
    const response=await call(`/api/assistant/conversations/${ticket.id}/request-context`,undefined,ticket),context=await response.json() as any;
    expect(response.status).toBe(200);expect(context).toMatchObject({conversation:{id:ticket.id,locale:'uk'},requests:[{id:created.id,erpTransfer:{status:'APPLIED'}}],requestPage:{limit:20,total:1,nextCursor:null}});
    expect(Object.keys(context.requests[0]).sort()).toEqual(['createdAt','erpTransfer','id','status','version']);
    expect(JSON.stringify(context)).not.toMatch(/private-erp-id|private-error|Synthetic private local enquiry text|synthetic-only-no-real-credentials/);
    expect((await call(`/api/assistant/conversations/${ticket.id}/request-context`,undefined,foreign,owner)).status).toBe(404);
    const owned=await call(`/api/assistant/owner/conversations/${ticket.id}`,undefined,undefined,owner);
    expect((await owned.json() as any).requests[0]).toEqual(context.requests[0]);
  });
  it('paginates tied timestamps without duplicates, foreign origins or unbounded pages',async()=>{
    const ticket=await start(),created=await accepted(ticket),foreign=await start();
    const expected=new Set([created.id]);for(let i=0;i<24;i++)expected.add(copyHistoricalRequest(created.id,ticket.id));
    const foreignId=copyHistoricalRequest(created.id,foreign.id);
    const path=`/api/assistant/conversations/${ticket.id}/request-context`;
    const first=await (await call(path,undefined,ticket)).json() as any;
    expect(first.requests).toHaveLength(20);expect(first.requestPage).toMatchObject({limit:20,total:25});
    expect(typeof first.requestPage.nextCursor).toBe('string');
    const second=await (await call(path+'?requestCursor='+first.requestPage.nextCursor,undefined,ticket)).json() as any;
    expect(second.requests).toHaveLength(5);expect(second.requestPage.nextCursor).toBeNull();
    const ids=[...first.requests,...second.requests].map(row=>row.id);expect(new Set(ids)).toEqual(expected);expect(ids).not.toContain(foreignId);
    for(const cursor of ['bad!',first.requestPage.nextCursor+'=',btoa(JSON.stringify({id:created.id,at:'2026-02-30T00:00:00.000Z'}))])
      expect((await call(path+'?requestCursor='+encodeURIComponent(cursor),undefined,ticket)).status).toBe(422);
    const owned=await (await call(`/api/assistant/owner/conversations/${ticket.id}/request-context?requestCursor=${first.requestPage.nextCursor}`,undefined,undefined,owner)).json() as any;
    expect(owned.requests).toEqual(second.requests);
  });
  it('discards already assembled private request metadata when the guest capability is revoked during page reads',async()=>{
    const ticket=await start(),created=await accepted(ticket);
    afterRequestPageRead(()=>db.prepare('UPDATE assistant_conversations SET token_revoked_at=? WHERE id=?').run(new Date().toISOString(),ticket.id));
    const response=await call(`/api/assistant/conversations/${ticket.id}/request-context`,undefined,ticket);
    expect(response.status).toBe(404);expect(await response.text()).not.toContain(created.id);
  });
  it('rechecks current owner authority after reading an owner request page',async()=>{
    const ticket=await start(),created=await accepted(ticket);let allowed=true;env.VERIFY_ASSISTANT_OWNER_SESSION=()=>allowed;
    afterRequestPageRead(()=>{allowed=false;});
    const response=await call(`/api/assistant/owner/conversations/${ticket.id}/request-context`,undefined,undefined,owner);
    expect(response.status).toBe(403);expect(await response.text()).not.toContain(created.id);
  });
  it('does not disclose an acknowledged request if access is revoked before the response; owner history remains durable',async()=>{
    const ticket=await start(),original=env.DB!;
    env.DB={prepare:original.prepare.bind(original),batch:async <T=Record<string,unknown>>(statements:D1Statement[])=>{
      const result=await original.batch<T>(statements);db.prepare('UPDATE assistant_conversations SET token_revoked_at=? WHERE id=?').run(new Date().toISOString(),ticket.id);return result;
    }};
    const response=await submit(ticket);expect(response.status).toBe(404);expect(createdRows()).toEqual([1,1,1,1]);
    expect(await response.text()).not.toContain(String(rows('cleaning_requests')[0].id));
    const context=await (await call(`/api/assistant/owner/conversations/${ticket.id}/request-context`,undefined,undefined,owner)).json() as any;
    expect(context.requests).toHaveLength(1);
  });
  it('allows explicit withdrawal after chat closure, uses CAS and does not pretend to erase an already delivered ERP lead',async()=>{
    const ticket=await start(),created=await accepted(ticket);
    db.prepare("UPDATE assistant_conversations SET status='closed' WHERE id=?").run(ticket.id);
    db.exec("UPDATE site_erp_outbox SET status='APPLIED',erp_effect_id='already-applied'");
    const path=`/api/assistant/conversations/${ticket.id}/requests/${created.id}/cancel`;
    expect((await call(path,{version:7},ticket)).status).toBe(409);
    const cancelled=await call(path,{version:1},ticket);expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({conversationId:ticket.id,request:{id:created.id,status:'cancelled',version:2,erpTransfer:{status:'APPLIED'}}});
    expect((await call(path,{version:1},ticket)).status).toBe(200);expect(rows('portal_audit')).toHaveLength(2);
    expect(rows('site_erp_outbox')[0]).toMatchObject({status:'APPLIED',erp_effect_id:'already-applied'});
    expect((await submit(ticket)).status).toBe(409);
  });
  it('denies foreign, expired and already scheduled withdrawal without changing the request',async()=>{
    const ticket=await start(),created=await accepted(ticket),foreign=await start(),path=`/api/assistant/conversations/${ticket.id}/requests/${created.id}/cancel`;
    expect((await call(path,{version:1},foreign,owner)).status).toBe(404);
    db.exec("UPDATE cleaning_requests SET status='scheduled'");expect((await call(path,{version:1},ticket)).status).toBe(409);
    const expired=await expiredTicket(),historicalId=copyHistoricalRequest(created.id,expired.id);
    expect((await call(`/api/assistant/conversations/${expired.id}/requests/${historicalId}/cancel`,{version:1},expired,owner)).status).toBe(404);
    expect(rows('cleaning_requests').every(row=>row.status==='scheduled'&&row.version===1)).toBe(true);
  });
  it.each(['scheduled','revoked'] as const)('fences a %s change between withdrawal preflight and its write',async change=>{
    const ticket=await start(),created=await accepted(ticket),original=env.DB!;
    env.DB={prepare:original.prepare.bind(original),batch:async statements=>{
      if(change==='scheduled')db.prepare("UPDATE cleaning_requests SET status='scheduled',version=version+1 WHERE id=?").run(created.id);
      else db.prepare('UPDATE assistant_conversations SET token_revoked_at=? WHERE id=?').run(new Date().toISOString(),ticket.id);
      return original.batch(statements);
    }};
    expect((await call(`/api/assistant/conversations/${ticket.id}/requests/${created.id}/cancel`,{version:1},ticket)).status).toBe(change==='scheduled'?409:404);
    expect(rows('cleaning_requests')[0].status).toBe(change==='scheduled'?'scheduled':'new');expect(rows('portal_audit')).toHaveLength(1);
  });
  it('uses the existing strict ERP envelope with no conversation token, ID, chat text or attribution',async()=>{
    const ticket=await start(),created=await accepted(ticket),claim=rows('site_erp_outbox')[0] as any;
    const wire=erpLeadEnvelope((await readErpLeadConfig(env))!,rows('cleaning_requests')[0] as unknown as ErpLeadSource,claim),envelope=JSON.parse(wire);
    expect(envelope).toMatchObject({external_id:created.id,target_company_id:'synthetic-company',event_type:'lead.upsert',payload:{language:'UK',source:{},serviceIds:['synthetic-service']}});
    expect(envelope.payload.facts.address).toBe('10115');
    for(const value of [ticket.id,ticket.token,'Synthetic private local enquiry text','private-campaign','conversationId','client_id'])expect(wire).not.toContain(value);
    const send=vi.fn(async()=>({status:'APPLIED' as const,effectId:'synthetic-lead',duplicate:false}));
    expect(await drainErpLeads(env,{transport:send})).toMatchObject({claimed:1,applied:1});expect(send).toHaveBeenCalledOnce();
    expect(rows('assistant_request_links')[0].request_id).toBe(created.id);expect(rows('site_erp_outbox')[0].source_json).toBe('{}');
  });
  it('stops a not-yet-attempted transfer after explicit withdrawal',async()=>{
    const ticket=await start(),created=await accepted(ticket);
    expect((await call(`/api/assistant/conversations/${ticket.id}/requests/${created.id}/cancel`,{version:1},ticket)).status).toBe(200);
    const send=vi.fn(async()=>({status:'APPLIED' as const,effectId:'should-not-exist',duplicate:false}));
    expect(await drainErpLeads(env,{transport:send})).toMatchObject({claimed:0,blocked:1});expect(send).not.toHaveBeenCalled();
    expect(rows('site_erp_outbox')[0]).toMatchObject({status:'BLOCKED',last_error:'SOURCE_CANCELLED'});
  });
  it('keeps already-started transfer uncertainty visible when withdrawal races with an external receipt',async()=>{
    const ticket=await start(),created=await accepted(ticket);
    const send=vi.fn(async()=>{
      expect((await call(`/api/assistant/conversations/${ticket.id}/requests/${created.id}/cancel`,{version:1},ticket)).status).toBe(200);
      return {status:'APPLIED' as const,effectId:'possibly-delivered',duplicate:false};
    });
    await drainErpLeads(env,{transport:send});expect(send).toHaveBeenCalledOnce();
    expect(rows('site_erp_outbox')[0]).toMatchObject({status:'UNKNOWN',last_error:'SOURCE_CANCELLED_AFTER_SEND'});
    const context=await (await call(`/api/assistant/conversations/${ticket.id}/request-context`,undefined,ticket)).json() as any;
    expect(context.requests[0]).toMatchObject({status:'cancelled',erpTransfer:{status:'UNKNOWN'}});
  });
});
