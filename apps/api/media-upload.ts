import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {assert,type Actor} from '../../packages/domain/core.ts';
import {permits} from '../../packages/domain/identity.ts';
import type {PrivateBlobStore,BlobSql} from '../../packages/storage/index.ts';
import type {EngineLike,SqlTransaction} from './auth.ts';

export const mediaUploadSchema=z.object({base64:z.string().min(1).max(28*1024*1024),mimeType:z.enum(['image/jpeg','image/png','image/webp','application/pdf']),fileName:z.string().min(1).max(200),redactionConfirmed:z.boolean().default(false)}).strict();
const receiptSchema=z.object({uploadId:z.string().min(1).max(128),byteSize:z.number().int().positive(),metadataStripped:z.boolean(),scanState:z.literal('CLEAN')}).strict();
export type MediaUploadResult=z.infer<typeof receiptSchema>;
export interface UploadPayload {original:Buffer;mimeType:string;fileName:string;redactionConfirmed:boolean;}
export interface PreparedUpload {clean:Buffer;clientMimeType:string;metadataStripped:boolean;scanMethod:string;}
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const sorted=(values:string[])=>[...new Set(values)].sort();
export function mediaUploadKey(value:unknown,required:boolean):string|undefined{return value===undefined&&!required?undefined:z.string().min(8).max(200).regex(/^[!-~]+$/).parse(value);}
export function mediaUploadHash(payload:UploadPayload){return hash(JSON.stringify({v:1,originalSha256:hash(payload.original),mimeType:payload.mimeType,fileName:payload.fileName,redactionConfirmed:payload.redactionConfirmed}));}
export async function authorizeMediaUpload(tx:SqlTransaction,engine:EngineLike,actor:Actor){
 assert(engine.actorIn&&engine.scope,'MISSING_CONFIGURATION',{reason:'FRESH_UPLOAD_AUTHORITY_REQUIRED'});
 const current=engine.scope(await engine.actorIn(tx,actor.userId),'media.upload');
 assert(current.companyId===actor.companyId&&current.userId===actor.userId&&permits(current.permissions,'media.upload'),'ACCESS_DENIED');
 return current;
}
function authorizationHash(actor:Actor){return hash(JSON.stringify({v:1,companyId:actor.companyId,userId:actor.userId,permission:'media.upload',roles:sorted(actor.roles),permissions:sorted(actor.permissions),siteIds:sorted(actor.siteIds),customerIds:sorted(actor.customerIds),warehouseIds:sorted(actor.warehouseIds)}));}
/** Authorization is refreshed by the caller inside this same transaction, before receipt access. */
export async function replayMediaUpload(tx:SqlTransaction,storage:PrivateBlobStore,actor:Actor,payload:UploadPayload,key:string):Promise<MediaUploadResult|undefined>{
 assert(tx.query,'MISSING_CONFIGURATION',{reason:'TRANSACTION_SQL_REQUIRED'});
 assert(storage.provider==='POSTGRES','MISSING_CONFIGURATION',{reason:'ATOMIC_MEDIA_UPLOAD_REQUIRES_POSTGRES_BLOBS'});
 assert(permits(actor.permissions,'media.upload'),'ACCESS_DENIED');
 const receipt=(await tx.query('SELECT command,input_hash,result,authorization_hash FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',[actor.companyId,actor.userId,key])).rows[0];
 if(!receipt)return undefined;
 assert(receipt.command==='media.upload'&&receipt.input_hash===mediaUploadHash(payload),'IDEMPOTENCY_CONFLICT');
 assert(receipt.authorization_hash===authorizationHash(actor),'ACCESS_DENIED');
 const result=receiptSchema.parse(receipt.result),upload=await tx.get('media_upload',result.uploadId),data=upload.data;
 // Erased/missing uploads and blobs are never recreated through an old receipt.
 assert(upload.companyId===actor.companyId&&data.uploadedBy===actor.userId&&data.blobKey===result.uploadId&&typeof data.clientBlobKey==='string'&&data.sha256===hash(payload.original)&&data.mimeType===payload.mimeType&&data.fileName===payload.fileName&&data.redactionConfirmed===payload.redactionConfirmed&&data.byteSize===payload.original.length&&data.scanState==='CLEAN'&&data.metadataStripped===result.metadataStripped&&result.byteSize===payload.original.length,'NOT_FOUND_SAFE');
 const blobs=(await tx.query('SELECT id,owner_id,sha256,mime_type,octet_length(bytes) AS byte_size FROM media_blobs WHERE company_id=$1 AND id=ANY($2::text[])',[actor.companyId,[data.blobKey,data.clientBlobKey]])).rows;
 assert(blobs.length===2&&blobs.every(blob=>blob.owner_id===actor.userId&&blob.sha256===(blob.id===data.blobKey?data.sha256:data.clientSha256)&&blob.mime_type===(blob.id===data.blobKey?data.mimeType:data.clientMimeType)&&Number(blob.byte_size)===(blob.id===data.blobKey?data.byteSize:data.clientByteSize)),'NOT_FOUND_SAFE');
 return result;
}
/** PG blobs, metadata, outbox, audit and optional receipt commit through one SQL transaction. */
export async function persistMediaUpload(tx:SqlTransaction,storage:PrivateBlobStore,actor:Actor,payload:UploadPayload,prepared:PreparedUpload,key?:string):Promise<MediaUploadResult>{
 assert(tx.query,'MISSING_CONFIGURATION',{reason:'TRANSACTION_SQL_REQUIRED'});
 assert(permits(actor.permissions,'media.upload'),'ACCESS_DENIED');
 if(key){const replay=await replayMediaUpload(tx,storage,actor,payload,key);if(replay)return replay;}
 const uploadId=key?hash(JSON.stringify(['KNABA_HTTP_MEDIA_UPLOAD_V1',actor.companyId,actor.userId,key])):randomUUID(),clientKey=key?hash(uploadId+':sanitized'):randomUUID(),originalSha=hash(payload.original),clientSha=hash(prepared.clean);
 await storage.put({id:uploadId,companyId:actor.companyId,ownerId:actor.userId,bytes:payload.original,mimeType:payload.mimeType,sha256:originalSha},tx as BlobSql);
 await storage.put({id:clientKey,companyId:actor.companyId,ownerId:actor.userId,bytes:prepared.clean,mimeType:prepared.clientMimeType,sha256:clientSha},tx as BlobSql);
 await tx.add('media_upload',{uploadedBy:actor.userId,blobKey:uploadId,clientBlobKey:clientKey,sha256:originalSha,clientSha256:clientSha,mimeType:payload.mimeType,clientMimeType:prepared.clientMimeType,byteSize:payload.original.length,clientByteSize:prepared.clean.length,fileName:payload.fileName,scanState:'CLEAN',scanMethod:prepared.scanMethod,metadataStripped:prepared.metadataStripped,redactionConfirmed:payload.redactionConfirmed,redactionConfirmedBy:payload.redactionConfirmed?actor.userId:undefined,originalPreserved:true},uploadId);
 await tx.event('media.uploaded',{uploadId,sha256:originalSha,ownerId:actor.userId});
 const result:MediaUploadResult={uploadId,byteSize:payload.original.length,metadataStripped:prepared.metadataStripped,scanState:'CLEAN'};
 if(key){await tx.query('INSERT INTO command_receipts(company_id,actor_id,idempotency_key,command,input_hash,result,authorization_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.companyId,actor.userId,key,'media.upload',mediaUploadHash(payload),JSON.stringify(result),authorizationHash(actor)]);await tx.query('INSERT INTO audit_log(company_id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[actor.companyId,actor.userId,'COMMAND:media.upload',JSON.stringify({inputHash:mediaUploadHash(payload),permission:'media.upload'})]);}
 return result;
}
