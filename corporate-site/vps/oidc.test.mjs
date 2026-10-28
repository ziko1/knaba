import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
import {createOwner,createSessionForUser} from './auth.mjs';
import {issueOwnerInvite,activateOwnerInvite} from './owner-invite.mjs';
import {hasOwnerAuthority} from './admin-access.mjs';
import {oidcProviders,beginOidc,completeOidc,verifyIdToken,OidcError} from './oidc.mjs';

const owner='owner@example.test';
const developer='developer@example.test';
const origin='https://customer.example';
const now=Date.now();
const cfg={
  google:{issuer:'https://accounts.google.com',clientId:'synthetic-google-client',
    clientSecret:'synthetic-not-real-secret',authorizationEndpoint:'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint:'https://oauth2.googleapis.com/token',jwksEndpoint:'https://www.googleapis.com/oauth2/v3/certs'}
};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pub=publicKey.export({format:'jwk'});
pub.kid='synthetic-key';pub.use='sig';pub.alg='RS256';
const jwt=(nonce,email='partner@example.test',changes={})=>{
  const stamp=Math.floor(now/1000);
  const claims={iss:cfg.google.issuer,aud:cfg.google.clientId,sub:'synthetic-subject-12345',
    email,email_verified:true,nonce,iat:stamp,exp:stamp+300,
    name:'Synthetic Partner',...changes};
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:pub.kid,typ:'JWT'})).toString('base64url');
  const body=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signed=header+'.'+body;
  return signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
};
async function fixture(work){
  const dir=mkdtempSync(join(tmpdir(),'knaba-oidc-'));
  const {db}=openLocalDatabase(join(dir,'test.sqlite'));
  try{return await work(db);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
}
function exchange(nonce,email='partner@example.test',changes={}){
  const signed=jwt(nonce,email,changes);
  let calls=0;
  const fetchImpl=async(url,opts)=>{
    calls++;
    if(url===cfg.google.tokenEndpoint){
      assert.equal(opts.method,'POST');
      const params=new URLSearchParams(opts.body);
      assert.equal(params.get('grant_type'),'authorization_code');
      assert.equal(params.get('client_id'),cfg.google.clientId);
      assert.equal(params.get('client_secret'),cfg.google.clientSecret);
      assert.equal(params.get('redirect_uri'),origin+'/auth/oidc/google/callback/');
      assert.equal(params.get('code'),'synthetic-code');
      assert.match(params.get('code_verifier'),/^[A-Za-z0-9_-]{43}$/);
      return new Response(JSON.stringify({id_token:signed}),{status:200});
    }
    if(url===cfg.google.jwksEndpoint)return new Response(JSON.stringify({keys:[pub]}),{status:200});
    throw Error('Unexpected network target '+url);
  };
  return {fetchImpl,get calls(){return calls;}};
}
function start(db,intent='partner',linkUserId=null){
  const started=beginOidc(db,{provider:'google',config:cfg,origin,intent,
    privacyAccepted:true,linkUserId,now});
  const qs=new URL(started.redirect).searchParams;
  assert.equal(qs.get('state'),started.state);
  assert.equal(qs.get('redirect_uri'),origin+'/auth/oidc/google/callback/');
  assert.equal(qs.get('code_challenge_method'),'S256');
  assert.match(qs.get('code_challenge'),/^[A-Za-z0-9_-]{43}$/);
  return {state:started.state,nonce:db.prepare('SELECT nonce FROM vps_oidc_states WHERE state_hash=?')
    .get(createHash('sha256').update(started.state).digest('hex')).nonce};
}
const finish=(db,state,fetchImpl,nowOverride=now)=>completeOidc(db,{
  provider:'google',config:cfg,origin,code:'synthetic-code',state,
  cookie:'__Host-knaba-oidc='+state,now:nowOverride,fetchImpl
});
test('providers stay disabled without operator-owned OAuth credentials',()=>{
  assert.deepEqual(Object.keys(oidcProviders({})),[]);
  assert.ok(oidcProviders({KNABA_GOOGLE_CLIENT_ID:'client',KNABA_GOOGLE_CLIENT_SECRET:'secret'}).google);
  assert.deepEqual(Object.keys(oidcProviders({
    KNABA_MICROSOFT_CLIENT_ID:'c',KNABA_MICROSOFT_CLIENT_SECRET:'s',KNABA_MICROSOFT_TENANT_ID:'common'})),[]);
});
test('OIDC verified partner registration stays pending; replay, state theft and duplicate email fail closed',async()=>{
  await fixture(async(db)=>{
    const {state,nonce}=start(db);
    const mock=exchange(nonce);
    await assert.rejects(finish(db,state,mock.fetchImpl,now+11*60_000),OidcError);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vps_users').get().n,0);
    const second=start(db);
    await assert.rejects(completeOidc(db,{
      provider:'google',config:cfg,origin,code:'synthetic-code',state:second.state,
      cookie:'__Host-knaba-oidc=stolen'.padEnd(61,'x'),
      now,fetchImpl:exchange(second.nonce).fetchImpl
    }),OidcError);
    const success=await finish(db,second.state,exchange(second.nonce).fetchImpl);
    assert.equal(success.newAccount,true);
    const p=db.prepare('SELECT requested_role,role,status FROM profiles WHERE id=?').get(success.userId);
    assert.deepEqual({...p},{requested_role:'partner',role:null,status:'pending'});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vps_oidc_links').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vps_sessions').get().n,0,'auth integration must mint session only after HTTP callback');
    assert.equal(hasOwnerAuthority(db,{userId:success.userId,ownerEmail:owner,developerEmail:developer}),false);
    await assert.rejects(finish(db,second.state,exchange(second.nonce).fetchImpl),OidcError);
  });
});
test('issuer, audience, nonce, signature, expiry and verified email are enforced before persistence',()=>{
  const nonce='synthetic-nonce';
  for(const changes of [{aud:'other'}, {iss:'https://evil.example'},
    {nonce:'wrong'}, {email_verified:false}, {exp:Math.floor(now/1000)-1}]){
    assert.throws(()=>verifyIdToken(jwt(nonce,'partner@example.test',changes),{keys:[pub]},
      {provider:cfg.google,nonce,now:Math.floor(now/1000)}),OidcError);
  }
  const corrupted=jwt(nonce).slice(0,-3)+'abc';
  assert.throws(()=>verifyIdToken(corrupted,{keys:[pub]},{provider:cfg.google,nonce,now:Math.floor(now/1000)}),OidcError);
});
test('matching email never silently links an owner; signed-in owner can explicitly link and sign in',async()=>{
  await fixture(async(db)=>{
    const enrolled=createOwner(db,owner,'synthetic-owner-password-long-2026');
    const before=start(db,'client');
    await assert.rejects(finish(db,before.state,exchange(before.nonce,owner).fetchImpl),e=>e?.code==='link_required');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vps_oidc_links').get().n,0);
    const linked=start(db,'client',enrolled.id);
    const allowed=await finish(db,linked.state,exchange(linked.nonce,owner).fetchImpl);
    assert.equal(allowed.userId,enrolled.id);
    assert.equal(allowed.newAccount,false);
    const later=start(db,'partner');
    const second=await finish(db,later.state,exchange(later.nonce,owner).fetchImpl);
    assert.equal(second.userId,enrolled.id);
    assert.equal(hasOwnerAuthority(db,{userId:second.userId,ownerEmail:owner}),true);
    const session=createSessionForUser(db,second.userId);
    assert.match(session.token,/^[A-Za-z0-9_-]{43}$/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vps_users').get().n,1);
  });
});
test('developer owner-equivalent rights require server-configured address AND recorded active grant',async()=>{
  await fixture(db=>{
    const original=createOwner(db,owner,'synthetic-owner-password-2026');
    const stranger=createOwner(db,developer,'synthetic-developer-no-grant-password');
    assert.equal(hasOwnerAuthority(db,{userId:original.id,ownerEmail:owner,developerEmail:developer}),true);
    assert.equal(hasOwnerAuthority(db,{userId:stranger.id,ownerEmail:owner,developerEmail:developer}),false);
    db.prepare("INSERT INTO vps_staff_grants(user_id,email,purpose,active,enrolled_at) VALUES (?,?,'developer',1,?)")
      .run(stranger.id,developer,new Date().toISOString());
    assert.equal(hasOwnerAuthority(db,{userId:stranger.id,ownerEmail:owner,developerEmail:developer}),true);
    assert.equal(hasOwnerAuthority(db,{userId:stranger.id,ownerEmail:owner,developerEmail:'another@example.test'}),false);
    db.prepare('UPDATE vps_staff_grants SET active=0 WHERE user_id=?').run(stranger.id);
    assert.equal(hasOwnerAuthority(db,{userId:stranger.id,ownerEmail:owner,developerEmail:developer}),false);
  });
});
test('developer enrollment via one-use offline invitation, never a public profile role',async()=>{
 await fixture(db=>{
  const original=createOwner(db,owner,'synthetic-owner-password-2026');
  const invite=issueOwnerInvite(db,developer,{now:now-1000});
  const res=activateOwnerInvite(db,{token:invite.token,email:developer,
    password:'synthetic-dev-passphrase-2026',confirmed:'synthetic-dev-passphrase-2026',
    attested:true,purpose:'developer',now});
  assert.equal(hasOwnerAuthority(db,{userId:res.id,ownerEmail:owner,developerEmail:developer}),true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM profiles WHERE id=?').get(res.id).n,0);
  assert.throws(()=>activateOwnerInvite(db,{token:invite.token,email:developer,
    password:'synthetic-dev-passphrase-2026',confirmed:'synthetic-dev-passphrase-2026',
    attested:true,purpose:'developer',now}));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM vps_users').get().n,2);
 });
});
