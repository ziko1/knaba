export declare const FEDERATION_LOGIN_PENDING_MS:300000;
export declare const FEDERATION_LOGIN_CODE_MS:60000;
export declare const FEDERATION_LOGIN_PROOF_MS:10000;
export type FederationLoginAction='LOGIN_INSPECT'|'LOGIN_APPROVE'|'LOGIN_STATUS';
export declare const FEDERATION_LOGIN_ACTIONS:ReadonlyArray<FederationLoginAction>;
export type FederationLoginClient=Readonly<{clientId:string;kind:'WEB';platform:'WEB';label:string;returnPath:string}>|Readonly<{clientId:string;kind:'NATIVE';platform:'ANDROID'|'IOS';label:string;redirectUri:string}>;
export interface FederationLoginPolicy {readonly enabled:true;readonly policyVersion:number;readonly authorizationIssuer:string;readonly authorityIds:readonly string[];readonly clients:readonly FederationLoginClient[]}
export interface SourceLoginPolicy {readonly enabled:true;readonly authorityIds:readonly string[];readonly policyVersion:number}
export interface FederationLoginSourceRef {readonly subject:string;readonly sessionRef:string;readonly epoch:number;readonly securityFingerprint:string;readonly sourcePolicyVersion:number}
export interface FederationLoginPolicyRef {readonly loginPolicyVersion:number;readonly loginPolicyFingerprint:string;readonly sourceLoginPolicyFingerprint:string}
export interface FederationLoginRequestRef {readonly requestId:string;readonly requestBinding:string}
export type FederationLoginIntrospection=Readonly<FederationLoginRequestRef&FederationLoginSourceRef&FederationLoginPolicyRef&({purpose:'SESSION_ISSUE'}|{purpose:'SESSION_USE';erpSessionId:string})>;
export type FederationLoginIntrospectionResult=Readonly<{active:false}>|Readonly<FederationLoginIntrospection&{active:true;generation:number;checkedAt:string;validUntil:string;sessionExpiresAt:string;reauthAt:string}>;
export type FederationLoginStart=Readonly<{authorityId:string;clientId:string}>|Readonly<{authorityId:string;clientId:string;redirectUri:string;state:string;codeChallenge:string;codeChallengeMethod:'S256'}>;
export type FederationLoginToken=Readonly<{grantType:'authorization_code';clientId:string;redirectUri:string;code:string;codeVerifier:string}>;
export interface FederationLoginRequestTuple {companyId:string;authorityId:string;requestId:string;clientId:string;kind:'WEB'|'NATIVE';platform:'WEB'|'ANDROID'|'IOS';redirectUri:string|null;codeChallenge:string|null;stateHash:string|null;expiresAt:string;loginPolicyFingerprint:string}
export declare function normalizeFederationLoginPolicy(value:unknown,context:{erpOrigin:string;authorityIds:readonly string[];appMode:string}):FederationLoginPolicy|null;
export declare function normalizeSourceLoginPolicy(value:unknown,context:{authorityIds:readonly string[]}):SourceLoginPolicy|null;
export declare function federationLoginPolicyFingerprint(policy:FederationLoginPolicy):string;
export declare function sourceLoginPolicyFingerprint(policy:SourceLoginPolicy):string;
export declare function parseFederationLoginAction(action:FederationLoginAction,payload:unknown):Readonly<Record<string,any>>;
export declare function parseFederationLoginActionResult(action:FederationLoginAction,value:unknown):Readonly<Record<string,any>>;
export declare function parseFederationLoginIntrospection(value:unknown):FederationLoginIntrospection;
export declare function parseFederationLoginIntrospectionResult(value:unknown):FederationLoginIntrospectionResult;
export declare function parseFederationLoginStart(value:unknown,policy:FederationLoginPolicy):FederationLoginStart;
export declare function parseFederationLoginToken(value:unknown):FederationLoginToken;
export declare function pkceS256(verifier:string):string;
export declare function federationLoginRequestBinding(tuple:FederationLoginRequestTuple):string;
