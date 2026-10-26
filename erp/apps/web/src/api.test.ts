import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('keeps guest CSRF responses from replacing the authenticated staff proof',async()=>{
 const calls:Array<{path:string;options:RequestInit}>=[];
 vi.stubGlobal('fetch',async(path:string,options:RequestInit)=>{calls.push({path,options});const payload=path==='/api/v1/me'?{csrfToken:'TEST_STAFF_PROOF'}:path==='/api/v1/public/leads'?{csrfToken:'TEST_GUEST_PROOF'}:{};return {ok:true,json:async()=>payload};});
 const {api,clearSession}=await import('./api');
 await api('/api/v1/me');await api('/api/v1/public/leads',{method:'POST',body:'{}'});await api('/api/v1/commands/task.start',{method:'POST',body:'{}'});await api('/api/v1/public/chat',{method:'POST',body:'{}'});
 expect((calls[2].options.headers as Record<string,string>)['X-CSRF-Token']).toBe('TEST_STAFF_PROOF');
 expect((calls[3].options.headers as Record<string,string>)['X-CSRF-Token']).toBe('TEST_GUEST_PROOF');
 clearSession();await api('/api/v1/commands/task.start',{method:'POST',body:'{}'});
 expect((calls[4].options.headers as Record<string,string>)['X-CSRF-Token']).toBeUndefined();
});
it('surfaces typed failed commands without returning a successful result',async()=>{
 vi.stubGlobal('fetch',async()=>({ok:false,status:409,json:async()=>({code:'VERSION_CONFLICT',details:{expected:3}})}));
 const {api,ApiError}=await import('./api');
 await expect(api('/api/v1/commands/task.review',{method:'POST',body:'{}'})).rejects.toMatchObject({code:'VERSION_CONFLICT',status:409,details:{expected:3}});
 await expect(api('/api/v1/commands/task.review',{method:'POST',body:'{}'})).rejects.toBeInstanceOf(ApiError);
});
