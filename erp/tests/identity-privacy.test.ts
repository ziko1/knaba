import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';
import {buildPrivacyExport,createPrivacyExportCommand,governanceCommands,privacyExportBytes} from '../packages/domain/governance.ts';
import {IDENTITY_PRIVACY_MAX_RECORDS,type IdentityPrivacyReader} from '../packages/domain/identity-privacy.ts';

const NOW='2026-11-08T12:00:00.000Z';
const EARLIER='2026-11-01T12:00:00.000Z';
const LATER='2026-12-01T12:00:00.000Z';
const V1='knaba-dsar-v1',V2='knaba-dsar-v2';
const self:Actor={companyId:'company',userId:'self',roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],warehouseIds:[],customerIds:[]};
// Explicit domain double. Separate PostgreSQL cases exercise SQL scoping,
// Engine transactions and private artifact bytes; neither suite claims browser
// or HTTP request-authority execution for these newly added cases.
class MemoryTransaction implements Transaction {
 rows=new Map<string,Entity>();events:{type:string;data:Data}[]=[];sequence=0;
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>> {
  const row=this.rows.get(kind+':'+id);if(!row||row.companyId!==self.companyId)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;
 }
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]> {return [...this.rows.values()].filter(r=>r.kind===kind&&r.companyId===self.companyId).map(r=>structuredClone(r) as Entity<T>);}
 async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+(++this.sequence)):Promise<Entity<T>> {
  const row={companyId:self.companyId,kind,id,version:1,data:structuredClone(data),createdAt:EARLIER,updatedAt:EARLIER};this.rows.set(kind+':'+id,row);return structuredClone(row);
 }
 async save(row:Entity,data:Data,version=row.version) {const current=await this.get(row.kind,row.id);if(current.version!==version)throw new DomainError('VERSION_CONFLICT');const next={...current,version:version+1,data:structuredClone(data),updatedAt:NOW};this.rows.set(row.kind+':'+row.id,next);return structuredClone(next);}
 async event(type:string,data:Data){this.events.push({type,data:structuredClone(data)});}
}
async function fixture(version=V1,categories=['PROFILE']) {
 const tx=new MemoryTransaction();
 await tx.add('user',{active:true,name:'Synthetic Self',email:'self@example.test',credentialCanary:'SECRET_PROFILE_CANARY'},self.userId);
 await tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'SYNTHETIC_APPROVAL_ONLY',approvedAt:EARLIER,expiresAt:LATER,scope:{projectionVersion:version,exportCategories:['PROFILE','TIME']}},'legal');
 await tx.add('privacy_request',{type:'ACCESS',state:'APPROVED_EXPORT',subjectUserId:self.userId,categories,legalApprovalId:'legal',legalApprovalVersion:1,...(version===V1?{}:{exportProjectionVersion:version})},'request');
 return tx;
}
const context=(tx:Transaction,actor=self):CommandContext=>({tx,actor,now:NOW,idempotencyKey:'synthetic-own-export',requireSite(){throw new DomainError('ACCESS_DENIED');},requireOwn(id){if(id!==actor.userId)throw new DomainError('ACCESS_DENIED');}});
const legacyBytes='{"categories":["PROFILE"],"createdAt":"2026-11-08T12:00:00.000Z","fullLegalDsarFulfillment":false,"omissions":["credentials","other_person_data","raw_routes","bank_details","other_authors_messages","inaccessible_channels","blob_keys"],"profile":{"active":true,"email":"self@example.test","name":"Synthetic Self","userId":"self"},"projectionVersion":"knaba-dsar-v1","scope":"MINIMIZED_SELF_DATA_EXPORT","subjectUserId":"self"}';
const uuid=(n:number)=>`aaaaaaaa-aaaa-4aaa-8aaa-${n.toString(16).padStart(12,'0')}`;
function history():Data {
 return {companyId:self.companyId,subjectUserId:self.userId,
  bindings:[
   {id:uuid(2),issuer:'https://site.example.test',audience:'erp-test',subject:'confirmed-site-user',status:'ACTIVE',version:1,generation:2,createdAt:'2026-11-04T12:00:00.000Z',expiresAt:'2026-11-06T12:00:00.000Z',revokedAt:null},
   {id:uuid(1),issuer:'https://site.example.test',audience:'erp-test',subject:'confirmed-site-user',status:'REVOKED',version:2,generation:1,createdAt:EARLIER,expiresAt:null,revokedAt:'2026-11-04T11:00:00.000Z'}
  ],
  sessions:[
   {id:uuid(4),bindingId:uuid(2),createdAt:'2026-11-05T12:00:00.000Z',expiresAt:'2026-11-05T13:00:00.000Z',revokedAt:null},
   {id:uuid(3),bindingId:uuid(1),createdAt:EARLIER,expiresAt:'2026-11-01T13:00:00.000Z',revokedAt:'2026-11-01T12:30:00.000Z'}
  ],
  challenges:['PREVIEWED','OPEN','CANCELLED','CONSUMED'].map((status,i)=>({id:uuid(8-i),status,createdAt:EARLIER,expiresAt:'2026-11-01T12:05:00.000Z',completedAt:status==='CONSUMED'?'2026-11-01T12:02:00.000Z':null}))
 };
}
async function exportWith(tx:MemoryTransaction,reader?:IdentityPrivacyReader){return createPrivacyExportCommand(reader).handler(context(tx),{requestId:'request'});}

describe('version-bound minimized identity privacy export',()=>{
 it('preserves the exact canonical legacy v1 profile bytes',async()=>{
  const tx=await fixture(),built=await buildPrivacyExport(tx,self,'request',NOW);
  expect(built.bytes.toString()).toBe(legacyBytes);expect(built.sha256).toBe(createHash('sha256').update(legacyBytes).digest('hex'));
 });
 it('rejects a changed approval revision before creating an export',async()=>{
  const tx=await fixture(),legal=await tx.get('legal_approval','legal');await tx.save(legal,{...legal.data,evidenceReference:'DIFFERENT_SYNTHETIC_REVIEW'});
  await expect(buildPrivacyExport(tx,self,'request',NOW)).rejects.toMatchObject({code:'NEEDS_APPROVAL'});
  expect(await tx.list('privacy_export')).toEqual([]);
 });
 it('stores an unchanged v1 artifact without invoking the identity reader',async()=>{
  const tx=await fixture(),reader=vi.fn(async()=>history()),result=await exportWith(tx,reader);
  expect(reader).not.toHaveBeenCalled();
  const artifact=await tx.get('privacy_export',result.exportId);
  expect(artifact.data.projectionVersion).toBe(V1);expect(artifact.data.snapshot.identity).toBeUndefined();
  expect((await privacyExportBytes(tx,self,result.exportId)).bytes.toString()).toBe(legacyBytes);
 });
 it('uses only explicitly reviewed v2 PROFILE history and sorts without mutating the reader value',async()=>{
  const tx=await fixture(V2),value=history(),before=JSON.stringify(value),reader=vi.fn(async()=>value);
  const built=await buildPrivacyExport(tx,self,'request',NOW,reader);
  expect(reader).toHaveBeenCalledExactlyOnceWith(tx,{companyId:self.companyId,subjectUserId:self.userId});
  expect(built.projectionVersion).toBe(V2);expect(built.snapshot.projectionVersion).toBe(V2);
  expect(built.snapshot.identity.bindings.map((r:Data)=>r.id)).toEqual([uuid(1),uuid(2)]);
  expect(built.snapshot.identity.sessions.map((r:Data)=>r.id)).toEqual([uuid(3),uuid(4)]);
  expect(built.snapshot.identity.challenges.map((r:Data)=>r.id)).toEqual([uuid(5),uuid(6),uuid(7),uuid(8)]);
  expect(built.snapshot.identity.bindings).toHaveLength(2);expect(built.snapshot.identity.sessions).toHaveLength(2);
  expect(built.snapshot.identity.challenges).toHaveLength(4);expect(JSON.stringify(value)).toBe(before);
  expect(built.bytes.toString()).not.toContain('CANARY');expect(built.snapshot.fullLegalDsarFulfillment).toBe(false);
  expect(built.snapshot.omissions).toEqual(expect.arrayContaining(['identity_authentication_proofs','external_site_account_data','unconfirmed_link_preview_identity']));
  expect(built.snapshot.identity.sessions.every((row:Data)=>!('active' in row))).toBe(true);
 });
 it('records the v2 artifact version, returns only metadata and keeps saved bytes immutable',async()=>{
  const tx=await fixture(V2),value=history(),result=await exportWith(tx,async()=>value);
  expect(Object.keys(result).sort()).toEqual(['byteSize','exportId','fileName','securedDownloadRequired','sha256','status']);
  const artifact=await tx.get('privacy_export',result.exportId),first=await privacyExportBytes(tx,self,result.exportId);
  expect(artifact.data.projectionVersion).toBe(V2);expect(result.sha256).toBe(createHash('sha256').update(first.bytes).digest('hex'));
  value.bindings[0].subject='later-identity-change';value.sessions=[];
  expect((await privacyExportBytes(tx,self,result.exportId)).bytes.equals(first.bytes)).toBe(true);
  await expect(privacyExportBytes(tx,{...self,userId:'other'},result.exportId)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('requires the adapter for v2 PROFILE before writing any artifact or event',async()=>{
  const tx=await fixture(V2);
  await expect(exportWith(tx)).rejects.toMatchObject({code:'MISSING_CONFIGURATION',details:{reason:'IDENTITY_PRIVACY_READER_REQUIRED'}});
  expect(await tx.list('privacy_export')).toEqual([]);expect(tx.events).toEqual([]);
 });
 it.each([V1,V2])('does not load identity data when PROFILE was not requested under %s',async version=>{
  const tx=await fixture(version,['TIME']),reader=vi.fn(async()=>{throw new Error('Reader must not run');});
  const built=await buildPrivacyExport(tx,self,'request',NOW,reader);
  expect(reader).not.toHaveBeenCalled();expect(built.snapshot.identity).toBeUndefined();expect(built.snapshot.time).toEqual([]);
  const withoutAdapter=await buildPrivacyExport(tx,self,'request',NOW);expect(withoutAdapter.bytes.equals(built.bytes)).toBe(true);
 });
 it('rejects a changed v2 approval revision before invoking the reader',async()=>{
  const tx=await fixture(V2),legal=await tx.get('legal_approval','legal'),reader=vi.fn(async()=>history());
  await tx.save(legal,{...legal.data,evidenceReference:'CHANGED_SYNTHETIC_REVIEW'});
  await expect(buildPrivacyExport(tx,self,'request',NOW,reader)).rejects.toMatchObject({code:'NEEDS_APPROVAL'});expect(reader).not.toHaveBeenCalled();
 });
 it('does not upgrade a legacy approved request from a mutable v2 legal record',async()=>{
  const tx=await fixture(),legal=await tx.get('legal_approval','legal'),changed=await tx.save(legal,{...legal.data,scope:{...legal.data.scope,projectionVersion:V2}});
  const request=await tx.get('privacy_request','request');
  // Even a matching revision does not invent an explicit v2 review of this old request.
  await tx.save(request,{...request.data,legalApprovalVersion:changed.version});
  const reader=vi.fn(async()=>history());await expect(buildPrivacyExport(tx,self,'request',NOW,reader)).rejects.toMatchObject({code:'NEEDS_APPROVAL'});
  expect(reader).not.toHaveBeenCalled();
 });
 it('allows an explicit new review of a pending legacy request to record v2 and the exact legal revision',async()=>{
  const tx=await fixture(V2),request=await tx.get('privacy_request','request');
  const {exportProjectionVersion,...legacyPending}=request.data;
  await tx.save(request,{...legacyPending,state:'REQUESTED'});
  const reviewer={...self,userId:'reviewer',roles:['OWNER'],permissions:['privacy.review'],mfaVerified:true};
  const definition=governanceCommands['privacy.review']!;
  const reviewed=await definition.handler(context(tx,reviewer),definition.schema.parse({requestId:'request',decision:'APPROVE_EXPORT',legalApprovalId:'legal',evidenceReference:'EXPLICIT_SYNTHETIC_V2_REVIEW',reason:'Explicit new approval'}));
  expect(reviewed.data).toMatchObject({state:'APPROVED_EXPORT',exportProjectionVersion:V2,legalApprovalVersion:1,reviewedBy:'reviewer'});
  expect((await buildPrivacyExport(tx,self,'request',NOW,async()=>history())).projectionVersion).toBe(V2);
 });
 it('records explicit v1 review without changing its canonical export bytes',async()=>{
  const tx=await fixture(),request=await tx.get('privacy_request','request');await tx.save(request,{...request.data,state:'REQUESTED'});
  const definition=governanceCommands['privacy.review']!;
  await definition.handler(context(tx,{...self,userId:'reviewer'}),{requestId:'request',decision:'APPROVE_EXPORT',legalApprovalId:'legal',evidenceReference:'EXPLICIT_SYNTHETIC_V1_REVIEW',reason:'Explicit legacy approval'});
  expect((await tx.get('privacy_request','request')).data.exportProjectionVersion).toBe(V1);
  expect((await buildPrivacyExport(tx,self,'request',NOW)).bytes.toString()).toBe(legacyBytes);
 });
 it.each([null,'','knaba-dsar-v3',2])('rejects an unrecognized recorded projection %j',async exportProjectionVersion=>{
  const tx=await fixture(),request=await tx.get('privacy_request','request');await tx.save(request,{...request.data,exportProjectionVersion});
  await expect(buildPrivacyExport(tx,self,'request',NOW,async()=>history())).rejects.toMatchObject({code:'NEEDS_APPROVAL'});
 });
 it('does not accept a client-supplied projection selection in a privacy request',()=>{
  expect(()=>governanceCommands['privacy.request']!.schema.parse({type:'ACCESS',categories:['PROFILE'],reason:'Synthetic request',exportProjectionVersion:V2})).toThrow();
 });
 it.each([{companyId:'foreign-company'},{subjectUserId:'foreign-user'}])('rejects a foreign reader envelope %j',async patch=>{
  const tx=await fixture(V2);
  await expect(exportWith(tx,async()=>({...history(),...patch}))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await tx.list('privacy_export')).toEqual([]);expect(tx.events).toEqual([]);
 });
 it('keeps the expected subject private when an adapter mutates its scope argument',async()=>{
  const tx=await fixture(V2);
  const reader:IdentityPrivacyReader=async(_tx,scope)=>{
   Object.assign(scope,{subjectUserId:'foreign-user'});
   return {...scope,bindings:[],sessions:[],challenges:[]};
  };
  await expect(exportWith(tx,reader)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await tx.list('privacy_export')).toEqual([]);expect(tx.events).toEqual([]);
 });
 it('checks the request owner before accessing identity history even for an owner actor',async()=>{
  const tx=await fixture(V2),reader=vi.fn(async()=>history());
  await expect(buildPrivacyExport(tx,{...self,userId:'owner',roles:['OWNER']},'request',NOW,reader)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(reader).not.toHaveBeenCalled();
 });
 it.each(['bindings','sessions','challenges'])('rejects duplicate IDs inside %s',async collection=>{
  const tx=await fixture(V2),value=history();value[collection].push({...value[collection][0]});
  await expect(exportWith(tx,async()=>value)).rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'IDENTITY_PRIVACY_DUPLICATE_ID'}});
  expect(await tx.list('privacy_export')).toEqual([]);
 });
 it('rejects a session that refers to another subject binding',async()=>{
  const tx=await fixture(V2),value=history();value.sessions[0].bindingId=uuid(999);
  await expect(exportWith(tx,async()=>value)).rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'IDENTITY_PRIVACY_SESSION_LINEAGE_INVALID'}});
 });
 it.each(['not-a-time','infinity','2026-11-01T12:00:00+00:00',null])('rejects malformed/noncanonical timestamps %j',async createdAt=>{
  const tx=await fixture(V2),value=history();value.challenges[0].createdAt=createdAt;
  await expect(exportWith(tx,async()=>value)).rejects.toMatchObject({code:'VALIDATION_ERROR'});expect(await tx.list('privacy_export')).toEqual([]);
 });
 it('rejects inconsistent lifecycle metadata rather than labeling it current authority',async()=>{
  const tx=await fixture(V2),value=history();value.bindings[0].revokedAt=NOW;
  await expect(exportWith(tx,async()=>value)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 });
 it.each(['bindings','sessions','challenges'])('rejects unexpected sensitive fields in %s instead of serializing them',async collection=>{
  const tx=await fixture(V2),value=history();value[collection][0].secretHash='SECRET_READER_CANARY';
  await expect(exportWith(tx,async()=>value)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  expect(await tx.list('privacy_export')).toEqual([]);expect(tx.events).toEqual([]);
 });
 it('rejects an oversized history before parsing or writing any rows',async()=>{
  const tx=await fixture(V2),value=history();value.bindings=[];value.sessions=[];
  value.challenges=Array(IDENTITY_PRIVACY_MAX_RECORDS+1).fill(value.challenges[0]);
  await expect(exportWith(tx,async()=>value)).rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'IDENTITY_PRIVACY_SNAPSHOT_LIMIT'}});
  expect(await tx.list('privacy_export')).toEqual([]);expect(tx.events).toEqual([]);
 });
 it('bounds the combined histories even when each individual collection is within its limit',async()=>{
  const tx=await fixture(V2),value=history();value.challenges=Array(IDENTITY_PRIVACY_MAX_RECORDS-3).fill(value.challenges[0]);
  await expect(exportWith(tx,async()=>value)).rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'IDENTITY_PRIVACY_SNAPSHOT_LIMIT'}});
 });
 it('keeps duplicate-effect protection and saved bytes after a completed export',async()=>{
  const tx=await fixture(V2),reader=async()=>history(),result=await exportWith(tx,reader);
  const first=await privacyExportBytes(tx,self,result.exportId);
  await expect(exportWith(tx,reader)).rejects.toMatchObject({code:'DUPLICATE_EFFECT'});
  expect(await tx.list('privacy_export')).toHaveLength(1);expect((await privacyExportBytes(tx,self,result.exportId)).bytes.equals(first.bytes)).toBe(true);
 });
});
