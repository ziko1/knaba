/** F3 source approvals contain only immutable correlation and authority metadata.
 * They deliberately outlive their use window: retention must not erase an
 * unacknowledged approval or reuse a request/operation identity. */
export const federationLoginSchemaVersion=1;
export function federationLoginSchemaPending(db){
  const installed=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vps_federation_login_schema'").get();
  return !installed||db.prepare('SELECT version FROM vps_federation_login_schema WHERE id=1').get()?.version!==federationLoginSchemaVersion;
}
export function installFederationLoginSchema(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_federation_login_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS vps_federation_login_approvals(
      authority_id TEXT NOT NULL REFERENCES vps_federation_authorities(authority_id),request_id TEXT NOT NULL,
      request_binding TEXT NOT NULL,subject TEXT NOT NULL,session_ref TEXT NOT NULL,
      epoch INTEGER NOT NULL,security_fingerprint TEXT NOT NULL,source_policy_version INTEGER NOT NULL,
      generation INTEGER NOT NULL,witness TEXT NOT NULL,reauth_at TEXT NOT NULL,
      pending_expires_at TEXT NOT NULL,issue_expires_at TEXT NOT NULL,use_expires_at TEXT NOT NULL,
      login_policy_version INTEGER NOT NULL,login_policy_fingerprint TEXT NOT NULL,source_login_policy_fingerprint TEXT NOT NULL,
      operation_id TEXT NOT NULL UNIQUE,payload_json TEXT NOT NULL,payload_digest TEXT NOT NULL,
      return_url TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('CLAIMING','APPROVED','DENIED')),
      remote_version INTEGER NOT NULL,created_at INTEGER NOT NULL,
      PRIMARY KEY(authority_id,request_id)
    );
    CREATE INDEX IF NOT EXISTS vps_federation_login_subject ON vps_federation_login_approvals(subject,session_ref);
    CREATE TRIGGER IF NOT EXISTS vps_federation_login_immutable BEFORE UPDATE OF
      authority_id,request_id,request_binding,subject,session_ref,epoch,security_fingerprint,source_policy_version,
      generation,witness,reauth_at,pending_expires_at,issue_expires_at,use_expires_at,login_policy_version,login_policy_fingerprint,
      source_login_policy_fingerprint,operation_id,payload_json,payload_digest,return_url,created_at
      ON vps_federation_login_approvals BEGIN SELECT RAISE(ABORT,'FEDERATION_LOGIN_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS vps_federation_login_monotonic BEFORE UPDATE OF state,remote_version
      ON vps_federation_login_approvals WHEN NEW.remote_version<OLD.remote_version OR
      (OLD.state='DENIED' AND NEW.state<>'DENIED') OR (OLD.state='APPROVED' AND NEW.state='CLAIMING')
      BEGIN SELECT RAISE(ABORT,'FEDERATION_LOGIN_CONFLICT'); END;
    INSERT INTO vps_federation_login_schema(id,version) VALUES(1,${federationLoginSchemaVersion})
      ON CONFLICT(id) DO UPDATE SET version=excluded.version;
  `);
}
