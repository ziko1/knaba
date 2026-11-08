/** Bundle the shared protocol into the VPS deliverable. Runtime SQLite permits
 * are supplied by its current unbundled connection module, never a second map. */
import {SourceFederationCoordinator} from './federation-source.mjs';
import {sourceFederationAuthorities} from './federation-config.mjs';
export async function createSourceFederation({db,environment,origin,mode,ownerPolicy,fetchImpl,stateApi}){
  const configuration=()=>sourceFederationAuthorities(environment,origin,mode);
  const coordinator=new SourceFederationCoordinator({db,authorities:configuration(),configuration,ownerPolicy,fetchImpl,stateApi});
  try{await coordinator.initialize();coordinator.startMaintenance();return coordinator;}
  catch(error){coordinator.close();throw error;}
}
