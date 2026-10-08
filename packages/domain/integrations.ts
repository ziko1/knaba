import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assert,DomainError,id,timestamp,type CommandContext,type CommandRegistry,type Data,type Entity,type Transaction} from './core.ts';
import {integrationSourceSchema} from '../integrations/generic-events.ts';
import {validateIntegrationWebhookUrl} from '../integrations/outbound-webhook.ts';
import {validateIntegrationOutboundApproval} from './integration-approval.ts';

const text=z.string().trim().min(1).max(4000);
const externalId=z.string().min(1).max(200);
export const integrationEnvelopeSchema=z.object({schema_version:z.literal('1'),event_id:externalId,event_type:z.string().regex(/^[a-z][a-z0-9_.-]{0,99}$/),source:integrationSourceSchema,occurred_at:timestamp,external_id:externalId,payload:z.record(z.unknown())}).strict();
export type IntegrationEnvelope=z.infer<typeof integrationEnvelopeSchema>;
const contact=z.object({name:text,email:z.string().email().max(254).optional(),phone:z.string().min(5).max(40).optional()}).strict().refine(value=>!!(value.email||value.phone),'contact channel required');
/** Imported customer statements cannot verify measurements, grant consent or attach arbitrary media. */
export const integrationLeadPayloadSchema=z.object({contact,serviceIds:z.array(id).min(1).max(100).refine(values=>new Set(values).size===values.length),language:z.enum(['DE','UK','RU','PL','LT','EN']).default('DE'),
 facts:z.object({customerType:z.enum(['B2B','B2C','B2G']).optional(),propertyType:text.optional(),condition:text.optional(),address:text.optional(),area:text.optional(),quantityMilli:z.number().int().positive().max(1_000_000_000).optional(),measurementSource:z.literal('CUSTOMER_STATED').optional(),desiredPeriod:text.optional(),recurring:z.boolean().optional(),access:text.optional(),restrictions:text.optional(),locations:z.array(text).max(100).optional()}).strict().default({}),
 source:z.object({campaign:text.optional(),landingPage:z.string().url().max(2000).optional(),referralCode:id.optional()}).strict().default({})}).strict();
const configSchema=z.object({source:integrationSourceSchema,schemaVersion:z.literal('1').default('1'),eventTypes:z.array(z.literal('lead.upsert')).min(1).max(1).default(['lead.upsert']),ownerUserId:id,
 allowedServiceIds:z.array(id).min(1).max(100).refine(values=>new Set(values).size===values.length),originChannel:z.enum(['WEB','QR','AD','REFERRAL']).default('WEB'),credentialKeyIds:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).min(1).max(10).refine(values=>new Set(values).size===values.length),
 outbound:z.object({url:z.string().url().max(2000).refine(url=>{try{validateIntegrationWebhookUrl(url);return true;}catch{return false;}}),credentialKeyId:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),approvalReference:z.string().min(8).max(100)}).strict().optional()}).strict();
export const integrationConfigSchema=configSchema;
export const integrationIdentity=(category:string,source:string,identity:string)=>'int_'+createHash('sha256').update(JSON.stringify([category,source,identity])).digest('hex');
function canonical(value:any):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';}
export const integrationHash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const mapping=(config:Entity)=>configSchema.parse(Object.fromEntries(Object.keys(configSchema.shape).map(key=>[key,config.data[key]])));
function businessMappingHash(config:Entity){const {credentialKeyIds:_,outbound:__,...business}=mapping(config);return integrationHash(business);}
async function optional(tx:Transaction,kind:string,key:string):Promise<Entity|undefined>{try{return await tx.get(kind,key);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')return undefined;throw error;}}
async function validateOwnerAndServices(tx:Transaction,config:ReturnType<typeof mapping>){
 const owner=await tx.get('user',config.ownerUserId);assert(owner.data.active!==false&&owner.data.roles?.some((role:string)=>['OWNER','DIRECTOR','OPERATIONS_MANAGER'].includes(role)),'NEEDS_APPROVAL',{reason:'INTEGRATION_OWNER_UNAVAILABLE'});
 for(const serviceId of config.allowedServiceIds){const service=await tx.get('service',serviceId);assert(service.data.active===true,'NEEDS_APPROVAL',{reason:'INTEGRATION_SERVICE_UNAVAILABLE'});}
}
async function validatePayload(tx:Transaction,config:ReturnType<typeof mapping>,envelope:IntegrationEnvelope){
 assert(envelope.source===config.source&&envelope.schema_version===config.schemaVersion&&config.eventTypes.includes(envelope.event_type as 'lead.upsert'),'VALIDATION_ERROR',{reason:'UNMAPPED_EVENT'});
 const parsed=integrationLeadPayloadSchema.safeParse(envelope.payload);assert(parsed.success,'VALIDATION_ERROR',{reason:'INVALID_FIELD_MAPPING'});
 assert(parsed.data.serviceIds.every(serviceId=>config.allowedServiceIds.includes(serviceId)),'VALIDATION_ERROR',{reason:'SERVICE_NOT_MAPPED'});
 await validateOwnerAndServices(tx,config);return parsed.data;
}
function previewHash(config:Entity,example:IntegrationEnvelope,active:Entity|undefined){return integrationHash({id:config.id,configVersion:config.data.configVersion,mapping:mapping(config),example,previousActive:active?{id:active.id,version:active.version}:null});}
export const integrationCommands:CommandRegistry={
 'integration_config.create':{permission:'bot.settings.manage',schema:configSchema,handler:async(ctx,input)=>{
  await validateOwnerAndServices(ctx.tx,input);const versions=(await ctx.tx.list('integration_config')).filter(row=>row.data.source===input.source);
  return ctx.tx.add('integration_config',{...input,status:'DRAFT',configVersion:Math.max(0,...versions.map(row=>Number(row.data.configVersion)||0))+1,createdBy:ctx.actor.userId});
 }},
 'integration_config.preview':{permission:'bot.settings.manage',schema:z.object({id,example:integrationEnvelopeSchema}).strict(),handler:async(ctx,input)=>{
  const config=await ctx.tx.get('integration_config',input.id);assert(['DRAFT','PREVIEW','PAUSED'].includes(config.data.status),'INVALID_STATE');const approvedMapping=mapping(config);
  if(approvedMapping.outbound)await validateIntegrationOutboundApproval(ctx.tx,approvedMapping.source,approvedMapping.outbound,ctx.now);
  const normalized=await validatePayload(ctx.tx,approvedMapping,input.example),active=(await ctx.tx.list('integration_config')).find(row=>row.data.source===approvedMapping.source&&row.data.status==='ACTIVE');
  const digest=previewHash(config,input.example,active);const next=await ctx.tx.save(config,{...config.data,status:'PREVIEW',previewHash:digest,previewExample:input.example,previewPreviousActive:active?{id:active.id,version:active.version}:null,previewedAt:ctx.now,previewedBy:ctx.actor.userId,dryRunValidated:true},ctx.expectedVersion??config.version);
  return {config:next,command_hash:digest,expected_version:next.version,dryRun:{providerInvoked:false,businessEffects:0,targetKind:'lead',operation:'UPSERT',mappedFields:Object.keys(normalized),existingRecord:!!await optional(ctx.tx,'integration_record',integrationIdentity('record',approvedMapping.source,input.example.external_id))},expiresAt:new Date(Date.parse(ctx.now)+600000).toISOString()};
 }},
 'integration_config.activate':{permission:'bot.settings.manage',highRisk:true,schema:z.object({id,command_hash:z.string().regex(/^[a-f0-9]{64}$/),expected_version:z.number().int().positive()}).strict(),handler:async(ctx,input)=>{
  const config=await ctx.tx.get('integration_config',input.id);assert(config.version===input.expected_version&&(ctx.expectedVersion===undefined||ctx.expectedVersion===input.expected_version),'VERSION_CONFLICT');
  assert(config.data.status==='PREVIEW'&&config.data.dryRunValidated===true,'NEEDS_APPROVAL');
  const age=Date.parse(ctx.now)-Date.parse(config.data.previewedAt);assert(Number.isFinite(age)&&age>=0&&age<600000,'NEEDS_REAUTH',{reason:'INTEGRATION_PREVIEW_EXPIRED'});
  const approvedMapping=mapping(config),active=(await ctx.tx.list('integration_config')).find(row=>row.data.source===approvedMapping.source&&row.data.status==='ACTIVE');
  assert(input.command_hash===config.data.previewHash&&input.command_hash===previewHash(config,integrationEnvelopeSchema.parse(config.data.previewExample),active),'VERSION_CONFLICT',{reason:'INTEGRATION_PREVIEW_CHANGED'});
  await validatePayload(ctx.tx,approvedMapping,integrationEnvelopeSchema.parse(config.data.previewExample));
  if(approvedMapping.outbound)await validateIntegrationOutboundApproval(ctx.tx,approvedMapping.source,approvedMapping.outbound,ctx.now);
  if(active)await ctx.tx.save(active,{...active.data,status:'SUPERSEDED',supersededBy:config.id,supersededAt:ctx.now},active.version);
  const result=await ctx.tx.save(config,{...config.data,status:'ACTIVE',activatedBy:ctx.actor.userId,activatedAt:ctx.now,activationMappingHash:integrationHash(approvedMapping)},input.expected_version);
  await ctx.tx.event('integration.config_activated',{configId:result.id,source:approvedMapping.source,configVersion:result.data.configVersion});return result;
 }},
 'integration_config.pause':{permission:'bot.settings.manage',highRisk:true,schema:z.object({id,reason:text}).strict(),handler:async(ctx,input)=>{
  const config=await ctx.tx.get('integration_config',input.id);assert(config.data.status==='ACTIVE','INVALID_STATE');const result=await ctx.tx.save(config,{...config.data,status:'PAUSED',pausedAt:ctx.now,pausedBy:ctx.actor.userId,pauseReason:input.reason},ctx.expectedVersion??config.version);
  await ctx.tx.event('integration.config_paused',{configId:result.id,source:result.data.source});return result;
 }}
};

async function resolutionSnapshot(tx:Transaction,quarantine:Entity){
 const envelope=integrationEnvelopeSchema.parse(quarantine.data.envelope),configs=(await tx.list('integration_config')).filter(row=>row.data.source===envelope.source&&row.data.status==='ACTIVE');
 const config=configs.length===1?configs[0]:undefined,record=await optional(tx,'integration_record',integrationIdentity('record',envelope.source,envelope.external_id)),lead=record?await optional(tx,'lead',record.data.aggregateId):undefined,event=await optional(tx,'integration_event',integrationIdentity('event',envelope.source,envelope.event_id));
 const identity=(row:Entity|undefined)=>row?{id:row.id,version:row.version,dataHash:integrationHash(row.data)}:null;
 return {envelope,config,record,lead,event,digest:integrationHash({quarantine:{id:quarantine.id,envelopeHash:integrationHash(envelope)},config:identity(config),record:identity(record),lead:identity(lead),event:identity(event)})};
}
Object.assign(integrationCommands,{
 'integration_quarantine.preview':{permission:'bot.settings.manage',schema:z.object({id,action:z.enum(['DISCARD','RETRY']),reason:text}).strict(),handler:async(ctx:CommandContext,input:any)=>{
  const quarantine=await ctx.tx.get('integration_quarantine',input.id);assert(quarantine.data.status==='OPEN','INVALID_STATE');const snapshot=await resolutionSnapshot(ctx.tx,quarantine),digest=integrationHash({snapshot:snapshot.digest,action:input.action,reason:input.reason});
  const next=await ctx.tx.save(quarantine,{...quarantine.data,resolutionPreview:{action:input.action,reason:input.reason,snapshotHash:snapshot.digest,commandHash:digest,previewedAt:ctx.now,previewedBy:ctx.actor.userId}},ctx.expectedVersion??quarantine.version);
  return {id:next.id,command_hash:digest,expected_version:next.version,action:input.action,source:snapshot.envelope.source,currentConfig:snapshot.config?{id:snapshot.config.id,version:snapshot.config.version}:null,currentTarget:snapshot.lead?{id:snapshot.lead.id,version:snapshot.lead.version}:null,expiresAt:new Date(Date.parse(ctx.now)+600000).toISOString(),businessEffects:0};
 }},
 'integration_quarantine.resolve':{permission:'bot.settings.manage',highRisk:true,schema:z.object({id,command_hash:z.string().regex(/^[a-f0-9]{64}$/),expected_version:z.number().int().positive()}).strict(),handler:async(ctx:CommandContext,input:any)=>{
  const quarantine=await ctx.tx.get('integration_quarantine',input.id);assert(quarantine.version===input.expected_version&&(ctx.expectedVersion===undefined||ctx.expectedVersion===input.expected_version),'VERSION_CONFLICT');assert(quarantine.data.status==='OPEN'&&quarantine.data.resolutionPreview,'NEEDS_APPROVAL');
  const preview=quarantine.data.resolutionPreview,age=Date.parse(ctx.now)-Date.parse(preview.previewedAt);assert(Number.isFinite(age)&&age>=0&&age<600000,'NEEDS_REAUTH');const snapshot=await resolutionSnapshot(ctx.tx,quarantine);
  assert(preview.snapshotHash===snapshot.digest&&preview.commandHash===input.command_hash&&input.command_hash===integrationHash({snapshot:snapshot.digest,action:preview.action,reason:preview.reason}),'VERSION_CONFLICT',{reason:'QUARANTINE_PREVIEW_CHANGED'});
  let result:Data={status:'DISCARDED',businessEffects:0};
  if(preview.action==='RETRY'){
   if(!snapshot.config||snapshot.event?.data.status==='APPLIED')result={status:'UNRESOLVED',businessEffects:0,reason:snapshot.config?'ORIGINAL_EVENT_ALREADY_APPLIED':'INTEGRATION_INACTIVE'};
   else{
    const accepted=await applyEnvelope(ctx.tx,snapshot.config,snapshot.envelope,snapshot.config.data.credentialKeyIds[0],ctx.now,{quarantineId:quarantine.id,eventVersion:snapshot.event?.version});
    result={...accepted,status:accepted.status==='APPLIED'?'RESOLVED':'UNRESOLVED',businessEffects:accepted.status==='APPLIED'?1:0};
   }
  }
  const decision=await ctx.tx.add('integration_decision',{quarantineId:quarantine.id,source:snapshot.envelope.source,action:preview.action,reason:preview.reason,previewHash:input.command_hash,snapshotHash:snapshot.digest,decidedBy:ctx.actor.userId,decidedAt:ctx.now,result});
  const latest=await ctx.tx.get('integration_quarantine',quarantine.id);await ctx.tx.save(latest,{...latest.data,status:result.status==='UNRESOLVED'?'OPEN':result.status==='DISCARDED'?'DISCARDED':'RESOLVED',resolutionPreview:null,lastDecisionId:decision.id,lastDecisionAt:ctx.now},latest.version);
  await ctx.tx.event('integration.quarantine_decided',{quarantineId:quarantine.id,decisionId:decision.id,status:result.status});return {decisionId:decision.id,quarantineId:quarantine.id,...result};
 }}
} satisfies CommandRegistry);

export interface IntegrationAcceptance{event_id:string;status:'APPLIED'|'QUARANTINED';duplicate:boolean;effect_id?:string;quarantine_id?:string;reason?:string;}
async function quarantine(tx:Transaction,config:Entity,envelope:IntegrationEnvelope,hash:string,now:string,reason:string,event?:Entity):Promise<IntegrationAcceptance>{
 const quarantineId=integrationIdentity('quarantine',envelope.source,JSON.stringify([envelope.event_id,hash]));const previous=await optional(tx,'integration_quarantine',quarantineId);
 if(!previous){await tx.add('integration_quarantine',{source:envelope.source,eventId:envelope.event_id,externalId:envelope.external_id,eventHash:hash,configId:config.id,configVersion:config.data.configVersion,reason,status:'OPEN',receivedAt:now,envelope},quarantineId);await tx.event('integration.quarantined',{quarantineId,source:envelope.source,eventId:envelope.event_id,reason});}
 if(!event)await tx.add('integration_event',{source:envelope.source,eventId:envelope.event_id,externalId:envelope.external_id,eventHash:hash,configId:config.id,status:'QUARANTINED',quarantineId,reason,receivedAt:now},integrationIdentity('event',envelope.source,envelope.event_id));
 return {event_id:envelope.event_id,status:'QUARANTINED',duplicate:!!previous,quarantine_id:quarantineId,reason};
}
/** Caller must run this in the authoritative company transaction. Acknowledgement follows commit. */
export async function applyIntegrationEnvelope(tx:Transaction,config:Entity,envelope:IntegrationEnvelope,credentialKeyId:string,now=new Date().toISOString()):Promise<IntegrationAcceptance>{return applyEnvelope(tx,config,envelope,credentialKeyId,now);}
async function applyEnvelope(tx:Transaction,config:Entity,envelope:IntegrationEnvelope,credentialKeyId:string,now:string,resolution?:{quarantineId:string;eventVersion?:number}):Promise<IntegrationAcceptance>{
 assert(config.companyId===(tx as any).companyId&&config.kind==='integration_config'&&config.data.status==='ACTIVE','NEEDS_APPROVAL',{reason:'INTEGRATION_INACTIVE'});
 const approvedMapping=mapping(config);assert(config.data.activationMappingHash===integrationHash(approvedMapping),'NEEDS_APPROVAL',{reason:'INTEGRATION_MAPPING_CHANGED'});
 assert(approvedMapping.credentialKeyIds.includes(credentialKeyId),'ACCESS_DENIED');
 const hash=integrationHash(envelope),event=await optional(tx,'integration_event',integrationIdentity('event',envelope.source,envelope.event_id));
 if(resolution){const held=await tx.get('integration_quarantine',resolution.quarantineId);assert(event&&held.data.status==='OPEN'&&held.data.resolutionPreview?.action==='RETRY'&&held.data.resolutionPreview?.snapshotHash===(await resolutionSnapshot(tx,held)).digest&&event.version===resolution.eventVersion&&event.data.status==='QUARANTINED'&&event.data.eventHash===hash,'ACCESS_DENIED');}
 if(event&&!resolution){if(event.data.eventHash!==hash)return quarantine(tx,config,envelope,hash,now,'EVENT_ID_PAYLOAD_CONFLICT',event);
  return {event_id:envelope.event_id,status:event.data.status,duplicate:true,...event.data.effectId?{effect_id:event.data.effectId}:{quarantine_id:event.data.quarantineId,reason:event.data.reason}};
 }
 let payload:z.infer<typeof integrationLeadPayloadSchema>;
 try{payload=await validatePayload(tx,approvedMapping,envelope);}catch(error){if(error instanceof DomainError||error instanceof z.ZodError)return quarantine(tx,config,envelope,hash,now,error instanceof DomainError?String(error.details.reason??error.code):'INVALID_FIELD_MAPPING',event);throw error;}
 const recordId=integrationIdentity('record',envelope.source,envelope.external_id),record=await optional(tx,'integration_record',recordId);
 const imported={contact:payload.contact,serviceIds:payload.serviceIds,facts:payload.facts,language:payload.language,source:{channel:approvedMapping.originChannel,...payload.source}};
 let lead:Entity;
 if(record){
  if(record.data.mappingHash!==businessMappingHash(config))return quarantine(tx,config,envelope,hash,now,'EXTERNAL_MAPPING_CONFLICT',event);
  const current=await optional(tx,'lead',record.data.aggregateId);
  if(!current||current.version!==record.data.aggregateVersion||integrationHash(current.data)!==record.data.aggregateHash)return quarantine(tx,config,envelope,hash,now,'INTERNAL_RECORD_CHANGED',event);
  if(Date.parse(envelope.occurred_at)<Date.parse(record.data.lastOccurredAt))return quarantine(tx,config,envelope,hash,now,'STALE_EXTERNAL_EVENT',event);
  const currentImported={contact:current.data.contact,serviceIds:current.data.serviceIds,facts:current.data.facts,language:current.data.language,source:current.data.source},changed=integrationHash(imported)!==integrationHash(currentImported);
  if(changed&&Date.parse(envelope.occurred_at)===Date.parse(record.data.lastOccurredAt))return quarantine(tx,config,envelope,hash,now,'EXTERNAL_ORDER_CONFLICT',event);
  lead=changed?await tx.save(current,{...current.data,...imported},current.version):current;
  await tx.save(record,{...record.data,aggregateVersion:lead.version,aggregateHash:integrationHash(lead.data),lastEventId:envelope.event_id,lastOccurredAt:envelope.occurred_at},record.version);
  if(changed)await tx.event('lead.integration_updated',{leadId:lead.id,source:envelope.source,eventId:envelope.event_id});
 }else{
  lead=await tx.add('lead',{...imported,status:'NEW',review_state:'NONE',ownerUserId:approvedMapping.ownerUserId,ownership:'AI_ACTIVE',marketingConsent:false,declinedUpsells:[],originals:[],createdSource:{...imported.source,integrationSource:envelope.source,externalId:envelope.external_id}});
  await tx.add('integration_record',{source:envelope.source,externalId:envelope.external_id,aggregateKind:'lead',aggregateId:lead.id,aggregateVersion:lead.version,aggregateHash:integrationHash(lead.data),mappingHash:businessMappingHash(config),lastEventId:envelope.event_id,lastOccurredAt:envelope.occurred_at},recordId);
  await tx.event('lead.created',{leadId:lead.id,channel:imported.source.channel});
 }
 const eventData={source:envelope.source,eventId:envelope.event_id,externalId:envelope.external_id,eventHash:hash,configId:config.id,configVersion:config.data.configVersion,status:'APPLIED',effectId:lead.id,credentialKeyId,receivedAt:now,...resolution?{resolvedFrom:resolution.quarantineId}:{}};
 if(event&&resolution)await tx.save(event,eventData,event.version);else await tx.add('integration_event',eventData,integrationIdentity('event',envelope.source,envelope.event_id));
 return {event_id:envelope.event_id,status:'APPLIED',duplicate:false,effect_id:lead.id};
}

/** Outbound previews disclose only this fixed business allowlist, never contact/payroll/GPS. */
export function integrationOutboundPreview(source:string,eventId:string,lead:Entity,occurredAt:string){
 return integrationEnvelopeSchema.parse({schema_version:'1',event_id:eventId,event_type:'lead.status',source,occurred_at:occurredAt,external_id:lead.id,payload:{id:lead.id,status:lead.data.status,review_state:lead.data.review_state??'NONE',language:lead.data.language}});
}
