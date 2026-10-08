import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import type {PoolClient} from 'pg';
import {Database,PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {AuthService,GUEST_COOKIE,SESSION_COOKIE} from '../apps/api/auth.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';

// Genuine PostgreSQL, current Engine authority/receipts, AuthService cookies and
// ApiController. Only Express request/response transport is doubled. No provider,
// HTTP socket or live customer is used. A missing QA DATABASE_URL skips execution;
// discovered/skipped cases never establish a database acceptance pass.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const ORIGIN='https://handoff.qa.example.test';
type Session={token:string;csrf:string;actorId:string;guest:boolean};
function request(session?:Session,method='POST',headers:Record<string,string>={}):Request {
 const values:Record<string,string>={origin:ORIGIN,host:new URL(ORIGIN).host,...headers};
 if(session){values.cookie=`${session.guest?GUEST_COOKIE:SESSION_COOKIE}=${session.token}`;values['x-csrf-token']??=session.csrf;}
 return {method,protocol:'https',ip:'192.0.2.44',headers:values,get:(name:string)=>values[name.toLowerCase()]} as unknown as Request;
}
function response(){const cookies:{name:string;value:string;options:Data}[]=[];return {cookies,res:{cookie:(name:string,value:string,options:Data)=>{cookies.push({name,value,options});}} as unknown as Response};}

postgres('PostgreSQL private customer operator handoff and authenticated guest continuity',()=>{
 let db:Database,engine:Engine,api:ApiController,auth:AuthService,company:string,operator:Actor,second:Actor;
 let operatorSession:Session,secondSession:Session;
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','');vi.stubEnv('WHATSAPP_ACCESS_TOKEN','');
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('HANDOFF_QA_MUST_NOT_CONTACT_EXTERNAL_PROVIDER');}));
  company='handoff-qa-'+randomUUID();
  await db.transaction(company,'SYNTHETIC_HANDOFF_FIXTURE',async tx=>{
   await tx.add('company',{name:'Synthetic isolated handoff QA',operatingMode:'TEST',synthetic:true},company);
   await tx.add('site',{name:'Synthetic permitted site',active:true},'site');
   await tx.add('site',{name:'Synthetic unassigned site',active:true},'other-site');
   for(const id of ['operator','second'])await tx.add('user',{name:'Synthetic '+id,roles:['DIRECTOR'],active:true,siteIds:['site'],permissions:[],synthetic:true},id);
  });
  const options={companyId:company,appMode:'TEST',publicOrigin:ORIGIN,encryptionKey:'SYNTHETIC_AUTH_KEY_NOT_A_PRODUCTION_SECRET'};
  api=new ApiController({db,engine,...options,buildSha:'0'.repeat(40)});auth=new AuthService(db,engine,options);
  operator=await engine.getActor('operator',company);second=await engine.getActor('second',company);
  const a=await auth.createSession(operator.userId),b=await auth.createSession(second.userId);
  operatorSession={token:a.token,csrf:a.csrfToken,actorId:operator.userId,guest:false};secondSession={token:b.token,csrf:b.csrfToken,actorId:second.userId,guest:false};
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
 afterAll(async()=>{await db?.close();});

 const row=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_HANDOFF_ASSERT',tx=>tx.get(kind,id));
 const rows=(kind:string)=>db.transaction(company,'SYNTHETIC_HANDOFF_ASSERT',tx=>tx.list(kind));
 const update=(kind:string,id:string,changes:Data)=>db.transaction(company,'SYNTHETIC_HANDOFF_FIXTURE_UPDATE',async tx=>{const previous=await tx.get(kind,id);return tx.save(previous,{...previous.data,...changes},previous.version);});
 const execute=(actor:Actor,name:string,input:Data={},version?:number,key=randomUUID())=>engine.execute(actor,name,{input,expected_version:version,idempotency_key:key});
 const command=(session:Session,name:string,input:Data={},version?:number,key=randomUUID())=>api.command(request(session),name,{input,expected_version:version,idempotency_key:key});
 const queuedAi=async()=>Number((await db.query("SELECT count(*)::int AS count FROM outbox WHERE company_id=$1 AND type='assistant.answer_requested'",[company])).rows[0].count);
 async function guestChat(input:Data={text:'Synthetic private original before operator claim.',language:'DE',requestHuman:true},session?:Session){
  const res=response(),submitted=await api.publicChat(request(session),res.res,input);
  if(session)return {submitted,guest:session};
  const cookie=res.cookies.find(c=>c.name===GUEST_COOKIE);expect(cookie).toBeDefined();expect(cookie!.options).toMatchObject({httpOnly:true,secure:true,sameSite:'strict'});
  const original=await row('message',submitted.messageId);
  return {submitted,guest:{token:cookie!.value,csrf:submitted.csrfToken!,actorId:original.data.author_id,guest:true} satisfies Session};
 }
 async function pending(){const f=await guestChat();return {...f,channel:await row('channel',f.submitted.channelId)};}
 async function enableSyntheticConfig(){
  vi.stubEnv('DEEPSEEK_API_KEY','SYNTHETIC_ENV_ONLY_NO_PROVIDER_CALL');
  await db.transaction(company,'SYNTHETIC_HANDOFF_CONFIG',tx=>tx.add('assistant_config',{status:'ACTIVE',configVersion:1,provider:'DEEPSEEK',testOnly:true,tools:[],knowledgeIds:[],allowedServiceIds:[],territories:[]},'config'));
 }
 async function waitForCompanyWaiters(holder:PoolClient,count:number){
  const pid=Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid),deadline=Date.now()+5000;
  while(Date.now()<deadline){
   const result=await db.query("SELECT DISTINCT w.pid FROM pg_locks h JOIN pg_locks w ON w.locktype=h.locktype AND w.database IS NOT DISTINCT FROM h.database AND w.classid=h.classid AND w.objid=h.objid AND w.objsubid=h.objsubid WHERE h.pid=$1 AND h.locktype='advisory' AND h.granted AND NOT w.granted",[pid]);
   if(result.rows.length>=count)return;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error(`Expected${count} actual PostgreSQL company-lock waiters`);
 }

 it('a new human-request guest is discoverable without membership, then only its claimed original history and authenticated reply become visible',async()=>{
  const f=await pending();expect(f.submitted.status).toBe('HANDOFF_PENDING');
  expect(f.channel.data.members.map((m:Data)=>m.user_id)).toEqual([f.guest.actorId]);
  expect(await engine.readEntities(operator,'channel')).toEqual([]);
  await expect(command(operatorSession,'message.read',{channel_id:f.channel.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const inbox=await command(operatorSession,'handoff.inbox');expect(inbox.items).toEqual([{channel_id:f.channel.id,version:f.channel.version,requested_at:f.channel.data.handoff.requested_at,state:'HANDOFF_PENDING',canonical_state:'HUMAN_QUEUED'}]);
  expect(JSON.stringify(inbox)).not.toContain('Synthetic private original');expect(JSON.stringify(inbox)).not.toContain(f.guest.actorId);
  const claimed=await command(operatorSession,'handoff.take',{channel_id:f.channel.id},inbox.items[0].version);
  expect(claimed.data.handoff).toMatchObject({state:'HUMAN_ACTIVE',owner_id:operator.userId});
  expect(claimed.data.members.find((m:Data)=>m.user_id===operator.userId)).toMatchObject({history_from:f.channel.createdAt,source:'OPERATOR_CLAIM',claim_owner_id:operator.userId,external:false});
  const read=await command(operatorSession,'message.read',{channel_id:f.channel.id});expect(read.map((m:Entity)=>m.id)).toEqual([f.submitted.messageId]);
  const reply=await command(operatorSession,'message.send',{channel_id:f.channel.id,text:'Synthetic operator reply, no crew or price promise.',language:'DE',reply_to_id:f.submitted.messageId});
  const guestState=await api.publicMessages(request(f.guest,'GET'),f.channel.id);expect(guestState.items.map((m:Entity)=>m.id)).toEqual([f.submitted.messageId,reply.id]);
  const other=await guestChat({text:'Unrelated private guest.',language:'DE',requestHuman:true});
  await expect(api.publicMessages(request(other.guest,'GET'),f.channel.id)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  await expect(command(operatorSession,'message.read',{channel_id:other.submitted.channelId})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await command(operatorSession,'handoff.resume',{channel_id:f.channel.id,reason:'Explicit reviewed return to AI'},claimed.version);
  await expect(command(operatorSession,'message.read',{channel_id:f.channel.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(command(operatorSession,'message.send',{channel_id:f.channel.id,text:'Residual operator reply must fail',language:'DE'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect((await api.publicMessages(request(f.guest,'GET'),f.channel.id)).items.map((m:Entity)=>m.id)).toEqual([f.submitted.messageId,reply.id]);
  expect((await row('channel',f.channel.id)).data.members.find((m:Data)=>m.user_id===operator.userId)).toMatchObject({revocation_reason:'AI_RESUMED',revoked_at:expect.any(String)});
  const audited=(await db.query("SELECT action FROM audit_log WHERE company_id=$1 AND actor_id=$2 AND action IN ('COMMAND:handoff.take','COMMAND:handoff.resume') ORDER BY id",[company,operator.userId])).rows;
  expect(audited.map(r=>r.action)).toEqual(['COMMAND:handoff.take','COMMAND:handoff.resume']);expect(await queuedAi()).toBe(0);
 });

 it('two independently waiting actual Engine operators produce one claim owner and one committed claim membership',async()=>{
  const f=await pending(),holder=await db.pool.connect();let results:PromiseSettledResult<any>[]=[];
  await holder.query('SELECT pg_advisory_lock(hashtext($1))',[company]);
  const attempts=Promise.allSettled([execute(operator,'handoff.take',{channel_id:f.channel.id},f.channel.version),execute(second,'handoff.take',{channel_id:f.channel.id},f.channel.version)]);
  try{await waitForCompanyWaiters(holder,2);}finally{try{await holder.query('SELECT pg_advisory_unlock_all()');}finally{holder.release();results=await attempts;}}
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  const failed=results.find(result=>result.status==='rejected') as PromiseRejectedResult;expect(failed.reason).toMatchObject({code:expect.stringMatching(/^(CONVERSATION_OWNED|VERSION_CONFLICT)$/)});
  const channel=await row('channel',f.channel.id),claims=channel.data.members.filter((m:Data)=>m.source==='OPERATOR_CLAIM'&&!m.revoked_at);expect(claims).toHaveLength(1);expect(channel.data.handoff.owner_id).toBe(claims[0].user_id);
  const effects=await db.query("SELECT type FROM outbox WHERE company_id=$1 AND type='conversation.human_active'",[company]);expect(effects.rows).toHaveLength(1);
  const receipts=await db.query("SELECT actor_id FROM command_receipts WHERE company_id=$1 AND command='handoff.take'",[company]);expect(receipts.rows).toEqual([{actor_id:channel.data.handoff.owner_id}]);
  const loser=channel.data.handoff.owner_id===operator.userId?second:operator;await expect(execute(loser,'message.read',{channel_id:channel.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });

 it('permission removal committed while a real company-lock waiter is blocked defeats its cached actor before claim effects',async()=>{
  const f=await pending(),holder=await db.pool.connect();await holder.query('SELECT pg_advisory_lock(hashtext($1))',[company]);
  const attempt=execute(operator,'handoff.take',{channel_id:f.channel.id},f.channel.version).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
  let outcome:Awaited<typeof attempt>|undefined;
  try{
   await waitForCompanyWaiters(holder,1);await holder.query('BEGIN');
   const tx=new PgTransaction(holder,company,'SYNTHETIC_ADMIN_REVOKE_WHILE_WAITING'),current=await tx.get('user',operator.userId);
   await tx.save(current,{...current.data,roles:['EMPLOYEE'],permissions:[]},current.version);await holder.query('COMMIT');
  }finally{try{await holder.query('ROLLBACK');await holder.query('SELECT pg_advisory_unlock_all()');}finally{holder.release();outcome=await attempt;}}
  expect(outcome?.error).toMatchObject({code:'ACCESS_DENIED'});expect((await row('channel',f.channel.id)).data.members).toEqual(f.channel.data.members);
  expect((await db.query("SELECT idempotency_key FROM command_receipts WHERE company_id=$1 AND command='handoff.take'",[company])).rows).toEqual([]);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='conversation.human_active'",[company])).rows).toEqual([]);
 });

 it('a stale displayed version creates no receipt, owner or membership even when the session remains valid',async()=>{
  const f=await pending();await update('channel',f.channel.id,{name:'Changed reviewed metadata'});
  await expect(command(operatorSession,'handoff.take',{channel_id:f.channel.id},f.channel.version)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect((await row('channel',f.channel.id)).data.members).toEqual(f.channel.data.members);
  expect((await db.query("SELECT idempotency_key FROM command_receipts WHERE company_id=$1 AND command='handoff.take'",[company])).rows).toEqual([]);
 });

 it('fresh inbox replay recomputes current minimal pending data instead of replaying a stale receipt',async()=>{
  const f=await pending(),key=randomUUID();const first=await execute(operator,'handoff.inbox',{},undefined,key);
  const changed=await update('channel',f.channel.id,{handoff:{...f.channel.data.handoff,requested_at:new Date(Date.now()+1000).toISOString()}});
  const refreshed=await execute(operator,'handoff.inbox',{},undefined,key);expect(refreshed.items[0]).toMatchObject({version:changed.version,requested_at:changed.data.handoff.requested_at});expect(refreshed.items[0].version).not.toBe(first.items[0].version);
  await execute(second,'handoff.take',{channel_id:f.channel.id},changed.version);
  expect(await execute(operator,'handoff.inbox',{},undefined,key)).toEqual({items:[]});
  const receipts=await db.query('SELECT result FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',[company,operator.userId,key]);expect(receipts.rows).toHaveLength(1);expect(receipts.rows[0].result).toEqual(first);
 });

 it('unassigned site pending conversations are not discoverable or claimable and do not leak source text',async()=>{
  const f=await pending(),scoped=await update('channel',f.channel.id,{site_id:'other-site'});
  expect(await command(operatorSession,'handoff.inbox')).toEqual({items:[]});await expect(command(operatorSession,'handoff.take',{channel_id:f.channel.id},scoped.version)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect((await row('channel',f.channel.id)).data.members).toEqual(f.channel.data.members);
 });

 it('same-looking IDs in another company cannot reveal or claim the foreign guest channel',async()=>{
  const foreign='foreign-handoff-'+randomUUID();let hidden!:Entity;
  await db.transaction(foreign,'SYNTHETIC_FOREIGN_HANDOFF',async tx=>{await tx.add('company',{operatingMode:'TEST'},foreign);hidden=await tx.add('channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',name:'FOREIGN_CUSTOMER_SECRET',members:[],handoff:{state:'HANDOFF_PENDING',owner_id:null,requested_at:new Date().toISOString()}},'foreign-pending');});
  expect(await command(operatorSession,'handoff.inbox')).toEqual({items:[]});await expect(command(operatorSession,'handoff.take',{channel_id:hidden.id},hidden.version)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect((await db.transaction(foreign,'SYNTHETIC_FOREIGN_ASSERT',tx=>tx.get('channel',hidden.id))).data.members).toEqual([]);
 });

 it('providerless manual fallback becomes a real pending operator handoff without queueing an invented AI reply',async()=>{
  const f=await guestChat({text:'No provider available; please preserve my request.',language:'UK'});
  expect(f.submitted).toMatchObject({status:'MANUAL_FALLBACK',providerStatus:'BLOCKED_EXTERNAL'});
  const channel=await row('channel',f.submitted.channelId);expect(channel.data.handoff).toMatchObject({state:'HANDOFF_PENDING',owner_id:null,reason:'AI_PROVIDER_UNAVAILABLE',source_message_id:f.submitted.messageId});
  expect((await command(operatorSession,'handoff.inbox')).items[0]).toMatchObject({channel_id:channel.id,version:channel.version});expect(await queuedAi()).toBe(0);expect(fetch).not.toHaveBeenCalled();
 });

 it('an already pending conversation cannot silently restart AI when a configured key later appears',async()=>{
  const f=await guestChat({text:'Preserve this manual pending request.',language:'DE'});await enableSyntheticConfig();
  const next=await guestChat({text:'A second input after provider configuration.',language:'DE'},f.guest);
  expect(next.submitted.status).toBe('HANDOFF_PENDING');expect(next.submitted.channelId).toBe(f.submitted.channelId);expect(await queuedAi()).toBe(0);
  expect((await row('channel',f.submitted.channelId)).data.handoff.reason).toBe('AI_PROVIDER_UNAVAILABLE');expect(fetch).not.toHaveBeenCalled();
 });

 it('repeated requestHuman while HUMAN_ACTIVE preserves the actual owner and does not create a second takeover or AI job',async()=>{
  const f=await pending(),claimed=await command(operatorSession,'handoff.take',{channel_id:f.channel.id},f.channel.version);await enableSyntheticConfig();
  for(let n=0;n<2;n++)await guestChat({text:`Customer followup${n}`,language:'DE',requestHuman:true},f.guest);
  const current=await row('channel',f.channel.id);expect(current.version).toBe(claimed.version);expect(current.data.handoff).toEqual(claimed.data.handoff);expect(current.data.members).toEqual(claimed.data.members);
  expect((await command(secondSession,'handoff.inbox')).items).toEqual([]);expect(await queuedAi()).toBe(0);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='conversation.handoff_requested'",[company])).rows).toHaveLength(1);expect(fetch).not.toHaveBeenCalled();
 });

 it('explicit AI return followed by a new customer human request permits a new exact-version claim by the same operator',async()=>{
  const f=await pending(),firstKey=randomUUID(),claimed=await command(operatorSession,'handoff.take',{channel_id:f.channel.id},f.channel.version,firstKey);
  await command(operatorSession,'handoff.resume',{channel_id:f.channel.id,reason:'Explicit first return to AI'},claimed.version);
  const resumed=await row('channel',f.channel.id),oldMembership=resumed.data.members.find((m:Data)=>m.user_id===operator.userId);
  await expect(command(operatorSession,'handoff.take',{channel_id:f.channel.id},f.channel.version,firstKey)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await guestChat({text:'A new explicit request for a human after the earlier return.',language:'DE',requestHuman:true},f.guest);
  const inbox=await command(operatorSession,'handoff.inbox');expect(inbox.items).toHaveLength(1);expect(inbox.items[0].version).toBeGreaterThan(claimed.version);
  const secondClaim=await command(operatorSession,'handoff.take',{channel_id:f.channel.id},inbox.items[0].version);
  const memberships=secondClaim.data.members.filter((m:Data)=>m.user_id===operator.userId);expect(memberships).toHaveLength(2);expect(memberships[0]).toEqual(oldMembership);expect(memberships[1]).toMatchObject({source:'OPERATOR_CLAIM',claim_owner_id:operator.userId,history_from:f.channel.createdAt});
  expect((await command(operatorSession,'message.read',{channel_id:f.channel.id}))).toHaveLength(2);expect((await db.query("SELECT idempotency_key FROM command_receipts WHERE company_id=$1 AND command='handoff.take'",[company])).rows).toHaveLength(2);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='conversation.human_active'",[company])).rows).toHaveLength(2);
 });

 it('an explicit admin revocation remains authoritative through later fresh customer handoffs',async()=>{
  const f=await pending(),claimed=await command(operatorSession,'handoff.take',{channel_id:f.channel.id},f.channel.version);
  await update('channel',f.channel.id,{members:claimed.data.members.map((m:Data)=>m.user_id===operator.userId?{...m,revoked_at:new Date().toISOString(),revocation_reason:'ADMIN_REVOKED'}:m),handoff:{state:'HANDOFF_PENDING',owner_id:null,requested_at:new Date().toISOString()}});
  await guestChat({text:'Another request does not restore revoked operator rights.',language:'DE',requestHuman:true},f.guest);
  expect(await command(operatorSession,'handoff.inbox')).toEqual({items:[]});const current=await row('channel',f.channel.id);await expect(command(operatorSession,'handoff.take',{channel_id:f.channel.id},current.version)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(current.data.members.filter((m:Data)=>m.user_id===operator.userId)).toHaveLength(1);
 });

 it('current guest disablement invalidates its existing private cookie after an operator reply',async()=>{
  const f=await pending();await command(operatorSession,'handoff.take',{channel_id:f.channel.id},f.channel.version);await command(operatorSession,'message.send',{channel_id:f.channel.id,text:'Synthetic private response.',language:'DE'});
  expect((await api.publicMessages(request(f.guest,'GET'),f.channel.id)).items).toHaveLength(2);await update('user',f.guest.actorId,{active:false});
  await expect(api.publicMessages(request(f.guest,'GET'),f.channel.id)).rejects.toMatchObject({code:'ACCESS_DENIED'});await expect(guestChat({text:'Revoked private session.',language:'DE'},f.guest)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
});
