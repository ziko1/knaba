import { handleApi } from './api';
import type { WorkerEnv, WorkerContext } from './types';
import { drainOwnerNotifications } from './notifications';

function staticHeaders(request: Request, env: WorkerEnv, response: Response): Response {
  // Native asset bindings do not necessarily apply the generated _headers file.
  // Wrap the existing stream: never parse HTML or change representation headers.
  let path = new URL(request.url).pathname;
  try { path = decodeURIComponent(path); } catch { /* Keep malformed paths opaque. */ }
  const privatePath = /^\/(?:(?:de|en|uk|ru)\/)?(?:admin|konto|studio|crm|postfach|login|logout)(?:\/|$)/.test(path);
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const requiredRobots = privatePath || response.status >= 400 ? ['noindex', 'nofollow'] :
    env.KNABA_RELEASE_MODE !== 'official' ? ['noindex'] : [];
  if (requiredRobots.length) {
    const existing = headers.get('X-Robots-Tag');
    // Agent-scoped directives are not proof that a global restriction exists.
    const present = existing?.includes(':') ? [] : (existing || '').split(',').map(value => value.trim().toLowerCase());
    const missing = requiredRobots.filter(value => !present.includes(value));
    headers.set('X-Robots-Tag', existing ? [...missing, existing].join(', ') :
      requiredRobots.length === 1 ? 'noindex, follow' : 'noindex, nofollow');
  }
  if (privatePath) headers.set('Cache-Control', 'private, no-store');
  else if (path.startsWith('/_astro/') && ((response.status >= 200 && response.status < 300) || response.status === 304)) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request,env: WorkerEnv,ctx?: WorkerContext): Promise<Response> {
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/portal/') || path.startsWith('/api/assistant/') || path.startsWith('/api/studio/') || path.startsWith('/api/crm/') || path==='/api/reviews' || path.startsWith('/api/reviews/') || path==='/api/leads' || path==='/api/leads/') return handleApi(request,env,ctx);
    const response = env.ASSETS ? await env.ASSETS.fetch(request) :
      new Response(request.method === 'HEAD' ? null : 'Dienst derzeit nicht verfügbar.', { status:503, headers:{'Cache-Control':'no-store','Content-Type':'text/plain;charset=UTF-8'} });
    return staticHeaders(request, env, response);
  },
  scheduled(_event:unknown,env:WorkerEnv,ctx:WorkerContext):void {
    // Optional cron trigger: controlled separately in hosting settings.
    ctx.waitUntil(drainOwnerNotifications(env).then(()=>undefined));
  },
};
