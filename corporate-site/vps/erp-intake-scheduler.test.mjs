import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindErpIntakeEnvironment,createErpIntakeScheduler,erpIntakeKeys} from './erp-intake-scheduler.mjs';

test('ERP scheduler keeps local maintenance running with current bindings while the core network gate stays disabled',async()=>{
  const settings={KNABA_ERP_SECRET:'synthetic-only',OTHER_SECRET:'unrelated'};
  const env=bindErpIntakeEnvironment({DB:{}},settings);let calls=0,sends=0;
  const scheduler=createErpIntakeScheduler({worker:{scheduled(_event,current){calls++;if(current.KNABA_ERP_BRIDGE_ENABLED==='true')sends++;assert.equal(current.ASSISTANT_NOTIFICATIONS_ENABLED,'0');}},env});
  try{
    assert.equal(env.OTHER_SECRET,undefined);assert.equal(env.KNABA_ERP_BRIDGE_ENABLED,undefined);
    assert.deepEqual(Object.keys(env).filter(key=>key.startsWith('KNABA_ERP_')),erpIntakeKeys);
    await scheduler.runNow();assert.equal(calls,1);assert.equal(sends,0);
    settings.KNABA_ERP_BRIDGE_ENABLED='true';settings.KNABA_ERP_SECRET='synthetic-rotated';
    assert.equal(env.KNABA_ERP_SECRET,'synthetic-rotated');await scheduler.runNow();assert.equal(calls,2);assert.equal(sends,1);
    settings.KNABA_ERP_BRIDGE_ENABLED='0';await scheduler.runNow();assert.equal(calls,3);assert.equal(sends,1);
  }finally{await scheduler.stop();}
});
test('ERP scheduler does not overlap batches, never enables email, and drains before shutdown',async()=>{
  let release,entered=0,settled=false;
  const task=new Promise(resolve=>{release=resolve;});
  const env={KNABA_ERP_BRIDGE_ENABLED:'true',ASSISTANT_NOTIFICATIONS_ENABLED:'approved',DB:{synthetic:true}};
  const worker={scheduled(event,selected,ctx){entered++;assert.equal(event.cron,'vps-erp-intake');assert.equal(selected.DB,env.DB);assert.equal(selected.ASSISTANT_NOTIFICATIONS_ENABLED,'0');assert.equal(selected.KNABA_ERP_BRIDGE_ENABLED,'true');ctx.waitUntil(task);}};
  const scheduler=createErpIntakeScheduler({worker,env});
  const first=scheduler.runNow(),second=scheduler.runNow();assert.equal(first,second);assert.equal(entered,1);
  const stopping=scheduler.stop().then(()=>{settled=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  await scheduler.runNow();assert.equal(entered,1);
  release();await stopping;assert.equal(settled,true);assert.equal(env.ASSISTANT_NOTIFICATIONS_ENABLED,'approved');
});
test('ERP scheduler reports only a static failure signal and recovers on its next tick',async()=>{
  let fail=true,reports=0,calls=0;
  const scheduler=createErpIntakeScheduler({env:{KNABA_ERP_BRIDGE_ENABLED:'0'},worker:{scheduled(){throw Error('unreachable');}}});
  await scheduler.stop();
  const actual=createErpIntakeScheduler({env:{KNABA_ERP_BRIDGE_ENABLED:'true'},onError:(...args)=>{assert.deepEqual(args,[]);reports++;},worker:{scheduled(_event,_env,ctx){calls++;ctx.waitUntil(fail?Promise.reject(Error('sensitive provider failure never reported')):Promise.resolve());}}});
  try{await actual.runNow();assert.equal(reports,1);fail=false;await actual.runNow();assert.equal(calls,2);assert.equal(reports,1);}finally{await actual.stop();}
});
