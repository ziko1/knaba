import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import SiteIdentityLink,{checkedSiteLinks,siteIdentityLabel} from '../apps/web/src/SiteIdentityLink.tsx';
import type {Language} from '../packages/i18n/index.ts';

const id='c2e08586-eada-44de-b46c-5e807c4bf096';
const snapshot=()=>({enabled:true,authorities:[{id:'site',issuer:'https://site.invalid/identity',siteOrigin:'https://site.invalid'}],bindings:[],challenge:{id,authorityId:'site',state:'CLAIMED',version:2,expiresAt:new Date(Date.now()+300000).toISOString(),subject:'immutable-site-user',siteLabel:'Site user',bindingId:null}});
describe('website account UI boundaries',()=>{
 const titles:Record<Language,string>={DE:'Website-Konto',EN:'Website account',UK:'Обліковий запис сайту',RU:'Учётная запись сайта',PL:'Konto witryny',LT:'Svetainės paskyra'};
 it.each(Object.keys(titles) as Language[])('renders the actual component in %s without another locale index',language=>{
  const html=renderToStaticMarkup(createElement(SiteIdentityLink,{language,online:false,onAccessDenied:()=>{}}));expect(siteIdentityLabel(language)).toBe(titles[language]);expect(html).toContain(`aria-label="${titles[language]}"`);expect(html).not.toContain('KNABA-LINK-');
 });
 it('copies only display metadata and never keeps a server-supplied credential or proof field',()=>{
  const source=snapshot(),result=checkedSiteLinks({...source,password:'sensitive-password',challenge:{...source.challenge,code:'sensitive-code',sessionHash:'sensitive-hash',credentialFingerprint:'sensitive-fingerprint'}});
  expect(JSON.stringify(result)).not.toContain('sensitive-');expect(result.challenge?.subject).toBe('immutable-site-user');
 });
 it.each(['http://site.invalid','https://site.invalid/path','javascript:alert(1)'])('rejects an unsafe account navigation origin %s',siteOrigin=>{
  const source=snapshot();expect(()=>checkedSiteLinks({...source,authorities:[{...source.authorities[0],siteOrigin}]})).toThrow();
 });
 it('requires the pinned source identity and label before showing a claimed account',()=>{
  const source=snapshot();for(const change of [{subject:null},{siteLabel:null},{version:0},{state:'ACTIVE'},{expiresAt:'invalid'}])expect(()=>checkedSiteLinks({...source,challenge:{...source.challenge,...change}})).toThrow();
 });
 it('permits self-revocation metadata while federation is disabled and bounds returned collections',()=>{
  expect(checkedSiteLinks({enabled:false,authorities:[],bindings:[{id,issuer:'https://site.invalid/identity',subject:'immutable-site-user',state:'ACTIVE',version:1}],challenge:null}).bindings).toHaveLength(1);
  const source=snapshot();expect(()=>checkedSiteLinks({...source,authorities:Array.from({length:9},()=>source.authorities[0])})).toThrow();expect(()=>checkedSiteLinks({...source,bindings:Array.from({length:65},()=>({}))})).toThrow();
 });
});
