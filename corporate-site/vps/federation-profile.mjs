import {randomUUID} from 'node:crypto';
import {federationMutation,securityTransaction,FederationSourceError} from './federation-state.mjs';

/** Trusted in-process counterpart of the existing setRole route. No header,
 * browser field, or hosted Sites environment can supply this capability. */
export function changeFederatedProfileAccess(db,{input,actorId,authorize,authorizationExpiresAt,ownerEmail,developerEmail}){
  const keys=['userId','role','status','version'];
  if(!input||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k))||typeof input.userId!=='string'||
    !['approved','suspended'].includes(input.status)||!Number.isSafeInteger(input.version)||input.version<1||
    (input.role!==null&&!['client','partner','worker','bauleiter','admin'].includes(input.role))||(input.status==='approved'&&input.role===null))
    throw new FederationSourceError('FEDERATION_INVALID');
  input=Object.freeze({...input});
  const target=db.prepare('SELECT email,version FROM profiles WHERE id=?').get(input.userId);
  if(!target||target.version!==input.version)throw new FederationSourceError('FEDERATION_CONFLICT');
  if(input.userId===actorId||[ownerEmail,developerEmail].filter(Boolean).map(value=>value.trim().toLowerCase()).includes(target.email.trim().toLowerCase()))
    throw new FederationSourceError('NEEDS_REAUTH');
  return federationMutation(db,{subject:input.userId,kind:'ROLE_CHANGE',scope:'PRINCIPAL',pureRevocation:false,authorize,authorizationExpiresAt,intent:input,
    apply:()=>securityTransaction(db,()=>{
      const stamp=new Date().toISOString(),mutation=randomUUID();
      const changed=db.prepare('UPDATE profiles SET role=?,status=?,updated_at=?,version=version+1,last_mutation=? WHERE id=? AND version=?')
        .run(input.role,input.status,stamp,mutation,input.userId,input.version);
      if(changed.changes!==1)throw new FederationSourceError('FEDERATION_CONFLICT');
      db.prepare('INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) VALUES(?,?,?,?,?)')
        .run(mutation,actorId,input.status==='suspended'?'role.suspended':'role.approved.'+input.role,input.userId,stamp);
      return {changed:true};
    })});
}
