import {assertMediaSize} from './media-limits.ts';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {assert,DomainError,type Actor,type Transaction} from '../domain/core.ts';
import {permits} from '../domain/identity.ts';
import {scanPdf} from '../integrations/media-scanner.ts';
import type {PrivateBlobStore,BlobSql} from './index.ts';

export interface PrivateMediaInput {bytes:Buffer;mimeType:string;fileName:string;sourceId:string;expectedSha256?:string;redactionConfirmed?:boolean;}
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export async function preparePrivateMedia(input:PrivateMediaInput){
 assertMediaSize(input.bytes.length,input.mimeType);
 assert(['image/jpeg','image/png','image/webp','application/pdf'].includes(input.mimeType),'VALIDATION_ERROR',{reason:'UNSUPPORTED_MEDIA'});
 assert(input.fileName.length>0&&input.fileName.length<=200&&input.sourceId.length>0&&input.sourceId.length<=250,'VALIDATION_ERROR');
 const sha256=hash(input.bytes);
 if(input.expectedSha256)assert(input.expectedSha256===sha256||input.expectedSha256===Buffer.from(sha256,'hex').toString('base64'),'VALIDATION_ERROR',{reason:'PROVIDER_MEDIA_CHECKSUM_MISMATCH'});
 if(input.mimeType==='application/pdf'){const scan=await scanPdf(input.bytes);return {original:input.bytes,clean:input.bytes,mimeType:input.mimeType,clientMimeType:input.mimeType,sha256,clientSha256:sha256,metadataStripped:false,scanMethod:scan.method};}
 try{
  const metadata=await sharp(input.bytes,{limitInputPixels:24_000_000}).metadata();
  assert(({jpeg:'image/jpeg',png:'image/png',webp:'image/webp'} as Record<string,string>)[metadata.format??'']===input.mimeType,'VALIDATION_ERROR',{reason:'MIME_SIGNATURE_MISMATCH'});
  const clean=await sharp(input.bytes,{limitInputPixels:24_000_000}).rotate().jpeg({quality:88}).toBuffer();
  return {original:input.bytes,clean,mimeType:input.mimeType,clientMimeType:'image/jpeg',sha256,clientSha256:hash(clean),metadataStripped:true,scanMethod:'DECODE_AND_REENCODE_IMAGE'};
 }catch(error){if(error instanceof DomainError)throw error;throw new DomainError('VALIDATION_ERROR',{reason:'INVALID_IMAGE'});}
}
/** Caller obtains a fresh actor inside the company transaction. Files remain private until media.register and separate publication approval. */
export async function ingestPrivateMedia(tx:Transaction&BlobSql,storage:PrivateBlobStore,actor:Actor,input:PrivateMediaInput,prepared:Awaited<ReturnType<typeof preparePrivateMedia>>){
 assert(permits(actor.permissions,'media.upload'),'ACCESS_DENIED');
 assert(prepared.sha256===hash(input.bytes),'VALIDATION_ERROR',{reason:'PREPARED_MEDIA_MISMATCH'});
 const uploadId=createHash('sha256').update(JSON.stringify([actor.companyId,actor.userId,'private-media',input.sourceId])).digest('hex');
 const clientKey=createHash('sha256').update(uploadId+':sanitized').digest('hex');
 const previous=(await tx.list('media_upload')).find(u=>u.id===uploadId);
 if(previous){assert(previous.data.uploadedBy===actor.userId&&previous.data.sha256===prepared.sha256&&previous.data.mimeType===input.mimeType,'DUPLICATE_EFFECT');return previous;}
 await storage.put({id:uploadId,companyId:actor.companyId,ownerId:actor.userId,bytes:prepared.original,mimeType:prepared.mimeType,sha256:prepared.sha256},tx);
 await storage.put({id:clientKey,companyId:actor.companyId,ownerId:actor.userId,bytes:prepared.clean,mimeType:prepared.clientMimeType,sha256:prepared.clientSha256},tx);
 const upload=await tx.add('media_upload',{uploadedBy:actor.userId,blobKey:uploadId,clientBlobKey:clientKey,sha256:prepared.sha256,clientSha256:prepared.clientSha256,mimeType:prepared.mimeType,clientMimeType:prepared.clientMimeType,byteSize:prepared.original.length,clientByteSize:prepared.clean.length,fileName:input.fileName,scanState:'CLEAN',scanMethod:prepared.scanMethod,metadataStripped:prepared.metadataStripped,redactionConfirmed:input.redactionConfirmed===true,redactionConfirmedBy:input.redactionConfirmed?actor.userId:undefined,originalPreserved:true,sourceId:input.sourceId},uploadId);
 await tx.event('media.uploaded',{uploadId,sha256:prepared.sha256,ownerId:actor.userId});return upload;
}
