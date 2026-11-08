import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {
  FederationError,parsePeerConfig,parseSessionAuthorityEnabled,peerRequest,proofHeaders,readProof,signRequest,verifyRequest,signResponse
} from './site-identity-protocol.mjs';

const erpPath='/api/v1/auth/site-links/inspect-challenge',sitePath='/auth/site-identity/inspect';
const introspectionPath='/auth/site-identity/introspect-session';
const settings={companyId:'synthetic-company',issuer:'https://synthetic-site.example/identity',audience:'synthetic-erp',
  version:1,active:true,keyId:'knaba-federation-http-test',secret:Buffer.alloc(32,37).toString('base64url')};
const rejected=promise=>assert.rejects(promise,error=>error instanceof FederationError);
async function listen(t,handler){
  const server=createServer((req,res)=>{Promise.resolve(handler(req,res)).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return 'http://127.0.0.1:'+server.address().port;
}
async function fixture(t){
  const state={calls:0,requests:[],mode:'normal',previousSignature:null};
  const origin=await listen(t,async(req,res)=>{
    state.calls++;
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const bytes=Buffer.concat(chunks);let proof;
    try{proof=verifyRequest(state.peer,req.url,bytes,readProof(req.headers));}
    catch{res.writeHead(403);res.end('Denied');return;}
    state.requests.push({path:req.url,bytes,proof});
    if(state.mode==='timeout-headers')return;
    if(state.mode==='timeout-body'){res.writeHead(200,{'content-type':'application/json'});res.write('{');return;}
    if(state.mode==='redirect'){res.writeHead(302,{Location:state.redirect});res.end();return;}
    const returned=Buffer.from(state.mode==='oversized'?'x'.repeat(8193):JSON.stringify({ok:true,input:JSON.parse(bytes)}));
    let signature=signResponse(state.peer,req.url,returned,proof);
    if(state.mode==='wrong-key')signature=signResponse({...state.peer,secret:Buffer.alloc(32,38).toString('base64url')},req.url,returned,proof);
    if(state.mode==='wrong-path')signature=signResponse(state.peer,req.url===erpPath?sitePath:erpPath,returned,proof);
    if(state.mode==='request-direction')signature=proof.signature;
    if(state.mode==='replayed-response')signature=state.previousSignature;
    if(state.mode==='wrong-status')signature=signResponse(state.peer,req.url,returned,proof,201);
    state.previousSignature=signature;
    res.writeHead(200,{'content-type':'application/json',...(state.mode==='missing-signature'?{}:{'x-knaba-federation-response':signature})});
    res.end(state.mode==='changed-body'?Buffer.from('{"ok":false}'):returned);
  });
  state.peer=parsePeerConfig({...settings,erpOrigin:origin,siteOrigin:'http://127.0.0.1:1'},{localTest:true});
  state.origin=origin;
  return state;
}

test('actual loopback request/response binds exact bytes and issues a fresh request nonce',async t=>{
  const f=await fixture(t),body={challengeToken:'synthetic-protocol-value'};
  assert.deepEqual(await peerRequest(f.peer,'erp',erpPath,body),{ok:true,input:body});
  assert.deepEqual(await peerRequest(f.peer,'erp',erpPath,body),{ok:true,input:body});
  assert.equal(f.requests.length,2);assert.notEqual(f.requests[0].proof.nonce,f.requests[1].proof.nonce);
  assert.equal(f.requests[0].bytes.toString(),JSON.stringify(body));assert.equal(f.requests[0].path,erpPath);
});

test('session authority requires its own exact explicit operator flag',()=>{
  for(const value of [undefined,null,'','false'])assert.equal(parseSessionAuthorityEnabled(value),false);
  assert.equal(parseSessionAuthorityEnabled('true'),true);
  for(const value of [true,false,0,1,'TRUE','False',' true','false ','1','0',{},[]]){
    assert.throws(()=>parseSessionAuthorityEnabled(value),error=>error instanceof FederationError&&error.code==='MISSING_CONFIGURATION');
  }
});

test('introspection uses a distinct signed path and a fresh response nonce on actual loopback HTTP',async t=>{
  const f=await fixture(t),body={sessionDigest:'a'.repeat(64)};
  f.peer=parsePeerConfig({...f.peer,siteOrigin:f.origin,erpOrigin:'http://127.0.0.1:1'},{localTest:true});
  assert.deepEqual(await peerRequest(f.peer,'site',introspectionPath,body),{ok:true,input:body});
  f.mode='replayed-response';await rejected(peerRequest(f.peer,'site',introspectionPath,body));
  assert.notEqual(f.requests[0].proof.nonce,f.requests[1].proof.nonce);
  const bytes=Buffer.from(JSON.stringify(body));
  const wrongPathProof=signRequest(f.peer,sitePath,bytes);
  const wrongPath=await fetch(f.origin+introspectionPath,{method:'POST',headers:{'content-type':'application/json',...proofHeaders(wrongPathProof)},body:bytes});
  assert.equal(wrongPath.status,403);await wrongPath.text();
  const old=signRequest(f.peer,introspectionPath,bytes,Date.now()-60_000);
  const stale=await fetch(f.origin+introspectionPath,{method:'POST',headers:{'content-type':'application/json',...proofHeaders(old)},body:bytes});
  assert.equal(stale.status,403);await stale.text();
});

test('actual HTTP peer rejects wrong body/path/MAC/config and expired signed requests',async t=>{
  const f=await fixture(t),bytes=Buffer.from('{"id":"synthetic"}');
  const send=async(peer,{path=erpPath,body=bytes,now=Date.now(),headers={}}={})=>{
    const proof=signRequest(peer,erpPath,bytes,now);
    const response=await fetch(f.origin+path,{method:'POST',headers:{'content-type':'application/json',...proofHeaders(proof),...headers},body});
    await response.text();return response.status;
  };
  assert.equal(await send(f.peer,{body:Buffer.from('{"id":"substituted"}')}),403);
  assert.equal(await send(f.peer,{path:sitePath}),403);
  assert.equal(await send(f.peer,{headers:{'x-knaba-federation-signature':'A'.repeat(43)}}),403);
  for(const patch of [{companyId:'foreign-company'},{issuer:'https://other.example/identity'},{audience:'other-audience'},
    {version:2},{keyId:'knaba-federation-other'},{secret:Buffer.alloc(32,39).toString('base64url')},
    {siteOrigin:'http://127.0.0.1:2'},{ownerUserId:'different-owner'}]){
    const other=parsePeerConfig({...f.peer,...patch},{localTest:true});assert.equal(await send(other),403);
  }
  assert.equal(await send(f.peer,{now:Date.now()-60_000}),403);
  assert.equal(await send(f.peer,{now:Date.now()+60_000}),403);
  assert.equal(f.requests.length,0);
});

test('actual HTTP client rejects altered or reflected response authentication and old request receipts',async t=>{
  const f=await fixture(t);
  await peerRequest(f.peer,'erp',erpPath,{id:'same-body'});
  f.mode='replayed-response';await rejected(peerRequest(f.peer,'erp',erpPath,{id:'same-body'}));
  for(const mode of ['wrong-key','wrong-path','request-direction','wrong-status','changed-body','missing-signature']){
    f.mode=mode;await rejected(peerRequest(f.peer,'erp',erpPath,{id:'same-body'}));
  }
});

test('redirects never forward a signed request to another actual HTTP server',async t=>{
  let forwarded=0;
  const other=await listen(t,(_req,res)=>{forwarded++;res.end('{}');});
  const f=await fixture(t);f.mode='redirect';f.redirect=other+erpPath;
  await rejected(peerRequest(f.peer,'erp',erpPath,{id:'synthetic'}));
  assert.equal(forwarded,0);assert.equal(f.calls,1);
});

test('request/path/timeout budgets reject before sending, and oversized actual responses are bounded',async t=>{
  const f=await fixture(t);
  await rejected(peerRequest(f.peer,'erp',sitePath,{}));
  await rejected(peerRequest(f.peer,'erp',erpPath,{body:'x'.repeat(8192)}));
  await rejected(peerRequest(f.peer,'erp',erpPath,{},{timeoutMs:99}));
  await rejected(peerRequest(f.peer,'erp',erpPath,{},{timeoutMs:3001}));
  assert.equal(f.calls,0);
  f.mode='oversized';await rejected(peerRequest(f.peer,'erp',erpPath,{id:'synthetic'}));
  assert.equal(f.calls,1);
});

for(const mode of ['timeout-headers','timeout-body'])test(`actual network deadline aborts ${mode}`,{timeout:4000},async t=>{
  const f=await fixture(t);f.mode=mode;
  await rejected(peerRequest(f.peer,'erp',erpPath,{id:'synthetic'},{timeoutMs:100}));
  assert.equal(f.calls,1);
});

test('configuration is disabled by default; production origins and independent identity keys are explicit',()=>{
  assert.equal(parsePeerConfig(undefined),null);
  const production={...settings,erpOrigin:'https://erp.example',siteOrigin:'https://site.example'};
  assert.ok(parsePeerConfig(production));
  for(const patch of [{erpOrigin:'http://erp.example'},{siteOrigin:'https://site.example/path'},
    {erpOrigin:production.siteOrigin},{secret:'legacy-intake-secret'},{keyId:'intake-key'}]){
    assert.throws(()=>parsePeerConfig({...production,...patch}),FederationError);
  }
  assert.throws(()=>parsePeerConfig({...production,siteOrigin:'http://127.0.0.1:1234'}),FederationError);
  assert.ok(parsePeerConfig({...production,siteOrigin:'http://127.0.0.1:1234'},{localTest:true}));
  for(const patch of [{active:false},{expiresAt:new Date(Date.now()-1000).toISOString()}]){
    assert.throws(()=>signRequest(parsePeerConfig({...production,...patch}),erpPath,'{}'),FederationError);
  }
});
