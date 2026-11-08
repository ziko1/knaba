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
    const accountTables=['vps_account_settings','vps_account_tokens'];
    const accountTriggers=['vps_account_tokens_user_revoke','vps_account_tokens_profile_revoke'];
    const pendingAccountSettings=accountTables.some(name=>
      !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))||
      accountTriggers.some(name=>!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name));
    if(pendingAccountSettings&&!allowMigrations)
      throw Error('Pending VPS auth migration account-settings; run reviewed migrate CLI after backup.');
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
    // VPS credentials and preferences never enter hosted Sites/D1. This additive
    // auth schema is created only behind the same explicit migration gate.
    if(pendingAccountSettings){
      db.exec('BEGIN IMMEDIATE');
      try{
        db.exec([
          "CREATE TABLE IF NOT EXISTS vps_account_settings (user_id TEXT PRIMARY KEY NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', locale TEXT NOT NULL DEFAULT 'de' CHECK(locale IN ('de','en','pl','lt','ru','uk')), time_zone TEXT NOT NULL DEFAULT 'Europe/Berlin', version INTEGER NOT NULL CHECK(version>=1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
          "CREATE TABLE IF NOT EXISTS vps_account_tokens (token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64), kind TEXT NOT NULL CHECK(kind IN ('password_reset','email_change')), user_id TEXT NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE, previous_email TEXT NOT NULL COLLATE NOCASE, target_email TEXT NOT NULL COLLATE NOCASE, credential_hash TEXT NOT NULL CHECK(length(credential_hash)=64), session_hash TEXT REFERENCES vps_sessions(token_hash) ON DELETE CASCADE, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>issued_at AND expires_at<=issued_at+1800), delivery_state TEXT NOT NULL CHECK(delivery_state IN ('pending','sending','accepted','unknown')), CHECK((kind='password_reset' AND session_hash IS NULL) OR (kind='email_change' AND session_hash IS NOT NULL)))",
          'CREATE INDEX IF NOT EXISTS vps_account_tokens_user ON vps_account_tokens(user_id,kind)',
          'CREATE INDEX IF NOT EXISTS vps_account_tokens_expiry ON vps_account_tokens(expires_at)',
          "CREATE TRIGGER IF NOT EXISTS vps_account_tokens_user_revoke AFTER UPDATE OF email,salt,password_hash,disabled ON vps_users WHEN NEW.email IS NOT OLD.email OR NEW.salt IS NOT OLD.salt OR NEW.password_hash IS NOT OLD.password_hash OR NEW.disabled IS NOT OLD.disabled BEGIN DELETE FROM vps_account_tokens WHERE user_id=OLD.id; END",
          "CREATE TRIGGER IF NOT EXISTS vps_account_tokens_profile_revoke AFTER UPDATE OF email,role,status ON profiles WHEN NEW.email IS NOT OLD.email OR NEW.role IS NOT OLD.role OR NEW.status IS NOT OLD.status BEGIN DELETE FROM vps_account_tokens WHERE user_id=OLD.id; END"
        ].join(';')+';');
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
    if(pendingOidcBinding){
      db.exec('BEGIN IMMEDIATE');
      try{
        // Another local process may have upgraded while this one awaited the lock.
        if(!db.prepare('PRAGMA table_info(vps_oidc_states)').all().some(column=>column.name==='link_session_hash'))
          db.exec('ALTER TABLE vps_oidc_states ADD COLUMN link_session_hash TEXT REFERENCES vps_sessions(token_hash) ON DELETE CASCADE');
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
    return {db,d1:new LocalD1(db),migrations:names};
  }catch(error){
    db.close();
    throw error;
  }
}
