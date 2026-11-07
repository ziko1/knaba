import {describe,it,expect,vi} from 'vitest';
import {z} from 'zod';
import {Engine} from '../apps/api/engine.ts';
import type {Database} from '../apps/api/database.ts';
import type {Actor} from '../packages/domain/core.ts';
import {DeepSeekAdapter,type DeepSeekConfig} from '../packages/integrations/deepseek.ts';
import {MAX_PROVIDER_JSON_BYTES,ProviderJsonLimitError,readBoundedProviderJson} from '../packages/integrations/bounded-json.ts';
import {MapsAdapter} from '../packages/integrations/maps.ts';
import {WhatsAppCloudAdapter} from '../packages/integrations/whatsapp.ts';
import {assertValidationInputBudget} from '../packages/validation/input-budget.ts';
import {validationInputBudgetMiddleware} from '../apps/api/validation-budget.ts';
import type {Request,Response as ExpressResponse} from 'express';

const actor:Actor={userId:'synthetic',companyId:'synthetic',roles:[],permissions:[],siteIds:[],customerIds:[],warehouseIds:[]};
const config:DeepSeekConfig={baseUrl:'https://provider.example.test',apiKey:'synthetic-only',model:'synthetic',timeoutMs:1000,inputPricePerMillionCents:0,outputPricePerMillionCents:0,maxOutputTokens:1000,syntheticOnly:true};
const translationInput={text:'Hello',sourceLanguage:'EN' as const,targetLanguage:'DE' as const,synthetic:true,budgetRemainingCents:100};

describe('untrusted validation work is bounded before Zod',()=>{
 it('rejects an oversized command collection before schema parsing or any transaction',async()=>{
  const transaction=vi.fn(),engine=new Engine({transaction} as unknown as Database,'TEST');
  const schema=z.object({items:z.array(z.object({name:z.string()})).max(10)}),parse=vi.spyOn(schema,'parse');
  engine.registry['qa.validation-budget']={permission:'qa',schema,handler:vi.fn()};
  await expect(engine.execute(actor,'qa.validation-budget',{idempotency_key:'synthetic-key',input:{items:Array(1001).fill(0)}}))
   .rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'VALIDATION_INPUT_LIMIT_EXCEEDED'}});
  expect(parse).not.toHaveBeenCalled();expect(transaction).not.toHaveBeenCalled();
 });

 it('rejects an oversized provider completion without accumulating Zod issues',async()=>{
  const adapter=new DeepSeekAdapter(config,vi.fn(async()=>new Response(JSON.stringify({choices:Array(1001).fill(0)}),{status:200})) as unknown as typeof fetch);
  await expect(adapter.translate(translationInput)).rejects.toMatchObject({code:'AI_INVALID_JSON',details:{reason:'VALIDATION_INPUT_LIMIT_EXCEEDED'}});
 });

 it('rejects an oversized model JSON collection before translation validation',async()=>{
  const content=JSON.stringify({translation:'Hallo',target_language:'DE',preserved_facts:Array(1001).fill(0),needs_clarification:false});
  const adapter=new DeepSeekAdapter(config,vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]}),{status:200})) as unknown as typeof fetch);
  await expect(adapter.translate(translationInput)).rejects.toMatchObject({code:'AI_INVALID_JSON',details:{reason:'VALIDATION_INPUT_LIMIT_EXCEEDED'}});
 });

 it('cancels a chunked provider response beyond the byte limit even without Content-Length',async()=>{
  const cancel=vi.fn();let sent=0;
  const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(65536));sent+=65536;},cancel});
  const adapter=new DeepSeekAdapter(config,vi.fn(async()=>new Response(stream,{status:200})) as unknown as typeof fetch);
  await expect(adapter.translate(translationInput)).rejects.toMatchObject({code:'AI_INVALID_JSON',details:{reason:'PROVIDER_RESPONSE_TOO_LARGE'}});
  expect(cancel).toHaveBeenCalledOnce();expect(sent).toBeLessThanOrEqual(MAX_PROVIDER_JSON_BYTES+2*65536);
 });

 it('rejects a declared oversized provider body before reading it',async()=>{
  const cancel=vi.fn(),stream=new ReadableStream<Uint8Array>({cancel});
  const adapter=new DeepSeekAdapter(config,vi.fn(async()=>new Response(stream,{headers:{'content-length':String(MAX_PROVIDER_JSON_BYTES+1)}})) as unknown as typeof fetch);
  await expect(adapter.translate(translationInput)).rejects.toMatchObject({code:'AI_INVALID_JSON',details:{reason:'PROVIDER_RESPONSE_TOO_LARGE'}});
  expect(cancel).toHaveBeenCalledOnce();
 });

 it('preserves a valid provider translation and usage result',async()=>{
  const body={choices:[{finish_reason:'stop',message:{content:JSON.stringify({translation:'Hallo',target_language:'DE',preserved_facts:[],needs_clarification:false})}}],usage:{prompt_tokens:10,completion_tokens:5}};
  const adapter=new DeepSeekAdapter(config,vi.fn(async()=>new Response(JSON.stringify(body))) as unknown as typeof fetch);
  await expect(adapter.translate(translationInput)).resolves.toMatchObject({text:'Hallo',usage:{input_tokens:10,output_tokens:5,cost_cents:0}});
 });

 it.each(['body','query'] as const)('stops oversized HTTP %s before controllers with a bounded non-sensitive error',field=>{
  const req={[field]:{values:Array(1001).fill('must-not-echo')}} as unknown as Request,next=vi.fn();
  const res={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);
  validationInputBudgetMiddleware(req,res as unknown as ExpressResponse,next);
  expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({code:'VALIDATION_ERROR',details:{reason:'VALIDATION_INPUT_LIMIT_EXCEEDED'}});
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store');
 });

 it('passes ordinary HTTP input through without mutation',()=>{
  const body={items:[{name:'Allowed'}]},req={body,query:{page:'1'}} as unknown as Request,next=vi.fn();
  validationInputBudgetMiddleware(req,{} as ExpressResponse,next);
  expect(next).toHaveBeenCalledWith();expect(req.body).toBe(body);
 });

 it('rejects oversized arrays before visiting their elements',()=>{
  const values=Array(1001),read=vi.fn(()=>0);Object.defineProperty(values,0,{get:read});
  expect(()=>assertValidationInputBudget(values)).toThrow('VALIDATION_ERROR');expect(read).not.toHaveBeenCalled();
 });

 it('bounds objects, total graph size, depth and cycles separately',()=>{
  expect(()=>assertValidationInputBudget(Object.fromEntries(Array.from({length:1001},(_,i)=>[String(i),0])))).toThrow('VALIDATION_ERROR');
  expect(()=>assertValidationInputBudget(Array.from({length:21},()=>Array(1000).fill(0)))).toThrow('VALIDATION_ERROR');
  let deep:unknown=0;for(let i=0;i<21;i++)deep={nested:deep};
  expect(()=>assertValidationInputBudget(deep)).toThrow('VALIDATION_ERROR');
  const cycle:{self?:unknown}={};cycle.self=cycle;
  expect(()=>assertValidationInputBudget(cycle)).toThrow('VALIDATION_ERROR');
 });

 it('preserves boundary-sized arrays, repeated references, optional values and byte-governed strings',()=>{
  const shared={name:'Repeated'};
  expect(()=>assertValidationInputBudget({items:Array(1000).fill(shared),optional:undefined,content:'x'.repeat(1048576)})).not.toThrow();
 });

 it('accepts JSON exactly at the byte limit and rejects invalid UTF-8',async()=>{
  const text='x'.repeat(MAX_PROVIDER_JSON_BYTES-2);
  await expect(readBoundedProviderJson(new Response(JSON.stringify(text)))).resolves.toBe(text);
  await expect(readBoundedProviderJson(new Response(new Uint8Array([0x22,0xff,0x22])))).rejects.toThrow();
 });

 it('keeps Maps unavailable fallback when route collections exceed the structural budget',async()=>{
  const request=vi.fn(async()=>new Response(JSON.stringify({routes:Array(1001).fill(0)})));
  const adapter=new MapsAdapter({apiKey:'synthetic',approvalId:'synthetic'},request as typeof fetch);
  await expect(adapter.route({latitude:52.5,longitude:13.4},{latitude:52.6,longitude:13.5})).resolves.toMatchObject({status:'UNAVAILABLE',source:'UNKNOWN'});
  expect(request).toHaveBeenCalledOnce();
 });

 it('preserves a valid Maps forecast response',async()=>{
  const adapter=new MapsAdapter({apiKey:'synthetic',approvalId:'synthetic'},vi.fn(async()=>new Response(JSON.stringify({routes:[{distanceMeters:1200,duration:'180s'}]}))) as unknown as typeof fetch);
  await expect(adapter.route({latitude:52.5,longitude:13.4},{latitude:52.6,longitude:13.5})).resolves.toMatchObject({status:'AVAILABLE',distance_m:1200,eta_seconds:180});
 });

 it.each([200,429])('keeps oversized WhatsApp receipts UNKNOWN without automatic retry (HTTP %s)',async status=>{
  const request=vi.fn(async()=>new Response(JSON.stringify({messages:Array(1001).fill(0),error:{code:4,message:'synthetic',is_transient:true}}),{status}));
  const adapter=new WhatsAppCloudAdapter({accessToken:'synthetic',phoneNumberId:'123456',apiVersion:'v24.0',accountCapabilitiesVerified:true},request as typeof fetch);
  await expect(adapter.send('49123456789',{kind:'TEXT',text:'synthetic'},{kind:'TEXT'})).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE',details:{provider:'META',retryable:false,failure_class:'UNKNOWN'}});
  expect(request).toHaveBeenCalledOnce();
 });

 it('bounds WhatsApp metadata before any authenticated media download',async()=>{
  const metadata={url:'https://lookaside.fbsbx.com/synthetic',mime_type:'image/jpeg',sha256:'synthetic',file_size:1,extra:Array(1001).fill(0)};
  const request=vi.fn(async()=>new Response(JSON.stringify(metadata)));
  const adapter=new WhatsAppCloudAdapter({accessToken:'synthetic',phoneNumberId:'123456',apiVersion:'v24.0',accountCapabilitiesVerified:true},request as typeof fetch);
  await expect(adapter.media('synthetic-media')).rejects.toBeInstanceOf(ProviderJsonLimitError);
  expect(request).toHaveBeenCalledOnce();
 });

 it('preserves valid WhatsApp metadata, allowed media destination and the independent media byte cap',async()=>{
  const metadata={url:'https://lookaside.fbsbx.com/synthetic',mime_type:'image/jpeg',sha256:'synthetic',file_size:2};
  const request=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(metadata))).mockResolvedValueOnce(new Response(new Uint8Array([1,2])));
  const adapter=new WhatsAppCloudAdapter({accessToken:'synthetic',phoneNumberId:'123456',apiVersion:'v24.0',accountCapabilitiesVerified:true},request as typeof fetch);
  const result=await adapter.media('synthetic-media',2);expect(result.bytes).toEqual(Buffer.from([1,2]));expect(result.metadata).toEqual(metadata);expect(request).toHaveBeenCalledTimes(2);
 });
});
