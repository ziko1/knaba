import { handleApi } from './api';
import type { WorkerEnv, WorkerContext } from './types';
import { drainOwnerNotifications } from './notifications';
import { drainErpLeads } from './assistant-erp-dispatch';

export default {
  async fetch(request: Request,env: WorkerEnv,ctx?: WorkerContext): Promise<Response> {
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/portal/') || path.startsWith('/api/assistant/') || path.startsWith('/api/studio/') || path.startsWith('/api/crm/') || path==='/api/reviews' || path.startsWith('/api/reviews/') || path==='/api/leads' || path==='/api/leads/') return handleApi(request,env,ctx);
    if(!env.ASSETS) return new Response('Dienst derzeit nicht verfügbar.',{status:503,headers:{'Cache-Control':'no-store'}});
    return env.ASSETS.fetch(request);
  },
  scheduled(_event:unknown,env:WorkerEnv,ctx:WorkerContext):void {
    // Optional cron trigger: controlled separately in hosting settings.
    ctx.waitUntil(drainOwnerNotifications(env).then(()=>undefined));
    // Fully fail-closed when ERP is not explicitly approved by the operator.
    if(env.ASSISTANT_ERP_ENABLED==='approved') ctx.waitUntil(drainErpLeads(env).then(()=>undefined));
  },
};
