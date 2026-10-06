import { z } from 'zod';
export type Data = Record<string, any>;
export interface Actor { userId:string; companyId:string; roles:string[]; permissions:string[]; siteIds:string[]; customerIds:string[]; warehouseIds:string[]; mfaVerified?:boolean; }
export interface Entity<T extends Data=Data> { id:string; companyId:string; kind:string; version:number; data:T; createdAt:string; updatedAt:string; }
export class DomainError extends Error { constructor(public code:string, public details:Data={}) { super(code); } }
export interface Transaction {
 get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>;
 list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>;
 add<T extends Data=Data>(kind:string,data:T,id?:string):Promise<Entity<T>>;
 save(entity:Entity,data:Data,expectedVersion?:number):Promise<Entity>;
 event(type:string,data:Data):Promise<void>;
}
export interface CommandContext { tx:Transaction; actor:Actor; now:string; idempotencyKey:string; expectedVersion?:number; authorizeAutomationRule?:(rule:Entity)=>Promise<Actor>; authorizeAutomationRun?:(run:Entity)=>Promise<Actor>; requireSite:(id:string)=>void; requireOwn:(id:string)=>void; }
export interface CommandDefinition { permission:string; schema:z.ZodTypeAny; highRisk?:boolean; handler:(ctx:CommandContext,input:any)=>Promise<any>; }
export type CommandRegistry = Record<string,CommandDefinition>;
export function assert(condition:unknown,code:string,details:Data={}):asserts condition {if(!condition) throw new DomainError(code,details);}
export function transition(current:string,next:string,allowed:Record<string,string[]>) { assert(allowed[current]?.includes(next),'INVALID_STATE',{current,next}); }
export function integer(value:number) { assert(Number.isSafeInteger(value),'VALIDATION_ERROR'); return value; }
export function cents(quantityMilli:number,rateCents:number) { return Number((BigInt(integer(quantityMilli))*BigInt(integer(rateCents))+500n)/1000n); }
export function isManager(actor:Actor) { return actor.roles.some(r=>['OWNER','DIRECTOR','OPERATIONS_MANAGER'].includes(r)); }
export function siteScope(actor:Actor,siteId:string) { assert(isManager(actor)||actor.siteIds.includes(siteId),'ACCESS_DENIED'); }
export function ownScope(actor:Actor,userId:string) { assert(actor.userId===userId||isManager(actor)||actor.roles.includes('ACCOUNTANT'),'ACCESS_DENIED'); }
export const id=z.string().min(1).max(100);
export const timestamp=z.string().datetime({offset:true}).transform(value=>new Date(value).toISOString());
