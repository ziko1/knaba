import { describe, expect, it } from 'vitest';
import { languageLinks, localeAlternates, russianPublicPaths } from '../src/lib/site-i18n';
import {constructionGuideRoutes} from '../src/data/construction-guide-routes';

describe('public language navigation', () => {
  it('preserves every published construction article across all four languages', () => {
    for (const {slug} of constructionGuideRoutes) {
      const route='/ratgeber/'+slug+'/';
      const expected=[{lang:'de',url:route},{lang:'en',url:'/en'+route},{lang:'uk',url:'/uk'+route},{lang:'ru',url:'/ru'+route}];
      for (const prefix of ['','/en','/uk','/ru']) {
        expect(languageLinks(prefix+route)).toEqual(expected);
        expect(localeAlternates(prefix+route)).toEqual([...expected,{lang:'x-default',url:route}]);
      }
    }
  });
  it('preserves a service page when switching between DE and RU', () => {
    expect(languageLinks('/ru/leistungen/bueroreinigung/')).toEqual([
      {lang:'de',url:'/leistungen/bueroreinigung/'},
      {lang:'en',url:'/en/'}, {lang:'uk',url:'/uk/'},
      {lang:'ru',url:'/ru/leistungen/bueroreinigung/'},
    ]);
  });
  it('does not advertise nonexistent article translations', () => {
    const alternates = localeAlternates('/leistungen/glasreinigung/');
    expect(alternates).toContainEqual({lang:'ru',url:'/ru/leistungen/glasreinigung/'});
    expect(alternates.some(item => item.lang === 'en' || item.lang === 'uk')).toBe(false);
    expect(localeAlternates('/ru/leistungen/glasreinigung/')).toEqual(alternates);
  });
  it('uses four reciprocal home alternates and omits private portal from sitemap', () => {
    expect(localeAlternates('/uk/').map(item => item.lang)).toEqual(['de','en','uk','ru','x-default']);
    expect(localeAlternates('/ru/konto/')).toEqual([]);
    expect(russianPublicPaths).toContain('/ru/kontakt/');
    expect(russianPublicPaths).not.toContain('/ru/konto/');
    expect(new Set(russianPublicPaths).size).toBe(russianPublicPaths.length);
  });
  it('provides reciprocal alternates for every actual translated guide',()=>{
    for(const {slug} of constructionGuideRoutes){
      const original='/ratgeber/'+slug+'/';
      expect(languageLinks('/uk'+original)).toEqual(['de','en','uk','ru'].map(lang=>({lang,url:lang==='de'?original:'/'+lang+original})));
      expect(localeAlternates(original).map(x=>x.lang)).toEqual(['de','en','uk','ru','x-default']);
    }
  });
  it('preserves the first-party gallery in four real localizations',()=>{
    expect(languageLinks('/ru/galerie/')).toEqual(['de','en','uk','ru'].map(lang=>({lang,url:lang==='de'?'/galerie/':'/'+lang+'/galerie/'})));
    expect(localeAlternates('/galerie/').map(x=>x.lang)).toEqual(['de','en','uk','ru','x-default']);
  });
  it('does not invent translated error routes', () => {
    expect(languageLinks('/404.html').at(-1)?.url).toBe('/ru/');
    expect(localeAlternates('/404.html')).toEqual([]);
  });
});
