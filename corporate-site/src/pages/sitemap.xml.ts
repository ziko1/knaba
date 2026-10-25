import {siteConfig} from '../data/site';
import {studioPages} from '../lib/studio-pages';
import {localeAlternates} from '../lib/site-i18n';
import type {APIRoute} from 'astro';
const escapeXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// One authoritative public URL catalog, shared with the existing Studio.
export const GET: APIRoute = () => {
  const publicRoutes=siteConfig.indexable?studioPages.map(p=>p.path):[];
  const entries=publicRoutes.map(path=>'<url><loc>'+escapeXml(siteConfig.origin+path)+'</loc>'+
    localeAlternates(path).map(item=>'<xhtml:link rel="alternate" hreflang="'+escapeXml(item.lang)+
      '" href="'+escapeXml(siteConfig.origin+item.url)+'" />').join('')+'</url>').join('');
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'+
    entries+'</urlset>\n',{headers:{'Content-Type':'application/xml; charset=utf-8'}});
};
