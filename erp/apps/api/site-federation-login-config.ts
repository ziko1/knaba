import {assert} from '../../packages/domain/core.ts';
import {normalizeFederationLoginPolicy,federationLoginPolicyFingerprint,type FederationLoginPolicy} from '../../packages/integrations/site-federation-login-protocol.mjs';
import type {AuthOptions} from './auth.ts';
import type {FederationAuthorities} from './site-federation-config.ts';

export type FederationLoginPolicyProvider=()=>FederationLoginPolicy|null;
export function parseFederationLoginPolicy(raw:string|undefined,authorities:FederationAuthorities,options:AuthOptions):FederationLoginPolicy|null {
 if(raw===undefined||raw==='')return null;
 assert(Buffer.byteLength(raw,'utf8')<=16384,'MISSING_CONFIGURATION');
 let value:unknown;try{value=JSON.parse(raw);}catch{assert(false,'MISSING_CONFIGURATION');}
 return normalizeFederationLoginPolicy(value,{erpOrigin:options.publicOrigin??'',authorityIds:authorities.list().map(c=>c.authorityId),appMode:options.appMode});
}
export function currentLoginPolicy(provider:FederationLoginPolicyProvider,expectedFingerprint?:string){
 const policy=provider();assert(policy&&(!expectedFingerprint||federationLoginPolicyFingerprint(policy)===expectedFingerprint),'FEDERATION_UNAVAILABLE');return policy;
}
