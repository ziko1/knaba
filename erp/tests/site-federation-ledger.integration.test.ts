import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {FederationAuthorities} from '../apps/api/site-federation-config.ts';
import {SiteFederationLedger,type FederationResult} from '../apps/api/site-federation-ledger.ts';
import {makeFederationRequest,verifyFederationRequest,type FederationAction,type FederationAuthority} from '../packages/integrations/site-federation-protocol.mjs';
import {federationAuthorityFixture,federationRequestFixture} from './fixtures/site-federation.ts';

const postgres=process.env.DATABASE_URL?describe:describe.skip;
const ref='a'.repeat(43),fingerprint='b'.repeat(64),subject='immutable-site-user';
postgres('F2 PostgreSQL authoritative source ledger',()=>{
 let db:Database,company:string,config:FederationAuthority,registry:FederationAuthorities,ledger:SiteFederationLedger,generation:number,revision:number;
 beforeAll(async()=>{expect(process.env.APP_MODE).toBe('TEST');db=new Database();await db.migrate();});
 afterAll(async()=>{await db?.close();});
 beforeEach(()=>{company='f2-ledger-'+randomUUID();config=federationAuthorityFixture(company);registry=new FederationAuthorities([config],company,'TEST');ledger=new SiteFederationLedger(db,()=>registry);generation=0;revision=0;});
 const payload=()=>({subject,sessionRef:ref,epoch:1,securityFingerprint:fingerprint,sessionExpiresAt:new Date(Date.now()+3600000).toISOString(),sourcePolicyVersion:1});
 const call=(action:FederationAction,input:Record<string,unknown>,operationId?:string,gen=generation)=>ledger.handle(federationRequestFixture(config,action,input,gen,operationId).verified);
 const good=async(promise:Promise<FederationResult>)=>{const response=await promise;expect(response.ok).toBe(true);if(!response.ok)throw new Error(response.error.code);generation=response.current.generation;revision=response.current.revision;return response;};
 const bootstrap=()=>good(call('BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},undefined,0));
 const activate=async()=>{await good(call('RECONCILE_PAGE',{cursor:null,snapshotRevision:null}));return good(call('ACTIVATE_AUTHORITY',{snapshotRevision:revision}));};
 const active=async()=>{await bootstrap();await activate();};
 const source=async(input=payload())=>{await good(call('REGISTER_SESSION',input));return input;};
 const assertCurrent=(input:ReturnType<typeof payload>)=>db.transaction(company,'SYNTHETIC_CONSUMER',tx=>ledger.currentSourceIn(tx,config,generation,{subject:input.subject,sessionRef:input.sessionRef,epoch:input.epoch,securityFingerprint:input.securityFingerprint,sourcePolicyVersion:input.sourcePolicyVersion}),10000,true);

 it('requires complete snapshot reconciliation before activation and creates no ERP sessions or users',async()=>{
  await bootstrap();expect(await call('ACTIVATE_AUTHORITY',{snapshotRevision:revision})).toMatchObject({ok:false,error:{code:'FEDERATION_CONFLICT'}});
  expect(await call('REGISTER_SESSION',payload())).toMatchObject({ok:false,error:{code:'FEDERATION_RECONCILING'}});
  await activate();const input=await source();expect((await assertCurrent(input)).session.sessionRef).toBe(ref);
  for(const table of ['auth_sessions','aggregates','site_identity_bindings'])expect((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE company_id=$1`,[company])).rows[0].n).toBe(0);
 });
 it('persists an unknown-session fence before late register and across a new bootstrap',async()=>{
  await bootstrap();await good(call('FENCE',{subject,scope:'SESSION',sessionRefs:[ref],intentHash:fingerprint}));await activate();
  expect(await call('REGISTER_SESSION',payload())).toMatchObject({ok:false,error:{code:'ACCESS_DENIED'}});
  await bootstrap();const page=await good(call('RECONCILE_PAGE',{cursor:null,snapshotRevision:null}));expect(page.receipt.result.records).toEqual([expect.objectContaining({kind:'SESSION',subject,sessionRef:ref,state:'REVOKED',epoch:null})]);
  await good(call('ACTIVATE_AUTHORITY',{snapshotRevision:revision}));expect(await call('REGISTER_SESSION',payload())).toMatchObject({ok:false,error:{code:'ACCESS_DENIED'}});
 });
 it('fences an authenticated snapshot and never activates the next epoch merely from FENCE',async()=>{
  await active();const input=await source();await assertCurrent(input);const operationId=randomUUID();
  await good(call('FENCE',{subject,scope:'PRINCIPAL',throughEpoch:1,nextEpoch:2,intentHash:fingerprint},operationId));
  await expect(assertCurrent(input)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  const next={...input,epoch:2,sessionRef:'c'.repeat(43),securityFingerprint:'d'.repeat(64)};
  expect(await call('REGISTER_SESSION',next)).toMatchObject({ok:false,error:{code:'ACCESS_DENIED'}});
  expect(await call('ACTIVATE_EPOCH',{subject,epoch:2,securityFingerprint:next.securityFingerprint,sourcePolicyVersion:1,fenceOperationId:randomUUID()})).toMatchObject({ok:false});
  await good(call('ACTIVATE_EPOCH',{subject,epoch:2,securityFingerprint:next.securityFingerprint,sourcePolicyVersion:1,fenceOperationId:operationId}));await good(call('REGISTER_SESSION',next));await assertCurrent(next);await expect(assertCurrent(input)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(await call('REGISTER_SESSION',{...next,sessionRef:ref})).toMatchObject({ok:false,error:{code:'ACCESS_DENIED'}});
 });
 it('rejects nonce replay but resumes an uncertain operation using stable digest and fresh nonce',async()=>{
  const operationId=randomUUID(),input={instanceId:randomUUID()},request=federationRequestFixture(config,'BOOTSTRAP_AUTHORITY',input,0,operationId);
  const first=await good(ledger.handle(request.verified));expect(await ledger.handle(request.verified)).toMatchObject({ok:false,error:{code:'FEDERATION_REPLAY'}});
  const repeated=await good(call('BOOTSTRAP_AUTHORITY',input,operationId,0));expect(repeated.receipt).toEqual(first.receipt);expect(repeated.current.generation).toBe(1);
  expect(await call('BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},operationId,0)).toMatchObject({ok:false,error:{code:'FEDERATION_CONFLICT'}});
  expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='FEDERATION_BOOTSTRAP_AUTHORITY'",[company])).rows).toHaveLength(1);
 });
 it('checks actual SQL time after waiting for the company lock, not just when the MAC was verified',async()=>{
  await active();let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),locked=new Promise<void>(resolve=>{entered=resolve;});
  const blocker=db.transaction(company,'SYNTHETIC_LOCK',async()=>{entered();await held;});await locked;
  const verifiedAt=Date.now(),wire=makeFederationRequest(config,'SITE_TO_ERP','LOOKUP_PRINCIPAL',{subject},{generation,now:verifiedAt-59975}),verified=verifyFederationRequest(config,'SITE_TO_ERP',wire.headers,wire.body,verifiedAt);
  const waiting=ledger.handle(verified);try{await db.query('SELECT pg_sleep(0.05)');}finally{release();await blocker;}
  expect(await waiting).toMatchObject({ok:false,error:{code:'FEDERATION_AUTH_FAILED'}});expect((await db.query('SELECT operation_id FROM site_federation_operations WHERE company_id=$1 AND operation_id=$2',[company,wire.context.operationId])).rows).toHaveLength(0);
 });
 it('returns historical receipts separately from a later generation and cannot replay an activation as authority',async()=>{
  await bootstrap();await good(call('RECONCILE_PAGE',{cursor:null,snapshotRevision:null}));const operationId=randomUUID(),snapshotRevision=revision;
  const activated=await good(call('ACTIVATE_AUTHORITY',{snapshotRevision},operationId));await bootstrap();
  const repeated=await good(call('ACTIVATE_AUTHORITY',{snapshotRevision},operationId));expect(repeated.receipt).toEqual(activated.receipt);expect(repeated.current).toMatchObject({generation:2,phase:'RECONCILING'});
  expect(await call('REGISTER_SESSION',payload())).toMatchObject({ok:false,error:{code:'FEDERATION_RECONCILING'}});
 });
 it('forces a stable 50-record snapshot restart if a fence changes the revision between pages',async()=>{
  await bootstrap();const refs=Array.from({length:60},(_,i)=>Buffer.alloc(32,i+1).toString('base64url'));
  await good(call('FENCE',{subject,scope:'SESSION',sessionRefs:refs,intentHash:fingerprint}));
  const first=await good(call('RECONCILE_PAGE',{cursor:null,snapshotRevision:null}));expect(first.receipt.result.records).toHaveLength(50);expect(first.receipt.result.done).toBe(false);
  const oldRevision=revision,cursor=first.receipt.result.cursor;await good(call('FENCE',{subject,scope:'SESSION',sessionRefs:['z'.repeat(43)],intentHash:fingerprint}));
  expect(await call('RECONCILE_PAGE',{cursor,snapshotRevision:oldRevision})).toMatchObject({ok:false,error:{code:'FEDERATION_CONFLICT'}});
  const restarted=await good(call('RECONCILE_PAGE',{cursor:null,snapshotRevision:null}));const last=await good(call('RECONCILE_PAGE',{cursor:restarted.receipt.result.cursor,snapshotRevision:revision}));expect(last.receipt.result.records).toHaveLength(11);expect(last.receipt.result.done).toBe(true);await good(call('ACTIVATE_AUTHORITY',{snapshotRevision:revision}));
 });
 it('keeps lookup bounded/current and principal-null explicitly distinct from absent dependencies',async()=>{
  await bootstrap();const empty=await good(call('LOOKUP_PRINCIPAL',{subject}));expect(empty.receipt.result).toEqual({subject,hasDependencies:false,principal:null,session:null});
  await good(call('FENCE',{subject,scope:'SESSION',sessionRefs:[ref],intentHash:fingerprint}));const known=await good(call('LOOKUP_PRINCIPAL',{subject,sessionRef:ref}));expect(known.receipt.result).toMatchObject({hasDependencies:true,principal:null,session:{kind:'SESSION',state:'REVOKED'}});
 });
 it('serializes concurrent register and revoke into a terminal denied result',async()=>{
  await active();const input=payload();const results=await Promise.all([call('REGISTER_SESSION',input),call('FENCE',{subject,scope:'SESSION',sessionRefs:[ref],intentHash:fingerprint})]);
  expect(results[1]).toMatchObject({ok:true});await expect(assertCurrent(input)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect((await db.query('SELECT state FROM site_federation_sessions WHERE company_id=$1 AND session_ref=$2',[company,ref])).rows[0].state).toBe('REVOKED');
 });
 it('preserves immutable revocation storage on migration rerun and rejects direct downgrade/retarget/delete',async()=>{
  await active();await source();await good(call('FENCE',{subject,scope:'PRINCIPAL',throughEpoch:1,nextEpoch:2,intentHash:fingerprint}));await good(call('FENCE',{subject,scope:'SESSION',sessionRefs:[ref],intentHash:fingerprint}));
  await db.migrate();
  for(const query of ["UPDATE site_federation_principals SET minimum_epoch=1,version=version+1 WHERE company_id=$1","UPDATE site_federation_sessions SET state='ACTIVE',version=version+1 WHERE company_id=$1","UPDATE site_federation_sessions SET subject='another' WHERE company_id=$1","DELETE FROM site_federation_sessions WHERE company_id=$1","DELETE FROM site_federation_principals WHERE company_id=$1","DELETE FROM site_federation_operations WHERE company_id=$1"]){await expect(db.query(query,[company])).rejects.toMatchObject({code:'23514'});}
  expect((await db.query("SELECT version FROM schema_migrations WHERE version='004_site_federation_authority'")).rows).toHaveLength(1);
 });
 it('rejects a stale configuration after key rotation and retains terminal refs',async()=>{
  await active();await good(call('FENCE',{subject,scope:'SESSION',sessionRefs:[ref],intentHash:fingerprint}));const oldConfig=config;
  config=federationAuthorityFixture(company,{policyVersion:2,siteToErp:{kid:'rotated',secret:Buffer.alloc(32,21).toString('base64url')}});registry=new FederationAuthorities([config],company,'TEST');await bootstrap();await activate();
  expect(await call('REGISTER_SESSION',{...payload(),sourcePolicyVersion:2})).toMatchObject({ok:false,error:{code:'ACCESS_DENIED'}});
  await expect(ledger.handle(federationRequestFixture(oldConfig,'LOOKUP_PRINCIPAL',{subject},generation).verified)).rejects.toMatchObject({code:'FEDERATION_UNAVAILABLE'});
  registry=new FederationAuthorities([oldConfig],company,'TEST');expect(await ledger.handle(federationRequestFixture(oldConfig,'BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},0).verified)).toMatchObject({ok:false,error:{code:'FEDERATION_CONFLICT'}});
 });
 it('isolates equal source subjects and refs by company, and rejects a mismatched transaction scope',async()=>{
  await active();const input=await source(),other=company+'-other',otherConfig=federationAuthorityFixture(other);
  const otherLedger=new SiteFederationLedger(db,()=>new FederationAuthorities([otherConfig],other,'TEST'));
  await expect(db.transaction(other,'SYNTHETIC_WRONG_SCOPE',tx=>ledger.currentSourceIn(tx,config,generation,{subject,sessionRef:ref,epoch:1,securityFingerprint:fingerprint,sourcePolicyVersion:1}))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const absent=await otherLedger.handle(federationRequestFixture(otherConfig,'LOOKUP_PRINCIPAL',{subject,sessionRef:input.sessionRef},1).verified);expect(absent).toMatchObject({ok:false,error:{code:'FEDERATION_GENERATION'}});
 });
});
