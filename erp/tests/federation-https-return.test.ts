import {afterEach,describe,expect,it} from 'vitest';
import {request} from 'node:https';
import {connect} from 'node:net';
import {once} from 'node:events';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {federationHttpsReturnReceiver,type FederationHttpsReturnReceiver} from './fixtures/federation-https-return.ts';

const requestId='8f5eea31-f424-40b7-8b08-3c7a8a43c5bb';
const target='/auth/federation/return?request_id='+requestId;
const html=Buffer.from('<!doctype html><html><title>Current synthetic ERP build</title></html>');
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(){
 const temporaryRoot=await mkdtemp(join(tmpdir(),'knaba-https-return-test-'));cleanup.push(()=>rm(temporaryRoot,{recursive:true,force:true}));
 const receiver=await federationHttpsReturnReceiver({requestId,indexHtml:html,temporaryRoot});cleanup.push(()=>receiver.close());return {receiver,temporaryRoot};
}
function incoming(receiver:FederationHttpsReturnReceiver,{path=target,method='GET',headers={},verifyCertificate=false}:{path?:string;method?:string;headers?:Record<string,string>;verifyCertificate?:boolean}={}){
 return new Promise<{status:number;body:Buffer;cacheControl:string|undefined}>((resolve,reject)=>{
  // This bypass is limited to one synthetic Node client request. No process,
  // default agent or browser TLS setting is changed by the transport helper.
  const req=request(receiver.origin,{path,method,headers,agent:false,rejectUnauthorized:verifyCertificate},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1024*1024){req.destroy(new Error('TEST_RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);});
   res.once('error',reject);res.once('end',()=>resolve({status:res.statusCode!,body:Buffer.concat(chunks),cacheControl:res.headers['cache-control']}));
  });
  req.setTimeout(2000,()=>req.destroy(new Error('TEST_REQUEST_TIMEOUT')));req.once('error',reject);req.end();
 });
}

describe('synthetic HTTPS return receiver: Node transport, not browser SameSite or MFA acceptance',()=>{
 it('serves the exact current HTML and records only incoming cookies while removing its PEM files before use',async()=>{
  const before=process.env.NODE_TLS_REJECT_UNAUTHORIZED,{receiver,temporaryRoot}=await fixture();
  expect(new URL(receiver.origin).hostname).toBe('127.0.0.1');expect(await readdir(temporaryRoot)).toEqual([]);
  await expect(incoming(receiver,{verifyCertificate:true})).rejects.toHaveProperty('code','DEPTH_ZERO_SELF_SIGNED_CERT');
  const response=await incoming(receiver,{headers:{Cookie:'fixture-cookie=unchanged'}});
  expect(response.status).toBe(200);expect(response.body.equals(html)).toBe(true);expect(response.cacheControl).toBe('no-store');
  expect(receiver.requests).toEqual([{method:'GET',path:receiver.origin+'/auth/federation/return',target,cookie:'fixture-cookie=unchanged'}]);
  expect(Object.isFrozen(receiver.requests)).toBe(true);expect(Object.isFrozen(receiver.requests[0])).toBe(true);
  expect(receiver.unexpectedRequests).toEqual([]);expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(before);
 });
 it('rejects different methods, paths, query aliases, extra parameters, request IDs and Host',async()=>{
  const {receiver}=await fixture();
  for(const options of [
   {method:'POST'}, {path:'/assets/index.js'}, {path:target+'&extra=true'},
   {path:target.replace('request_id','request%5fid')}, {path:target.replace(requestId,'00000000-0000-0000-0000-000000000000')},
   {headers:{Host:'foreign.invalid'}}
  ]){
   const response=await incoming(receiver,options);expect(response.status).toBe(404);expect(response.body.toString()).toBe('Not found');
  }
  expect(receiver.requests).toEqual([]);expect(receiver.unexpectedRequests).toHaveLength(6);
 });
 it('closes its listening socket and unfinished own TLS connections, with idempotent cleanup',async()=>{
  const {receiver,temporaryRoot}=await fixture(),url=new URL(receiver.origin),socket=connect({host:url.hostname,port:Number(url.port)});
  socket.on('error',()=>{});
  try{
   await once(socket,'connect',{signal:AbortSignal.timeout(2000)});
   const closed=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('TEST_SOCKET_NOT_CLOSED')),2000);socket.once('close',()=>{clearTimeout(timer);resolve();});});
   await receiver.close();await closed;await receiver.close();expect(await readdir(temporaryRoot)).toEqual([]);
   await expect(incoming(receiver)).rejects.toHaveProperty('code','ECONNREFUSED');
  }finally{socket.destroy();}
 });
 it('rejects invalid target or unbounded HTML before creating any certificate files',async()=>{
  const temporaryRoot=await mkdtemp(join(tmpdir(),'knaba-https-return-test-'));cleanup.push(()=>rm(temporaryRoot,{recursive:true,force:true}));
  await expect(federationHttpsReturnReceiver({requestId:'../unexpected',indexHtml:html,temporaryRoot})).rejects.toThrow('INVALID_SYNTHETIC_HTTPS_RETURN');
  await expect(federationHttpsReturnReceiver({requestId,indexHtml:Buffer.alloc(1024*1024+1),temporaryRoot})).rejects.toThrow('INVALID_SYNTHETIC_HTTPS_RETURN');
  expect(await readdir(temporaryRoot)).toEqual([]);
 });
});
