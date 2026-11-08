import {createHash,timingSafeEqual} from 'node:crypto';
import {assert,type Data,type Entity,type Transaction} from './core.ts';
import {currentCustomerMembership} from './customer-membership.ts';

export const GUEST_TRANSFER_KIND='guest_conversation_transfer';
export const GUEST_TRANSFER_LIMIT_KIND='guest_conversation_transfer_limit';
export const GUEST_TRANSFER_ROUTE_KIND='guest_conversation_route';
export const GUEST_TRANSFER_TTL_MS=10*60*1000;
export const GUEST_TRANSFER_PREFIX='KNABA_TRANSFER';
export type TransferClaim={state:'INVALID'}|{state:'CLAIM';id:string;tokenHash:string};
export type TransferState='ISSUED'|'CLAIMED'|'CONFIRMED'|'CANCELLED'|'EXPIRED'|'CONFLICT';
export interface GuestTransferData extends Data {
 userId:string;channelId:string;sessionHash:string;tokenHash:string;phoneNumberId:string;destination:string;
 state:TransferState;issuedAt:string;expiresAt:string;
 candidate?:{sender:string;phoneNumberId:string;eventId:string;receivedAt:string;claimedAt:string};
 confirmedAt?:string;contactIdentityId?:string;
}

export function containsGuestTransfer(value:unknown):boolean{return typeof value==='string'&&/KNABA_TRANSFER/i.test(value);}
export function transferTokenHash(id:string,secret:string):string{return createHash('sha256').update(`KNABA-GUEST-TRANSFER-v1\0${id}.${secret}`).digest('hex');}
export function sameTransferHash(a:unknown,b:unknown):boolean {
 return typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
/** Reserve the whole message, including malformed codes/captions. No secret survives parsing. */
export function reserveGuestTransfer(message:unknown,text?:string):TransferClaim|undefined {
 if(!containsGuestTransfer(JSON.stringify(message)))return;
 const match=typeof text==='string'?/^KNABA_TRANSFER\s+([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.([A-Za-z0-9_-]{43})$/i.exec(text.trim()):null;
 if(!match)return {state:'INVALID'};
 const id=match[1]!.toLowerCase();return {state:'CLAIM',id,tokenHash:transferTokenHash(id,match[2]!)};
}
export function transferPending(row:Entity<GuestTransferData>,now:string):boolean {
 return ['ISSUED','CLAIMED'].includes(row.data.state)&&Date.parse(row.data.expiresAt)>Date.parse(now);
}
export function transferStatus(row:Entity<GuestTransferData>,now:string) {
 const d=row.data,state=['ISSUED','CLAIMED'].includes(d.state)&&Date.parse(d.expiresAt)<=Date.parse(now)?'EXPIRED':d.state;
 return {id:row.id,channelId:d.channelId,state,version:row.version,expiresAt:d.expiresAt,...d.candidate&&['CLAIMED','CONFIRMED'].includes(state)?{sender:`+${d.candidate.sender}`}:{}};
}
export function transferPhone(value:unknown):string|undefined {
 if(typeof value!=='string')return;const normalized=value.replace(/[^\d]/g,'');return /^\d{5,20}$/.test(normalized)?normalized:undefined;
}
function current(data:Data,now:string):boolean {
 if(data.active===false||['revokedAt','revoked_at','leftAt','left_at','removedAt','removed_at'].some(key=>data[key]!==undefined&&data[key]!==null))return false;
 return ['expiresAt','expires_at'].every(key=>data[key]===undefined||data[key]===null||typeof data[key]==='string'&&Number.isFinite(Date.parse(data[key]))&&Date.parse(data[key])>Date.parse(now));
}
export function currentTransferIdentity(row:Entity,companyId:string,userId:string,sender:string,now:string):boolean {
 return row.kind==='contact_identity'&&row.companyId===companyId&&row.data.userId===userId&&['PHONE','WHATSAPP'].includes(row.data.type)&&row.data.verified===true&&current(row.data,now)&&transferPhone(row.data.value)===sender;
}

/** This first slice transfers only an anonymous ERP guest's own private channel. */
export async function assertGuestTransferContext(tx:Transaction,companyId:string,userId:string,channelId:string,now:string) {
 const user=await tx.get('user',userId),channel=await tx.get('channel',channelId),u=user.data,c=channel.data;
 assert(user.companyId===companyId&&u.active===true&&u.guest===true&&current(u,now)&&Array.isArray(u.roles)&&u.roles.includes('GUEST')&&u.roles.every((role:string)=>['GUEST','CLIENT'].includes(role)),'ACCESS_DENIED');
 assert((u.siteIds??[]).length===0&&(u.customerIds??[]).length===0&&(u.warehouseIds??[]).length===0,'ACCESS_DENIED');
 assert(!(await tx.list('customer_membership')).some(row=>currentCustomerMembership(row,{companyId,userId},now)),'ACCESS_DENIED');
 assert(channel.companyId===companyId&&c.type==='PRIVATE_CUSTOMER_ASSISTANT'&&c.created_by===userId,'NOT_FOUND_SAFE');
 assert(!['site_id','siteId','customer_id','customerId','task_id','taskId'].some(key=>c[key]),'ACCESS_DENIED');
 assert(Array.isArray(c.members)&&c.members.some((member:Data)=>member.user_id===userId&&current(member,now)&&typeof member.history_from==='string'&&Date.parse(member.history_from)<=Date.parse(now)),'ACCESS_DENIED');
 if(c.lead_id){const lead=await tx.get('lead',c.lead_id);assert(lead.companyId===companyId&&lead.data.ownerUserId===userId&&!lead.data.customerId&&!lead.data.orderId&&!lead.data.siteId,'ACCESS_DENIED');}
 return {user,channel};
}
/** Existing bindings are immutable here, including revoked bindings to another User. */
export async function transferIdentityChoice(tx:Transaction,companyId:string,userId:string,sender:string,now:string):Promise<{conflict:boolean;identity?:Entity}> {
 const identities=(await tx.list('contact_identity')).filter(row=>row.companyId===companyId&&['PHONE','WHATSAPP'].includes(row.data.type));
 const same=identities.filter(row=>transferPhone(row.data.value)===sender);
 if(same.some(row=>!currentTransferIdentity(row,companyId,userId,sender,now)))return {conflict:true};
 if(identities.some(row=>row.data.userId===userId&&current(row.data,now)&&transferPhone(row.data.value)!==sender))return {conflict:true};
 return {conflict:false,identity:same.find(row=>row.data.type==='WHATSAPP')??same[0]};
}
