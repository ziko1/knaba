import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {createKnabaVpsServer} from './server.mjs';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser,readSession,sessionCookie} from './auth.mjs';
import {readAccountSettings} from './account-settings.mjs';
import {createAccountMailer} from './account-mail.mjs';
import {roleDestination} from './role-destination.mjs';

const origin='https://account.example.test',ownerEmail='owner@example.test';
const password='synthetic-account-original-2026',newPassword='synthetic-account-replacement-2026';
const profile={name:'Test Person',phone:'+49 30 000000',company:'Example test team',address:'Test street 1',locale:'uk',timeZone:'Europe/Berlin',version:'0'};

async function fixture(run,{enabled=true,transport}={}){
  const dir=await mkdtemp(join(tmpdir(),'knaba-account-http-'));
  const dbPath=join(dir,'state.sqlite');
  let app,mailer;
  const sent=[];
  try{
    const setup=openLocalDatabase(dbPath);
    const owner=createCredentialsUser(setup.db,ownerEmail,password);
    const client=createCredentialsUser(setup.db,'client@example.test',password);
    const other=createCredentialsUser(setup.db,'other@example.test',password);
    for(const user of [client,other])setup.db.prepare("INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,'client','client','approved','2026-10-28',?,?,1,?)")
      .run(user.id,'Original name',user.email,new Date().toISOString(),new Date().toISOString(),'fixture-'+user.id);
    const cookies=Object.fromEntries(Object.entries({owner,client,other}).map(([key,user])=>[key,sessionCookie(createSessionForUser(setup.db,user.id).token).split(';')[0]]));
    setup.db.close();
    app=await createKnabaVpsServer({dbPath,origin,ownerEmail,ownerUserId:owner.id,host:'127.0.0.1',port:0,localTest:false,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,workerPath:new URL('../dist/server/index.js',import.meta.url).href,
      accountEmailEnvironment:{KNABA_ACCOUNT_EMAIL_ENABLED:enabled?'approved':'0',KNABA_ACCOUNT_EMAIL_FROM:'KNABA Test <test@example.test>',RESEND_API_KEY:'synthetic-not-a-real-api-key',KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'100'},
      accountMailerFactory:options=>mailer=createAccountMailer({...options,transport:transport??(async(url,request)=>{
        assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(request.body));
        return new Response(JSON.stringify({id:'synthetic-mail-receipt-0001'}),{status:200,headers:{'Content-Type':'application/json'}});
      })})});
    const at=(path,options={})=>new Promise((resolve,reject)=>{
      const req=httpRequest({host:'127.0.0.1',port:app.port,path,method:options.method??'GET',headers:{Host:'account.example.test','X-Forwarded-Proto':'https',...options.headers}},res=>{
        const chunks=[];res.on('data',part=>chunks.push(part));res.on('error',reject);
        res.on('end',()=>{const headers=new Headers();for(let n=0;n<res.rawHeaders.length;n+=2)headers.append(res.rawHeaders[n],res.rawHeaders[n+1]);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));});
      });
      req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('Synthetic account HTTP timeout')));
      req.end(options.body===undefined?undefined:String(options.body));
    });
    const post=(path,fields,cookie=cookies.client,headers={})=>at(path,{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/x-www-form-urlencoded',...(cookie?{Cookie:cookie}:{}),...headers},body:fields instanceof URLSearchParams?fields:new URLSearchParams(fields)});
    const get=(path,cookie=cookies.client)=>at(path,{headers:cookie?{Cookie:cookie}:{}});
    const snapshot=(cookie=cookies.client)=>readAccountSettings(app.db,{cookieHeader:cookie,protectedEmails:[ownerEmail]});
    const tokenFor=kind=>{
      const content=sent.find(message=>String(message.text).includes(kind==='email_change'?'/account/email/confirm/':'/reset-password/'));
      assert.ok(content,'synthetic transport received the expected message');
      const match=String(content.text).match(/#token=([A-Za-z0-9_-]{43})/);
      assert.ok(match,'fragment capability exists only in the transport message');return match[1];
    };
    await run({app,at,get,post,owner,client,other,cookies,snapshot,mailer,sent,tokenFor});
  }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
}

test('profile HTTP saves only the actor, preserves approval and returns localized private pages',async()=>fixture(async({app,get,post,client,other,snapshot})=>{
  const before=await get('/account/settings/?lang=uk');assert.equal(before.status,200);
  assert.equal(before.headers.get('referrer-policy'),'strict-origin');assert.equal(before.headers.get('x-frame-options'),'DENY');
  assert.match(before.headers.get('cache-control'),/no-store/);assert.match(before.headers.get('x-robots-tag'),/noindex/);
  const saved=await post('/account/settings/?lang=uk',profile);assert.equal(saved.status,200);
  assert.match(await saved.text(),/<html lang="uk"/);
  const current=snapshot();assert.equal(current.name,profile.name);assert.equal(current.phone,profile.phone);assert.equal(current.locale,'uk');assert.equal(current.version,1);
  const membership=app.db.prepare('SELECT name,role,status FROM profiles WHERE id=?').get(client.id);
  assert.deepEqual({...membership},{name:profile.name,role:'client',status:'approved'});
  assert.equal(app.db.prepare('SELECT name FROM profiles WHERE id=?').get(other.id).name,'Original name');
  const session=await(await get('/api/portal/session')).json();assert.equal(session.user.name,profile.name);assert.equal(session.profile.name,profile.name);
  assert.equal((await post('/account/settings/',{...profile,name:'Stale overwrite'})).status,409);
  assert.equal(snapshot().name,profile.name);
  for(const lang of ['de','en','pl','lt','ru','uk'])assert.match(await(await get('/account/settings/?lang='+lang)).text(),new RegExp('<html lang="'+lang+'"'));
}));

test('owner profile settings do not create membership and the portal receives the saved name',async()=>fixture(async({app,get,post,owner,cookies,snapshot})=>{
  assert.equal((await post('/account/settings/',{...profile,name:'Owner display name'},cookies.owner)).status,200);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM profiles WHERE id=?').get(owner.id).n,0);
  assert.equal(snapshot(cookies.owner).emailChangeAllowed,false);
  const session=await(await get('/api/portal/session',cookies.owner)).json();assert.equal(session.role,'owner');assert.equal(session.user.name,'Owner display name');
}));

test('the saved language is used on future visits and login, with an explicit supported language taking priority',async()=>fixture(async({get,post,client})=>{
  assert.equal((await post('/account/settings/',profile)).status,200);
  for(const path of ['/account/settings/','/account/password/']){
    assert.match(await(await get(path)).text(),/<html lang="uk"/);
    assert.match(await(await get(path+'?lang=en')).text(),/<html lang="en"/);
  }
  const signed=await post('/login/',{email:client.email,password,return_to:'/konto/'},'',{Accept:'application/json'});
  assert.equal(signed.status,200);assert.equal((await signed.json()).returnTo,'/konto/?lang=uk');
  const explicit=await post('/login/?lang=pl',{email:client.email,password,return_to:'/konto/'},'',{Accept:'application/json'});
  assert.equal(explicit.status,200);assert.equal((await explicit.json()).returnTo,'/konto/?lang=pl');
}));

test('account forms reject unauthenticated writes, privilege fields, duplicates, CSRF and oversized input',async()=>fixture(async({at,get,post,snapshot,cookies})=>{
  assert.equal((await get('/account/settings/?lang=uk','')).status,303);
  assert.equal((await post('/account/settings/',profile,'')).status,401);
  for(const extra of [{role:'owner'},{status:'approved'},{userId:'another-user'},{tenant:'other-tenant'}])assert.equal((await post('/account/settings/',{...profile,...extra})).status,422);
  const duplicate=new URLSearchParams(profile);duplicate.append('name','Second name');assert.equal((await post('/account/settings/',duplicate)).status,422);
  for(const headers of [{Origin:'https://evil.example.test'},{Origin:''},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'none'}]){
    const denied=await post('/account/settings/',profile,cookies.client,headers);assert.equal(denied.status,403);assert.match(denied.headers.get('cache-control'),/no-store/);assert.match(denied.headers.get('x-robots-tag'),/noindex/);
  }
  assert.equal((await post('/account/settings/',{...profile,name:'x'.repeat(10000)})).status,413);
  assert.equal((await at('/account/settings/',{method:'POST',headers:{Cookie:cookies.client,Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,415);
  assert.equal(snapshot().version,0);
}));

test('role-approved users edit only personal details and pending access is never promoted',async()=>fixture(async({app,post,client,snapshot})=>{
  for(const [index,role] of ['client','worker','partner','bauleiter','admin'].entries()){
    app.db.prepare("UPDATE profiles SET role=?,status='approved',version=version+1 WHERE id=?").run(role,client.id);
    assert.equal((await post('/account/settings/',{...profile,name:'Personal '+role,version:String(index)})).status,200);
    assert.equal(snapshot().role,role);assert.equal(snapshot().status,'approved');
  }
  app.db.prepare("UPDATE profiles SET role=NULL,status='pending',version=version+1 WHERE id=?").run(client.id);
  assert.equal((await post('/account/settings/',{...profile,version:'5'})).status,200);
  assert.equal(snapshot().status,'pending');assert.equal(snapshot().role,null);
}));

test('a session revoked during body upload cannot save a profile',async()=>fixture(async({app,client,cookies})=>{
  let observed;
  const readStarted=new Promise(resolve=>{observed=resolve;});
  app.server.prependOnceListener('request',req=>req.once('data',()=>{
    app.db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(client.id);observed();
  }));
  let outgoing;
  const response=new Promise((resolve,reject)=>{
    outgoing=httpRequest({host:'127.0.0.1',port:app.port,path:'/account/settings/',method:'POST',headers:{Host:'account.example.test','X-Forwarded-Proto':'https',Cookie:cookies.client,Origin:origin,'Content-Type':'application/x-www-form-urlencoded'}},res=>{
      res.resume();res.once('end',()=>resolve(res.statusCode));
    });
    outgoing.on('error',reject);outgoing.setTimeout(10000,()=>outgoing.destroy(Error('Body-fence fixture timeout')));
  });
  const body=new URLSearchParams(profile).toString();outgoing.write(body.slice(0,8));
  await readStarted;outgoing.end(body.slice(8));
  assert.equal(await response,401);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_account_settings WHERE user_id=?').get(client.id).n,0);
  assert.equal(app.db.prepare('SELECT name FROM profiles WHERE id=?').get(client.id).name,'Original name');
}));

test('validation errors allow only the renderer focus script under the account CSP',async()=>fixture(async({post})=>{
  for(const [path,fields] of [['/account/settings/',{...profile,role:'owner'}],['/account/password/',{current:'wrong-password',new:newPassword,confirm:newPassword}],['/forgot-password/',{email:'invalid-email'}]]){
    const response=await post(path,fields);assert.equal(response.status,422);
    const body=await response.text(),csp=response.headers.get('content-security-policy');
    for(const match of body.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.ok(csp.includes(createHash('sha256').update(match[1]).digest('base64')));
    assert.doesNotMatch(csp,/script-src 'unsafe-inline'/);assert.match(csp,/frame-ancestors 'none'/);
  }
}));

test('own session handles cannot revoke another user and logout-all clears secure cookies',async()=>fixture(async({app,get,post,client,cookies,snapshot})=>{
  const second=sessionCookie(createSessionForUser(app.db,client.id).token).split(';')[0];
  const own=snapshot(),foreign=snapshot(cookies.other).sessions[0];
  const raw=app.db.prepare('SELECT token_hash FROM vps_sessions WHERE user_id=?').all(client.id);
  const page=await(await get('/account/settings/')).text();for(const item of raw)assert.ok(!page.includes(item.token_hash));
  // Unknown, expired and other-user handles share the same conflict response.
  assert.equal((await post('/account/sessions/',{target:foreign.id})).status,409);
  assert.ok(readSession(app.db,cookies.other));
  assert.equal((await post('/account/sessions/',{target:'others'})).status,200);assert.equal(readSession(app.db,second),null);assert.ok(readSession(app.db,cookies.client));
  const revoked=await post('/account/sessions/',{target:'all'});assert.equal(revoked.status,303);assert.match(revoked.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal(readSession(app.db,cookies.client),null);assert.ok(readSession(app.db,cookies.other));assert.equal(own.sessions.length,2);
}));

test('password change keeps the existing endpoint, all six locales and real credential rotation',async()=>fixture(async({app,get,post,client,cookies})=>{
  const second=sessionCookie(createSessionForUser(app.db,client.id).token).split(';')[0];
  for(const lang of ['de','en','pl','lt','ru','uk'])assert.match(await(await get('/account/password/?lang='+lang)).text(),new RegExp('<html lang="'+lang+'"'));
  assert.equal((await post('/account/password/?lang=uk',{current:'wrong-password',new:newPassword,confirm:newPassword})).status,422);
  assert.ok(readSession(app.db,cookies.client));
  const changed=await post('/account/password/?lang=uk',{current:password,new:newPassword,confirm:newPassword});assert.equal(changed.status,303);
  assert.equal(readSession(app.db,cookies.client),null);assert.equal(readSession(app.db,second),null);
  assert.equal((await post('/login/',{email:client.email,password,return_to:'/account/settings/'},'',{Accept:'application/json'})).status,401);
  const login=await post('/login/?lang=uk',{email:client.email,password:newPassword,return_to:'/account/settings/?lang=uk'},'',{Accept:'application/json'});
  assert.equal(login.status,200);assert.equal((await login.json()).returnTo,'/account/settings/?lang=uk');
}));

test('recovery uses generic responses and one-use fragment tokens, preserves roles and never auto-signs-in',async()=>fixture(async({app,get,post,client,cookies,mailer,tokenFor})=>{
  const known=await post('/forgot-password/?lang=uk',{email:client.email},'');
  const unknown=await post('/forgot-password/?lang=uk',{email:'missing@example.test'},'');
  assert.equal(known.status,202);assert.equal(unknown.status,202);assert.equal(await known.text(),await unknown.text());
  await mailer.drain();const token=tokenFor('password_reset');
  const page=await get('/reset-password/?lang=uk','');const html=await page.text();assert.equal(page.status,200);assert.ok(!html.includes(token));
  assert.match(page.headers.get('content-security-policy'),/script-src 'sha256-/);assert.doesNotMatch(page.headers.get('content-security-policy'),/script-src 'unsafe-inline'/);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(script);assert.ok(page.headers.get('content-security-policy').includes(createHash('sha256').update(script).digest('base64')));
  assert.equal((await get('/reset-password/?token='+token,'')).status,400);
  assert.equal((await post('/reset-password/?lang=uk',{token,new:newPassword,confirm:'different'},'')).status,422);
  const done=await post('/reset-password/?lang=uk',{token,new:newPassword,confirm:newPassword},'');assert.equal(done.status,200);assert.match(done.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal(readSession(app.db,cookies.client),null);assert.equal(app.db.prepare('SELECT role FROM profiles WHERE id=?').get(client.id).role,'client');
  assert.equal((await post('/reset-password/',{token,new:newPassword,confirm:newPassword},'')).status,422);
  assert.equal((await post('/login/',{email:client.email,password:newPassword,return_to:'/konto/'},'',{Accept:'application/json'})).status,200);
}));

test('disabled mail has an honest recovery state and never claims delivery',async()=>fixture(async({get,post,sent})=>{
  const page=await get('/forgot-password/?lang=en','');assert.equal(page.status,200);
  assert.equal((await post('/forgot-password/?lang=en',{email:'client@example.test'},'')).status,503);
  assert.equal((await post('/account/email/?lang=en',{email:'new@example.test',current:password})).status,503);assert.equal(sent.length,0);
},{enabled:false}));

test('email proof changes both credential and profile atomically, preserving stable role and revoking sessions',async()=>fixture(async({app,post,client,cookies,tokenFor})=>{
  const requested=await post('/account/email/?lang=uk',{email:'changed@example.test',current:password});assert.equal(requested.status,202);
  assert.equal(app.db.prepare('SELECT email FROM vps_users WHERE id=?').get(client.id).email,client.email);
  const token=tokenFor('email_change');
  assert.equal((await post('/reset-password/',{token,new:newPassword,confirm:newPassword},'')).status,422);
  const done=await post('/account/email/confirm/?lang=uk',{token},'');assert.equal(done.status,200);
  assert.equal(app.db.prepare('SELECT email FROM vps_users WHERE id=?').get(client.id).email,'changed@example.test');
  const profile=app.db.prepare('SELECT email,role,status FROM profiles WHERE id=?').get(client.id);assert.deepEqual({...profile},{email:'changed@example.test',role:'client',status:'approved'});
  assert.equal(readSession(app.db,cookies.client),null);assert.equal((await post('/account/email/confirm/',{token},'')).status,422);
  assert.equal((await post('/login/',{email:'changed@example.test',password,return_to:'/konto/'},'',{Accept:'application/json'})).status,200);
}));

test('reserved and OIDC identities cannot be reassigned through email settings',async()=>fixture(async({app,post,client,cookies,sent})=>{
  assert.equal((await post('/account/email/',{email:ownerEmail,current:password})).status,403);
  assert.equal((await post('/account/email/',{email:'different@example.test',current:password},cookies.owner)).status,403);
  app.db.prepare('INSERT INTO vps_oidc_links(issuer,subject,user_id,linked_at) VALUES (?,?,?,?)').run('https://accounts.google.com','synthetic-provider-subject',client.id,new Date().toISOString());
  assert.equal((await post('/account/email/',{email:'different@example.test',current:password})).status,403);assert.equal(sent.length,0);
}));

test('revoking the initiating session cancels an email-change link without changing data',async()=>fixture(async({app,post,client,cookies,tokenFor})=>{
  assert.equal((await post('/account/email/',{email:'changed@example.test',current:password})).status,202);const token=tokenFor('email_change');
  app.db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(client.id);
  assert.equal((await post('/account/email/confirm/',{token},'')).status,422);
  assert.equal(app.db.prepare('SELECT email FROM vps_users WHERE id=?').get(client.id).email,client.email);assert.equal(readSession(app.db,cookies.client),null);
}));

test('account entry links preserve local-hosting boundaries and a safe localized return after login',async()=>{
  for(const role of ['client','worker','partner','bauleiter','admin','owner','pending'])assert.equal(roleDestination(role,'/account/settings/?lang=uk','de'),'/account/settings/?lang=uk');
  const files=['Portal.tsx','AdminControlCenter.tsx'];
  for(const file of files){const source=await readFile(new URL('../src/components/'+file,import.meta.url),'utf8');assert.match(source,/hostingAuth\.passwordAccounts/);assert.match(source,/\/account\/settings\/\?lang=/);}
  const dialog=await readFile(new URL('../src/components/AccountAccessDialog.tsx',import.meta.url),'utf8');assert.match(dialog,/data-account-fallback="true"/);assert.match(dialog,/\/forgot-password\/\?lang=/);
});
