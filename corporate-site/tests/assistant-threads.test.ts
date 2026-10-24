import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../worker/api';
import type { D1Database, D1Result, D1Statement, WorkerEnv } from '../worker/types';

// Real in-memory SQLite, D1-style bound statements and transactional batches.
class D1Fixture implements D1Database {
  readonly sql=new DatabaseSync(':memory:');
  constructor(){
    this.sql.exec('PRAGMA foreign_keys=ON');
    for (const name of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
      this.sql.exec(readFileSync(`drizzle/${name}`,'utf8'));
  }
  prepare(sql:string):D1Statement {
    const database=this.sql;let params:unknown[]=[];
    return {
      bind(...values:unknown[]){params=values;return this;},
      async first<T>(column?:string){const row=database.prepare(sql).get(...params as never[]) as Record<string,unknown>|undefined;return (row ? (column?row[column]:row):null) as T|null;},
      async all<T>(){return {success:true,results:database.prepare(sql).all(...params as never[]) as T[]};},
      async run(){const r=database.prepare(sql).run(...params as never[]);return {success:true,results:[],meta:{changes:Number(r.changes)}};},
    };
  }
  async batch<T>(statements:D1Statement[]):Promise<D1Result<T>[]> {
    this.sql.exec('BEGIN');
    try {const results=[];for(const s of statements) results.push(await s.run());this.sql.exec('COMMIT');return results as D1Result<T>[];}
    catch(error){this.sql.exec('ROLLBACK');throw error;}
  }
  close(){this.sql.close();}
}
const origin='https://kneba.vsp.rest';
const capability=()=> Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const key=()=>crypto.randomUUID().replaceAll('-','');
let db:D1Fixture,env:WorkerEnv;
const ownerHeaders={'oai-authenticated-user-id':'owner-1','oai-authenticated-user-email':'owner@example.test'};
const adminHeaders={'oai-authenticated-user-id':'admin-1','oai-authenticated-user-email':'admin@example.test'};
async function req(path:string,method='GET',payload?:unknown,options:{token?:string,identity?:Record<string,string>,headers?:Record<string,string>}={}){
  const headers:Record<string,string>={Origin:origin,'X-KnaBa-Request':'portal-v1','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.22',...(options.token?{'X-KnaBa-Thread-Capability':options.token}:{}),...(options.identity??{}),...(options.headers??{})};
  return handleApi(new Request(origin+path,{method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env);
}
const start=(token=capability(),idem=key(),message='Ich möchte die Büroreinigung persönlich besprechen.')=>req('/api/assistant/threads','POST',{capability:token,idempotencyKey:idem,consentAccepted:true,locale:'de',message});
beforeEach(()=>{db=new D1Fixture();env={DB:db,OWNER_EMAIL:'owner@example.test'};});
afterEach(()=>db.close());

// A missing endpoint must fail with HTTP 404 before implementation: genuine red.
describe('anonymous KnaBa owner conversation',()=>{
  it('creates a persisted visitor message with explicit consent and a private capability',async()=>{
    const token=capability();const created=await start(token);expect(created.status).toBe(201);
    const body=await created.json() as {id:string;received:boolean};
    expect(body.received).toBe(true);expect(body.id).toMatch(/^[\da-f-]{36}$/i);
    expect(JSON.stringify(body)).not.toContain(token);
    const retrieved=await req(`/api/assistant/threads/${body.id}`,'GET',undefined,{token});
    expect(retrieved.status).toBe(200);
    const view=await retrieved.json() as {messages:{author:string;message:string}[]};
    expect(view.messages).toEqual([expect.objectContaining({author:'visitor',message:'Ich möchte die Büroreinigung persönlich besprechen.'})]);
    expect(JSON.stringify(view)).not.toContain(token);
  });
  it('replays an identical opening request but refuses a modified payload',async()=>{
    const token=capability(),id=key();const first=await start(token,id,'Beratung');expect(first.status).toBe(201);
    const replay=await start(token,id,'Beratung');expect(replay.status).toBe(200);
    expect((await replay.json()).id).toBe((await first.json()).id);
    expect((await start(token,id,'Andere Bedingungen')).status).toBe(409);
    expect(Number((db.sql.prepare('SELECT count(*) AS n FROM assistant_messages').get() as {n:number}).n)).toBe(1);
    expect(Number((db.sql.prepare('SELECT count(*) AS n FROM portal_audit WHERE action=?').get('assistant.message.visitor') as {n:number}).n)).toBe(1);
  });
  it('serializes concurrent identical submissions to one logical thread',async()=>{
    const token=capability(),id=key();const responses=await Promise.all([start(token,id,'Bitte Termin'),start(token,id,'Bitte Termin')]);
    expect(responses.map(r=>r.status).sort()).toEqual([200,201]);
    expect((await responses[0].json()).id).toBe((await responses[1].json()).id);
    expect((db.sql.prepare('SELECT count(*) n FROM assistant_threads').get() as {n:number}).n).toBe(1);
    expect((db.sql.prepare('SELECT count(*) n FROM assistant_messages').get() as {n:number}).n).toBe(1);
  });
  it('forbids omitted consent, weak secrets, cross-origin mutation, and oversized content',async()=>{
    const token=capability();
    expect((await req('/api/assistant/threads','POST',{capability:token,idempotencyKey:key(),message:'Text',locale:'de'})).status).toBe(422);
    expect((await req('/api/assistant/threads','POST',{capability:'weak',idempotencyKey:key(),message:'Text',locale:'de',consentAccepted:true})).status).toBe(422);
    expect((await req('/api/assistant/threads','POST',{capability:token,idempotencyKey:key(),message:'Text',locale:'de',consentAccepted:true},{headers:{Origin:'https://evil.test'}})).status).toBe(403);
    expect((await start(token,key(),'A'.repeat(2000))).status).toBe(422);
    expect((db.sql.prepare('SELECT count(*) n FROM assistant_threads').get() as {n:number}).n).toBe(0);
  });
  it('never leaks another visitor thread and refuses expired access',async()=>{
    const token1=capability(),token2=capability();const a=await (await start(token1)).json() as {id:string};
    const b=await (await start(token2)).json() as {id:string};
    expect((await req(`/api/assistant/threads/${a.id}`)).status).toBe(404);
    expect((await req(`/api/assistant/threads/${a.id}`,'GET',undefined,{token:token2})).status).toBe(404);
    expect((await req(`/api/assistant/threads/${b.id}`,'GET',undefined,{token:token1})).status).toBe(404);
    db.sql.prepare('UPDATE assistant_threads SET expires_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',a.id);
    expect((await req(`/api/assistant/threads/${a.id}`,'GET',undefined,{token:token1})).status).toBe(404);
  });
  it('sends visitor replies only with the capability; retries do not duplicate',async()=>{
    const token=capability();const {id}=await (await start(token)).json() as {id:string};const idempotencyKey=key();
    const url=`/api/assistant/threads/${id}/messages`;
    expect((await req(url,'POST',{message:'Оновлені деталі',idempotencyKey})).status).toBe(404);
    expect((await req(url,'POST',{message:'Оновлені деталі',idempotencyKey},{token})).status).toBe(201);
    expect((await req(url,'POST',{message:'Оновлені деталі',idempotencyKey},{token})).status).toBe(200);
    expect((await req(url,'POST',{message:'зміна змісту',idempotencyKey},{token})).status).toBe(409);
    const view=await (await req(`/api/assistant/threads/${id}`,'GET',undefined,{token})).json() as {messages:unknown[]};
    expect(view.messages).toHaveLength(2);
  });
  it('lists and allows owner replies while denying anonymous, client and revoked operator',async()=>{
    const token=capability();const {id}=await (await start(token)).json() as {id:string};
    const list='/api/assistant/owner/threads';
    expect((await req(list)).status).toBe(403);
    expect((await req(list,'GET',undefined,{identity:adminHeaders})).status).toBe(403);
    const owner=await req(list,'GET',undefined,{identity:ownerHeaders});expect(owner.status).toBe(200);
    expect((await owner.json() as {threads:{id:string}[]}).threads[0].id).toBe(id);
    const thread=await req(`/api/assistant/owner/threads/${id}`,'GET',undefined,{identity:ownerHeaders});expect(thread.status).toBe(200);
    const answerUrl=`/api/assistant/owner/threads/${id}/messages`;
    expect((await req(answerUrl,'POST',{message:'Unser Angebot wird besprochen.',idempotencyKey:key()})).status).toBe(403);
    const idempotencyKey=key();const body={message:'Wir melden uns für die Abstimmung.',idempotencyKey};
    expect((await req(answerUrl,'POST',body,{identity:ownerHeaders})).status).toBe(201);
    expect((await req(answerUrl,'POST',body,{identity:ownerHeaders})).status).toBe(200);
    const visitor=await (await req(`/api/assistant/threads/${id}`,'GET',undefined,{token})).json() as {messages:{author:string}[]};
    expect(visitor.messages.map(m=>m.author)).toEqual(['visitor','owner']);
    env.OWNER_EMAIL='someone-else@example.test';
    expect((await req(list,'GET',undefined,{identity:ownerHeaders})).status).toBe(403);
  });
  it('fails closed if the public edge cannot supply a trusted client-address scope',async()=>{
    const t=capability();expect((await req('/api/assistant/threads','POST',{capability:t,idempotencyKey:key(),message:'Ich bitte um Kontakt',locale:'de',consentAccepted:true},{headers:{'CF-Connecting-IP':''}})).status).toBe(503);
  });
  it('rate limits different capability tokens from the same trusted visitor IP',async()=>{
    for(let i=0;i<15;i++) expect((await start()).status).toBe(201);
    const exceeded=await start();expect(exceeded.status).toBe(429);
    expect((db.sql.prepare('SELECT count(*) n FROM assistant_threads').get() as {n:number}).n).toBe(15);
  });
  it('fails closed without an initialized D1 database',async()=>{
    const old=env.DB;env.DB=undefined;
    expect((await start()).status).toBe(503);env.DB=old;
  });
});


describe('local owner-notification outbox, disabled provider',()=>{
  it('persists exactly one notification for each committed visitor message, never owner replies or retries',async()=>{
    const token=capability(), opening=key(), message='Bauhilfe und Bauendreinigung';
    const first=await start(token,opening,message);
    expect(first.status).toBe(201);
    const {id}=await first.json() as {id:string};
    const events=()=>db.sql.prepare('SELECT thread_id,message_id,kind,status,attempts FROM assistant_owner_notifications ORDER BY created_at,id').all() as Array<{thread_id:string;message_id:string;kind:string;status:string;attempts:number}>;
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({thread_id:id,kind:'new_thread',status:'pending',attempts:0});
    expect((await start(token,opening,message)).status).toBe(200);
    expect(events()).toHaveLength(1);
    const idempotencyKey=key();
    const path=`/api/assistant/threads/${id}/messages`;
    expect((await req(path,'POST',{message:'Weitere Details',idempotencyKey},{token})).status).toBe(201);
    expect((await req(path,'POST',{message:'Weitere Details',idempotencyKey},{token})).status).toBe(200);
    expect(events()).toHaveLength(2);
    expect(events()[1]).toMatchObject({thread_id:id,kind:'visitor_message',status:'pending',attempts:0});
    expect(new Set(events().map(e=>e.message_id)).size).toBe(2);
    const ownerReply=await req(`/api/assistant/owner/threads/${id}/messages`,'POST',
      {message:'Wir antworten zeitnah.',idempotencyKey:key()},{identity:ownerHeaders});
    expect(ownerReply.status).toBe(201);
    expect(events()).toHaveLength(2);
    const schema=db.sql.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'assistant_owner_notifications\'').get();
    expect(schema).toMatchObject({name:'assistant_owner_notifications'});
  });
  it('keeps owner notification status access scoped; does not expose PII or secret capabilities',async()=>{
    const {id}=await (await start()).json() as {id:string};
    const route='/api/assistant/owner/notifications';
    expect((await req(route)).status).toBe(403);
    expect((await req(route,'GET',undefined,{identity:adminHeaders})).status).toBe(403);
    const response=await req(route,'GET',undefined,{identity:ownerHeaders});
    expect(response.status).toBe(200);
    const value=await response.json() as {notifications:Array<{threadId:string;kind:string;status:string}>,disabled:boolean};
    expect(value.notifications).toHaveLength(1);
    expect(value.notifications[0]).toMatchObject({threadId:id,kind:'new_thread',status:'pending'});
    expect(value.disabled).toBe(true);
    expect(JSON.stringify(value)).not.toMatch(/capability|contact|message|@example|token_hash/);
  });
  it('fails closed and rolls back visitor creation when outbox schema has not been migrated',async()=>{
    db.sql.exec('DROP TABLE assistant_owner_notifications');
    const response=await start();
    expect(response.status).toBe(503);
    expect((db.sql.prepare('SELECT count(*) AS n FROM assistant_threads').get() as {n:number}).n).toBe(0);
    expect((db.sql.prepare('SELECT count(*) AS n FROM assistant_messages').get() as {n:number}).n).toBe(0);
  });
});
