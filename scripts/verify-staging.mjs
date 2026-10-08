import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

export const ALLOWED_STAGING_ORIGIN='https://api-staging-a476.up.railway.app';
const SHA=/^[a-f0-9]{40}$/;
class VerificationError extends Error {
 constructor(code){super(code);this.code=code;}
}
function requireValue(value,code){if(!value)throw new VerificationError(code);}
export function validateStagingTarget(value){
 requireValue(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_STAGING_MARKER');
 requireValue(Object.keys(value).sort().join(',')==='companyId,expectedSha,mode,origin','INVALID_STAGING_MARKER_FIELDS');
 requireValue(value.origin===ALLOWED_STAGING_ORIGIN,'STAGING_ORIGIN_NOT_ALLOWED');
 const origin=new URL(value.origin);
 requireValue(origin.protocol==='https:'&&!origin.username&&!origin.password&&!origin.port&&origin.origin===value.origin,'STAGING_HTTPS_REQUIRED');
 requireValue(typeof value.expectedSha==='string'&&SHA.test(value.expectedSha)&&value.expectedSha!=='0'.repeat(40),'INVALID_EXPECTED_SHA');
 requireValue(value.companyId==='knaba-demo'&&value.mode==='DEMO','SYNTHETIC_DEMO_REQUIRED');
 return Object.freeze({...value});
}
export async function loadStagingTarget(path='docs/evidence/staging-target.json'){
 const bytes=await readFile(path);requireValue(bytes.length<=4096,'STAGING_MARKER_TOO_LARGE');
 let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{throw new VerificationError('INVALID_STAGING_MARKER_JSON');}
 return validateStagingTarget(value);
}
export function stagingAssets(html,origin){
 const assets=[];
 for(const match of html.matchAll(/<(script|link)\b[^>]*>/gi)){
  const tag=match[0],kind=match[1].toLowerCase();
  if(kind==='link'&&!/\brel\s*=\s*["']stylesheet["']/i.test(tag))continue;
  const attribute=kind==='script'?'src':'href';
  const ref=new RegExp('\\b'+attribute+'\\s*=\\s*["\\\']([^"\\\']+)["\\\']','i').exec(tag)?.[1];
  if(!ref)continue;
  const url=new URL(ref,origin+'/');
  requireValue(url.origin===origin&&url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/assets\/[A-Za-z0-9._-]+\.(js|css)$/.test(url.pathname),'UNSAFE_HTML_ASSET');
  assets.push({path:url.pathname,kind:kind==='script'?'script':'stylesheet'});
 }
 const unique=[...new Map(assets.map(item=>[item.path,item])).values()];
 requireValue(unique.length>0&&unique.length<=16&&unique.some(a=>a.kind==='script')&&unique.some(a=>a.kind==='stylesheet'),'REQUIRED_HTML_ASSETS_MISSING');
 return unique;
}
async function responseBytes(response,maxBytes){
 const length=Number(response.headers.get('content-length')||0);requireValue(length<=maxBytes,'RESPONSE_TOO_LARGE');
 const reader=response.body?.getReader();requireValue(reader,'RESPONSE_BODY_MISSING');const chunks=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;requireValue(size<=maxBytes,'RESPONSE_TOO_LARGE');chunks.push(Buffer.from(part.value));}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 return Buffer.concat(chunks,size);
}
function safeId(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);}
function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
export async function verifyStaging(input,{request=fetch,wait=delay,now=Date.now,workflowSha=process.env.GITHUB_SHA,runId=process.env.GITHUB_RUN_ID,receipt={}}={}){
 const target=validateStagingTarget(input),started=now(),deadline=started+180000,sessions=[];
 Object.assign(receipt,{schemaVersion:1,status:'RUNNING',startedAt:new Date(started).toISOString(),origin:target.origin,expectedGitSha:target.expectedSha,companyId:target.companyId,mode:'DEMO',workflowSourceGitSha:SHA.test(workflowSha||'')?workflowSha:null,workflowRunId:/^\d+$/.test(runId||'')?runId:null,checks:[],scope:'Live isolated synthetic Railway staging. No real customer, WhatsApp, AI-provider or physical GPS acceptance.',expectedBrowserCount:26,browserScope:'Separate workflow step:23 actual backend/browser cases plus3 explicit transport fixtures (draft confirmation, session 401 and delayed chat response); actual playground verifies SIMULATED/no-provider behavior and internal draft requests prove PENDING or PROVIDER_DISABLED without business changes.',secretsRetained:false});
 async function read(path,{method='GET',body,session,maxBytes=1048576,timeoutMs=12000}={}){
  const url=new URL(path,target.origin);requireValue(url.origin===target.origin&&url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,'REQUEST_ORIGIN_NOT_ALLOWED');
  const remaining=deadline-now();requireValue(remaining>0,'VERIFICATION_DEADLINE');
  const headers={'Accept':'application/json','Origin':target.origin,...body?{'Content-Type':'application/json'}:{},...session?{'Cookie':session.cookie,...method!=='GET'?{'X-CSRF-Token':session.csrf}: {}}:{}};
  const response=await request(url.href,{method,headers,...body?{body:JSON.stringify(body)}:{},redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(timeoutMs,remaining)))});
  requireValue(response.status>=200&&response.status<300,'HTTP_'+response.status);
  return {response,bytes:await responseBytes(response,maxBytes)};
 }
 async function json(path,options){const result=await read(path,options);requireValue(/application\/json/i.test(result.response.headers.get('content-type')||''),'JSON_CONTENT_TYPE_REQUIRED');let value;try{value=JSON.parse(result.bytes.toString('utf8'));}catch{throw new VerificationError('INVALID_RESPONSE_JSON');}return {...result,value};}
 async function check(name,fn){receipt.activeCheck=name;const evidence=await fn();receipt.checks.push({name,status:'PASSED',...evidence});delete receipt.activeCheck;return evidence;}
 async function assertVersion(){const {value}=await json('/api/v1/version');requireValue(value.gitSha===target.expectedSha&&value.sha===target.expectedSha&&value.mode==='DEMO'&&value.apiVersion===1,'EXACT_RUNTIME_SHA_OR_MODE_MISMATCH');receipt.actualGitSha=value.gitSha;return {actualGitSha:value.gitSha,apiVersion:value.apiVersion,mode:value.mode};}
 async function login(role,expectedUserId){
  const result=await json('/api/v1/auth/demo',{method:'POST',body:{role}});
  requireValue(result.value.mode==='DEMO'&&result.value.actor?.companyId===target.companyId&&result.value.actor?.userId===expectedUserId&&result.value.actor?.roles?.includes(role),'DEMO_IDENTITY_MISMATCH');
  const lines=result.response.headers.getSetCookie();const cookie=lines.find(line=>line.startsWith('knaba_session='));
  requireValue(cookie&&/;\s*HttpOnly\b/i.test(cookie)&&/;\s*Secure\b/i.test(cookie)&&/;\s*SameSite=Strict\b/i.test(cookie),'PRIVATE_SECURE_SESSION_REQUIRED');
  const pair=cookie.split(';',1)[0];requireValue(/^knaba_session=[A-Za-z0-9_-]{30,100}$/.test(pair)&&typeof result.value.csrfToken==='string'&&/^[A-Za-z0-9_-]{20,200}$/.test(result.value.csrfToken),'PRIVATE_SESSION_PROOF_REQUIRED');
  const session={cookie:pair,csrf:result.value.csrfToken};sessions.push(session);
  const {value}=await json('/api/v1/me',{session});requireValue(value.actor?.userId===expectedUserId&&value.actor?.companyId===target.companyId&&value.mode==='DEMO'&&value.version===target.expectedSha,'FRESH_SESSION_RUNTIME_MISMATCH');
  return session;
 }
 try{
  await check('exact-version',assertVersion);
  await check('ready-and-provider-gates',async()=>{const {value}=await json('/api/v1/ready');requireValue(value.ready===true&&value.database==='CONNECTED'&&value.mode==='DEMO','STAGING_NOT_READY');requireValue(['whatsapp','ai','gps'].every(key=>value.integrations?.[key]==='BLOCKED_EXTERNAL'),'EXTERNAL_PROVIDER_GATE_NOT_CLOSED');return {ready:true,database:'CONNECTED',integrations:{whatsapp:'BLOCKED_EXTERNAL',ai:'BLOCKED_EXTERNAL',gps:'BLOCKED_EXTERNAL'}};});
  await check('public-demo-configuration',async()=>{const {value}=await json('/api/v1/public/config');requireValue(value.mode==='DEMO'&&value.demoEnabled===true&&['DE','UK','RU','PL','LT','EN'].every(language=>value.languages?.includes(language)),'PUBLIC_DEMO_CONFIGURATION_MISMATCH');requireValue(['whatsapp','ai','gps'].every(key=>value.integrations?.[key]==='BLOCKED_EXTERNAL'),'EXTERNAL_PROVIDER_GATE_NOT_CLOSED');return {mode:'DEMO',demoEnabled:true,languages:6};});
  await check('public-html-and-assets',async()=>{const {response,bytes}=await read('/',{maxBytes:1048576});requireValue(/text\/html/i.test(response.headers.get('content-type')||'')&&/<html\b/i.test(bytes.toString('utf8')),'APPLICATION_HTML_REQUIRED');const assets=stagingAssets(bytes.toString('utf8'),target.origin),verified=[];for(const asset of assets){const result=await read(asset.path,{maxBytes:8388608});const type=result.response.headers.get('content-type')||'';requireValue(asset.kind==='script'?/javascript/i.test(type):/text\/css/i.test(type),'ASSET_CONTENT_TYPE_MISMATCH');requireValue(result.bytes.length>0,'EMPTY_REQUIRED_ASSET');verified.push({...asset,status:result.response.status,bytes:result.bytes.length,sha256:digest(result.bytes)});}return {htmlSha256:digest(bytes),htmlBytes:bytes.length,assets:verified};});
  const owner=await login('OWNER','demo-owner');
  await check('synthetic-company-and-channel-authority',async()=>{
   const [companies,users,channels]=await Promise.all([json('/api/v1/entities/company',{session:owner}),json('/api/v1/entities/user',{session:owner}),json('/api/v1/entities/channel',{session:owner})]);
   const company=companies.value.items?.find(item=>item.id===target.companyId);requireValue(company?.data.synthetic===true&&company.data.operatingMode==='DEMO','NON_SYNTHETIC_COMPANY');
   const channel=channels.value.items?.find(item=>item.id==='channel-site');requireValue(channel?.data.type==='SITE_INTERNAL'&&channel.data.site_id==='site-a','SYNTHETIC_SITE_CHANNEL_MISSING');
   const members=channel.data.members||[];requireValue(members.some(member=>member.user_id==='demo-owner')&&members.some(member=>member.user_id==='demo-employee'),'SYNTHETIC_CHANNEL_MEMBERS_MISSING');
   requireValue(members.every(member=>users.value.items?.some(user=>user.id===member.user_id&&user.data.synthetic===true&&user.data.active!==false)),'NON_SYNTHETIC_CHANNEL_MEMBER');
   return {companyId:company.id,synthetic:true,channelId:channel.id,siteId:'site-a',recipientId:'demo-employee'};
  });
  const employee=await login('EMPLOYEE','demo-employee');
  await assertVersion();
  await check('actual-worker-outbox-web-delivery',async()=>{
   const nonce=randomUUID(),probeText='SYNTHETIC STAGING WORKER PROBE '+nonce;const {value:message}=await json('/api/v1/commands/message.send',{session:owner,method:'POST',body:{input:{channel_id:'channel-site',text:probeText,language:'EN',source:'HUMAN'},idempotency_key:'staging-worker-probe:'+nonce}});
   requireValue(safeId(message.id)&&message.companyId===target.companyId&&message.data?.channel_id==='channel-site'&&message.data.author_id==='demo-owner'&&message.data.message_version===1&&message.data.text===probeText&&message.data.source==='HUMAN','WORKER_PROBE_MESSAGE_MISMATCH');
   // Delivery rows are recipient-private even for OWNER. This separate employee
   // session observes its own row; no direct delivery.prepare/status calls occur.
   const pollDeadline=Math.min(deadline,now()+60000);let matched,polls=0;
   while(now()<pollDeadline&&polls<40){polls++;const {value}=await json('/api/v1/entities/delivery',{session:employee,timeoutMs:Math.min(10000,Math.max(1,pollDeadline-now()))});const rows=(value.items||[]).filter(item=>item.data?.message_id===message.id&&item.data.message_version===1&&item.data.channel_id==='channel-site'&&item.data.recipient_id==='demo-employee'&&item.data.channel==='WEB');requireValue(rows.length<=1,'DUPLICATE_WORKER_DELIVERY');if(rows[0]?.data.status==='DELIVERED'){matched=rows[0];break;}if(rows[0]?.data.status==='FAILED'||rows[0]?.data.status==='CANCELLED')throw new VerificationError('WORKER_PROBE_DELIVERY_FAILED');await wait(Math.min(1500,Math.max(0,pollDeadline-now())));}
   requireValue(matched&&safeId(matched.id),'WORKER_CONSUMPTION_NOT_OBSERVED');
   return {messageId:message.id,deliveryId:matched.id,channelId:'channel-site',recipientId:'demo-employee',transport:'WEB',deliveryStatus:'DELIVERED',polls,proof:'Observed service-account-only delivery transition after actual message-created outbox fanout. No receipt or delivery was fabricated by this verifier.'};
  });
  await check('final-exact-version',assertVersion);receipt.status='PASSED';
 }catch(error){receipt.status='FAILED';receipt.failureCode=error instanceof VerificationError?error.code:'VERIFY_STAGING_FAILED';throw error;}
 finally{
  const revoked=[];
  for(const session of sessions){try{await json('/api/v1/auth/logout',{session,method:'POST',body:{},timeoutMs:5000});revoked.push(true);}catch{revoked.push(false);}session.cookie='';session.csrf='';}
  receipt.privateSessions={created:sessions.length,revoked:revoked.filter(Boolean).length,logoutStatus:revoked.every(Boolean)?'PASSED':'FAILED'};
  if(!revoked.every(Boolean)){receipt.status='FAILED';receipt.failureCode||='SESSION_REVOCATION_FAILED';}
  receipt.completedAt=new Date(now()).toISOString();receipt.elapsedMs=now()-started;
 }
 requireValue(receipt.status==='PASSED',receipt.failureCode||'VERIFY_STAGING_FAILED');return receipt;
}
async function main(){
 const receipt={schemaVersion:1,status:'NOT_RUN',scope:'Reviewed isolated synthetic Railway staging only.',secretsRetained:false};
 try{const target=await loadStagingTarget(process.argv[2]);await verifyStaging(target,{receipt});}
 catch(error){receipt.status='FAILED';receipt.failureCode||=error instanceof VerificationError?error.code:'VERIFY_STAGING_FAILED';process.exitCode=1;}
 finally{await mkdir('docs/evidence',{recursive:true});await writeFile('docs/evidence/staging-live-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,origin:receipt.origin,expectedGitSha:receipt.expectedGitSha,actualGitSha:receipt.actualGitSha,checksCompleted:receipt.checks?.length||0,failureCode:receipt.failureCode}));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
