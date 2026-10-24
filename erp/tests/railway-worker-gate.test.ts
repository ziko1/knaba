import {describe,it,expect,vi} from 'vitest';
import {waitForExpectedApi,verifyWorkerRelease,INTERNAL_API_ORIGIN} from '../scripts/railway-worker-start.mjs';
const sha='a'.repeat(40);
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
describe('Railway worker startup gate (explicitly mocked internal HTTP transport)',()=>{
 it('accepts observed clean Git sources and explicitly distinguishes a pinned Docker context',()=>{
  expect(verifyWorkerRelease({code_sha:sha,source_dirty:false},sha).sourceDirty).toBe(false);
  expect(verifyWorkerRelease({code_sha:sha,source_dirty:null,source_provenance:'PINNED_CONTAINER_CONTEXT'},sha)).toMatchObject({sourceDirty:null,sourceProvenance:'PINNED_CONTAINER_CONTEXT'});
 });
 it.each([{code_sha:sha,source_dirty:true},{code_sha:sha,source_dirty:null,source_provenance:'UNATTESTED'},{code_sha:sha},{code_sha:'b'.repeat(40),source_dirty:false}])('rejects dirty, unattested or mismatching worker sources %j',release=>{expect(()=>verifyWorkerRelease(release,sha)).toThrow();});
 it('starts only after exact expected API source, mode and readiness',async()=>{
  const request=vi.fn(async(url:string)=>url.endsWith('/ready')?response({ready:true}):response({gitSha:sha,mode:'DEMO'}));
  expect(await waitForExpectedApi({expectedSha:sha,request})).toEqual({ready:true,expectedSha:sha,mode:'DEMO'});
  expect(request.mock.calls.map(c=>c[0])).toEqual([INTERNAL_API_ORIGIN+'/api/v1/ready',INTERNAL_API_ORIGIN+'/api/v1/version']);
 });
 it.each([{ready:false},{ready:true,wrongSha:true},{ready:true,wrongMode:true}])('never starts before valid version: %j',async scenario=>{
  let now=0;const request=vi.fn(async(url:string)=>url.endsWith('/ready')?response({ready:scenario.ready}):response({gitSha:scenario.wrongSha?'b'.repeat(40):sha,mode:scenario.wrongMode?'PRODUCTION':'DEMO'}));
  await expect(waitForExpectedApi({expectedSha:sha,request,now:()=>now,wait:async(ms:number)=>{now+=ms;},deadlineMs:2000})).rejects.toThrow('STAGING_API_SOURCE_NOT_READY');
 });
 it('cancels before network or child work',async()=>{const request=vi.fn();await expect(waitForExpectedApi({expectedSha:sha,request,stopped:()=>true})).rejects.toThrow('STAGING_WORKER_START_CANCELLED');expect(request).not.toHaveBeenCalled();});
 it.each(['0'.repeat(40),'bad',''])('rejects invalid source before requests',async expectedSha=>{const request=vi.fn();await expect(waitForExpectedApi({expectedSha,request})).rejects.toThrow('INVALID_STAGING_WORKER_GATE');expect(request).not.toHaveBeenCalled();});
 it('bounds unavailable/redirected transport without logging credentials',async()=>{let now=0;const request=vi.fn(async()=>{throw Error('private transport unavailable');});await expect(waitForExpectedApi({expectedSha:sha,request,now:()=>now,wait:async(ms:number)=>{now+=ms;},deadlineMs:1000})).rejects.toThrow('STAGING_API_SOURCE_NOT_READY');expect(request).toHaveBeenCalledTimes(1);});
});
