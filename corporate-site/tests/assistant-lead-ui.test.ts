import {describe,expect,it} from 'vitest';
import type {ErpLeadView} from '../src/lib/assistant-erp-contract';
import {leadActions,leadCopy} from '../src/lib/assistant-lead-ui';
const now=1_800_000_000_000;
const draft:ErpLeadView={state:'DRAFT',version:1,previewHash:'a'.repeat(64),expiresAt:now+10_000,updatedAt:now,cancelRequested:false,preview:{name:'Test',email:'test@example.invalid',phone:'',serviceId:'service-1',condition:'',desiredPeriod:''}};

describe('customer lead actions',()=>{
  it('requires a current preview and removes confirmation exactly at expiry',()=>{
    expect(leadActions(null,now).confirm).toBe(false);
    expect(leadActions(draft,now).confirm).toBe(true);
    expect(leadActions(draft,draft.expiresAt)).toEqual({edit:true,confirm:false,cancel:true,expired:true});
  });
  it('does not let pending, accepted or uncertain results be edited or confirmed again',()=>{
    for(const state of ['QUEUED','SENDING','RETRY','APPLIED','QUARANTINED','BLOCKED','UNKNOWN'] as const){
      const actions=leadActions({...draft,state},now);
      expect(actions.edit,state).toBe(false);
      expect(actions.confirm,state).toBe(false);
    }
    expect(leadActions({...draft,state:'UNKNOWN'},now).cancel).toBe(false);
    expect(leadActions({...draft,state:'APPLIED'},now).cancel).toBe(false);
  });
  it('does not present a second cancellation or confirmation after revocation',()=>{
    expect(leadActions({...draft,cancelRequested:true},now).confirm).toBe(false);
    expect(leadActions({...draft,state:'SENDING',cancelRequested:true},now).cancel).toBe(false);
    expect(leadActions({...draft,state:'CANCELLED'},now).edit).toBe(true);
  });
  it('has distinct uncertainty, withdrawal and acceptance copy in each supported locale',()=>{
    for(const locale of ['de','en','uk','ru'] as const){
      const t=leadCopy[locale];
      expect(t.states.UNKNOWN).not.toBe(t.states.CANCELLED);
      expect(t.states.APPLIED).not.toBe(t.states.SENDING);
      expect(t.cancelPending.length).toBeGreaterThan(30);
    }
  });
});
