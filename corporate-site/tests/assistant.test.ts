import { describe, expect, beforeEach, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../worker/api';
import { assistantAnswer } from '../src/lib/assistant-knowledge';
import type { D1Database, D1Result, D1Statement, WorkerEnv } from '../worker/types';

class SqliteD1 implements D1Database {
  sql=new DatabaseSync(':memory:');
  errors:string[]=[];
  constructor(){
    this.sql.exec('PRAGMA foreign_keys=ON;');
    for(const path of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())this.sql.exec(readFileSync('drizzle/'+path,'utf8'));
  }
  prepare(query:string):D1Statement{
    const owner=this;let values:unknown[]=[];
    return {
      bind(...args:unknown[]){values=args;return this;},
      async first<T>(column?:string){
        try{const row=owner.sql.prepare(query).get(...values as never[]) as Record<string,unknown>|undefined;return row?(column?row[column]:row) as T:null;}
        catch(problem){owner.errors.push(query+' : '+String(problem));throw problem;}
      },
      async all<T>(){return {success:true,results:owner.sql.prepare(query).all(...values as never[]) as T[]};},
      async run(){try{const result=owner.sql.prepare(query).run(...values as never[]);return {success:true,results:[],meta:{changes:Number(result.changes)}};}
        catch(problem){owner.errors.push(query+' : '+String(problem));throw problem;}}
    };
  }
  async batch<T>(statements:D1Statement[]):Promise<D1Result<T>[]>{
    this.sql.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());this.sql.exec('COMMIT');return values as D1Result<T>[];}
    catch(error){this.sql.exec('ROLLBACK');throw error;}
  }
}
const origin='https://kneba.vsp.rest';
const guest={'Origin':origin,'Content-Type':'application/json','X-KnaBa-Request':'portal-v1','CF-Connecting-IP':'192.0.2.77'};
const owner={'oai-authenticated-user-id':'owner-test-id','oai-authenticated-user-email':'owner@knaba.test'};
let db:SqliteD1,env:WorkerEnv;
beforeEach(()=>{db=new SqliteD1();env={DB:db,OWNER_EMAIL:'owner@knaba.test'};});
async function call(path:string, method='GET', data?:unknown,headers:Record<string,string>={}){
  return handleApi(new Request(origin+path,{method,headers:{...guest,...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);
}
async function start(locale='ru'){
  const res=await call('/api/assistant/conversations','POST',{locale,privacyAccepted:true,website:''});
  expect(res.status,await res.clone().text()).toBe(201);
  return res.json() as Promise<{id:string;token:string}>;
}
const tokenHeader=(ticket:{token:string})=>({'X-KnaBa-Conversation':ticket.token});
const key=()=>crypto.randomUUID();
describe('KNABA Assistant backend',()=>{
  it('enforces privacy, same origin and bounded public input',async()=>{
    expect((await call('/api/assistant/conversations','POST',{locale:'ru',privacyAccepted:false})).status).toBe(422);
    expect((await call('/api/assistant/conversations','POST',{locale:'ru',privacyAccepted:true,website:'bot'})).status).toBe(422);
    expect((await call('/api/assistant/conversations','POST',{locale:'ru',privacyAccepted:true}, {Origin:'https://evil.invalid'})).status).toBe(403);
    expect((await call('/api/assistant/conversations','POST',{locale:'ru',privacyAccepted:true,forged:true})).status).toBe(422);
    const ticket=await start();
    expect((await call(`/api/assistant/conversations/${ticket.id}`)).status).toBe(404);
    expect((await call(`/api/assistant/conversations/${ticket.id}`,'GET',undefined,{'X-KnaBa-Conversation':'f'.repeat(64)})).status).toBe(404);
    expect((await call(`/api/assistant/conversations/${ticket.id}`,'GET',undefined,tokenHeader(ticket))).status).toBe(200);
  });
  it('provides multilingual, explicitly unconfirmed service guidance',()=>{
    expect(assistantAnswer('Сколько стоит уборка?', 'ru').text).toContain('Цена');
    expect(assistantAnswer('Preis?','de').text).toContain('Preis');
    expect(assistantAnswer('human','en').handoff).toBe(true);
    expect(assistantAnswer('termin','de').text).toMatch(/Termin|vereinbar/);
    expect(assistantAnswer('strange','uk').text).toContain('об’єкта');
  });
  it('keeps visitors isolated from each other and from the owner inbox',async()=>{
    const alice=await start(),bob=await start('de');
    expect((await call(`/api/assistant/conversations/${bob.id}`,'GET',undefined,tokenHeader(alice))).status).toBe(404);
    expect((await call('/api/assistant/owner/conversations')).status).toBe(403);
    expect((await call('/api/assistant/owner/conversations','GET',undefined,{'oai-authenticated-user-id':'non-owner','oai-authenticated-user-email':'someone@example.test'})).status).toBe(403);
    expect((await call(`/api/assistant/owner/conversations/${alice.id}`,'GET',undefined,tokenHeader(alice))).status).toBe(403);
  });
  it('supports idempotent replies, human handoff and owner response',async()=>{
    const alice=await start('ru'),idempotencyKey=key();
    const path=`/api/assistant/conversations/${alice.id}/messages`;
    const first=await call(path,'POST',{content:'Мне нужна уборка офиса',idempotencyKey},tokenHeader(alice));
    expect(first.status,db.errors.join('\n')).toBe(200);
    let thread=await first.json();
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages.map((m:{sender:string})=>m.sender)).toEqual(['customer','assistant']);
    const replay=await call(path,'POST',{content:'Мне нужна уборка офиса',idempotencyKey},tokenHeader(alice));
    expect((await replay.json()).messages).toHaveLength(2);
    const conflict=await call(path,'POST',{content:'Other content',idempotencyKey},tokenHeader(alice));
    expect(conflict.status).toBe(409);
    const handoff=await call(`/api/assistant/conversations/${alice.id}/handoff`,'POST',{name:'Client',email:'user@example.test',phone:'+4930123456'},tokenHeader(alice));
    expect(handoff.status,db.errors.join('\n')).toBe(200);
    thread=await handoff.json();expect(thread.conversation.status).toBe('human');
    const inbox=await call('/api/assistant/owner/conversations','GET',undefined,owner);
    expect(inbox.status).toBe(200);
    expect((await inbox.json()).conversations[0].contactEmail).toBe('user@example.test');
    const reply=await call(`/api/assistant/owner/conversations/${alice.id}/messages`,'POST',{content:'Wir melden uns heute.',idempotencyKey:key()},owner);
    expect(reply.status,db.errors.join('\n')).toBe(200);
    const guestReply=await call(`/api/assistant/conversations/${alice.id}`,'GET',undefined,tokenHeader(alice));
    expect((await guestReply.json()).messages.some((m:{sender:string})=>m.sender==='owner')).toBe(true);
  });
  it('lets customers review owner-proposed terms without automatic order creation',async()=>{
    const c=await start('en');
    const url=`/api/assistant/owner/conversations/${c.id}/offers`;
    const requestKey=key();
    const offered=await call(url,'POST',{content:'Office cleaning once per week, details by agreement',idempotencyKey:requestKey},owner);
    expect(offered.status,db.errors.join('\n')).toBe(200);
    const again=await call(url,'POST',{content:'Office cleaning once per week, details by agreement',idempotencyKey:requestKey},owner);
    expect(again.status).toBe(200);
    expect((await again.json()).offers).toHaveLength(1);
    const another=await call(url,'POST',{content:'Another proposal',idempotencyKey:key()},owner);
    expect(another.status).toBe(409);
    const guestThread=await call(`/api/assistant/conversations/${c.id}`,'GET',undefined,tokenHeader(c));
    const offerId=(await guestThread.json()).offers[0].id;
    expect((await call(`/api/assistant/conversations/${c.id}/offers/${offerId}/decision`,'POST',{decision:'accepted'},tokenHeader(c))).status).toBe(200);
    const ownerThread=await call(`/api/assistant/owner/conversations/${c.id}`,'GET',undefined,owner);
    expect((await ownerThread.json()).offers[0].state).toBe('accepted');
    expect(Number(db.sql.prepare('SELECT COUNT(*) AS n FROM cleaning_requests').get()?.n)).toBe(0);
    expect((await call(`/api/assistant/owner/conversations/${c.id}/status`,'POST',{status:'closed'},owner)).status).toBe(200);
    expect((await call(`/api/assistant/conversations/${c.id}/messages`,'POST',{content:'Hi',idempotencyKey:key()},tokenHeader(c))).status).toBe(409);
  });
});
