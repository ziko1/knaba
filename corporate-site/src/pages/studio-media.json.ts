import type {APIRoute} from 'astro';
import {listStudioMedia} from '../lib/studio-media';
import {join} from 'node:path';
/** Static read-only manifest of approved bundled public art; not a user upload endpoint. */
export const GET:APIRoute=()=>new Response(
  JSON.stringify({version:1,assets:listStudioMedia(join(process.cwd(),'public'))}),
  {headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public,max-age=3600',
    'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex,nofollow'}}
);
