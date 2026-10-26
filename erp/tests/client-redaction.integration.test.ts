import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {createClientRedactionCommands} from '../apps/api/client-redaction.ts';
import {PostgresPrivateBlobStore} from '../packages/storage/index.ts';
import {ingestPrivateMedia,preparePrivateMedia} from '../packages/storage/media-ingest.ts';
import {clientRedactionVisible,type ClientRedactionHost} from '../packages/storage/client-redaction.ts';
import {DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';
import type {PgTransaction} from '../apps/api/database.ts';

// Genuine PostgreSQL, actual canonical Engine commands, immutable private blobs
// and real Sharp-generated synthetic image bytes. No external provider/physical
// or HTTP/browser acceptance is inferred from this database fixture.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const rect={x:2,y:3,width:5,height:4};
async function pixels(bytes:Buffer){return sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});}
function pixel(data:Buffer,width:number,x:number,y:number){return [...data.subarray((y*width+x)*3,(y*width+x)*3+3)];}

postgres('PostgreSQL private manual client-image redaction and canonical replay',()=>{
 let db:Database,engine:Engine,store:PostgresPrivateBlobStore,company:string,actor:Actor,client:Actor,original:Buffer,sanitized:Buffer,asset:Entity;
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  company='client-redaction-qa-'+randomUUID();engine=new Engine(db,'TEST');store=new PostgresPrivateBlobStore(db);Object.assign(engine.registry,createClientRedactionCommands(db,engine,store));
  const raw=Buffer.alloc(16*12*3);for(let y=0;y<12;y++)for(let x=0;x<16;x++){const p=(y*16+x)*3;raw[p]=90+x*5;raw[p+1]=30+y*7;raw[p+2]=190;}
  original=await sharp(raw,{raw:{width:16,height:12,channels:3}}).withMetadata({exif:{IFD0:{Artist:'Synthetic private QA metadata'}}}).png().toBuffer();
  const input={bytes:original,mimeType:'image/png',fileName:'synthetic-private-redaction.png',sourceId:'synthetic-original-'+randomUUID(),redactionConfirmed:true},prepared=await preparePrivateMedia(input);sanitized=prepared.clean;
  let uploadId='';await db.transaction(company,'SYNTHETIC_REDACTION_SEED',async tx=>{
   await tx.add('company',{legalName:'Synthetic redaction QA',operatingMode:'TEST',synthetic:true},company);
   await tx.add('user',{name:'Synthetic foreman',active:true,roles:['INTERNAL_BAULEITER'],siteIds:['site']},'foreman');
   await tx.add('user',{name:'Synthetic other-site foreman',active:true,roles:['INTERNAL_BAULEITER'],siteIds:['other-site']},'other');
   await tx.add('user',{name:'Synthetic customer',active:true,roles:['CLIENT'],siteIds:[]},'client');
   await tx.add('customer',{name:'Synthetic customer'},'customer');
   await tx.add('site',{active:true,code:'QA',name:'Synthetic site',customerId:'customer'},'site');await tx.add('site',{active:true,code:'OTHER',name:'Other synthetic site',customerId:'other-customer'},'other-site');
   await tx.add('customer_membership',{active:true,userId:'client',customerId:'customer',siteIds:['site'],permissions:['VIEW']},'membership');
   uploadId=(await ingestPrivateMedia(tx,store,await engine.actorIn(tx,'foreman'),input,prepared)).id;
  });
  actor=await engine.getActor('foreman',company);client=await engine.getActor('client',company);
  asset=await engine.execute(actor,'media.register',{input:{uploadId,siteId:'site',stage:'AFTER',visibility:'CLIENT_AFTER_APPROVAL',caption:'Synthetic completed work',retentionPurpose:'Synthetic evidence QA'},idempotency_key:randomUUID()});
  // Legacy reviewed copy establishes that any later edit invalidates publication.
  asset=await engine.execute(actor,'media.approve',{input:{mediaId:asset.id,reason:'Synthetic initial copy manually reviewed'},expected_version:asset.version,idempotency_key:randomUUID()});
 });
 afterAll(async()=>{await db?.close();});
 const row=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_REDACTION_READ',tx=>tx.get(kind,id));
 const rows=(kind:string)=>db.transaction(company,'SYNTHETIC_REDACTION_READ',tx=>tx.list(kind));
 async function update(kind:string,id:string,patch:Data){return db.transaction(company,'SYNTHETIC_REDACTION_UPDATE',async tx=>{const e=await tx.get(kind,id);return tx.save(e,{...e.data,...patch});});}
 const input=(version=0,masks=[rect])=>({mediaId:asset.id,clientCopyVersion:version,rectangles:masks,reason:'Mask the manually selected synthetic identifier'});
 const redact=(version=0,masks=[rect],expected=asset.version)=>engine.execute(actor,'media.redact',{input:input(version,masks),expected_version:expected,idempotency_key:randomUUID()});
 const blobCount=async()=>Number((await db.query('SELECT count(*)::int n FROM media_blobs WHERE company_id=$1',[company])).rows[0].n);
 async function employeeRedactionChain(){
  const bytes=await sharp(original).negate().png().toBuffer(),uploadInput={bytes,mimeType:'image/png',fileName:'synthetic-employee-photo.png',sourceId:'synthetic-employee-'+randomUUID()},prepared=await preparePrivateMedia(uploadInput);
  const upload=await db.transaction(company,'SYNTHETIC_EMPLOYEE_UPLOAD',async tx=>{await tx.add('user',{active:true,name:'Synthetic original employee uploader',roles:['EMPLOYEE'],siteIds:['site']},'uploader');return ingestPrivateMedia(tx,store,await engine.actorIn(tx,'uploader'),uploadInput,prepared);});
  const uploader=await engine.getActor('uploader',company),media=await engine.execute(uploader,'media.register',{input:{uploadId:upload.id,siteId:'site',stage:'AFTER',visibility:'CLIENT_AFTER_APPROVAL',caption:'SYNTHETIC_EMPLOYEE_REDACTION_ERASURE_CANARY',retentionPurpose:'Synthetic employee erasure acceptance'},idempotency_key:randomUUID()});
  const first=await engine.execute(actor,'media.redact',{input:{mediaId:media.id,clientCopyVersion:0,rectangles:[rect],reason:'SYNTHETIC_FIRST_RECTANGLE_ERASURE_CANARY'},expected_version:media.version,idempotency_key:randomUUID()});
  const second=await engine.execute(actor,'media.redact',{input:{mediaId:media.id,clientCopyVersion:1,rectangles:[{x:10,y:8,width:2,height:2}],reason:'SYNTHETIC_SECOND_RECTANGLE_ERASURE_CANARY'},expected_version:first.version,idempotency_key:randomUUID()});
  const blobKeys=[upload.data.blobKey,upload.data.clientBlobKey,first.data.clientEditId,second.data.clientEditId] as string[];
  const before=await Promise.all(blobKeys.map(k=>store.get(company,k)));expect(before.every(b=>b.ownerId===uploader.userId)).toBe(true);expect(new Set(blobKeys).size).toBe(4);
  return {uploader,upload,media,first,second,blobKeys,before};
 }
 async function erasureAuthority(uploader:Actor){
  await db.transaction(company,'SYNTHETIC_ERASURE_EXTERNAL_APPROVAL',async tx=>{for(const id of ['privacy-owner-a','privacy-owner-b'])await tx.add('user',{active:true,roles:['OWNER'],siteIds:[]},id);await tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'SYNTHETIC_PRIVACY_MEDIA_LEGAL_APPROVAL',approvedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),scope:{erasureCategories:['MEDIA'],retentionProfiles:{MEDIA:{minDays:0,maxDays:0}}}},'privacy-legal');});
  const a={...await engine.getActor('privacy-owner-a',company),mfaVerified:true},b={...await engine.getActor('privacy-owner-b',company),mfaVerified:true};
  const policy=await engine.execute(a,'retention.create',{input:{category:'MEDIA',retentionDays:0,legalApprovalId:'privacy-legal',reason:'Synthetic zero-day bounded MEDIA retention'},idempotency_key:randomUUID()});
  await engine.execute(b,'retention.approve',{input:{policyId:policy.id,confirmedHash:policy.data.previewHash,reason:'Independent synthetic retention review'},idempotency_key:randomUUID()});
  const request=await engine.execute(uploader,'privacy.request',{input:{type:'ERASURE',categories:['MEDIA'],reason:'Erase eligible synthetic employee photo copies'},idempotency_key:randomUUID()});
  await engine.execute(b,'privacy.review',{input:{requestId:request.id,decision:'REFER_ERASURE',legalApprovalId:'privacy-legal',evidenceReference:'SYNTHETIC_MEDIA_ERASURE_REVIEW',reason:'Current approved MEDIA retention applies'},idempotency_key:randomUUID()});
  const preview=()=>engine.execute(a,'privacy.erasure.preview',{input:{requestId:request.id},idempotency_key:randomUUID()});
  const confirm=(p:Data,who=b)=>engine.execute(who,'privacy.erasure.confirm',{input:{planId:p.planId,confirmedHash:p.planHash},idempotency_key:randomUUID()});
  return {a,b,request,preview,confirm};
 }

 it('actual PNG original and previous sanitized blob stay unchanged while exact opaque pixels, hash, edit and private approval state commit together',async()=>{
  const priorKey=asset.data.clientBlobKey,ack=await redact(),fresh=await row('media_asset',asset.id),edit=(await rows('media_client_edit'))[0]!,masked=await store.get(company,fresh.data.clientBlobKey),result=await pixels(masked.bytes),source=await pixels(sanitized);
  expect((await store.get(company,asset.data.blobKey)).bytes.equals(original)).toBe(true);expect((await store.get(company,priorKey)).bytes.equals(sanitized)).toBe(true);expect(fresh.data).toMatchObject({blobKey:asset.data.blobKey,sha256:hash(original),state:'RECEIVED',approvedBy:null,approvedAt:null,approvalReason:null,clientCopyVersion:1,clientSha256:hash(masked.bytes),clientMimeType:'image/png',clientWidth:16,clientHeight:12});
  for(let y=0;y<12;y++)for(let x=0;x<16;x++)expect(pixel(result.data,16,x,y)).toEqual(x>=2&&x<7&&y>=3&&y<7?[0,0,0]:pixel(source.data,16,x,y));
  expect((await sharp(original).metadata()).exif).toBeDefined();expect((await sharp(masked.bytes).metadata()).exif).toBeUndefined();expect(edit.data).toMatchObject({immutable:true,uploadedBy:'foreman',editedBy:'foreman',mediaId:asset.id,sourceClientBlobKey:priorKey,sourceClientSha256:hash(sanitized),clientBlobKey:fresh.data.clientBlobKey,clientSha256:hash(masked.bytes),originalPreserved:true,automaticDetection:false});
  expect(ack.version).toBe(asset.version+1);expect(JSON.stringify(ack)).not.toContain(asset.data.blobKey);expect(JSON.stringify(ack)).not.toContain(asset.data.sha256);expect(await blobCount()).toBe(3);
  expect((await db.query("SELECT count(*)::int n FROM outbox WHERE company_id=$1 AND type='media.client_redacted'",[company])).rows[0].n).toBe(1);expect((await db.query("SELECT count(*)::int n FROM audit_log WHERE company_id=$1 AND action='COMMAND:media.redact'",[company])).rows[0].n).toBe(1);
 });
 it('exact parallel command replay produces one immutable masked blob/edit/event and stale new submissions produce no effects',async()=>{
  const key=randomUUID(),envelope={input:input(),expected_version:asset.version,idempotency_key:key};const [a,b]=await Promise.all([engine.execute(actor,'media.redact',envelope),engine.execute(actor,'media.redact',envelope)]);expect(a).toEqual(b);expect(await engine.execute(actor,'media.redact',envelope)).toEqual(a);expect(await blobCount()).toBe(3);expect(await rows('media_client_edit')).toHaveLength(1);await expect(redact()).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(await blobCount()).toBe(3);expect((await db.query('SELECT count(*)::int n FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',[company,actor.userId,key])).rows[0].n).toBe(1);expect((await db.query("SELECT count(*)::int n FROM outbox WHERE company_id=$1 AND type='media.client_redacted'",[company])).rows[0].n).toBe(1);
 });
 it('current client VIEW reads disappear after redaction and return only after separate explicit media approval',async()=>{
  expect((await engine.readEntities(client,'media_asset')).map(e=>e.id)).toContain(asset.id);const ack=await redact();expect(await engine.readEntities(client,'media_asset')).toEqual([]);await expect(db.transaction(company,client.userId,tx=>engine.authorizeEntity(tx,'client','media_asset',asset.id))).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  const approved=await engine.execute(actor,'media.approve',{input:{mediaId:asset.id,reason:'Explicitly checked newly masked client copy'},expected_version:ack.version,idempotency_key:randomUUID()});expect(approved.data.state).toBe('APPROVED_FOR_CLIENT');const readable=await engine.readEntities(client,'media_asset');expect(readable).toHaveLength(1);expect(readable[0]!.data.clientSha256).toBe(ack.data.clientSha256);expect(readable[0]!.data).not.toHaveProperty('blobKey');await expect(store.get('foreign-company',approved.data.clientBlobKey)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('revoked current site, foreign site and injected external approval permissions cannot read or edit private source bytes',async()=>{
  const other=await engine.getActor('other',company);await expect(engine.execute(other,'media.redact',{input:input(),idempotency_key:randomUUID()})).rejects.toMatchObject({code:'ACCESS_DENIED'});await update('user','foreman',{siteIds:[]});await expect(redact()).rejects.toMatchObject({code:'ACCESS_DENIED'});await update('user','foreman',{siteIds:['site'],roles:['CLIENT'],permissions:['report.approve','media.read']});await expect(redact()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await rows('media_client_edit')).toEqual([]);expect(await blobCount()).toBe(2);expect((await store.get(company,asset.data.blobKey)).bytes.equals(original)).toBe(true);
 });
 it('a post-write handler failure rolls back the real PostgreSQL blob, edit, asset revision, audit, outbox and command receipt atomically',async()=>{
  const originalHandler=engine.registry['media.redact']!.handler;engine.registry['media.redact']={...engine.registry['media.redact']!,handler:async(ctx,args)=>{await originalHandler(ctx,args);throw new DomainError('SIMULATED_REDACTION_COMMIT_FAILURE');}};
  const before=await db.query('SELECT count(*)::int n FROM aggregate_revisions WHERE company_id=$1',[company]);const key=randomUUID();await expect(engine.execute(actor,'media.redact',{input:input(),expected_version:asset.version,idempotency_key:key})).rejects.toMatchObject({code:'SIMULATED_REDACTION_COMMIT_FAILURE'});expect(await blobCount()).toBe(2);expect(await rows('media_client_edit')).toEqual([]);expect((await row('media_asset',asset.id)).data).toEqual(asset.data);expect((await db.query('SELECT count(*)::int n FROM aggregate_revisions WHERE company_id=$1',[company])).rows[0].n).toBe(before.rows[0].n);expect((await db.query('SELECT count(*)::int n FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2',[company,key])).rows[0].n).toBe(0);expect((await db.query("SELECT count(*)::int n FROM outbox WHERE company_id=$1 AND type='media.client_redacted'",[company])).rows[0].n).toBe(0);
 });
 it('a second actual pixel edit retains prior private bytes and its original-uploader-linked edit lineage',async()=>{
  const first=await redact(),prior=await row('media_asset',asset.id),priorBytes=(await store.get(company,prior.data.clientBlobKey)).bytes,second=await redact(1,[{x:10,y:8,width:2,height:2}],first.version),final=await row('media_asset',asset.id),masked=await pixels((await store.get(company,final.data.clientBlobKey)).bytes);expect(second.data.clientCopyVersion).toBe(2);expect((await store.get(company,prior.data.clientBlobKey)).bytes.equals(priorBytes)).toBe(true);expect((await store.get(company,asset.data.blobKey)).bytes.equals(original)).toBe(true);expect(pixel(masked.data,16,2,3)).toEqual([0,0,0]);expect(pixel(masked.data,16,10,8)).toEqual([0,0,0]);expect(await rows('media_client_edit')).toHaveLength(2);expect(await blobCount()).toBe(4);expect((await rows('media_client_edit')).every(e=>e.data.uploadedBy==='foreman'&&e.data.blobKey===asset.data.blobKey)).toBe(true);
 });
 it('immutable edit history visibility follows fresh source scope, not cached editor ownership',async()=>{
  await redact();const edit=(await rows('media_client_edit'))[0]!,host:ClientRedactionHost<PgTransaction>={store,actorIn:(tx,id)=>engine.actorIn(tx,id),scope:(a,p)=>engine.scope(a,p),visible:(tx,a,e)=>engine.visible(tx,a,e)};
  expect(await db.transaction(company,actor.userId,tx=>clientRedactionVisible(tx,actor,edit,host))).toBe(true);expect(await db.transaction(company,client.userId,tx=>clientRedactionVisible(tx,client,edit,host))).toBe(false);await update('user','foreman',{siteIds:[]});expect(await db.transaction(company,actor.userId,tx=>clientRedactionVisible(tx,actor,edit,host))).toBe(false);
 });
 it('canonical employee upload, two foreman edits and independent MFA erasure delete all four eligible private blobs and immutable edit revisions using actual SQL permits',async()=>{
  const f=await employeeRedactionChain(),privacy=await erasureAuthority(f.uploader),beforeOther=(await store.get(company,asset.data.blobKey)).bytes;
  const editIds=[f.first.data.clientEditId,f.second.data.clientEditId],identitySql='SELECT kind,id,version,actor_id,created_at FROM aggregate_revisions WHERE company_id=$1 AND kind=\'media_client_edit\' AND id=ANY($2::text[]) AND version=1 ORDER BY id';
  const priorIdentity=(await db.query(identitySql,[company,editIds])).rows;expect(priorIdentity).toHaveLength(2);
  const p=await privacy.preview(),plan=(await row('privacy_erasure_plan',p.planId)).data.plan;
  expect(plan.actions.filter((a:Data)=>a.type==='DELETE_BLOB').map((a:Data)=>a.id).sort()).toEqual([...f.blobKeys].sort());
  expect(plan.actions.filter((a:Data)=>a.type==='REDACT_REVISION'&&a.kind==='media_client_edit')).toHaveLength(2);
  await expect(privacy.confirm(p,privacy.a)).rejects.toMatchObject({code:'SELF_APPROVAL_DENIED'});await expect(privacy.confirm(p,{...privacy.b,mfaVerified:false})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  const result=await privacy.confirm(p);expect(result.sourceDataDeleted).toBe(true);expect(result.checks.every((c:Data)=>c.verified)).toBe(true);expect(result.requestFulfilled).toBe(false);expect(result.fullLegalDsarFulfillment).toBe(false);
  for(const key of f.blobKeys)await expect(store.get(company,key)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  for(const [kind,id]of [['media_upload',f.upload.id],['media_asset',f.media.id],...editIds.map(id=>['media_client_edit',id])]){const aggregate=await row(kind!,id!);expect(aggregate.data).toMatchObject({state:'ERASED',privacyErasureRequestId:privacy.request.id});const versions=(await db.query('SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3',[company,kind,id])).rows;expect(versions.length).toBeGreaterThan(0);for(const revision of versions){expect(revision.data).toMatchObject({state:'ERASED',privacyErasureRequestId:privacy.request.id});for(const key of ['blobKey','clientBlobKey','sourceClientBlobKey','reason','rectangles','caption'])expect(revision.data).not.toHaveProperty(key);}}
  expect((await db.query(identitySql,[company,editIds])).rows).toEqual(priorIdentity);expect((await db.query('SELECT count(*)::int n FROM privacy_revision_permits WHERE company_id=$1',[company])).rows[0].n).toBe(0);
  expect((await store.get(company,asset.data.blobKey)).bytes.equals(beforeOther)).toBe(true);expect((await row('media_asset',asset.id)).data.state).toBe('APPROVED_FOR_CLIENT');expect(await blobCount()).toBe(2);
 });
 it('a current specific legal hold prevents the employee original, sanitized and both masked copies and edit revisions from being erased',async()=>{
  const f=await employeeRedactionChain(),privacy=await erasureAuthority(f.uploader),p=await privacy.preview();
  const protectedSql='SELECT kind,id,version,data FROM aggregates WHERE company_id=$1 AND (id=ANY($2::text[]) OR data->>\'mediaId\'=$3) ORDER BY kind,id',ids=[f.upload.id,f.media.id,f.first.data.clientEditId,f.second.data.clientEditId],before=(await db.query(protectedSql,[company,ids,f.media.id])).rows;
  const beforeRevisions=(await db.query('SELECT kind,id,version,data FROM aggregate_revisions WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY kind,id,version',[company,ids])).rows;
  await engine.execute(privacy.a,'legal_hold.create',{input:{subjectUserId:f.uploader.userId,categories:['MEDIA'],expiresAt:new Date(Date.now()+3600000).toISOString(),legalApprovalId:'privacy-legal',evidenceReference:'SYNTHETIC_SPECIFIC_MEDIA_HOLD',reason:'Preserve explicitly held synthetic photo evidence'},idempotency_key:randomUUID()});
  await expect(privacy.confirm(p)).rejects.toMatchObject({code:'VERSION_CONFLICT'});const held=await privacy.preview();expect(held.retained).toContainEqual(expect.objectContaining({kind:'media_client_edit',id:f.first.data.clientEditId,reason:'LEGAL_HOLD'}));expect((await row('privacy_erasure_plan',held.planId)).data.plan.actions).toEqual([]);
  const result=await privacy.confirm(held);expect(result.sourceDataDeleted).toBe(false);for(const [index,key]of f.blobKeys.entries())expect((await store.get(company,key)).bytes.equals(f.before[index]!.bytes)).toBe(true);
  expect((await db.query(protectedSql,[company,ids,f.media.id])).rows).toEqual(before);expect((await db.query('SELECT kind,id,version,data FROM aggregate_revisions WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY kind,id,version',[company,ids])).rows).toEqual(beforeRevisions);expect(await blobCount()).toBe(6);
 });
});
