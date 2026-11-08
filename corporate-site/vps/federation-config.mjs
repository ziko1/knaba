import {normalizeAuthority} from '../../erp/packages/integrations/site-federation-protocol.mjs';
import {FederationSourceError} from './federation-state.mjs';

/** The complete destination registry belongs to protected deployment configuration,
 * outside auth-DB backups. Never infer a removed destination from an empty DB. */
export function sourceFederationAuthorities(environment={},origin,mode='PRODUCTION'){
  const raw=environment.KNABA_FEDERATION_AUTHORITIES;
  if(environment.KNABA_FEDERATION_ENABLED!=='approved'){
    if(raw&&raw!=='[]')throw new FederationSourceError('FEDERATION_CONFIGURATION');
    return [];
  }
  if(typeof raw!=='string'||Buffer.byteLength(raw)>16_384)throw new FederationSourceError('FEDERATION_CONFIGURATION');
  try{
    const input=JSON.parse(raw);
    if(!Array.isArray(input)||input.length<1||input.length>8)throw Error();
    const ids=new Set(),destinations=new Set();
    return input.map(value=>{
      const config=normalizeAuthority(value,mode),key=config.companyId+'\0'+config.issuer;
      if(config.siteOrigin!==origin||ids.has(config.authorityId)||destinations.has(key))throw Error();
      if([config.siteToErp.secret,config.erpToSite.secret].some(secret=>secret===environment.KNABA_ERP_SECRET))throw Error();
      ids.add(config.authorityId);destinations.add(key);return config;
    });
  }catch{throw new FederationSourceError('FEDERATION_CONFIGURATION');}
}
