'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runBrowserGate, normalizeLoopbackOrigin}=require('./browser-policy-gate.cjs');
const origin='http://127.0.0.1:18769';
const newEngine=({atLaunch,atGoto,httpStatus=200}={})=>({
  async launch(){
    if(atLaunch)throw Error(atLaunch);
    return {
      async newPage(){
        return {
          async goto(){if(atGoto)throw Error(atGoto);return {status:()=>httpStatus};},
          async close(){}
        };
      },
      async close(){}
    };
  }
});
test('admin-blocked Chromium falls back once to WebKit, no duplicate Chrome launch',async()=>{
  const launches=[];
  const chromium=newEngine({atGoto:'page.goto: net::ERR_BLOCKED_BY_ADMINISTRATOR'});
  const webkit=newEngine();
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const old=engine.launch.bind(engine);
    engine.launch=async(...args)=>{launches.push(name);return old(...args)};
  }
  let suiteRuns=0;
  const result=await runBrowserGate({origin,engines:{chromium,webkit},suite:async()=>{suiteRuns++;return 16;}});
  assert.deepEqual(launches,['chromium','webkit']);
  assert.equal(result.status,'PASS');
  assert.equal(result.engine,'webkit');
  assert.equal(result.cases,16);
  assert.equal(result.skipped[0].reason,'POLICY_BLOCKED');
  assert.equal(suiteRuns,1);
});
test('all policy-blocked browsers remain BLOCKED, not PASS',async()=>{
  let ran=0;
  const fail=newEngine({atGoto:'net::ERR_BLOCKED_BY_ADMINISTRATOR'});
  const result=await runBrowserGate({origin,engines:{chromium:fail,webkit:fail,firefox:fail},suite:async()=>{ran++;}});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.skipped.length,3);
  assert.equal(ran,0);
});
test('unavailable Chrome executable falls back to WebKit',async()=>{
  const result=await runBrowserGate({origin,engines:{chromium:newEngine({atLaunch:'Executable does not exist'}),webkit:newEngine()},suite:async()=>0});
  assert.equal(result.status,'PASS');
  assert.equal(result.engine,'webkit');
  assert.deepEqual(result.skipped.map(s=>s.reason),['BROWSER_UNAVAILABLE']);
});
test('site response 503 is FAIL, never fallback to conceal site outage',async()=>{
  let webkitUsed=false;
  const webkit=newEngine();const old=webkit.launch.bind(webkit);webkit.launch=async()=>{webkitUsed=true;return old()};
  const result=await runBrowserGate({origin,engines:{chromium:newEngine({httpStatus:503}),webkit},suite:async()=>1});
  assert.equal(result.status,'FAIL');
  assert.equal(webkitUsed,false);
});
test('suite assertion failure is FAIL, never hidden by another browser',async()=>{
  let webkitUsed=false;const webkit=newEngine();const old=webkit.launch.bind(webkit);webkit.launch=async()=>{webkitUsed=true;return old()};
  const result=await runBrowserGate({origin,engines:{chromium:newEngine(),webkit},suite:async()=>{throw Error('horizontal overflow: 29px')}});
  assert.equal(result.status,'FAIL');
  assert.match(result.error,/horizontal overflow/);
  assert.equal(webkitUsed,false);
});
test('reject public websites and unsafe preview paths',()=>{
  assert.equal(normalizeLoopbackOrigin('http://localhost:1234/'),'http://localhost:1234');
  assert.equal(normalizeLoopbackOrigin('http://127.0.0.1:18769'),'http://127.0.0.1:18769');
  for(const url of ['https://knaba.de','https://kneba.vsp.rest','file:///tmp/test','http://localhost:1234/other','http://user:pass@localhost:1234']){
    assert.throws(()=>normalizeLoopbackOrigin(url));
  }
});
test('verified Chromium policy block can be skipped in repeated same-environment QA',async()=>{
  let chromiumUsed=false;
  const chromium=newEngine();const old=chromium.launch.bind(chromium);
  chromium.launch=async()=>{chromiumUsed=true;return old()};
  const result=await runBrowserGate({origin,engines:{chromium,webkit:newEngine()},skipEngines:['chromium'],suite:async()=>16});
  assert.equal(chromiumUsed,false);
  assert.equal(result.status,'PASS');
  assert.equal(result.engine,'webkit');
  assert.deepEqual(result.skipped.map(s=>s.reason),['SKIPPED_BY_OPERATOR']);
});
test('Chromium QA launch must not explicitly disable the browser sandbox',async()=>{
  const standard=newEngine();
  const original=standard.launch.bind(standard);
  standard.launch=async(options)=>{
    assert.ok(!options.args?.includes('--no-sandbox'),'must not add --no-sandbox');
    return original();
  };
  const result=await runBrowserGate({origin,engines:{chromium:standard},suite:async()=>1});
  assert.equal(result.status,'PASS');
});
