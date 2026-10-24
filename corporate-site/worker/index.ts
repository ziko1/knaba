import { handleApi, session } from './api';
import { editorSessionAuthorized, isEditorRoute, renderCmsPage } from './editor';
import { isCmsPage } from '../src/lib/editor-contract';
import type { WorkerEnv } from './types';

const hidden = () => new Response('Seite nicht gefunden.', {
  status:404,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}
});

export default {
  async fetch(request: Request,env: WorkerEnv): Promise<Response> {
    const url=new URL(request.url),path=url.pathname;
    if(path.startsWith('/api/assistant/') || path.startsWith('/api/portal/') ||
      path.startsWith('/api/editor/') || path.startsWith('/api/crm/') ||
      path==='/api/leads' || path==='/api/leads/') return handleApi(request,env);
    const editorPage=isEditorRoute(path);
    const preview=url.searchParams.has('cms-preview');
    if(editorPage || preview) {
      if(request.method!=='GET' || (preview && (!isCmsPage(path) || url.searchParams.get('cms-preview')!=='1')) ||
         !await editorSessionAuthorized(request,env,session)) return hidden();
    }
    if(!env.ASSETS) return new Response('Dienst derzeit nicht verfügbar.',{status:503,headers:{'Cache-Control':'no-store'}});
    const asset=await env.ASSETS.fetch(request);
    if(editorPage) {
      const headers=new Headers(asset.headers);
      headers.set('Cache-Control','private, no-store');
      headers.set('X-Robots-Tag','noindex, nofollow');
      headers.set('Referrer-Policy','same-origin');
      headers.set('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
    }
    return renderCmsPage(request,env,asset,preview);
  },
};
