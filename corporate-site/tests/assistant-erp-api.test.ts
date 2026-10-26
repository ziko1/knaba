import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/api';
import {Db,erpTestEnv,erpTestInput} from './helpers/assistant-erp-fixture';
import type {WorkerEnv} from '../worker/types';
let db:Db,env:WorkerEnv;
const origin='https://kneba.vsp.rest';
const headers={Origin:origin,'Content-Type':'application/json','X-KnaBa-Request':'portal-v1','CF-Connecting-IP':'192.0.2.22'};
beforeEach(()=>{db=new Db();env={...erpTestEnv(),DB:db,OWNER_EMAIL:'owner@example.test'};});
afterEach(()=>db.sql.close());
const call=(path:string,method='GET',body?:unknown,extra:Record<string,string>={})=>handleApi(new Request(origin+path,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body)}),env);
async function start(){const r=await call('/api/assistant/conversations','POST',{locale:'uk',privacyAccepted:true,website:''});expect(r.status).toBe(201);return r.json() as Promise<{id:string;token:string}>;}
describe('guest-confirmed ERP request HTTP handler',()=>{
  it('keeps configuration private, isolates guest tokens, requires origin and explicit confirmation',async()=>{
    const config=await (await call('/api/assistant/lead-config')).text();expect(config).toContain('Будівельне');expect(config).not.toContain(env.ASSISTANT_ERP_SECRET);expect(config).not.toContain('company');
    const a=await start(),b=await start(),path='/api/assistant/conversations/'+a.id+'/lead',auth={'X-KnaBa-Conversation':a.token};
    expect((await call(path)).status).toBe(404);
    expect((await call(path,'GET',undefined,{'X-KnaBa-Conversation':b.token})).status).toBe(404);
    expect((await call(path+'/preview','POST',erpTestInput,{...auth,Origin:'https://other.test'})).status).toBe(403);
    const response=await call(path+'/preview','POST',erpTestInput,auth);expect(response.status).toBe(200);const {lead}=await response.json();
    expect((await call(path+'/confirm','POST',{version:lead.version,previewHash:lead.previewHash},auth)).status).toBe(422);
    const bad=await call(path+'/confirm','POST',{version:lead.version,previewHash:'f'.repeat(64),confirmed:true},auth);expect(bad.status).toBe(409);
    const body={version:lead.version,previewHash:lead.previewHash,confirmed:true};
    expect((await call(path+'/confirm','POST',body,auth)).status).toBe(200);
    expect((await call(path+'/confirm','POST',body,auth)).status).toBe(200);
    expect(db.sql.prepare('SELECT count(*) AS n FROM assistant_erp_requests').get()?.n).toBe(1);
    const ownerInbox=await call('/api/assistant/owner/conversations','GET',undefined,{'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'});
    expect(ownerInbox.status).toBe(200);expect((await ownerInbox.json()).conversations.map((c:{id:string})=>c.id)).toContain(a.id);
    const conversation=await (await call('/api/assistant/conversations/'+a.id,'GET',undefined,auth)).json();expect(conversation.lead.state).toBe('QUEUED');
    env.ASSISTANT_ERP_ENABLED='';const cancelled=await (await call(path+'/cancel','POST',{},auth)).json();expect(cancelled.lead.state).toBe('CANCELLED');
  });
  it('does not turn a human-contact request or accepted offer into an ERP lead',async()=>{
    const ticket=await start(),auth={'X-KnaBa-Conversation':ticket.token};const spy=vi.spyOn(globalThis,'fetch');
    try{expect((await call(`/api/assistant/conversations/${ticket.id}/handoff`,'POST',{name:'',email:'',phone:''},auth)).status).toBe(200);
      const proposal=await call(`/api/assistant/owner/conversations/${ticket.id}/offers`,'POST',{content:'Synthetic proposed terms',idempotencyKey:crypto.randomUUID()},{'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'});
      expect(proposal.status).toBe(200);const offer=(await proposal.json()).offers[0];
      expect((await call(`/api/assistant/conversations/${ticket.id}/offers/${offer.id}/decision`,'POST',{decision:'accepted'},auth)).status).toBe(200);
      expect(db.sql.prepare('SELECT count(*) AS n FROM assistant_erp_requests').get()?.n).toBe(0);expect(spy).not.toHaveBeenCalled();
    }finally{spy.mockRestore();}
  });
  it('resurfaces an old recovered conversation after confirmation beyond the inbox limit',async()=>{
    const ticket=await start(),auth={'X-KnaBa-Conversation':ticket.token};
    const oldTime=new Date(Date.now()-86400000).toISOString();
    db.sql.prepare("UPDATE assistant_conversations SET status='human',created_at=?,updated_at=? WHERE id=?").run(oldTime,oldTime,ticket.id);
    const insert=db.sql.prepare("INSERT INTO assistant_conversations(id,token_hash,locale,status,privacy_version,created_at,updated_at) VALUES (?,?,'de','human','test',?,?)");
    for(let i=0;i<101;i++){
      const time=new Date(Date.now()-3600000+i).toISOString();
      insert.run(crypto.randomUUID(),'b'.repeat(64),time,time);
    }
    const inbox=async()=>{
      const response=await call('/api/assistant/owner/conversations','GET',undefined,{'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'});
      expect(response.status).toBe(200);
      return response.json() as Promise<{conversations:{id:string;updatedAt:string}[];limited:boolean}>;
    };
    const before=await inbox();
    expect(before.conversations).toHaveLength(100);expect(before.limited).toBe(true);
    expect(before.conversations.map(c=>c.id)).not.toContain(ticket.id);
    const path=`/api/assistant/conversations/${ticket.id}/lead`;
    const preview=await call(path+'/preview','POST',erpTestInput,auth);expect(preview.status).toBe(200);
    const {lead}=await preview.json();
    expect((await inbox()).conversations.map(c=>c.id)).not.toContain(ticket.id);
    expect((await call(path+'/confirm','POST',{version:lead.version,previewHash:lead.previewHash,confirmed:true},auth)).status).toBe(200);
    const after=await inbox();
    expect(after.conversations).toHaveLength(100);expect(after.limited).toBe(true);
    expect(after.conversations[0].id).toBe(ticket.id);
    const request=db.sql.prepare('SELECT updated_at FROM assistant_erp_requests WHERE conversation_id=?').get(ticket.id);
    expect(after.conversations[0].updatedAt).toBe(new Date(Number(request?.updated_at)).toISOString());
    expect(db.sql.prepare('SELECT updated_at FROM assistant_conversations WHERE id=?').get(ticket.id)?.updated_at).toBe(oldTime);
  });
  it.each([
    {status:'APPLIED',field:'effect_id',id:'lead-test',expected:{status:'APPLIED',duplicate:false,effectId:'lead-test'}},
    {status:'QUARANTINED',field:'quarantine_id',id:'review-test',expected:{status:'QUARANTINED',duplicate:false,quarantineId:'review-test'}},
  ])('exposes only sanitized $status diagnostics to the authenticated owner',async({status,field,id,expected})=>{
    const ticket=await start(),path=`/api/assistant/conversations/${ticket.id}`,auth={'X-KnaBa-Conversation':ticket.token};
    const ownerAuth={'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'};
    const preview=await (await call(path+'/lead/preview','POST',erpTestInput,auth)).json();
    expect(preview).not.toHaveProperty('leadDiagnostics');
    const confirmation=await (await call(path+'/lead/confirm','POST',{version:preview.lead.version,previewHash:preview.lead.previewHash,confirmed:true},auth)).json();
    expect(confirmation).not.toHaveProperty('leadDiagnostics');
    const eventId=String(db.sql.prepare('SELECT event_id FROM assistant_erp_requests WHERE conversation_id=?').get(ticket.id)?.event_id);
    const rawReceipt={event_id:eventId,status,duplicate:false,[field]:id,authorization:'provider-secret',unrelated:'private-provider-data'};
    db.sql.prepare("UPDATE assistant_erp_requests SET state='UNKNOWN',attempts=2,last_error='cancel_raced_transport',receipt_json=? WHERE conversation_id=?").run(JSON.stringify(rawReceipt),ticket.id);
    for(const suffix of ['', '/lead']){
      const guest=await (await call(path+suffix,'GET',undefined,auth)).json();
      expect(guest).not.toHaveProperty('leadDiagnostics');expect(JSON.stringify(guest)).not.toContain(eventId);
    }
    expect((await call(`/api/assistant/owner/conversations/${ticket.id}`,'GET',undefined,auth)).status).toBe(403);
    const owner=await (await call(`/api/assistant/owner/conversations/${ticket.id}`,'GET',undefined,ownerAuth)).json();
    expect(owner.leadDiagnostics).toEqual({state:'UNKNOWN',eventId,attempts:2,lastError:'cancel_raced_transport',receipt:expected});
    const serialized=JSON.stringify(owner.leadDiagnostics);
    for(const privateValue of ['provider-secret','private-provider-data',env.ASSISTANT_ERP_SECRET!,ticket.token,'snapshot_json','envelope_json','lease_token'])expect(serialized).not.toContain(privateValue);
    const message=await call(`/api/assistant/owner/conversations/${ticket.id}/messages`,'POST',{content:'Owner review',idempotencyKey:crypto.randomUUID()},ownerAuth);
    expect(message.status).toBe(200);expect((await message.json()).leadDiagnostics).toEqual(owner.leadDiagnostics);
  });
  it.each([
    {name:'invalid JSON',rawReceipt:'not-json'},
    {name:'wrong event',rawReceipt:JSON.stringify({event_id:'wrong-event',status:'APPLIED',duplicate:false,effect_id:'lead'})},
    {name:'missing event',rawReceipt:JSON.stringify({status:'APPLIED',duplicate:false,effect_id:'lead'})},
    {name:'oversized receipt',rawReceipt:'x'.repeat(4097)},
  ])('suppresses unvalidated stored diagnostics: $name',async({rawReceipt})=>{
    const ticket=await start(),auth={'X-KnaBa-Conversation':ticket.token};
    await call(`/api/assistant/conversations/${ticket.id}/lead/preview`,'POST',erpTestInput,auth);
    db.sql.prepare("UPDATE assistant_erp_requests SET state='BLOCKED',last_error=?,receipt_json=? WHERE conversation_id=?").run('raw provider error with credential',rawReceipt,ticket.id);
    const owner=await (await call(`/api/assistant/owner/conversations/${ticket.id}`,'GET',undefined,{'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'})).json();
    expect(owner.leadDiagnostics.lastError).toBeNull();expect(owner.leadDiagnostics.receipt).toBeNull();
    expect(JSON.stringify(owner)).not.toContain('raw provider error');
  });
  it('fences an automatic response if handoff wins after the guest message insert',async()=>{
    const ticket=await start(),original=db.prepare.bind(db);
    db.prepare=(sql:string)=>{const statement=original(sql);if(sql.startsWith('INSERT OR IGNORE INTO assistant_messages')&&sql.includes("'customer'")){
      const run=statement.run.bind(statement);statement.run=async()=>{const result=await run();db.sql.prepare("UPDATE assistant_conversations SET status='human' WHERE id=?").run(ticket.id);return result;};
    }return statement;};
    const r=await call(`/api/assistant/conversations/${ticket.id}/messages`,'POST',{content:'price',idempotencyKey:crypto.randomUUID()},{'X-KnaBa-Conversation':ticket.token});
    expect(r.status).toBe(200);const thread=await r.json();expect(thread.conversation.status).toBe('human');expect(thread.messages.map((m:{sender:string})=>m.sender)).toEqual(['customer']);
  });
});
