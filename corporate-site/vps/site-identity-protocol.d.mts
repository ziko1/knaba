export interface FederationPeer {
 readonly companyId:string;readonly issuer:string;readonly audience:string;readonly version:number;readonly active:boolean;
 readonly expiresAt?:string;readonly erpOrigin:string;readonly siteOrigin:string;readonly keyId:string;readonly secret:string;readonly ownerUserId?:string;
}
export interface FederationRequestProof {keyId:string;nonce:string;time:string;signature:string}
export const MAX_PROOF_AGE_MS:number;
export const proofHash:RegExp;
export const challengeTokenPattern:RegExp;
export class FederationError extends Error {readonly code:string;constructor(code?:string)}
export function digest(value:string|Uint8Array):string;
export function opaque():string;
export function requireValue(condition:unknown,code?:string):asserts condition;
export function exactObject(value:unknown,keys:string[]):Record<string,unknown>;
export function secureEqual(a:unknown,b:unknown):boolean;
export function parseSessionAuthorityEnabled(value:unknown):boolean;
export function trustFingerprint(config:FederationPeer):string;
export function transportFingerprint(config:FederationPeer):string;
export function parsePeerConfig(input:unknown,options?:{localTest?:boolean}):FederationPeer|null;
export function requireActive(config:FederationPeer|null|undefined,now?:number):FederationPeer;
export function signRequest(config:FederationPeer,path:string,bytes:string|Uint8Array,now?:number):FederationRequestProof;
export function verifyRequest(config:FederationPeer,path:string,bytes:string|Uint8Array,proof:unknown,now?:number):FederationRequestProof;
export function signResponse(config:FederationPeer,path:string,bytes:string|Uint8Array,request:FederationRequestProof,status?:number):string;
export function proofHeaders(proof:FederationRequestProof):Record<string,string>;
export function readProof(headers:Headers|Record<string,unknown>):FederationRequestProof;
export function peerRequest(config:FederationPeer,target:'site'|'erp',path:string,body:unknown,options?:{fetchImpl?:typeof fetch;timeoutMs?:number}):Promise<unknown>;
