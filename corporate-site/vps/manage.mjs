import { openLocalDatabase } from './database.mjs';
import { createOwner } from './auth.mjs';
import { backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFile, mkdir, chmod, stat } from 'node:fs/promises';
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

if(!['init-owner','backup','audit','migrate'].includes(command||'')){
  process.stderr.write('Usage: node vps/manage.mjs init-owner|backup|audit|migrate\n');process.exit(2);
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
