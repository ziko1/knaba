import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {commerceCommands} from '../packages/domain/commerce.ts';
import type {Actor,Data} from '../packages/domain/core.ts';

// Genuine PostgreSQL transaction/mutation tests. Each test owns a fresh tenant.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('AI governance actual read-only PostgreSQL commands',()=>{
 let db:Database,engine:Engine,company:string,actor:Actor;
 const execute=(command:string,input:Data,key=randomUUID())=>engine.execute(actor,command,{input,idempotency_key:key});
 const snapshot=async()=>{
  const aggregates=(await db.query('SELECT kind,id,version,data FROM aggregates WHERE company_id=$1 ORDER BY kind,id',[company])).rows;
  const counts:Record<string,string>={};for(const table of ['audit_log','aggregate_revisions','command_receipts','outbox','private_blobs','media_blobs'])counts[table]=(await db.query(`SELECT count(*)::text AS count FROM ${table} WHERE company_id=$1`,[company])).rows[0].count;
  return {aggregates,counts};
 };
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  company=`ai-governance-qa-${randomUUID()}`;engine=new Engine(db,'TEST');
  await db.transaction(company,'SYNTHETIC_AI_GOVERNANCE_QA',async tx=>{
   await tx.add('company',{operatingMode:'TEST',synthetic:true},company);
   await tx.add('user',{active:true,roles:['DIRECTOR'],siteIds:[]},'director');
   const config=commerceCommands['assistant_config.create']!.schema.parse({name:'Synthetic draft',escalationContact:'Synthetic office',allowedServiceIds:[],territories:[],budgetCents:100});
   await tx.add('assistant_config',{...config,configVersion:1,status:'DRAFT'},'config');
   await tx.add('lead',{contact:{name:'SYNTHETIC_PRIVATE_LEAD_CANARY'},status:'NEW'},'lead');
   await tx.add('payroll_calculation',{employeeId:'somebody-else',netCents:99999,notes:'SYNTHETIC_FINANCE_CANARY'},'payroll');
   await tx.add('ai_usage',{config_id:'config',category:'TRANSLATION',currency:'EUR',started_at:new Date(Date.now()-60000).toISOString(),initial_reserved_cents:20,reserved_cents:4,actual_cents:4,status:'SUCCEEDED',input_tokens:100,output_tokens:40,cost_basis:'CONFIGURED_RATE_ESTIMATE',prompt:'SYNTHETIC_PROMPT_CANARY',result:'SYNTHETIC_RESULT_CANARY'},'usage');
  });actor=await engine.getActor('director',company);
 });
 afterEach(()=>vi.restoreAllMocks());afterAll(async()=>{await db?.close();});
 it.each(['assistant.playground','assistant.usage'])('%s executes in SERIALIZABLE READ ONLY with zero business/history/audit/receipt/outbox/blob writes',async name=>{
  const before=await snapshot(),definition=engine.registry[name]!,modes:string[]=[];
  engine.registry={...engine.registry,[name]:{...definition,handler:async(c,i)=>{modes.push((await (c.tx as any).query('SHOW transaction_read_only')).rows[0].transaction_read_only);return definition.handler(c,i);}}};
  const provider=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('LIVE_PROVIDER_FORBIDDEN_IN_SYNTHETIC_PG_TEST'));
  const result=await execute(name,name==='assistant.playground'?{configId:'config',synthetic:true,messages:[{language:'RU',text:'Синтетический тест. Нужен человек.'}]}:{});
  expect(modes).toEqual(['on']);expect(result.providerInvoked).toBe(false);expect(provider).not.toHaveBeenCalled();expect(await snapshot()).toEqual(before);
  for(const canary of ['SYNTHETIC_PRIVATE_LEAD_CANARY','SYNTHETIC_FINANCE_CANARY','SYNTHETIC_PROMPT_CANARY','SYNTHETIC_RESULT_CANARY'])expect(JSON.stringify(result)).not.toContain(canary);
  if(name==='assistant.playground')expect(result.status).toBe('SIMULATED');else expect(result.totals).toMatchObject({records:1,settledCents:4,inputTokens:100,outputTokens:40});
 });
 it.each(['add','save','event'])('PostgreSQL itself blocks accidental %s mutations in the protected read-only transaction',async operation=>{
  const before=await snapshot();await expect(db.transaction(company,'SYNTHETIC_AI_GOVERNANCE_QA',async tx=>{
   if(operation==='add')return tx.add('lead',{contact:{name:'MUST_NOT_EXIST'}});
   if(operation==='event')return tx.event('assistant.handoff_requested',{leadId:'lead'});
   const lead=await tx.get('lead','lead');return tx.save(lead,{...lead.data,status:'MUST_NOT_UPDATE'});
  },10000,true)).rejects.toMatchObject({code:'25006'});expect(await snapshot()).toEqual(before);
 });
 it('reuses a read key with current usage rather than persisting/replaying a stale result',async()=>{
  const key=randomUUID(),first=await execute('assistant.usage',{},key);expect(first.totals.settledCents).toBe(4);
  await db.transaction(company,'SYNTHETIC_AI_GOVERNANCE_QA',async tx=>{const row=await tx.get('ai_usage','usage');await tx.save(row,{...row.data,actual_cents:7,reserved_cents:7});});
  const before=await snapshot(),second=await execute('assistant.usage',{},key);expect(second.totals.settledCents).toBe(7);expect(await snapshot()).toEqual(before);expect(before.counts.command_receipts).toBe('0');
 });
 it('revoked director role denies a cached actor without any command effects',async()=>{
  await execute('assistant.usage',{});await db.transaction(company,'SYNTHETIC_AI_GOVERNANCE_QA',async tx=>{const row=await tx.get('user','director');await tx.save(row,{...row.data,roles:['CLIENT']});});const before=await snapshot();await expect(execute('assistant.playground',{configId:'config',synthetic:true,messages:[{language:'DE',text:'Synthetic request'}]})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await snapshot()).toEqual(before);
 });
});
