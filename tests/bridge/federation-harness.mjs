import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {copyFile,mkdtemp,rm} from 'node:fs/promises';
import {createServer,request as httpRequest} from 'node:http';
import {createServer as createPortReservation} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {hashPassword} from '../../erp/apps/api/auth.ts';
import {normalizeAuthority,sessionReference,makeFederationRequest,verifyFederationResponse,FEDERATION_ERP_PATH,FEDERATION_SITE_PATH} from '../../erp/packages/integrations/site-federation-protocol.mjs';
import {createKnabaVpsServer} from '../../corporate-site/vps/server.mjs';
import {openLocalDatabase} from '../../corporate-site/vps/database.mjs';
import {createCredentialsUser,createSessionForUser,readSession} from '../../corporate-site/vps/auth.mjs';
import {federationCoordinator} from '../../corporate-site/vps/federation-state.mjs';
import {root} from './harness.mjs';

export const erpPassword='Synthetic ERP pair password 2026!';
export const sitePassword='Synthetic site pair password 2026!';
export const replacementPassword='Synthetic replacement pair password 2026!';
const erpRoot=join(root,'erp'),siteRoot=join(root,'corporate-site');
const hash=value=>createHash('sha256').update(value).digest('hex');
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

export async function within(promise,milliseconds=10000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SYNTHETIC_FEDERATION_WAIT_TIMEOUT')),milliseconds);})]);}
  finally{clearTimeout(timer);}
}

async function unusedPort(){
  const server=createPortReservation();server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

/** Native HTTP deliberately preserves the canonical Host while using loopback. */
function localHttp(port,path,{method='GET',headers={},body,limit=2*1024*1024}={}){
  return new Promise((resolve,reject)=>{
    const request=httpRequest({hostname:'127.0.0.1',port,path,method,headers},response=>{
      const chunks=[];let size=0;
      response.on('data',part=>{size+=part.length;if(size>limit)response.destroy(Error('SYNTHETIC_RESPONSE_TOO_LARGE'));else chunks.push(part);});
      response.on('error',reject);
      response.on('end',()=>{
        const responseHeaders=new Headers();
        for(let i=0;i<response.rawHeaders.length;i+=2)responseHeaders.append(response.rawHeaders[i],response.rawHeaders[i+1]);
        resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:responseHeaders}));
      });
    });
    request.on('error',reject);request.setTimeout(15000,()=>request.destroy(Error('SYNTHETIC_HTTP_TIMEOUT')));request.end(body);
  });
}

/** Real signed requests/responses only; faults may delay bytes or drop an ACK. */
async function transportRelay(config){
  const wire=[],faults=[],errors=[];const targets={erp:null,site:null};
  const server=createServer(async(req,res)=>{
    const completions=[];let record;
    try{
      assert.equal(req.method,'POST','SYNTHETIC_RELAY_METHOD');
      assert.ok(req.url==='/erp'||req.url==='/site','SYNTHETIC_RELAY_PATH');
      const side=req.url.slice(1),chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;assert.ok(size<=32768,'SYNTHETIC_RELAY_BODY_LIMIT');chunks.push(chunk);}
      const body=Buffer.concat(chunks),envelope=JSON.parse(body.toString('utf8'));
      record={direction:side==='erp'?'SITE_TO_ERP':'ERP_TO_SITE',action:envelope.action,operationId:envelope.operationId,
        bodyHash:hash(body),nonce:req.headers['x-knaba-federation-nonce'],generation:Number(req.headers['x-knaba-federation-generation']),
        status:null,delivered:false,dropped:false};
      // Registration payloads contain only immutable IDs, digests and times.
      // Codes, cookies and passwords are never retained in the wire inventory.
      if(envelope.action==='REGISTER_SESSION')record.registration={...envelope.payload};
      wire.push(record);
      const stage=async phase=>{
        const fault=faults.find(f=>f.phase===phase&&f.remaining>0&&f.action===record.action&&f.direction===record.direction);
        if(!fault)return;
        fault.remaining--;if(fault.finished)completions.push(fault.finished);
        return fault.handle(record);
      };
      await stage('before');
      assert.ok(targets[side],'SYNTHETIC_RELAY_TARGET_NOT_STARTED');
      const canonical=new URL(side==='erp'?config.erpOrigin:config.siteOrigin);
      const headers={Host:canonical.host,'X-Forwarded-Proto':'https','Content-Type':'application/json'};
      for(const [key,value] of Object.entries(req.headers))if(key.startsWith('x-knaba-federation-'))headers[key]=value;
      const response=await localHttp(targets[side],side==='erp'?FEDERATION_ERP_PATH:FEDERATION_SITE_PATH,{method:'POST',headers,body,limit:32768});
      const bytes=Buffer.from(await response.arrayBuffer());record.status=response.status;record.responseHash=hash(bytes);
      const result=JSON.parse(bytes.toString('utf8'));
      record.errorCode=result?.error?.code??null;
      if(record.action==='INTROSPECT')record.sourceActive=result.active===true;
      if(result.current)record.current={...result.current};
      if(await stage('after')==='DROP'){record.dropped=true;res.destroy();return;}
      record.callerClosedBeforeReply=res.destroyed;
      if(!res.destroyed){
        for(const [key,value] of response.headers)if(!['connection','keep-alive','transfer-encoding','content-length'].includes(key))res.setHeader(key,value);
        res.writeHead(response.status);res.end(bytes);record.delivered=true;
      }
    }catch(error){
      errors.push({code:'SYNTHETIC_RELAY_FAILURE',message:String(error?.message??'failed').slice(0,180)});res.destroy();
    }finally{for(const finished of completions)finished.resolve(record);}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  return {origin,wire,errors,targets,
    pauseNext(action,direction,phase='after'){
      const entered=defer(),released=defer(),finished=defer();
      faults.push({action,direction,phase,remaining:1,finished,release:released.resolve,handle:async record=>{entered.resolve(record);await released.promise;}});
      return {entered:entered.promise,finished:finished.promise,release:released.resolve};
    },
    dropResponses(action,direction){
      const fault={action,direction,phase:'after',remaining:Infinity,handle:()=>'DROP'};faults.push(fault);return {clear:()=>{fault.remaining=0;}};
    },
    async sourceFetch(url,init){
      assert.equal(String(url),config.erpOrigin+FEDERATION_ERP_PATH,'SYNTHETIC_SOURCE_NETWORK_FENCE');
      assert.equal(init.method,'POST');assert.equal(init.redirect,'manual');
      return fetch(origin+'/erp',init);
    },
    releaseAll(){for(const fault of faults)fault.release?.();},
    async close(){this.releaseAll();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));},
  };
}

async function startBuiltErp(config,relay){
  const port=await unusedPort();
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const child=spawn(process.execPath,['--import',fileURLToPath(new URL('./federation-fetch-preload.mjs',import.meta.url)),'dist/server.mjs'],{
    cwd:erpRoot,stdio:['ignore','pipe','pipe'],env:{
      PATH:process.env.PATH??'',LANG:'C.UTF-8',TZ:'UTC',APP_MODE:'TEST',DATABASE_URL:process.env.DATABASE_URL,
      COMPANY_ID:config.companyId,PORT:String(port),GIT_SHA:sourceSha,PUBLIC_ORIGIN:config.erpOrigin,
      SITE_FEDERATION_AUTHORITIES_JSON:JSON.stringify([config]),
      KNABA_BRIDGE_TEST_SITE_ORIGIN:config.siteOrigin,KNABA_BRIDGE_TEST_RELAY_ORIGIN:relay.origin,
    },
  });
  // No inherited provider keys, NODE_OPTIONS, worker activation or raw logs.
  child.stdout.resume();child.stderr.resume();let spawnError;child.once('error',error=>{spawnError=error;});
  const close=async()=>{
    if(child.exitCode!==null||child.signalCode!==null)return;
    const stopped=once(child,'exit').catch(()=>undefined),timeout=new AbortController();child.kill('SIGTERM');
    try{if(!await Promise.race([stopped.then(()=>true),delay(5000,false,{signal:timeout.signal})])){child.kill('SIGKILL');await stopped;}}
    finally{timeout.abort();}
  };
  try{
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
      if(spawnError||child.exitCode!==null)throw Error('SYNTHETIC_FEDERATION_ERP_START_FAILED');
      try{
        const response=await fetch('http://127.0.0.1:'+port+'/ready',{signal:AbortSignal.timeout(800)});
        if(response.status===200){const version=await(await fetch('http://127.0.0.1:'+port+'/version')).json();assert.equal(version.sha,sourceSha);return {port,close};}
      }catch(error){if(error?.code==='ERR_ASSERTION')throw error;}
      await delay(50);
    }
    throw Error('SYNTHETIC_FEDERATION_ERP_READY_TIMEOUT');
  }catch(error){await close();throw error;}
}

export async function federationPair(t,db,{subjectId}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-federation-pair-'));
  let dbPath=join(directory,'source.sqlite'),app,erp,relay;
  t.after(async()=>{
    relay?.releaseAll();await app?.close();await erp?.close();await relay?.close();
    await rm(directory,{recursive:true,force:true});
  });
  const company='federation_'+randomUUID(),erpUser='erp_'+randomUUID();
  const config=normalizeAuthority({authorityId:'synthetic-pair',companyId:company,issuer:'https://site.federation.invalid/identity',
    siteOrigin:'https://site.federation.invalid',erpOrigin:'https://erp.federation.invalid',erpAudience:'synthetic-erp-pair',siteAudience:'synthetic-site-pair',policyVersion:1,
    siteToErp:{kid:'synthetic-site',secret:Buffer.alloc(32,31).toString('base64url')},erpToSite:{kid:'synthetic-erp',secret:Buffer.alloc(32,32).toString('base64url')}});
  const erpEmail='same-label@example.invalid',passwordHash=await hashPassword(erpPassword);
  await db.transaction(company,'SYNTHETIC_FEDERATION_SETUP',async tx=>{
    await tx.add('company',{name:'Synthetic paired company'},company);
    await tx.add('user',{active:true,name:'Synthetic ERP user',email:erpEmail,roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],warehouseIds:[],customerIds:[],synthetic:true},erpUser);
    await tx.query('INSERT INTO auth_credentials(company_id,user_id,password_hash) VALUES($1,$2,$3)',[company,erpUser,passwordHash]);
  });
  const seed=openLocalDatabase(dbPath),owner=createCredentialsUser(seed.db,'owner@example.invalid',sitePassword);
  let user;
  if(subjectId){
    // Create the immutable ID once. Never retarget an existing user, even in
    // synthetic setup; this deliberately gives two companies equal subjects.
    const salt=randomBytes(16),verifier=scryptSync(sitePassword,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
    seed.db.prepare('INSERT INTO vps_users(id,email,salt,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(subjectId,erpEmail,salt.toString('hex'),verifier.toString('hex'),new Date().toISOString());
    user={id:subjectId,email:erpEmail};
  }else user=createCredentialsUser(seed.db,erpEmail,sitePassword);
  seed.db.prepare(`INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation)
    VALUES(?,?,?,'client','client','approved','2026-10-28','2026-11-08','2026-11-08',1,'fixture')`).run(user.id,'Synthetic source user',user.email);
  const siteSession=createSessionForUser(seed.db,user.id),siteTokenHash=hash(siteSession.token),siteCookie='__Host-knaba-session='+siteSession.token;
  const backup=join(directory,'before-enrollment.sqlite');
  assert.equal(seed.db.prepare('SELECT count(*) n FROM vps_federation_authorities').get().n,0);
  seed.db.prepare('VACUUM INTO ?').run(backup);seed.db.close();
  relay=await transportRelay(config);erp=await startBuiltErp(config,relay);relay.targets.erp=erp.port;
  const startSite=async()=>{
    app=await createKnabaVpsServer({dbPath,origin:config.siteOrigin,ownerEmail:owner.email,ownerUserId:owner.id,host:'127.0.0.1',port:0,localTest:false,
      staticRoot:join(siteRoot,'dist/client'),workerPath:new URL('../../corporate-site/dist/server/index.js',import.meta.url).href,
      oidcConfig:{},accountEmailEnvironment:{},erpIntakeEnvironment:{},releaseEnvironment:{},
      federationEnvironment:{KNABA_FEDERATION_ENABLED:'approved',KNABA_FEDERATION_AUTHORITIES:JSON.stringify([config])},
      federationFetch:relay.sourceFetch});
    relay.targets.site=app.port;
  };
  await startSite();
  const login=await fetch('http://127.0.0.1:'+erp.port+'/api/v1/auth/login',{method:'POST',headers:{Origin:config.erpOrigin,'Content-Type':'application/json'},body:JSON.stringify({email:erpEmail,password:erpPassword}),redirect:'manual'});
  assert.equal(login.status,201,'SYNTHETIC_ERP_LOGIN_MUST_SUCCEED');const loginBody=await login.json();
  const erpCookie=login.headers.getSetCookie().find(value=>value.startsWith('knaba_session='))?.split(';')[0];assert.ok(erpCookie);
  const erpWeb=(path='',body)=>fetch('http://127.0.0.1:'+erp.port+'/api/v1/account/site-links'+path,{
    method:body===undefined?'GET':'POST',redirect:'manual',headers:{Origin:config.erpOrigin,'Content-Type':'application/json',Cookie:erpCookie,'x-csrf-token':loginBody.csrfToken},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000),
  });
  const siteAt=(path,{method='GET',body,headers={}}={})=>{
    assert.ok(app,'SYNTHETIC_SOURCE_NOT_RUNNING');
    return localHttp(app.port,path,{method,body,headers:{Host:new URL(config.siteOrigin).host,'X-Forwarded-Proto':'https',Cookie:siteCookie,...headers}});
  };
  const sitePost=(path,values,headers={})=>siteAt(path,{method:'POST',headers:{Origin:config.siteOrigin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(values).toString()});
  const row=async(table,where='',parameters=[])=>{
    assert.ok(['site_federation_authorities','site_federation_principals','site_federation_sessions','site_federation_operations','site_identity_link_challenges','site_identity_bindings','auth_sessions','audit_log','aggregates'].includes(table));
    return (await db.query(`SELECT * FROM ${table} WHERE company_id=$1 ${where}`,[company,...parameters])).rows;
  };
  const issue=async()=>{const response=await erpWeb('/challenge',{authorityId:config.authorityId,password:erpPassword});assert.equal(response.status,201);return response.json();};
  const inspect=async code=>{
    const response=await sitePost('/account/erp-link/inspect/',{authority:config.authorityId,code});assert.equal(response.status,200);
    const html=await response.text();assert.ok(!html.includes(code)&&!html.includes(sitePassword));
    const id=html.match(/name="inspectionId" value="([a-f0-9-]{36})"/)?.[1];assert.ok(id);return id;
  };
  const claim=id=>sitePost('/account/erp-link/claim/',{inspectionId:id,current:sitePassword,confirmed:'yes'});
  const pending=async()=>{const response=await erpWeb();assert.equal(response.status,200);return (await response.json()).challenge;};
  const claimCurrent=async()=>{const issued=await issue(),inspectionId=await inspect(issued.code),response=await claim(inspectionId);assert.equal(response.status,200);return {issued,pending:await pending()};};
  const ref=sessionReference(config.issuer,user.id,siteTokenHash);
  return {company,config,erpUser,user,owner,siteCookie,siteTokenHash,ref,relay,erpWeb,siteAt,sitePost,row,issue,inspect,claim,pending,claimCurrent,
    get site(){return app;},get coordinator(){return federationCoordinator(app.db);},
    currentSiteUser(){return readSession(app.db,siteCookie);},
    confirm:pending=>erpWeb('/challenges/'+pending.id+'/confirm',{expectedVersion:pending.version,subject:pending.subject}),
    async stopSite(){await app.close();app=undefined;relay.targets.site=null;},
    async restartSite(){if(app)await app.close();app=undefined;relay.targets.site=null;await startSite();},
    async restoreBeforeEnrollment(){
      if(app)await app.close();app=undefined;relay.targets.site=null;
      dbPath=join(directory,'restored-'+randomUUID()+'.sqlite');await copyFile(backup,dbPath);await startSite();
    },
    async authority(action,payload,{operationId=randomUUID(),generation}={}){
      generation??=Number((await row('site_federation_authorities'))[0].generation);
      const wire=makeFederationRequest(config,'SITE_TO_ERP',action,payload,{operationId,generation});
      const response=await relay.sourceFetch(config.erpOrigin+FEDERATION_ERP_PATH,{method:'POST',redirect:'manual',headers:wire.headers,body:wire.body,signal:AbortSignal.timeout(5000)});
      const bytes=Buffer.from(await response.arrayBuffer());return {status:response.status,body:verifyFederationResponse(config,wire.context,response.status,response.headers,bytes)};
    },
    async assertNoSecrets(code){
      assert.equal(typeof code==='string'&&/^KNABA-LINK-[A-Za-z0-9_-]{43}$/.test(code),true,'SYNTHETIC_LINK_CODE_FORMAT');
      const erpToken=erpCookie.slice('knaba_session='.length);
      const secrets=[code,code.slice('KNABA-LINK-'.length),siteSession.token,erpToken,sitePassword,erpPassword,replacementPassword];
      for(const table of ['site_identity_link_challenges','site_federation_operations','site_identity_bindings','audit_log']){
        const serialized=JSON.stringify(await row(table));
        for(const secret of secrets)assert.equal(serialized.includes(secret),false,'SECRET_NOT_ALLOWED_IN_'+table);
      }
      for(const table of ['vps_federation_operations','vps_federation_fences','vps_federation_claims','vps_federation_inbound_operations']){
        const serialized=JSON.stringify(app.db.prepare('SELECT * FROM '+table).all());
        for(const secret of secrets)assert.equal(serialized.includes(secret),false,'SECRET_NOT_ALLOWED_IN_'+table);
      }
    },
  };
}
