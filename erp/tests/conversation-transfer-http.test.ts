import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID,createHmac} from 'node:crypto';
import {hashToken} from '../apps/api/auth.ts';
import {WorkerRunner,type OutboxJob} from '../apps/worker/runner.ts';
import {transferFixture,transferHttp,transferEnvelope,signedTransferBody,transferPhone,transferSender,transferCookie,syntheticPhoneId,syntheticAppSecret} from './helpers/conversation-transfer-fixture.ts';

beforeEach(()=>{vi.stubEnv('WHATSAPP_PUBLIC_NUMBER',transferPhone);vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID',syntheticPhoneId);});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('actual Nest/Express HTTP guest transfer with a controlled SQL fixture',()=>{
 it.each(['/api/v1/webhooks/whatsapp','/webhooks/whatsapp'].flatMap(path=>[false,true].map(valid=>({path,valid}))))('authenticates raw malformed JSON before parsing or diagnostics ($path, valid signature: $valid)',async({path,valid})=>{
  const f=transferFixture(),server=await transferHttp(f);try{const raw=Buffer.from('{"text":"KNABA_TRANSFER synthetic-parser-secret'),signature=`sha256=${valid?createHmac('sha256',syntheticAppSecret).update(raw).digest('hex'):'0'.repeat(64)}`;
   const response=await fetch(`${server.base}${path}`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature},body:raw});expect(response.status).toBe(valid?400:401);expect(response.headers.get('content-type')).toContain('application/json');const body=await response.text();expect(body).not.toContain('synthetic-parser-secret');expect(body).not.toContain('SyntaxError');expect(f.db.inbox.size).toBe(0);expect(f.db.jobs.size).toBe(0);
  }finally{await server.app.close();}
 });
 it('retains the bounded eight-megabyte raw-body limit with a safe error response',async()=>{
  const f=transferFixture(),server=await transferHttp(f);try{const response=await fetch(`${server.base}/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+'0'.repeat(64)},body:Buffer.alloc(8*1024*1024+1,65)});expect(response.status).toBe(413);expect(await response.json()).toEqual({code:'VALIDATION_ERROR'});expect(f.db.inbox.size).toBe(0);expect(f.db.jobs.size).toBe(0);}finally{await server.app.close();}
 });
 it('completes signed WhatsApp claim plus CSRF-protected web confirmation over actual HTTP',async()=>{
  const f=transferFixture(),server=await transferHttp(f);try{
   const issue=await server.request('',{});expect(issue.status).toBe(201);const issued=await issue.json(),code=new URL(issued.url).searchParams.get('text')!;
   const signed=signedTransferBody(transferEnvelope(code)),response=await fetch(`${server.base}/api/v1/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signed.signature},body:signed.raw});expect(response.status).toBe(200);
   const job=[...f.db.jobs.values()][0]!;Object.assign(job,{status:'RUNNING',attempts:1,lease_token:randomUUID(),leased_until:new Date(Date.now()+60000).toISOString()});
   await (new WorkerRunner(f.db as any,f.engine,{companyId:f.db.companyId,appMode:'TEST'}) as any).inbound(job as OutboxJob);
   const status=await server.request(''),body=await status.json();expect(status.status).toBe(200);expect(body.transfer).toMatchObject({state:'CLAIMED',sender:`+${transferSender}`});expect(await f.db.list('contact_identity')).toHaveLength(0);
   const confirmed=await server.request(`/${issued.id}/confirm`,{expectedVersion:body.transfer.version,targetSender:body.transfer.sender,whatsappConsent:true});expect(confirmed.status).toBe(201);expect(await confirmed.json()).toMatchObject({state:'CONFIRMED',channelId:'guest-channel'});
   expect((await f.db.list('contact_identity'))[0]!.data.userId).toBe('guest');expect((await f.db.list('user')).map(user=>user.id).sort()).toEqual(['guest','knaba-integration-service']);
  }finally{await server.app.close();}
 });

 it.each(['missing-csrf','wrong-origin','no-cookie'] as const)('denies issuance with %s without creating a transfer',async attack=>{
  const f=transferFixture(),server=await transferHttp(f);try{const headers={...f.headers};if(attack==='missing-csrf')delete headers['x-csrf-token'];if(attack==='wrong-origin')headers.origin='https://untrusted.example.test';if(attack==='no-cookie')delete headers.cookie;const response=await server.request('',{},headers);expect(response.status).toBeGreaterThanOrEqual(400);expect(await f.db.list('guest_conversation_transfer')).toHaveLength(0);}finally{await server.app.close();}
 });

 it.each(['bad-signature','different-raw-bytes','foreign-phone-account'] as const)('rejects %s before a durable inbox effect',async attack=>{
  const f=transferFixture(),server=await transferHttp(f);try{
   const body=transferEnvelope('KNABA_TRANSFER synthetic-secret');if(attack==='foreign-phone-account')body.entry[0]!.changes[0]!.value.metadata.phone_number_id='another-business-phone';
   const signed=signedTransferBody(body);const response=await fetch(`${server.base}/api/v1/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':attack==='bad-signature'?'sha256='+'0'.repeat(64):signed.signature},body:attack==='different-raw-bytes'?`${signed.raw.toString()} `:signed.raw});
   expect(response.status).toBe(401);expect(f.db.inbox.size).toBe(0);expect(f.db.jobs.size).toBe(0);expect(await response.text()).not.toContain('synthetic-secret');
  }finally{await server.app.close();}
 });

 it('deduplicates ten signed HTTP retries and quarantines malformed codes before autoprovisioning',async()=>{
  const f=transferFixture(),server=await transferHttp(f);try{
   const signed=signedTransferBody(transferEnvelope('KNABA_TRANSFER malformed-secret-never-persist'));
   const responses=await Promise.all(Array.from({length:10},()=>fetch(`${server.base}/api/v1/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signed.signature},body:signed.raw})));expect(responses.every(response=>response.status===200)).toBe(true);expect(f.db.inbox.size).toBe(1);expect(f.db.jobs.size).toBe(1);
   expect(JSON.stringify([...f.db.inbox.values()])).not.toContain('malformed-secret-never-persist');const job=[...f.db.jobs.values()][0]!;Object.assign(job,{status:'RUNNING',attempts:1,lease_token:randomUUID(),leased_until:new Date(Date.now()+60000).toISOString()});
   await (new WorkerRunner(f.db as any,f.engine,{companyId:f.db.companyId,appMode:'TEST'}) as any).inbound(job);expect(await f.db.list('user')).toHaveLength(2);expect(await f.db.list('contact_identity')).toHaveLength(0);expect(await f.db.list('conversation_input')).toHaveLength(0);
  }finally{await server.app.close();}
 });

 it('does not acknowledge or retain an inbox event if atomic outbox persistence fails',async()=>{
  const f=transferFixture(),server=await transferHttp(f);try{
   vi.spyOn(f.db,'event').mockRejectedValue(new Error('Synthetic unavailable database'));
   const signed=signedTransferBody(transferEnvelope('Hello')),response=await fetch(`${server.base}/api/v1/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signed.signature},body:signed.raw});
   expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'DEPENDENCY_UNAVAILABLE'});expect(f.db.inbox.size).toBe(0);expect(f.db.jobs.size).toBe(0);
  }finally{await server.app.close();}
 });

 it('withholds the one-shot URL when the original session is revoked after commit and before JSON egress',async()=>{
  const f=transferFixture(),server=await transferHttp(f),transaction=f.db.transaction.bind(f.db);let secret='';
  vi.spyOn(f.db,'transaction').mockImplementation(async(company,actor,callback)=>{const committed:any=await transaction(company,actor,callback);if(committed?.result?.url){secret=new URL(committed.result.url).searchParams.get('text')!;f.db.sessions.get(hashToken(transferCookie))!.revoked_at=new Date().toISOString();}return committed;});
  try{const response=await server.request('',{}),body=await response.text();expect(secret).toContain('KNABA_TRANSFER');expect(response.status).toBe(401);expect(body).not.toContain(secret);expect(body).not.toContain('wa.me');expect(await f.db.list('contact_identity')).toHaveLength(0);}finally{await server.app.close();}
 });

 it('withholds private transfer status if channel authority changes before JSON egress',async()=>{
  const f=transferFixture(),server=await transferHttp(f);try{
   expect((await server.request('',{})).status).toBe(201);const transaction=f.db.transaction.bind(f.db);
   vi.spyOn(f.db,'transaction').mockImplementation(async(company,actor,callback)=>{const committed:any=await transaction(company,actor,callback);if(committed?.result?.transfer)f.db.rows.get('channel:guest-channel')!.data.members[0].active=false;return committed;});
   const response=await server.request(''),body=await response.text();expect(response.status).toBeGreaterThanOrEqual(400);expect(body).not.toContain('ISSUED');expect(body).not.toContain('guest-channel');
  }finally{await server.app.close();}
 });
});
