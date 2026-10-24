import { describe, expect, beforeEach, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../worker/api';
import { assistantAnswer } from '../src/lib/assistant-knowledge';
import * as notificationService from '../worker/notifications';
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
  it('queues one owner notice per handoff, human message and decision without storing customer text',async()=>{
    const ticket=await start('de');
    const handoffPath=`/api/assistant/conversations/${ticket.id}/handoff`;
    const handoffData={name:'Test Visitor',email:'visitor@example.test',phone:'+4930123456'};
    expect((await call(handoffPath,'POST',handoffData,tokenHeader(ticket))).status).toBe(200);
    expect((await call(handoffPath,'POST',handoffData,tokenHeader(ticket))).status).toBe(200);
    const messageKey=key(),msgPath=`/api/assistant/conversations/${ticket.id}/messages`;
    expect((await call(msgPath,'POST',{content:'Customer personal details should stay private',idempotencyKey:messageKey},tokenHeader(ticket))).status).toBe(200);
    expect((await call(msgPath,'POST',{content:'Customer personal details should stay private',idempotencyKey:messageKey},tokenHeader(ticket))).status).toBe(200);
    const offered=await call(`/api/assistant/owner/conversations/${ticket.id}/offers`,'POST',{content:'Proposal from owner',idempotencyKey:key()},owner);
    expect(offered.status).toBe(200);
    const offerId=(await offered.json()).offers[0].id;
    const decisionPath=`/api/assistant/conversations/${ticket.id}/offers/${offerId}/decision`;
    expect((await call(decisionPath,'POST',{decision:'accepted'},tokenHeader(ticket))).status).toBe(200);
    expect((await call(decisionPath,'POST',{decision:'accepted'},tokenHeader(ticket))).status).toBe(200);
    const rows=db.sql.prepare('SELECT event_key,kind,status FROM assistant_notifications WHERE conversation_id=? ORDER BY kind').all(ticket.id) as {event_key:string;kind:string;status:string}[];
    expect(rows.map(row=>row.kind)).toEqual(['customer_message','offer_decision','owner_handoff']);
    expect(rows.every(row=>row.status==='pending')).toBe(true);
    expect(new Set(rows.map(row=>row.event_key)).size).toBe(3);
    expect(JSON.stringify(rows)).not.toContain('Customer personal details');
  });
  it('delivers only metadata through an opt-in limited owner email transport',async()=>{
    const ticket=await start('uk');
    expect((await call(`/api/assistant/conversations/${ticket.id}/handoff`,'POST',{name:'Private Name',email:'private@example.test',phone:''},tokenHeader(ticket))).status).toBe(200);
    Object.assign(env,{
      ASSISTANT_NOTIFICATIONS_ENABLED:'approved', ASSISTANT_NOTIFY_FROM:'KNABA <updates@example.test>',
      ASSISTANT_NOTIFY_TO:'owner@example.test', ASSISTANT_PUBLIC_ORIGIN:origin,
      ASSISTANT_EMAIL_DAILY_LIMIT:'2', RESEND_API_KEY:'fake-unit-test-only',
    });
    const outbound:{url:string;headers:Headers;body:string}[]=[];
    const transport:typeof fetch=async (input,init)=>{
      outbound.push({url:String(input),headers:new Headers(init?.headers),body:String(init?.body)});
      return new Response(JSON.stringify({id:'fake-delivery'}),{status:200});
    };
    const first=await notificationService.drainOwnerNotifications(env,transport);
    expect(first).toMatchObject({sent:1,failed:0});
    expect(outbound).toHaveLength(1);
    expect(outbound[0].url).toBe('https://api.resend.com/emails');
    expect(outbound[0].headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(outbound[0].headers.get('Authorization')).toBe('Bearer fake-unit-test-only');
    expect(outbound[0].body).toContain('/postfach/?conversation=');
    expect(outbound[0].body).not.toContain('private@example.test');
    expect(outbound[0].body).not.toContain('Private Name');
    expect((db.sql.prepare('SELECT status FROM assistant_notifications').get() as {status:string}).status).toBe('sent');
    expect((await notificationService.drainOwnerNotifications(env,transport)).sent).toBe(0);
    expect(outbound).toHaveLength(1);
  });
  it('does not transmit when disabled and applies retry backoff and daily budget',async()=>{
    const alice=await start('de');
    await call(`/api/assistant/conversations/${alice.id}/handoff`,'POST',{name:'',email:'',phone:''},tokenHeader(alice));
    const calls:{count:number}={count:0};
    const failing:typeof fetch=async()=>{calls.count++;return new Response('throttle',{status:429});};
    expect((await notificationService.drainOwnerNotifications(env,failing)).sent).toBe(0);
    expect(calls.count).toBe(0);
    Object.assign(env,{ASSISTANT_NOTIFICATIONS_ENABLED:'approved',ASSISTANT_NOTIFY_FROM:'updates@example.test',ASSISTANT_NOTIFY_TO:'owner@example.test',ASSISTANT_PUBLIC_ORIGIN:origin,RESEND_API_KEY:'test',ASSISTANT_EMAIL_DAILY_LIMIT:'1'});
    const failed=await notificationService.drainOwnerNotifications(env,failing);
    expect(failed).toMatchObject({sent:0,failed:1});
    expect(calls.count).toBe(1);
    const state=db.sql.prepare('SELECT attempts,status,next_attempt_at FROM assistant_notifications').get() as {attempts:number;status:string;next_attempt_at:number};
    expect(state.attempts).toBe(1);
    expect(state.status).toBe('pending');
    expect(state.next_attempt_at).toBeGreaterThan(Math.floor(Date.now()/1000));
    db.sql.prepare('UPDATE assistant_notifications SET next_attempt_at=0').run();
    const blocked=await notificationService.drainOwnerNotifications(env,failing);
    expect(blocked).toMatchObject({sent:0,quotaExhausted:true});
    expect(calls.count).toBe(1);
  });
  it('schedules delivery after a committed handoff without blocking the customer response',async()=>{
    const ticket=await start('en');
    Object.assign(env,{ASSISTANT_NOTIFICATIONS_ENABLED:'approved',ASSISTANT_NOTIFY_FROM:'updates@example.test',ASSISTANT_NOTIFY_TO:'owner@example.test',ASSISTANT_PUBLIC_ORIGIN:origin,RESEND_API_KEY:'mock-only',ASSISTANT_EMAIL_DAILY_LIMIT:'1'});
    const requestSpy=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{"id":"mock-delivery"}',{status:200}));
    try {
      const scheduled:Promise<unknown>[]=[];
      const ctx={waitUntil(promise:Promise<unknown>){scheduled.push(promise);}};
      const response=await handleApi(new Request(origin+`/api/assistant/conversations/${ticket.id}/handoff`,{
        method:'POST',headers:{...guest,...tokenHeader(ticket)},body:JSON.stringify({name:'Visitor',email:'',phone:''})
      }),env,ctx);
      expect(response.status).toBe(200);
      expect(scheduled).toHaveLength(1);
      await Promise.all(scheduled);
      expect(requestSpy).toHaveBeenCalledTimes(1);
    } finally {requestSpy.mockRestore();}
  });
  it('allows the owner but no anonymous visitor to inspect notification delivery status',async()=>{
    const untrusted=await call('/api/assistant/owner/notifications','GET');
    expect(untrusted.status).toBe(403);
    const authorized=await call('/api/assistant/owner/notifications','GET',undefined,owner);
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({enabled:false});
  });
  it('requires provider acknowledgement before marking an email notice accepted',async()=>{
    const ticket=await start('ru');
    expect((await call(`/api/assistant/conversations/${ticket.id}/handoff`,'POST',{name:'',email:'',phone:''},tokenHeader(ticket))).status).toBe(200);
    Object.assign(env,{ASSISTANT_NOTIFICATIONS_ENABLED:'approved',ASSISTANT_NOTIFY_FROM:'updates@example.test',ASSISTANT_NOTIFY_TO:'owner@example.test',ASSISTANT_PUBLIC_ORIGIN:origin,RESEND_API_KEY:'test',ASSISTANT_EMAIL_DAILY_LIMIT:'3'});
    const wrongAck:typeof fetch=async()=>new Response('{}',{status:200});
    const result=await notificationService.drainOwnerNotifications(env,wrongAck);
    expect(result).toMatchObject({sent:0,failed:1});
    const row=db.sql.prepare('SELECT status,last_error FROM assistant_notifications').get() as {status:string;last_error:string};
    expect(row.status).toBe('pending');
  });
});
