import assert from 'node:assert/strict';
import {registerSourceSession,fenceSourcePrincipal,fenceSourceSession,assertCurrentSourceSession} from '../../../knaba/erp/packages/domain/site-federation-ledger.ts';
import {projectPrivacyFederationMetadata} from '../../../knaba/erp/packages/domain/privacy-federation.ts';

// Actual pure domain functions with synthetic rows. This is not PostgreSQL,
// signed ingress, or a rerun of the failing integration acceptance test.
const capturedAt='2026-11-08T12:00:00.000Z';
const expiresAt='2026-11-09T00:00:00.000Z';
const actor={companyId:'synthetic-company',userId:'synthetic-user',roles:[],permissions:[],siteIds:[],customerIds:[],warehouseIds:[]};
const bindingId='10000000-0000-4000-8000-000000000001';
const source={subject:'synthetic-source-user',sessionRef:'s'.repeat(43),epoch:1,securityFingerprint:'f'.repeat(64),sourcePolicyVersion:1,sessionExpiresAt:expiresAt};
const registered=registerSourceSession(undefined,undefined,source,1,capturedAt);
const original=structuredClone(registered.session);
const principal=fenceSourcePrincipal(registered.principal,{subject:source.subject,scope:'PRINCIPAL',throughEpoch:1,nextEpoch:2,intentHash:'e'.repeat(64)},'10000000-0000-4000-8000-000000000002',1);
assert.deepEqual(registered.session,original);
assert.equal(principal.state,'FENCED');
assert.equal(principal.minimumEpoch,2);
assert.throws(()=>assertCurrentSourceSession(principal,registered.session,source,1,capturedAt),{code:'NEEDS_REAUTH'});
const metadata=(session,now=capturedAt)=>projectPrivacyFederationMetadata(actor,now,[
 {...actor,kind:'BINDING',bindingId,sourceIssuer:'https://site.example.invalid/identity',sourceSubject:source.subject,storedStatus:'REVOKED',version:2,createdAt:capturedAt,expiresAt:null,revokedAt:capturedAt},
 {...actor,kind:'PRINCIPAL',bindingId,authorityId:'synthetic-authority',storedState:principal.state,updatedAt:capturedAt},
 {...actor,kind:'SOURCE_SESSION',bindingId,authorityId:'synthetic-authority',storedState:session.state,expiresAt:session.expiresAt,updatedAt:capturedAt}
].map(({roles,permissions,siteIds,customerIds,warehouseIds,...row})=>row)).sourceSessionSummary[0];
const afterPrincipal=metadata(registered.session);
assert.deepEqual(afterPrincipal.sessionCounts,{activeUnexpired:1,activeExpired:0,revokedUnexpired:0,revokedExpired:0,revokedUnknownExpiry:0});
const revoked=fenceSourceSession(registered.session,source.subject,source.sessionRef);
assert.equal(revoked.state,'REVOKED');
assert.equal(revoked.expiresAt,original.expiresAt);
const afterSession=metadata(revoked);
assert.deepEqual(afterSession.sessionCounts,{activeUnexpired:0,activeExpired:0,revokedUnexpired:1,revokedExpired:0,revokedUnknownExpiry:0});
const atExpiry=metadata(revoked,expiresAt);
assert.deepEqual(atExpiry.sessionCounts,{activeUnexpired:0,activeExpired:0,revokedUnexpired:0,revokedExpired:1,revokedUnknownExpiry:0});
console.log(JSON.stringify({scope:'PURE_DOMAIN_FUNCTIONS_SYNTHETIC_ROWS_NOT_PG',afterPrincipalFence:{storedPrincipalState:principal.state,minimumEpoch:principal.minimumEpoch,storedSessionState:registered.session.state,currentAuthorityDenied:true,sessionCounts:afterPrincipal.sessionCounts},oldFixtureExpectedRevokedUnexpired:1,oldFixtureExpectationMatches:false,afterExplicitSessionFence:{storedSessionState:revoked.state,expiryPreserved:true,sessionCounts:afterSession.sessionCounts},atExactExpiry:atExpiry.sessionCounts},null,2));
