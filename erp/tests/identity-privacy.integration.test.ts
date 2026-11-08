import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {Database,type PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {createPrivacyExportCommand,privacyExportBytes,PRIVACY_PROJECTION_VERSION,PRIVACY_IDENTITY_PROJECTION_VERSION} from '../packages/domain/governance.ts';
import {IDENTITY_PRIVACY_MAX_RECORDS,type IdentityPrivacySnapshot} from '../packages/domain/identity-privacy.ts';
import type {Actor,Data} from '../packages/domain/core.ts';

// Real PostgreSQL, Engine dispatch, command receipts and private export bytes.
// Identity rows and recorded approvals are explicit synthetic fixtures, not
// evidence of a real legal review, identity-provider consent or session issuance.
if(process.env.CI&&!process.env.DATABASE_URL)throw new Error('IDENTITY_PRIVACY_POSTGRES_REQUIRED_IN_CI');
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const V1=PRIVACY_PROJECTION_VERSION,V2=PRIVACY_IDENTITY_PROJECTION_VERSION;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const ids={subject:'privacy-subject',other:'privacy-other',reviewer:'privacy-reviewer',v1:'privacy-legal-v1',v2:'privacy-legal-v2'};
const identityTables=['site_identity_bindings','site_auth_sessions','site_identity_challenges'] as const;
type IdentityTable=typeof identityTables[number];
// Table and column identifiers are fixture literals; all data is parameterized.
async function insertFixture(tx:PgTransaction,table:IdentityTable,row:Data){
 const columns=Object.keys(row);
 await tx.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_,index)=>`$${index+1}`).join(',')})`,Object.values(row));
}
const ordered=<T extends {id:string;createdAt:string}>(rows:T[])=>rows.sort((a,b)=>a.createdAt<b.createdAt?-1:a.createdAt>b.createdAt?1:a.id<b.id?-1:a.id>b.id?1:0);

postgres('versioned self identity exports (real PostgreSQL and Engine)',()=>{
 let db:Database,engine:Engine,company:string,foreignCompany:string,subject:Actor,other:Actor,reviewer:Actor,foreignSubject:Actor;
 const call=(actor:Actor,name:string,input:Data,key=randomUUID())=>engine.execute(actor,name,{input,idempotency_key:key});
 const get=(kind:string,id:string)=>db.transaction(company,ids.subject,tx=>tx.get(kind,id));
 const edit=(kind:string,id:string,update:(data:Data)=>Data)=>db.transaction(company,'SYNTHETIC_IDENTITY_PRIVACY_EDIT',async tx=>{
  const current=await tx.get(kind,id);return tx.save(current,update(current.data));
 });
 const download=(exportId:string,actor=subject)=>db.transaction(actor.companyId,actor.userId,tx=>privacyExportBytes(tx,actor,exportId));
 async function fingerprint(companyId:string,tables:readonly string[]){
  const result:Data={};
  for(const table of tables)result[table]=(await db.query(`SELECT count(*)::int AS count,
   md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) AS hash
   FROM ${table} r WHERE company_id=$1`,[companyId])).rows[0];
  return result;
 }
 const effects=()=>fingerprint(company,['aggregates','aggregate_revisions','audit_log','outbox','command_receipts']);
 async function reviewed(version:string=V2,categories:string[]=['PROFILE']){
  const request=await call(subject,'privacy.request',{type:'ACCESS',categories,reason:'Synthetic own-data export acceptance'});
  expect(request.data.exportProjectionVersion).toBeUndefined();
  return call(reviewer,'privacy.review',{requestId:request.id,decision:'APPROVE_EXPORT',legalApprovalId:version===V1?ids.v1:ids.v2,
   evidenceReference:'SYNTHETIC_PRIVACY_REVIEW_ONLY',reason:'Synthetic recorded approval of the named projection'});
 }
 async function seedHistory(companyId:string,userId:string,tag:string){
  const now=Math.floor(Date.now()/1000)*1000,at=(offset:number)=>new Date(now+offset).toISOString();
  const issuer='https://site.identity-privacy.example.test',audience='synthetic-erp-privacy',principal=`synthetic-site-${tag}`;
  const oldId=randomUUID(),currentId=randomUUID(),expiredId=randomUUID(),consumedId=randomUUID();
  const oldSessionId=randomUUID(),currentSessionId=randomUUID();
  const proof={session:hash(companyId+tag+'session-secret'),security:hash(companyId+tag+'security-secret'),
   secret:hash(companyId+tag+'challenge-secret'),challenge:hash(companyId+tag+'challenge-digest'),nonce:hash(companyId+tag+'nonce-secret'),
   trust:hash(companyId+tag+'trust-secret'),transport:hash(companyId+tag+'transport-secret'),grant:hash(companyId+tag+'grant-secret'),
   profile:hash(companyId+tag+'profile-secret'),reference:hash(companyId+tag+'proof-secret')};
  const unconfirmedSubject=`SYNTHETIC_UNCONFIRMED_SUBJECT_${tag}`,unconfirmedEmail=`unconfirmed-${tag}@example.test`;
  const bindingBase={company_id:companyId,issuer,audience,subject:principal,site_user_id:principal,user_id:userId,
   trust_version:1,trust_fingerprint:proof.trust,proof_reference:proof.reference,status:'ACTIVE',version:1,created_by:userId};
  const old={id:oldId,createdAt:at(-172_800_000),expiresAt:at(-169_200_000),revokedAt:at(-86_400_000)};
  const current={id:currentId,createdAt:at(-30_000),expiresAt:null,revokedAt:null};
  const expired={id:expiredId,createdAt:at(-7_200_000),expiresAt:at(-3_600_000),revokedAt:null};
  const challengeBase={company_id:companyId,user_id:userId,session_hash:proof.session,security_fingerprint:proof.security,mfa_verified:false,
   secret_hash:proof.secret,challenge_digest:proof.challenge,nonce_digest:proof.nonce,issuer,audience,
   trust_fingerprint:proof.trust,transport_fingerprint:proof.transport};
  const preview={grant_digest:proof.grant,site_subject:principal,site_session_digest:proof.session,site_profile_version:1,
   site_profile_fingerprint:proof.profile,site_display_name:'SYNTHETIC_PRIVATE_SITE_PREVIEW',site_email:unconfirmedEmail,site_expires_at:at(180_000)};
  const challenges=[
   {id:consumedId,status:'CONSUMED' as const,createdAt:at(-90_000),expiresAt:at(210_000),completedAt:at(-30_000)},
   {id:randomUUID(),status:'OPEN' as const,createdAt:at(-7_200_000),expiresAt:at(-6_900_000),completedAt:null},
   {id:randomUUID(),status:'PREVIEWED' as const,createdAt:at(-90_000),expiresAt:at(210_000),completedAt:null},
   {id:randomUUID(),status:'CANCELLED' as const,createdAt:at(-600_000),expiresAt:at(-300_000),completedAt:null}
  ];
  const sessions=[
   {id:oldSessionId,bindingId:oldId,createdAt:at(-172_500_000),expiresAt:at(-165_600_000),revokedAt:at(-171_000_000)},
   {id:currentSessionId,bindingId:currentId,createdAt:at(-10_000),expiresAt:at(3_600_000),revokedAt:null}
  ];
  await db.transaction(companyId,'SYNTHETIC_IDENTITY_PRIVACY_HISTORY',async tx=>{
   await insertFixture(tx,'site_identity_bindings',{...bindingBase,id:oldId,generation:1,created_at:old.createdAt,expires_at:old.expiresAt});
   await tx.query("UPDATE site_identity_bindings SET status='REVOKED',version=version+1,revoked_by=$3,revoked_at=$4 WHERE company_id=$1 AND id=$2",[companyId,oldId,userId,old.revokedAt]);
   // The real successor trigger requires an exact, still-current consumed F2
   // receipt. This explicitly provisioned fixture does not run the F2 protocol.
   const consumed=challenges[0]!;
   await insertFixture(tx,'site_identity_challenges',{...challengeBase,...preview,id:consumed.id,status:consumed.status,
    created_at:consumed.createdAt,expires_at:consumed.expiresAt,completed_at:consumed.completedAt,binding_id:currentId,proof_reference:proof.reference});
   await insertFixture(tx,'site_identity_bindings',{...bindingBase,id:currentId,generation:2,predecessor_id:oldId,f2_challenge_id:consumedId,
    created_at:current.createdAt,expires_at:null});
   await insertFixture(tx,'site_identity_bindings',{...bindingBase,id:expiredId,subject:principal+'-expired',site_user_id:principal+'-expired',generation:1,
    created_at:expired.createdAt,expires_at:expired.expiresAt});
   for(const [index,session] of sessions.entries()){
    await insertFixture(tx,'site_auth_sessions',{company_id:companyId,id:session.id,token_hash:hash(companyId+session.id+'token-secret'),
     user_id:userId,user_version:1,security_fingerprint:proof.security,binding_id:session.bindingId,binding_version:1,binding_generation:index+1,
     issuer,audience,subject:principal,site_session_digest:proof.session,site_profile_version:1,site_profile_fingerprint:proof.profile,
     site_expires_at:session.expiresAt,trust_version:1,trust_fingerprint:proof.trust,transport_fingerprint:proof.transport,
     created_at:session.createdAt,expires_at:session.expiresAt});
    if(session.revokedAt)await tx.query('UPDATE site_auth_sessions SET revoked_at=$3 WHERE company_id=$1 AND id=$2',[companyId,session.id,session.revokedAt]);
   }
   for(const challenge of challenges.slice(1))await insertFixture(tx,'site_identity_challenges',{...challengeBase,
    ...(challenge.status==='PREVIEWED'?{...preview,site_subject:unconfirmedSubject}:{}),id:challenge.id,status:challenge.status,
    created_at:challenge.createdAt,expires_at:challenge.expiresAt});
  });
  const snapshot:IdentityPrivacySnapshot={companyId,subjectUserId:userId,
   bindings:ordered<IdentityPrivacySnapshot['bindings'][number]>([
    {...old,issuer,audience,subject:principal,status:'REVOKED',version:2,generation:1},
    {...current,issuer,audience,subject:principal,status:'ACTIVE',version:1,generation:2},
    {...expired,issuer,audience,subject:principal+'-expired',status:'ACTIVE',version:1,generation:1}
   ]),sessions:ordered(sessions),challenges:ordered(challenges)};
  return {snapshot,currentId,issuer,audience,principal,proof,secrets:[...Object.values(proof),...sessions.map(session=>hash(companyId+session.id+'token-secret')),
   unconfirmedSubject,unconfirmedEmail,'SYNTHETIC_PRIVATE_SITE_PREVIEW']};
 }
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  company='identity-privacy-qa-'+randomUUID();foreignCompany='identity-privacy-other-'+randomUUID();engine=new Engine(db,'TEST');
  for(const companyId of [company,foreignCompany])await db.transaction(companyId,'SYNTHETIC_IDENTITY_PRIVACY_SETUP',async tx=>{
   await tx.add('company',{operatingMode:'TEST',synthetic:true},companyId);
   for(const userId of [ids.subject,ids.other]){
    await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:[],name:'Synthetic privacy subject',email:'shared@example.test',language:'UK',
     passwordHash:'SYNTHETIC_PROFILE_SECRET_MUST_NOT_EXPORT'},userId);
    await tx.query('INSERT INTO auth_credentials(company_id,user_id,password_hash,totp_secret) VALUES($1,$2,$3,$4)',
     [companyId,userId,'SYNTHETIC_CREDENTIAL_SECRET_MUST_NOT_EXPORT','SYNTHETIC_TOTP_SECRET_MUST_NOT_EXPORT']);
   }
   await tx.add('user',{active:true,roles:['OWNER'],siteIds:[]},ids.reviewer);
   for(const [id,version] of [[ids.v1,V1],[ids.v2,V2]])await tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true,
    evidenceReference:'SYNTHETIC_RECORDED_REVIEW_ONLY',approvedAt:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+86_400_000).toISOString(),
    scope:{projectionVersion:version,exportCategories:['PROFILE','TIME']}},id);
  });
  [subject,other,reviewer,foreignSubject]=await Promise.all([
   engine.getActor(ids.subject,company),engine.getActor(ids.other,company),
   engine.getActor(ids.reviewer,company).then(actor=>({...actor,mfaVerified:true})),engine.getActor(ids.subject,foreignCompany)
  ]);
 });
 afterAll(async()=>{await db?.close();});

 it('exports exact own history across generations and lifecycles, excluding other users/companies and all proof/preview secrets',async()=>{
  const own=await seedHistory(company,ids.subject,'own'),sameCompany=await seedHistory(company,ids.other,'OTHER_USER_CANARY');
  const foreign=await seedHistory(foreignCompany,ids.subject,'FOREIGN_COMPANY_CANARY');
  const original=await fingerprint(company,identityTables),originalForeign=await fingerprint(foreignCompany,identityTables);
  const request=await reviewed();expect(request.data).toMatchObject({exportProjectionVersion:V2,legalApprovalVersion:1});
  const result=await call(subject,'privacy.export',{requestId:request.id});
  expect(Object.keys(result).sort()).toEqual(['byteSize','exportId','fileName','securedDownloadRequired','sha256','status'].sort());
  expect(result).toMatchObject({status:'PRIVATE_JSON_ARTIFACT_READY',securedDownloadRequired:true});
  const artifact=await get('privacy_export',result.exportId),downloaded=await download(result.exportId),snapshot=JSON.parse(downloaded.bytes.toString('utf8'));
  expect(artifact.data.projectionVersion).toBe(V2);expect(snapshot.projectionVersion).toBe(V2);
  expect(snapshot.identity).toEqual(own.snapshot);expect(snapshot.fullLegalDsarFulfillment).toBe(false);
  expect(result.byteSize).toBe(downloaded.bytes.length);expect(result.sha256).toBe(hash(downloaded.bytes.toString('utf8')));
  const json=downloaded.bytes.toString('utf8');
  for(const canary of [...own.secrets,...sameCompany.secrets,...foreign.secrets,sameCompany.principal,foreign.principal,
   'SYNTHETIC_PROFILE_SECRET_MUST_NOT_EXPORT','SYNTHETIC_CREDENTIAL_SECRET_MUST_NOT_EXPORT','SYNTHETIC_TOTP_SECRET_MUST_NOT_EXPORT'])expect(json).not.toContain(canary);
  expect(await fingerprint(company,identityTables)).toEqual(original);expect(await fingerprint(foreignCompany,identityTables)).toEqual(originalForeign);
  await expect(call(other,'privacy.export',{requestId:request.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(download(result.exportId,other)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(download(result.exportId,foreignSubject)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('preserves the exact v1 canonical bytes for an already-reviewed legacy request without a projection field or SQL reader',async()=>{
  await seedHistory(company,ids.subject,'legacy');const request=await reviewed(V1);
  await edit('privacy_request',request.id,data=>{const {exportProjectionVersion,...legacy}=data;return legacy;});
  engine.registry['privacy.export']=createPrivacyExportCommand();
  const result=await call(subject,'privacy.export',{requestId:request.id}),artifact=await get('privacy_export',result.exportId),downloaded=await download(result.exportId);
  // Frozen v1 key order and omissions; only the actual generated timestamp varies.
  const legacy=JSON.stringify({categories:['PROFILE'],createdAt:artifact.data.snapshot.createdAt,fullLegalDsarFulfillment:false,
   omissions:['credentials','other_person_data','raw_routes','bank_details','other_authors_messages','inaccessible_channels','blob_keys'],
   profile:{active:true,email:'shared@example.test',language:'UK',name:'Synthetic privacy subject',userId:ids.subject},
   projectionVersion:'knaba-dsar-v1',scope:'MINIMIZED_SELF_DATA_EXPORT',subjectUserId:ids.subject});
  expect(downloaded.bytes.equals(Buffer.from(legacy,'utf8'))).toBe(true);expect(result.sha256).toBe(hash(legacy));
  expect(artifact.data.projectionVersion).toBe(V1);expect(artifact.data.snapshot).not.toHaveProperty('identity');
 });
 it.each([V1,V2])('%s rejects a changed legal revision even when its permitted projection and categories remain identical',async(version)=>{
  const request=await reviewed(version);await edit('legal_approval',request.data.legalApprovalId,data=>({...data,reviewAnnotation:'Synthetic changed reviewed revision'}));
  const before=await effects();await expect(call(subject,'privacy.export',{requestId:request.id})).rejects.toMatchObject({code:'NEEDS_APPROVAL'});
  expect(await effects()).toEqual(before);
 });
 it('cannot silently upgrade an approved legacy v1 request when the legal record becomes v2; a new explicit review can approve v2',async()=>{
  const request=await reviewed(V1);await edit('privacy_request',request.id,data=>{const {exportProjectionVersion,...legacy}=data;return legacy;});
  await edit('legal_approval',ids.v1,data=>({...data,scope:{...data.scope,projectionVersion:V2}}));
  const before=await effects();await expect(call(subject,'privacy.export',{requestId:request.id})).rejects.toMatchObject({code:'NEEDS_APPROVAL'});
  expect(await effects()).toEqual(before);
  // Select that exact, now-v2 legal record in a separate explicit review.
  const newlyReviewed=await reviewed(V1);expect(newlyReviewed.data).toMatchObject({exportProjectionVersion:V2,legalApprovalVersion:2});
  const exported=await call(subject,'privacy.export',{requestId:newlyReviewed.id});
  expect((await get('privacy_export',exported.exportId)).data.snapshot.identity).toEqual({companyId:company,subjectUserId:ids.subject,bindings:[],sessions:[],challenges:[]});
 });
 it('fails closed without the SQL reader for an approved v2 PROFILE and creates no artifact, receipt or outbox effect',async()=>{
  const request=await reviewed();engine.registry['privacy.export']=createPrivacyExportCommand();const before=await effects();
  await expect(call(subject,'privacy.export',{requestId:request.id})).rejects.toMatchObject({code:'MISSING_CONFIGURATION',details:{reason:'IDENTITY_PRIVACY_READER_REQUIRED'}});
  expect(await effects()).toEqual(before);
 });
 it('does not invoke an identity reader for a v2 TIME-only export',async()=>{
  const request=await reviewed(V2,['TIME']);let readerCalls=0;
  engine.registry['privacy.export']=createPrivacyExportCommand(async()=>{readerCalls++;throw new Error('TIME_EXPORT_MUST_NOT_READ_IDENTITY');});
  const exported=await call(subject,'privacy.export',{requestId:request.id}),snapshot=(await get('privacy_export',exported.exportId)).data.snapshot;
  expect(readerCalls).toBe(0);expect(snapshot).toMatchObject({projectionVersion:V2,categories:['TIME'],time:[]});expect(snapshot).not.toHaveProperty('identity');
 });
 it.each([V1,V2])('%s keeps its stored artifact and same-command receipt immutable after identity revocation',async(version)=>{
  const own=await seedHistory(company,ids.subject,'immutable'),request=await reviewed(version),key=randomUUID();
  const result=await call(subject,'privacy.export',{requestId:request.id},key),before=await download(result.exportId),artifact=await get('privacy_export',result.exportId);
  await db.transaction(company,'SYNTHETIC_IDENTITY_PRIVACY_REVOCATION',tx=>tx.query("UPDATE site_identity_bindings SET status='REVOKED',version=version+1,revoked_by=$3,revoked_at=clock_timestamp() WHERE company_id=$1 AND id=$2",[company,own.currentId,ids.subject]));
  expect((await db.query('SELECT status,version FROM site_identity_bindings WHERE company_id=$1 AND id=$2',[company,own.currentId])).rows[0]).toEqual({status:'REVOKED',version:2});
  expect(await call(subject,'privacy.export',{requestId:request.id},key)).toEqual(result);
  expect(await get('privacy_export',result.exportId)).toEqual(artifact);
  const after=await download(result.exportId);expect(after.bytes.equals(before.bytes)).toBe(true);expect(after.sha256).toBe(before.sha256);
  expect((await db.query("SELECT count(*)::int AS count FROM aggregates WHERE company_id=$1 AND kind='privacy_export'",[company])).rows[0].count).toBe(1);
  expect((await db.query("SELECT count(*)::int AS count FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND command='privacy.export' AND idempotency_key=$3",[company,ids.subject,key])).rows[0].count).toBe(1);
 });
 it('rejects a SQL-valid session whose binding belongs to another user instead of exporting cross-user lineage',async()=>{
  const otherHistory=await seedHistory(company,ids.other,'other-binding'),request=await reviewed(),now=Date.now();
  await db.transaction(company,'SYNTHETIC_CROSS_USER_PROVENANCE_FIXTURE',tx=>insertFixture(tx,'site_auth_sessions',{
   company_id:company,id:randomUUID(),token_hash:hash(company+'cross-user-token'),user_id:ids.subject,user_version:1,
   security_fingerprint:otherHistory.proof.security,binding_id:otherHistory.currentId,binding_version:1,binding_generation:2,
   issuer:otherHistory.issuer,audience:otherHistory.audience,subject:otherHistory.principal,site_session_digest:otherHistory.proof.session,
   site_profile_version:1,site_profile_fingerprint:otherHistory.proof.profile,site_expires_at:new Date(now+3_600_000).toISOString(),
   trust_version:1,trust_fingerprint:otherHistory.proof.trust,transport_fingerprint:otherHistory.proof.transport,
   created_at:new Date(now).toISOString(),expires_at:new Date(now+3_600_000).toISOString()
  }));
  expect((await db.query('SELECT count(*)::int AS count FROM site_auth_sessions WHERE company_id=$1 AND user_id=$2',[company,ids.subject])).rows[0].count).toBe(1);
  const before=await effects(),identityBefore=await fingerprint(company,identityTables);
  await expect(call(subject,'privacy.export',{requestId:request.id})).rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'IDENTITY_PRIVACY_SESSION_LINEAGE_INVALID'}});
  expect(await effects()).toEqual(before);expect(await fingerprint(company,identityTables)).toEqual(identityBefore);
 });
 it('rejects nonfinite PostgreSQL timestamps instead of silently omitting historical metadata',async()=>{
  await db.transaction(company,'SYNTHETIC_NONFINITE_IDENTITY_FIXTURE',tx=>insertFixture(tx,'site_identity_bindings',{
   company_id:company,id:randomUUID(),issuer:'https://site.identity-privacy.example.test',audience:'synthetic-erp-privacy',
   subject:'synthetic-infinite-binding',site_user_id:'synthetic-infinite-binding',user_id:ids.subject,trust_version:1,
   trust_fingerprint:hash(company+'trust'),proof_reference:hash(company+'proof'),created_by:ids.subject,
   created_at:new Date(Date.now()-60_000).toISOString(),expires_at:'infinity'
  }));
  const request=await reviewed(),before=await effects();
  await expect(call(subject,'privacy.export',{requestId:request.id})).rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'IDENTITY_PRIVACY_METADATA_INVALID'}});
  expect(await effects()).toEqual(before);
 });
 it('rejects 25001 real challenge rows without truncation and rolls back export effects while preserving identity history',async()=>{
  expect(IDENTITY_PRIVACY_MAX_RECORDS).toBe(25_000);const request=await reviewed();
  await db.transaction(company,'SYNTHETIC_BOUNDED_IDENTITY_INVENTORY',tx=>tx.query(`INSERT INTO site_identity_challenges
   (company_id,id,user_id,session_hash,security_fingerprint,mfa_verified,secret_hash,challenge_digest,nonce_digest,
    issuer,audience,trust_fingerprint,transport_fingerprint,created_at,expires_at,status)
   SELECT $1,gen_random_uuid(),$2,$3,$3,false,$3,$3,$3,'https://site.identity-privacy.example.test','synthetic-erp-privacy',$3,$3,
    clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours'+interval '1 minute','OPEN'
   FROM generate_series(1,25001)`,[company,ids.subject,hash(company+'synthetic-overflow-proof')]));
  expect((await db.query('SELECT count(*)::int AS count FROM site_identity_challenges WHERE company_id=$1 AND user_id=$2',[company,ids.subject])).rows[0].count).toBe(25_001);
  const before=await effects(),identityBefore=await fingerprint(company,identityTables);
  await expect(call(subject,'privacy.export',{requestId:request.id})).rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'IDENTITY_PRIVACY_SNAPSHOT_LIMIT'}});
  expect(await effects()).toEqual(before);expect(await fingerprint(company,identityTables)).toEqual(identityBefore);
 });
});
