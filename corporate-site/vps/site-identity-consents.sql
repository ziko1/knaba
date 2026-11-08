-- VPS-only F2 grant storage. Apply through the reviewed auth migration gate.
CREATE TABLE IF NOT EXISTS vps_site_identity_consents (
 id TEXT PRIMARY KEY NOT NULL,
 challenge_id TEXT NOT NULL,
 challenge_digest TEXT NOT NULL CHECK(length(challenge_digest)=64),
 nonce_digest TEXT NOT NULL CHECK(length(nonce_digest)=64),
 company_id TEXT NOT NULL,
 target_user_id TEXT NOT NULL,
 issuer TEXT NOT NULL,
 audience TEXT NOT NULL,
 trust_fingerprint TEXT NOT NULL CHECK(length(trust_fingerprint)=64),
 transport_fingerprint TEXT NOT NULL CHECK(length(transport_fingerprint)=64),
 site_user_id TEXT NOT NULL REFERENCES vps_users(id),
 session_hash TEXT NOT NULL CHECK(length(session_hash)=64),
 profile_version INTEGER NOT NULL CHECK(profile_version>=0),
 profile_fingerprint TEXT NOT NULL CHECK(length(profile_fingerprint)=64),
 grant_hash TEXT NOT NULL CHECK(length(grant_hash)=64),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at-created_at<=300000),
 status TEXT NOT NULL DEFAULT 'CONSENTED' CHECK(status IN ('CONSENTED','REDEEMED')),
 redeemed_fingerprint TEXT,
 redeemed_at INTEGER,
 UNIQUE(company_id,challenge_id),
 CHECK((status='CONSENTED' AND redeemed_fingerprint IS NULL AND redeemed_at IS NULL) OR
       (status='REDEEMED' AND redeemed_fingerprint IS NOT NULL AND redeemed_at IS NOT NULL AND
        length(redeemed_fingerprint)=64 AND redeemed_at>=created_at AND redeemed_at<expires_at))
);
CREATE INDEX IF NOT EXISTS vps_site_identity_consents_expiry ON vps_site_identity_consents(expires_at);
CREATE TRIGGER IF NOT EXISTS vps_site_identity_consents_update_guard BEFORE UPDATE ON vps_site_identity_consents
WHEN OLD.status<>'CONSENTED' OR NEW.status<>'REDEEMED' OR
 NEW.id IS NOT OLD.id OR NEW.challenge_id IS NOT OLD.challenge_id OR NEW.challenge_digest IS NOT OLD.challenge_digest OR
 NEW.nonce_digest IS NOT OLD.nonce_digest OR NEW.company_id IS NOT OLD.company_id OR NEW.target_user_id IS NOT OLD.target_user_id OR
 NEW.issuer IS NOT OLD.issuer OR NEW.audience IS NOT OLD.audience OR NEW.trust_fingerprint IS NOT OLD.trust_fingerprint OR
 NEW.transport_fingerprint IS NOT OLD.transport_fingerprint OR NEW.site_user_id IS NOT OLD.site_user_id OR
 NEW.session_hash IS NOT OLD.session_hash OR NEW.profile_version IS NOT OLD.profile_version OR NEW.profile_fingerprint IS NOT OLD.profile_fingerprint OR
 NEW.grant_hash IS NOT OLD.grant_hash OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT,'SITE_IDENTITY_CONSENT_IMMUTABLE'); END;
