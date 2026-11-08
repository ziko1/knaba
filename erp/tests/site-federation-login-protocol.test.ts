import {describe,it,expect} from 'vitest';
import {normalizeAuthority,makeFederationRequest,verifyFederationRequest} from '../packages/integrations/site-federation-protocol.mjs';
import {normalizeFederationLoginPolicy,normalizeSourceLoginPolicy,sourceLoginPolicyFingerprint,federationLoginPolicyFingerprint,parseFederationLoginAction,parseFederationLoginActionResult,parseFederationLoginIntrospection,parseFederationLoginIntrospectionResult,parseFederationLoginStart,parseFederationLoginToken,pkceS256,federationLoginRequestBinding} from '../packages/integrations/site-federation-login-protocol.mjs';

const authority=normalizeAuthority({authorityId:'site',companyId:'company',issuer:'https://site.example.test/identity',siteOrigin:'https://site.example.test',erpOrigin:'https://erp.example.test',erpAudience:'erp',siteAudience:'site',policyVersion:1,siteToErp:{kid:'s1',secret:Buffer.alloc(32,1).toString('base64url')},erpToSite:{kid:'e1',secret:Buffer.alloc(32,2).toString('base64url')}});
describe('federation login signed transport extension',()=>{
 for(const action of ['LOGIN_INSPECT','LOGIN_APPROVE','LOGIN_STATUS'] as const)it(`carries ${action} through the existing signed transport`,()=>{
  const request=makeFederationRequest(authority,'SITE_TO_ERP',action as any,{requestId:'11111111-1111-4111-8111-111111111111'},{generation:1});
  expect(verifyFederationRequest(authority,'SITE_TO_ERP',request.headers,request.body).envelope.action).toBe(action);
 });
 it('does not accept an unspecified login grant action',()=>{
  expect(()=>makeFederationRequest(authority,'SITE_TO_ERP','LOGIN_MINT_ANY_USER' as any,{userId:'other'},{generation:1})).toThrow();
 });
});

const context={erpOrigin:authority.erpOrigin,authorityIds:['site'],appMode:'PRODUCTION'};
const input={enabled:true,policyVersion:1,authorizationIssuer:authority.erpOrigin+'/auth/federation',authorityIds:['site'],clients:[{clientId:'web',kind:'WEB',platform:'WEB',label:'KNABA Web',returnPath:'/console'},{clientId:'android',kind:'NATIVE',platform:'ANDROID',label:'KNABA Android',redirectUri:'https://app.example.test/auth/android'}]};
const policy=normalizeFederationLoginPolicy(input,context)!;
const requestId='11111111-1111-4111-8111-111111111111',requestBinding='a'.repeat(64),now='2026-11-08T12:00:00.000Z';
const reference={subject:'immutable-site-user',sessionRef:'s'.repeat(43),epoch:1,securityFingerprint:'b'.repeat(64),sourcePolicyVersion:1};
const policies={loginPolicyVersion:1,loginPolicyFingerprint:federationLoginPolicyFingerprint(policy),sourceLoginPolicyFingerprint:sourceLoginPolicyFingerprint(normalizeSourceLoginPolicy({enabled:true,authorityIds:['site'],policyVersion:1},{authorityIds:['site']})!)};
describe('strict login protocol and policy',()=>{
 it('is default off without turning a malformed enabled policy into disabled',()=>{
  expect(normalizeFederationLoginPolicy(undefined,context)).toBeNull();expect(normalizeSourceLoginPolicy({enabled:false},{authorityIds:['site']})).toBeNull();
  expect(()=>normalizeFederationLoginPolicy({...input,clients:[]},context)).toThrow();
  expect(()=>normalizeSourceLoginPolicy({enabled:true,authorityIds:['foreign'],policyVersion:1},{authorityIds:['site']})).toThrow();
 });
 it('pins the ERP issuer separately from the source issuer',()=>{
  expect(()=>normalizeFederationLoginPolicy({...input,authorizationIssuer:authority.issuer},context)).toThrow();
  expect(policy.authorizationIssuer).toBe('https://erp.example.test/auth/federation');
 });
 it('rejects duplicate or unknown config fields, client kind overrides and unregistered redirects',()=>{
  expect(()=>normalizeFederationLoginPolicy({...input,clients:[input.clients[0],input.clients[0]]},context)).toThrow();
  expect(()=>normalizeFederationLoginPolicy({...input,role:'OWNER'},context)).toThrow();
  expect(()=>parseFederationLoginStart({authorityId:'site',clientId:'web',kind:'NATIVE'},policy)).toThrow();
  expect(()=>parseFederationLoginStart({authorityId:'site',clientId:'android',redirectUri:'https://app.example.test/auth/android/extra',state:'s'.repeat(43),codeChallenge:'c'.repeat(43),codeChallengeMethod:'S256'},policy)).toThrow();
 });
 it('allows a private-use URI only in the explicit TEST registry',()=>{
  const test={...input,clients:[{...input.clients[1],redirectUri:'de.knaba.android:/auth/callback'}]};
  expect(()=>normalizeFederationLoginPolicy(test,context)).toThrow();
  expect(normalizeFederationLoginPolicy(test,{...context,appMode:'TEST'})?.clients[0]).toMatchObject({redirectUri:'de.knaba.android:/auth/callback'});
 });
 it('keeps ERP/source fingerprint domains distinct and changes policy identity',()=>{
  expect(policies.loginPolicyFingerprint).not.toBe(policies.sourceLoginPolicyFingerprint);
  expect(federationLoginPolicyFingerprint(normalizeFederationLoginPolicy({...input,policyVersion:2},context)!)).not.toBe(policies.loginPolicyFingerprint);
  expect(Object.isFrozen(policy.clients[0])).toBe(true);
 });
 it('implements the RFC7636 S256 vector and refuses plain or short verifiers',()=>{
  expect(pkceS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  expect(()=>pkceS256('short')).toThrow();expect(()=>pkceS256('x'.repeat(42)+'é')).toThrow();
  expect(()=>parseFederationLoginStart({authorityId:'site',clientId:'android',redirectUri:input.clients[1].redirectUri,state:'s'.repeat(43),codeChallenge:'c'.repeat(43),codeChallengeMethod:'plain'},policy)).toThrow();
 });
 it('validates a login approval without accepting user, role or device grants',()=>{
  const approve={requestId,requestBinding,expectedVersion:2,...reference,...policies,reauthAt:now,sessionExpiresAt:'2026-11-08T20:00:00.000Z',siteLabel:'Site account'};
  expect(parseFederationLoginAction('LOGIN_APPROVE',approve)).toEqual(approve);
  for(const key of ['userId','companyId','role','deviceId','password'])expect(()=>parseFederationLoginAction('LOGIN_APPROVE',{...approve,[key]:'injected'})).toThrow();
  const {sourceLoginPolicyFingerprint:_,...missing}=approve;expect(()=>parseFederationLoginAction('LOGIN_APPROVE',missing)).toThrow();
  expect(()=>parseFederationLoginAction('LOGIN_APPROVE',{...approve,subject:'я'.repeat(65)})).toThrow();
 });
 it('separates issue/use exact session and policy references',()=>{
  const issue={purpose:'SESSION_ISSUE',requestId,requestBinding,...reference,...policies};
  expect(parseFederationLoginIntrospection(issue)).toEqual(issue);
  expect(()=>parseFederationLoginIntrospection({...issue,erpSessionId:requestId})).toThrow();
  expect(()=>parseFederationLoginIntrospection({...issue,purpose:'SESSION_USE'})).toThrow();
  expect(parseFederationLoginIntrospection({...issue,purpose:'SESSION_USE',erpSessionId:requestId})).toMatchObject({purpose:'SESSION_USE',erpSessionId:requestId});
 });
 it('rejects unbounded or malformed freshness and private inactive fields',()=>{
  const active={active:true,purpose:'SESSION_USE',requestId,requestBinding,erpSessionId:requestId,...reference,...policies,generation:1,checkedAt:now,validUntil:'2026-11-08T12:00:10.000Z',sessionExpiresAt:'2026-11-08T20:00:00.000Z',reauthAt:now};
  expect(parseFederationLoginIntrospectionResult(active)).toEqual(active);
  expect(()=>parseFederationLoginIntrospectionResult({...active,validUntil:'2026-11-08T12:00:10.001Z'})).toThrow();
  expect(()=>parseFederationLoginIntrospectionResult({...active,checkedAt:'2026-02-31T00:00:00.000Z'})).toThrow();
  expect(()=>parseFederationLoginIntrospectionResult({active:false,subject:'enumerated'})).toThrow();
 });
 it('does not accept source identity fields in the native redemption input',()=>{
  const token={grantType:'authorization_code',clientId:'android',redirectUri:input.clients[1].redirectUri,code:'K3C.'+'c'.repeat(43),codeVerifier:'v'.repeat(43)};
  expect(parseFederationLoginToken(token)).toEqual(token);
  expect(()=>parseFederationLoginToken({...token,subject:'other'})).toThrow();
  expect(()=>parseFederationLoginToken({...token,code:'KF3.'+'c'.repeat(43)})).toThrow();
 });
 it('binds company, platform, PKCE and public state hash into request identity',()=>{
  const tuple={companyId:'company',authorityId:'site',requestId,clientId:'android',kind:'NATIVE' as const,platform:'ANDROID' as const,redirectUri:'https://app.example.test/auth/android',codeChallenge:'c'.repeat(43),stateHash:'d'.repeat(64),expiresAt:'2026-11-08T12:05:00.000Z',loginPolicyFingerprint:policies.loginPolicyFingerprint};
  const hash=federationLoginRequestBinding(tuple);
  for(const changed of [{companyId:'other'},{platform:'IOS' as const},{codeChallenge:'b'.repeat(43)},{stateHash:'e'.repeat(64)}])expect(federationLoginRequestBinding({...tuple,...changed})).not.toBe(hash);
 });
 it('requires both policy identity and safe non-PII action result schema',()=>{
  const inspect={requestId,requestBinding,version:2,expiresAt:'2026-11-08T12:05:00.000Z',companyLabel:'Company',client:{clientId:'android',kind:'NATIVE',platform:'ANDROID',label:'KNABA Android'},returnUrl:'https://erp.example.test/auth/federation/return?request_id='+requestId,loginPolicyVersion:1,loginPolicyFingerprint:policies.loginPolicyFingerprint};
  expect(parseFederationLoginActionResult('LOGIN_INSPECT',inspect)).toEqual(inspect);
  expect(()=>parseFederationLoginActionResult('LOGIN_INSPECT',{...inspect,email:'private@example.test'})).toThrow();
 });
});
