import {randomUUID} from 'node:crypto';
import {normalizeAuthority,makeFederationRequest,verifyFederationRequest,type FederationAction,type FederationAuthority} from '../../packages/integrations/site-federation-protocol.mjs';

/** Public, deterministic test keys. No provider or deployed authority is used. */
export function federationAuthorityFixture(companyId:string,patch:Record<string,unknown>={}):FederationAuthority {
 return normalizeAuthority({authorityId:'synthetic-vps',companyId,issuer:'https://site.example.invalid/identity',siteOrigin:'https://site.example.invalid',erpOrigin:'https://erp.example.invalid',erpAudience:'knaba-erp-test',siteAudience:'knaba-site-test',policyVersion:1,siteToErp:{kid:'synthetic-site',secret:Buffer.alloc(32,11).toString('base64url')},erpToSite:{kid:'synthetic-erp',secret:Buffer.alloc(32,12).toString('base64url')},...patch});
}
export function federationRequestFixture(config:FederationAuthority,action:FederationAction,payload:Record<string,unknown>,generation:number,operationId:string=randomUUID()){
 const request=makeFederationRequest(config,'SITE_TO_ERP',action,payload,{generation,operationId});
 return {wire:request,verified:verifyFederationRequest(config,'SITE_TO_ERP',request.headers,request.body)};
}
