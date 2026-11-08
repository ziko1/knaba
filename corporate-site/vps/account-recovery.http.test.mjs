import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {createKnabaVpsServer} from './server.mjs';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser,readSession,sessionCookie} from './auth.mjs';
import {createAccountMailer} from './account-mail.mjs';
import {accountWords} from './account-recovery-ui.mjs';

const origin='https://account.example.test',ownerEmail='owner@example.test';
const password='synthetic-recovery-original-2026',newPassword='synthetic-recovery-replacement-2026';
async function fixture(run,{enabled=true,transport,publicOrigin=origin}={}){
  const dir=await mkdtemp(join(tmpdir(),'knaba-recovery-http-')),dbPath=join(dir,'state.sqlite');
  let app,mailer;const sent=[];
  try{
    const setup=openLocalDatabase(dbPath),owner=createCredentialsUser(setup.db,ownerEmail,password),client=createCredentialsUser(setup.db,'client@example.test',password),other=createCredentialsUser(setup.db,'other@example.test',password);
    for(const user of [client,other])setup.db.prepare("INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,'client','client','approved','2026-10-28',?,?,1,?)")
      .run(user.id,'Synthetic Person',user.email,new Date().toISOString(),new Date().toISOString(),'fixture-'+user.id);
    const cookies=Object.fromEntries(Object.entries({owner,client,other}).map(([key,user])=>[key,sessionCookie(createSessionForUser(setup.db,user.id).token).split(';')[0]]));
    setup.db.close();
    app=await createKnabaVpsServer({dbPath,origin:publicOrigin,ownerEmail,ownerUserId:owner.id,host:'127.0.0.1',port:0,localTest:false,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,workerPath:new URL('../dist/server/index.js',import.meta.url).href,
      oidcConfig:{},releaseEnvironment:{},erpIntakeEnvironment:{},trustedProxyIps:'',siteIdentityConfig:()=>null,siteIdentitySessionsEnabled:()=>false,
      accountEmailEnvironment:{KNABA_ACCOUNT_EMAIL_ENABLED:enabled?'approved':'0',KNABA_ACCOUNT_EMAIL_FROM:'KNABA Test <test@example.test>',RESEND_API_KEY:'synthetic-not-a-real-api-key',KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'100'},
      accountMailerFactory:options=>mailer=createAccountMailer({...options,transport:transport??(async(url,request)=>{
        assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(request.body));
        return Response.json({id:'synthetic-mail-receipt-0001'});
      })})});
    const at=(path,options={})=>new Promise((resolve,reject)=>{
      const req=httpRequest({host:'127.0.0.1',port:app.port,path,method:options.method??'GET',headers:{Host:new URL(publicOrigin).host,'X-Forwarded-Proto':'https',...options.headers}},res=>{
        const chunks=[];res.on('data',part=>chunks.push(part));res.on('error',reject);
        res.on('end',()=>{const headers=new Headers();for(let n=0;n<res.rawHeaders.length;n+=2)headers.append(res.rawHeaders[n],res.rawHeaders[n+1]);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));});
      });
      req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('Synthetic recovery HTTP timeout')));
      req.end(options.body===undefined?undefined:String(options.body));
    });
    const post=(path,fields,cookie='',headers={})=>at(path,{method:'POST',headers:{Origin:publicOrigin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/x-www-form-urlencoded',...(cookie?{Cookie:cookie}:{}),...headers},body:fields instanceof URLSearchParams?fields:new URLSearchParams(fields)});
    const get=(path,cookie='')=>at(path,{headers:cookie?{Cookie:cookie}:{}});
    const token=()=>{
      const match=sent.at(-1)?.text?.match(/#token=([A-Za-z0-9_-]{43})/);assert.ok(match);return match[1];
    };
    await run({app,at,get,post,client,other,cookies,mailer,sent,token});
  }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
}
function privateResponse(response){
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  assert.equal(response.headers.get('referrer-policy'),'strict-origin');
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
  assert.doesNotMatch(response.headers.get('content-security-policy'),/script-src 'unsafe-inline'/);
}

test('HTTP recovery has uniform202, non-consuming GET, one-use POST, no auto-login and unchanged authority',async()=>fixture(async({app,get,post,client,other,cookies,mailer,token})=>{
  const known=await post('/forgot-password/?lang=uk',{email:client.email}),unknown=await post('/forgot-password/?lang=uk',{email:'missing@example.test'});
  assert.equal(known.status,202);assert.equal(unknown.status,202);privateResponse(known);privateResponse(unknown);
  assert.equal(await known.text(),await unknown.text());await mailer.drain();const capability=token();
  const page=await get('/reset-password/?lang=uk'),html=await page.text();assert.equal(page.status,200);privateResponse(page);assert.ok(!html.includes(capability));
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);assert.equal(scripts.length,1);
  for(const script of scripts)assert.ok(page.headers.get('content-security-policy').includes(createHash('sha256').update(script).digest('base64')));
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,1,'GET does not consume a capability');
  const mismatched=await post('/reset-password/?lang=uk',{token:capability,new:newPassword,confirm:'different'});assert.equal(mismatched.status,422);privateResponse(mismatched);assert.ok(!(await mismatched.text()).includes(capability));
  const done=await post('/reset-password/?lang=uk',{token:capability,new:newPassword,confirm:newPassword});assert.equal(done.status,200);privateResponse(done);
  const cleared=done.headers.getSetCookie();assert.equal(cleared.length,2);assert.ok(cleared.every(value=>value.includes('Max-Age=0')));
  assert.equal(readSession(app.db,cookies.client),null);assert.ok(readSession(app.db,cookies.other));
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_sessions WHERE user_id=?').get(client.id).n,0);
  assert.equal(app.db.prepare('SELECT role FROM profiles WHERE id=?').get(client.id).role,'client');
  assert.equal(app.db.prepare('SELECT email FROM vps_users WHERE id=?').get(other.id).email,other.email);
  assert.equal((await post('/reset-password/',{token:capability,new:newPassword+'2',confirm:newPassword+'2'})).status,422);
  const login=await post('/login/',{email:client.email,password:newPassword,return_to:'/konto/'},'',{Accept:'application/json'});assert.equal(login.status,200);
}));

test('HTTP recovery preserves CSRF, host, method, bounded input and private error responses',async()=>fixture(async({app,at,get,post,client,mailer,sent})=>{
  for(const path of ['/forgot-password/','/reset-password/']){
    const fields=path==='/forgot-password/'?{email:client.email}:{token:'a'.repeat(43),new:newPassword,confirm:newPassword};
    const cases=[
      await post(path,fields,'',{Origin:'https://foreign.example.test'}),
      await post(path,fields,'',{'Sec-Fetch-Site':'cross-site'}),
      await post(path,fields,'',{'Content-Type':'application/json'}),
      await at(path,{method:'PUT'}),
      await at(path,{headers:{Host:'foreign.example.test'}}),
      await get(path+'?token='+'a'.repeat(43)),
      await get(path+'?lang=de&lang=en')
    ];
    assert.deepEqual(cases.map(response=>response.status),[403,403,415,405,421,400,400]);
    cases.forEach(privateResponse);
    const duplicate=new URLSearchParams(fields);duplicate.append(Object.keys(fields)[0],Object.values(fields)[0]);
    const duplicateReply=await post(path,duplicate);assert.equal(duplicateReply.status,422);privateResponse(duplicateReply);
    const extra=await post(path,{...fields,role:'owner'});assert.equal(extra.status,422);privateResponse(extra);
    const oversized=await post(path,{...fields,extra:'x'.repeat(5000)});assert.equal(oversized.status,413);privateResponse(oversized);
  }
  await mailer.drain();assert.equal(sent.length,0);assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
}));

test('canonical recovery URLs reject query secrets without reflecting them in Location',async()=>fixture(async({at})=>{
  const capability='a'.repeat(43);
  for(const path of ['/reset-password/?token='+capability,'/forgot-password/?email=person@example.test']){
    const response=await at(path,{headers:{Host:'www.knaba.de'}});assert.equal(response.status,400);privateResponse(response);
    assert.equal(response.headers.get('location'),null);assert.ok(!(await response.text()).includes(capability));
  }
},{publicOrigin:'https://knaba.de'}));

test('disabled mail exposes an honest localized fallback, does not accept delivery and sends nothing',async()=>fixture(async({get,post,sent,app})=>{
  for(const lang of ['de','en','pl','lt','ru','uk']){
    const page=await get('/forgot-password/?lang='+lang),html=await page.text();assert.equal(page.status,200);privateResponse(page);
    assert.ok(html.includes(accountWords(lang).recoveryUnavailable));assert.ok(!html.includes('<form'));
    const rejected=await post('/forgot-password/?lang='+lang,{email:'client@example.test'});assert.equal(rejected.status,503);privateResponse(rejected);
    assert.ok(!(await rejected.text()).includes(accountWords(lang).recoverySent));
  }
  assert.equal(sent.length,0);assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
},{enabled:false}));

test('existing known-password HTTP rotation stays available and invalidates a previously delivered reset link',async()=>fixture(async({post,client,cookies,mailer,token,app})=>{
  assert.equal((await post('/forgot-password/',{email:client.email})).status,202);await mailer.drain();const capability=token();
  const changed=await post('/account/password/',{current:password,new:newPassword,confirm:newPassword},cookies.client);
  assert.equal(changed.status,303);assert.equal(readSession(app.db,cookies.client),null);
  assert.equal((await post('/reset-password/',{token:capability,new:newPassword+'2',confirm:newPassword+'2'})).status,422);
}));
