import {execFile} from 'node:child_process';
import {chmod,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer,type Server} from 'node:https';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Duplex} from 'node:stream';
import {promisify} from 'node:util';

const run=promisify(execFile);
const certificateTimeout=10000,requestTimeout=5000,closeTimeout=2000;
export interface FederationReturnRequest {
 readonly method:string;
 readonly path:string;
 readonly target:string;
 readonly cookie:string;
}
export interface FederationHttpsReturnReceiver {
 readonly origin:string;
 readonly requests:ReadonlyArray<FederationReturnRequest>;
 readonly unexpectedRequests:ReadonlyArray<{method:string;path:string}>;
 close():Promise<void>;
}

/** Synthetic loopback transport only. This certificate is not public TLS trust. */
export async function federationHttpsReturnReceiver(options:{requestId:string;indexHtml:Buffer;temporaryRoot?:string}):Promise<FederationHttpsReturnReceiver>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(options.requestId)||!Buffer.isBuffer(options.indexHtml)||options.indexHtml.length===0||options.indexHtml.length>1024*1024)throw new Error('INVALID_SYNTHETIC_HTTPS_RETURN');
 const html=Buffer.from(options.indexHtml),target='/auth/federation/return?request_id='+options.requestId;
 const directory=await mkdtemp(join(options.temporaryRoot??tmpdir(),'knaba-federation-return-'));
 let server:Server|undefined,origin='',closing:Promise<void>|undefined;
 const sockets=new Set<Duplex>(),requests:FederationReturnRequest[]=[],unexpectedRequests:Array<{method:string;path:string}>=[];
 const close=()=>closing??=(async()=>{
  try{
   if(server){
    const own=server;
    await new Promise<void>((resolve,reject)=>{
     const timer=setTimeout(()=>reject(new Error('SYNTHETIC_HTTPS_CLOSE_TIMEOUT')),closeTimeout);timer.unref();
     own.close(error=>{clearTimeout(timer);if(error&&(!('code'in error)||error.code!=='ERR_SERVER_NOT_RUNNING'))reject(new Error('SYNTHETIC_HTTPS_CLOSE_FAILED'));else resolve();});
     own.closeAllConnections();for(const socket of sockets)socket.destroy();
    });
   }
  }finally{await rm(directory,{recursive:true,force:true});}
 })();
 try{
  await chmod(directory,0o700);
  const keyPath=join(directory,'key.pem'),certificatePath=join(directory,'certificate.pem');
  try{
   await run('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-days','1','-nodes','-keyout',keyPath,'-out',certificatePath,'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{timeout:certificateTimeout,maxBuffer:64*1024,windowsHide:true});
  }catch{throw new Error('SYNTHETIC_HTTPS_CERTIFICATE_UNAVAILABLE');}
  await chmod(keyPath,0o600);
  const [key,cert]=await Promise.all([readFile(keyPath),readFile(certificatePath)]);
  try{
   server=createServer({key,cert,handshakeTimeout:requestTimeout,maxHeaderSize:16*1024},(req,res)=>{
    const method=req.method??'',receivedTarget=req.url??'',path=receivedTarget.split('?')[0];
    if(method!=='GET'||receivedTarget!==target||req.headers.host!==new URL(origin).host){
     unexpectedRequests.push(Object.freeze({method,path}));res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'no-store','Connection':'close'});res.end('Not found');return;
    }
    // Record only bytes actually received by this listener. Nothing forwards
    // or synthesizes a Cookie header from the intercepted source request.
    requests.push(Object.freeze({method,path:origin+path,target:receivedTarget,cookie:req.headers.cookie??''}));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length,'Cache-Control':'no-store','Referrer-Policy':'strict-origin','Connection':'close'});res.end(html);
   });
  }finally{key.fill(0);cert.fill(0);}
  // The TLS context has consumed the PEM bytes; no key file survives startup.
  await rm(directory,{recursive:true,force:true});
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.headersTimeout=requestTimeout;server.requestTimeout=requestTimeout;server.keepAliveTimeout=1000;server.maxConnections=4;
  server.setTimeout(requestTimeout,socket=>socket.destroy());
  await new Promise<void>((resolve,reject)=>{
   const own=server!,timer=setTimeout(()=>reject(new Error('SYNTHETIC_HTTPS_LISTEN_TIMEOUT')),requestTimeout);timer.unref();
   const fail=()=>{clearTimeout(timer);reject(new Error('SYNTHETIC_HTTPS_LISTEN_FAILED'));};own.once('error',fail);
   own.listen(0,'127.0.0.1',()=>{clearTimeout(timer);own.off('error',fail);origin='https://127.0.0.1:'+(own.address() as AddressInfo).port;resolve();});
  });
  return {origin,get requests(){return Object.freeze([...requests]);},get unexpectedRequests(){return Object.freeze([...unexpectedRequests]);},close};
 }catch(error){await close();throw error;}
}
