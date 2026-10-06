import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import {assert,DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction} from '../domain/core.ts';
import type {BlobSql,PrivateBlobStore} from './index.ts';

const pixel=z.number().int().nonnegative().safe().max(24_000_000);
export const clientRedactionRectangle=z.object({x:pixel,y:pixel,width:pixel.refine(v=>v>0),height:pixel.refine(v=>v>0)}).strict();
export const clientRedactionInput=z.object({mediaId:z.string().min(1).max(100),clientCopyVersion:z.number().int().nonnegative().safe(),rectangles:z.array(clientRedactionRectangle).min(1).max(30),reason:z.string().trim().min(3).max(2000)}).strict();
export type ClientRedactionRectangle=z.infer<typeof clientRedactionRectangle>;
export type ClientRedactionInput=z.infer<typeof clientRedactionInput>;
const maxBytes=25*1024*1024,maxPixels=24_000_000;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const formats:Record<string,string>={jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
let activeDecodes=0;

/** Manual, opaque pixel masks only. No detection, generative editing or resizing.
 * Reencoding creates a metadata-free lossless CLIENT copy; the supplied original
 * and previous copies remain untouched. Coordinates refer to this decoded copy. */
export async function redactClientImage(bytes:Buffer,mimeType:string,rectangles:unknown){
 const masks=z.array(clientRedactionRectangle).min(1).max(30).parse(rectangles);
 assert(bytes.length>0&&bytes.length<=maxBytes,'MEDIA_TOO_LARGE');
 assert(Object.values(formats).includes(mimeType),'VALIDATION_ERROR',{reason:'REDACTION_REQUIRES_IMAGE'});
 assert(activeDecodes<1,'RATE_LIMITED',{reason:'REDACTION_DECODER_BUSY'});activeDecodes++;
 try{
  const image=sharp(bytes,{limitInputPixels:maxPixels,failOn:'warning'}),metadata=await image.metadata();
  assert(formats[metadata.format??'']===mimeType,'VALIDATION_ERROR',{reason:'MIME_SIGNATURE_MISMATCH'});
  const width=metadata.width,height=metadata.height;
  assert(width&&height&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width<=16384&&height<=16384&&width*height<=maxPixels&&(metadata.pages??1)===1,'VALIDATION_ERROR',{reason:'INVALID_IMAGE_DIMENSIONS'});
  assert(!metadata.orientation||metadata.orientation===1,'VALIDATION_ERROR',{reason:'SANITIZED_ORIENTATION_REQUIRED'});
  for(const mask of masks)assert(mask.x+mask.width<=width&&mask.y+mask.height<=height,'VALIDATION_ERROR',{reason:'REDACTION_RECTANGLE_OUTSIDE_IMAGE'});
  // One bounded RGBA buffer avoids up to thirty image-sized overlay allocations.
  const decoded=await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert(decoded.info.width===width&&decoded.info.height===height&&decoded.info.channels===4,'INVALID_STATE');
  const opaqueBlack=Buffer.from([0,0,0,255]);
  for(const mask of masks)for(let y=mask.y;y<mask.y+mask.height;y++){const start=(y*width+mask.x)*4;decoded.data.fill(opaqueBlack,start,start+mask.width*4);}
  const output=await sharp(decoded.data,{raw:{width,height,channels:4}}).png({compressionLevel:9}).toBuffer();
  assert(output.length>0&&output.length<=maxBytes,'MEDIA_TOO_LARGE');
  return {bytes:output,mimeType:'image/png' as const,sha256:sha(output),byteSize:output.length,width,height,rectangles:masks};
 }catch(error){if(error instanceof DomainError)throw error;throw new DomainError('VALIDATION_ERROR',{reason:'INVALID_REDACTION_IMAGE'});}finally{activeDecodes--;}
}

export interface ClientRedactionHost<T extends Transaction&BlobSql=Transaction&BlobSql>{
 store:PrivateBlobStore;
 actorIn:(tx:T,userId:string)=>Promise<Actor>;
 scope:(actor:Actor,permission:string)=>Actor;
 visible:(tx:T,actor:Actor,entity:Entity)=>Promise<boolean>;
}
const internalRoles=['OWNER','DIRECTOR','OPERATIONS_MANAGER','INTERNAL_BAULEITER','QUALITY_CONTROL'];
function internal(actor:Actor){assert(!actor.roles.some(r=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST','SERVICE_ACCOUNT'].includes(r))&&actor.roles.some(r=>internalRoles.includes(r)),'ACCESS_DENIED');}
function site(actor:Actor,siteId:string,permission:string){assert(actor.permissions.includes(permission)&&(actor.permissions.includes('scope.company')||actor.siteIds.includes(siteId)),'ACCESS_DENIED');}
function currentVersion(data:Data){const value=data.clientCopyVersion??0;assert(Number.isSafeInteger(value)&&value>=0,'INVALID_STATE');return value as number;}
export function clientRedactionAcknowledgment(media:Entity){const d=media.data;return {...media,data:{siteId:d.siteId,state:d.state,clientCopyVersion:d.clientCopyVersion,clientWidth:d.clientWidth,clientHeight:d.clientHeight,clientSha256:d.clientSha256,clientMimeType:d.clientMimeType,clientByteSize:d.clientByteSize,clientEditId:d.clientEditId,metadataStripped:d.metadataStripped,redactionConfirmed:d.redactionConfirmed,requiresPublicationApproval:true}};}

/** Runs inside the canonical company command transaction. PostgreSQL writes the
 * immutable new blob, edit, asset revision and event atomically. S3 cannot join
 * this transaction and is explicitly blocked until its durable edit lifecycle
 * is provided, instead of claiming an orphan-prone publication operation. */
export async function applyClientRedaction<T extends Transaction&BlobSql>(ctx:CommandContext,input:ClientRedactionInput,host:ClientRedactionHost<T>){
 input=clientRedactionInput.parse(input);const tx=ctx.tx as T;
 assert(typeof tx.query==='function'&&host.store.provider==='POSTGRES','MISSING_CONFIGURATION',{reason:'ATOMIC_REDACTION_STORAGE_REQUIRED'});
 const authorize=async()=>{
  const actor=await host.actorIn(tx,ctx.actor.userId);assert(actor.companyId===ctx.actor.companyId,'ACCESS_DENIED');internal(actor);
  const media=await tx.get('media_asset',input.mediaId);assert(media.companyId===actor.companyId,'NOT_FOUND_SAFE');const d=media.data;
  assert(typeof d.siteId==='string'&&d.siteId&&!d.employeeId&&d.visibility==='CLIENT_AFTER_APPROVAL','ACCESS_DENIED');
  site(host.scope(actor,'report.approve'),d.siteId,'report.approve');site(host.scope(actor,'media.read'),d.siteId,'media.read');
  assert(await host.visible(tx,actor,media),'NOT_FOUND_SAFE');
  assert(['RECEIVED','APPROVED_FOR_CLIENT'].includes(d.state)&&!d.deletedAt&&!d.deleted_at&&!d.erased,'INVALID_STATE');
  assert(currentVersion(d)===input.clientCopyVersion&&(ctx.expectedVersion===undefined||ctx.expectedVersion===media.version),'VERSION_CONFLICT');
  assert(d.metadataStripped===true&&typeof d.uploadedBy==='string'&&d.uploadedBy&&typeof d.clientBlobKey==='string'&&d.clientBlobKey&&d.clientBlobKey!==d.blobKey&&/^[a-f0-9]{64}$/.test(d.clientSha256)&&/^[a-f0-9]{64}$/.test(d.sha256)&&typeof d.blobKey==='string'&&d.blobKey,'CLIENT_COPY_REQUIRED');
  return {actor,media};
 };
 const {actor,media}=await authorize(),source=await host.store.get(actor.companyId,media.data.clientBlobKey);
 assert(source.id===media.data.clientBlobKey&&source.companyId===actor.companyId&&source.ownerId===media.data.uploadedBy&&source.sha256===media.data.clientSha256&&sha(source.bytes)===source.sha256&&source.mimeType===media.data.clientMimeType,'INVALID_STATE',{reason:'CLIENT_COPY_CHECKSUM_MISMATCH'});
 const masked=await redactClientImage(source.bytes,source.mimeType,input.rectangles);
 // Check authority and exact source again after decode before any storage write.
 const fresh=await authorize();assert(fresh.media.version===media.version&&fresh.media.data.clientBlobKey===source.id&&fresh.media.data.clientSha256===source.sha256,'VERSION_CONFLICT');
 const next=input.clientCopyVersion+1;assert(Number.isSafeInteger(next),'INVALID_STATE');
 const editId=createHash('sha256').update(JSON.stringify([actor.companyId,media.id,'client-redaction',next,ctx.idempotencyKey])).digest('hex');
 // A client copy retains its original data subject; the editor is recorded in
 // editedBy separately. Privacy deletion verifies this exact blob owner.
 const receipt=await host.store.put({id:editId,companyId:actor.companyId,ownerId:media.data.uploadedBy,bytes:masked.bytes,mimeType:masked.mimeType,sha256:masked.sha256},tx);
 assert(receipt.key===editId&&receipt.sha256===masked.sha256&&receipt.mimeType===masked.mimeType&&receipt.byteSize===masked.byteSize,'INVALID_STATE');
 await tx.add('media_client_edit',{mediaId:media.id,siteId:media.data.siteId,ownerUserId:actor.userId,uploadedBy:media.data.uploadedBy,immutable:true,clientCopyVersion:next,sourceClientCopyVersion:input.clientCopyVersion,blobKey:media.data.blobKey,sha256:media.data.sha256,clientBlobKey:editId,clientSha256:masked.sha256,clientMimeType:masked.mimeType,clientByteSize:masked.byteSize,sourceClientBlobKey:source.id,sourceClientSha256:source.sha256,rectangles:masked.rectangles,width:masked.width,height:masked.height,reason:input.reason,editedBy:actor.userId,editedAt:ctx.now,method:'MANUAL_OPAQUE_RECTANGLES',automaticDetection:false,originalPreserved:true},editId);
 const data={...fresh.media.data,clientBlobKey:editId,clientSha256:masked.sha256,clientMimeType:masked.mimeType,clientByteSize:masked.byteSize,clientWidth:masked.width,clientHeight:masked.height,clientCopyVersion:next,clientEditId:editId,metadataStripped:true,redactionConfirmed:true,redactionConfirmedBy:actor.userId,redactionConfirmedAt:ctx.now,state:'RECEIVED',approvedBy:null,approvedAt:null,approvalReason:null,clientCopyEditedBy:actor.userId,clientCopyEditedAt:ctx.now};
 const updated=await tx.save(fresh.media,data,fresh.media.version);
 await tx.event('media.client_redacted',{mediaId:media.id,editId,siteId:media.data.siteId,clientCopyVersion:next,sourceClientCopyVersion:input.clientCopyVersion,clientSha256:masked.sha256,actorId:actor.userId,requiresPublicationApproval:true});
 return clientRedactionAcknowledgment(updated);
}

/** Edit history never grants additional media authority or exposes a private
 * original to external customers. Bind every read to the current source asset. */
export async function clientRedactionVisible<T extends Transaction&BlobSql>(tx:T,actor:Actor,edit:Entity,host:ClientRedactionHost<T>):Promise<boolean>{
 if(edit.kind!=='media_client_edit'||edit.companyId!==actor.companyId)return false;
 try{const fresh=await host.actorIn(tx,actor.userId);assert(fresh.companyId===actor.companyId,'ACCESS_DENIED');internal(fresh);const saved=await tx.get('media_client_edit',edit.id);assert(saved.companyId===fresh.companyId&&saved.version===edit.version&&saved.data.immutable===true,'ACCESS_DENIED');const media=await tx.get('media_asset',saved.data.mediaId);assert(media.companyId===fresh.companyId&&saved.data.siteId===media.data.siteId&&media.data.visibility==='CLIENT_AFTER_APPROVAL'&&!media.data.employeeId&&!media.data.erased&&!media.data.deletedAt&&!media.data.deleted_at,'ACCESS_DENIED');site(host.scope(fresh,'media.read'),media.data.siteId,'media.read');return await host.visible(tx,fresh,media);}catch{return false;}
}
