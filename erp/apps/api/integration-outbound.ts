import type {Database,PgTransaction} from './database.ts';
import {assert,DomainError,type Actor,type Entity} from '../../packages/domain/core.ts';
import {integrationOutboundSnapshot} from '../../packages/domain/integration-outbound.ts';
import {integrationHash} from '../../packages/domain/integrations.ts';
import {IntegrationWebhookAdapter} from '../../packages/integrations/outbound-webhook.ts';

export interface IntegrationOutboundJob{id:string;company_id:string;type:string;data:{deliveryId?:string};lease_token?:string;}
export interface IntegrationOutboundHost{actorIn(tx:PgTransaction,userId:string):Promise<Actor>;scope(actor:Actor,permission:string):Actor;}
export async function processIntegrationOutbound(db:Pick<Database,'transaction'>,host:IntegrationOutboundHost,job:IntegrationOutboundJob,adapter:IntegrationWebhookAdapter|undefined,now:()=>Date=()=>new Date()){
 assert(job.type==='integration.outbound_requested'&&typeof job.data.deliveryId==='string'&&typeof job.lease_token==='string','ACCESS_DENIED');
 const lock=async(tx:PgTransaction)=>{const held=await tx.query("SELECT id,type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token]);assert(held.rows.length===1,'WORKER_LEASE_LOST');assert(held.rows[0].type===job.type&&held.rows[0].data.deliveryId===job.data.deliveryId,'ACCESS_DENIED');};
 const fresh=async(tx:PgTransaction,delivery:Entity)=>{
  const actor=await host.actorIn(tx,delivery.data.approvedBy);assert(actor.companyId===tx.companyId&&host.scope(actor,'bot.settings.manage').permissions.includes('bot.settings.manage'),'ACCESS_DENIED');
  const snapshot=await integrationOutboundSnapshot(tx,delivery.data.configId,delivery.data.externalId,now().toISOString());assert(snapshot.digest===delivery.data.sourceHash,'VERSION_CONFLICT');return snapshot;
 };
 const claimed=await db.transaction<Entity|undefined>(job.company_id,'INTEGRATION_OUTBOUND',async tx=>{
  await lock(tx);const delivery=await tx.get('integration_outbound',job.data.deliveryId!);
  if(['API_ACCEPTED','FAILED','UNKNOWN','CANCELLED'].includes(delivery.data.status))return;
  if(delivery.data.status==='SENDING'){
   if(delivery.data.claimedOutboxId===job.id&&delivery.data.claimedLeaseHash===integrationHash(job.lease_token))return;
   const activePrevious=delivery.data.claimedOutboxId?(await tx.query("SELECT lease_token FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND leased_until>clock_timestamp()",[job.company_id,delivery.data.claimedOutboxId])).rows[0]:undefined;
   if(activePrevious&&integrationHash(activePrevious.lease_token)===delivery.data.claimedLeaseHash)return;
   await tx.save(delivery,{...delivery.data,status:'UNKNOWN',error:'PROVIDER_OUTCOME_UNKNOWN',unknownAt:now().toISOString()},delivery.version);return;
  }
  assert(delivery.data.status==='PENDING','INVALID_STATE');
  if(!adapter){await tx.save(delivery,{...delivery.data,status:'FAILED',error:'PROVIDER_DISABLED'},delivery.version);return;}
  try{await fresh(tx,delivery);}catch(error){if(error instanceof DomainError){await tx.save(delivery,{...delivery.data,status:'CANCELLED',error:error.code},delivery.version);return;}throw error;}
  return tx.save(delivery,{...delivery.data,status:'SENDING',sendingStartedAt:now().toISOString(),claimedOutboxId:job.id,claimedLeaseHash:integrationHash(job.lease_token)},delivery.version);
 });
 if(!claimed)return {status:'NO_SEND'};
 const outcome=await adapter!.send(job.company_id,claimed.data.source,claimed.data.credentialKeyId,claimed.data.endpoint,claimed.data.envelope,()=>db.transaction(job.company_id,'INTEGRATION_OUTBOUND',async tx=>{
  await lock(tx);const delivery=await tx.get('integration_outbound',claimed.id);assert(delivery.data.status==='SENDING'&&delivery.data.claimedLeaseHash===integrationHash(job.lease_token),'WORKER_LEASE_LOST');await fresh(tx,delivery);
 }));
 await db.transaction(job.company_id,'INTEGRATION_OUTBOUND',async tx=>{await lock(tx);const delivery=await tx.get('integration_outbound',claimed.id);assert(delivery.data.status==='SENDING'&&delivery.data.claimedLeaseHash===integrationHash(job.lease_token),'WORKER_LEASE_LOST');await tx.save(delivery,{...delivery.data,...outcome,finishedAt:now().toISOString()},delivery.version);await tx.event('integration.outbound_finished',{deliveryId:delivery.id,status:outcome.status});});
 return outcome;
}
