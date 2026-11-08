import {assert} from '../../packages/domain/core.ts';
import {authorityFingerprint,normalizeAuthority,type FederationAuthority} from '../../packages/integrations/site-federation-protocol.mjs';
import {TrustedSiteAuthorities} from './site-identity-bindings.ts';

/** Separate server-owned trust. Empty configuration is deliberately disabled. */
export class FederationAuthorities {
 private readonly entries:ReadonlyMap<string,FederationAuthority>;
 constructor(input:unknown=[],companyId?:string,mode='PRODUCTION'){
  assert(Array.isArray(input)&&input.length<=8,'MISSING_CONFIGURATION');
  const entries=new Map<string,FederationAuthority>(),issuers=new Set<string>();
  for(const value of input){
   const config=normalizeAuthority(value,mode);
   assert((!companyId||config.companyId===companyId)&&!entries.has(config.authorityId)&&!issuers.has(config.companyId+'\0'+config.issuer),'MISSING_CONFIGURATION');
   entries.set(config.authorityId,config);issuers.add(config.companyId+'\0'+config.issuer);
  }
  this.entries=entries;
 }
 list(){return [...this.entries.values()];}
 get(authorityId:string){return this.entries.get(authorityId);}
 require(authorityId:string,expectedFingerprint?:string){const config=this.get(authorityId);assert(config&&(!expectedFingerprint||authorityFingerprint(config)===expectedFingerprint),'FEDERATION_UNAVAILABLE');return config;}
 bindingTrust(){return new TrustedSiteAuthorities(this.list().map(config=>({companyId:config.companyId,issuer:config.issuer,audience:config.erpAudience,identityNamespace:'site-user-id-v1',version:config.policyVersion,active:true})));}
}
export function parseFederationAuthorities(raw:string|undefined,companyId:string,mode:string){
 if(raw===undefined||raw==='')return new FederationAuthorities();
 assert(Buffer.byteLength(raw,'utf8')<=16384,'MISSING_CONFIGURATION');
 let value:unknown;try{value=JSON.parse(raw);}catch{assert(false,'MISSING_CONFIGURATION');}
 return new FederationAuthorities(value,companyId,mode);
}
