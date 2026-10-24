import { describe, expect, it, vi } from 'vitest';
import * as conversation from '../src/lib/assistant-conversation';
const m=conversation as Record<string,any>;

describe('private KnaBa conversation client',()=>{
  it('creates a 256-bit cryptographic capability and opaque request id',()=>{
    const token=m.createCapability();
    expect(token).toMatch(/^[a-zA-Z0-9_-]{43}$/);
    expect(token).not.toBe(m.createCapability());
    expect(m.createRequestKey()).toMatch(/^[0-9a-f-]{36}$/i);
  });
  it('passes capability in headers, never a URL/query/body for guest fetch',async()=>{
    const mock=vi.fn(async(_url:string,_init:RequestInit)=>new Response(JSON.stringify({thread:{id:'x'},messages:[]}),{headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch',mock);
    const id='11111111-1111-4111-8111-111111111111';const token=m.createCapability();
    await m.loadVisitorThread(id,token);
    expect(mock).toHaveBeenCalledTimes(1);
    const [path,init]=mock.mock.calls[0] as unknown as [string,RequestInit];
    expect(path).toBe(`/api/assistant/threads/${id}`);
    expect(JSON.stringify(path)).not.toContain(token);
    expect((init.headers as Record<string,string>)['X-KnaBa-Thread-Capability']).toBe(token);
    expect(init.credentials).toBe('same-origin');
    vi.unstubAllGlobals();
  });
  it('discards corrupted stored conversation identity',()=>{
    expect(m.restoreConversation('{bad json')).toBeNull();
    expect(m.restoreConversation(JSON.stringify({id:'../evil',capability:'weak'}))).toBeNull();
  });
});
