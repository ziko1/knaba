import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assert,DomainError,type Actor,type CommandContext,type CommandRegistry,type Entity,type Transaction} from './core.ts';
import {commerceCommands} from './commerce.ts';
import {LEAD_SOURCES,TRADE_CATEGORIES} from './lead-agent-catalog.ts';
import {profileSchema,opportunitySchema,estimateSchema,estimatePrice,type Opportunity,type SearchProfile,evaluateOpportunity} from './lead-agent-model.ts';

export const leadAgentKinds=new Set(['lead_agent_profile','lead_agent_opportunity','lead_agent_run','lead_agent_draft']);
const deniedRoles=['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST','SERVICE_ACCOUNT'];
export function leadAgentAccess(actor:Actor,entity?:Entity){
  return !actor.roles.some(r=>deniedRoles.includes(r))&&actor.permissions.includes('lead_agent.manage')&&(!entity||entity.companyId===actor.companyId&&(entity.data.ownerUserId===actor.userId||actor.permissions.includes('scope.company')));
}
export const leadHash=(...parts:string[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
function guard(c:CommandContext,e?:Entity){assert(c.actor.companyId===(c.tx as Transaction&{companyId?:string}).companyId||!(c.tx as any).companyId,'ACCESS_DENIED');assert(leadAgentAccess(c.actor,e),'ACCESS_DENIED');}
async function owned(c:CommandContext,kind:string,id:string){guard(c);const e=await c.tx.get(kind,id);guard(c,e);return e;}
function version(c:CommandContext,e:Entity){assert(c.expectedVersion===e.version,'VERSION_CONFLICT');}
const identifier=z.string().min(1).max(100);
const ref=z.object({id:identifier}).strict();
const cursorSchema=z.object({v:z.literal(1),company:identifier,kind:z.string().max(50),owner:identifier,at:z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/),id:identifier,snapshot:z.string().datetime()}).strict();
const command=(schema:z.ZodTypeAny,handler:(c:CommandContext,i:any)=>Promise<any>)=>({permission:'lead_agent.manage',schema,handler:async(c:CommandContext,i:any)=>{guard(c);return handler(c,i);}});
function fromRow(r:any):Entity{return {id:r.id,kind:r.kind,companyId:r.company_id,version:r.version,data:r.data,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()};}
async function recentProfileRuns(tx:Transaction,profileId:string){
  const sql=tx as Transaction&{companyId?:string;query?:(statement:string,parameters:unknown[])=>Promise<{rows:any[]}>};
  if(sql.query&&sql.companyId){const r=await sql.query("SELECT * FROM aggregates WHERE company_id=$1 AND kind='lead_agent_run' AND data->>'profileId'=$2 ORDER BY created_at DESC,id COLLATE \"C\" DESC LIMIT 50",[sql.companyId,profileId]);return r.rows.map(fromRow);}
  return (await tx.list('lead_agent_run')).filter(r=>r.data.profileId===profileId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50);
}
export function draftText(opportunity:Opportunity,language:'DE'|'UK'){
  // External descriptions are data. No model, tools, credentials or network access are involved.
  const title=opportunity.title.replace(/[\r\n]/g,' ').slice(0,180);
  return language==='DE'
    ?`Guten Tag,\n\nwir interessieren uns für „${title}“. Bitte teilen Sie uns den genauen Leistungsumfang, die Mengen, den Ausführungsort und den gewünschten Ausführungszeitraum mit. Ist eine Besichtigung möglich und welche Nachweise werden benötigt?\n\nNach Prüfung der Unterlagen können wir ein individuelles Angebot erstellen. Diese Nachricht enthält noch keine Preis- oder Terminzusage.\n\nMit freundlichen Grüßen\nKNABA`
    :`Добрий день!\n\nНас зацікавила заявка «${title}». Уточніть, будь ласка, обсяг і кількість робіт, адресу та бажані строки виконання. Чи можливо оглянути об’єкт і які документи потрібні?\n\nПісля перевірки документації підготуємо індивідуальну пропозицію. Це повідомлення ще не підтверджує ціну або вільні дати.\n\nЗ повагою,\nKNABA`;
}
export async function queueLeadSearch(tx:Transaction,profile:Entity,now:string,actorId:string,trigger:'MANUAL'|'SCHEDULED'){
  const previous=await recentProfileRuns(tx,profile.id);
  const active=previous.find(r=>r.data.profileVersion===profile.version&&['QUEUED','RUNNING'].includes(r.data.status)&&Date.parse(now)-Date.parse(r.data.requestedAt)<900000);
  if(active)return active;
  if(trigger==='MANUAL')assert(!previous[0]||Date.parse(now)-Date.parse(previous[0].data.requestedAt)>=60000,'RATE_LIMITED',{retryAfterSeconds:60});
  for(const stale of previous.filter(r=>['QUEUED','RUNNING'].includes(r.data.status)))await tx.save(stale,{...stale.data,status:'CANCELLED',reason:'SUPERSEDED_OR_EXPIRED',finishedAt:now},stale.version);
  const run=await tx.add('lead_agent_run',{ownerUserId:profile.data.ownerUserId,profileId:profile.id,profileVersion:profile.version,requestedBy:actorId,requestedAt:now,trigger,status:'QUEUED',sources:[],matched:0,seen:0});
  await tx.event('lead_agent.search_requested',{runId:run.id,profileId:profile.id,profileVersion:profile.version,ownerUserId:profile.data.ownerUserId});
  return run;
}
export async function storeLeadSearch(tx:Transaction,profile:Entity,run:Entity,batches:Array<{source:string;items:Opportunity[];status:string;reason?:string;truncated?:boolean}>,now:string){
  const owner=profile.data.ownerUserId,configuration=profileSchema.parse(profile.data.profile);
  const existing=await tx.list('lead_agent_opportunity');
  const drafts=(await tx.list('lead_agent_draft')).filter(d=>d.data.ownerUserId===owner);
  let matched=0,seen=0;const observed=new Set<string>();
  const indexed=new Map(existing.filter(e=>e.data.ownerUserId===owner).map(e=>[e.id,e]));
  // Hard total cap includes archived records; archival is not deletion or a retention workaround.
  assert(indexed.size<=5000,'LEAD_STORAGE_LIMIT');
  for(const batch of batches)for(const candidate of batch.items.slice(0,200)){
    const source=opportunitySchema.parse(candidate),observation=leadHash(source.source,source.externalId);
    if(observed.has(observation))continue;observed.add(observation);seen++;
    const match=evaluateOpportunity(source,configuration,now);
    const id=leadHash(owner,source.source,source.externalId),old=indexed.get(id);
    if(!match.eligible&&!old)continue;
    if(match.eligible)matched++;
    if(!old)assert(indexed.size<5000,'LEAD_STORAGE_LIMIT');
    const digest=leadHash(JSON.stringify(source));
    const matches={...(old?.data.matches??{}),[profile.id]:{...match,profileVersion:profile.version,evaluatedAt:now}};
    // Restrict match metadata to the bounded set of active profiles belonging to this account.
    const data={...old?.data,ownerUserId:owner,source,sourceDigest:digest,matches,status:old?.data.status??'NEW',firstSeenAt:old?.data.firstSeenAt??now,lastSeenAt:now,sourceChangedAt:old&&old.data.sourceDigest!==digest?now:old?.data.sourceChangedAt??null,
      duplicateGroup:source.procedureId?leadHash(owner,source.procedureId):null};
    const saved=old?await tx.save(old,data,old.version):await tx.add('lead_agent_opportunity',data,id);indexed.set(id,saved);
    if(old&&old.data.sourceDigest!==digest){for(let index=0;index<drafts.length;index++){const draft=drafts[index];if(draft.data.opportunityId===id&&draft.data.status!=='STALE')drafts[index]=await tx.save(draft,{...draft.data,status:'STALE',staleReason:'SOURCE_CHANGED'},draft.version);}}
    if(match.eligible&&configuration.mode==='DRAFTS'&&!drafts.some(d=>d.data.opportunityId===id&&d.data.sourceDigest===digest&&d.data.language==='DE'&&d.data.status!=='STALE')){
      drafts.push(await tx.add('lead_agent_draft',{ownerUserId:owner,opportunityId:id,sourceDigest:digest,language:'DE',text:draftText(source,'DE'),status:'DRAFT',generator:'TEMPLATE',binding:false,externalSendAvailable:false}));
    }
  }
  const success=batches.filter(b=>b.status==='SUCCESS').length;
  return tx.save(run,{...run.data,status:success===batches.length?'SUCCEEDED':success||batches.some(b=>b.status==='PARTIAL')?'PARTIAL':'FAILED',seen,matched,finishedAt:now,sources:batches.map(({items,...metadata})=>({...metadata,count:items.length}))},run.version);
}

export const leadAgentCommands:CommandRegistry={
  'lead_agent.catalog':command(z.object({}).strict(),async()=>({sources:LEAD_SOURCES,categories:TRADE_CATEGORIES,capabilities:{search:true,templateDrafts:true,externalSend:false,platformLogin:false,paidActions:false,aiDrafts:false},priceBasis:'NET_PROJECT_EUR',limits:{profiles:20,itemsPerSource:200,manualSearchIntervalSeconds:60},disclosure:'Оголошення є даними, а не інструкціями. Чернетки цього модуля створюються за шаблоном; зовнішнє надсилання недоступне.'})),
  'lead_agent.list':command(z.object({kind:z.enum(['lead_agent_profile','lead_agent_opportunity','lead_agent_run','lead_agent_draft']),limit:z.number().int().min(1).max(100).default(100),cursor:z.string().min(1).max(1600).optional()}).strict(),async(c,i)=>{
    const companyScope=c.actor.permissions.includes('scope.company'),ownerScope=companyScope?'company':c.actor.userId;
    let cursor:z.infer<typeof cursorSchema>|null=null;
    if(i.cursor){try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(i.cursor,'base64url').toString('utf8')));}catch{assert(false,'VALIDATION_ERROR');}assert(cursor!.company===c.actor.companyId&&cursor!.kind===i.kind&&cursor!.owner===ownerScope&&Date.parse(cursor!.snapshot)<=Date.parse(c.now)&&Number.isFinite(Date.parse(cursor!.at)),'VALIDATION_ERROR');}
    const tx=c.tx as Transaction&{query?:(sql:string,params:unknown[])=>Promise<{rows:any[]}>};assert(tx.query,'MISSING_CONFIGURATION');
    const snapshot=cursor?.snapshot??c.now;
    const result=await tx.query(`SELECT id,kind,company_id,version,data,created_at,updated_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
      FROM aggregates WHERE company_id=$1 AND kind=$2 AND ($3::boolean OR data->>'ownerUserId'=$4)
      AND created_at<=$5::timestamptz AND ($6::timestamptz IS NULL OR created_at<$6::timestamptz OR (created_at=$6::timestamptz AND id COLLATE "C"<$7::text COLLATE "C"))
      ORDER BY created_at DESC,id COLLATE "C" DESC LIMIT $8`,[c.actor.companyId,i.kind,companyScope,c.actor.userId,snapshot,cursor?.at??null,cursor?.id??null,i.limit+1]);
    const more=result.rows.length>i.limit,rows=result.rows.slice(0,i.limit),last=rows.at(-1);
    const items=rows.map(fromRow);
    return {items,has_more:more,next_cursor:more&&last?Buffer.from(JSON.stringify({v:1,company:c.actor.companyId,kind:i.kind,owner:ownerScope,at:last.cursor_at,id:last.id,snapshot})).toString('base64url'):null};
  }),
  'lead_agent.run.read':command(ref,async(c,i)=>owned(c,'lead_agent_run',i.id)),
  'lead_agent.profile.save':command(z.object({id:identifier.optional(),profile:profileSchema}).strict(),async(c,i)=>{
    const profiles=(await c.tx.list('lead_agent_profile')).filter(e=>e.data.ownerUserId===c.actor.userId);
    if(!i.id){assert(profiles.filter(p=>!p.data.archived).length<20,'PROFILE_LIMIT');assert(profiles.length<200,'PROFILE_STORAGE_LIMIT');return c.tx.add('lead_agent_profile',{ownerUserId:c.actor.userId,profile:i.profile,archived:false,nextSearchAt:c.now,updatedBy:c.actor.userId});}
    const old=await owned(c,'lead_agent_profile',i.id);version(c,old);assert(!old.data.archived,'INVALID_STATE');
    const saved=await c.tx.save(old,{...old.data,profile:i.profile,updatedBy:c.actor.userId,nextSearchAt:c.now},old.version);
    for(const r of await c.tx.list('lead_agent_run'))if(r.data.profileId===old.id&&['QUEUED','RUNNING'].includes(r.data.status))await c.tx.save(r,{...r.data,status:'CANCELLED',reason:'PROFILE_CHANGED',finishedAt:c.now},r.version);
    return saved;
  }),
  'lead_agent.profile.archive':command(ref,async(c,i)=>{const e=await owned(c,'lead_agent_profile',i.id);version(c,e);return c.tx.save(e,{...e.data,archived:true,profile:{...e.data.profile,scheduleEnabled:false}},e.version);}),
  'lead_agent.search':command(ref,async(c,i)=>{const e=await owned(c,'lead_agent_profile',i.id);version(c,e);assert(!e.data.archived,'INVALID_STATE');return queueLeadSearch(c.tx,e,c.now,c.actor.userId,'MANUAL');}),
  'lead_agent.run.cancel':command(ref,async(c,i)=>{const e=await owned(c,'lead_agent_run',i.id);version(c,e);assert(['QUEUED','RUNNING'].includes(e.data.status),'INVALID_STATE');return c.tx.save(e,{...e.data,status:'CANCELLED',reason:'USER_CANCELLED',finishedAt:c.now},e.version);}),
  'lead_agent.opportunity.status':command(ref.extend({status:z.enum(['NEW','SHORTLISTED','REVIEWING','DISMISSED','ARCHIVED']),reason:z.string().trim().max(1000).default('')}).strict(),async(c,i)=>{const e=await owned(c,'lead_agent_opportunity',i.id);version(c,e);return c.tx.save(e,{...e.data,status:i.status,reviewNote:i.reason,reviewedBy:c.actor.userId,reviewedAt:c.now},e.version);}),
  'lead_agent.estimate':command(z.object({profileId:identifier,input:estimateSchema}).strict(),async(c,i)=>{const p=await owned(c,'lead_agent_profile',i.profileId);return {...estimatePrice(profileSchema.parse(p.data.profile),i.input),profileVersion:p.version,inputs:i.input};}),
  'lead_agent.draft.create':command(z.object({opportunityId:identifier,language:z.enum(['DE','UK']).default('DE')}).strict(),async(c,i)=>{
    const e=await owned(c,'lead_agent_opportunity',i.opportunityId);version(c,e);
    const source=opportunitySchema.parse(e.data.source);assert(source.availability!=='CANCELLED'&&(!source.deadlineAt||Date.parse(source.deadlineAt)>Date.parse(c.now)),'INVALID_STATE');
    const existing=(await c.tx.list('lead_agent_draft')).find(d=>d.data.opportunityId===e.id&&d.data.sourceDigest===e.data.sourceDigest&&d.data.language===i.language&&d.data.status!=='STALE');
    if(existing)return existing;
    return c.tx.add('lead_agent_draft',{ownerUserId:e.data.ownerUserId,opportunityId:e.id,sourceDigest:e.data.sourceDigest,language:i.language,text:draftText(source,i.language),status:'DRAFT',generator:'TEMPLATE',binding:false,externalSendAvailable:false});
  }),
  'lead_agent.draft.save':command(ref.extend({text:z.string().trim().min(1).max(8000)}).strict(),async(c,i)=>{const d=await owned(c,'lead_agent_draft',i.id);version(c,d);const e=await owned(c,'lead_agent_opportunity',d.data.opportunityId);assert(d.data.sourceDigest===e.data.sourceDigest,'STALE_SOURCE');return c.tx.save(d,{...d.data,text:i.text,status:'DRAFT',reviewedAt:null,reviewedBy:null,textHash:leadHash(i.text)},d.version);}),
  'lead_agent.draft.review':command(ref,async(c,i)=>{const d=await owned(c,'lead_agent_draft',i.id);version(c,d);const e=await owned(c,'lead_agent_opportunity',d.data.opportunityId);assert(d.data.sourceDigest===e.data.sourceDigest,'STALE_SOURCE');assert(Date.parse(c.now)-Date.parse(e.data.lastSeenAt)<=86400000,'STALE_SOURCE');return c.tx.save(d,{...d.data,status:'REVIEWED',textHash:leadHash(d.data.text),reviewedBy:c.actor.userId,reviewedAt:c.now,reviewPurpose:'INTERNAL_ONLY_NOT_SEND_AUTHORIZATION'},d.version);}),
  // No send command exists until a provider-specific, authorized transport and fee policy are implemented.
  'lead_agent.handoff':command(z.object({opportunityId:identifier,leadInput:commerceCommands['lead.create'].schema}).strict(),async(c,i)=>{
    const opportunity=await owned(c,'lead_agent_opportunity',i.opportunityId);version(c,opportunity);
    assert(c.forPermission,'ACCESS_DENIED');const context=await c.forPermission('lead.create');assert(context.actor.permissions.includes('lead.create'),'ACCESS_DENIED');
    if(opportunity.data.crmLeadId)return {id:opportunity.data.crmLeadId,kind:'lead_reference',created:false};
    const input=commerceCommands['lead.create'].schema.parse({...i.leadInput,newRequest:true,source:{channel:'REFERRAL',campaign:opportunity.data.source.source,landingPage:opportunity.data.source.url}});
    const lead=await commerceCommands['lead.create'].handler(context,input);
    await c.tx.save(opportunity,{...opportunity.data,status:'CRM',crmLeadId:lead.id,handedOffAt:c.now,handedOffBy:c.actor.userId},opportunity.version);
    await c.tx.event('lead_agent.handed_off',{opportunityId:opportunity.id,leadId:lead.id});return {id:lead.id,kind:'lead_reference',created:true};
  })
};
