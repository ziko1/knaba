import {assert,DomainError,type Actor,type Entity,type Transaction} from './core.ts';

export const AUTOMATION_ACTION_PERMISSIONS = {
 REMIND:'notifications.manage',CREATE_DECISION:'decision.manage',DRAFT_REPORT:'report.create',
 DRAFT_QUOTE:'quote.create',PROPOSE_CREW:'dispatch.read',DETECT_SHORTAGE:'inventory.read',
} as const;
type AutomationAction=keyof typeof AUTOMATION_ACTION_PERMISSIONS;
export type AutomationPermission='automation.manage'|'automation.approve'|'automation.execute';
export interface AutomationAuthorityTransaction extends Transaction {companyId:string;}
export interface AutomationAuthorityHost<T extends AutomationAuthorityTransaction=AutomationAuthorityTransaction>{
 actorIn:(tx:T,userId:string)=>Promise<Actor>;
 scope:(actor:Actor,permission:string)=>Actor;
}
export interface AutomationAuthorityOptions{
 initiator?:Actor;
 initiatorPermission?:AutomationPermission;
 /** Only server-built, unsaved initial drafts; never accepted from public input. */
 allowCandidate?:boolean;
}
interface AutomationScope {siteIds:string[];customerIds:string[];}
const automationPermissions:AutomationPermission[]=['automation.manage','automation.approve','automation.execute'];
const externalRoles=['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST'];
const readPermissions:Record<AutomationAction,string[]>={
 REMIND:['notifications.manage'],CREATE_DECISION:['decision.manage'],DRAFT_REPORT:['report.read','report.create'],
 DRAFT_QUOTE:['commerce.read','quote.create'],PROPOSE_CREW:['dispatch.read','dispatch.manage'],DETECT_SHORTAGE:['inventory.read'],
};
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=100&&value.trim()===value;
const validVersion=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>0;
function declaredScope(value:unknown):AutomationScope{
 assert(value&&typeof value==='object'&&!Array.isArray(value),'ACCESS_DENIED');
 const scope=value as Record<string,unknown>;
 assert(Object.keys(scope).every(k=>['siteIds','customerIds'].includes(k)),'ACCESS_DENIED');
 for(const key of ['siteIds','customerIds']){
  const values=scope[key];assert(Array.isArray(values)&&values.length<=100&&values.every(validId)&&new Set(values).size===values.length,'ACCESS_DENIED');
 }
 return {siteIds:[...(scope.siteIds as string[])],customerIds:[...(scope.customerIds as string[])]};
}
function actionOf(entity:Entity):AutomationAction{
 assert(typeof entity.data.action==='string'&&Object.hasOwn(AUTOMATION_ACTION_PERMISSIONS,entity.data.action),'ACCESS_DENIED');
 return entity.data.action as AutomationAction;
}
function sameScope(left:AutomationScope,right:AutomationScope){
 return (['siteIds','customerIds'] as const).every(key=>left[key].length===right[key].length&&left[key].every(id=>right[key].includes(id)));
}
function parameters(value:unknown):string{
 assert(value&&typeof value==='object'&&!Array.isArray(value),'ACCESS_DENIED');let visited=0;
 const encode=(item:unknown,depth:number):string=>{
  assert(depth<=20&&++visited<=20000,'ACCESS_DENIED');
  if(item===null||typeof item==='boolean'||typeof item==='string')return JSON.stringify(item);
  if(typeof item==='number'){assert(Number.isFinite(item),'ACCESS_DENIED');return JSON.stringify(item);}
  assert(item&&typeof item==='object','ACCESS_DENIED');
  if(Array.isArray(item))return '['+item.map(v=>encode(v,depth+1)).join(',')+']';
  const object=item as Record<string,unknown>;
  assert(Object.getPrototypeOf(object)===Object.prototype||Object.getPrototypeOf(object)===null,'ACCESS_DENIED');
  return '{'+Object.keys(object).sort().map(key=>JSON.stringify(key)+':'+encode(object[key],depth+1)).join(',')+'}';
 };
 const encoded=encode(value,0);assert(new TextEncoder().encode(encoded).byteLength<=196608,'ACCESS_DENIED');return encoded;
}
async function record<T extends AutomationAuthorityTransaction>(tx:T,kind:string,id:string):Promise<Entity>{
 assert(validId(id),'ACCESS_DENIED');
 try{const entity=await tx.get(kind,id);assert(entity.companyId===tx.companyId&&entity.kind===kind&&entity.id===id,'ACCESS_DENIED');return entity;}
 catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')throw new DomainError('ACCESS_DENIED');throw error;}
}
async function stored<T extends AutomationAuthorityTransaction>(tx:T,entity:Entity):Promise<Entity>{
 assert(['automation_rule','automation_run'].includes(entity.kind)&&entity.companyId===tx.companyId&&validVersion(entity.version),'ACCESS_DENIED');
 const current=await record(tx,entity.kind,entity.id);assert(current.version===entity.version,'VERSION_CONFLICT');return current;
}
async function currentActor<T extends AutomationAuthorityTransaction>(tx:T,userId:string,host:AutomationAuthorityHost<T>,owner=false):Promise<Actor>{
 const user=await record(tx,'user',userId);assert(user.data.active===true,'ACCESS_DENIED');
 const actor=await host.actorIn(tx,userId);
 assert(actor.companyId===tx.companyId&&actor.userId===user.id&&Array.isArray(actor.roles)&&Array.isArray(actor.permissions)&&Array.isArray(actor.siteIds)&&actor.siteIds.every(validId)&&Array.isArray(actor.customerIds)&&actor.customerIds.every(validId)&&!actor.roles.some(role=>externalRoles.includes(role)),'ACCESS_DENIED');
 // A service initiates transport; it cannot become the human business owner by
 // carrying automation.execute or by being passed as a previously scoped actor.
 assert(!owner||!actor.roles.includes('SERVICE_ACCOUNT'),'ACCESS_DENIED');return actor;
}
function permitsScope(actor:Actor,permission:string,scope:AutomationScope,host:AutomationAuthorityHost<any>):boolean{
 if(!actor.permissions.includes(permission))return false;
 const scoped=host.scope(actor,permission);
 if(!scoped||scoped.companyId!==actor.companyId||scoped.userId!==actor.userId||!Array.isArray(scoped.permissions)||!scoped.permissions.includes(permission)||!Array.isArray(scoped.siteIds)||!Array.isArray(scoped.customerIds))return false;
 if(scoped.permissions.includes('scope.company'))return true;
 // Empty is the matching engine's unbounded dimension, not an empty result set.
 return scope.siteIds.length>0&&scope.customerIds.length>0&&
  scope.siteIds.every(id=>scoped.siteIds.includes(id))&&scope.customerIds.every(id=>scoped.customerIds.includes(id));
}
async function scopedRecords<T extends AutomationAuthorityTransaction>(tx:T,scope:AutomationScope){
 for(const siteId of scope.siteIds)await record(tx,'site',siteId);
 for(const customerId of scope.customerIds)await record(tx,'customer',customerId);
}
async function initiatorAuthority<T extends AutomationAuthorityTransaction>(tx:T,scope:AutomationScope,host:AutomationAuthorityHost<T>,options:AutomationAuthorityOptions){
 if(!options.initiator){assert(!options.initiatorPermission&&!options.allowCandidate,'ACCESS_DENIED');return;}
 const permission=options.initiatorPermission;assert(permission&&automationPermissions.includes(permission)&&options.initiator.companyId===tx.companyId,'ACCESS_DENIED');
 const actor=await currentActor(tx,options.initiator.userId,host);
 assert(!actor.roles.includes('SERVICE_ACCOUNT')||permission==='automation.execute','ACCESS_DENIED');
 assert(permitsScope(actor,permission,scope,host),'ACCESS_DENIED');
}
async function ownerAuthority<T extends AutomationAuthorityTransaction>(tx:T,rule:Entity,host:AutomationAuthorityHost<T>,options:AutomationAuthorityOptions):Promise<Actor>{
 assert(rule.kind==='automation_rule'&&rule.companyId===tx.companyId&&validId(rule.data.ownerId)&&validVersion(rule.data.ruleVersion),'ACCESS_DENIED');
 const scope=declaredScope(rule.data.scope),action=actionOf(rule);parameters(rule.data.parameters);
 await scopedRecords(tx,scope);await initiatorAuthority(tx,scope,host,options);
 const owner=await currentActor(tx,rule.data.ownerId,host,true);
 assert(permitsScope(owner,'automation.manage',scope,host)&&permitsScope(owner,AUTOMATION_ACTION_PERMISSIONS[action],scope,host),'ACCESS_DENIED');
 return owner;
}

/** Fresh owner business authority, separately from the initiating actor's
 * permission-scoped authority. This helper performs reads only; callers retain
 * lifecycle/state and transaction/lease checks and execute canonical commands. */
export async function authorizeAutomationRule<T extends AutomationAuthorityTransaction>(tx:T,entity:Entity,host:AutomationAuthorityHost<T>,options:AutomationAuthorityOptions={}):Promise<Actor>{
 let rule:Entity;
 if(options.allowCandidate){
  assert(entity.kind==='automation_rule'&&entity.companyId===tx.companyId&&validId(entity.id)&&entity.version===1&&entity.data.ruleVersion===1&&entity.data.status==='DRAFT'&&options.initiator&&options.initiatorPermission==='automation.manage','ACCESS_DENIED');
  // A candidate cannot substitute for an already persisted rule with the same ID.
  try{await tx.get(entity.kind,entity.id);throw new DomainError('ACCESS_DENIED');}
  catch(error){if(!(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE'))throw error;}
  rule=entity;
 }else rule=await stored(tx,entity);
 return ownerAuthority(tx,rule,host,options);
}

/** A stored run is bound to its current rule and to the original scope. A later
 * rule edit cannot authorize an old copied result, action or different owner. */
export async function authorizeAutomationRun<T extends AutomationAuthorityTransaction>(tx:T,entity:Entity,host:AutomationAuthorityHost<T>,options:AutomationAuthorityOptions={}):Promise<Actor>{
 assert(!options.allowCandidate,'ACCESS_DENIED');const run=await stored(tx,entity);assert(run.kind==='automation_run'&&validId(run.data.ruleId),'ACCESS_DENIED');
 const rule=await record(tx,'automation_rule',run.data.ruleId),runScope=declaredScope(run.data.scope),ruleScope=declaredScope(rule.data.scope);
 assert(validVersion(run.data.ruleVersion)&&run.data.ruleVersion===rule.data.ruleVersion&&run.data.ownerId===rule.data.ownerId&&actionOf(run)===actionOf(rule)&&sameScope(runScope,ruleScope)&&parameters(run.data.parameters)===parameters(rule.data.parameters),'ACCESS_DENIED');
 return ownerAuthority(tx,rule,host,options);
}

/** A cache/list read never gains rights from assistant.read, ownership, or
 * service transport alone. Unexpected database failures remain errors instead
 * of being reported as a successful empty private result. */
export async function automationVisible<T extends AutomationAuthorityTransaction>(tx:T,viewer:Actor,entity:Entity,host:AutomationAuthorityHost<T>):Promise<boolean>{
 try{
  assert(viewer.companyId===tx.companyId,'ACCESS_DENIED');
  const current=await stored(tx,entity),actor=await currentActor(tx,viewer.userId,host);
  if(current.kind==='automation_rule')await authorizeAutomationRule(tx,current,host);
  else await authorizeAutomationRun(tx,current,host);
  const scope=declaredScope(current.data.scope),action=actionOf(current);
  const permitted=automationPermissions.some(permission=>(!actor.roles.includes('SERVICE_ACCOUNT')||permission==='automation.execute')&&permitsScope(actor,permission,scope,host));
  return permitted&&readPermissions[action].some(permission=>permitsScope(actor,permission,scope,host));
 }catch(error){if(error instanceof DomainError)return false;throw error;}
}
