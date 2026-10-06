import {z} from 'zod';
import {assert} from '../domain/core.ts';
import {operationsCommands} from '../domain/operations.ts';
import {resourcesCommands} from '../domain/resources.ts';
import type {DeepSeekAnswerPolicy,SupportedLanguage} from './deepseek.ts';

const id=z.string().trim().min(1).max(100),label=z.string().min(1).max(500);
export const internalAssistantKind=z.enum(['TASK_BATCH','REPORT','MATERIAL_REQUEST']);
const ids=z.array(id).max(100).refine(v=>new Set(v).size===v.length);
const task=z.object({siteId:id,locationId:id,title:label.max(250),description:z.string().max(10000).default(''),originalLanguage:z.enum(['de','uk','en','pl','ru','lt']).default('de'),unit:z.enum(['M2','WINDOW','ROOM','FLOOR','UNIT','HOUR']).default('UNIT'),plannedQuantityMilli:z.number().int().nonnegative().safe().default(1000),assigneeIds:ids.default([]),checklist:z.array(z.object({id,label:label.max(250),required:z.boolean().default(true),checked:z.literal(false).default(false)}).strict()).max(100).default([]),acceptanceCriteria:z.array(label.max(250)).max(100).default([]),sourceQuote:z.string().min(1).max(1000)}).strict();
const stamp=z.string().datetime({offset:true}).transform(v=>new Date(v).toISOString());
const report=z.object({siteId:id,customerId:id,orderId:id,periodStart:stamp,periodEnd:stamp,documentType:z.literal('Leistungsnachweis'),taskIds:ids.default([]),descriptionDe:z.string().min(3).max(10000)}).strict();
const material=z.object({materialId:id,siteId:id,taskId:id.optional(),quantity:z.string().regex(/^\d+(?:\.\d{1,9})?$/).max(40),unit:z.enum(['ml','l','g','kg','pcs','pair','package']),dueAt:stamp,urgency:z.enum(['NORMAL','URGENT','CRITICAL']).default('NORMAL'),reason:z.string().min(3).max(2000)}).strict();
const proposalBase={needsClarification:z.boolean(),clarification:z.string().min(1).max(1000).nullable()};
export const internalDraftProposalSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('TASK_BATCH'),...proposalBase,input:z.object({tasks:z.array(task).min(1).max(20)}).strict().nullable()}).strict(),
 z.object({kind:z.literal('REPORT'),...proposalBase,input:report.nullable()}).strict(),
 z.object({kind:z.literal('MATERIAL_REQUEST'),...proposalBase,input:material.nullable()}).strict(),
]).refine(v=>v.needsClarification?v.input===null&&v.clarification!==null:v.input!==null&&v.clarification===null);
export const internalAssistantProviderContextSchema=z.object({
 sites:z.array(z.object({id,code:label,name:label}).strict()).min(1).max(10),
 locations:z.array(z.object({id,siteId:id,path:z.array(label).min(1).max(20),floorLabelDe:label.optional()}).strict()).max(100),
 assignees:z.array(z.object({id,label,siteIds:ids}).strict()).max(50),
 tasks:z.array(z.object({id,siteId:id,locationId:id.optional(),title:label,state:label}).strict()).max(100),
 materials:z.array(z.object({id,label,units:z.array(z.enum(['ml','l','g','kg','pcs','pair','package'])).min(1).max(7)}).strict()).max(100),
 orders:z.array(z.object({id,siteId:id,customerId:id}).strict()).max(20),
 reportRefs:z.array(z.object({id,siteId:id,documentType:label.optional()}).strict()).max(20),
}).strict();
export type InternalAssistantKind=z.infer<typeof internalAssistantKind>;
export type InternalDraftProposal=z.infer<typeof internalDraftProposalSchema>;
export type InternalAssistantProviderContext=z.infer<typeof internalAssistantProviderContextSchema>;
export interface InternalAssistantProviderInput {text:string;language:SupportedLanguage;kind:InternalAssistantKind;context:InternalAssistantProviderContext;policy:DeepSeekAnswerPolicy;synthetic:boolean;budgetRemainingCents:number;}
export interface InternalAssistantProviderResult {proposal:InternalDraftProposal;usage?:{input_tokens:number;output_tokens:number;cost_cents:number};provider:string;model:string;}
export interface InternalAssistantProvider {proposeInternalDraft(input:InternalAssistantProviderInput):Promise<InternalAssistantProviderResult>;}
export function internalJson(value:unknown,maxBytes=65536):string {
 const seen=new Set<object>();let nodes=0;
 function visit(v:unknown,depth:number):void{assert(++nodes<=10000&&depth<=20,'VALIDATION_ERROR');if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'){assert(Number.isFinite(v),'VALIDATION_ERROR');return;}assert(typeof v==='object'&&v!==null&&!seen.has(v),'VALIDATION_ERROR');seen.add(v);if(Array.isArray(v))for(const item of v)visit(item,depth+1);else{assert(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null,'VALIDATION_ERROR');for(const [key,item]of Object.entries(v)){assert(!['__proto__','constructor','prototype'].includes(key),'VALIDATION_ERROR');visit(item,depth+1);}}seen.delete(v);}
 visit(value,0);const encoded=JSON.stringify(value);assert(Buffer.byteLength(encoded)<=maxBytes,'VALIDATION_ERROR');return encoded;
}
const normalized=(s:string)=>s.toLocaleUpperCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const tokens=(s:string)=>normalized(s).split(' ').filter(Boolean);
function statedQuantity(text:string,quantity:string):void {
 const decimal=(v:string)=>{const [whole,fraction='']=v.replace(',','.').split('.');return `${whole!.replace(/^0+(?=\d)/,'')}.${fraction.replace(/0+$/,'')}`;};
 const source=text.match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu)??[];
 assert(source.some(v=>decimal(v)===decimal(quantity)),'AI_FACT_MISMATCH');
}
function statedTimestamp(text:string,timestamp:string):void {
 const values=text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})/g)??[];
 assert(values.some(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===timestamp),'AI_FACT_MISMATCH');
}
/** Never convert an unspecified ordinal to EG/OG. A floor label must occur in
 * the exact original excerpt; colliding labels need an explicit path discriminator. */
function locationEvidence(text:string,quote:string,location:InternalAssistantProviderContext['locations'][number],context:InternalAssistantProviderContext){
 assert(text.includes(quote),'AI_LOCATION_AMBIGUOUS');const quoteTokens=tokens(quote),anchor=location.floorLabelDe??location.path.at(-1)!;
 assert(` ${normalized(quote)} `.includes(` ${normalized(anchor)} `),'AI_LOCATION_AMBIGUOUS');
 const candidates=context.locations.filter(n=>normalized(n.floorLabelDe??n.path.at(-1)!)===normalized(anchor));
 if(candidates.length>1){const own=new Set(location.path.flatMap(tokens));const unique=[...own].filter(t=>!candidates.some(n=>n.id!==location.id&&n.path.flatMap(tokens).includes(t)));assert(unique.some(t=>quoteTokens.includes(t)),'AI_LOCATION_AMBIGUOUS');}
}
export function parseInternalDraftProposal(raw:unknown,input:Pick<InternalAssistantProviderInput,'kind'|'context'|'text'>):InternalDraftProposal {
 internalJson(raw);const parsed=internalDraftProposalSchema.safeParse(raw);assert(parsed.success,'AI_INVALID_JSON');const p=parsed.data;assert(p.kind===input.kind,'AI_INVALID_JSON');if(p.needsClarification)return p;
 const ctx=internalAssistantProviderContextSchema.parse(input.context);const sites=new Set(ctx.sites.map(s=>s.id));assert(p.input,'AI_INVALID_JSON');
 if(p.kind==='TASK_BATCH'){for(const work of p.input.tasks){const {sourceQuote,...canonical}=work;operationsCommands['task.create']!.schema.parse(canonical);assert(sites.has(work.siteId),'AI_CONTEXT_REFERENCE_INVALID');const n=ctx.locations.find(n=>n.id===work.locationId&&n.siteId===work.siteId);assert(n,'AI_CONTEXT_REFERENCE_INVALID');locationEvidence(input.text,sourceQuote,n,ctx);if(work.plannedQuantityMilli!==1000)statedQuantity(sourceQuote,String(work.plannedQuantityMilli/1000));assert(work.checklist.every(c=>!c.checked),'AI_INVALID_JSON');assert(work.assigneeIds.every(a=>ctx.assignees.some(w=>w.id===a&&w.siteIds.includes(work.siteId))),'AI_CONTEXT_REFERENCE_INVALID');}}
 else if(p.kind==='REPORT'){const report=p.input;resourcesCommands['report.create']!.schema.parse(report);statedTimestamp(input.text,report.periodStart);statedTimestamp(input.text,report.periodEnd);assert(sites.has(report.siteId)&&ctx.orders.some(o=>o.id===report.orderId&&o.siteId===report.siteId&&o.customerId===report.customerId),'AI_CONTEXT_REFERENCE_INVALID');assert(report.taskIds.every(t=>ctx.tasks.some(x=>x.id===t&&x.siteId===report.siteId&&x.state==='ACCEPTED')),'AI_CONTEXT_REFERENCE_INVALID');}
 else {const request=p.input;resourcesCommands['request.create']!.schema.parse(request);statedQuantity(input.text,request.quantity);statedTimestamp(input.text,request.dueAt);assert(sites.has(request.siteId),'AI_CONTEXT_REFERENCE_INVALID');assert(ctx.materials.some(m=>m.id===request.materialId&&m.units.includes(request.unit)),'AI_CONTEXT_REFERENCE_INVALID');if(request.taskId)assert(ctx.tasks.some(t=>t.id===request.taskId&&t.siteId===request.siteId),'AI_CONTEXT_REFERENCE_INVALID');}
 return p;
}
