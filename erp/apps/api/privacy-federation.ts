import {assert,type Actor,type CommandRegistry,type Transaction} from '../../packages/domain/core.ts';
import {governanceCommands,preparePrivacyExport} from '../../packages/domain/governance.ts';
import {PRIVACY_FEDERATION_RECORD_LIMIT} from '../../packages/domain/privacy-federation.ts';
import type {PgTransaction} from './database.ts';

// Every query scopes ownership before LIMIT. No source proof, token/hash, operation
// result, shared audit row or unconfirmed source identity leaves PostgreSQL.
const queries=[
 `/* privacy-v2:bindings */ SELECT 'BINDING' AS kind,b.company_id AS "companyId",b.user_id AS "userId",
 b.id::text AS "bindingId",b.issuer AS "sourceIssuer",b.subject AS "sourceSubject",b.status AS "storedStatus",b.version,
 b.created_at AS "createdAt",b.expires_at AS "expiresAt",b.revoked_at AS "revokedAt"
 FROM site_identity_bindings b WHERE b.company_id=$1 AND b.user_id=$2 ORDER BY b.id LIMIT $3`,
 `/* privacy-v2:link-attempts */ SELECT 'LINK_ATTEMPT' AS kind,c.company_id AS "companyId",c.user_id AS "userId",
 c.id::text AS "attemptId",c.authority_id AS "authorityId",c.state AS "storedState",c.created_at AS "createdAt",c.expires_at AS "expiresAt",
 b.id::text AS "bindingId",(c.state<>'CONFIRMED' AND c.binding_id IS NULL OR c.state='CONFIRMED' AND b.id IS NOT NULL) AS "lineageValid"
 FROM site_identity_link_challenges c
 LEFT JOIN site_federation_authorities a ON a.company_id=c.company_id AND a.authority_id=c.authority_id
 LEFT JOIN site_identity_bindings b ON b.company_id=c.company_id AND b.user_id=c.user_id AND b.id=c.binding_id AND b.issuer=a.issuer AND b.audience=a.audience AND b.subject=c.source_subject
 WHERE c.company_id=$1 AND c.user_id=$2 ORDER BY c.id LIMIT $3`,
 `/* privacy-v2:principals */ SELECT 'PRINCIPAL' AS kind,b.company_id AS "companyId",b.user_id AS "userId",b.id::text AS "bindingId",
 p.authority_id AS "authorityId",p.state AS "storedState",p.updated_at AS "updatedAt"
 FROM site_identity_bindings b
 JOIN site_federation_authorities a ON a.company_id=b.company_id AND a.issuer=b.issuer AND a.audience=b.audience
 JOIN site_federation_principals p ON p.company_id=a.company_id AND p.authority_id=a.authority_id AND p.subject=b.subject
 WHERE b.company_id=$1 AND b.user_id=$2 ORDER BY b.id,p.authority_id COLLATE "C" LIMIT $3`,
 `/* privacy-v2:source-sessions */ SELECT 'SOURCE_SESSION' AS kind,b.company_id AS "companyId",b.user_id AS "userId",b.id::text AS "bindingId",
 s.authority_id AS "authorityId",s.state AS "storedState",s.expires_at AS "expiresAt",s.updated_at AS "updatedAt"
 FROM site_identity_bindings b
 JOIN site_federation_authorities a ON a.company_id=b.company_id AND a.issuer=b.issuer AND a.audience=b.audience
 JOIN site_federation_sessions s ON s.company_id=a.company_id AND s.authority_id=a.authority_id AND s.subject=b.subject
 WHERE b.company_id=$1 AND b.user_id=$2 ORDER BY b.id,s.authority_id COLLATE "C",s.session_ref COLLATE "C" LIMIT $3`,
 `/* privacy-v2:login-attempts */ SELECT 'LOGIN_ATTEMPT' AS kind,r.company_id AS "companyId",r.source_data->'userId' AS "userId",
 r.id::text AS "requestId",b.id::text AS "bindingId",r.state AS "storedState",r.version,r.created_at AS "createdAt",r.expires_at AS "expiresAt",
 r.request_data->'clientId' AS "clientId",r.request_data->'clientKind' AS "clientKind",r.request_data->'platform' AS platform,r.request_data->'clientLabel' AS "clientLabel",
 (b.id IS NOT NULL AND jsonb_typeof(r.source_data->'bindingId')='string' AND jsonb_typeof(r.source_data->'subject')='string') AS "lineageValid"
 FROM site_federation_login_requests r
 LEFT JOIN site_federation_authorities a ON a.company_id=r.company_id AND a.authority_id=r.authority_id
 LEFT JOIN site_identity_bindings b ON b.company_id=r.company_id AND b.user_id=$2 AND b.id::text=r.source_data->>'bindingId' AND b.subject=r.source_data->>'subject' AND b.issuer=a.issuer AND b.audience=a.audience
 WHERE r.company_id=$1 AND r.source_data->'userId'=to_jsonb($2::text) ORDER BY r.id LIMIT $3`,
 `/* privacy-v2:derived-sessions */ SELECT 'DERIVED_SESSION' AS kind,d.company_id AS "companyId",d.user_id AS "userId",
 d.id::text AS "childSessionId",d.request_id::text AS "requestId",d.binding_id::text AS "bindingId",d.state AS "storedState",d.created_at AS "createdAt",d.expires_at AS "expiresAt",d.revoked_at AS "revokedAt",
 s.expires_at AS "parentExpiresAt",s.revoked_at AS "parentRevokedAt",
 d.authority_data->'clientId' AS "clientId",d.authority_data->'clientKind' AS "clientKind",d.authority_data->'platform' AS platform,r.request_data->'clientLabel' AS "clientLabel",
 (s.token_hash IS NOT NULL AND b.id IS NOT NULL AND r.id IS NOT NULL
 AND d.authority_data->'userId'=to_jsonb(d.user_id) AND d.authority_data->'bindingId'=to_jsonb(d.binding_id::text) AND d.authority_data->'requestId'=to_jsonb(d.request_id::text)
 AND d.authority_data->'authorityId'=to_jsonb(r.authority_id) AND d.authority_data->'subject'=to_jsonb(b.subject) AND d.authority_data->'sourceIssuer'=to_jsonb(b.issuer)
 AND r.source_data->'userId'=to_jsonb(d.user_id) AND r.source_data->'bindingId'=to_jsonb(d.binding_id::text) AND r.source_data->'subject'=to_jsonb(b.subject)
 AND d.authority_data->'clientId'=r.request_data->'clientId' AND d.authority_data->'clientKind'=r.request_data->'clientKind' AND d.authority_data->'platform'=r.request_data->'platform') AS "lineageValid"
 FROM site_federation_session_authorities d
 LEFT JOIN auth_sessions s ON s.token_hash=d.token_hash AND s.company_id=d.company_id AND s.user_id=d.user_id
 LEFT JOIN site_federation_login_requests r ON r.company_id=d.company_id AND r.id=d.request_id
 LEFT JOIN site_federation_authorities a ON a.company_id=r.company_id AND a.authority_id=r.authority_id
 LEFT JOIN site_identity_bindings b ON b.company_id=d.company_id AND b.user_id=d.user_id AND b.id=d.binding_id AND b.issuer=a.issuer AND b.audience=a.audience
 WHERE d.company_id=$1 AND d.user_id=$2 ORDER BY d.id LIMIT $3`
];

/** Called only inside the Engine's original company transaction/authority fence. */
export async function loadPrivacyFederationRows(tx:Transaction,actor:Actor):Promise<unknown[]>{
 const sql=tx as PgTransaction;assert(sql.companyId===actor.companyId&&typeof sql.query==='function','INVALID_STATE',{reason:'FEDERATION_METADATA_TRANSACTION_REQUIRED'});
 const result:unknown[]=[];
 for(const query of queries){
  const remaining=PRIVACY_FEDERATION_RECORD_LIMIT-result.length;
  const page=await sql.query(query,[actor.companyId,actor.userId,remaining+1]);
  assert(page.rows.length<=remaining,'INVALID_STATE',{reason:'PRIVACY_FEDERATION_RECORD_LIMIT_EXCEEDED'});
  result.push(...page.rows);
 }
 return result;
}

export function createPrivacyFederationCommands():CommandRegistry {
 return {'privacy.export':{...governanceCommands['privacy.export'],handler:(ctx,input)=>preparePrivacyExport(ctx,input,loadPrivacyFederationRows)}};
}
