import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { databaseIdentity, fail, pgCommand, tableCounts } from './pg-tools.mjs';
const directory=process.argv[2];if(!directory||!process.env.RESTORE_DATABASE_URL||process.argv[3]!=='--confirm-empty')fail('EXPLICIT_EMPTY_RESTORE_DESTINATION_REQUIRED');
const manifest=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8'));if(manifest.format!=='KNABA_DE_ENCRYPTED_BACKUP_V1')fail('UNSUPPORTED_BACKUP_FORMAT');
if(createHash('sha256').update(databaseIdentity(process.env.RESTORE_DATABASE_URL)).digest('hex')===manifest.sourceIdentityHash)fail('SOURCE_DATABASE_RESTORE_FORBIDDEN');
const hash=createHash('sha256');for await(const bytes of createReadStream(`${directory}/database.dump`))hash.update(bytes);if(hash.digest('hex')!==manifest.dumpSha256)fail('DATABASE_DUMP_CHECKSUM_MISMATCH');
const client=new Client({connectionString:process.env.RESTORE_DATABASE_URL,connectionTimeoutMillis:10000});
let safetyTransaction=false;
try {
  await client.connect();const existing=await tableCounts(client);if(existing.length)fail('RESTORE_DESTINATION_NOT_EMPTY');
  await pgCommand('pg_restore',['--single-transaction','--exit-on-error','--no-owner','--no-acl'],process.env.RESTORE_DATABASE_URL,{inputFile:`${directory}/database.dump`});
  const restored=await tableCounts(client);if(JSON.stringify(restored)!==JSON.stringify(manifest.tableCounts))fail('RESTORED_TABLE_COUNTS_MISMATCH');
  for(const expected of manifest.privateBlobs){const sql=expected.store==='media_blobs'?'SELECT bytes AS content,sha256 FROM media_blobs WHERE company_id=$1 AND id=$2':'SELECT content,sha256 FROM private_blobs WHERE company_id=$1 AND key=$2';const result=await client.query(sql,[expected.company_id,expected.key]);const blob=result.rows[0];if(!blob||blob.sha256!==expected.sha256||blob.content.length!==expected.byte_size||createHash('sha256').update(blob.content).digest('hex')!==expected.sha256)fail('RESTORED_PRIVATE_BLOB_CHECKSUM_MISMATCH');}
  const hasAggregates=restored.some(row=>row.schema==='public'&&row.table==='aggregates'),hasBlobs=restored.some(row=>row.schema==='public'&&row.table==='private_blobs');
  if(hasAggregates&&hasBlobs&&manifest.storageMode==='POSTGRES_PRIVATE_BLOB_FALLBACK') {const missing=await client.query("SELECT count(*)::text AS count FROM aggregates a CROSS JOIN LATERAL (VALUES (a.data->>'blobKey'),(a.data->>'clientBlobKey')) AS ref(key) LEFT JOIN (SELECT company_id,key FROM private_blobs UNION ALL SELECT company_id,id AS key FROM media_blobs) b ON b.company_id=a.company_id AND b.key=ref.key WHERE a.kind IN ('media_asset','media_upload','report_artifact') AND ref.key IS NOT NULL AND b.key IS NULL");if(missing.rows[0].count!=='0')fail('RESTORED_MEDIA_REFERENCE_MISSING');}
  // Verify the backup's original contents before applying the current safety migration.
  // This only changes the explicitly empty destination, never the source database.
  await client.query('BEGIN');safetyTransaction=true;
  await client.query("SET LOCAL statement_timeout='10000ms'");
  await client.query("SET LOCAL lock_timeout='5000ms'");
  await client.query(await readFile(new URL('../infra/001_init.sql',import.meta.url),'utf8'));
  await client.query('SELECT knaba_assert_gps_storage_safe()');
  const purgeDeadline=Date.now()+60000;
  let gpsPointsPurged=0,drained=false;
  for(let batch=0;batch<1000;batch++){
    const remainingMs=purgeDeadline-Date.now();
    if(remainingMs<=0)fail('RESTORE_GPS_PURGE_TIME_LIMIT');
    await client.query(`SET LOCAL statement_timeout='${Math.min(10000,remainingMs)}ms'`);
    const result=await client.query('SELECT knaba_purge_gps(now(),500,NULL) AS purged');
    const rawCount=result.rows[0]?.purged;
    if(rawCount===null||rawCount===undefined||!/^\d+$/.test(String(rawCount)))fail('RESTORE_GPS_PURGE_RESULT_INVALID');
    const count=Number(rawCount);
    if(!Number.isSafeInteger(count)||count<0||count>500)fail('RESTORE_GPS_PURGE_RESULT_INVALID');
    gpsPointsPurged+=count;
    if(count===0){drained=true;break;}
  }
  if(!drained)fail('RESTORE_GPS_PURGE_BATCH_LIMIT');
  await client.query('COMMIT');safetyTransaction=false;
  console.log(`PASSED: restored ${restored.length} original tables, exact original row counts and ${manifest.privateBlobs.length} private blob checksums/references; current GPS storage safety verified and ${gpsPointsPurged} expired GPS points purged before access.`);
} catch(error){if(safetyTransaction)await client.query('ROLLBACK').catch(()=>{});console.error(`FAILED: ${/^[A-Z0-9_]+$/.test(error.message)?error.message:'DATABASE_RESTORE_FAILED'}`);process.exitCode=1;}
finally {await client.end().catch(()=>{});}
