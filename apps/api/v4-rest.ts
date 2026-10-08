import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {z,ZodError} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {assert,DomainError,type Actor,type Data,type Entity,type CommandRegistry} from '../../packages/domain/core.ts';

/** Named V4 contracts adapt to the same Engine commands; authorization is never duplicated here. */
export interface V4RestRoute {path:string;command?:string;adapter?:'taskAction'|'shiftAction'|'tripAction'|'mediaUpload'|'deviceBatch'|'integrationEvent'|'whatsappWebhook';idField?:string;requiresVersion?:boolean;versionKind?:string;versionInputField?:string;}
export const V4_REST_ROUTES:readonly V4RestRoute[]=[
 {path:'/leads',command:'lead.create'},
 {path:'/leads/{id}/qualify',command:'lead.qualify',idField:'id',requiresVersion:true,versionKind:'lead'},
 {path:'/quotes/{id}/approve',command:'quote.approve',idField:'id',requiresVersion:true,versionKind:'quote'},
 {path:'/quotes/{id}/send',command:'quote.send',idField:'id',requiresVersion:true,versionKind:'quote'},
 {path:'/quotes/{id}/accept',command:'quote.accept',idField:'id',requiresVersion:true,versionKind:'quote'},
 // A pending private channel is intentionally not yet visible to a nonmember operator.
 // handoff.take rechecks the authoritative operator/site/pending scope before its own version comparison.
 {path:'/handoffs/{id}/claim',command:'handoff.take',idField:'channel_id',requiresVersion:true},
 {path:'/handoffs/{id}/return-to-ai',command:'handoff.resume',idField:'channel_id',requiresVersion:true,versionKind:'channel'},
 {path:'/orders/{id}/crew-reservations',command:'dispatch.reserve',idField:'orderId',requiresVersion:true,versionKind:'order'},
 {path:'/orders/{id}/schedule',command:'dispatch.assign',idField:'orderId',requiresVersion:true,versionKind:'order'},
 {path:'/sites/{id}/locations',command:'location.create',idField:'siteId'},
 {path:'/tasks/{id}/transitions',adapter:'taskAction',idField:'taskId',requiresVersion:true,versionKind:'task'},
 {path:'/channels/{id}/messages',command:'message.send',idField:'channel_id'},
 {path:'/messages/{id}/translations',command:'translation.request',idField:'message_id',requiresVersion:true,versionKind:'message'},
 {path:'/shifts/start',command:'shift.start'},
 {path:'/shifts/{id}/actions',adapter:'shiftAction',idField:'shiftId',requiresVersion:true,versionKind:'shift'},
 {path:'/time/corrections',command:'timesheet.correction',requiresVersion:true,versionKind:'timesheet',versionInputField:'timesheetId'},
 {path:'/trips',command:'trip.start',requiresVersion:true,versionKind:'shift',versionInputField:'shiftId'},
 {path:'/trips/{id}/actions',adapter:'tripAction',idField:'tripId',requiresVersion:true,versionKind:'trip'},
 {path:'/material-requests',command:'request.create'},
 {path:'/stock/transfers',command:'stock.ship'},
 {path:'/stock/receipts',command:'stock.receive'},
 {path:'/stock/usage',command:'stock.use'},
 {path:'/payroll/{id}/approve',command:'payroll.approve',idField:'calculationId',requiresVersion:true,versionKind:'payroll_calculation'},
 {path:'/payouts',command:'payout.create',requiresVersion:true,versionKind:'payroll_calculation',versionInputField:'calculationId'},
 {path:'/payouts/{id}/approve',command:'payout.approve',idField:'payoutId',requiresVersion:true,versionKind:'payout'},
 {path:'/payouts/{id}/record',command:'payout.record',idField:'payoutId',requiresVersion:true,versionKind:'payout'},
 {path:'/payouts/{id}/acknowledge',command:'payout.ack',idField:'payoutId',requiresVersion:true,versionKind:'payout'},
 {path:'/reports/{id}/publish',command:'report.publish',idField:'reportId',requiresVersion:true,versionKind:'report'},
 {path:'/reports/{id}/acknowledge',command:'report.ack',idField:'reportVersionId',requiresVersion:true,versionKind:'report_version'},
 {path:'/media/uploads',adapter:'mediaUpload'},
 {path:'/device-events/batch',adapter:'deviceBatch'},
 {path:'/integrations/{source}/events',adapter:'integrationEvent'},
 {path:'/webhooks/whatsapp',adapter:'whatsappWebhook'},
] as const;

const objectBody=z.record(z.unknown());
const positiveVersion=z.number().int().positive();
const keySchema=z.string().min(8).max(200).regex(/^[\x21-\x7e]+$/);
export interface ResolvedV4Route {route:V4RestRoute;command?:string;input:Data;expectedVersion?:number;resourceId?:string;}

function matchRoute(path:string):{route:V4RestRoute;id?:string}|undefined{
 for(const route of V4_REST_ROUTES){
  const placeholder=route.path.match(/\{([a-z_]+)\}/)?.[0];
  const parts=placeholder?route.path.split(placeholder):[route.path];
  if(parts.length===1){if(path===route.path)return {route};continue;}
  if(!path.startsWith(parts[0]!)||!path.endsWith(parts[1]!))continue;
  const raw=path.slice(parts[0]!.length,path.length-parts[1]!.length);
  if(!raw||raw.includes('/'))continue;
  let id:string;try{id=decodeURIComponent(raw);}catch{throw new DomainError('VALIDATION_ERROR',{field:'path',reason:'INVALID_PATH_ENCODING'});}
  assert(id.length<=100&&!/[\x00-\x20\x7f/\\]/.test(id)&&id!=='.'&&id!=='..','VALIDATION_ERROR',{field:'path'});
  return {route,id};
 }
 return undefined;
}

/** Body fields are domain input plus expected_version; actor/company/idempotency remain trusted transport inputs. */
export function resolveV4Route(method:string,path:string,body:unknown):ResolvedV4Route{
 assert(method==='POST','NOT_FOUND_SAFE');
 const matched=matchRoute(path.startsWith('/api/v1/')?path.slice('/api/v1'.length):path);
 assert(matched,'NOT_FOUND_SAFE');
 const {route,id}=matched;
 const input={...objectBody.parse(body)};
 assert(!['actor','actorId','company_id','companyId','idempotency_key'].some(k=>Object.hasOwn(input,k)),'VALIDATION_ERROR',{reason:'TRUSTED_TRANSPORT_FIELD'});
 const version=input.expected_version;
 delete input.expected_version;
 if(route.requiresVersion)positiveVersion.parse(version);
 else if(version!==undefined)positiveVersion.parse(version);
 if(route.idField){assert(input[route.idField]===undefined||input[route.idField]===id,'VALIDATION_ERROR',{field:route.idField,reason:'PATH_BODY_MISMATCH'});input[route.idField]=id;}
 let command=route.command;
 if(route.adapter==='taskAction'){
  const action=z.enum(['START','SUBMIT','ACCEPT','REJECT','REOPEN','CANCEL']).parse(input.action);delete input.action;
  command=({START:'task.start',SUBMIT:'task.submit',ACCEPT:'task.review',REJECT:'task.review',REOPEN:'task.reopen',CANCEL:'task.cancel'} as const)[action];
  if(action==='ACCEPT'||action==='REJECT'){assert(input.decision===undefined||input.decision===action,'VALIDATION_ERROR',{reason:'ACTION_DECISION_MISMATCH'});input.decision=action;}
 }else if(route.adapter==='shiftAction'){
  const action=z.enum(['ACTIVITY','END']).parse(input.action);delete input.action;command=action==='END'?'shift.end':'shift.activity';
 }else if(route.adapter==='tripAction'){
  const action=z.enum(['DESTINATION','STOP','RESUME','ARRIVE','END','APPROVE']).parse(input.action);delete input.action;
  command=({DESTINATION:'trip.destination',STOP:'trip.stop',RESUME:'trip.resume',ARRIVE:'trip.arrive',END:'trip.end',APPROVE:'trip.approve'} as const)[action];
 }
 return {route,command,input,expectedVersion:version as number|undefined,resourceId:id??(route.versionInputField&&typeof input[route.versionInputField]==='string'?input[route.versionInputField] as string:undefined)};
}

export interface V4CommandHost {
 registry:CommandRegistry;
 execute:(actor:Actor,command:string,envelope:{input:unknown;expected_version?:number;idempotency_key:string;preconditions?:{kind:string;id:string;version:number}[]})=>Promise<unknown>;
 /** A real durable operation receipt only; this callback must not create an operation from a random ID. */
 asynchronousResult?:(actor:Actor,command:string,result:unknown)=>Promise<{operation_id:string;status:string}|undefined>;
}
export async function executeV4Rest(host:V4CommandHost,actor:Actor,request:{method:string;path:string;body:unknown;idempotencyKey:unknown}):Promise<{status:200|202;body:unknown}>{
 const resolved=resolveV4Route(request.method,request.path,request.body);
 assert(resolved.command,'MISSING_CONFIGURATION',{reason:'SPECIALIZED_ROUTE_ADAPTER_REQUIRED',adapter:resolved.route.adapter});
 const definition=host.registry[resolved.command];
 assert(definition,'MISSING_CONFIGURATION',{reason:'COMMAND_NOT_CONFIGURED',command:resolved.command});
 const idempotencyKey=keySchema.parse(request.idempotencyKey);
 // Registry schema and Engine guards stay authoritative; parse before execute for a useful schema response.
 const input=definition.schema.parse(resolved.input);
 const preconditions=resolved.route.versionKind&&resolved.resourceId&&resolved.expectedVersion!==undefined?[{kind:resolved.route.versionKind,id:resolved.resourceId,version:resolved.expectedVersion}]:undefined;
 let result:unknown;
 try{result=await host.execute(actor,resolved.command,{input,expected_version:resolved.expectedVersion,idempotency_key:idempotencyKey,...(preconditions?{preconditions}:{})});}
 catch(error){
  // The legacy generic V3 transport keeps its original VERSION_CONFLICT receipt code.
  if(error instanceof DomainError&&error.code==='VERSION_CONFLICT'&&error.details.reason==='IDEMPOTENCY_KEY_REUSED')throw new DomainError('IDEMPOTENCY_CONFLICT',{reason:'IDEMPOTENCY_KEY_REUSED'});
  throw error;
 }
 const operation=await host.asynchronousResult?.(actor,resolved.command,result);
 if(operation){z.object({operation_id:z.string().min(1).max(200),status:z.string().min(1).max(100)}).strict().parse(operation);return {status:202,body:operation};}
 return {status:200,body:result};
}

export function v4HttpStatus(code:string):number{
 if(code==='NEEDS_REAUTH')return 401;
 if(code==='ACCESS_DENIED')return 403;
 if(code==='NOT_FOUND_SAFE')return 404;
 if(['INVALID_STATE','VERSION_CONFLICT','IDEMPOTENCY_CONFLICT'].includes(code))return 409;
 if(['MISSING_CONFIGURATION','NEEDS_APPROVAL'].includes(code))return 422;
 if(code==='RATE_LIMITED')return 429;
 if(code==='PROVIDER_UNAVAILABLE')return 503;
 return code==='INTERNAL_ERROR'?500:400;
}
export function v4HttpError(error:unknown):{status:number;body:{code:string;details:Data}}{
 const code=error instanceof DomainError?error.code:error instanceof ZodError?'VALIDATION_ERROR':'INTERNAL_ERROR';
 const hidden=['NEEDS_REAUTH','ACCESS_DENIED','NOT_FOUND_SAFE','INTERNAL_ERROR'].includes(code);
 const details=hidden?{}:error instanceof ZodError?{issues:error.issues.map(i=>({path:i.path,message:i.message}))}:error instanceof DomainError?error.details:{};
 return {status:v4HttpStatus(code),body:{code,details}};
}

export interface V4CursorBinding {companyId:string;userId:string;resource:string;filters?:Record<string,string|number|boolean|undefined>;}
export interface V4PageBoundary {createdAt:string;id:string;}
export interface V4PageRequest {limit:number;after?:V4PageBoundary;snapshotAt:string;expiresAt:number;}
const canonicalUtc=z.string().datetime().refine(value=>new Date(value).toISOString()===value,'Use canonical ISO-8601 UTC timestamps');
const boundarySchema=z.object({createdAt:canonicalUtc,id:z.string().min(1).max(200)}).strict();
const cursorSchema=z.object({v:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),after:boundarySchema,snapshotAt:canonicalUtc,expiresAt:z.number().int().nonnegative()}).strict();
function bindingHash(binding:V4CursorBinding){
 assert(binding.companyId&&binding.userId&&binding.resource&&binding.resource.length<=300,'VALIDATION_ERROR');
 const filters=Object.fromEntries(Object.entries(binding.filters??{}).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0));
 return createHash('sha256').update(JSON.stringify([binding.companyId,binding.userId,binding.resource,filters])).digest('hex');
}
function cursorKey(secret:Buffer|string){const key=Buffer.isBuffer(secret)?secret:Buffer.from(secret);assert(key.length>=32,'MISSING_CONFIGURATION',{reason:'CURSOR_SIGNING_KEY_REQUIRED'});return key;}
function cursorEncryptionKey(secret:Buffer|string){return createHash('sha256').update('KNABA-DE-v4-cursor-encryption\0').update(cursorKey(secret)).digest();}
function cursorAssociatedData(binding:V4CursorBinding){return Buffer.from(`KNABA-DE-v4-cursor-v1\0${bindingHash(binding)}`);}
function base64urlDecode(encoded:string){assert(/^[A-Za-z0-9_-]+$/.test(encoded),'VALIDATION_ERROR',{field:'cursor'});const bytes=Buffer.from(encoded,'base64url');assert(bytes.toString('base64url')===encoded,'VALIDATION_ERROR',{field:'cursor',reason:'NON_CANONICAL_CURSOR'});return bytes;}
export function parseV4PageQuery(query:unknown,binding:V4CursorBinding,secret:Buffer|string,now=Date.now()):V4PageRequest{
 assert(Number.isSafeInteger(now)&&now>=0,'VALIDATION_ERROR');cursorKey(secret);
 const input=z.object({limit:z.union([z.number().int().min(1).max(100),z.string().regex(/^(?:[1-9][0-9]?|100)$/).transform(Number)]).default(50),cursor:z.string().min(1).max(2048).optional()}).strict().parse(query===undefined?{}:query);
 if(!input.cursor)return {limit:input.limit,snapshotAt:new Date(now).toISOString(),expiresAt:now+15*60000};
 const parts=input.cursor.split('.');assert(parts.length===2&&parts[0]==='v1','VALIDATION_ERROR',{field:'cursor'});
 const packed=base64urlDecode(parts[1]!);assert(packed.length>28,'VALIDATION_ERROR',{field:'cursor'});
 let plaintext:Buffer,value:unknown;
 try{const decipher=createDecipheriv('aes-256-gcm',cursorEncryptionKey(secret),packed.subarray(0,12));decipher.setAAD(cursorAssociatedData(binding));decipher.setAuthTag(packed.subarray(12,28));plaintext=Buffer.concat([decipher.update(packed.subarray(28)),decipher.final()]);value=JSON.parse(plaintext.toString('utf8'));}catch{throw new DomainError('VALIDATION_ERROR',{field:'cursor',reason:'INVALID_CURSOR'});}
 const payload=cursorSchema.parse(value);
 assert(Buffer.from(JSON.stringify(payload)).equals(plaintext),'VALIDATION_ERROR',{field:'cursor',reason:'NON_CANONICAL_CURSOR'});
 assert(payload.binding===bindingHash(binding),'VALIDATION_ERROR',{field:'cursor',reason:'CURSOR_SCOPE_MISMATCH'});
 assert(payload.expiresAt>now&&payload.expiresAt<=now+15*60000&&Date.parse(payload.snapshotAt)<=now&&payload.after.createdAt<=payload.snapshotAt,'VALIDATION_ERROR',{field:'cursor',reason:'CURSOR_EXPIRED_OR_INVALID'});
 return {limit:input.limit,after:payload.after,snapshotAt:payload.snapshotAt,expiresAt:payload.expiresAt};
}
export function encodeV4Cursor(binding:V4CursorBinding,request:V4PageRequest,after:V4PageBoundary,secret:Buffer|string):string{
 const payload=cursorSchema.parse({v:1,binding:bindingHash(binding),after:{createdAt:after.createdAt,id:after.id},snapshotAt:request.snapshotAt,expiresAt:request.expiresAt});
 assert(after.createdAt<=request.snapshotAt,'VALIDATION_ERROR');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cursorEncryptionKey(secret),iv);cipher.setAAD(cursorAssociatedData(binding));
 const encrypted=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload))),cipher.final()]);
 return `v1.${Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url')}`;
}
export function compareV4Boundary(a:V4PageBoundary,b:V4PageBoundary){return a.createdAt<b.createdAt?-1:a.createdAt>b.createdAt?1:Buffer.compare(Buffer.from(a.id,'utf8'),Buffer.from(b.id,'utf8'));}
/** Rows MUST already have freshly rechecked permissions and projection. This bounds transport, not SQL reads. */
export function paginateV4Entities<T extends Pick<Entity,'id'|'createdAt'>>(rows:readonly T[],request:V4PageRequest,binding:V4CursorBinding,secret:Buffer|string):{items:T[];limit:number;has_more:boolean;next_cursor:string|null}{
 positiveVersion.max(100).parse(request.limit);
 const eligible=rows.filter(row=>row.createdAt<=request.snapshotAt&&(!request.after||compareV4Boundary(row,request.after)>0)).sort(compareV4Boundary);
 const items=eligible.slice(0,request.limit),has_more=eligible.length>request.limit;
 return {items,limit:request.limit,has_more,next_cursor:has_more?encodeV4Cursor(binding,request,items.at(-1)!,secret):null};
}

/** Per-route JSON Schemas are derived from the actual registry, never copied by hand. */
export function v4RestContractSchemas(registry:CommandRegistry){return V4_REST_ROUTES.filter(route=>route.command&&registry[route.command]).map(route=>({path:`/api/v1${route.path}`,method:'POST',command:route.command!,permission:registry[route.command!]!.permission,schema:registry[route.command!]!.schema,idField:route.idField,requiresVersion:!!route.requiresVersion}));}

const actionCommands:Record<string,Record<string,string>>={taskAction:{START:'task.start',SUBMIT:'task.submit',ACCEPT:'task.review',REJECT:'task.review',REOPEN:'task.reopen',CANCEL:'task.cancel'},shiftAction:{ACTIVITY:'shift.activity',END:'shift.end'},tripAction:{DESTINATION:'trip.destination',STOP:'trip.stop',RESUME:'trip.resume',ARRIVE:'trip.arrive',END:'trip.end',APPROVE:'trip.approve'}};
const responseDescriptions:Record<string,string>={'200':'Synchronous atomic command result','202':'Durable asynchronous operation receipt, never delivery proof','400':'Schema validation failed','401':'Authentication required','403':'Access denied','404':'Resource not found in current scope','409':'State, version or idempotency conflict','422':'Configuration or approval required','429':'Rate limited','500':'Internal error without sensitive details','503':'Synchronous provider unavailable'};
function namedRequestSchema(registry:CommandRegistry,route:V4RestRoute,command:string,action?:string):Data|undefined{
 const definition=registry[command];if(!definition)return undefined;
 const schema=zodToJsonSchema(definition.schema,{$refStrategy:'none'}) as Data;
 delete schema.$schema;
 // All currently mapped command inputs are object-shaped (possibly Zod refinements).
 assert(schema.type==='object','MISSING_CONFIGURATION',{reason:'REST_SCHEMA_MUST_BE_OBJECT',command});
 const properties={...(schema.properties??{})};let required:string[]=[...(schema.required??[])];
 if(route.idField){delete properties[route.idField];required=required.filter(key=>key!==route.idField);}
 if(action){properties.action={const:action,type:'string'};required.push('action');if(action==='ACCEPT'||action==='REJECT'){delete properties.decision;required=required.filter(key=>key!=='decision');}}
 properties.expected_version={type:'integer',minimum:1};if(route.requiresVersion)required.push('expected_version');
 return {...schema,properties,required:[...new Set(required)],additionalProperties:false};
}
/** Merge these paths into the authenticated OpenAPI response and export the same bytes as JSON Schema. */
export function v4OpenApiPaths(registry:CommandRegistry,specializedSchemas:Partial<Record<NonNullable<V4RestRoute['adapter']>,Data>>={}):Data{
 const paths:Data={};
 for(const route of V4_REST_ROUTES){
  const variants=route.command?{DEFAULT:route.command}:actionCommands[route.adapter??''];
  let requestSchema:Data|undefined;
  const variantsSchemas:Data[]=[];
  if(variants){for(const [action,command]of Object.entries(variants)){const schema=namedRequestSchema(registry,route,command,action==='DEFAULT'?undefined:action);if(schema)variantsSchemas.push(schema);}requestSchema=variantsSchemas.length===1?variantsSchemas[0]:variantsSchemas.length?{oneOf:variantsSchemas}:undefined;}
  else requestSchema=specializedSchemas[route.adapter!];
  // A specialized transport schema is owned by the actual upload/device/signature handler.
  if(!requestSchema)continue;
  const parameters:Data[]=[];
  if(variants||route.adapter==='mediaUpload')parameters.push({in:'header',name:'Idempotency-Key',required:true,schema:{type:'string',minLength:8,maxLength:200,pattern:'^[!-~]+$'}});
  else if(route.adapter==='integrationEvent')parameters.push(...[
   {in:'header',name:'X-Knaba-Key-Id',required:true,schema:{type:'string',minLength:1,maxLength:100}},
   {in:'header',name:'X-Knaba-Timestamp',required:true,schema:{type:'string',pattern:'^[0-9]{10}$'}},
   {in:'header',name:'X-Knaba-Signature',required:true,schema:{type:'string',pattern:'^sha256=[a-f0-9]{64}$'}},
  ]);
  else if(route.adapter==='whatsappWebhook')parameters.push({in:'header',name:'X-Hub-Signature-256',required:true,schema:{type:'string',pattern:'^sha256=[a-f0-9]{64}$'}});
  else if(route.adapter==='deviceBatch')parameters.push({in:'header',name:'Authorization',required:true,schema:{type:'string',pattern:'^Bearer [A-Za-z0-9_-]{30,100}$'}});
  const pathParameter=route.path.match(/\{([a-z_]+)\}/)?.[1];
  if(pathParameter)parameters.push({in:'path',name:pathParameter,required:true,schema:{type:'string',minLength:1,maxLength:100}});
  const errorSchema={type:'object',additionalProperties:false,required:['code','details'],properties:{code:{type:'string'},details:{type:'object'}}};
  const operationSchema={type:'object',additionalProperties:false,required:['operation_id','status'],properties:{operation_id:{type:'string',minLength:1,maxLength:200},status:{type:'string',minLength:1,maxLength:100}}};
  paths[`/api/v1${route.path}`]={post:{operationId:`v4_${route.path.replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'')}`,parameters,requestBody:{required:true,content:{'application/json':{schema:requestSchema}}},responses:Object.fromEntries(Object.entries(responseDescriptions).map(([status,description])=>[status,{description,...status==='200'?{}:{content:{'application/json':{schema:status==='202'?operationSchema:errorSchema}}}}])),'x-command':route.command,'x-adapter':route.adapter,'x-version-kind':route.versionKind,'x-permission':route.command?registry[route.command]?.permission:undefined}};
 }
 const pagination=[{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:100,default:50}},{in:'query',name:'cursor',schema:{type:'string',maxLength:2048},description:'Opaque canonical cursor bound to current recipient, company, resource and filters. Permissions are rechecked on each page.'}];
 const pageSchema={type:'object',additionalProperties:false,required:['items','limit','has_more','next_cursor'],properties:{items:{type:'array',maxItems:100,items:{type:'object'}},limit:{type:'integer',minimum:1,maximum:100},has_more:{type:'boolean'},next_cursor:{type:['string','null'],maxLength:2048}}};
 for(const [path,param]of [['/entities/{kind}','kind'],['/channels/{id}/messages','id']] as const){
  paths[`/api/v1${path}`]={...paths[`/api/v1${path}`],get:{operationId:param==='kind'?'v4_entities_page':'v4_channel_messages_page',parameters:[{in:'path',name:param,required:true,schema:{type:'string',minLength:1,maxLength:100}},...pagination],responses:{'200':{description:'Current scoped keyset page',content:{'application/json':{schema:pageSchema}}},'400':{description:'Invalid, scoped or expired cursor'},'401':{description:'Authentication required'},'404':{description:'Resource not found in current scope'}}}};
 }
 const operationStatusSchema={type:'object',additionalProperties:false,required:['operation_id','status','resource_id'],properties:{operation_id:{type:'string'},status:{type:'string'},resource_id:{type:['string','null']}}};
 paths['/api/v1/operations/{id}']={get:{
  operationId:'v4_operation_status',parameters:[{in:'path',name:'id',required:true,schema:{type:'string',minLength:1,maxLength:200}}],
  responses:{'200':{description:'Current scoped durable translation operation status',content:{'application/json':{schema:operationStatusSchema}}},'401':{description:'Authentication required'},'404':{description:'Operation not found in current recipient/resource scope'}},
 }};
 return paths;
}
