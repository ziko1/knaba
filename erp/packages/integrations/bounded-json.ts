import {assertValidationInputBudget} from '../validation/input-budget.ts';

export const MAX_PROVIDER_JSON_BYTES=262144;
export class ProviderJsonLimitError extends Error {
 constructor(readonly reason:'PROVIDER_RESPONSE_TOO_LARGE'|'VALIDATION_INPUT_LIMIT_EXCEEDED'){
  super(reason);this.name='ProviderJsonLimitError';
 }
}

/** Small provider JSON only, never media bytes. Callers retain their own
 * unavailable/unknown-outcome policy; a malformed receipt is not a rejection. */
export async function readBoundedProviderJson(response:Response):Promise<unknown>{
 const tooLarge=()=>new ProviderJsonLimitError('PROVIDER_RESPONSE_TOO_LARGE');
 if(Number(response.headers.get('content-length'))>MAX_PROVIDER_JSON_BYTES){await response.body?.cancel().catch(()=>{});throw tooLarge();}
 const reader=response.body?.getReader();if(!reader)throw new Error('INVALID_PROVIDER_JSON');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>MAX_PROVIDER_JSON_BYTES){await reader.cancel().catch(()=>{});throw tooLarge();}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
 try{assertValidationInputBudget(value);}catch{throw new ProviderJsonLimitError('VALIDATION_INPUT_LIMIT_EXCEEDED');}
 return value;
}
