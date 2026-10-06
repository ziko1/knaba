import {Client} from 'pg';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {Database} from '../apps/api/database.ts';
import {seed} from '../infra/seed.ts';

// Deliberately additive: existing databases are neither reused nor dropped.
const sha=process.env.EXPECTED_GIT_SHA??'';
const adminUrl=process.env.KNABA_QA_ADMIN_URL;
const output=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(sha)||/^0+$/.test(sha)||!adminUrl||!output)throw new Error('EXACT_SHA_ADMIN_URL_PRIVATE_OUTPUT_REQUIRED');
const parsed=new URL(adminUrl);
if(!['postgres:','postgresql:'].includes(parsed.protocol)||!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw new Error('LOCAL_POSTGRES_ADMIN_REQUIRED');
const suffix=`${sha.slice(0,8)}_${randomBytes(3).toString('hex')}`;
const names={qa:`knaba_qa_${suffix}`,delivery:`knaba_delivery_${suffix}`,restore:`knaba_restore_${suffix}`};
const urls=Object.fromEntries(Object.entries(names).map(([kind,name])=>{const url=new URL(adminUrl);url.pathname=`/${name}`;return [kind,url.toString()];})) as Record<keyof typeof names,string>;
const client=new Client({connectionString:adminUrl,connectionTimeoutMillis:10_000});
const created:string[]=[];
try {
 await client.connect();
 const existing=await client.query('SELECT datname FROM pg_database WHERE datname=ANY($1::text[])',[Object.values(names)]);
 if(existing.rowCount)throw new Error('FRESH_DATABASE_NAMES_REQUIRED');
 for(const name of Object.values(names)){
  if(!/^knaba_(qa|delivery|restore)_[a-f0-9_]+$/.test(name))throw new Error('INVALID_ISOLATED_DATABASE_NAME');
  await client.query(`CREATE DATABASE "${name}" TEMPLATE template0`);created.push(name);
 }
 const env={QA_DATABASE_URL:urls.qa,DELIVERY_DATABASE_URL:urls.delivery,RESTORE_DATABASE_URL:urls.restore,AUTH_ENCRYPTION_KEY:randomBytes(48).toString('base64url'),BACKUP_PASSPHRASE:randomBytes(48).toString('base64url')};
 const shellQuote=(value:string)=>`'${value.replaceAll("'","'\\''")}'`;
 await mkdir(dirname(resolve(output)),{recursive:true,mode:0o700});
 await writeFile(output,Object.entries(env).map(([key,value])=>`export ${key}=${shellQuote(value)}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
 for(const kind of ['qa','delivery'] as const){
  const db=new Database(urls[kind]);
  try{await db.migrate();if(kind==='delivery'){process.env.APP_MODE='DEMO';await seed(db,'knaba-demo');}}finally{await db.close();}
 }
 await writeFile(`${output}.json`,JSON.stringify({status:'PASSED',createdAt:new Date().toISOString(),gitSha:sha,databases:names,syntheticCompany:'knaba-demo',deliverySeed:'CANONICAL_COMMANDS_AND_SYNTHETIC_FIXTURES',existingDatabasesModified:false},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(`PASSED: created and migrated fresh QA and synthetic delivery databases; empty restore database ready (${suffix}).`);
}catch(error){
 await writeFile(`${output}.failure.json`,JSON.stringify({status:'FAILED',gitSha:sha,createdDatabases:created,reason:(error as {code?:string}).code??(error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'LOCAL_DATABASE_SETUP_FAILED'),existingDatabasesModified:false},null,2)+'\n',{mode:0o600}).catch(()=>{});
 throw error;
}finally{await client.end().catch(()=>{});}
