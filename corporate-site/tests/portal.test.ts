import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../worker/api';
import type { D1Database, D1Result, D1Statement, WorkerEnv } from '../worker/types';
import type { PortalDashboard, PortalSession } from '../src/lib/portal-contract';

/** Integration fixture: real SQLite, D1-compatible prepared statements and batches.
 * Identity headers model the Sites trusted gateway; they are not a login bypass. */
class SqliteD1 implements D1Database {
  sql = new DatabaseSync(':memory:');
  errors: string[]=[];
  beforeBatch?: () => void;
  constructor() {
    this.sql.exec('PRAGMA foreign_keys=ON;');
    for (const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) this.sql.exec(readFileSync(`drizzle/${file}`,'utf8'));
  }
  prepare(sql: string): D1Statement {
    const db=this;let values: unknown[]=[];
    return {
      bind(...args: unknown[]) {values=args;return this;},
      async first<T>(column?: string) {try{const row=db.sql.prepare(sql).get(...values as never[]) as Record<string,unknown>|undefined;return row?(column?row[column]:row) as T:null;}catch(e){db.errors.push(`${sql}: ${String(e)}`);throw e;}},
      async all<T>() {return {success:true,results:db.sql.prepare(sql).all(...values as never[]) as T[]};},
      async run(){try{const result=db.sql.prepare(sql).run(...values as never[]);return {success:true,results:[],meta:{changes:Number(result.changes)}};}catch(e){db.errors.push(`${sql}: ${String(e)}`);throw e;}},
    };
  }
  async batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]> {
    this.beforeBatch?.();this.beforeBatch=undefined;
    this.sql.exec('BEGIN');
    try {const results=[];for(const s of statements)results.push(await s.run());this.sql.exec('COMMIT');return results as D1Result<T>[];}
    catch(e){this.sql.exec('ROLLBACK');throw e;}
  }
}
const origin='https://kneba.vsp.rest';
const identities={owner:['owner-user','owner@example.test'],client:['client-user','client@example.test'],client2:['client-2','other@example.test'],worker:['worker-user','worker@example.test'],worker2:['worker-2','worker2@example.test'],admin:['admin-user','admin@example.test'],bauleiter:['bauleiter-user','bauleiter@example.test'],bauleiter2:['bauleiter-2','bauleiter2@example.test']} as const;
type Person=keyof typeof identities;
const headers=(person?:Person) => ({'Content-Type':'application/json',Origin:origin,'X-KnaBa-Request':'portal-v1','CF-Connecting-IP':'192.0.2.20',...(person?{'oai-authenticated-user-id':identities[person][0],'oai-authenticated-user-email':identities[person][1]}:{})});
const input=()=>({service:'bueroreinigung',objectType:'Büro / Gewerbe',postcode:'10315',area:'200',frequency:'Regelmäßig',message:'Bitte außerhalb der Bürozeiten.',address:'Teststraße 1',privacyAccepted:true,idempotencyKey:crypto.randomUUID()});
const lead=()=>({...input(),name:'Testkundin',email:'contact@example.test',phone:'',website:''});
let db:SqliteD1,env:WorkerEnv;
async function call(path:string,person?:Person,method='GET',body?:unknown,extra?:Record<string,string>) {
  return handleApi(new Request(origin+path,{method,headers:{...headers(person),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
}
async function register(person:Person,requestedRole:'client'|'worker'|'bauleiter'='client') {
  const response=await call('/api/portal/register',person,'POST',{name:`Test ${person}`,requestedRole,privacyAccepted:true});
  expect(response.status,db.errors.join('\n')).toBe(201);return (await response.json()).profile;
}
async function approve(person:Person,role:'client'|'worker'|'admin'|'bauleiter') {
  const p=await register(person,role==='worker'?'worker':role==='bauleiter'?'bauleiter':'client');
  const response=await call('/api/portal/roles','owner','POST',{userId:p.id,role,status:'approved',version:p.version});
  expect(response.status,db.errors.join('\n')).toBe(200);return (await response.json()).profile;
}
async function create(person:Person='client') {
  const response=await call('/api/portal/requests',person,'POST',input());
  expect(response.status,db.errors.join('\n')).toBe(201);return (await response.json()).request;
}
async function patch(requestId:string,person:Person,payload:unknown) {
  const r=await call(`/api/portal/requests/${requestId}`,person,'PATCH',payload);
  expect(r.status,`${await r.clone().text()} ${db.errors.join('\n')}`).toBe(200);return (await r.json()).request;
}
beforeEach(()=>{db=new SqliteD1();env={DB:db,OWNER_EMAIL:'owner@example.test'};});
afterEach(()=>db.sql.close());

describe('portal identity and approval',()=>{
  it('anonymous session is safe and protected data/mutations require sign-in',async()=>{
    const r=await call('/api/portal/session');expect(await r.json()).toEqual({user:null,profile:null,role:'anonymous'});
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect((await call('/api/portal/dashboard')).status).toBe(401);
    expect((await call('/api/portal/register',undefined,'POST',{name:'x'})).status).toBe(401);
  });
  it('registration starts pending; only exact configured owner gets owner role',async()=>{
    await register('client');const s=await (await call('/api/portal/session','client')).json() as PortalSession;
    expect(db.sql.prepare('SELECT privacy_version FROM profiles WHERE id=?').get(identities.client[0])?.privacy_version).toBe('2026-10-28');
    expect(s.role).toBe('pending');expect(s.profile?.role).toBeNull();
    expect((await call('/api/portal/requests','client','POST',input())).status).toBe(403);
    expect((await call('/api/portal/roles','client','POST',{userId:identities.client[0],role:'admin',status:'approved',version:1})).status).toBe(403);
    expect((await (await call('/api/portal/session','owner')).json()).role).toBe('owner');
    const unconfigured=await handleApi(new Request(origin+'/api/portal/session',{headers:headers('owner')}),{DB:db});
    expect((await unconfigured.json()).role).toBe('pending');
  });
  it('rejects requested admin and injected approval fields',async()=>{
    expect((await call('/api/portal/register','client','POST',{name:'Test',requestedRole:'admin',privacyAccepted:true})).status).toBe(422);
    expect((await call('/api/portal/register','client','POST',{name:'Test',requestedRole:'client',privacyAccepted:true,role:'admin'})).status).toBe(422);
  });
  it('owner grants roles and suspension takes effect on the next request',async()=>{
    const p=await approve('client','client');await create();
    expect((await (await call('/api/portal/dashboard','client')).json()).requests).toHaveLength(1);
    const r=await call('/api/portal/roles','owner','POST',{userId:p.id,role:'client',status:'suspended',version:p.version});expect(r.status).toBe(200);
    const d=await (await call('/api/portal/dashboard','client')).json();expect(d.session.role).toBe('suspended');expect(d.requests).toEqual([]);
    expect((await call('/api/portal/requests','client','POST',input())).status).toBe(403);
  });
  it('admin cannot assign roles or read pending registration directory',async()=>{
    await approve('admin','admin');await register('client');await approve('worker','worker');
    expect((await call('/api/portal/roles','admin','POST',{userId:identities.client[0],role:'admin',status:'approved',version:1})).status).toBe(403);
    const d=await (await call('/api/portal/dashboard','admin')).json() as PortalDashboard;
    expect(d.profiles.map(p=>p.id)).toEqual([identities.worker[0]]);expect(d.profiles[0].email).toBe('');expect(d.audit).toEqual([]);
  });
  it('approval cannot change owner; stale versions do not overwrite changes',async()=>{
    const owner=await register('owner');expect((await call('/api/portal/roles','owner','POST',{userId:owner.id,role:'admin',status:'approved',version:1})).status).toBe(403);
    const p=await approve('client','client');
    expect((await call('/api/portal/roles','owner','POST',{userId:p.id,role:'worker',status:'approved',version:1})).status).toBe(409);
    expect((await (await call('/api/portal/session','client')).json()).role).toBe('client');
  });
  it('changed identity email cannot inherit an approved profile',async()=>{
    await approve('client','client');const r=await call('/api/portal/session','client','GET',undefined,{'oai-authenticated-user-email':'changed@example.test'});expect((await r.json()).role).toBe('suspended');
  });
  it('malformed database roles fail closed instead of becoming an unfiltered dashboard',async()=>{
    await approve('client','client');await create();await approve('client2','client');
    db.sql.prepare("UPDATE profiles SET role='superadmin' WHERE id=?").run(identities.client2[0]);
    const d=await (await call('/api/portal/dashboard','client2')).json();expect(d.session.role).toBe('suspended');expect(d.requests).toEqual([]);expect(d.profiles).toEqual([]);
    expect((await call('/api/portal/requests','client2','POST',input())).status).toBe(403);
  });
});

describe('real request persistence, isolation and job workflow',()=>{
  it('customer sees only own requests; another customer cannot alter one',async()=>{
    await approve('client','client');await approve('client2','client');const r=await create();
    const d=await (await call('/api/portal/dashboard','client2')).json();expect(d.requests).toEqual([]);
    expect((await call(`/api/portal/requests/${r.id}`,'client2','PATCH',{version:r.version,status:'cancelled'})).status).toBe(404);
    expect((await call(`/api/portal/requests/${r.id}`,'client','PATCH',{version:r.version,assignedWorkerId:identities.client[0]})).status).toBe(422);
  });
  it('idempotent submissions return the same persisted request; changed payload conflicts',async()=>{
    await approve('client','client');const data=input();const first=await call('/api/portal/requests','client','POST',data);const firstData=await first.json();expect(first.status,db.errors.join('\n')).toBe(201);
    const repeat=await call('/api/portal/requests','client','POST',data);expect(repeat.status).toBe(200);expect((await repeat.json()).request.id).toBe(firstData.request.id);
    expect((await call('/api/portal/requests','client','POST',{...data,message:'Other'})).status).toBe(409);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM cleaning_requests').get()?.n).toBe(1);
  });
  it('owner/admin schedules, assigned worker progresses and customer leaves feedback',async()=>{
    await approve('client','client');await approve('worker','worker');await approve('worker2','worker');await approve('admin','admin');
    let r=await create();r=await patch(r.id,'admin',{version:r.version,status:'reviewing'});
    expect((await call(`/api/portal/requests/${r.id}`,'admin','PATCH',{version:r.version,status:'scheduled'})).status).toBe(422);
    r=await patch(r.id,'admin',{version:r.version,status:'scheduled',assignedWorkerId:identities.worker[0],scheduledAt:'2026-11-01T08:00:00Z'});
    expect((await (await call('/api/portal/dashboard','worker2')).json()).requests).toEqual([]);
    const w=(await (await call('/api/portal/dashboard','worker')).json()).requests[0];expect(w.id).toBe(r.id);expect(w.email).toBeUndefined();expect(w.phone).toBeUndefined();expect(w.clientId).toBeNull();
    expect((await call(`/api/portal/requests/${r.id}`,'worker2','PATCH',{version:r.version,status:'in_progress'})).status).toBe(404);
    expect((await call(`/api/portal/requests/${r.id}`,'worker','PATCH',{version:r.version,status:'completed'})).status).toBe(403);
    r=await patch(r.id,'worker',{version:r.version,status:'in_progress'});
    expect((await call(`/api/portal/requests/${r.id}`,'worker','PATCH',{version:r.version,status:'completed'})).status).toBe(422);
    r=await patch(r.id,'worker',{version:r.version,status:'completed',checklist:['access_checked','surfaces_cleaned','quality_checked','reported'],workerNote:'Interner Hinweis'});
    r=await patch(r.id,'client',{version:r.version,customerFeedback:'Vielen Dank.'});expect(r.workerNote).toBeUndefined();expect(r.customerFeedback).toBe('Vielen Dank.');
    r=await patch(r.id,'admin',{version:r.version,adminReply:'Vielen Dank für Ihre Rückmeldung.'});expect(r.adminReply).toContain('Vielen Dank');
    const final=(await (await call('/api/portal/dashboard','client')).json()).requests[0];expect(final.status).toBe('completed');expect(final.workerNote).toBeUndefined();
  });
  it('does not allow assignment to pending or suspended workers',async()=>{
    await approve('client','client');await register('worker','worker');let r=await create();r=await patch(r.id,'owner',{version:r.version,status:'reviewing'});
    expect((await call(`/api/portal/requests/${r.id}`,'owner','PATCH',{version:r.version,status:'scheduled',assignedWorkerId:identities.worker[0],scheduledAt:'2026-11-01T08:00:00Z'})).status).toBe(422);
  });
  it('cannot complete a checked job while reassigning it to a different worker',async()=>{
    await approve('client','client');await approve('worker','worker');await approve('worker2','worker');
    let r=await create();r=await patch(r.id,'owner',{version:r.version,status:'reviewing'});
    r=await patch(r.id,'owner',{version:r.version,status:'scheduled',assignedWorkerId:identities.worker[0],scheduledAt:'2026-11-01T08:00:00Z'});
    r=await patch(r.id,'worker',{version:r.version,status:'in_progress',checklist:['access_checked','surfaces_cleaned','quality_checked','reported']});
    expect((await call(`/api/portal/requests/${r.id}`,'owner','PATCH',{version:r.version,status:'completed',assignedWorkerId:identities.worker2[0]})).status).toBe(409);
    const stored=db.sql.prepare('SELECT status,assigned_worker_id,checklist FROM cleaning_requests WHERE id=?').get(r.id);
    expect(stored?.status).toBe('in_progress');expect(stored?.assigned_worker_id).toBe(identities.worker[0]);expect(JSON.parse(String(stored?.checklist))).toHaveLength(4);
  });
  it('requires active existing assignee and fences concurrent worker suspension',async()=>{
    await approve('client','client');const p=await approve('worker','worker');
    let r=await create();r=await patch(r.id,'owner',{version:r.version,status:'reviewing',assignedWorkerId:p.id,scheduledAt:'2026-11-01T08:00:00Z'});
    db.beforeBatch=()=>{db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(p.id);};
    expect((await call(`/api/portal/requests/${r.id}`,'owner','PATCH',{version:r.version,status:'scheduled'})).status).toBe(409);
    expect((await call(`/api/portal/requests/${r.id}`,'owner','PATCH',{version:r.version,status:'scheduled'})).status).toBe(422);
    expect(db.sql.prepare('SELECT status FROM cleaning_requests WHERE id=?').get(r.id)?.status).toBe('reviewing');
  });
  it('client can cancel before scheduling and cannot add feedback before completion',async()=>{
    await approve('client','client');let r=await create();expect((await call(`/api/portal/requests/${r.id}`,'client','PATCH',{version:r.version,customerFeedback:'x'})).status).toBe(409);
    r=await patch(r.id,'client',{version:r.version,status:'cancelled'});expect(r.status).toBe('cancelled');
    expect((await call(`/api/portal/requests/${r.id}`,'owner','PATCH',{version:r.version,status:'reviewing'})).status).toBe(409);
  });
  it('optimistic locking prevents lost updates and adds no false audit',async()=>{
    await approve('client','client');const r=await create();await patch(r.id,'owner',{version:r.version,status:'reviewing'});
    const n=db.sql.prepare('SELECT COUNT(*) AS n FROM portal_audit').get()?.n;
    expect((await call(`/api/portal/requests/${r.id}`,'owner','PATCH',{version:r.version,status:'cancelled'})).status).toBe(409);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM portal_audit').get()?.n).toBe(n);
  });
  it('audit contains actions and identifiers, not personal request content',async()=>{
    await approve('client','client');await create();const d=await (await call('/api/portal/dashboard','owner')).json() as PortalDashboard;
    expect(d.audit.map(a=>a.action)).toContain('role.approved.client');expect(d.audit.map(a=>a.action)).toContain('request.created');
    expect(JSON.stringify(d.audit)).not.toContain('example.test');expect(JSON.stringify(d.audit)).not.toContain('Bürozeiten');
  });
});

describe('public lead intake and request boundaries',()=>{
  it('stores a public lead and returns only acknowledgment; replay is safe',async()=>{
    const data=lead();const first=await call('/api/leads',undefined,'POST',data);expect(first.status,db.errors.join('\n')).toBe(201);const body=await first.json();expect(Object.keys(body).sort()).toEqual(['id','received']);
    expect(db.sql.prepare('SELECT privacy_version FROM cleaning_requests WHERE id=?').get(body.id)?.privacy_version).toBe('2026-10-28');
    // A replay must not rewrite a previously recorded acknowledgement to the new notice version.
    db.sql.prepare('UPDATE cleaning_requests SET privacy_version=? WHERE id=?').run('2026-10-24',body.id);
    const repeat=await call('/api/leads',undefined,'POST',data);expect(repeat.status).toBe(200);expect((await repeat.json()).id).toBe(body.id);
    expect(db.sql.prepare('SELECT privacy_version FROM cleaning_requests WHERE id=?').get(body.id)?.privacy_version).toBe('2026-10-24');
    const d=await (await call('/api/portal/dashboard','owner')).json();expect(d.requests[0].id).toBe(body.id);expect(d.requests[0].clientId).toBeNull();
  });
  it('limits repeated anonymous leads and rejects honeypot',async()=>{
    expect((await call('/api/leads',undefined,'POST',{...lead(),website:'spam'})).status).toBe(422);
    for(let i=0;i<5;i++)expect((await call('/api/leads',undefined,'POST',lead())).status,db.errors.join('\n')).toBe(201);
    expect((await call('/api/leads',undefined,'POST',lead())).status).toBe(429);
  });
  it('missing optional IP does not group all visitors into a global rate limit',async()=>{
    for(let i=0;i<6;i++)expect((await call('/api/leads',undefined,'POST',{...lead(),email:`visitor${i}@example.test`},{'CF-Connecting-IP':''})).status).toBe(201);
  });
  it('validates fields and never permits role/client injection or false privacy',async()=>{
    expect((await call('/api/leads',undefined,'POST',{...lead(),postcode:'abc'})).status).toBe(422);
    expect((await call('/api/leads',undefined,'POST',{...lead(),clientId:'victim'})).status).toBe(422);
    expect((await call('/api/leads',undefined,'POST',{...lead(),privacyAccepted:false})).status).toBe(422);
  });
  it('rejects cross-origin, missing custom header, oversized and non-JSON payloads',async()=>{
    expect((await call('/api/leads',undefined,'POST',lead(),{Origin:'https://evil.test'})).status).toBe(403);
    expect((await call('/api/leads',undefined,'POST',lead(),{'X-KnaBa-Request':''})).status).toBe(403);
    expect((await call('/api/leads',undefined,'POST',lead(),{'Content-Type':'text/plain'})).status).toBe(415);
    expect((await call('/api/leads',undefined,'POST',{...lead(),message:'x'.repeat(13000)})).status).toBe(413);
    const malformed=await handleApi(new Request(origin+'/api/leads',{method:'POST',headers:headers(),body:'{'}),env);expect(malformed.status).toBe(400);
  });
  it('storage or owner configuration absence fails closed without leaking details',async()=>{
    const r=await handleApi(new Request(origin+'/api/portal/dashboard',{headers:headers('owner')}),{});expect(r.status).toBe(503);expect(await r.text()).not.toContain('owner@example.test');
    const health=await handleApi(new Request(origin+'/api/portal/health'),{DB:db});expect(health.status).toBe(503);
    expect((await call('/api/portal/health')).status).toBe(200);
  });
});


describe('Bauleiter assignment scope and coordination',()=>{
  it('requested Bauleiter remains pending until owner approval and has no admin rights',async()=>{
    const profile=await register('bauleiter','bauleiter');
    const pending=await (await call('/api/portal/dashboard','bauleiter')).json();
    expect(pending.session.role).toBe('pending');expect(pending.requests).toEqual([]);
    expect((await call('/api/portal/roles','bauleiter','POST',{userId:profile.id,role:'bauleiter',status:'approved',version:profile.version})).status).toBe(403);
    expect((await call('/api/portal/roles','owner','POST',{userId:profile.id,role:'bauleiter',status:'approved',version:profile.version})).status).toBe(200);
    const data=await (await call('/api/portal/dashboard','bauleiter')).json();
    expect(data.session.role).toBe('bauleiter');expect(data.requests).toEqual([]);expect(data.profiles).toEqual([]);expect(data.audit).toEqual([]);
    expect((await call('/api/crm/contacts','bauleiter')).status).toBe(403);
    expect((await call('/api/studio/pages','bauleiter')).status).toBe(403);
    expect((await call('/api/portal/requests','bauleiter','POST',input())).status).toBe(403);
  });
  it('only assigned work is visible and another Bauleiter cannot read or edit it',async()=>{
    await approve('client','client');await approve('bauleiter','bauleiter');await approve('bauleiter2','bauleiter');await approve('worker','worker');await register('client2');
    let assigned=await create();const other=await create();
    assigned=await patch(assigned.id,'owner',{version:assigned.version,assignedBauleiterId:identities.bauleiter[0]});
    const data=await (await call('/api/portal/dashboard','bauleiter')).json();
    expect(data.requests.map((r:{id:string})=>r.id)).toEqual([assigned.id]);expect(data.audit).toEqual([]);
    expect(data.profiles.map((p:{id:string})=>p.id)).toEqual([identities.worker[0]]);
    expect(data.profiles.every((p:{email:string})=>p.email==='')).toBe(true);
    expect(data.requests[0].email).toBeUndefined();expect(data.requests[0].phone).toBeUndefined();expect(data.requests[0].clientId).toBeNull();
    expect((await (await call('/api/portal/dashboard','bauleiter2')).json()).requests).toEqual([]);
    expect((await call(`/api/portal/requests/${assigned.id}`,'bauleiter2','PATCH',{version:assigned.version,status:'reviewing'})).status).toBe(404);
    expect((await call(`/api/portal/requests/${other.id}`,'bauleiter','PATCH',{version:other.version,status:'reviewing'})).status).toBe(404);
    expect((await call(`/api/portal/requests/${assigned.id}`,'bauleiter','PATCH',{version:assigned.version,assignedBauleiterId:identities.bauleiter2[0]})).status).toBe(422);
  });
  it('assigned Bauleiter schedules an approved worker and tracks completion without bypassing checklist',async()=>{
    await approve('client','client');await approve('bauleiter','bauleiter');await approve('worker','worker');await approve('worker2','worker');
    let r=await create();r=await patch(r.id,'owner',{version:r.version,assignedBauleiterId:identities.bauleiter[0]});
    r=await patch(r.id,'bauleiter',{version:r.version,status:'reviewing'});
    r=await patch(r.id,'bauleiter',{version:r.version,status:'scheduled',assignedWorkerId:identities.worker[0],scheduledAt:'2026-11-01T08:00:00Z',adminReply:'Termin vereinbart'});
    r=await patch(r.id,'worker',{version:r.version,status:'in_progress'});
    expect((await call(`/api/portal/requests/${r.id}`,'bauleiter','PATCH',{version:r.version,status:'completed'})).status).toBe(422);
    r=await patch(r.id,'worker',{version:r.version,checklist:['access_checked','surfaces_cleaned','quality_checked','reported'],workerNote:'Intern geprüft'});
    r=await patch(r.id,'bauleiter',{version:r.version,status:'completed'});expect(r.status).toBe('completed');expect(r.workerNote).toBe('Intern geprüft');
    const historical=await (await call('/api/portal/dashboard','bauleiter')).json();expect(historical.profiles.map((p:{id:string})=>p.id)).toEqual([identities.worker[0]]);
    const customer=await (await call('/api/portal/dashboard','client')).json();
    expect(customer.requests[0].assignedBauleiterId).toBeUndefined();expect(customer.requests[0].workerNote).toBeUndefined();
    const worker=await (await call('/api/portal/dashboard','worker')).json();expect(worker.requests[0].assignedBauleiterId).toBeUndefined();
  });
  it('owner/admin assigns or removes Bauleiter while clients/workers cannot inject assignment',async()=>{
    await approve('client','client');await approve('worker','worker');await approve('bauleiter','bauleiter');await approve('admin','admin');
    let r=await create();
    for(const person of ['client','worker'] as Person[])expect((await call(`/api/portal/requests/${r.id}`,person,'PATCH',{version:r.version,assignedBauleiterId:identities.bauleiter[0]})).status).toBe(422);
    r=await patch(r.id,'admin',{version:r.version,assignedBauleiterId:identities.bauleiter[0]});
    expect(r.assignedBauleiterId).toBe(identities.bauleiter[0]);
    const directory=await (await call('/api/portal/dashboard','admin')).json();expect(directory.profiles.map((p:{id:string})=>p.id)).toContain(identities.bauleiter[0]);
    r=await patch(r.id,'admin',{version:r.version,assignedBauleiterId:null});
    expect((await (await call('/api/portal/dashboard','bauleiter')).json()).requests).toEqual([]);
    expect((await call(`/api/portal/requests/${r.id}`,'bauleiter','PATCH',{version:r.version,status:'reviewing'})).status).toBe(404);
  });
  it('rejects pending or wrong-role supervisors and fences concurrent supervisor suspension',async()=>{
    await approve('client','client');await register('bauleiter','bauleiter');await approve('worker','worker');let r=await create();
    for(const assignee of [identities.bauleiter[0],identities.worker[0]])expect((await call(`/api/portal/requests/${r.id}`,'owner','PATCH',{version:r.version,assignedBauleiterId:assignee})).status).toBe(422);
    await call('/api/portal/roles','owner','POST',{userId:identities.bauleiter[0],role:'bauleiter',status:'approved',version:1});
    db.beforeBatch=()=>{db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(identities.bauleiter[0]);};
    expect((await call(`/api/portal/requests/${r.id}`,'owner','PATCH',{version:r.version,assignedBauleiterId:identities.bauleiter[0]})).status).toBe(409);
    expect(db.sql.prepare('SELECT assigned_bauleiter_id FROM cleaning_requests WHERE id=?').get(r.id)?.assigned_bauleiter_id).toBeNull();
  });
  it('fences concurrent reassignment and role revocation without writing data or audit',async()=>{
    await approve('client','client');await approve('bauleiter','bauleiter');await approve('bauleiter2','bauleiter');
    let r=await create();r=await patch(r.id,'owner',{version:r.version,assignedBauleiterId:identities.bauleiter[0]});
    const before=Number(db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n);
    db.beforeBatch=()=>{db.sql.prepare('UPDATE cleaning_requests SET assigned_bauleiter_id=? WHERE id=?').run(identities.bauleiter2[0],r.id);};
    expect((await call(`/api/portal/requests/${r.id}`,'bauleiter','PATCH',{version:r.version,status:'reviewing'})).status).toBe(409);
    expect(db.sql.prepare('SELECT status FROM cleaning_requests WHERE id=?').get(r.id)?.status).toBe('new');
    expect(Number(db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n)).toBe(before);
    db.beforeBatch=()=>{db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(identities.bauleiter2[0]);};
    expect((await call(`/api/portal/requests/${r.id}`,'bauleiter2','PATCH',{version:r.version,status:'reviewing'})).status).toBe(409);
    expect(Number(db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n)).toBe(before);
  });
});
