'use strict';
// Read-only browser QA. Infrastructure failures may change engines; product failures never do.
const ENGINES=Object.freeze(['chromium','webkit','firefox']);
const BLOCKED=/ERR_BLOCKED_BY_ADMINISTRATOR/i;
const MISSING=/Executable doesn't exist|Executable does not exist|Please run (?:the following command to download|.*playwright install)|browser.*not installed|browser.*not found|ENOENT|No such file or directory/i;
function normalizeLoopbackOrigin(value){
  if(typeof value!=='string'||!value)throw Error('KNABA_TEST_URL must be a loopback HTTP origin');
  let url;
  try{url=new URL(value)}catch{throw Error('Invalid KNABA_TEST_URL')}
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
     url.username||url.password||url.pathname!=='/'||url.search||url.hash){
    throw Error('Only an isolated loopback HTTP origin is permitted for this QA');
  }
  return url.origin;
}
function reasonFor(error,stage){
  const message=String(error?.message||error);
  if(BLOCKED.test(message))return 'POLICY_BLOCKED';
  if(stage==='launch'&&MISSING.test(message))return 'BROWSER_UNAVAILABLE';
  return null;
}
async function runBrowserGate({origin,engines,suite,skipEngines=[]}){
  const base=normalizeLoopbackOrigin(origin);
  if(typeof suite!=='function')throw TypeError('suite must be a function');
  const skipped=[];
  for(const name of ENGINES){
    if(skipEngines.includes(name)){
      skipped.push({engine:name,reason:'SKIPPED_BY_OPERATOR'});
      continue;
    }
    const driver=engines?.[name];
    if(!driver||typeof driver.launch!=='function'){
      skipped.push({engine:name,reason:'BROWSER_UNAVAILABLE'});
      continue;
    }
    let browser,page,stage='launch';
    try{
      const options={headless:true};
      if(name==='chromium'){
        options.args=['--no-sandbox','--disable-dev-shm-usage'];
        if(process.env.KNABA_CHROME_PATH)options.executablePath=process.env.KNABA_CHROME_PATH;
      }
      browser=await driver.launch(options);
      stage='preflight';
      page=await browser.newPage({viewport:{width:390,height:844}});
      const response=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:15000});
      if(response?.status()!==200){
        return {status:'FAIL',engine:name,error:'Preview homepage HTTP '+(response?.status()??'no response'),skipped};
      }
      await page.close();page=undefined;
      stage='suite';
      const cases=await suite({browser,engine:name,origin:base});
      return {status:'PASS',engine:name,cases,skipped};
    }catch(error){
      const reason=reasonFor(error,stage);
      if(reason){skipped.push({engine:name,reason});continue;}
      return {status:'FAIL',engine:name,error:String(error?.message||error),skipped};
    }finally{
      if(page)try{await page.close()}catch{}
      if(browser)try{await browser.close()}catch{}
    }
  }
  return {status:'BLOCKED',reason:'NO_USABLE_BROWSER',skipped};
}
module.exports={normalizeLoopbackOrigin,runBrowserGate};
