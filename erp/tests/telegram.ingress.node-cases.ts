import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptTelegramWebhook} from '../apps/api/telegram-ingress.ts';
import {TelegramBoundaryError} from '../packages/integrations/telegram.ts';
const secret='trusted_webhook_secret_test_2026';
const data={update_id:10,message:{message_id:12,date:1792000000,chat:{type:'private',id:12345},from:{id:12345},text:'Neue Anfrage'}};
const body = (v:unknown=data)=>Buffer.from(JSON.stringify(v));
const error=(code:string)=>(e:unknown)=>e instanceof TelegramBoundaryError&&e.code===code;
function fakeStore(){
  const records = new Map<string,{companyId:string;payload:string}>();
  const events: Array<unknown> = [];
  const db = {transaction:async (_company:string,_actor:string,fn:(tx:any)=>Promise<any>)=> fn({
    query:async (_sql:string,params:unknown[])=>{
      const [provider,id,company,payload]=params as string[]; const canonicalPayload=_sql.startsWith('INSERT')?payload:company; const key=`${provider}:${id}`;
      if(_sql.startsWith('INSERT')){
        if(records.has(key))return {rows:[]};
        records.set(key,{companyId:company,payload});return {rows:[{event_id:id}]};
      }
      const old=records.get(key);return {rows:old?[{company_id:old.companyId,identical:old.payload===canonicalPayload}]:[]};
    },
    event:async (type:string,fields:unknown)=>{events.push({type,fields});}
  })};
  return {db,records,events};
}

test('webhook missing/wrong shared secret does not touch the database',async()=>{
  const f=fakeStore();
  await assert.rejects(acceptTelegramWebhook(f.db as any,'companyA',body(),'bad',secret),error('ACCESS_DENIED'));
  await assert.rejects(acceptTelegramWebhook(f.db as any,'companyA',body(),secret,undefined),error('MISSING_CONFIGURATION'));
  assert.equal(f.events.length,0);assert.equal(f.records.size,0);
});

test('one verified text delivers one durable event; exact replay returns accepted without duplicate',async()=>{
  const f=fakeStore();
  assert.deepEqual(await acceptTelegramWebhook(f.db as any,'companyA',body(),secret,secret),{accepted:true});
  assert.deepEqual(await acceptTelegramWebhook(f.db as any,'companyA',body(),secret,secret),{accepted:true});
  assert.equal(f.records.size,1);assert.equal(f.events.length,1);
  assert.deepEqual(f.events[0],{type:'telegram.inbound',fields:{provider:'TELEGRAM',event_id:'TELEGRAM:10'}});
});

test('inconsistent replay and cross-company collision fail closed',async()=>{
  const f=fakeStore();await acceptTelegramWebhook(f.db as any,'companyA',body(),secret,secret);
  await assert.rejects(acceptTelegramWebhook(f.db as any,'companyA',body({...data,message:{...data.message,text:'different'}}),secret,secret),error('VALIDATION_ERROR'));
  await assert.rejects(acceptTelegramWebhook(f.db as any,'companyB',body(),secret,secret),error('ACCESS_DENIED'));
  assert.equal(f.events.length,1);
});

test('out-of-scope group update acknowledged without creating a user or event',async()=>{
  const f=fakeStore();
  const group={...data,message:{...data.message,chat:{type:'supergroup',id:-200}}};
  assert.deepEqual(await acceptTelegramWebhook(f.db as any,'companyA',body(group),secret,secret),{accepted:true,ignored:true});
  assert.equal(f.records.size,0);
});

test('oversize, bad JSON and malformed private messages never ack success',async()=>{
  const f=fakeStore();
  await assert.rejects(acceptTelegramWebhook(f.db as any,'companyA',Buffer.alloc(64*1024+1),secret,secret),error('VALIDATION_ERROR'));
  await assert.rejects(acceptTelegramWebhook(f.db as any,'companyA',Buffer.from('{'),secret,secret),error('VALIDATION_ERROR'));
  await assert.rejects(acceptTelegramWebhook(f.db as any,'companyA',body({...data,update_id:-1}),secret,secret),error('VALIDATION_ERROR'));
  assert.equal(f.records.size,0);
});

test('database failure is propagated; no false accepted receipt',async()=>{
  const bad={transaction:async()=>{throw new Error('database offline')}};
  await assert.rejects(acceptTelegramWebhook(bad as any,'companyA',body(),secret,secret),/database offline/);
});
