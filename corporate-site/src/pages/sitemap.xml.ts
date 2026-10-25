import { siteConfig } from '../data/site';
import { constructionOffers } from '../data/construction-offers';
import { localeAlternates } from '../lib/site-i18n';
import type { APIRoute } from 'astro';
export const GET: APIRoute = () => {
  const base=['/','/leistungen/','/branchen/','/unternehmen/','/karriere/','/kontakt/','/planer/','/berlin/','/ratgeber/','/faq/',
    ...constructionOffers.map(o=>'/bauleistungen/'+o.slug+'/')];
  const paths=!siteConfig.indexable?[]:['','/en','/uk','/ru'].flatMap(prefix=>base.map(path=>prefix+path));
  // The same reciprocal alternates appear in page heads and the sitemap; no invented locales.
  const escapeXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const entries=paths.map(path=>{
    const alternates=localeAlternates(path).map(item=>
      '<xhtml:link rel="alternate" hreflang="'+escapeXml(item.lang)+'" href="'+escapeXml(siteConfig.origin+item.url)+'" />').join('');
    return '<url><loc>'+escapeXml(siteConfig.origin+path)+'</loc>'+alternates+'</url>';
  }).join('');
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'+entries+'</urlset>\n',{headers:{'Content-Type':'application/xml; charset=utf-8'}});
};
