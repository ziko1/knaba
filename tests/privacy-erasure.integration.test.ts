import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {Database,PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {createPrivacyErasureCommands,processPrivacyBlobDeletion} from '../apps/api/privacy-erasure.ts';
import {PostgresPrivateBlobStore,S3PrivateBlobStore,type PrivateBlobStore} from '../packages/storage/index.ts';
import {DomainError,type Actor,type Data} from '../packages/domain/core.ts';

// Run only against the explicitly isolated CI QA database. Each case owns a fresh company.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
describe('private storage namespace fencing (CPU; no provider calls)',()=>{
 const config={bucket:'knaba-test-privacy',region:'eu-central-1',endpoint:'https://s3.synthetic.invalid/private'};
 const sender={send:async()=>{throw new Error('CPU_TEST_MUST_NOT_CALL_PROVIDER');}};
 it('stable identities bind bucket, endpoint, region and namespace instead of credentials',()=>{
  const first=new S3PrivateBlobStore(config,sender);expect(first.identity).toMatch(/^[a-f0-9]{64}$/);expect(new S3PrivateBlobStore({...config},sender).identity).toBe(first.identity);for(const changed of [{...config,bucket:'knaba-other-privacy'},{...config,region:'eu-west-1'},{...config,endpoint:'https://other.synthetic.invalid/private'}])expect(new S3PrivateBlobStore(changed,sender).identity).not.toBe(first.identity);
 });
 it('external config mutation cannot redirect a deletion into a new namespace',async()=>{
  const mutable={...config},commands:any[]=[];const store=new S3PrivateBlobStore(mutable,{send:async command=>{commands.push(command);return {};}}),identity=store.identity;mutable.bucket='knaba-switched-private';await store.delete('test-company','test-blob');expect(store.identity).toBe(identity);expect(commands[0].input.Bucket).toBe(config.bucket);
 });
});
postgres('transactional bounded privacy erasure (real PostgreSQL)',()=>{
 let db:Database,engine:Engine,storage:PostgresPrivateBlobStore,company:string,ownerA:Actor,ownerB:Actor,blob:string,clientBlob:string;
 const ids={subject:'erasure-subject',other:'erasure-other',ownerA:'erasure-owner-a',ownerB:'erasure-owner-b',legal:'erasure-legal',request:'erasure-request',message:'erasure-message',media:'erasure-media',translation:'erasure-translation',raw:'erasure-input',event:'erasure-provider-event'};
 const canary='PRIVATE_ERASURE_CANARY_48b2a4',bytes=Buffer.from('synthetic private bytes; never real customer content'),sha=createHash('sha256').update(bytes).digest('hex');
 const call=(actor:Actor,name:string,input:Data)=>engine.execute(actor,name,{input,idempotency_key:randomUUID()});
 const add=(kind:string,data:Data,id?:string)=>db.transaction(company,'SYNTHETIC_PRIVACY_QA',tx=>tx.add(kind,data,id));
 const preview=()=>call(ownerA,'privacy.erasure.preview',{requestId:ids.request});
 const confirm=(p:Data,actor=ownerB)=>call(actor,'privacy.erasure.confirm',{planId:p.planId,confirmedHash:p.planHash});
 beforeAll(async()=>{db=new Database();await db.migrate();storage=new PostgresPrivateBlobStore(db);});
 beforeEach(async()=>{
  company=`privacy-qa-${randomUUID()}`;blob=randomUUID();clientBlob=randomUUID();engine=new Engine(db,'TEST');engine.registry={...engine.registry,...createPrivacyErasureCommands(db,engine,storage)};
  const now=Date.now();
  await db.transaction(company,'SYNTHETIC_PRIVACY_QA',async tx=>{
   await tx.add('company',{synthetic:true,operatingMode:'TEST'},company);
   for(const id of [ids.ownerA,ids.ownerB])await tx.add('user',{active:true,roles:['OWNER'],siteIds:[]},id);
   for(const id of [ids.subject,ids.other])await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:[]},id);
   await tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'SYNTHETIC_TEST_APPROVAL_ONLY',approvedAt:new Date(now-60_000).toISOString(),expiresAt:new Date(now+86_400_000).toISOString(),scope:{erasureCategories:['CHAT','MEDIA'],retentionProfiles:{CHAT:{minDays:0,maxDays:0},MEDIA:{minDays:0,maxDays:0}}}},ids.legal);
   for(const category of ['CHAT','MEDIA'])await tx.add('retention_policy',{category,state:'APPROVED',retentionDays:0,minDays:0,maxDays:0,legalApprovalId:ids.legal,legalApprovalVersion:1,createdBy:ids.ownerA,approvedBy:ids.ownerB,approvedAt:new Date(now-30_000).toISOString()},`policy-${category}`);
   await tx.add('privacy_request',{type:'ERASURE',categories:['MESSAGES','MEDIA'],subjectUserId:ids.subject,state:'AWAITING_ERASURE_EXECUTION',legalApprovalId:ids.legal,legalApprovalVersion:1,reviewedBy:ids.ownerB,sourceDataDeleted:false},ids.request);
   await tx.add('message',{author_id:ids.subject,channel_id:'synthetic-channel',text:canary,language:'EN',message_version:1,attachment_ids:[]},ids.message);
   await tx.add('message_version',{message_id:ids.message,text:canary,original_text:canary},'message-history');
   await tx.add('translation',{message_id:ids.message,source_text:canary,text:`translated ${canary}`,status:'SUCCEEDED'},ids.translation);
   await tx.add('conversation_input',{user_id:ids.subject,message_id:ids.message,provider_event_id:ids.event,input:{id:ids.event,text:canary},status:'PROCESSED'},ids.raw);
   await storage.put({companyId:company,id:blob,ownerId:ids.subject,bytes,mimeType:'image/jpeg'},tx);await storage.put({companyId:company,id:clientBlob,ownerId:ids.subject,bytes,mimeType:'image/jpeg'},tx);
   const media={uploadedBy:ids.subject,uploadId:blob,blobKey:blob,clientBlobKey:clientBlob,sha256:sha,clientSha256:sha,caption:canary};
   await tx.add('media_upload',media,blob);await tx.add('media_asset',media,ids.media);
   await tx.add('payroll_calculation',{employeeId:ids.subject,netCents:185000,state:'LOCKED',legalBasis:'STATUTORY_PAYROLL_RETENTION'},'protected-payroll');
   await tx.query('INSERT INTO command_receipts(company_id,actor_id,idempotency_key,command,input_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[company,ids.subject,'synthetic-source-receipt','message.send','ORIGINAL_INPUT_HASH',JSON.stringify({id:ids.message,data:{text:canary}})]);
   await tx.query("INSERT INTO outbox(id,company_id,type,data,status,lease_token,leased_until) VALUES($1,$2,'message.created',$3,'PENDING','original-lease',now()+interval '1 hour')",[randomUUID(),company,JSON.stringify({message_id:ids.message,text:canary})]);
   await tx.query('INSERT INTO webhook_inbox(provider,event_id,company_id,payload) VALUES($1,$2,$3,$4)',['SYNTHETIC_WHATSAPP',`${company}:${ids.event}`,company,JSON.stringify({text:'unmapped must stay'})]);
   await tx.query('INSERT INTO webhook_inbox(provider,event_id,company_id,payload) VALUES($1,$2,$3,$4)',['SYNTHETIC_WHATSAPP',ids.event+':'+company,company,JSON.stringify({text:canary})]);
   const input=await tx.get('conversation_input',ids.raw);await tx.save(input,{...input.data,provider_event_id:ids.event+':'+company});
  });
  [ownerA,ownerB]=await Promise.all([ids.ownerA,ids.ownerB].map(async id=>({...await engine.getActor(id,company),mfaVerified:true})));
 });
 afterAll(async()=>{await db?.close();});

 it('actually removes private bytes and every mapped source/translation/history/receipt/webhook copy atomically while preserving audit and payroll',async()=>{
  const originalRevision=(await db.query('SELECT actor_id,created_at FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3 AND version=1',[company,'message',ids.message])).rows[0];
  const beforeAudit=(await db.query('SELECT id,detail,created_at FROM audit_log WHERE company_id=$1 ORDER BY id',[company])).rows;
  const p=await preview(),result=await confirm(p);expect(result.sourceDataDeleted).toBe(true);expect(result.requestFulfilled).toBe(false);expect(result.fullLegalDsarFulfillment).toBe(false);expect(result.checks.every((c:Data)=>c.verified)).toBe(true);
  for(const key of [blob,clientBlob])await expect(storage.get(company,key)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  const rows=(await db.query('SELECT kind,data FROM aggregates WHERE company_id=$1',[company])).rows;expect(rows.filter(r=>['message','media_upload','media_asset','translation','message_version','conversation_input'].includes(r.kind)).every(r=>!JSON.stringify(r.data).includes(canary))).toBe(true);
  expect(JSON.stringify((await db.query('SELECT data FROM aggregate_revisions WHERE company_id=$1',[company])).rows)).not.toContain(canary);
  const receipt=(await db.query('SELECT * FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2',[company,'synthetic-source-receipt'])).rows[0];expect(receipt.input_hash).toBe('ORIGINAL_INPUT_HASH');expect(receipt.result.replayDenied).toBe(true);expect(JSON.stringify(receipt)).not.toContain(canary);
  const outbox=(await db.query("SELECT * FROM outbox WHERE company_id=$1 AND type='message.created'",[company])).rows[0];expect(outbox.status).toBe('CANCELLED');expect(outbox.lease_token).toBeNull();expect(JSON.stringify(outbox.data)).not.toContain(canary);
  expect(JSON.stringify((await db.query('SELECT payload FROM webhook_inbox WHERE company_id=$1',[company])).rows)).not.toContain(canary);
  expect((await db.query('SELECT actor_id,created_at FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3 AND version=1',[company,'message',ids.message])).rows[0]).toEqual(originalRevision);
  expect((await db.query('SELECT id,detail,created_at FROM audit_log WHERE company_id=$1 AND id<=$2 ORDER BY id',[company,beforeAudit.at(-1).id])).rows).toEqual(beforeAudit);
  expect((await db.transaction(company,'QA',tx=>tx.get('payroll_calculation','protected-payroll'))).data.netCents).toBe(185000);
  expect((await db.query('SELECT count(*) AS count FROM privacy_revision_permits WHERE company_id=$1',[company])).rows[0].count).toBe('0');
 });
 it('requires two distinct owners and current MFA even in TEST; no byte is erased on denial',async()=>{
  const p=await preview();await expect(confirm(p,ownerA)).rejects.toMatchObject({code:'SELF_APPROVAL_DENIED'});await expect(confirm(p,{...ownerB,mfaVerified:false})).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect((await storage.get(company,blob)).sha256).toBe(sha);
 });
 it('rejects stale confirmation after a source change and keeps new content and bytes',async()=>{
  const p=await preview();await db.transaction(company,'QA',async tx=>{const m=await tx.get('message',ids.message);await tx.save(m,{...m.data,text:'fresh content after preview'});});await expect(confirm(p)).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect((await storage.get(company,blob)).sha256).toBe(sha);
 });
 it('revalidates a legal hold committed after preview before any mutation',async()=>{
  const p=await preview();await add('legal_hold',{state:'ACTIVE',subjectUserId:ids.subject,categories:['CHAT','MEDIA'],createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600_000).toISOString()});await expect(confirm(p)).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect((await storage.get(company,blob)).sha256).toBe(sha);
 });
 it('sees a hold committed while erasure is waiting for the company lock',async()=>{
  const p=await preview(),holdClient=await db.pool.connect();let pending:Promise<unknown>|undefined;
  try{
   await holdClient.query('BEGIN');await holdClient.query('SELECT pg_advisory_xact_lock(hashtext($1))',[company]);
   pending=confirm(p).then(result=>({result}),error=>({error}));let waiting=false;
   for(let attempt=0;attempt<200;attempt++){
    waiting=(await db.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid=((hashtext($1)::bigint & 4294967295)::oid)",[company])).rows.length>0;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(waiting,'erasure must genuinely wait behind the company lock').toBe(true);
   await new PgTransaction(holdClient,company,'SYNTHETIC_HOLD_QA').add('legal_hold',{state:'ACTIVE',subjectUserId:ids.subject,categories:['CHAT','MEDIA'],createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600_000).toISOString(),synthetic:true});
   await holdClient.query('COMMIT');const outcome=await pending as {error?:DomainError;result?:unknown};expect(outcome.error?.code).toBe('VERSION_CONFLICT');expect((await storage.get(company,blob)).sha256).toBe(sha);
  }finally{await holdClient.query('ROLLBACK');holdClient.release();await pending;}
 });
 it('rejects a retention policy revoked after preview without touching live or historical sources',async()=>{
  const p=await preview();await db.transaction(company,'QA',async tx=>{const policy=await tx.get('retention_policy','policy-MEDIA');await tx.save(policy,{...policy.data,state:'REVOKED'});});await expect(confirm(p)).rejects.toMatchObject({code:'NEEDS_APPROVAL'});expect((await storage.get(company,blob)).sha256).toBe(sha);
 });
 it('uses fresh owner identity and denies a confirmer deactivated after preview',async()=>{
  const p=await preview();await db.transaction(company,'QA',async tx=>{const user=await tx.get('user',ids.ownerB);await tx.save(user,{...user.data,active:false});});await expect(confirm(p)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect((await storage.get(company,blob)).sha256).toBe(sha);
 });
 it('redacts orphan immutable message history even after the current aggregate disappeared',async()=>{
  await db.query("DELETE FROM aggregates WHERE company_id=$1 AND kind='message' AND id=$2",[company,ids.message]);const p=await preview(),result=await confirm(p);expect(result.sourceDataDeleted).toBe(true);expect(JSON.stringify((await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind='message' AND id=$2",[company,ids.message])).rows)).not.toContain(canary);
 });
 it('redacts private assistant draft and tool results plus every immutable version through bounded SQL permits',async()=>{
  const draftCanary='SYNTHETIC_PRIVATE_DRAFT_CONTACT_CANARY',toolCanary='SYNTHETIC_PRIVATE_TOOL_REPORT_SNIPPET_CANARY';
  await db.transaction(company,'SYNTHETIC_ASSISTANT_QA',async tx=>{
   const draft=await tx.add('assistant_lead_draft',{ownerUserId:ids.subject,channelId:'synthetic-channel',messageId:ids.message,state:'DRAFT',input:{contact:{name:draftCanary,email:'synthetic@example.invalid'}}},'assistant-draft');
   const tool=await tx.add('assistant_tool_call',{ownerUserId:ids.subject,channelId:'synthetic-channel',messageId:ids.message,tool:'saveLeadDraft',result:{draftId:draft.id,descriptionDe:toolCanary}},'assistant-call');
   await tx.save(draft,{...draft.data,input:{contact:{name:`edited ${draftCanary}`}}});await tx.save(tool,{...tool.data,result:{draftId:draft.id,descriptionDe:`edited ${toolCanary}`}});
  });
  const identitySql="SELECT kind,id,version,actor_id,created_at FROM aggregate_revisions WHERE company_id=$1 AND kind IN('assistant_lead_draft','assistant_tool_call') AND version<=2 ORDER BY kind,id,version";
  const originalIdentity=(await db.query(identitySql,[company])).rows;expect(originalIdentity).toHaveLength(4);
  const p=await preview(),plan=(await db.transaction(company,'QA',tx=>tx.get('privacy_erasure_plan',p.planId))).data.plan;
  expect(plan.actions.filter((action:Data)=>action.type==='REDACT_REVISION'&&['assistant_lead_draft','assistant_tool_call'].includes(action.kind))).toHaveLength(4);
  const result=await confirm(p);expect(result.sourceDataDeleted).toBe(true);
  for(const kind of ['assistant_lead_draft','assistant_tool_call']){
   const rows=(await db.query('SELECT data FROM aggregates WHERE company_id=$1 AND kind=$2 UNION ALL SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2',[company,kind])).rows;
   expect(rows.length).toBeGreaterThan(2);for(const row of rows)expect(row.data).toMatchObject({state:'ERASED',privacyErasureRequestId:ids.request});
   expect(JSON.stringify(rows)).not.toContain(draftCanary);expect(JSON.stringify(rows)).not.toContain(toolCanary);
  }
  expect((await db.query(identitySql,[company])).rows).toEqual(originalIdentity);
  expect((await db.query('SELECT count(*)::text AS count FROM privacy_revision_permits WHERE company_id=$1',[company])).rows[0].count).toBe('0');
 });
 it('preserves confirmed assistant intake and its message when linked lead and order require business retention',async()=>{
  await db.transaction(company,'SYNTHETIC_ASSISTANT_QA',async tx=>{
   await tx.add('lead',{ownerUserId:ids.subject,status:'QUALIFIED',contact:{name:'SYNTHETIC_BUSINESS_CONTACT_RETAINED'}},'assistant-business-lead');
   await tx.add('order',{leadId:'assistant-business-lead',scope:'SYNTHETIC_BUSINESS_SCOPE_RETAINED',status:'ACCEPTED'},'assistant-business-order');
   await tx.add('assistant_lead_draft',{ownerUserId:ids.subject,channelId:'synthetic-channel',messageId:ids.message,state:'CONFIRMED',leadId:'assistant-business-lead',input:{contact:{name:'SYNTHETIC_CONFIRMED_CONTACT_RETAINED'}}},'assistant-draft');
   await tx.add('assistant_tool_call',{ownerUserId:ids.subject,channelId:'synthetic-channel',messageId:ids.message,tool:'confirmLead',result:{draftId:'assistant-draft',leadId:'assistant-business-lead'}},'assistant-call');
  });
  const retainedKinds=['message','assistant_lead_draft','assistant_tool_call','lead','order'],retainedSql='SELECT kind,id,version,data FROM aggregates WHERE company_id=$1 AND kind=ANY($2::text[]) ORDER BY kind,id';
  const original=(await db.query(retainedSql,[company,retainedKinds])).rows;
  const p=await preview();expect(p.retained).toContainEqual(expect.objectContaining({kind:'message',id:ids.message,reason:'BUSINESS_RECORD_LINK_REQUIRES_REVIEW'}));
  const plan=(await db.transaction(company,'QA',tx=>tx.get('privacy_erasure_plan',p.planId))).data.plan;
  for(const row of original)expect(plan.actions.some((action:Data)=>action.kind===row.kind&&action.id===row.id)).toBe(false);
  const result=await confirm(p);expect(result.liveSourceStatus).toBe('PARTIALLY_PURGED_LIVE_SCOPE');expect(result.requestFulfilled).toBe(false);
  expect((await db.query(retainedSql,[company,retainedKinds])).rows).toEqual(original);
  expect(JSON.stringify((await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind='message'",[company])).rows)).toContain(canary);
 });
 async function seedInternalAssistant(status='READY'){
  await db.transaction(company,'SYNTHETIC_INTERNAL_ASSISTANT_QA',async tx=>{
   let request=await tx.add('internal_assistant_request',{ownerUserId:ids.subject,user_id:ids.subject,channelId:'synthetic-channel',messageId:ids.message,sourceMessageId:ids.message,messageVersion:1,configId:'synthetic-config',configVersion:1,status:'PENDING',contextIds:{siteId:'synthetic-site'},privateInput:'SYNTHETIC_INTERNAL_REQUEST_CANARY'},'internal-request');
   request=await tx.save(request,{...request.data,status:'RUNNING',startedAt:new Date().toISOString()});
   if(status!=='RUNNING')await tx.save(request,{...request.data,status,completedAt:new Date().toISOString()});
   const draft=await tx.add('internal_assistant_draft',{ownerUserId:ids.subject,user_id:ids.subject,channelId:'synthetic-channel',messageId:ids.message,sourceMessageId:ids.message,requestId:request.id,state:'DRAFT',proposal:{description:'SYNTHETIC_INTERNAL_PROPOSAL_CANARY'},preview:{text:'SYNTHETIC_INTERNAL_PREVIEW_CANARY'},canonicalInput:{description:'SYNTHETIC_INTERNAL_CANONICAL_CANARY'}},'internal-draft');
   await tx.save(draft,{...draft.data,preview:{text:'SYNTHETIC_EDITED_INTERNAL_PREVIEW_CANARY'}});
   for(const command of ['request','preview'])await tx.query('INSERT INTO command_receipts(company_id,actor_id,idempotency_key,command,input_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[company,ids.subject,`internal-${command}`,`internal_assistant.${command}`,'SYNTHETIC_INTERNAL_HASH',JSON.stringify({requestId:request.id,draftId:draft.id,preview:draft.data.preview})]);
   for(const type of ['requested','draft_prepared','failed'])await tx.query("INSERT INTO outbox(id,company_id,type,data,status) VALUES($1,$2,$3,$4,'FAILED')",[randomUUID(),company,`internal_assistant.${type}`,JSON.stringify({requestId:request.id,draftId:draft.id,privateCopy:'SYNTHETIC_INTERNAL_OUTBOX_CANARY'})]);
  });
 }
 it('actually redacts terminal unconfirmed internal request/draft histories with bounded SQL permits while preserving foreign copies and revision identity',async()=>{
  await seedInternalAssistant();const foreign=`privacy-foreign-${randomUUID()}`;
  await db.transaction(foreign,'SYNTHETIC_FOREIGN_QA',async tx=>{
   await tx.add('internal_assistant_request',{messageId:ids.message,status:'RUNNING',privateInput:'FOREIGN_INTERNAL_PRIVATE_REMAINS'},'internal-request');await tx.add('internal_assistant_draft',{messageId:ids.message,requestId:'internal-request',state:'CONFIRMED',proposal:{text:'FOREIGN_INTERNAL_PRIVATE_REMAINS'}},'internal-draft');
  });
  const identitySql="SELECT kind,id,version,actor_id,created_at FROM aggregate_revisions WHERE company_id=$1 AND kind IN('internal_assistant_request','internal_assistant_draft') AND version<=CASE WHEN kind='internal_assistant_request' THEN 3 ELSE 2 END ORDER BY kind,id,version";
  const original=(await db.query(identitySql,[company])).rows,foreignSql="SELECT kind,id,version,data FROM aggregates WHERE company_id=$1 ORDER BY kind,id",foreignOriginal=(await db.query(foreignSql,[foreign])).rows;expect(original).toHaveLength(5);
  const p=await preview(),plan=(await db.transaction(company,'QA',tx=>tx.get('privacy_erasure_plan',p.planId))).data.plan;
  expect(plan.actions.filter((a:Data)=>a.type==='REDACT_REVISION'&&a.kind?.startsWith('internal_assistant_'))).toHaveLength(5);
  expect((await confirm(p)).sourceDataDeleted).toBe(true);
  const rows=(await db.query("SELECT kind,data FROM aggregates WHERE company_id=$1 AND kind IN('internal_assistant_request','internal_assistant_draft') UNION ALL SELECT kind,data FROM aggregate_revisions WHERE company_id=$1 AND kind IN('internal_assistant_request','internal_assistant_draft')",[company])).rows;
  expect(rows).toHaveLength(9);for(const row of rows)expect(row.data).toEqual({channelId:'synthetic-channel',messageId:ids.message,privacyErasedAt:plan.createdAt,privacyErasureRequestId:ids.request,state:'ERASED',status:'CANCELLED'});
  expect(JSON.stringify(rows)).not.toContain('CANARY');expect((await db.query(identitySql,[company])).rows).toEqual(original);expect((await db.query(foreignSql,[foreign])).rows).toEqual(foreignOriginal);
  const receipts=(await db.query("SELECT result FROM command_receipts WHERE company_id=$1 AND command IN('internal_assistant.request','internal_assistant.preview')",[company])).rows;expect(receipts).toHaveLength(2);for(const row of receipts)expect(row.result).toMatchObject({status:'SOURCE_ERASED',replayDenied:true});
  const jobs=(await db.query("SELECT data,status FROM outbox WHERE company_id=$1 AND type IN('internal_assistant.requested','internal_assistant.draft_prepared','internal_assistant.failed')",[company])).rows;expect(jobs).toHaveLength(3);for(const row of jobs)expect(row).toMatchObject({status:'CANCELLED',data:{status:'SOURCE_ERASED'}});
  expect((await db.query('SELECT count(*)::text AS count FROM privacy_revision_permits WHERE company_id=$1',[company])).rows[0].count).toBe('0');
 });
 it('holds actual current RUNNING internal provider sources despite cancelled jobs, then permits a fresh plan after terminal quiescence without historical RUNNING retention',async()=>{
  await seedInternalAssistant('RUNNING');await db.query("UPDATE outbox SET status='CANCELLED' WHERE company_id=$1 AND type LIKE 'internal_assistant.%'",[company]);
  const p=await preview();for(const id of [ids.message,ids.raw,ids.translation,'internal-request','internal-draft'])expect(p.retained).toContainEqual(expect.objectContaining({id,reason:'IN_FLIGHT_PROCESSOR_REQUIRES_QUIESCENCE'}));
  expect(await confirm(p)).toMatchObject({sourceDataDeleted:false,liveSourceStatus:'AWAITING_QUIESCENCE'});expect((await db.transaction(company,'QA',tx=>tx.get('message',ids.message))).data.text).toBe(canary);
  await db.transaction(company,'SYNTHETIC_PROVIDER_RETURN',async tx=>{const request=await tx.get('internal_assistant_request','internal-request');await tx.save(request,{...request.data,status:'FAILED',completedAt:new Date().toISOString(),error:'SYNTHETIC_PROVIDER_FAILURE'});});
  const fresh=await preview();expect(fresh.retained.some((r:Data)=>r.reason==='IN_FLIGHT_PROCESSOR_REQUIRES_QUIESCENCE')).toBe(false);expect((await confirm(fresh)).sourceDataDeleted).toBe(true);
  expect(JSON.stringify((await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind IN('internal_assistant_request','internal_assistant_draft')",[company])).rows)).not.toContain('CANARY');
 });
 it.each(['task_batch','report','material_request'])('preserves confirmed internal %s intent, source history, actual business records, command receipts and confirmation event',async kind=>{
  await seedInternalAssistant();const businessId='confirmed-business-result';
  await db.transaction(company,'SYNTHETIC_BUSINESS_CONFIRMATION',async tx=>{
   await tx.add(kind,{siteId:'synthetic-site',state:'DRAFT',description:'SYNTHETIC_BUSINESS_RECORD_REMAINS'},businessId);
   const draft=await tx.get('internal_assistant_draft','internal-draft'),request=await tx.get('internal_assistant_request','internal-request');
   await tx.save(draft,{...draft.data,state:'CONFIRMED',confirmedAt:new Date().toISOString(),result:{command:`${kind}.create`,entityIds:[businessId],result:[{id:businessId,kind}]}});await tx.save(request,{...request.data,status:'CONFIRMED',confirmedAt:new Date().toISOString()});
   await tx.query('INSERT INTO command_receipts(company_id,actor_id,idempotency_key,command,input_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[company,ids.subject,'internal-confirm','internal_assistant.confirm','BUSINESS_HASH',JSON.stringify({draftId:draft.id,requestId:request.id,entityIds:[businessId],sideEffectsExecuted:true})]);
   await tx.query("INSERT INTO outbox(id,company_id,type,data,status) VALUES($1,$2,'internal_assistant.confirmed',$3,'PENDING')",[randomUUID(),company,JSON.stringify({requestId:request.id,draftId:draft.id,command:`${kind}.create`,entityIds:[businessId]})]);
  });
  const retainedKinds=['message','message_version','translation','conversation_input','internal_assistant_request','internal_assistant_draft',kind],sql='SELECT kind,id,version,data FROM aggregates WHERE company_id=$1 AND kind=ANY($2::text[]) ORDER BY kind,id',revisionSql='SELECT kind,id,version,data,actor_id,created_at FROM aggregate_revisions WHERE company_id=$1 AND kind=ANY($2::text[]) ORDER BY kind,id,version';
  const original=(await db.query(sql,[company,retainedKinds])).rows,originalHistory=(await db.query(revisionSql,[company,retainedKinds])).rows,receiptSql="SELECT command,input_hash,result FROM command_receipts WHERE company_id=$1 AND command='internal_assistant.confirm'",eventSql="SELECT type,data,status FROM outbox WHERE company_id=$1 AND type='internal_assistant.confirmed'",receipt=(await db.query(receiptSql,[company])).rows,event=(await db.query(eventSql,[company])).rows;
  const p=await preview();expect(p.retained).toContainEqual(expect.objectContaining({id:ids.message,reason:'BUSINESS_RECORD_LINK_REQUIRES_REVIEW'}));expect(p.retained).toContainEqual(expect.objectContaining({id:ids.raw,reason:'BUSINESS_RECORD_LINK_REQUIRES_REVIEW'}));expect(await confirm(p)).toMatchObject({liveSourceStatus:'PARTIALLY_PURGED_LIVE_SCOPE',requestFulfilled:false});
  expect((await db.query(sql,[company,retainedKinds])).rows).toEqual(original);expect((await db.query(revisionSql,[company,retainedKinds])).rows).toEqual(originalHistory);expect((await db.query(receiptSql,[company])).rows).toEqual(receipt);expect((await db.query(eventSql,[company])).rows).toEqual(event);
 });
 it('retains report-linked photographs and their immutable revisions and bytes, allowing only eligible chat purge',async()=>{
  await add('report_version',{immutable:true,publishedAt:new Date().toISOString(),snapshot:{photos:[{mediaId:ids.media,blobKey:blob}]}});const p=await preview();expect(p.retained.some((r:Data)=>r.id===ids.media)).toBe(true);const result=await confirm(p);expect(result.liveSourceStatus).toBe('PARTIALLY_PURGED_LIVE_SCOPE');expect((await storage.get(company,blob)).sha256).toBe(sha);expect((await db.transaction(company,'QA',tx=>tx.get('media_asset',ids.media))).data.caption).toBe(canary);
 });
 it('blocks changed blob checksums and rolls all source and history redactions back',async()=>{
  const p=await preview();await db.query('UPDATE media_blobs SET sha256=$1 WHERE company_id=$2 AND id=$3',['a'.repeat(64),company,blob]);await expect(confirm(p)).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect((await db.transaction(company,'QA',tx=>tx.get('message',ids.message))).data.text).toBe(canary);expect(JSON.stringify((await db.query('SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2',[company,'message'])).rows)).toContain(canary);
 });
 it('never permits ordinary revision or audit updates/deletes, including after valid redaction',async()=>{
  const p=await preview();await confirm(p);for(const statement of ["UPDATE aggregate_revisions SET data='{}' WHERE company_id=$1 AND kind='message'","DELETE FROM aggregate_revisions WHERE company_id=$1 AND kind='message'","UPDATE audit_log SET detail='{}' WHERE company_id=$1","DELETE FROM audit_log WHERE company_id=$1"])await expect(db.query(statement,[company])).rejects.toThrow('immutable business history');
 });
 it('cannot use another company plan and does not erase matching aggregate IDs in that company',async()=>{
  const otherCompany=`privacy-other-${randomUUID()}`;await db.transaction(otherCompany,'QA',tx=>tx.add('message',{author_id:ids.subject,text:canary},ids.message));const p=await preview();await expect(confirm(p,{...ownerB,companyId:otherCompany})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});await confirm(p);expect((await db.transaction(otherCompany,'QA',tx=>tx.get('message',ids.message))).data.text).toBe(canary);
 });
 it('cannot commit an unconsumed exact permit or mutate immutable identity/actor/time through a permit',async()=>{
  const p=await preview();await expect(db.transaction(company,ids.ownerB,async tx=>{
   const row=await tx.get('privacy_erasure_plan',p.planId),plan=row.data.plan,action=plan.actions.find((a:Data)=>a.type==='REDACT_REVISION'&&a.kind==='message');await tx.save(row,{...row.data,state:'EXECUTING',confirmedBy:ids.ownerB,confirmationMfaVerified:true});const old=(await tx.query('SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3 AND version=$4',[company,action.kind,action.id,action.version])).rows[0].data;
   await tx.query('SELECT knaba_permit_privacy_revision($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[company,ids.request,p.planHash,action.kind,action.id,action.version,JSON.stringify(old),JSON.stringify(action.replacement)]);
  })).rejects.toThrow('PRIVACY_REVISION_PERMIT_UNCONSUMED');
  await expect(db.transaction(company,ids.ownerB,async tx=>{
   const row=await tx.get('privacy_erasure_plan',p.planId),action=row.data.plan.actions.find((a:Data)=>a.type==='REDACT_REVISION'&&a.kind==='message');await tx.save(row,{...row.data,state:'EXECUTING',confirmedBy:ids.ownerB,confirmationMfaVerified:true});const old=(await tx.query('SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3 AND version=$4',[company,action.kind,action.id,action.version])).rows[0].data;await tx.query('SELECT knaba_permit_privacy_revision($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[company,ids.request,p.planHash,action.kind,action.id,action.version,JSON.stringify(old),JSON.stringify(action.replacement)]);await tx.query('UPDATE aggregate_revisions SET data=$1,actor_id=$2 WHERE company_id=$3 AND kind=$4 AND id=$5 AND version=$6',[JSON.stringify(action.replacement),'forged-actor',company,action.kind,action.id,action.version]);
  })).rejects.toThrow('immutable business history');
 });
 it('queues S3 deletion durably, reports pending honestly, and verifies provider absence before live-source success',async()=>{
  const objects=new Map([[blob,bytes],[clientBlob,bytes]]);const s3:PrivateBlobStore={provider:'S3',identity:sha,put:async()=>{throw new Error('unused');},probe:async()=>({provider:'S3',available:true,configured:true}),get:async(c,id)=>{if(c!==company||!objects.has(id))throw new DomainError('NOT_FOUND_SAFE');return {id,companyId:c,ownerId:ids.subject,bytes:objects.get(id)!,sha256:sha,mimeType:'image/jpeg',provider:'S3'};},delete:async(c,id)=>{if(c===company)objects.delete(id);}};
  engine.registry={...engine.registry,...createPrivacyErasureCommands(db,engine,s3)};const p=await preview(),result=await confirm(p);expect(result.sourceDataDeleted).toBe(false);expect(result.liveSourceStatus).toBe('PENDING_EXTERNAL_BLOB_DELETION');expect(objects.size).toBe(2);
  const jobs=(await db.query("SELECT company_id,data FROM outbox WHERE company_id=$1 AND type='privacy.blob_delete'",[company])).rows;expect(jobs).toHaveLength(2);for(const job of jobs)await processPrivacyBlobDeletion(db,engine,s3,job);expect(objects.size).toBe(0);expect((await db.transaction(company,'QA',tx=>tx.get('privacy_request',ids.request))).data.sourceDataDeleted).toBe(true);await processPrivacyBlobDeletion(db,engine,s3,jobs[0]);
 });
 it('keeps durable deletion pending when S3 reports bytes present after deletion',async()=>{
  const s3:PrivateBlobStore={provider:'S3',identity:sha,put:async()=>{throw new Error('unused');},probe:async()=>({provider:'S3',available:true,configured:true}),get:async(c,id)=>({id,companyId:c,ownerId:ids.subject,bytes,sha256:sha,mimeType:'image/jpeg',provider:'S3'}),delete:async()=>{}};
  engine.registry={...engine.registry,...createPrivacyErasureCommands(db,engine,s3)};const p=await preview();await confirm(p);const job=(await db.query("SELECT company_id,data FROM outbox WHERE company_id=$1 AND type='privacy.blob_delete' LIMIT 1",[company])).rows[0];await expect(processPrivacyBlobDeletion(db,engine,s3,job)).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});expect((await db.transaction(company,'QA',tx=>tx.get('privacy_request',ids.request))).data.sourceDataDeleted).toBe(false);expect((await db.query('SELECT status FROM privacy_blob_deletions WHERE company_id=$1',[company])).rows.every(r=>r.status==='PENDING')).toBe(true);
 });
 it('refuses a durable S3 retry after provider namespace changes, even if the new bucket reports NOT_FOUND',async()=>{
  let calls=0;const s3:PrivateBlobStore={provider:'S3',identity:sha,put:async()=>{throw new Error('unused');},probe:async()=>({provider:'S3',available:true,configured:true}),get:async()=>{calls++;throw new DomainError('NOT_FOUND_SAFE');},delete:async()=>{calls++;}};
  engine.registry={...engine.registry,...createPrivacyErasureCommands(db,engine,s3)};const p=await preview();await confirm(p);const job=(await db.query("SELECT company_id,data FROM outbox WHERE company_id=$1 AND type='privacy.blob_delete' LIMIT 1",[company])).rows[0];await expect(processPrivacyBlobDeletion(db,engine,{...s3,identity:'b'.repeat(64)},job)).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(calls).toBe(0);expect((await db.transaction(company,'QA',tx=>tx.get('privacy_request',ids.request))).data.sourceDataDeleted).toBe(false);
 });
 it('retains running processor content until actual quiescence instead of claiming cancellation stops cached network I/O',async()=>{
  await db.query("UPDATE outbox SET status='RUNNING' WHERE company_id=$1 AND type='message.created'",[company]);const p=await preview();expect(p.retained.some((r:Data)=>r.id===ids.message&&r.reason==='IN_FLIGHT_PROCESSOR_REQUIRES_QUIESCENCE')).toBe(true);const result=await confirm(p);expect(result).toMatchObject({liveSourceStatus:'AWAITING_QUIESCENCE',sourceDataDeleted:false,requestFulfilled:false});expect((await db.transaction(company,'QA',tx=>tx.get('privacy_request',ids.request))).data).toMatchObject({state:'AWAITING_ERASURE_EXECUTION',liveSourceStatus:'AWAITING_QUIESCENCE',sourceDataDeleted:false});expect((await db.transaction(company,'QA',tx=>tx.get('message',ids.message))).data.text).toBe(canary);expect((await db.query("SELECT status FROM outbox WHERE company_id=$1 AND type='message.created'",[company])).rows[0].status).toBe('RUNNING');
  await db.query("UPDATE outbox SET status='SUCCEEDED',lease_token=NULL,leased_until=NULL WHERE company_id=$1 AND type='message.created'",[company]);await expect(confirm(p)).rejects.toMatchObject({code:'INVALID_STATE'});const fresh=await preview();expect(fresh.planHash).not.toBe(p.planHash);const completed=await confirm(fresh);expect(completed).toMatchObject({sourceDataDeleted:true,liveSourceStatus:'PURGED_PLANNED_LIVE_SCOPE',requestFulfilled:false});expect((await db.transaction(company,'QA',tx=>tx.get('message',ids.message))).data.text).toBe('');
 });
 it('keeps an empty chat-only execution retryable while processing is live, requiring fresh preview after terminal state',async()=>{
  await db.transaction(company,'QA',async tx=>{const request=await tx.get('privacy_request',ids.request);await tx.save(request,{...request.data,categories:['MESSAGES']});});await db.query("UPDATE outbox SET status='RUNNING' WHERE company_id=$1 AND type='message.created'",[company]);const p=await preview();expect(p.actionCounts).toEqual({});expect(await confirm(p)).toMatchObject({sourceDataDeleted:false,liveSourceStatus:'AWAITING_QUIESCENCE'});expect((await storage.get(company,blob)).sha256).toBe(sha);await db.query("UPDATE outbox SET status='FAILED' WHERE company_id=$1 AND type='message.created'",[company]);const fresh=await preview();await expect(confirm({...fresh,planHash:p.planHash})).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect((await confirm(fresh)).sourceDataDeleted).toBe(true);
 });
 it('preserves the old S3 journal binding while held chat waits, then allows a fresh remaining-scope preview',async()=>{
  await db.query("UPDATE outbox SET status='RUNNING' WHERE company_id=$1 AND type='message.created'",[company]);const objects=new Map([[blob,bytes],[clientBlob,bytes]]);const s3:PrivateBlobStore={provider:'S3',identity:sha,put:async()=>{throw new Error('unused');},probe:async()=>({provider:'S3',available:true,configured:true}),get:async(c,id)=>{if(c!==company||!objects.has(id))throw new DomainError('NOT_FOUND_SAFE');return {id,companyId:c,ownerId:ids.subject,bytes:objects.get(id)!,sha256:sha,mimeType:'image/jpeg',provider:'S3'};},delete:async(c,id)=>{if(c===company)objects.delete(id);}};engine.registry={...engine.registry,...createPrivacyErasureCommands(db,engine,s3)};
  const p=await preview();expect(await confirm(p)).toMatchObject({sourceDataDeleted:false,liveSourceStatus:'AWAITING_QUIESCENCE',pendingBlobDeletion:true});await expect(preview()).rejects.toMatchObject({code:'NEEDS_APPROVAL',details:{reason:'PENDING_PRIOR_SOURCE_BLOB_VERIFICATION'}});const jobs=(await db.query("SELECT company_id,data FROM outbox WHERE company_id=$1 AND type='privacy.blob_delete'",[company])).rows;for(const job of jobs)await processPrivacyBlobDeletion(db,engine,s3,job);expect(objects.size).toBe(0);expect((await db.transaction(company,'QA',tx=>tx.get('privacy_request',ids.request))).data).toMatchObject({state:'AWAITING_ERASURE_EXECUTION',liveSourceStatus:'AWAITING_QUIESCENCE',sourceDataDeleted:false,pendingBlobDeletion:false});
  await db.query("UPDATE outbox SET status='SUCCEEDED' WHERE company_id=$1 AND type='message.created'",[company]);const fresh=await preview();expect(fresh.planHash).not.toBe(p.planHash);expect(await confirm(fresh)).toMatchObject({sourceDataDeleted:true,liveSourceStatus:'PURGED_PLANNED_LIVE_SCOPE'});
 });
});
