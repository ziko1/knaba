import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database,assertGpsStorageSafe} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';
import {gpsMetadata,gpsAcknowledgement,gpsSampleVisible} from '../packages/domain/gps.ts';

const postgres=process.env.DATABASE_URL?describe:describe.skip;
const latitude=48.1374219876,longitude=11.5754918765;
const coordinateKeys=new Set(['latitude','longitude','accuracym','accuracy_m','lat','lon','lng','coordinates','rawpoint']);
function noCoordinates(value:unknown){
 if(Array.isArray(value)){for(const item of value)noCoordinates(item);return;}
 if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){expect(coordinateKeys.has(key.toLowerCase()),`Unexpected raw coordinate field ${key}`).toBe(false);noCoordinates(item);}
 expect(JSON.stringify(value)).not.toContain(String(latitude));expect(JSON.stringify(value)).not.toContain(String(longitude));
}
describe('GPS metadata, acknowledgements and visibility (CPU; SQL not covered)',()=>{
 const expiresAt='2026-10-08T10:00:00.000Z',boundary=Date.parse(expiresAt);
 const actor:Actor={userId:'worker',companyId:'gps-cpu',roles:['EMPLOYEE'],permissions:['location.self'],siteIds:['A'],warehouseIds:[],customerIds:[]};
 const row:Entity={id:'point',kind:'location_sample',companyId:actor.companyId,version:1,createdAt:'2026-10-07T10:00:00.000Z',updatedAt:'2026-10-07T10:00:00.000Z',data:{eventId:'point',employeeId:'worker',siteIds:['A','B'],expiresAt,latitude,longitude,accuracyM:7.125}};
 it('permanent metadata drops coordinates and unknown nested snapshots while retaining event identity and approved expiry',()=>{
  const metadata=gpsMetadata({...row.data,payload:{latitude,longitude},coordinates:{latitude,longitude},rawPoint:{latitude,longitude}});expect(metadata).toEqual({eventId:'point',employeeId:'worker',siteIds:['A','B'],expiresAt});noCoordinates(metadata);
 });
 it('current and legacy entity receipts normalize to the same coordinate-free acknowledgement',()=>{
  const ack=gpsAcknowledgement(row);expect(ack).toEqual({eventId:'point',sampleId:'point',accepted:true,expiresAt});expect(gpsAcknowledgement({...ack,latitude,longitude,legacySnapshot:row})).toEqual(ack);noCoordinates(ack);
 });
 it('subject reads close exactly at expiry and fail closed for invalid expiry, absent coordinates or another company',()=>{
  expect(gpsSampleVisible(actor,row,actor,boundary-1)).toBe(true);expect(gpsSampleVisible(actor,row,actor,boundary)).toBe(false);expect(gpsSampleVisible(actor,{...row,data:{...row.data,expiresAt:'not-a-timestamp'}},actor,boundary-1)).toBe(false);expect(gpsSampleVisible(actor,{...row,data:gpsMetadata(row.data)},actor,boundary-1)).toBe(false);expect(gpsSampleVisible(actor,{...row,companyId:'other-company'},actor,boundary-1)).toBe(false);
 });
 it('another employee needs explicit history authority for every route site and cannot gain subject ownership from createdBy',()=>{
  const other={...actor,userId:'other'},authored={...row,data:{...row.data,createdBy:'other'}};expect(gpsSampleVisible(other,authored,other,boundary-1)).toBe(false);const history={...other,permissions:['location.history.read'],siteIds:['A']};expect(gpsSampleVisible(history,row,history,boundary-1)).toBe(false);expect(gpsSampleVisible(history,row,{...history,siteIds:['A','B']},boundary-1)).toBe(true);expect(gpsSampleVisible(history,{...row,data:{...row.data,siteIds:[]}},history,boundary-1)).toBe(false);
 });
 it('external identities cannot read employee route samples even when they impersonate the subject ID',()=>{
  const external={...actor,roles:['CLIENT'],permissions:['location.history.read','scope.company']};expect(gpsSampleVisible(external,row,external,boundary-1)).toBe(false);
 });
});

// These are genuine SQL/Engine tests. No live verification is claimed unless an
// explicitly isolated QA DATABASE_URL is supplied. Immutable legacy canaries
// exist only inside rolled-back transactions and cannot poison other suites.
postgres('PostgreSQL GPS retention and immutable-history boundary',()=>{
 let db:Database,engine:Engine,company:string,worker:Actor,manager:Actor,bot:Actor;
 const ids={worker:'gps-worker',other:'gps-other-worker',manager:'gps-manager',bot:'gps-bot',siteA:'gps-site-a',siteB:'gps-site-b',device:'gps-device',policy:'gps-test-policy'};
 const call=(actor:Actor,name:string,input:Data,key=randomUUID())=>engine.execute(actor,name,{input,idempotency_key:key});
 const add=(kind:string,data:Data,id?:string)=>db.transaction(company,'SYNTHETIC_GPS_QA',tx=>tx.add(kind,data,id));
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company=`gps-qa-${randomUUID()}`;
  const now=Date.now();
  await db.transaction(company,'SYNTHETIC_GPS_QA',async tx=>{
   await tx.add('company',{synthetic:true,operatingMode:'TEST',name:'Synthetic GPS retention QA'},company);
   await tx.add('site',{active:true,name:'Synthetic origin'},ids.siteA);await tx.add('site',{active:true,name:'Synthetic destination'},ids.siteB);
   await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:[ids.siteA,ids.siteB]},ids.worker);
   await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:[ids.siteA,ids.siteB]},ids.other);
   await tx.add('user',{active:true,roles:['INTERNAL_BAULEITER'],permissions:['location.history.read'],siteIds:[ids.siteA]},ids.manager);
   await tx.add('user',{active:true,roles:['BOT_ADMIN'],siteIds:[ids.siteA,ids.siteB]},ids.bot);
   await tx.add('device',{active:true,employeeId:ids.worker,platform:'ANDROID',synthetic:true},ids.device);
   // Explicit synthetic TEST fixture, not an activation or external approval.
   await tx.add('tracking_policy',{state:'APPROVED',enabled:true,synthetic:true,testOnly:true,revision:1,approvedAt:new Date(now-7_200_000).toISOString(),expiresAt:new Date(now+172_800_000).toISOString(),retentionDays:1,maxSessionHours:12,allowPresence:true,allowBusinessRoute:true,allowMinimalReturn:false,accessRoles:['INTERNAL_BAULEITER'],legalApprovalReference:'SYNTHETIC_TEST_ONLY'},ids.policy);
  });
  [worker,manager,bot]=await Promise.all([ids.worker,ids.manager,ids.bot].map(id=>engine.getActor(id,company)));
 });
 afterAll(async()=>{vi.useRealTimers();await db?.close();});
 async function sample(){
  const now=Date.now();
  const shift=await call(worker,'shift.start',{siteId:ids.siteA,deviceId:ids.device,occurredAt:new Date(now-3_600_000).toISOString()});
  const trip=await call(worker,'trip.start',{shiftId:shift.id,destination:{kind:'SITE',id:ids.siteB},purpose:'Synthetic GPS retention QA',occurredAt:new Date(now-1_800_000).toISOString()});
  const input={eventId:randomUUID(),deviceId:ids.device,shiftId:shift.id,tripId:trip.id,sequenceNumber:1,observedAt:new Date(now-900_000).toISOString(),latitude,longitude,accuracyM:7.125,policyVersionId:ids.policy};
  const key=randomUUID(),ack=await call(worker,'trip.sample',input,key);
  return {shift,trip,input,key,ack};
 }
 async function rawPoint(id:string,employeeId=ids.worker,expiresAt=new Date(Date.now()-1000).toISOString(),tenant=company){
  await db.transaction(tenant,'SYNTHETIC_GPS_QA',tx=>tx.add('location_sample',{eventId:id,employeeId,siteIds:[ids.siteA],latitude,longitude,accuracyM:7.125,expiresAt,policyVersionId:ids.policy,mode:'BUSINESS_TRAVEL'},id));
 }
 async function purge(at:string,limit=500,tenant=company){const result=await db.query('SELECT knaba_purge_gps($1::timestamptz,$2::int,$3::text) AS count',[at,limit,tenant]);return Number(result.rows[0].count);}

 it('trip sample separates raw coordinates from aggregate metadata, immutable revisions, receipts and outbox',async()=>{
  const {input,key,ack}=await sample();expect(ack).toEqual({eventId:input.eventId,sampleId:input.eventId,accepted:true,expiresAt:expect.any(String)});noCoordinates(ack);
  const points=(await db.query('SELECT * FROM gps_points WHERE company_id=$1 AND id=$2',[company,ack.sampleId])).rows;expect(points).toHaveLength(1);expect(Number(points[0].latitude)).toBeCloseTo(latitude,10);expect(Number(points[0].longitude)).toBeCloseTo(longitude,10);expect(points[0].employee_id).toBe(ids.worker);expect(points[0].site_ids.sort()).toEqual([ids.siteA,ids.siteB].sort());
  const metadata=(await db.query("SELECT data FROM aggregates WHERE company_id=$1 AND kind='location_sample' AND id=$2",[company,ack.sampleId])).rows;expect(metadata).toHaveLength(1);expect(metadata[0].data).toMatchObject({employeeId:ids.worker,eventId:input.eventId,expiresAt:ack.expiresAt});noCoordinates(metadata);
  const revisions=(await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind='location_sample' AND id=$2",[company,ack.sampleId])).rows;expect(revisions).not.toHaveLength(0);noCoordinates(revisions);
  const receipts=(await db.query('SELECT result FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',[company,ids.worker,key])).rows;expect(receipts).toHaveLength(1);expect(receipts[0].result).toEqual(ack);noCoordinates(receipts);noCoordinates((await db.query('SELECT data FROM outbox WHERE company_id=$1',[company])).rows);
 });
 it('exact expiry hides samples, purges raw points, preserves time history, and cannot rehydrate through replay',async()=>{
  const {input,key,ack}=await sample();const timeBefore=(await db.query("SELECT kind,id,version,data FROM aggregate_revisions WHERE company_id=$1 AND kind IN ('shift','time_segment','time_event') ORDER BY kind,id,version",[company])).rows;
  expect((await engine.readEntities(worker,'location_sample')).map(row=>row.id)).toContain(ack.sampleId);
  try{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(ack.expiresAt));expect(await engine.readEntities(worker,'location_sample')).toEqual([]);expect(await purge(ack.expiresAt)).toBe(1);const replay=await call(worker,'trip.sample',input,key);expect(replay).toEqual(ack);noCoordinates(replay);await expect(call(worker,'trip.sample',input)).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'GPS_RETENTION_EXPIRED'}});}
  finally{vi.useRealTimers();}
  expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1 AND id=$2',[company,ack.sampleId])).rows).toEqual([]);expect((await db.query("SELECT data FROM aggregates WHERE company_id=$1 AND kind='location_sample' AND id=$2",[company,ack.sampleId])).rows).toHaveLength(1);
  expect((await db.query("SELECT kind,id,version,data FROM aggregate_revisions WHERE company_id=$1 AND kind IN ('shift','time_segment','time_event') ORDER BY kind,id,version",[company])).rows).toEqual(timeBefore);
 });
 it('raw sample reads require the actual subject or explicit history rights scoped to every route site',async()=>{
  const {ack}=await sample();const other=await engine.getActor(ids.other,company);expect(await engine.readEntities(other,'location_sample')).toEqual([]);expect(await engine.readEntities(manager,'location_sample')).toEqual([]);
  await db.transaction(company,'SYNTHETIC_GPS_QA',async tx=>{const user=await tx.get('user',ids.manager);await tx.save(user,{...user.data,siteIds:[ids.siteA,ids.siteB]});});
  await expect(db.transaction(company,'SYNTHETIC_GPS_QA',async tx=>{const metadata=await tx.get('location_sample',ack.sampleId);return tx.save(metadata,{...metadata.data,createdBy:ids.bot});})).rejects.toMatchObject({code:'INVALID_STATE',details:{reason:'GPS_EVENT_METADATA_IMMUTABLE'}});
  expect((await engine.readEntities(manager,'location_sample')).map(row=>row.id)).toEqual([ack.sampleId]);expect(await engine.readEntities(bot,'location_sample')).toEqual([]);
  const foreign=`gps-foreign-${randomUUID()}`;await db.transaction(foreign,'SYNTHETIC_GPS_QA',async tx=>{await tx.add('user',{active:true,roles:['OWNER'],permissions:['location.history.read'],siteIds:[ids.siteA,ids.siteB]},ids.worker);});const foreignActor=await engine.getActor(ids.worker,foreign);expect(await engine.readEntities(foreignActor,'location_sample')).toEqual([]);
 });
 it('bounded company cleanup honors only active unexpired same-subject GPS holds and appends count-only audit',async()=>{
  const at=new Date().toISOString(),foreign=`gps-foreign-${randomUUID()}`,freeA=randomUUID(),freeB=randomUUID(),held=randomUUID(),live=randomUUID(),foreignExpired=randomUUID();
  await rawPoint(freeA);await rawPoint(freeB);await rawPoint(held,ids.other);await rawPoint(live,ids.worker,new Date(Date.now()+60_000).toISOString());await rawPoint(foreignExpired,ids.worker,new Date(Date.now()-1000).toISOString(),foreign);
  await add('legal_hold',{subjectUserId:ids.other,state:'ACTIVE',categories:['GPS'],createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),testOnly:true});const auditBefore=(await db.query('SELECT COALESCE(max(id),0)::text AS id FROM audit_log WHERE company_id=$1',[company])).rows[0].id;
  expect(await purge(at,1)).toBe(1);expect(await purge(at,1)).toBe(1);expect(await purge(at,1)).toBe(0);expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1 ORDER BY id',[company])).rows.map(row=>row.id).sort()).toEqual([held,live].sort());expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[foreign])).rows.map(row=>row.id)).toEqual([foreignExpired]);
  const audits=(await db.query('SELECT detail FROM audit_log WHERE company_id=$1 AND id>$2',[company,auditBefore])).rows;expect(audits.length).toBeGreaterThan(0);noCoordinates(audits);expect(audits.reduce((total,row)=>total+row.detail.count,0)).toBe(2);for(const row of audits){expect(row.detail).toMatchObject({count:1,coordinatesRetained:false});expect(JSON.stringify(row.detail)).not.toContain(ids.worker);expect(JSON.stringify(row.detail)).not.toContain(ids.other);}
 });
 it('malformed, expired, released, wrong-subject, unrelated-category and foreign legal holds do not retain an expired point',async()=>{
  const point=randomUUID(),createdAt=new Date(Date.now()-3_600_000).toISOString();await rawPoint(point);for(const data of [{subjectUserId:ids.worker,state:'ACTIVE',categories:['GPS'],expiresAt:'not-a-timestamp'},{subjectUserId:ids.worker,state:'ACTIVE',categories:['GPS'],expiresAt:new Date(Date.now()-60_000).toISOString()},{subjectUserId:ids.worker,state:'RELEASED',categories:['GPS'],expiresAt:new Date(Date.now()+60_000).toISOString()},{subjectUserId:ids.other,state:'ACTIVE',categories:['GPS'],expiresAt:new Date(Date.now()+60_000).toISOString()},{subjectUserId:ids.worker,state:'ACTIVE',categories:['TIME'],expiresAt:new Date(Date.now()+60_000).toISOString()},{subjectUserId:ids.worker,state:'ACTIVE',categories:['GPS'],expiresAt:new Date(Date.now()+366*86_400_000).toISOString()}])await add('legal_hold',{...data,createdAt,testOnly:true});
  const foreign=`gps-foreign-${randomUUID()}`;await db.transaction(foreign,'SYNTHETIC_GPS_QA',tx=>tx.add('legal_hold',{subjectUserId:ids.worker,state:'ACTIVE',categories:['GPS'],createdAt,expiresAt:new Date(Date.now()+60_000).toISOString(),testOnly:true}));expect(await purge(new Date().toISOString())).toBe(1);expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[company])).rows).toEqual([]);
 });
 it('NULL and out-of-range purge bounds reject before deleting any raw point',async()=>{
  const point=randomUUID();await rawPoint(point);const at=new Date().toISOString();
  for(const bound of [null,0,5001]){
   await expect(db.query('SELECT knaba_purge_gps($1::timestamptz,$2::int,$3::text)',[at,bound,company])).rejects.toThrow('INVALID_GPS_PURGE_BOUND');
   expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[company])).rows.map(row=>row.id)).toEqual([point]);
  }
 });
 it('a same-subject GPS hold committed while cleanup waits on the company lock prevents deletion',async()=>{
  const point=randomUUID(),holdId=randomUUID();await rawPoint(point);
  const holder=await db.pool.connect(),cleaner=await db.pool.connect();let pending:Promise<any>|undefined;
  try{
   await holder.query('BEGIN ISOLATION LEVEL SERIALIZABLE');await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))',[company]);
   const holderPid=Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid),cleanerPid=Number((await cleaner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   const cutoff=(await holder.query('SELECT clock_timestamp()::text AS cutoff')).rows[0].cutoff;
   await cleaner.query("SELECT set_config('statement_timeout','5000',false)");
   // Attach both outcomes immediately: a failed concurrency assertion must not
   // leave an unhandled query rejection while the holder is being rolled back.
   pending=cleaner.query('SELECT knaba_purge_gps($1::timestamptz,500,$2::text) AS count',[cutoff,company]).then(result=>({result}),error=>({error}));
   let observedWait=false;
   for(let attempt=0;attempt<80;attempt++){
    const blockers=(await db.query('SELECT pg_blocking_pids($1::int) AS blockers',[cleanerPid])).rows[0].blockers as number[];
    if(blockers.includes(holderPid)){observedWait=true;break;}
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   expect(observedWait,'Purge must actually wait for the held company advisory lock').toBe(true);
   // This synthetic fixture models the committed result of legal_hold.create;
   // it does not claim any real legal approval or activate tracking in production.
   await holder.query("INSERT INTO aggregates(company_id,kind,id,data) VALUES($1,'legal_hold',$2,jsonb_build_object('subjectUserId',$3::text,'state','ACTIVE','categories',jsonb_build_array('GPS'),'createdAt',clock_timestamp(),'expiresAt',clock_timestamp()+interval '1 minute','testOnly',true))",[company,holdId,ids.worker]);
   expect((await holder.query("SELECT knaba_safe_timestamp(data->>'createdAt')>$3::timestamptz AS created_later FROM aggregates WHERE company_id=$1 AND kind='legal_hold' AND id=$2",[company,holdId,cutoff])).rows[0].created_later).toBe(true);
   await holder.query('COMMIT');const outcome=await pending;if(outcome.error)throw outcome.error;expect(Number(outcome.result.rows[0].count)).toBe(0);
   expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[company])).rows.map(row=>row.id)).toEqual([point]);
  }finally{
   await holder.query('ROLLBACK');if(pending)await pending;await cleaner.query('RESET statement_timeout');holder.release();cleaner.release();
  }
 });
 it.each(['aggregates','aggregate_revisions','command_receipts'] as const)('legacy raw copy in %s fails the storage safety guard without rewriting immutable history',async(layer)=>{
  const client=await db.pool.connect();const id=randomUUID(),raw={employeeId:ids.worker,eventId:id,latitude,longitude,accuracyM:7.125};
  try{
   await client.query('BEGIN');
   if(layer==='aggregates')await client.query("INSERT INTO aggregates(company_id,kind,id,data) VALUES($1,'location_sample',$2,$3)",[company,id,JSON.stringify(raw)]);
   if(layer==='aggregate_revisions')await client.query("INSERT INTO aggregate_revisions(company_id,kind,id,version,data,actor_id) VALUES($1,'location_sample',$2,1,$3,$4)",[company,id,JSON.stringify(raw),ids.worker]);
   if(layer==='command_receipts')await client.query("INSERT INTO command_receipts(company_id,actor_id,idempotency_key,command,input_hash,result,authorization_hash) VALUES($1,$2,$3,'trip.sample',$4,$5,$6)",[company,ids.worker,id,'a'.repeat(64),JSON.stringify({id,data:raw}),'b'.repeat(64)]);
   await client.query('SAVEPOINT storage_guard');await expect(assertGpsStorageSafe(client,company)).rejects.toThrow('GPS_LEGACY_RAW_COPY_REQUIRES_APPROVED_MIGRATION');await client.query('ROLLBACK TO SAVEPOINT storage_guard');
   const retained=await client.query(layer==='command_receipts'?'SELECT result AS payload FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2':`SELECT data AS payload FROM ${layer} WHERE company_id=$1 AND id=$2`,[company,id]);expect(retained.rows).toHaveLength(1);expect(JSON.stringify(retained.rows[0].payload)).toContain(String(latitude));
  }finally{await client.query('ROLLBACK');client.release();}
 });
});
