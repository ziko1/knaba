
// Read-only acceptance: never invokes messenger sends, auth login or mutations.
const origin=process.env.BOT_ORIGIN || 'https://bot.knaba.de';
const parsed=new URL(origin);
if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||parsed.hostname!=='bot.knaba.de')throw Error('UNTRUSTED_ORIGIN');
const expected=process.env.EXPECTED_RUNTIME_SHA;
if(!expected||!/^[a-f0-9]{40}$/.test(expected))throw Error('EXPECTED_RUNTIME_SHA_REQUIRED');
const checks=[];
const MAX_RESPONSE_BYTES=2*1024*1024;
async function readBounded(response){
  const reader=response.body?.getReader();
  if(!reader)return '';
  const chunks=[];
  let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>MAX_RESPONSE_BYTES)throw Error('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
    const combined=new Uint8Array(length);
    let offset=0;
    for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.byteLength;}
    return new TextDecoder('utf-8',{fatal:true}).decode(combined);
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

async function check(name,path,validate){
  try{
    const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(8000),redirect:'manual',headers:{Accept:'application/json'}});
    const body=await readBounded(response);
    const passed=validate(response,body);
    checks.push({name,status:passed?'PASS':'FAIL',http:response.status});
  }catch(error){
    checks.push({name,status:'FAIL',http:null,reason:error instanceof Error?error.name:'UNKNOWN_ERROR'});
  }
}
await check('health','/healthz',r=>r.status===200);
await check('readiness','/api/v1/ready',r=>r.status===200);
await check('runtime_identity','/api/v1/version',(r,b)=>{
  if(r.status!==200)return false;
  try{const v=JSON.parse(b);return v.sha===expected&&v.mode==='TEST';}catch{return false;}
});
await check('unauthenticated_denied','/api/v1/me',r=>r.status===401||r.status===403);
await check('web_ui','/app/lead-agent?language=UK',(r,b)=>r.status===200&&b.toLowerCase().includes('<html')&&/noindex/i.test(r.headers.get('x-robots-tag')||''));
console.log(JSON.stringify({expected_sha:expected,checks},null,2));
if(checks.some(c=>c.status!=='PASS'))process.exitCode=1;
