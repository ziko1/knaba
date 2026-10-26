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
    const row=this.#db.prepare(this.#sql).get(...this.#values)||null;
    return Promise.resolve(row && column!==undefined ? row[column]??null:row);
  }
  all(){return Promise.resolve({success:true,results:this.#db.prepare(this.#sql).all(...this.#values)});}
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
    this.#db.exec('BEGIN IMMEDIATE');
    try{
      const out=statements.map(stmt=>{
        if(!(stmt instanceof Statement))throw Error('Invalid SQL statement owner.');
        return stmt.runSync();
      });
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
    'CREATE TABLE IF NOT EXISTS vps_login_limits (key TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)'
  ].join(';')+';');
    return {db,d1:new LocalD1(db),migrations:names};
  }catch(error){
    db.close();
    throw error;
  }
}
