import { siteConfig } from '../data/site';
import { services } from '../data/company';
import { guides } from '../data/seo-content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  // A sitemap contains indexable pages only. The temporary release is noindex.
  const paths = siteConfig.temporary ? [] : [
    '/', '/en/', '/uk/', '/leistungen/', '/branchen/', '/unternehmen/', '/karriere/',
    '/kontakt/', '/planer/', '/impressum/', '/datenschutz/', '/berlin/', '/ratgeber/',
    ...services.map(s => `/leistungen/${s.slug}/`),
    ...guides.map(g => `/ratgeber/${g.slug}/`),
  ];
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + paths.map(path=>`<url><loc>${siteConfig.origin}${path}</loc></url>`).join('')+'</urlset>\n', {headers:{'Content-Type':'application/xml; charset=utf-8'}});
};
