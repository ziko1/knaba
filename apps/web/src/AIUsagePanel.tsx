import {useEffect,useRef,useState} from 'react';
import {Badge,Button} from '../../../packages/ui/index';
import {type Language} from '../../../packages/i18n/index';
import {command,ApiError,type Entity,type Session} from './api';
import {errorText} from './CommandForm';
import './AIUsagePanel.css';

type CategoryUsage={category:string;records:number;reservedCents:number;settledCents:number;retainedReservationCents:number;unknownCostRecords:number;inputTokens:number;outputTokens:number;unknownTokenRecords:number;costBasisCounts:Record<string,number>};
type Usage={currency:string;from:string;to:string;asOf:string;categories:CategoryUsage[];totals:Omit<CategoryUsage,'category'|'costBasisCounts'>;budgets:{configId:string;configVersion:number;status:string;globalTotalCents:number;categoryBudgets:Record<string,{dailyCents:number;totalCents:number}>}[];keyStatus:{configured:boolean;validation:string};supplierStatus:string};
type Props={session:Session;configs:Entity[];t:(key:string)=>string;language:Language};
const locales:Record<Language,string>={DE:'de-DE',UK:'uk-UA',RU:'ru-RU',PL:'pl-PL',LT:'lt-LT',EN:'en-GB'};
const day=(at:number)=>new Date(at).toISOString().slice(0,10);

export default function AIUsagePanel({session,configs,t,language}:Props){
 const [from,setFrom]=useState(()=>day(Date.now()-29*86400000)),[to,setTo]=useState(()=>day(Date.now())),[configId,setConfigId]=useState('');
 const [result,setResult]=useState<Usage>(),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>();
 const generation=useRef(0),mounted=useRef(false);
 const actorKey=JSON.stringify([session.actor.companyId,session.actor.userId,session.actor.roles,session.actor.permissions]);
 const money=(cents:number)=>new Intl.NumberFormat(locales[language],{style:'currency',currency:'EUR'}).format(cents/100);
 const number=(value:number)=>new Intl.NumberFormat(locales[language]).format(value);
 const categoryName=(name:string)=>t(`aiUsageCategory_${name}`);
 async function load(selected=configId){
  const attempt=++generation.current;setBusy(true);setError(undefined);setResult(undefined);
  try{
   const start=Date.parse(`${from}T00:00:00.000Z`),end=Math.min(Date.parse(`${to}T00:00:00.000Z`)+86400000,Date.now());
   if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||end-start>93*86400000)throw new ApiError('VALIDATION_ERROR',400,{reason:'AI_USAGE_PERIOD_BOUND'});
   const value:Usage=await command('assistant.usage',{from:new Date(start).toISOString(),to:new Date(end).toISOString(),...(selected?{configId:selected}:{})});
   if(!Array.isArray(value.categories)||!value.totals||!Array.isArray(value.budgets)||value.currency!=='EUR')throw new ApiError('REQUEST_FAILED',502);
   if(mounted.current&&attempt===generation.current)setResult(value);
  }catch(err){if(mounted.current&&attempt===generation.current)setError(err)}
  finally{if(mounted.current&&attempt===generation.current)setBusy(false)}
 }
 useEffect(()=>{mounted.current=true;setResult(undefined);setError(undefined);setConfigId('');void load('');return()=>{mounted.current=false;generation.current++}},[actorKey]);
 useEffect(()=>{if(configId&&!configs.some(c=>c.id===configId)){generation.current++;setConfigId('');setResult(undefined);setBusy(false)}},[configs,configId]);
 function edit(change:()=>void){generation.current++;change();setResult(undefined);setError(undefined);setBusy(false)}
 return <section className="ai-usage-panel" data-testid="ai-usage-panel" aria-labelledby="ai-usage-title">
  <header><div><h2 id="ai-usage-title">{t('aiUsageTitle')}</h2><p>{t('aiUsageDescription')}</p></div></header>
  <form className="ai-usage-filters" onSubmit={e=>{e.preventDefault();void load()}}>
   <label className="field"><span>{t('aiUsageFrom')}</span><input type="date" required value={from} max={to} onChange={e=>edit(()=>setFrom(e.target.value))}/></label>
   <label className="field"><span>{t('aiUsageTo')}</span><input type="date" required value={to} min={from} max={day(Date.now())} onChange={e=>edit(()=>setTo(e.target.value))}/></label>
   <label className="field"><span>{t('aiPlaygroundConfig')}</span><select value={configId} onChange={e=>edit(()=>setConfigId(e.target.value))}><option value="">{t('aiUsageAllConfigs')}</option>{configs.map(c=><option key={c.id} value={c.id}>{c.data.name||c.id} · v{c.data.configVersion||c.version} · {c.data.status}</option>)}</select></label>
   <Button data-testid="ai-usage-load" disabled={busy||!navigator.onLine}>{busy?t('loading'):t('aiUsageLoad')}</Button>
  </form>
  <p className="ai-usage-note">{t('aiUsageUtc')} · {t('aiUsageIntervalNotice')}</p>
  {busy&&<p role="status">{t('loading')}</p>}
  {Boolean(error)&&<div className="notice danger" role="alert"><div>{error instanceof ApiError&&error.details.reason==='AI_USAGE_PERIOD_BOUND'?t('aiUsagePeriodInvalid'):errorText(error,t)}</div><Button variant="ghost" disabled={busy||!navigator.onLine} onClick={()=>void load()}>{t('retry')}</Button></div>}
  {result&&<div data-testid="ai-usage-result">
   <div className="ai-usage-status"><Badge tone={result.keyStatus.configured?'green':'amber'}>{t(result.keyStatus.configured?'aiUsageKeyConfigured':'aiUsageKeyMissing')}</Badge><span>{t('aiUsageKeyUnchecked')}</span><span>{t('aiUsageAsOf')}: {new Date(result.asOf).toLocaleString(locales[language],{timeZone:'Europe/Berlin'})} (Europe/Berlin)</span></div>
   <p className="ai-usage-notice">{t('aiUsageInvoicePending')}</p>
   <dl className="ai-usage-totals">{(['records','reservedCents','settledCents','retainedReservationCents','inputTokens','outputTokens'] as const).map(field=><div key={field}><dt>{t(({records:'aiUsageRecords',reservedCents:'aiUsageReserved',settledCents:'aiUsageSettled',retainedReservationCents:'aiUsageRetained',inputTokens:'aiUsageInputTokens',outputTokens:'aiUsageOutputTokens'})[field])}</dt><dd>{field.endsWith('Cents')?money(result.totals[field]):number(result.totals[field])}</dd></div>)}</dl>
   {result.categories.length===0?<p className="ai-usage-empty" data-testid="ai-usage-empty">{t('aiUsageEmpty')}</p>:<div className="ai-usage-categories">{result.categories.map(row=><article key={row.category}><h3>{categoryName(row.category)}</h3><dl>{([['aiUsageRecords',row.records],['aiUsageReserved',money(row.reservedCents)],['aiUsageSettled',money(row.settledCents)],['aiUsageRetained',money(row.retainedReservationCents)],['aiUsageInputTokens',number(row.inputTokens)],['aiUsageOutputTokens',number(row.outputTokens)],['aiUsageUnknownCost',row.unknownCostRecords],['aiUsageUnknownTokens',row.unknownTokenRecords]] as [string,string|number][]).map(([key,value])=><div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl><div className="ai-usage-basis"><span>{t('aiUsageConfiguredEstimate')}: {row.costBasisCounts.CONFIGURED_RATE_ESTIMATE||0}</span><span>{t('aiUsageProviderReported')}: {row.costBasisCounts.PROVIDER_REPORTED_COST||0}</span><span>{t('aiUsageLegacyCost')}: {row.costBasisCounts.LEGACY_UNDECLARED||0}</span></div></article>)}</div>}
   <details className="ai-usage-caps"><summary>{t('aiUsageCaps')}</summary>{result.budgets.map(b=><article key={b.configId}><h3>{configs.find(c=>c.id===b.configId)?.data.name||b.configId} · v{b.configVersion} · {b.status}</h3><p>{t('aiUsageGlobalCap')}: {money(b.globalTotalCents)}</p><div className="ai-usage-cap-list">{Object.entries(b.categoryBudgets).map(([category,limits])=><div key={category}><strong>{categoryName(category)}</strong><span>{t('aiUsageDailyCap')}: {money(limits.dailyCents)} (Europe/Berlin)</span><span>{t('aiUsageTotalCap')}: {money(limits.totalCents)}</span></div>)}</div></article>)}</details>
  </div>}
 </section>;
}
