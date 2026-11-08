import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';
import {buildPrivacyExport,governanceCommands,preparePrivacyExport,privacyExportBytes} from '../packages/domain/governance.ts';
import {PRIVACY_FEDERATION_RECORD_LIMIT,projectPrivacyFederationMetadata} from '../packages/domain/privacy-federation.ts';
import {createPrivacyFederationCommands,loadPrivacyFederationRows} from '../apps/api/privacy-federation.ts';

const now='2026-11-08T10:00:00.000Z',past='2026-11-08T09:00:00.000Z',future='2026-11-08T11:00:00.000Z';
const actor:Actor={companyId:'synthetic-company',userId:'synthetic-user',roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],warehouseIds:[],customerIds:[]};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner={companyId:actor.companyId,userId:actor.userId};
const client={clientId:'web',clientKind:'WEB',platform:'WEB',clientLabel:'Synthetic web'};
function dataRows():Record<string,Data[]>{return {
 bindings:[{...owner,kind:'BINDING',bindingId:id(1),sourceIssuer:'https://synthetic.invalid/identity',sourceSubject:'own-immutable-subject',storedStatus:'REVOKED',version:2,createdAt:past,expiresAt:null,revokedAt:now}],
 'link-attempts':[{...owner,kind:'LINK_ATTEMPT',attemptId:id(2),authorityId:'source',storedState:'CONFIRMED',createdAt:past,expiresAt:future,bindingId:id(1),lineageValid:true},{...owner,kind:'LINK_ATTEMPT',attemptId:id(3),authorityId:'source',storedState:'CLAIMED',createdAt:past,expiresAt:future,bindingId:null,lineageValid:true}],
 principals:[{...owner,kind:'PRINCIPAL',bindingId:id(1),authorityId:'source',storedState:'FENCED',updatedAt:now}],
 'source-sessions':[{...owner,kind:'SOURCE_SESSION',bindingId:id(1),authorityId:'source',storedState:'REVOKED',expiresAt:null,updatedAt:now},{...owner,kind:'SOURCE_SESSION',bindingId:id(1),authorityId:'source',storedState:'REVOKED',expiresAt:past,updatedAt:now},{...owner,kind:'SOURCE_SESSION',bindingId:id(1),authorityId:'source',storedState:'ACTIVE',expiresAt:future,updatedAt:now}],
 'login-attempts':[{...owner,...client,kind:'LOGIN_ATTEMPT',requestId:id(4),bindingId:id(1),storedState:'COMPLETE',version:4,createdAt:past,expiresAt:future,lineageValid:true}],
 'derived-sessions':[{...owner,...client,kind:'DERIVED_SESSION',childSessionId:id(5),requestId:id(4),bindingId:id(1),storedState:'REVOKED',createdAt:past,expiresAt:future,revokedAt:now,parentExpiresAt:future,parentRevokedAt:now,lineageValid:true}]
};}

// SQL result/transaction double: this verifies projection and adapter boundaries,
// never PostgreSQL filtering, locks, constraints or actual authority acceptance.
class MemoryTx implements Transaction {
 companyId=actor.companyId;rows=new Map<string,Entity>();events:Array<{type:string;data:Data}>=[];sequence=0;
 calls:Array<{sql:string;params:unknown[]}>=[];groups=dataRows();
 async query(sql:string,params:unknown[]){this.calls.push({sql,params});const group=/privacy-v2:([a-z-]+)/.exec(sql)?.[1];if(!group)throw new Error('Unexpected SQL');return {rows:structuredClone(this.groups[group]??[]).slice(0,Number(params[2]))};}
 async get<T extends Data=Data>(kind:string,key:string):Promise<Entity<T>>{const row=this.rows.get(`${kind}:${key}`);if(!row||row.companyId!==this.companyId)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
 async list<T extends Data=Data>(kind:string){return [...this.rows.values()].filter(row=>row.kind===kind&&row.companyId===this.companyId).map(row=>structuredClone(row) as Entity<T>);}
 async add<T extends Data=Data>(kind:string,data:T,key=id(100+this.sequence++)):Promise<Entity<T>>{const row={id:key,kind,companyId:this.companyId,version:1,data:structuredClone(data),createdAt:now,updatedAt:now};this.rows.set(`${kind}:${key}`,row);return structuredClone(row);}
 async save(entity:Entity,data:Data){const row={...entity,data:structuredClone(data),version:entity.version+1};this.rows.set(`${row.kind}:${row.id}`,row);return structuredClone(row);}
 async event(type:string,data:Data){this.events.push({type,data:structuredClone(data)});}
}
function context(tx:MemoryTx):CommandContext{return {tx,actor,now,idempotencyKey:'synthetic-v2-command',requireSite(){throw new Error('unused');},requireOwn(){throw new Error('unused');}};}
async function fixture(version:string|undefined='knaba-dsar-v2',categories=['PROFILE']){
 const tx=new MemoryTx();await tx.add('user',{name:'Own synthetic profile',active:true,passwordHash:'CREDENTIAL_CANARY'},actor.userId);
 await tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'synthetic-approval',approvedAt:past,expiresAt:future,scope:{projectionVersion:version??'knaba-dsar-v1',exportCategories:categories}},'legal');
 const request=await tx.add('privacy_request',{type:'ACCESS',subjectUserId:actor.userId,categories,state:'APPROVED_EXPORT',legalApprovalId:'legal',...(version!==undefined?{projectionVersion:version}:{})},'request');return {tx,request};
}
async function execute(tx:MemoryTx){const before=structuredClone(tx.rows),events=structuredClone(tx.events);try{return await createPrivacyFederationCommands()['privacy.export'].handler(context(tx),{requestId:'request'});}catch(error){tx.rows=before;tx.events=events;throw error;}}
const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;

describe('privacy v2 own metadata projection and SQL-adapter contract (doubles)',()=>{
 it('exports revoked history, counts source rows before aggregation, and explicitly preserves metadata',async()=>{
  const {tx}=await fixture(),before=structuredClone(tx.groups),ack=await execute(tx),artifact=await tx.get('privacy_export',ack.exportId),m=artifact.data.snapshot.federationMetadata;
  expect(ack.projectionVersion).toBe('knaba-dsar-v2');expect(m).toMatchObject({version:'knaba-federation-self-metadata-v1',capturedAt:now,scope:'ERP_STORED_METADATA'});
  expect(m.bindings).toEqual([{bindingId:id(1),sourceIssuer:'https://synthetic.invalid/identity',sourceSubject:'own-immutable-subject',storedStatus:'REVOKED',version:2,createdAt:past,expiresAt:null,revokedAt:now}]);
  expect(m.linkAttempts[1]).not.toHaveProperty('bindingId');expect(m.derivedSessions[0].parentRevokedAt).toBe(now);
  expect(m.sourceSessionSummary).toEqual([{bindingId:id(1),authorityId:'source',storedPrincipalState:'FENCED',principalUpdatedAt:now,sessionCounts:{activeUnexpired:1,activeExpired:0,revokedUnexpired:0,revokedExpired:1,revokedUnknownExpiry:1}}]);
  expect(m.retentionDispositions.every((v:Data)=>v.disposition==='PRESERVE_PENDING_APPROVED_METADATA_CLASS'&&v.deletionEligible===false&&v.deletionExecuted===false)).toBe(true);
  expect(m.retentionDispositions.find((v:Data)=>v.recordClass==='SOURCE_SESSION').recordCount).toBe(3);
  expect(tx.groups).toEqual(before);expect(JSON.stringify(artifact)).not.toContain('CREDENTIAL_CANARY');
  expect((await privacyExportBytes(tx,actor,ack.exportId)).sha256).toBe(ack.sha256);
 });
 it('uses only six parameterized own-company/user reads with a decreasing shared limit',async()=>{
  const {tx}=await fixture();await execute(tx);expect(tx.calls).toHaveLength(6);let count=0;
  for(const call of tx.calls){expect(call.params).toEqual([actor.companyId,actor.userId,25_001-count]);expect(call.sql).toMatch(/WHERE [a-z]\.company_id=\$1 AND/);expect(call.sql).toContain('LIMIT $3');const key=/privacy-v2:([a-z-]+)/.exec(call.sql)![1]!;count+=tx.groups[key]!.length;expect(call.sql).not.toMatch(/SELECT\s+\*|SELECT\s+[a-z]\.\*|site_federation_operations|audit_log/);}
  await expect(loadPrivacyFederationRows(tx,{...actor,companyId:'foreign-company'})).rejects.toMatchObject({code:'INVALID_STATE'});
 });
 it('keeps minimized bytes deterministic when owned row order changes at the same capturedAt',async()=>{
  const first=await fixture(),second=await fixture();for(const group of Object.values(second.tx.groups))group.reverse();
  const a=await buildPrivacyExport(first.tx,actor,'request',now,loadPrivacyFederationRows),b=await buildPrivacyExport(second.tx,actor,'request',now,loadPrivacyFederationRows);expect(a.bytes).toEqual(b.bytes);expect(a.sha256).toBe(b.sha256);
 });
 it.each([{version:undefined,categories:['PROFILE']},{version:'knaba-dsar-v1',categories:['PROFILE']},{version:'knaba-dsar-v2',categories:['TIME']}])('never invokes the federation loader for %j',async({version,categories})=>{
  const {tx}=await fixture(version,categories);if(version===undefined){const row=await tx.get('privacy_request','request');delete row.data.projectionVersion;tx.rows.set('privacy_request:request',row);const legal=await tx.get('legal_approval','legal');legal.data.scope.projectionVersion='knaba-dsar-v1';tx.rows.set('legal_approval:legal',legal);}
  const loader=vi.fn(async()=>{throw new Error('MUST_NOT_LOAD');});const result=await buildPrivacyExport(tx,actor,'request',now,loader);expect(loader).not.toHaveBeenCalled();expect(result.snapshot).not.toHaveProperty('federationMetadata');
 });
 it.each(['foreign company','foreign user','malformed owned client','missing owned binding','unconfirmed binding','unknown state','extra secret','secret-bearing issuer'])('fails atomically with a constant safe error for %s',async(kind)=>{
  const {tx}=await fixture();const r=tx.groups['login-attempts']![0]!;
  if(kind==='foreign company')r.companyId='foreign';if(kind==='foreign user')r.userId='foreign';if(kind==='malformed owned client')r.clientId=123;
  if(kind==='missing owned binding')r.lineageValid=false;if(kind==='unconfirmed binding')tx.groups['link-attempts']![1]!.bindingId=id(1);
  if(kind==='unknown state')r.storedState='UNRECOGNIZED';if(kind==='extra secret')r.verifier='PROOF_CANARY';
  if(kind==='secret-bearing issuer')tx.groups.bindings![0]!.sourceIssuer='https://synthetic.invalid/identity?credential=PROOF_CANARY';
  const before=structuredClone(tx.rows);await expect(execute(tx)).rejects.toMatchObject({code:'INVALID_STATE',details:{reason:'PRIVACY_FEDERATION_METADATA_INVALID'}});expect(tx.rows).toEqual(before);expect(tx.events).toEqual([]);
 });
 it('accepts exactly 25000 source records and rejects the 25001st before any artifact or event',async()=>{
  const {tx}=await fixture();tx.groups['link-attempts']=[];tx.groups.principals=[];tx.groups['login-attempts']=[];tx.groups['derived-sessions']=[];
  const source=tx.groups['source-sessions']![0]!;tx.groups['source-sessions']=Array.from({length:24_999},()=>({...source}));
  const ack=await execute(tx);expect((await tx.get('privacy_export',ack.exportId)).data.snapshot.federationMetadata.sourceSessionSummary[0].sessionCounts.revokedUnknownExpiry).toBe(24_999);
  const next=await fixture();next.tx.groups=structuredClone(tx.groups);next.tx.groups['source-sessions']!.push({...source});
  await expect(execute(next.tx)).rejects.toMatchObject({code:'INVALID_STATE',details:{reason:'PRIVACY_FEDERATION_RECORD_LIMIT_EXCEEDED'}});expect(await next.tx.list('privacy_export')).toEqual([]);expect(next.tx.events).toEqual([]);
  expect(next.tx.calls.at(-1)!.params[2]).toBe(25_000);expect(PRIVACY_FEDERATION_RECORD_LIMIT).toBe(25_000);
 });
 it('rejects a missing loader or a stale legal scope before a minimized artifact can be stored',async()=>{
  const {tx}=await fixture();await expect(preparePrivacyExport(context(tx),{requestId:'request'})).rejects.toMatchObject({details:{reason:'FEDERATION_METADATA_LOADER_REQUIRED'}});
  const legal=await tx.get('legal_approval','legal');await tx.save(legal,{...legal.data,scope:{...legal.data.scope,projectionVersion:'knaba-dsar-v1'}});
  await expect(execute(tx)).rejects.toMatchObject({code:'NEEDS_APPROVAL'});expect(tx.calls).toEqual([]);expect(await tx.list('privacy_export')).toEqual([]);
 });
 it.each(['outer-null','outer-unknown','snapshot-missing','snapshot-company','snapshot-subject','categories'])('denies %s even if a modified snapshot has a recomputed checksum',async(change)=>{
  const {tx}=await fixture(),ack=await execute(tx),artifact=await tx.get('privacy_export',ack.exportId);
  if(change==='outer-null')artifact.data.projectionVersion=null;if(change==='outer-unknown')artifact.data.projectionVersion='new-version';
  if(change==='snapshot-missing')delete artifact.data.snapshot.projectionVersion;if(change==='snapshot-company')artifact.data.snapshot.companyId='foreign';
  if(change==='snapshot-subject')artifact.data.snapshot.subjectUserId='foreign';if(change==='categories')artifact.data.snapshot.categories=['TIME'];
  const bytes=Buffer.from(canonical(artifact.data.snapshot));artifact.data.sha256=createHash('sha256').update(bytes).digest('hex');artifact.data.byteSize=bytes.length;
  await tx.save(artifact,artifact.data);await expect(privacyExportBytes(tx,actor,artifact.id)).rejects.toMatchObject({code:'INVALID_STATE'});
 });
 it('allows a legacy absent v1 artifact version only with a v1 request and leaves bytes unchanged',async()=>{
  const {tx}=await fixture('knaba-dsar-v1'),ack=await execute(tx),artifact=await tx.get('privacy_export',ack.exportId);delete artifact.data.projectionVersion;delete artifact.data.snapshot.projectionVersion;
  const request=await tx.get('privacy_request','request');delete request.data.projectionVersion;await tx.save(request,request.data);
  const bytes=Buffer.from(canonical(artifact.data.snapshot));artifact.data.sha256=createHash('sha256').update(bytes).digest('hex');artifact.data.byteSize=bytes.length;await tx.save(artifact,artifact.data);
  expect((await privacyExportBytes(tx,actor,artifact.id)).bytes).toEqual(bytes);expect(ack).not.toHaveProperty('projectionVersion');expect(tx.calls).toEqual([]);
  artifact.data.snapshot.companyId='foreign';const altered=Buffer.from(canonical(artifact.data.snapshot));artifact.data.sha256=createHash('sha256').update(altered).digest('hex');artifact.data.byteSize=altered.length;await tx.save(artifact,artifact.data);
  await expect(privacyExportBytes(tx,actor,artifact.id)).rejects.toMatchObject({code:'INVALID_STATE'});
 });
 it('keeps catalog and adapter input schema/permission identical and rejects foreign owners at projection',()=>{
  const actual=createPrivacyFederationCommands()['privacy.export'],base=governanceCommands['privacy.export'];expect(actual.schema).toBe(base.schema);expect(actual.permission).toBe('identity.self');
  expect(()=>projectPrivacyFederationMetadata({...actor,userId:'other'},now,Object.values(dataRows()).flat())).toThrow('INVALID_STATE');
 });
 it.each([null,'unknown',undefined])('never treats present stored request version %j as legacy absence',async(projectionVersion)=>{
  const {tx}=await fixture();const request=await tx.get('privacy_request','request');request.data.projectionVersion=projectionVersion;await tx.save(request,request.data);
  await expect(buildPrivacyExport(tx,actor,'request',now,loadPrivacyFederationRows)).rejects.toMatchObject({code:'INVALID_STATE',details:{reason:'PRIVACY_PROJECTION_VERSION_INVALID'}});
  await expect(governanceCommands['privacy.status'].handler(context(tx),{requestId:'request'})).rejects.toMatchObject({code:'INVALID_STATE'});
  expect(tx.calls).toEqual([]);expect(await tx.list('privacy_export')).toEqual([]);
 });
});
