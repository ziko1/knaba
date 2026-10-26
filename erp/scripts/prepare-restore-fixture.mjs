import { Client } from 'pg';
import { createHash } from 'node:crypto';
if(process.env.APP_MODE!=='TEST')throw new Error('EXPLICIT_TEST_MODE_REQUIRED');
const content=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),sha256=createHash('sha256').update(content).digest('hex'),company='knaba-restore-fixture',key=`test/restore-proof-${sha256}.png`,assetId='synthetic-backup-proof';
const client=new Client({connectionString:process.env.DATABASE_URL});
try {await client.connect();await client.query('BEGIN');await client.query("INSERT INTO private_blobs(company_id,key,content,sha256,mime_type) VALUES($1,$2,$3,$4,'image/png') ON CONFLICT DO NOTHING",[company,key,content,sha256]);await client.query("INSERT INTO aggregates(company_id,kind,id,data) VALUES($1,'media_upload',$2,$3) ON CONFLICT DO NOTHING",[company,assetId,JSON.stringify({blobKey:key,sha256,mimeType:'image/png',byteSize:content.length,uploadedBy:'synthetic-restore-test',scanState:'CLEAN',operatingMode:'TEST'})]);await client.query('COMMIT');console.log('PASSED: explicitly synthetic TEST-only private PNG and its canonical media reference prepared for the restore drill.');}
catch{await client.query('ROLLBACK').catch(()=>{});console.error('FAILED: SYNTHETIC_RESTORE_FIXTURE');process.exitCode=1;}finally{await client.end().catch(()=>{});}
