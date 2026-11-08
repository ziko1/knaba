import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import LeadAgentPanel,{canUseLeadAgent,leadAgentDecimal,leadAgentProfileFromForm,leadAgentSafeUrl} from './LeadAgentPanel';
import type {Session} from './api';

const form=()=>{
  const f=new FormData();
  for(const [key,value] of Object.entries({name:'Berlin Handwerk',sources:'ted',nutsCodes:'DE300, DE40',postcodes:'10115; 14467',latitude:'52.52',longitude:'13.405',radiusKm:'50',unknownLocation:'REVIEW',unknownBudget:'REVIEW',maximumAgeDays:'30',minimumScore:'35',intervalMinutes:'180',mode:'DRAFTS',laborCostPerHourCents:'30.25',sellRatePerHourCents:'45.50',minimumMarginBps:'20.25',vatBps:'',minimumBudgetCents:'',maximumBudgetCents:'',includeWords:'Maler, ремонт',excludeWords:'Asbest'}))f.set(key,value);
  f.append('categories','painting');return f;
};
const session=(roles=['OWNER'],permissions=['lead_agent.manage']):Session=>({actor:{userId:'owner-1',companyId:'knaba-1',roles,permissions,siteIds:[],customerIds:[],warehouseIds:[]},user:{},mode:'TEST'});

describe('lead agent form contract and honest UI boundaries',()=>{
  it('keeps optional budgets and tax unknown while converting exact EUR cents and basis points',()=>{
    const profile=leadAgentProfileFromForm(form());
    expect(profile.minimumBudgetCents).toBeNull();expect(profile.maximumBudgetCents).toBeNull();expect(profile.vatBps).toBeNull();
    expect(profile.laborCostPerHourCents).toBe(3025);expect(profile.sellRatePerHourCents).toBe(4550);expect(profile.minimumMarginBps).toBe(2025);
    expect(profile.nutsCodes).toEqual(['DE300','DE40']);expect(profile.postcodes).toEqual(['10115','14467']);expect(profile.includeWords).toEqual(['Maler','ремонт']);
    expect(profile.unknownLocation).toBe('REVIEW');expect(profile.unknownBudget).toBe('REVIEW');expect(profile.scheduleEnabled).toBe(false);
  });
  it('preserves explicit zero tax, validates budget order and rejects unsupported source accounts',()=>{
    const f=form();f.set('vatBps','0');f.set('scheduleEnabled','on');
    expect(leadAgentProfileFromForm(f)).toMatchObject({vatBps:0,scheduleEnabled:true});
    f.set('minimumBudgetCents','1000');f.set('maximumBudgetCents','999.99');expect(()=>leadAgentProfileFromForm(f)).toThrow();
    f.set('maximumBudgetCents','2000');f.set('sources','myhammer');expect(()=>leadAgentProfileFromForm(f)).toThrow();
  });
  it('rejects fractional cents, negative amounts and accidental exponent money input',()=>{
    expect(leadAgentDecimal('0.29')).toBe(29);expect(leadAgentDecimal('12,34')).toBe(1234);expect(leadAgentDecimal('',true)).toBeNull();
    for(const value of ['0.001','-1','1e3','NaN','Infinity',''])expect(()=>leadAgentDecimal(value)).toThrow();
  });
  it('opens HTTPS links without accepting script schemes or credential-bearing URLs',()=>{
    expect(leadAgentSafeUrl('https://ted.europa.eu/de/notice/-/detail/123-2026')).toBe('https://ted.europa.eu/de/notice/-/detail/123-2026');
    for(const value of ['javascript:alert(1)','data:text/html,hello','http://example.com','https://user:secret@example.com','/api/v1/session',null])expect(leadAgentSafeUrl(value)).toBeUndefined();
  });
  it('denies external roles even when a malformed grant includes module permission',()=>{
    expect(canUseLeadAgent(session().actor)).toBe(true);expect(canUseLeadAgent(session(['OWNER'],[]).actor)).toBe(false);
    for(const role of ['CLIENT','CUSTOMER','GUEST','EXTERNAL_BAULEITER','SERVICE_ACCOUNT'])expect(canUseLeadAgent(session(['OWNER',role]).actor)).toBe(false);
  });
  it('renders an offline and unauthorized state without invented results, connected accounts or contact actions',()=>{
    const offline=renderToStaticMarkup(createElement(LeadAgentPanel,{session:session(),language:'UK',online:false,onAccessDenied:()=>{}}));
    expect(offline).toContain('Немає з’єднання');expect(offline).toContain('Дані модуля ще не доступні');expect(offline).not.toContain('name="password"');expect(offline).not.toContain('До відібраних');
    const denied=renderToStaticMarkup(createElement(LeadAgentPanel,{session:session(['GUEST']),language:'DE',online:true,onAccessDenied:()=>{}}));
    expect(denied).toContain('nur für berechtigte KNABA-Mitarbeiter');expect(denied).not.toContain('role="tablist"');
  });
});
