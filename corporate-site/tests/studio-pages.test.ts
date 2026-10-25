import {describe,it,expect} from 'vitest';
import {studioPages} from '../src/lib/studio-pages';
import {normalizeStudioPage} from '../src/lib/site-studio-contract';

describe('Studio editable site route inventory',()=>{
  it('offers all 68 multilingual core and construction service pages',()=>{
    expect(studioPages).toHaveLength(68);
    expect(new Set(studioPages.map(x=>x.path)).size).toBe(68);
    for(const item of studioPages){
      expect(normalizeStudioPage(item.path)).toBe(item.path);
      expect(item.title.trim().length).toBeGreaterThan(0);
    }
  });
  it('includes 4 language homepages and explicit 8 construction service pages',()=>{
    for(const prefix of ['','/en','/uk','/ru']){
      expect(studioPages.some(x=>x.path===prefix+'/')).toBe(true);
      expect(studioPages.some(x=>x.path===prefix+'/bauleistungen/baureinigung/')).toBe(true);
      expect(studioPages.some(x=>x.path===prefix+'/bauleistungen/kernbohrungen/')).toBe(true);
    }
  });
  it('never offers private portal, deprecated office cleaning or unsupported locale as editable public page',()=>{
    const paths=studioPages.map(x=>x.path);
    for(const value of ['/studio/','/konto/','/crm/','/ru/postfach/','/leistungen/bueroreinigung/','/fr/']){
      expect(paths).not.toContain(value);
    }
  });
});
