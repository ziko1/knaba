/**
 * KNABA access request retention. Private operator CLI ONLY:
 * preview is read-only; destructive apply requires explicit site policy
 * acceptance and a verified, mode-0600 online SQLite backup.
 * This does not govern the distinct account, job or legal audit ledgers.
 */
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {lstat,mkdir,chmod,readFile,realpath} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {statfsSync} from 'node:fs';
import {ACCESS_REQUEST_TTL_DAYS} from './access-requests.mjs';
import {normalizeEmail} from './auth.mjs';

const MAX_PURGE=1000;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function checkedNow(){
 const now=Date.now();
 if(!Number.isSafeInteger(now)||now<1)throw Error('Invalid retention clock');
 return now;
}
function count(db,now){
 const summary=db.prepare(
  'SELECT count(*) total,'+
  'coalesce(sum(CASE WHEN expires_at<=? THEN 1 ELSE 0 END),0) expired,'+
  'coalesce(sum(CASE WHEN expires_at>? THEN 1 ELSE 0 END),0) unexpired'+
  ' FROM vps_access_requests'
 ).get(now,now);
 return {total:summary.total,expired:summary.expired,unexpired:summary.unexpired};
}
function checkIntegrity(db){
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok' ||
     db.prepare('PRAGMA foreign_key_check').all().length)
   throw Error('Database integrity is not verified; retention unchanged.');
 const versions=db.prepare('SELECT filename FROM vps_schema_migrations').all();
 if(!versions.some(x=>x.filename==='0008_access_requests.sql')||
    !versions.some(x=>x.filename==='0009_partner_access.sql'))
   throw Error('Known access request ledger required; retention unchanged.');
}
async function privateBackupDir(dbPath,configured){
 const sourceRoot=resolve(dirname(dbPath));
 const target=resolve(configured||join(sourceRoot,'backups','access-retention'));
 if(!target.startsWith(sourceRoot+sep))throw Error('Backup directory must be beneath protected database state.');
 await mkdir(target,{recursive:true,mode:0o700});
 const details=await lstat(target);
 if(!details.isDirectory()||details.isSymbolicLink()||(details.mode&0o077)!==0)
   throw Error('Backup directory must be private mode 0700 and not a symlink.');
 // An otherwise in-scope path through a symlinked parent must not escape state.
 const actualRoot=await realpath(sourceRoot),actualTarget=await realpath(target);
 if(!actualTarget.startsWith(actualRoot+sep))
   throw Error('Resolved retention backup directory escaped protected database state.');
 return target;
}
function sufficientDisk(dbPath,minimum){
 const s=statfsSync(dirname(dbPath));
 const available=s.bavail*s.bsize;
 if(!Number.isSafeInteger(available)||available<Math.max(2*1024*1024,minimum*3))
   throw Error('Not enough space for private retention backup.');
}
/** Rejects unknown flags and never reveals applicant names or email addresses. */
export async function manageAccessRetention({dbPath,apply=false,approval='',ownerEmail='',backupDir}){
 if(typeof dbPath!=='string'||!dbPath)throw Error('A protected SQLite database path is required.');
 const file=await lstat(dbPath).catch(()=>null);
 if(!file?.isFile()||file.isSymbolicLink())throw Error('Existing regular SQLite database required; nothing created.');
 const now=checkedNow();
 const snapshot=new DatabaseSync(dbPath,{readOnly:true});
 let current;
 try{
  checkIntegrity(snapshot);
  current=count(snapshot,now);
  if(!apply)return {
   scope:'access_requests',mode:'dry_run',retentionDays:ACCESS_REQUEST_TTL_DAYS,
   total:current.total,expired:current.expired,unexpired:current.unexpired,
   maxPerRun:MAX_PURGE
  };
  if(approval!=='YES')throw Error('Missing explicit 30-day owner retention authorization.');
  let owner;
  try{owner=normalizeEmail(ownerEmail);}catch{throw Error('Configured verified owner is required.');}
  if(!snapshot.prepare('SELECT 1 FROM vps_users WHERE email=? AND disabled=0').get(owner))
   throw Error('Configured active owner is required; retention unchanged.');
  if(current.expired===0)return{
   scope:'access_requests',mode:'applied',retentionDays:ACCESS_REQUEST_TTL_DAYS,
   expiredBefore:0,deleted:0,remainingExpired:0,backupCreated:false
  };
  sufficientDisk(dbPath,file.size);
  const dir=await privateBackupDir(dbPath,backupDir);
  const path=join(dir,'access-retention-'+new Date(now).toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(12).toString('hex')+'.sqlite');
  await backup(snapshot,path);
  await chmod(path,0o600);
  const saved=await lstat(path);
  if(!saved.isFile()||saved.isSymbolicLink()||(saved.mode&0o077)!==0)
   throw Error('Private retention backup failed permissions check; no rows deleted.');
  const copy=new DatabaseSync(path,{readOnly:true});
  try{
   checkIntegrity(copy);
   const preserved=count(copy,now);
   if(preserved.total!==current.total||preserved.expired!==current.expired)
    throw Error('Backup count mismatch; no rows deleted.');
  }finally{copy.close();}
  const backupSha256=hash(await readFile(path));
  // Backup is durable and independently verified before any DELETE.
  const writer=new DatabaseSync(dbPath);
  try{
   writer.exec('BEGIN IMMEDIATE');
   try{
    checkIntegrity(writer);
    // Only expired records, sorted and bounded to avoid unbounded database writes.
    const result=writer.prepare(
     'DELETE FROM vps_access_requests WHERE id IN ('+
     'SELECT id FROM vps_access_requests WHERE expires_at<=?'+
     ' ORDER BY expires_at ASC,id ASC LIMIT ?)'
    ).run(now,MAX_PURGE);
    const remaining=count(writer,now).expired;
    writer.exec('COMMIT');
    return{
     scope:'access_requests',mode:'applied',retentionDays:ACCESS_REQUEST_TTL_DAYS,
     expiredBefore:current.expired,deleted:result.changes,remainingExpired:remaining,
     backupCreated:true,backupSha256,backupPath:path
    };
   }catch(err){writer.exec('ROLLBACK');throw err;}
  }finally{writer.close();}
 }finally{snapshot.close();}
}
