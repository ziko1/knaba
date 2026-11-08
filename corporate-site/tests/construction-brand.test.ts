import {describe,it,expect} from 'vitest';
import {constructionOffers,offerBySlug,constructionBusinessCopy} from '../src/data/construction-offers';
import {languageLinks,localeAlternates} from '../src/lib/site-i18n';
import {services} from '../src/data/company';
import {defaultService,recommendService} from '../src/lib/planner';
import {readFileSync} from 'node:fs';
describe('construction branding and protected historic contracts',()=>{
  it('preserves construction marks and uses the approved three-building favicon',()=>{
    const mark=readFileSync(new URL('../public/images/knaba-construction-mark.svg',import.meta.url),'utf8');
    const logo=readFileSync(new URL('../public/images/knaba-construction-logo.svg',import.meta.url),'utf8');
    const favicon=readFileSync(new URL('../public/favicon.svg',import.meta.url),'utf8');
    for(const svg of [mark,logo]){
      expect(svg).toContain('Fensterabzieher');
      expect(svg).not.toContain('Kernbohrung');
    }
    expect(logo).toContain('BAUREINIGUNG');
    expect(logo).toContain('KnaBa');
    const header=readFileSync(new URL('../public/images/knaba-3d-header.svg',import.meta.url),'utf8');
    const approvedMark=header.slice(header.indexOf('  <g aria-hidden="true">'),header.indexOf('  <g font-family=')).trim();
    expect(approvedMark.length).toBeGreaterThan(100);
    expect(favicon).toContain(approvedMark);
    expect(favicon).toContain('#13B8B4');
    expect(favicon).toContain('limeBase');
    expect(favicon).not.toContain('Fensterabzieher');
    expect(favicon).not.toContain('Kernbohrung');
    expect(favicon).not.toMatch(/<text\b/);
    const box=favicon.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
    expect(box).toHaveLength(4);
    expect(box?.[2]).toBe(box?.[3]);
    expect(box?.[2]).toBeGreaterThan(48);
  });

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
    expect(languageLinks('/uk'+path)).toEqual(['de','en','pl','lt','ru','uk'].map(lang=>({lang,url:(lang==='de'?'':'/'+lang)+(['pl','lt'].includes(lang)?'/':path)})));
    expect(localeAlternates(path).map(v=>v.lang)).toEqual(['de','en','ru','uk','x-default']);
    expect(localeAlternates('/konto/')).toEqual([]);
  });
});
