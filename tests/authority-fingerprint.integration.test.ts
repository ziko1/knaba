import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Database } from '../apps/api/database.ts';
import { Engine } from '../apps/api/engine.ts';
import { authorityFingerprint } from '../apps/api/authority-fingerprint.ts';
import type { Actor, Data } from '../packages/domain/core.ts';

const postgres=process.env.DATABASE_URL?describe:describe.skip;
// Actual PostgreSQL transactions and actual Engine actor/scope/visibility; no
// provider/network fixtures. Missing DATABASE_URL is SKIP, never SQL acceptance.
postgres('genuine PostgreSQL fresh stream authority fingerprints',()=>{
  let db:Database,engine:Engine,company:string,stale:Actor,now:string,future:string;
  beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
  beforeEach(async()=>{
    company='authority-stream-qa-'+randomUUID();now=new Date().toISOString();future=new Date(Date.now()+3600000).toISOString();
    await db.transaction(company,'SYNTHETIC_STREAM_SETUP',async tx=>{
      await tx.add('company',{synthetic:true,operatingMode:'TEST'},company);
      await tx.add('user',{active:true,roles:['EMPLOYEE'],permissions:[],siteIds:['A'],warehouseIds:['W'],synthetic:true},'self');
      await tx.add('site',{name:'Synthetic stream scope',customerId:'customer',active:true},'A');
      await tx.add('customer_membership',{userId:'self',customerId:'customer',siteIds:['A'],permissions:['VIEW'],active:true,expiresAt:future},'membership');
      await tx.add('channel',{type:'SITE_INTERNAL',site_id:'A',members:[{user_id:'self',history_from:now,expires_at:future},{user_id:'other',history_from:now}]},'channel');
    });stale=await engine.getActor('self',company);
  });
  afterAll(async()=>{await db?.close();});
  const read=(at=now)=>db.transaction(company,'self',tx=>authorityFingerprint(tx,engine,stale,at),10000,true);
  async function change(kind:string,id:string,patch:Data){await db.transaction(company,'SYNTHETIC_STREAM_CHANGE',async tx=>{const row=await tx.get(kind,id);await tx.save(row,{...row.data,...patch});});}
  it('real role and site rights reload even while the caller retains the original authenticated actor',async()=>{
    const before=await read();await change('user','self',{siteIds:[]});const removed=await read();expect(removed).not.toBe(before);expect(stale.siteIds).toEqual(['A']);
    await change('user','self',{roles:['QUALITY_CONTROL']});expect(await read()).not.toBe(removed);
  });
  it('real customer membership revocation changes authority with zero message/notification changes',async()=>{
    const before=await read();await change('customer_membership','membership',{active:false,revokedAt:now});expect(await read()).not.toBe(before);
    expect(await db.transaction(company,'self',tx=>tx.list('message'))).toHaveLength(0);expect(await db.transaction(company,'self',tx=>tx.list('notification'))).toHaveLength(0);
  });
  it('real own channel expiry and revocation change authority while ordinary chat messages/channel revisions do not',async()=>{
    const before=await read();await db.transaction(company,'SYNTHETIC_CHAT_ACTIVITY',async tx=>{const channel=await tx.get('channel','channel');await tx.save(channel,{...channel.data,name:'Synthetic renamed channel',handoff:{state:'HUMAN_ACTIVE',owner_id:'other'},members:channel.data.members.map((m:Data)=>m.user_id==='other'?{...m,revoked_at:now}:m)});await tx.add('message',{channel_id:'channel',text:'Synthetic message',author_id:'other'});});
    expect(await read()).toBe(before);expect(await read(future)).not.toBe(before);
    await db.transaction(company,'SYNTHETIC_CHANNEL_REVOKE',async tx=>{const c=await tx.get('channel','channel');await tx.save(c,{...c.data,members:c.data.members.map((m:Data)=>m.user_id==='self'?{...m,revoked_at:now}:m)});});expect(await read()).not.toBe(before);
  });
  it('runs in actual SQL READ ONLY and emits no aggregate/audit/outbox effects',async()=>{
    const tables=['aggregate_revisions','audit_log','outbox'],counts=async()=>Promise.all(tables.map(table=>db.query(`SELECT count(*)::int AS n FROM ${table} WHERE company_id=$1`,[company])));
    const before=await counts();const hash=await db.transaction(company,'self',async tx=>{expect((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on');return authorityFingerprint(tx,engine,stale,now);},10000,true);expect(hash).toMatch(/^[a-f0-9]{64}$/);expect((await counts()).map(r=>r.rows)).toEqual(before.map(r=>r.rows));
  });
});
