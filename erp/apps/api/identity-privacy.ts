import {assert,type Transaction} from '../../packages/domain/core.ts';
import {IDENTITY_PRIVACY_MAX_RECORDS,identityPrivacySnapshot,type IdentityPrivacyScope} from '../../packages/domain/identity-privacy.ts';
import {PgTransaction} from './database.ts';

function instant(value:unknown):string {
 const time=value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN;
 assert(Number.isFinite(time),'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_METADATA_INVALID'});
 return new Date(time).toISOString();
}
const optionalInstant=(value:unknown)=>value===null?null:instant(value);

/** Read history through the already authorized company transaction. Selecting
 * fields here prevents credential/proof hashes and unconfirmed third-party
 * preview identities from entering the export pipeline at all.
 */
export async function loadIdentityPrivacy(tx:Transaction,scope:IdentityPrivacyScope){
 assert(tx instanceof PgTransaction,'MISSING_CONFIGURATION',{reason:'TRANSACTIONAL_IDENTITY_PRIVACY_READER_REQUIRED'});
 assert(tx.companyId===scope.companyId&&tx.actorId===scope.subjectUserId,'ACCESS_DENIED');
 const values=[scope.companyId,scope.subjectUserId,IDENTITY_PRIVACY_MAX_RECORDS+1];
 const [bindings,sessions,challenges]=await Promise.all([
  tx.query(`SELECT id,issuer,audience,subject,status,version,generation,created_at,expires_at,revoked_at
   FROM site_identity_bindings WHERE company_id=$1 AND user_id=$2 ORDER BY created_at,id LIMIT $3`,values),
  tx.query(`SELECT id,binding_id,created_at,expires_at,revoked_at
   FROM site_auth_sessions WHERE company_id=$1 AND user_id=$2 ORDER BY created_at,id LIMIT $3`,values),
  tx.query(`SELECT id,status,created_at,expires_at,completed_at
   FROM site_identity_challenges WHERE company_id=$1 AND user_id=$2 ORDER BY created_at,id LIMIT $3`,values)
 ]);
 assert(bindings.rows.length+sessions.rows.length+challenges.rows.length<=IDENTITY_PRIVACY_MAX_RECORDS,
  'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_SNAPSHOT_LIMIT'});
 return identityPrivacySnapshot({companyId:scope.companyId,subjectUserId:scope.subjectUserId,
  bindings:bindings.rows.map(row=>({id:row.id,issuer:row.issuer,audience:row.audience,subject:row.subject,status:row.status,
   version:row.version,generation:row.generation,createdAt:instant(row.created_at),expiresAt:optionalInstant(row.expires_at),revokedAt:optionalInstant(row.revoked_at)})),
  sessions:sessions.rows.map(row=>({id:row.id,bindingId:row.binding_id,createdAt:instant(row.created_at),expiresAt:instant(row.expires_at),revokedAt:optionalInstant(row.revoked_at)})),
  challenges:challenges.rows.map(row=>({id:row.id,status:row.status,createdAt:instant(row.created_at),expiresAt:instant(row.expires_at),completedAt:optionalInstant(row.completed_at)}))
 },scope);
}
