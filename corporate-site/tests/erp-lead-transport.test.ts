import {afterEach,describe,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {deliverErpLead,ERP_INTAKE_HTTP_TIMEOUT_MS,ERP_INTAKE_MAX_RESPONSE_BYTES,type ErpLeadDelivery} from '../worker/erp-lead-transport';
import type {ErpLeadConfig} from '../worker/erp-lead-contract';

const now=Date.parse('2026-11-08T00:00:00.000Z');
const config=():ErpLeadConfig=>({origin:'https://erp.example.com',endpoint:'https://erp.example.com/api/v1/integrations/knaba_site/events',source:'knaba_site',companyId:'company_1',privacyVersion:'2026-10-28',keyId:'synthetic_1',secret:'synthetic-key-only-for-local-tests-123456789',bindingHash:'a'.repeat(64),mappingVersion:'1',serviceMap:{construction:['service_1']}});
const delivery=():ErpLeadDelivery=>({eventId:'event_1',bindingHash:'a'.repeat(64),body:JSON.stringify({schema_version:'1',event_id:'event_1',event_type:'lead.upsert',source:'knaba_site',target_company_id:'company_1',occurred_at:new Date(now).toISOString(),external_id:'request_1',payload:{contact:{name:'Synthetic contact',email:'contact@example.test'},serviceIds:['service_1']}})});
const applied=()=>({event_id:'event_1',status:'APPLIED',duplicate:false,effect_id:'lead_1'});
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
afterEach(()=>vi.useRealTimers());

describe('ERP intake exact signed bounded transport',()=>{
  it('signs the exact immutable bytes and timestamp with the current key, accepts the committed matching receipt',async()=>{
    const input=delivery(),selected=config();
    const send=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
      expect(url).toBe(selected.endpoint);expect(init).toMatchObject({method:'POST',redirect:'manual',credentials:'omit',cache:'no-store'});
      const bytes=Buffer.from(init!.body as Uint8Array),headers=new Headers(init!.headers),stamp=String(now/1000);
      expect(bytes.toString('utf8')).toBe(input.body);
      expect(headers.get('x-knaba-key-id')).toBe(selected.keyId);expect(headers.get('x-knaba-timestamp')).toBe(stamp);
      expect(headers.get('x-knaba-signature')).toBe('sha256='+createHmac('sha256',selected.secret).update(stamp+'.').update(bytes).digest('hex'));
      expect(init!.signal).toBeInstanceOf(AbortSignal);
      return response(applied());
    });
    expect(await deliverErpLead(selected,input,{fetch:send,now:()=>now})).toEqual({status:'APPLIED',effectId:'lead_1',duplicate:false});
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('preserves the same event body across an ambiguous attempt and a duplicate acknowledgement',async()=>{
    const send=vi.fn().mockRejectedValueOnce(Error('connection interrupted after commit')).mockResolvedValueOnce(response({...applied(),duplicate:true}));
    const input=delivery(),selected=config();
    expect(await deliverErpLead(selected,input,{fetch:send,now:()=>now})).toEqual({status:'RETRY',reason:'TRANSPORT_ERROR'});
    expect(await deliverErpLead(selected,input,{fetch:send,now:()=>now+1000})).toEqual({status:'APPLIED',effectId:'lead_1',duplicate:true});
    expect([...send.mock.calls[0][1].body]).toEqual([...send.mock.calls[1][1].body]);
    expect(new Headers(send.mock.calls[0][1].headers).get('x-knaba-timestamp')).not.toBe(new Headers(send.mock.calls[1][1].headers).get('x-knaba-timestamp'));
  });
  it('holds a matching quarantine receipt instead of treating HTTP success as lead creation',async()=>{
    const send=vi.fn(async()=>response({event_id:'event_1',status:'QUARANTINED',duplicate:false,quarantine_id:'quarantine_1',reason:'INTEGRATION_OWNER_UNAVAILABLE'}));
    expect(await deliverErpLead(config(),delivery(),{fetch:send,now:()=>now})).toEqual({status:'QUARANTINED',quarantineId:'quarantine_1',reason:'INTEGRATION_OWNER_UNAVAILABLE',duplicate:false});
  });
  it.each([401,403,409,400,422,404])('stops HTTP %i without exposing provider body contents',async status=>{
    expect(await deliverErpLead(config(),delivery(),{fetch:async()=>response({private:'not for logs'},status),now:()=>now})).toEqual({status:'BLOCKED',reason:'HTTP_'+status});
  });
  it.each([408,429,500,503])('retries transient HTTP %i using the durable caller policy',async status=>{
    expect(await deliverErpLead(config(),delivery(),{fetch:async()=>response({},status),now:()=>now})).toEqual({status:'RETRY',reason:'HTTP_'+status});
  });
  it.each([301,302,303,307,308])('holds redirect HTTP %i without following its Location',async status=>{
    const send=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{expect(init?.redirect).toBe('manual');return new Response(null,{status,headers:{Location:'https://another.example.com/steal'}});});
    expect(await deliverErpLead(config(),delivery(),{fetch:send,now:()=>now})).toEqual({status:'BLOCKED',reason:'REDIRECT_REJECTED'});expect(send).toHaveBeenCalledTimes(1);
  });
  it('the native HTTP client does not follow an actual loopback redirect',async()=>{
    let redirectedRequests=0,initialRequests=0;
    const server=createServer((request,reply)=>{
      if(request.url==='/other'){redirectedRequests++;reply.writeHead(200,{'Content-Type':'application/json'});reply.end(JSON.stringify(applied()));return;}
      initialRequests++;reply.writeHead(307,{Location:'/other'});reply.end();
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const address=server.address();if(!address||typeof address==='string')throw Error('NO_TEST_SOCKET');
      const localFetch:typeof fetch=async(url,init)=>{expect(String(url)).toBe(config().endpoint);return fetch('http://127.0.0.1:'+address.port+'/initial',init);};
      expect(await deliverErpLead(config(),delivery(),{fetch:localFetch,now:()=>now})).toEqual({status:'BLOCKED',reason:'REDIRECT_REJECTED'});
      expect(initialRequests).toBe(1);expect(redirectedRequests).toBe(0);
    }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
  it.each([{}, {...applied(),event_id:'another'}, {...applied(),duplicate:'false'}, {...applied(),effect_id:''}, {...applied(),untrusted:'extra'}, {event_id:'event_1',status:'QUARANTINED',duplicate:false,quarantine_id:'q'}, null])('refuses malformed or mismatched 2xx receipts %#',async receipt=>{
    expect(await deliverErpLead(config(),delivery(),{fetch:async()=>response(receipt),now:()=>now})).toEqual({status:'RETRY',reason:'INVALID_RECEIPT'});
  });
  it('cancels an over-sized stream and rejects false content length before consuming it',async()=>{
    let cancelled=0;
    const stream=()=>new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(ERP_INTAKE_MAX_RESPONSE_BYTES+1));},cancel(){cancelled++;}});
    for(const headers of [new Headers({'Content-Type':'application/json'}),new Headers({'Content-Type':'application/json','Content-Length':'999999'})]){
      expect(await deliverErpLead(config(),delivery(),{fetch:async()=>new Response(stream(),{headers}),now:()=>now})).toEqual({status:'RETRY',reason:'INVALID_RECEIPT'});
    }
    expect(cancelled).toBe(2);
  });
  it('rejects invalid UTF-8 and non-JSON content instead of acknowledging it',async()=>{
    for(const upstream of [new Response(new Uint8Array([0xff]),{headers:{'Content-Type':'application/json'}}),new Response(JSON.stringify(applied()),{headers:{'Content-Type':'text/html'}})])
      expect(await deliverErpLead(config(),delivery(),{fetch:async()=>upstream,now:()=>now})).toEqual({status:'RETRY',reason:'INVALID_RECEIPT'});
  });
  it.each(['http://erp.example.com','https://localhost','https://127.0.0.1','https://2130706433','https://[::1]','https://erp.internal','https://erp.local','https://erp.test','https://user:pass@erp.example.com','https://erp.example.com:8443','https://erp.example.com/?secret=x'])('never sends to unsafe operator origin %s',async origin=>{
    const value=config();value.origin=origin;value.endpoint=origin+'/api/v1/integrations/knaba_site/events';const send=vi.fn();
    expect(await deliverErpLead(value,delivery(),{fetch:send,now:()=>now})).toEqual({status:'BLOCKED',reason:'CONFIG_CHANGED'});expect(send).not.toHaveBeenCalled();
  });
  it('refuses route/source/body or mapping substitution before transport',async()=>{
    const changedConfig={...config(),endpoint:'https://erp.example.com/api/v1/users'},changedBody={...delivery(),body:delivery().body.replace('event_1','event_other')};
    const send=vi.fn();
    expect((await deliverErpLead(changedConfig,delivery(),{fetch:send,now:()=>now})).status).toBe('BLOCKED');
    expect(await deliverErpLead(config(),changedBody,{fetch:send,now:()=>now})).toEqual({status:'BLOCKED',reason:'INVALID_ENVELOPE'});
    expect((await deliverErpLead(config(),{...delivery(),bindingHash:'b'.repeat(64)},{fetch:send,now:()=>now})).status).toBe('BLOCKED');expect(send).not.toHaveBeenCalled();
  });
  it('rejects a mismatched signed company target and a current company substitution even under a forged unchanged digest',async()=>{
    const send=vi.fn(),input={...delivery(),body:delivery().body.replace('company_1','company_2')};
    expect(await deliverErpLead(config(),input,{fetch:send,now:()=>now})).toEqual({status:'BLOCKED',reason:'INVALID_ENVELOPE'});
    expect(await deliverErpLead(config(),delivery(),{fetch:send,now:()=>now,currentConfig:async()=>({...config(),companyId:'company_2'})})).toEqual({status:'BLOCKED',reason:'CONFIG_CHANGED'});
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects revoked config after signing and adopts a valid key rotation before signing',async()=>{
    const send=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>response(applied())),selected=config(),rotated={...selected,keyId:'synthetic_2',secret:'synthetic-rotated-only-test-key-1234567890'};
    let reads=0;
    expect(await deliverErpLead(selected,delivery(),{fetch:send,now:()=>now,currentConfig:async()=>++reads===1?selected:null})).toEqual({status:'BLOCKED',reason:'CONFIG_CHANGED'});
    expect(send).not.toHaveBeenCalled();
    expect((await deliverErpLead(selected,delivery(),{fetch:send,now:()=>now,currentConfig:async()=>rotated})).status).toBe('APPLIED');
    expect(new Headers(send.mock.calls[0][1]?.headers).get('x-knaba-key-id')).toBe('synthetic_2');
  });
  it('refuses expired and not-yet-valid keys before a request',async()=>{
    const send=vi.fn();
    for(const patch of [{keyNotBefore:now+1},{keyNotAfter:now-1},{keyNotAfter:now}])expect((await deliverErpLead({...config(),...patch},delivery(),{fetch:send,now:()=>now})).status).toBe('BLOCKED');
    expect(send).not.toHaveBeenCalled();
  });
  it('bounds an unresponsive fetch and aborts its signal',async()=>{
    vi.useFakeTimers();let signal:AbortSignal|null|undefined;
    const send=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{signal=init?.signal;return new Promise<Response>(()=>{});});
    const pending=deliverErpLead(config(),delivery(),{fetch:send,now:()=>now});
    await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(ERP_INTAKE_HTTP_TIMEOUT_MS);
    expect(await pending).toEqual({status:'RETRY',reason:'TRANSPORT_TIMEOUT'});expect(signal?.aborted).toBe(true);
  });
  it('bounds a stalled response body as well as the initial connection',async()=>{
    vi.useFakeTimers();let cancelled=false;
    const send=vi.fn(async()=>new Response(new ReadableStream<Uint8Array>({pull(){return new Promise<void>(()=>{});},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}}));
    const pending=deliverErpLead(config(),delivery(),{fetch:send,now:()=>now});await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(ERP_INTAKE_HTTP_TIMEOUT_MS);
    expect(await pending).toEqual({status:'RETRY',reason:'TRANSPORT_TIMEOUT'});expect(cancelled).toBe(true);
  });
});
