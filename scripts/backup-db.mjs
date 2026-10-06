import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseIdentity, fail, pgCommand, quotedIdentifier, tableCounts } from './pg-tools.mjs';

const privacyTables=['privacy_blob_deletions','privacy_erasure_manifests','privacy_revision_permits'];
// Identical to domain erasureHash: sorted object keys, original array order.
export const canonicalJson=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonicalJson).join(',')+']':'{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key])).join(',')+'}';
export const ledgerHash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const hashPattern=/^[a-f0-9]{64}$/;
const compare=(a,b)=>a<b?-1:a>b?1:0;
export const orderedManifests=rows=>[...rows].sort((a,b)=>compare(JSON.stringify([a.company_id,a.request_id,a.plan_hash]),JSON.stringify([b.company_id,b.request_id,b.plan_hash])));
export function validateErasureManifests(rows){
  const keys=new Set();
  for(const row of rows){
    const key=JSON.stringify([row.company_id,row.request_id,row.plan_hash]);
    if(!row.company_id||!row.request_id||!hashPattern.test(row.plan_hash)||!hashPattern.test(row.manifest_sha256)||keys.has(key)||ledgerHash(row.manifest)!==row.manifest_sha256||row.manifest?.companyId!==row.company_id||row.manifest?.requestId!==row.request_id||row.manifest?.planHash!==row.plan_hash)fail('PRIVACY_MANIFEST_INTEGRITY_FAILED');
    keys.add(key);
  }
}
export async function readPrivacyLedger(client,counts){
  const present=privacyTables.filter(table=>counts.some(row=>row.schema==='public'&&row.table===table));
  if(present.length!==0&&present.length!==privacyTables.length)fail('PRIVACY_LEDGER_SCHEMA_INCOMPLETE');
  if(!present.length)return {schemaPresent:false,permitsCount:'0',manifests:[],blobDeletions:[]};
  const permitsCount=counts.find(row=>row.schema==='public'&&row.table==='privacy_revision_permits').count;
  if(permitsCount!=='0')fail('PRIVACY_TRANSIENT_PERMITS_NOT_EMPTY');
  const manifests=orderedManifests((await client.query('SELECT company_id,request_id,plan_hash,manifest,manifest_sha256 FROM public.privacy_erasure_manifests ORDER BY company_id,request_id,plan_hash')).rows);
  validateErasureManifests(manifests);
  const blobDeletions=(await client.query("SELECT id,company_id,request_id,plan_hash,blob_key,expected_sha256,subject_user_id,provider_identity,status,attempts,extract(epoch from created_at)::text AS created_at_epoch,extract(epoch from verified_at)::text AS verified_at_epoch FROM public.privacy_blob_deletions ORDER BY company_id,id")).rows.sort((a,b)=>compare(JSON.stringify([a.company_id,a.id]),JSON.stringify([b.company_id,b.id])));
  return {schemaPresent:true,permitsCount,manifests,blobDeletions};
}
export function privacyLedgerProof(ledger){
  return {version:'KNABA_DE_PRIVACY_BACKUP_LEDGER_V1',schemaPresent:ledger.schemaPresent,transientPermitsExcluded:true,permitsCount:ledger.permitsCount,manifestsCount:String(ledger.manifests.length),manifestsSha256:ledgerHash(ledger.manifests),blobDeletionsCount:String(ledger.blobDeletions.length),blobDeletionsSha256:ledgerHash(ledger.blobDeletions)};
}
export async function companyIdsInSnapshot(client,counts){
  const tables=(await client.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='company_id' ORDER BY table_name")).rows.map(row=>row.table_name).filter(table=>counts.some(row=>row.schema==='public'&&row.table===table));
  const ids=new Set();
  for(const table of tables)for(const row of (await client.query(`SELECT DISTINCT company_id FROM public.${quotedIdentifier(table)} ORDER BY company_id`)).rows)if(typeof row.company_id==='string'&&row.company_id)ids.add(row.company_id);
  return [...ids].sort();
}
export function deletionTargets(rows){
  return rows.map(({attempts,created_at_epoch,verified_at_epoch,...target})=>target).sort((a,b)=>compare(JSON.stringify([a.company_id,a.id]),JSON.stringify([b.company_id,b.id])));
}
async function main(){
  const exporting=process.argv[2]==='--export-current-erasure-ledger',directory=exporting?undefined:process.argv[2],ledgerFile=exporting?process.argv[3]:undefined;
  if(!(exporting?ledgerFile:directory)||!process.env.DATABASE_URL)fail('BACKUP_CONFIGURATION_REQUIRED');
  if(!exporting&&process.env.S3_BUCKET&&!process.env.BACKUP_EXTERNAL_BLOBS_INCLUDED)fail('S3_BACKUP_MUST_BE_INCLUDED_AND_VERIFIED');
  const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
  try {
    await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const counts=await tableCounts(client),ledger=await readPrivacyLedger(client,counts);
    if(!ledger.schemaPresent)fail('BACKUP_PRIVACY_SCHEMA_REQUIRED');
    const companyIds=await companyIdsInSnapshot(client,counts),sourceIdentityHash=createHash('sha256').update(databaseIdentity(process.env.DATABASE_URL)).digest('hex');
    if(exporting){
      const current={format:'KNABA_DE_CURRENT_ERASURE_LEDGER_V1',exportedAt:new Date().toISOString(),sourceIdentityHash,companyIds,manifests:ledger.manifests,blobDeletions:deletionTargets(ledger.blobDeletions)};
      const bytes=JSON.stringify(current,null,2)+'\n';
      await writeFile(ledgerFile,bytes,{mode:0o600,flag:'wx'});await client.query('COMMIT');
      console.log(`PASSED: private current erasure ledger exported; sha256=${createHash('sha256').update(bytes).digest('hex')}. Keep this trusted checksum independently of the backup.`);return;
    }
    const version=await client.query('SHOW server_version'),snapshot=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    const blobs=[];
    if(counts.some(row=>row.schema==='public'&&row.table==='private_blobs'))blobs.push(...(await client.query("SELECT 'private_blobs' AS store,company_id,key,sha256,octet_length(content) AS byte_size FROM private_blobs ORDER BY company_id,key")).rows);
    if(counts.some(row=>row.schema==='public'&&row.table==='media_blobs'))blobs.push(...(await client.query("SELECT 'media_blobs' AS store,company_id,id AS key,sha256,octet_length(bytes) AS byte_size FROM media_blobs ORDER BY company_id,id")).rows);
    // Permits contain preimages only inside an erasure transaction; never archive them.
    await pgCommand('pg_dump',['--format=custom','--no-owner','--no-acl','--exclude-table-data=public.privacy_revision_permits',`--snapshot=${snapshot}`],process.env.DATABASE_URL,{outputFile:`${directory}/database.dump`});
    const hash=createHash('sha256');for await(const bytes of createReadStream(`${directory}/database.dump`))hash.update(bytes);
    const manifest={format:'KNABA_DE_ENCRYPTED_BACKUP_V1',createdAt:new Date().toISOString(),gitSha:process.env.GIT_SHA||'UNKNOWN',postgresVersion:version.rows[0].server_version,sourceIdentityHash,dumpSha256:hash.digest('hex'),tableCounts:counts,companyIds,privacyLedger:privacyLedgerProof(ledger),privateBlobs:blobs,storageMode:process.env.S3_BUCKET?'EXTERNAL_BLOBS_OPERATOR_INCLUDED':'POSTGRES_PRIVATE_BLOB_FALLBACK',filesystemBlobsIncluded:Boolean(process.env.BACKUP_PRIVATE_STORAGE_DIR)};
    await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});await client.query('COMMIT');
    console.log('PASSED: consistent PostgreSQL snapshot exported, including private blob metadata and durable erasure ledgers; transient permit data excluded.');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(`FAILED: ${/^[A-Z0-9_]+$/.test(error.message)?error.message:'DATABASE_BACKUP_FAILED'}`);process.exitCode=1;}
  finally{await client.end().catch(()=>{});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
