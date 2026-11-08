import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {Database} from '../../erp/apps/api/database.ts';
import {integrationCommands} from '../../erp/packages/domain/integrations.ts';
import {createKnabaVpsServer} from '../../corporate-site/vps/server.mjs';
import {LocalD1} from '../../corporate-site/vps/database.mjs';
import {createOwner} from '../../corporate-site/vps/auth.mjs';
import {createErpIntakeScheduler} from '../../corporate-site/vps/erp-intake-scheduler.mjs';
import {readErpLeadConfig,erpLeadEnvelope} from '../../corporate-site/worker/erp-lead-contract.ts';
import {drainErpLeads} from '../../corporate-site/worker/erp-lead-outbox.ts';
import {deliverErpLead} from '../../corporate-site/worker/erp-lead-transport.ts';

export const root=fileURLToPath(new URL('../../',import.meta.url));
const siteRoot=join(root,'corporate-site'),erpRoot=join(root,'erp');
const siteOrigin='https://knaba.de';
const syntheticSecret='synthetic-bridge-fixture-only-not-a-real-secret-2026';
const syntheticService='synthetic_cleaning';
let sourceSha;

/** No skip mode and no nonlocal database target: these are real SQL acceptance tests. */
export async function prepareDatabase(){
  assert.equal(process.env.APP_MODE,'TEST','BRIDGE_REQUIRES_EXPLICIT_TEST_MODE');
  assert.ok(process.env.DATABASE_URL,'BRIDGE_REQUIRES_REAL_POSTGRESQL');
  const url=new URL(process.env.DATABASE_URL);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));
  assert.equal(url.hostname,'127.0.0.1','BRIDGE_REQUIRES_ISOLATED_LOOPBACK_POSTGRESQL');
  assert.match(url.pathname,/^\/knaba_bridge_(?:ci|test)$/,'BRIDGE_REQUIRES_DEDICATED_SYNTHETIC_DATABASE');
  sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const release=JSON.parse(await readFile(join(erpRoot,'dist/release.json'),'utf8'));
  assert.equal(release.code_sha,sourceSha,'ERP_BUILD_MUST_MATCH_CHECKED_OUT_SOURCE');
  if(process.env.CI){
    assert.equal(sourceSha,process.env.SOURCE_SHA);
    assert.equal(release.source_dirty,false,'CI_BUILD_MUST_HAVE_CLEAN_SOURCE');
    assert.equal(release.source_provenance,'GIT_WORKTREE');
  }
  const db=new Database();
  try{
    const version=Number((await db.query('SHOW server_version_num')).rows[0].server_version_num);
    assert.ok(version>=170006,'PostgreSQL 17.6 or newer is required');
    await db.migrate();
    return db;
  }catch(error){await db.close();throw error;}
}

async function unusedPort(){
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;
  await new Promise((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
  return port;
}

async function startErp(company,source,keyId,secret=syntheticSecret){
  const port=await unusedPort();
  // Deliberately do not inherit provider keys, production flags, NODE_OPTIONS,
  // credentials or worker activation from the parent environment.
  const child=spawn(process.execPath,['dist/server.mjs'],{
    cwd:erpRoot,stdio:['ignore','pipe','pipe'],env:{
      PATH:process.env.PATH??'',LANG:'C.UTF-8',TZ:'UTC',APP_MODE:'TEST',
      DATABASE_URL:process.env.DATABASE_URL,COMPANY_ID:company,PORT:String(port),GIT_SHA:sourceSha,
      INTEGRATION_CREDENTIALS_JSON:JSON.stringify([{source,companyId:company,keyId,secret,enabled:true}]),
    },
  });
  // Drain output to avoid a blocked child. No raw logs or payloads are published.
  child.stdout.resume();child.stderr.resume();
  let spawnError;child.once('error',error=>{spawnError=error;});
  async function close(){
    if(child.exitCode!==null||child.signalCode!==null)return;
    const stopped=once(child,'exit').catch(()=>undefined),timeout=new AbortController();child.kill('SIGTERM');
    try{
      const result=await Promise.race([stopped.then(()=>true),delay(5000,false,{signal:timeout.signal})]);
      if(!result){child.kill('SIGKILL');await stopped;}
    }finally{timeout.abort();}
  }
  try{
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
      if(spawnError||child.exitCode!==null)throw Error('SYNTHETIC_ERP_PROCESS_FAILED_TO_START');
      try{
        const ready=await fetch(`http://127.0.0.1:${port}/ready`,{signal:AbortSignal.timeout(500)});
        if(ready.ok){
          const body=await ready.json();assert.equal(body.database,'CONNECTED');assert.equal(body.mode,'TEST');
          const version=await (await fetch(`http://127.0.0.1:${port}/version`)).json();
          assert.equal(version.sha,sourceSha,'HTTP_RUNTIME_MUST_MATCH_TESTED_SOURCE');
          return {port,close};
        }
      }catch(error){if(error?.code==='ERR_ASSERTION')throw error;}
      await delay(50);
    }
    throw Error('SYNTHETIC_ERP_READINESS_TIMEOUT');
  }catch(error){await close();throw error;}
}

export function form(overrides={}){
  return {service:'baureinigung',objectType:'Baustelle',postcode:'10115',area:'120',
    frequency:'Einmalig',name:'Synthetic bridge contact',email:'bridge-'+randomUUID()+'@example.test',
    phone:'',message:'Synthetic intake detail stays on the site.',address:'Synthetic site address',
    privacyAccepted:true,website:'',idempotencyKey:randomUUID(),...overrides};
}

export async function fixture(t,db,{envOverrides={},scheduled=false}={}){
  const company='bridge_'+randomUUID(),source='knaba_site';
  const owner='synthetic_owner',keyId='bridge_test_key';
  const dir=await mkdtemp(join(tmpdir(),'knaba-bridge-'));
  let app,erp,scheduler,ownerCookie,restoreFetch=()=>{};
  const nativeFetch=globalThis.fetch,wire=[],schedulerErrors=[];
  t.after(async()=>{
    try{await app?.close();}finally{restoreFetch();await erp?.close();await rm(dir,{recursive:true,force:true});}
  });
  async function approveMapping(targetCompany,credentialIds,{existing=false}={}){
    const now=new Date().toISOString();
    const example={schema_version:'1',event_id:randomUUID(),event_type:'lead.upsert',source,
      occurred_at:now,external_id:randomUUID(),payload:{contact:{name:'Synthetic preview',email:'preview@example.test'},serviceIds:[syntheticService]}};
    return db.transaction(targetCompany,'SYNTHETIC_BRIDGE_SETUP',async tx=>{
    if(!existing){
      await tx.add('company',{name:'Synthetic bridge fixture',active:true},targetCompany);
      await tx.add('user',{roles:['OWNER'],active:true},owner);
      await tx.add('service',{active:true},syntheticService);
    }
    const actor={companyId:targetCompany,userId:owner,roles:['OWNER'],permissions:['bot.settings.manage'],
      siteIds:[],warehouseIds:[],customerIds:[],mfaVerified:true};
    const ctx={tx,actor,now,idempotencyKey:randomUUID(),requireSite(){assert.fail('Unexpected site authorization');},requireOwn(){assert.fail('Unexpected self authorization');}};
    const command=async(name,input)=>{const def=integrationCommands[name];return def.handler(ctx,def.schema.parse(input));};
    const draft=await command('integration_config.create',{source,ownerUserId:owner,allowedServiceIds:[syntheticService],credentialKeyIds:credentialIds});
    const preview=await command('integration_config.preview',{id:draft.id,example});
    await command('integration_config.activate',{id:draft.id,command_hash:preview.command_hash,expected_version:preview.expected_version});
    });
  }
  await approveMapping(company,[keyId]);
  erp=await startErp(company,source,keyId);
  const env={KNABA_ERP_BRIDGE_ENABLED:'true',KNABA_ERP_TRANSFER_APPROVED:'true',
    KNABA_ERP_URL:'https://erp.example.com/api/v1/integrations/knaba_site/events',KNABA_ERP_ALLOWED_ORIGIN:'https://erp.example.com',
    KNABA_ERP_COMPANY_ID:company,KNABA_ERP_KEY_ID:keyId,KNABA_ERP_SECRET:syntheticSecret,
    KNABA_ERP_APPROVED_PRIVACY_VERSION:'2026-10-28',KNABA_ERP_MAPPING_VERSION:'synthetic-v1',
    KNABA_ERP_SERVICE_MAP_JSON:JSON.stringify({baureinigung:syntheticService}),...envOverrides};
  // A trusted test-only adapter maps exactly one configured HTTPS URL to an
  // ephemeral real HTTP server. It preserves the signed raw bytes and headers.
  // No external DNS/HTTP, synthetic receipt, provider or TLS proof is involved.
  const loopbackFetch=async(url,options)=>{
    const config=await readErpLeadConfig(env);
    assert.equal(String(url),config.endpoint);assert.equal(options.method,'POST');
    assert.equal(options.redirect,'manual');
    const bytes=Buffer.from(options.body),envelope=JSON.parse(bytes.toString('utf8'));
    const response=await nativeFetch(`http://127.0.0.1:${erp.port}${new URL(url).pathname}`,options);
    wire.push({eventId:envelope.event_id,bodyHash:createHash('sha256').update(bytes).digest('hex'),status:response.status});
    return response;
  };
  if(scheduled){
    // Exercise the actual built Worker's default transport and scheduled hook.
    // This process-only network fence cannot be controlled through any request
    // or deployment environment and refuses every other nonloopback address.
    globalThis.fetch=(input,options)=>{
      const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
      if(url.href===env.KNABA_ERP_URL)return loopbackFetch(url.href,options);
      assert.equal(url.hostname,'127.0.0.1','SYNTHETIC_BRIDGE_NETWORK_FENCE');
      return nativeFetch(input,options);
    };
    restoreFetch=()=>{globalThis.fetch=nativeFetch;};
  }
  const ownerEmail='site-owner@example.test';
  async function startSite(){
    app=await createKnabaVpsServer({dbPath:join(dir,'intake.sqlite'),staticRoot:join(siteRoot,'dist/client'),
      workerPath:new URL('../../corporate-site/dist/server/index.js',import.meta.url).href,
      ownerEmail,origin:siteOrigin,localTest:true,host:'127.0.0.1',port:0,erpIntakeEnvironment:env,
      erpIntakeSchedulerFactory:args=>{
        scheduler=scheduled?createErpIntakeScheduler({...args,onError:()=>schedulerErrors.push('SCHEDULER_FAILED')}):{stop:async()=>{}};
        return scheduler;
      }});
    env.DB=new LocalD1(app.db);
    if(scheduled)await scheduler.runNow();
  }
  await startSite();
  return {
    company,source,owner,service:syntheticService,env,wire,
    get site(){return app;},
    async restart(){await app.close();app=undefined;await startSite();},
    async config(){return readErpLeadConfig(env);},
    async rotateReceiver({targetCompany=company}={}){
      const nextKey='bridge_rotated_key',nextSecret=syntheticSecret+'-rotated';
      await approveMapping(targetCompany,targetCompany===company?[keyId,nextKey]:[nextKey],{existing:targetCompany===company});
      await erp.close();erp=await startErp(targetCompany,source,nextKey,nextSecret);
      env.KNABA_ERP_KEY_ID=nextKey;env.KNABA_ERP_SECRET=nextSecret;
    },
    async tick(){assert.ok(scheduled);await scheduler.runNow();assert.deepEqual(schedulerErrors,[]);},
    async ownerStatus({reuseCookie=false}={}){
      const base=`http://127.0.0.1:${app.port}`;
      const denied=await fetch(base+'/api/portal/erp-intake',{headers:{Host:'knaba.de'}});
      assert.equal(denied.status,401);
      if(!reuseCookie){
        const password='synthetic-owner-fixture-password-2026';
        if(!app.db.prepare('SELECT id FROM vps_users WHERE email=?').get(ownerEmail))createOwner(app.db,ownerEmail,password);
        const signed=await fetch(base+'/login/',{method:'POST',redirect:'manual',headers:{Host:'knaba.de',Origin:siteOrigin,'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({email:ownerEmail,password,return_to:'/portal/'})});
        assert.equal(signed.status,303);ownerCookie=signed.headers.get('set-cookie').split(';')[0];
      }
      assert.ok(ownerCookie);
      const response=await fetch(base+'/api/portal/erp-intake',{headers:{Host:'knaba.de',Cookie:ownerCookie}});
      assert.equal(response.status,200);return response.json();
    },
    async rejectRevokedOwner(){
      assert.ok(ownerCookie);
      app.db.prepare('UPDATE vps_users SET disabled=1 WHERE email=?').run(ownerEmail);
      const response=await fetch(`http://127.0.0.1:${app.port}/api/portal/erp-intake`,{headers:{Host:'knaba.de',Cookie:ownerCookie}});
      assert.equal(response.status,401);
    },
    post(body){return fetch(`http://127.0.0.1:${app.port}/api/leads`,{method:'POST',redirect:'error',
      headers:{Host:'knaba.de',Origin:siteOrigin,'Sec-Fetch-Site':'same-origin','X-Knaba-Request':'portal-v1','Content-Type':'application/json'},body:JSON.stringify(body)});},
    assistant(path,{body,ticket}={}){
      assert.ok(path.startsWith('/api/assistant/'));
      return fetch(`http://127.0.0.1:${app.port}${path}`,{method:body===undefined?'GET':'POST',redirect:'error',
        headers:{Host:'knaba.de',Origin:siteOrigin,'Sec-Fetch-Site':'same-origin','X-Knaba-Request':'portal-v1','Content-Type':'application/json',...(ticket?{'X-Knaba-Conversation':ticket.token}:{})},
        body:body===undefined?undefined:JSON.stringify(body)});
    },
    queue(){return app.db.prepare('SELECT * FROM site_erp_outbox ORDER BY created_at,id').all();},
    async envelope(row){
      const sourceRow=app.db.prepare('SELECT * FROM cleaning_requests WHERE id=?').get(row.request_id);
      return erpLeadEnvelope(await readErpLeadConfig(env),sourceRow,row);
    },
    async rows(kind){return (await db.query('SELECT * FROM aggregates WHERE company_id=$1 AND kind=$2 ORDER BY id',[company,kind])).rows;},
    async outbox(type){return (await db.query('SELECT * FROM outbox WHERE company_id=$1 AND type=$2',[company,type])).rows;},
    loopbackFetch,
    async dispatch({fetch:transportFetch=loopbackFetch,now=Date.now}={}){
      return drainErpLeads(env,{now,transport:(config,delivery,options)=>deliverErpLead(config,delivery,{...options,fetch:transportFetch})});
    },
    async sendEnvelope(envelope){
      const config=await readErpLeadConfig(env);
      return deliverErpLead(config,{eventId:envelope.event_id,body:JSON.stringify(envelope),bindingHash:config.bindingHash},{fetch:loopbackFetch});
    },
  };
}
