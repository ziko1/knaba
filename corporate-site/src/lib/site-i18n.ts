import {services} from '../data/company';
import {guides} from '../data/seo-content';
import {constructionOffers} from '../data/construction-offers';
import {constructionGuideRoutes} from '../data/construction-guide-routes';
export type SiteLocale = 'de'|'en'|'uk'|'ru';
type Alternate = {lang:string;url:string};
const publicPaths = [
 '/', '/leistungen/','/branchen/','/unternehmen/','/partner/','/galerie/','/karriere/',
 '/kontakt/','/planer/','/berlin/','/ratgeber/','/faq/',
 ...constructionOffers.map(item=>'/bauleistungen/'+item.slug+'/'),
 ...constructionGuideRoutes.map(item=>'/ratgeber/'+item.slug+'/')
];
const publicSet = new Set(publicPaths);
const legacyPaths=[
 '/impressum/','/datenschutz/',
 ...services.map(s=>'/leistungen/'+s.slug+'/'),
 ...guides.map(g=>'/ratgeber/'+g.slug+'/'),
];
const germanPaths=[...new Set([...publicPaths,...legacyPaths])];
export const russianPublicPaths=germanPaths.map(path=>'/ru'+path);
function withoutLocale(path:string) {return path.replace(/^\/(?:ru|en|uk)(?=\/)/,'')||'/';}
export function languageLinks(pathname:string):Alternate[] {
 const path=withoutLocale(pathname);
 if(publicSet.has(path))return [
  {lang:'de',url:path}, {lang:'en',url:'/en'+path},
  {lang:'uk',url:'/uk'+path}, {lang:'ru',url:'/ru'+path},
 ];
 const legacy=germanPaths.includes(path);
 return [{lang:'de',url:legacy?path:'/'},{lang:'en',url:'/en/'},{lang:'uk',url:'/uk/'},{lang:'ru',url:legacy?'/ru'+path:'/ru/'}];
}
export function localeAlternates(pathname:string,existing:Alternate[]=[]):Alternate[]{
 const path=withoutLocale(pathname);
 if(path.startsWith('/konto/')||path.startsWith('/postfach/')||path.startsWith('/studio/')||path.startsWith('/crm/'))return existing;
 if(publicSet.has(path))return [...languageLinks(path),{lang:'x-default',url:path}];
 if(legacyPaths.includes(path))return [{lang:'de',url:path},{lang:'ru',url:'/ru'+path},{lang:'x-default',url:path}];
 return existing;
}
