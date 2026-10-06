CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS aggregates (company_id text NOT NULL, kind text NOT NULL, id text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0), data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,kind,id));
CREATE INDEX IF NOT EXISTS aggregates_company_kind ON aggregates(company_id,kind);
CREATE INDEX IF NOT EXISTS aggregates_scope ON aggregates(company_id,(data->>'siteId'));
CREATE INDEX IF NOT EXISTS aggregates_user_scope ON aggregates(company_id,(data->>'employeeId'));
CREATE TABLE IF NOT EXISTS aggregate_revisions (company_id text NOT NULL, kind text NOT NULL, id text NOT NULL, version integer NOT NULL, data jsonb NOT NULL, actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,kind,id,version));
CREATE TABLE IF NOT EXISTS command_receipts (company_id text NOT NULL, actor_id text NOT NULL, idempotency_key text NOT NULL, command text NOT NULL, input_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,actor_id,idempotency_key));
CREATE TABLE IF NOT EXISTS audit_log (id bigserial PRIMARY KEY, company_id text NOT NULL, actor_id text NOT NULL, action text NOT NULL, aggregate_kind text, aggregate_id text, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS audit_company ON audit_log(company_id,id);
CREATE TABLE IF NOT EXISTS outbox (id text PRIMARY KEY,company_id text NOT NULL,type text NOT NULL,data jsonb NOT NULL,status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','RUNNING','SUCCEEDED','RETRY_SCHEDULED','FAILED','CANCELLED')),attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),leased_until timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(status,available_at);
CREATE TABLE IF NOT EXISTS webhook_inbox (provider text NOT NULL,event_id text NOT NULL,company_id text NOT NULL,payload jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_id));
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY,company_id text NOT NULL,user_id text NOT NULL,mfa_verified boolean NOT NULL,csrf_hash text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(company_id,user_id);
CREATE TABLE IF NOT EXISTS private_blobs (company_id text NOT NULL,key text NOT NULL,content bytea NOT NULL,sha256 text NOT NULL,mime_type text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_id,key));
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY,count integer NOT NULL,window_start timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION deny_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable business history'; END $$;
DROP TRIGGER IF EXISTS audit_immutable ON audit_log;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION deny_immutable_change();
DROP TRIGGER IF EXISTS revisions_immutable ON aggregate_revisions;
CREATE TRIGGER revisions_immutable BEFORE UPDATE OR DELETE ON aggregate_revisions FOR EACH ROW EXECUTE FUNCTION deny_immutable_change();
INSERT INTO schema_migrations(version) VALUES ('001_init') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS auth_credentials (company_id text NOT NULL,user_id text NOT NULL,password_hash text NOT NULL,totp_secret text,totp_last_counter bigint NOT NULL DEFAULT -1,PRIMARY KEY(company_id,user_id));
CREATE TABLE IF NOT EXISTS auth_sessions (token_hash text PRIMARY KEY,user_id text NOT NULL,company_id text NOT NULL,expires_at timestamptz NOT NULL,mfa_verified boolean NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(company_id,user_id);
CREATE TABLE IF NOT EXISTS media_blobs (id text PRIMARY KEY,company_id text NOT NULL,owner_id text NOT NULL,bytes bytea NOT NULL,mime_type text NOT NULL,sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth_credentials(user_id text NOT NULL,company_id text NOT NULL,password_hash text NOT NULL,totp_secret text,totp_last_counter bigint NOT NULL DEFAULT -1,PRIMARY KEY(company_id,user_id));
CREATE TABLE IF NOT EXISTS auth_sessions(token_hash text PRIMARY KEY,user_id text NOT NULL,company_id text NOT NULL,expires_at timestamptz NOT NULL,mfa_verified boolean NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS media_blobs(id text PRIMARY KEY,company_id text NOT NULL,owner_id text NOT NULL,bytes bytea NOT NULL,mime_type text NOT NULL,sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE command_receipts ADD COLUMN IF NOT EXISTS authorization_hash text NOT NULL DEFAULT '';

ALTER TABLE outbox ADD COLUMN IF NOT EXISTS lease_token text;

-- Exact coordinates are transient. Immutable business history keeps metadata only.
CREATE TABLE IF NOT EXISTS gps_points (
 company_id text NOT NULL,id text NOT NULL,kind text NOT NULL DEFAULT 'location_sample' CHECK(kind='location_sample'),employee_id text NOT NULL,
 site_ids text[] NOT NULL,latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy_m double precision NOT NULL CHECK(accuracy_m>0 AND accuracy_m<=100000),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 PRIMARY KEY(company_id,id),
 FOREIGN KEY(company_id,kind,id) REFERENCES aggregates(company_id,kind,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS gps_points_expiry ON gps_points(company_id,expires_at,id);
CREATE OR REPLACE FUNCTION knaba_safe_timestamp(value text) RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE parsed timestamptz;
BEGIN
 parsed:=value::timestamptz;
 IF NOT isfinite(parsed) THEN RETURN NULL; END IF;
 RETURN parsed;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION knaba_assert_gps_storage_safe(p_company text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM aggregates WHERE kind='location_sample' AND (p_company IS NULL OR company_id=p_company) AND (jsonb_path_exists(data,'$.**.latitude') OR jsonb_path_exists(data,'$.**.longitude')))
 OR EXISTS(SELECT 1 FROM aggregate_revisions WHERE kind='location_sample' AND (p_company IS NULL OR company_id=p_company) AND (jsonb_path_exists(data,'$.**.latitude') OR jsonb_path_exists(data,'$.**.longitude')))
 OR EXISTS(SELECT 1 FROM command_receipts WHERE command='trip.sample' AND (p_company IS NULL OR company_id=p_company) AND (jsonb_path_exists(result,'$.**.latitude') OR jsonb_path_exists(result,'$.**.longitude')))
 THEN RAISE EXCEPTION 'GPS_LEGACY_RAW_COPY_REQUIRES_APPROVED_MIGRATION'; END IF;
END $$;
CREATE OR REPLACE FUNCTION knaba_purge_gps(p_now timestamptz DEFAULT now(),p_limit integer DEFAULT 500,p_company text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE tenant text; deleted_count integer; total integer:=0; hold_decision_at timestamptz;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>5000 OR p_now IS NULL OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'INVALID_GPS_PURGE_BOUND'; END IF;
 FOR tenant IN SELECT DISTINCT company_id FROM gps_points WHERE expires_at<=p_now AND (p_company IS NULL OR company_id=p_company) ORDER BY company_id LOOP
  -- Legal-hold commands use the same company lock. Their committed scope is read fresh.
  PERFORM pg_advisory_xact_lock(hashtext(tenant));
  hold_decision_at:=clock_timestamp();
  WITH eligible AS (
   SELECT p.company_id,p.id FROM gps_points p
   WHERE p.company_id=tenant AND p.expires_at<=p_now AND NOT EXISTS(
    SELECT 1 FROM aggregates h WHERE h.company_id=p.company_id AND h.kind='legal_hold'
    AND h.data->>'subjectUserId'=p.employee_id AND h.data->>'state'='ACTIVE'
    AND jsonb_typeof(h.data->'categories')='array' AND (h.data->'categories') @> '["GPS"]'::jsonb
    AND knaba_safe_timestamp(h.data->>'expiresAt')>hold_decision_at
    AND knaba_safe_timestamp(h.data->>'createdAt')<=hold_decision_at
    AND knaba_safe_timestamp(h.data->>'expiresAt')<=knaba_safe_timestamp(h.data->>'createdAt')+interval '365 days'
   ) ORDER BY p.expires_at,p.id FOR UPDATE OF p SKIP LOCKED LIMIT (p_limit-total)
  ), removed AS (DELETE FROM gps_points p USING eligible e WHERE p.company_id=e.company_id AND p.id=e.id RETURNING p.id)
  SELECT count(*)::integer INTO deleted_count FROM removed;
  IF deleted_count>0 THEN
   INSERT INTO audit_log(company_id,actor_id,action,detail) VALUES(tenant,'GPS_RETENTION','GPS_RAW_POINTS_PURGED',jsonb_build_object('count',deleted_count,'boundary',p_now,'policy','PER_POINT_APPROVED_EXPIRY','coordinatesRetained',false));
  END IF;
  total:=total+deleted_count;
  EXIT WHEN total>=p_limit;
 END LOOP;
 RETURN total;
END $$;
INSERT INTO schema_migrations(version) VALUES ('002_gps_transient_retention') ON CONFLICT DO NOTHING;
