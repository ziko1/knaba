import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {hashPassword,hashToken,csrfFor} from '../apps/api/auth.ts';
import {commandHash} from '../apps/api/engine.ts';
import {type Data} from '../packages/domain/core.ts';
import {createFederationLoginPgFixture,responseCookie,syntheticLoginPassword} from './fixtures/site-federation-login-pg.ts';

// Genuine PostgreSQL + actual Nest HTTP/AuthService/Engine. The reused F3 source
// introspection fixture is synthetic; this suite is not a VPS/live/privacy-law gate.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const v1='knaba-dsar-v1',v2='knaba-dsar-v2',reason='Synthetic own metadata acceptance';
const h=(value:string)=>createHash('sha256').update(value).digest('hex');
const uuid=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

postgres('privacy v2 actual PostgreSQL ownership, atomic artifacts and HTTP authority',()=>{
 let db:Database,passwordHash:string;const cleanup:Array<()=>Promise<void>>=[];
 beforeAll(async()=>{expect(process.env.APP_MODE).toBe('TEST');db=new Database();await db.migrate();passwordHash=await hashPassword(syntheticLoginPassword);});
 afterEach(async()=>{vi.restoreAllMocks();await Promise.all(cleanup.splice(0).map(fn=>fn()));});afterAll(async()=>{await db?.close();});
 async function fixture(){
  const f=await createFederationLoginPgFixture(db,passwordHash,cleanup);
  await db.transaction(f.company,'PRIVACY_SYNTHETIC_SETUP',async tx=>{
   await tx.add('user',{active:true,name:'Synthetic privacy reviewer',roles:['BOT_ADMIN'],permissions:['identity.self','privacy.review'],siteIds:[],warehouseIds:[],customerIds:[]},'privacy-reviewer');
   for(const version of [v1,v2])await tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'synthetic-approved-metadata-scope',approvedAt:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+3_600_000).toISOString(),scope:{projectionVersion:version,exportCategories:['PROFILE','TIME']}},version);
  });
  const sessions={own:await f.auth.createSession('erp-user'),reviewer:await f.auth.createSession('privacy-reviewer',false,true),other:await f.auth.createSession('erp-other')};
  return {...f,sessions};
 }
 type Fixture=Awaited<ReturnType<typeof fixture>>;
 const post=(f:Fixture,name:string,input:Data,key:string=randomUUID(),who:keyof Fixture['sessions']='own')=>f.web('/api/v1/commands/'+name,{input,idempotency_key:key},'knaba_session='+f.sessions[who].token,f.sessions[who].csrfToken);
 async function good(response:Promise<Response>|Response){const res=await response;expect(res.status).toBe(201);return res.json();}
 async function approved(f:Fixture,version:string|undefined=v2,categories=['PROFILE']){
  const request=await good(post(f,'privacy.request',{type:'ACCESS',categories,reason,...(version!==undefined?{projectionVersion:version}:{})}));
  return good(post(f,'privacy.review',{requestId:request.id,decision:'APPROVE_EXPORT',legalApprovalId:version??v1,evidenceReference:'synthetic-review-approved',reason},randomUUID(),'reviewer'));
 }
 const get=(f:Fixture,kind:string,id:string)=>db.transaction(f.company,'PRIVACY_SYNTHETIC_ASSERT',tx=>tx.get(kind,id));
 const download=(f:Fixture,id:string,token=f.sessions.own.token)=>f.web('/api/v1/privacy/exports/'+id+'/download',undefined,'knaba_session='+token);
 async function artifactCount(f:Fixture){return Number((await db.query("SELECT count(*)::int AS n FROM aggregates WHERE company_id=$1 AND kind='privacy_export'",[f.company])).rows[0].n);}
 async function effectCounts(f:Fixture,key:string){return {artifacts:await artifactCount(f),events:Number((await db.query("SELECT count(*)::int AS n FROM outbox WHERE company_id=$1 AND type='privacy.export_prepared'",[f.company])).rows[0].n),receipts:Number((await db.query('SELECT count(*)::int AS n FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',[f.company,'erp-user',key])).rows[0].n)};}
 async function proofSnapshot(f:Fixture){const result:Record<string,string>={};for(const table of ['site_identity_bindings','site_identity_link_challenges','site_federation_authorities','site_federation_principals','site_federation_sessions','site_federation_login_requests','site_federation_session_authorities','site_federation_operations','site_federation_nonces']){const rows=(await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE company_id=$1 ORDER BY to_jsonb(t)::text COLLATE "C"`,[f.company])).rows;result[table]=h(JSON.stringify(rows));}return result;}
 async function seedChallenge(f:Fixture,state:'CLAIMED'|'CONFIRMED',user='erp-user',bindingId:string|null=null){
  const id=randomUUID(),created=new Date(Date.now()-30_000).toISOString(),expires=new Date(Date.now()+120_000).toISOString();
  await db.query(`INSERT INTO site_identity_link_challenges(company_id,id,authority_id,user_id,session_hash,code_hash,credential_fingerprint,config_fingerprint,state,created_at,expires_at,source_subject,source_session_ref,source_epoch,source_security_fingerprint,source_policy_version,source_generation,source_reauth_at,site_label,binding_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,$14,1,1,$10,$15,$16)`,[f.company,id,f.config.authorityId,user,h('PRIVATE_SESSION_CANARY'),h(id),h('PRIVATE_CREDENTIAL_CANARY'),h('PRIVATE_CONFIG_CANARY'),state,created,expires,state==='CONFIRMED'?f.source.subject:'UNCONFIRMED_OTHER_SUBJECT_CANARY',f.source.sessionRef,h('PRIVATE_SOURCE_CANARY'),'UNCONFIRMED_SITE_LABEL_CANARY',bindingId]);return id;
 }
 async function seedLogin(f:Fixture,source:Data|null,request:Data={},id:string=randomUUID()){
  const created=new Date(Date.now()-30_000).toISOString(),expires=new Date(Date.now()+120_000).toISOString();
  await db.query(`INSERT INTO site_federation_login_requests(company_id,id,start_key_hash,input_hash,authority_id,request_binding,request_data,source_data,state,created_at,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[f.company,id,h('start-'+id),h('input-'+id),f.config.authorityId,h('binding-'+id),JSON.stringify({clientId:'web',clientKind:'WEB',platform:'WEB',clientLabel:'Synthetic history',parentSessionHash:hashToken(f.sessions.own.token),pkceChallenge:'PKCE_CHALLENGE_CANARY',...request}),source===null?null:JSON.stringify(source),source===null?'CREATED':'CANCELLED',created,expires]);return id;
 }
 const ownSource=(f:Fixture)=>({userId:'erp-user',bindingId:f.binding.id,subject:f.source.subject,sessionRef:f.source.sessionRef,securityFingerprint:h('PRIVATE_SECURITY_CANARY')});

 it('exports own revoked F1/F2/F3 history without secrets and leaves all proof/replay/tombstone rows unchanged',async()=>{
  const f=await fixture(),pending=await f.prepare(),confirmed=await f.confirm(pending);expect(confirmed.status).toBe(200);const childToken=responseCookie(confirmed,'knaba_session')!;
  expect((await f.web('/api/v1/auth/logout',{},'knaba_session='+childToken,csrfFor(childToken))).status).toBe(201);
  const storedSourceSession=async()=>(await db.query(`SELECT state,version,epoch,expires_at AS "expiresAt",expires_at>clock_timestamp() AS unexpired
   FROM site_federation_sessions WHERE company_id=$1 AND authority_id=$2 AND subject=$3 AND session_ref=$4`,[f.company,f.config.authorityId,f.source.subject,f.source.sessionRef])).rows;
  const sourceBeforeFence=await storedSourceSession();expect(sourceBeforeFence).toHaveLength(1);
  expect(sourceBeforeFence[0]).toMatchObject({state:'ACTIVE',version:1,epoch:1,unexpired:true});expect(sourceBeforeFence[0].expiresAt.toISOString()).toBe(f.source.sessionExpiresAt);
  const confirmedLink=await seedChallenge(f,'CONFIRMED','erp-user',f.binding.id),claimedLink=await seedChallenge(f,'CLAIMED');
  expect((await f.authority('FENCE',{subject:f.source.subject,scope:'PRINCIPAL',throughEpoch:1,nextEpoch:2,intentHash:h('privacy-fixture-fence')})).status).toBe(200);
  // Principal high-water fencing denies current authority without rewriting stored session facts.
  expect(await storedSourceSession()).toEqual(sourceBeforeFence);
  expect((await f.fence()).status).toBe(200);
  expect(await storedSourceSession()).toEqual([{...sourceBeforeFence[0],state:'REVOKED',version:2}]);
  await db.transaction(f.company,'erp-user',tx=>f.bindings.revokeIn(tx,f.binding.id,1));
  const anonymous=await seedLogin(f,null),request=await approved(f),before=await proofSnapshot(f),sourceCalls=f.source.calls;
  const auditBefore=(await db.query('SELECT id,actor_id,action,detail,created_at FROM audit_log WHERE company_id=$1 ORDER BY id',[f.company])).rows;
  const ack=await good(post(f,'privacy.export',{requestId:request.id})),artifact=await get(f,'privacy_export',ack.exportId),m=artifact.data.snapshot.federationMetadata;
  expect(ack.projectionVersion).toBe(v2);expect(m.bindings).toHaveLength(1);expect(m.bindings[0]).toMatchObject({bindingId:f.binding.id,sourceSubject:f.source.subject,storedStatus:'REVOKED',version:2});
  expect(m.linkAttempts.map((r:Data)=>r.attemptId).sort()).toEqual([confirmedLink,claimedLink].sort());expect(m.linkAttempts.find((r:Data)=>r.attemptId===claimedLink)).not.toHaveProperty('bindingId');
  expect(m.loginAttempts.map((r:Data)=>r.requestId)).toEqual([pending.id]);expect(m.derivedSessions).toHaveLength(1);expect(m.derivedSessions[0]).toMatchObject({requestId:pending.id,storedState:'REVOKED'});
  expect(m.sourceSessionSummary[0].storedPrincipalState).toBe('FENCED');expect(m.sourceSessionSummary[0].sessionCounts).toEqual({activeUnexpired:0,activeExpired:0,revokedUnexpired:1,revokedExpired:0,revokedUnknownExpiry:0});
  const response=await download(f,ack.exportId);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('content-type')).toContain('application/json');
  const bytes=Buffer.from(await response.arrayBuffer()),json=bytes.toString();expect(h(json)).toBe(ack.sha256);expect(bytes.length).toBe(ack.byteSize);
  for(const secret of [childToken,childToken.slice(4),f.sessions.own.token,hashToken(f.sessions.own.token),f.source.sessionRef,f.source.securityFingerprint,anonymous,'CANARY',h('PRIVATE_CREDENTIAL_CANARY'),h('PRIVATE_CONFIG_CANARY')])expect(json).not.toContain(secret);
  expect(JSON.parse(json).fullLegalDsarFulfillment).toBe(false);expect(JSON.parse(json).companyId).toBe(f.company);expect(m.retentionDispositions.every((r:Data)=>r.deletionEligible===false&&r.deletionExecuted===false)).toBe(true);
  expect(await proofSnapshot(f)).toEqual(before);expect(f.source.calls).toBe(sourceCalls);
  expect((await db.query('SELECT id,actor_id,action,detail,created_at FROM audit_log WHERE company_id=$1 AND id=ANY($2::bigint[]) ORDER BY id',[f.company,auditBefore.map(row=>row.id)])).rows).toEqual(auditBefore);
 });
 it('filters another user, same identifiers in another company, and same subject under a mismatched issuer/audience in SQL',async()=>{
  const f=await fixture(),foreign='privacy-foreign-'+randomUUID(),foreignIssuer='https://other.example.invalid/identity';
  await db.transaction(foreign,'PRIVACY_SYNTHETIC_SETUP',async tx=>{await tx.add('user',{active:true,roles:['EMPLOYEE'],name:'FOREIGN_TENANT_CANARY'},'erp-user');});
  await db.query(`INSERT INTO site_identity_bindings(company_id,id,issuer,audience,subject,site_user_id,user_id,trust_version,trust_fingerprint,proof_reference,status,version,created_by)
   SELECT $2,id,issuer,audience,subject,site_user_id,user_id,trust_version,trust_fingerprint,proof_reference,status,version,created_by FROM site_identity_bindings WHERE company_id=$1`,[f.company,foreign]);
  await db.query(`INSERT INTO site_identity_bindings(company_id,id,issuer,audience,subject,site_user_id,user_id,trust_version,trust_fingerprint,proof_reference,status,version,created_by)
   VALUES($1,$2,$3,$4,$5,$5,'erp-other',1,$6,$7,'ACTIVE',1,'erp-other')`,[f.company,uuid(31),f.config.issuer,f.config.erpAudience,'OTHER_USER_SUBJECT_CANARY',h('other-trust'),h('other-proof')]);
  await db.query(`INSERT INTO site_identity_bindings(company_id,id,issuer,audience,subject,site_user_id,user_id,trust_version,trust_fingerprint,proof_reference,status,version,created_by)
   VALUES($1,$2,$3,'historical-audience',$4,$4,'erp-user',1,$5,$6,'ACTIVE',1,'erp-user')`,[f.company,uuid(32),foreignIssuer,f.source.subject,h('old-trust'),h('old-proof')]);
  await db.query(`INSERT INTO site_federation_authorities(company_id,authority_id,issuer,audience,config_fingerprint,policy_version,generation,revision,phase,instance_id)
   VALUES($1,'other-authority',$2,'different-audience',$3,1,1,1,'ACTIVE',$4)`,[f.company,foreignIssuer,h('other-config'),randomUUID()]);
  await db.query(`INSERT INTO site_federation_sessions(company_id,authority_id,subject,session_ref,state,version) VALUES($1,'other-authority',$2,$3,'REVOKED',1)`,[f.company,f.source.subject,'x'.repeat(43)]);
  await seedChallenge(f,'CLAIMED','erp-other');await seedLogin(f,{userId:'erp-other',bindingId:uuid(31),subject:'OTHER_USER_SUBJECT_CANARY'});
  const request=await approved(f),ack=await good(post(f,'privacy.export',{requestId:request.id})),m=(await get(f,'privacy_export',ack.exportId)).data.snapshot.federationMetadata;
  expect(m.bindings.map((r:Data)=>r.bindingId).sort()).toEqual([f.binding.id,uuid(32)].sort());expect(m.linkAttempts).toEqual([]);expect(m.loginAttempts).toEqual([]);expect(m.sourceSessionSummary).toHaveLength(1);expect(m.sourceSessionSummary[0].bindingId).toBe(f.binding.id);
  const json=JSON.stringify(m);expect(json).not.toContain('OTHER_USER_SUBJECT_CANARY');expect(json).not.toContain(foreign);expect(json).not.toContain('other-authority');
 });
 it('accepts exactly 25000 source records across all groups before aggregation and rolls back 25001 without a receipt',async()=>{
  const f=await fixture();await db.query(`INSERT INTO site_federation_sessions(company_id,authority_id,subject,session_ref,state,version)
   SELECT $1,$2,$3,lpad(to_hex(n),43,'0'),'REVOKED',1 FROM generate_series(1,24997) n`,[f.company,f.config.authorityId,f.source.subject]);
  const request=await approved(f),ack=await good(post(f,'privacy.export',{requestId:request.id})),m=(await get(f,'privacy_export',ack.exportId)).data.snapshot.federationMetadata;
  expect(m.retentionDispositions.filter((r:Data)=>r.recordClass!=='PRIVACY_EXPORT').reduce((n:number,r:Data)=>n+r.recordCount,0)).toBe(25000);
  expect(m.sourceSessionSummary[0].sessionCounts.revokedUnknownExpiry).toBe(24997);
  await db.query(`INSERT INTO site_federation_sessions(company_id,authority_id,subject,session_ref,state,version) VALUES($1,$2,$3,$4,'REVOKED',1)`,[f.company,f.config.authorityId,f.source.subject,'z'.repeat(43)]);
  const second=await approved(f),key=randomUUID(),before=await effectCounts(f,key),rejected=await post(f,'privacy.export',{requestId:second.id},key);expect(rejected.ok).toBe(false);expect(await rejected.json()).toMatchObject({code:'INVALID_STATE',details:{reason:'PRIVACY_FEDERATION_RECORD_LIMIT_EXCEEDED'}});expect(await effectCounts(f,key)).toEqual(before);
 });
 it.each(['foreign-binding','bad-client','bad-confirmed-link'])('fails closed for attributable malformed metadata %s without partial artifact/event/receipt',async(kind)=>{
  const f=await fixture();if(kind==='bad-confirmed-link')await seedChallenge(f,'CONFIRMED','erp-user',randomUUID());else await seedLogin(f,{...ownSource(f),...(kind==='foreign-binding'?{bindingId:randomUUID()}:{})},kind==='bad-client'?{clientId:123}:{});
  const request=await approved(f),key=randomUUID(),before=await effectCounts(f,key),response=await post(f,'privacy.export',{requestId:request.id},key);expect(response.ok).toBe(false);expect(await response.json()).toMatchObject({code:'INVALID_STATE',details:{reason:'PRIVACY_FEDERATION_METADATA_INVALID'}});expect(await effectCounts(f,key)).toEqual(before);
 });
 it('keeps v1 receipt digests/ACK shape and bytes while unknown-ACK retries return one existing immutable artifact',async()=>{
  const f=await fixture(),input={type:'ACCESS',categories:['PROFILE'],reason},requestKey=randomUUID(),request=await good(post(f,'privacy.request',input,requestKey));
  const catalog=await f.web('/api/v1/commands',undefined,'knaba_session='+f.sessions.own.token);expect(catalog.status).toBe(200);const schema=(await catalog.json()).items.find((item:Data)=>item.name==='privacy.request').schema;
  expect(schema.properties.projectionVersion.enum).toEqual([v1,v2]);expect(schema.properties.projectionVersion).not.toHaveProperty('default');expect(schema.required).not.toContain('projectionVersion');
  expect(request.data).not.toHaveProperty('projectionVersion');const receipt=(await db.query('SELECT * FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',[f.company,'erp-user',requestKey])).rows[0];expect(receipt.input_hash).toBe(commandHash('privacy.request',input));expect(receipt.result).toEqual(request);
  expect(await good(post(f,'privacy.request',input,requestKey))).toEqual(request);
  const changed=await post(f,'privacy.request',{...input,projectionVersion:v2},requestKey);expect(await changed.json()).toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  const changedCategories=await post(f,'privacy.request',{...input,categories:['TIME']},requestKey);expect(await changedCategories.json()).toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await good(post(f,'privacy.review',{requestId:request.id,decision:'APPROVE_EXPORT',legalApprovalId:v1,evidenceReference:'synthetic-v1-review',reason},randomUUID(),'reviewer'));
  const key=randomUUID(),unobserved=await post(f,'privacy.export',{requestId:request.id},key);expect(unobserved.status).toBe(201);await unobserved.body?.cancel();
  const saved=(await db.query('SELECT result,input_hash FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',[f.company,'erp-user',key])).rows[0],ack=await good(post(f,'privacy.export',{requestId:request.id},key));
  expect(ack).toEqual(saved.result);expect(saved.input_hash).toBe(commandHash('privacy.export',{requestId:request.id}));expect(Object.keys(ack).sort()).toEqual(['exportId','fileName','sha256','byteSize','status','securedDownloadRequired'].sort());expect(await effectCounts(f,key)).toEqual({artifacts:1,events:1,receipts:1});
  const first=await download(f,ack.exportId),bytes=Buffer.from(await first.arrayBuffer());expect(first.status).toBe(200);expect(h(bytes.toString())).toBe(ack.sha256);expect(JSON.parse(bytes.toString())).not.toHaveProperty('federationMetadata');expect(JSON.parse(bytes.toString())).not.toHaveProperty('companyId');
  const duplicate=await post(f,'privacy.export',{requestId:request.id});expect(await duplicate.json()).toMatchObject({code:'DUPLICATE_EFFECT'});expect(await artifactCount(f)).toBe(1);
  await db.transaction(f.company,'PRIVACY_SYNTHETIC_REVOKE',async tx=>{const legal=await tx.get('legal_approval',v1);await tx.save(legal,{...legal.data,active:false});});
  const retained=await download(f,ack.exportId);expect(retained.status).toBe(200);expect(Buffer.from(await retained.arrayBuffer())).toEqual(bytes);
 });
 it('replays an unknown v2 acknowledgement with identical artifact/checksum and never regenerates its snapshot',async()=>{
  const f=await fixture(),request=await approved(f),key=randomUUID(),first=await post(f,'privacy.export',{requestId:request.id},key);expect(first.status).toBe(201);await first.body?.cancel();
  const row=(await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='privacy_export'",[f.company])).rows[0];
  await seedChallenge(f,'CLAIMED');const ack=await good(post(f,'privacy.export',{requestId:request.id},key));expect(ack).toMatchObject({exportId:row.id,sha256:row.data.sha256,byteSize:row.data.byteSize,projectionVersion:v2});expect((await get(f,'privacy_export',ack.exportId)).data).toEqual(row.data);expect(await effectCounts(f,key)).toEqual({artifacts:1,events:1,receipts:1});
 });
 it.each(['expired','revoked','wrong-version','wrong-category'])('rechecks current legal %s scope before any export effect',async(change)=>{
  const f=await fixture(),request=await approved(f),key=randomUUID();await db.transaction(f.company,'PRIVACY_SYNTHETIC_POLICY_CHANGE',async tx=>{const legal=await tx.get('legal_approval',v2);await tx.save(legal,{...legal.data,...(change==='expired'?{expiresAt:new Date(Date.now()-1).toISOString()}:{}),...(change==='revoked'?{active:false}:{}),scope:{...legal.data.scope,...(change==='wrong-version'?{projectionVersion:v1}:{}),...(change==='wrong-category'?{exportCategories:['TIME']}: {})}});});
  const response=await post(f,'privacy.export',{requestId:request.id},key);expect(response.ok).toBe(false);expect(await response.json()).toMatchObject({code:'NEEDS_APPROVAL'});expect(await effectCounts(f,key)).toEqual({artifacts:0,events:0,receipts:0});
 });
 it('never loads malformed federation metadata for v2 without PROFILE',async()=>{
  const f=await fixture();await seedLogin(f,{...ownSource(f),bindingId:randomUUID()});const request=await approved(f,v2,['TIME']),ack=await good(post(f,'privacy.export',{requestId:request.id}));expect(ack.projectionVersion).toBe(v2);const artifact=await get(f,'privacy_export',ack.exportId);expect(artifact.data.snapshot).toMatchObject({companyId:f.company,categories:['TIME'],time:[]});expect(artifact.data.snapshot).not.toHaveProperty('federationMetadata');
 });
 it('denies another current user or tenant download and exposes no private attachment headers',async()=>{
  const f=await fixture(),request=await approved(f),ack=await good(post(f,'privacy.export',{requestId:request.id}));
  for(const token of [f.sessions.other.token,randomBytes(32).toString('base64url')]){const response=await download(f,ack.exportId,token);expect(response.ok).toBe(false);expect(response.headers.get('content-disposition')).toBeNull();expect(await response.text()).not.toContain(f.source.subject);}
  const foreign=await fixture(),response=await download(foreign,ack.exportId);expect(response.ok).toBe(false);expect(response.headers.get('content-disposition')).toBeNull();expect(await response.text()).not.toContain(f.source.subject);
 });
 it('closes an actual HTTP download when its exact original session is revoked after the private read commits',async()=>{
  const f=await fixture(),request=await approved(f),ack=await good(post(f,'privacy.export',{requestId:request.id})),original=db.transaction.bind(db);let mutationCommitted=false;
  vi.spyOn(db,'transaction').mockImplementation(async(...args:Parameters<Database['transaction']>)=>{
   const result:any=await original(...args);
   if(!mutationCommitted&&args[0]===f.company&&args[1]==='erp-user'&&Buffer.isBuffer(result?.result?.bytes)){
    await original(f.company,'PRIVACY_SYNTHETIC_REVOKE',async tx=>{await tx.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE company_id=$1 AND token_hash=$2',[f.company,hashToken(f.sessions.own.token)]);});mutationCommitted=true;
   }
   return result;
  });
  const response=await download(f,ack.exportId);expect(mutationCommitted).toBe(true);expect(response.status).toBe(401);expect(response.headers.get('content-disposition')).toBeNull();expect(response.headers.get('content-security-policy')).toBeNull();expect(await response.json()).toMatchObject({code:'NEEDS_REAUTH'});
  expect((await db.query('SELECT revoked_at FROM auth_sessions WHERE company_id=$1 AND token_hash=$2',[f.company,hashToken(f.sessions.own.token)])).rows[0].revoked_at).not.toBeNull();expect(await artifactCount(f)).toBe(1);
 });
});
