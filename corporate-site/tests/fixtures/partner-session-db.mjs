import {DatabaseSync} from 'node:sqlite';
import {createSiteConsentAuthority} from '../../vps/site-identity-consent.mjs';

// Only the four existing tables read by session introspection. No migration
// runner or pre-existing site database is involved in these contract tests.
export function sessionDatabase(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE vps_users (id TEXT PRIMARY KEY, email TEXT, salt TEXT, password_hash TEXT,
      created_at TEXT, disabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT, email TEXT, requested_role TEXT,
      role TEXT, status TEXT, privacy_version TEXT, created_at TEXT, updated_at TEXT,
      version INTEGER, last_mutation TEXT);
    CREATE TABLE vps_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, created_at INTEGER, expires_at INTEGER);
    CREATE TABLE vps_staff_grants (user_id TEXT PRIMARY KEY, purpose TEXT);`);
  return db;
}

export function sessionAuthority(db,peer,options={}){
  return createSiteConsentAuthority(db,{config:()=>peer,...options});
}
