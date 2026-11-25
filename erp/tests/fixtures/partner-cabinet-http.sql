-- A disposable schema containing only the columns used by these HTTP tests.
-- The tests populate identity, link, grant and order rows through the application or synthetic fixtures.
CREATE TABLE aggregates (
  company_id text, kind text, id text, version integer DEFAULT 1, data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  PRIMARY KEY(company_id,kind,id)
);
CREATE TABLE auth_credentials (
  company_id text, user_id text, password_hash text, totp_secret text, totp_last_counter bigint DEFAULT -1,
  PRIMARY KEY(company_id,user_id)
);
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY, user_id text, company_id text, expires_at timestamptz,
  mfa_verified boolean, revoked_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE site_auth_sessions (company_id text, user_id text, binding_id uuid, revoked_at timestamptz);
CREATE TABLE site_identity_bindings (
  company_id text, id uuid, issuer text, audience text, subject text, site_user_id text, user_id text,
  trust_version integer, trust_fingerprint text, proof_reference text, status text DEFAULT 'ACTIVE',
  version integer DEFAULT 1, created_by text, revoked_by text, revoked_at timestamptz, created_at timestamptz DEFAULT now(),
  expires_at timestamptz, generation integer DEFAULT 1, predecessor_id uuid,
  f2_challenge_id uuid, PRIMARY KEY(company_id,id)
);
CREATE TABLE site_identity_challenges (
  company_id text, id uuid, binding_id uuid, user_id text, site_subject text, issuer text, audience text,
  trust_fingerprint text, transport_fingerprint text, proof_reference text, status text DEFAULT 'OPEN', site_session_digest text, session_hash text, security_fingerprint text, mfa_verified boolean,
  secret_hash text, challenge_digest text, nonce_digest text, created_at timestamptz, expires_at timestamptz,
  site_expires_at timestamptz, grant_digest text, site_display_name text, site_email text, completed_at timestamptz,
  site_profile_version integer, site_profile_fingerprint text, PRIMARY KEY(company_id,id)
);
CREATE TABLE command_receipts (
  company_id text, actor_id text, idempotency_key text, command text, input_hash text, result jsonb,
  authorization_hash text, created_at timestamptz DEFAULT now(), PRIMARY KEY(company_id,actor_id,idempotency_key)
);
CREATE TABLE aggregate_revisions (
  company_id text, kind text, id text, version integer, data jsonb, actor_id text,
  PRIMARY KEY(company_id,kind,id,version)
);
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, company_id text, actor_id text, action text, aggregate_kind text, aggregate_id text, detail jsonb
);
CREATE TABLE outbox (id text PRIMARY KEY, company_id text, type text, data jsonb);
