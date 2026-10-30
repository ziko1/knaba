import {services} from '../data/company.ts';
import {guides} from '../data/seo-content.ts';
import {constructionOffers} from '../data/construction-offers.ts';
import {constructionGuideRoutes} from '../data/construction-guide-routes.ts';
import {PUBLISHED_SITE_LOCALES, type PublishedSiteLocale} from './locale-catalog.ts';
export type SiteLocale = PublishedSiteLocale;
export const coreTranslatedPaths = ['/', '/leistungen/', '/kontakt/', '/planer/', '/faq/', '/unternehmen/', '/app/', '/bots/whatsapp/', '/bots/telegram/'] as const;
const coreSet = new Set<string>(coreTranslatedPaths);
type Alternate = {lang:string;url:string};
const publicPaths = [
 '/', '/leistungen/','/branchen/','/unternehmen/','/partner/','/galerie/','/karriere/',
 '/kontakt/','/planer/','/berlin/','/ratgeber/','/faq/','/app/','/bots/whatsapp/','/bots/telegram/',
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
function withoutLocale(path:string) {return path.replace(/^\/(?:en|pl|lt|ru|uk)(?=\/)/,'')||'/';}
/** Only genuine equivalents belong in hreflang. Other languages link home. */
export function publishedLocalesForPath(pathname:string):readonly SiteLocale[] {
 const path=withoutLocale(pathname);
 if(coreSet.has(path))return PUBLISHED_SITE_LOCALES;
 if(publicSet.has(path))return ['de','en','ru','uk'];
 if(legacyPaths.includes(path))return ['de','ru'];
 return [];
}
export function localizedPublicPath(path:string,locale:SiteLocale):string {
 const original=withoutLocale(path);
 if(original==='/konto/')return locale==='ru'?'/ru/konto/':locale==='de'?'/konto/':'/konto/?lang='+locale;
 return locale==='de'||!publishedLocalesForPath(original).includes(locale)?original:'/'+locale+original;
}
export function languageLinks(pathname:string):Alternate[] {
 const path=withoutLocale(pathname);
 const available=publishedLocalesForPath(path);
 return PUBLISHED_SITE_LOCALES.map(lang=>({lang,url:(lang==='de'?'':'/'+lang)+(available.includes(lang)?path:'/')}));
}
export function localeAlternates(pathname:string,existing:Alternate[]=[]):Alternate[]{
 const path=withoutLocale(pathname);
 if(path.startsWith('/konto/')||path.startsWith('/postfach/')||path.startsWith('/studio/')||path.startsWith('/crm/'))return existing;
 if(publicSet.has(path))return [...languageLinks(path).filter(item=>publishedLocalesForPath(path).includes(item.lang as SiteLocale)),{lang:'x-default',url:path}];
 if(legacyPaths.includes(path))return [{lang:'de',url:path},{lang:'ru',url:'/ru'+path},{lang:'x-default',url:path}];
 return existing;
}

export function publishedPublicPaths(locale:SiteLocale):string[] {
 return germanPaths.filter(path=>publishedLocalesForPath(path).includes(locale)).map(path=>(locale==='de'?'':'/'+locale)+path);
}
