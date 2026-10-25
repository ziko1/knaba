import {test} from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync,sign } from 'node:crypto';
import {
  googleSchemaReady,googleConfigured,googleStateCookie,googleCookieState,
  startGoogleLogin,consumeGoogleState,verifyGoogleIdToken,exchangeGoogleCode,
  acceptGoogleIdentity,googleOnlyUser
} from './google-oidc.mjs';
const clientId='test-google-client-id.apps.googleusercontent.com';
const owner='owner@example.test';
function database(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;CREATE TABLE vps_users (id TEXT PRIMARY KEY,email TEXT UNIQUE,salt TEXT,password_hash TEXT,created_at TEXT,disabled INTEGER NOT NULL DEFAULT 0);');
  db.exec(readFileSync(new URL('./google-oidc.sql',import.meta.url),'utf8'));
  return db;
}
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'fixture-test-google-key',use:'sig',alg:'RS256'};
const now=Math.floor(Date.now()/1000);
const signToken=(updates={})=>{
  const head={alg:'RS256',typ:'JWT',kid:jwk.kid};
  const payload={iss:'https://accounts.google.com',aud:clientId,sub:'108180012340001',
    iat:now,exp:now+3600,email:'new.client@example.test',email_verified:true,nonce:'fixture-nonce',...updates};
  const data=Buffer.from(JSON.stringify(head)).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
  return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
};
const fetchGoogle=async url=>{
  if(url==='https://www.googleapis.com/oauth2/v3/certs')
    return new Response(JSON.stringify({keys:[jwk]}),{status:200});
  if(url==='https://oauth2.googleapis.com/token')
    return new Response(JSON.stringify({id_token:signToken()}),{status:200});
  throw Error('Unexpected external URL');
};
test('Google is disabled until explicit configuration AND operator-approved schema',()=>{
  const db=database();
  try{
    assert.equal(googleSchemaReady(db),true);
    assert.equal(googleConfigured({enabled:true,clientId,clientSecret:'safe-test-secret'},db),true);
    assert.equal(googleConfigured({enabled:false,clientId,clientSecret:'safe-test-secret'},db),false);
    assert.equal(googleConfigured({enabled:true,clientId,clientSecret:''},db),false);
  }finally{db.close();}
  const unprovisioned=new DatabaseSync(':memory:');
  try{assert.equal(googleSchemaReady(unprovisioned),false);}finally{unprovisioned.close();}
});
test('PKCE S256, HTTP-only state cookie, nonce and one-use replay protection',()=>{
  const db=database();
  try{
    const flow=startGoogleLogin(db,{clientId,origin:'https://kneba.vsp.rest',returnTo:'/uk/konto/'});
    const url=new URL(flow.authorizationUrl);
    assert.equal(url.origin,'https://accounts.google.com');
    assert.equal(url.searchParams.get('scope'),'openid email profile');
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('redirect_uri'),'https://kneba.vsp.rest/auth/google/callback');
    assert.match(googleStateCookie(flow.state),/HttpOnly; SameSite=Lax/);
    assert.equal(googleCookieState(googleStateCookie(flow.state)),flow.state);
    assert.throws(()=>consumeGoogleState(db,{state:flow.state,cookieState:'Q'.repeat(43)}));
    const state=consumeGoogleState(db,{state:flow.state,cookieState:flow.state});
    assert.equal(state.return_to,'/uk/konto/');
    assert.equal(state.nonce.length,43);
    assert.equal(state.verifier.length,43);
    assert.throws(()=>consumeGoogleState(db,{state:flow.state,cookieState:flow.state}),/replayed/);
  }finally{db.close();}
});
test('ID token RS256 signature, aud, nonce, exp, azp and verified email enforced',async()=>{
  const valid=await verifyGoogleIdToken(signToken(),{clientId,nonce:'fixture-nonce',now,fetchImpl:fetchGoogle});
  assert.deepEqual(valid,{subject:'108180012340001',email:'new.client@example.test'});
  for(const claims of [
    {aud:'wrong-client'}, {nonce:'wrong-nonce'}, {email_verified:false},
    {iat:now+200},{exp:now-1},{azp:'another-app'},{iss:'https://bad.example'}
  ]){
    await assert.rejects(verifyGoogleIdToken(signToken(claims),{clientId,nonce:'fixture-nonce',now,fetchImpl:fetchGoogle}),/identity claims/);
  }
  const forged=signToken().split('.');
  forged[1]=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:clientId,sub:'forged',iat:now,exp:now+3600,nonce:'fixture-nonce',email:'new.client@example.test',email_verified:true})).toString('base64url');
  await assert.rejects(verifyGoogleIdToken(forged.join('.'),{clientId,nonce:'fixture-nonce',now,fetchImpl:fetchGoogle}),/signature/);
});
test('code exchange only at fixed Google endpoint, never needs refresh tokens',async()=>{
  let tokenRequests=0;
  const fetchImpl=async(url,options)=>{
    if(url==='https://oauth2.googleapis.com/token'){
      tokenRequests++;
      assert.equal(options.method,'POST');
      assert.equal(options.body.get('grant_type'),'authorization_code');
      assert.equal(options.body.get('code_verifier'),'fixture-pkce');
      assert.equal(options.body.get('client_secret'),'private-test-secret');
    }
    return fetchGoogle(url);
  };
  const result=await exchangeGoogleCode('4/fixture-code',{verifier:'fixture-pkce',nonce:'fixture-nonce'},
    {clientId,clientSecret:'private-test-secret',origin:'https://kneba.vsp.rest',fetchImpl});
  assert.equal(result.email,'new.client@example.test');
  assert.equal(tokenRequests,1);
});
test('Google account registration stays unprivileged and never email-links or creates owner',()=>{
  const db=database();
  try{
    assert.throws(()=>acceptGoogleIdentity(db,{subject:'owner-sub',email:owner,ownerEmail:owner}),/Owner/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM vps_users').get().n,0);
    db.prepare('INSERT INTO vps_users (id,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)')
      .run('existing-user','existing@example.test','00','00','2026-10-25');
    assert.throws(()=>acceptGoogleIdentity(db,{subject:'any',email:'existing@example.test',ownerEmail:owner}),/linking/);
    const created=acceptGoogleIdentity(db,{subject:'new-sub',email:'new.client@example.test',ownerEmail:owner});
    assert.equal(created.created,true);
    assert.equal(googleOnlyUser(db,created.id),true);
    assert.equal(acceptGoogleIdentity(db,{subject:'new-sub',email:'new.client@example.test',ownerEmail:owner}).id,created.id);
    assert.throws(()=>acceptGoogleIdentity(db,{subject:'new-sub',email:'changed@example.test',ownerEmail:owner}),/changed/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM vps_google_identities').get().n,1);
  }finally{db.close();}
});
