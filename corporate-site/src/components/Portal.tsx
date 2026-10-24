import { createRequestId } from "../lib/request-id";
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch, type Accessor } from 'solid-js';
import { createQuery, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/solid-query';
import { approvedRoles, checklistItems, portalHeader, requestStatuses, type ApprovedRole, type CleaningRequest, type CleaningRequestInput, type PortalDashboard, type PortalProfile, type PortalRole, type PortalSession, type RequestPatch, type RequestStatus, type RoleInput } from '../lib/portal-contract';
import { frequencyOptions, objectOptions, portalMessages, serviceKeys, resolvePortalLocale, portalReturnTo, portalPublicPath, formatPortalDate, type PortalLocale, type PortalText } from '../lib/portal-i18n';
import '../styles/portal.css';

type Tab = 'overview' | 'requests' | 'newRequest' | 'people' | 'activity';
type Text = Accessor<PortalText>;
class PortalError extends Error { constructor(public status: number, public code = '') { super(`Portal HTTP ${status}`); } }
async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 15_000);
  const abort = () => timeout.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { ...portalHeader, 'Content-Type': 'application/json' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: timeout.signal });
    if (!response.ok) { const detail = await response.json().catch(()=>null) as {error?:{code?:string}} | null; throw new PortalError(response.status,detail?.error?.code); }
    return await response.json() as T;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function errorMessage(error: unknown, t: PortalText) {
  if (!(error instanceof PortalError)) return t.networkError;
  const specific:Record<string,string> = {checklist:t.completeHint,schedule:t.scheduleRequired,worker:t.workerUnavailable,idempotency_conflict:t.payloadChanged};
  if(specific[error.code])return specific[error.code];
  return ({ 400: t.validationError, 401: t.loginError, 403: t.forbiddenError, 404: t.forbiddenError, 409: t.conflictError, 413: t.validationError, 422: t.validationError, 429: t.rateError, 503: t.unavailableError } as Record<number,string>)[error.status] ?? t.genericError;
}
const dateLabel = formatPortalDate;
const localDateValue = (date: string | null) => {
  if (!date) return '';
  const value = new Date(date);
  if (Number.isNaN(value.valueOf())) return '';
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0,16);
};
const displayService = (value: string, t: PortalText) => serviceKeys.includes(value as typeof serviceKeys[number]) ? t[value as typeof serviceKeys[number]] : value;
const displayOption = (value: string, t: PortalText) => {
  const option = [...objectOptions, ...frequencyOptions].find((item) => item.value === value);
  return option ? t[option.key] : value;
};
function Status(props: {status: RequestStatus | PortalProfile['status']; t: Text}) { return <span class={`portal-badge portal-status-${props.status}`}>{props.t()[props.status]}</span>; }

function PortalContent(props: {locale?: PortalLocale}) {
  const cache = useQueryClient();
  const [ready, setReady] = createSignal(false);
  const [locale, setLocale] = createSignal<PortalLocale>(props.locale ?? 'de');
  const [tab, setTab] = createSignal<Tab>('overview');
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal('');
  const [error, setError] = createSignal('');
  const [filter, setFilter] = createSignal('all');
  const t = createMemo(() => portalMessages[locale()]);
  onMount(() => {
    const requested = new URLSearchParams(location.search).get('lang');
    let saved: string | null = null;
    try { saved = localStorage.getItem('knaba-portal-language'); } catch { /* Language preference is optional. */ }
    setLocale(resolvePortalLocale(requested, props.locale, saved));
    setReady(true);
  });
  const session = createQuery(() => ({ queryKey: ['knaba-session'], queryFn: ({signal}) => api<PortalSession>('/api/portal/session','GET',undefined,signal), enabled: ready(), retry: false, staleTime: 10_000, refetchOnWindowFocus: true, refetchInterval: 30_000, networkMode:'always' as const }));
  const role = () => session.data?.role ?? 'anonymous';
  const authorized = () => ['owner','admin','worker','client'].includes(role());
  const dashboard = createQuery(() => ({ queryKey: ['knaba-dashboard',session.data?.user?.id,role(),session.data?.profile?.version], queryFn: ({signal}) => api<PortalDashboard>('/api/portal/dashboard','GET',undefined,signal), enabled: ready() && authorized(), retry:false, staleTime:10_000, refetchOnWindowFocus:true, networkMode:'always' as const }));
  const requests = () => dashboard.data?.requests ?? [];
  const profiles = () => dashboard.data?.profiles ?? [];
  const isManager = () => role() === 'owner' || role() === 'admin';
  const filteredRequests = () => requests().filter((item) => filter() === 'all' || item.status === filter());
  const heading = () => role() === 'worker' ? t().assignedJobs : role() === 'client' ? t().yourRequests : t().allRequests;
  const currentTab = () => (tab() === 'people' || tab() === 'activity') && role() !== 'owner' || tab() === 'newRequest' && role() !== 'client' ? 'overview' : tab();
  async function refresh() {
    await cache.invalidateQueries({ queryKey:['knaba-session'] });
    await cache.invalidateQueries({ queryKey:['knaba-dashboard'] });
  }
  async function mutate(path: string, method: string, body: unknown, success: string) {
    if (busy()) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path,method,body); setNotice(success); await refresh(); return true;
    } catch (problem) {
      setError(errorMessage(problem,t()));
      if (problem instanceof PortalError && [401,403,404,409].includes(problem.status)) await refresh();
      return false;
    } finally { setBusy(false); }
  }
  function chooseTab(next: Tab) { setTab(next); setError(''); setNotice(''); }
  function setLanguage(value: PortalLocale) {
    setLocale(value); setError(''); setNotice('');
    try { localStorage.setItem('knaba-portal-language',value); } catch { /* Preference only. */ }
    const url = new URL(location.href); url.searchParams.set('lang', value);
    history.replaceState(history.state, '', url);
  }
  const roleGuide = () => role() === 'owner' ? t().ownerGuide : role() === 'admin' ? t().adminGuide : role() === 'worker' ? t().workerGuide : t().clientGuide;
  return <div class="portal" lang={locale()}>
    <div class="portal-utility">
      <div class="portal-brand-label"><span class="portal-live-dot" />{t().portal}<Show when={session.data?.user}><span class="portal-verified">✓ {t().authenticated}</span></Show></div>
      <div class="portal-utility-actions"><Show when={role()==='owner'}><a class="portal-signout" href={locale()==='ru'?'/ru/postfach/':'/postfach/'}>✉ {locale()==='ru'?'Сообщения клиентов':'Kundenpostfach'} ↗</a></Show><label class="portal-language"><span class="sr-only">{t().language}</span><select value={locale()} onChange={e=>setLanguage(e.currentTarget.value as PortalLocale)}><option value="de">Deutsch</option><option value="en">English</option><option value="uk">Українська</option><option value="ru">Русский</option></select></label><Show when={session.data?.user}><a data-astro-reload target="_top" href={`/signout-with-chatgpt?return_to=${encodeURIComponent(portalReturnTo(locale()))}`} class="portal-signout">{t().signOut} ↗</a></Show></div>
    </div>
    <div aria-live="polite" aria-atomic="true"><Show when={notice()}><p class="portal-alert portal-alert-success" role="status">✓ {notice()}</p></Show></div>
    <Show when={error()}><p class="portal-alert portal-alert-error" role="alert">{error()}</p></Show>
    <Switch>
      <Match when={!ready() || session.isPending}><div class="portal-empty" role="status"><span class="portal-loader" />{t().loading}</div></Match>
      <Match when={session.isError}><div class="portal-empty" role="alert"><p>{errorMessage(session.error,t())}</p><button type="button" class="button button-dark" disabled={session.isFetching} onClick={()=>void session.refetch()}>{t().retry}</button></div></Match>
      <Match when={!session.data?.user}><div class="portal-welcome-grid"><div class="portal-welcome"><span class="portal-kicker">{t().portal}</span><h2>{t().loginTitle}</h2><p>{t().loginText}</p><a data-astro-reload target="_top" class="button button-dark" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(portalReturnTo(locale()))}`}>{t().signIn}<span aria-hidden="true">↗</span></a><p class="portal-small">{t().loginNote}</p></div><div class="portal-welcome-side"><span class="portal-welcome-symbol" aria-hidden="true">✳</span><h3>{t().noAccount}</h3><p>{t().requestHelp}</p><a class="text-link" href={portalPublicPath('/kontakt/',locale())}>{t().publicInquiry} →</a></div></div></Match>
      <Match when={role()==='suspended'}><div class="portal-empty portal-wait"><span class="portal-round-symbol" aria-hidden="true">Ⅱ</span><h2>{t().suspendedTitle}</h2><p>{t().suspendedText}</p><a class="text-link" href="mailto:kontakt@knaba.de">kontakt@knaba.de ↗</a></div></Match>
      <Match when={session.data?.user && !session.data?.profile && role()!=='owner'}><Registration session={session.data!} locale={locale} t={t} busy={busy} submit={body=>mutate('/api/portal/register','POST',body,t().registered)} /></Match>
      <Match when={role()==='pending'}><div class="portal-empty portal-wait"><span class="portal-round-symbol" aria-hidden="true">◷</span><p class="portal-kicker">{t().pending}</p><h2>{t().pendingTitle}</h2><p>{t().pendingText}</p><p>{t().pendingHelp}</p><button type="button" class="button button-dark" disabled={session.isFetching} onClick={()=>void session.refetch()}>{session.isFetching?t().loading:t().refresh}</button></div></Match>
      <Match when={authorized()}>
        <div class="portal-shell">
          <aside class="portal-sidebar"><div class="portal-person"><span class="portal-avatar" aria-hidden="true">{(session.data?.profile?.name ?? session.data?.user?.name ?? 'K').slice(0,1).toUpperCase()}</span><div><p class="portal-small">{t().profileCaption}</p><strong>{session.data?.profile?.name ?? session.data?.user?.name}</strong><span class="portal-role-label">{t()[role()]}</span></div></div>
            <nav aria-label={t().portal}><For each={(['overview','requests',...(role()==='client'?['newRequest']:[]),...(role()==='owner'?['people','activity']:[])] as Tab[])}>{item=><button type="button" classList={{'portal-tab':true,'is-active':currentTab()===item}} aria-current={currentTab()===item?'page':undefined} onClick={()=>chooseTab(item)}><span aria-hidden="true">{{overview:'◈',requests:'▤',newRequest:'＋',people:'◎',activity:'↻'}[item]}</span>{t()[item]}<Show when={item==='people' && profiles().some(p=>p.status==='pending')}><span class="portal-count">{profiles().filter(p=>p.status==='pending').length}</span></Show></button>}</For></nav><p class="portal-sidebar-note">{t().security}</p>
          </aside>
          <div class="portal-content">
            <div class="portal-content-heading"><div><p class="portal-kicker">{t()[role()]}</p><h2>{currentTab()==='overview'?t().welcome:currentTab()==='requests'?heading():t()[currentTab()]}</h2></div><button type="button" class="portal-refresh" aria-label={t().refresh} disabled={dashboard.isFetching||busy()} onClick={()=>void refresh()}>↻ <span>{t().refresh}</span></button></div>
            <Show when={dashboard.isFetching && !dashboard.isPending}><p class="portal-small" role="status">{t().loading}</p></Show>
            <Show when={dashboard.isError}><div class="portal-alert portal-alert-error" role="alert"><p>{errorMessage(dashboard.error,t())}</p><button type="button" class="button button-outline" onClick={()=>void refresh()} disabled={dashboard.isFetching}>{t().retry}</button></div></Show>
            <Show when={dashboard.isPending}><div class="portal-empty" role="status">{t().loading}</div></Show>
            <Show when={dashboard.data && !dashboard.isError}>
              <Show when={dashboard.data?.limited}><p class="portal-alert">{t().limited}</p></Show>
              <Switch>
                <Match when={currentTab()==='overview'}><div class="portal-metrics"><div class="portal-metric"><span>{role()==='worker'?t().assignedJobs:t().total}</span><strong>{requests().length}</strong></div><div class="portal-metric portal-metric-lilac"><span>{t().open}</span><strong>{requests().filter(r=>!['completed','cancelled'].includes(r.status)).length}</strong></div><div class="portal-metric portal-metric-coral"><span>{role()==='owner'?t().waiting:t().completedCount}</span><strong>{role()==='owner'?profiles().filter(p=>p.status==='pending').length:requests().filter(r=>r.status==='completed').length}</strong></div></div><div class="portal-next"><span class="portal-kicker">{t().nextStep}</span><h3>{role()==='client'?t().createRequestTitle:heading()}</h3><p>{roleGuide()}</p><button type="button" class="button button-dark" onClick={()=>chooseTab(role()==='client'?'newRequest':role()==='owner'?'people':'requests')}>{role()==='client'?t().newRequest:role()==='owner'?t().people:t().requests} →</button></div><p class="portal-small">{t().notificationNote}</p></Match>
                <Match when={currentTab()==='newRequest' && role()==='client'}><RequestForm locale={locale} t={t} busy={busy} submit={async body=>{const result=await mutate('/api/portal/requests','POST',body,t().received);if(result)setTab('requests');return result;}} /></Match>
                <Match when={currentTab()==='requests'}><div class="portal-list-toolbar"><label><span class="sr-only">{t().filterLabel}</span><select value={filter()} onChange={e=>setFilter(e.currentTarget.value)}><option value="all">{t().all}</option><For each={requestStatuses}>{status=><option value={status}>{t()[status]}</option>}</For></select></label><Show when={role()==='client'}><button type="button" class="button button-dark" onClick={()=>chooseTab('newRequest')}>＋ {t().newRequest}</button></Show></div><Show when={filteredRequests().length} fallback={<div class="portal-empty"><span class="portal-round-symbol" aria-hidden="true">▤</span><p>{role()==='worker'?t().emptyJobs:isManager()?t().emptyAdmin:t().emptyRequests}</p></div>}><div class="portal-request-list"><For each={filteredRequests()}>{request=><RequestCard request={request} profiles={profiles()} role={role()} t={t} locale={locale} busy={busy} patch={(body)=>mutate(`/api/portal/requests/${encodeURIComponent(request.id)}`,'PATCH',body,t().requestUpdated)} />}</For></div></Show></Match>
                <Match when={currentTab()==='people' && role()==='owner'}><p>{t().ownerOnly}</p><Show when={profiles().length} fallback={<div class="portal-empty">{t().noProfiles}</div>}><div class="portal-profile-list"><For each={profiles()}>{profile=><ProfileCard profile={profile} t={t} locale={locale} busy={busy} submit={body=>mutate('/api/portal/roles','POST',body,t().roleChanged)} />}</For></div></Show></Match>
                <Match when={currentTab()==='activity' && role()==='owner'}><Show when={dashboard.data?.audit.length} fallback={<div class="portal-empty">{t().noAudit}</div>}><div class="portal-audit"><For each={dashboard.data?.audit}>{event=><article><span class="portal-audit-dot" aria-hidden="true"/><div><strong>{event.action.startsWith('role.') ? `${t().audit_role_updated}${event.action.startsWith('role.approved.') ? ` · ${t()[event.action.split('.')[2] as ApprovedRole]}` : ` · ${t().suspended}`}` : t()[`audit_${event.action.replace(/\./g,'_')}` as keyof PortalText] ?? t().requestUpdated}</strong><p class="portal-small">{t().auditEntity}: <span class="portal-code">{event.entityId}</span></p><p class="portal-small">{t().auditActor}: {profiles().find(p=>p.id===event.actorId)?.name ?? (event.actorId===session.data?.user?.id ? t().owner : event.actorId)}</p></div><time datetime={event.createdAt}>{dateLabel(event.createdAt,locale())}</time></article>}</For></div></Show></Match>
              </Switch>
            </Show>
          </div>
        </div>
      </Match>
    </Switch>
    <p class="portal-footer-note">{t().portalHint} <a href={portalPublicPath('/datenschutz/',locale())}>{t().privacyLink} ↗</a></p>
  </div>;
}

function Registration(props: {session:PortalSession;locale:Accessor<PortalLocale>;t:Text;busy:Accessor<boolean>;submit:(body:unknown)=>Promise<boolean>}) {
  const [name,setName]=createSignal(props.session.user?.name ?? '');
  const [role,setRole]=createSignal<'client'|'worker'>('client');
  const [accepted,setAccepted]=createSignal(false);
  return <form class="portal-form portal-registration" onSubmit={event=>{event.preventDefault();void props.submit({name:name().trim(),requestedRole:role(),privacyAccepted:accepted()});}}><span class="portal-kicker">KnaBa · {props.t().profileCaption}</span><h2>{props.t().registerTitle}</h2><p>{props.t().registerText}</p><fieldset disabled={props.busy()}><label>{props.t().name}<input autocomplete="name" required minLength={2} maxLength={80} value={name()} onInput={e=>setName(e.currentTarget.value)}/></label><label>{props.t().email}<input type="email" value={props.session.user?.email} readOnly/></label><label>{props.t().accessFor}<select value={role()} onChange={e=>setRole(e.currentTarget.value as 'client'|'worker')}><option value="client">{props.t().customer}</option><option value="worker">{props.t().employee}</option></select></label><label class="portal-checkbox"><input type="checkbox" required checked={accepted()} onChange={e=>setAccepted(e.currentTarget.checked)}/><span>{props.t().privacy} <a href={portalPublicPath('/datenschutz/',props.locale())} target="_blank" rel="noopener">{props.t().privacyLink} ↗</a></span></label><button type="submit" class="button button-dark">{props.busy()?props.t().saving:props.t().register} →</button></fieldset></form>;
}
function RequestForm(props:{locale:Accessor<PortalLocale>;t:Text;busy:Accessor<boolean>;submit:(body:CleaningRequestInput)=>Promise<boolean>}) {
  let form!:HTMLFormElement;
  let key='';
  const [service,setService]=createSignal<string>('unterhaltsreinigung');
  const [attempted,setAttempted]=createSignal(false);
  const [keyError,setKeyError]=createSignal('');
  async function submit(event:SubmitEvent) {
    event.preventDefault();if(props.busy())return;
    try {if(!key)key=createRequestId();setKeyError('');} catch {setKeyError(props.t().networkError);return;}
    const fields=new FormData(form);
    const body:CleaningRequestInput={service:service(),objectType:String(fields.get('objectType')),postcode:String(fields.get('postcode')).trim(),area:String(fields.get('area')).trim(),frequency:String(fields.get('frequency')),address:String(fields.get('address')).trim(),message:String(fields.get('message')).trim(),privacyAccepted:true,idempotencyKey:key};
    const result=await props.submit(body);setAttempted(!result);if(result){key='';form.reset();}
  }
  return <form ref={form} class="portal-form" onSubmit={submit}><p>{props.t().requestHelp}</p><fieldset disabled={props.busy()}><div class="portal-form-grid"><label>{props.t().service}<select name="service" value={service()} onChange={e=>setService(e.currentTarget.value)}><For each={serviceKeys}>{key=><option value={key}>{props.t()[key]}</option>}</For></select></label><label>{props.t().objectType}<select name="objectType"><For each={objectOptions}>{option=><option value={option.value}>{props.t()[option.key]}</option>}</For></select></label><label>{props.t().postcode}<input name="postcode" required pattern="[0-9]{5}" maxLength={5} inputmode="numeric" autocomplete="postal-code" placeholder="10315"/></label><label>{props.t().area}<input name="area" type="number" min="1" max="1000000" step="1" inputmode="numeric" placeholder="250"/></label><label>{props.t().frequency}<select name="frequency"><For each={frequencyOptions}>{option=><option value={option.value}>{props.t()[option.key]}</option>}</For></select></label><label>{props.t().address}<input name="address" maxLength={200} autocomplete="street-address"/></label></div><label>{props.t().message}<textarea name="message" rows={5} maxLength={500} required minLength={10}/></label><label class="portal-checkbox"><input type="checkbox" required/><span>{props.t().privacy} <a href={portalPublicPath('/datenschutz/',props.locale())} target="_blank" rel="noopener">{props.t().privacyLink} ↗</a></span></label><Show when={keyError()}><p class="portal-alert portal-alert-error" role="alert">{keyError()}</p></Show><Show when={attempted()}><p class="portal-small">{props.t().retryNotice} {props.t().retryKeep}</p></Show><button type="submit" class="button button-dark">{props.busy()?props.t().saving:props.t().sendRequest} →</button></fieldset></form>;
}

function RequestCard(props:{request:CleaningRequest;profiles:PortalProfile[];role:PortalRole;t:Text;locale:Accessor<PortalLocale>;busy:Accessor<boolean>;patch:(body:RequestPatch)=>Promise<boolean>}) {
  const [editing,setEditing]=createSignal(false);
  const [confirmCancel,setConfirmCancel]=createSignal(false);
  const [status,setStatus]=createSignal<RequestStatus>(props.request.status);
  const [worker,setWorker]=createSignal(props.request.assignedWorkerId??'');
  const [date,setDate]=createSignal(localDateValue(props.request.scheduledAt));
  const [checklist,setChecklist]=createSignal([...props.request.checklist]);
  const [note,setNote]=createSignal(props.request.workerNote??'');
  const [reply,setReply]=createSignal(props.request.adminReply??'');
  const [feedback,setFeedback]=createSignal(props.request.customerFeedback??'');
  const [localError,setLocalError]=createSignal('');
  const manager=()=>props.role==='owner'||props.role==='admin';
  const workerEditable=()=>props.role==='worker'&&['scheduled','in_progress'].includes(props.request.status);
  const clientEditable=()=>props.role==='client'&&props.request.status==='completed';
  const terminal=()=>['completed','cancelled'].includes(props.request.status);
  const transitions:Record<RequestStatus,RequestStatus[]>={new:['reviewing','cancelled'],reviewing:['scheduled','cancelled'],scheduled:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:[],cancelled:[]};
  const choices=()=>[props.request.status,...(props.role==='worker'?props.request.status==='scheduled'?['in_progress'] as RequestStatus[]:props.request.status==='in_progress'?['completed'] as RequestStatus[]:[]:transitions[props.request.status])];
  function openEditor(){setStatus(props.request.status);setWorker(props.request.assignedWorkerId??'');setDate(localDateValue(props.request.scheduledAt));setChecklist([...props.request.checklist]);setNote(props.request.workerNote??'');setReply(props.request.adminReply??'');setFeedback(props.request.customerFeedback??'');setLocalError('');setEditing(true);}
  async function save(event:SubmitEvent){
    event.preventDefault();setLocalError('');let body:RequestPatch={version:props.request.version};
    if(manager()){
      let scheduled:string|null=null;
      if(date()){const parsed=new Date(date());if(Number.isNaN(parsed.valueOf())){setLocalError(props.t().scheduleInvalid);return;}scheduled=parsed.toISOString();}
      body={...body,adminReply:reply().trim()};
      if(status()!==props.request.status)body.status=status();
      if(!terminal() && (worker()||null)!==props.request.assignedWorkerId)body.assignedWorkerId=worker()||null;
      if(!terminal() && date()!==localDateValue(props.request.scheduledAt))body.scheduledAt=scheduled;
    }else if(props.role==='worker'){body={...body,status:status(),checklist:checklist(),workerNote:note().trim()};}
    else{body={...body,customerFeedback:feedback().trim()};}
    if(await props.patch(body))setEditing(false);
  }
  return <article class="portal-request-card"><div class="portal-request-heading"><div><p class="portal-small">{props.t().requestNumber} <span class="portal-code">#{props.request.id.slice(-8).toUpperCase()}</span></p><h3>{displayService(props.request.service,props.t())}</h3></div><Status status={props.request.status} t={props.t}/></div><div class="portal-request-meta"><span>⌂ {displayOption(props.request.objectType,props.t())} · {props.request.postcode}</span><span>◷ {props.request.scheduledAt?dateLabel(props.request.scheduledAt,props.locale()):props.t().noDate}</span></div><div class="portal-request-summary"><Show when={props.request.area}><span>{props.request.area} {props.locale() === 'ru' ? 'м²' : 'm²'}</span></Show><span>{displayOption(props.request.frequency,props.t())}</span><Show when={manager()&&props.request.assignedWorkerId}><span>{props.t().assigned}: {props.profiles.find(p=>p.id===props.request.assignedWorkerId)?.name ?? props.t().unavailableName}</span></Show></div><details class="portal-details"><summary>{props.t().details} <span aria-hidden="true">＋</span></summary><dl><Show when={props.request.address}><div><dt>{props.t().address}</dt><dd>{props.request.address}</dd></div></Show><div><dt>{props.t().message}</dt><dd class="portal-preline">{props.request.message||props.t().emptyMessage}</dd></div><Show when={manager()}><div><dt>{props.t().contact}</dt><dd>{props.request.contactName}<Show when={props.request.email}><br/><a href={`mailto:${props.request.email}`}>{props.request.email}</a></Show><Show when={props.request.phone}><br/><span>{props.request.phone}</span></Show></dd></div></Show><div><dt>{props.t().created}</dt><dd>{dateLabel(props.request.createdAt,props.locale())}</dd></div><Show when={props.role!=='worker'}><div><dt>{props.t().feedback}</dt><dd class="portal-preline">{props.request.customerFeedback||props.t().emptyFeedback}</dd></div><div><dt>{props.t().adminReply}</dt><dd class="portal-preline">{props.request.adminReply||props.t().emptyReply}</dd></div></Show><Show when={manager()&&props.request.workerNote}><div><dt>{props.t().workerNote}</dt><dd class="portal-preline">{props.request.workerNote}</dd></div></Show></dl></details>
    <Show when={props.role==='worker'||manager()}><div class="portal-check-progress"><span>{props.t().progress}: {props.request.checklist.length} {props.t().countOf} 4</span><progress value={props.request.checklist.length} max={4} aria-label={props.t().progress}/></div></Show>
    <Show when={!editing()}><div class="portal-card-actions"><Show when={manager()||workerEditable()||clientEditable()}><button type="button" class="button button-outline" onClick={openEditor} disabled={props.busy()}>{manager()?(terminal()?props.t().adminReply:props.t().management):props.role==='worker'?props.t().workerUpdate:props.t().feedback} ↗</button></Show><Show when={props.role==='client'&&['new','reviewing'].includes(props.request.status)}><button type="button" class="portal-link-button" disabled={props.busy()} onClick={()=>setConfirmCancel(!confirmCancel())}>{props.t().cancel}</button></Show></div></Show>
    <Show when={confirmCancel()}><div class="portal-alert"><p>{props.t().cancelRequestNote}</p><div class="portal-form-actions"><button type="button" class="button button-outline" disabled={props.busy()} onClick={async()=>{if(await props.patch({version:props.request.version,status:'cancelled'}))setConfirmCancel(false);}}>{props.t().confirmCancel}</button><button type="button" class="portal-link-button" onClick={()=>setConfirmCancel(false)}>{props.t().close}</button></div></div></Show>
    <Show when={editing()}><form class="portal-form portal-edit-form" onSubmit={save}><fieldset disabled={props.busy()}><Show when={manager()||props.role==='worker'}><label>{props.t().status}<select value={status()} onChange={e=>setStatus(e.currentTarget.value as RequestStatus)}><For each={choices()}>{value=><option value={value}>{props.t()[value]}</option>}</For></select></label></Show><Show when={manager()}><div class="portal-form-grid"><label>{props.t().workerAssignment}<select value={worker()} onChange={e=>setWorker(e.currentTarget.value)} disabled={terminal()}><option value="">{props.t().unassigned}</option><For each={props.profiles.filter(p=>p.role==='worker'&&p.status==='approved')}>{profile=><option value={profile.id}>{profile.name}</option>}</For></select></label><label>{props.t().scheduledAt}<input type="datetime-local" value={date()} disabled={terminal()} onInput={e=>setDate(e.currentTarget.value)}/></label></div><p class="portal-small">{props.t().dateHelp}</p><label>{props.t().adminReply}<textarea value={reply()} maxLength={1000} rows={3} onInput={e=>setReply(e.currentTarget.value)}/></label></Show><Show when={props.role==='worker'}><div class="portal-checklist"><strong>{props.t().checklist}</strong><For each={checklistItems}>{item=><label class="portal-checkbox"><input type="checkbox" checked={checklist().includes(item)} onChange={e=>setChecklist(current=>e.currentTarget.checked?[...current,item]:current.filter(value=>value!==item))}/><span>{props.t()[item]}</span></label>}</For></div><p class="portal-small">{props.t().completeHint}</p><label>{props.t().workerNote}<textarea value={note()} maxLength={1000} rows={3} onInput={e=>setNote(e.currentTarget.value)}/></label><p class="portal-small">{props.t().workerNoteHint}</p></Show><Show when={clientEditable()}><p>{props.t().feedbackHelp}</p><label>{props.t().feedback}<textarea value={feedback()} maxLength={1000} minLength={2} required rows={3} onInput={e=>setFeedback(e.currentTarget.value)}/></label></Show><Show when={localError()}><p class="portal-alert portal-alert-error" role="alert">{localError()}</p></Show><div class="portal-form-actions"><button type="submit" class="button button-dark" disabled={props.role==='worker'&&status()==='completed'&&checklist().length!==4}>{props.busy()?props.t().saving:props.t().save}</button><button type="button" class="portal-link-button" onClick={()=>setEditing(false)}>{props.t().cancel}</button></div></fieldset></form></Show>
  </article>;
}
function ProfileCard(props:{profile:PortalProfile;t:Text;locale:Accessor<PortalLocale>;busy:Accessor<boolean>;submit:(body:RoleInput)=>Promise<boolean>}) {
  const [role,setRole]=createSignal<ApprovedRole>(props.profile.role??props.profile.requestedRole);
  const [confirmPause,setConfirmPause]=createSignal(false);
  return <article class="portal-profile-card"><div class="portal-profile-main"><span class="portal-avatar" aria-hidden="true">{props.profile.name.slice(0,1).toUpperCase()}</span><div><h3>{props.profile.name}</h3><p>{props.profile.email}</p><p class="portal-small">{props.t().requestedRole}: {props.t()[props.profile.requestedRole]} · {dateLabel(props.profile.createdAt,props.locale())}</p></div><Status status={props.profile.status} t={props.t}/></div><form class="portal-profile-controls" onSubmit={event=>{event.preventDefault();void props.submit({userId:props.profile.id,role:role(),status:'approved',version:props.profile.version});}}><label><span>{props.t().role}</span><select value={role()} disabled={props.busy()} onChange={e=>setRole(e.currentTarget.value as ApprovedRole)}><For each={approvedRoles}>{item=><option value={item}>{props.t()[item]}</option>}</For></select></label><button class="button button-dark" type="submit" disabled={props.busy()}>{props.profile.status==='suspended'?props.t().reactivate:props.profile.status==='pending'?props.t().grant:props.t().save}</button><Show when={props.profile.status==='approved'}><button class="portal-link-button" type="button" disabled={props.busy()} onClick={()=>setConfirmPause(!confirmPause())}>{props.t().suspend}</button></Show></form><Show when={confirmPause()}><div class="portal-alert"><p>{props.t().confirmSuspend}</p><div class="portal-form-actions"><button type="button" class="button button-outline" disabled={props.busy()} onClick={async()=>{if(await props.submit({userId:props.profile.id,role:props.profile.role,status:'suspended',version:props.profile.version}))setConfirmPause(false);}}>{props.t().suspend}</button><button type="button" class="portal-link-button" onClick={()=>setConfirmPause(false)}>{props.t().cancel}</button></div></div></Show></article>;
}
export default function Portal(props: {locale?: PortalLocale} = {}) {
  const cache = new QueryClient({defaultOptions:{queries:{gcTime:60_000}}});
  onCleanup(()=>cache.clear());
  return <QueryClientProvider client={cache}><PortalContent locale={props.locale}/></QueryClientProvider>;
}
