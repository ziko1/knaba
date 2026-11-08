import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {runProcess,ownProcess,startPreview,assertSuiteReceipt,assertErpUiReport} from './ci-browser.mjs';
const node=process.execPath;
async function unusedLoopbackPort(){
  const server=createServer();await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  const port=server.address().port;await new Promise(yes=>server.close(yes));return port;
}
test('owned preview readiness uses a bodyless HEAD and waits for its own listener',async()=>{
  const port=await unusedLoopbackPort(),marker='SYNTHETIC_PREVIEW_READY';
  const script=`const http=require('node:http');const s=http.createServer((req,res)=>{console.log('METHOD '+req.method);res.setHeader('Connection','close');res.statusCode=req.method==='HEAD'?200:405;res.end();if(req.method!=='HEAD')s.close();});s.listen(${port},'127.0.0.1',()=>console.log('${marker}'));`;
  const owned=await startPreview(node,['-e',script],{url:'http://127.0.0.1:'+port+'/',marker,signal:new AbortController().signal,tee:false});
  const result=await owned.stop();assert.match(result.stdout,/METHOD HEAD/);assert.doesNotMatch(result.stdout,/METHOD GET/);
});
test('an owned preview HTTP failure is not accepted as ready',async()=>{
  const port=await unusedLoopbackPort(),marker='SYNTHETIC_PREVIEW_READY';
  const script=`const http=require('node:http');const s=http.createServer((req,res)=>{res.setHeader('Connection','close');res.statusCode=503;res.end();s.close();});s.listen(${port},'127.0.0.1',()=>console.log('${marker}'));`;
  await assert.rejects(()=>startPreview(node,['-e',script],{url:'http://127.0.0.1:'+port+'/',marker,signal:new AbortController().signal,tee:false}),/OWNED_PREVIEW_EXITED_BEFORE_READINESS/);
});
test('waits for close and captures inherited stdout even after the direct child exits',async()=>{
  const grandchild="setTimeout(()=>process.stdout.write('LATE_RESULT\\n'),75)";
  const script="require('node:child_process').spawn(process.execPath,['-e',"+JSON.stringify(grandchild)+"],{stdio:['ignore',1,2]});process.exit(0)";
  const result=await runProcess(node,['-e',script],{timeoutMs:3000,tee:false});
  assert.equal(result.stdout,'LATE_RESULT\n');assert.equal(result.code,0);
});
test('a deadline closes its child and a ready TERM-ignoring child is killed before cleanup resolves',async()=>{
  // Deadline enforcement must also work before a busy runner schedules Node.
  await assert.rejects(()=>runProcess(node,['-e','setInterval(()=>{},1000)'],{
    timeoutMs:50,killGraceMs:500,tee:false,
  }),/CHILD_PROCESS_TIMEOUT/);
  let announce,output='',timer;
  const ready=new Promise(resolve=>{announce=resolve;});
  const owned=ownProcess(node,['-e',"process.on('SIGTERM',()=>{});console.log('READY '+process.pid);setInterval(()=>{},1000)"],{
    killGraceMs:500,tee:false,onStdout:text=>{output+=text;const match=/^READY ([0-9]+)\n/m.exec(output);if(match)announce(Number(match[1]));},
  });
  try{
    const pid=await Promise.race([ready,owned.closed.then(()=>{throw Error('CHILD_EXITED_BEFORE_READY');}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CHILD_STARTUP_TIMEOUT')),5000);})]);
    assert.equal(pid,owned.child.pid);
    const result=await owned.stop();assert.equal(result.signal,'SIGKILL');
    assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
  }finally{clearTimeout(timer);await owned.stop();}
});
test('an already completed child has idempotent bounded cleanup',async()=>{
  const child=ownProcess(node,['-e','process.stdout.write("done")'],{tee:false});
  assert.equal((await child.closed).stdout,'done');assert.equal((await child.stop()).code,0);assert.equal((await child.stop()).code,0);
});
test('spawn failure and abort reject without accepting a successful suite',async()=>{
  await assert.rejects(()=>runProcess('/no-such-knaba-ci-executable',[],{tee:false,killGraceMs:50}),/ENOENT/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>runProcess(node,['-e',''],{signal:controller.signal,tee:false}),/BROWSER_RUN_CANCELLED/);
});
test('a fallback PASS containing an engine block stops the wrapper before another browser launch',()=>{
  const base={status:'PASS',checks:[{status:'PASS'}]};assertSuiteReceipt(base);
  assert.throws(()=>assertSuiteReceipt({...base,engines:[{engine:'chromium',status:'BLOCKED'}]}),error=>error.exitCode===2);
  assert.throws(()=>assertSuiteReceipt({status:'PASS',cases:24,skipped:[{engine:'chromium',reason:'POLICY_BLOCKED'}]},{publicCases:24}),error=>error.exitCode===2);
  assert.throws(()=>assertSuiteReceipt({status:'PASS',cases:23},{publicCases:24}),/INCOMPLETE/);
  assert.throws(()=>assertSuiteReceipt({status:'PASS',checks:[]}),/INCOMPLETE/);
  assert.throws(()=>assertSuiteReceipt(base,{requiredChecks:['assistant.display.visible']}),/MISSING_REQUIRED/);
  assertSuiteReceipt({status:'PASS',checks:[{status:'PASS',caseId:'assistant.display.visible'}]},{requiredChecks:['assistant.display.visible']});
});
test('ERP report requires all four named fixture suites, all thirty distinct cases and no skip, retry or failure',()=>{
  const suites=[['conversation-transfer-ui.spec.ts',4],['site-identity-link-ui.spec.ts',5],['federation-login-ui.spec.ts',10],['privacy-projection-ui.spec.ts',11]].map(([file,count])=>({file,
    specs:Array.from({length:count},(_,i)=>({file,id:file+':'+i,title:'synthetic case '+i,tests:[{status:'expected',results:[{status:'passed'}]}]})),
  }));
  const report={stats:{expected:30,unexpected:0,skipped:0,flaky:0},errors:[],suites};
  assert.deepEqual(assertErpUiReport(report),{'conversation-transfer-ui.spec.ts':4,'site-identity-link-ui.spec.ts':5,'federation-login-ui.spec.ts':10,'privacy-projection-ui.spec.ts':11});
  for(const patch of [{skipped:1},{unexpected:1},{flaky:1},{expected:0}])assert.throws(()=>assertErpUiReport({...report,stats:{...report.stats,...patch}}));
  const missing=structuredClone(report);missing.suites.pop();missing.stats.expected=4;assert.throws(()=>assertErpUiReport(missing));
  const wrong=structuredClone(report);wrong.suites[1].specs.forEach(spec=>{spec.file='conversation-transfer-ui.spec.ts';});assert.throws(()=>assertErpUiReport(wrong));
  const duplicate=structuredClone(report);duplicate.suites[1].specs[1]=structuredClone(duplicate.suites[1].specs[0]);assert.throws(()=>assertErpUiReport(duplicate));
  const unknown=structuredClone(report);unknown.suites[1].specs[0].file='unrelated.spec.ts';assert.throws(()=>assertErpUiReport(unknown));
  report.suites[0].specs[0].tests[0].results.push({status:'passed'});assert.throws(()=>assertErpUiReport(report));
});
test('fixture isolates provider environments and runner uses only local owned previews and temp reporters',()=>{
  const fixture=readFileSync(new URL('./fixtures/role-ux-server.mjs',import.meta.url),'utf8');
  assert.match(fixture,/releaseEnvironment=\{\}/);assert.match(fixture,/erpIntakeEnvironment:\{\},accountEmailEnvironment:\{\}/);
  const runner=readFileSync(new URL('./ci-browser.mjs',import.meta.url),'utf8');
  assert.match(runner,/strictPort:true,proxy:\{\}/);assert.match(runner,/--reporter=json/);assert.match(runner,/PLAYWRIGHT_JSON_OUTPUT_FILE:reportPath/);
  assert.doesNotMatch(runner,/playwright install|--no-sandbox/);
});
