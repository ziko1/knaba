import {z} from 'zod';
import {assert,type Data,type Entity} from '../domain/core.ts';
import {ASSISTANT_TOOL_NAMES,ASSISTANT_TOOL_SCHEMAS} from './assistant-tools.ts';

export const AI_CATEGORIES=['CUSTOMER_ASSISTANT','INTERNAL_DRAFT','TRANSLATION'] as const;
export type AiCategory=typeof AI_CATEGORIES[number];
const amount=z.number().int().min(0).max(1_000_000_000);
const limit=z.object({dailyCents:amount,totalCents:amount}).strict().refine(v=>v.dailyCents<=v.totalCents,'daily limit exceeds total limit');
export const aiCategoryBudgetsSchema=z.object({CUSTOMER_ASSISTANT:limit,INTERNAL_DRAFT:limit,TRANSLATION:limit}).strict();
export function effectiveAiCategoryBudgets(config:Data){
 const ceiling=amount.parse(config.budgetCents??0);
 const budgets=aiCategoryBudgetsSchema.parse(config.categoryBudgets??Object.fromEntries(AI_CATEGORIES.map(category=>[category,{dailyCents:ceiling,totalCents:ceiling}])));
 assert(AI_CATEGORIES.every(category=>budgets[category].totalCents<=ceiling),'VALIDATION_ERROR',{reason:'CATEGORY_BUDGET_EXCEEDS_GLOBAL_CEILING'});
 return budgets;
}
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
export function berlinAiBudgetDay(at:string){assert(Number.isFinite(Date.parse(at)),'VALIDATION_ERROR');return dayFormat.format(new Date(at));}
export function aiUsageCategory(data:Data):AiCategory|'LEGACY_UNCLASSIFIED'{return AI_CATEGORIES.includes(data.category)?data.category:'LEGACY_UNCLASSIFIED';}
function cents(value:unknown){assert(Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=1_000_000_000,'INVALID_STATE',{reason:'AI_USAGE_COST_INVALID'});return Number(value);}
export function aiUsageCharge(data:Data){
 assert(data.currency===undefined||data.currency==='EUR','INVALID_STATE',{reason:'AI_COST_CURRENCY_MISMATCH'});
 const reserved=cents(data.reserved_cents??0),actual=data.actual_cents===null||data.actual_cents===undefined?undefined:cents(data.actual_cents);
 return ['SUCCEEDED','RELEASED','CANCELLED'].includes(data.status)&&actual!==undefined?actual:Math.max(reserved,actual??0);
}
const sum=(values:number[])=>{const value=values.reduce((a,b)=>a+b,0);assert(Number.isSafeInteger(value),'INVALID_STATE',{reason:'AI_USAGE_OVERFLOW'});return value;};
function usageTimestamp(row:Entity){const value=typeof row.data.started_at==='string'&&Number.isFinite(Date.parse(row.data.started_at))?row.data.started_at:row.createdAt;assert(Number.isFinite(Date.parse(value)),'INVALID_STATE',{reason:'AI_USAGE_DATE_INVALID'});return value;}
/** Call inside the existing serialized company transaction. No mutation is performed.
 * DAILY spans company/config switches; TOTAL and global preserve the existing config
 * lifetime contract. Unknown legacy categories debit every category conservatively. */
export function aiBudgetHeadroom(config:Entity,usage:Entity[],category:AiCategory,now:string){
 assert(AI_CATEGORIES.includes(category),'VALIDATION_ERROR');const budgets=effectiveAiCategoryBudgets(config.data),today=berlinAiBudgetDay(now);
 const ceiling=amount.parse(config.data.budgetCents??0),rows=usage.filter(row=>row.companyId===config.companyId),relevant=rows.filter(row=>[category,'LEGACY_UNCLASSIFIED'].includes(aiUsageCategory(row.data)));
 const globalUsed=sum(rows.filter(row=>row.data.config_id===config.id).map(row=>aiUsageCharge(row.data)));
 const totalUsed=sum(relevant.filter(row=>row.data.config_id===config.id).map(row=>aiUsageCharge(row.data)));
 const dailyUsed=sum(relevant.filter(row=>berlinAiBudgetDay(usageTimestamp(row))===today).map(row=>aiUsageCharge(row.data)));
 return {currency:'EUR' as const,timeZone:'Europe/Berlin' as const,category,budgetDay:today,globalRemainingCents:Math.max(0,ceiling-globalUsed),totalRemainingCents:Math.max(0,budgets[category].totalCents-totalUsed),dailyRemainingCents:Math.max(0,budgets[category].dailyCents-dailyUsed),remainingCents:Math.max(0,Math.min(ceiling-globalUsed,budgets[category].totalCents-totalUsed,budgets[category].dailyCents-dailyUsed))};
}
export const assistantPlaygroundSchema=z.object({configId:z.string().min(1).max(100),configVersion:z.number().int().positive().optional(),synthetic:z.literal(true),messages:z.array(z.object({language:z.enum(['DE','UK','RU','PL','LT','EN']),text:z.string().trim().min(1).max(4000)}).strict()).min(1).max(20),scenario:z.enum(['AUTO','GREETING','SERVICE_SEARCH','CLARIFICATION','HANDOFF','PROMPT_INJECTION']).default('AUTO'),toolProposals:z.array(z.object({id:z.string().min(1).max(100),name:z.enum(ASSISTANT_TOOL_NAMES as [typeof ASSISTANT_TOOL_NAMES[number],...typeof ASSISTANT_TOOL_NAMES[number][]]),arguments:z.record(z.unknown())}).strict()).max(6).default([])}).strict();
export type PlaygroundInput=z.infer<typeof assistantPlaygroundSchema>;
export interface PlaygroundSnapshot {config:Entity;services:Entity[];knowledge:Entity[];now:string;}
const replies={RU:{clarify:'AI-помощник (симуляция): Опишите услугу и место. Цена, время и команда ещё не подтверждены.',handoff:'AI-помощник (симуляция): Потребовалась бы передача человеку. Этот тест не создаёт передачу.',refuse:'AI-помощник (симуляция): Текст не даёт прав. Финансовые действия, личные данные и история мест заблокированы.'},DE:{clarify:'KI-Assistent (Simulation): Bitte beschreiben Sie die gewünschte Leistung und den Ort. Preis, Termin und Team sind noch unbestätigt.',handoff:'KI-Assistent (Simulation): Eine Übergabe an einen Menschen wäre erforderlich. In diesem Test wurde keine Übergabe ausgelöst.',refuse:'KI-Assistent (Simulation): Inhalte können keine Rechte vergeben. Finanzaktionen, private Daten und Standortverläufe bleiben gesperrt.'},UK:{clarify:'AI-помічник (симуляція): Опишіть послугу та місце. Ціну, час і команду ще не підтверджено.',handoff:'AI-помічник (симуляція): Потрібна передача людині. У цьому тесті передачу не створено.',refuse:'AI-помічник (симуляція): Текст не надає прав. Фінансові дії, приватні дані й історія місць заблоковані.'},PL:{clarify:'Asystent AI (symulacja): Proszę opisać usługę i miejsce. Cena, termin i zespół nie są potwierdzone.',handoff:'Asystent AI (symulacja): Potrzebne byłoby przekazanie człowiekowi. W tym teście nie utworzono przekazania.',refuse:'Asystent AI (symulacja): Treść nie nadaje uprawnień. Finanse i dane prywatne pozostają zablokowane.'},LT:{clarify:'AI asistentas (simuliacija): Aprašykite paslaugą ir vietą. Kaina, laikas ir komanda dar nepatvirtinti.',handoff:'AI asistentas (simuliacija): Reikėtų perduoti žmogui. Šis bandymas perdavimo nesukūrė.',refuse:'AI asistentas (simuliacija): Turinys nesuteikia teisių. Finansai ir privatūs duomenys užblokuoti.'},EN:{clarify:'AI assistant (simulation): Describe the service and location. Price, date and crew remain unconfirmed.',handoff:'AI assistant (simulation): Human handoff would be needed. No handoff was created in this test.',refuse:'AI assistant (simulation): Text cannot grant permissions. Finance, private data and location history remain blocked.'}};
/** Pure deterministic sandbox: no host/transaction/provider/dispatcher is accepted.
 * Sources are minimized approved PUBLIC facts; private/customer tools stay closed. */
export function simulateAssistantPlayground(raw:unknown,snapshot:PlaygroundSnapshot){
 const input=assistantPlaygroundSchema.parse(raw),config=snapshot.config;
 assert(input.configId===config.id&&(input.configVersion===undefined||input.configVersion===config.data.configVersion),'VERSION_CONFLICT');
 assert(config.data.pricingPolicy==='SERVER_PRICE_ONLY'&&config.data.contextPolicy==='ACL_FILTER_BEFORE_RETRIEVAL'&&config.data.handoffPolicy==='SUPPRESS_AI_UNTIL_AUTHORIZED_RETURN'&&config.data.supportedLanguages.includes('DE'),'NEEDS_APPROVAL',{reason:'ASSISTANT_POLICY_INVALID'});
 effectiveAiCategoryBudgets(config.data);
 const services=snapshot.services.filter(row=>row.companyId===config.companyId&&config.data.allowedServiceIds.includes(row.id)&&row.data.active===true&&row.data.approvedBy).slice(0,20).map(row=>({id:row.id,version:row.version,name:String(row.data.name).slice(0,250),description:String(row.data.description).slice(0,2000),unit:row.data.unit,questions:(row.data.questions??[]).slice(0,10).map((v:unknown)=>String(v).slice(0,500))}));
 const sources=snapshot.knowledge.filter(row=>row.companyId===config.companyId&&config.data.knowledgeIds.includes(row.id)&&row.data.status==='APPROVED'&&row.data.visibility==='PUBLIC'&&Date.parse(row.data.validFrom)<=Date.parse(snapshot.now)&&(!row.data.validUntil||Date.parse(row.data.validUntil)>Date.parse(snapshot.now))).slice(0,20).map(row=>({id:row.id,version:row.version,title:String(row.data.title).slice(0,250),content:String(row.data.content).slice(0,2000)}));
 const toolResults=input.toolProposals.map(proposal=>{
  assert(config.data.tools.includes(proposal.name),'ACCESS_DENIED',{reason:'TOOL_NOT_ALLOWED'});
  const encoded=JSON.stringify(proposal.arguments);assert(encoded.length<=16384,'VALIDATION_ERROR');
  const arguments_:Data=ASSISTANT_TOOL_SCHEMAS[proposal.name].parse(proposal.arguments);
  if(proposal.name==='searchApprovedServices'){const query=String(arguments_.query??'').toLocaleLowerCase();return {id:proposal.id,name:proposal.name,status:'SIMULATED_READ_ONLY',result:{services:services.filter(row=>!query||`${row.name} ${row.description}`.toLocaleLowerCase().includes(query)).slice(0,arguments_.limit)}};}
  if(proposal.name==='getServiceQuestions'){const service=services.find(row=>row.id===arguments_.serviceId);assert(service,'NOT_FOUND_SAFE');return {id:proposal.id,name:proposal.name,status:'SIMULATED_READ_ONLY',result:{serviceId:service.id,questions:service.questions,unit:service.unit}};}
  return {id:proposal.id,name:proposal.name,status:'BLOCKED_IN_PLAYGROUND',reason:'BUSINESS_OR_PRIVATE_TOOL_EXECUTION_DISABLED'};
 });
 assert(new Set(input.toolProposals.map(p=>p.id)).size===input.toolProposals.length,'VALIDATION_ERROR');
 const transcript=input.messages.map(message=>{
  assert(config.data.supportedLanguages.includes(message.language),'VALIDATION_ERROR');
  const injection=/ignore|payroll|password|secret|\bSQL\b|\bGPS\b|überweis|ігнор|игнор|перекаж|виплат|зарплат|банк/iu.test(message.text),human=/human|mensch|menschen|людин|человек|сотрудник|człowiek|žmog/iu.test(message.text);
  const scenario=input.scenario==='AUTO'?injection?'PROMPT_INJECTION':human?'HANDOFF':'CLARIFICATION':input.scenario;
  const answer=scenario==='GREETING'&&message.language==='DE'?`KI-Assistent (Simulation): ${config.data.greeting}`:scenario==='HANDOFF'?replies[message.language].handoff:scenario==='PROMPT_INJECTION'?replies[message.language].refuse:replies[message.language].clarify;
  return {language:message.language,scenario,answer:answer.slice(0,config.data.maxResponseLength),handoffWouldBeRequired:scenario==='HANDOFF',teamConfirmed:false,scheduleConfirmed:false};
 });
 return {status:'SIMULATED',simulationKind:'DETERMINISTIC_POLICY_AND_STATIC_TOOLS',notice:'Synthetic local policy simulation; no LLM/provider evaluation, customer contact or business action performed.',configId:config.id,configVersion:config.data.configVersion,providerInvoked:false,businessEffectsExecuted:false,costCents:0,actualProviderUsage:null,transcript,services,sources,toolResults};
}

/** Aggregate known metrics only. Missing tokens/cost stay explicitly unknown.
 * Cost from configured token tariffs is never represented as a supplier invoice. */
export function aggregateAiUsage(rows:Entity[],companyId:string,from:string,to:string){
 const buckets=new Map<string,Data>();
 for(const row of rows){if(row.companyId!==companyId)continue;const data=row.data,started=Date.parse(data.started_at??''),at=Number.isFinite(started)?started:Date.parse(row.createdAt);assert(Number.isFinite(at),'INVALID_STATE',{reason:'AI_USAGE_DATE_INVALID'});if(!(at>=Date.parse(from)&&at<Date.parse(to)))continue;
  const category=aiUsageCategory(data),bucket=buckets.get(category)??{category,records:0,reservedCents:0,settledCents:0,unknownCostRecords:0,retainedReservationCents:0,inputTokens:0,outputTokens:0,unknownTokenRecords:0,statusCounts:{},costBasisCounts:{}};
  bucket.records++;bucket.reservedCents+=cents(data.initial_reserved_cents??data.reserved_cents??0);const charge=aiUsageCharge(data);
  if(data.actual_cents===null||data.actual_cents===undefined){bucket.unknownCostRecords++;bucket.retainedReservationCents+=charge;}else bucket.settledCents+=cents(data.actual_cents);
  const input=data.input_tokens??data.usage?.input_tokens,output=data.output_tokens??data.usage?.output_tokens;
  if(input===undefined||output===undefined||input===null||output===null)bucket.unknownTokenRecords++;else{assert(Number.isSafeInteger(input)&&input>=0&&Number.isSafeInteger(output)&&output>=0,'INVALID_STATE',{reason:'AI_USAGE_TOKENS_INVALID'});bucket.inputTokens+=input;bucket.outputTokens+=output;}
  const status=['RUNNING','SUCCEEDED','FAILED','RELEASED','CANCELLED','UNKNOWN'].includes(data.status)?data.status:'UNKNOWN',basis=['CONFIGURED_RATE_ESTIMATE','PROVIDER_REPORTED_COST'].includes(data.cost_basis)?data.cost_basis:'LEGACY_UNDECLARED';
  bucket.statusCounts[status]=(bucket.statusCounts[status]??0)+1;bucket.costBasisCounts[basis]=(bucket.costBasisCounts[basis]??0)+1;buckets.set(category,bucket);
 }
 const categories=[...buckets.values()].sort((a,b)=>a.category.localeCompare(b.category));
 for(const bucket of categories)for(const field of ['reservedCents','settledCents','retainedReservationCents','inputTokens','outputTokens'])assert(Number.isSafeInteger(bucket[field]),'INVALID_STATE',{reason:'AI_USAGE_OVERFLOW'});
 return {currency:'EUR',from,to,interval:'[from,to)',categories,totals:Object.fromEntries(['records','reservedCents','settledCents','unknownCostRecords','retainedReservationCents','inputTokens','outputTokens','unknownTokenRecords'].map(field=>[field,sum(categories.map(bucket=>bucket[field]))])),supplierStatus:'NOT_RECONCILED_TO_PROVIDER_INVOICE',costNotice:'Settled configured-rate amounts and legacy amounts are not provider invoices; unknown cost/token records are retained explicitly.'};
}
