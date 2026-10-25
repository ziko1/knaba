import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
import {createKnabaVpsServer} from './server.mjs';
const origin='https://knaba.de';
const clientId='synthetic-client.apps.googleusercontent.com';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const publicJwk={...publicKey.export({format:'jwk'}),kid:'fake-kid',alg:'RS256',use:'sig'};
const signed=(nonce,email)=>{
  const now=Math.floor(Date.now()/1000);
  const header={alg:'RS256',kid:'fake-kid'};
  const claims={iss:'https://accounts.google.com',aud:clientId,sub:'google-subject-17',
    nonce,iat:now,exp:now+3600,email,email_verified:true};
  const body=Buffer.from(JSON.stringify(header)).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
  return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
};
const makeMock=(getNonce,email)=>async (url,options)=>{
  if(url==='https://oauth2.googleapis.com/token'){
    assert.equal(options.method,'POST');
    return new Response(JSON.stringify({id_token:signed(getNonce(),email)}),{status:200});
  }
  if(url==='https://www.googleapis.com/oauth2/v3/certs'){
    return new Response(JSON.stringify({keys:[publicJwk]}),{status:200});
  }
  throw Error('Network egress was not expected');
};
test('Google sign-in is fail-closed, code+PKCE callback is one-use, new user is pending',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-oidc-integration-'));
  const dbPath=join(dir,'auth.sqlite');
  let activeNonce='';
  let app;
  const at=(path,options={})=>fetch('http://127.0.0.1:'+app.port+path,{
    redirect:'manual',...options,headers:{Host:'knaba.de',...options.headers}
  });
  try{
    app=await createKnabaVpsServer({
      dbPath,origin,host:'127.0.0.1',port:0,localTest:true,
      ownerEmail:'owner@example.test',staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath:new URL('../dist/server/index.js',import.meta.url).href
    });
    const unconfigured=await at('/auth/providers.json');
    assert.equal(unconfigured.status,200);
    assert.deepEqual(await unconfigured.json(),{google:false});
    assert.equal((await at('/auth/google/start')).status,404);
    await app.close();app=null;
    const pre=openLocalDatabase(dbPath,{allowMigrations:false});
    const sql=await readFile(new URL('./google-oidc.sql',import.meta.url),'utf8');
    pre.db.exec(sql);pre.db.close();
    app=await createKnabaVpsServer({
      dbPath,origin,host:'127.0.0.1',port:0,localTest:true,ownerEmail:'owner@example.test',
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath:new URL('../dist/server/index.js',import.meta.url).href,
      googleOidc:{enabled:true,clientId,clientSecret:'synthetic-server-only-secret',
        fetchImpl:makeMock(()=>activeNonce,'new.client@example.test')}
    });
    assert.deepEqual(await (await at('/auth/providers.json')).json(),{google:true});
    const start=await at('/auth/google/start?return_to=%2Fuk%2Fkonto%2F');
    assert.equal(start.status,302);
    assert.match(start.headers.get('x-robots-tag'),/noindex/);
    const oauthUrl=new URL(start.headers.get('location'));
    assert.equal(oauthUrl.host,'accounts.google.com');
    activeNonce=oauthUrl.searchParams.get('nonce');
    const state=oauthUrl.searchParams.get('state');
    assert.equal(oauthUrl.searchParams.get('code_challenge_method'),'S256');
    const cookie=start.headers.get('set-cookie').split(';')[0];
    const noCookie=await at('/auth/google/callback?code=4%2Ffixture&state='+state);
    assert.equal(noCookie.status,401);
    const wrongState=await at('/auth/google/callback?code=4%2Ffixture&state='+('Q'.repeat(43)),{headers:{Cookie:cookie}});
    assert.equal(wrongState.status,401);
    const callback=await at('/auth/google/callback?code=4%2Ffixture&state='+state,{headers:{Cookie:cookie}});
    assert.equal(callback.status,303);
    assert.equal(callback.headers.get('location'),'/uk/konto/');
    const sessionSetCookies=callback.headers.getSetCookie();
    const session=sessionSetCookies.find(c=>c.startsWith('__Host-knaba-session='));
    assert.ok(session);
    const visitor=await (await at('/api/portal/session',{headers:{Cookie:session.split(';')[0]}})).json();
    assert.equal(visitor.role,'pending');
    assert.equal(visitor.user?.email,'new.client@example.test');
    const replay=await at('/auth/google/callback?code=4%2Ffixture&state='+state,{headers:{Cookie:cookie}});
    assert.equal(replay.status,401);
    assert.equal(app.db.prepare('SELECT count(*) n FROM vps_google_only_users').get().n,1);
  }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});
test('verified Google token for unprovisioned company owner email cannot self-grant owner role',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-oidc-owner-'));
  const dbPath=join(dir,'auth.sqlite');
  let app;let activeNonce='';
  try{
    const pre=openLocalDatabase(dbPath,{allowMigrations:true});
    pre.db.exec(await readFile(new URL('./google-oidc.sql',import.meta.url),'utf8'));pre.db.close();
    app=await createKnabaVpsServer({
      dbPath,origin,host:'127.0.0.1',port:0,localTest:true,ownerEmail:'',
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath:new URL('../dist/server/index.js',import.meta.url).href,
      googleOidc:{enabled:true,clientId,clientSecret:'synthetic-server-only-secret',
        fetchImpl:makeMock(()=>activeNonce,'kontakt@knaba.de')}
    });
    const at=(path,options={})=>fetch('http://127.0.0.1:'+app.port+path,{
      redirect:'manual',...options,headers:{Host:'knaba.de',...options.headers}
    });
    const start=await at('/auth/google/start');
    const authUrl=new URL(start.headers.get('location'));activeNonce=authUrl.searchParams.get('nonce');
    const cookie=start.headers.get('set-cookie').split(';')[0];
    const callback=await at('/auth/google/callback?code=4%2Ffixture&state='+authUrl.searchParams.get('state'),{headers:{Cookie:cookie}});
    assert.equal(callback.status,401);
    assert.equal(app.db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
  }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});
