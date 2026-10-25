import {siteConfig} from '../data/site';
import type {APIRoute} from 'astro';
export const GET: APIRoute = () => new Response('User-agent: *\nDisallow: /api/\nDisallow: /konto/\nDisallow: /ru/konto/\n' + (!siteConfig.indexable ? '# Public HTML is noindex until owner approval; crawl is allowed to read it.\n' : `Sitemap: ${siteConfig.origin}/sitemap.xml\n`), {headers:{'Content-Type':'text/plain; charset=utf-8'}});
