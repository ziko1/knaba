import {z} from 'zod';
import {assert,DomainError,id,type CommandContext,type CommandRegistry,type Data,type Entity,type Transaction} from './core.ts';
import {integrationConfigSchema,integrationHash,integrationIdentity,integrationOutboundPreview} from './integrations.ts';
import {validateIntegrationOutboundApproval} from './integration-approval.ts';

const text=z.string().trim().min(8).max(2000);
async function optional(tx:Transaction,key:string){try{return await tx.get('integration_outbound',key);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')return undefined;throw error;}}
function approvedConfig(config:Entity){const mapping=integrationConfigSchema.parse(Object.fromEntries(Object.keys(integrationConfigSchema.shape).map(key=>[key,config.data[key]])));assert(config.data.status==='ACTIVE'&&config.data.activationMappingHash===integrationHash(mapping)&&mapping.outbound&&mapping.credentialKeyIds.includes(mapping.outbound.credentialKeyId),'NEEDS_APPROVAL',{reason:'OUTBOUND_MAPPING_NOT_APPROVED'});return mapping;}
export async function integrationOutboundSnapshot(tx:Transaction,configId:string,externalId:string,now:string){
 const config=await tx.get('integration_config',configId),mapping=approvedConfig(config),record=await tx.get('integration_record',integrationIdentity('record',mapping.source,externalId));assert(record.data.aggregateKind==='lead'&&record.data.source===mapping.source&&record.data.externalId===externalId,'NOT_FOUND_SAFE');
 const lead=await tx.get('lead',record.data.aggregateId);assert(!lead.data.privacyErasedAt&&!lead.data.deletedAt&&typeof lead.data.status==='string'&&typeof lead.data.language==='string','NOT_FOUND_SAFE');
 const owner=await tx.get('user',mapping.ownerUserId);assert(owner.data.active!==false&&owner.data.roles?.some((role:string)=>['OWNER','DIRECTOR','OPERATIONS_MANAGER'].includes(role)),'NEEDS_APPROVAL',{reason:'INTEGRATION_OWNER_UNAVAILABLE'});
 const approval=await validateIntegrationOutboundApproval(tx,mapping.source,mapping.outbound!,now);
 const envelope={...integrationOutboundPreview(mapping.source,integrationIdentity('outbound_event',mapping.source,JSON.stringify([externalId,lead.version,config.id])),lead,now),external_id:externalId};
 const digest=integrationHash({config:{id:config.id,version:config.version,hash:integrationHash(config.data)},record:{id:record.id,version:record.version},lead:{id:lead.id,version:lead.version,hash:integrationHash(lead.data)},envelope:{...envelope,occurred_at:null},owner:{id:owner.id,version:owner.version},approval:{id:approval.id,version:approval.version,hash:integrationHash(approval.data)}});
 return {config,mapping,record,lead,envelope,digest};
}
export const integrationOutboundCommands:CommandRegistry={
 'integration_outbound.preview':{permission:'bot.settings.manage',schema:z.object({config_id:id,external_id:z.string().min(1).max(200)}).strict(),handler:async(ctx,input)=>{
  const snapshot=await integrationOutboundSnapshot(ctx.tx,input.config_id,input.external_id,ctx.now),key=integrationIdentity('outbound',snapshot.mapping.source,JSON.stringify([input.external_id,snapshot.lead.version,snapshot.config.id]));const existing=await optional(ctx.tx,key);
  if(existing&&!['PREVIEW','FAILED'].includes(existing.data.status))return {id:existing.id,status:existing.data.status,businessEffects:0,alreadyEnqueued:true};
  const data={status:'PREVIEW',source:snapshot.mapping.source,configId:snapshot.config.id,externalId:input.external_id,leadId:snapshot.lead.id,sourceHash:snapshot.digest,commandHash:integrationHash({sourceHash:snapshot.digest,envelope:snapshot.envelope}),envelope:snapshot.envelope,previewedAt:ctx.now,previewedBy:ctx.actor.userId,endpoint:snapshot.mapping.outbound!.url,credentialKeyId:snapshot.mapping.outbound!.credentialKeyId,approvalReference:snapshot.mapping.outbound!.approvalReference};
  const delivery=existing?await ctx.tx.save(existing,data,ctx.expectedVersion??existing.version):await ctx.tx.add('integration_outbound',data,key);
  return {id:delivery.id,status:'PREVIEW',command_hash:data.commandHash,expected_version:delivery.version,preview:data.envelope,endpoint:data.endpoint,businessEffects:0,providerInvoked:false,expiresAt:new Date(Date.parse(ctx.now)+600000).toISOString()};
 }},
 'integration_outbound.enqueue':{permission:'bot.settings.manage',highRisk:true,schema:z.object({id,command_hash:z.string().regex(/^[a-f0-9]{64}$/),expected_version:z.number().int().positive()}).strict(),handler:async(ctx,input)=>{
  const delivery=await ctx.tx.get('integration_outbound',input.id);assert(delivery.data.status==='PREVIEW'&&delivery.version===input.expected_version&&(ctx.expectedVersion===undefined||ctx.expectedVersion===input.expected_version),'VERSION_CONFLICT');const age=Date.parse(ctx.now)-Date.parse(delivery.data.previewedAt);assert(Number.isFinite(age)&&age>=0&&age<600000,'NEEDS_REAUTH');
  const snapshot=await integrationOutboundSnapshot(ctx.tx,delivery.data.configId,delivery.data.externalId,ctx.now),approvedEnvelope={...snapshot.envelope,occurred_at:delivery.data.envelope.occurred_at};assert(delivery.data.sourceHash===snapshot.digest&&delivery.data.commandHash===input.command_hash&&input.command_hash===integrationHash({sourceHash:snapshot.digest,envelope:approvedEnvelope}),'VERSION_CONFLICT',{reason:'OUTBOUND_PREVIEW_CHANGED'});
  const next=await ctx.tx.save(delivery,{...delivery.data,status:'PENDING',approvedBy:ctx.actor.userId,approvedAt:ctx.now},input.expected_version);await ctx.tx.event('integration.outbound_requested',{deliveryId:next.id});return {id:next.id,status:next.data.status};
 }},
 'integration_outbound.reconcile':{permission:'bot.settings.manage',highRisk:true,schema:z.object({id,status:z.enum(['CONFIRMED_ACCEPTED','CONFIRMED_NOT_APPLIED']),evidence_reference:text,reason:text}).strict(),handler:async(ctx,input)=>{
  const delivery=await ctx.tx.get('integration_outbound',input.id);assert(delivery.data.status==='UNKNOWN','INVALID_STATE');
  const decision=await ctx.tx.add('integration_decision',{deliveryId:delivery.id,source:delivery.data.source,action:input.status,evidenceReference:input.evidence_reference,reason:input.reason,decidedBy:ctx.actor.userId,decidedAt:ctx.now,result:{status:input.status==='CONFIRMED_ACCEPTED'?'API_ACCEPTED':'FAILED',automaticRetry:false}});
  const next=await ctx.tx.save(delivery,{...delivery.data,status:input.status==='CONFIRMED_ACCEPTED'?'API_ACCEPTED':'FAILED',reconciledBy:ctx.actor.userId,reconciledAt:ctx.now,reconciliationDecisionId:decision.id},ctx.expectedVersion??delivery.version);await ctx.tx.event('integration.outbound_reconciled',{deliveryId:next.id,decisionId:decision.id,status:next.data.status});return {id:next.id,status:next.data.status,decisionId:decision.id};
 }}
};
