/** Disposable real HTTPS -> VPS HTTP -> SQLite fixture; only provider delivery is captured. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {createServer as createHttpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {openLocalDatabase} from '../../vps/database.mjs';
import {createCredentialsUser,createSessionForUser,readSession,sessionCookie} from '../../vps/auth.mjs';
import {createAccountMailer} from '../../vps/account-mail.mjs';
import {createKnabaVpsServer} from '../../vps/server.mjs';

export const recoveryLocales=Object.freeze(['de','en','pl','lt','ru','uk']);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function createPasswordRecoveryFixture({mailEnabled=true,onSecret=()=>{}}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-recovery-browser-'));
  const database=join(directory,'synthetic.sqlite');
  const password='Synthetic-recovery-'+randomBytes(18).toString('base64url');
  onSecret(password);
  const identities={},sessions={},messages=[],requests=[],transportErrors=[],capabilities=new Set();
  let app,proxy,mailer,origin,closed=false;
  const secret=value=>{onSecret(value);return value;};
  const leak=value=>[...capabilities].some(token=>String(value??'').includes(token));
  async function close(){
    if(closed)return;closed=true;
    try{
      if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
    }finally{
      try{if(app)await app.close();}
      finally{await rm(directory,{recursive:true,force:true});}
    }
  }
  try{
    // A dedicated ephemeral TLS mount is supported for the existing read-only
    // QA image. Never read an application/provider key or copy TLS into evidence.
    const tlsDirectory=process.env.KNABA_RECOVERY_QA_TLS_DIR||process.env.KNABA_ROLE_QA_TLS_DIR||directory;
    if(tlsDirectory===directory){
      execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
        '-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),
        '-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore',timeout:15000});
      await chmod(join(directory,'key.pem'),0o600);
    }
    const initial=openLocalDatabase(database);
    try{
      const now=new Date().toISOString();
      for(const name of ['owner',...recoveryLocales,'manual','other']){
        const user=createCredentialsUser(initial.db,'recovery-'+name+'@example.test',password);
        secret(user.email);
        identities[name]=user;
        if(name!=='owner')initial.db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES(?,?,?,?,?,?,?,?,?,1,?)')
          .run(user.id,'Synthetic recovery '+name,user.email,'client','client','approved','2026-10-28',now,now,'recovery-fixture-'+name);
        sessions[name]=Array.from({length:name==='other'?1:2},()=>{
          const session=createSessionForUser(initial.db,user.id);secret(session.token);
          return sessionCookie(session.token).split(';')[0];
        });
      }
    }finally{initial.db.close();}
    proxy=createHttpsServer({key:await readFile(join(tlsDirectory,'key.pem')),cert:await readFile(join(tlsDirectory,'cert.pem'))},(req,res)=>{
      if(!app||!origin){res.writeHead(503);res.end('Synthetic fixture starting');return;}
      let target;
      try{
        target=new URL(req.url,origin);
        assert.ok(req.url.startsWith('/')&&!req.url.startsWith('//')&&target.origin===origin);
        assert.equal(req.headers.host,new URL(origin).host);
      }catch{res.writeHead(403);res.end('Isolated loopback origin required');return;}
      requests.push({method:req.method,path:target.pathname,locale:target.searchParams.get('lang'),
        tokenInUrl:target.searchParams.has('token')||Boolean(target.hash)||leak(req.url),
        tokenInReferer:leak(req.headers.referer)});
      const upstream=httpRequest({hostname:'127.0.0.1',port:app.port,path:req.url,method:req.method,
        headers:{...req.headers,'x-forwarded-proto':'https'}},reply=>{
        res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
      });
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Synthetic upstream unavailable');});
      upstream.setTimeout(15000,()=>upstream.destroy(new Error('Synthetic upstream timeout')));
      req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
    });
    await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
    origin='https://127.0.0.1:'+proxy.address().port;
    app=await createKnabaVpsServer({dbPath:database,host:'127.0.0.1',port:0,origin,localTest:false,
      ownerEmail:identities.owner.email,ownerUserId:identities.owner.id,
      staticRoot:fileURLToPath(new URL('../../dist/client/',import.meta.url)),
      workerPath:new URL('../../dist/server/index.js',import.meta.url).href,
      oidcConfig:{},releaseEnvironment:{},erpIntakeEnvironment:{},trustedProxyIps:'',
      siteIdentityConfig:()=>null,siteIdentitySessionsEnabled:()=>false,
      accountEmailEnvironment:{KNABA_ACCOUNT_EMAIL_ENABLED:mailEnabled?'approved':'0',
        KNABA_ACCOUNT_EMAIL_FROM:'KNABA Synthetic <recovery@example.test>',RESEND_API_KEY:'synthetic-not-a-provider-key',
        KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'100'},
      accountMailerFactory:options=>mailer=createAccountMailer({...options,transport:async(url,request)=>{
        // No provider request is performed. Capture the actual adapter payload
        // in memory, assert the intended recipient/origin, return a test receipt.
        try{
          assert.equal(url,'https://api.resend.com/emails');assert.equal(request.method,'POST');
          assert.equal(request.redirect,'error');assert.equal(mailEnabled,true);
          const payload=JSON.parse(request.body);
          assert.equal(payload.to.length,1);
          const person=Object.entries(identities).find(([,user])=>user.email===payload.to[0]);
          assert.ok(person,'Only seeded synthetic recipients are allowed');
          const line=payload.text.split('\n').find(value=>value.startsWith('https://'));
          const link=new URL(line);assert.equal(link.origin,origin);assert.equal(link.pathname,'/reset-password/');
          const locale=link.searchParams.get('lang'),token=new URLSearchParams(link.hash.slice(1)).get('token');
          assert.ok(recoveryLocales.includes(locale));assert.match(token,/^[A-Za-z0-9_-]{43}$/);
          capabilities.add(token);secret(token);
          messages.push({recipient:person[0],locale,token,link:link.href});
          return Response.json({id:'synthetic-captured-recovery-'+messages.length});
        }catch{
          transportErrors.push('CAPTURED_PROVIDER_CONTRACT_MISMATCH');
          throw new Error('Captured provider contract mismatch');
        }
      }})});
    function authoritySnapshot(){
      const tables=['profiles','vps_staff_grants'];
      return Object.fromEntries(tables.map(table=>[table,digest(app.db.prepare('SELECT * FROM '+table).all().map(row=>JSON.stringify(row)).sort())]));
    }
    function credentialDigest(name){return digest(app.db.prepare('SELECT * FROM vps_users WHERE id=?').get(identities[name].id));}
    function sessionCount(name){return app.db.prepare('SELECT count(*) AS n FROM vps_sessions WHERE user_id=?').get(identities[name].id).n;}
    function otherSnapshot(){return {credential:credentialDigest('other'),sessions:digest(app.db.prepare('SELECT * FROM vps_sessions WHERE user_id=? ORDER BY token_hash').all(identities.other.id))};}
    function assertIsolated(){
      assert.equal(transportErrors.length,0,'Captured mail contract errors');
      assert.ok(requests.every(row=>!row.tokenInUrl&&!row.tokenInReferer),'Capability leaked into a request URL or Referer');
    }
    return {origin,password,identities,authoritySnapshot,credentialDigest,sessionCount,otherSnapshot,assertIsolated,
      cookie(name,index=0){
        const [key,value]=sessions[name][index].split('=');
        return {name:key,value,url:origin+'/',secure:true,httpOnly:true,sameSite:'Strict'};
      },
      sessionMatches(name,cookie){return readSession(app.db,cookie)?.id===identities[name].id;},
      tokenExists(token){return Boolean(app.db.prepare('SELECT 1 FROM vps_account_tokens WHERE token_hash=?').get(createHash('sha256').update(token).digest('hex')));},
      requestCount(method,path){return requests.filter(row=>row.method===method&&row.path===path).length;},
      mailCount(){return messages.length;},
      async capturedMailSince(index,name,locale){
        await mailer.drain();assertIsolated();
        const found=messages.slice(index).filter(item=>item.recipient===name&&item.locale===locale);
        assert.equal(found.length,1,'Expected one captured synthetic recovery message');return {...found[0]};
      },
      async drain(){await mailer.drain();assertIsolated();},
      evidence(){return {mailEnabled,capturedDeliveryCount:messages.length,
        capturedLocales:messages.map(({locale})=>locale),requestCounts:Object.fromEntries([...new Set(requests.map(row=>row.method+' '+row.path))].sort().map(key=>[key,requests.filter(row=>row.method+' '+row.path===key).length])),
        capabilityUrlOrRefererLeaks:requests.filter(row=>row.tokenInUrl||row.tokenInReferer).length,
        providerCalls:0,providerTransport:'EXPLICIT_CAPTURE_IN_MEMORY',
        authMigrations:app.db.prepare('SELECT name,sha256 FROM vps_auth_migrations ORDER BY name').all()};},
      close};
  }catch(error){await close();throw error;}
}
