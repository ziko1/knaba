/** Actual CLI/SQLite recovery on private synthetic data. Requires the full local
 * Git history already supplied to the root CI job; never fetches source or data.
 * This is not a target-host or distributed PostgreSQL restore certification. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync,spawnSync} from 'node:child_process';
import {constants,copyFileSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openLocalDatabase} from '../corporate-site/vps/database.mjs';
import {createCredentialsUser,createSessionForUser,createLogin,readSession,rotateCredentials,destroySession} from '../corporate-site/vps/auth.mjs';
import {readAccountSettings,updateAccountSettings,requestPasswordReset} from '../corporate-site/vps/account-settings.mjs';
import {createAccountMailer} from '../corporate-site/vps/account-mail.mjs';
import {SourceFederationCoordinator} from '../corporate-site/vps/federation-source.mjs';
import {sourceFingerprint} from '../corporate-site/vps/federation-snapshot.mjs';
import {testAuthority} from '../corporate-site/vps/federation-test-authority.mjs';
import {sessionReference} from '../erp/packages/integrations/site-federation-protocol.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const currentRuntime=join(repo,'corporate-site');
const historical=Object.freeze({
  beforeSettings:{sha:'9ff77d7b0161a4dde84314f2df327e4594e0eb0c',inputs:{
    'corporate-site/vps/database.mjs':'4d366688bc48639ef9126ae8e6bc0e6260b14d18',
    'corporate-site/vps/auth.mjs':'a40a869ed3fd7dea51442240a2c2e148a4bb2baa',
    'corporate-site/drizzle':'8a974c8c4051c4746ef2619aa4e18785a1b62fb5',
  }},
  beforeFederation:{sha:'dc54f109c52e3b8f8a2e506821a6eb322b5417c4',inputs:{
    'corporate-site/vps/database.mjs':'97792f7063fbaca904c34ea0a88266e2a1f2c538',
    'corporate-site/vps/auth.mjs':'4595625fa32921ffc6fd6f5e5962ec6687f24005',
    'corporate-site/drizzle':'8084e9e017c14599a809032590ddb0e31950f5bd',
  }},
});
const password='synthetic-recovery-original-2026';
const changedPassword='synthetic-recovery-changed-2026';
const digest=value=>createHash('sha256').update(value).digest('hex');
const cookie=session=>'__Host-knaba-session='+session.token;
const rows=(db,table)=>db.prepare('SELECT * FROM "'+table+'"').all();
const rowDigest=value=>digest(JSON.stringify(value));
const ledger=db=>db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all();
function integrity(db){
  assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map(row=>row.integrity_check),['ok']);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
}
function image(db){
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const tables={};
  for(const {name,type} of schema){
    if(type!=='table')continue;
    assert.match(name,/^[A-Za-z_][A-Za-z0-9_]*$/);
    const data=rows(db,name).map(row=>JSON.stringify(row)).sort();
    tables[name]={count:data.length,sha256:rowDigest(data)};
  }
  return {schemaSha256:rowDigest(schema),tables};
}
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'knaba-account-recovery-')),opened=new Set();
  assert.equal(lstatSync(directory).mode&0o777,0o700);
  t.after(()=>{for(const db of opened)db.close();rmSync(directory,{recursive:true,force:true});});
  return {directory,
    open(path,opener=openLocalDatabase,options={allowMigrations:false}){
      const {db}=opener(path,options);opened.add(db);return db;
    },
    read(path){const db=new DatabaseSync(path,{readOnly:true});opened.add(db);return db;},
    close(db){db.close();opened.delete(db);},
  };
}
async function exportHistorical(t,directory,name){
  const source=historical[name],git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',timeout:10000}).trim();
  assert.equal(git(['cat-file','-t',source.sha]),'commit');
  git(['merge-base','--is-ancestor',source.sha,'HEAD']);
  for(const [path,object] of Object.entries(source.inputs))assert.equal(git(['rev-parse',source.sha+':'+path]),object);
  const destination=join(directory,name);mkdirSync(destination,{mode:0o700});
  const archive=execFileSync('git',['archive','--format=tar',source.sha,'corporate-site/vps','corporate-site/drizzle'],
    {cwd:repo,timeout:10000,maxBuffer:32*1024*1024});
  execFileSync('tar',['-xf','-','-C',destination],{input:archive,timeout:10000,stdio:['pipe','pipe','pipe']});
  const runtime=join(destination,'corporate-site');
  t.diagnostic('HISTORICAL_RUNTIME '+JSON.stringify({name,...source,archiveSha256:digest(archive)}));
  return {runtime,...await import(pathToFileURL(join(runtime,'vps/database.mjs')).href),
    auth:await import(pathToFileURL(join(runtime,'vps/auth.mjs')).href)};
}
function cli(runtime,command,path,backups){
  const result=spawnSync(process.execPath,[join(runtime,'vps/manage.mjs'),command],{
    cwd:runtime,encoding:'utf8',timeout:20000,maxBuffer:1024*1024,
    // No inherited production/provider/owner environment can enter this CLI.
    env:{PATH:process.env.PATH??'',TZ:'UTC',KNABA_DB_PATH:path,KNABA_BACKUP_DIR:backups},
  });
  assert.equal(Boolean(result.error),false,'CLI process must finish within its bound');
  assert.equal(result.signal,null,'CLI process must not be interrupted');
  assert.equal(result.status,0,command+' CLI failed; stderr SHA256 '+digest(result.stderr??''));
  return result.stdout;
}
function verifiedBackup(saved,directory){
  assert.equal(dirname(saved.path),directory);
  const info=lstatSync(saved.path),folder=lstatSync(directory),bytes=readFileSync(saved.path);
  assert.equal(info.isFile(),true);assert.equal(info.isSymbolicLink(),false);
  assert.equal(info.mode&0o777,0o600);assert.equal(info.nlink,1);
  assert.equal(folder.isDirectory(),true);assert.equal(folder.mode&0o777,0o700);
  assert.equal(digest(bytes),saved.sha256);
  if(saved.bytes!==undefined)assert.equal(bytes.length,saved.bytes);
  const db=new DatabaseSync(saved.path,{readOnly:true});
  try{integrity(db);return image(db);}finally{db.close();}
}
function restore(saved,path){
  assert.equal(digest(readFileSync(saved.path)),saved.sha256);
  copyFileSync(saved.path,path,constants.COPYFILE_EXCL);
  assert.equal(digest(readFileSync(path)),saved.sha256);
  assert.equal(lstatSync(path).mode&0o777,0o600);
}
function profile(db,user,role='client'){
  db.prepare(`INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation)
    VALUES(?,?,?,?,?,'approved','2026-10-28','2026-11-08','2026-11-08',1,'synthetic-recovery')`)
    .run(user.id,'Synthetic Recovery User',user.email,role,role);
}
function otherAccountImage(db,user){
  return rowDigest(['vps_users','profiles','vps_sessions'].map(table=>db.prepare(
    'SELECT * FROM '+table+' WHERE '+(table==='vps_sessions'?'user_id':'id')+'=? ORDER BY 1').all(user.id)));
}

test('actual legacy CLI migration and verified restore retain profile, data and credential revocation', {timeout:45000}, async t=>{
  const f=fixture(t),legacy=await exportHistorical(t,f.directory,'beforeSettings');
  const path=join(f.directory,'source.sqlite'),backups=join(f.directory,'backups');
  mkdirSync(backups,{mode:0o700});
  let db=f.open(path,legacy.openLocalDatabase,{allowMigrations:true});
  const user=legacy.auth.createCredentialsUser(db,'recover@example.test',password);
  const other=legacy.auth.createCredentialsUser(db,'unrelated@example.test',password);
  profile(db,user);profile(db,other,'worker');
  const originalSessions=[legacy.auth.createSessionForUser(db,user.id),legacy.auth.createSessionForUser(db,user.id)];
  const otherSession=legacy.auth.createSessionForUser(db,other.id);
  db.prepare(`INSERT INTO cleaning_requests(id,client_id,service,object_type,postcode,area,frequency,message,contact_name,email,
    phone,address,dedupe_scope,idempotency_key,payload_hash,privacy_version,created_at,updated_at,last_mutation)
    VALUES('synthetic-job',?,'baureinigung','Baustelle','10315','200','Einmalig','Synthetic recovery job',
    'Synthetic Recovery User',?,'','Synthetic Street 1','synthetic-scope','synthetic-key','synthetic-hash','2026-10-28',
    '2026-11-08','2026-11-08','synthetic-request')`).run(user.id,user.email);
  integrity(db);
  assert.equal(Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE name='vps_account_settings'").get()),false);
  const oldImage=image(db),oldLedger=ledger(db),unrelated=otherAccountImage(db,other);
  const business=oldImage.tables.cleaning_requests;
  f.close(db);

  const oldAudit=JSON.parse(cli(legacy.runtime,'audit',path,backups));
  assert.equal(oldAudit.integrity,'ok');assert.equal(oldAudit.migrations.length,15);
  assert.deepEqual(oldAudit.migrations,oldLedger.map(row=>({...row})));
  const oldBackup=JSON.parse(cli(legacy.runtime,'backup',path,backups));
  assert.deepEqual(verifiedBackup(oldBackup,backups),oldImage);
  assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),/Pending (?:VPS auth|schema) migration/);
  db=f.read(path);assert.deepEqual(image(db),oldImage);f.close(db);

  const migrate=cli(currentRuntime,'migrate',path,backups);
  const receipts=[...migrate.matchAll(/Pre-migration backup verified sha256=([a-f0-9]{64}) path=([^\r\n]+)/g)];
  assert.equal(receipts.length,1);
  const preMigration={sha256:receipts[0][1],path:receipts[0][2]};
  assert.deepEqual(verifiedBackup(preMigration,backups),oldImage);
  const rollbackPath=join(f.directory,'legacy-rollback.sqlite');restore(preMigration,rollbackPath);
  db=f.open(rollbackPath,legacy.openLocalDatabase);
  assert.deepEqual(image(db),oldImage);
  assert.equal(Boolean(legacy.auth.readSession(db,cookie(originalSessions[0]))),true);
  f.close(db);

  db=f.open(path);integrity(db);
  const migrated=image(db),currentLedger=ledger(db);
  for(const [table,before] of Object.entries(oldImage.tables)){
    if(table!=='vps_schema_migrations')assert.deepEqual(migrated.tables[table],before,'Existing table preserved: '+table);
  }
  assert.deepEqual(currentLedger.slice(0,oldLedger.length),oldLedger);
  assert.equal(currentLedger.some(row=>row.filename==='0018_federation_runtime_barrier.sql'),true);
  for(const session of originalSessions)assert.equal(Boolean(readSession(db,cookie(session))),true);
  const settings={name:'Updated Synthetic User',phone:'+49 30 1234567',company:'Synthetic Company',
    address:'Synthetic Street 12',locale:'uk',timeZone:'Europe/Kyiv',version:0};
  assert.deepEqual(updateAccountSettings(db,{cookieHeader:cookie(originalSessions[0]),values:settings}),{saved:true,version:1});
  assert.equal(db.prepare('SELECT role FROM profiles WHERE id=?').get(user.id).role,'client');
  let deliveries=0;
  const mail=createAccountMailer({origin:'https://recovery.example.test',environment:{
    KNABA_ACCOUNT_EMAIL_ENABLED:'approved',KNABA_ACCOUNT_EMAIL_FROM:'KnaBa <accounts@example.test>',
    KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'1',RESEND_API_KEY:'synthetic-never-a-provider-key'},
    transport:async()=>{deliveries++;return Response.json({id:'synthetic_recovery_receipt'});}});
  try{
    await requestPasswordReset(db,{email:user.email,clientKey:'synthetic-recovery',locale:'uk',mail});
    await mail.drain();
  }finally{await mail.close();}
  assert.equal(deliveries,1);
  assert.equal(db.prepare("SELECT count(*) n FROM vps_account_tokens WHERE user_id=? AND delivery_state='accepted'").get(user.id).n,1);
  assert.equal(await rotateCredentials(db,{userId:user.id,cookieHeader:cookie(originalSessions[0]),
    currentPassword:password,newPassword:changedPassword,confirmed:changedPassword}),true);
  for(const session of originalSessions)assert.equal(readSession(db,cookie(session))===null,true);
  assert.equal(db.prepare('SELECT count(*) n FROM vps_account_tokens WHERE user_id=?').get(user.id).n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM vps_sessions WHERE user_id=?').get(user.id).n,0);
  assert.equal(await createLogin(db,{email:user.email,password,clientKey:'synthetic-old-login'})===null,true);
  const renewed=await createLogin(db,{email:user.email,password:changedPassword,clientKey:'synthetic-new-login'});
  assert.equal(Boolean(renewed?.token),true);
  assert.equal(otherAccountImage(db,other),unrelated);
  assert.equal(Boolean(readSession(db,cookie(otherSession))),true);
  assert.deepEqual(image(db).tables.cleaning_requests,business);
  for(const action of ['account.profile.updated','credential.rotated'])
    assert.equal(db.prepare('SELECT count(*) n FROM portal_audit WHERE actor_id=? AND action=?').get(user.id,action).n,1);
  const afterRotation=image(db);f.close(db);

  const saved=JSON.parse(cli(currentRuntime,'backup',path,backups));
  assert.deepEqual(verifiedBackup(saved,backups),afterRotation);
  const restoredPath=join(f.directory,'restored-current.sqlite');restore(saved,restoredPath);
  db=f.open(restoredPath);integrity(db);
  assert.deepEqual(image(db),afterRotation);
  assert.deepEqual(ledger(db),currentLedger);
  const restoredSettings=readAccountSettings(db,{cookieHeader:cookie(renewed)});
  for(const [name,value] of Object.entries({...settings,version:1}))assert.equal(restoredSettings[name],value);
  assert.equal(restoredSettings.role,'client');assert.equal(restoredSettings.status,'approved');
  for(const session of originalSessions)assert.equal(readSession(db,cookie(session))===null,true);
  assert.equal(otherAccountImage(db,other),unrelated);
  assert.equal(Boolean(readSession(db,cookie(otherSession))),true);
  assert.equal(await createLogin(db,{email:user.email,password,clientKey:'restored-old-login'})===null,true);
  assert.equal(Boolean((await createLogin(db,{email:user.email,password:changedPassword,clientKey:'restored-new-login'}))?.token),true);
  assert.equal(db.prepare('SELECT count(*) n FROM vps_account_tokens WHERE user_id=?').get(user.id).n,0);
  assert.deepEqual(image(db).tables.cleaning_requests,business);
  const beforeOldOpen=image(db);f.close(db);
  assert.throws(()=>legacy.openLocalDatabase(restoredPath,{allowMigrations:false}),/Unrecognized applied migration:/);
  db=f.read(restoredPath);assert.deepEqual(image(db),beforeOldOpen);f.close(db);
  const audit=JSON.parse(cli(currentRuntime,'audit',restoredPath,backups));
  assert.equal(audit.integrity,'ok');assert.deepEqual(audit.migrations,currentLedger.map(row=>({...row})));
  db=f.read(path);assert.deepEqual(image(db),afterRotation);f.close(db);
  t.diagnostic('ACCOUNT_RESTORE '+JSON.stringify({legacyMigrations:oldLedger.length,currentMigrations:currentLedger.length,
    preMigrationSha256:preMigration.sha256,restoredBackupSha256:saved.sha256,bytes:saved.bytes,
    oldSessionsRevoked:originalSessions.length,unrelatedAccountPreserved:true,syntheticTransportCalls:deliveries,externalProviderCalls:0}));
});

test('restored pending F2 credential fence stays denied and the actual pre-F2 binary rejects migration 0018', {timeout:45000}, async t=>{
  const f=fixture(t),preF2=await exportHistorical(t,f.directory,'beforeFederation');
  const path=join(f.directory,'federated-source.sqlite'),backups=join(f.directory,'backups');
  let db=f.open(path,openLocalDatabase,{allowMigrations:true});
  const user=createCredentialsUser(db,'federated-recovery@example.test',password);profile(db,user);
  const sessions=[createSessionForUser(db,user.id),createSessionForUser(db,user.id)];
  const authority=await testAuthority(t),{config,ledger:remote}=authority;
  const fingerprint=sourceFingerprint(db,user.id,config,{});
  remote.principals.set(user.id,{kind:'PRINCIPAL',subject:user.id,epoch:1,minimumEpoch:1,state:'ACTIVE',
    securityFingerprint:fingerprint,sourcePolicyVersion:1,version:1,fenceOperationId:null});
  for(const session of sessions){
    const tokenHash=digest(session.token),ref=sessionReference(config.issuer,user.id,tokenHash);
    const expiresAt=db.prepare('SELECT expires_at FROM vps_sessions WHERE token_hash=?').get(tokenHash).expires_at;
    remote.sessions.set(ref,{kind:'SESSION',subject:user.id,sessionRef:ref,epoch:1,securityFingerprint:fingerprint,
      expiresAt:new Date(expiresAt*1000).toISOString(),state:'ACTIVE',version:1});
  }
  const coordinator=new SourceFederationCoordinator({db,authorities:[config],fetchImpl:authority.fetchImpl});
  try{
    await coordinator.initialize();
    assert.equal(Boolean(readSession(db,cookie(sessions[0]))),true);
    const credentials=rowDigest(db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(user.id));
    let lostAcknowledgement=false;
    remote.after=(wire,response)=>{
      if(wire.envelope.action==='FENCE'&&!lostAcknowledgement){lostAcknowledgement=true;response.destroy();return false;}
    };
    await assert.rejects(()=>rotateCredentials(db,{userId:user.id,cookieHeader:cookie(sessions[0]),
      currentPassword:password,newPassword:changedPassword,confirmed:changedPassword}),{code:'FEDERATION_PENDING'});
    assert.equal(lostAcknowledgement,true);
    assert.equal(db.prepare('SELECT state FROM vps_federation_operations').get().state,'PENDING_DENY');
    assert.equal(remote.principals.get(user.id).state,'FENCED');
    assert.equal(rowDigest(db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(user.id)),credentials);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_sessions WHERE user_id=?').get(user.id).n,2);
    for(const session of sessions)assert.equal(readSession(db,cookie(session))===null,true);
  }finally{coordinator.close();remote.after=null;}
  integrity(db);const pending=image(db);f.close(db);
  const saved=JSON.parse(cli(currentRuntime,'backup',path,backups));
  assert.deepEqual(verifiedBackup(saved,backups),pending);
  const restoredPath=join(f.directory,'restored-federation.sqlite');restore(saved,restoredPath);
  assert.throws(()=>preF2.openLocalDatabase(restoredPath,{allowMigrations:false}),
    /Unrecognized applied migration: 0018_federation_runtime_barrier\.sql/);
  db=f.read(restoredPath);assert.deepEqual(image(db),pending);f.close(db);
  db=f.open(restoredPath);integrity(db);
  assert.deepEqual(image(db),pending);
  assert.equal(db.prepare('SELECT state FROM vps_federation_operations').get().state,'PENDING_DENY');
  for(const session of sessions)assert.equal(readSession(db,cookie(session))===null,true);
  assert.throws(()=>readAccountSettings(db,{cookieHeader:cookie(sessions[0])}),{code:'unauthenticated'});
  assert.throws(()=>createSessionForUser(db,user.id),{code:'FEDERATION_COORDINATOR_REQUIRED'});
  assert.throws(()=>destroySession(db,cookie(sessions[0])),{code:'FEDERATION_COORDINATOR_REQUIRED'});
  assert.throws(()=>db.prepare("UPDATE profiles SET role='admin' WHERE id=?").run(user.id),/FEDERATION_COORDINATOR_REQUIRED/);
  assert.deepEqual(image(db),pending);
  f.close(db);
  db=f.open(restoredPath);
  for(const session of sessions)assert.equal(readSession(db,cookie(session))===null,true);
  assert.deepEqual(image(db),pending);f.close(db);
  db=f.read(path);assert.deepEqual(image(db),pending);f.close(db);
  t.diagnostic('FEDERATION_RESTORE '+JSON.stringify({backupSha256:saved.sha256,bytes:saved.bytes,state:'PENDING_DENY',
    oldRuntimeBarrier:'0018_federation_runtime_barrier.sql',restoredSessionsDenied:sessions.length,
    authority:'signed loopback HTTP fixture; not PostgreSQL or target-host acceptance',externalProviderCalls:0}));
});
