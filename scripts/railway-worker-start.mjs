import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';

export const INTERNAL_API_ORIGIN='http://api.railway.internal:3000';
export function verifyWorkerRelease(release,expectedSha){
 if(!/^[a-f0-9]{40}$/.test(expectedSha||'')||/^0+$/.test(expectedSha)||release?.code_sha!==expectedSha)throw Error('EXACT_WORKER_SOURCE_REQUIRED');
 // Docker contexts exclude .git. Preserve that uncertainty explicitly instead
 // of claiming a clean worktree; the provider's pinned source is checked separately.
 if(release.source_dirty!==false&&!(release.source_dirty===null&&release.source_provenance==='PINNED_CONTAINER_CONTEXT'))throw Error('WORKER_SOURCE_PROVENANCE_REQUIRED');
 return {codeSha:expectedSha,sourceDirty:release.source_dirty,sourceProvenance:release.source_provenance??'GIT_WORKTREE'};
}
export async function waitForExpectedApi({expectedSha,mode='DEMO',request=fetch,wait=delay,now=Date.now,deadlineMs=300000,stopped=()=>false}={}){
 if(!/^[a-f0-9]{40}$/.test(expectedSha||'')||/^0+$/.test(expectedSha)||!['DEMO','TEST'].includes(mode)||!Number.isInteger(deadlineMs)||deadlineMs<1000||deadlineMs>300000)throw Error('INVALID_STAGING_WORKER_GATE');
 const deadline=now()+deadlineMs;
 for(let attempt=0;attempt<300&&now()<deadline;attempt++){
  if(stopped())throw Error('STAGING_WORKER_START_CANCELLED');
  try{
   const readiness=await request(INTERNAL_API_ORIGIN+'/api/v1/ready',{signal:AbortSignal.timeout(Math.max(1,Math.min(2000,deadline-now()))),redirect:'error'});
   if(readiness.ok&&(await readiness.json()).ready===true){
    const version=await request(INTERNAL_API_ORIGIN+'/api/v1/version',{signal:AbortSignal.timeout(Math.max(1,Math.min(2000,deadline-now()))),redirect:'error'});
    if(version.ok){const value=await version.json();if(value.gitSha===expectedSha&&value.mode===mode&&!stopped())return {ready:true,expectedSha,mode};}
   }
  }catch{}
  if(!stopped()&&now()<deadline)await wait(Math.min(1000,deadline-now()));
 }
 throw Error(stopped()?'STAGING_WORKER_START_CANCELLED':'STAGING_API_SOURCE_NOT_READY');
}

async function main(){
 const release=JSON.parse(await readFile(new URL('../dist/release.json',import.meta.url),'utf8'));
 verifyWorkerRelease(release,process.env.GIT_SHA);
 let stopped=false,child;
 const terminate=signal=>{stopped=true;if(child&&!child.killed)child.kill(signal);};
 process.once('SIGTERM',()=>terminate('SIGTERM'));process.once('SIGINT',()=>terminate('SIGINT'));
 await waitForExpectedApi({expectedSha:process.env.GIT_SHA,mode:process.env.APP_MODE,stopped:()=>stopped});
 if(stopped)return;
 child=spawn(process.execPath,[new URL('../dist/worker.mjs',import.meta.url).pathname],{stdio:'inherit'});
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGTERM'?143:1);resolve();});});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{process.stderr.write(String(error.message).replace(/[^A-Z_]/g,'')+'\n');process.exitCode=1;});
}
