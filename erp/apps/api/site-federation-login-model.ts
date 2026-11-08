import {z} from 'zod';
import {sourceReferenceSchema,federationInstant,federationUuid,federationEpoch} from '../../packages/domain/site-federation-ledger.ts';

const hash=z.string().regex(/^[a-f0-9]{64}$/),nonce=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const loginRequestDataSchema=z.object({
 authorityConfigFingerprint:hash,loginPolicyFingerprint:hash,clientId:z.string().min(1).max(64),clientKind:z.enum(['WEB','NATIVE']),
 platform:z.enum(['WEB','ANDROID','IOS']),clientLabel:z.string().min(1).max(80),authorizationIssuer:z.string().url(),
 redirectUri:z.string().max(2048).nullable(),codeChallenge:nonce.nullable(),nativeState:nonce.nullable(),returnPath:z.string().max(161).nullable(),
 parentSessionHash:hash.nullable(),parentSessionPresent:z.boolean(),
}).strict();
export const loginSourceDataSchema=sourceReferenceSchema.extend({
 generation:federationEpoch,reauthAt:federationInstant,sessionExpiresAt:federationInstant,siteLabel:z.string().min(1).max(120),
 loginPolicyVersion:federationEpoch,loginPolicyFingerprint:hash,sourceLoginPolicyFingerprint:hash,
 bindingId:federationUuid,bindingVersion:federationEpoch,bindingTrustFingerprint:hash,userId:z.string().min(1).max(128),erpCredentialFingerprint:hash,
}).strict();
export const federatedSessionDataSchema=loginSourceDataSchema.extend({
 requestId:federationUuid,requestBinding:hash,authorityId:z.string().min(1).max(64),sourceIssuer:z.string().url(),authorityConfigFingerprint:hash,
 clientId:z.string().min(1).max(64),clientKind:z.enum(['WEB','NATIVE']),platform:z.enum(['WEB','ANDROID','IOS']),redirectUri:z.string().max(2048).nullable(),
 erpMfaAt:federationInstant.nullable(),
}).strict();
export type LoginRequestData=z.infer<typeof loginRequestDataSchema>;
export type LoginSourceData=z.infer<typeof loginSourceDataSchema>;
export type FederatedSessionData=z.infer<typeof federatedSessionDataSchema>;
export interface LoginRequestRow {
 company_id:string;id:string;start_key_hash:string;input_hash:string;authority_id:string;request_binding:string;request_data:unknown;
 flow_hash:string|null;source_data:unknown|null;state:'CREATED'|'BROWSER_BOUND'|'SOURCE_APPROVED'|'CODE_ISSUED'|'COMPLETE'|'CANCELLED'|'EXPIRED'|'DENIED';
 version:number;inspect_count:number;code_hash:string|null;code_expires_at:Date|string|null;erp_mfa_at:Date|string|null;result_session_id:string|null;created_at:Date|string;expires_at:Date|string;
}
export interface FederatedSessionRow {
 company_id:string;id:string;user_id:string;token_hash:string;request_id:string;binding_id:string;binding_version:number;authority_data:unknown;
 state:'ACTIVE'|'REVOKED';version:number;created_at:Date|string;expires_at:Date|string;revoked_at:Date|string|null;
 auth_expires_at:Date|string;auth_revoked_at:Date|string|null;mfa_verified:boolean;
}
export const iso=(value:Date|string)=>new Date(value).toISOString();
