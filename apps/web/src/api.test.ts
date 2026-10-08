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
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve};}
function reply(status:number,body:Record<string,unknown>={}){return {ok:status>=200&&status<300,status,json:async()=>body};}
it('notifies current private authentication failures once and preserves their typed error',async()=>{
 vi.stubGlobal('fetch',async()=>reply(401,{code:'NEEDS_REAUTH',details:{reason:'EXPIRED'}}));
 const {api,subscribeAuthenticationFailure}=await import('./api');const invalidate=vi.fn(),unsubscribe=subscribeAuthenticationFailure(invalidate);
 const failures=await Promise.allSettled([api('/api/v1/entities/report'),api('/api/v1/commands/task.start',{method:'POST',body:'{}'})]);
 expect(invalidate).toHaveBeenCalledTimes(1);expect(failures).toEqual([expect.objectContaining({status:'rejected',reason:expect.objectContaining({code:'NEEDS_REAUTH',status:401,details:{reason:'EXPIRED'}})}),expect.objectContaining({status:'rejected'})]);
 unsubscribe();await expect(api('/api/v1/me')).rejects.toMatchObject({status:401});expect(invalidate).toHaveBeenCalledTimes(1);
});
it('keeps scoped denials, bad credentials and guest failures outside the private session boundary',async()=>{
 vi.stubGlobal('fetch',async(path:string)=>reply(path==='/api/v1/entities/payroll'?403:401,{code:'ACCESS_DENIED'}));
 const {api,subscribeAuthenticationFailure}=await import('./api');const invalidate=vi.fn(),unsubscribe=subscribeAuthenticationFailure(invalidate);
 for(const path of ['/api/v1/entities/payroll','/api/v1/auth/login','/api/v1/public/chat'])await expect(api(path)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 expect(invalidate).not.toHaveBeenCalled();unsubscribe();
});
it('preserves an authorized session when a business command needs approval despite HTTP 401',async()=>{
 const calls:Array<{path:string;options:RequestInit}>=[];
 vi.stubGlobal('fetch',async(path:string,options:RequestInit)=>{calls.push({path,options});return path==='/api/v1/me'?reply(200,{csrfToken:'TEST_STAFF_PROOF'}):path==='/api/v1/commands/media.approve'?reply(401,{error:{code:'NEEDS_APPROVAL',details:{approval:'REQUIRED'}}}):reply(200);});
 const {api,subscribeAuthenticationFailure}=await import('./api');const invalidate=vi.fn(),unsubscribe=subscribeAuthenticationFailure(invalidate);
 await api('/api/v1/me');await expect(api('/api/v1/commands/media.approve',{method:'POST',body:'{}'})).rejects.toMatchObject({code:'NEEDS_APPROVAL',status:401,details:{approval:'REQUIRED'}});
 await api('/api/v1/commands/task.start',{method:'POST',body:'{}'});expect(invalidate).not.toHaveBeenCalled();expect((calls.at(-1)!.options.headers as Record<string,string>)['X-CSRF-Token']).toBe('TEST_STAFF_PROOF');unsubscribe();
});
it('does not let an old private 401 revoke a successful new login or replace its proof',async()=>{
 const oldResponse=deferred<ReturnType<typeof reply>>(),calls:Array<{path:string;options:RequestInit}>=[];
 vi.stubGlobal('fetch',async(path:string,options:RequestInit)=>{calls.push({path,options});if(path==='/api/v1/entities/report')return oldResponse.promise;return reply(200,{csrfToken:path==='/api/v1/auth/login'?'TEST_NEW_STAFF_PROOF':'TEST_OLD_STAFF_PROOF'});});
 const {api,subscribeAuthenticationFailure}=await import('./api');const invalidate=vi.fn(),unsubscribe=subscribeAuthenticationFailure(invalidate);
 await api('/api/v1/me');const old=api('/api/v1/entities/report');await api('/api/v1/auth/login',{method:'POST',body:'{}'});
 oldResponse.resolve(reply(401,{code:'NEEDS_REAUTH'}));await expect(old).rejects.toMatchObject({status:401});expect(invalidate).not.toHaveBeenCalled();
 await api('/api/v1/commands/task.start',{method:'POST',body:'{}'});expect((calls.at(-1)!.options.headers as Record<string,string>)['X-CSRF-Token']).toBe('TEST_NEW_STAFF_PROOF');unsubscribe();
});
it('rejects an old successful proof update after a new login and ignores old logout-generation failures',async()=>{
 const oldResponse=deferred<ReturnType<typeof reply>>(),calls:Array<{path:string;options:RequestInit}>=[];
 vi.stubGlobal('fetch',async(path:string,options:RequestInit)=>{calls.push({path,options});return path==='/api/v1/me'?oldResponse.promise:reply(200,path==='/api/v1/auth/demo'?{csrfToken:'TEST_NEW_STAFF_PROOF'}:{});});
 const {api,clearSession,subscribeAuthenticationFailure}=await import('./api');const invalidate=vi.fn(),unsubscribe=subscribeAuthenticationFailure(invalidate);
 const old=api('/api/v1/me');await api('/api/v1/auth/demo',{method:'POST',body:'{}'});oldResponse.resolve(reply(200,{csrfToken:'TEST_OLD_STAFF_PROOF'}));await old;
 await api('/api/v1/commands/task.start',{method:'POST',body:'{}'});expect((calls.at(-1)!.options.headers as Record<string,string>)['X-CSRF-Token']).toBe('TEST_NEW_STAFF_PROOF');
 const expired=deferred<ReturnType<typeof reply>>();vi.stubGlobal('fetch',()=>expired.promise);const pending=api('/api/v1/entities/task');clearSession();expired.resolve(reply(401,{code:'NEEDS_REAUTH'}));await expect(pending).rejects.toMatchObject({status:401});expect(invalidate).not.toHaveBeenCalled();unsubscribe();
});
