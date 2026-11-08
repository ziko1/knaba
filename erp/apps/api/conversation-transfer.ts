import {randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Request} from 'express';
import {AuthService,hashToken,type SqlTransaction} from './auth.ts';
import {assert,DomainError,type Actor,type Data,type Entity} from '../../packages/domain/core.ts';
import {GUEST_TRANSFER_KIND,GUEST_TRANSFER_LIMIT_KIND,GUEST_TRANSFER_ROUTE_KIND,GUEST_TRANSFER_TTL_MS,GUEST_TRANSFER_PREFIX,assertGuestTransferContext,currentTransferIdentity,sameTransferHash,transferIdentityChoice,transferPending,transferStatus,transferTokenHash,type GuestTransferData,type TransferClaim} from '../../packages/domain/conversation-transfer.ts';

const channelSchema=z.string().min(1).max(100),transferIdSchema=z.string().uuid();
const confirmSchema=z.object({expectedVersion:z.number().int().positive(),targetSender:z.string().regex(/^\+\d{5,20}$/),whatsappConsent:z.literal(true)}).strict();
export interface TransferConfiguration {publicNumber?:string;phoneNumberId?:string}
type ConfigSource=()=>TransferConfiguration;
export async function transferClock(tx:SqlTransaction):Promise<string>{assert(tx.query,'MISSING_CONFIGURATION');const row=(await tx.query('SELECT clock_timestamp() AS now')).rows[0];const date=new Date(row?.now);assert(Number.isFinite(date.getTime()),'MISSING_CONFIGURATION');return date.toISOString();}
async function optional<T extends Data=Data>(tx:SqlTransaction,kind:string,id:string):Promise<Entity<T>|undefined>{try{return await tx.get<T>(kind,id);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')return;throw error;}}
export async function assertTransferSession(tx:SqlTransaction,row:Entity<GuestTransferData>):Promise<void>{
 assert(tx.query,'MISSING_CONFIGURATION');const result=await tx.query('SELECT user_id,company_id FROM auth_sessions WHERE token_hash=$1 AND company_id=$2 AND user_id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp()',[row.data.sessionHash,row.companyId,row.data.userId]);
 assert(result.rows.length===1&&result.rows[0].user_id===row.data.userId&&result.rows[0].company_id===row.companyId,'NEEDS_REAUTH');
}
async function audit(tx:SqlTransaction,row:Entity<GuestTransferData>,action:string){assert(tx.query,'MISSING_CONFIGURATION');await tx.query('INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail) VALUES($1,$2,$3,$4,$5,$6)',[row.companyId,row.data.userId,action,GUEST_TRANSFER_KIND,row.id,JSON.stringify({state:row.data.state,channelId:row.data.channelId,...row.data.candidate?{providerEventId:row.data.candidate.eventId}:{}})]);}
async function checkCurrent(tx:SqlTransaction,row:Entity<GuestTransferData>,pending=true){
 await assertTransferSession(tx,row);const now=await transferClock(tx);if(pending)assert(transferPending(row,now),'EXPIRED');await assertGuestTransferContext(tx,row.companyId,row.data.userId,row.data.channelId,now);return now;
}

export class GuestConversationTransfers {
 constructor(private auth:AuthService,private configuration:ConfigSource=()=>({publicNumber:process.env.WHATSAPP_PUBLIC_NUMBER,phoneNumberId:process.env.WHATSAPP_PHONE_NUMBER_ID})){}
 private config(){const source=this.configuration(),destination=source.publicNumber?.trim().replace(/^\+/,'');assert(destination&&/^[1-9]\d{4,19}$/.test(destination)&&source.phoneNumberId&&/^[A-Za-z0-9_-]{1,100}$/.test(source.phoneNumberId),'MISSING_CONFIGURATION');return {destination,phoneNumberId:source.phoneNumberId};}
 private configMatches(row:Entity<GuestTransferData>){const c=this.config();assert(c.destination===row.data.destination&&c.phoneNumberId===row.data.phoneNumberId,'ACCESS_DENIED');}
 private async guest(req:Request,mutation=false){const auth=mutation?await this.auth.mutation(req,true):await this.auth.authenticate(req,true);assert(auth.guest&&!auth.device,'ACCESS_DENIED');return auth;}
 private async owned(tx:SqlTransaction,actor:Actor,sessionHash:string,channelId:string,id:string){const row=await tx.get<GuestTransferData>(GUEST_TRANSFER_KIND,transferIdSchema.parse(id));assert(row.companyId===actor.companyId&&row.data.userId===actor.userId&&row.data.channelId===channelId&&sameTransferHash(row.data.sessionHash,sessionHash),'NOT_FOUND_SAFE');await checkCurrent(tx,row,false);return row;}
 async issue(req:Request,channelId:string,input:unknown){
  channelSchema.parse(channelId);z.object({}).strict().parse(input);const {actor,token}=await this.guest(req,true),config=this.config();
  return this.auth.transaction(actor,async tx=>{
   const now=await transferClock(tx);await assertGuestTransferContext(tx,actor.companyId,actor.userId,channelId,now);
   const limit=await optional(tx,GUEST_TRANSFER_LIMIT_KIND,actor.userId);
   if(limit?.data.activeTransferId){const active=await optional<GuestTransferData>(tx,GUEST_TRANSFER_KIND,limit.data.activeTransferId);if(active){assert(!transferPending(active,now),'INVALID_STATE',{reason:'TRANSFER_ALREADY_PENDING'});if(['ISSUED','CLAIMED'].includes(active.data.state))await tx.save(active,{...active.data,state:'EXPIRED'},active.version);}}
   const sameWindow=limit&&Date.parse(now)-Date.parse(limit.data.windowStart)>=0&&Date.parse(now)-Date.parse(limit.data.windowStart)<3600000,count=sameWindow?Number(limit.data.count):0;
   assert(Number.isInteger(count)&&count>=0&&count<5,'RATE_LIMITED');
   const id=randomUUID(),secret=randomBytes(32).toString('base64url');
   const row=await tx.add<GuestTransferData>(GUEST_TRANSFER_KIND,{userId:actor.userId,channelId,sessionHash:hashToken(token),tokenHash:transferTokenHash(id,secret),...config,state:'ISSUED',issuedAt:now,expiresAt:new Date(Date.parse(now)+GUEST_TRANSFER_TTL_MS).toISOString()},id);
   const data={userId:actor.userId,windowStart:sameWindow?limit!.data.windowStart:now,count:count+1,activeTransferId:id};if(limit)await tx.save(limit,data,limit.version);else await tx.add(GUEST_TRANSFER_LIMIT_KIND,data,actor.userId);
   await audit(tx,row,'GUEST_TRANSFER_ISSUED');const current=await checkCurrent(tx,row);this.configMatches(row);
   // The URL exists only in this response. No Engine receipt, outbox or recoverable secret.
   return {...transferStatus(row,current),url:`https://wa.me/${config.destination}?text=${encodeURIComponent(`${GUEST_TRANSFER_PREFIX} ${id}.${secret}`)}`};
  });
 }
 async status(req:Request,channelId:string){
  channelSchema.parse(channelId);const {actor,token}=await this.guest(req);let available=true;try{this.config();}catch(error){if(!(error instanceof DomainError))throw error;available=false;}
  return this.auth.transaction(actor,async tx=>{const now=await transferClock(tx);await assertGuestTransferContext(tx,actor.companyId,actor.userId,channelId,now);const limit=await optional(tx,GUEST_TRANSFER_LIMIT_KIND,actor.userId);if(!limit?.data.activeTransferId)return {available,transfer:null};const current=await tx.get<GuestTransferData>(GUEST_TRANSFER_KIND,limit.data.activeTransferId);if(current.data.channelId!==channelId)return {available,transfer:null};const row=await this.owned(tx,actor,hashToken(token),channelId,current.id);return {available,transfer:transferStatus(row,await transferClock(tx))};},undefined,true);
 }
 async cancel(req:Request,channelId:string,id:string,input:unknown){
  channelSchema.parse(channelId);z.object({}).strict().parse(input);const {actor,token}=await this.guest(req,true);
  return this.auth.transaction(actor,async tx=>{const row=await this.owned(tx,actor,hashToken(token),channelId,id);assert(row.data.state!=='CONFIRMED','INVALID_STATE');if(['CANCELLED','EXPIRED','CONFLICT'].includes(row.data.state))return transferStatus(row,await transferClock(tx));const saved=await tx.save(row,{...row.data,state:'CANCELLED'},row.version) as Entity<GuestTransferData>;await audit(tx,saved,'GUEST_TRANSFER_CANCELLED');return transferStatus(saved,await checkCurrent(tx,saved,false));});
 }
 async confirm(req:Request,channelId:string,id:string,input:unknown){
  channelSchema.parse(channelId);const value=confirmSchema.parse(input),{actor,token}=await this.guest(req,true);
  return this.auth.transaction(actor,async tx=>{
   const row=await this.owned(tx,actor,hashToken(token),channelId,id);this.configMatches(row);const d=row.data;
   assert(d.candidate&&value.targetSender===`+${d.candidate.sender}`,'ACCESS_DENIED');
   const now=await transferClock(tx),choice=await transferIdentityChoice(tx,actor.companyId,actor.userId,d.candidate.sender,now);
   if(d.state==='CONFIRMED'){assert(!choice.conflict&&choice.identity&&choice.identity.id===d.contactIdentityId&&currentTransferIdentity(choice.identity,row.companyId,d.userId,d.candidate.sender,now),'ACCESS_DENIED');return transferStatus(row,now);}
   assert(d.state==='CLAIMED'&&row.version===value.expectedVersion,'VERSION_CONFLICT');await checkCurrent(tx,row);
   if(choice.conflict){const conflict=await tx.save(row,{...d,state:'CONFLICT'},row.version) as Entity<GuestTransferData>;await audit(tx,conflict,'GUEST_TRANSFER_CONFLICT');return transferStatus(conflict,await checkCurrent(tx,conflict,false));}
   const identity=choice.identity??await tx.add('contact_identity',{type:'WHATSAPP',value:d.candidate.sender,userId:actor.userId,verified:true,active:true,verificationSource:'SIGNED_META_GUEST_TRANSFER',verifiedAt:now,customerVerified:false,transferId:row.id});
   const route=await optional(tx,GUEST_TRANSFER_ROUTE_KIND,actor.userId),routeData={userId:actor.userId,channelId,transferId:row.id,contactIdentityId:identity.id,sender:d.candidate.sender,confirmedAt:now};if(route)await tx.save(route,routeData,route.version);else await tx.add(GUEST_TRANSFER_ROUTE_KIND,routeData,actor.userId);
   const setting=(await tx.list('notification_setting')).find(item=>item.data.user_id===actor.userId),lastInbound=setting?.data.last_inbound_at;
   const notificationData={...setting?.data,user_id:actor.userId,whatsapp_consent:true,opted_out:false,whatsapp_consent_scope:{kind:'CONVERSATION',channel_id:channelId,transfer_id:row.id},consent_recorded_at:now,consent_purpose:'CONTINUE_GUEST_CONVERSATION',consent_source:'DUAL_CHANNEL_GUEST_TRANSFER',consent_transfer_id:row.id,last_inbound_at:lastInbound&&lastInbound>d.candidate.receivedAt?lastInbound:d.candidate.receivedAt};
   if(setting)await tx.save(setting,notificationData,setting.version);else await tx.add('notification_setting',notificationData);
   const saved=await tx.save(row,{...d,state:'CONFIRMED',confirmedAt:now,contactIdentityId:identity.id},row.version) as Entity<GuestTransferData>;await audit(tx,saved,'GUEST_TRANSFER_CONFIRMED');
   await checkCurrent(tx,row);this.configMatches(saved);return transferStatus(saved,await transferClock(tx));
  });
 }
}

/** Internal only: caller must establish the current leased, signed inbox event first. */
export async function claimGuestTransferIn(tx:SqlTransaction,companyId:string,claim:TransferClaim,source:{id:string;sender:string;phone_number_id:string;received_at:string}) {
 if(claim.state!=='CLAIM')return;
 const row=await optional<GuestTransferData>(tx,GUEST_TRANSFER_KIND,claim.id);if(!row||row.companyId!==companyId||!sameTransferHash(row.data.tokenHash,claim.tokenHash))return;
 const d=row.data;if(d.state!=='ISSUED')return;
 let now:string;try{now=await checkCurrent(tx,row);}catch(error){if(error instanceof DomainError&&['NEEDS_REAUTH','ACCESS_DENIED','NOT_FOUND_SAFE','EXPIRED'].includes(error.code))return;throw error;}
 if(d.phoneNumberId!==source.phone_number_id||!/^\d{5,20}$/.test(source.sender)||!Number.isFinite(Date.parse(source.received_at))||Date.parse(source.received_at)<Date.parse(d.issuedAt)-30000||Date.parse(source.received_at)>Date.parse(now)+30000)return;
 const choice=await transferIdentityChoice(tx,companyId,d.userId,source.sender,now),state=choice.conflict?'CONFLICT':'CLAIMED';
 const saved=await tx.save(row,{...d,state,...choice.conflict?{}:{candidate:{sender:source.sender,phoneNumberId:source.phone_number_id,eventId:source.id,receivedAt:source.received_at,claimedAt:now}}},row.version) as Entity<GuestTransferData>;
 await audit(tx,saved,choice.conflict?'GUEST_TRANSFER_CONFLICT':'GUEST_TRANSFER_CLAIMED');await checkCurrent(tx,row);
}

/** An explicit confirmed route selects the transferred channel, without changing identities. */
export async function transferredGuestChannelIn(tx:SqlTransaction,companyId:string,userId:string,sender:string):Promise<Entity|undefined>{
 const route=await optional(tx,GUEST_TRANSFER_ROUTE_KIND,userId);if(!route)return;
 assert(route.companyId===companyId&&route.data.userId===userId&&route.data.sender===sender,'ACCESS_DENIED');
 const now=await transferClock(tx),identity=await tx.get('contact_identity',route.data.contactIdentityId);
 assert(currentTransferIdentity(identity,companyId,userId,sender,now),'ACCESS_DENIED');
 const transfer=await tx.get<GuestTransferData>(GUEST_TRANSFER_KIND,route.data.transferId);assert(transfer.companyId===companyId&&transfer.data.state==='CONFIRMED'&&transfer.data.userId===userId&&transfer.data.channelId===route.data.channelId&&transfer.data.contactIdentityId===identity.id,'ACCESS_DENIED');
 return (await assertGuestTransferContext(tx,companyId,userId,route.data.channelId,now)).channel;
}
