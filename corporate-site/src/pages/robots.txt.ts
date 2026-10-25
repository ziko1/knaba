import {siteConfig} from '../data/site';
import type {APIRoute} from 'astro';
export const GET: APIRoute = () => new Response('User-agent: *\nDisallow: /api/\nDisallow: /konto/\nDisallow: /ru/konto/\n' + (!siteConfig.indexable ? '# Public HTML is noindex until site-owner approval; crawlers may read its page-level meta tag.\n' : `Sitemap: ${siteConfig.origin}/sitemap.xml\n`), {headers:{'Content-Type':'text/plain; charset=utf-8'}});
