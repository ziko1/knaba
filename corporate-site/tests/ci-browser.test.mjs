import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runProcess,ownProcess,assertSuiteReceipt,assertErpUiReport} from './ci-browser.mjs';
const node=process.execPath;
test('waits for close and captures inherited stdout even after the direct child exits',async()=>{
  const grandchild="setTimeout(()=>process.stdout.write('LATE_RESULT\\n'),75)";
  const script="require('node:child_process').spawn(process.execPath,['-e',"+JSON.stringify(grandchild)+"],{stdio:['ignore',1,2]});process.exit(0)";
  const result=await runProcess(node,['-e',script],{timeoutMs:3000,tee:false});
  assert.equal(result.stdout,'LATE_RESULT\n');assert.equal(result.code,0);
});
test('a deadline terminates only the owned process group and waits for SIGKILL close if TERM is ignored',async()=>{
  let pid;
  await assert.rejects(()=>runProcess(node,['-e',"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"],{
    timeoutMs:800,killGraceMs:50,tee:false,onStdout:text=>{pid=Number(text.trim());},
  }),/CHILD_PROCESS_TIMEOUT/);
  assert.ok(pid>0);assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
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
test('ERP report requires exactly four executed fixture UI cases without skip, retry or failure',()=>{
  const tests=Array.from({length:4},()=>({status:'expected',results:[{status:'passed'}]}));
  const report={stats:{expected:4,unexpected:0,skipped:0,flaky:0},errors:[],suites:[{specs:tests.map(test=>({tests:[test]}))}]};
  assert.equal(assertErpUiReport(report),4);
  for(const patch of [{skipped:1},{unexpected:1},{flaky:1},{expected:0}])assert.throws(()=>assertErpUiReport({...report,stats:{...report.stats,...patch}}));
  tests[0].results.push({status:'passed'});assert.throws(()=>assertErpUiReport(report));
});
test('fixture isolates provider environments and runner uses only local owned previews and temp reporters',()=>{
  const fixture=readFileSync(new URL('./fixtures/role-ux-server.mjs',import.meta.url),'utf8');
  assert.match(fixture,/releaseEnvironment=\{\}/);assert.match(fixture,/erpIntakeEnvironment:\{\},accountEmailEnvironment:\{\}/);
  const runner=readFileSync(new URL('./ci-browser.mjs',import.meta.url),'utf8');
  assert.match(runner,/strictPort:true,proxy:\{\}/);assert.match(runner,/--reporter=json/);assert.match(runner,/PLAYWRIGHT_JSON_OUTPUT_FILE:reportPath/);
  assert.doesNotMatch(runner,/playwright install|--no-sandbox/);
});
