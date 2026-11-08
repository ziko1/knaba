import express,{type Request,type Response,type RequestHandler} from 'express';
import type {DatabaseLike} from './auth.ts';
import {assert,DomainError} from '../../packages/domain/core.ts';
import {parseWhatsAppWebhook,verifyWhatsAppSignature} from '../../packages/integrations/whatsapp.ts';

export interface WhatsAppIngressConfiguration {appSecret?:string;phoneNumberId?:string}
/** Mount before global JSON middleware: authenticate bytes before parsing attacker text. */
export function whatsAppRawBody():RequestHandler {
 const raw=express.raw({type:'application/json',limit:'8mb',inflate:false,verify:(req:any,_res,bytes)=>{req.rawBody=bytes;}});
 return (req,res,next)=>raw(req,res,(error?:any)=>{if(error){res.status(error.type==='entity.too.large'?413:400).json({code:'VALIDATION_ERROR'});return;}next();});
}
/** The existing Meta ingress: exact raw signature, pinned account, one durable inbox/outbox. */
export async function acceptWhatsAppWebhook(db:DatabaseLike,companyId:string,raw:Buffer,signature:unknown,config:WhatsAppIngressConfiguration){
 assert(Buffer.isBuffer(raw)&&typeof signature==='string'&&config.appSecret,'ACCESS_DENIED');
 verifyWhatsAppSignature(raw,signature,config.appSecret);
 assert(config.phoneNumberId,'MISSING_CONFIGURATION');
 let body:any;try{body=JSON.parse(raw.toString('utf8'));}catch{throw new DomainError('VALIDATION_ERROR');}
 const values=Array.isArray(body?.entry)?body.entry.flatMap((entry:any)=>Array.isArray(entry?.changes)?entry.changes.map((change:any)=>change?.value):[]):[];
 assert(values.length>0&&values.every((value:any)=>value?.metadata?.phone_number_id===config.phoneNumberId),'ACCESS_DENIED');
 const events=parseWhatsAppWebhook(body); // Transfer text becomes a hash before either durable write.
 await db.transaction(companyId,'WHATSAPP_INBOX',async tx=>{
  assert(tx.query,'MISSING_CONFIGURATION');
  for(const event of events){const eventId=event.kind==='STATUS'?`${event.id}:${event.status}:${event.received_at}`:event.id;
   const inserted=await tx.query('INSERT INTO webhook_inbox(provider,event_id,company_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id',['WHATSAPP',eventId,companyId,JSON.stringify(event)]);
   if(inserted.rows.length)await tx.event('whatsapp.inbound',{provider:'WHATSAPP',event_id:eventId});
  }
 });return {accepted:true};
}
export function whatsAppIngressHandler(db:DatabaseLike,companyId:string,configuration:()=>WhatsAppIngressConfiguration){
 return async(req:Request&{rawBody?:Buffer},res:Response)=>{
  try{const result=await acceptWhatsAppWebhook(db,companyId,req.rawBody!,req.headers['x-hub-signature-256'],configuration());res.status(200).json(result);}
  catch(error){const code=error instanceof DomainError?error.code:'DEPENDENCY_UNAVAILABLE';res.status(code==='ACCESS_DENIED'?401:code==='MISSING_CONFIGURATION'||code==='DEPENDENCY_UNAVAILABLE'?503:400).json({code});}
 };
}
