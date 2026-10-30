import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {assertProductionRetentionMatrix,PRODUCTION_RETENTION_CATEGORIES} from '../packages/domain/production-readiness.ts';
import type {Actor,Data} from '../packages/domain/core.ts';

// Genuine SQL/Engine governance guards using isolated TEST tenants and fictional
// recorded-review-shaped fixtures. Passing this is never real legal clearance,
// actual company approval, a production startup or GPS activation evidence.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 production retention prerequisites on genuine PostgreSQL',()=>{
 let db:Database,engine:Engine,company:string,author:Actor,approver:Actor;
 const call=(actor:Actor,name:string,input:Data)=>engine.execute(actor,name,{input,idempotency_key:randomUUID()});
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company='retention-matrix-qa-'+randomUUID();const epoch=Date.now();
  await db.transaction(company,'SYNTHETIC_RETENTION_MATRIX_FIXTURE',async tx=>{
   await tx.add('company',{operatingMode:'TEST',synthetic:true,name:'Synthetic retention prerequisite QA'},company);
   await tx.add('user',{active:true,roles:['OWNER'],siteIds:[]},'author');await tx.add('user',{active:true,roles:['OWNER'],siteIds:[]},'approver');
   await tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'FICTIONAL QA recorded review shape only; no external legal clearance',approvedAt:new Date(epoch-60000).toISOString(),expiresAt:new Date(epoch+86400000).toISOString(),scope:{retentionProfiles:Object.fromEntries(PRODUCTION_RETENTION_CATEGORIES.map(category=>[category,{minDays:1,maxDays:category==='GPS'?7:400}]))}},'review-shape');
  });
  author={...await engine.getActor('author',company),mfaVerified:true};approver={...await engine.getActor('approver',company),mfaVerified:true};
 });afterAll(async()=>{await db?.close();});
 async function approveMatrix(){
  const policies=[];
  for(const category of PRODUCTION_RETENTION_CATEGORIES){const draft=await call(author,'retention.create',{category,retentionDays:category==='GPS'?7:30,legalApprovalId:'review-shape',reason:'Synthetic separate author policy draft'});policies.push(await call(approver,'retention.approve',{policyId:draft.id,confirmedHash:draft.data.previewHash,reason:'Synthetic separate owner approval, no real compliance clearance'}));}
  return policies;
 }
 const check=(now?:string)=>db.transaction(company,'SYNTHETIC_STARTUP_GUARD_CHECK',tx=>assertProductionRetentionMatrix(tx,now),10000,true);
 async function changeLegal(patch:Data){return db.transaction(company,'SYNTHETIC_LEGAL_GUARD_CHANGE',async tx=>{const legal=await tx.get('legal_approval','review-shape'),saved=await tx.save(legal,{...legal.data,...patch});for(const policy of await tx.list('retention_policy'))await tx.save(policy,{...policy.data,legalApprovalVersion:saved.version});return saved;});}
 it('requires all seven actual independently drafted and approved policies in the current read-only SQL transaction',async()=>{
  await expect(check()).rejects.toMatchObject({code:'NEEDS_APPROVAL',details:{category:'PROFILE'}});
  const policies=await approveMatrix();expect(policies).toHaveLength(7);expect(policies.every(policy=>policy.data.createdBy==='author'&&policy.data.approvedBy==='approver'&&policy.data.state==='APPROVED')).toBe(true);
  const before=(await db.query('SELECT count(*)::int AS n FROM aggregate_revisions WHERE company_id=$1',[company])).rows;
  const matrix=await db.transaction(company,'SYNTHETIC_READ_ONLY_PREREQUISITE',async tx=>{expect((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on');return assertProductionRetentionMatrix(tx);},10000,true);
  expect(matrix).toEqual({categories:PRODUCTION_RETENTION_CATEGORIES,status:'APPROVED_CURRENT_MATRIX'});expect((await db.query('SELECT count(*)::int AS n FROM aggregate_revisions WHERE company_id=$1',[company])).rows).toEqual(before);
  expect((await db.query("SELECT count(*)::int AS n FROM outbox WHERE company_id=$1 AND type='retention.approved'",[company])).rows[0].n).toBe(7);
 });
 it('fresh legal revocation blocks an otherwise original approved seven-category matrix without deleting business records',async()=>{
  await approveMatrix();await changeLegal({active:false});await expect(check()).rejects.toMatchObject({code:'NEEDS_APPROVAL',details:{reason:'PRODUCTION_RETENTION_MATRIX_INCOMPLETE',category:'PROFILE'}});
  expect((await db.query("SELECT count(*)::int AS n FROM aggregates WHERE company_id=$1 AND kind='retention_policy' AND data->>'state'='APPROVED'",[company])).rows[0].n).toBe(7);
 });
 it('the exact legal expiry boundary blocks original approved policies even when their legal-version references match',async()=>{
  await approveMatrix();const expiredAt=new Date(Date.now()-1000).toISOString();await changeLegal({expiresAt:expiredAt});await expect(check(expiredAt)).rejects.toMatchObject({code:'NEEDS_APPROVAL',details:{category:'PROFILE'}});
 });
 it('one missing approved category and another company review reference cannot satisfy current company prerequisites',async()=>{
  const policies=await approveMatrix(),gps=policies.find(policy=>policy.data.category==='GPS')!;
  await db.query("DELETE FROM aggregates WHERE company_id=$1 AND kind='retention_policy' AND id=$2",[company,gps.id]);await expect(check()).rejects.toMatchObject({code:'NEEDS_APPROVAL',details:{category:'GPS'}});
  const foreign='foreign-retention-'+randomUUID();await db.transaction(foreign,'SYNTHETIC_FOREIGN_REVIEW',tx=>tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true},'foreign-review'));
  await db.transaction(company,'SYNTHETIC_FOREIGN_REFERENCE',async tx=>{const profile=(await tx.list('retention_policy')).find(policy=>policy.data.category==='PROFILE')!;await tx.save(profile,{...profile.data,legalApprovalId:'foreign-review',legalApprovalVersion:1});});
  await expect(check()).rejects.toMatchObject({code:'NEEDS_APPROVAL',details:{category:'PROFILE'}});
 });
});
