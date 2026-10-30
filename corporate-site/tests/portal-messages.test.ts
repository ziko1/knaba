import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../worker/api';
import type { D1Database, D1Result, D1Statement, WorkerEnv } from '../worker/types';

/** Real SQLite + deterministic concurrent membership changes at transaction start. */
class MessageDatabase implements D1Database {
  sql = new DatabaseSync(':memory:');
  beforeBatch?: () => void;
  constructor() {
    this.sql.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort())
      this.sql.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  prepare(sql: string): D1Statement {
    const db = this; let values: unknown[] = [];
    return {
      bind(...args) { values=args; return this; },
      async first<T>(column?: string) { const row=db.sql.prepare(sql).get(...values as never[]) as Record<string,unknown>|undefined; return row ? (column ? row[column] : row) as T : null; },
      async all<T>() { return {success:true,results:db.sql.prepare(sql).all(...values as never[]) as T[]}; },
      async run() { return {success:true,meta:{changes:Number(db.sql.prepare(sql).run(...values as never[]).changes)}}; },
    };
  }
  async batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]> {
    this.beforeBatch?.(); this.beforeBatch=undefined;
    this.sql.exec('BEGIN');
    try { const results=[];for(const statement of statements)results.push(await statement.run());this.sql.exec('COMMIT');return results as D1Result<T>[]; }
    catch(error) { this.sql.exec('ROLLBACK');throw error; }
  }
}
const origin='https://kneba.vsp.rest';
const people={owner:'owner',admin:'admin',client:'client',client2:'client',partner:'partner',worker:'worker',worker2:'worker',bauleiter:'bauleiter',bauleiter2:'bauleiter',pending:'client'} as const;
type Person=keyof typeof people;
let db:MessageDatabase,env:WorkerEnv;
beforeEach(() => {
  db=new MessageDatabase();env={DB:db,OWNER_EMAIL:'owner@example.test'};
  const now='2026-10-28T12:00:00.000Z';
  for (const [id,role] of Object.entries(people)) {
    if (id==='owner') continue;
    db.sql.prepare('INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
      .run(id,`Test ${id}`,`${id}@example.test`,role==='admin'?'worker':role,role,id==='pending'?'pending':'approved','2026-10-28',now,now,`fixture-${id}`);
  }
});
afterEach(()=>db.sql.close());
async function call(path:string,person?:Person,method='GET',body?:unknown,headers:Record<string,string>={}) {
  return handleApi(new Request(origin+path,{method,headers:{
    'Content-Type':'application/json',Origin:origin,'X-KnaBa-Request':'portal-v1',
    ...(person?{'oai-authenticated-user-id':person,'oai-authenticated-user-email':`${person}@example.test`}:{}),...headers,
  },...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
}
async function open(person:Person,body:Record<string,unknown>={}) {
  const r=await call('/api/portal/conversations',person,'POST',body);
  expect(r.status,await r.clone().text()).toBe(201);return (await r.json()).conversation;
}
const messagePath=(id:string)=>`/api/portal/conversations/${id}/messages`;
const text=(body='Hello management')=>({body,idempotencyKey:crypto.randomUUID()});
async function send(id:string,person:Person,body=text()) {
  const r=await call(messagePath(id),person,'POST',body);
  expect(r.status,await r.clone().text()).toBe(201);return (await r.json()).message;
}
async function job() {
  const r=await call('/api/portal/requests','client','POST',{
    service:'baureinigung',objectType:'Baustelle',postcode:'10315',area:'200',frequency:'Einmalig',
    message:'Synthetic construction enquiry for isolation.',address:'Test address',privacyAccepted:true,idempotencyKey:crypto.randomUUID(),
  });
  expect(r.status,await r.clone().text()).toBe(201);const item=(await r.json()).request;
  db.sql.prepare("UPDATE cleaning_requests SET status='scheduled',assigned_worker_id='worker',assigned_bauleiter_id='bauleiter',scheduled_at='2026-11-01T08:00:00Z' WHERE id=?").run(item.id);
  return item.id as string;
}

describe('role-scoped portal messaging',()=>{
  it('allows a worker and manager to converse without an assigned job and persists both messages',async()=>{
    const conversation=await open('worker');
    const first=await send(conversation.id,'worker',text('When does the next shift start?'));
    const reply=await send(conversation.id,'admin',text('Please come at 08:00.'));
    const result=await (await call(messagePath(conversation.id),'worker')).json();
    expect(result.messages.map((m:{id:string})=>m.id)).toEqual([first.id,reply.id]);
    expect(result.messages.map((m:{authorRole:string})=>m.authorRole)).toEqual(['worker','admin']);
    expect(result.nextBefore).toBeNull();
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_messages').get()?.n).toBe(2);
    expect(JSON.stringify((await (await call('/api/portal/conversations','owner')).json()).conversations)).toContain('Please come at 08:00.');
  });
  it('deduplicates direct/context threads, and allows management to begin a private conversation',async()=>{
    const first=await open('owner',{participantId:'client'});
    const again=await call('/api/portal/conversations','client','POST',{});
    expect(again.status).toBe(200);expect((await again.json()).conversation.id).toBe(first.id);
    const context=await open('client',{requestId:await job()});
    expect(context.id).not.toBe(first.id);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_conversations').get()?.n).toBe(2);
  });
  it('keeps clients, partners and workers isolated from one another and pending users',async()=>{
    const own=await open('client');await send(own.id,'owner',text('Private customer reply'));
    for(const person of ['client2','partner','worker'] as Person[]) {
      expect((await (await call('/api/portal/conversations',person)).json()).conversations).toEqual([]);
      expect((await call(messagePath(own.id),person)).status).toBe(404);
      expect((await call(messagePath(own.id),person,'POST',text())).status).toBe(404);
    }
    expect((await call('/api/portal/conversations')).status).toBe(401);
    expect((await call('/api/portal/conversations','pending')).status).toBe(403);
    expect((await call(messagePath(own.id),'pending')).status).toBe(403);
    expect((await call('/api/portal/conversations','client','POST',{participantId:'worker'})).status).toBe(422);
  });
  it('separates customer and assigned-worker threads about the same job',async()=>{
    const requestId=await job();
    const customer=await open('client',{requestId}),team=await open('worker',{requestId});
    await send(team.id,'owner',text('Internal staffing instructions'));
    expect(customer.id).not.toBe(team.id);
    expect((await call(messagePath(team.id),'client')).status).toBe(404);
    expect((await call(messagePath(customer.id),'worker')).status).toBe(404);
    expect((await call('/api/portal/conversations','worker2','POST',{requestId})).status).toBe(404);
    expect((await call('/api/portal/conversations','client2','POST',{requestId})).status).toBe(404);
  });
  it('revokes reading and sending immediately on suspension or request reassignment',async()=>{
    const requestId=await job(),team=await open('worker',{requestId});await send(team.id,'worker');
    db.sql.prepare("UPDATE cleaning_requests SET assigned_worker_id='worker2' WHERE id=?").run(requestId);
    expect((await call(messagePath(team.id),'worker')).status).toBe(404);
    expect((await call(messagePath(team.id),'worker','POST',text())).status).toBe(404);
    const direct=await open('worker');db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id='worker'").run();
    expect((await call(messagePath(direct.id),'worker')).status).toBe(403);
    expect((await call(messagePath(direct.id),'owner','POST',text())).status).toBe(404);
  });
  it('fences concurrent assignment changes inside the message transaction',async()=>{
    const requestId=await job(),team=await open('worker',{requestId});
    const audits=db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n;
    db.beforeBatch=()=>{db.sql.prepare("UPDATE cleaning_requests SET assigned_worker_id='worker2' WHERE id=?").run(requestId);};
    expect((await call(messagePath(team.id),'worker','POST',text())).status).toBe(403);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_messages').get()?.n).toBe(0);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n).toBe(audits);
  });
  it('fences concurrently revoked admin or participant membership on writes',async()=>{
    const team=await open('worker');
    db.beforeBatch=()=>{db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id='admin'").run();};
    expect((await call(messagePath(team.id),'admin','POST',text())).status).toBe(403);
    db.beforeBatch=()=>{db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id='worker'").run();};
    expect((await call(messagePath(team.id),'owner','POST',text())).status).toBe(403);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_messages').get()?.n).toBe(0);
  });
  it('fences revoked membership and foreign job access when creating threads',async()=>{
    db.beforeBatch=()=>{db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id='worker'").run();};
    expect((await call('/api/portal/conversations','worker','POST',{})).status).toBe(404);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_conversations').get()?.n).toBe(0);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n).toBe(0);
  });
  it('retries a message safely and rejects changed text for the same key',async()=>{
    const team=await open('partner'),payload=text('Please confirm access.'),first=await send(team.id,'partner',payload);
    const replay=await call(messagePath(team.id),'partner','POST',payload);
    expect(replay.status).toBe(200);expect((await replay.json()).message).toEqual(first);
    expect((await call(messagePath(team.id),'partner','POST',{...payload,body:'Different content'})).status).toBe(409);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_messages').get()?.n).toBe(1);
    expect(db.sql.prepare("SELECT count(*) AS n FROM portal_audit WHERE action='conversation.message_sent'").get()?.n).toBe(1);
    expect(JSON.stringify(db.sql.prepare('SELECT * FROM portal_audit').all())).not.toContain(payload.body);
  });
  it('provides stable backwards pagination without duplicates and preserves plain-text payloads',async()=>{
    const team=await open('worker');
    for(let n=0;n<53;n++)await send(team.id,'worker',text(n===0?'<img src=x onerror=alert(1)>':`Message ${n}`));
    const latest=await (await call(messagePath(team.id),'worker')).json();
    expect(latest.messages).toHaveLength(50);expect(latest.nextBefore).toBe(latest.messages[0].sequence);
    await send(team.id,'owner',text('Concurrent new message'));
    const older=await (await call(`${messagePath(team.id)}?before=${latest.nextBefore}`,'worker')).json();
    expect(older.messages).toHaveLength(3);expect(older.nextBefore).toBeNull();
    expect(older.messages[0].body).toBe('<img src=x onerror=alert(1)>');
    const ids=[...older.messages,...latest.messages].map(m=>m.id);expect(new Set(ids).size).toBe(53);
    expect((await call(`${messagePath(team.id)}?before=NaN`,'worker')).status).toBe(422);
  });
  it('rejects forged authors, cross-origin requests, empty/oversized content and invalid keys',async()=>{
    const team=await open('worker');
    expect((await call(messagePath(team.id),'worker','POST',{...text(),authorId:'owner'})).status).toBe(422);
    expect((await call(messagePath(team.id),'worker','POST',text(),{Origin:'https://foreign.test'})).status).toBe(403);
    expect((await call('/api/portal/conversations','worker','POST',{}, {'X-KnaBa-Request':''})).status).toBe(403);
    for(const value of ['', ' ', 'x'.repeat(2001), 'a\u0000b'])expect((await call(messagePath(team.id),'worker','POST',text(value))).status).toBe(422);
    expect((await call(messagePath(team.id),'worker','POST',{body:'Text',idempotencyKey:'short'})).status).toBe(422);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_messages').get()?.n).toBe(0);
  });
  it('does not let changed roles or identity emails inherit a previous private thread',async()=>{
    const team=await open('worker');await send(team.id,'worker');
    db.sql.prepare("UPDATE profiles SET role='client' WHERE id='worker'").run();
    expect((await call(messagePath(team.id),'worker')).status).toBe(404);
    db.sql.prepare("UPDATE profiles SET role='worker',email='changed@example.test' WHERE id='worker'").run();
    expect((await call(messagePath(team.id),'worker')).status).toBe(403);
  });

  it('offers a Bauleiter only active participants of its assigned requests, without a global messaging directory',async()=>{
    const direct=await open('worker');await send(direct.id,'worker',text('Private general worker discussion'));
    expect(await (await call('/api/portal/conversations','bauleiter')).json()).toEqual({conversations:[],limited:false,recipients:[]});
    const requestId=await job();
    const otherRequest=await job();
    db.sql.prepare("UPDATE cleaning_requests SET assigned_bauleiter_id='bauleiter2',client_id='client2',assigned_worker_id='worker2' WHERE id=?").run(otherRequest);
    const result=await (await call('/api/portal/conversations','bauleiter')).json();
    expect(result.conversations).toEqual([]);
    expect(result.recipients).toEqual([
      {participantId:'client',participantName:'Test client',participantRole:'client',requestId},
      {participantId:'worker',participantName:'Test worker',participantRole:'worker',requestId},
    ]);
    expect(JSON.stringify(result)).not.toContain('example.test');
    expect(JSON.stringify(result)).not.toContain('client2');
    expect(JSON.stringify(result)).not.toContain('worker2');
    expect(JSON.stringify(result)).not.toContain('Private general');
    expect((await (await call('/api/portal/conversations','owner')).json()).recipients).toEqual([]);
    expect((await (await call('/api/portal/conversations','worker')).json()).recipients).toEqual([]);
  });
  it('lets the assigned Bauleiter coordinate separate client and worker conversations on that request',async()=>{
    const requestId=await job();
    const customer=await open('bauleiter',{requestId,participantId:'client'});
    const team=await open('bauleiter',{requestId,participantId:'worker'});
    const first=await send(team.id,'bauleiter',text('Please check the equipment before the shift.'));
    await send(customer.id,'bauleiter',text('We will arrive at the agreed time.'));
    expect(first.authorRole).toBe('bauleiter');expect(first.authorName).toBe('Test bauleiter');
    expect((await (await call(messagePath(team.id),'worker')).json()).messages[0].id).toBe(first.id);
    expect((await call(messagePath(team.id),'client')).status).toBe(404);
    expect((await call(messagePath(customer.id),'worker')).status).toBe(404);
    expect((await call(messagePath(team.id),'bauleiter2')).status).toBe(404);
    await send(team.id,'admin',text('Administration has noted the plan.'));
    const payload=text('Please confirm the handover.');
    const saved=await send(team.id,'bauleiter',payload);
    const retry=await call(messagePath(team.id),'bauleiter','POST',payload);
    expect(retry.status).toBe(200);expect((await retry.json()).message.id).toBe(saved.id);
    expect((await call(messagePath(team.id),'bauleiter','POST',{...payload,body:'A changed handover'})).status).toBe(409);
  });
  it('denies Bauleiter direct threads, foreign request contexts and unrelated participants',async()=>{
    const requestId=await job(),foreign=await job();
    db.sql.prepare("UPDATE cleaning_requests SET assigned_bauleiter_id='bauleiter2' WHERE id=?").run(foreign);
    for(const body of [{participantId:'worker'},{participantId:'client',requestId:null}])
      expect((await call('/api/portal/conversations','bauleiter','POST',body)).status).toBe(422);
    for(const body of [
      {participantId:'client',requestId:foreign},{participantId:'worker',requestId:foreign},
      {participantId:'client2',requestId},{participantId:'worker2',requestId},
      {participantId:'admin',requestId},{participantId:'missing',requestId},
    ])expect((await call('/api/portal/conversations','bauleiter','POST',body)).status).toBe(404);
    const direct=await open('owner',{participantId:'worker'});
    expect((await call(messagePath(direct.id),'bauleiter')).status).toBe(404);
    expect((await call(messagePath(direct.id),'bauleiter','POST',text())).status).toBe(404);
    expect((await call('/api/portal/conversations','bauleiter','POST',{participantId:'worker',requestId,authorRole:'owner'})).status).toBe(422);
    expect((await call('/api/portal/conversations','bauleiter','POST',{participantId:'worker',requestId},{Origin:'https://foreign.test'})).status).toBe(403);
  });
  it('removes Bauleiter reads, recipients and retries when the assignment is revoked',async()=>{
    const requestId=await job(),team=await open('bauleiter',{requestId,participantId:'worker'}),payload=text('Scoped message');
    await send(team.id,'bauleiter',payload);
    db.sql.prepare("UPDATE cleaning_requests SET assigned_bauleiter_id='bauleiter2' WHERE id=?").run(requestId);
    expect(await (await call('/api/portal/conversations','bauleiter')).json()).toEqual({conversations:[],limited:false,recipients:[]});
    expect((await call(messagePath(team.id),'bauleiter')).status).toBe(404);
    expect((await call(messagePath(team.id),'bauleiter','POST',payload)).status).toBe(404);
    expect((await (await call(messagePath(team.id),'bauleiter2')).json()).messages).toHaveLength(1);
    db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id='bauleiter2'").run();
    expect((await call(messagePath(team.id),'bauleiter2')).status).toBe(403);
  });
  it.each(['supervisor reassigned','worker reassigned','participant suspended','Bauleiter suspended'])(
    'fences Bauleiter message writes when %s before transaction start',async(change)=>{
      const requestId=await job(),team=await open('bauleiter',{requestId,participantId:'worker'});
      const audits=db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n;
      db.beforeBatch=()=>{
        if(change==='supervisor reassigned')db.sql.prepare("UPDATE cleaning_requests SET assigned_bauleiter_id='bauleiter2' WHERE id=?").run(requestId);
        if(change==='worker reassigned')db.sql.prepare("UPDATE cleaning_requests SET assigned_worker_id='worker2' WHERE id=?").run(requestId);
        if(change==='participant suspended')db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id='worker'").run();
        if(change==='Bauleiter suspended')db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id='bauleiter'").run();
      };
      expect((await call(messagePath(team.id),'bauleiter','POST',text())).status).toBe(403);
      expect(db.sql.prepare('SELECT count(*) AS n FROM portal_messages').get()?.n).toBe(0);
      expect(db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n).toBe(audits);
    },
  );
  it('fences Bauleiter thread creation against concurrent reassignment',async()=>{
    const requestId=await job(),audits=db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n;
    db.beforeBatch=()=>{db.sql.prepare("UPDATE cleaning_requests SET assigned_bauleiter_id='bauleiter2' WHERE id=?").run(requestId);};
    expect((await call('/api/portal/conversations','bauleiter','POST',{requestId,participantId:'client'})).status).toBe(404);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_conversations').get()?.n).toBe(0);
    expect(db.sql.prepare('SELECT count(*) AS n FROM portal_audit').get()?.n).toBe(audits);
  });
});
