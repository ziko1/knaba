import {createHash} from 'node:crypto';
import {assert,DomainError,type Actor,type Entity,type Transaction} from '../domain/core.ts';

/**
 * Guest intent only. Never creates a KNABA account, verified employee,
 * invitation token, permission, contract, or owner approval.
 * The canonical ERP user.invite and site portal remain the only onboarding.
 */
export type MessengerEnrollmentProvider='TELEGRAM'|'WHATSAPP';
export type MessengerEnrollmentState='REQUESTED'|'AWAITING_IDENTITY_PROOF'|'INVITED'|'REJECTED'|'CANCELLED'|'CLOSED';

const digest=(...parts:string[])=>createHash('sha256').update(parts.join('\u0000')).digest('hex');
const isValidTime=(value:unknown,now:number)=>!value||typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>now;
function identityValue(provider:MessengerEnrollmentProvider,value:unknown):string {
  assert(typeof value==='string'&&value.length>0&&value.length<=50,'ACCESS_DENIED');
  if(provider==='TELEGRAM'){assert(/^[1-9][0-9]{0,15}$/.test(value),'ACCESS_DENIED');return value;}
  const stripped=value.replace(/[^\d]/g,'');
  assert(/^[1-9][0-9]{7,14}$/.test(stripped),'ACCESS_DENIED');
  return stripped;
}

export async function captureMessengerWorkerInterest(
  tx:Transaction,actor:Actor,source:Entity,now:string
):Promise<{id:string;state:MessengerEnrollmentState;created:boolean}>{
  return captureMessengerRegistrationInterest(tx,actor,source,now,'WORKER');
}

/** The same verified guest-only boundary is reused for partner enquiries.
 * No account, contract, employee record or partner rights are created here.
 */
export async function captureMessengerPartnerInterest(
  tx:Transaction,actor:Actor,source:Entity,now:string
):Promise<{id:string;state:MessengerEnrollmentState;created:boolean}>{
  return captureMessengerRegistrationInterest(tx,actor,source,now,'PARTNER');
}

async function captureMessengerRegistrationInterest(
  tx:Transaction,actor:Actor,source:Entity,now:string,relationship:'WORKER'|'PARTNER'
):Promise<{id:string;state:MessengerEnrollmentState;created:boolean}>{
  assert(source.kind==='conversation_input'&&source.companyId===actor.companyId&&
    source.data.user_id===actor.userId&&source.data.status==='PENDING'&&
    source.data.input?.kind==='MESSAGE'&&source.data.input.id===source.data.provider_event_id,
    'ACCESS_DENIED');
  assert(Number.isFinite(Date.parse(now)),'VALIDATION_ERROR');
  const provider=source.data.provider;
  assert(provider==='WHATSAPP'||provider==='TELEGRAM','ACCESS_DENIED');
  const user=await tx.get('user',actor.userId);
  assert(user.companyId===actor.companyId&&user.data.active===true&&user.data.guest===true&&
    Array.isArray(user.data.roles)&&user.data.roles.includes('GUEST')&&
    user.data.roles.every((role:string)=>role==='GUEST'||provider==='WHATSAPP'&&role==='CLIENT')&&
    actor.roles.every(role=>role==='GUEST'||provider==='WHATSAPP'&&role==='CLIENT')&&
    actor.siteIds.length===0&&actor.customerIds.length===0&&actor.warehouseIds.length===0,
    'ACCESS_DENIED');
  const sender=identityValue(provider,source.data.input.sender),nowMs=Date.parse(now);
  const identities=(await tx.list('contact_identity')).filter(row=>{
    if(row.companyId!==actor.companyId)return false;
    if(row.data.type!==provider||row.data.active===false||row.data.verified!==true||
       row.data.revokedAt||row.data.revoked_at||
       !isValidTime(row.data.expiresAt,nowMs)||!isValidTime(row.data.expires_at,nowMs))return false;
    try{return identityValue(provider,row.data.value)===sender;}catch{return false;}
  });
  assert(identities.length===1&&identities[0]!.data.userId===actor.userId,'ACCESS_DENIED');
  const aggregateKind=relationship==='WORKER'?'worker_registration_interest':'partner_registration_interest';
  const id=digest(relationship==='WORKER'?'knaba-guest-worker-interest-v1':'knaba-guest-partner-interest-v1',
    actor.companyId,provider,sender);
  try {
    const old=await tx.get(aggregateKind,id);
    assert(old.companyId===actor.companyId&&old.data.source_provider===provider&&
      old.data.guest_user_id===actor.userId&&old.data.contact_identity_id===identities[0]!.id,
      'ACCESS_DENIED');
    assert(['REQUESTED','AWAITING_IDENTITY_PROOF','INVITED','REJECTED','CANCELLED','CLOSED'].includes(old.data.state),'INVALID_STATE');
    return {id:old.id,state:old.data.state as MessengerEnrollmentState,created:false};
  }catch(error){
    if(!(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE'))throw error;
  }
  const row=await tx.add(aggregateKind,{
    source_provider:provider,guest_user_id:actor.userId,contact_identity_id:identities[0]!.id,
    channel_id:source.data.channel_id??null,source_input_id:source.id,
    state:'REQUESTED',created_at:now,
    requires_verified_portal_identity:true,requires_owner_review:true,
    roles_granted:[],site_ids_granted:[],employee_created:false,partner_created:false,
    requested_relationship:relationship
  },id);
  await tx.event(relationship==='WORKER'?'worker.registration_requested':'partner.registration_requested',
    {request_id:row.id,source_provider:provider,
    channel_id:source.data.channel_id??null});
  return {id:row.id,state:'REQUESTED',created:true};
}
