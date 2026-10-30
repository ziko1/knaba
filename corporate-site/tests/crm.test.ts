import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../worker/api';
import type { D1Database, D1Statement, D1Result, WorkerEnv } from '../worker/types';

class D1Fake implements D1Database {
  db=new DatabaseSync(':memory:');
  constructor() {
    this.db.exec('PRAGMA foreign_keys=ON');
    for(const file of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())
      this.db.exec(readFileSync('drizzle/'+file,'utf-8'));
  }
  prepare(sql: string): D1Statement {
    const wrapper=this;let args:unknown[]=[];
    return {
      bind(...v:unknown[]){args=v;return this;},
      async first<T>(column?:string) {
        const row=wrapper.db.prepare(sql).get(...args as never[]) as Record<string, unknown>|undefined;
        return row ? (column?row[column]:row) as T : null;
      },
      async all<T>() {return {success:true,results:wrapper.db.prepare(sql).all(...args as never[]) as T[]};},
      async run() {const r=wrapper.db.prepare(sql).run(...args as never[]);return {success:true,meta:{changes:Number(r.changes)}};}
    };
  }
  async batch<T>(statements:D1Statement[]):Promise<D1Result<T>[]> {
    this.db.exec('BEGIN');
    try {
      const out: D1Result<T>[]=[];
      for(const statement of statements)out.push(await statement.run() as D1Result<T>);
      this.db.exec('COMMIT');return out;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
}
const origin='https://kneba.vsp.rest';
const identity={
  owner:['test-owner','owner@example.test'],
  admin:['test-admin','admin@example.test'],
  client:['test-client','client@example.test']
} as const;
type Person=keyof typeof identity;
function req(path:string,person?:Person,method='GET',body?:unknown,extra:Record<string,string>={}){
  return new Request(origin+path,{method,headers:{
    'Origin':origin,'Content-Type':'application/json','X-KnaBa-Request':'portal-v1',
    ...(person?{'oai-authenticated-user-id':identity[person][0],'oai-authenticated-user-email':identity[person][1]}:{}),...extra
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function seed(db:D1Fake){
  const now=new Date().toISOString();
  for(const [id,email,role] of [
    ['test-admin','admin@example.test','admin'],['test-client','client@example.test','client']
  ])db.db.prepare('INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
    .run(id,'Test person',email,role,role,'approved','test',now,now,'seed');

  function lead(id:string,contactEmail:string,name:string,updatedAt='2026-10-24T10:00:00.000Z'){
    const cols:Record<string,unknown>={
      id,service:'office',object_type:'business',postcode:'10115',area:'55',frequency:'once',
      message:'Please call',contact_name:name,email:contactEmail,phone:'+49 111',address:'Berlin',
      status:'new',checklist:'[]',worker_note:'',customer_feedback:'',admin_reply:'',
      dedupe_scope:id,idempotency_key:'req-'+id,payload_hash:'demo',privacy_version:'test',
      created_at:updatedAt,updated_at:updatedAt,version:1,last_mutation:'seed'
    };
    db.db.prepare('INSERT INTO cleaning_requests ('+Object.keys(cols).join(',')+
      ') VALUES ('+Object.keys(cols).map(()=>'?').join(',')+')').run(...Object.values(cols) as never[]);
  }
  lead('lead-1',' SALES@EXAMPLE.TEST ','Client A');
  lead('lead-2','sales@example.test','Client Updated','2026-10-24T11:00:00.000Z');
  lead('lead-3','other@example.test','Other');
}
function setup(){
  const db=new D1Fake(); seed(db);
  const env:WorkerEnv={DB:db,OWNER_EMAIL:'owner@example.test'};
  return {db,env};
}
async function list(env:WorkerEnv,person:Person='owner'){
  const r=await handleApi(req('/api/crm/contacts',person),env);
  expect(r.status,await r.clone().text()).toBe(200);
  return (await r.json()) as {contacts:Array<{id:string;email:string;name:string;requestCount:number;
    stage:string;tags:string[];version:number}>;limited:boolean};
}
describe('KNABA CRM shared leads, role isolation, versioning',()=>{
  it('creates additive CRM tables without changing request/assistant schema',()=>{
    const {db}=setup();
    try{
      const names=db.db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all() as {name:string}[];
      for(const name of ['cleaning_requests','assistant_conversations','assistant_messages','studio_pages','studio_revisions',
        'crm_contact_state','crm_contact_notes']) expect(names.map(n=>n.name)).toContain(name);
      expect(db.db.prepare('SELECT COUNT(*) AS n FROM cleaning_requests').get()).toMatchObject({n:3});
    }finally{db.db.close();}
  });
  it('rejects anonymous and client access; approved admin and owner can list',async()=>{
    const {db,env}=setup();
    try{
      expect((await handleApi(req('/api/crm/contacts'),env)).status).toBe(401);
      expect((await handleApi(req('/api/crm/contacts','client'),env)).status).toBe(403);
      expect((await handleApi(req('/api/crm/contacts','admin'),env)).status).toBe(200);
      db.db.prepare("UPDATE profiles SET status='suspended' WHERE id='test-admin'").run();
      expect((await handleApi(req('/api/crm/contacts','admin'),env)).status).toBe(403);
      expect((await handleApi(req('/api/crm/contacts','owner'),env)).status).toBe(200);
    }finally{db.db.close();}
  });
  it('reuses existing leads; aggregates normalized email without duplicate CRM contacts',async()=>{
    const {db,env}=setup();
    try{
      const data=await list(env);
      expect(data.contacts).toHaveLength(2);
      const sales=data.contacts.find(c=>c.email==='sales@example.test');
      expect(sales).toMatchObject({name:'Client Updated',requestCount:2,stage:'new',version:0});
      expect((await handleApi(req('/api/crm/contacts?q=other','owner'),env)).status).toBe(200);
      const other=(await (await handleApi(req('/api/crm/contacts?q=other','owner'),env)).json()) as {contacts:unknown[]};
      expect(other.contacts).toHaveLength(1);
      expect(db.db.prepare('SELECT COUNT(*) AS n FROM crm_contact_state').get()).toMatchObject({n:0});
    }finally{db.db.close();}
  });
  it('updates contact with optimistic version, rejects stale edits, records audit',async()=>{
    const {db,env}=setup();
    try{
      const key=(await list(env)).contacts[0].id;
      const email=(await list(env)).contacts[0].email;
      const payload={email,version:0,stage:'qualified',tags:['Rückruf','Büro']};
      const r=await handleApi(req('/api/crm/contacts/'+key,'admin','PUT',payload),env);
      expect(r.status,await r.clone().text()).toBe(200);
      expect(await r.json()).toMatchObject({contact:{id:key,version:1,stage:'qualified'}});
      expect((await handleApi(req('/api/crm/contacts/'+key,'owner','PUT',payload),env)).status).toBe(409);
      const next=await handleApi(req('/api/crm/contacts/'+key,'owner','PUT',
        {...payload,version:1,stage:'won'}),env);
      expect(next.status,await next.clone().text()).toBe(200);
      const state=(await list(env)).contacts.find(c=>c.id===key);
      expect(state).toMatchObject({version:2,stage:'won',tags:['Rückruf','Büro']});
      expect(db.db.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE action='crm.contact.updated'").get())
        .toMatchObject({n:2});
      expect(db.db.prepare('SELECT COUNT(*) AS n FROM cleaning_requests').get()).toMatchObject({n:3});
    }finally{db.db.close();}
  });
  it('stores idempotent internal notes, blocks same-key changed payload, no email transport',async()=>{
    const {db,env}=setup();
    try{
      const item=(await list(env)).contacts[0];
      const url='/api/crm/contacts/'+item.id+'/notes';
      const payload={email:item.email,body:'Rückruf am Montag',idempotencyKey:'idem-test-note-00000000001'};
      const created=await handleApi(req(url,'admin','POST',payload),env);
      expect(created.status,await created.clone().text()).toBe(201);
      const v=await created.json() as {note:{id:string}};
      const replay=await handleApi(req(url,'admin','POST',payload),env);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({note:{id:v.note.id}});
      expect((await handleApi(req(url,'admin','POST',{...payload,body:'changed'}),env)).status).toBe(409);
      expect((await handleApi(req(url,'client','GET'),env)).status).toBe(403);
      expect(db.db.prepare('SELECT COUNT(*) AS n FROM crm_contact_notes').get()).toMatchObject({n:1});
      expect(db.db.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE action='crm.note.created'").get())
        .toMatchObject({n:1});
    }finally{db.db.close();}
  });
  it('caps authenticated CRM mutations by the existing durable portal rate limiter',async()=>{
    const {db,env}=setup();
    try{
      const contact=(await list(env)).contacts[0];
      const bucket=Math.floor(Date.now()/3600000);
      db.db.prepare('INSERT INTO portal_rate_limits (key,count,expires_at) VALUES (?,?,?)')
        .run('crm:test-owner:write:'+bucket,120,(bucket+1)*3600);
      const denied=await handleApi(req('/api/crm/contacts/'+contact.id,'owner','PUT',
        {email:contact.email,version:0,stage:'qualified',tags:[]}),env);
      expect(denied.status).toBe(429);
      expect(db.db.prepare('SELECT COUNT(*) AS n FROM crm_contact_state').get()).toMatchObject({n:0});
    }finally{db.db.close();}
  });
  it('blocks wrong identity, forged contact hash, invalid stage/tags and cross-origin changes',async()=>{
    const {db,env}=setup();
    try{
      const item=(await list(env)).contacts[0];
      const base={email:item.email,version:0,stage:'new',tags:[]};
      expect((await handleApi(req('/api/crm/contacts/'+'a'.repeat(64),'owner','PUT',base),env)).status).toBe(422);
      expect((await handleApi(req('/api/crm/contacts/'+item.id,'owner','PUT',{...base,email:'unknown@example.test'}),env)).status).toBe(422);
      expect((await handleApi(req('/api/crm/contacts/'+item.id,'owner','PUT',{...base,stage:'sql-injection'}),env)).status).toBe(422);
      expect((await handleApi(req('/api/crm/contacts/'+item.id,'owner','PUT',{...base,tags:['<script>']}),env)).status).toBe(422);
      expect((await handleApi(req('/api/crm/contacts/'+item.id,'owner','PUT',base,{'Origin':'https://malicious.test'}),env)).status).toBe(403);
      expect((await handleApi(req('/api/crm/contacts/'+item.id,'owner','PUT',base,{'Content-Type':'text/plain'}),env)).status).toBe(415);
    }finally{db.db.close();}
  });
});
