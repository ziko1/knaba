import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import {assert,DomainError} from '../domain/core.ts';
import {selectIntegrationCredential,signIntegrationEvent,type IntegrationCredential} from './generic-events.ts';

export function publicIntegrationAddress(address:string):boolean{
 if(isIP(address)===4){const octets=address.split('.').map(Number),[a,b,c]=octets as [number,number,number,number];return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&[0,2].includes(c)||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(isIP(address)===6){const normalized=new URL('https://['+address+']/').hostname.slice(1,-1).toLowerCase(),[first,second]=normalized.split(':');return /^[23][0-9a-f]{3}$/.test(first??'')&&!(first==='2001'&&(parseInt(second||'0',16)<0x200||second==='db8'))&&first!=='2002'&&first!=='3ffe'&&first!=='3fff';}
 return false;
}
export function validateIntegrationWebhookUrl(value:string):URL{
 let url:URL;try{url=new URL(value);}catch{throw new DomainError('VALIDATION_ERROR',{reason:'INVALID_INTEGRATION_ENDPOINT'});}
 const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search&&(!url.port||url.port==='443')&&host.length>0&&!host.endsWith('.')&&!['localhost','metadata.google.internal'].includes(host)&&!/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)&&(!isIP(host)||publicIntegrationAddress(host)),'VALIDATION_ERROR',{reason:'UNSAFE_INTEGRATION_ENDPOINT'});
 return url;
}
export interface ResolvedIntegrationAddress{address:string;family:4|6;}
export type IntegrationAddressResolver=(hostname:string)=>Promise<ResolvedIntegrationAddress[]>;
export interface IntegrationWebhookRequest{url:URL;address:ResolvedIntegrationAddress;body:Buffer;headers:Record<string,string>;timeoutMs:number;}
export type IntegrationWebhookTransport=(request:IntegrationWebhookRequest)=>Promise<{status:number;receiptId?:string}>;
export interface IntegrationWebhookOutcome{status:'API_ACCEPTED'|'FAILED'|'UNKNOWN';error?:string;responseStatus?:number;providerReceiptId?:string;}
/** TLS still verifies the configured hostname; lookup is pinned to the checked address. No redirects. */
export const pinnedIntegrationHttpsTransport:IntegrationWebhookTransport=async input=>new Promise((resolve,reject)=>{
 let finished=false;const done=(error?:Error,result?:{status:number;receiptId?:string})=>{if(finished)return;finished=true;error?reject(error):resolve(result!);};
 // Explicit family also disables Node's automatic multi-address lookup mode.
 const host=input.url.hostname.replace(/^\[|\]$/g,'');const req=httpsRequest(input.url,{method:'POST',headers:input.headers,agent:false,family:input.address.family,servername:isIP(host)?undefined:host,signal:AbortSignal.timeout(input.timeoutMs),lookup:((_hostname:any,_options:any,callback:any)=>callback(null,input.address.address,input.address.family)) as any},res=>{
  let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>8192){res.destroy();done(new Error('RESPONSE_LIMIT'));}});res.on('error',error=>done(error));
  res.on('end',()=>{const receipt=res.headers['x-provider-receipt-id'];done(undefined,{status:res.statusCode??0,...typeof receipt==='string'&&receipt.length<=200?{receiptId:receipt}:{}});});
 });req.on('error',error=>done(error));req.end(input.body);
});
export class IntegrationWebhookAdapter{
 constructor(private credentials:IntegrationCredential[],private options:{liveSendAllowed:boolean;timeoutMs?:number;now?:()=>number;resolve?:IntegrationAddressResolver;transport?:IntegrationWebhookTransport}){}
 async send(companyId:string,source:string,keyId:string,endpoint:string,envelope:unknown,beforeSend?:()=>Promise<void>):Promise<IntegrationWebhookOutcome>{
  if(!this.options.liveSendAllowed)return {status:'FAILED',error:'PROVIDER_DISABLED'};
  const now=(this.options.now??Date.now)(),timeoutMs=this.options.timeoutMs??10000;
  let url:URL,credential:IntegrationCredential,addresses:ResolvedIntegrationAddress[],body:Buffer;
  try{
   assert(Number.isInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=15000,'VALIDATION_ERROR');url=validateIntegrationWebhookUrl(endpoint);credential=selectIntegrationCredential(this.credentials,source,keyId,now);assert(credential.companyId===companyId,'ACCESS_DENIED');
   body=Buffer.from(JSON.stringify(envelope));const host=url.hostname.replace(/^\[|\]$/g,'');
   const resolve=this.options.resolve??(async hostname=>(await lookup(hostname,{all:true,verbatim:true})).map(entry=>({address:entry.address,family:entry.family as 4|6})));let timer:ReturnType<typeof setTimeout>|undefined;
   try{addresses=isIP(host)?[{address:host,family:isIP(host) as 4|6}]:await Promise.race([resolve(host),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('DNS_TIMEOUT')),timeoutMs);})]);}finally{if(timer)clearTimeout(timer);}
   assert(addresses.length>0&&addresses.length<=20&&addresses.every(entry=>[4,6].includes(entry.family)&&isIP(entry.address)===entry.family&&publicIntegrationAddress(entry.address)),'ACCESS_DENIED');
  }catch{return {status:'FAILED',error:'OUTBOUND_PREFLIGHT_REJECTED'};}
  const currentNow=(this.options.now??Date.now)(),timestamp=String(Math.floor(currentNow/1000));let signature:string;try{credential=selectIntegrationCredential(this.credentials,source,keyId,currentNow);assert(credential.companyId===companyId,'ACCESS_DENIED');signature=signIntegrationEvent(body!,timestamp,credential.secret);await beforeSend?.();}catch{return {status:'FAILED',error:'OUTBOUND_PREFLIGHT_REJECTED'};}
  const headers={'content-type':'application/json','content-length':String(body!.byteLength),'x-knaba-key-id':keyId,'x-knaba-timestamp':timestamp,'x-knaba-signature':signature};
  try{
   const result=await (this.options.transport??pinnedIntegrationHttpsTransport)({url:url!,address:addresses![0]!,body:body!,headers,timeoutMs});
   if(result.status>=200&&result.status<300)return {status:'API_ACCEPTED',responseStatus:result.status,...result.receiptId?{providerReceiptId:result.receiptId}:{}};
   if([400,401,403,404,405,406,409,410,413,415,422].includes(result.status)||result.status>=300&&result.status<400)return {status:'FAILED',error:'PROVIDER_REJECTED',responseStatus:result.status};
   return {status:'UNKNOWN',error:'PROVIDER_OUTCOME_UNKNOWN',responseStatus:result.status};
  }catch{return {status:'UNKNOWN',error:'PROVIDER_OUTCOME_UNKNOWN'};}
 }
}
