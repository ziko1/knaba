import { describe, expect, it } from 'vitest';
import { TrustedSiteAuthorities } from '../apps/api/site-identity-bindings.ts';

const now = new Date('2026-11-08T12:00:00.000Z');
const rule = { companyId: 'company-a', issuer: 'https://identity.example.test/site-v1', audience: 'knaba-erp', identityNamespace: 'site-user-id-v1', version: 1, active: true };
const identity = { issuer: rule.issuer, audience: rule.audience, subject: 'SiteUser-A' };

describe('server-owned site identity trust configuration', () => {
  it('denies by default without silently deriving trust from the caller', () => {
    expect(() => new TrustedSiteAuthorities().require('company-a',identity,now)).toThrow('ACCESS_DENIED');
  });
  it('binds exact company, issuer and audience and preserves case-sensitive subjects', () => {
    const registry = new TrustedSiteAuthorities([rule]);
    expect(registry.require('company-a',identity,now).companyId).toBe('company-a');
    for (const [company,p] of [['company-b',identity],['company-a',{...identity,issuer:rule.issuer+'/'}],['company-a',{...identity,audience:'different'}]] as const) {
      expect(() => registry.require(company,p,now)).toThrow('ACCESS_DENIED');
    }
    expect(registry.require('company-a',{...identity,subject:'siteuser-a'},now).fingerprint).toBe(registry.require('company-a',identity,now).fingerprint);
    // Trust applies to a namespace, not an implicit alias between its subjects.
  });
  it('copies configuration so caller mutations cannot grant trust or change its fingerprint', () => {
    const mutable = {...rule}; const registry = new TrustedSiteAuthorities([mutable]);
    const before = registry.require('company-a',identity,now); mutable.active=false; mutable.issuer='https://attacker.example.test';
    expect(Object.isFrozen(before)).toBe(true);
    expect(registry.require('company-a',identity,now)).toEqual(before);
    expect(() => registry.require('company-a',{...identity,issuer:mutable.issuer},now)).toThrow('ACCESS_DENIED');
  });
  it('has deterministic fingerprints independent of object field order', () => {
    const reverse = Object.fromEntries(Object.entries(rule).reverse());
    expect(new TrustedSiteAuthorities([reverse]).require('company-a',identity,now).fingerprint).toBe(new TrustedSiteAuthorities([rule]).require('company-a',identity,now).fingerprint);
  });
  it('changes the fingerprint for each security-relevant change', () => {
    const original = new TrustedSiteAuthorities([rule]).require('company-a',identity,now).fingerprint;
    for (const patch of [{version:2},{expiresAt:'2026-11-09T00:00:00.000Z'},{audience:'new-audience'},{issuer:'https://identity.example.test/site-v2'},{companyId:'company-b'}]) {
      const changed={...rule,...patch};
      expect(new TrustedSiteAuthorities([changed]).require(changed.companyId,{...identity,issuer:changed.issuer,audience:changed.audience},now).fingerprint).not.toBe(original);
    }
  });
  it.each([{active:false},{expiresAt:'2026-11-08T12:00:00.000Z'},{expiresAt:'2026-11-08T11:59:59.999Z'}])('denies disabled and expired trust: %j', patch => {
    expect(() => new TrustedSiteAuthorities([{...rule,...patch}]).require('company-a',identity,now)).toThrow('ACCESS_DENIED');
  });
  it.each([
    {issuer:'http://identity.example.test'}, {issuer:'https://user:password@identity.example.test'},
    {issuer:'https://identity.example.test?tenant=a'}, {issuer:'https://identity.example.test#identity'},
    {issuer:'https://identity.example.test\n'}, {issuer:'https://identity.example.test/'+'a'.repeat(513)},
    {version:0}, {version:1.5}, {version:2_147_483_648}, {active:'true'},
    {identityNamespace:'provider-email'}, {expiresAt:'2026-11-08'}, {expiresAt:'2026-02-30T00:00:00.000Z'},
    {fingerprint:'caller-selected'}, {companyId:''}, {audience:'ü'.repeat(129)},
  ])('rejects malformed or client-selected authority fields: %j', patch => {
    expect(() => new TrustedSiteAuthorities([{...rule,...patch}])).toThrow('VALIDATION_ERROR');
  });
  it('rejects duplicate mappings, including a disabled shadow entry', () => {
    expect(() => new TrustedSiteAuthorities([rule,{...rule,active:false}])).toThrow('VALIDATION_ERROR');
  });
  it('rejects extra company/email/proof fields in a principal', () => {
    const registry = new TrustedSiteAuthorities([rule]);
    for (const extra of [{companyId:'company-b'},{email:'same@example.test'},{fingerprint:'fake'},{subject:'x'.repeat(257)}]) {
      expect(() => registry.require('company-a',{...identity,...extra},now)).toThrow('VALIDATION_ERROR');
    }
  });
  it('rejects invalid server clock input', () => {
    expect(() => new TrustedSiteAuthorities([rule]).require('company-a',identity,new Date('invalid'))).toThrow('ACCESS_DENIED');
  });
});
