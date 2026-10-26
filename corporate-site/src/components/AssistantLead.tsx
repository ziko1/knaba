import { createEffect, createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js';
import type { AssistantLocale } from '../lib/assistant-knowledge';
import type { ErpLeadInput, ErpLeadView, ErpPublicConfig, ErpService } from '../lib/assistant-erp-contract';
import { leadActions, leadCopy } from '../lib/assistant-lead-ui';
import '../styles/assistant-lead.css';

export type LeadAction = 'preview'|'confirm'|'cancel';
const empty = ():ErpLeadInput => ({name:'',email:'',phone:'',serviceId:'',condition:'',desiredPeriod:''});

export function AssistantLeadSummary(props:{lead:ErpLeadView;locale:AssistantLocale;services?:ErpService[]}) {
  const t=()=>leadCopy[props.locale];
  const service=()=>props.services?.find(s=>s.id===props.lead.preview.serviceId)?.label[props.locale] ?? props.lead.preview.serviceId;
  return <dl class="ka-lead-summary">
    <dt>{t().name}</dt><dd>{props.lead.preview.name}</dd>
    <Show when={props.lead.preview.email}><dt>{t().email}</dt><dd>{props.lead.preview.email}</dd></Show>
    <Show when={props.lead.preview.phone}><dt>{t().phone}</dt><dd>{props.lead.preview.phone}</dd></Show>
    <dt>{t().service}</dt><dd>{service()}</dd>
    <Show when={props.lead.preview.condition}><dt>{t().condition}</dt><dd>{props.lead.preview.condition}</dd></Show>
    <Show when={props.lead.preview.desiredPeriod}><dt>{t().period}</dt><dd>{props.lead.preview.desiredPeriod}</dd></Show>
  </dl>;
}

export default function AssistantLead(props:{
  locale:AssistantLocale;conversationKey:string;lead?:ErpLeadView|null;canStart:boolean;busy:boolean;closed:boolean;
  onAction:(action:LeadAction,input:unknown)=>Promise<ErpLeadView|null>;
  onRefresh:()=>Promise<void>;
}) {
  const t=()=>leadCopy[props.locale],uid=createUniqueId();
  const [config,setConfig]=createSignal<ErpPublicConfig|null>(null),[input,setInput]=createSignal(empty());
  const [editing,setEditing]=createSignal(false),[expanded,setExpanded]=createSignal(false),[confirmed,setConfirmed]=createSignal(false);
  const [pending,setPending]=createSignal(false),[fault,setFault]=createSignal(''),[clock,setClock]=createSignal(Date.now());
  let active=true,sequence=0,status:HTMLParagraphElement|undefined,first:HTMLInputElement|undefined;
  let oldKey=props.conversationKey,oldVersion=props.lead?.version;
  const actions=()=>leadActions(props.lead,clock());
  const locked=()=>props.busy||pending();
  const editable=()=>actions().edit&&!props.closed&&config()?.enabled;
  const showForm=()=>editable()&&(!props.lead||props.lead.state==='CANCELLED'||editing());
  const update=(field:keyof ErpLeadInput,value:string)=>{setInput(old=>({...old,[field]:value}));setConfirmed(false);setFault('');};
  createEffect(()=>{
    const key=props.conversationKey,version=props.lead?.version;
    if(key!==oldKey){
      // Creating the protected conversation is part of the first preview request.
      // Keep the typed details if that request fails after conversation creation.
      const creating=oldKey==='new'&&pending();oldKey=key;
      if(!creating)setInput(empty());
      setEditing(false);setConfirmed(false);setFault('');
    }
    if(version!==oldVersion){oldVersion=version;setConfirmed(false);}
    // A server transition always exits local editing, including an external cancellation/acceptance.
    if(props.lead&&!['DRAFT','CANCELLED'].includes(props.lead.state))setEditing(false);
  });
  onMount(()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    void fetch('/api/assistant/lead-config',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('config');return response.json() as Promise<ErpPublicConfig>;})
      .then(value=>{if(active&&typeof value.enabled==='boolean'&&Array.isArray(value.services))setConfig(value);})
      .catch(()=>{/* The existing human chat remains available when export is unavailable. */})
      .finally(()=>clearTimeout(timeout));
    const timer=setInterval(()=>setClock(Date.now()),1000);
    onCleanup(()=>{active=false;sequence++;controller.abort();clearTimeout(timeout);clearInterval(timer);});
  });
  async function act(action:LeadAction,body:unknown) {
    if(locked())return;
    const current=++sequence;setPending(true);setFault('');
    try {
      await props.onAction(action,body);
      if(!active||current!==sequence)return;
      setEditing(false);setConfirmed(false);setExpanded(true);
      queueMicrotask(()=>status?.focus());
    } catch(error) {
      if(active&&current===sequence){
        const code=error instanceof Error?error.message:'';
        setFault(code==='409'||code==='422'?t().changed:code==='privacy_required'||code==='captcha_required'?t().privacy:t().failure);
      }
    } finally {if(active&&current===sequence)setPending(false);}
  }
  function preview(event:Event) {
    event.preventDefault();const value=input();
    if(!value.name.trim()||(!value.email.trim()&&!value.phone.trim())||!config()?.services.some(s=>s.id===value.serviceId)){setFault(t().required);return;}
    if(!props.canStart){setFault(t().privacy);return;}
    void act('preview',{...value});
  }
  function edit() {
    if(locked()||!editable())return;
    setInput(props.lead?{...props.lead.preview}:empty());setEditing(true);setConfirmed(false);setFault('');setExpanded(true);
    queueMicrotask(()=>first?.focus());
  }
  async function refresh() {
    if(locked())return;setPending(true);setFault('');
    try{await props.onRefresh();}catch{if(active)setFault(t().failure);}finally{if(active)setPending(false);}
  }
  return <Show when={config()?.enabled||props.lead}>
    <section class="ka-lead" aria-labelledby={`${uid}-heading`}>
      <button id={`${uid}-heading`} type="button" class="ka-lead-toggle" aria-expanded={expanded()} aria-controls={`${uid}-body`} onClick={()=>setExpanded(v=>!v)}>
        {t().title}<span aria-hidden="true">{expanded()?'−':'+'}</span>
      </button>
      <Show when={props.lead}><p ref={status} tabIndex={-1} role="status" class="ka-lead-status">{t().states[props.lead!.state]}</p></Show>
      <div id={`${uid}-body`} hidden={!expanded()}>
        <p class="ka-lead-note">{t().intro}</p>
        <Show when={showForm()}>
          <form class="ka-lead-form" onSubmit={preview}>
            <label for={`${uid}-name`}>{t().name}<input ref={first} id={`${uid}-name`} autocomplete="name" value={input().name} onInput={e=>update('name',e.currentTarget.value)} maxLength={80} required disabled={locked()}/></label>
            <p id={`${uid}-contact`} class="ka-lead-note">{t().contactHint}</p>
            <label for={`${uid}-email`}>{t().email}<input id={`${uid}-email`} type="email" autocomplete="email" aria-describedby={`${uid}-contact`} value={input().email} onInput={e=>update('email',e.currentTarget.value)} maxLength={254} disabled={locked()}/></label>
            <label for={`${uid}-phone`}>{t().phone}<input id={`${uid}-phone`} type="tel" autocomplete="tel" aria-describedby={`${uid}-contact`} value={input().phone} onInput={e=>update('phone',e.currentTarget.value)} maxLength={35} disabled={locked()}/></label>
            <label for={`${uid}-service`}><span id={`${uid}-service-label`}>{t().service}</span><select id={`${uid}-service`} aria-labelledby={`${uid}-service-label`} value={input().serviceId} onChange={e=>update('serviceId',e.currentTarget.value)} required disabled={locked()}><option value="">{t().choose}</option><For each={config()?.services??[]}>{service=><option value={service.id}>{service.label[props.locale]}</option>}</For></select></label>
            <label for={`${uid}-condition`}>{t().condition} ({t().optional})<textarea id={`${uid}-condition`} rows={3} value={input().condition} onInput={e=>update('condition',e.currentTarget.value)} maxLength={1000} disabled={locked()}/></label>
            <label for={`${uid}-period`}>{t().period} ({t().optional})<input id={`${uid}-period`} value={input().desiredPeriod} onInput={e=>update('desiredPeriod',e.currentTarget.value)} maxLength={200} disabled={locked()}/></label>
            <Show when={!props.canStart}><p class="ka-lead-note">{t().privacy}</p></Show>
            <button type="submit" class="ka-lead-primary" disabled={locked()||!props.canStart}>{t().preview}</button>
          </form>
        </Show>
        <Show when={props.lead&&!showForm()}>
          <h4 class="ka-lead-review-title">{t().review}</h4>
          <AssistantLeadSummary lead={props.lead!} locale={props.locale} services={config()?.services}/>
          <Show when={actions().expired}><p role="status" class="ka-lead-note">{t().expired}</p></Show>
          <Show when={actions().confirm&&!props.closed&&config()?.enabled}>
            <label class="ka-lead-consent"><input type="checkbox" checked={confirmed()} disabled={locked()} onChange={e=>setConfirmed(e.currentTarget.checked)}/><span>{t().consent}</span></label>
            <button type="button" class="ka-lead-primary" disabled={locked()||!confirmed()} onClick={()=>{const lead=props.lead;if(lead&&confirmed()&&leadActions(lead,Date.now()).confirm)void act('confirm',{version:lead.version,previewHash:lead.previewHash,confirmed:true});}}>{t().confirm}</button>
          </Show>
          <div class="ka-lead-actions">
            <Show when={editable()}><button type="button" disabled={locked()} onClick={edit}>{t().edit}</button></Show>
            <Show when={actions().cancel}><button type="button" disabled={locked()} onClick={()=>void act('cancel',{})}>{t().cancel}</button></Show>
            <button type="button" disabled={locked()} onClick={()=>void refresh()}>{t().refresh}</button>
          </div>
          <Show when={props.lead?.cancelRequested&&props.lead.state!=='CANCELLED'}><p role="status" class="ka-lead-note">{t().cancelPending}</p></Show>
          <Show when={props.lead?.state==='APPLIED'}><p class="ka-lead-note">{t().newConversation}</p></Show>
        </Show>
        <Show when={fault()}><p role="alert" class="ka-lead-error">{fault()}</p></Show>
      </div>
    </section>
  </Show>;
}
