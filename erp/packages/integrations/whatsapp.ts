import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { assert, DomainError } from '../domain/core.ts';

export function verifyWhatsAppChallenge(query:Record<string,unknown>,verifyToken:string) {
  assert(verifyToken.length>=16,'MISSING_CONFIGURATION');
  const token=String(query['hub.verify_token']??'');const a=Buffer.from(token),b=Buffer.from(verifyToken);
  assert(query['hub.mode']==='subscribe'&&a.length===b.length&&timingSafeEqual(a,b),'ACCESS_DENIED');
  const challenge=String(query['hub.challenge']??'');assert(/^\d{1,100}$/.test(challenge),'VALIDATION_ERROR');return challenge;
}
/** Meta signs the exact HTTP bytes. Parsing or reserializing before this check is unsafe. */
export function verifyWhatsAppSignature(rawBody:Buffer,signature:string|undefined,appSecret:string) {
  assert(appSecret.length>=16,'MISSING_CONFIGURATION');
  if(!signature||!/^sha256=[a-fA-F0-9]{64}$/.test(signature))throw new DomainError('ACCESS_DENIED');
  const expected=createHmac('sha256',appSecret).update(rawBody).digest();const actual=Buffer.from(signature.slice(7),'hex');
  assert(actual.length===expected.length&&timingSafeEqual(actual,expected),'ACCESS_DENIED');return true;
}
const waMessage=z.object({id:z.string().min(1).max(200),from:z.string().regex(/^\d{5,20}$/),timestamp:z.string().regex(/^\d{1,12}$/),type:z.string().min(1).max(50),text:z.object({body:z.string().max(16000)}).optional(),context:z.object({id:z.string().max(200).optional(),from:z.string().max(30).optional()}).optional(),interactive:z.object({type:z.string(),button_reply:z.object({id:z.string().max(256),title:z.string().max(100)}).optional(),list_reply:z.object({id:z.string().max(256),title:z.string().max(100),description:z.string().max(200).optional()}).optional()}).optional(),button:z.object({payload:z.string().max(256),text:z.string().max(100)}).optional(),image:z.object({id:z.string().max(200),mime_type:z.string().max(100),sha256:z.string().max(100),caption:z.string().max(2000).optional()}).optional(),document:z.object({id:z.string().max(200),mime_type:z.string().max(100),sha256:z.string().max(100),filename:z.string().max(255).optional(),caption:z.string().max(2000).optional()}).optional(),audio:z.object({id:z.string().max(200),mime_type:z.string().max(100),sha256:z.string().max(100)}).optional(),location:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),name:z.string().max(200).optional(),address:z.string().max(500).optional()}).optional()}).passthrough();
const waStatus=z.object({id:z.string().min(1).max(200),status:z.enum(['sent','delivered','read','failed']),timestamp:z.string().regex(/^\d{1,12}$/),recipient_id:z.string().max(30),errors:z.array(z.object({code:z.number(),title:z.string().max(300).optional()}).passthrough()).optional()}).passthrough();
const envelope=z.object({object:z.literal('whatsapp_business_account'),entry:z.array(z.object({id:z.string().max(100),changes:z.array(z.object({field:z.string().max(100),value:z.object({messaging_product:z.literal('whatsapp').optional(),metadata:z.object({phone_number_id:z.string().max(100),display_phone_number:z.string().max(100).optional()}).optional(),messages:z.array(waMessage).max(100).optional(),statuses:z.array(waStatus).max(100).optional()}).passthrough()})).max(100)})).max(100)});
export type WhatsAppInbound = {kind:'MESSAGE';id:string;phone_number_id:string;sender:string;received_at:string;type:string;text?:string;action_id?:string;context_message_id?:string;media?:{id:string;mime_type:string;sha256:string;filename?:string;caption?:string};location?:{latitude:number;longitude:number;name?:string;address?:string}} | {kind:'STATUS';id:string;phone_number_id:string;recipient:string;received_at:string;status:'SENT'|'DELIVERED'|'READ'|'FAILED';error_code?:number};
export function parseWhatsAppWebhook(raw:unknown):WhatsAppInbound[] {
  const parsed=envelope.safeParse(raw);assert(parsed.success,'VALIDATION_ERROR',{source:'META_WEBHOOK'});const output:WhatsAppInbound[]=[];
  for(const entry of parsed.data.entry)for(const change of entry.changes){if(change.field!=='messages')continue;const {value}=change;assert(value.metadata?.phone_number_id,'VALIDATION_ERROR');
    for(const m of value.messages??[]){const media=m.image??m.document??m.audio;
      if(m.type==='text')assert(m.text,'VALIDATION_ERROR');if(m.type==='interactive')assert(m.interactive?.button_reply||m.interactive?.list_reply,'VALIDATION_ERROR');
      output.push({kind:'MESSAGE',id:m.id,phone_number_id:value.metadata.phone_number_id,sender:m.from,received_at:new Date(Number(m.timestamp)*1000).toISOString(),type:m.type,...m.text?{text:m.text.body}:{},...m.context?.id?{context_message_id:m.context.id}:{},...m.interactive?.button_reply?{action_id:m.interactive.button_reply.id}:{},...m.interactive?.list_reply?{action_id:m.interactive.list_reply.id}:{},...m.button?{action_id:m.button.payload}:{},...media?{media}:{},...m.location?{location:m.location}:{}});
    }
    for(const status of value.statuses??[])output.push({kind:'STATUS',id:status.id,phone_number_id:value.metadata.phone_number_id,recipient:status.recipient_id,received_at:new Date(Number(status.timestamp)*1000).toISOString(),status:status.status.toUpperCase() as 'SENT'|'DELIVERED'|'READ'|'FAILED',...status.errors?.[0]?{error_code:status.errors[0].code}:{}});
  }
  return output;
}
export type WhatsAppOutput={kind:'TEXT';text:string;reply_to?:string}|{kind:'BUTTONS';text:string;buttons:{id:string;title:string}[]}|{kind:'LIST';text:string;button:string;sections:{title:string;rows:{id:string;title:string;description?:string}[]}[]}|{kind:'TEMPLATE';name:string;language:string;approved:true;parameters?:string[]}|{kind:'IMAGE'|'DOCUMENT';media_id:string;caption?:string;filename?:string};
export function renderWhatsAppMessage(to:string,message:WhatsAppOutput):Record<string,unknown> {
  assert(/^\d{5,20}$/.test(to),'VALIDATION_ERROR');const base={messaging_product:'whatsapp',recipient_type:'individual',to};
  switch(message.kind){
    case 'TEXT':assert(message.text.length>0&&message.text.length<=4096,'VALIDATION_ERROR');return {...base,type:'text',text:{preview_url:false,body:message.text},...message.reply_to?{context:{message_id:message.reply_to}}:{}};
    case 'BUTTONS':assert(message.text.length>0&&message.text.length<=1024&&message.buttons.length>=1&&message.buttons.length<=3,'VALIDATION_ERROR');assert(message.buttons.every(b=>b.id.length<=256&&b.id.length>0&&b.title.length>0&&b.title.length<=20)&&new Set(message.buttons.map(b=>b.id)).size===message.buttons.length,'VALIDATION_ERROR');return {...base,type:'interactive',interactive:{type:'button',body:{text:message.text},action:{buttons:message.buttons.map(b=>({type:'reply',reply:{id:b.id,title:b.title}}))}}};
    case 'LIST':assert(message.text.length>0&&message.text.length<=1024&&message.button.length>0&&message.button.length<=20&&message.sections.length>0&&message.sections.length<=10,'VALIDATION_ERROR');const rows=message.sections.flatMap(s=>s.rows);assert(rows.length>0&&rows.length<=10&&message.sections.every(s=>s.title.length<=24)&&rows.every(r=>r.id.length>0&&r.id.length<=200&&r.title.length>0&&r.title.length<=24&&(!r.description||r.description.length<=72))&&new Set(rows.map(r=>r.id)).size===rows.length,'VALIDATION_ERROR');return {...base,type:'interactive',interactive:{type:'list',body:{text:message.text},action:{button:message.button,sections:message.sections}}};
    case 'TEMPLATE':assert(message.approved&&/^[a-z0-9_]{1,512}$/.test(message.name)&&/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(message.language),'NEEDS_APPROVAL');return {...base,type:'template',template:{name:message.name,language:{code:message.language},...message.parameters?.length?{components:[{type:'body',parameters:message.parameters.map(text=>({type:'text',text}))}]}:{}}};
    case 'IMAGE':case 'DOCUMENT':assert(message.media_id.length>0&&(!message.caption||message.caption.length<=1024),'VALIDATION_ERROR');return {...base,type:message.kind.toLowerCase(),[message.kind.toLowerCase()]:{id:message.media_id,...message.caption?{caption:message.caption}:{},...message.kind==='DOCUMENT'&&message.filename?{filename:message.filename}:{}}};
  }
}
export class WhatsAppCloudAdapter {
  private origin='https://graph.facebook.com';
  constructor(private config:{accessToken:string;phoneNumberId:string;apiVersion:string;accountCapabilitiesVerified:boolean;timeoutMs?:number},private request:typeof fetch=fetch){assert(/^v\d+\.\d+$/.test(config.apiVersion)&&/^\d+$/.test(config.phoneNumberId)&&config.accessToken.length>0,'MISSING_CONFIGURATION');}
  get phoneNumberId(){return this.config.phoneNumberId;}
  async send(to:string,message:WhatsAppOutput,policy:{kind:'TEXT'|'TEMPLATE';template?:string}) {
    assert(this.config.accountCapabilitiesVerified,'NEEDS_APPROVAL');
    assert(policy.kind==='TEXT'||message.kind==='TEMPLATE'&&message.name===policy.template,'WHATSAPP_WINDOW_CLOSED');
    const body=JSON.stringify(renderWhatsAppMessage(to,message));
    try {const response=await this.request(`${this.origin}/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${this.config.accessToken}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(this.config.timeoutMs??15000)});
      const data=await response.json();
      if(!response.ok){
        // A timeout, proxy page or malformed error does not establish that Meta rejected the send.
        const rejection=z.object({error:z.object({code:z.number().int(),message:z.string().min(1),is_transient:z.boolean().optional()})}).safeParse(data);
        const confirmed=rejection.success&&!('messages' in data),transient=confirmed&&(rejection.data.error.is_transient??(response.status===429||response.status>=500));
        throw new DomainError('PROVIDER_UNAVAILABLE',{provider:'META',status:response.status,retryable:transient,failure_class:confirmed?(transient?'CONFIRMED_TRANSIENT':'DEFINITIVE'):'UNKNOWN',...rejection.success?{provider_error_code:rejection.data.error.code}:{}});
      }
      const accepted=z.object({messages:z.array(z.object({id:z.string().min(1)})).min(1)}).parse(data);return {provider_message_id:accepted.messages[0]!.id,status:'API_ACCEPTED' as const};
    }catch(error){if(error instanceof DomainError)throw error;throw new DomainError('PROVIDER_UNAVAILABLE',{provider:'META',retryable:false,failure_class:'UNKNOWN'});}
  }

  async media(mediaId:string,maxBytes=20*1024*1024) {
    assert(this.config.accountCapabilitiesVerified&&/^[A-Za-z0-9_-]{1,200}$/.test(mediaId),'NEEDS_APPROVAL');
    const metadataResponse=await this.request(`${this.origin}/${this.config.apiVersion}/${mediaId}`,{headers:{Authorization:`Bearer ${this.config.accessToken}`},signal:AbortSignal.timeout(15000)});assert(metadataResponse.ok,'PROVIDER_UNAVAILABLE');
    const metadata=z.object({url:z.string().url(),mime_type:z.string(),sha256:z.string(),file_size:z.number().int().nonnegative()}).parse(await metadataResponse.json());assert(metadata.file_size<=maxBytes,'MEDIA_TOO_LARGE');
    const url=new URL(metadata.url);assert(url.protocol==='https:'&&(url.hostname==='lookaside.fbsbx.com'||url.hostname.endsWith('.facebook.com')||url.hostname.endsWith('.fbcdn.net')),'ACCESS_DENIED');
    const response=await this.request(url,{headers:{Authorization:`Bearer ${this.config.accessToken}`},redirect:'error',signal:AbortSignal.timeout(15000)});assert(response.ok,'PROVIDER_UNAVAILABLE');
    const stream=response.body?.getReader();assert(stream,'PROVIDER_UNAVAILABLE');const chunks:Uint8Array[]=[];let total=0;
    try{for(;;){const {done,value}=await stream.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await stream.cancel();throw new DomainError('MEDIA_TOO_LARGE');}chunks.push(value);}}finally{stream.releaseLock();}
    return {bytes:Buffer.concat(chunks),metadata};
  }
}
