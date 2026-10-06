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

-- Explicit privacy-only historical redaction; audit history stays immutable.
-- Permits contain exact pre/post images only inside their originating transaction.
CREATE TABLE IF NOT EXISTS privacy_revision_permits (
 token uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id bigint NOT NULL,db_user text NOT NULL,
 company_id text NOT NULL,request_id text NOT NULL,plan_hash text NOT NULL,
 kind text NOT NULL,id text NOT NULL,version integer NOT NULL,old_data jsonb NOT NULL,new_data jsonb NOT NULL,
 UNIQUE(transaction_id,company_id,kind,id,version)
);
CREATE TABLE IF NOT EXISTS privacy_erasure_manifests (
 company_id text NOT NULL,request_id text NOT NULL,plan_hash text NOT NULL,
 manifest jsonb NOT NULL,manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(company_id,request_id,plan_hash)
);
CREATE TABLE IF NOT EXISTS privacy_blob_deletions (
 id text PRIMARY KEY,company_id text NOT NULL,request_id text NOT NULL,plan_hash text NOT NULL,
 blob_key text NOT NULL,expected_sha256 text NOT NULL CHECK(expected_sha256 ~ '^[a-f0-9]{64}$'),subject_user_id text NOT NULL,
 provider_identity text NOT NULL CHECK(provider_identity ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN('PENDING','VERIFIED_NOT_FOUND')),attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),verified_at timestamptz,
 UNIQUE(company_id,request_id,plan_hash,blob_key)
);
CREATE INDEX IF NOT EXISTS privacy_blob_deletion_pending ON privacy_blob_deletions(company_id,status);
ALTER TABLE privacy_blob_deletions ADD COLUMN IF NOT EXISTS provider_identity text;
DROP TRIGGER IF EXISTS privacy_manifest_immutable ON privacy_erasure_manifests;
CREATE TRIGGER privacy_manifest_immutable BEFORE UPDATE OR DELETE ON privacy_erasure_manifests FOR EACH ROW EXECUTE FUNCTION deny_immutable_change();

CREATE OR REPLACE FUNCTION knaba_validate_privacy_revision(
 p_company text,p_request text,p_plan text,p_kind text,p_id text,p_version integer,p_old jsonb,p_new jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE approved_plan jsonb;request_data jsonb;executor_id text;
BEGIN
 IF p_company IS NULL OR p_request IS NULL OR p_plan IS NULL OR p_old IS NULL OR p_new IS NULL
 OR p_kind NOT IN('message','media_asset','media_upload','message_version','message_copy_preview','translation','translation_request','delivery','callback','channel_activity','search_index','knowledge_index','conversation_input','notification','whatsapp_router_session','whatsapp_router_action','whatsapp_router_response','assistant_lead_draft','assistant_tool_call')
 OR jsonb_typeof(p_new)<>'object' OR p_new->>'privacyErasureRequestId' IS DISTINCT FROM p_request
 OR p_new->>'state' IS DISTINCT FROM 'ERASED' OR p_new ?| ARRAY['source_text','translated_text','body','caption','blobKey','clientBlobKey','snapshot','input','payload']
 OR (p_new ? 'text' AND p_new->>'text' IS DISTINCT FROM '')
 OR (p_new - ARRAY['siteId','site_id','taskId','task_id','channel_id','channelId','author_id','authorId','uploadedBy','employeeId','message_id','messageId','message_version','translation_id','recipient_id','language','stage','visibility','reply_to_id','copied_from','privacyErasedAt','privacyErasureRequestId','state','status','text','deleted_at','attachment_ids','revisions'])<>'{}'::jsonb
 OR (p_new ? 'attachment_ids' AND p_new->'attachment_ids'<>'[]'::jsonb)
 OR (p_new ? 'revisions' AND p_new->'revisions'<>'[]'::jsonb)
 THEN RAISE EXCEPTION 'PRIVACY_REVISION_PERMIT_DENIED'; END IF;
 SELECT a.data->'plan' INTO approved_plan FROM aggregates a
 WHERE a.company_id=p_company AND a.kind='privacy_erasure_plan' AND a.data->>'state'='EXECUTING'
 AND a.data->>'requestId'=p_request AND a.data->'plan'->>'planHash'=p_plan
 AND a.data->>'previewMfaVerified'='true' AND a.data->>'confirmationMfaVerified'='true'
 AND a.data->>'confirmedBy' IS NOT NULL AND a.data->>'confirmedBy' IS DISTINCT FROM a.data->>'createdBy';
 SELECT a.data->>'confirmedBy' INTO executor_id FROM aggregates a
 WHERE a.company_id=p_company AND a.kind='privacy_erasure_plan' AND a.data->>'state'='EXECUTING'
 AND a.data->>'requestId'=p_request AND a.data->'plan'->>'planHash'=p_plan;
 SELECT data INTO request_data FROM aggregates WHERE company_id=p_company AND kind='privacy_request' AND id=p_request;
 IF approved_plan IS NULL OR request_data->>'type' IS DISTINCT FROM 'ERASURE' OR request_data->>'state' IS DISTINCT FROM 'AWAITING_ERASURE_EXECUTION'
 OR knaba_safe_timestamp(approved_plan->>'expiresAt') IS NULL OR knaba_safe_timestamp(approved_plan->>'expiresAt')<=clock_timestamp()
 OR executor_id IS NULL OR request_data->>'subjectUserId'=executor_id
 OR NOT EXISTS(SELECT 1 FROM aggregates u WHERE u.company_id=p_company AND u.kind='user' AND u.id=executor_id
  AND COALESCE(u.data->>'active','true')<>'false' AND u.data->'roles' @> '["OWNER"]'::jsonb)
 OR NOT EXISTS(SELECT 1 FROM aggregates legal WHERE legal.company_id=p_company AND legal.kind='legal_approval'
  AND legal.id=approved_plan->>'legalApprovalId' AND legal.id=request_data->>'legalApprovalId'
  AND legal.version=(approved_plan->>'legalApprovalVersion')::integer
  AND legal.version=(request_data->>'legalApprovalVersion')::integer AND legal.data->>'subject'='PRIVACY'
  AND legal.data->>'status'='APPROVED' AND legal.data->>'active'='true'
  AND knaba_safe_timestamp(legal.data->>'expiresAt')>clock_timestamp())
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(approved_plan->'policyVersions') policy WHERE NOT EXISTS(
  SELECT 1 FROM aggregates p WHERE p.company_id=p_company AND p.kind='retention_policy' AND p.id=policy->>'id'
  AND p.version=(policy->>'version')::integer AND p.data->>'state'='APPROVED'
  AND p.data->>'legalApprovalId'=approved_plan->>'legalApprovalId'
  AND (p.data->>'legalApprovalVersion')::integer=(approved_plan->>'legalApprovalVersion')::integer))
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(approved_plan->'actions') action
 WHERE action->>'type'='REDACT_REVISION' AND action->>'companyId'=p_company AND action->>'kind'=p_kind
 AND action->>'id'=p_id AND (action->>'version')::integer=p_version AND action->'replacement'=p_new)
 OR NOT EXISTS(SELECT 1 FROM aggregate_revisions WHERE company_id=p_company AND kind=p_kind AND id=p_id AND version=p_version AND data=p_old)
 THEN RAISE EXCEPTION 'PRIVACY_REVISION_PERMIT_DENIED'; END IF;
END $$;

CREATE OR REPLACE FUNCTION knaba_permit_privacy_revision(
 p_company text,p_request text,p_plan text,p_kind text,p_id text,p_version integer,p_old jsonb,p_new jsonb
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM knaba_validate_privacy_revision(p_company,p_request,p_plan,p_kind,p_id,p_version,p_old,p_new);
 INSERT INTO privacy_revision_permits(transaction_id,db_user,company_id,request_id,plan_hash,kind,id,version,old_data,new_data)
 VALUES(txid_current(),current_user,p_company,p_request,p_plan,p_kind,p_id,p_version,p_old,p_new);
END $$;

CREATE OR REPLACE FUNCTION knaba_privacy_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE permit privacy_revision_permits%ROWTYPE;consumed uuid;
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'data')=(to_jsonb(OLD)-'data') THEN
  SELECT * INTO permit FROM privacy_revision_permits p WHERE p.transaction_id=txid_current() AND p.db_user=current_user
  AND p.company_id=OLD.company_id AND p.kind=OLD.kind AND p.id=OLD.id AND p.version=OLD.version
  AND p.old_data=OLD.data AND p.new_data=NEW.data FOR UPDATE;
  IF permit.token IS NOT NULL THEN
   -- Direct permit-table writes do not bypass the approved-action validation.
   PERFORM knaba_validate_privacy_revision(permit.company_id,permit.request_id,permit.plan_hash,permit.kind,permit.id,permit.version,OLD.data,NEW.data);
   DELETE FROM privacy_revision_permits WHERE token=permit.token RETURNING token INTO consumed;
   IF consumed IS NOT NULL THEN RETURN NEW; END IF;
  END IF;
 END IF;
 RAISE EXCEPTION 'immutable business history';
END $$;
CREATE OR REPLACE FUNCTION knaba_privacy_permit_consumed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM privacy_revision_permits WHERE token=NEW.token) THEN
  RAISE EXCEPTION 'PRIVACY_REVISION_PERMIT_UNCONSUMED';
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS privacy_permit_consumed ON privacy_revision_permits;
CREATE CONSTRAINT TRIGGER privacy_permit_consumed AFTER INSERT ON privacy_revision_permits
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION knaba_privacy_permit_consumed();
DROP TRIGGER IF EXISTS revisions_immutable ON aggregate_revisions;
CREATE TRIGGER revisions_immutable BEFORE UPDATE OR DELETE ON aggregate_revisions FOR EACH ROW EXECUTE FUNCTION knaba_privacy_revision_guard();
INSERT INTO schema_migrations(version) VALUES ('003_bounded_privacy_erasure') ON CONFLICT DO NOTHING;
