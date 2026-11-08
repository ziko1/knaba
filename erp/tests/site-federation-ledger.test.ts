import {describe,expect,it} from 'vitest';
import {activateSourceEpoch,assertCurrentSourceSession,fenceSchema,fenceSourcePrincipal,fenceSourceSession,registerSourceSession,sourceSessionSchema,type SourceSession} from '../packages/domain/site-federation-ledger.ts';

const now='2026-11-08T12:00:00.000Z',fingerprint='a'.repeat(64),nextFingerprint='b'.repeat(64),operationId='c2e08586-eada-44de-b46c-5e807c4bf096';
const source:SourceSession={subject:'immutable-site-user',sessionRef:'x'.repeat(43),epoch:1,securityFingerprint:fingerprint,sessionExpiresAt:'2026-11-08T13:00:00.000Z',sourcePolicyVersion:1};
const initial=()=>registerSourceSession(undefined,undefined,source,1,now);
describe('authoritative source epoch/session transitions',()=>{
  it('registers an exact epoch1 identity and current session without granting an ERP identity',()=>{
    const state=initial();expect(state.principal).toMatchObject({epoch:1,minimumEpoch:1,state:'ACTIVE'});expect(()=>assertCurrentSourceSession(state.principal,state.session,source,1,now)).not.toThrow();expect(state).not.toHaveProperty('userId');
  });
  it('keeps an unknown-session tombstone terminal across delayed initial registration',()=>{
    const tombstone=fenceSourceSession(undefined,source.subject,source.sessionRef);expect(tombstone).toMatchObject({state:'REVOKED',epoch:null});
    expect(()=>registerSourceSession(undefined,tombstone,source,1,now)).toThrow();expect(fenceSourceSession(tombstone,source.subject,source.sessionRef)).toBe(tombstone);
  });
  it('fences a still-valid fresh check before its serving transaction',()=>{
    const original=initial();assertCurrentSourceSession(original.principal,original.session,source,1,now);
    const fenced=fenceSourcePrincipal(original.principal,{subject:source.subject,scope:'PRINCIPAL',throughEpoch:1,nextEpoch:2,intentHash:fingerprint},operationId,1);
    expect(()=>assertCurrentSourceSession(fenced,original.session,source,1,now)).toThrow();expect(fenced).toMatchObject({state:'FENCED',epoch:1,minimumEpoch:2});
    expect(()=>registerSourceSession(fenced,undefined,{...source,epoch:2,sessionRef:'y'.repeat(43)},1,now)).toThrow();
  });
  it('requires the exact source post-commit activation fence and cannot resurrect old sessions',()=>{
    const original=initial(),fenced=fenceSourcePrincipal(original.principal,{subject:source.subject,scope:'PRINCIPAL',throughEpoch:1,nextEpoch:2,intentHash:fingerprint},operationId,1);
    const input={subject:source.subject,epoch:2,securityFingerprint:nextFingerprint,fenceOperationId:operationId,sourcePolicyVersion:1};
    expect(()=>activateSourceEpoch(fenced,{...input,fenceOperationId:'a5f355cd-519a-4d9f-bf1f-b123af53d1bc'},1)).toThrow();
    const activated=activateSourceEpoch(fenced,input,1);expect(activated).toMatchObject({state:'ACTIVE',epoch:2,securityFingerprint:nextFingerprint});
    expect(()=>assertCurrentSourceSession(activated,original.session,source,1,now)).toThrow();expect(()=>registerSourceSession(activated,original.session,{...source,epoch:2,securityFingerprint:nextFingerprint},1,now)).toThrow();
    expect(registerSourceSession(activated,undefined,{...source,epoch:2,securityFingerprint:nextFingerprint,sessionRef:'z'.repeat(43)},1,now).session.state).toBe('ACTIVE');
  });
  it('retains a higher fence when old events or activation arrive late',()=>{
    const first=fenceSourcePrincipal(undefined,{subject:source.subject,scope:'PRINCIPAL',throughEpoch:4,nextEpoch:5,intentHash:fingerprint},operationId,1);
    expect(fenceSourcePrincipal(first,{subject:source.subject,scope:'PRINCIPAL',throughEpoch:1,nextEpoch:2,intentHash:fingerprint},'old',1)).toBe(first);
    expect(()=>activateSourceEpoch(first,{subject:source.subject,epoch:2,securityFingerprint:fingerprint,fenceOperationId:operationId,sourcePolicyVersion:1},1)).toThrow();
  });
  it.each(['subject','epoch','fingerprint','expiry','policy'] as const)('denies stale or substituted %s',change=>{
    const state=initial(),altered={...source,...change==='subject'?{subject:'another-user'}:change==='epoch'?{epoch:2}:change==='fingerprint'?{securityFingerprint:nextFingerprint}:change==='policy'?{sourcePolicyVersion:2}:{}};
    expect(()=>assertCurrentSourceSession(state.principal,state.session,altered,1,change==='expiry'?source.sessionExpiresAt:now)).toThrow();
  });
  it('never extends an existing session expiry or retargets its subject',()=>{
    const state=initial();expect(()=>registerSourceSession(state.principal,state.session,{...source,sessionExpiresAt:'2026-11-08T14:00:00.000Z'},1,now)).toThrow();
    expect(()=>fenceSourceSession(state.session,'another-user',source.sessionRef)).toThrow();
  });
  it('does not admit unknown fields, duplicate refs or an epoch jump',()=>{
    expect(()=>sourceSessionSchema.parse({...source,roles:['OWNER']})).toThrow();expect(()=>fenceSchema.parse({subject:source.subject,scope:'SESSION',sessionRefs:[source.sessionRef,source.sessionRef],intentHash:fingerprint})).toThrow();
    expect(()=>fenceSchema.parse({subject:source.subject,scope:'PRINCIPAL',throughEpoch:1,nextEpoch:3,intentHash:fingerprint})).toThrow();
  });
});
