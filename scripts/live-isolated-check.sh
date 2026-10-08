#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
knaba_qa_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$knaba_qa_repo"
: "${EXPECTED_GIT_SHA:?The exact committed release SHA is required.}"
: "${KNABA_QA_ADMIN_URL:?The existing local PostgreSQL admin URL is required.}"
export E2E_BASE_URL='http://127.0.0.1:3100'
export GIT_SHA="$EXPECTED_GIT_SHA"
export APP_MODE=TEST
export KNABA_PG_TRANSPORT=container
export KNABA_PG_CONTAINER="${KNABA_PG_CONTAINER:-knaba-postgres}"
unset DEEPSEEK_API_KEY WHATSAPP_ACCESS_TOKEN LIVE_SEND_ALLOWED LIVE_INTEGRATION_SEND_ALLOWED INTEGRATION_CREDENTIALS_JSON S3_BUCKET S3_ENDPOINT_URL S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY
unset BACKUP_PRIVATE_STORAGE_DIR RESTORE_PRIVATE_STORAGE_DIR BACKUP_EXTERNAL_BLOBS_INCLUDED
unset DOCKER_HOST DOCKER_CONTEXT

node --input-type=module <<'JS'
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const sha=process.env.EXPECTED_GIT_SHA,release=JSON.parse(readFileSync('dist/release.json','utf8'));
const childOptions={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000};
if(!/^[a-f0-9]{40}$/.test(sha)||/^0+$/.test(sha)||execFileSync('git',['rev-parse','HEAD'],childOptions).trim()!==sha)throw Error('Exact committed release SHA required.');
if(release.code_sha!==sha||release.source_dirty!==false)throw Error('Final committed source must match the clean immutable bundle.');
if(execFileSync('git',['status','--porcelain','--','apps','packages','infra','scripts','tests','package.json','package-lock.json','tsconfig.json','vitest.config.ts','playwright.config.ts'],childOptions).trim())throw Error('Release source changed after bundling.');
if(execFileSync('docker',['context','show'],childOptions).trim()!=='default')throw Error('The default local Docker context is required; remote contexts are never selected.');
const ports=JSON.parse(execFileSync('docker',['inspect','--format={{json .NetworkSettings.Ports}}',process.env.KNABA_PG_CONTAINER],childOptions));
const bindings=ports['5432/tcp'];
if(!Array.isArray(bindings)||bindings.length===0||bindings.some(binding=>!['127.0.0.1','::1'].includes(binding.HostIp)||binding.HostPort!=='5432'))throw Error('The named synthetic PostgreSQL container must expose only localhost port 5432.');
JS
node --input-type=module <<'JS'
import net from 'node:net';
const server=net.createServer();
await new Promise((resolve,reject)=>{server.once('error',()=>reject(Error('Port 3100 must be unused; existing services are never replaced.')));server.listen(3100,'127.0.0.1',resolve);});
await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
JS

mkdir -p -- "$knaba_qa_repo/.local"
knaba_qa_run=$(mktemp -d "$knaba_qa_repo/.local/qa-run-${EXPECTED_GIT_SHA:0:8}-XXXXXX")
knaba_qa_private_env="$knaba_qa_run/runtime.env"
knaba_qa_evidence="$knaba_qa_repo/docs/evidence"
mkdir -p -- "$knaba_qa_evidence"
: >"$knaba_qa_evidence/live-stages.jsonl"
knaba_qa_server_pid=''
knaba_qa_complete=0
knaba_qa_failures=0
knaba_qa_cleanup(){
 if [[ "$knaba_qa_complete" != 1 && -n "$knaba_qa_server_pid" ]]; then kill "$knaba_qa_server_pid" 2>/dev/null || true; fi
}
trap knaba_qa_cleanup EXIT
timeout 180 node --import tsx scripts/create-live-databases.mts "$knaba_qa_private_env"
# This file is created by the local helper, mode 0600, and contains shell-quoted
# values. Keys never enter a committed evidence file or console output.
source "$knaba_qa_private_env"
cp -- "$knaba_qa_private_env.json" "$knaba_qa_evidence/live-databases.json"
export DATABASE_URL="$QA_DATABASE_URL"

nohup env DATABASE_URL="$DELIVERY_DATABASE_URL" APP_MODE=DEMO COMPANY_ID=knaba-demo PORT=3100 PUBLIC_ORIGIN="$E2E_BASE_URL" AUTH_ENCRYPTION_KEY="$AUTH_ENCRYPTION_KEY" GIT_SHA="$EXPECTED_GIT_SHA" node dist/server.mjs >"$knaba_qa_run/server.log" 2>&1 </dev/null &
knaba_qa_server_pid=$!
printf '%s\n' "$knaba_qa_server_pid" >"$knaba_qa_run/server.pid"
export KNABA_QA_SERVER_PID="$knaba_qa_server_pid"
export KNABA_QA_PRIVATE_RUN_DIR="$knaba_qa_run"
node --input-type=module <<'JS'
const origin=process.env.E2E_BASE_URL;
for(let attempt=0;attempt<30;attempt++){
 if(attempt)await new Promise(resolve=>setTimeout(resolve,1000));
 try{process.kill(Number(process.env.KNABA_QA_SERVER_PID),0);const r=await fetch(origin+'/api/v1/ready',{signal:AbortSignal.timeout(1000)});if(r.ok)process.exit(0);}catch{}
}
throw Error('Fresh release API failed to become ready within the bounded startup window.');
JS

knaba_qa_stage(){
 local knaba_stage_name=$1
 shift
 local knaba_started_at
 knaba_started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
 printf 'Running %s against isolated synthetic data.\n' "$knaba_stage_name"
 if "$@"; then
  KNABA_QA_STAGE="$knaba_stage_name" KNABA_QA_STATUS=PASSED KNABA_QA_STARTED_AT="$knaba_started_at" node --input-type=module <<'JS'
import {appendFileSync} from 'node:fs';
appendFileSync('docs/evidence/live-stages.jsonl',JSON.stringify({stage:process.env.KNABA_QA_STAGE,status:process.env.KNABA_QA_STATUS,gitSha:process.env.EXPECTED_GIT_SHA,startedAt:process.env.KNABA_QA_STARTED_AT,completedAt:new Date().toISOString()})+'\n');
JS
 else
  knaba_qa_failures=$((knaba_qa_failures+1))
  KNABA_QA_STAGE="$knaba_stage_name" KNABA_QA_STATUS=FAILED KNABA_QA_STARTED_AT="$knaba_started_at" node --input-type=module <<'JS'
import {appendFileSync} from 'node:fs';
appendFileSync('docs/evidence/live-stages.jsonl',JSON.stringify({stage:process.env.KNABA_QA_STAGE,status:process.env.KNABA_QA_STATUS,gitSha:process.env.EXPECTED_GIT_SHA,startedAt:process.env.KNABA_QA_STARTED_AT,completedAt:new Date().toISOString()})+'\n');
JS
 fi
}
knaba_qa_stage exact-live-runtime timeout 45 env KNABA_QA_PHASE=runtime bash docs/evidence/run-live-qa.sh
knaba_qa_stage full-unit-and-postgres timeout 300 env KNABA_QA_PHASE=unit bash docs/evidence/run-live-qa.sh
knaba_qa_stage rendered-browser-scenarios timeout 600 env KNABA_QA_PHASE=browser bash docs/evidence/run-live-qa.sh

# The delivery server has no background worker or outbound provider configured.
# Backup therefore includes the seeded private originals, client copies, and
# immutable report artifacts created by browser downloads, without fake refs.
knaba_qa_backup="$knaba_qa_run/delivery.tar.enc"
knaba_qa_stage encrypted-delivery-backup timeout 180 env DATABASE_URL="$DELIVERY_DATABASE_URL" bash infra/backup.sh "$knaba_qa_backup"
if [[ -f "$knaba_qa_backup" && -f "$knaba_qa_backup.hmac" ]]; then
 knaba_qa_tamper_check(){
  KNABA_QA_BACKUP_FILE="$knaba_qa_backup" node --input-type=module <<'JS'
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
const source=process.env.KNABA_QA_BACKUP_FILE,bytes=readFileSync(source);bytes[Math.floor(bytes.length/2)]^=1;
writeFileSync(source+'.tampered',bytes,{mode:0o600,flag:'wx'});copyFileSync(source+'.hmac',source+'.tampered.hmac');
JS
  if timeout 45 bash infra/restore.sh "$knaba_qa_backup.tampered" --confirm-empty >"$knaba_qa_run/tamper-rejection.log" 2>&1; then
   echo 'FAILED: tampered backup was accepted.' >&2; return 1
  fi
  if ! grep -Fq 'BACKUP_AUTHENTICATION_FAILED' "$knaba_qa_run/tamper-rejection.log"; then
   echo 'FAILED: tampered backup did not fail through the expected authentication guard.' >&2; return 1
  fi
  echo 'PASSED: altered ciphertext rejected before database restore.'
 }
 knaba_qa_stage backup-tamper-rejection knaba_qa_tamper_check
 knaba_qa_stage empty-database-private-blob-restore timeout 180 env RESTORE_SYNTHETIC_ISOLATED=true bash infra/restore.sh "$knaba_qa_backup" --confirm-empty
 knaba_qa_worker_check(){
  timeout 100 node --input-type=module <<'JS'
import {spawn} from 'node:child_process';
import {openSync,closeSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {Client} from 'pg';
const db=new Client({connectionString:process.env.RESTORE_DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:10000}),phases=[];
let active;
process.once('SIGTERM',()=>{active?.kill('SIGTERM');process.exit(143);});
async function stop(child){
 if(child.exitCode!==null)return;
 let timer;const closed=new Promise(resolve=>child.once('close',code=>resolve(code)));
 child.kill('SIGTERM');
 const code=await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve('FORCED_STOP');},10000);})]);
 clearTimeout(timer);if(code!==0)throw Error('WORKER_GRACEFUL_STOP_FAILED');
}
try{
 await db.connect();
 for(let phase=1;phase<=2;phase++){
  const marker=randomUUID(),heartbeat=`${process.env.KNABA_QA_PRIVATE_RUN_DIR}/worker-${phase}.heartbeat`,startedAt=Date.now();
  await db.query("INSERT INTO outbox(id,company_id,type,data,available_at) VALUES($1,'knaba-demo','qa.synthetic_bundle_probe',$2,'2000-01-01T00:00:00Z')",[marker,JSON.stringify({synthetic:true,phase})]);
  const fd=openSync(`${process.env.KNABA_QA_PRIVATE_RUN_DIR}/worker-${phase}.log`,'wx',0o600);
  const child=spawn(process.execPath,['dist/worker.mjs'],{env:{...process.env,DATABASE_URL:process.env.RESTORE_DATABASE_URL,APP_MODE:'TEST',COMPANY_ID:'knaba-demo',WORKER_HEARTBEAT_FILE:heartbeat},stdio:['ignore',fd,fd]});closeSync(fd);active=child;
  let launchError;child.once('error',error=>{launchError=error;});let tickAt;
  for(let attempt=0;attempt<100;attempt++){
   if(launchError||child.exitCode!==null)throw Error('BUNDLED_WORKER_START_FAILED');
   if(existsSync(heartbeat)){const value=Number(readFileSync(heartbeat,'utf8'));if(value>=startedAt){tickAt=value;break;}}
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!tickAt)throw Error('BUNDLED_WORKER_HEARTBEAT_TIMEOUT');
  const completed=(await db.query('SELECT status,attempts FROM outbox WHERE id=$1',[marker])).rows[0];
  if(completed?.status!=='SUCCEEDED'||completed.attempts!==1)throw Error('BUNDLED_WORKER_DURABLE_PROBE_FAILED');
  await stop(child);active=undefined;phases.push({phase,pid:child.pid,heartbeatAt:new Date(tickAt).toISOString(),gracefulExitCode:child.exitCode,probeId:marker,status:completed.status,attempts:completed.attempts});
 }
 const previous=(await db.query('SELECT status,attempts FROM outbox WHERE id=$1',[phases[0].probeId])).rows[0];
 if(previous.status!=='SUCCEEDED'||previous.attempts!==1||phases[1].heartbeatAt<=phases[0].heartbeatAt)throw Error('BUNDLED_WORKER_RESTART_REPLAY_FAILED');
 writeFileSync('docs/evidence/bundled-worker-restart.json',JSON.stringify({status:'PASSED',gitSha:process.env.EXPECTED_GIT_SHA,verifiedAt:new Date().toISOString(),workerSha256:createHash('sha256').update(readFileSync('dist/worker.mjs')).digest('hex'),database:'ISOLATED_RESTORED_SYNTHETIC_COPY',phases,temporaryWorkersStopped:true,scope:'Actual bundled processes complete a durable synthetic no-op once, write successful-tick heartbeat, stop gracefully, restart, and leave completed work unreplayed. Real financial side-effect fencing is covered separately by the PostgreSQL suite.'},null,2)+'\n');
 console.log('PASSED: actual bundled worker heartbeat, durable probe, graceful stop and restart on restored synthetic database.');
}finally{if(active)await stop(active).catch(()=>{});await db.end().catch(()=>{});}
JS
 }
 if node --input-type=module <<'JS'
import {readFileSync} from 'node:fs';
const last=JSON.parse(readFileSync('docs/evidence/live-stages.jsonl','utf8').trim().split('\n').at(-1));
process.exit(last.stage==='empty-database-private-blob-restore'&&last.status==='PASSED'?0:1);
JS
 then
  knaba_qa_stage bundled-worker-heartbeat-and-restart knaba_qa_worker_check
 else
  node --input-type=module <<'JS'
import {appendFileSync} from 'node:fs';
appendFileSync('docs/evidence/live-stages.jsonl',JSON.stringify({stage:'bundled-worker-heartbeat-and-restart',status:'NOT_RUN',restoredTargetStatus:'QUARANTINED',reason:'RESTORE_DID_NOT_PASS_SAFETY_GATES',gitSha:process.env.EXPECTED_GIT_SHA,completedAt:new Date().toISOString()})+'\n');
JS
 fi
fi

export KNABA_QA_BACKUP_FILE="$knaba_qa_backup"
export KNABA_QA_FAILURE_COUNT="$knaba_qa_failures"
export KNABA_QA_PRIVATE_RUN_DIR="$knaba_qa_run"
node --input-type=module <<'JS'
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const stages=readFileSync('docs/evidence/live-stages.jsonl','utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.gitSha===process.env.EXPECTED_GIT_SHA);
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const backup=process.env.KNABA_QA_BACKUP_FILE;
const response=await fetch(process.env.E2E_BASE_URL+'/api/v1/version',{signal:AbortSignal.timeout(5000)});
const runtime=await response.json();
if(!response.ok||runtime.gitSha!==process.env.EXPECTED_GIT_SHA)throw Error('Final live runtime SHA check failed.');
const evidence={verifiedAt:new Date().toISOString(),status:Number(process.env.KNABA_QA_FAILURE_COUNT)===0?'PASSED':'FAILED',gitSha:process.env.EXPECTED_GIT_SHA,localUrl:process.env.E2E_BASE_URL,exposure:'LOCAL_VERIFICATION_ONLY',runtime,stages,serverPid:Number(process.env.KNABA_QA_SERVER_PID),bundle:{serverSha256:hash('dist/server.mjs'),workerSha256:hash('dist/worker.mjs'),manifest:JSON.parse(readFileSync('dist/release.json','utf8'))},backup:existsSync(backup)?{sha256:hash(backup),authenticatedSidecarSha256:existsSync(backup+'.hmac')?hash(backup+'.hmac'):null,storage:'PRIVATE_LOCAL_RUN_DIRECTORY'}:null,notes:['Synthetic isolated DEMO; no live WhatsApp, AI, GPS, legal approval, native hardware or public cloud deployment implied.','PostgreSQL worker lease, recovery and reboot scenarios are included in the full integration suite.','Local API remains running after this verification; private keys and encrypted backup are gitignored.']};
writeFileSync('docs/evidence/live-isolated-verification.json',JSON.stringify(evidence,null,2)+'\n');
writeFileSync(process.env.KNABA_QA_PRIVATE_RUN_DIR+'/delivery.json',JSON.stringify({localUrl:process.env.E2E_BASE_URL,serverPid:Number(process.env.KNABA_QA_SERVER_PID),gitSha:process.env.EXPECTED_GIT_SHA},null,2)+'\n',{mode:0o600});
console.log(`${evidence.status}: final local release ${evidence.gitSha} at ${evidence.localUrl}; see docs/evidence/live-isolated-verification.json.`);
JS
knaba_qa_complete=1
[[ "$knaba_qa_failures" == 0 ]]
