import {describe,it,expect} from 'vitest';
import {constructionOffers,offerBySlug,constructionBusinessCopy} from '../src/data/construction-offers';
import {languageLinks,localeAlternates} from '../src/lib/site-i18n';
import {services} from '../src/data/company';
import {defaultService,recommendService} from '../src/lib/planner';
describe('construction branding and protected historic contracts',()=>{
  it('has localized and unique offer slugs',()=>{
    const slugs=constructionOffers.map(item=>item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for(const locale of ['de','en','uk','ru'] as const){
      expect(constructionBusinessCopy[locale].hero.length).toBeGreaterThan(5);
      for(const offer of constructionOffers){
        expect(offer.name[locale].length).toBeGreaterThan(3);
        expect(offer.description[locale].length).toBeGreaterThan(10);
        expect(offer.steps.every(step=>step[locale].length>2)).toBe(true);
      }
    }
  });
  it('keeps legacy database codes but construction marketing has no office cleaning',()=>{
    expect(services.find(item=>item.slug==='bueroreinigung')?.name).toBe('Büroreinigung');
    expect(defaultService).toBe('baureinigung');
    expect(recommendService('construction','handover')).toBe('baureinigung');
    expect(new Set<string>(constructionOffers.map(item=>item.slug)).has('bueroreinigung')).toBe(false);
    expect(offerBySlug('kernbohrungen')?.core).toBe(false);
    expect(offerBySlug('<script>alert(1)</script>')).toBeUndefined();
  });
  it('provides reciprocal localized deep paths',()=>{
    const path='/bauleistungen/kernbohrungen/';
    expect(languageLinks('/uk'+path)).toEqual(['de','en','uk','ru'].map(lang=>({lang,url:lang==='de'?path:'/'+lang+path})));
    expect(localeAlternates(path).map(v=>v.lang)).toEqual(['de','en','uk','ru','x-default']);
    expect(localeAlternates('/konto/')).toEqual([]);
  });
});
