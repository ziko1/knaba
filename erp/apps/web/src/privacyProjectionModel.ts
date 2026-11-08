import {ApiError,type Actor,type Entity,type Schema} from './api';

export const PRIVACY_V1='knaba-dsar-v1' as const;
export const PRIVACY_V2='knaba-dsar-v2' as const;
export type PrivacyProjectionVersion=typeof PRIVACY_V1|typeof PRIVACY_V2;
export const privacyCategories=['PROFILE','TIME','PAYROLL','MESSAGES','MEDIA'] as const;
export type PrivacyForm={type:'ACCESS'|'ERASURE';categories:string[];reason:string;projectionVersion:PrivacyProjectionVersion};
export type PrivacyRequestInput={type:'ACCESS'|'ERASURE';categories:string[];reason:string;projectionVersion?:PrivacyProjectionVersion};
export type PrivacyDownload={exportId:string;fileName:string;sha256:string;byteSize:number;projectionVersion:PrivacyProjectionVersion};
const owns=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
function object(value:unknown):value is Record<string,any>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function companyMatches(value:unknown,companyId:string){return object(value)&&(!owns(value,'companyId')||value.companyId===companyId);}
/** Legacy web entities omit this field; an explicit mismatch never identifies the current tenant. */
export function privacyEntityMatchesCompany(entity:unknown,companyId:string){return object(entity)&&companyMatches(entity,companyId)&&companyMatches(entity.data,companyId);}
function requireValue(value:unknown,reason='PRIVACY_EXPORT_SCOPE_MISMATCH'):asserts value{
 if(!value)throw new ApiError('VALIDATION_ERROR',400,{reason});
}
function text(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=200;}
function categories(value:unknown):value is string[]{return Array.isArray(value)&&value.length>0&&value.length<=privacyCategories.length&&new Set(value).size===value.length&&value.every(item=>privacyCategories.includes(item));}
function sameCategories(left:unknown,right:unknown){return categories(left)&&categories(right)&&left.length===right.length&&left.every(item=>right.includes(item));}

/** An absent legacy field is different from an explicit null or unknown value. */
export function privacyProjectionVersion(data:unknown):PrivacyProjectionVersion{
 requireValue(object(data));
 if(!owns(data,'projectionVersion'))return PRIVACY_V1;
 requireValue(data.projectionVersion===PRIVACY_V1||data.projectionVersion===PRIVACY_V2,'PRIVACY_PROJECTION_UNSUPPORTED');
 return data.projectionVersion;
}
/** The caller resolves the property through the existing command-schema resolver. */
export function privacyProjectionChoices(propertyDeclared:boolean,property:Schema|undefined):PrivacyProjectionVersion[]{
 if(!propertyDeclared)return [PRIVACY_V1];
 if(!property||property.type!==undefined&&property.type!=='string'||!Array.isArray(property.enum)||!property.enum.length||property.enum.some(item=>typeof item!=='string'))return [];
 const supported:PrivacyProjectionVersion[]=[PRIVACY_V1,PRIVACY_V2];return supported.filter(version=>property.enum!.includes(version));
}
export function privacyRequestInput(form:PrivacyForm,available:readonly PrivacyProjectionVersion[]):PrivacyRequestInput{
 requireValue(form.type==='ACCESS'||form.type==='ERASURE','PRIVACY_REQUEST_INVALID');
 const reason=typeof form.reason==='string'?form.reason.trim():'';
 requireValue(categories(form.categories)&&reason.length>=3&&reason.length<=2000,'PRIVACY_REQUEST_INVALID');
 if(form.type==='ACCESS')requireValue(available.includes(form.projectionVersion),'PRIVACY_PROJECTION_UNAVAILABLE');
 // Preserve the legacy input digest: v1 and ERASURE do not gain a new field.
 return {type:form.type,categories:[...form.categories],reason,...(form.type==='ACCESS'&&form.projectionVersion===PRIVACY_V2?{projectionVersion:PRIVACY_V2}:{})};
}
export function privacyRequestInfo(request:Entity,subjectUserId?:string,companyId?:string){
 requireValue(object(request)&&request.kind==='privacy_request'&&text(request.id)&&Number.isSafeInteger(request.version)&&request.version>=1&&object(request.data)&&typeof request.createdAt==='string'&&Number.isFinite(Date.parse(request.createdAt)));
 if(companyId!==undefined)requireValue(privacyEntityMatchesCompany(request,companyId));
 const data=request.data;
 requireValue((data.type==='ACCESS'||data.type==='ERASURE')&&text(data.subjectUserId)&&categories(data.categories));
 if(subjectUserId!==undefined)requireValue(data.subjectUserId===subjectUserId);
 if(data.type==='ERASURE')requireValue(!owns(data,'projectionVersion'),'PRIVACY_PROJECTION_UNSUPPORTED');
 return {id:request.id,type:data.type as 'ACCESS'|'ERASURE',subjectUserId:data.subjectUserId as string,categories:[...data.categories] as string[],projectionVersion:data.type==='ACCESS'?privacyProjectionVersion(data):undefined};
}
export function privacyCreatedRequest(result:unknown,input:PrivacyRequestInput,actor:Actor):Entity{
 requireValue(object(result));const request=result as Entity,info=privacyRequestInfo(request,actor.userId,actor.companyId);
 requireValue(info.type===input.type&&sameCategories(info.categories,input.categories)&&request.data.reason===input.reason&&request.data.state==='REQUESTED');
 if(input.type==='ACCESS')requireValue(info.projectionVersion===privacyProjectionVersion(input));
 return request;
}
export function privacyStatus(request:Entity,result:unknown,actor:Actor):Record<string,any>{
 const info=privacyRequestInfo(request,actor.userId,actor.companyId);requireValue(object(result)&&companyMatches(result,actor.companyId));
 requireValue(result.requestId===request.id&&result.type===info.type&&sameCategories(result.categories,info.categories)&&typeof result.state==='string');
 if(info.type==='ACCESS')requireValue(privacyProjectionVersion(result)===info.projectionVersion);
 else requireValue(!owns(result,'projectionVersion'),'PRIVACY_PROJECTION_UNSUPPORTED');
 // Only presentation fields may overlay the immutable selected request.
 const output:Record<string,any>={state:result.state};
 for(const key of ['sourceDataDeleted','liveSourceStatus','externalCopiesStatus','requestFulfilled','requestedAt','reviewedAt'])if(owns(result,key))output[key]=result[key];
 return output;
}
function downloadMetadata(result:Record<string,any>,exportId:unknown,version:PrivacyProjectionVersion):PrivacyDownload{
 requireValue(text(exportId)&&typeof result.fileName==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.json$/.test(result.fileName)&&typeof result.sha256==='string'&&/^[a-f0-9]{64}$/.test(result.sha256)&&Number.isSafeInteger(result.byteSize)&&result.byteSize>0);
 return {exportId,fileName:result.fileName,sha256:result.sha256,byteSize:result.byteSize,projectionVersion:version};
}
export function privacyPreparedExport(request:Entity,result:unknown,actor:Actor):PrivacyDownload{
 const info=privacyRequestInfo(request,actor.userId,actor.companyId);requireValue(info.type==='ACCESS'&&info.projectionVersion!==undefined&&object(result)&&companyMatches(result,actor.companyId));
 requireValue(result.status==='PRIVATE_JSON_ARTIFACT_READY'&&result.securedDownloadRequired===true&&privacyProjectionVersion(result)===info.projectionVersion);
 // A compact ACK is not a snapshot. The server validates the stored checksum
 // and request/snapshot agreement again at the existing secured download.
 return downloadMetadata(result,result.exportId,info.projectionVersion);
}
export function privacySavedExport(request:Entity,artifact:Entity,actor:Actor):PrivacyDownload{
 const info=privacyRequestInfo(request,actor.userId,actor.companyId);requireValue(info.type==='ACCESS'&&info.projectionVersion!==undefined);
 requireValue(object(artifact)&&artifact.kind==='privacy_export'&&object(artifact.data));const data=artifact.data;
 requireValue(data.immutable===true&&data.requestId===request.id&&data.subjectUserId===actor.userId&&object(data.snapshot));
 const snapshot=data.snapshot;
 requireValue(privacyProjectionVersion(data)===info.projectionVersion&&privacyProjectionVersion(snapshot)===info.projectionVersion&&snapshot.subjectUserId===actor.userId&&sameCategories(snapshot.categories,info.categories));
 requireValue(snapshot.scope==='MINIMIZED_SELF_DATA_EXPORT'&&snapshot.fullLegalDsarFulfillment===false);
 requireValue(privacyEntityMatchesCompany(artifact,actor.companyId)&&companyMatches(snapshot,actor.companyId));
 if(info.projectionVersion===PRIVACY_V2){
  requireValue(snapshot.companyId===actor.companyId);
  if(info.categories.includes('PROFILE'))requireValue(object(snapshot.federationMetadata)&&snapshot.federationMetadata.version==='knaba-federation-self-metadata-v1'&&snapshot.federationMetadata.scope==='ERP_STORED_METADATA');
  else requireValue(!owns(snapshot,'federationMetadata'));
 }else requireValue(!owns(snapshot,'federationMetadata'));
 return downloadMetadata(data,artifact.id,info.projectionVersion);
}
/** An old successful receipt must not hide a newer reviewed server entity. */
export function privacyOwnRequests(records:Entity[],created:Entity|undefined,subjectUserId:string,companyId?:string):Entity[]{
 const merged=new Map<string,Entity>();
 for(const item of [...(created?[created]:[]),...records]){
  if(!object(item)||item.kind!=='privacy_request'||item.data?.subjectUserId!==subjectUserId||companyId!==undefined&&!privacyEntityMatchesCompany(item,companyId))continue;
  const previous=merged.get(item.id);if(!previous||item.version>=previous.version)merged.set(item.id,item);
 }
 return [...merged.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
export function privacyProjectionLabel(version:PrivacyProjectionVersion){return version===PRIVACY_V2?'privacyProjectionExtended':'privacyProjectionBasic';}
export function privacyProjectionScope(version:PrivacyProjectionVersion,selected:readonly string[]){return version===PRIVACY_V2?(selected.includes('PROFILE')?'privacyProjectionExtendedScope':'privacyProjectionWithoutProfileScope'):'privacyExportScope';}
