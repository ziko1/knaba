import { siteConfig } from '../data/site';
import { constructionOffers } from '../data/construction-offers';
import type { APIRoute } from 'astro';
export const GET: APIRoute = () => {
  const base=['/','/leistungen/','/branchen/','/unternehmen/','/karriere/','/kontakt/','/planer/','/berlin/','/ratgeber/','/faq/',
    ...constructionOffers.map(o=>'/bauleistungen/'+o.slug+'/')];
  const paths=!siteConfig.indexable?[]:['','/en','/uk','/ru'].flatMap(prefix=>base.map(path=>prefix+path));
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>'<url><loc>'+siteConfig.origin+p+'</loc></url>').join('')+'</urlset>\n',{headers:{'Content-Type':'application/xml; charset=utf-8'}});
};
