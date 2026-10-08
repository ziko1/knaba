import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database,type PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {DomainError,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';

const NOW='2026-10-09T10:00:00.000Z';
class CrewReadTransaction implements Transaction{
 rows=new Map<string,Entity>();constructor(public companyId='crew-cpu-company'){}
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const row=this.rows.get(kind+':'+id);if(!row||row.companyId!==this.companyId)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.rows.values()].filter(row=>row.kind===kind&&row.companyId===this.companyId).map(row=>structuredClone(row) as Entity<T>);}
 async add<T extends Data=Data>(kind:string,data:T,id:string=randomUUID()):Promise<Entity<T>>{const row={kind,id,data:structuredClone(data),companyId:this.companyId,version:1,createdAt:NOW,updatedAt:NOW};this.rows.set(kind+':'+id,row);return structuredClone(row);}
 async save<T extends Data=Data>(row:Entity,data:T,expectedVersion=row.version):Promise<Entity<T>>{const old=await this.get(row.kind,row.id);if(old.version!==expectedVersion)throw new DomainError('VERSION_CONFLICT');const saved={...old,version:old.version+1,data:structuredClone(data)};this.rows.set(row.kind+':'+row.id,saved);return structuredClone(saved);}
 async event(){throw new Error('CPU_CREW_READ_MUST_NOT_WRITE_OUTBOX');}
 patch(kind:string,id:string,patch:Data){const row=this.rows.get(kind+':'+id)!;row.data={...row.data,...patch};row.version++;}
}
async function seed(tx:Transaction){
 await tx.add('site',{active:true,name:'Assigned site'},'site-a');await tx.add('site',{active:true,name:'Other site'},'site-b');
 for(const [id,roles,siteIds]of [['worker',['EMPLOYEE'],['site-a']],['peer',['EMPLOYEE'],['site-a']],['manager',['DISPATCHER'],['site-a']]] as const)await tx.add('user',{active:true,roles,siteIds},id);
 await tx.add('employee',{active:true,userId:'worker',name:'Own crew alias'},'employee-worker');await tx.add('employee',{active:true,userId:'peer',name:'Peer private employee'},'employee-peer');
 const base={orderId:'order',siteId:'site-a',employeeIds:['employee-worker','employee-peer'],acknowledgedIds:['employee-worker','employee-peer'],startAt:NOW,endAt:'2026-10-09T18:00:00.000Z',requireEmployeeAck:true,status:'ACKNOWLEDGED',scheduleVersion:3,internalCost:77000,costCents:88000,margin:99000,notesInternal:'PRIVATE_CREW_COST_CANARY'};
 await tx.add('crew_assignment',base,'own-assignment');await tx.add('crew_assignment',{...base,employeeIds:['employee-peer'],acknowledgedIds:['employee-peer']},'peer-assignment');await tx.add('crew_assignment',{...base,siteId:'site-b'},'other-site-assignment');
 await tx.add('notification',{recipient_id:'worker',event:'dispatch.schedule_cancelled',related_kind:'crew_assignment',related_id:'own-assignment',status:'PENDING',title:'Synthetic current roster cancellation'},'cancel-notice');
}
async function cpuFixture(){
 const tx=new CrewReadTransaction();await seed(tx);
 const db={transaction:async(_company:string,_actor:string,fn:(tx:PgTransaction)=>Promise<unknown>)=>fn(tx as unknown as PgTransaction)} as unknown as Database,engine=new Engine(db,'TEST');
 const read=async(userId='worker',kind='crew_assignment')=>engine.readEntities(await engine.getActor(userId,tx.companyId),kind);
 return {tx,engine,read};
}

describe('V4 own crew visibility and minimal projection (CPU explicit transaction double)',()=>{
 it.each(['ASSIGNED','ACKNOWLEDGED','COMPLETED','CANCELLED'])('own employee alias sees current %s roster without peer membership or private costs',async(status)=>{
  const f=await cpuFixture();f.tx.patch('crew_assignment','own-assignment',{status});const rows=await f.read();expect(rows.map(row=>row.id)).toEqual(['own-assignment']);
  expect(rows[0]!.data).toMatchObject({employeeId:'employee-worker',siteId:'site-a',orderId:'order',status,scheduleVersion:3,startAt:NOW});
  expect(rows[0]!.data).not.toHaveProperty('employeeIds');expect(rows[0]!.data).not.toHaveProperty('acknowledgedIds');expect(JSON.stringify(rows)).not.toMatch(/employee-peer|PRIVATE_CREW_COST_CANARY|internalCost|costCents|margin|notesInternal/);
 });
 it('site and role revocation are refreshed from the current user, even with an old actor object',async()=>{
  const f=await cpuFixture(),stale=await f.engine.getActor('worker',f.tx.companyId);
  f.tx.patch('user','worker',{siteIds:[]});expect(await f.engine.readEntities(stale,'crew_assignment')).toEqual([]);
  f.tx.patch('user','worker',{siteIds:['site-a'],roles:[],permissions:[]});expect(await f.engine.readEntities(stale,'crew_assignment')).toEqual([]);
 });
 it('inactive employee alias, inactive user and external-role override cannot restore own roster access',async()=>{
  const f=await cpuFixture();f.tx.patch('employee','employee-worker',{active:false});expect(await f.read()).toEqual([]);
  f.tx.patch('employee','employee-worker',{active:true});f.tx.patch('user','worker',{roles:['EMPLOYEE','CLIENT'],permissions:['dispatch.acknowledge']});expect(await f.read()).toEqual([]);
  f.tx.patch('user','worker',{active:false});await expect(f.read()).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('a different user cannot borrow the canonical employee alias or a foreign-company assignment',async()=>{
  const f=await cpuFixture();f.tx.patch('employee','employee-worker',{userId:'peer'});expect(await f.read()).toEqual([]);
  const actor=await f.engine.getActor('manager',f.tx.companyId),source=await f.tx.get('crew_assignment','own-assignment');expect(await f.engine.visible(f.tx as unknown as PgTransaction,actor,{...source,companyId:'foreign-company'})).toBe(false);
 });
 it('managers keep full operational roster only under the existing current site-scoped management permission',async()=>{
  const f=await cpuFixture(),managed=await f.read('manager');expect(managed.map(row=>row.id).sort()).toEqual(['own-assignment','peer-assignment']);expect(managed[0]!.data.employeeIds).toEqual(['employee-worker','employee-peer']);
  f.tx.patch('user','manager',{siteIds:[]});expect(await f.read('manager')).toEqual([]);
  f.tx.patch('user','manager',{roles:[],permissions:['dispatch.acknowledge'],siteIds:['site-a']});expect(await f.read('manager')).toEqual([]);
  f.tx.patch('user','manager',{permissions:['dispatch.manage','scope.company']});expect((await f.read('manager')).map(row=>row.id).sort()).toEqual(['other-site-assignment','own-assignment','peer-assignment']);
 });
 it('own cancellation notice links its current crew row and disappears when membership or site authority is revoked',async()=>{
  const f=await cpuFixture();f.tx.patch('crew_assignment','own-assignment',{status:'CANCELLED',cancelledAt:NOW});expect((await f.read('worker','notification')).map(row=>row.id)).toEqual(['cancel-notice']);
  f.tx.patch('crew_assignment','own-assignment',{employeeIds:['employee-peer']});expect(await f.read('worker','notification')).toEqual([]);
  f.tx.patch('crew_assignment','own-assignment',{employeeIds:['employee-worker']});f.tx.patch('user','worker',{siteIds:[]});expect(await f.read('worker','notification')).toEqual([]);
 });
 it('dispatch employee directory exposes canonical aliases and availability without payroll or HR fields',async()=>{
  const f=await cpuFixture();f.tx.patch('employee','employee-worker',{businessCode:'CREW-A',skills:['PAINT'],availabilityWindows:[{startAt:NOW,endAt:'2026-10-09T18:00:00.000Z'}],availabilityValidUntil:'2026-11-01T00:00:00.000Z',travelBufferMinutes:15,rateCents:99999,salaryCents:88888,notesInternal:'PRIVATE_EMPLOYEE_HR_CANARY',absences:[{reason:'PRIVATE_LEAVE_CANARY'}]});
  const rows=await f.read('manager','employee');expect(rows.map(row=>row.id).sort()).toEqual(['employee-peer','employee-worker']);
  expect(rows.find(row=>row.id==='employee-worker')!.data).toEqual({active:true,userId:'worker',name:'Own crew alias',businessCode:'CREW-A',skills:['PAINT'],availabilityWindows:[{startAt:NOW,endAt:'2026-10-09T18:00:00.000Z'}],availabilityValidUntil:'2026-11-01T00:00:00.000Z',travelBufferMinutes:15});
  expect(JSON.stringify(rows)).not.toMatch(/rateCents|salaryCents|notesInternal|PRIVATE_EMPLOYEE_HR_CANARY|PRIVATE_LEAVE_CANARY|absences/);
 });
 it('legacy employee siteIds cannot bypass current canonical user scope, activity or company',async()=>{
  const f=await cpuFixture();f.tx.patch('employee','employee-worker',{siteIds:['site-a']});const stale=await f.engine.getActor('manager',f.tx.companyId);
  f.tx.patch('user','worker',{siteIds:['site-b']});expect((await f.engine.readEntities(stale,'employee')).map(row=>row.id)).toEqual(['employee-peer']);
  f.tx.patch('user','worker',{siteIds:['site-a']});f.tx.patch('employee','employee-worker',{active:false});expect((await f.engine.readEntities(stale,'employee')).map(row=>row.id)).toEqual(['employee-peer']);
  f.tx.patch('employee','employee-worker',{active:true});f.tx.patch('user','worker',{active:false});expect((await f.engine.readEntities(stale,'employee')).map(row=>row.id)).toEqual(['employee-peer']);
  f.tx.patch('user','worker',{active:true,roles:['EMPLOYEE','CLIENT']});expect((await f.engine.readEntities(stale,'employee')).map(row=>row.id)).toEqual(['employee-peer']);
  const source=await f.tx.get('employee','employee-peer');expect(await f.engine.visible(f.tx as unknown as PgTransaction,stale,{...source,companyId:'foreign-company',data:{...source.data,siteIds:['site-a']}})).toBe(false);
 });
 it('current manager role and site revocation deny the canonical employee directory with a stale actor',async()=>{
  const f=await cpuFixture(),stale=await f.engine.getActor('manager',f.tx.companyId);expect(await f.engine.readEntities(stale,'employee')).toHaveLength(2);
  f.tx.patch('user','manager',{siteIds:[]});expect(await f.engine.readEntities(stale,'employee')).toEqual([]);
  f.tx.patch('user','manager',{siteIds:['site-a'],roles:[],permissions:['dispatch.acknowledge']});expect(await f.engine.readEntities(stale,'employee')).toEqual([]);
  f.tx.patch('user','manager',{permissions:['dispatch.manage','scope.company']});expect(await f.engine.readEntities(stale,'employee')).toHaveLength(2);
 });
});

// Actual SQL/Engine read assertions. Missing DATABASE_URL is genuinely NOT_RUN.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 own crew visibility on genuine PostgreSQL with current authority',()=>{
 let db:Database,engine:Engine,company:string;
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{company='v4-crew-visibility-qa-'+randomUUID();await db.transaction(company,'SYNTHETIC_CREW_VISIBILITY_SETUP',tx=>seed(tx));});afterAll(async()=>{await db?.close();});
 const read=async(userId='worker',kind='crew_assignment')=>engine.readEntities(await engine.getActor(userId,company),kind);
 async function patch(kind:string,id:string,data:Data){return db.transaction(company,'SYNTHETIC_CREW_VISIBILITY_CHANGE',async tx=>{const row=await tx.get(kind,id);return tx.save(row,{...row.data,...data});});}
 it('actual SQL lists only the canonical own alias and returns a minimal roster projection',async()=>{
  const rows=await read();expect(rows.map(row=>row.id)).toEqual(['own-assignment']);expect(rows[0]!.data.employeeId).toBe('employee-worker');expect(JSON.stringify(rows)).not.toMatch(/employee-peer|PRIVATE_CREW_COST_CANARY|employeeIds|acknowledgedIds|internalCost/);
  expect((await read('manager')).map(row=>row.id).sort()).toEqual(['own-assignment','peer-assignment']);
 });
 it('actual changed site, alias activity and current permission revoke previously readable records',async()=>{
  const stale=await engine.getActor('worker',company);expect(await engine.readEntities(stale,'crew_assignment')).toHaveLength(1);
  await patch('user','worker',{siteIds:[]});expect(await engine.readEntities(stale,'crew_assignment')).toEqual([]);
  await patch('user','worker',{siteIds:['site-a']});await patch('employee','employee-worker',{active:false});expect(await engine.readEntities(stale,'crew_assignment')).toEqual([]);
  await patch('employee','employee-worker',{active:true});await patch('user','worker',{roles:[],permissions:[]});expect(await engine.readEntities(stale,'crew_assignment')).toEqual([]);
 });
 it('actual cancelled roster stays available to its own worker and the notice rechecks the current crew relationship',async()=>{
  await patch('crew_assignment','own-assignment',{status:'CANCELLED',cancelledAt:NOW,cancellationReason:'Synthetic cancellation'});expect((await read())[0]!.data.status).toBe('CANCELLED');expect((await read('worker','notification')).map(row=>row.id)).toEqual(['cancel-notice']);
  await patch('crew_assignment','own-assignment',{employeeIds:['employee-peer']});expect(await read('worker','notification')).toEqual([]);expect(await read()).toEqual([]);
 });
 it('actual foreign-company roster cannot enter a manager or employee read',async()=>{
  const foreign='foreign-crew-'+randomUUID();await db.transaction(foreign,'SYNTHETIC_FOREIGN_CREW',tx=>tx.add('crew_assignment',{siteId:'site-a',employeeIds:['employee-worker'],status:'ACKNOWLEDGED'},'private-foreign-crew'));
  expect((await read()).every(row=>row.companyId===company)).toBe(true);expect((await read('manager')).every(row=>row.companyId===company&&row.id!=='private-foreign-crew')).toBe(true);
 });
 it('actual scoped dispatch employee directory uses aliases and omits private HR and cost fields',async()=>{
  await patch('employee','employee-worker',{skills:['PAINT'],rateCents:123456,salaryCents:777777,notesInternal:'PRIVATE_EMPLOYEE_HR_CANARY',availabilityWindows:[{startAt:NOW,endAt:'2026-10-09T18:00:00.000Z'}]});
  const rows=await read('manager','employee');expect(rows.map(row=>row.id).sort()).toEqual(['employee-peer','employee-worker']);expect(rows.find(row=>row.id==='employee-worker')!.data).toMatchObject({userId:'worker',skills:['PAINT'],availabilityWindows:[{startAt:NOW,endAt:'2026-10-09T18:00:00.000Z'}]});expect(JSON.stringify(rows)).not.toMatch(/rateCents|salaryCents|notesInternal|PRIVATE_EMPLOYEE_HR_CANARY/);
  const foreign='foreign-directory-'+randomUUID();await db.transaction(foreign,'SYNTHETIC_FOREIGN_EMPLOYEE',tx=>tx.add('employee',{active:true,userId:'worker',siteIds:['site-a']},'foreign-employee'));expect((await read('manager','employee')).every(row=>row.companyId===company&&row.id!=='foreign-employee')).toBe(true);
 });
 it('actual current parent user and manager revocation deny legacy employee site hints',async()=>{
  await patch('employee','employee-worker',{siteIds:['site-a']});const stale=await engine.getActor('manager',company);
  await patch('user','worker',{siteIds:['site-b']});expect((await engine.readEntities(stale,'employee')).map(row=>row.id)).toEqual(['employee-peer']);
  await patch('user','worker',{siteIds:['site-a'],active:false});expect((await engine.readEntities(stale,'employee')).map(row=>row.id)).toEqual(['employee-peer']);
  await patch('user','worker',{active:true});await patch('employee','employee-worker',{active:false});expect((await engine.readEntities(stale,'employee')).map(row=>row.id)).toEqual(['employee-peer']);
  await patch('user','manager',{siteIds:[]});expect(await engine.readEntities(stale,'employee')).toEqual([]);
  await patch('user','manager',{siteIds:['site-a'],roles:[],permissions:['dispatch.acknowledge']});expect(await engine.readEntities(stale,'employee')).toEqual([]);
 });
});
