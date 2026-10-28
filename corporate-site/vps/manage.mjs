import { openLocalDatabase } from './database.mjs';
import { createOwner,normalizeEmail } from './auth.mjs';
import { issueOwnerInvite } from './owner-invite.mjs';
import { backup } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, mkdir, chmod, stat, lstat, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join,dirname } from 'node:path';
import { inspectStorage } from './storage.mjs';
const command=process.argv[2];
const dbPath=process.env.KNABA_DB_PATH||'/var/lib/knaba/site.sqlite';
if(['backup','migrate'].includes(command)){
  const usage=inspectStorage(dirname(dbPath));
  if(usage.state==='critical')throw Error('Insufficient disk space for safe backup/migration; source data unchanged.');
  if(usage.state==='warning')process.stderr.write('Storage warning: public cutover blocked until space is available.\n');
}

if(!['init-owner','invite-owner','invite-developer','revoke-developer','backup','audit','migrate'].includes(command||'')){
  process.stderr.write('Usage: node vps/manage.mjs init-owner|invite-owner|invite-developer|revoke-developer|backup|audit|migrate\n');process.exit(2);
}
if(command==='audit'){
  // Read-only snapshot inspection. Never initialize schemas or silently create a database.
  const available=await stat(dbPath).catch(()=>null);
  if(!available?.isFile())throw Error('Audit requires an existing database; none created.');
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try{
    const rows=db.prepare('SELECT filename,sha256,installed_at FROM vps_schema_migrations ORDER BY filename').all();
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const integrity=db.prepare('PRAGMA integrity_check').get();
    process.stdout.write(JSON.stringify({migrations:rows,tables:tables.map(r=>r.name),integrity:integrity.integrity_check},null,2)+'\n');
    if(integrity.integrity_check!=='ok')process.exitCode=2;
  } finally {db.close();}
  process.exit();
}
if(command==='migrate'){
  // Existing durable data must have an independent, verified backup before schema changes.
  const original=await stat(dbPath).catch(()=>null);
  if(original?.size){
    const directory=process.env.KNABA_BACKUP_DIR||'/var/lib/knaba/backups';
    await mkdir(directory,{recursive:true,mode:0o700});
    const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
    const target=join(directory,'pre-migrate-'+timestamp+'.sqlite');
    const existing=new DatabaseSync(dbPath);
    try{await backup(existing,target);} finally {existing.close();}
    await chmod(target,0o600);
    const digest=createHash('sha256').update(await readFile(target)).digest('hex');
    process.stdout.write('Pre-migration backup verified sha256='+digest+' path='+target+'\n');
  }
}
if(command==='invite-owner'||command==='invite-developer'){
  // Invitation never bootstraps or migrates the user's database by accident.
  const existing=await stat(dbPath).catch(()=>null);
  if(!existing?.isFile())throw Error('An existing migrated KNABA database is required for owner invitation.');
}
const {db,migrations}=openLocalDatabase(dbPath,{allowMigrations:command==='migrate'});
try {
  if(command==='init-owner'){
    if(!process.env.OWNER_EMAIL)throw Error('OWNER_EMAIL must be provisioned via protected server environment.');
    if(process.stdin.isTTY)throw Error('Passphrase must be passed through private stdin (never a command argument).');
    let value='';
    for await(const chunk of process.stdin){
      value+=chunk.toString('utf8');
      if(value.length>400)throw Error('Passphrase input too long.');
    }
    const password=value.replace(/[\r\n]+$/,'');
    const owner=createOwner(db,process.env.OWNER_EMAIL,password);
    process.stdout.write('Owner enrolled: '+owner.email+' (no password returned)\n');
  }
  if(command==='invite-owner'||command==='invite-developer'){
    if(!process.env.OWNER_EMAIL)throw Error('Private OWNER_EMAIL configuration is required.');
    if(command==='invite-developer'){
      const configured=normalizeEmail(process.env.KNABA_DEVELOPER_EMAIL||'');
      if(configured===normalizeEmail(process.env.OWNER_EMAIL))throw Error('Developer address must differ from owner.');
      if(!db.prepare('SELECT 1 FROM vps_users WHERE email=? AND disabled=0').get(normalizeEmail(process.env.OWNER_EMAIL)))
        throw Error('Enroll real owner before inviting developer.');
    }
    let origin;
    try{origin=new URL(process.env.KNABA_PUBLIC_ORIGIN||'');}
    catch{throw Error('Verified KNABA HTTPS origin is required.');}
    if(origin.protocol!=='https:'||!origin.hostname.includes('.')||origin.hostname==='localhost'||
       origin.port||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
      throw Error('Verified KNABA HTTPS origin is required.');
    const directory=join(dirname(dbPath),'owner-invites');
    await mkdir(directory,{recursive:true,mode:0o700});
    const folder=await lstat(directory);
    if(!folder.isDirectory()||(folder.mode & 0o077)!==0)
      throw Error('Private owner invitation directory must be a real mode 0700 directory.');
    // No HTTP/email delivery or automatic account creation. The operator
    // controls the private 0600 handoff and must confirm identity separately.
    const invite=issueOwnerInvite(db,command==='invite-developer'?
      process.env.KNABA_DEVELOPER_EMAIL:process.env.OWNER_EMAIL);
    const file=join(directory,(command==='invite-developer'?'developer':'owner')+'-invite-'+Date.now()+'-'+randomBytes(12).toString('hex')+'.json');
    await writeFile(file,JSON.stringify({
      to:invite.email,
      activationUrl:origin.origin+(command==='invite-developer'?'/activate-developer/':'/activate-owner/')+'#token='+invite.token,
      expiresAt:new Date(invite.expiresAt).toISOString()
    })+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    await chmod(file,0o600);
    process.stdout.write(JSON.stringify({issued:true,secretFile:file,expiresAt:new Date(invite.expiresAt).toISOString()})+'\n');
  }
  if(command==='revoke-developer'){
    if(!process.env.OWNER_EMAIL||!process.env.KNABA_DEVELOPER_EMAIL)
      throw Error('Both protected owner and developer addresses are required.');
    const owner=normalizeEmail(process.env.OWNER_EMAIL);
    const email=normalizeEmail(process.env.KNABA_DEVELOPER_EMAIL);
    if(email===owner)throw Error('Developer must be distinct.');
    const ownerUser=db.prepare('SELECT id FROM vps_users WHERE email=? AND disabled=0').get(owner);
    if(!ownerUser)throw Error('Existing owner is required.');
    db.exec('BEGIN IMMEDIATE');
    try{
      const target=db.prepare("SELECT g.user_id FROM vps_staff_grants g JOIN vps_users u ON u.id=g.user_id WHERE g.email=? AND u.email=? AND g.active=1 AND g.purpose='developer'").get(email,email);
      if(target){
        db.prepare('UPDATE vps_staff_grants SET active=0 WHERE user_id=?').run(target.user_id);
        db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(target.user_id);
        db.prepare('INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
          .run(randomBytes(18).toString('base64url'),ownerUser.id,'developer.revoked',target.user_id,new Date().toISOString());
      }
      db.exec('COMMIT');
      process.stdout.write(JSON.stringify({revoked:Boolean(target)})+'\n');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(command==='backup'){
    const location=process.env.KNABA_BACKUP_DIR||'/var/lib/knaba/backups';
    await mkdir(location,{recursive:true,mode:0o700});
    const tag=new Date().toISOString().replace(/[:.]/g,'-');
    const path=join(location,'knaba-'+tag+'.sqlite');
    await backup(db,path);
    await chmod(path,0o600);
    const h=createHash('sha256').update(await readFile(path)).digest('hex');
    process.stdout.write(JSON.stringify({path,sha256:h,migrations,bytes:(await readFile(path)).length})+'\n');
  }
} finally {db.close();}
