import type {APIRoute} from 'astro';
import {localeCatalog,PUBLISHED_SITE_LOCALES} from '../lib/locale-catalog';
/** Public translation readiness; do not claim untranslated pages are localized. */
export const GET:APIRoute=()=>new Response(JSON.stringify({
  project:'KNABA',
  targets:localeCatalog.length,
  published:PUBLISHED_SITE_LOCALES.length,
  pending:localeCatalog.length-PUBLISHED_SITE_LOCALES.length,
  locales:localeCatalog.map(({code,englishLabel,direction,status})=>({code,label:englishLabel,direction,status}))
}),{headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'public, max-age=3600',
  'X-Content-Type-Options':'nosniff'
}});
