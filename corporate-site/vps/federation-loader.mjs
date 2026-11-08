import {bindFederationCoordinator,securityTransaction,federationSessionAllowed,FederationSourceError} from './federation-state.mjs';

export async function loadSourceFederation({db,environment=process.env,origin,mode='PRODUCTION',ownerPolicy,fetchImpl=fetch,factory}){
  const installed=db.prepare('SELECT count(*) n FROM vps_federation_authorities').get().n>0;
  if(environment.KNABA_FEDERATION_ENABLED!=='approved'){
    if(installed||(environment.KNABA_FEDERATION_AUTHORITIES&&environment.KNABA_FEDERATION_AUTHORITIES!=='[]'))throw new FederationSourceError('FEDERATION_CONFIGURATION');
    return null;
  }
  const create=factory??(await import('../dist/vps/federation.mjs')).createSourceFederation;
  return create({db,environment,origin,mode,ownerPolicy,fetchImpl,stateApi:Object.freeze({bindFederationCoordinator,securityTransaction,federationSessionAllowed})});
}
