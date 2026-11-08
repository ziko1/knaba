import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser,destroySession,rotateCredentials} from './auth.mjs';
import {createSiteConsentAuthority} from './site-identity-consent.mjs';
import {FederationError,digest,parsePeerConfig,transportFingerprint,trustFingerprint} from './site-identity-protocol.mjs';

// Actual local SQLite and existing session functions; all identities/keys are synthetic.
const schema=readFileSync(new URL('./site-identity-consents.sql',import.meta.url),'utf8');
const initialPeer={companyId:'company-a',issuer:'https://site.example/identity',audience:'knaba-erp:company-a',
  version:1,active:true,erpOrigin:'https://erp.example',siteOrigin:'https://site.example',
  keyId:'knaba-federation-fixture',secret:Buffer.alloc(32,11).toString('base64url')};
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'knaba-site-consent-')),path=join(directory,'site.sqlite');
  const {db}=openLocalDatabase(path);db.exec(schema);
  const connections=[db];
  t.after(()=>{for(const connection of connections)connection.close();rmSync(directory,{recursive:true,force:true});});
  const state={db,now:Date.now(),peer:parsePeerConfig(initialPeer),developerEmail:''};
  state.authority=(extra={},connection=db)=>createSiteConsentAuthority(connection,{
    config:()=>state.peer,clock:()=>state.now,developerEmail:state.developerEmail,...extra
  });
  state.second=()=>{const {db:other}=openLocalDatabase(path);connections.push(other);return state.authority({},other);};
  state.setPeer=patch=>{state.peer=parsePeerConfig({...state.peer,...patch});};
  state.session=user=>{
    const login=createSessionForUser(db,user.id),hash=digest(login.token),seconds=Math.floor(state.now/1000);
    db.prepare('UPDATE vps_sessions SET created_at=?,expires_at=? WHERE token_hash=?').run(seconds-1,seconds+43_200,hash);
    return {...user,token:login.token,cookie:'__Host-knaba-session='+login.token,hash};
  };
  state.user=({email='client-'+randomUUID()+'@example.test',profile=true,role='client',status='approved',credentials=false}={})=>{
    let user;
    if(credentials)user=createCredentialsUser(db,email,'synthetic-original-passphrase');
    else{
      user={id:randomBytes(18).toString('base64url'),email};
      db.prepare('INSERT INTO vps_users(id,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)')
        .run(user.id,user.email,'unused-in-this-session-test','unused-in-this-session-test',new Date(state.now).toISOString());
    }
    if(profile){
      const time=new Date(state.now).toISOString();
      db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
        .run(user.id,'Synthetic site user',email,role,role,status,'synthetic-privacy',time,time,randomUUID());
    }
    return state.session(user);
  };
  state.challenge=(patch={})=>{
    const id=randomUUID();
    return {id,challengeDigest:digest('synthetic-challenge:'+id),nonceDigest:digest('synthetic-nonce:'+id),
      companyId:state.peer.companyId,issuer:state.peer.issuer,audience:state.peer.audience,targetUserId:'erp-user-a',
      targetDisplayName:'Synthetic ERP user',targetEmail:'erp-user@example.test',companyName:'Synthetic company',
      trustFingerprint:trustFingerprint(state.peer),expiresAt:state.now+300_000,...patch};
  };
  state.audit=action=>db.prepare('SELECT count(*) AS n FROM portal_audit WHERE action=?').get(action).n;
  state.row=id=>db.prepare('SELECT * FROM vps_site_identity_consents WHERE id=?').get(id);
  state.rows=()=>db.prepare('SELECT count(*) AS n FROM vps_site_identity_consents').get().n;
  return state;
}
const denied=operation=>assert.throws(operation,error=>error instanceof FederationError&&
  ['ACCESS_DENIED','VALIDATION_ERROR','MISSING_CONFIGURATION'].includes(error.code));
const request=(grant,challenge)=>({grantToken:grant.grantToken,challengeId:challenge.id,
  challengeDigest:challenge.challengeDigest,nonceDigest:challenge.nonceDigest,companyId:challenge.companyId,
  targetUserId:challenge.targetUserId,trustFingerprint:challenge.trustFingerprint});
function consented(state,user=state.user()){
  const authority=state.authority(),challenge=state.challenge(),grant=authority.consent({cookieHeader:user.cookie,challenge});
  return {authority,user,challenge,grant,input:request(grant,challenge)};
}
function sessionProof(f,user,authority=f.authority()){
  const current=authority.current(user.cookie);
  return {companyId:f.peer.companyId,issuer:f.peer.issuer,audience:f.peer.audience,subject:current.subject,
    sessionDigest:current.sessionDigest,profileVersion:current.profileVersion,profileFingerprint:current.profileFingerprint,
    trustFingerprint:trustFingerprint(f.peer),transportFingerprint:transportFingerprint(f.peer)};
}

test('session introspection defaults off independently of active F2 and returns only exact authority fields when enabled',t=>{
  const f=fixture(t),user=f.user(),input=sessionProof(f,user),disabled=f.authority();
  assert.throws(()=>disabled.introspectSession(input),error=>error instanceof FederationError&&error.code==='MISSING_CONFIGURATION');
  const granted=disabled.consent({cookieHeader:user.cookie,challenge:f.challenge()});assert.ok(granted.grantToken);
  const authority=f.authority({sessionsEnabled:()=>true}),result=authority.introspectSession(input);
  assert.deepEqual(Object.keys(result).sort(),[...Object.keys(input),'active','expiresAt','checkedAt'].sort());
  assert.deepEqual(result,{active:true,...input,expiresAt:f.db.prepare('SELECT expires_at FROM vps_sessions WHERE token_hash=?').get(user.hash).expires_at*1000,checkedAt:f.now});
  for(const privateValue of [user.email,user.token,'Synthetic site user',granted.grantToken])assert.equal(JSON.stringify(result).includes(privateValue),false);
  assert.equal(f.rows(),1);assert.equal(f.audit('site_identity.consented'),1);
  f.now++;assert.equal(authority.introspectSession(input).checkedAt,f.now);
});

test('introspection rejects missing/extra fields, raw credentials and malformed snapshot values',t=>{
  const f=fixture(t),user=f.user(),input=sessionProof(f,user),authority=f.authority({sessionsEnabled:()=>true});
  for(const key of Object.keys(input)){const changed={...input};delete changed[key];denied(()=>authority.introspectSession(changed));}
  for(const patch of [{cookie:user.cookie},{grantToken:randomUUID()+'.'+user.token},{roles:['owner']},{active:true},
    {sessionDigest:user.token},{sessionDigest:input.sessionDigest+'\n'},{profileFingerprint:'A'.repeat(64)},
    {profileVersion:-1},{profileVersion:Number.MAX_SAFE_INTEGER+1},{profileVersion:'1'},{subject:''},
    {companyId:'foreign-company'},{issuer:f.peer.issuer+'/'},{audience:'foreign-audience'},
    {trustFingerprint:'f'.repeat(64)},{transportFingerprint:'f'.repeat(64)}])denied(()=>authority.introspectSession({...input,...patch}));
  assert.equal(f.rows(),0);
});

test('introspection cannot substitute another user/session or rebind an old digest after logout and fresh login',t=>{
  const f=fixture(t),user=f.user(),other=f.user(),input=sessionProof(f,user),authority=f.authority({sessionsEnabled:()=>true});
  denied(()=>authority.introspectSession({...input,subject:other.id}));
  denied(()=>authority.introspectSession({...input,sessionDigest:other.hash}));
  destroySession(f.db,user.cookie);const fresh=f.session(user);
  denied(()=>authority.introspectSession(input));assert.equal(authority.introspectSession(sessionProof(f,fresh)).active,true);
});

for(const [name,change]of [
  ['account disabled',(f,u)=>f.db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(u.id)],
  ['profile suspended',(f,u)=>f.db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(u.id)],
  ['profile pending',(f,u)=>f.db.prepare("UPDATE profiles SET status='pending' WHERE id=?").run(u.id)],
  ['profile removed',(f,u)=>f.db.prepare('DELETE FROM profiles WHERE id=?').run(u.id)],
  ['profile version changed',(f,u)=>f.db.prepare('UPDATE profiles SET version=version+1 WHERE id=?').run(u.id)],
  ['profile fields changed',(f,u)=>f.db.prepare("UPDATE profiles SET name='Changed profile' WHERE id=?").run(u.id)],
  ['developer grant retained',(f,u)=>f.db.prepare("INSERT INTO vps_staff_grants VALUES (?,?,'developer',0,?)").run(u.id,u.email,new Date(f.now).toISOString())],
  ['session expired',(f,u)=>f.db.prepare('UPDATE vps_sessions SET expires_at=? WHERE token_hash=?').run(Math.floor(f.now/1000),u.hash)]
])test('current session introspection denies '+name,t=>{
  const f=fixture(t),user=f.user(),input=sessionProof(f,user),authority=f.authority({sessionsEnabled:()=>true});
  assert.equal(authority.introspectSession(input).active,true);change(f,user);denied(()=>authority.introspectSession(input));
});

test('credential rotation revokes original introspection even when a replacement site session exists',t=>{
  const f=fixture(t),user=f.user({credentials:true}),input=sessionProof(f,user),authority=f.authority({sessionsEnabled:()=>true});
  assert.equal(rotateCredentials(f.db,{userId:user.id,currentPassword:'synthetic-original-passphrase',
    newPassword:'synthetic-rotated-passphrase',confirmed:'synthetic-rotated-passphrase'}),true);const fresh=f.session(user);
  denied(()=>authority.introspectSession(input));assert.equal(authority.introspectSession(sessionProof(f,fresh)).active,true);
});

test('introspection retains exact owner pin and developer-email exclusions, including profile version zero',t=>{
  const f=fixture(t),owner=f.user({profile:false});f.setPeer({ownerUserId:owner.id});
  const input=sessionProof(f,owner),authority=f.authority({sessionsEnabled:()=>true});
  assert.equal(input.profileVersion,0);assert.equal(authority.introspectSession(input).active,true);
  denied(()=>f.authority({sessionsEnabled:()=>true,developerEmail:owner.email}).introspectSession(input));
  f.setPeer({ownerUserId:'another-owner'});denied(()=>authority.introspectSession(input));
  const impostor=f.user({role:'owner'});denied(()=>sessionProof(f,impostor));
});

test('introspection caps expiry and rechecks independent flag/config/session before its synchronous transaction commits',t=>{
  const f=fixture(t),user=f.user();f.setPeer({expiresAt:new Date(f.now+50_000).toISOString()});const input=sessionProof(f,user);
  assert.equal(f.authority({sessionsEnabled:()=>true}).introspectSession(input).expiresAt,f.now+50_000);
  let enabledCalls=0;
  denied(()=>f.authority({sessionsEnabled:()=>++enabledCalls===1}).introspectSession(input));
  let configCalls=0;
  denied(()=>f.authority({sessionsEnabled:()=>true,config:()=>{
    if(++configCalls===2)f.db.prepare('DELETE FROM vps_sessions WHERE token_hash=?').run(user.hash);
    return f.peer;
  }}).introspectSession(input));
  assert.ok(f.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(user.hash),'injected same-transaction deletion is rolled back');
  configCalls=0;const changed=parsePeerConfig({...f.peer,secret:Buffer.alloc(32,91).toString('base64url')});
  denied(()=>f.authority({sessionsEnabled:()=>true,config:()=>++configCalls===1?f.peer:changed}).introspectSession(input));
  let ticks=0;denied(()=>f.authority({sessionsEnabled:()=>true,clock:()=>f.now+(++ticks===1?0:50_000)}).introspectSession(input));
  assert.equal(f.rows(),0);
});

test('current and consent bind the actual approved site ID/session; inspect does not consume',t=>{
  const f=fixture(t),user=f.user(),authority=f.authority(),current=authority.current(user.cookie);
  assert.deepEqual(Object.keys(current).sort(),['subject','displayName','email','sessionDigest','profileVersion','profileFingerprint','expiresAt','checkedAt'].sort());
  assert.equal(current.subject,user.id);assert.notEqual(current.subject,'erp-user-a');
  assert.equal(current.sessionDigest,digest(user.token));assert.equal(current.profileVersion,1);
  assert.equal(current.email,user.email);assert.match(current.profileFingerprint,/^[a-f0-9]{64}$/);
  const challenge=f.challenge(),grant=authority.consent({cookieHeader:user.cookie,challenge});
  assert.deepEqual(Object.keys(grant).sort(),['grantToken','expiresAt','subject','displayName','email'].sort());
  const row=f.row(grant.grantToken.slice(0,36));
  assert.equal(row.status,'CONSENTED');assert.equal(row.session_hash,user.hash);
  assert.equal(row.grant_hash,digest(grant.grantToken));assert.equal(row.expires_at,challenge.expiresAt);
  const proof=authority.inspect(request(grant,challenge));
  assert.deepEqual(Object.keys(proof).sort(),['issuer','audience','subject','companyId','targetUserId','challengeId','challengeDigest','nonceDigest',
    'trustFingerprint','transportFingerprint','grantDigest','sessionDigest','profileVersion','profileFingerprint','displayName','email','expiresAt','checkedAt'].sort());
  assert.equal(proof.subject,user.id);assert.equal(proof.targetUserId,challenge.targetUserId);
  assert.equal(proof.issuer,f.peer.issuer);assert.equal(proof.audience,f.peer.audience);
  assert.equal(proof.transportFingerprint,transportFingerprint(f.peer));assert.equal(proof.profileFingerprint,current.profileFingerprint);
  assert.equal(f.row(row.id).status,'CONSENTED');assert.equal(f.audit('site_identity.consented'),1);
  assert.equal(f.audit('site_identity.redeemed'),0);
  const stored=JSON.stringify([...f.db.prepare('SELECT * FROM vps_site_identity_consents').all(),...f.db.prepare('SELECT * FROM portal_audit').all()]);
  for(const secret of [grant.grantToken,user.token,f.peer.secret])assert.equal(stored.includes(secret),false);
});

test('consent and redeem are durable exact replays across database connections with one audit per transition',t=>{
  const f=fixture(t),{user,authority,challenge,grant,input}=consented(f);
  const second=f.second();
  assert.deepEqual(second.consent({cookieHeader:user.cookie,challenge}),grant);
  const first=authority.redeem(input),row=f.row(grant.grantToken.slice(0,36));
  assert.equal(row.status,'REDEEMED');assert.match(row.redeemed_fingerprint,/^[a-f0-9]{64}$/);
  f.now+=1000;
  const replay=second.redeem({...input});
  assert.equal(replay.checkedAt,f.now);assert.notEqual(replay.checkedAt,first.checkedAt);
  assert.deepEqual({...replay,checkedAt:0},{...first,checkedAt:0});
  assert.deepEqual(second.consent({cookieHeader:user.cookie,challenge}),grant);
  assert.deepEqual(f.row(row.id),row);assert.equal(f.rows(),1);
  assert.equal(f.audit('site_identity.consented'),1);assert.equal(f.audit('site_identity.redeemed'),1);
});

test('same challenge cannot be adopted by another user or another session of the same user',t=>{
  const f=fixture(t),{authority,user,challenge,grant,input}=consented(f),other=f.user();
  // A matching profile email does not become identity evidence.
  f.db.prepare('UPDATE profiles SET email=? WHERE id=?').run(user.email,other.id);
  denied(()=>authority.consent({cookieHeader:other.cookie,challenge}));
  const later=f.session(user);
  denied(()=>authority.consent({cookieHeader:later.cookie,challenge}));
  assert.deepEqual(authority.consent({cookieHeader:user.cookie,challenge}),grant);
  assert.equal(authority.redeem(input).subject,user.id);assert.equal(f.rows(),1);
});

test('preview requires the exact company/issuer/audience/trust and all bounded challenge fields',t=>{
  const f=fixture(t),user=f.user(),authority=f.authority(),original=f.challenge();
  for(const patch of [
    {companyId:'foreign-company'},{issuer:f.peer.issuer+'/'},{audience:'foreign-audience'},
    {trustFingerprint:'a'.repeat(64)},{id:randomUUID().toUpperCase()},{id:'not-a-uuid'},
    {challengeDigest:'x'.repeat(64)},{nonceDigest:'a'.repeat(63)},{targetUserId:''},
    {targetUserId:'white space'},{targetDisplayName:7},{targetEmail:null},{companyName:'x'.repeat(1025)},
    {expiresAt:f.now},{expiresAt:f.now+300_001},{expiresAt:f.now+1.5},{extra:'browser-claim'}
  ])denied(()=>authority.consent({cookieHeader:user.cookie,challenge:{...original,...patch}}));
  const missing={...original};delete missing.targetEmail;
  denied(()=>authority.consent({cookieHeader:user.cookie,challenge:missing}));
  assert.equal(f.rows(),0);assert.equal(f.audit('site_identity.consented'),0);
});

test('inspect and redeem bind every request field and reject cookie or issuer claims in the backchannel body',t=>{
  const f=fixture(t),{authority,input,grant}=consented(f);
  const altered=grant.grantToken.slice(0,-1)+(grant.grantToken.endsWith('A')?'B':'A');
  for(const patch of [{grantToken:altered},{challengeId:randomUUID()},{challengeDigest:'b'.repeat(64)},
    {nonceDigest:'c'.repeat(64)},{companyId:'company-b'},{targetUserId:'erp-user-b'},
    {trustFingerprint:'d'.repeat(64)},{cookieHeader:'__Host-knaba-session=ignored'},{issuer:f.peer.issuer}]){
    denied(()=>authority.inspect({...input,...patch}));denied(()=>authority.redeem({...input,...patch}));
  }
  const missing={...input};delete missing.nonceDigest;denied(()=>authority.inspect(missing));
  assert.equal(f.audit('site_identity.redeemed'),0);
  assert.equal(f.row(grant.grantToken.slice(0,36)).status,'CONSENTED');
});

for(const redeemed of [false,true])test(`original session logout denies ${redeemed?'redeemed replay':'unconsumed proof'} despite a new login`,t=>{
  const f=fixture(t),{authority,user,input}=consented(f);
  if(redeemed)authority.redeem(input);
  destroySession(f.db,user.cookie);
  const next=f.session(user);assert.equal(authority.current(next.cookie).subject,user.id);
  denied(()=>authority.inspect(input));denied(()=>authority.redeem(input));
  assert.equal(f.audit('site_identity.redeemed'),redeemed?1:0);
});

test('actual credential rotation revokes the original consent session',t=>{
  const f=fixture(t),user=f.user({credentials:true}),{authority,input}=consented(f,user);
  assert.equal(rotateCredentials(f.db,{userId:user.id,currentPassword:'synthetic-original-passphrase',
    newPassword:'synthetic-replacement-passphrase',confirmed:'synthetic-replacement-passphrase'}),true);
  const next=f.session(user);assert.equal(authority.current(next.cookie).subject,user.id);
  denied(()=>authority.inspect(input));denied(()=>authority.redeem(input));
});

for(const change of ['disabled','suspended','pending','version','role','profile-data','email','missing-profile']){
  test(`current authority is rechecked after redemption: ${change}`,t=>{
    const f=fixture(t),{authority,user,input}=consented(f);authority.redeem(input);
    if(change==='disabled')f.db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id);
    else if(change==='suspended'||change==='pending')f.db.prepare('UPDATE profiles SET status=? WHERE id=?').run(change,user.id);
    else if(change==='version')f.db.prepare('UPDATE profiles SET version=version+1 WHERE id=?').run(user.id);
    else if(change==='role')f.db.prepare("UPDATE profiles SET role='worker' WHERE id=?").run(user.id);
    else if(change==='profile-data')f.db.prepare("UPDATE profiles SET name='Changed without version bump' WHERE id=?").run(user.id);
    else if(change==='email')f.db.prepare("UPDATE vps_users SET email='changed@example.test' WHERE id=?").run(user.id);
    else f.db.prepare('DELETE FROM profiles WHERE id=?').run(user.id);
    denied(()=>authority.inspect(input));denied(()=>authority.redeem(input));
    assert.equal(f.audit('site_identity.redeemed'),1);
  });
}

test('only approved allowed roles enter federation; an owner requires the exact immutable pin',t=>{
  const f=fixture(t),authority=f.authority();
  for(const role of ['client','worker','partner','bauleiter','admin']){
    const user=f.user({role});assert.equal(authority.current(user.cookie).subject,user.id);
  }
  for(const options of [{profile:false},{status:'pending'},{status:'suspended'},{role:'developer'},{role:'guest'},{role:'owner'}]){
    const user=f.user(options);denied(()=>authority.current(user.cookie));
  }
  const owner=f.user({profile:false});f.setPeer({ownerUserId:owner.id});
  assert.equal(authority.current(owner.cookie).profileVersion,0);
  assert.equal(consented(f,owner).grant.subject,owner.id);
  const impostor=f.user({role:'owner'});denied(()=>authority.current(impostor.cookie));
  f.setPeer({ownerUserId:impostor.id});assert.equal(authority.current(impostor.cookie).subject,impostor.id);
  f.db.prepare("UPDATE profiles SET status='pending' WHERE id=?").run(impostor.id);
  denied(()=>authority.current(impostor.cookie));
});

test('configured developer email and retained developer grants never become operational identities',t=>{
  const f=fixture(t),developer=f.user({email:'developer@example.test',role:'admin'});
  f.developerEmail=' DEVELOPER@example.test ';
  denied(()=>f.authority().current(developer.cookie));
  f.setPeer({ownerUserId:developer.id});denied(()=>f.authority().current(developer.cookie));
  f.developerEmail='';
  for(const active of [0,1]){
    const user=f.user({role:'admin'});
    f.db.prepare('INSERT INTO vps_staff_grants(user_id,email,purpose,active,enrolled_at) VALUES (?,?,?,?,?)')
      .run(user.id,'different-metadata@example.test','developer',active,new Date(f.now).toISOString());
    denied(()=>f.authority().current(user.cookie));
  }
});

test('owner profile creation and late developer enrollment invalidate previously granted evidence',t=>{
  const f=fixture(t),owner=f.user({profile:false});f.setPeer({ownerUserId:owner.id});
  const {authority,input}=consented(f,owner),time=new Date(f.now).toISOString();
  f.db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
    .run(owner.id,'Owner',owner.email,'owner','owner','approved','synthetic',time,time,randomUUID());
  denied(()=>authority.inspect(input));
  const second=consented(f,owner);
  f.db.prepare("INSERT INTO vps_staff_grants VALUES (?,?,'developer',1,?)").run(owner.id,owner.email,time);
  denied(()=>authority.inspect(second.input));denied(()=>authority.redeem(second.input));
});

test('session and peer expiry cap the grant and the exact expiry instant denies every replay',t=>{
  const f=fixture(t),user=f.user();
  const sessionExpiry=(Math.floor(f.now/1000)+45)*1000;
  f.db.prepare('UPDATE vps_sessions SET expires_at=? WHERE token_hash=?').run(sessionExpiry/1000,user.hash);
  const {authority,grant,input}=consented(f,user);assert.equal(grant.expiresAt,sessionExpiry);
  authority.redeem(input);f.now=sessionExpiry;
  denied(()=>authority.current(user.cookie));denied(()=>authority.inspect(input));denied(()=>authority.redeem(input));
  const next=f.user();f.setPeer({expiresAt:new Date(f.now+30_000).toISOString()});
  assert.equal(consented(f,next).grant.expiresAt,f.now+30_000);
});

test('a later shortened original session and backwards clock cannot extend an existing grant',t=>{
  const f=fixture(t),{authority,user,input,grant}=consented(f),created=f.now;
  f.db.prepare('UPDATE vps_sessions SET expires_at=? WHERE token_hash=?').run(Math.floor((created+60_000)/1000),user.hash);
  denied(()=>authority.inspect(input));
  f.db.prepare('UPDATE vps_sessions SET expires_at=? WHERE token_hash=?').run(Math.ceil(grant.expiresAt/1000),user.hash);
  f.now=created-1;denied(()=>authority.redeem(input));
});

for(const patch of [
  {active:false},{version:2},{companyId:'company-b'},{issuer:'https://site.example/identity/'},
  {audience:'different-audience'},{keyId:'knaba-federation-rotated'},
  {secret:Buffer.alloc(32,12).toString('base64url')},{siteOrigin:'https://new-site.example'},
  {erpOrigin:'https://new-erp.example'},{ownerUserId:'new-owner'}
])test(`trust/transport change invalidates redeemed evidence: ${Object.keys(patch)[0]}`,t=>{
  const f=fixture(t),{authority,input}=consented(f);authority.redeem(input);f.setPeer(patch);
  denied(()=>authority.inspect(input));denied(()=>authority.redeem(input));
  assert.equal(f.audit('site_identity.redeemed'),1);
});

test('missing or expired peer denies current identity, and final peer drift rolls the consent back',t=>{
  const f=fixture(t),user=f.user(),challenge=f.challenge();
  denied(()=>f.authority({config:()=>null}).current(user.cookie));
  denied(()=>f.authority({config:()=>parsePeerConfig({...f.peer,expiresAt:new Date(f.now).toISOString()})}).current(user.cookie));
  let reads=0;
  const changed=parsePeerConfig({...f.peer,keyId:'knaba-federation-changed'});
  const authority=f.authority({config:()=>++reads===1?f.peer:changed});
  denied(()=>authority.consent({cookieHeader:user.cookie,challenge}));
  assert.equal(f.rows(),0);assert.equal(f.audit('site_identity.consented'),0);
  assert.ok(f.authority().consent({cookieHeader:user.cookie,challenge}).grantToken);
});

test('expiry or authority loss at the final check rolls back grant, consumption and audit',t=>{
  const f=fixture(t),user=f.user(),challenge=f.challenge({expiresAt:f.now+1});
  let ticks=0;
  denied(()=>f.authority({clock:()=>f.now+(++ticks===1?0:1)}).consent({cookieHeader:user.cookie,challenge}));
  assert.equal(f.rows(),0);assert.equal(f.audit('site_identity.consented'),0);
  const {grant,input}=consented(f,user);let reads=0;
  const authority=f.authority({config:()=>{
    if(++reads===2)f.db.prepare('DELETE FROM vps_sessions WHERE token_hash=?').run(user.hash);
    return f.peer;
  }});
  denied(()=>authority.redeem(input));
  assert.equal(f.row(grant.grantToken.slice(0,36)).status,'CONSENTED');
  assert.equal(f.audit('site_identity.redeemed'),0);
  assert.ok(f.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(user.hash),'injected same-transaction revocation was rolled back too');
});

test('expiry at the final redeem check rolls back consumption and its audit',t=>{
  const f=fixture(t),user=f.user(),challenge=f.challenge({expiresAt:f.now+1});
  const grant=f.authority().consent({cookieHeader:user.cookie,challenge}),input=request(grant,challenge);
  const before=f.row(grant.grantToken.slice(0,36));let ticks=0;
  denied(()=>f.authority({clock:()=>f.now+(++ticks===1?0:1)}).redeem(input));
  assert.deepEqual(f.row(before.id),before);assert.equal(f.audit('site_identity.redeemed'),0);
});

test('transport rotation during redeem rolls back consumption before any receipt is returned',t=>{
  const f=fixture(t),{authority,input,grant}=consented(f),before=f.row(grant.grantToken.slice(0,36));
  const next=parsePeerConfig({...f.peer,secret:Buffer.alloc(32,13).toString('base64url')});let reads=0;
  denied(()=>f.authority({config:()=>++reads===1?f.peer:next}).redeem(input));
  assert.deepEqual(f.row(before.id),before);assert.equal(f.audit('site_identity.redeemed'),0);
  authority.redeem(input);assert.equal(f.audit('site_identity.redeemed'),1);
});

test('a failed consent audit rolls back the insert; a failed redeem audit rolls back consumption',t=>{
  const f=fixture(t),user=f.user(),challenge=f.challenge(),authority=f.authority();
  f.db.exec("CREATE TRIGGER deny_identity_audit BEFORE INSERT ON portal_audit WHEN NEW.action LIKE 'site_identity.%' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_AUDIT_FAILURE'); END;");
  assert.throws(()=>authority.consent({cookieHeader:user.cookie,challenge}),/SYNTHETIC_AUDIT_FAILURE/);
  assert.equal(f.rows(),0);f.db.exec('DROP TRIGGER deny_identity_audit');
  const grant=authority.consent({cookieHeader:user.cookie,challenge}),input=request(grant,challenge);
  const before=f.row(grant.grantToken.slice(0,36));
  f.db.exec("CREATE TRIGGER deny_identity_audit BEFORE INSERT ON portal_audit WHEN NEW.action='site_identity.redeemed' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_AUDIT_FAILURE'); END;");
  assert.throws(()=>authority.redeem(input),/SYNTHETIC_AUDIT_FAILURE/);assert.deepEqual(f.row(before.id),before);
  assert.equal(f.audit('site_identity.redeemed'),0);f.db.exec('DROP TRIGGER deny_identity_audit');
  authority.redeem(input);assert.equal(f.audit('site_identity.redeemed'),1);
});

test('SQL guards reject changing immutable authority, nullable redemption and terminal updates',t=>{
  const f=fixture(t),{authority,grant,input}=consented(f),id=grant.grantToken.slice(0,36);
  for(const [column,value] of [['target_user_id','someone-else'],['session_hash','a'.repeat(64)],
    ['profile_version',2],['grant_hash','b'.repeat(64)],['expires_at',f.now+1]]){
    assert.throws(()=>f.db.prepare(`UPDATE vps_site_identity_consents SET ${column}=? WHERE id=?`).run(value,id),/SITE_IDENTITY_CONSENT_IMMUTABLE/);
  }
  assert.throws(()=>f.db.prepare("UPDATE vps_site_identity_consents SET status='REDEEMED',redeemed_fingerprint=NULL,redeemed_at=? WHERE id=?").run(f.now,id),/CHECK constraint/);
  assert.throws(()=>f.db.prepare("UPDATE vps_site_identity_consents SET status='REDEEMED',redeemed_fingerprint=?,redeemed_at=NULL WHERE id=?").run('a'.repeat(64),id),/CHECK constraint/);
  authority.redeem(input);
  assert.throws(()=>f.db.prepare("UPDATE vps_site_identity_consents SET status='CONSENTED',redeemed_fingerprint=NULL,redeemed_at=NULL WHERE id=?").run(id),/SITE_IDENTITY_CONSENT_IMMUTABLE/);
  assert.throws(()=>f.db.prepare('UPDATE vps_site_identity_consents SET redeemed_at=redeemed_at WHERE id=?').run(id),/SITE_IDENTITY_CONSENT_IMMUTABLE/);
});

test('ambiguous/malformed cookies and non-exact request objects are denied without grants',t=>{
  const f=fixture(t),user=f.user(),authority=f.authority(),challenge=f.challenge();
  for(const cookie of [undefined,'','knaba_session='+user.token,user.cookie+'; '+user.cookie,
    '__Host-knaba-session=short',user.cookie+'x','a'.repeat(4097)])denied(()=>authority.current(cookie));
  denied(()=>authority.consent({cookieHeader:user.cookie,challenge,subject:user.id}));
  const inherited=Object.assign(Object.create({nonceDigest:challenge.nonceDigest}),challenge);delete inherited.nonceDigest;
  denied(()=>authority.consent({cookieHeader:user.cookie,challenge:inherited}));
  assert.equal(f.rows(),0);
});
