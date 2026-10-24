import {siteConfig} from '../data/site';
import type {APIRoute} from 'astro';
export const GET: APIRoute = () => new Response('User-agent: *\nDisallow: /api/\nDisallow: /konto/\n' + (siteConfig.temporary ? '# Temporary preview: public HTML carries noindex; crawl is allowed to read it.\n' : `Sitemap: ${siteConfig.origin}/sitemap.xml\n`), {headers:{'Content-Type':'text/plain; charset=utf-8'}});
