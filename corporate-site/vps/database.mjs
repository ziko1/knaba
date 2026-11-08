import { DatabaseSync } from 'node:sqlite';
import { inspectMigrationSequence } from './migration-guard.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/** A synchronous durable D1 subset; batches never yield across BEGIN and COMMIT. */
const bindable=x=>x===undefined?null:typeof x==='boolean'?(x?1:0):x;
class Statement {
  #db;#sql;#values=[];
  constructor(db,sql){this.#db=db;this.#sql=sql;}
  bind(...values){const result=new Statement(this.#db,this.#sql);result.#values=values.map(bindable);return result;}
  first(column){
    return Promise.resolve(this.firstSync(column));
  }
  firstSync(column){
    const row=this.#db.prepare(this.#sql).get(...this.#values)||null;
    return row && column!==undefined ? row[column]??null:row;
  }
  all(){return Promise.resolve(this.allSync());}
  allSync(){return {success:true,results:this.#db.prepare(this.#sql).all(...this.#values)};}
  run(){return Promise.resolve(this.runSync());}
  runSync(){
    const r=this.#db.prepare(this.#sql).run(...this.#values);
    return {success:true,meta:{changes:Number(r.changes)}};
  }
}
export class LocalD1 {
  #db;
  constructor(db){this.#db=db;}
  prepare(sql){return new Statement(this.#db,sql);}
  batch(statements){
    return this.authorizedBatch(statements,()=>true);
  }
  /** Request-local capability. Every operation, including INSERT ... RETURNING,
   * rechecks the current session under the same locks as its data access. */
  withAuthorization(authorize,authorityDb=this.#db){
    const requireCurrent=()=>{
      if(authorize()!==true){const error=new Error('Current session required');error.code='session_revoked';throw error;}
      return true;
    };
    const sources=new WeakMap();
    const wrap=source=>{
      const statement={
        bind:(...values)=>wrap(source.bind(...values)),
        first:column=>this.#withAuthority(()=>source.firstSync(column),requireCurrent,authorityDb),
        all:()=>this.#withAuthority(()=>source.allSync(),requireCurrent,authorityDb),
        run:()=>this.#withAuthority(()=>source.runSync(),requireCurrent,authorityDb)
      };
      sources.set(statement,source);return statement;
    };
    const unwrap=statements=>statements.map(statement=>{
      const source=sources.get(statement);if(!source)throw Error('Invalid scoped SQL statement owner.');return source;
    });
    return {
      prepare:sql=>wrap(this.prepare(sql)),
      batch:statements=>this.authorizedBatch(unwrap(statements),requireCurrent,authorityDb),
      // Preserve Studio's additional owner-publication guard and null denial contract.
      authorizedBatch:(statements,extraAuthorize)=>this.authorizedBatch(unwrap(statements),()=>extraAuthorize()===true&&requireCurrent(),authorityDb)
    };
  }
  /** The guard and writes are synchronous; an external authority DB stays
   * locked through the isolated workspace commit, preventing mid-write revoke. */
  authorizedBatch(statements,authorize,authorityDb=this.#db){
    return this.#withAuthority(()=>statements.map(stmt=>{
      if(!(stmt instanceof Statement))throw Error('Invalid SQL statement owner.');
      return stmt.runSync();
    }),authorize,authorityDb);
  }
  #withAuthority(operation,authorize,authorityDb){
    const external=authorityDb!==this.#db;
    if(external)authorityDb.exec('BEGIN IMMEDIATE');
    try{return this.#authorizedOperation(operation,authorize);}
    finally{if(external)authorityDb.exec('ROLLBACK');}
  }
  #authorizedOperation(operation,authorize){
    this.#db.exec('BEGIN IMMEDIATE');
    try{
      if(authorize()!==true){this.#db.exec('ROLLBACK');return Promise.resolve(null);}
      const out=operation();
      this.#db.exec('COMMIT');
      return Promise.resolve(out);
    }catch(error){this.#db.exec('ROLLBACK');return Promise.reject(error);}
  }
}
/** Refuses drifted migrations, never rewrites historical tables. */
export function openLocalDatabase(path,{migrationDirectory=new URL('../drizzle/',import.meta.url),allowMigrations=true}={}){
  if(!path?.startsWith('/'))throw Error('Persistent SQLite requires an absolute mounted path');
  const location=migrationDirectory instanceof URL?fileURLToPath(migrationDirectory):migrationDirectory;
  // Validate the full SQL+Drizzle sequence before opening or creating a database.
  const {names}=inspectMigrationSequence(location);
  // Read and fingerprint every source before opening SQLite. Existing receipts
  // are validated as a whole before any pending SQL or metadata write.
  const source=new Map(names.map(name=>{
    const sql=readFileSync(join(location,name),'utf8');
    return [name,{sql,digest:createHash('sha256').update(sql).digest('hex')}];
  }));
  const consentSql=readFileSync(new URL('./site-identity-consents.sql',import.meta.url),'utf8');
  const consentDigest=createHash('sha256').update(consentSql).digest('hex');
  const recoverySql=readFileSync(new URL('./account-recovery.sql',import.meta.url),'utf8');
  const recoveryDigest=createHash('sha256').update(recoverySql).digest('hex');
  const authSource=new Map([
    ['001_site_identity_consents',{sql:consentSql,digest:consentDigest,label:'site-identity-consents'}],
    ['002_account_recovery',{sql:recoverySql,digest:recoveryDigest,label:'account-recovery'}]
  ]);
  const recoveryObjects=[['table','vps_account_tokens'],['index','vps_account_tokens_user'],['index','vps_account_tokens_expiry'],
    ['trigger','vps_account_tokens_user_revoke'],['trigger','vps_account_tokens_profile_revoke'],['trigger','vps_account_tokens_profile_delete']];
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path);
  try {
    const hasLedger=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vps_schema_migrations'").get();
    const applied=hasLedger?db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all():[];
    const installed=new Set();
    for(const row of applied){
      const expected=source.get(row.filename);
      if(!expected)throw Error('Unrecognized applied migration: '+row.filename+'; reviewed reconciliation required.');
      if(expected.digest!==row.sha256)throw Error('Migration checksum changed: '+row.filename);
      installed.add(row.filename);
    }
    const pending=names.filter(name=>!installed.has(name));
    if(pending.length&&!allowMigrations)
      throw Error('Pending schema migration '+pending[0]+'; run reviewed migrate CLI after backup.');
    const oidcColumns=db.prepare('PRAGMA table_info(vps_oidc_states)').all();
    const pendingOidcBinding=oidcColumns.length>0&&!oidcColumns.some(column=>column.name==='link_session_hash');
    if(pendingOidcBinding&&!allowMigrations)
      throw Error('Pending VPS auth migration oidc-link-session; run reviewed migrate CLI after backup.');
    const hasAuthLedger=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vps_auth_migrations'").get();
    const authApplied=hasAuthLedger?db.prepare('SELECT name,sha256 FROM vps_auth_migrations ORDER BY name').all():[];
    for(const row of authApplied){
      const expected=authSource.get(row.name);
      if(!expected)throw Error('Unrecognized VPS auth migration; reviewed reconciliation required.');
      if(row.sha256!==expected.digest)throw Error('VPS auth migration checksum changed: '+row.name);
    }
    const authInstalled=new Set(authApplied.map(row=>row.name));
    if(authInstalled.has('002_account_recovery')&&!authInstalled.has('001_site_identity_consents'))
      throw Error('Incomplete VPS auth migration sequence; reviewed reconciliation required.');
    if(!authInstalled.has('001_site_identity_consents')&&db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vps_site_identity_consents'").get())
      throw Error('Unrecorded VPS site identity schema; reviewed reconciliation required.');
    if(!authInstalled.has('002_account_recovery')&&recoveryObjects.some(([type,name])=>db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get(type,name)))
      throw Error('Unrecorded VPS account recovery schema; reviewed reconciliation required.');
    const pendingAuth=[...authSource.keys()].filter(name=>!authInstalled.has(name));
    if(pendingAuth.length&&!allowMigrations)
      throw Error('Pending VPS auth migration '+authSource.get(pendingAuth[0]).label+'; run reviewed migrate CLI after backup.');
    const validateAuthObjects=name=>{
      // A receipt without its runtime objects is corruption, not permission to
      // recreate a dropped identity or recovery ledger during service startup.
      if(name==='001_site_identity_consents'){
        db.prepare('SELECT id,grant_hash,session_hash,redeemed_fingerprint FROM vps_site_identity_consents LIMIT 0').all();
        if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='vps_site_identity_consents_update_guard'").get())
          throw Error('Missing VPS site identity consent guard; reviewed recovery required.');
      }else{
        for(const [type,object] of recoveryObjects){
          if(!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get(type,object))
            throw Error('Missing VPS account recovery object '+object+'; reviewed recovery required.');
        }
        db.prepare('SELECT token_hash,kind,user_id,previous_email,target_email,credential_hash,session_hash,issued_at,expires_at,delivery_state FROM vps_account_tokens LIMIT 0').all();
      }
    };
    for(const name of authInstalled)validateAuthObjects(name);
    db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA busy_timeout=5000;');
    db.exec('CREATE TABLE IF NOT EXISTS vps_schema_migrations (filename TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL, installed_at TEXT NOT NULL)');
    for(const name of pending){
      const {sql,digest}=source.get(name);
      db.exec('BEGIN IMMEDIATE');
      try {
        // A second process may have finished this step while we waited for the
        // SQLite write lock. Recheck inside the transaction; never replay it.
        const prior=db.prepare('SELECT sha256 FROM vps_schema_migrations WHERE filename=?').get(name);
        if(prior){
          if(prior.sha256!==digest)throw Error('Migration checksum changed: '+name);
        }else{
          db.exec(sql.replaceAll('--> statement-breakpoint','\n'));
          db.prepare('INSERT INTO vps_schema_migrations VALUES (?,?,?)').run(name,digest,new Date().toISOString());
        }
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
  db.exec([
    'CREATE TABLE IF NOT EXISTS vps_users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS vps_sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
    'CREATE INDEX IF NOT EXISTS vps_sessions_expiry ON vps_sessions(expires_at)',
    'CREATE TABLE IF NOT EXISTS vps_login_limits (key TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
    // Trusted VPS-only grant; never sourced from browser, D1 profile or OAuth email.
    "CREATE TABLE IF NOT EXISTS vps_staff_grants (user_id TEXT PRIMARY KEY NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE, email TEXT NOT NULL COLLATE NOCASE, purpose TEXT NOT NULL CHECK (purpose='developer'), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)), enrolled_at TEXT NOT NULL)"
,
    "CREATE TABLE IF NOT EXISTS vps_oidc_states (state_hash TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL, intent TEXT NOT NULL CHECK (intent IN ('client','partner')), link_user_id TEXT REFERENCES vps_users(id), issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, link_session_hash TEXT REFERENCES vps_sessions(token_hash) ON DELETE CASCADE)",
    "CREATE TABLE IF NOT EXISTS vps_oidc_links (issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE, linked_at TEXT NOT NULL, PRIMARY KEY(issuer,subject), UNIQUE(user_id,issuer))"
  ].join(';')+';');
    if(pendingOidcBinding){
      db.exec('BEGIN IMMEDIATE');
      try{
        // Another local process may have upgraded while this one awaited the lock.
        if(!db.prepare('PRAGMA table_info(vps_oidc_states)').all().some(column=>column.name==='link_session_hash'))
          db.exec('ALTER TABLE vps_oidc_states ADD COLUMN link_session_hash TEXT REFERENCES vps_sessions(token_hash) ON DELETE CASCADE');
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec('CREATE TABLE IF NOT EXISTS vps_auth_migrations (name TEXT PRIMARY KEY NOT NULL,sha256 TEXT NOT NULL,installed_at TEXT NOT NULL)');
      for(const [name,{sql,digest}] of authSource){
        const prior=db.prepare('SELECT sha256 FROM vps_auth_migrations WHERE name=?').get(name);
        if(prior){if(prior.sha256!==digest)throw Error('VPS auth migration checksum changed: '+name);}
        else{
          db.exec(sql);
          db.prepare('INSERT INTO vps_auth_migrations VALUES (?,?,?)').run(name,digest,new Date().toISOString());
        }
        validateAuthObjects(name);
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return {db,d1:new LocalD1(db),migrations:names};
  }catch(error){
    db.close();
    throw error;
  }
}
