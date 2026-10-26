import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const repository=fileURLToPath(new URL('../',import.meta.url));
export function fail(code){throw new Error(code);}
export function databaseIdentity(connectionString){const url=new URL(connectionString);return `${url.hostname.toLowerCase()}:${url.port||'5432'}${url.pathname}`;}
export function clientEnvironment(connectionString){const url=new URL(connectionString);return {...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),...(url.searchParams.get('sslmode')?{PGSSLMODE:url.searchParams.get('sslmode')}:{}),...(url.searchParams.get('sslrootcert')?{PGSSLROOTCERT:url.searchParams.get('sslrootcert')}:{})};}
async function version(binary){return await new Promise(resolve=>{let output='';const child=spawn(binary,['--version'],{stdio:['ignore','pipe','ignore']});child.stdout.on('data',data=>output+=data);child.on('error',()=>resolve(0));child.on('close',code=>resolve(code===0?Number(output.match(/\b(\d+)\./)?.[1]||0):0));});}
async function dockerMetadata(args,env){return new Promise((resolve,reject)=>{let output='';const child=spawn('docker',args,{cwd:repository,env,stdio:['ignore','pipe','ignore']});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('PG_CONTAINER_IDENTITY_TIMEOUT'));},10000);child.stdout.on('data',data=>output+=data);child.on('error',()=>{clearTimeout(timer);reject(new Error('PG_CONTAINER_IDENTITY_UNAVAILABLE'));});child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(new Error('PG_CONTAINER_IDENTITY_UNAVAILABLE'));});});}
export function assertLocalContainerTarget(connectionString,ports){const url=new URL(connectionString),host=url.hostname.toLowerCase();if(!['127.0.0.1','localhost','[::1]','::1'].includes(host))fail('CONTAINER_TRANSPORT_REQUIRES_VERIFIED_LOCAL_TARGET_USE_NATIVE_FOR_REMOTE');const bindings=ports?.['5432/tcp'];const port=url.port||'5432';const expectedHosts=host==='[::1]'||host==='::1'?['::1']:host==='localhost'?['127.0.0.1','::1']:['127.0.0.1'];if(!Array.isArray(bindings)||!bindings.some(b=>expectedHosts.includes(b.HostIp)&&b.HostPort===port))fail('RESTORE_CONTAINER_TARGET_IDENTITY_MISMATCH');}
export async function transport(){if(process.env.KNABA_PG_TRANSPORT)return process.env.KNABA_PG_TRANSPORT;if(await version('pg_dump')>=17)return 'native';return process.env.KNABA_PG_CONTAINER?'container':'compose';}
export async function pgCommand(binary,args,connectionString,{outputFile,inputFile}={}) {
  const env=clientEnvironment(connectionString),mode=await transport();let command=binary,commandArgs=args;
  if(mode==='native'){if(await version(binary)<17)fail('POSTGRES_17_CLIENT_REQUIRED');}
  else if(mode==='compose'||mode==='container'){
   if(env.DOCKER_HOST||env.DOCKER_CONTEXT&&env.DOCKER_CONTEXT!=='default'||await dockerMetadata(['context','show'],env)!=='default')fail('LOCAL_DEFAULT_DOCKER_CONTEXT_REQUIRED');
   const target=mode==='container'?process.env.KNABA_PG_CONTAINER:await dockerMetadata(['compose','-f',`${repository}infra/compose.yml`,'ps','-q','postgres'],env);
   if(!target||!/^[a-zA-Z0-9_.-]+$/.test(target))fail('MISSING_PG_CONTAINER');
   const inspected=JSON.parse(await dockerMetadata(['inspect','--format={{json .NetworkSettings.Ports}}',target],env));assertLocalContainerTarget(connectionString,inspected);
   // Use the verified local container endpoint, never silently ignore a remote URL.
   command='docker';commandArgs=['exec','-i','-e','PGPASSWORD',target,binary,'--host=127.0.0.1','--port=5432',`--username=${env.PGUSER}`,`--dbname=${env.PGDATABASE}`,...args];
  }
  else fail('INVALID_PG_TRANSPORT');
  const output=outputFile?await open(outputFile,'wx',0o600):undefined,input=inputFile?await open(inputFile,'r'):undefined;
  try {await new Promise((resolve,reject)=>{const child=spawn(command,commandArgs,{cwd:repository,env,stdio:[input?.fd??'ignore',output?.fd??'ignore','pipe']});let errorOutput='';child.stderr.on('data',data=>{errorOutput+=data;});child.on('error',()=>reject(new Error(`${binary.toUpperCase()}_UNAVAILABLE`)));child.on('close',code=>code===0?resolve():reject(new Error(`${binary.toUpperCase()}_FAILED`)));});}
  finally {await output?.close();await input?.close();}
}
export function quotedIdentifier(value){return `"${String(value).replaceAll('"','""')}"`;}
export async function tableCounts(client){const result=await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename");const rows=[];for(const row of result.rows){const count=await client.query(`SELECT count(*)::text AS count FROM ${quotedIdentifier(row.schemaname)}.${quotedIdentifier(row.tablename)}`);rows.push({schema:row.schemaname,table:row.tablename,count:count.rows[0].count});}return rows;}
