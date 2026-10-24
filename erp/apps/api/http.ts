import {queueHandoffSla} from '../../packages/domain/handoff-calendar.ts';
import {deviceBatchSchema} from './device-batch.ts';
import {executeV4Rest,parseV4PageQuery,encodeV4Cursor,paginateV4Entities,v4HttpError,v4OpenApiPaths} from './v4-rest.ts';
import {acceptIntegrationEvent} from './integration-events.ts';
import {executeDeviceBatch} from './device-batch.ts';
import type {IntegrationCredential} from '../../packages/integrations/generic-events.ts';
import {assertMediaSize} from '../../packages/storage/media-limits.ts';
import {mediaUploadSchema,mediaUploadKey,authorizeMediaUpload,replayMediaUpload,persistMediaUpload} from './media-upload.ts';
import 'reflect-metadata';
import {confirmAssistantLeadDraft} from '../../packages/integrations/assistant-tools.ts';
import {assistantToolHost} from './assistant-runtime.ts';
import {mobileShiftSummary} from './mobile-shift-summary.ts';
import {authorityFingerprint} from './authority-fingerprint.ts';
import { Controller,Get,Post,Param,Body,Req,Res,Inject,Module,Catch,UseFilters,type DynamicModule,type ArgumentsHost,type ExceptionFilter } from '@nestjs/common';
import type { Request,Response } from 'express';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { z,ZodError } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import sharp from 'sharp';
import {parseLocationImport} from '../../packages/imports/locations.ts';
import {privacyExportBytes} from '../../packages/domain/governance.ts';
import {scanPdf} from '../../packages/integrations/media-scanner.ts';
import {createPrivateBlobStore,type PrivateBlobStore,type BlobReceipt,type BlobSql} from '../../packages/storage/index.ts';
import {archiveReportArtifact,type ReportArtifactFormat} from './exporters.ts';
import { assert,DomainError,isManager,type Actor,type Data,type Entity } from '../../packages/domain/core.js';
import { activateInvitation,permits } from '../../packages/domain/identity.js';
import { AuthService,RateLimiter,hashToken,opaqueToken,sameOrigin,type DatabaseLike,type EngineLike,type AuthOptions } from './auth.js';

export interface ApiRuntime extends AuthOptions {db:DatabaseLike;engine:EngineLike;buildSha:string;version?:string;integrationStatus?:Record<string,string>;storage?:PrivateBlobStore;integrationCredentials?:IntegrationCredential[]}
export const API_RUNTIME='KNABA_API_RUNTIME';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
 catch(error:any,host:ArgumentsHost){const res=host.switchToHttp().getResponse<Response>();if(res.headersSent)return;const result=v4HttpError(error);res.status(result.status).json(result.body);}
}
export function moneyDisplay(value:number){assert(Number.isSafeInteger(value),'VALIDATION_ERROR');const n=BigInt(value),absolute=n<0n?-n:n;return `${n<0n?'-':''}${absolute/100n},${String(absolute%100n).padStart(2,'0')} EUR`;}
export function csvCell(value:unknown){let text=String(value??'');if(typeof value==='string'&&/^\s*[=+@-]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;}
const envelopeSchema=z.object({input:z.unknown().default({}),expected_version:z.number().int().positive().optional(),idempotency_key:z.string().min(8).max(200)}).strict();
const source=z.object({channel:z.literal('WEB').default('WEB'),landingPage:z.string().max(1000).optional(),campaign:z.string().max(200).optional()}).strict();
const language=z.enum(['DE','UK','RU','PL','LT','EN']);
const publicLeadSchema=z.object({contact:z.object({name:z.string().trim().min(1).max(200),email:z.string().email().max(200),phone:z.string().min(5).max(40).optional()}).strict(),text:z.string().trim().min(3).max(4000),language:language.default('DE'),source:source.default({channel:'WEB'}),requestHuman:z.boolean().default(false),contactConsent:z.literal(true),serviceIds:z.array(z.string().min(1).max(100)).max(20).optional()}).strict();

@Controller('api/v1')
@UseFilters(ApiExceptionFilter)
export class ApiController {
 private cursorKey:Buffer=randomBytes(32);
 private auth:AuthService;private storage:PrivateBlobStore;private publicLimiter=new RateLimiter(15,60000);private mutationLimiter=new RateLimiter(120,60000);private streams=new Map<string,number>();private uploadLimiter=new RateLimiter(4,60000);private activeUploads=0;
 constructor(@Inject(API_RUNTIME) private runtime:ApiRuntime){this.auth=new AuthService(runtime.db,runtime.engine,runtime);this.storage=runtime.storage??createPrivateBlobStore(runtime.db);if(runtime.encryptionKey)this.cursorKey=createHash('sha256').update('KNABA-V4-CURSOR\0').update(runtime.encryptionKey).digest();}
 private async actor(req:Request,mutation=false){const auth=mutation?await this.auth.mutation(req):await this.auth.authenticate(req);if(mutation)this.mutationLimiter.check(hashToken(auth.actor.userId));return auth;}
 @Get('health')health(){return {ok:true,application:'KNABA DE',mode:this.runtime.appMode,apiVersion:1};}
 @Get('ready')async ready(@Res({passthrough:true})res:Response){try{await this.runtime.db.query('SELECT knaba_assert_gps_storage_safe($1::text)',[this.runtime.companyId]);await this.runtime.db.query('SELECT token_hash FROM auth_sessions LIMIT 0');await this.runtime.db.transaction(this.runtime.companyId,'READINESS',async tx=>{assert((await tx.list('company')).some(c=>c.id===this.runtime.companyId),'MISSING_CONFIGURATION');if(this.runtime.appMode==='PRODUCTION')assert((await tx.list('user')).some(u=>u.data.active&&u.data.roles?.includes('OWNER')),'MISSING_CONFIGURATION');});return {ready:true,database:'CONNECTED',mode:this.runtime.appMode,integrations:this.integrationStatus()};}catch{res.status(503);return {ready:false,code:'MISSING_CONFIGURATION'};}}
 @Get('version')version(){return {version:this.runtime.version??'0.1.0',sha:this.runtime.buildSha,gitSha:this.runtime.buildSha,apiVersion:1,mode:this.runtime.appMode};}
 @Post('auth/login')login(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:unknown){return this.auth.login(req,res,body);}
 @Post('auth/demo')demo(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:unknown){return this.auth.demo(req,res,body);}
 @Post('auth/logout')logout(@Req()req:Request,@Res({passthrough:true})res:Response){return this.auth.logout(req,res);}
 @Get('me')async me(@Req()req:Request){const a=await this.actor(req);return {actor:a.actor,user:await this.auth.profile(a.actor),csrfToken:a.csrfToken,mode:this.runtime.appMode,version:this.runtime.buildSha};}
 @Post('auth/activate')async activate(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:any){sameOrigin(req,this.runtime.publicOrigin);this.publicLimiter.check(hashToken(`invite:${req.ip??'unknown'}`));const result=await this.runtime.db.transaction(this.runtime.companyId,'INVITATION_ACTIVATION',tx=>activateInvitation(tx,this.runtime.companyId,body,new Date().toISOString(),this.runtime.encryptionKey));const mfa=Boolean(body.totpSecret&&body.otp);const session=await this.auth.createSession(result.userId,false,mfa);this.auth.cookie(res,session.token);const actor=await this.runtime.engine.getActor(result.userId,this.runtime.companyId);return {actor:{...actor,mfaVerified:mfa},user:await this.auth.profile(actor),csrfToken:session.csrfToken,mode:this.runtime.appMode,reauthenticationRequired:false};}
 @Get('commands')async commands(@Req()req:Request){const {actor}=await this.actor(req);return {items:Object.entries(this.runtime.engine.registry).filter(([,def])=>permits(actor.permissions,def.permission)).map(([name,def])=>({name,permission:def.permission,highRisk:!!def.highRisk,schema:zodToJsonSchema(def.schema,{$refStrategy:'none'})}))};}
 @Post('commands/:name')async command(@Req()req:Request,@Param('name')name:string,@Body()body:unknown){const {actor}=await this.actor(req,true);return this.runtime.engine.execute(actor,name,(()=>{const e=envelopeSchema.parse(body);return {input:e.input??{},expected_version:e.expected_version,idempotency_key:e.idempotency_key};})());}
 @Post('commands')async nativeCommand(@Req()req:Request,@Body()body:unknown){const {actor}=await this.actor(req,true);const value=envelopeSchema.extend({command:z.string().min(1).max(100)}).parse(body);const {command,...envelope}=value;return this.runtime.engine.execute(actor,command,{...envelope,input:envelope.input??{}});}
 private async entityPage(req:Request,kind:string,channelId?:string){const {actor}=await this.actor(req);const binding={companyId:actor.companyId,userId:actor.userId,resource:channelId?`messages:${channelId}`:`entities:${kind}`};const page=parseV4PageQuery(req.query,binding,this.cursorKey);
  if(this.runtime.engine.readEntitiesPage){const result=await this.runtime.engine.readEntitiesPage(actor,kind,page,channelId);return {items:result.items,limit:page.limit,has_more:result.has_more,next_cursor:result.has_more&&result.cursorAfter?encodeV4Cursor(binding,page,result.cursorAfter,this.cursorKey):null};}
  assert(!channelId,'MISSING_CONFIGURATION');return paginateV4Entities(await this.runtime.engine.readEntities(actor,kind),page,binding,this.cursorKey);
 }
 @Get('entities/:kind')async entities(@Req()req:Request,@Param('kind')kind:string){return this.entityPage(req,kind);}
 @Get('channels/:id/messages')async channelMessages(@Req()req:Request,@Param('id')id:string){return this.entityPage(req,'message',id);}
 @Get('operations/:id')async operationStatus(@Req()req:Request,@Param('id')id:string){const {actor}=await this.actor(req);return this.runtime.db.transaction(actor.companyId,actor.userId,async tx=>{assert(this.runtime.engine.actorIn&&this.runtime.engine.visible,'MISSING_CONFIGURATION');const fresh=await this.runtime.engine.actorIn(tx,actor.userId),operation=await tx.get('translation_request',id);assert(await this.runtime.engine.visible(tx,fresh,operation),'NOT_FOUND_SAFE');return {operation_id:id,status:operation.data.status,resource_id:operation.data.translation_id??null};});}

 @Get('audit')async audit(@Req()req:Request){return this.entityPage(req,'audit_log');}
 private integrationStatus(){return this.runtime.integrationStatus??{whatsapp:process.env.WHATSAPP_ACCESS_TOKEN?'CONFIGURED_PENDING_LIVE':'BLOCKED_EXTERNAL',ai:process.env.DEEPSEEK_API_KEY?'CONFIGURED_PENDING_APPROVAL':'BLOCKED_EXTERNAL',gps:'BLOCKED_EXTERNAL'};}
 @Get('dashboard')async dashboard(@Req()req:Request){const {actor}=await this.actor(req);const kinds=['decision','site','task','shift','lead','order','material_request','notification'];const rows=await Promise.all(kinds.map(async kind=>{try{return await this.runtime.engine.readEntities(actor,kind);}catch(error){if(error instanceof DomainError&&error.code==='ACCESS_DENIED')return [];throw error;}}));const by=Object.fromEntries(kinds.map((kind,index)=>[kind,rows[index]]));return {counts:Object.fromEntries(kinds.map(k=>[k,by[k]?.length??0])),openDecisions:by.decision?.filter((e:Entity)=>e.data.status==='OPEN').length??0,activeSites:by.site?.filter((e:Entity)=>e.data.active!==false).length??0,activeShifts:by.shift?.filter((e:Entity)=>e.data.state==='ACTIVE').length??0,integrationStatus:this.integrationStatus(),updatedAt:new Date().toISOString()};}
 @Get('events')async events(@Req()req:Request,@Res()res:Response){
  const {actor}=await this.actor(req);
  const fingerprint=(current:Actor)=>this.runtime.db.transaction(current.companyId,current.userId,tx=>authorityFingerprint(tx,this.runtime.engine,current,new Date().toISOString()),10000,true);
  const baseline=await fingerprint(actor),count=this.streams.get(actor.userId)??0;assert(count<2,'RATE_LIMITED');
  this.streams.set(actor.userId,count+1);
  res.set({'Content-Type':'text/event-stream','Cache-Control':'private, no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  let closed=false,polling=false,last='';let interval:ReturnType<typeof setInterval>,timeout:ReturnType<typeof setTimeout>;
  const finish=()=>{if(closed)return;closed=true;clearInterval(interval);clearTimeout(timeout);this.streams.set(actor.userId,Math.max(0,(this.streams.get(actor.userId)??1)-1));res.end();};
  const revoke=()=>{if(!closed)res.write('event: access_revoked\ndata: {"code":"NEEDS_REAUTH"}\n\n');finish();};
  const poll=async()=>{
   if(closed||polling)return;polling=true;
   try{
    const auth=await this.auth.authenticate(req);
    if(closed)return;
    if(await fingerprint(auth.actor)!==baseline){revoke();return;}
    const rows=await Promise.all(['message','notification'].map(async kind=>{try{return await this.runtime.engine.readEntities(auth.actor,kind);}catch(error){if(error instanceof DomainError&&error.code==='ACCESS_DENIED')return [];throw error;}}));
    const data=rows.flat().map(e=>({id:e.id,kind:e.kind,version:e.version}));
    const digest=createHash('sha256').update(JSON.stringify(data)).digest('hex');
    if(digest!==last&&!closed){last=digest;res.write(`event: update\ndata: ${JSON.stringify({revision:digest,records:data})}\n\n`);}else if(!closed)res.write(': heartbeat\n\n');
   }catch{revoke();}finally{polling=false;}
  };
  interval=setInterval(()=>{void poll();},3000);timeout=setTimeout(finish,60000);req.once('close',finish);void poll();
 }

 @Get('openapi.json')async openapi(@Req()req:Request){const {actor}=await this.actor(req);const paths:Data={};for(const [name,def]of Object.entries(this.runtime.engine.registry))if(permits(actor.permissions,def.permission))paths[`/api/v1/commands/${name}`]={post:{operationId:name.replaceAll('.','_'),summary:name,'x-permission':def.permission,'x-high-risk':!!def.highRisk,requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required:['input','idempotency_key'],properties:{input:zodToJsonSchema(def.schema,{$refStrategy:'none'}),expected_version:{type:'integer',minimum:1},idempotency_key:{type:'string',minLength:8,maxLength:200}}}}}},responses:{'200':{description:'Atomic command result'},'400':{description:'Typed validation error'},'401':{description:'Authentication or approval required'},'403':{description:'Access denied'},'409':{description:'State/version conflict'}}}};Object.assign(paths,v4OpenApiPaths(Object.fromEntries(Object.entries(this.runtime.engine.registry).filter(([,def])=>permits(actor.permissions,def.permission))),{...(permits(actor.permissions,'media.upload')?{mediaUpload:zodToJsonSchema(mediaUploadSchema,{$refStrategy:'none'})}:{}),deviceBatch:zodToJsonSchema(deviceBatchSchema,{$refStrategy:'none'})}));return {openapi:'3.1.0',info:{title:'KNABA DE API',version:'1.0.0'},paths};}
 @Get('public/config')async publicConfig(){const data=await this.runtime.db.transaction(this.runtime.companyId,'PUBLIC_CONFIG',async tx=>{const company=await tx.get('company',this.runtime.companyId);const services=(await tx.list('service')).filter(s=>s.data.active&&(s.data.approvedBy||this.runtime.appMode==='DEMO')).map(s=>({id:s.id,name:s.data.name,description:s.data.description,unit:s.data.unit,included:s.data.included,excluded:s.data.excluded}));return {company:company.data,services};});const whatsappNumber=process.env.WHATSAPP_PUBLIC_NUMBER?.replace(/[^\d]/g,'');return {name:'KNABA DE',mode:this.runtime.appMode,demoEnabled:this.runtime.appMode==='DEMO',demoRoles:this.runtime.appMode==='DEMO'?['OWNER','DIRECTOR','INTERNAL_BAULEITER','EMPLOYEE','STOREKEEPER','ACCOUNTANT','CLIENT']:[],languages:['DE','UK','RU','PL','LT','EN'],services:data.services,aiNotice:'Sie sprechen mit einem KI-Assistenten. Menschliche Unterstützung ist jederzeit verfügbar.',whatsappUrl:whatsappNumber?`https://wa.me/${whatsappNumber}`:undefined,legal:{impressumUrl:data.company.impressumUrl,privacyUrl:data.company.privacyUrl},integrations:this.integrationStatus()};}
 private async guest(req:Request,res:Response){try{return await this.auth.authenticate(req,true);}catch(error){if(!(error instanceof DomainError)||error.code!=='NEEDS_REAUTH')throw error;}const user=await this.runtime.db.transaction(this.runtime.companyId,'PUBLIC_GUEST',tx=>tx.add('user',{name:'Private guest',roles:['GUEST','CLIENT'],permissions:['lead.create','lead.manage','commerce.read','assistant.read','chat.write','chat.read'],siteIds:[],warehouseIds:[],customerIds:[],active:true,guest:true,expiresAt:new Date(Date.now()+86400000).toISOString()}));const session=await this.auth.createSession(user.id,true,false);this.auth.cookie(res,session.token,true);const actor=await this.runtime.engine.getActor(user.id,this.runtime.companyId);return {actor,token:session.token,csrfToken:session.csrfToken,guest:true,device:undefined};}
 @Post('public/leads')async publicLead(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:unknown){sameOrigin(req,this.runtime.publicOrigin);this.publicLimiter.check(hashToken(`lead:${req.ip??'unknown'}`));const input=publicLeadSchema.parse(body),{actor,csrfToken}=await this.guest(req,res);const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');const lead=await this.runtime.db.transaction(actor.companyId,actor.userId,async tx=>{const existing=(await tx.list('lead')).find(l=>l.data.ownerUserId===actor.userId&&l.data.submissionHash===digest&&['NEW','QUALIFYING','HUMAN_REVIEW_REQUIRED'].includes(l.data.status));if(existing)return existing;const activeServices=await tx.list('service');const serviceIds=input.serviceIds??[];assert(serviceIds.every(serviceId=>activeServices.some(s=>s.id===serviceId&&s.data.active)),'VALIDATION_ERROR');const lead=await tx.add('lead',{contact:input.contact,serviceIds,source:input.source,createdSource:input.source,language:input.language,facts:{},status:'NEW',review_state:input.requestHuman?'HUMAN_REVIEW_REQUIRED':'NONE',ownership:input.requestHuman?'HANDOFF_PENDING':'AI_ACTIVE',ownerUserId:actor.userId,marketingConsent:false,contactConsent:{purpose:'RESPOND_TO_REQUEST',givenAt:new Date().toISOString()},declinedUpsells:[],originals:[{text:input.text,language:input.language}],requestText:input.text,submissionHash:digest});await tx.event('lead.created',{leadId:lead.id,channel:'WEB',guest:true});if(input.requestHuman)await tx.add('decision',{status:'OPEN',reason:'PUBLIC_HUMAN_REQUEST',leadId:lead.id,ownerId:'UNASSIGNED',sources:[lead.id],actions:['APPROVE','RETURN','DELEGATE'],summaryDE:'Kunde bittet um einen menschlichen Ansprechpartner.',history:[]});return lead;});return {id:lead.id,reference:lead.id,status:lead.data.status,csrfToken,marketingConsent:false,message:input.language==='UK'?'Ваш запит збережено. Компанія уточнить обсяг і можливий час.':'Ihre Anfrage wurde gespeichert. Umfang und Termin werden gesondert bestätigt.'};}
 @Post('public/chat')async publicChat(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:unknown){
  sameOrigin(req,this.runtime.publicOrigin);this.publicLimiter.check(hashToken(`chat:${req.ip??'unknown'}`));
  const i=z.object({text:z.string().trim().min(1).max(4000),language:language.default('DE'),leadId:z.string().optional(),requestHuman:z.boolean().default(false)}).strict().parse(body);
  const {actor,csrfToken}=await this.guest(req,res);
  return this.runtime.db.transaction(actor.companyId,actor.userId,async tx=>{
   let lead:Entity|undefined;if(i.leadId){lead=await tx.get('lead',i.leadId);assert(lead.data.ownerUserId===actor.userId,'NOT_FOUND_SAFE');}
   let channel=(await tx.list('channel')).find(ch=>ch.data.type==='PRIVATE_CUSTOMER_ASSISTANT'&&ch.data.created_by===actor.userId&&(!i.leadId||ch.data.lead_id===i.leadId));
   if(!channel){channel=await tx.add('channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',name:'Private consultation',created_by:actor.userId,lead_id:i.leadId,members:[],history_policy:'FROM_JOIN',handoff:{state:'AI_ACTIVE',owner_id:null}});channel=await tx.save(channel,{...channel.data,members:[{user_id:actor.userId,joined_at:channel.createdAt,history_from:channel.createdAt,external:true}]},channel.version);}
   const message=await tx.add('message',{channel_id:channel.id,text:i.text,language:i.language,author_id:actor.userId,message_version:1,revisions:[{version:1,text:i.text,language:i.language,edited_at:new Date().toISOString(),editor_id:actor.userId}],source:'HUMAN',visibility:'EXTERNAL',attachment_ids:[],mention_ids:[],acknowledgements:[],important:false});
   const config=(await tx.list('assistant_config')).find(c=>c.data.status==='ACTIVE');
   const providerReady=Boolean(config&&config.data.provider==='DEEPSEEK'&&process.env.DEEPSEEK_API_KEY);
   const ownedByHuman=channel.data.handoff?.state==='HUMAN_ACTIVE',wasPending=channel.data.handoff?.state==='HANDOFF_PENDING';
   const newHandoff=!ownedByHuman&&!wasPending&&(i.requestHuman||!providerReady);
   if(newHandoff){
    const reason=i.requestHuman?'CUSTOMER_REQUESTED_HUMAN':'AI_PROVIDER_UNAVAILABLE';
    channel=await tx.save(channel,{...channel.data,handoff:{state:'HANDOFF_PENDING',owner_id:null,reason,requested_at:new Date().toISOString(),source_message_id:message.id}},channel.version);
    channel=await queueHandoffSla(tx,channel,new Date().toISOString());
    if(lead&&lead.data.ownership!=='HUMAN_ACTIVE')await tx.save(lead,{...lead.data,ownership:'HANDOFF_PENDING',review_state:'HUMAN_REVIEW_REQUIRED'},lead.version);
    await tx.event('conversation.handoff_requested',{channelId:channel.id,leadId:i.leadId,actorId:actor.userId,reason});
   }
   const human=ownedByHuman||wasPending||newHandoff||Boolean(lead&&lead.data.ownership!=='AI_ACTIVE');
   if(!human&&providerReady&&config)await tx.event('assistant.answer_requested',{channelId:channel.id,messageId:message.id,actorId:actor.userId,configId:config.id,configVersion:config.data.configVersion,language:i.language,sourceChannel:'WEB'});
   const status=!providerReady&&!i.requestHuman&&!ownedByHuman&&!wasPending?'MANUAL_FALLBACK':human?'HANDOFF_PENDING':'QUEUED';
   return {channelId:channel.id,messageId:message.id,csrfToken,status,providerStatus:process.env.DEEPSEEK_API_KEY?'CONFIGURED_PENDING_APPROVAL':'BLOCKED_EXTERNAL',message:human?'Ihre Anfrage wird an einen Menschen übergeben.':'Ihre Nachricht wurde privat gespeichert. Bestätigte Dienstleistungen können Sie im Kontaktformular auswählen; bei fehlender KI-Verbindung hilft ein Mensch.'};
  });
 }
 @Get('public/chat/:channelId/messages')async publicMessages(@Req()req:Request,@Param('channelId')channelId:string){
  const auth=await this.auth.authenticate(req,true);
  await this.runtime.db.transaction(auth.actor.companyId,auth.actor.userId,async tx=>{const channel=await tx.get('channel',channelId);assert(channel.data.type==='PRIVATE_CUSTOMER_ASSISTANT'&&channel.data.created_by===auth.actor.userId,'NOT_FOUND_SAFE');});
  const items=await this.runtime.engine.execute(auth.actor,'message.read',{input:{channel_id:channelId,limit:100},idempotency_key:`guest-read:${randomUUID()}`});
  const pendingDrafts=await this.runtime.db.transaction(auth.actor.companyId,auth.actor.userId,async tx=>{
   const channel=await tx.get('channel',channelId);assert(channel.data.created_by===auth.actor.userId&&channel.data.type==='PRIVATE_CUSTOMER_ASSISTANT','NOT_FOUND_SAFE');
   if(channel.data.handoff?.state!=='AI_ACTIVE')return [];
   const result=[];for(const draft of await tx.list('assistant_lead_draft')){if(draft.data.ownerUserId!==auth.actor.userId||draft.data.channelId!==channelId||draft.data.state!=='DRAFT')continue;
    const config=await tx.get('assistant_config',draft.data.configId),message=await tx.get('message',draft.data.messageId);
    if(config.data.status!=='ACTIVE'||config.data.configVersion!==draft.data.configVersion||message.data.message_version!==draft.data.messageVersion||message.data.deleted_at)continue;
    result.push({id:draft.id,version:draft.version,previewHash:draft.data.previewHash,preview:draft.data.input,state:draft.data.state});}
   return result.slice(0,10);
  });return {channelId,items,pendingDrafts,csrfToken:auth.csrfToken};
 }
 @Post('public/chat/:channelId/drafts/:draftId/confirm')async confirmChatDraft(@Req()req:Request,@Param('channelId')channelId:string,@Param('draftId')draftId:string,@Body()body:unknown){
  const auth=await this.auth.mutation(req,true),input=z.object({expectedVersion:z.number().int().positive(),previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(body);
  const binding=await this.runtime.db.transaction(auth.actor.companyId,auth.actor.userId,async tx=>{const draft=await tx.get('assistant_lead_draft',draftId),channel=await tx.get('channel',channelId);
   assert(draft.data.ownerUserId===auth.actor.userId&&draft.data.channelId===channelId&&channel.data.created_by===auth.actor.userId&&channel.data.type==='PRIVATE_CUSTOMER_ASSISTANT','NOT_FOUND_SAFE');
   return {companyId:auth.actor.companyId,actorId:auth.actor.userId,configId:draft.data.configId,configVersion:draft.data.configVersion,channelId,channelVersion:channel.version,messageId:draft.data.messageId,messageVersion:draft.data.messageVersion,sourceChannel:draft.data.sourceChannel};});
  return confirmAssistantLeadDraft(binding,{draftId,...input},assistantToolHost(this.runtime.db,this.runtime.engine));
 }
 @Post('mobile/enroll')async mobileEnroll(@Req()req:Request,@Body()body:unknown){sameOrigin(req,this.runtime.publicOrigin);this.publicLimiter.check(hashToken(`device:${req.ip??'unknown'}`));const input=z.object({code:z.string().min(20).max(100),platform:z.enum(['ANDROID','IOS']),deviceName:z.string().min(1).max(200)}).strict().parse(body);const token=opaqueToken();const result=await this.runtime.db.transaction(this.runtime.companyId,'DEVICE_ENROLL',async tx=>{const enrollment=(await tx.list('device_enrollment')).find(e=>e.data.tokenHash===hashToken(input.code));assert(enrollment&&!enrollment.data.consumedAt&&Date.parse(enrollment.data.expiresAt)>Date.now(),'NOT_FOUND_SAFE');const user=await tx.get('user',enrollment.data.employeeId);assert(user.data.active&&user.data.roles.some((r:string)=>['EMPLOYEE','INTERNAL_BAULEITER','TEAM_LEADER','DIRECTOR','OWNER'].includes(r)),'NOT_FOUND_SAFE');for(const old of await tx.list('device'))if(old.data.employeeId===user.id&&old.data.active){await tx.save(old,{...old.data,active:false,revokedAt:new Date().toISOString(),revocationReason:'REPLACED'},old.version);await tx.event('device.revoked',{deviceId:old.id});}const device=await tx.add('device',{employeeId:user.id,platform:input.platform,deviceName:input.deviceName,active:true,credentialType:'OPAQUE_BEARER',tokenHash:hashToken(token),tokenExpiresAt:new Date(Date.now()+30*86400000).toISOString(),boundAt:new Date().toISOString()});await tx.save(enrollment,{...enrollment.data,consumedAt:new Date().toISOString(),deviceId:device.id},enrollment.version);for(const shift of await tx.list('shift'))if(shift.data.employeeId===user.id&&shift.data.state==='ACTIVE')await tx.save(shift,{...shift.data,deviceId:device.id},shift.version);await tx.event('device.bound',{deviceId:device.id,employeeId:user.id});return {deviceId:device.id,employeeId:user.id};});return {...result,deviceToken:token};}
 @Get('mobile/session')async mobileSession(@Req()req:Request){
  const initial=await this.actor(req);assert(initial.device,'NEEDS_REAUTH');
  const engine=this.runtime.engine;assert(engine.actorIn&&engine.scope&&engine.visible,'MISSING_CONFIGURATION');
  const actorIn=engine.actorIn.bind(engine),scope=engine.scope.bind(engine),visible=engine.visible.bind(engine),boundDevice=initial.device;
  return this.runtime.db.transaction(initial.actor.companyId,initial.actor.userId,async tx=>{
   const now=Date.now(),actor=await actorIn(tx,initial.actor.userId),device=await tx.get('device',boundDevice.id);
   assert(device.companyId===actor.companyId&&device.data.active===true&&!device.data.revokedAt&&device.data.employeeId===actor.userId&&device.data.tokenHash===boundDevice.data.tokenHash&&Number.isFinite(Date.parse(device.data.tokenExpiresAt))&&Date.parse(device.data.tokenExpiresAt)>now,'NEEDS_REAUTH');
   const summary=await mobileShiftSummary(tx,scope(actor,'shift.read'),device,new Date(now).toISOString(),row=>visible(tx,actor,row));
   const base:Data={deviceId:device.id,employeeId:actor.userId,apiVersion:1,expiresAt:new Date(now+300000).toISOString(),mode:'OFF',...(summary?{shiftId:summary.shiftId,siteId:summary.siteId,shiftSummary:summary}:{})};
   const shift=(await tx.list('shift')).find(s=>s.data.employeeId===actor.userId&&s.data.state==='ACTIVE'&&s.data.deviceId===device.id);
   if(!shift)return {...base,reason:'NO_ACTIVE_SHIFT'};
   const presenceActor=scope(actor,'location.self');
   if(actor.roles.some(role=>['CLIENT','CUSTOMER','GUEST','EXTERNAL_BAULEITER'].includes(role))||!presenceActor.permissions.includes('location.self')||!presenceActor.siteIds.includes(shift.data.siteId)&&!presenceActor.permissions.includes('scope.company'))return {...base,reason:'GPS_ACCESS_REVOKED'};
   const policy=(await tx.list('tracking_policy')).find(p=>p.data.enabled&&p.data.state==='APPROVED'&&!p.data.disabledAt&&!p.data.supersededAt&&Number.isFinite(Date.parse(p.data.expiresAt))&&Date.parse(p.data.expiresAt)>now);
   if(!policy)return {...base,reason:'GPS_LEGAL_GATE_CLOSED'};
   for(const [reference,subject]of [[policy.data.legalApprovalReference,'GPS_LEGAL_PROCESS'],[policy.data.necessityApprovalReference,'GPS_NECESSITY'],[policy.data.worksCouncilReference,'GPS_WORKS_COUNCIL'],[policy.data.employeeNoticeReference,'GPS_EMPLOYEE_NOTICE']]){
    if(!reference)return {...base,reason:'GPS_LEGAL_GATE_CLOSED'};
    let approval:Entity;try{approval=await tx.get('legal_approval',reference);}catch{return {...base,reason:'GPS_LEGAL_GATE_CLOSED'};}
    if(approval.data.status!=='APPROVED'||approval.data.active!==true||approval.data.subject!==subject||!Number.isFinite(Date.parse(approval.data.expiresAt))||Date.parse(approval.data.expiresAt)<=now)return {...base,reason:'GPS_LEGAL_GATE_CLOSED'};
    if(approval.data.testOnly){const company=await tx.get('company',actor.companyId);if(!['TEST','DEMO'].includes(company.data.operatingMode))return {...base,reason:'GPS_LEGAL_GATE_CLOSED'};}
   }
   const maximumHours=policy.data.maxSessionHours;
   if(!Number.isInteger(maximumHours)||maximumHours<1||maximumHours>16)return {...base,reason:'GPS_LEGAL_GATE_CLOSED'};
   const leaseEnd=Math.min(now+900000,Date.parse(policy.data.expiresAt),Date.parse(shift.data.startAt)+maximumHours*3600000);
   if(!Number.isFinite(leaseEnd)||leaseEnd<=now)return {...base,reason:'TRACKING_LEASE_EXPIRED'};
   const result:Data={...base,shiftId:shift.id,siteId:shift.data.siteId,policyVersionId:policy.id,expiresAt:new Date(leaseEnd).toISOString()};
   const revokeLeases=async(reason:string)=>{for(const lease of await tx.list('tracking_session'))if(lease.data.deviceId===device.id&&lease.data.shiftId===shift.id&&lease.data.active===true&&!lease.data.revokedAt)await tx.save(lease,{...lease.data,active:false,revokedAt:new Date(now).toISOString(),revocationReason:reason});};
   const issueLease=async(mode:'SITE_PRESENCE'|'BUSINESS_TRAVEL',extra:Data)=>{const lease=await tx.add('tracking_session',{employeeId:actor.userId,deviceId:device.id,shiftId:shift.id,siteId:shift.data.siteId,policyVersionId:policy.id,mode,issuedAt:new Date(now).toISOString(),expiresAt:result.expiresAt,active:true,revokedAt:null,source:'SERVER',...extra});return {...result,mode,trackingSessionId:lease.id,...extra};};
   if(shift.data.activity==='ON_BREAK'){await revokeLeases('PRIVATE_BREAK');return {...result,mode:'PRIVATE_BREAK'};}
   if(shift.data.activity==='TRAVELLING'&&policy.data.allowBusinessRoute){const trip=(await tx.list('trip')).find(t=>t.data.shiftId===shift.id&&t.data.state==='IN_PROGRESS');if(trip)return issueLease('BUSINESS_TRAVEL',{tripId:trip.id});}
   if(!['WORKING','AWAY_PENDING_REASON'].includes(shift.data.activity)||!policy.data.allowPresence||shift.data.activity==='AWAY_PENDING_REASON'&&!policy.data.allowMinimalReturn){await revokeLeases('MODE_OFF');return {...result,mode:'OFF'};}
   const site=await tx.get('site',shift.data.siteId);
   if(!site.data.geofenceVersionId)return {...result,reason:'GEOFENCE_NOT_CONFIGURED'};
   const fence=await tx.get('geofence',site.data.geofenceVersionId);
   return {...await issueLease('SITE_PRESENCE',{geofenceVersionId:fence.id}),siteGeofence:{latitude:fence.data.latitude,longitude:fence.data.longitude,radiusEnterM:fence.data.radiusEnterM,radiusExitM:fence.data.radiusExitM,maxAccuracyM:fence.data.maxAccuracyM,maxAgeSeconds:fence.data.maxPointAgeSeconds,dwellSeconds:fence.data.dwellSeconds,algorithmVersion:'GEOFENCE_V1',minimumSamples:fence.data.minimumSamples??3,maxSampleGapSeconds:fence.data.maxSampleGapSeconds??90,staleAfterSeconds:300,exceptionZones:fence.data.exceptionZones??[]}};
  });
 }
 @Post(['mobile/events','device-events/batch'])async mobileEvents(@Req()req:Request,@Body()body:unknown){const {actor,device}=await this.actor(req,true);assert(device,'NEEDS_REAUTH');return executeDeviceBatch(this.runtime.db,this.runtime.engine,actor,device,body);}
 @Post('imports/locations/preview')async locationImport(@Req()req:Request,@Body()body:unknown){const {actor}=await this.actor(req,true);assert(permits(actor.permissions,'site.structure.edit'),'ACCESS_DENIED');this.uploadLimiter.check(actor.userId);const i=z.object({siteId:z.string().min(1).max(200),fileName:z.string().min(1).max(200),mimeType:z.enum(['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),base64:z.string().min(1).max(7*1024*1024)}).strict().parse(body);assert(/^[A-Za-z0-9+/]+={0,2}$/.test(i.base64),'VALIDATION_ERROR');const bytes=Buffer.from(i.base64,'base64');assert(bytes.length>0&&bytes.length<=5*1024*1024,'VALIDATION_ERROR',{reason:'IMPORT_MAX_5_MIB'});const parsed=parseLocationImport(bytes,i.mimeType);if(parsed.errors.length)return {...parsed,preview:null};const preview=await this.runtime.engine.execute(actor,'location.import.preview',{input:{siteId:i.siteId,rows:parsed.rows},idempotency_key:`import-preview:${randomUUID()}`});return {...parsed,preview};}
 @Post(['media/upload','media/uploads'])async upload(@Req()req:Request,@Body()body:unknown,@Res({passthrough:true})res?:Response){
  const {actor}=await this.actor(req,true);assert(permits(actor.permissions,'media.upload'),'ACCESS_DENIED');
  this.uploadLimiter.check(actor.userId);assert(this.activeUploads<2,'RATE_LIMITED');
  const input=mediaUploadSchema.parse(body);assert(/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64),'VALIDATION_ERROR');
  const original=Buffer.from(input.base64,'base64');assertMediaSize(original.length,input.mimeType);
  const pathname=(req.originalUrl??req.path??'').split('?')[0]??'',named=!/\/media\/upload$/.test(pathname);
  const key=mediaUploadKey(req.get?.('Idempotency-Key'),named),payload={original,mimeType:input.mimeType,fileName:input.fileName,redactionConfirmed:input.redactionConfirmed};
  if(named)res?.status(200);
  // Replays avoid decoding/scanning again, but current authority and retained blobs are checked first.
  if(key){const previous=await this.runtime.db.transaction(actor.companyId,actor.userId,async tx=>replayMediaUpload(tx,this.storage,await authorizeMediaUpload(tx,this.runtime.engine,actor),payload,key));if(previous)return previous;}
  let clean:Buffer,mimeType:string,metadataStripped=true,scanMethod='DECODE_AND_REENCODE_IMAGE';
  this.activeUploads++;try{
   if(input.mimeType==='application/pdf'){const scan=await scanPdf(original);clean=original;mimeType=input.mimeType;metadataStripped=false;scanMethod=scan.method;}
   else{const metadata=await sharp(original,{limitInputPixels:24_000_000}).metadata();assert(({jpeg:'image/jpeg',png:'image/png',webp:'image/webp'} as Record<string,string>)[metadata.format??'']===input.mimeType,'VALIDATION_ERROR',{reason:'MIME_SIGNATURE_MISMATCH'});clean=await sharp(original,{limitInputPixels:24_000_000}).rotate().jpeg({quality:88}).toBuffer();mimeType='image/jpeg';}
  }catch(error){if(error instanceof DomainError)throw error;throw new DomainError('VALIDATION_ERROR',{reason:'INVALID_IMAGE'});}finally{this.activeUploads--;}
  // Final transaction rechecks authority and receipt after preparation, closing revoke/concurrent retry races.
  return this.runtime.db.transaction(actor.companyId,actor.userId,async tx=>persistMediaUpload(tx,this.storage,await authorizeMediaUpload(tx,this.runtime.engine,actor),payload,{clean,clientMimeType:mimeType,metadataStripped,scanMethod},key));
 }
 @Get('media/:id/file')async file(@Req()req:Request,@Res()res:Response,@Param('id')id:string){const auth=await this.actor(req);assert(this.runtime.engine.authorizeEntity,'MISSING_CONFIGURATION');const {actor,entity:asset}=await this.runtime.db.transaction(auth.actor.companyId,auth.actor.userId,tx=>this.runtime.engine.authorizeEntity!(tx,auth.actor.userId,'media_asset',id));const external=actor.roles.some(r=>['CLIENT','EXTERNAL_BAULEITER','GUEST'].includes(r));const own=asset.data.uploadedBy===actor.userId;const requestedCopy=req.query?.copy;assert(requestedCopy===undefined||requestedCopy==='client','VALIDATION_ERROR');const clientCopy=requestedCopy==='client'||external&&!own;const blobKey=clientCopy?asset.data.clientBlobKey:asset.data.blobKey;assert(blobKey,'NOT_FOUND_SAFE');if(external&&!own)assert(asset.data.state==='APPROVED_FOR_CLIENT'&&asset.data.visibility==='CLIENT_AFTER_APPROVAL','NOT_FOUND_SAFE');const blob=await this.storage.get(actor.companyId,blobKey);res.set({'Content-Type':blob.mimeType,'Content-Disposition':`${blob.mimeType==='application/pdf'?'attachment':'inline'}; filename="${id.replace(/[^\w-]/g,'')}.${blob.mimeType==='application/pdf'?'pdf':blob.mimeType==='image/png'?'png':blob.mimeType==='image/webp'?'webp':'jpg'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'ETag':`"${blob.sha256}"`});res.send(blob.bytes);}
 private async reportFile(req:Request,res:Response,id:string,format:ReportArtifactFormat){const {actor}=await this.actor(req);assert(this.runtime.engine.authorizeEntity,'MISSING_CONFIGURATION');const result=await this.runtime.db.transaction(actor.companyId,actor.userId,async tx=>{let raw:Entity;try{raw=(await this.runtime.engine.authorizeEntity!(tx,actor.userId,'report_version',id)).entity;}catch(error){if(!(error instanceof DomainError)||error.code!=='NOT_FOUND_SAFE')throw error;const report=(await this.runtime.engine.authorizeEntity!(tx,actor.userId,'report',id)).entity;assert(report.data.currentVersionId,'NOT_FOUND_SAFE');raw=(await this.runtime.engine.authorizeEntity!(tx,actor.userId,'report_version',report.data.currentVersionId)).entity;}return archiveReportArtifact({tx,store:this.storage,version:raw,format,ownerId:actor.userId,now:new Date().toISOString()});});res.set({'Content-Type':result.artifact.data.mimeType,'Content-Disposition':`attachment; filename="KNABA-DE-${result.artifact.data.reportVersionId.replace(/[^A-Za-z0-9_-]/g,'')}.${format.toLowerCase()}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','ETag':`"${result.artifact.data.sha256}"`,'X-KNABA-Source-SHA256':result.artifact.data.sourceSha256});res.send(result.bytes);}
 @Get('privacy/exports/:id/download')async privacyDownload(@Req()req:Request,@Res()res:Response,@Param('id')id:string){const {actor}=await this.actor(req);const artifact=await this.runtime.db.transaction(actor.companyId,actor.userId,async tx=>{assert(this.runtime.engine.authorizeEntity,'MISSING_CONFIGURATION');const {actor:fresh}=await this.runtime.engine.authorizeEntity(tx,actor.userId,'privacy_export',id);return privacyExportBytes(tx,fresh,id);});res.set({'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="KNABA-DE-privacy-${id.replace(/[^A-Za-z0-9_-]/g,'')}.json"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});res.send(artifact.bytes);}
 @Get('reports/:id/pdf')reportPdf(@Req()req:Request,@Res()res:Response,@Param('id')id:string){return this.reportFile(req,res,id,'PDF');}
 @Get('reports/:id/csv')reportCsv(@Req()req:Request,@Res()res:Response,@Param('id')id:string){return this.reportFile(req,res,id,'CSV');}
 @Get('reports/:id/xlsx')reportXlsx(@Req()req:Request,@Res()res:Response,@Param('id')id:string){return this.reportFile(req,res,id,'XLSX');}
 @Post('integrations/:source/events')async integrationEvent(@Req()req:Request,@Param('source')source:string){return acceptIntegrationEvent(this.runtime.db as any,this.runtime.integrationCredentials??[],source,(req as any).rawBody,{keyId:req.get('x-knaba-key-id'),timestamp:req.get('x-knaba-timestamp'),signature:req.get('x-knaba-signature')});}
 @Post('*path')async v4Command(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:unknown){const {actor}=await this.actor(req,true);const host={registry:this.runtime.engine.registry,execute:this.runtime.engine.execute.bind(this.runtime.engine),asynchronousResult:async(current:Actor,command:string,result:any)=>{if(command!=='translation.request'||result?.status!=='PENDING'||typeof result.request_id!=='string')return undefined;return this.runtime.db.transaction(current.companyId,current.userId,async tx=>{assert(this.runtime.engine.actorIn&&this.runtime.engine.visible,'MISSING_CONFIGURATION');const fresh=await this.runtime.engine.actorIn(tx,current.userId),row=await tx.get('translation_request',result.request_id);assert(await this.runtime.engine.visible(tx,fresh,row),'NOT_FOUND_SAFE');return {operation_id:row.id,status:row.data.status};});}};const result=await executeV4Rest(host,actor,{method:req.method,path:req.originalUrl.split('?')[0]!,body,idempotencyKey:req.get('Idempotency-Key')});res.status(result.status);return result.body;}


}
@Module({controllers:[ApiController]})
class ApiModule {}
export function createApiModule(runtime:ApiRuntime):DynamicModule{return {module:ApiModule,controllers:[ApiController],providers:[{provide:API_RUNTIME,useValue:runtime}]};}
