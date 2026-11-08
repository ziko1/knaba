import {isDeepStrictEqual} from 'node:util';
import type {Database} from '../api/database.ts';
import type {Engine} from '../api/engine.ts';
import type {OutboxJob} from './runner.ts';
import type {WhatsAppInbound} from '../../packages/integrations/whatsapp.ts';
import {assert} from '../../packages/domain/core.ts';
import {reserveGuestTransfer} from '../../packages/domain/conversation-transfer.ts';
import {claimGuestTransferIn} from '../api/conversation-transfer.ts';

/** Only a current leased event in the existing verified Meta inbox may claim a transfer. */
export async function processGuestConversationTransfer(db:Database,engine:Engine,job:OutboxJob,input:Extract<WhatsAppInbound,{kind:'MESSAGE'}>,serviceId:string){
 return db.transaction(job.company_id,serviceId,async tx=>{
  const check=async()=>{const held=await tx.query("SELECT id,type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token??null]);const row=held.rows[0];assert(row,'WORKER_LEASE_LOST');assert(['whatsapp.inbound','whatsapp.webhook_received'].includes(row.type)&&row.type===job.type&&row.data.provider==='WHATSAPP'&&row.data.event_id===job.data.event_id&&job.data.provider==='WHATSAPP','ACCESS_DENIED');};
  await check();const service=await engine.actorIn(tx,serviceId);assert(service.roles.includes('SERVICE_ACCOUNT')&&engine.scope(service,'integration.process').permissions.includes('integration.process'),'ACCESS_DENIED');
  const source=await tx.query("SELECT payload FROM webhook_inbox WHERE provider='WHATSAPP' AND company_id=$1 AND event_id=$2",[job.company_id,job.data.event_id]);assert(source.rows.length===1&&isDeepStrictEqual(source.rows[0].payload,input),'ACCESS_DENIED');
  const claim=input.transfer??reserveGuestTransfer(input,input.type==='text'?input.text:undefined);assert(claim,'ACCESS_DENIED');
  // Also quarantine a reserved message queued by an older parser before this deploy.
  if(!input.transfer){const safe={kind:'MESSAGE',id:input.id,phone_number_id:input.phone_number_id,sender:input.sender,received_at:input.received_at,type:'transfer',transfer:claim};await tx.query("UPDATE webhook_inbox SET payload=$1 WHERE provider='WHATSAPP' AND company_id=$2 AND event_id=$3",[JSON.stringify(safe),job.company_id,job.data.event_id]);}
  await claimGuestTransferIn(tx,job.company_id,claim,input);await check();
 });
}
