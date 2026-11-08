import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {runProcess,ownProcess,startPreview,assertSuiteReceipt,assertErpUiReport,assertAccountReceipt,accountRequiredChecks} from './ci-browser.mjs';
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
  // This is a close/pipe-ownership assertion, not a cold Node startup budget.
  // Leave bounded headroom for two processes on a busy shared CI runner.
  const result=await runProcess(node,['-e',script],{timeoutMs:10000,tee:false});
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
test('ERP report requires both named fixture suites, all nine distinct cases and no skip, retry or failure',()=>{
  const suites=[['conversation-transfer-ui.spec.ts',4],['site-identity-link-ui.spec.ts',5]].map(([file,count])=>({file,
    specs:Array.from({length:count},(_,i)=>({file,id:file+':'+i,title:'synthetic case '+i,tests:[{status:'expected',results:[{status:'passed'}]}]})),
  }));
  const report={stats:{expected:9,unexpected:0,skipped:0,flaky:0},errors:[],suites};
  assert.deepEqual(assertErpUiReport(report),{'conversation-transfer-ui.spec.ts':4,'site-identity-link-ui.spec.ts':5});
  for(const patch of [{skipped:1},{unexpected:1},{flaky:1},{expected:0}])assert.throws(()=>assertErpUiReport({...report,stats:{...report.stats,...patch}}));
  const missing=structuredClone(report);missing.suites.pop();missing.stats.expected=4;assert.throws(()=>assertErpUiReport(missing));
  const wrong=structuredClone(report);wrong.suites[1].specs.forEach(spec=>{spec.file='conversation-transfer-ui.spec.ts';});assert.throws(()=>assertErpUiReport(wrong));
  const duplicate=structuredClone(report);duplicate.suites[1].specs[1]=structuredClone(duplicate.suites[1].specs[0]);assert.throws(()=>assertErpUiReport(duplicate));
  const unknown=structuredClone(report);unknown.suites[1].specs[0].file='unrelated.spec.ts';assert.throws(()=>assertErpUiReport(unknown));
  report.suites[0].specs[0].tests[0].results.push({status:'passed'});assert.throws(()=>assertErpUiReport(report));
});
test('account acceptance rejects partial, duplicate, failed or stale source/artifact receipts',()=>{
  const manifest={sourceSha:'a'.repeat(40),artifacts:{siteClient:{sha256:'b'.repeat(64)}}};
  const receipt={status:'PASS',sourceSha:manifest.sourceSha,clientArtifactSha256:manifest.artifacts.siteClient.sha256,
    checks:accountRequiredChecks.map(caseId=>({caseId,status:'PASS'}))};
  assertAccountReceipt(receipt,manifest);
  for(const id of accountRequiredChecks){
    assert.throws(()=>assertAccountReceipt({...receipt,checks:receipt.checks.filter(check=>check.caseId!==id)},manifest),/MISSING_REQUIRED/);
  }
  assert.throws(()=>assertAccountReceipt({...receipt,checks:[...receipt.checks,receipt.checks[0]]},manifest),/MISSING_REQUIRED/);
  assert.throws(()=>assertAccountReceipt({...receipt,checks:[...receipt.checks,{caseId:'unrelated.case',status:'PASS'}]},manifest),/EXACT_ACCOUNT_BROWSER_INVENTORY_REQUIRED/);
  assert.throws(()=>assertAccountReceipt({...receipt,checks:receipt.checks.map((check,i)=>i?check:{...check,status:'FAIL'})},manifest),/INCOMPLETE/);
  for(const patch of [{sourceSha:'c'.repeat(40)},{clientArtifactSha256:'d'.repeat(64)}])
    assert.throws(()=>assertAccountReceipt({...receipt,...patch},manifest),/SOURCE_ARTIFACT_MISMATCH/);
});
test('fixture isolates provider environments and runner uses only local owned previews and temp reporters',()=>{
  const fixture=readFileSync(new URL('./fixtures/role-ux-server.mjs',import.meta.url),'utf8');
  assert.match(fixture,/releaseEnvironment=\{\}/);assert.match(fixture,/accountEmailEnvironment=\{\}/);
  assert.match(fixture,/erpIntakeEnvironment:\{\},accountEmailEnvironment,accountMailerFactory,\s*federationEnvironment:\{\}/);
  const runner=readFileSync(new URL('./ci-browser.mjs',import.meta.url),'utf8');
  assert.match(runner,/strictPort:true,proxy:\{\}/);assert.match(runner,/--reporter=json/);assert.match(runner,/PLAYWRIGHT_JSON_OUTPUT_FILE:reportPath/);
  assert.doesNotMatch(runner,/playwright install|--no-sandbox/);
});
