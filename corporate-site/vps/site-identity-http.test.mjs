import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Script} from 'node:vm';
import {createSiteIdentityHandler} from './site-identity-http.mjs';
import {createSiteConsentAuthority} from './site-identity-consent.mjs';
import {openLocalDatabase} from './database.mjs';
import {createSessionForUser,destroySession,readSession} from './auth.mjs';
import {FederationError,digest,opaque,parsePeerConfig,peerRequest,proofHeaders,readProof,signRequest,verifyRequest,signResponse,trustFingerprint,transportFingerprint} from './site-identity-protocol.mjs';

const erpPath='/api/v1/auth/site-links/inspect-challenge';
const sessionPath='/auth/site-identity/introspect-session';
// Real Node HTTP + the production VPS identity handler, session reader and SQLite.
// ERP is deliberately a signed HTTP fixture. The small request/body adapter below
// is a test harness, not the compiled Worker or the full VPS deployment wrapper.
const basePeer={companyId:'synthetic-company',issuer:'https://synthetic-site.example/identity',audience:'synthetic-erp',
  version:1,active:true,keyId:'knaba-federation-site-http',secret:Buffer.alloc(32,47).toString('base64url')};
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
async function fixture(t,{production=false}={}){
  const directory=mkdtempSync(join(tmpdir(),'knaba-site-identity-http-')),dbPath=join(directory,'site.sqlite');
  const state={peer:null,calls:0,previews:new Map(),override:null,onInspect:null,badSignature:false,sessionsEnabled:false,onBodyRead:null};
  const erp=createServer((req,res)=>{void(async()=>{
    const chunks=[];for await(const part of req)chunks.push(part);const bytes=Buffer.concat(chunks);
    const peer=state.peer,proof=verifyRequest(peer,req.url,bytes,readProof(req.headers));
    assert.equal(req.url,erpPath);state.calls++;
    const input=JSON.parse(bytes),preview=state.previews.get(input.challengeToken);
    if(!preview){res.writeHead(403);res.end('{}');return;}
    if(state.onInspect)await state.onInspect();
    const output=Buffer.from(JSON.stringify(state.override?{...preview,...state.override}:preview));
    res.writeHead(200,{'content-type':'application/json',
      'x-knaba-federation-response':state.badSignature?'A'.repeat(43):signResponse(peer,req.url,output,proof)});
    res.end(output);
  })().catch(()=>{if(!res.headersSent)res.writeHead(403);res.end('{}');});});
  erp.listen(0,'127.0.0.1');await once(erp,'listening');
  const {db}=openLocalDatabase(dbPath);
  const handle=createSiteIdentityHandler(db,{config:()=>state.peer,developerEmail:'developer@example.test',
    origin:production?'https://site.example':'http://127.0.0.1',localTest:!production,sessionsEnabled:()=>state.sessionsEnabled});
  const site=createServer((req,res)=>{void(async()=>{
    const accountUser=readSession(db,req.headers.cookie);
    const sameAccountSession=()=>{
      const current=readSession(db,req.headers.cookie);
      return Boolean(current&&accountUser&&current.id===accountUser.id&&current.email===accountUser.email&&current.token===accountUser.token);
    };
    const readBody=async limit=>{
      const chunks=[];let count=0;
      for await(const chunk of req){count+=chunk.length;if(count<=limit)chunks.push(chunk);}
      if(count>limit)throw new FederationError('VALIDATION_ERROR');
      if(state.onBodyRead)await state.onBodyRead(req.url);
      if(accountUser&&!sameAccountSession()){const error=new Error('Session revoked');error.code='session_revoked';throw error;}
      return Buffer.concat(chunks);
    };
    const developerWorkspace=String(req.headers.cookie||'').split(';').some(part=>part.trim().startsWith('__Host-knaba-workspace='));
    if(!await handle({req,res,url:new URL(req.url,'http://127.0.0.1'),accountUser,readBody,sameAccountSession,developerWorkspace,clientIp:'127.0.0.1'})){
      res.writeHead(404);res.end('No fixture route');
    }
  })().catch(()=>{if(!res.headersSent)res.writeHead(500);res.end('{}');});});
  site.listen(0,'127.0.0.1');await once(site,'listening');
  state.db=db;state.origin='http://127.0.0.1:'+site.address().port;
  state.peer=parsePeerConfig({...basePeer,erpOrigin:'http://127.0.0.1:'+erp.address().port,
    siteOrigin:production?'https://site.example':state.origin},{localTest:true});
  t.after(async()=>{
    state.release?.();site.closeAllConnections();await new Promise(resolve=>site.close(resolve));
    erp.closeAllConnections();await new Promise(resolve=>erp.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});
  });
  state.call=(path,options={})=>fetch(state.origin+path,{redirect:'manual',signal:AbortSignal.timeout(5000),...options,
    headers:{...(production?{Host:'site.example','x-forwarded-proto':'https'}:{}),...options.headers}});
  state.user=({email='site-'+randomUUID()+'@example.test',role='client',status='approved'}={})=>{
    const id=randomBytes(18).toString('base64url'),time=new Date().toISOString();
    db.prepare('INSERT INTO vps_users(id,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)').run(id,email,'unused','unused',time);
    db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
      .run(id,'Synthetic site user',email,role,role,status,'synthetic',time,time,randomUUID());
    return state.session({id,email});
  };
  state.session=user=>{const session=createSessionForUser(db,user.id);return {...user,token:session.token,cookie:'__Host-knaba-session='+session.token};};
  state.challenge=()=>{
    const token=randomUUID()+'.'+opaque(),id=token.split('.')[0];
    const preview={id,challengeDigest:digest(token),nonceDigest:digest('synthetic-nonce:'+id),companyId:state.peer.companyId,
      issuer:state.peer.issuer,audience:state.peer.audience,targetUserId:'erp-user-a',targetDisplayName:'Synthetic ERP user',
      targetEmail:'erp-user@example.test',companyName:'Synthetic company',trustFingerprint:trustFingerprint(state.peer),expiresAt:Date.now()+290_000};
    state.previews.set(token,preview);return {token,preview};
  };
  state.csrf=async user=>{
    const response=await state.call('/auth/site-identity/session',{headers:{Cookie:user.cookie}});
    assert.equal(response.status,200);return (await response.json()).csrfToken;
  };
  state.post=async(path,body,user,csrf,patch={})=>{
    const headers={Cookie:user.cookie,Origin:state.peer.siteOrigin,'sec-fetch-site':'same-origin','content-type':'application/json',
      'x-knaba-request':'site-identity-v1','x-csrf-token':csrf,...patch};
    for(const [key,value]of Object.entries(headers))if(value===null)delete headers[key];
    return state.call(path,{method:'POST',headers,body:JSON.stringify(body)});
  };
  state.preview=async(user,challenge)=>{
    const csrf=await state.csrf(user),response=await state.post('/auth/site-identity/preview',{challengeToken:challenge.token},user,csrf);
    assert.equal(response.status,200);return {csrf,body:await response.json()};
  };
  state.consent=async(user,challenge,shown)=>state.post('/auth/site-identity/consent',{
    challengeToken:challenge.token,previewProof:shown.body.previewProof,confirmed:true},user,shown.csrf);
  state.count=()=>db.prepare('SELECT count(*) AS n FROM vps_site_identity_consents').get().n;
  state.audit=action=>db.prepare('SELECT count(*) AS n FROM portal_audit WHERE action=?').get(action).n;
  state.sessionProof=user=>{
    const current=createSiteConsentAuthority(db,{config:()=>state.peer,developerEmail:'developer@example.test'}).current(user.cookie);
    return {companyId:state.peer.companyId,issuer:state.peer.issuer,audience:state.peer.audience,subject:current.subject,
      sessionDigest:current.sessionDigest,profileVersion:current.profileVersion,profileFingerprint:current.profileFingerprint,
      trustFingerprint:trustFingerprint(state.peer),transportFingerprint:transportFingerprint(state.peer)};
  };
  state.signedSession=(input,{path=sessionPath,signedPath=path,now=Date.now(),headers={},bytes=Buffer.from(JSON.stringify(input))}={})=>{
    const signed=signRequest(state.peer,signedPath,bytes,now);
    return state.call(path,{method:'POST',headers:{'content-type':'application/json',...proofHeaders(signed),...headers},body:bytes});
  };
  return state;
}
async function grant(f){
  const user=f.user(),challenge=f.challenge(),shown=await f.preview(user,challenge),response=await f.consent(user,challenge,shown);
  assert.equal(response.status,200);const body=await response.json(),target=new URL(body.redirectUrl),parts=new URLSearchParams(target.hash.slice(1));
  assert.equal(target.origin,f.peer.erpOrigin);assert.equal(target.search,'');assert.equal(parts.get('challenge'),challenge.token);
  const input={grantToken:parts.get('grant'),challengeId:challenge.preview.id,challengeDigest:challenge.preview.challengeDigest,
    nonceDigest:challenge.preview.nonceDigest,companyId:f.peer.companyId,targetUserId:challenge.preview.targetUserId,trustFingerprint:challenge.preview.trustFingerprint};
  return {user,challenge,shown,body,input};
}

test('signed introspection is independently disabled by default while normal F2 remains available',async t=>{
  const f=await fixture(t),user=f.user(),input=f.sessionProof(user);
  const disabled=await f.signedSession(input);assert.equal(disabled.status,503);
  assert.deepEqual(await disabled.json(),{code:'MISSING_CONFIGURATION'});assert.equal(disabled.headers.get('x-knaba-federation-response'),null);
  const linked=await grant(f);assert.ok(linked.input.grantToken);
  f.sessionsEnabled=true;
  const result=await peerRequest(f.peer,'site',sessionPath,input);
  assert.deepEqual(Object.keys(result).sort(),[...Object.keys(input),'active','expiresAt','checkedAt'].sort());
  assert.equal(result.active,true);for(const key of Object.keys(input))assert.equal(result[key],input[key]);
  for(const value of [user.email,user.token,'Synthetic site user'])assert.equal(JSON.stringify(result).includes(value),false);
  assert.equal(f.count(),1);assert.equal(f.audit('site_identity.consented'),1);
});

test('introspection HTTP rejects unsigned, wrong-purpose, stale, malformed and substituted requests',async t=>{
  const f=await fixture(t);f.sessionsEnabled=true;const user=f.user(),input=f.sessionProof(user);
  const unsigned=await f.call(sessionPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  assert.equal(unsigned.status,403);await unsigned.text();
  for(const options of [{signedPath:'/auth/site-identity/inspect'},
    {now:Date.now()-60_000},{now:Date.now()+60_000},{headers:{'x-knaba-federation-signature':'A'.repeat(43)}}]){
    const response=await f.signedSession(input,options);assert.equal(response.status,403);await response.text();
  }
  for(const [body,status]of [[{...input,companyId:'foreign-company'},403],[{...input,subject:f.user().id},403],
    [{...input,profileVersion:2},403],[{...input,grantToken:randomUUID()+'.'+opaque()},400],
    [{...input,sessionDigest:user.token},400]]){
    const response=await f.signedSession(body);assert.equal(response.status,status);assert.equal(response.headers.get('x-knaba-federation-response'),null);await response.text();
  }
  const malformed=await f.signedSession(input,{bytes:Buffer.from('{')});assert.equal(malformed.status,400);await malformed.text();
  assert.equal(f.count(),0);
});

test('replayed signed introspection rereads current SQLite and cannot retain an allow after logout',async t=>{
  const f=await fixture(t);f.sessionsEnabled=true;const user=f.user(),input=f.sessionProof(user),bytes=Buffer.from(JSON.stringify(input));
  const proof=signRequest(f.peer,sessionPath,bytes),headers={'content-type':'application/json',...proofHeaders(proof)};
  const send=()=>f.call(sessionPath,{method:'POST',headers,body:bytes});
  for(let attempt=0;attempt<2;attempt++){const response=await send();assert.equal(response.status,200);const returned=Buffer.from(await response.arrayBuffer());
    assert.equal(response.headers.get('x-knaba-federation-response'),signResponse(f.peer,sessionPath,returned,proof));assert.equal(JSON.parse(returned).active,true);}
  destroySession(f.db,user.cookie);f.session(user);
  const denied=await send();assert.equal(denied.status,403);assert.equal(denied.headers.get('x-knaba-federation-response'),null);await denied.text();
});

for(const [name,change,status]of [
  ['flag disabled',f=>{f.sessionsEnabled=false;},503],
  ['peer key changed',f=>{f.peer=parsePeerConfig({...f.peer,secret:Buffer.alloc(32,99).toString('base64url')},{localTest:true});},403],
  ['original profile changed',(f,user)=>{f.db.prepare('UPDATE profiles SET version=version+1 WHERE id=?').run(user.id);},403],
  ['original session logged out',(f,user)=>{destroySession(f.db,user.cookie);},403]
])test('introspection denies '+name+' during the actual HTTP body await',async t=>{
  const f=await fixture(t);f.sessionsEnabled=true;const user=f.user(),input=f.sessionProof(user),entered=deferred(),release=deferred();f.release=release.resolve;
  f.onBodyRead=async path=>{if(path===sessionPath){entered.resolve();await release.promise;}};
  const pending=f.signedSession(input);
  await Promise.race([entered.promise,pending.then(()=>{throw Error('Expected introspection body-read barrier');})]);
  change(f,user);release.resolve();
  const response=await pending;assert.equal(response.status,status);assert.equal(response.headers.get('x-knaba-federation-response'),null);await response.text();
});

test('authenticated introspection bursts use a separate bounded per-session bucket without consuming F2 quota',{timeout:25000},async t=>{
  const f=await fixture(t);f.sessionsEnabled=true;const user=f.user(),input=f.sessionProof(user);
  for(let request=0;request<600;request++)assert.equal((await peerRequest(f.peer,'site',sessionPath,input)).active,true);
  const limited=await f.signedSession(input);assert.equal(limited.status,429);assert.deepEqual(await limited.json(),{code:'RATE_LIMITED'});
  const another=f.user();assert.equal((await peerRequest(f.peer,'site',sessionPath,f.sessionProof(another))).active,true);
  const linked=await grant(f);
  for(let request=0;request<40;request++)assert.ok(await peerRequest(f.peer,'site','/auth/site-identity/inspect',linked.input));
  await assert.rejects(peerRequest(f.peer,'site','/auth/site-identity/inspect',linked.input),FederationError);
  assert.equal((await peerRequest(f.peer,'site',sessionPath,f.sessionProof(another))).active,true);
});

test('neutral GET and the client asset expose no identity, mutation or referrer-bearing transfer URL',async t=>{
  const f=await fixture(t),user=f.user(),challenge=f.challenge();
  for(const headers of [{'sec-fetch-site':'cross-site'},{Cookie:user.cookie}]){
    const response=await f.call('/account/erp/',{headers}),html=await response.text();
    assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('set-cookie'),null);
    assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.match(html,/data-mode="site"/);assert.equal(html.includes(user.email),false);assert.equal(html.includes(challenge.token),false);
  }
  const response=await f.call('/auth/site-identity-ui.js'),script=await response.text();
  assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.doesNotThrow(()=>new Script(script));assert.match(script,/history\.replaceState\(null,'',location\.pathname\)/);
  assert.doesNotMatch(script,/localStorage|sessionStorage|document\.cookie/);
  assert.equal(f.calls,0);assert.equal(f.count(),0);
  assert.equal((await f.call('/account/erp/',{method:'POST'})).status,405);
});

test('actual VPS HTTP previews both accounts, requires explicit consent and retries the same grant',async t=>{
  const f=await fixture(t),user=f.user(),challenge=f.challenge(),shown=await f.preview(user,challenge);
  assert.equal(shown.body.site.id,user.id);assert.equal(shown.body.user.id,challenge.preview.targetUserId);
  assert.equal(shown.body.company.id,f.peer.companyId);assert.match(shown.body.previewProof,/^[a-f0-9]{64}$/);
  assert.equal(f.count(),0);
  for(const confirmed of [false,undefined,'true']){
    const response=await f.post('/auth/site-identity/consent',{challengeToken:challenge.token,previewProof:shown.body.previewProof,confirmed},user,shown.csrf);
    assert.equal(response.status,403);await response.text();
  }
  const first=await f.consent(user,challenge,shown),firstBody=await first.json();assert.equal(first.status,200);
  const second=await f.consent(user,challenge,shown),secondBody=await second.json();assert.equal(second.status,200);
  assert.deepEqual(secondBody,firstBody);assert.equal(f.count(),1);assert.equal(f.audit('site_identity.consented'),1);
});

test('CSRF, origin, method and exact browser body checks stop requests before contacting ERP',async t=>{
  const f=await fixture(t),user=f.user(),challenge=f.challenge(),csrf=await f.csrf(user);
  for(const patch of [{Origin:'https://foreign.example'},{Origin:null},{'sec-fetch-site':'cross-site'},
    {'sec-fetch-site':'none'},{'x-knaba-request':null},{'x-csrf-token':null},{'x-csrf-token':'wrong'},
    {'content-type':'text/plain'}]){
    const response=await f.post('/auth/site-identity/preview',{challengeToken:challenge.token},user,csrf,patch);
    assert.equal(response.status,403);await response.text();
  }
  assert.equal((await f.call('/auth/site-identity/preview',{headers:{Cookie:user.cookie}})).status,403);
  const extra=await f.post('/auth/site-identity/preview',{challengeToken:challenge.token,subject:user.id},user,csrf);
  assert.equal(extra.status,400);await extra.text();
  assert.equal((await f.call('/auth/site-identity/session?challenge=forbidden',{headers:{Cookie:user.cookie}})).status,400);
  assert.equal(f.calls,0);assert.equal(f.count(),0);
});

test('preview proof cannot substitute the site user, original session or ERP challenge',async t=>{
  const f=await fixture(t),a=f.user(),b=f.user(),first=f.challenge(),other=f.challenge(),shown=await f.preview(a,first);
  const csrfB=await f.csrf(b),next=f.session(a),csrfNext=await f.csrf(next);
  for(const [user,csrf,challenge]of [[b,csrfB,first],[next,csrfNext,first],[a,shown.csrf,other]]){
    const response=await f.post('/auth/site-identity/consent',{challengeToken:challenge.token,previewProof:shown.body.previewProof,confirmed:true},user,csrf);
    assert.equal(response.status,403);await response.text();
  }
  assert.equal(f.count(),0);
  const approved=await f.consent(a,first,shown);assert.equal(approved.status,200);await approved.text();
  const freshOther=await f.preview(b,first),denied=await f.consent(b,first,freshOther);
  assert.equal(denied.status,403);await denied.text();assert.equal(f.count(),1);
});

for(const change of ['version','name','suspended','disabled','logout'])test(`HTTP consent rejects a changed authority after its preview: ${change}`,async t=>{
  const f=await fixture(t),user=f.user(),challenge=f.challenge(),shown=await f.preview(user,challenge);
  if(change==='version')f.db.prepare('UPDATE profiles SET version=version+1 WHERE id=?').run(user.id);
  if(change==='name')f.db.prepare("UPDATE profiles SET name='Changed profile' WHERE id=?").run(user.id);
  if(change==='suspended')f.db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(user.id);
  if(change==='disabled')f.db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id);
  if(change==='logout')destroySession(f.db,user.cookie);
  const response=await f.consent(user,challenge,shown);assert.ok([401,403].includes(response.status));await response.text();
  assert.equal(f.count(),0);
});

for(const change of ['logout','profile','key'])test(`controlled actual HTTP barrier fences ${change} during peer I/O`,{timeout:6000},async t=>{
  const f=await fixture(t),user=f.user(),challenge=f.challenge(),shown=await f.preview(user,challenge);
  const entered=deferred(),release=deferred();f.release=release.resolve;
  f.onInspect=async()=>{entered.resolve();await release.promise;};
  const pending=f.consent(user,challenge,shown);await entered.promise;
  if(change==='logout'){destroySession(f.db,user.cookie);f.session(user);}
  if(change==='profile')f.db.prepare('UPDATE profiles SET version=version+1 WHERE id=?').run(user.id);
  if(change==='key')f.peer=parsePeerConfig({...f.peer,secret:Buffer.alloc(32,48).toString('base64url')},{localTest:true});
  release.resolve();const response=await pending;assert.ok([401,403].includes(response.status));await response.text();
  assert.equal(f.count(),0);assert.equal(f.audit('site_identity.consented'),0);
});

test('signed but wrong-scope or expired ERP previews are rejected before showing a consent proof',async t=>{
  const f=await fixture(t),user=f.user(),challenge=f.challenge(),csrf=await f.csrf(user);
  for(const patch of [{companyId:'foreign-company'},{issuer:f.peer.issuer+'/'},{audience:'foreign-audience'},
    {trustFingerprint:'a'.repeat(64)},{id:randomUUID()},{challengeDigest:'b'.repeat(64)},
    {nonceDigest:'invalid'},{expiresAt:Date.now()-1},{expiresAt:Date.now()+310_000}]){
    f.override=patch;
    const response=await f.post('/auth/site-identity/preview',{challengeToken:challenge.token},user,csrf);
    assert.ok([400,403].includes(response.status),JSON.stringify(patch)+' status='+response.status);await response.text();
  }
  assert.equal(f.count(),0);
});

test('developer identity, retained staff grant and workspace emulation cannot enter the browser flow',async t=>{
  const f=await fixture(t),developer=f.user({email:'developer@example.test',role:'admin'}),staff=f.user({role:'admin'}),ordinary=f.user();
  f.db.prepare("INSERT INTO vps_staff_grants VALUES (?,?,'developer',0,?)").run(staff.id,staff.email,new Date().toISOString());
  for(const cookie of [developer.cookie,staff.cookie,ordinary.cookie+'; __Host-knaba-workspace=forged']){
    const response=await f.call('/auth/site-identity/session',{headers:{Cookie:cookie}});
    assert.ok([401,403].includes(response.status));await response.text();
  }
  assert.equal(f.count(),0);assert.equal(f.calls,0);
});

test('actual signed backchannel inspect/redeem is one-use, current-session checked and separate from browser CSRF',async t=>{
  const f=await fixture(t),{user,input}=await grant(f),path='/auth/site-identity/redeem';
  const bytes=Buffer.from(JSON.stringify(input)),signed=signRequest(f.peer,path,bytes);
  const bad=await f.call(path,{method:'POST',body:bytes,headers:{'content-type':'application/json',...proofHeaders(signed),'x-knaba-federation-signature':'A'.repeat(43)}});
  assert.equal(bad.status,403);await bad.text();assert.equal(f.audit('site_identity.redeemed'),0);
  const inspected=await peerRequest(f.peer,'site','/auth/site-identity/inspect',input);assert.equal(inspected.subject,user.id);
  assert.equal(f.audit('site_identity.redeemed'),0);
  const first=await peerRequest(f.peer,'site',path,input),second=await peerRequest(f.peer,'site',path,input);
  assert.equal(first.grantDigest,second.grantDigest);assert.equal(f.audit('site_identity.redeemed'),1);
  destroySession(f.db,user.cookie);
  await assert.rejects(peerRequest(f.peer,'site',path,input));assert.equal(f.audit('site_identity.redeemed'),1);
});

test('disabled configuration and invalid ERP response MAC fail closed without creating a grant',async t=>{
  const f=await fixture(t),user=f.user(),challenge=f.challenge(),csrf=await f.csrf(user);
  f.badSignature=true;
  let response=await f.post('/auth/site-identity/preview',{challengeToken:challenge.token},user,csrf);
  assert.equal(response.status,503);await response.text();assert.equal(f.count(),0);
  f.peer=parsePeerConfig({...f.peer,active:false},{localTest:true});
  response=await f.call('/auth/site-identity/session',{headers:{Cookie:user.cookie}});
  assert.equal(response.status,503);await response.text();
  assert.equal((await f.call('/account/erp/')).status,200,'neutral landing remains available');
});

test('the displayed confirmation deadline includes the configured authority expiry',async t=>{
  const f=await fixture(t),expiry=Date.now()+12_437;
  f.peer=parsePeerConfig({...f.peer,expiresAt:new Date(expiry).toISOString()},{localTest:true});
  const user=f.user(),challenge=f.challenge(),shown=await f.preview(user,challenge);
  assert.equal(shown.body.expiresAt,expiry);
  const response=await f.consent(user,challenge,shown);assert.equal(response.status,200);
  assert.equal((await response.json()).expiresAt,expiry);
});

test('production-mode VPS checks the exact configured site origin behind the synthetic TLS proxy',async t=>{
  const f=await fixture(t,{production:true}),user=f.user();
  assert.ok(await f.csrf(user));
  f.peer=parsePeerConfig({...f.peer,siteOrigin:'https://foreign.example'},{localTest:true});
  const response=await f.call('/auth/site-identity/session',{headers:{Cookie:user.cookie}});
  assert.equal(response.status,503);await response.text();assert.equal(f.count(),0);
});

test('VPS auth migration requires approval, preserves accounts and records a checked receipt',t=>{
  const directory=mkdtempSync(join(tmpdir(),'knaba-consent-upgrade-')),path=join(directory,'site.sqlite');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  let {db}=openLocalDatabase(path);
  db.prepare('INSERT INTO vps_users(id,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)').run('retained-user','retained@example.test','unused','unused',new Date().toISOString());
  const session=createSessionForUser(db,'retained-user');
  const prior=db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all();
  db.exec('DROP TABLE vps_site_identity_consents; DROP TABLE vps_auth_migrations;');db.close();
  const before=readFileSync(path);
  assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),/Pending VPS auth migration site-identity-consents/);
  assert.deepEqual(readFileSync(path),before);
  ({db}=openLocalDatabase(path));
  const receipt=db.prepare('SELECT * FROM vps_auth_migrations').all();assert.equal(receipt.length,1);
  assert.equal(receipt[0].sha256,digest(readFileSync(new URL('./site-identity-consents.sql',import.meta.url))));
  assert.deepEqual(db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all(),prior);
  assert.ok(db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(digest(session.token)));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
  ({db}=openLocalDatabase(path,{allowMigrations:false}));db.close();
});

test('a drifted auth receipt or missing immutable runtime guard is refused on reopen',t=>{
  const directory=mkdtempSync(join(tmpdir(),'knaba-consent-receipt-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  for(const mode of ['receipt','guard']){
    const path=join(directory,mode+'.sqlite'),{db}=openLocalDatabase(path);
    if(mode==='receipt')db.prepare('UPDATE vps_auth_migrations SET sha256=?').run('0'.repeat(64));
    else db.exec('DROP TRIGGER vps_site_identity_consents_update_guard');
    db.close();
    assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),mode==='receipt'?/checksum changed/:/Missing VPS site identity consent guard/);
  }
});
