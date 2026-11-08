import {describe,expect,it} from 'vitest';
import {ApiError,type Actor,type Entity,type Schema} from './api';
import {schemaProperty,schemaProperties} from './CommandForm';
import {translator,languages} from '../../../packages/i18n/index';
import {privacyProjectionCopy} from '../../../packages/i18n/privacyProjectionCopy';
import {PRIVACY_V1,PRIVACY_V2,privacyProjectionVersion,privacyProjectionChoices,privacyRequestInput,privacyRequestInfo,privacyCreatedRequest,privacyStatus,privacyPreparedExport,privacySavedExport,privacyOwnRequests,privacyProjectionScope,type PrivacyForm} from './privacyProjectionModel';

const userId='53e0f6cb-1048-4ee1-a0cf-d7596b7c6098',companyId='3fd15456-80f5-49c1-9da3-b87b6c02739e';
const actor:Actor={userId,companyId,roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],customerIds:[],warehouseIds:[]};
const createdAt='2026-11-08T18:00:00.000Z',requestId='d40e4e6e-6c18-4e48-b0a0-5e3e5c78ce09',exportId='ce4141d3-5d04-41f9-a24b-184ad107e2ce';
const form:PrivacyForm={type:'ACCESS',categories:['PROFILE'],reason:'My stored account records',projectionVersion:PRIVACY_V1};
function request(version:typeof PRIVACY_V1|typeof PRIVACY_V2=PRIVACY_V1):Entity{return {id:requestId,kind:'privacy_request',version:2,createdAt,updatedAt:createdAt,data:{type:'ACCESS',categories:['PROFILE'],reason:form.reason,subjectUserId:userId,state:'APPROVED_EXPORT',...(version===PRIVACY_V2?{projectionVersion:version}:{})}};}
function ack(version:typeof PRIVACY_V1|typeof PRIVACY_V2=PRIVACY_V1){return {exportId,fileName:'KNABA-DE-own-data-'+requestId+'.json',sha256:'a'.repeat(64),byteSize:512,status:'PRIVATE_JSON_ARTIFACT_READY',securedDownloadRequired:true,...(version===PRIVACY_V2?{projectionVersion:version}:{})};}
function artifact(version:typeof PRIVACY_V1|typeof PRIVACY_V2=PRIVACY_V1):Entity{return {id:exportId,kind:'privacy_export',version:1,createdAt,updatedAt:createdAt,data:{...ack(version),requestId,subjectUserId:userId,immutable:true,projectionVersion:version,snapshot:{projectionVersion:version,subjectUserId:userId,createdAt,categories:['PROFILE'],scope:'MINIMIZED_SELF_DATA_EXPORT',fullLegalDsarFulfillment:false,...(version===PRIVACY_V2?{companyId,federationMetadata:{version:'knaba-federation-self-metadata-v1',scope:'ERP_STORED_METADATA'}}:{})}}};}

describe('privacy projection UI contracts',()=>{
 it('keeps legacy request bodies byte-equivalent and omits the UI version from erasure',()=>{
  const legacy={type:'ACCESS',categories:['PROFILE'],reason:form.reason};
  const value=privacyRequestInput({...form,subjectUserId:'foreign',unexpected:true} as PrivacyForm,[PRIVACY_V1,PRIVACY_V2]);
  expect(JSON.stringify(value)).toBe(JSON.stringify(legacy));expect(Object.hasOwn(value,'projectionVersion')).toBe(false);
  expect(privacyRequestInput({...form,type:'ERASURE',projectionVersion:PRIVACY_V2},[])).toEqual({...legacy,type:'ERASURE'});
 });
 it('normalizes the reason before review to match the existing server schema and replay digest',()=>{
  const input=privacyRequestInput({...form,reason:'  '+form.reason+'\n'},[PRIVACY_V1]),saved=request();saved.data.state='REQUESTED';
  expect(input.reason).toBe(form.reason);expect(privacyCreatedRequest(saved,input,actor)).toBe(saved);
  for(const reason of ['   ',' a ',' aa '])expect(()=>privacyRequestInput({...form,reason},[PRIVACY_V1])).toThrow(ApiError);
  expect(privacyRequestInput({...form,reason:' '+ 'a'.repeat(2000)+' '},[PRIVACY_V1]).reason).toHaveLength(2000);
 });
 it('sends an explicit v2 selection only when the current catalog advertises it',()=>{
  const selected={...form,projectionVersion:PRIVACY_V2};
  expect(privacyRequestInput(selected,[PRIVACY_V1,PRIVACY_V2])).toEqual({type:'ACCESS',categories:['PROFILE'],reason:form.reason,projectionVersion:PRIVACY_V2});
  expect(()=>privacyRequestInput(selected,[PRIVACY_V1])).toThrow(ApiError);expect(selected.projectionVersion).toBe(PRIVACY_V2);
  expect(privacyProjectionChoices(false,undefined)).toEqual([PRIVACY_V1]);
  expect(privacyProjectionChoices(true,{type:'string',enum:[PRIVACY_V1,PRIVACY_V2,'future-v3']})).toEqual([PRIVACY_V1,PRIVACY_V2]);
  expect(privacyProjectionChoices(true,{type:'string',enum:['future-v3']})).toEqual([]);
  expect(privacyProjectionChoices(true,undefined)).toEqual([]);expect(privacyProjectionChoices(true,{type:'number',enum:[PRIVACY_V2]})).toEqual([]);
 });
 it('uses the existing local-reference command schema resolver for optional versions',()=>{
  const schema={type:'object',properties:{projectionVersion:{$ref:'#/definitions/version'}},definitions:{version:{type:'string',enum:[PRIVACY_V1,PRIVACY_V2]}}} as Schema;
  expect(Object.hasOwn(schemaProperties(schema),'projectionVersion')).toBe(true);
  expect(privacyProjectionChoices(true,schemaProperty(schema,'projectionVersion'))).toEqual([PRIVACY_V1,PRIVACY_V2]);
  expect(schemaProperty(schema,'missing')).toBeUndefined();
 });
 it.each([null,undefined,'','knaba-dsar-v3',[],{}])('rejects an explicitly malformed version instead of treating %j as legacy',value=>{
  expect(privacyProjectionVersion({})).toBe(PRIVACY_V1);
  expect(()=>privacyProjectionVersion({projectionVersion:value})).toThrow(ApiError);
 });
 it('does not accept a stored ERASURE version or a request belonging to another subject',()=>{
  const r=request();r.data.type='ERASURE';expect(privacyRequestInfo(r).projectionVersion).toBeUndefined();r.data.projectionVersion=PRIVACY_V1;
  expect(()=>privacyRequestInfo(r)).toThrow(ApiError);expect(()=>privacyRequestInfo(request(),'another-user')).toThrow(ApiError);
 });
 it('accepts a creation ACK only for the reviewed own type, categories, reason and version',()=>{
  const input=privacyRequestInput({...form,projectionVersion:PRIVACY_V2},[PRIVACY_V2]),saved=request(PRIVACY_V2);saved.data.state='REQUESTED';
  expect(privacyCreatedRequest(saved,input,actor)).toBe(saved);
  for(const patch of [{subjectUserId:'foreign'},{reason:'different intent'},{categories:['TIME']},{projectionVersion:PRIVACY_V1},{state:'APPROVED_EXPORT'}]){
   expect(()=>privacyCreatedRequest({...saved,data:{...saved.data,...patch}},input,actor)).toThrow(ApiError);
  }
 });
 it('keeps a newer authoritative request visible when a successful old receipt is replayed',()=>{
  const reviewed=request(PRIVACY_V2),receipt={...reviewed,version:1,data:{...reviewed.data,state:'REQUESTED'}};
  const foreign={...reviewed,id:'foreign',data:{...reviewed.data,subjectUserId:'foreign'}};
  expect(privacyOwnRequests([reviewed,foreign],receipt,userId)).toEqual([reviewed]);
  expect(privacyOwnRequests([],receipt,userId)).toEqual([receipt]);
 });
 it('does not render an explicitly different company in own lists with a reused user identifier',()=>{
  const own=request(),foreign={...request(),id:'foreign-request',companyId:'foreign-company'},nullCompany={...request(),id:'null-company',data:{...request().data,companyId:null}};
  expect(privacyOwnRequests([foreign,nullCompany,own],undefined,userId,companyId)).toEqual([own]);
 });
 it('allows another subject for independent review only within the current company when declared',()=>{
  const review={...request(),companyId,data:{...request().data,subjectUserId:'another-user'}};
  expect(privacyRequestInfo(review,undefined,companyId).subjectUserId).toBe('another-user');
  const foreign={...review,companyId:'foreign-company'};expect(()=>privacyRequestInfo(foreign,undefined,companyId)).toThrow(ApiError);
 });
 it('accepts compact legacy and explicit v2 prepare ACKs without inventing a snapshot endpoint',()=>{
  expect(privacyPreparedExport(request(),ack(),actor).projectionVersion).toBe(PRIVACY_V1);
  expect(privacyPreparedExport(request(PRIVACY_V2),ack(PRIVACY_V2),actor).projectionVersion).toBe(PRIVACY_V2);
  expect(privacyPreparedExport(request(),{...ack(),projectionVersion:PRIVACY_V1},actor).projectionVersion).toBe(PRIVACY_V1);
 });
 it.each(['foreign-company',null,undefined])('rejects an explicitly foreign or malformed company in own request and compact ACKs: %j',companyId=>{
  const own=request(),input=privacyRequestInput(form,[PRIVACY_V1]),created={...own,data:{...own.data,state:'REQUESTED'}},status={requestId,type:'ACCESS',categories:['PROFILE'],state:'APPROVED_EXPORT'};
  for(const request of [{...own,companyId},{...own,data:{...own.data,companyId}}]){
   expect(()=>privacyPreparedExport(request,ack(),actor)).toThrow(ApiError);
   expect(()=>privacyStatus(request,status,actor)).toThrow(ApiError);
   expect(()=>privacySavedExport(request,artifact(),actor)).toThrow(ApiError);
  }
  expect(()=>privacyCreatedRequest({...created,companyId},input,actor)).toThrow(ApiError);
  expect(()=>privacyCreatedRequest({...created,data:{...created.data,companyId}},input,actor)).toThrow(ApiError);
  expect(()=>privacyStatus(own,{...status,companyId},actor)).toThrow(ApiError);
  expect(()=>privacyPreparedExport(own,{...ack(),companyId},actor)).toThrow(ApiError);
 });
 it('accepts explicit same-company associations and the existing absent legacy fields',()=>{
  const own={...request(),companyId,data:{...request().data,companyId}},input=privacyRequestInput(form,[PRIVACY_V1]),created={...own,data:{...own.data,state:'REQUESTED'}};
  expect(privacyCreatedRequest(created,input,actor)).toBe(created);expect(privacyPreparedExport(own,{...ack(),companyId},actor).exportId).toBe(exportId);
  expect(privacyStatus(own,{requestId,type:'ACCESS',categories:['PROFILE'],state:'APPROVED_EXPORT',companyId},actor)).toEqual({state:'APPROVED_EXPORT'});
  expect(privacySavedExport(own,artifact(),actor).exportId).toBe(exportId);
 });
 it.each([{}, {projectionVersion:null},{projectionVersion:PRIVACY_V1},{projectionVersion:'unknown'}])('blocks a v2 prepare ACK with absent, unknown or mismatched version: %j',patch=>{
  expect(()=>privacyPreparedExport(request(PRIVACY_V2),{...ack(),...patch},actor)).toThrow(ApiError);
 });
 it('does not expose downloads from malformed ready flags or file metadata',()=>{
  for(const patch of [{status:'DONE'},{securedDownloadRequired:false},{sha256:'not-a-checksum'},{byteSize:0},{byteSize:1.5},{fileName:'../private.json'},{exportId:''}]){
   expect(()=>privacyPreparedExport(request(),{...ack(),...patch},actor)).toThrow(ApiError);
  }
 });
 it('preserves existing v1 cards without company fields and permits only an expected-v1 legacy absence',()=>{
  const saved=artifact();expect(privacySavedExport(request(),saved,actor).exportId).toBe(exportId);
  delete saved.data.projectionVersion;delete saved.data.snapshot.projectionVersion;
  expect(privacySavedExport(request(),saved,actor).projectionVersion).toBe(PRIVACY_V1);
  expect(()=>privacySavedExport(request(PRIVACY_V2),saved,actor)).toThrow(ApiError);
  saved.data.snapshot.companyId='foreign';expect(()=>privacySavedExport(request(),saved,actor)).toThrow(ApiError);
 });
 it('requires v2 card agreement across own request, outer version, snapshot version and company',()=>{
  expect(privacySavedExport(request(PRIVACY_V2),artifact(PRIVACY_V2),actor).projectionVersion).toBe(PRIVACY_V2);
  const mutate:Array<(e:Entity)=>void>=[
   e=>{delete e.data.projectionVersion;},e=>{delete e.data.snapshot.projectionVersion;},e=>{delete e.data.snapshot.companyId;},
   e=>{e.data.projectionVersion=null;},e=>{e.data.snapshot.projectionVersion=PRIVACY_V1;},e=>{e.data.snapshot.companyId='foreign';},
   e=>{e.data.subjectUserId='foreign';},e=>{e.data.snapshot.subjectUserId='foreign';},e=>{e.data.requestId='other-request';},
   e=>{e.data.snapshot.categories=['TIME'];},e=>{e.data.immutable=false;},e=>{e.data.snapshot.fullLegalDsarFulfillment=true;},
   e=>{delete e.data.snapshot.federationMetadata;},e=>{e.data.snapshot.federationMetadata.version='unknown';}
  ];
  for(const change of mutate){const value=artifact(PRIVACY_V2);change(value);expect(()=>privacySavedExport(request(PRIVACY_V2),value,actor)).toThrow(ApiError);}
 });
 it('does not label unexpected federation data as a basic or non-PROFILE export',()=>{
  const base=artifact();base.data.snapshot.federationMetadata={};expect(()=>privacySavedExport(request(),base,actor)).toThrow(ApiError);
  const r=request(PRIVACY_V2),a=artifact(PRIVACY_V2);r.data.categories=['TIME'];a.data.snapshot.categories=['TIME'];
  expect(()=>privacySavedExport(r,a,actor)).toThrow(ApiError);delete a.data.snapshot.federationMetadata;
  expect(privacySavedExport(r,a,actor).projectionVersion).toBe(PRIVACY_V2);
  expect(privacyProjectionScope(PRIVACY_V2,['TIME'])).toBe('privacyProjectionWithoutProfileScope');
 });
 it('status refresh cannot replace immutable scope, owner or reason and rejects version drift',()=>{
  const r=request(PRIVACY_V2),status={requestId,type:'ACCESS',categories:['PROFILE'],projectionVersion:PRIVACY_V2,state:'APPROVED_EXPORT',requestFulfilled:false,reason:'untrusted replacement',subjectUserId:'foreign'};
  expect(privacyStatus(r,status,actor)).toEqual({state:'APPROVED_EXPORT',requestFulfilled:false});
  expect(()=>privacyStatus(r,{...status,projectionVersion:PRIVACY_V1},actor)).toThrow(ApiError);
  expect(()=>privacyStatus(r,{...status,categories:['TIME']},actor)).toThrow(ApiError);
 });
 it('provides human scope and blocker text in all six supported languages',()=>{
  for(const language of languages)for(const key of Object.keys(privacyProjectionCopy)){
   const value=translator(language)(key);expect(value).not.toBe(key);expect(value.length).toBeGreaterThan(3);expect(value).not.toContain('knaba-dsar-');
  }
 });
});
