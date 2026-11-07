import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {Database} from '../apps/api/database.ts';
import {acceptIntegrationEvent,integrationEventError} from '../apps/api/integration-events.ts';
import {integrationCommands,integrationEnvelopeSchema} from '../packages/domain/integrations.ts';
import type {CommandContext,Data} from '../packages/domain/core.ts';
import type {IntegrationCredential} from '../packages/integrations/generic-events.ts';

// Actual website SQLite dispatcher → actual ERP PostgreSQL adapter. Transport is
// explicitly injected in-process: no HTTPS, provider or deployed-runtime claim.
const realPostgres=process.env.DATABASE_URL?describe:describe.skip;
const NOW=Date.parse('2026-11-08T00:00:00.000Z'),SOURCE='knaba_site';
const SECRET='SYNTHETIC_SITE_BRIDGE_KEY_NOT_FOR_LIVE_20261108';
realPostgres('website intake bridge with real PostgreSQL commits',()=>{
 let db:Database;
 let deliver:(sql:DatabaseSync,env:Record<string,string>,transport:typeof fetch,now:number)=>Promise<{status:string}>;
 let open:(path:string)=>{db:DatabaseSync};
 beforeAll(async()=>{
  const dispatcherUrl=new URL('../../corporate-site/vps/erp-bridge.mjs',import.meta.url).href;
  const databaseUrl=new URL('../../corporate-site/vps/database.mjs',import.meta.url).href;
  ({deliverPendingLead:deliver}=await import(dispatcherUrl));({openLocalDatabase:open}=await import(databaseUrl));
  db=new Database();await db.migrate();
 });
 afterAll(async()=>{await db?.close();});
 async function fixture(){
  const company=`synthetic-site-bridge-${randomUUID()}`,eventId=randomUUID();
  const key:IntegrationCredential={source:SOURCE,companyId:company,keyId:'site_test',secret:SECRET,enabled:true};
  const example=integrationEnvelopeSchema.parse({schema_version:'1',event_id:eventId,event_type:'lead.upsert',source:SOURCE,occurred_at:new Date(NOW).toISOString(),external_id:eventId,payload:{contact:{name:'Synthetic Contact',email:'synthetic@example.test'},serviceIds:['clean'],language:'UK'}});
  await db.transaction(company,'SYNTHETIC_BRIDGE_SETUP',async tx=>{
   await tx.add('user',{roles:['OWNER'],active:true},'owner');await tx.add('service',{active:true},'clean');
   const ctx:CommandContext={tx,actor:{companyId:company,userId:'owner',roles:['OWNER'],permissions:['bot.settings.manage'],siteIds:[],warehouseIds:[],customerIds:[],mfaVerified:true},now:new Date(NOW).toISOString(),idempotencyKey:'setup',requireOwn(){throw Error('Unexpected self scope');},requireSite(){throw Error('Unexpected site scope');}};
   const run=async(name:string,input:Data)=>{const command=integrationCommands[name]!;return command.handler(ctx,command.schema.parse(input));};
   const config=await run('integration_config.create',{source:SOURCE,ownerUserId:'owner',allowedServiceIds:['clean'],credentialKeyIds:['site_test']});
   const preview=await run('integration_config.preview',{id:config.id,example});
   await run('integration_config.activate',{id:config.id,command_hash:preview.command_hash,expected_version:preview.expected_version});
  });
  const directory=mkdtempSync(join(tmpdir(),'knaba-site-pg-'));const sql=open(join(directory,'synthetic.sqlite')).db;
  const row={id:eventId,service:'baureinigung',object_type:'Baustelle',postcode:'10115',area:'100',frequency:'Einmalig',message:'Synthetic private free text excluded',contact_name:'Synthetic Contact',email:'synthetic@example.test',phone:'',address:'Synthetic site',dedupe_scope:'synthetic',idempotency_key:eventId,payload_hash:'synthetic',privacy_version:'2026-10-24',created_at:new Date(NOW).toISOString(),updated_at:new Date(NOW).toISOString(),last_mutation:eventId};
  sql.prepare(`INSERT INTO cleaning_requests (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
  sql.prepare('INSERT INTO site_erp_outbox(id,request_id,locale,source_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(eventId,eventId,'UK',JSON.stringify({landingPage:'https://knaba.example.test/uk/kontakt/',campaign:'synthetic'}),row.created_at,row.created_at);
  const env={KNABA_ERP_BRIDGE_ENABLED:'true',KNABA_ERP_TRANSFER_APPROVED:'true',KNABA_ERP_APPROVED_PRIVACY_VERSION:'2026-10-24',KNABA_ERP_URL:`https://erp.example.test/api/v1/integrations/${SOURCE}/events`,KNABA_ERP_ALLOWED_ORIGIN:'https://erp.example.test',KNABA_ERP_KEY_ID:'site_test',KNABA_ERP_SECRET:SECRET,KNABA_ERP_SERVICE_MAP_JSON:JSON.stringify({baureinigung:'clean'})};
  const receive=async(init:RequestInit,backend:Pick<Database,'transaction'>=db)=>{
   const headers=new Headers(init.headers);return acceptIntegrationEvent(backend,[key],SOURCE,Buffer.from(init.body as Uint8Array),{keyId:headers.get('x-knaba-key-id'),timestamp:headers.get('x-knaba-timestamp'),signature:headers.get('x-knaba-signature')},Number(headers.get('x-knaba-timestamp'))*1000);
  };
  const transport:typeof fetch=async(_url,init)=>{try{return Response.json(await receive(init!));}catch(error){const result=integrationEventError(error);return Response.json(result.body,{status:result.status});}};
  const effects=async()=>{const results=await db.query("SELECT kind,id,version,data FROM aggregates WHERE company_id=$1 AND kind IN ('lead','integration_event','integration_record') ORDER BY kind,id",[company]);return results.rows;};
  const finish=()=>{sql.close();rmSync(directory,{recursive:true,force:true});};
  return {company,eventId,key,sql,env,receive,transport,effects,finish};
 }
 it('reconciles a lost response after PostgreSQL commit using one event, lead and domain outbox effect',async()=>{
  const f=await fixture();
  try{
   let calls=0;const lost:typeof fetch=async(_url,init)=>{calls++;await f.receive(init!);throw Error('Synthetic response loss after commit');};
   expect(await deliver(f.sql,f.env,lost,NOW)).toEqual({status:'PENDING'});
   const committed=await f.effects();expect(committed.filter(r=>r.kind==='lead')).toHaveLength(1);
   expect(await deliver(f.sql,f.env,f.transport,NOW+400000)).toEqual({status:'APPLIED'});
   expect(await f.effects()).toEqual(committed);expect(calls).toBe(1);
   const lead=committed.find(r=>r.kind==='lead');expect(lead.data).toMatchObject({language:'UK',marketingConsent:false,source:{channel:'WEB',campaign:'synthetic'}});
   expect(JSON.stringify(lead.data)).not.toContain('private free text');
   expect((await db.query("SELECT count(*)::int AS n FROM outbox WHERE company_id=$1 AND type='lead.created'",[f.company])).rows[0].n).toBe(1);
  }finally{f.finish();}
 });
 it('a precommit database failure cannot acknowledge a lead and retry commits exactly once',async()=>{
  const f=await fixture();
  try{
   const failing:Pick<Database,'transaction'>={transaction:(company,actor,action,timeoutMs,readOnly)=>db.transaction(company,actor,async tx=>{await action(tx);throw Error('Synthetic failure before commit');},timeoutMs,readOnly)};
   const unavailable:typeof fetch=async(_url,init)=>{try{return Response.json(await f.receive(init!,failing));}catch{return Response.json({code:'DEPENDENCY_UNAVAILABLE'},{status:503});}};
   expect(await deliver(f.sql,f.env,unavailable,NOW)).toEqual({status:'PENDING'});expect(await f.effects()).toEqual([]);
   expect(await deliver(f.sql,f.env,f.transport,NOW+400000)).toEqual({status:'APPLIED'});
   expect((await f.effects()).filter(r=>r.kind==='lead')).toHaveLength(1);
  }finally{f.finish();}
 });
 it('a body with a forged tenant claim invalidates the signature and creates no company effects',async()=>{
  const f=await fixture();
  try{
   const tampered:typeof fetch=async(url,init)=>{
    const body=JSON.parse(Buffer.from(init!.body as Uint8Array).toString());body.company_id='foreign-company';
    return f.transport(url,{...init,body:Buffer.from(JSON.stringify(body))});
   };
   expect(await deliver(f.sql,f.env,tampered,NOW)).toEqual({status:'BLOCKED'});expect(await f.effects()).toEqual([]);
  }finally{f.finish();}
 });
 it('changed source bytes after uncertain committed delivery are held without a second PostgreSQL effect',async()=>{
  const f=await fixture();let calls=0;
  try{
   const lost:typeof fetch=async(_url,init)=>{await f.receive(init!);throw Error('Synthetic response loss');};
   await deliver(f.sql,f.env,lost,NOW);const committed=await f.effects();
   f.sql.prepare('UPDATE cleaning_requests SET contact_name=? WHERE id=?').run('Changed synthetic contact',f.eventId);
   const noSend:typeof fetch=async()=>{calls++;throw Error('FORBIDDEN_SECOND_SEND');};
   expect(await deliver(f.sql,f.env,noSend,NOW+400000)).toEqual({status:'UNKNOWN'});
   expect(calls).toBe(0);expect(await f.effects()).toEqual(committed);
  }finally{f.finish();}
 });
});
