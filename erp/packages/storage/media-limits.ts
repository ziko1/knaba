import {assert} from '../domain/core.ts';

export const PHOTO_BYTE_LIMIT = 10 * 1024 * 1024;
export const PDF_BYTE_LIMIT = 20 * 1024 * 1024;

/** Application ingress limits; a provider may impose a smaller channel limit. */
export function mediaByteLimit(mimeType:string):number {
 if(mimeType==='application/pdf')return PDF_BYTE_LIMIT;
 assert(['image/jpeg','image/png','image/webp'].includes(mimeType),'VALIDATION_ERROR',{reason:'UNSUPPORTED_MEDIA'});
 return PHOTO_BYTE_LIMIT;
}
export function assertMediaSize(bytes:number,mimeType:string):void {
 const limit=mediaByteLimit(mimeType);
 assert(Number.isSafeInteger(bytes)&&bytes>0&&bytes<=limit,'MEDIA_TOO_LARGE',{maxBytes:limit});
}
