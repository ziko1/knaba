import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { relative, isAbsolute, sep } from 'node:path';
import { databaseIdentity, fail, pgCommand, tableCounts } from './pg-tools.mjs';
import { ledgerHash, readPrivacyLedger, privacyLedgerProof, companyIdsInSnapshot, validateErasureManifests, deletionTargets, orderedManifests } from './backup-db.mjs';

async function currentErasureLedger(directory,manifest){
  const file=process.env.RESTORE_CURRENT_ERASURE_LEDGER_FILE,checksum=process.env.RESTORE_CURRENT_ERASURE_LEDGER_SHA256;
  if(!file||!/^[a-f0-9]{64}$/.test(checksum||''))fail('RESTORE_CURRENT_ERASURE_LEDGER_REQUIRED');
  const filePath=await realpath(file),backupPath=await realpath(directory),inside=relative(backupPath,filePath);
  if(!inside||(inside!=='..'&&!inside.startsWith('..'+sep)&&!isAbsolute(inside)))fail('RESTORE_ERASURE_LEDGER_MUST_BE_INDEPENDENT');
  const metadata=await stat(filePath);if(!metadata.isFile()||metadata.size>64*1024*1024)fail('RESTORE_ERASURE_LEDGER_FILE_INVALID');
  const bytes=await readFile(filePath);
  if(createHash('sha256').update(bytes).digest('hex')!==checksum)fail('RESTORE_ERASURE_LEDGER_CHECKSUM_MISMATCH');
  const current=JSON.parse(bytes),exportedAt=Date.parse(current.exportedAt),backupAt=Date.parse(manifest.createdAt);
  if(current.format!=='KNABA_DE_CURRENT_ERASURE_LEDGER_V1'||current.sourceIdentityHash!==manifest.sourceIdentityHash||!Array.isArray(current.companyIds)||!current.companyIds.every(id=>typeof id==='string'&&id.length>0)||new Set(current.companyIds).size!==current.companyIds.length||!Array.isArray(current.manifests)||!Array.isArray(current.blobDeletions))fail('RESTORE_ERASURE_LEDGER_INVALID');
  if(!Number.isFinite(exportedAt)||!Number.isFinite(backupAt)||exportedAt<backupAt||exportedAt>Date.now()+5*60000||Date.now()-exportedAt>3600000)fail('RESTORE_ERASURE_LEDGER_NOT_CURRENT');
  validateErasureManifests(current.manifests);
  if(current.manifests.some(row=>!current.companyIds.includes(row.company_id))||current.blobDeletions.some(row=>!current.companyIds.includes(row.company_id)))fail('RESTORE_ERASURE_LEDGER_COMPANY_COVERAGE_REQUIRED');
  return current;
}
function reconcileCurrentLedger(current,ledger,companyIds){
  if(companyIds.some(id=>!current.companyIds.includes(id)))fail('RESTORE_ERASURE_LEDGER_COMPANY_COVERAGE_REQUIRED');
  const applicable=current.manifests.filter(row=>companyIds.includes(row.company_id));
  if(ledgerHash(orderedManifests(applicable))!==ledgerHash(orderedManifests(ledger.manifests))||ledgerHash(deletionTargets(current.blobDeletions.filter(row=>companyIds.includes(row.company_id))))!==ledgerHash(deletionTargets(ledger.blobDeletions)))fail('RESTORE_ERASURE_RECONCILIATION_REQUIRED');
}
const directory=process.argv[2];if(!directory||!process.env.RESTORE_DATABASE_URL||process.argv[3]!=='--confirm-empty')fail('EXPLICIT_EMPTY_RESTORE_DESTINATION_REQUIRED');
const manifest=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8'));if(manifest.format!=='KNABA_DE_ENCRYPTED_BACKUP_V1')fail('UNSUPPORTED_BACKUP_FORMAT');
if(createHash('sha256').update(databaseIdentity(process.env.RESTORE_DATABASE_URL)).digest('hex')===manifest.sourceIdentityHash)fail('SOURCE_DATABASE_RESTORE_FORBIDDEN');
const hash=createHash('sha256');for await(const bytes of createReadStream(`${directory}/database.dump`))hash.update(bytes);if(hash.digest('hex')!==manifest.dumpSha256)fail('DATABASE_DUMP_CHECKSUM_MISMATCH');
const client=new Client({connectionString:process.env.RESTORE_DATABASE_URL,connectionTimeoutMillis:10000});
let safetyTransaction=false;
try {
  const synthetic=process.env.RESTORE_SYNTHETIC_ISOLATED==='true',host=new URL(process.env.RESTORE_DATABASE_URL).hostname.toLowerCase();
  if(synthetic&&(!['127.0.0.1','localhost','[::1]','::1'].includes(host)||!['TEST','DEMO'].includes(process.env.APP_MODE)))fail('RESTORE_SYNTHETIC_REQUIRES_ISOLATED_LOOPBACK');
  const current=synthetic?undefined:await currentErasureLedger(directory,manifest);
  await client.connect();const existing=await tableCounts(client);if(existing.length)fail('RESTORE_DESTINATION_NOT_EMPTY');
  await pgCommand('pg_restore',['--single-transaction','--exit-on-error','--no-owner','--no-acl'],process.env.RESTORE_DATABASE_URL,{inputFile:`${directory}/database.dump`});
  const restored=await tableCounts(client);if(JSON.stringify(restored)!==JSON.stringify(manifest.tableCounts))fail('RESTORED_TABLE_COUNTS_MISMATCH');
  const privacy=await readPrivacyLedger(client,restored),companyIds=await companyIdsInSnapshot(client,restored);
  if(manifest.privacyLedger&&ledgerHash(privacyLedgerProof(privacy))!==ledgerHash(manifest.privacyLedger))fail('RESTORED_PRIVACY_LEDGER_CHECKSUM_MISMATCH');
  if(manifest.companyIds&&ledgerHash(companyIds)!==ledgerHash(manifest.companyIds))fail('RESTORED_COMPANY_COVERAGE_MISMATCH');
  if(synthetic){
    let requests=0;
    for(const table of ['aggregates','aggregate_revisions'])if(restored.some(row=>row.schema==='public'&&row.table===table)){
      const result=await client.query(`SELECT count(*)::text AS privacy_request_count FROM public.${table} WHERE kind='privacy_request'`);
      if(!/^\d+$/.test(result.rows[0]?.privacy_request_count||''))fail('RESTORE_PRIVACY_REQUEST_COUNT_INVALID');
      requests+=Number(result.rows[0].privacy_request_count);
    }
    if(requests||privacy.manifests.length||privacy.blobDeletions.length)fail('RESTORE_SYNTHETIC_PRIVACY_HISTORY_FORBIDDEN');
  }else reconcileCurrentLedger(current,privacy,companyIds);
  for(const expected of manifest.privateBlobs){const sql=expected.store==='media_blobs'?'SELECT bytes AS content,sha256 FROM media_blobs WHERE company_id=$1 AND id=$2':'SELECT content,sha256 FROM private_blobs WHERE company_id=$1 AND key=$2';const result=await client.query(sql,[expected.company_id,expected.key]);const blob=result.rows[0];if(!blob||blob.sha256!==expected.sha256||blob.content.length!==expected.byte_size||createHash('sha256').update(blob.content).digest('hex')!==expected.sha256)fail('RESTORED_PRIVATE_BLOB_CHECKSUM_MISMATCH');}
  const hasAggregates=restored.some(row=>row.schema==='public'&&row.table==='aggregates'),hasBlobs=restored.some(row=>row.schema==='public'&&row.table==='private_blobs');
  if(hasAggregates&&hasBlobs&&manifest.storageMode==='POSTGRES_PRIVATE_BLOB_FALLBACK') {const missing=await client.query("SELECT count(*)::text AS count FROM aggregates a CROSS JOIN LATERAL (VALUES (a.data->>'blobKey'),(a.data->>'clientBlobKey')) AS ref(key) LEFT JOIN (SELECT company_id,key FROM private_blobs UNION ALL SELECT company_id,id AS key FROM media_blobs) b ON b.company_id=a.company_id AND b.key=ref.key WHERE a.kind IN ('media_asset','media_upload','report_artifact') AND ref.key IS NOT NULL AND b.key IS NULL");if(missing.rows[0].count!=='0')fail('RESTORED_MEDIA_REFERENCE_MISSING');}
  // Verify the backup's original contents before applying the current safety migration.
  // This only changes the explicitly empty destination, never the source database.
  await client.query('BEGIN');safetyTransaction=true;
  await client.query("SET LOCAL statement_timeout='10000ms'");
  await client.query("SET LOCAL lock_timeout='5000ms'");
  await client.query(await readFile(new URL('../infra/001_init.sql',import.meta.url),'utf8'));
  const permits=(await client.query('SELECT count(*)::text AS permit_count FROM public.privacy_revision_permits')).rows[0]?.permit_count;
  if(permits!=='0')fail('PRIVACY_TRANSIENT_PERMITS_NOT_EMPTY');
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
  console.log(`PASSED: restored ${restored.length} original tables, exact original row counts and ${manifest.privateBlobs.length} private blob checksums/references; durable erasure ledgers verified (${synthetic?'explicit isolated synthetic restore without privacy history':'independent current authority matched'}), transient permits empty; current GPS storage safety verified and ${gpsPointsPurged} expired GPS points purged before access.`);
} catch(error){if(safetyTransaction)await client.query('ROLLBACK').catch(()=>{});console.error(`FAILED: ${/^[A-Z0-9_]+$/.test(error.message)?error.message:'DATABASE_RESTORE_FAILED'}`);process.exitCode=1;}
finally {await client.end().catch(()=>{});}
