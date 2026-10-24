import {useRef, useState} from 'react';
import {AlertTriangle, ArrowRight, CheckCircle2, FileText, Plus, RefreshCw, ShieldCheck} from './icons';
import {Badge, Button, Empty, Modal} from '../../../packages/ui/index';
import {command, ApiError, type Command, type Entity, type Session} from './api';
import {errorText, type Translate} from './CommandForm';
import {type Language} from '../../../packages/i18n/index';

const categories = ['PROFILE','TIME','PAYROLL','MESSAGES','MEDIA'];
type FormValues = {type:'ACCESS'|'ERASURE';categories:string[];reason:string};
export default function PrivacyPage({records,session,allowed,t,language,onSaved,openCommand}:{records:Record<string,Entity[]>;session:Session;allowed:Command[];t:Translate;language:Language;onSaved:()=>void;openCommand:(name:string,input?:any,version?:number)=>void}) {
  const [form, setForm] = useState<FormValues>({type:'ACCESS',categories:['PROFILE'],reason:''});
  const [stage, setStage] = useState<'closed'|'edit'|'review'|'done'>('closed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [created, setCreated] = useState<Entity>();
  const [statuses, setStatuses] = useState<Record<string,Record<string,any>>>({});
  const [exportCandidate, setExportCandidate] = useState<Entity>();
  const [prepared, setPrepared] = useState<Record<string,any>>();
  const requestKey = useRef(crypto.randomUUID()), exportKey = useRef(crypto.randomUUID());
  const ownRequests = [...new Map([...(records.privacy_request || []),...(created ? [created] : [])].map(item => [item.id,item])).values()].filter(item => item.data.subjectUserId === session.actor.userId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const ownExports = (records.privacy_export || []).filter(item => item.data.subjectUserId === session.actor.userId);
  const reviewRequests = (records.privacy_request || []).filter(item => item.data.subjectUserId !== session.actor.userId);
  const permits = (name:string) => allowed.some(item => item.name === name);
  const formatter = new Intl.DateTimeFormat(language === 'UK' ? 'uk-UA' : language.toLowerCase(),{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'});
  const time = (value?:string) => value && Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : '—';
  const stateTitle = (state:string) => t(`privacyState_${state}`) === `privacyState_${state}` ? state : t(`privacyState_${state}`);
  const errorReason = error instanceof ApiError ? error.details.reason || error.code : '';
  const blocker = errorReason && t(`privacyBlock_${errorReason}`) !== `privacyBlock_${errorReason}` ? t(`privacyBlock_${errorReason}`) : undefined;

  function change(patch:Partial<FormValues>) {setForm(old => ({...old,...patch}));requestKey.current = crypto.randomUUID();setError(undefined);}
  async function submit() {
    if (busy || !form.categories.length) return;
    setBusy(true); setError(undefined);
    try {setCreated(await command('privacy.request',form,undefined,requestKey.current));setStage('done');onSaved();}
    catch (err) {setError(err);}
    finally {setBusy(false);}
  }
  async function refreshStatus(request:Entity) {
    setBusy(true); setError(undefined);
    try {const result = await command('privacy.status',{requestId:request.id});setStatuses(old => ({...old,[request.id]:result}));onSaved();}
    catch (err) {setError(err);}
    finally {setBusy(false);}
  }
  async function prepareExport() {
    if (!exportCandidate || busy) return;
    setBusy(true); setError(undefined);
    try {setPrepared(await command('privacy.export',{requestId:exportCandidate.id},undefined,exportKey.current));onSaved();}
    catch (err) {setError(err);}
    finally {setBusy(false);}
  }
  function newRequest() {setError(undefined);setCreated(undefined);setForm({type:'ACCESS',categories:['PROFILE'],reason:''});requestKey.current = crypto.randomUUID();setStage('edit');}

  return <section className="privacy-page">
    <div className="privacy-note"><ShieldCheck size={22}/><div><h2>{t('privacySelfTitle')}</h2><p>{t('privacySelfDesc')}</p><p>{t('privacyExportScope')}</p></div>{permits('privacy.request') && <Button onClick={newRequest}><Plus size={16}/>{t('privacyNewRequest')}</Button>}</div>
    {Boolean(error) && <div className="notice danger" role="alert"><AlertTriangle size={18}/><div>{blocker || errorText(error,t)}{error instanceof ApiError && <small>{error.code}</small>}</div></div>}
    {ownRequests.length === 0 ? <Empty title={t('privacyNoRequests')} description={t('privacySelfDesc')}/> : <div className="privacy-request-list">{ownRequests.map(request => {
      const data = {...request.data,...statuses[request.id]}, artifact = ownExports.find(item => item.data.requestId === request.id);
      return <article key={request.id} className="privacy-request-card"><div className="privacy-request-heading"><span className="section-icon"><FileText size={19}/></span><div><h3>{t(`privacyType_${data.type}`)}</h3><p>{time(data.requestedAt || request.createdAt)}</p></div><Badge tone={data.state === 'APPROVED_EXPORT' ? 'green' : data.state === 'REJECTED' ? 'red' : 'amber'}>{stateTitle(data.state)}</Badge></div><div className="privacy-categories">{(data.categories || []).map((category:string) => <Badge key={category}>{t(`privacyCategory_${category}`)}</Badge>)}</div><p className="privacy-request-reason">{data.reason}</p>{data.type === 'ERASURE' && <p className="privacy-boundary"><ShieldCheck size={14}/>{t('privacyErasureBoundary')}</p>}{data.state === 'REQUESTED' && <p className="privacy-boundary">{t('privacyAwaitingReview')}</p>}{data.reviewReason && <p className="privacy-request-reason">{data.reviewReason}</p>}<div className="privacy-card-actions">{permits('privacy.status') && <Button variant="ghost" disabled={busy || !navigator.onLine} onClick={() => refreshStatus(request)}><RefreshCw size={14}/>{t('refresh')}</Button>}{artifact ? <a className="button secondary" href={`/api/v1/privacy/exports/${encodeURIComponent(artifact.id)}/download`}>{t('privacyDownload')}</a> : data.type === 'ACCESS' && data.state === 'APPROVED_EXPORT' && permits('privacy.export') && <Button variant="secondary" disabled={busy || !navigator.onLine} onClick={() => {setError(undefined);setPrepared(undefined);exportKey.current = crypto.randomUUID();setExportCandidate(request);}}>{t('privacyPrepareExport')}<ArrowRight size={14}/></Button>}</div></article>;
    })}</div>}
    {permits('privacy.review') && reviewRequests.length > 0 && <section className="privacy-review-requests"><h2>{t('privacyReviewRequests')}</h2><p className="field-explanation">{t('privacyReviewBoundary')}</p>{reviewRequests.map(request => <div className="privacy-review-row" key={request.id}><div><b>{t(`privacyType_${request.data.type}`)}</b><small>{request.data.subjectUserId} · {time(request.data.requestedAt)}</small></div><Badge tone="amber">{stateTitle(request.data.state)}</Badge>{['REQUESTED','ON_LEGAL_HOLD'].includes(request.data.state) && <Button variant="secondary" onClick={() => openCommand('privacy.review',{requestId:request.id},request.version)}>{t('review')}</Button>}</div>)}</section>}
    {stage !== 'closed' && <Modal title={t('privacyNewRequest')} closeLabel={t('cancel')} onClose={() => setStage('closed')}><div className="privacy-request-form">{Boolean(error) && <div role="alert" className="notice danger">{blocker || errorText(error,t)}</div>}{stage === 'edit' ? <form onSubmit={event => {event.preventDefault();if (!form.categories.length) {setError(new ApiError('VALIDATION_ERROR',400));return;}setStage('review');}}><label className="field"><span>{t('privacyRequestType')}</span><select value={form.type} onChange={event => change({type:event.target.value as FormValues['type']})}>{['ACCESS','ERASURE'].map(type => <option key={type} value={type}>{t(`privacyType_${type}`)}</option>)}</select></label><fieldset className="nested-fields"><legend>{t('privacyCategories')}</legend>{categories.map(category => <label className="checkbox-field" key={category}><input type="checkbox" checked={form.categories.includes(category)} onChange={event => change({categories:event.target.checked ? [...form.categories,category] : form.categories.filter(item => item !== category)})}/>{t(`privacyCategory_${category}`)}</label>)}</fieldset><label className="field"><span>{t('reason')} *</span><textarea rows={4} minLength={3} maxLength={2000} required value={form.reason} onChange={event => change({reason:event.target.value})}/></label><p className="privacy-boundary">{t(form.type === 'ERASURE' ? 'privacyErasureBoundary' : 'privacyExportScope')}</p><footer className="form-footer"><Button variant="secondary" type="button" onClick={() => setStage('closed')}>{t('cancel')}</Button><Button type="submit">{t('preview')}<ArrowRight size={16}/></Button></footer></form> : stage === 'review' ? <><Badge tone="amber">{t('review')}</Badge><h3>{t(`privacyType_${form.type}`)}</h3><div className="privacy-categories">{form.categories.map(category => <Badge key={category}>{t(`privacyCategory_${category}`)}</Badge>)}</div><p className="issue-description-preview">{form.reason}</p><p className="privacy-boundary">{t('privacyAwaitingReview')}</p><footer className="form-footer"><Button variant="secondary" onClick={() => setStage('edit')}>{t('back')}</Button><Button disabled={busy || !navigator.onLine} onClick={submit}>{busy ? t('loading') : t('submit')}</Button></footer></> : <div className="success-state"><CheckCircle2 size={38}/><h3>{t('privacyRequestRecorded')}</h3><p>{t('privacyAwaitingReview')}</p><Button onClick={() => setStage('closed')}>{t('completed')}</Button></div>}</div></Modal>}
    {exportCandidate && <Modal title={t('privacyPrepareExport')} closeLabel={t('cancel')} onClose={() => setExportCandidate(undefined)}><div className="privacy-request-form">{Boolean(error) && <div role="alert" className="notice danger">{blocker || errorText(error,t)}</div>}<p className="field-explanation">{t('privacyExportScope')}</p>{prepared ? <div className="success-state"><CheckCircle2 size={36}/><h3>{t('privacyExportReady')}</h3><a className="button primary" href={`/api/v1/privacy/exports/${encodeURIComponent(prepared.exportId)}/download`}>{t('privacyDownload')}</a><small className="privacy-checksum">SHA-256 · {prepared.sha256}</small></div> : <><div className="privacy-categories">{(exportCandidate.data.categories || []).map((category:string) => <Badge key={category}>{t(`privacyCategory_${category}`)}</Badge>)}</div><footer className="form-footer"><Button variant="secondary" onClick={() => setExportCandidate(undefined)}>{t('cancel')}</Button><Button disabled={busy || !navigator.onLine} onClick={prepareExport}>{busy ? t('loading') : t('confirm')}</Button></footer></>}</div></Modal>}
  </section>;
}
