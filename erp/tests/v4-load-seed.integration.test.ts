import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {insertFixtureBatch} from '../scripts/v4-load.mts';

// Genuine PostgreSQL: execute the load runner's exact batch CTE, with small synthetic fixtures.
// Unique tenants keep immutable history intact; this does not execute the full load workload.
const realPostgres=process.env.DATABASE_URL?describe:describe.skip;
type FixtureRow=Parameters<typeof insertFixtureBatch>[3][number];

realPostgres('V4 load fixture batch PostgreSQL regression',()=>{
 let db:Database,companyId:string,runId:string;
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  companyId='synthetic-load-batch-'+randomUUID();
  runId=`synthetic-load-'quoted'-"audit"-Україна-${randomUUID()}`;
  await db.transaction(companyId,'SYNTHETIC_LOAD_BATCH_TEST',tx=>tx.add('company',{
   name:'Synthetic isolated load batch regression',synthetic:true,operatingMode:'TEST',loadRunId:runId,
  },companyId));
 });
 afterAll(async()=>{await db?.close();});

 const fixture=(kind:string,id:string,data:Record<string,unknown>={}):FixtureRow=>({
  kind,id,data:{...data,synthetic:true,loadRunId:runId},
 });
 async function effects(){
  return (await db.query(`SELECT
   COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.kind,a.id) FROM aggregates a WHERE a.company_id=$1),'[]'::jsonb) AS aggregates,
   COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.kind,r.id,r.version) FROM aggregate_revisions r WHERE r.company_id=$1),'[]'::jsonb) AS revisions,
   COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM audit_log a WHERE a.company_id=$1),'[]'::jsonb) AS audits,
   COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.actor_id,c.idempotency_key) FROM command_receipts c WHERE c.company_id=$1),'[]'::jsonb) AS receipts,
   COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM outbox o WHERE o.company_id=$1),'[]'::jsonb) AS outbox`,[companyId])).rows[0];
 }

 it('persists a small real batch with version-one revisions and exact textual run IDs in audit JSON',async()=>{
  const rows=[
   fixture('site','batch-site',{name:'Synthetic load site',active:true,timezone:'Europe/Berlin'}),
   fixture('task','batch-task',{siteId:'batch-site',state:'IN_PROGRESS',title:'Synthetic load work',unit:'UNIT'}),
   fixture('time_segment','batch-segment',{siteId:'batch-site',taskId:'batch-task',employeeId:'synthetic-worker',shiftId:'synthetic-shift',startAt:'2026-09-01T08:00:00.000Z',endAt:'2026-09-01T08:01:00.000Z',activity:'WORKING',source:'SYNTHETIC_LOAD_FIXTURE'}),
  ];
  await insertFixtureBatch(db,companyId,runId,rows);
  const [aggregates,revisions,audits,counts]=await Promise.all([
   db.query("SELECT company_id,kind,id,version,data FROM aggregates WHERE company_id=$1 AND kind<>'company' ORDER BY kind,id",[companyId]),
   db.query("SELECT company_id,kind,id,version,data,actor_id FROM aggregate_revisions WHERE company_id=$1 AND kind<>'company' ORDER BY kind,id,version",[companyId]),
   db.query("SELECT company_id,actor_id,action,aggregate_kind,aggregate_id,detail,jsonb_typeof(detail->'loadRunId') AS run_id_type FROM audit_log WHERE company_id=$1 AND aggregate_kind<>'company' ORDER BY aggregate_kind,aggregate_id",[companyId]),
   db.query(`SELECT
    (SELECT count(*)::int FROM aggregates WHERE company_id=$1) AS aggregates,
    (SELECT count(*)::int FROM aggregate_revisions WHERE company_id=$1) AS revisions,
    (SELECT count(*)::int FROM audit_log WHERE company_id=$1) AS audits,
    (SELECT count(*)::int FROM command_receipts WHERE company_id=$1) AS receipts,
    (SELECT count(*)::int FROM outbox WHERE company_id=$1) AS outbox`,[companyId]),
  ]);
  expect(aggregates.rows).toEqual(rows.map(row=>({company_id:companyId,...row,version:1})));
  expect(revisions.rows).toEqual(rows.map(row=>({company_id:companyId,...row,version:1,actor_id:'V4_LOAD_FIXTURE'})));
  expect(audits.rows).toEqual(rows.map(row=>({company_id:companyId,actor_id:'V4_LOAD_FIXTURE',action:'SYNTHETIC_LOAD_FIXTURE',aggregate_kind:row.kind,aggregate_id:row.id,detail:{version:1,loadRunId:runId},run_id_type:'string'})));
  expect(counts.rows).toEqual([{aggregates:4,revisions:4,audits:4,receipts:0,outbox:0}]);
 });

 it('rolls back every new aggregate, revision and audit when another row duplicates a committed fixture',async()=>{
  const original=fixture('site','existing-site',{name:'Original synthetic site'});
  await insertFixtureBatch(db,companyId,runId,[original]);
  const before=await effects();
  await expect(insertFixtureBatch(db,companyId,runId,[
   fixture('site','new-site',{name:'Must roll back'}),
   {...original,data:{...original.data,name:'Must not replace the original'}},
  ])).rejects.toMatchObject({code:'23505'});
  expect(await effects()).toEqual(before);
 });

 it.each([
  {name:'a non-synthetic row',data:{synthetic:false}},
  {name:'a row bound to a different load run',data:{loadRunId:'synthetic-other-run'}},
 ])('rejects a mixed batch containing $name without effects',async({data})=>{
  const valid=fixture('site','valid-site'),invalid=fixture('site','invalid-site');
  invalid.data={...invalid.data,...data};
  const before=await effects();
  await expect(insertFixtureBatch(db,companyId,runId,[valid,invalid])).rejects.toThrow('INVALID_SYNTHETIC_FIXTURE_BATCH');
  expect(await effects()).toEqual(before);
 });

 it.each([
  {name:'a non-synthetic TEST tenant',synthetic:false,operatingMode:'TEST'},
  {name:'a synthetic PRODUCTION tenant',synthetic:true,operatingMode:'PRODUCTION'},
 ])('rejects $name without fixture, receipt or outbox effects',async({synthetic,operatingMode})=>{
  await db.transaction(companyId,'SYNTHETIC_LOAD_BATCH_TEST',async tx=>{
   const company=await tx.get('company',companyId);
   await tx.save(company,{...company.data,synthetic,operatingMode});
  });
  const before=await effects();
  await expect(insertFixtureBatch(db,companyId,runId,[fixture('site','denied-site')])).rejects.toThrow('SYNTHETIC_TENANT_REQUIRED');
  expect(await effects()).toEqual(before);
 });
});
