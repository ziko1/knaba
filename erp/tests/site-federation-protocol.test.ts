import {createHash,createHmac,randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {canonicalJson,FEDERATION_MAX_BYTES,isVerifiedFederationRequest,makeFederationRequest,makeFederationResponse,normalizeAuthority,securityFingerprint,sendFederation,sessionReference,verifyFederationRequest,verifyFederationResponse} from '../packages/integrations/site-federation-protocol.mjs';

const now=Date.parse('2026-11-08T12:00:00.000Z');
const authority=()=>normalizeAuthority({authorityId:'synthetic-vps',companyId:'company-a',issuer:'https://site.invalid/identity',siteOrigin:'https://site.invalid',erpOrigin:'https://erp.invalid',erpAudience:'knaba-erp-a',siteAudience:'knaba-site-a',policyVersion:1,siteToErp:{kid:'site1',secret:Buffer.alloc(32,1).toString('base64url')},erpToSite:{kid:'erp1',secret:Buffer.alloc(32,2).toString('base64url')}});
const request=()=>makeFederationRequest(authority(),'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},{generation:0,now});
afterEach(()=>{vi.useRealTimers();});
describe('dedicated federation transport authentication',()=>{
  it('verifies signed canonical bytes and brands only the verified immutable request',()=>{
    const wire=request(),verified=verifyFederationRequest(authority(),'SITE_TO_ERP',wire.headers,wire.body,now);
    expect(isVerifiedFederationRequest(verified)).toBe(true);expect(isVerifiedFederationRequest({...verified})).toBe(false);expect(Object.isFrozen(verified.envelope.payload)).toBe(true);
    expect(verified.envelope.action).toBe('BOOTSTRAP_AUTHORITY');expect(JSON.stringify(verified)).not.toContain(authority().siteToErp.secret);
  });
  it.each(['body','issuer','company','audience','key','generation','nonce','direction'] as const)('denies substituted %s before dispatch',field=>{
    const config=authority(),wire=request();let body=wire.body,headers={...wire.headers},other={...config};
    if(field==='body')body=Buffer.from(wire.body.toString().replace('BOOTSTRAP_AUTHORITY','ACTIVATE_AUTHORITY'));
    if(field==='issuer')other={...other,issuer:'https://site.invalid/other'};
    if(field==='company')other={...other,companyId:'company-b'};
    if(field==='audience')other={...other,erpAudience:'other'};
    if(field==='key')headers['x-knaba-federation-key']='erp1';
    if(field==='generation')headers['x-knaba-federation-generation']='1';
    if(field==='nonce')headers['x-knaba-federation-nonce']='a'.repeat(43);
    expect(()=>verifyFederationRequest(other,field==='direction'?'ERP_TO_SITE':'SITE_TO_ERP',headers,body,now)).toThrow('FEDERATION_AUTH_FAILED');
  });
  it.each([-60_001,5_001])('rejects stale or future request timestamp %s ms',offset=>{
    const wire=makeFederationRequest(authority(),'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()},{generation:0,now:now+offset});
    expect(()=>verifyFederationRequest(authority(),'SITE_TO_ERP',wire.headers,wire.body,now)).toThrow('FEDERATION_AUTH_FAILED');
  });
  it('keeps the stable operation digest while each retry has a fresh transport nonce and generation',()=>{
    const operationId=randomUUID(),payload={subject:'site-user',scope:'SESSION',sessionRefs:['a'.repeat(43)],intentHash:'a'.repeat(64)};
    const one=makeFederationRequest(authority(),'SITE_TO_ERP','FENCE',payload,{operationId,generation:1,now});
    const two=makeFederationRequest(authority(),'SITE_TO_ERP','FENCE',payload,{operationId,generation:2,now:now+1});
    const first=verifyFederationRequest(authority(),'SITE_TO_ERP',one.headers,one.body,now),second=verifyFederationRequest(authority(),'SITE_TO_ERP',two.headers,two.body,now+1);
    expect(second.operationDigest).toBe(first.operationDigest);expect(second.nonceHash).not.toBe(first.nonceHash);
  });
  it('binds signed responses to the exact request nonce, generation, status and opposite direction key',()=>{
    const config=authority(),wire=request(),verified=verifyFederationRequest(config,'SITE_TO_ERP',wire.headers,wire.body,now);
    const response=makeFederationResponse(config,verified,{receipt:{generation:1},current:{generation:2,phase:'RECONCILING'}},200,now);
    expect(verifyFederationResponse(config,wire.context,200,response.headers,response.body,now)).toMatchObject({current:{generation:2}});
    for(const context of [{...wire.context,nonce:'a'.repeat(43)},{...wire.context,generation:1}])expect(()=>verifyFederationResponse(config,context,200,response.headers,response.body,now)).toThrow('FEDERATION_AUTH_FAILED');
    expect(()=>verifyFederationResponse(config,wire.context,409,response.headers,response.body,now)).toThrow('FEDERATION_AUTH_FAILED');
    expect(()=>makeFederationResponse(config,{...verified},{ok:true})).toThrow('FEDERATION_AUTH_FAILED');
  });
  it('bounds raw request and response bytes before hashing or JSON parsing',()=>{
    const wire=request();for(const body of [Buffer.alloc(0),Buffer.alloc(FEDERATION_MAX_BYTES+1),'{bad-json' as unknown as Buffer]){
      expect(()=>verifyFederationRequest(authority(),'SITE_TO_ERP',wire.headers,body,now)).toThrow('FEDERATION_AUTH_FAILED');
      expect(()=>verifyFederationResponse(authority(),wire.context,200,wire.headers,body,now)).toThrow('FEDERATION_AUTH_FAILED');
    }
  });
  it('rejects ambiguous signed noncanonical JSON even with a valid MAC',()=>{
    const config=authority(),wire=request(),body=Buffer.from(' '+wire.body.toString());
    const frame=['KNABA-FEDERATION-REQUEST-v1',config.authorityId,config.companyId,config.issuer,config.erpAudience,config.siteToErp.kid,'0',String(now),wire.context.nonce,'POST','/api/v1/federation/authority',createHash('sha256').update(body).digest('hex')].join('\n');
    const headers={...wire.headers,'x-knaba-federation-signature':createHmac('sha256',Buffer.from(config.siteToErp.secret,'base64url')).update(frame).digest('hex')};
    expect(()=>verifyFederationRequest(config,'SITE_TO_ERP',headers,body,now)).toThrow('FEDERATION_INVALID');
  });
  it('rejects insecure or ambiguous enabled authority configuration',()=>{
    const config=authority();for(const value of [{...config,authorityId:undefined},{...config,erpToSite:config.siteToErp},{...config,siteOrigin:'http://site.invalid'},{...config,erpOrigin:'https://erp.invalid/'},{...config,unexpected:true}])expect(()=>normalizeAuthority(value)).toThrow();
    expect(()=>makeFederationRequest(config,'SITE_TO_ERP','BOOTSTRAP_AUTHORITY',{}, {generation:0,now:NaN})).toThrow();
    expect(()=>canonicalJson({x:undefined})).toThrow();
  });
});

describe('bounded online source authority transport',()=>{
 it('posts only to the configured exact endpoint and verifies the signed response for this nonce',async()=>{
  const config=authority();let called=0;
  const result=await sendFederation(config,'ERP_TO_SITE','INTROSPECT',{subject:'immutable-source-user'},{generation:1,fetchImpl:async(url,init)=>{
   called++;expect(String(url)).toBe('https://site.invalid/api/federation/introspect');expect(init?.method).toBe('POST');expect(init?.redirect).toBe('manual');
   const verified=verifyFederationRequest(config,'ERP_TO_SITE',init!.headers as Record<string,string>,init!.body as Buffer),reply=makeFederationResponse(config,verified,{active:false});return new Response(reply.body,{status:reply.status,headers:reply.headers});
  }});
  expect(called).toBe(1);expect(result.result).toEqual({active:false});
 });
 it('does not follow a redirect or send an authority credential to a different origin',async()=>{
  let called=0;await expect(sendFederation(authority(),'ERP_TO_SITE','INTROSPECT',{subject:'source'},{generation:1,fetchImpl:async()=>{called++;return new Response(null,{status:307,headers:{location:'https://untrusted.invalid/receive'}});}})).rejects.toThrow('FEDERATION_UNAVAILABLE');expect(called).toBe(1);
 });
 it('bounds the response stream before verification and parsing',async()=>{
  await expect(sendFederation(authority(),'ERP_TO_SITE','INTROSPECT',{subject:'source'},{generation:1,fetchImpl:async()=>new Response(new Uint8Array(FEDERATION_MAX_BYTES+1),{status:200})})).rejects.toThrow('FEDERATION_UNAVAILABLE');
 });
 it('aborts an unavailable online check after its three-second budget',async()=>{
  vi.useFakeTimers();let aborted=false;
  const pending=sendFederation(authority(),'ERP_TO_SITE','INTROSPECT',{subject:'source'},{generation:1,fetchImpl:async(_url,init)=>new Promise<Response>((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>{aborted=true;reject(new Error('Synthetic transport aborted'));},{once:true});})});
  const failure=expect(pending).rejects.toThrow('FEDERATION_UNAVAILABLE');await vi.advanceTimersByTimeAsync(3000);await failure;expect(aborted).toBe(true);
 });
});

describe('immutable source identity canon',()=>{
  it('pins the deterministic session reference across restore while isolating issuer and subject',()=>{
    const hash='a'.repeat(64),ref=sessionReference('https://site.invalid/identity','user-a',hash);
    expect(ref).toHaveLength(43);expect(sessionReference('https://site.invalid/identity','user-a',hash)).toBe(ref);
    expect(sessionReference('https://site.invalid/identity','user-b',hash)).not.toBe(ref);expect(sessionReference('https://other.invalid/identity','user-a',hash)).not.toBe(ref);expect(ref).not.toContain(hash);
  });
  it('sorts source OIDC identities deterministically without including display-name versions',()=>{
    const snapshot={v:1,issuer:'https://site.invalid/identity',subject:'user-a',policyVersion:1,credential:{salt:'salt',passwordHash:'verifier',disabled:false},email:'a@example.invalid',profile:{id:'user-a',email:'a@example.invalid',role:'user',status:'approved'},staffGrant:null,ownerPolicy:{ownerUserId:'owner-a',ownerEmail:'owner@example.invalid',developerEmail:''},oidcLinks:[{issuer:'https://z.invalid',subject:'b',userId:'user-a'},{issuer:'https://a.invalid',subject:'a',userId:'user-a'}]};
    const fingerprint=securityFingerprint(snapshot);expect(securityFingerprint({...snapshot,oidcLinks:[...snapshot.oidcLinks].reverse()})).toBe(fingerprint);
    expect(securityFingerprint({...snapshot,credential:{...snapshot.credential,disabled:true}})).not.toBe(fingerprint);expect(()=>securityFingerprint({...snapshot,displayName:'Name'})).toThrow();
  });
});
