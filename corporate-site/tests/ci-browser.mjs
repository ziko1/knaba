/** Installed browsers only; own loopback previews and synthetic data, never a deployment. */
import {accessSync,constants,readFileSync,mkdirSync,writeFileSync,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {measureCandidate,verifyManifest} from './ci-artifacts.mjs';
const require=createRequire(import.meta.url),{browserFailureReason}=require('./browser-policy-gate.cjs');
const site=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(site,'..');
const blocked=message=>Object.assign(Error(message),{exitCode:2});
function installed(path){try{accessSync(path,constants.X_OK);return true;}catch{return false;}}
async function finishesWithin(promise,ms){
  let timer;try{return await Promise.race([promise.then(()=>true),new Promise(done=>{timer=setTimeout(()=>done(false),ms);})]);}finally{clearTimeout(timer);}
}
export function ownProcess(command,args,{cwd,env=process.env,logPath,onStdout,tee=true,killGraceMs=3000}={}){
  const log=logPath?createWriteStream(logPath):null;
  const grouped=process.platform!=='win32';
  const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:grouped});
  let stdout='',stderr='',result=null,spawnError,stopping;
  const collect=(data,isError)=>{
    const text=String(data);if(isError)stderr=(stderr+text).slice(-65536);else{stdout=(stdout+text).slice(-65536);onStdout?.(text);}
    if(tee)(isError?process.stderr:process.stdout).write(data);log?.write(data);
  };
  child.stdout.on('data',data=>collect(data,false));child.stderr.on('data',data=>collect(data,true));
  child.once('error',error=>{spawnError=error;});
  log?.once('error',error=>{spawnError??=error;void stop().catch(()=>{});});
  const closed=new Promise(resolveClosed=>child.once('close',(code,signal)=>{
    result={code,signal,stdout,stderr,error:spawnError};
    if(log&&!log.destroyed)log.end(error=>{if(error)result.error??=error;resolveClosed(result);});else resolveClosed(result);
  }));
  async function stop(){
    if(stopping)return stopping;
    stopping=(async()=>{
      if(result)return closed;
      const kill=signal=>{try{if(grouped&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
      kill('SIGTERM');
      if(!await finishesWithin(closed,killGraceMs)){
        kill('SIGKILL');
        if(!await finishesWithin(closed,killGraceMs))throw Error('OWNED_PROCESS_DID_NOT_CLOSE');
      }
      return closed;
    })();return stopping;
  }
  return {child,closed,stop,get result(){return result;}};
}
export async function runProcess(command,args,{timeoutMs=300000,signal,...options}={}){
  if(signal?.aborted)throw Error('BROWSER_RUN_CANCELLED');
  const owned=ownProcess(command,args,options);let timer,onAbort;
  try{
    const result=await Promise.race([owned.closed,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error('CHILD_PROCESS_TIMEOUT')),timeoutMs);
      onAbort=()=>reject(Error('BROWSER_RUN_CANCELLED'));signal?.addEventListener('abort',onAbort,{once:true});
    })]);
    if(result.error)throw result.error;
    if(result.code!==0)throw Object.assign(Error('Child exited '+(result.code??result.signal)),{exitCode:result.code===2?2:1});
    return result;
  }finally{clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);await owned.stop();}
}
export function assertSuiteReceipt(value,{publicCases,requiredChecks=[]}={}){
  if(value?.status!=='PASS')throw value?.status==='BLOCKED'?blocked('Browser suite blocked'):Error('Browser suite is not PASS');
  if(value.engines?.some(engine=>engine.status==='BLOCKED')||value.skipped?.some(engine=>['POLICY_BLOCKED','BROWSER_UNAVAILABLE'].includes(engine.reason)))
    throw blocked('An engine was blocked; stop before another suite can retry it');
  if(publicCases!==undefined){if(value.cases!==publicCases)throw Error('INCOMPLETE_PUBLIC_BROWSER_CASES');}
  else if(!value.checks?.length||value.checks.some(check=>check.status!=='PASS'))throw Error('INCOMPLETE_BROWSER_CHECKS');
  if(requiredChecks.some(id=>value.checks?.filter(check=>check.caseId===id).length!==1))throw Error('MISSING_REQUIRED_BROWSER_CASE');
}
export function assertErpUiReport(report){
  const tests=[];function walk(suites){for(const suite of suites??[]){for(const spec of suite.specs??[])tests.push(...(spec.tests??[]));walk(suite.suites);}}
  walk(report?.suites);
  if(report?.stats?.expected!==4||report.stats.unexpected!==0||report.stats.skipped!==0||report.stats.flaky!==0||
    report.errors?.length||tests.length!==4||tests.some(test=>test.status!=='expected'||test.results?.length!==1||test.results[0].status!=='passed'))throw Error('FOUR_ERP_HTTP_FIXTURE_UI_CASES_MUST_PASS');
  return tests.length;
}
export async function startPreview(command,args,{url,marker,signal,...options}){
  let ownListening=false,seen='';
  const owned=ownProcess(command,args,{...options,onStdout:text=>{seen=(seen+text).slice(-8192);if(seen.includes(marker))ownListening=true;}});
  try{
    for(let attempt=0;attempt<100;attempt++){
      if(signal.aborted)throw Error('BROWSER_RUN_CANCELLED');
      if(owned.result||owned.child.exitCode!==null||owned.child.signalCode!==null)throw Error('OWNED_PREVIEW_EXITED_BEFORE_READINESS');
      // Readiness needs only status. GET left an unread response stream when
      // the Python HTTP/1.0 preview closed its socket (Undici parser assertion
      // in the observed Node24 CI). HEAD has no body to abandon or buffer.
      if(ownListening)try{const response=await fetch(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(1000)});if(response.status===200)return owned;}catch{}
      await wait(100);
    }
    throw Error('OWNED_PREVIEW_NOT_READY');
  }catch(error){await owned.stop();throw error;}
}
export async function main(){
  const output=process.env.KNABA_BROWSER_QA_DIR||join(process.env.RUNNER_TEMP||'/tmp','knaba-browser-'+process.pid);
  mkdirSync(output,{recursive:true});
  const receipt={startedAt:new Date().toISOString(),scope:'Actual rendered browsers; loopback synthetic data. ERP transfer uses explicit HTTP fixtures, not provider/PostgreSQL acceptance.',stages:[]};
  const previews=[],abort=new AbortController();
  const cancel=()=>abort.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  let manifestPath,manifestBytes,manifest,inputsVerified=false,completed=false;
  const env={...process.env};
  const run=(file,extra={},captureName)=>runProcess(process.execPath,[file],{cwd:site,env:{...env,...extra},signal:abort.signal,logPath:join(output,captureName??file.split('/').at(-1)+'.log')});
  try{
    manifestPath=process.env.KNABA_CI_ARTIFACT_MANIFEST;if(!manifestPath)throw Error('BUILD_MANIFEST_REQUIRED');
    manifestBytes=readFileSync(manifestPath);manifest=JSON.parse(manifestBytes);
    verifyManifest(manifest,await measureCandidate(process.env.SOURCE_SHA));
    inputsVerified=true;
    receipt.sourceSha=manifest.sourceSha;receipt.buildManifestSha256=createHash('sha256').update(manifestBytes).digest('hex');receipt.artifacts=manifest.artifacts;
    writeFileSync(join(output,'build-manifest.json'),manifestBytes);
    const chrome=[process.env.KNABA_CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(installed);
    if(!chrome)throw blocked('No installed Chrome executable; no download or sandbox bypass is permitted');
    const erpRequire=createRequire(join(repo,'erp/package.json'));
    env.KNABA_CHROME_PATH=chrome;env.KNABA_PLAYWRIGHT_MODULE=erpRequire.resolve('playwright');
    receipt.chromePath=chrome;receipt.chromeVersion=execFileSync(chrome,['--version'],{encoding:'utf8',timeout:10000}).trim();receipt.playwrightVersion=erpRequire('playwright/package.json').version;
    await run('tests/role-cabinets-browser.mjs',{KNABA_ROLE_QA_DIR:join(output,'roles')});
    const roles=JSON.parse(readFileSync(join(output,'roles/browser-receipt.json'),'utf8'));
    assertSuiteReceipt(roles,{requiredChecks:['assistant.display.closed','assistant.display.visible','assistant.display.owner-label','assistant.display.reset']});
    receipt.stages.push({name:'site roles and display receipts',kind:'ACTUAL_SQLITE_HTTP_BROWSER',checks:roles.checks.length,engine:roles.browser,browserVersion:roles.browserVersion,status:'PASS'});
    await run('tests/portal-languages-browser.mjs',{KNABA_QA_SOURCE_SHA:manifest.sourceSha,KNABA_QA_CLIENT_SHA256:manifest.artifacts.siteClient.sha256,KNABA_PORTAL_LANGUAGE_QA_DIR:join(output,'languages')});
    const languages=JSON.parse(readFileSync(join(output,'languages/portal-languages-browser-receipt.json'),'utf8'));assertSuiteReceipt(languages);
    receipt.stages.push({name:'site six-language navigation',kind:'ACTUAL_SQLITE_HTTP_BROWSER',checks:languages.checks.length,engine:languages.browser,browserVersion:languages.browserVersion,status:'PASS'});
    const staticPreview=await startPreview('python3',['-u','-m','http.server','18769','--bind','127.0.0.1','--directory',join(site,'dist/client')],{
      cwd:site,env,url:'http://127.0.0.1:18769/',marker:'Serving HTTP on 127.0.0.1 port 18769',signal:abort.signal,logPath:join(output,'static-preview.log')});previews.push(staticPreview);
    const publicRun=await run('tests/knaba-logo-browser.cjs',{KNABA_TEST_URL:'http://127.0.0.1:18769',KNABA_SCREENSHOT_DIR:join(output,'public')});
    const lines=publicRun.stdout.split('\n').filter(value=>value.startsWith('KNABA_LOGO_BROWSER_QA '));
    if(lines.length!==1)throw Error('ONE_PUBLIC_BROWSER_RESULT_REQUIRED');
    const publicResult=JSON.parse(lines[0].slice('KNABA_LOGO_BROWSER_QA '.length));assertSuiteReceipt(publicResult,{publicCases:24});
    receipt.stages.push({name:'six public locales by four viewports',kind:'ACTUAL_RENDERED_STATIC_BROWSER',cases:24,engine:publicResult.engine,status:'PASS'});await staticPreview.stop();

    if((env.KNABA_BROWSER_SKIP??'').split(',').map(value=>value.trim()).includes('chromium'))throw blocked('Chromium was already skipped; do not retry for ERP fixtures');
    const erp=join(repo,'erp'),erpOutput=join(output,'erp-transfer');mkdirSync(erpOutput,{recursive:true});
    // Vite preview inherits server.proxy by default. Explicitly disable it so an
    // unhandled fixture request cannot reach another service on port 3000.
    const viteCode=`import {preview} from ${JSON.stringify(pathToFileURL(join(erp,'node_modules/vite/dist/node/index.js')).href)};const server=await preview({configFile:${JSON.stringify(join(erp,'apps/web/vite.config.ts'))},preview:{host:'127.0.0.1',port:4177,strictPort:true,proxy:{}}});const address=server.httpServer.address();if(!address||typeof address==='string'||address.address!=='127.0.0.1'||address.port!==4177)throw Error('Unexpected preview listener');console.log('KNABA_ERP_PREVIEW_READY');`;
    const erpPreview=await startPreview(process.execPath,['--input-type=module','-e',viteCode],{cwd:erp,env,url:'http://127.0.0.1:4177/',marker:'KNABA_ERP_PREVIEW_READY',signal:abort.signal,logPath:join(erpOutput,'preview.log')});previews.push(erpPreview);
    const reportPath=join(erpOutput,'result.json');
    writeFileSync(reportPath,''); // A failed launch must never reuse an earlier result.
    try{
      await runProcess(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/conversation-transfer-ui.spec.ts','--config','playwright.config.ts','--reporter=json','--output',join(erpOutput,'artifacts')],{
        cwd:erp,env:{...env,PLAYWRIGHT_CHROMIUM_EXECUTABLE:chrome,E2E_BASE_URL:'http://127.0.0.1:4177',PLAYWRIGHT_JSON_OUTPUT_FILE:reportPath},timeoutMs:240000,signal:abort.signal,logPath:join(erpOutput,'runner.log')});
    }catch(error){
      let text='';try{text=readFileSync(reportPath,'utf8');}catch{}
      if(browserFailureReason(text,'launch'))throw blocked('ERP browser launch blocked; no retry');throw error;
    }
    const erpReport=JSON.parse(readFileSync(reportPath,'utf8'));
    receipt.stages.push({name:'ERP conversation transfer',kind:'RENDERED_UI_WITH_HTTP_FIXTURES',cases:assertErpUiReport(erpReport),engine:'chromium',status:'PASS',scope:'Four route-fulfilled UI cases; separate from signed real HTTP/PostgreSQL tests'});
    await erpPreview.stop();
    completed=true;
  }catch(error){receipt.status=error.exitCode===2?'BLOCKED':'FAIL';receipt.reason=String(error.message);process.exitCode=error.exitCode===2?2:1;}
  finally{
    for(const preview of previews.reverse())try{await preview.stop();}catch(error){receipt.status='FAIL';receipt.reason='Preview cleanup: '+error.message;process.exitCode=1;}
    if(inputsVerified)try{
      if(!readFileSync(manifestPath).equals(manifestBytes))throw Error('BUILD_MANIFEST_CHANGED');
      verifyManifest(manifest,await measureCandidate(process.env.SOURCE_SHA));receipt.inputsUnchanged=true;
    }catch(error){receipt.status='FAIL';receipt.reason='Final artifact/source verification: '+error.message;}
    if(abort.signal.aborted){receipt.status='FAIL';receipt.reason='BROWSER_RUN_CANCELLED';}
    if(completed&&!receipt.status&&receipt.inputsUnchanged)receipt.status='PASS';
    process.exitCode=receipt.status==='PASS'?0:receipt.status==='BLOCKED'?2:1;
    process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
    receipt.finishedAt=new Date().toISOString();writeFileSync(join(output,'integration-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log('KNABA_BROWSER_INTEGRATION '+JSON.stringify(receipt));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
