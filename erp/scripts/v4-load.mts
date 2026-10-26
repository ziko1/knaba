import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {evaluateCoreLoad,loadConfiguration,percentile,summarizeHttp,type HttpSample} from './v4-load-metrics.ts';
import type {Database} from '../apps/api/database.ts';

// Opt-in measured synthetic traffic; importing the batch helper does not run the CLI workload.
const repoRoot=fileURLToPath(new URL('../',import.meta.url)),git=promisify(execFile),args=process.argv.slice(2),hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const requiredSources=['scripts/v4-load.mts','scripts/v4-load-metrics.ts','apps/api/auth.ts','apps/api/engine.ts','apps/api/database.ts','packages/domain/operations.ts','infra/001_init.sql'];
const unmeasured={webhook:{status:'NOT_RUN',target:'Durable acknowledgement p95 <=2000ms',reason:'No inbound webhook workload measured by this core runner.'},providerQueue:{status:'NOT_RUN',target:'Enqueue to provider request p95 <=5000ms',reason:'No real or synthetic provider transport invoked; end delivery is a separate observation.'},pdf:{status:'NOT_RUN',target:'50 tasks /20 optimized photos,3 parallel jobs <=60000ms with core API observed',reason:'No such published report fixture or3-job PDF workload executed by this runner.'},nativeTransport:{status:'NOT_RUN',reason:'This harness measures100 real web cookie sessions; physical native/GPS behavior requires its own proof.'}};
const template=()=>({schemaVersion:1,status:'NOT_RUN',sourceSha:null,profile:'full',targets:{employees:100,activeSites:20,concurrentAuthenticatedSessions:100,commandsPerSecond:10,durationSeconds:900,timeSegments:100000,coreP95Ms:1000,coreP99Ms:3000,acknowledgedLoss:0,fiveXxRatioStrictlyBelow:.01},core:{status:'NOT_RUN',measurements:null},...unmeasured});
let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
function check(condition:unknown,code:string):asserts condition {if(!condition)throw Error(code);}
async function sleepUntil(at:number){while(!stopped&&performance.now()<at)await delay(Math.min(1000,Math.max(1,at-performance.now())));}
function outputLocation(path:string){const target=resolve(repoRoot,path);check(target.startsWith(resolve(repoRoot,'.local')+'/'),'LOAD_OUTPUT_REQUIRES_LOCAL_DIRECTORY');return target;}
async function save(path:string,result:unknown){const target=outputLocation(path);await mkdir(dirname(target),{recursive:true,mode:0o700});const temporary=target+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,target);}
async function sourceIdentity(expected:string){
 const head=(await git('git',['rev-parse','HEAD'],{cwd:repoRoot,timeout:10000,maxBuffer:1024})).stdout.trim();
 check(head===expected,'RUNNER_SOURCE_SHA_MISMATCH');
 const state=(await git('git',['status','--porcelain','--untracked-files=normal'],{cwd:repoRoot,timeout:10000,maxBuffer:32768})).stdout;
 check(!state.trim(),'LOAD_REQUIRES_CLEAN_PINNED_CHECKOUT');
 return Object.fromEntries(await Promise.all(requiredSources.map(async file=>[file,hash(await readFile(resolve(repoRoot,file)))])));
}
type Configuration=ReturnType<typeof loadConfiguration>;
type Session={userId:string;taskId:string;siteId:string;token:string;csrfToken:string};
type Attempt={sequence:number;userId:string;taskId:string;siteId:string;key:string;inputHash:string;input:{taskId:string;quantityMilli:number;description:string;photoIds:string[]};id?:string};
type FixtureRow={kind:string;id:string;data:Record<string,unknown>};
export async function insertFixtureBatch(db:Database,companyId:string,runId:string,rows:FixtureRow[]) {
 check(rows.length>0&&rows.length<=1000&&rows.every(row=>row.data.synthetic===true&&row.data.loadRunId===runId),'INVALID_SYNTHETIC_FIXTURE_BATCH');
 await db.transaction(companyId,'V4_LOAD_FIXTURE',async tx=>{
  const company=await tx.get('company',companyId);check(company.data.synthetic===true&&['TEST','DEMO'].includes(company.data.operatingMode),'SYNTHETIC_TENANT_REQUIRED');
  const result=await tx.query(`WITH inserted AS (
   INSERT INTO aggregates(company_id,kind,id,data)
   SELECT $1,x.kind,x.id,x.data FROM jsonb_to_recordset($2::jsonb) AS x(kind text,id text,data jsonb) RETURNING *
  ), revisions AS (
   INSERT INTO aggregate_revisions(company_id,kind,id,version,data,actor_id)
   SELECT company_id,kind,id,version,data,$3 FROM inserted RETURNING id
  ), audits AS (
   INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail)
   SELECT company_id,$3,'SYNTHETIC_LOAD_FIXTURE',kind,id,jsonb_build_object('version',version,'loadRunId',$4::text) FROM inserted RETURNING id
  ) SELECT (SELECT count(*)::int FROM inserted) AS aggregates,(SELECT count(*)::int FROM revisions) AS revisions,(SELECT count(*)::int FROM audits) AS audits`,[companyId,JSON.stringify(rows),'V4_LOAD_FIXTURE',runId]);
  check(Object.values(result.rows[0]).every(value=>value===rows.length),'FIXTURE_ATOMIC_EFFECT_COUNT_MISMATCH');
 },15000);
}
/** Direct fixture inserts include real revision/audit rows; they are not product-command acceptance. */
export async function seedLoadFixture(db:Database,config:Configuration,runId:string,sourceHashes:Record<string,string>) {
 await db.transaction(config.companyId,'V4_LOAD_FIXTURE',async tx=>{
  check((await tx.query('SELECT count(*)::int AS total FROM aggregates WHERE company_id=$1',[config.companyId])).rows[0].total===0,'DEDICATED_LOAD_TENANT_NOT_EMPTY');
  await tx.add('company',{name:'KNABA V4 synthetic isolated load fixture',synthetic:true,operatingMode:config.mode,loadRunId:runId,timezone:'Europe/Berlin',currency:'EUR'},config.companyId);
  await tx.add('load_fixture',{synthetic:true,loadRunId:runId,status:'SEEDING',sourceSha:config.expectedSha,sourceHashes,targets:{employees:100,sites:20,timeSegments:100000}},runId);
 },15000);
 const users=Array.from({length:100},(_,i)=>({userId:`${runId}-user-${i}`,taskId:`${runId}-task-${i}`,siteId:`${runId}-site-${i%20}`})),base:FixtureRow[]=[],decorate=(data:Record<string,unknown>)=>({...data,synthetic:true,loadRunId:runId});
 for(let i=0;i<20;i++)base.push({kind:'site',id:`${runId}-site-${i}`,data:decorate({name:`Synthetic load site ${i}`,code:`LOAD-${i}`,active:true,timezone:'Europe/Berlin'})});
 for(const user of users){base.push({kind:'user',id:user.userId,data:decorate({name:'Synthetic load employee',roles:['EMPLOYEE'],permissions:[],siteIds:[user.siteId],warehouseIds:[],customerIds:[],active:true,language:'EN'})},{kind:'employee',id:`employee-${user.userId}`,data:decorate({userId:user.userId,active:true,skills:[],absences:[]})},{kind:'task',id:user.taskId,data:decorate({siteId:user.siteId,title:'Synthetic load worklog task',state:'IN_PROGRESS',unit:'UNIT',plannedQuantityMilli:1000000,assigneeIds:[user.userId],dependencyIds:[],checklist:[],requiredPhotoCount:0,completionKind:'ORIGINAL',billingScope:'INTERNAL',clientVisible:false,reportedQuantityMilli:0,acceptedQuantityMilli:0,reviewCycle:0,locationSnapshot:[],startedAt:'2026-09-01T08:00:00.000Z'})});}
 await insertFixtureBatch(db,config.companyId,runId,base);
 const epoch=Date.UTC(2026,8,1,8),deadline=performance.now()+300000;
 let batch:FixtureRow[]=[];const flush=async()=>{check(!stopped&&performance.now()<deadline,'FIXTURE_SEED_ABORTED_OR_DEADLINE');if(batch.length){const pending=batch;batch=[];await insertFixtureBatch(db,config.companyId,runId,pending);}};
 for(let userIndex=0;userIndex<100;userIndex++)for(let day=0;day<20;day++){
  const user=users[userIndex]!,shiftId=`${runId}-history-${userIndex}-${day}`,start=epoch+day*86400000;
  batch.push({kind:'shift',id:shiftId,data:decorate({employeeId:user.userId,siteId:user.siteId,state:'ENDED',startedAt:new Date(start).toISOString(),endedAt:new Date(start+50*60000).toISOString(),activity:'WORKING',source:'SYNTHETIC_LOAD_FIXTURE'})});if(batch.length===1000)await flush();
  for(let minute=0;minute<50;minute++){batch.push({kind:'time_segment',id:`${runId}-segment-${userIndex}-${day}-${minute}`,data:decorate({employeeId:user.userId,shiftId,siteId:user.siteId,taskId:user.taskId,startAt:new Date(start+minute*60000).toISOString(),endAt:new Date(start+(minute+1)*60000).toISOString(),activity:minute%2?'SERVICE_TASK':'WORKING',source:'SYNTHETIC_LOAD_FIXTURE'})});if(batch.length===1000)await flush();}
 }
 await flush();
 const counts=(await db.transaction(config.companyId,'V4_LOAD_VERIFY_FIXTURE',tx=>tx.query("SELECT kind,count(*)::int AS count FROM aggregates WHERE company_id=$1 AND data->>'loadRunId'=$2 GROUP BY kind",[config.companyId,runId]),15000,true)).rows;
 const byKind=Object.fromEntries(counts.map(row=>[row.kind,row.count]));check(byKind.user===100&&byKind.employee===100&&byKind.site===20&&byKind.task===100&&byKind.time_segment===100000&&byKind.shift===2000,'FIXTURE_TARGET_COUNT_MISMATCH');
 await db.transaction(config.companyId,'V4_LOAD_FIXTURE',async tx=>{const row=await tx.get('load_fixture',runId);await tx.save(row,{...row.data,status:'SEEDED',counts:byKind});},15000);return {users,counts:byKind};
}
async function execute(config:Configuration,output:string) {
 const runId='load-'+randomUUID(),report:any={...template(),runId,profile:config.profile,status:'SETUP_IN_PROGRESS',baseOrigin:config.baseOrigin,sourceSha:config.expectedSha,startedAt:new Date().toISOString()},samples:HttpSample[]=[],acks:Attempt[]=[],attempts:Attempt[]=[],activeSessions=new Set<string>();
 let hashes:Record<string,string>={};
 let inFlight=0,maxInFlight=0,db:Database|undefined,sessions:Session[]=[],phase='PREFLIGHT',offered=0,dropped=0,invalidAcks=0;const offeredLag:number[]=[];
 async function request(path:string,session?:Session,body?:unknown):Promise<{status:number|null;value:any;durationMs:number}> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.requestTimeoutMs),started=performance.now();inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
  try{
   const response=await fetch(config.baseOrigin+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:controller.signal,headers:{Origin:config.baseOrigin,...(session?{Cookie:`knaba_session=${session.token}`,'X-CSRF-Token':session.csrfToken}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const reader=response.body?.getReader();check(reader,'MISSING_RESPONSE_BODY');let bytes=0;const chunks:Uint8Array[]=[];for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>512*1024){controller.abort();throw Error('RESPONSE_TOO_LARGE');}chunks.push(item.value);}
   let value:unknown;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{value=null;}return {status:response.status,value,durationMs:performance.now()-started};
  }catch{return {status:null,value:null,durationMs:performance.now()-started};}finally{clearTimeout(timer);inFlight--;}
 }
 try{
  hashes=await sourceIdentity(config.expectedSha);report.sourceHashes=hashes;
  const runtime=await request('/api/v1/version');check(runtime.status===200&&runtime.value?.sha===config.expectedSha&&runtime.value?.mode===config.mode,'API_VERSION_OR_MODE_MISMATCH');report.initialVersion={sha:runtime.value.sha,mode:runtime.value.mode};
  phase='FIXTURE';const {Database:Db}=await import('../apps/api/database.ts'),{Engine,commandHash}=await import('../apps/api/engine.ts'),{AuthService}=await import('../apps/api/auth.ts');db=new Db();db.pool.options.query_timeout=20000;
  const fixture=await seedLoadFixture(db,config,runId,hashes);report.fixture=fixture.counts;
  const engine=new Engine(db,config.mode),auth=new AuthService(db,engine,{companyId:config.companyId,appMode:config.mode,publicOrigin:config.baseOrigin});
  for(const user of fixture.users){check(!stopped,'LOAD_ABORTED');const session=await auth.createSession(user.userId);sessions.push({...user,token:session.token,csrfToken:session.csrfToken});}
  phase='SESSION_AUTHORITY';const identities=await Promise.all(sessions.map(session=>request('/api/v1/me',session)));check(identities.every((result,i)=>result.status===200&&result.value?.actor?.companyId===config.companyId&&result.value?.actor?.userId===sessions[i]!.userId&&result.value?.mode===config.mode),'API_AND_DATABASE_SESSION_BINDING_FAILED');
  const sessionCount=(await db.query('SELECT count(*)::int AS count FROM auth_sessions WHERE company_id=$1 AND user_id=ANY($2::text[]) AND revoked_at IS NULL AND expires_at>clock_timestamp()',[config.companyId,sessions.map(s=>s.userId)])).rows[0].count;check(sessionCount===100,'REAL_SESSION_COUNT_MISMATCH');report.authenticatedSessions=100;
  phase='LOAD';maxInFlight=0;const start=performance.now()+100,until=start+config.durationMs,planned=config.durationMs/1000*config.commandsPerSecond;let commandPending=0;const pending=new Set<Promise<void>>();
  const readers=sessions.map(async session=>{for(let tick=0;!stopped&&start+tick*config.readIntervalMs<until;tick++){await sleepUntil(start+tick*config.readIntervalMs);if(stopped||performance.now()>=until)break;const result=await request(tick%2?'/api/v1/me':'/api/v1/entities/time_segment?limit=50',session);samples.push({kind:'READ',durationMs:result.durationMs,status:result.status});if(result.status===200)activeSessions.add(session.userId);}});
  for(let sequence=0;!stopped&&sequence<planned;sequence++){
   const scheduled=start+sequence*1000/config.commandsPerSecond;await sleepUntil(scheduled);if(stopped)break;
   if(performance.now()>=until||commandPending>=100){dropped++;continue;}
   const session=sessions[sequence%100]!,input={taskId:session.taskId,quantityMilli:1,description:`SYNTHETIC V4 LOAD ${runId} ${sequence}`,photoIds:[]},attempt:Attempt={sequence,userId:session.userId,taskId:session.taskId,siteId:session.siteId,key:`${runId}-command-${sequence}`,inputHash:commandHash('task.worklog',input),input};attempts.push(attempt);offered++;offeredLag.push(performance.now()-scheduled);commandPending++;
   const job=(async()=>{const result=await request('/api/v1/commands/task.worklog',session,{input,idempotency_key:attempt.key});samples.push({kind:'COMMAND',durationMs:result.durationMs,status:result.status});if(result.status!==null&&result.status>=200&&result.status<300){if(result.value?.kind==='worklog'&&typeof result.value?.id==='string'&&result.value?.data?.taskId===attempt.taskId&&result.value?.data?.authorId===attempt.userId&&result.value?.data?.description===input.description){attempt.id=result.value.id;acks.push(attempt);}else invalidAcks++;}commandPending--;})().finally(()=>{pending.delete(job);});pending.add(job);
  }
  await sleepUntil(until);await Promise.all([...readers,...pending]);const elapsedMs=performance.now()-start;
  phase='DB_ACK_VERIFICATION';const missing:number[]=[];
  for(let offset=0;offset<acks.length;offset+=100){
   const expected=acks.slice(offset,offset+100).map(a=>({sequence:a.sequence,user_id:a.userId,task_id:a.taskId,site_id:a.siteId,key:a.key,input_hash:a.inputHash,result_id:a.id,description:a.input.description}));
   const verified=(await db.transaction(config.companyId,'V4_LOAD_VERIFY_ACK',tx=>tx.query(`WITH expected AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(sequence integer,user_id text,task_id text,site_id text,key text,input_hash text,result_id text,description text))
    SELECT x.sequence,COALESCE(r.command='task.worklog' AND r.input_hash=x.input_hash AND r.result->>'id'=x.result_id AND r.result->>'kind'='worklog'
     AND w.data->>'taskId'=x.task_id AND w.data->>'siteId'=x.site_id AND w.data->>'authorId'=x.user_id AND w.data->>'description'=x.description AND w.data->>'quantityMilli'='1'
     AND v.actor_id=x.user_id AND v.data=w.data AND a.id IS NOT NULL AND e.id IS NOT NULL,false) AS verified
    FROM expected x LEFT JOIN command_receipts r ON r.company_id=$1 AND r.actor_id=x.user_id AND r.idempotency_key=x.key
    LEFT JOIN aggregates w ON w.company_id=$1 AND w.kind='worklog' AND w.id=x.result_id
    LEFT JOIN aggregate_revisions v ON v.company_id=$1 AND v.kind='worklog' AND v.id=x.result_id AND v.version=1
    LEFT JOIN audit_log a ON a.company_id=$1 AND a.actor_id=x.user_id AND a.action='COMMAND:task.worklog' AND a.detail->>'inputHash'=x.input_hash
    LEFT JOIN outbox e ON e.company_id=$1 AND e.type='worklog.created' AND e.data->>'worklogId'=x.result_id AND e.data->>'taskId'=x.task_id`,[config.companyId,JSON.stringify(expected)]),20000,true)).rows;
   for(const item of expected){const rows=verified.filter(row=>row.sequence===item.sequence);if(rows.length!==1||rows[0].verified!==true)missing.push(item.sequence);}
  }
  phase='EXACT_REPLAY';const replaySamples:HttpSample[]=[],replayCandidates=[...acks.slice(0,10),...acks.slice(-10)].filter((a,i,all)=>all.findIndex(b=>b.sequence===a.sequence)===i);let replayFailures=0;
  const before=(await db.query("SELECT count(*)::int AS count FROM aggregates WHERE company_id=$1 AND kind='worklog' AND data->>'description' LIKE $2",[config.companyId,`SYNTHETIC V4 LOAD ${runId} %`])).rows[0].count;
  for(const ack of replayCandidates){const session=sessions.find(s=>s.userId===ack.userId)!;const result=await request('/api/v1/commands/task.worklog',session,{input:ack.input,idempotency_key:ack.key});replaySamples.push({kind:'COMMAND',durationMs:result.durationMs,status:result.status});if(result.status===null||result.status<200||result.status>=300||result.value?.id!==ack.id)replayFailures++;}
  const after=(await db.query("SELECT count(*)::int AS count FROM aggregates WHERE company_id=$1 AND kind='worklog' AND data->>'description' LIKE $2",[config.companyId,`SYNTHETIC V4 LOAD ${runId} %`])).rows[0].count;check(after===before,'REPLAY_ADDED_WORKLOG_EFFECTS');
  phase='FINAL_VERSION';const final=await request('/api/v1/version'),sourceStayedPinned=final.status===200&&final.value?.sha===config.expectedSha&&final.value?.mode===config.mode;
  report.core=evaluateCoreLoad({profile:config.profile,elapsedMs,employees:100,sites:20,sessions:sessionCount,activeSessions:activeSessions.size,timeSegments:fixture.counts.time_segment,plannedCommands:planned,offeredCommands:offered,acknowledgedCommands:acks.length,verifiedCommands:acks.length-missing.length,invalidAcknowledgements:invalidAcks,droppedOffers:dropped,aborted:stopped,sourceStayedPinned,samples});
  report.workload={routes:['GET /api/v1/me','GET /api/v1/entities/time_segment?limit=50','POST /api/v1/commands/task.worklog'],durationMs:config.durationMs,actualElapsedIncludingDrainMs:elapsedMs,offeredCommands:offered,droppedOffers:dropped,acknowledgedCommands:acks.length,acknowledgedPerOfferedSecond:acks.length/(config.durationMs/1000),acknowledgedPerSecondIncludingDrain:acks.length/(elapsedMs/1000),activeSessions:activeSessions.size,maxConcurrentHttpRequestsDuringLoad:maxInFlight,schedulingLagP95Ms:percentile(offeredLag,.95),schedulingLagP99Ms:percentile(offeredLag,.99),uniqueAcknowledgedIds:new Set(acks.map(a=>a.id)).size,acknowledgedIdsSha256:hash(acks.map(a=>a.id!).sort().join('\n')),missingAcknowledgementSequences:missing.slice(0,20),unacknowledgedRequests:offered-acks.length,unacknowledgedOutcome:'No blind retry; durable outcomes of unacknowledged requests are not claimed reconciled to quiescence.'};
  report.exactReplay={status:replayCandidates.length&&replayFailures===0?'PASSED':'FAILED',sampleCount:replayCandidates.length,failures:replayFailures,worklogCountBefore:before,worklogCountAfter:after,latencyP95Ms:percentile(replaySamples.map(s=>s.durationMs),.95)};
  report.status=report.core.status==='PASSED'&&report.exactReplay.status==='PASSED'?'PARTIAL_MEASURED_CORE_ONLY':report.core.status==='PARTIAL_SMOKE_MEASURED'?'PARTIAL_SMOKE_MEASURED':'FAILED';report.wholeAc67='NOT_RUN_FULL_CRITERION';report.finalVersion={sha:final.value?.sha===config.expectedSha?config.expectedSha:null,mode:final.value?.mode===config.mode?config.mode:null};
 }catch{report.status=stopped?'ABORTED':'FAILED';report.failure={phase,code:'LOAD_SETUP_OR_MEASUREMENT_FAILED'};if(samples.length)report.partialMeasurement={status:'FAILED_INCOMPLETE',http:summarizeHttp(samples),offeredCommands:offered,acknowledgedCommands:acks.length,acknowledgedDatabaseVerification:'NOT_COMPLETED'};report.core=report.core?.status==='NOT_RUN'?{status:'NOT_RUN',reason:'Setup or measurement did not complete; any actual partial HTTP observations are separately recorded.'}:report.core;}
 finally{
  if(db){try{await db.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE company_id=$1 AND user_id=ANY($2::text[]) AND revoked_at IS NULL',[config.companyId,sessions.map(s=>s.userId)]);report.sessionCleanup='REVOKED';}catch{report.sessionCleanup='FAILED';report.status='FAILED';}await db.close();}
  report.finishedAt=new Date().toISOString();await save(output,report);
 }
 process.stdout.write(JSON.stringify({report:output,status:report.status,core:report.core?.status,sourceSha:config.expectedSha,wholeAc67:report.wholeAc67??'NOT_RUN_FULL_CRITERION'})+'\n');if(report.status==='FAILED'||report.status==='ABORTED')process.exitCode=1;
}
async function main(){
 if(args.includes('--help')){process.stdout.write('V4 synthetic load: npx tsx scripts/v4-load.mts --run --profile full|smoke --output .local/v4-load-result.json\nDefault/--plan writes a NOT_RUN template with no API/DB access. See docs/V4_LOAD_RUNBOOK.md for required private environment, source/runtime guards and separate webhook/provider/PDF measurement.\n');return;}
 check(args.every((arg,i)=>['--run','--plan','--profile','--output'].includes(arg)||['--profile','--output'].includes(args[i-1]??'')),'UNKNOWN_LOAD_ARGUMENT');
 for(const flag of ['--run','--plan','--profile','--output'])check(args.filter(arg=>arg===flag).length<=1,'DUPLICATE_LOAD_ARGUMENT');
 const option=(flag:string,fallback:string)=>{const index=args.indexOf(flag);if(index<0)return fallback;const value=args[index+1];check(value&&!value.startsWith('--'),'MISSING_LOAD_ARGUMENT');return value;},profile=option('--profile','full'),output=option('--output','.local/v4-load-result.json');outputLocation(output);
 check(profile==='full'||profile==='smoke','INVALID_LOAD_PROFILE');check(!(args.includes('--run')&&args.includes('--plan')),'AMBIGUOUS_LOAD_MODE');
 if(!args.includes('--run')){await save(output,template());process.stdout.write(JSON.stringify({report:output,status:'NOT_RUN',networkUsed:false,databaseUsed:false})+'\n');return;}
 let configuration:Configuration;try{configuration=loadConfiguration(process.env,profile);}catch{await save(output,{...template(),status:'REFUSED',failure:{phase:'CONFIGURATION',code:'EXPLICIT_SYNTHETIC_SOURCE_AND_ORIGIN_GATES_REQUIRED'}});throw Error('INVALID_LOAD_CONFIGURATION');}await execute(configuration,output);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('V4 load refused or failed before measurement; check explicit flags, private configuration, pinned source and the runbook. No credentials were printed.\n');process.exitCode=1;});
