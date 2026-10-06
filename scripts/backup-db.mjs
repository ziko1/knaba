import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { databaseIdentity, fail, pgCommand, tableCounts } from './pg-tools.mjs';
const directory=process.argv[2];if(!directory||!process.env.DATABASE_URL)fail('BACKUP_CONFIGURATION_REQUIRED');
if(process.env.S3_BUCKET&&!process.env.BACKUP_EXTERNAL_BLOBS_INCLUDED)fail('S3_BACKUP_MUST_BE_INCLUDED_AND_VERIFIED');
const client=new Client({connectionString:process.env.DATABASE_URL});
try {
  await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const version=await client.query('SHOW server_version');const snapshot=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  const counts=await tableCounts(client);
  const blobs=[];
  if(counts.some(row=>row.schema==='public'&&row.table==='private_blobs'))blobs.push(...(await client.query("SELECT 'private_blobs' AS store,company_id,key,sha256,octet_length(content) AS byte_size FROM private_blobs ORDER BY company_id,key")).rows);
  if(counts.some(row=>row.schema==='public'&&row.table==='media_blobs'))blobs.push(...(await client.query("SELECT 'media_blobs' AS store,company_id,id AS key,sha256,octet_length(bytes) AS byte_size FROM media_blobs ORDER BY company_id,id")).rows);
  await pgCommand('pg_dump',['--format=custom','--no-owner','--no-acl',`--snapshot=${snapshot}`],process.env.DATABASE_URL,{outputFile:`${directory}/database.dump`});
  const hash=createHash('sha256');for await(const bytes of createReadStream(`${directory}/database.dump`))hash.update(bytes);const dumpSha256=hash.digest('hex');
  const manifest={format:'KNABA_DE_ENCRYPTED_BACKUP_V1',createdAt:new Date().toISOString(),gitSha:process.env.GIT_SHA||'UNKNOWN',postgresVersion:version.rows[0].server_version,sourceIdentityHash:createHash('sha256').update(databaseIdentity(process.env.DATABASE_URL)).digest('hex'),dumpSha256,tableCounts:counts,privateBlobs:blobs,storageMode:process.env.S3_BUCKET?'EXTERNAL_BLOBS_OPERATOR_INCLUDED':'POSTGRES_PRIVATE_BLOB_FALLBACK',filesystemBlobsIncluded:process.env.BACKUP_PRIVATE_STORAGE_DIR?true:false};
  await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});await client.query('COMMIT');
  console.log('PASSED: consistent PostgreSQL snapshot exported, including private blob metadata.');
} catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(`FAILED: ${/^[A-Z0-9_]+$/.test(error.message)?error.message:'DATABASE_BACKUP_FAILED'}`);process.exitCode=1;}
finally {await client.end().catch(()=>{});}
