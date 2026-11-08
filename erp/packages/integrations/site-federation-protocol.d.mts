export type FederationDirection='SITE_TO_ERP'|'ERP_TO_SITE';
export type FederationAction='BOOTSTRAP_AUTHORITY'|'RECONCILE_PAGE'|'ACTIVATE_AUTHORITY'|'REGISTER_SESSION'|'LOOKUP_PRINCIPAL'|'FENCE'|'ACTIVATE_EPOCH'|'INSPECT_CHALLENGE'|'CLAIM'|'LINK_STATUS'|'LOGIN_INSPECT'|'LOGIN_APPROVE'|'LOGIN_STATUS'|'INTROSPECT';
export interface FederationAuthority {readonly authorityId:string;readonly companyId:string;readonly issuer:string;readonly siteOrigin:string;readonly erpOrigin:string;readonly erpAudience:string;readonly siteAudience:string;readonly policyVersion:number;readonly siteToErp:Readonly<{kid:string;secret:string}>;readonly erpToSite:Readonly<{kid:string;secret:string}>;readonly testLoopback?:boolean}
export interface FederationEnvelope {readonly v:1;readonly companyId:string;readonly issuer:string;readonly audience:string;readonly operationId:string;readonly action:FederationAction;readonly payload:Readonly<Record<string,unknown>>}
export interface FederationContext {readonly direction:FederationDirection;readonly generation:number;readonly nonce:string;readonly issuedAt:number;readonly operationId:string;readonly configFingerprint:string}
export interface VerifiedFederationRequest extends FederationContext {readonly envelope:FederationEnvelope;readonly nonceHash:string;readonly operationDigest:string}
export interface FederationRequestOptions {operationId?:string;generation:number;now?:number;nonce?:string;fetchImpl?:typeof fetch}
export declare const FEDERATION_ERP_PATH:'/api/v1/federation/authority';
export declare const FEDERATION_SITE_PATH:'/api/federation/introspect';
export declare const FEDERATION_MAX_BYTES:32768;
export declare const FEDERATION_ACTIONS:ReadonlyArray<FederationAction>;
export declare class FederationProtocolError extends Error {readonly code:string;constructor(code?:string)}
export declare function canonicalJson(value:unknown,depth?:number):string;
export declare function sessionReference(issuer:string,subject:string,storedTokenHash:string):string;
export declare function securityFingerprint(snapshot:unknown):string;
export declare function normalizeAuthority(value:unknown,mode?:string):FederationAuthority;
export declare function authorityFingerprint(config:FederationAuthority):string;
export declare function makeFederationRequest(config:FederationAuthority,direction:FederationDirection,action:FederationAction,payload:Record<string,unknown>,options:FederationRequestOptions):{body:Buffer<ArrayBuffer>;context:FederationContext;headers:Record<string,string>};
export declare function verifyFederationRequest(config:FederationAuthority,direction:FederationDirection,headers:Headers|Record<string,string|string[]|undefined>,body:Buffer,now?:number):VerifiedFederationRequest;
export declare function isVerifiedFederationRequest(value:unknown):value is VerifiedFederationRequest;
export declare function makeFederationResponse(config:FederationAuthority,context:VerifiedFederationRequest,value:unknown,status?:number,now?:number):{body:Buffer<ArrayBuffer>;status:number;headers:Record<string,string>};
export declare function verifyFederationResponse(config:FederationAuthority,context:FederationContext,status:number,headers:Headers|Record<string,string|string[]|undefined>,body:Buffer,now?:number):unknown;
export declare function sendFederation(config:FederationAuthority,direction:FederationDirection,action:FederationAction,payload:Record<string,unknown>,options:FederationRequestOptions):Promise<{status:number;result:unknown;context:FederationContext}>;
