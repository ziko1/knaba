import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {createKnabaVpsServer} from './server.mjs';
const origin='https://owner.example';
const host='owner.example';
const cfg={google:{label:'Google',issuer:'https://accounts.google.com',
 clientId:'synthetic-client',clientSecret:'synthetic-secret',
 authorizationEndpoint:'https://accounts.google.com/o/oauth2/v2/auth',
 tokenEndpoint:'https://oauth2.googleapis.com/token',jwksEndpoint:'https://www.googleapis.com/oauth2/v3/certs'}};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const key=publicKey.export({format:'jwk'});key.kid='synthetic-http-key';key.use='sig';key.alg='RS256';
test('Google social sign-up: signed ID token, PKCE, consent, CSRF, pending partner and one-use callback',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'knaba-oidc-http-'));
 let service;
 try{
  let nonce,received=0;
  const fakeFetch=async(url,opts)=>{
   received++;
   if(url===cfg.google.tokenEndpoint){
    assert.equal(opts.method,'POST');
    const form=new URLSearchParams(opts.body);
    assert.equal(form.get('code'),'synthetic-code');
    assert.match(form.get('code_verifier'),/^[A-Za-z0-9_-]{43}$/);
    const data={iss:cfg.google.issuer,aud:cfg.google.clientId,sub:'oidc-social-subject-2026',
      nonce,email:'partner@example.test',email_verified:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+360,
      name:'Partner Synthetic'};
    const header=Buffer.from(JSON.stringify({alg:'RS256',kid:key.kid})).toString('base64url');
    const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
    const signed=header+'.'+payload;
    const token=signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
    return new Response(JSON.stringify({id_token:token}),{status:200});
   }
   if(url===cfg.google.jwksEndpoint)return new Response(JSON.stringify({keys:[key]}),{status:200});
   throw Error('Network not allowed');
  };
  service=await createKnabaVpsServer({dbPath:join(dir,'state.sqlite'),
   staticRoot:new URL('../dist/client/',import.meta.url).pathname,
   workerPath:new URL('../dist/server/index.js',import.meta.url).href,
   host:'127.0.0.1',port:0,localTest:true,origin,ownerEmail:'owner@example.test',
   oidcConfig:cfg,oidcFetch:fakeFetch});
  const at=(path,opts={})=>fetch('http://127.0.0.1:'+service.port+path,{
   redirect:'manual',...opts,headers:{Host:host,...opts.headers}
  });
  const page=await at('/login/');
  assert.equal(page.status,200);assert.match(await page.text(),/Google/);
  assert.equal((await at('/auth/oidc/google/')).status,200);
  const body=new URLSearchParams({mode:'signup',intent:'partner',privacy:'on'});
  const denied=await at('/auth/oidc/google/start/',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  assert.equal(denied.status,403,'origin is mandatory');
  const start=await at('/auth/oidc/google/start/',{method:'POST',
   headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body});
  assert.equal(start.status,303);
  const external=new URL(start.headers.get('location'));
  assert.equal(external.origin,'https://accounts.google.com');
  assert.equal(external.searchParams.get('code_challenge_method'),'S256');
  const state=external.searchParams.get('state');
  assert.match(state,/^[A-Za-z0-9_-]{43}$/);
  nonce=service.db.prepare('SELECT nonce FROM vps_oidc_states WHERE state_hash=?')
   .get(createHash('sha256').update(state).digest('hex')).nonce;
  const cookie=start.headers.get('set-cookie').split(';')[0];
  assert.equal(received,0);
  const bad=await at('/auth/oidc/google/callback/?code=synthetic-code&state='+state);
  assert.equal(bad.status,401);
  const completed=await at('/auth/oidc/google/callback/?code=synthetic-code&state='+state,{headers:{Cookie:cookie}});
  assert.equal(completed.status,303,await completed.clone().text());
  assert.equal(completed.headers.get('location'),'/konto/');
  assert.equal(received,2);
  const sessionToken=completed.headers.get('set-cookie').match(/__Host-knaba-session=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(sessionToken);
  const s=await at('/api/portal/session',{headers:{Cookie:'__Host-knaba-session='+sessionToken}});
  assert.equal((await s.json()).role,'pending');
  assert.equal(service.db.prepare('SELECT requested_role FROM profiles').get().requested_role,'partner');
  assert.equal((await at('/auth/oidc/google/callback/?code=synthetic-code&state='+state,{headers:{Cookie:cookie}})).status,401);
 }finally{if(service)await service.close();await rm(dir,{recursive:true,force:true});}
});
