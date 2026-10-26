import {useEffect,useRef,useState} from 'react';
import {Badge,Button} from '../../../packages/ui/index';
import {languages,languageNames,type Language} from '../../../packages/i18n/index';
import {command,ApiError,type Entity,type Session} from './api';
import {errorText} from './CommandForm';
import './AssistantPlayground.css';

type TestMessage={language:Language;text:string};
type Simulation={status:'SIMULATED';providerInvoked:false;businessEffectsExecuted:false;configId:string;configVersion:number;costCents:0;transcript:{language:Language;scenario:string;answer:string;handoffWouldBeRequired:boolean;teamConfirmed:false;scheduleConfirmed:false}[];sources:{id:string;title?:string;content?:string}[];services:{id:string;name:string;description?:string}[]};
type Props={session:Session;configs:Entity[];t:(key:string)=>string;language:Language};
const scenarios=['AUTO','GREETING','SERVICE_SEARCH','CLARIFICATION','HANDOFF','PROMPT_INJECTION'];

export default function AssistantPlayground({session,configs,t,language}:Props){
 const [configId,setConfigId]=useState(''),[messageLanguage,setMessageLanguage]=useState<Language>(language),[text,setText]=useState(''),[scenario,setScenario]=useState('AUTO'),[synthetic,setSynthetic]=useState(false);
 const [messages,setMessages]=useState<TestMessage[]>([]),[review,setReview]=useState<TestMessage[]>(),[result,setResult]=useState<Simulation>(),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>();
 const generation=useRef(0),mounted=useRef(true);
 const actorKey=JSON.stringify([session.actor.companyId,session.actor.userId,session.actor.roles,session.actor.permissions]);
 const config=configs.find(c=>c.id===configId),configKey=config?`${config.id}:${config.version}:${config.data.configVersion}`:'';
 function discard(){generation.current++;setText('');setMessages([]);setReview(undefined);setResult(undefined);setError(undefined);setBusy(false);setSynthetic(false)}
 useEffect(()=>{mounted.current=true;discard();setConfigId('');return()=>{mounted.current=false;generation.current++}},[actorKey]);
 useEffect(()=>{discard();setMessageLanguage(config?.data.supportedLanguages?.includes(language)?language:'DE')},[configKey]);
 useEffect(()=>{if(configId&&!configs.some(c=>c.id===configId)){discard();setConfigId('')}},[configs,configId]);
 const availableLanguages=languages.filter(lang=>!config||config.data.supportedLanguages?.includes(lang));
 function prepare(){
  setError(undefined);const next=[...messages,{language:messageLanguage,text:text.trim()}];
  if(!config||!synthetic||!text.trim()||next.length>20){setError(new ApiError('VALIDATION_ERROR',400));return}
  setReview(next);
 }
 async function run(){
  if(!review||!config||!synthetic)return;const attempt=++generation.current;setBusy(true);setError(undefined);setResult(undefined);
  try{
   const value:Simulation=await command('assistant.playground',{configId:config.id,configVersion:config.data.configVersion,synthetic:true,messages:review,scenario});
   if(value.status!=='SIMULATED'||value.providerInvoked!==false||value.businessEffectsExecuted!==false||value.configId!==config.id||!Array.isArray(value.transcript))throw new ApiError('REQUEST_FAILED',502);
   if(mounted.current&&attempt===generation.current){setMessages(review);setResult(value);setReview(undefined);setText('')}
  }catch(err){if(mounted.current&&attempt===generation.current){if(err instanceof ApiError&&['ACCESS_DENIED','NEEDS_REAUTH','UNAUTHENTICATED','VERSION_CONFLICT'].includes(err.code))discard();setError(err)}}
  finally{if(mounted.current&&attempt===generation.current)setBusy(false)}
 }
 return <section className="assistant-playground" data-testid="ai-playground" aria-labelledby="assistant-playground-title">
  <header><h2 id="assistant-playground-title">{t('aiPlaygroundTitle')}</h2><p>{t('aiPlaygroundDescription')}</p></header>
  <div className="assistant-playground-policy"><Badge tone="amber">SIMULATED · {t('aiPlaygroundSimulated')}</Badge><span>{t('aiPlaygroundNoProvider')}</span><span>{t('aiPlaygroundNoBusiness')}</span></div>
  <label className="field"><span>{t('aiPlaygroundConfig')}</span><select data-testid="ai-playground-config" value={configId} disabled={busy} onChange={e=>setConfigId(e.target.value)}><option value="">{t('none')}</option>{configs.map(c=><option key={c.id} value={c.id}>{c.data.name||c.id} · v{c.data.configVersion||c.version} · {c.data.status}</option>)}</select></label>
  {configs.length===0&&<p className="assistant-playground-empty">{t('aiPlaygroundNoConfigs')}</p>}
  {Boolean(error)&&<div className="notice danger" role="alert"><span>{errorText(error,t)}</span>{review&&<Button variant="ghost" disabled={busy||!navigator.onLine} onClick={()=>void run()}>{t('retry')}</Button>}</div>}
  {result&&<div className="assistant-playground-result" data-testid="ai-playground-result" data-provider-invoked="false" data-business-effects-executed="false" aria-live="polite">
   <div className="assistant-playground-result-header"><Badge tone="amber">SIMULATED</Badge><span>v{result.configVersion} · 0 EUR</span></div>
   <ol className="assistant-playground-transcript">{result.transcript.map((reply,index)=><li key={index}><div className="assistant-playground-user"><span>{languageNames[messages[index]?.language||reply.language]}</span><p>{messages[index]?.text}</p></div><div className="assistant-playground-reply"><strong>{t('aiPlaygroundReply')} · {languageNames[reply.language]}</strong><p>{reply.answer}</p>{reply.handoffWouldBeRequired&&<small>{t('aiPlaygroundHumanNeeded')}</small>}</div></li>)}</ol>
   <p className="assistant-playground-footnote">{t('aiPlaygroundNoTeamConfirmation')}</p>
   {result.services?.length>0&&<details><summary>{t('aiPlaygroundServices')} ({result.services.length})</summary><ul>{result.services.map(service=><li key={service.id}><strong>{service.name}</strong>{service.description&&<p>{service.description}</p>}</li>)}</ul></details>}
   {result.sources?.length>0&&<details><summary>{t('aiPlaygroundSources')} ({result.sources.length})</summary><ul>{result.sources.map(source=><li key={source.id}><strong>{source.title||source.id}</strong>{source.content&&<p>{source.content}</p>}</li>)}</ul></details>}
  </div>}
  {review?<div className="assistant-playground-review"><h3>{t('aiPlaygroundReview')}</h3><p>{t('aiPlaygroundReviewNotice')}</p><ol>{review.map((message,index)=><li key={index}><span>{languageNames[message.language]}</span><p>{message.text}</p></li>)}</ol><div className="assistant-playground-actions"><Button variant="secondary" disabled={busy} onClick={()=>setReview(undefined)}>{t('back')}</Button><Button data-testid="ai-playground-run" disabled={busy||!navigator.onLine} onClick={()=>void run()}>{busy?t('loading'):t('aiPlaygroundRun')}</Button></div></div>:<form onSubmit={e=>{e.preventDefault();prepare()}}>
   <fieldset disabled={busy||!config||messages.length>=20} className="assistant-playground-fields">
    <label className="field"><span>{t('language')}</span><select value={messageLanguage} onChange={e=>setMessageLanguage(e.target.value as Language)}>{availableLanguages.map(lang=><option key={lang} value={lang}>{languageNames[lang]}</option>)}</select></label>
    <label className="field"><span>{t('aiPlaygroundScenario')}</span><select value={scenario} onChange={e=>setScenario(e.target.value)}>{scenarios.map(item=><option key={item} value={item}>{t(`aiPlaygroundScenario_${item}`)}</option>)}</select></label>
    <label className="field assistant-playground-message"><span>{t('aiPlaygroundMessage')}</span><textarea data-testid="ai-playground-input" required minLength={1} maxLength={4000} rows={4} value={text} onChange={e=>setText(e.target.value)}/><small>{messages.length}/20 · {t('aiPlaygroundLimit')}</small></label>
    <label className="assistant-playground-consent"><input data-testid="ai-playground-synthetic" type="checkbox" required checked={synthetic} onChange={e=>setSynthetic(e.target.checked)}/><span>{t('aiPlaygroundSynthetic')}</span></label>
   </fieldset>
   <div className="assistant-playground-actions"><Button data-testid="ai-playground-clear" type="button" variant="secondary" disabled={busy} onClick={discard}>{t('aiPlaygroundClear')}</Button><Button data-testid="ai-playground-review" disabled={busy||!config||!text.trim()||!synthetic||messages.length>=20}>{t('aiPlaygroundReview')}</Button></div>
  </form>}
 </section>;
}
