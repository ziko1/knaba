import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, quotedIdentifier } from './pg-tools.mjs';
const backup=process.argv[2];if(!backup||!process.env.BACKUP_PASSPHRASE)throw new Error('DRILL_BACKUP_AND_PRIVATE_KEY_REQUIRED');
async function execute(command,args,env=process.env,capture=false){return await new Promise((resolve,reject)=>{let output='';const child=spawn(command,args,{cwd:repository,env,stdio:['ignore',capture?'pipe':'inherit',capture?'pipe':'inherit']});if(capture)child.stdout.on('data',data=>output+=data);if(capture)child.stderr.on('data',()=>{});child.on('error',()=>reject(new Error('DRILL_COMMAND_UNAVAILABLE')));child.on('close',code=>code===0?resolve(output.trim()):reject(new Error('DRILL_COMMAND_FAILED')));});}
const suffix=`${Date.now()}_${randomBytes(4).toString('hex')}`,databaseName=`knaba_restore_${suffix}`,containerName=`knaba-restore-${suffix.replaceAll('_','-')}`,filesDirectory=await mkdtemp(join(tmpdir(),'knaba-restore-files-'));
let admin,containerCreated=false,databaseCreated=false;
try {
  let restoredUrl,drillEnvironment;
  if(process.env.DRILL_ADMIN_DATABASE_URL){admin=new Client({connectionString:process.env.DRILL_ADMIN_DATABASE_URL});await admin.connect();await admin.query(`CREATE DATABASE ${quotedIdentifier(databaseName)}`);databaseCreated=true;const url=new URL(process.env.DRILL_ADMIN_DATABASE_URL);url.pathname=`/${databaseName}`;restoredUrl=url.toString();drillEnvironment={...process.env,RESTORE_DATABASE_URL:restoredUrl,RESTORE_PRIVATE_STORAGE_DIR:filesDirectory};}
  else {const password=randomBytes(32).toString('hex'),containerEnv={...process.env,POSTGRES_PASSWORD:password};await execute('docker',['run','--detach','--rm','--name',containerName,'--publish','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data:rw,size=512m','--env','POSTGRES_PASSWORD','--env','POSTGRES_USER=knaba_restore','--env','POSTGRES_DB=restore_test','postgres:17.6-bookworm'],containerEnv,true);containerCreated=true;const published=await execute('docker',['port',containerName,'5432/tcp'],process.env,true),port=published.split(':').at(-1);restoredUrl=`postgresql://knaba_restore:${password}@127.0.0.1:${port}/restore_test`;
    let ready=false;for(let attempt=0;attempt<40;attempt++){const probe=new Client({connectionString:restoredUrl,connectionTimeoutMillis:500});try{await probe.connect();ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}finally{await probe.end().catch(()=>{});}}if(!ready)throw new Error('DRILL_DATABASE_STARTUP_FAILED');
    drillEnvironment={...process.env,RESTORE_DATABASE_URL:restoredUrl,RESTORE_PRIVATE_STORAGE_DIR:filesDirectory,KNABA_PG_TRANSPORT:'container',KNABA_PG_CONTAINER:containerName};
  }
  // Explicitly synthetic drills may omit the independent current ledger only
  // when restore-db verifies a loopback target and no privacy history exists.
  // Production drills inherit the operator's independent current-ledger inputs.
  if(process.env.RESTORE_SYNTHETIC_ISOLATED==='true')drillEnvironment.APP_MODE='TEST';
  await execute('bash',['infra/restore.sh',backup,'--confirm-empty'],drillEnvironment);
  const proof=new Client({connectionString:restoredUrl,connectionTimeoutMillis:10000});
  try{await proof.connect();const permit=(await proof.query('SELECT count(*)::text AS count FROM public.privacy_revision_permits')).rows[0]?.count;if(permit!=='0')throw new Error('DRILL_TRANSIENT_PRIVACY_PERMITS_NOT_EMPTY');for(const table of ['privacy_erasure_manifests','privacy_blob_deletions'])await proof.query(`SELECT count(*)::text AS count FROM public.${quotedIdentifier(table)}`);}finally{await proof.end().catch(()=>{});}
  console.log('PASSED: full encrypted restore drill on an isolated empty database with exact counts, media references, file checksums and durable privacy ledgers; no external deletion jobs dispatched.');
} catch(error){console.error(`FAILED: ${/^[A-Z0-9_]+$/.test(error.message)?error.message:'RESTORE_DRILL_FAILED'}`);process.exitCode=1;}
finally {if(databaseCreated&&admin)await admin.query(`DROP DATABASE ${quotedIdentifier(databaseName)} WITH (FORCE)`).catch(()=>{console.error('FAILED: isolated drill database cleanup requires inspection.');process.exitCode=1;});await admin?.end().catch(()=>{});if(containerCreated)await execute('docker',['rm','--force',containerName],process.env,true).catch(()=>{console.error('FAILED: isolated drill container cleanup requires inspection.');process.exitCode=1;});await rm(filesDirectory,{recursive:true,force:true});}
