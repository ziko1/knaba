import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,chmod,symlink,readFile,writeFile,readdir,stat,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openLocalDatabase} from './database.mjs';
import {inspectMigrationSequence} from './migration-guard.mjs';

const cli=fileURLToPath(new URL('./manage.mjs',import.meta.url));
const expectedMigrations=inspectMigrationSequence(new URL('../drizzle/',import.meta.url).pathname).names;
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
function run(command,dbPath,backupDir,{preload,env={}}={}){
  // An operator's permissive umask must not expose the backup during creation.
  const previous=process.umask(0);
  try{
    return spawnSync(process.execPath,[...(preload?['--import',preload]:[]),cli,command],{
      env:{PATH:process.env.PATH,KNABA_DB_PATH:dbPath,KNABA_BACKUP_DIR:backupDir,...env},
      encoding:'utf8',timeout:20000
    });
  }finally{process.umask(previous);}
}
async function fixture(t,command,{invalidForeignKey=false}={}){
  const dir=await mkdtemp(join(tmpdir(),'knaba-manage-backup-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const dbPath=join(dir,'source.sqlite');
  // The migrate case starts with real, unversioned synthetic data. It must not
  // gain any KNABA schema when its required backup cannot be verified.
  const db=command==='backup'?openLocalDatabase(dbPath).db:new DatabaseSync(dbPath);
  try{
    db.exec("CREATE TABLE backup_probe(id INTEGER PRIMARY KEY,value TEXT NOT NULL); INSERT INTO backup_probe VALUES(1,'preserve this synthetic row')");
    if(invalidForeignKey){
      db.exec('PRAGMA foreign_keys=OFF; CREATE TABLE backup_probe_child(parent_id INTEGER REFERENCES backup_probe(id)); INSERT INTO backup_probe_child VALUES(999)');
    }
  }finally{db.close();}
  return {dir,dbPath};
}

for(const command of ['backup','migrate']){
  test(`${command} refuses an existing 0755 backup directory without changing it or source data`,async t=>{
    const {dir,dbPath}=await fixture(t,command);
    const destination=join(dir,'public-backups');
    await mkdir(destination,{mode:0o755});
    await chmod(destination,0o755);
    const before=await digest(dbPath);
    const result=run(command,dbPath,destination);
    assert.equal(result.error,undefined);
    assert.notEqual(result.status,0,'an existing non-private directory must be refused');
    assert.match(result.stderr,/backup directory.*private|private.*backup directory/i);
    assert.equal(result.stdout,'');
    assert.equal((await stat(destination)).mode&0o777,0o755,'must not chmod an operator-owned directory');
    assert.deepEqual(await readdir(destination),[]);
    assert.equal(await digest(dbPath),before,'failed backup must not migrate or rewrite source data');
  });

  test(`${command} refuses a symlinked backup directory without following it`,async t=>{
    const {dir,dbPath}=await fixture(t,command);
    const real=join(dir,'real-backups'),destination=join(dir,'linked-backups');
    await mkdir(real,{mode:0o700});
    await symlink(real,destination,'dir');
    const before=await digest(dbPath);
    const result=run(command,dbPath,destination);
    assert.equal(result.error,undefined);
    assert.notEqual(result.status,0,'a symlink destination must be refused');
    assert.match(result.stderr,/backup directory.*symlink|symlink.*backup directory/i);
    assert.equal(result.stdout,'');
    assert.deepEqual(await readdir(real),[]);
    assert.equal(await digest(dbPath),before);
  });

  test(`${command} refuses a symlinked parent before creating a new backup directory`,async t=>{
    const {dir,dbPath}=await fixture(t,command);
    const real=join(dir,'real-parent'),alias=join(dir,'linked-parent');
    await mkdir(real,{mode:0o700});
    await symlink(real,alias,'dir');
    const before=await digest(dbPath);
    const result=run(command,dbPath,join(alias,'new-backups'));
    assert.equal(result.error,undefined);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/backup directory.*symlink|symlink.*backup directory/i);
    assert.equal(result.stdout,'');
    assert.deepEqual(await readdir(real),[],'must not create directories through the symlink');
    assert.equal(await digest(dbPath),before);
  });

  test(`${command} refuses an independently copied database with broken foreign keys`,async t=>{
    const {dir,dbPath}=await fixture(t,command,{invalidForeignKey:true});
    const destination=join(dir,'private-backups');
    const before=await digest(dbPath);
    const result=run(command,dbPath,destination);
    assert.equal(result.error,undefined);
    assert.notEqual(result.status,0,'a checksum alone does not verify database consistency');
    assert.match(result.stderr,/backup.*integrity|backup.*foreign.key/i);
    assert.equal(result.stdout,'','must not report an unverified backup as verified');
    assert.equal(await digest(dbPath),before,'failed verification must not start a migration');
  });

  test(`${command} reserves a private inode before SQLite copying and returns a verified backup`,async t=>{
    const {dir,dbPath}=await fixture(t,command);
    const destination=join(dir,'new-private-backups'),observation=join(dir,'observation.json');
    const observer=join(dir,'observe-backup.mjs');
    // Observe the real CLI immediately after the filesystem creates its inode,
    // before returning control to the backup caller. Native SQLite stays real.
    await writeFile(observer,`
      import fs from 'node:fs/promises';
      import {dirname} from 'node:path';
      import {syncBuiltinESMExports} from 'node:module';
      const open=fs.open;
      fs.open=async(path,...options)=>{
        const handle=await open(path,...options);
        if(typeof path==='string'&&dirname(path)===process.env.KNABA_BACKUP_DIR&&path.endsWith('.sqlite')){
          const file=await handle.stat(),directory=await fs.lstat(dirname(path));
          await fs.writeFile(process.env.KNABA_TEST_BACKUP_OBSERVATION,JSON.stringify({
            mode:file.mode&0o777,nlink:file.nlink,bytes:file.size,regular:file.isFile(),
            directoryMode:directory.mode&0o777
          }),{flag:'wx',mode:0o600});
        }
        return handle;
      };
      syncBuiltinESMExports();
    `,{mode:0o600});
    const before=await digest(dbPath);
    const result=run(command,dbPath,destination,{preload:observer,env:{KNABA_TEST_BACKUP_OBSERVATION:observation}});
    assert.equal(result.error,undefined);
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(await readFile(observation,'utf8')),
      {mode:0o600,nlink:1,bytes:0,regular:true,directoryMode:0o700});
    let saved;
    if(command==='backup'){
      saved=JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(saved),['path','sha256','migrations','bytes']);
      assert.deepEqual(saved.migrations,expectedMigrations);
      assert.equal(await digest(dbPath),before);
    }else{
      const line=/^Pre-migration backup verified sha256=([a-f0-9]{64}) path=(.+)\n$/.exec(result.stdout);
      assert.ok(line,result.stdout);
      saved={sha256:line[1],path:line[2]};
      const migrated=new DatabaseSync(dbPath,{readOnly:true});
      try{
        assert.deepEqual(migrated.prepare('SELECT filename FROM vps_schema_migrations ORDER BY filename').all().map(row=>row.filename),expectedMigrations);
      }finally{migrated.close();}
    }
    assert.match(basename(saved.path),/^(?:knaba|pre-migrate)-[0-9TZ-]{24}-[a-f0-9]{24}\.sqlite$/);
    const details=await lstat(saved.path);
    assert.equal(details.mode&0o777,0o600);
    assert.equal(details.nlink,1);
    assert.equal((await stat(destination)).mode&0o777,0o700);
    assert.equal(saved.sha256,await digest(saved.path));
    if(command==='backup')assert.equal(saved.bytes,details.size);
    const copy=new DatabaseSync(saved.path,{readOnly:true});
    try{
      assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(),[]);
      assert.equal(copy.prepare('SELECT value FROM backup_probe WHERE id=1').get().value,'preserve this synthetic row');
      if(command==='migrate')assert.equal(copy.prepare("SELECT 1 FROM sqlite_master WHERE name='vps_schema_migrations'").get(),undefined,'snapshot must precede schema migration');
    }finally{copy.close();}
  });

  for(const collision of ['file','symlink']){
    test(`${command} refuses a ${collision} collision at destination reservation without overwriting`,async t=>{
      const {dir,dbPath}=await fixture(t,command);
      const destination=join(dir,'private-backups'),victim=join(dir,'unrelated-file');
      await writeFile(victim,'unrelated synthetic content',{mode:0o600});
      const inject=join(dir,'inject-collision.mjs');
      // Insert a competing pathname immediately before the real exclusive
      // open; do not stub SQLite, filenames, hashes or the CLI result.
      await writeFile(inject,`
        import fs from 'node:fs/promises';
        import {dirname} from 'node:path';
        import {syncBuiltinESMExports} from 'node:module';
        const open=fs.open;
        fs.open=async(path,...options)=>{
          if(typeof path==='string'&&dirname(path)===process.env.KNABA_BACKUP_DIR&&path.endsWith('.sqlite')){
            if(process.env.KNABA_TEST_BACKUP_COLLISION==='symlink')await fs.symlink(process.env.KNABA_TEST_BACKUP_VICTIM,path);
            else await fs.writeFile(path,'existing synthetic backup',{flag:'wx',mode:0o600});
          }
          return open(path,...options);
        };
        syncBuiltinESMExports();
      `,{mode:0o600});
      const before=await digest(dbPath),victimBefore=await digest(victim);
      const result=run(command,dbPath,destination,{preload:inject,env:{
        KNABA_TEST_BACKUP_COLLISION:collision,KNABA_TEST_BACKUP_VICTIM:victim
      }});
      assert.equal(result.error,undefined);
      assert.notEqual(result.status,0);
      assert.match(result.stderr,/EEXIST|ELOOP/);
      assert.equal(result.stdout,'');
      assert.equal(await digest(dbPath),before);
      assert.equal(await digest(victim),victimBefore);
      const names=await readdir(destination);
      assert.equal(names.length,1,'a collision must not trigger unbounded name retries');
      const target=join(destination,names[0]);
      if(collision==='symlink')assert.equal((await lstat(target)).isSymbolicLink(),true);
      else assert.equal(await readFile(target,'utf8'),'existing synthetic backup');
    });
  }
}
