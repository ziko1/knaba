import {describe,it,expect} from 'vitest';
import {languageLinks,localeAlternates,russianPublicPaths,coreTranslatedPaths,localizedPublicPath} from '../src/lib/site-i18n';
import {PUBLISHED_SITE_LOCALES} from '../src/lib/locale-catalog';
import {constructionGuideRoutes} from '../src/data/construction-guide-routes';

const expected=(route:string,translated:readonly string[])=>PUBLISHED_SITE_LOCALES.map(lang=>({lang,url:(lang==='de'?'':'/'+lang)+(translated.includes(lang)?route:'/')}));
describe('route-aware public language navigation',()=>{
 it('preserves every genuine six-language core route and reciprocal alternate',()=>{
  for(const route of coreTranslatedPaths){
   const links=expected(route,PUBLISHED_SITE_LOCALES);
   for(const item of links){expect(languageLinks(item.url)).toEqual(links);expect(localeAlternates(item.url)).toEqual([...links,{lang:'x-default',url:route}]);}
  }
 });
 it('preserves full existing partner/gallery/article translations with truthful PL/LT entry links',()=>{
  for(const route of ['/partner/','/galerie/',...constructionGuideRoutes.map(({slug})=>'/ratgeber/'+slug+'/')]){
   const links=expected(route,['de','en','ru','uk']);
   for(const lang of ['de','en','ru','uk']){
    const path=(lang==='de'?'':'/'+lang)+route;
    expect(languageLinks(path)).toEqual(links);
    expect(localeAlternates(path)).toEqual([...links.filter(item=>!['pl','lt'].includes(item.lang)),{lang:'x-default',url:route}]);
   }
  }
 });
 it('keeps historical DE/RU service pages and does not invent more translations',()=>{
  const route='/leistungen/bueroreinigung/';expect(languageLinks('/ru'+route)).toEqual(expected(route,['de','ru']));
  expect(localeAlternates(route)).toEqual([{lang:'de',url:route},{lang:'ru',url:'/ru'+route},{lang:'x-default',url:route}]);
 });
 it('uses genuine German destinations for untranslated legal/detail pages',()=>{
  expect(localizedPublicPath('/datenschutz/','pl')).toBe('/datenschutz/');
  expect(localizedPublicPath('/ratgeber/','lt')).toBe('/ratgeber/');
  expect(localizedPublicPath('/kontakt/','lt')).toBe('/lt/kontakt/');
  expect(localizedPublicPath('/konto/','ru')).toBe('/ru/konto/');
 });
 it('omits private and error pages from public alternates',()=>{
  expect(localeAlternates('/ru/konto/')).toEqual([]);expect(localeAlternates('/admin/')).toEqual([]);
  expect(localeAlternates('/404.html')).toEqual([]);expect(languageLinks('/404.html')).toEqual(expected('/',PUBLISHED_SITE_LOCALES));
  expect(russianPublicPaths).toContain('/ru/kontakt/');expect(russianPublicPaths).not.toContain('/ru/konto/');expect(new Set(russianPublicPaths).size).toBe(russianPublicPaths.length);
 });
});
