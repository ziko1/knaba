import {siteConfig} from '../data/site';
import type {APIRoute} from 'astro';
// Crawling public pages is allowed; private paths are not discoverable in the sitemap.
export const GET: APIRoute = () => new Response([
  'User-agent: *',
  'Disallow: /api/',
  'Disallow: /konto/',
  'Disallow: /ru/konto/',
  'Disallow: /admin/',
  'Disallow: /studio/',
  'Disallow: /crm/',
  'Disallow: /postfach/',
  'Disallow: /ru/postfach/',
  'Disallow: /login/',
  'Disallow: /logout/',
  ...(siteConfig.indexable
    ? ['Sitemap: '+siteConfig.origin+'/sitemap.xml']
    : ['# Unreleased preview is excluded by page-level noindex.'])
].join('\n')+'\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}});
