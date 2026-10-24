import { handleApi } from './api';
import type { WorkerEnv } from './types';

export default {
  async fetch(request: Request,env: WorkerEnv): Promise<Response> {
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/portal/') || path==='/api/leads' || path==='/api/leads/') return handleApi(request,env);
    if(!env.ASSETS) return new Response('Dienst derzeit nicht verfügbar.',{status:503,headers:{'Cache-Control':'no-store'}});
    const asset=await env.ASSETS.fetch(request);
    if(path!=='/konto' && !path.startsWith('/konto/')) return asset;
    // Static assets bypass the Worker unless routed first. Keep middleware
    // limited to the account document to protect marketing-page performance.
    const protectedDocument=new Response(asset.body,asset);
    protectedDocument.headers.set('Cache-Control','private, no-store, max-age=0');
    protectedDocument.headers.set('X-Frame-Options','DENY');
    protectedDocument.headers.set('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    protectedDocument.headers.set('X-Robots-Tag','noindex, nofollow');
    protectedDocument.headers.set('X-Content-Type-Options','nosniff');
    protectedDocument.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    protectedDocument.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    return protectedDocument;
  },
};
