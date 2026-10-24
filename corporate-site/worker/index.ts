import { handleApi } from './api';
import type { WorkerEnv } from './types';

export default {
  async fetch(request: Request,env: WorkerEnv): Promise<Response> {
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/assistant/') || path.startsWith('/api/portal/') || path==='/api/leads' || path==='/api/leads/') return handleApi(request,env);
    if(!env.ASSETS) return new Response('Dienst derzeit nicht verfügbar.',{status:503,headers:{'Cache-Control':'no-store'}});
    return env.ASSETS.fetch(request);
  },
};
