/** VPS-only authority metadata. No password, cookie, or link code is stored here. */
export const federationSchemaVersion = 1;
export function federationSchemaPending(db) {
  const installed = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vps_federation_schema'").get();
  return !installed || db.prepare('SELECT version FROM vps_federation_schema WHERE id=1').get()?.version !== federationSchemaVersion;
}

export function installFederationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_federation_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS vps_federation_authorities(
      authority_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,issuer TEXT NOT NULL,
      config_fingerprint TEXT NOT NULL,policy_version INTEGER NOT NULL,
      generation INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,
      phase TEXT NOT NULL CHECK(phase IN ('RECONCILING','ACTIVE')),
      instance_id TEXT NOT NULL,bootstrap_operation_id TEXT NOT NULL,
      snapshot_revision INTEGER,updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vps_federation_principals(
      authority_id TEXT NOT NULL REFERENCES vps_federation_authorities(authority_id),subject TEXT NOT NULL,
      epoch INTEGER NOT NULL,minimum_epoch INTEGER NOT NULL,security_fingerprint TEXT,
      source_policy_version INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL CHECK(state IN ('REGISTERING','ACTIVE','FENCED','RECOVERY_REQUIRED')),
      fence_operation_id TEXT,PRIMARY KEY(authority_id,subject)
    );
    CREATE TABLE IF NOT EXISTS vps_federation_sessions(
      authority_id TEXT NOT NULL REFERENCES vps_federation_authorities(authority_id),session_ref TEXT NOT NULL,
      subject TEXT NOT NULL,token_hash TEXT,epoch INTEGER,security_fingerprint TEXT,expires_at TEXT,
      state TEXT NOT NULL CHECK(state IN ('REGISTERING','ACTIVE','REVOKED')),version INTEGER NOT NULL DEFAULT 0,
      registration_operation_id TEXT,snapshot_generation INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(authority_id,session_ref)
    );
    CREATE INDEX IF NOT EXISTS vps_federation_sessions_subject ON vps_federation_sessions(subject,token_hash);
    CREATE TABLE IF NOT EXISTS vps_federation_operations(
      operation_id TEXT PRIMARY KEY,subject TEXT NOT NULL,kind TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('SESSION','PRINCIPAL')),session_hashes TEXT NOT NULL,excluded_hash TEXT,
      intent_hash TEXT NOT NULL,witness_json TEXT NOT NULL,pure_revocation INTEGER NOT NULL CHECK(pure_revocation IN (0,1)),
      state TEXT NOT NULL CHECK(state IN ('PENDING_DENY','FENCED','SOURCE_COMMITTED','COMPLETE','ABORTED_FENCED')),
      created_at INTEGER NOT NULL,authorization_expires_at INTEGER NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'PENDING',result_json TEXT
    );
    CREATE INDEX IF NOT EXISTS vps_federation_operations_subject ON vps_federation_operations(subject,state);
    CREATE TABLE IF NOT EXISTS vps_federation_fences(
      operation_id TEXT NOT NULL REFERENCES vps_federation_operations(operation_id),fence_index INTEGER NOT NULL,
      authority_id TEXT NOT NULL REFERENCES vps_federation_authorities(authority_id),
      wire_operation_id TEXT NOT NULL UNIQUE,payload_json TEXT NOT NULL,payload_digest TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('PENDING','ACKNOWLEDGED','ACTIVATION_PENDING','COMPLETE')),
      receipt_json TEXT,activation_operation_id TEXT,activation_payload_json TEXT,
      PRIMARY KEY(operation_id,authority_id,fence_index)
    );
    CREATE TABLE IF NOT EXISTS vps_federation_claims(
      authority_id TEXT NOT NULL REFERENCES vps_federation_authorities(authority_id),challenge_id TEXT NOT NULL,
      subject TEXT NOT NULL,session_ref TEXT NOT NULL,epoch INTEGER NOT NULL,security_fingerprint TEXT NOT NULL,
      generation INTEGER NOT NULL,reauth_at TEXT NOT NULL,expires_at TEXT NOT NULL,
      claim_operation_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('CLAIMING','CLAIMED')),
      PRIMARY KEY(authority_id,challenge_id)
    );
    CREATE TABLE IF NOT EXISTS vps_federation_nonces(authority_id TEXT NOT NULL,nonce_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,PRIMARY KEY(authority_id,nonce_hash));
    CREATE TABLE IF NOT EXISTS vps_federation_inbound_operations(authority_id TEXT NOT NULL,operation_id TEXT NOT NULL,
      digest TEXT NOT NULL,PRIMARY KEY(authority_id,operation_id));
    CREATE TABLE IF NOT EXISTS vps_federation_reauth(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,
      witness TEXT NOT NULL,checked_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    INSERT INTO vps_federation_schema(id,version) VALUES(1,${federationSchemaVersion})
      ON CONFLICT(id) DO UPDATE SET version=excluded.version;
  `);
  const protectedSubject=subject=>`(EXISTS(SELECT 1 FROM vps_federation_authorities WHERE phase<>'ACTIVE') OR
    EXISTS(SELECT 1 FROM vps_federation_principals WHERE subject=${subject}) OR
    EXISTS(SELECT 1 FROM vps_federation_sessions WHERE subject=${subject}) OR
    EXISTS(SELECT 1 FROM vps_federation_operations WHERE subject=${subject}
      AND state IN ('PENDING_DENY','FENCED','SOURCE_COMMITTED','ABORTED_FENCED')))`;
  const guard=(name,table,event,subject,kind,hash="''",condition='1')=>{
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${name} BEFORE ${event} ON ${table}
      WHEN (${condition}) AND (${protectedSubject(subject)} OR knaba_federation_permit_active()=1)
      AND knaba_federation_write_allowed(${subject},'${kind}',${hash})<>1
      BEGIN SELECT RAISE(ABORT,'FEDERATION_COORDINATOR_REQUIRED'); END;`);
  };
  guard('vps_federation_user_insert','vps_users','INSERT','NEW.id','PRINCIPAL');
  guard('vps_federation_user_security','vps_users','UPDATE OF email,salt,password_hash,disabled','OLD.id','PRINCIPAL');
  guard('vps_federation_user_identity','vps_users','UPDATE OF id','OLD.id','IDENTITY_UPDATE');
  guard('vps_federation_user_retarget','vps_users','UPDATE OF id','NEW.id','IDENTITY_UPDATE');
  guard('vps_federation_user_delete','vps_users','DELETE','OLD.id','PRINCIPAL');
  guard('vps_federation_profile_security','profiles','UPDATE OF email,role,status','OLD.id','PRINCIPAL');
  guard('vps_federation_profile_identity','profiles','UPDATE OF id','OLD.id','IDENTITY_UPDATE');
  guard('vps_federation_profile_retarget','profiles','UPDATE OF id','NEW.id','IDENTITY_UPDATE');
  guard('vps_federation_profile_delete','profiles','DELETE','OLD.id','PRINCIPAL');
  guard('vps_federation_profile_insert','profiles','INSERT','NEW.id','PRINCIPAL');
  guard('vps_federation_session_insert','vps_sessions','INSERT','NEW.user_id','SESSION_INSERT','NEW.token_hash');
  guard('vps_federation_session_delete','vps_sessions','DELETE','OLD.user_id','SESSION_DELETE','OLD.token_hash');
  // A session's identity, expiry, and principal are immutable once enrolled.
  guard('vps_federation_session_update','vps_sessions','UPDATE','OLD.user_id','IDENTITY_UPDATE','OLD.token_hash');
  guard('vps_federation_session_retarget','vps_sessions','UPDATE','NEW.user_id','IDENTITY_UPDATE','NEW.token_hash');
  for(const [table,column] of [['vps_staff_grants','user_id'],['vps_oidc_links','user_id']]){
    guard('vps_federation_'+table+'_insert',table,'INSERT','NEW.'+column,'PRINCIPAL');
    guard('vps_federation_'+table+'_update',table,'UPDATE','OLD.'+column,'PRINCIPAL');
    guard('vps_federation_'+table+'_delete',table,'DELETE','OLD.'+column,'PRINCIPAL');
    guard('vps_federation_'+table+'_retarget',table,'UPDATE OF '+column,'NEW.'+column,'IDENTITY_UPDATE',"''",'NEW.'+column+'<>OLD.'+column);
    guard('vps_federation_'+table+'_identity',table,'UPDATE OF '+column,'OLD.'+column,'IDENTITY_UPDATE',"''",'NEW.'+column+'<>OLD.'+column);
  }
}
