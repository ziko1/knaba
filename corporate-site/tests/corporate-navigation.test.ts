import {describe,expect,it} from 'vitest';
import {corporateBreadcrumbs,navigationCurrent} from '../src/lib/corporate-navigation';
import {careersHref,careersCopy} from '../src/data/careers';

describe('Corporate wayfinding',()=>{
  it('keeps localized trails on public landing pages, including query strings',()=>{
    expect(corporateBreadcrumbs('/uk/kontakt/?anliegen=baureinigung','uk')).toEqual([
      {name:'KnaBa',url:'/uk/'},{name:'Контакти',url:'/uk/kontakt/'},
    ]);
    expect(corporateBreadcrumbs('/unternehmen','de')[1]).toEqual({name:'Über KnaBa',url:'/unternehmen/'});
    for(const locale of ['de','en','uk','ru'] as const){
      const prefix=locale==='de'?'':'/'+locale;
      expect(corporateBreadcrumbs(prefix+'/faq/',locale)[0].url).toBe(prefix+'/');
    }
  });
  it('does not fabricate trails for private, unknown, home or explicit deep pages',()=>{
    for(const path of ['/','/en/','/konto/','/uk/studio/','/404/','/bauleistungen/baureinigung/','/ratgeber/bauendreinigung-vorbereiten/']) expect(corporateBreadcrumbs(path,'de')).toEqual([]);
  });
  it('marks exact page separately from the parent service or guide location',()=>{
    expect(navigationCurrent('/uk/leistungen/','/uk/leistungen/')).toBe('page');
    expect(navigationCurrent('/uk/bauleistungen/baureinigung/?x=1','/uk/leistungen/')).toBe('location');
    expect(navigationCurrent('/ratgeber/bauendreinigung-vorbereiten/','/ratgeber/')).toBe('location');
    expect(navigationCurrent('/en/bauleistungen/baureinigung/','/uk/leistungen/')).toBeUndefined();
    expect(navigationCurrent('/ratgeber-andere/','/ratgeber/')).toBeUndefined();
  });
});
describe('Career contact is separate from project quotations',()=>{
  it.each(['de','en','uk','ru'] as const)('opens an encoded email intent for %s without sending',locale=>{
    const url=new URL(careersHref(locale));
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('kontakt@knaba.de');
    expect(url.searchParams.get('subject')).toBe(careersCopy[locale].subject);
    expect([...url.searchParams.keys()]).toEqual(['subject']);
  });
});
