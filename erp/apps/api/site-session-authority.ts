import {assert,DomainError,type Entity} from '../../packages/domain/core.ts';
import {ROLE_PERMISSIONS} from '../../packages/domain/permissions.ts';
import {Database,type PgTransaction} from './database.ts';
import type {SqlTransaction} from './auth.ts';
import {authoritySnapshotHash,type RequestAuthorityProof,type RequestAuthorityValidator,type SelfDispatchChange,type SelfDispatchCompletion} from './request-authority.ts';
import {SiteIdentityBindings,TrustedSiteAuthorities} from './site-identity-bindings.ts';
import {digest,requireActive,trustFingerprint,transportFingerprint,peerRequest,FederationError,
 type FederationPeer} from '../../packages/integrations/site-identity-protocol.mjs';

const path='/auth/site-identity/introspect-session';
const forbiddenRoles=new Set(['GUEST','SERVICE_ACCOUNT','DEVELOPER_SUPPORT']);
const ms=(value:unknown)=>value instanceof Date?value.getTime():Date.parse(String(value));
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const siteSessionSecurityFingerprint=(credential:any)=>digest(JSON.stringify([credential.password_hash,credential.totp_secret??null]));

/** Hash only immutable provenance. Revocation is deliberately checked separately.
 * This snapshot never becomes an Actor or a command-receipt key. */
export function siteSessionDescriptor(row:any):string {
 return digest(JSON.stringify([row.company_id,row.id,row.token_hash,row.user_id,row.user_version,row.security_fingerprint,
  row.binding_id,row.binding_version,row.binding_generation,row.issuer,row.audience,row.subject,row.site_session_digest,
  row.site_profile_version,row.site_profile_fingerprint,ms(row.site_expires_at),row.trust_version,row.trust_fingerprint,
  row.transport_fingerprint,row.mfa_verified,row.mfa_verified_at?ms(row.mfa_verified_at):null,ms(row.created_at),ms(row.expires_at)]));
}

/** F4-B reader only. No browser issuance, token exchange or implicit account join.
 * Each check performs current signed introspection; no successful response cache. */
export class SiteSessionAuthority implements RequestAuthorityValidator {
 private readonly bindings:SiteIdentityBindings;
 constructor(private readonly db:Database,private readonly companyId:string,
  private readonly config:()=>FederationPeer|null,private readonly enabled:()=>boolean=()=>false,
  private readonly transport:typeof peerRequest=peerRequest,private readonly expectedOrigin?:string){
  this.bindings=new SiteIdentityBindings(db,companyId,()=>{
   const peer=this.config();return new TrustedSiteAuthorities(peer?[{companyId:peer.companyId,issuer:peer.issuer,audience:peer.audience,
    identityNamespace:'site-user-id-v1',version:peer.version,active:peer.active,...(peer.expiresAt?{expiresAt:peer.expiresAt}:{})}]:[]);
  });
 }
 private configured(){
  assert(this.enabled()===true,'MISSING_CONFIGURATION');
  let peer:FederationPeer;
  try{peer=requireActive(this.config());}catch(error){if(error instanceof FederationError)throw new DomainError('MISSING_CONFIGURATION');throw error;}
  assert(peer.companyId===this.companyId&&(!this.expectedOrigin||peer.erpOrigin===new URL(this.expectedOrigin).origin),'MISSING_CONFIGURATION');return peer;
 }
 private async read(tokenHash:string){
  assert(hash(tokenHash),'NEEDS_REAUTH');
  return (await this.db.query('SELECT * FROM site_auth_sessions WHERE company_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND created_at<=clock_timestamp() AND expires_at>clock_timestamp()',
   [this.companyId,tokenHash])).rows[0];
 }
 proof(row:any,reductionOnly=false):RequestAuthorityProof {
  assert(row.company_id===this.companyId&&hash(row.token_hash)&&ms(row.expires_at)>Date.now(),'NEEDS_REAUTH');
  return Object.freeze({kind:'FEDERATED',companyId:this.companyId,userId:row.user_id,tokenHash:row.token_hash,
   expiresAt:ms(row.expires_at),siteDescriptorHash:siteSessionDescriptor(row),...(reductionOnly?{reductionOnly:true}:{})});
 }
 /** Only the logout handler may use this local reduction path. It yields no Actor
  * or private payload and cannot finish a transaction without an exact logout ACK. */
 async forLogout(tokenHash:string){return this.read(tokenHash);}
 async authenticate(tokenHash:string){
  const row=await this.read(tokenHash);if(!row)return undefined;
  const proof=this.proof(row);
  await this.db.transaction(this.companyId,row.user_id,tx=>this.verifyIn(tx,proof,false),5000,true);
  return row;
 }
 private input(row:any){return {companyId:this.companyId,issuer:row.issuer,audience:row.audience,subject:row.subject,
  sessionDigest:row.site_session_digest,profileVersion:row.site_profile_version,profileFingerprint:row.site_profile_fingerprint,
  trustFingerprint:row.trust_fingerprint,transportFingerprint:row.transport_fingerprint};}
 private async online(peer:FederationPeer,row:any){
  const input=this.input(row),started=Date.now();
  let value:any;
  try{value=await this.transport(peer,'site',path,input);}catch(error){
   if(error instanceof FederationError)throw new DomainError(error.code==='DEPENDENCY_UNAVAILABLE'?'DEPENDENCY_UNAVAILABLE':'NEEDS_REAUTH');
   throw error;
  }
  const now=Date.now(),keys=[...Object.keys(input),'active','expiresAt','checkedAt'];
  assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&
   Object.keys(value).every(key=>keys.includes(key))&&value.active===true&&
   Object.entries(input).every(([key,expected])=>value[key]===expected)&&
   Number.isSafeInteger(value.checkedAt)&&value.checkedAt>=started-1000&&value.checkedAt<=now+1000&&now-value.checkedAt<=3000&&
   Number.isSafeInteger(value.expiresAt)&&value.expiresAt===ms(row.site_expires_at)&&value.expiresAt>now&&value.expiresAt>=ms(row.expires_at),'NEEDS_REAUTH');
  const latest=this.configured();
  assert(transportFingerprint(latest)===transportFingerprint(peer)&&ms(row.expires_at)>Date.now(),'NEEDS_REAUTH');
 }
 private async rowIn(tx:SqlTransaction,proof:RequestAuthorityProof,allowRevoked:boolean){
  assert(proof.kind==='FEDERATED'&&proof.companyId===this.companyId&&'companyId' in tx&&tx.companyId===this.companyId&&
   'actorId' in tx&&tx.actorId===proof.userId&&tx.query&&proof.expiresAt>Date.now(),'NEEDS_REAUTH');
  const row=(await tx.query('SELECT *,clock_timestamp() AS checked_at FROM site_auth_sessions WHERE company_id=$1 AND token_hash=$2',[this.companyId,proof.tokenHash])).rows[0];
  assert(row&&row.user_id===proof.userId&&ms(row.created_at)<=ms(row.checked_at)&&ms(row.expires_at)>=proof.expiresAt&&siteSessionDescriptor(row)===proof.siteDescriptorHash&&
   (allowRevoked?row.revoked_at!=null:row.revoked_at==null),'NEEDS_REAUTH');
  return row;
 }
 async verifyIn(tx:SqlTransaction,proof:RequestAuthorityProof,allowRevoked=false):Promise<void>{
  const row=await this.rowIn(tx,proof,allowRevoked);
  // A committed self-revocation may acknowledge only its exact reduction. The
  // outer request guard enforces that contract, including outage-safe logout.
  if(allowRevoked||proof.reductionOnly)return;
  await this.currentIn(tx,proof,row);
 }
 private baseDispatchAuthority(user:Entity){
  const permissions=new Set([...(user.data.roles??[]).flatMap((role:string)=>ROLE_PERMISSIONS[role]??[]),...(user.data.permissions??[])]);
  assert(permissions.has('scope.company')&&permissions.has('dispatch.manage'),'NEEDS_REAUTH');
 }
 private async currentIn(tx:SqlTransaction,proof:RequestAuthorityProof,row:any,completion?:SelfDispatchCompletion){
  const peer=this.configured();
  assert(row.issuer===peer.issuer&&row.audience===peer.audience&&row.trust_version===peer.version&&
   row.trust_fingerprint===trustFingerprint(peer)&&row.transport_fingerprint===transportFingerprint(peer),'NEEDS_REAUTH');
  try{await this.bindings.resolveIn(tx as PgTransaction,{issuer:row.issuer,audience:row.audience,subject:row.subject},
   {id:row.binding_id,userId:row.user_id,version:row.binding_version,generation:row.binding_generation});}
  catch(error){if(error instanceof DomainError&&['ACCESS_DENIED','NOT_FOUND_SAFE'].includes(error.code))throw new DomainError('NEEDS_REAUTH');throw error;}
  const user=await tx.get('user',row.user_id);
  assert(user.companyId===this.companyId&&user.data.active===true&&user.data.guest!==true&&user.version===row.user_version+(completion?1:0)&&
   Array.isArray(user.data.roles)&&!user.data.roles.some((role:string)=>forbiddenRoles.has(role)),'NEEDS_REAUTH');
  if(completion){assert(authoritySnapshotHash(user)===completion.afterUserHash,'NEEDS_REAUTH');this.baseDispatchAuthority(user);}
  assert(tx.query,'MISSING_CONFIGURATION');
  const credential=(await tx.query('SELECT password_hash,totp_secret FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[this.companyId,row.user_id])).rows[0];
  assert(credential&&siteSessionSecurityFingerprint(credential)===row.security_fingerprint,'NEEDS_REAUTH');
  await this.online(peer,row);
 }
 /** Only the existing dispatch.assign may return its unchanged private contract
  * after adding the caller's own site scope. This is not the minimal-reduction
  * path: current local and signed site authority remain mandatory. */
 async completeSelfDispatchIn(tx:SqlTransaction,proof:RequestAuthorityProof,change:SelfDispatchChange,result:unknown):Promise<SelfDispatchCompletion|undefined>{
  assert(!proof.reductionOnly,'NEEDS_REAUTH');
  const before=change.before,after=await tx.get('user',proof.userId);
  if(authoritySnapshotHash(before)===authoritySnapshotHash(after))return undefined;
  const row=await this.rowIn(tx,proof,false),oldSites=before.data.siteIds??[];
  assert(before.kind==='user'&&before.id===proof.userId&&before.companyId===proof.companyId&&before.version===row.user_version&&
   before.data.active===true&&before.data.guest!==true&&Array.isArray(oldSites)&&!oldSites.includes(change.siteId),'NEEDS_REAUTH');
  this.baseDispatchAuthority(before);
  const expected={...before,version:before.version+1,updatedAt:after.updatedAt,data:{...before.data,siteIds:[...oldSites,change.siteId]}};
  assert(authoritySnapshotHash(after)===authoritySnapshotHash(expected),'NEEDS_REAUTH');
  assert(result&&typeof result==='object'&&!Array.isArray(result)&&Object.keys(result).sort().join(',')==='assignment,order','NEEDS_REAUTH');
  const value=result as {order:Entity;assignment:Entity};
  assert(value.order?.kind==='order'&&value.order.id===change.orderId&&value.assignment?.kind==='crew_assignment'&&typeof value.assignment.id==='string','NEEDS_REAUTH');
  const candidate:SelfDispatchCompletion={kind:'SELF_DISPATCH_SCOPE_EXPANSION',siteId:change.siteId,idempotencyKey:change.idempotencyKey,inputHash:change.inputHash,
   beforeVersion:before.version,afterUserHash:authoritySnapshotHash(after),resultHash:authoritySnapshotHash(result),orderId:change.orderId,reservationId:change.reservationId,assignmentId:value.assignment.id,revokedAt:0};
  await this.dispatchResultIn(tx,proof,candidate);
  assert(tx.query,'MISSING_CONFIGURATION');
  const revoked=await tx.query('UPDATE site_auth_sessions SET revoked_at=clock_timestamp() WHERE company_id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING token_hash,revoked_at',[proof.companyId,proof.userId]);
  const own=revoked.rows.find((session:any)=>session.token_hash===proof.tokenHash);
  assert(own,'NEEDS_REAUTH');
  const completion=Object.freeze({...candidate,revokedAt:ms(own.revoked_at)});
  await this.verifySelfDispatchIn(tx,proof,completion);return completion;
 }
 private async dispatchResultIn(tx:SqlTransaction,proof:RequestAuthorityProof,completion:SelfDispatchCompletion){
  assert(tx.query,'MISSING_CONFIGURATION');
  const order=await tx.get('order',completion.orderId),assignment=await tx.get('crew_assignment',completion.assignmentId),reservation=await tx.get('schedule_reservation',completion.reservationId);
  assert(order.companyId===proof.companyId&&assignment.companyId===proof.companyId&&order.data.siteId===completion.siteId&&
   order.data.assignmentId===assignment.id&&order.data.status==='CONFIRMED'&&assignment.data.orderId===order.id&&assignment.data.siteId===completion.siteId&&
   assignment.data.assignedBy===proof.userId&&Array.isArray(assignment.data.employeeIds)&&
   authoritySnapshotHash({order,assignment})===completion.resultHash,'NEEDS_REAUTH');
  assert(reservation.companyId===proof.companyId&&reservation.data.orderId===completion.orderId&&reservation.data.assignmentId===assignment.id&&reservation.data.status==='CONSUMED'&&
   reservation.data.startAt===assignment.data.startAt&&reservation.data.endAt===assignment.data.endAt&&authoritySnapshotHash(reservation.data.employeeIds)===authoritySnapshotHash(assignment.data.employeeIds),'NEEDS_REAUTH');
  let ownEmployee=false;
  for(const id of assignment.data.employeeIds){const employee=await tx.get('employee',id);
   if(employee.companyId===proof.companyId&&employee.data.active===true&&(employee.data.userId??employee.data.user_id??employee.id)===proof.userId)ownEmployee=true;
  }
  assert(ownEmployee,'NEEDS_REAUTH');
  const receipt=(await tx.query('SELECT command,input_hash,result FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',
   [proof.companyId,proof.userId,completion.idempotencyKey])).rows[0];
  assert(receipt?.command==='dispatch.assign'&&receipt.input_hash===completion.inputHash&&authoritySnapshotHash(receipt.result)===completion.resultHash,'NEEDS_REAUTH');
 }
 async verifySelfDispatchIn(tx:SqlTransaction,proof:RequestAuthorityProof,completion:SelfDispatchCompletion):Promise<void>{
  assert(completion.kind==='SELF_DISPATCH_SCOPE_EXPANSION'&&!proof.reductionOnly,'NEEDS_REAUTH');
  const row=await this.rowIn(tx,proof,true);
  assert(row.user_version===completion.beforeVersion&&ms(row.revoked_at)===completion.revokedAt,'NEEDS_REAUTH');
  await this.dispatchResultIn(tx,proof,completion);
  await this.currentIn(tx,proof,row,completion);
 }
 async ready(){
  if(this.enabled())this.configured();
  await this.db.query('SELECT token_hash,binding_id,site_session_digest FROM site_auth_sessions LIMIT 0');
 }
}
