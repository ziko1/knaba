import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,ArrowRight,CheckCircle2,FileText,Plus,RefreshCw,ShieldCheck} from './icons';
import {Badge,Button,Empty,Modal} from '../../../packages/ui/index';
import {command,catalog,ApiError,type Command,type Entity,type Session} from './api';
import {errorText,schemaProperties,schemaProperty,type Translate} from './CommandForm';
import {type Language} from '../../../packages/i18n/index';
import {PrivateReadGeneration,type PrivateReadTicket} from './privateReadGeneration';
import {PRIVACY_V1,PRIVACY_V2,privacyCategories,privacyProjectionChoices,privacyProjectionLabel,privacyProjectionScope,privacyProjectionVersion,privacyRequestInput,privacyRequestInfo,privacyCreatedRequest,privacyStatus,privacyPreparedExport,privacySavedExport,privacyOwnRequests,privacyEntityMatchesCompany,type PrivacyForm,type PrivacyRequestInput,type PrivacyProjectionVersion,type PrivacyDownload} from './privacyProjectionModel';

type Stage='closed'|'edit'|'review'|'done';
type VersionObservation={parent:string;values:PrivacyProjectionVersion[]};
const blankForm=():PrivacyForm=>({type:'ACCESS',categories:['PROFILE'],reason:'',projectionVersion:PRIVACY_V1});
function versions(definition:Command|undefined){return definition?privacyProjectionChoices(Object.prototype.hasOwnProperty.call(schemaProperties(definition.schema),'projectionVersion'),schemaProperty(definition.schema,'projectionVersion')):[];}
function Scope({version,categories,t}:{version:PrivacyProjectionVersion;categories:readonly string[];t:Translate}){
 return <div className="privacy-boundary privacy-projection-scope"><p><strong>{t(privacyProjectionLabel(version))}</strong></p><p>{t(privacyProjectionScope(version,categories))}</p>{version===PRIVACY_V2&&<><p>{t('privacyProjectionOmissions')}</p>{categories.includes('PROFILE')&&<p>{t('privacyProjectionStoredFacts')}</p>}</>}</div>;
}
export default function PrivacyPage({records,session,allowed,t,language,onSaved,openCommand,onAccessDenied}:{records:Record<string,Entity[]>;session:Session;allowed:Command[];t:Translate;language:Language;onSaved:()=>void;openCommand:(name:string,input?:any,version?:number)=>void;onAccessDenied:()=>void}){
 const [form,setForm]=useState<PrivacyForm>(blankForm);
 const [stage,setStage]=useState<Stage>('closed');
 const [reviewed,setReviewed]=useState<{input:PrivacyRequestInput;key:string}>();
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[created,setCreated]=useState<Entity>();
 const [unknownOutcome,setUnknownOutcome]=useState(false);
 const [statuses,setStatuses]=useState<Record<string,Record<string,any>>>({});
 const [exportCandidate,setExportCandidate]=useState<Entity>(),[prepared,setPrepared]=useState<PrivacyDownload>();
 const [observedVersions,setObservedVersions]=useState<VersionObservation>();
 const requestKey=useRef(crypto.randomUUID()),exportKeys=useRef(new Map<string,string>()),inFlight=useRef(false);
 const generation=useMemo(()=>new PrivateReadGeneration(),[]);
 useEffect(()=>{generation.mount();return()=>{generation.unmount();exportKeys.current.clear();}},[generation]);
 const requestDefinition=allowed.find(item=>item.name==='privacy.request'),parentVersionSignature=JSON.stringify(requestDefinition?.schema??null);
 const availableVersions=observedVersions?.parent===parentVersionSignature?observedVersions.values:versions(requestDefinition);
 const ownRequests=privacyOwnRequests(records.privacy_request||[],created,session.actor.userId,session.actor.companyId);
 const ownExports=(records.privacy_export||[]).filter(item=>privacyEntityMatchesCompany(item,session.actor.companyId)&&item.data.subjectUserId===session.actor.userId);
 const reviewRequests=(records.privacy_request||[]).filter(item=>privacyEntityMatchesCompany(item,session.actor.companyId)&&item.data.subjectUserId!==session.actor.userId);
 const permits=(name:string)=>allowed.some(item=>item.name===name);
 const formatter=new Intl.DateTimeFormat(language==='UK'?'uk-UA':language.toLowerCase(),{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'});
 const time=(value?:string)=>value&&Number.isFinite(Date.parse(value))?formatter.format(new Date(value)):'—';
 const stateTitle=(state:string)=>t('privacyState_'+state)==='privacyState_'+state?state:t('privacyState_'+state);
 const reason=error instanceof ApiError?error.details.reason||error.code:'';
 const message=reason&&t('privacyBlock_'+reason)!=='privacyBlock_'+reason?t('privacyBlock_'+reason):errorText(error,t);
 const notice=error||unknownOutcome?<>{Boolean(error)&&<div role="alert" className="notice danger"><AlertTriangle size={18}/><div>{message}</div></div>}{unknownOutcome&&<p role="status" className="notice warning">{t('privacyUnknownOutcome')}</p>}</>:null;

 function invalidateFlow(){generation.begin('privacy-flow');inFlight.current=false;setBusy(false);setError(undefined);setUnknownOutcome(false);}
 function begin(){if(inFlight.current||!navigator.onLine)return;const ticket=generation.begin('privacy-flow');if(!ticket)return;inFlight.current=true;setBusy(true);setError(undefined);return ticket;}
 function failed(ticket:PrivateReadTicket,err:unknown){if(!generation.accepts(ticket))return;if(err instanceof ApiError&&(err.status===401||err.code==='NEEDS_REAUTH'||err.status===403&&err.code==='ACCESS_DENIED')){generation.invalidate();onAccessDenied();return;}setError(generation.update<unknown>(ticket,()=>err));}
 function finished(ticket:PrivateReadTicket){if(generation.accepts(ticket)){inFlight.current=false;setBusy(generation.update<boolean>(ticket,()=>false));}}
 function unknown(ticket:PrivateReadTicket,err:unknown,posted:boolean,answered:boolean){if(posted&&(answered||!(err instanceof ApiError)||err.status>=500))setUnknownOutcome(generation.update<boolean>(ticket,()=>true));}
 async function currentVersions(ticket:PrivateReadTicket){
  const current=await catalog({signal:ticket.signal,cache:'no-store'});if(!generation.accepts(ticket))return;
  const definition=current.find(item=>item.name==='privacy.request');if(!definition)throw new ApiError('ACCESS_DENIED',403);
  const values=versions(definition);setObservedVersions(generation.update<VersionObservation|undefined>(ticket,()=>({parent:parentVersionSignature,values})));return values;
 }
 function change(patch:Partial<PrivacyForm>){setForm(previous=>({...previous,...patch}));requestKey.current=crypto.randomUUID();setReviewed(undefined);setError(undefined);setUnknownOutcome(false);}
 function newRequest(){invalidateFlow();setExportCandidate(undefined);setPrepared(undefined);setForm(blankForm());setReviewed(undefined);requestKey.current=crypto.randomUUID();setStage('edit');}
 function closeRequest(){invalidateFlow();setReviewed(undefined);setStage('closed');}
 function closeExport(){invalidateFlow();setPrepared(undefined);setExportCandidate(undefined);}
 function openExport(request:Entity){invalidateFlow();setStage('closed');setPrepared(undefined);setExportCandidate(request);if(!exportKeys.current.has(request.id))exportKeys.current.set(request.id,crypto.randomUUID());}
 async function submit(){
  if(!reviewed||!permits('privacy.request'))return;const ticket=begin();if(!ticket)return;const intent=reviewed;let posted=false,answered=false;
  try{
   const supported=await currentVersions(ticket);if(!supported||!generation.accepts(ticket))return;
   if(intent.input.type==='ACCESS'&&!supported.includes(privacyProjectionVersion(intent.input)))throw new ApiError('VALIDATION_ERROR',400,{reason:'PRIVACY_PROJECTION_UNAVAILABLE'});
   posted=true;const result=await command('privacy.request',intent.input,undefined,intent.key);answered=true;if(!generation.accepts(ticket))return;
   const saved=privacyCreatedRequest(result,intent.input,session.actor);setCreated(generation.update<Entity|undefined>(ticket,()=>saved));setStage(generation.update<Stage>(ticket,()=>'done'));setUnknownOutcome(generation.update<boolean>(ticket,()=>false));onSaved();
  }catch(err){unknown(ticket,err,posted,answered);failed(ticket,err);}finally{finished(ticket);}
 }
 async function refreshStatus(request:Entity){
  if(!permits('privacy.status'))return;const ticket=begin();if(!ticket)return;
  try{const result=await command('privacy.status',{requestId:request.id});if(!generation.accepts(ticket))return;const value=privacyStatus(request,result,session.actor);setStatuses(generation.update<Record<string,Record<string,any>>>(ticket,previous=>({...previous,[request.id]:value})));onSaved();}
  catch(err){failed(ticket,err);}finally{finished(ticket);}
 }
 async function prepareExport(){
  if(!exportCandidate||!permits('privacy.export'))return;const ticket=begin();if(!ticket)return;const selected=exportCandidate;let posted=false,answered=false;
  try{
   const expected=privacyRequestInfo(selected,session.actor.userId,session.actor.companyId);if(expected.type!=='ACCESS'||!expected.projectionVersion)throw new ApiError('VALIDATION_ERROR',400,{reason:'PRIVACY_EXPORT_SCOPE_MISMATCH'});
   const supported=await currentVersions(ticket);if(!supported||!generation.accepts(ticket))return;
   if(!supported.includes(expected.projectionVersion))throw new ApiError('VALIDATION_ERROR',400,{reason:'PRIVACY_PROJECTION_UNAVAILABLE'});
   const key=exportKeys.current.get(selected.id);if(!key)throw new ApiError('INVALID_STATE',409);
   posted=true;const result=await command('privacy.export',{requestId:selected.id},undefined,key);answered=true;if(!generation.accepts(ticket))return;
   const value=privacyPreparedExport(selected,result,session.actor);setPrepared(generation.update<PrivacyDownload|undefined>(ticket,()=>value));setUnknownOutcome(generation.update<boolean>(ticket,()=>false));onSaved();
  }catch(err){unknown(ticket,err,posted,answered);failed(ticket,err);}finally{finished(ticket);}
 }
 let candidateInfo:ReturnType<typeof privacyRequestInfo>|undefined;
 try{if(exportCandidate)candidateInfo=privacyRequestInfo(exportCandidate,session.actor.userId,session.actor.companyId);}catch{}
 const versionUnavailable=form.type==='ACCESS'&&!availableVersions.includes(form.projectionVersion);
 return <section className="privacy-page">
  <div className="privacy-note"><ShieldCheck size={22}/><div><h2>{t('privacySelfTitle')}</h2><p>{t('privacySelfDesc')}</p><p>{t('privacyExportScope')}</p></div>{permits('privacy.request')&&<Button onClick={newRequest}><Plus size={16}/>{t('privacyNewRequest')}</Button>}</div>
  {stage==='closed'&&!exportCandidate&&notice}
  {ownRequests.length===0?<Empty title={t('privacyNoRequests')} description={t('privacySelfDesc')}/>:<div className="privacy-request-list">{ownRequests.map(request=>{
   const data={...request.data,...statuses[request.id]},artifact=ownExports.find(item=>item.data.requestId===request.id);
   let info:ReturnType<typeof privacyRequestInfo>|undefined,download:PrivacyDownload|undefined,invalid=false;
   try{info=privacyRequestInfo(request,session.actor.userId,session.actor.companyId);if(artifact)download=privacySavedExport(request,artifact,session.actor);}catch{invalid=true;}
   return <article key={request.id} className="privacy-request-card"><div className="privacy-request-heading"><span className="section-icon"><FileText size={19}/></span><div><h3>{t('privacyType_'+data.type)}</h3><p>{time(data.requestedAt||request.createdAt)}</p></div><Badge tone={data.state==='APPROVED_EXPORT'?'green':data.state==='REJECTED'?'red':'amber'}>{stateTitle(data.state)}</Badge></div>
    <div className="privacy-categories">{(info?.categories||[]).map(category=><Badge key={category}>{t('privacyCategory_'+category)}</Badge>)}</div><p className="privacy-request-reason">{data.reason}</p>
    {info?.projectionVersion&&<Scope version={info.projectionVersion} categories={info.categories} t={t}/>} {data.type==='ERASURE'&&<p className="privacy-boundary"><ShieldCheck size={14}/>{t('privacyErasureBoundary')}</p>}
    {invalid&&<p role="alert" className="notice danger">{t('privacyBlock_PRIVACY_EXPORT_SCOPE_MISMATCH')}</p>}{data.state==='REQUESTED'&&<p className="privacy-boundary">{t('privacyAwaitingReview')}</p>}{data.reviewReason&&<p className="privacy-request-reason">{data.reviewReason}</p>}
    <div className="privacy-card-actions">{permits('privacy.status')&&<Button variant="ghost" disabled={busy||!navigator.onLine} onClick={()=>refreshStatus(request)}><RefreshCw size={14}/>{t('refresh')}</Button>}
     {download?<a className="button secondary" href={'/api/v1/privacy/exports/'+encodeURIComponent(download.exportId)+'/download'}>{t('privacyDownload')}</a>:!invalid&&!artifact&&data.type==='ACCESS'&&data.state==='APPROVED_EXPORT'&&permits('privacy.export')&&<Button variant="secondary" disabled={busy||!navigator.onLine} onClick={()=>openExport(request)}>{t('privacyPrepareExport')}<ArrowRight size={14}/></Button>}
    </div></article>;
  })}</div>}
  {permits('privacy.review')&&reviewRequests.length>0&&<section className="privacy-review-requests"><h2>{t('privacyReviewRequests')}</h2><p className="field-explanation">{t('privacyReviewBoundary')}</p>{reviewRequests.map(request=>{
   let info:ReturnType<typeof privacyRequestInfo>|undefined;try{info=privacyRequestInfo(request,undefined,session.actor.companyId);}catch{}
   return <div className="privacy-review-row" key={request.id}><div><b>{t('privacyType_'+request.data.type)}</b><small>{request.data.subjectUserId} · {time(request.data.requestedAt)}</small>{info?.projectionVersion&&<Scope version={info.projectionVersion} categories={info.categories} t={t}/>}</div><Badge tone="amber">{stateTitle(request.data.state)}</Badge>{!info?<p role="alert">{t('privacyBlock_PRIVACY_PROJECTION_UNSUPPORTED')}</p>:['REQUESTED','ON_LEGAL_HOLD'].includes(request.data.state)&&<Button variant="secondary" disabled={busy||!navigator.onLine} onClick={()=>openCommand('privacy.review',{requestId:request.id},request.version)}>{t('review')}</Button>}</div>;
  })}</section>}
  {stage!=='closed'&&<Modal title={t('privacyNewRequest')} closeLabel={t('cancel')} onClose={closeRequest}><div className="privacy-request-form">{notice}
   {stage==='edit'?<form onSubmit={event=>{event.preventDefault();try{const input=privacyRequestInput(form,availableVersions);setReviewed({input,key:requestKey.current});setError(undefined);setStage('review');}catch(err){setError(err);}}}>
    <label className="field" htmlFor="privacy-request-type"><span>{t('privacyRequestType')}</span><select id="privacy-request-type" value={form.type} onChange={event=>change({type:event.target.value as PrivacyForm['type']})}>{['ACCESS','ERASURE'].map(type=><option key={type} value={type}>{t('privacyType_'+type)}</option>)}</select></label>
    {form.type==='ACCESS'&&<><label className="field" htmlFor="privacy-projection"><span>{t('privacyProjectionChoice')}</span><select id="privacy-projection" value={form.projectionVersion} onChange={event=>change({projectionVersion:event.target.value as PrivacyProjectionVersion})}>{[PRIVACY_V1,PRIVACY_V2].filter(version=>availableVersions.includes(version)||version===form.projectionVersion).map(version=><option key={version} value={version} disabled={!availableVersions.includes(version)}>{t(privacyProjectionLabel(version))}</option>)}</select></label>{versionUnavailable&&<p role="alert" className="notice warning">{t('privacyBlock_PRIVACY_PROJECTION_UNAVAILABLE')}</p>}</>}
    <fieldset className="nested-fields"><legend>{t('privacyCategories')}</legend>{privacyCategories.map(category=><label className="checkbox-field" key={category}><input type="checkbox" checked={form.categories.includes(category)} onChange={event=>change({categories:event.target.checked?[...form.categories,category]:form.categories.filter(item=>item!==category)})}/>{t('privacyCategory_'+category)}</label>)}</fieldset>
    <label className="field" htmlFor="privacy-reason"><span>{t('reason')} <span aria-hidden="true">*</span></span><textarea id="privacy-reason" rows={4} minLength={3} maxLength={2000} required value={form.reason} onChange={event=>change({reason:event.target.value})}/></label>
    {form.type==='ACCESS'?<Scope version={form.projectionVersion} categories={form.categories} t={t}/>:<p className="privacy-boundary">{t('privacyErasureBoundary')}</p>}
    <footer className="form-footer"><Button variant="secondary" type="button" onClick={closeRequest}>{t('cancel')}</Button><Button type="submit" disabled={versionUnavailable}>{t('preview')}<ArrowRight size={16}/></Button></footer>
   </form>:stage==='review'&&reviewed?<><Badge tone="amber">{t('review')}</Badge><h3>{t('privacyType_'+reviewed.input.type)}</h3><div className="privacy-categories">{reviewed.input.categories.map(category=><Badge key={category}>{t('privacyCategory_'+category)}</Badge>)}</div><p className="issue-description-preview">{reviewed.input.reason}</p>{reviewed.input.type==='ACCESS'?<Scope version={privacyProjectionVersion(reviewed.input)} categories={reviewed.input.categories} t={t}/>:<p className="privacy-boundary">{t('privacyErasureBoundary')}</p>}<p className="privacy-boundary">{t('privacyAwaitingReview')}</p><footer className="form-footer"><Button variant="secondary" disabled={busy} onClick={()=>setStage('edit')}>{t('back')}</Button><Button disabled={busy||!navigator.onLine||versionUnavailable||!permits('privacy.request')} onClick={submit}>{busy?t('loading'):unknownOutcome?t('privacyRetrySameRequest'):t('submit')}</Button></footer></>:<div className="success-state"><CheckCircle2 size={38}/><h3>{t('privacyRequestRecorded')}</h3><p>{t('privacyAwaitingReview')}</p><Button onClick={closeRequest}>{t('completed')}</Button></div>}
  </div></Modal>}
  {exportCandidate&&<Modal title={t('privacyPrepareExport')} closeLabel={t('cancel')} onClose={closeExport}><div className="privacy-request-form">{notice}
   {candidateInfo?.projectionVersion?<Scope version={candidateInfo.projectionVersion} categories={candidateInfo.categories} t={t}/>:<p role="alert" className="notice danger">{t('privacyBlock_PRIVACY_EXPORT_SCOPE_MISMATCH')}</p>}
   {prepared?<div className="success-state"><CheckCircle2 size={36}/><h3>{t('privacyExportReady')}</h3><a className="button primary" href={'/api/v1/privacy/exports/'+encodeURIComponent(prepared.exportId)+'/download'}>{t('privacyDownload')}</a><small className="privacy-checksum">SHA-256 · {prepared.sha256}</small></div>:<><div className="privacy-categories">{(candidateInfo?.categories||[]).map(category=><Badge key={category}>{t('privacyCategory_'+category)}</Badge>)}</div><footer className="form-footer"><Button variant="secondary" onClick={closeExport}>{t('cancel')}</Button><Button disabled={busy||!navigator.onLine||!candidateInfo?.projectionVersion||!permits('privacy.export')} onClick={prepareExport}>{busy?t('loading'):unknownOutcome?t('privacyRetrySameRequest'):t('confirm')}</Button></footer></>}
  </div></Modal>}
 </section>;
}
