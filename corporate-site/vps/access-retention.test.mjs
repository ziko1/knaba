import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync,readdirSync,statSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser} from './auth.mjs';

const cli=new URL('./manage.mjs',import.meta.url).pathname;
const day=86_400_000;
const count=(db,query)=>db.prepare(query).get().n;

function fixture(){
 const folder=mkdtempSync(join(tmpdir(),'knaba-retention-'));
 const file=join(folder,'state.sqlite');
 const {db}=openLocalDatabase(file);
 createCredentialsUser(db,'owner@example.test','synthetic-only-password-2026');
 const add=db.prepare('INSERT INTO vps_access_requests(id,name,email,intent,status,privacy_version,created_at,expires_at,reviewed_at,reviewed_by) VALUES (?,?,?,?,?,?,?,?,?,?)');
 const now=Date.now();
 add.run('expired-client','Synthetic','expired-client@example.test','client','pending','2026-10-26',now-31*day,now-day,null,null);
 add.run('expired-partner','Synthetic','expired-partner@example.test','partner','pending','2026-10-26',now-31*day,now-2000,null,null);
 add.run('valid-client','Synthetic','valid-client@example.test','client','pending','2026-10-26',now-2*day,now+28*day,null,null);
 add.run('valid-worker','Synthetic','valid-worker@example.test','worker','handled','2026-10-26',now-7*day,now+23*day,now-5000,'owner-qa');
 db.close();
 return {folder,file,backups:join(folder,'retention-backups')};
}
function cliCall(f,args,extra={}){
 return spawnSync(process.execPath,[cli,'access-retention',...args],{
   encoding:'utf8',timeout:25000,env:{
    ...process.env,KNABA_DB_PATH:f.file,KNABA_ACCESS_RETENTION_BACKUP_DIR:f.backups,
    OWNER_EMAIL:'owner@example.test',...extra
   }
 });
}
const fingerprint=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
test('access retention is dry-run by default and emits aggregate counts with no personal data',()=>{
 const f=fixture();
 try{
  const before=fingerprint(f.file);
  const proc=cliCall(f,[]);
  assert.equal(proc.status,0,proc.stderr);
  const report=JSON.parse(proc.stdout);
  assert.equal(report.scope,'access_requests');
  assert.equal(report.mode,'dry_run');
  assert.equal(report.expired,2);
  assert.equal(report.unexpired,2);
  assert.equal(report.retentionDays,30);
  assert.equal(fingerprint(f.file),before);
  assert.equal(existsSync(f.backups),false);
  assert.doesNotMatch(proc.stdout,/example\.test|Synthetic|expired-client/);
 }finally{rmSync(f.folder,{recursive:true,force:true});}
});
test('no retention changes without explicit legal/owner approval or with unsupported arguments',()=>{
 const f=fixture();
 try{
  const before=fingerprint(f.file);
  for(const args of [['--apply'],['--delete'],['--apply','--unknown']]){
   const p=cliCall(f,args);
   assert.notEqual(p.status,0,JSON.stringify({args,p}));
   assert.equal(fingerprint(f.file),before);
  }
  assert.equal(existsSync(f.backups),false);
 }finally{rmSync(f.folder,{recursive:true,force:true});}
});
test('retention apply makes verified private online backup before deleting expired only and is idempotent',()=>{
 const f=fixture();
 try{
  const env={KNABA_ACCESS_RETENTION_APPROVED:'YES'};
  const applied=cliCall(f,['--apply'],env);
  assert.equal(applied.status,0,applied.stderr);
  const report=JSON.parse(applied.stdout);
  assert.equal(report.mode,'applied');
  assert.equal(report.deleted,2);
  assert.equal(report.remainingExpired,0);
  assert.equal(report.retentionDays,30);
  assert.doesNotMatch(applied.stdout,/example\.test|Synthetic|expired-client/);
  const names=readdirSync(f.backups).filter(name=>name.endsWith('.sqlite'));
  assert.equal(names.length,1);
  const path=join(f.backups,names[0]);
  assert.equal(statSync(path).mode&0o077,0);
  const original=new DatabaseSync(path,{readOnly:true});
  const current=new DatabaseSync(f.file,{readOnly:true});
  try{
   assert.equal(count(original,'SELECT count(*) n FROM vps_access_requests'),4);
   assert.equal(count(current,'SELECT count(*) n FROM vps_access_requests'),2);
   assert.equal(count(current,'SELECT count(*) n FROM vps_users'),1);
   assert.equal(current.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
   assert.deepEqual(current.prepare('PRAGMA foreign_key_check').all(),[]);
   assert.equal(current.prepare("SELECT count(*) n FROM vps_access_requests WHERE email='valid-client@example.test'").get().n,1);
   assert.equal(current.prepare("SELECT count(*) n FROM vps_access_requests WHERE status='handled'").get().n,1);
  }finally{original.close();current.close();}
  const again=cliCall(f,['--apply'],env);
  assert.equal(again.status,0,again.stderr);
  assert.equal(JSON.parse(again.stdout).deleted,0);
  assert.equal(readdirSync(f.backups).filter(x=>x.endsWith('.sqlite')).length,1);
 }finally{rmSync(f.folder,{recursive:true,force:true});}
});
test('retention refuses missing database without materializing one',()=>{
 const folder=mkdtempSync(join(tmpdir(),'knaba-retention-missing-'));
 try{
  const file=join(folder,'not-created.sqlite');
  const f={folder,file,backups:join(folder,'backups')};
  assert.notEqual(cliCall(f,[]).status,0);
  assert.notEqual(cliCall(f,['--apply'],{KNABA_ACCESS_RETENTION_APPROVED:'YES'}).status,0);
  assert.equal(existsSync(file),false);
  assert.equal(existsSync(f.backups),false);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('backup destination cannot escape state through an external path or a symlink',()=>{
 const f=fixture();
 try{
  const outside=mkdtempSync(join(tmpdir(),'knaba-retention-outside-'));
  try{
   const safe=fingerprint(f.file);
   const env={KNABA_ACCESS_RETENTION_APPROVED:'YES',KNABA_ACCESS_RETENTION_BACKUP_DIR:outside};
   const refused=cliCall(f,['--apply'],env);
   assert.notEqual(refused.status,0);
   assert.equal(fingerprint(f.file),safe);
   assert.equal(readdirSync(outside).length,0);
  }finally{rmSync(outside,{recursive:true,force:true});}
 }finally{rmSync(f.folder,{recursive:true,force:true});}
});


test('symlinked backup directory is refused before any deletion',()=>{
 const f=fixture();
 try{
  const target=mkdtempSync(join(tmpdir(),'knaba-retention-symlink-target-'));
  try{
   const link=join(f.folder,'link-backups');
   symlinkSync(target,link);
   const before=fingerprint(f.file);
   const p=cliCall(f,['--apply'],{
    KNABA_ACCESS_RETENTION_APPROVED:'YES',
    KNABA_ACCESS_RETENTION_BACKUP_DIR:link
   });
   assert.notEqual(p.status,0);
   assert.equal(fingerprint(f.file),before);
   assert.equal(readdirSync(target).length,0);
  }finally{rmSync(target,{recursive:true,force:true});}
 }finally{rmSync(f.folder,{recursive:true,force:true});}
});
