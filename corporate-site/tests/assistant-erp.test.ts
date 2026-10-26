import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {WorkerEnv} from '../worker/types';
import {Db,erpTestEnv as config,erpTestInput as input,erpTestServices as services,erpTestTime as time,erpTestConversationId as id,insertErpTestConversation as insertConversation} from './helpers/assistant-erp-fixture';
import {cancelErpLead,confirmErpLead,ErpFault,erpScopeHash,getErpConfig,getErpLead,previewErpLead,publicErpConfig} from '../worker/assistant-erp';

let db:Db,env:WorkerEnv;
beforeEach(()=>{db=new Db();env=config();insertConversation(db);});
afterEach(()=>{db.sql.close();vi.restoreAllMocks();});
const row=()=>db.sql.prepare('SELECT * FROM assistant_erp_requests WHERE conversation_id=?').get(id)!;
const confirm=(preview:{version:number;previewHash:string},t=time+10)=>confirmErpLead(db,env,id,{version:preview.version,previewHash:preview.previewHash,confirmed:true},t);

describe('Assistant ERP server configuration',()=>{
  it('is off by default and exposes only approved public service labels',()=>{
    expect(publicErpConfig({})).toEqual({enabled:false,services:[]});
    const publicConfig=publicErpConfig(env);expect(publicConfig).toEqual({enabled:true,services});
    expect(JSON.stringify(publicConfig)).not.toMatch(/secret|keyId|companyId|erp\.example|mapping-v1/);
    expect(getErpConfig(env)?.endpoint).toBe('https://erp.example.test/api/v1/integrations/knaba_web/events');
  });
  it.each(['http://erp.example.test','https://erp.example.test/path','https://name:pass@erp.example.test','https://erp.example.test?x=1','https://erp.example.test#x'])('rejects non-origin or unsafe destination %s',origin=>{
    expect(getErpConfig({...env,ASSISTANT_ERP_ORIGIN:origin})).toBeNull();
  });
  it('rejects partial labels, duplicate services and malformed credentials',()=>{
    expect(getErpConfig({...env,ASSISTANT_ERP_SERVICES_JSON:JSON.stringify([{id:'s',label:{de:'Only German'}}])})).toBeNull();
    expect(getErpConfig({...env,ASSISTANT_ERP_SERVICES_JSON:JSON.stringify([...services,...services])})).toBeNull();
    expect(getErpConfig({...env,ASSISTANT_ERP_SECRET:'short'})).toBeNull();
    expect(getErpConfig({...env,ASSISTANT_ERP_SOURCE:'../other'})).toBeNull();
  });
  it('binds scope to site/company/mapping but never stores the secret',async()=>{
    const initial=await erpScopeHash(getErpConfig(env)!);
    expect(initial).not.toBe(await erpScopeHash(getErpConfig({...env,ASSISTANT_ERP_COMPANY_ID:'other-company'})!));
    expect(initial).toBe(await erpScopeHash(getErpConfig({...env,ASSISTANT_ERP_SECRET:'rotated-synthetic-key-1234567890000'})!));
  });
});

describe('Assistant ERP preview and durable confirmation',()=>{
  it('persists a preview without sending, copies only allowed facts and keeps IDs stable on replay',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('External network must not run'));
    const first=await previewErpLead(db,env,id,input,time),second=await previewErpLead(db,env,id,input,time+1);
    expect(second).toEqual(first);expect(first.state).toBe('DRAFT');expect(first.expiresAt).toBe(time+600000);
    expect(first.preview.name).toBe('Test Client');expect(first.preview.email).toBe('client@example.test');
    const saved=row(),envelope=JSON.parse(String(saved.envelope_json));
    expect(saved.consent_at).toBeNull();expect(saved.attempts).toBe(0);expect(envelope.schema_version).toBe('1');
    expect(envelope.payload).toEqual({contact:{name:'Test Client',email:'client@example.test'},serviceIds:['service-cleaning'],language:'DE',facts:{condition:'Construction dust',desiredPeriod:'Next week'},source:{}});
    expect(envelope).not.toHaveProperty('companyId');expect(envelope).not.toHaveProperty('siteId');expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(saved)).not.toContain(env.ASSISTANT_ERP_SECRET);
  });
  it.each([
    {...input,name:''},{...input,email:'',phone:''},{...input,email:'bad'},
    {...input,phone:'not-a-phone'},{...input,serviceId:'unmapped'},
    {...input,name:'x'.repeat(81)},{...input,condition:'x'.repeat(1001)},
    {...input,companyId:'attacker-company'},{...input,confirmed:true},
  ])('rejects incomplete, oversized or extra input without writing',async value=>{
    await expect(previewErpLead(db,env,id,value,time)).rejects.toBeInstanceOf(ErpFault);
    expect(await getErpLead(db,id)).toBeNull();
  });
  it('requires explicit current preview confirmation and queues once under parallel requests',async()=>{
    const preview=await previewErpLead(db,env,id,input,time);
    await expect(confirmErpLead(db,env,id,{version:preview.version,previewHash:preview.previewHash,confirmed:false},time+1)).rejects.toMatchObject({code:'erp_confirmation_required'});
    const latest=await previewErpLead(db,env,id,{...input,condition:'Changed condition'},time+2);
    await expect(confirm(preview,time+3)).rejects.toMatchObject({code:'erp_preview_changed'});
    const results=await Promise.all(Array.from({length:10},()=>confirm(latest,time+4)));
    expect(results.every(x=>x.state==='QUEUED')).toBe(true);
    expect(row().consent_at).toBe(time+4);expect(row().next_attempt_at).toBe(time+4);
    expect(db.sql.prepare('SELECT COUNT(*) n FROM assistant_erp_requests').get()!.n).toBe(1);
    await expect(previewErpLead(db,env,id,input,time+5)).rejects.toMatchObject({code:'erp_request_locked'});
  });
  it('uses CAS for concurrent different previews and a stable external request identity',async()=>{
    const first=await previewErpLead(db,env,id,input,time),external=row().external_id;
    const results=await Promise.allSettled([previewErpLead(db,env,id,{...input,name:'Second'},time+1),previewErpLead(db,env,id,{...input,name:'Third'},time+1)]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect(row().external_id).toBe(external);expect(row().version).toBe(first.version+1);
  });
  it('expires old previews and prevents cross-configuration confirmation',async()=>{
    const first=await previewErpLead(db,env,id,input,time);
    await expect(confirm(first,time+600000)).rejects.toMatchObject({code:'erp_preview_expired'});
    for(const override of [{ASSISTANT_ERP_SITE_ID:'another-site'},{ASSISTANT_ERP_COMPANY_ID:'another-company'},{ASSISTANT_ERP_MAPPING_VERSION:'mapping-v2'},{ASSISTANT_ERP_KEY_ID:'another-key'}]){
      await expect(confirmErpLead(db,{...env,...override},id,{version:first.version,previewHash:first.previewHash,confirmed:true},time+2)).rejects.toMatchObject({code:'erp_preview_changed'});
    }
    await expect(confirmErpLead(db,{...env,ASSISTANT_ERP_ENABLED:''},id,{version:first.version,previewHash:first.previewHash,confirmed:true},time+2)).rejects.toMatchObject({code:'erp_unavailable'});
    expect(row().state).toBe('DRAFT');expect(row().consent_at).toBeNull();
  });
  it('refuses closure and unknown locale and atomically rolls back a failed confirm write',async()=>{
    const preview=await previewErpLead(db,env,id,input,time);
    db.sql.exec("CREATE TRIGGER reject_confirmation BEFORE UPDATE OF consent_at ON assistant_erp_requests BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
    await expect(confirm(preview)).rejects.toThrow('synthetic failure');
    expect(row().state).toBe('DRAFT');expect(row().consent_at).toBeNull();
    db.sql.exec('DROP TRIGGER reject_confirmation');db.sql.prepare("UPDATE assistant_conversations SET status='closed' WHERE id=?").run(id);
    await expect(confirm(preview)).rejects.toMatchObject({code:'closed'});
    db.sql.prepare("UPDATE assistant_conversations SET status='human',locale='xx' WHERE id=?").run(id);
    await expect(previewErpLead(db,env,id,input,time+1)).rejects.toMatchObject({code:'erp_locale'});
  });
  it('SQL rechecks closure between validation and the confirmation write',async()=>{
    const preview=await previewErpLead(db,env,id,input,time),original=db.prepare.bind(db);
    vi.spyOn(db,'prepare').mockImplementation(query=>{
      if(query.startsWith('UPDATE assistant_erp_requests SET state='))db.sql.prepare("UPDATE assistant_conversations SET status='closed' WHERE id=?").run(id);
      return original(query);
    });
    await expect(confirm(preview)).rejects.toMatchObject({code:'erp_conflict'});
    expect(row().state).toBe('DRAFT');expect(row().consent_at).toBeNull();
  });
  it('cancellation wins against a confirmation that already read the preview',async()=>{
    const preview=await previewErpLead(db,env,id,input,time),original=db.prepare.bind(db);
    vi.spyOn(db,'prepare').mockImplementation(query=>{
      if(query.startsWith('UPDATE assistant_erp_requests SET state='))db.sql.prepare("UPDATE assistant_erp_requests SET state='CANCELLED',revoked_at=? WHERE conversation_id=?").run(time+5,id);
      return original(query);
    });
    await expect(confirm(preview)).rejects.toMatchObject({code:'erp_conflict'});
    expect(row().state).toBe('CANCELLED');expect(row().consent_at).toBeNull();expect(row().revoked_at).toBe(time+5);
  });
});

describe('Assistant ERP cancellation and migration preservation',()=>{
  it('cancels never-attempted work and requires a new preview to approve it again',async()=>{
    const preview=await previewErpLead(db,env,id,input,time);await confirm(preview);
    expect((await cancelErpLead(db,id,time+20))?.state).toBe('CANCELLED');
    await expect(confirm(preview,time+21)).rejects.toMatchObject({code:'erp_revoked'});
    const replacement=await previewErpLead(db,env,id,input,time+22);
    expect(replacement.version).toBe(preview.version+1);expect(replacement.previewHash).not.toBe(preview.previewHash);
    expect(row().consent_at).toBeNull();expect((await confirm(replacement,time+23)).state).toBe('QUEUED');
  });
  it.each(['SENDING','RETRY','BLOCKED','UNKNOWN'])('never claims delivery cancellation after a possible attempt (%s)',async state=>{
    const preview=await previewErpLead(db,env,id,input,time);await confirm(preview);
    db.sql.prepare('UPDATE assistant_erp_requests SET state=?,attempts=1,lease_token=? WHERE conversation_id=?').run(state,'in-flight-lease',id);
    const cancelled=await cancelErpLead(db,id,time+30);
    expect(cancelled?.state).toBe('UNKNOWN');expect(cancelled?.cancelRequested).toBe(true);expect(row().lease_token).toBe('in-flight-lease');
    await expect(previewErpLead(db,env,id,input,time+31)).rejects.toMatchObject({code:'erp_request_locked'});
  });
  it('retains an explicit unknown outcome even when the recorded attempt count is zero',async()=>{
    const preview=await previewErpLead(db,env,id,input,time);await confirm(preview);
    db.sql.prepare("UPDATE assistant_erp_requests SET state='UNKNOWN',attempts=0,lease_token='review-lease',lease_until=? WHERE conversation_id=?").run(time+45000,id);
    expect((await cancelErpLead(db,id,time+30))?.state).toBe('UNKNOWN');
    expect(row().lease_token).toBe('review-lease');expect(row().lease_until).toBe(time+45000);
    await expect(previewErpLead(db,env,id,input,time+31)).rejects.toMatchObject({code:'erp_request_locked'});
  });
  it('preserves known receipts and never leaks them through public status',async()=>{
    const preview=await previewErpLead(db,env,id,input,time);await confirm(preview);
    db.sql.prepare("UPDATE assistant_erp_requests SET state='APPLIED',attempts=1,receipt_json=?,last_error='internal-diagnostic' WHERE conversation_id=?").run('{"effect_id":"internal-lead-id"}',id);
    const result=await cancelErpLead(db,id,time+30);expect(result?.state).toBe('APPLIED');
    expect(JSON.stringify(result)).not.toContain('internal-');expect(row().receipt_json).toContain('internal-lead-id');
  });
  it('adds the outbox without changing existing history, offers, privacy or notification records',()=>{
    const older=new Db(false);try{
      insertConversation(older);
      older.sql.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,content,request_key,created_at) VALUES ('m',?,'customer','Keep original','k','2026')").run(id);
      older.sql.prepare("INSERT INTO assistant_offers(id,conversation_id,content,request_key,created_at) VALUES ('o',?,'Unchanged offer','k','2026')").run(id);
      older.sql.prepare("INSERT INTO assistant_notifications(id,conversation_id,event_key,kind,status,attempts,next_attempt_at,last_error,created_at,updated_at) VALUES ('n',?,'e','owner_handoff','pending',0,0,'','2026','2026')").run(id);
      const before=['assistant_conversations','assistant_messages','assistant_offers','assistant_notifications'].map(table=>older.sql.prepare(`SELECT * FROM ${table}`).all());
      older.sql.exec(readFileSync('drizzle/0005_assistant_erp_bridge.sql','utf8'));
      const after=['assistant_conversations','assistant_messages','assistant_offers','assistant_notifications'].map(table=>older.sql.prepare(`SELECT * FROM ${table}`).all());
      expect(after).toEqual(before);expect(older.sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(older.sql.prepare('SELECT COUNT(*) n FROM assistant_erp_requests').get()!.n).toBe(0);
    }finally{older.sql.close();}
  });
});
