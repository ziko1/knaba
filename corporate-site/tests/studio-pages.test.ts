import {describe,it,expect} from 'vitest';
import {studioPages} from '../src/lib/studio-pages';
import {normalizeStudioPage} from '../src/lib/site-studio-contract';

describe('Studio editable site route inventory',()=>{
  it('offers all 96 multilingual core, partner, FAQ, service and construction guide pages',()=>{
    expect(studioPages).toHaveLength(96);
    expect(new Set(studioPages.map(x=>x.path)).size).toBe(studioPages.length);
    for(const item of studioPages){
      expect(normalizeStudioPage(item.path)).toBe(item.path);
      expect(item.title.trim().length).toBeGreaterThan(0);
    }
  });
  it('includes each construction article in all published languages without retired office guides',()=>{
    for(const prefix of ['', '/en', '/uk', '/ru']) {
      for(const slug of ['bauendreinigung-vorbereiten','baureinigung-phasen','baureinigung-kosten-planen','bauuebergabe-checkliste'])
        expect(studioPages.some(page=>page.path===prefix+'/ratgeber/'+slug+'/')).toBe(true);
      expect(studioPages.some(page=>page.path===prefix+'/ratgeber/bueroreinigung-checkliste/')).toBe(false);
    }
  });
  it('offers all four published FAQ pages to the owner editor',()=>{
    for(const prefix of ['', '/en', '/uk', '/ru']){
      expect(studioPages.some(page=>page.path===prefix+'/faq/')).toBe(true);
      expect(normalizeStudioPage(prefix+'/faq/')).toBe(prefix+'/faq/');
    }
  });
  it('includes 4 language homepages and explicit 8 construction service pages',()=>{
    for(const prefix of ['','/en','/uk','/ru']){
      expect(studioPages.some(x=>x.path===prefix+'/')).toBe(true);
      expect(studioPages.some(x=>x.path===prefix+'/galerie/')).toBe(true);
      expect(studioPages.some(x=>x.path===prefix+'/partner/')).toBe(true);
      expect(studioPages.some(x=>x.path===prefix+'/bauleistungen/baureinigung/')).toBe(true);
      expect(studioPages.some(x=>x.path===prefix+'/bauleistungen/kernbohrungen/')).toBe(true);
    }
  });
  it('exposes all four guides in four published languages without private routes',()=>{
    for(const prefix of ['', '/en','/uk','/ru']){
      for(const slug of ['baureinigung-phasen','baureinigung-kosten-planen','bauuebergabe-checkliste','bauendreinigung-vorbereiten']){
        const path=prefix+'/ratgeber/'+slug+'/';
        expect(studioPages.some(page=>page.path===path)).toBe(true);
        expect(normalizeStudioPage(path)).toBe(path);
      }
    }
  });
  it('never offers private portal, deprecated office cleaning or unsupported locale as editable public page',()=>{
    const paths=studioPages.map(x=>x.path);
    for(const value of ['/studio/','/konto/','/crm/','/ru/postfach/','/leistungen/bueroreinigung/','/fr/']){
      expect(paths).not.toContain(value);
    }
  });
});
