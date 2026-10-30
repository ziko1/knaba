import { createRequestId } from "../lib/request-id";
import { createEffect, createMemo, createSignal, For, lazy, Match, onCleanup, onMount, Show, Suspense, Switch, type Accessor } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { createQuery, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/solid-query';
import { approvedRoles, checklistItems, portalHeader, requestStatuses, type ApprovedRole, type CleaningRequest, type CleaningRequestInput, type PortalDashboard, type PortalProfile, type PortalRole, type PortalSession, type RequestPatch, type RequestStatus, type RoleInput } from '../lib/portal-contract';
import { frequencyOptions, objectOptions, portalMessages, ensurePortalLocale, serviceKeys, resolvePortalLocale, portalReturnTo, portalPublicPath, formatPortalDate, type PortalLocale, type PortalText } from '../lib/portal-i18n';
import { hostingAuthentication, nativeSignInCopy } from '../lib/hosting-auth';
import '../styles/portal.css';
import '../styles/workspace.css';
import DeveloperWorkspaceBar from './DeveloperWorkspaceBar';
import { workspaceWords } from '../lib/workspace-i18n';
import { appendDashboardPage, cabinetSummary, filterCabinetProfiles, loadDashboardWindow, type CabinetCollection } from '../lib/cabinet-summary';
import { cabinetWords } from '../lib/portal-locale-data';
import { createRequestAttempt, type RequestOutcome } from '../lib/request-attempt';
import { listenWorkspaceNavigation, resolvePortalTab, resolveRequestFilter, workspaceHref, type PortalTab } from '../lib/workspace-navigation';
const PortalConversations = lazy(() => import('./PortalConversations'));
const Inquiry = lazy(() => import('./Inquiry'));
const hostingAuth = hostingAuthentication();

type Tab = PortalTab;
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
  const specific:Record<string,string> = {checklist:t.completeHint,schedule:t.scheduleRequired,worker:t.workerUnavailable,bauleiter:t.bauleiterUnavailable,idempotency_conflict:t.payloadChanged};
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

function PortalContent(props: {locale?: PortalLocale; embedded?: boolean; testing?: boolean; active?: boolean}) {
  const cache = useQueryClient();
  const [ready, setReady] = createSignal(false);
  const [locale, setLocale] = createSignal<PortalLocale>(props.locale&&Object.hasOwn(portalMessages,props.locale)?props.locale:'de');
  const [languageBusy,setLanguageBusy]=createSignal(false);
  let languageAttempt=0,languageDisposed=false;
  const [tab, setTab] = createSignal<Tab>('overview');
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal('');
  const [error, setError] = createSignal('');
  const [filter, setFilter] = createSignal('all');
  const [search, setSearch] = createSignal('');
  const [peopleSearch, setPeopleSearch] = createSignal('');
  const [peopleStatus, setPeopleStatus] = createSignal('all');
  const [loadingPage, setLoadingPage] = createSignal<CabinetCollection | null>(null);
  let requestPages = 1, profilePages = 1;
  let pageController: AbortController | undefined;
  const [testing, setTesting] = createSignal(false);
  const [messagesVisited, setMessagesVisited] = createSignal(false);
  let region: HTMLDivElement | undefined;
  const w = () => workspaceWords[locale()];
  const c = () => cabinetWords[locale()];
  const tabLabel = (value: Tab) => value === 'conversations' ? w().conversations : t()[value];
  const tabHref = (value: Tab) => workspaceHref(typeof location === 'undefined' ? '/konto/' : location.href, {tab:value,lang:locale()});
  const signIn = () => hostingAuth.signIn(portalReturnTo(locale()))
    + (hostingAuth.passwordAccounts ? '&lang=' + locale() : '');
  const guardedError = (problem: unknown) => problem instanceof PortalError && [401,403].includes(problem.status);
  const t = createMemo(() => portalMessages[locale()]);
  async function loadLanguage(next:PortalLocale){
    const attempt=++languageAttempt;setLanguageBusy(true);
    try{
      await ensurePortalLocale(next);
      if(languageDisposed||attempt!==languageAttempt)return false;
      setLocale(next);return true;
    }catch{
      if(!languageDisposed&&attempt===languageAttempt)setError(t().networkError);
      return false;
    }finally{if(!languageDisposed&&attempt===languageAttempt)setLanguageBusy(false);}
  }
  onCleanup(()=>{languageDisposed=true;languageAttempt++;});
  onMount(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('knaba-portal-language'); } catch { /* Language preference is optional. */ }
    const readUrl = () => {
      const params = new URLSearchParams(location.search);
      const requestedTab = params.get('tab') || 'overview';
      setTab(requestedTab as Tab);
      setFilter(resolveRequestFilter(params.get('status')));
      setSearch((params.get('q') || '').slice(0,160));
      void loadLanguage(resolvePortalLocale(params.get('lang'),props.locale,saved)).then(()=>{if(!languageDisposed)setReady(true);});
    };
    readUrl();
    const beforeLeave = (event: BeforeUnloadEvent) => {
      if (region?.querySelector('[data-knaba-dirty="true"]')) { event.preventDefault(); Reflect.set(event,'returnValue',''); }
    };
    const stopNavigation = listenWorkspaceNavigation(readUrl, !props.embedded, () => Boolean(region?.querySelector('[data-knaba-dirty="true"]')));
    window.addEventListener('beforeunload', beforeLeave);
    onCleanup(() => { stopNavigation(); window.removeEventListener('beforeunload',beforeLeave); });
  });
  const session = createQuery(() => ({ queryKey: ['knaba-session'], queryFn: ({signal}) => api<PortalSession>('/api/portal/session','GET',undefined,signal), enabled: ready(), retry: false, staleTime: 10_000, refetchOnWindowFocus: props.active!==false, refetchInterval: props.active===false?false:30_000, networkMode:'always' as const }));
  const role = () => session.data?.role ?? 'anonymous';
  const authorized = () => ['owner','admin','worker','client','partner','bauleiter'].includes(role());
  const canRequest = () => role() === 'client' || role() === 'partner';
  const dashboardKey = () => ['knaba-dashboard',session.data?.user?.id,role(),session.data?.profile?.version];
  const dashboard = createQuery(() => ({ queryKey: dashboardKey(), queryFn: ({signal}) => loadDashboardWindow(query => api<PortalDashboard>('/api/portal/dashboard'+query,'GET',undefined,signal), requestPages, profilePages), enabled: ready() && authorized(), retry:false, staleTime:10_000, refetchOnWindowFocus:props.active!==false, networkMode:'always' as const }));
  const dashboardMatchesSession = () => dashboard.data?.session.user?.id === session.data?.user?.id && dashboard.data?.session.role === role();
  const [records, setRecords] = createStore<{requests:CleaningRequest[];profiles:PortalProfile[]}>({requests:[],profiles:[]});
  let recordIdentity = '';
  createEffect(() => {
    const identity = (session.data?.user?.id || '') + ':' + role();
    if (identity !== recordIdentity || guardedError(session.error) || guardedError(dashboard.error)) {
      recordIdentity=identity;setRecords({requests:[],profiles:[]});
      requestPages=1;profilePages=1;pageController?.abort();setLoadingPage(null);setPeopleSearch('');setPeopleStatus('all');
    }
    if (dashboard.data && dashboardMatchesSession() && !guardedError(session.error) && !guardedError(dashboard.error)) {
      setRecords('requests',reconcile(dashboard.data.requests,{key:'id'}));
      setRecords('profiles',reconcile(dashboard.data.profiles,{key:'id'}));
    }
  });
  createEffect(() => { if (props.embedded && props.locale) void loadLanguage(props.locale); });
  const requests = () => records.requests;
  const profiles = () => records.profiles;
  const summary = createMemo(() => cabinetSummary(requests()));
  const pendingProfiles = createMemo(() => profiles().filter(profile=>profile.status==='pending').length);
  const visibleProfileIds = createMemo(() => new Set(filterCabinetProfiles(profiles(),peopleSearch(),peopleStatus()).map(profile=>profile.id)));
  onCleanup(()=>pageController?.abort());
  async function loadMore(collection: CabinetCollection) {
    const current=dashboard.data;
    const cursor=collection==='requests'?current?.page.nextRequestCursor:current?.page.nextProfileCursor;
    if(!current||!cursor||loadingPage()||dashboard.isFetching||busy())return;
    const identity=recordIdentity;const key=dashboardKey();
    const controller=new AbortController();pageController=controller;setLoadingPage(collection);setError('');
    try {
      const query=new URLSearchParams({[collection==='requests'?'requestCursor':'profileCursor']:cursor});
      const page=await api<PortalDashboard>('/api/portal/dashboard?'+query,'GET',undefined,controller.signal);
      if(controller.signal.aborted||recordIdentity!==identity||dashboard.data!==current)return;
      const combined=appendDashboardPage(current,page,collection);
      if(collection==='requests')requestPages++;else profilePages++;
      cache.setQueryData(key,combined);
    } catch(problem) {
      if(!controller.signal.aborted&&recordIdentity===identity){setError(errorMessage(problem,t()));if(guardedError(problem))await refresh();}
    } finally {if(pageController===controller){pageController=undefined;setLoadingPage(null);}}
  }
  function MoreButton(props: {collection: CabinetCollection}) {
    return <button type="button" class="button button-outline" data-cabinet-more={props.collection} disabled={Boolean(loadingPage())||dashboard.isFetching||busy()} onClick={()=>void loadMore(props.collection)}>{loadingPage()===props.collection?t().loading:props.collection==='requests'?c().moreRequests:c().moreProfiles}</button>;
  }
  function CollectionFooter(props: {collection: CabinetCollection; staff?: boolean}) {
    return <div class="portal-form-actions"><p class="portal-small" role="status">{props.collection==='requests'?c().loaded:c().loadedProfiles}: {records[props.collection].length}<Show when={dashboard.data?.totals}> {c().of} {dashboard.data?.totals?.[props.collection]}</Show></p><Show when={props.collection==='requests'?dashboard.data?.page.nextRequestCursor:dashboard.data?.page.nextProfileCursor}><MoreButton collection={props.collection}/></Show><Show when={props.staff&&dashboard.data?.page.nextProfileCursor}><MoreButton collection="profiles"/></Show></div>;
  }
  const isManager = () => role() === 'owner' || role() === 'admin' || role() === 'bauleiter';
  const matchesRequest = (item:CleaningRequest) => (filter() === 'all' || item.status === filter()) && (!search().trim() || [item.id,item.postcode,item.address,item.contactName,item.objectType].join(' ').toLocaleLowerCase().includes(search().trim().toLocaleLowerCase()));
  const filteredRequests = () => requests().filter(matchesRequest);
  const heading = () => role() === 'bauleiter' ? t().yourSites : role() === 'worker' ? t().assignedJobs : canRequest() ? t().yourRequests : t().allRequests;
  const currentTab = () => resolvePortalTab(tab(),role());
  createEffect(() => { if (currentTab()==='conversations') setMessagesVisited(true); });
  async function refresh() {
    await cache.invalidateQueries({ queryKey:['knaba-session'] });
    await cache.invalidateQueries({ queryKey:['knaba-dashboard'] });
  }
  async function mutate(path: string, method: string, body: unknown, success: string, rejected?: (problem: unknown) => void) {
    if (busy()) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path,method,body); setNotice(success); await refresh(); return true;
    } catch (problem) {
      rejected?.(problem);
      setError(errorMessage(problem,t()));
      if (problem instanceof PortalError && [401,403,404,409].includes(problem.status)) await refresh();
      return false;
    } finally { setBusy(false); }
  }
  let viewHeading: HTMLHeadingElement | undefined;
  function chooseTab(next: Tab, preserveNotice = false) {
    setTab(next); setError(''); if (!preserveNotice) setNotice('');
    history.pushState(history.state,'',tabHref(next));
    queueMicrotask(()=>viewHeading?.isConnected&&viewHeading.focus());
  }
  function showRequests(status='all',query='') {updateFilter(status);updateSearch(query);chooseTab('requests');}
  function messageAbout(request:CleaningRequest) {
    setTab('conversations');setError('');setNotice('');
    history.pushState(history.state,'',workspaceHref(location.href,{tab:'conversations',request:request.id,conversation:null,lang:locale()}));
    window.dispatchEvent(new Event('knaba:workspace:navigate'));
    queueMicrotask(()=>viewHeading?.isConnected&&viewHeading.focus());
  }
  function updateFilter(value:string) {setFilter(resolveRequestFilter(value));history.replaceState(history.state,'',workspaceHref(location.href,{status:value==='all'?null:value}));}
  function updateSearch(value:string) {setSearch(value.slice(0,160));history.replaceState(history.state,'',workspaceHref(location.href,{q:value||null}));}
  onMount(()=>{
    const authChanged=()=>{void refresh();};
    document.addEventListener('knaba:auth-changed',authChanged);
    onCleanup(()=>document.removeEventListener('knaba:auth-changed',authChanged));
  });
  async function setLanguage(value: PortalLocale) {
    if(!await loadLanguage(value))return;
    setError(''); setNotice('');
    try { localStorage.setItem('knaba-portal-language',value); } catch { /* Preference only. */ }
    const url = new URL(location.href); url.searchParams.set('lang', value);
    history.replaceState(history.state, '', url);
  }
  const roleGuide = () => role() === 'bauleiter' ? t().bauleiterGuide : role() === 'owner' ? t().ownerGuide : role() === 'admin' ? t().adminGuide : role() === 'worker' ? t().workerGuide : role() === 'partner' ? t().partnerGuide : t().clientGuide;
  return <div ref={region} class="portal" classList={{'portal-embedded':props.embedded}} lang={locale()}>
    <Show when={!props.embedded}><header class="portal-page-intro" classList={{'sr-only':Boolean(session.data?.user)}}><h1>{session.data?.user?t().portal:w().entryTitle}</h1><Show when={!session.data?.user}><p>{w().entryIntro}</p></Show></header></Show>
    <Show when={!props.embedded}><DeveloperWorkspaceBar locale={locale()} onEnabled={setTesting}/></Show>
    <Show when={!props.embedded}><div class="portal-utility">
      <div class="portal-brand-label"><span class="portal-live-dot" />{t().portal}<Show when={session.data?.user}><span class="portal-verified">✓ {t().authenticated}</span></Show></div>
      <div class="portal-utility-actions"><a data-astro-reload class="portal-signout" href={locale()==='de'?'/':`/${locale()}/`}>{t().website}</a><Show when={role()==='owner'&&!testing()&&!props.testing&&hostingAuth.passwordAccounts}><a data-astro-reload target="_top" class="portal-signout" href={'/invite-user/?lang='+locale()}>{locale()==='pl'?'Zaproś użytkownika':locale()==='lt'?'Pakviesti naudotoją':locale()==='uk'?'Запросити користувача':locale()==='ru'?'Пригласить пользователя':locale()==='en'?'Invite a user':'Benutzer einladen'} ↗</a></Show><Show when={role()==='owner'||role()==='admin'}><a class="portal-signout" href={'/admin/?lang='+locale()}>◈ {locale()==='pl'?'Administracja':locale()==='lt'?'Administravimas':locale()==='uk'?'Адмінпанель':locale()==='ru'?'Админпанель':'KNABA Control Center'} ↗</a></Show><label class="portal-language"><span class="sr-only">{t().language}</span><select value={locale()} disabled={languageBusy()} onChange={e=>{const next=e.currentTarget.value as PortalLocale;e.currentTarget.value=locale();void setLanguage(next);}}><option value="de" selected={locale()==='de'}>Deutsch</option><option value="en" selected={locale()==='en'}>English</option><option value="pl" selected={locale()==='pl'}>Polski</option><option value="lt" selected={locale()==='lt'}>Lietuvių</option><option value="ru" selected={locale()==='ru'}>Русский</option><option value="uk" selected={locale()==='uk'}>Українська</option></select></label><Show when={session.data?.user&&hostingAuth.passwordAccounts}><a data-astro-reload target="_top" class="portal-signout" href={'/account/password/?lang='+locale()}>{locale()==='pl'?'Zmień hasło':locale()==='lt'?'Keisti slaptažodį':locale()==='uk'?'Змінити пароль':locale()==='ru'?'Изменить пароль':locale()==='en'?'Change password':'Passwort ändern'} ↗</a></Show><Show when={session.data?.user}><a data-astro-reload target="_top" href={hostingAuth.signOut(portalReturnTo(locale()))} class="portal-signout">{t().signOut} ↗</a></Show></div>
    </div></Show>
    <Show when={session.isError && session.data && !guardedError(session.error)}><p class="portal-alert portal-stale" role="status">{w().stale} <button type="button" class="portal-link-button" onClick={()=>void session.refetch()}>{t().retry}</button></p></Show>
    <div aria-live="polite" aria-atomic="true"><Show when={notice()}><p class="portal-alert portal-alert-success" role="status">✓ {notice()}</p></Show></div>
    <Show when={error()}><p class="portal-alert portal-alert-error" role="alert">{error()}</p></Show>
    <Switch>
      <Match when={!ready() || session.isPending}><div class="portal-empty" role="status"><span class="portal-loader" />{t().loading}</div></Match>
      <Match when={(session.isError && (!session.data || guardedError(session.error))) || guardedError(dashboard.error)}><div class="portal-empty" role="alert"><p>{errorMessage(session.error||dashboard.error,t())}</p><button type="button" class="button button-dark" disabled={session.isFetching} onClick={()=>void session.refetch()}>{t().retry}</button></div></Match>
      <Match when={!session.data?.user}><div class="portal-welcome-grid"><div class="portal-welcome"><span class="portal-kicker">{t().portal}</span><h2>{t().loginTitle}</h2><p>{hostingAuth.native?nativeSignInCopy[locale()].text:t().loginText}</p><a data-account-access={hostingAuth.passwordAccounts?'login':undefined} data-astro-reload={hostingAuth.native?true:undefined} target={hostingAuth.native?'_top':undefined} class="button button-dark" href={signIn()}>{hostingAuth.native?nativeSignInCopy[locale()].button:t().signIn}<span aria-hidden="true">↗</span></a><p class="portal-small">{hostingAuth.native?nativeSignInCopy[locale()].note:t().loginNote}</p></div><div class="portal-welcome-side"><span class="portal-welcome-symbol" aria-hidden="true">✳</span><h3>{t().noAccount}</h3><p>{t().requestHelp}</p><a class="text-link" href="#portal-public-inquiry">{t().publicInquiry} →</a><Show when={hostingAuth.passwordAccounts}><p class="portal-small"><a data-account-access="invite" href={"/register/?lang="+locale()}>{locale()==='pl'?'Masz zaproszenie? Aktywuj konto':locale()==='lt'?'Turite kvietimą? Aktyvinkite paskyrą':locale()==='uk'?'Вже маєте запрошення? Активувати акаунт':locale()==='ru'?'Есть приглашение? Активировать аккаунт':locale()==='en'?'Have an invitation? Activate account':'Einladung erhalten? Konto aktivieren'}</a></p></Show></div></div></Match>
      <Match when={role()==='suspended'}><div class="portal-empty portal-wait"><span class="portal-round-symbol" aria-hidden="true">Ⅱ</span><h2>{t().suspendedTitle}</h2><p>{t().suspendedText}</p><a class="text-link" href="mailto:kontakt@knaba.de">kontakt@knaba.de ↗</a></div></Match>
      <Match when={session.data?.user && !session.data?.profile && role()!=='owner'}><Registration session={session.data!} locale={locale} t={t} busy={busy} submit={body=>mutate('/api/portal/register','POST',body,t().registered)} /></Match>
      <Match when={role()==='pending'}><div class="portal-empty portal-wait"><span class="portal-round-symbol" aria-hidden="true">◷</span><p class="portal-kicker">{t().pending}</p><h2>{t().pendingTitle}</h2><p>{t().pendingText}</p><p>{t().pendingHelp}</p><button type="button" class="button button-dark" disabled={session.isFetching} onClick={()=>void session.refetch()}>{session.isFetching?t().loading:t().refresh}</button></div></Match>
      <Match when={authorized() ? session.data!.user!.id+':'+role() : false} keyed>
        <div class="portal-shell" data-knaba-role={role()}>
          <aside class="portal-sidebar"><div class="portal-person"><span class="portal-avatar" aria-hidden="true">{(session.data?.profile?.name ?? session.data?.user?.name ?? 'K').slice(0,1).toUpperCase()}</span><div><p class="portal-small">{t().profileCaption}</p><strong>{session.data?.profile?.name ?? session.data?.user?.name}</strong><span class="portal-role-label">{t()[role()]}</span></div></div>
            <nav aria-label={t().portal}><For each={(['overview','requests',...(canRequest()?['newRequest']:[]),'conversations',...(role()==='owner'?['people','activity']:[])] as Tab[])}>{item=><a data-astro-reload href={tabHref(item)} classList={{'portal-tab':true,'is-active':currentTab()===item}} aria-current={currentTab()===item?'page':undefined} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();chooseTab(item);}}}><span aria-hidden="true">{{overview:'◈',requests:'▤',newRequest:'＋',conversations:'☰',people:'◎',activity:'↻'}[item]}</span>{tabLabel(item)}<Show when={item==='people' && pendingProfiles()}><span class="portal-count">{pendingProfiles()}</span></Show></a>}</For></nav><p class="portal-sidebar-note">{t().security}</p>
          </aside>
          <div class="portal-content">
            <div class="portal-content-heading"><div><p class="portal-kicker">{t()[role()]}</p><h2 ref={viewHeading} tabIndex={-1} class="portal-view-title">{currentTab()==='overview'?t().welcome:currentTab()==='requests'?heading():tabLabel(currentTab())}</h2></div><button type="button" class="portal-refresh" aria-label={t().refresh} disabled={dashboard.isFetching||busy()} onClick={()=>void refresh()}>↻ <span>{t().refresh}</span></button></div>
            <Show when={dashboard.isFetching && !dashboard.isPending}><p class="portal-small" role="status">{t().loading}</p></Show>
            <Show when={dashboard.isError}><div class="portal-alert portal-alert-error" role="alert"><p>{errorMessage(dashboard.error,t())}</p><button type="button" class="button button-outline" onClick={()=>void refresh()} disabled={dashboard.isFetching}>{t().retry}</button></div></Show>
            <Show when={dashboard.isPending}><div class="portal-empty" role="status">{t().loading}</div></Show>
            <Show when={dashboard.data && dashboardMatchesSession() && !guardedError(dashboard.error)}>
              <Show when={dashboard.data?.limited}><p class="portal-alert">{t().limited}</p></Show>
              <div>
                <div class="portal-panel" hidden={currentTab()!=='overview'}>
                  <div class="portal-metrics"><div class="portal-metric"><span>{!dashboard.data?.totals?c().loaded:role()==='bauleiter'?t().yourSites:role()==='worker'?t().assignedJobs:t().total}</span><strong>{dashboard.data?.totals?.requests ?? requests().length}</strong><button type="button" class="portal-link-button" onClick={()=>showRequests()}>{c().allRequests} →</button></div><div class="portal-metric portal-metric-lilac"><span>{t().open} · {c().loaded}</span><strong>{summary().active}</strong><button type="button" class="portal-link-button" onClick={()=>showRequests('in_progress')}>{t().in_progress} →</button></div><div class="portal-metric portal-metric-coral"><span>{t().completedCount} · {c().loaded}</span><strong>{summary().completed}</strong><button type="button" class="portal-link-button" onClick={()=>showRequests('completed')}>{t().completed} →</button></div></div>
                  <p class="portal-small">{c().loadedNote} {c().loaded}: {requests().length}<Show when={dashboard.data?.totals}> {c().of} {dashboard.data?.totals?.requests}</Show>.</p>
                  <div class="portal-next"><span class="portal-kicker">{t().nextStep}</span><h3>{canRequest()?t().createRequestTitle:heading()}</h3><p>{roleGuide()}</p><div class="portal-form-actions"><button type="button" class="button button-dark" onClick={()=>chooseTab(canRequest()?'newRequest':'requests')}>{canRequest()?t().newRequest:t().requests} →</button><Show when={role()==='owner'}><button type="button" class="button button-outline" onClick={()=>{setPeopleStatus('pending');chooseTab('people');}}>{t().waiting}: {pendingProfiles()} · {c().loadedProfiles} →</button></Show><Show when={isManager()}><button type="button" class="portal-link-button" onClick={()=>showRequests('new')}>{t().new}: {requests().filter(item=>item.status==='new').length} →</button></Show></div></div>
                  <section aria-label={c().agenda}><div class="portal-content-heading"><h3>{c().agenda}</h3><button type="button" class="portal-link-button" onClick={()=>showRequests('scheduled')}>{t().scheduled} →</button></div><Show when={summary().agenda.length} fallback={<p class="portal-empty">{c().agendaEmpty}</p>}><div class="portal-request-list"><For each={summary().agenda}>{request=><article class="portal-next"><div class="portal-request-heading"><div><span class="portal-code">#{request.id.slice(-8).toUpperCase()}</span><h3>{displayService(request.service,t())}</h3></div><Status status={request.status} t={t}/></div><p class="portal-small"><time datetime={request.scheduledAt!}>{dateLabel(request.scheduledAt,locale())}</time> · {request.address || request.postcode}</p><button type="button" class="portal-link-button" onClick={()=>showRequests('all',request.id)}>{c().openRequest} →</button></article>}</For></div></Show></section>
                  <p class="portal-small">{t().notificationNote}</p>
                </div>
                <Show when={canRequest()}><div class="portal-panel" hidden={currentTab()!=='newRequest'}><RequestForm locale={locale} t={t} busy={busy} submit={async body=>{let status:number|undefined;const result=await mutate('/api/portal/requests','POST',body,t().received,problem=>{if(problem instanceof PortalError)status=problem.status;});if(result)chooseTab('requests',true);return {ok:result,status};}} /></div></Show>
                <div class="portal-panel" hidden={currentTab()!=='requests'}><div class="portal-list-toolbar"><label class="portal-search"><span class="sr-only">{w().search}</span><input type="search" name="request-search" value={search()} maxLength={160} placeholder={w().searchHint} onInput={e=>updateSearch(e.currentTarget.value)}/></label><label><span class="sr-only">{t().filterLabel}</span><select value={filter()} onChange={e=>updateFilter(e.currentTarget.value)}><option value="all">{t().all}</option><For each={requestStatuses}>{status=><option value={status}>{t()[status]}</option>}</For></select></label><Show when={canRequest()}><button type="button" class="button button-dark" onClick={()=>chooseTab('newRequest')}>＋ {t().newRequest}</button></Show></div><Show when={!filteredRequests().length}><div class="portal-empty"><span class="portal-round-symbol" aria-hidden="true">▤</span><p>{requests().length?w().noMatches:role()==='bauleiter'?t().emptySites:role()==='worker'?t().emptyJobs:isManager()?t().emptyAdmin:t().emptyRequests}</p><Show when={filter()!=='all'||search().trim()}><button type="button" class="portal-link-button" onClick={()=>{updateFilter('all');updateSearch('');}}>{t().clearFilter}</button></Show></div></Show><div class="portal-request-list"><For each={requests()}>{request=><div hidden={!matchesRequest(request)}><RequestCard request={request} profiles={profiles()} role={role()} t={t} locale={locale} busy={busy} message={()=>messageAbout(request)} patch={(body)=>mutate(`/api/portal/requests/${encodeURIComponent(request.id)}`,'PATCH',body,t().requestUpdated)} /></div>}</For></div><CollectionFooter collection="requests" staff={isManager()&&role()!=='owner'}/></div>
                <Show when={role()==='owner'}><div class="portal-panel" hidden={currentTab()!=='people'}><p>{t().ownerOnly}</p><div class="portal-list-toolbar"><label class="portal-search"><span class="sr-only">{c().peopleSearch}</span><input name="people-search" type="search" maxLength={160} value={peopleSearch()} placeholder={c().peopleSearch} onInput={e=>setPeopleSearch(e.currentTarget.value)}/></label><label><span class="sr-only">{t().status}</span><select name="people-status" value={peopleStatus()} onChange={e=>setPeopleStatus(e.currentTarget.value)}><option value="all">{t().all}</option><For each={['pending','approved','suspended'] as const}>{status=><option value={status}>{t()[status]}</option>}</For></select></label></div><Show when={!visibleProfileIds().size}><div class="portal-empty">{profiles().length?c().noPeople:t().noProfiles}</div></Show><div class="portal-profile-list"><For each={profiles()}>{profile=><div hidden={!visibleProfileIds().has(profile.id)}><ProfileCard profile={profile} t={t} locale={locale} busy={busy} submit={body=>mutate('/api/portal/roles','POST',body,t().roleChanged)} /></div>}</For></div><CollectionFooter collection="profiles"/></div></Show>
                <Show when={role()==='owner'}><div class="portal-panel" hidden={currentTab()!=='activity'}><Show when={dashboard.data?.audit.length} fallback={<div class="portal-empty">{t().noAudit}</div>}><div class="portal-audit"><For each={dashboard.data?.audit}>{event=><article><span class="portal-audit-dot" aria-hidden="true"/><div><strong>{event.action.startsWith('role.') ? `${t().audit_role_updated}${event.action.startsWith('role.approved.') ? ` · ${t()[event.action.split('.')[2] as ApprovedRole]}` : ` · ${t().suspended}`}` : t()[`audit_${event.action.replace(/\./g,'_')}` as keyof PortalText] ?? t().requestUpdated}</strong><p class="portal-small">{t().auditEntity}: <span class="portal-code">{event.entityId}</span></p><p class="portal-small">{t().auditActor}: {profiles().find(p=>p.id===event.actorId)?.name ?? (event.actorId===session.data?.user?.id ? t().owner : event.actorId)}</p></div><time datetime={event.createdAt}>{dateLabel(event.createdAt,locale())}</time></article>}</For></div></Show></div></Show>
                <Show when={messagesVisited()}><div class="portal-panel" hidden={currentTab()!=='conversations'}><Suspense fallback={<p role="status">{t().loading}</p>}><PortalConversations session={session.data!} locale={locale()} active={props.active!==false&&currentTab()==='conversations'} profiles={profiles()} requests={requests()}/></Suspense></div></Show>
              </div>
            </Show>
          </div>
        </div>
      </Match>
    </Switch>
    <Show when={ready() && session.data && !guardedError(session.error) && (!session.data.user || role()==='pending')}><PublicInquiry locale={locale()} pending={role()==='pending'}/></Show>
    <p class="portal-footer-note">{t().portalHint} <a href={portalPublicPath('/datenschutz/',locale())}>{t().privacyLink} ↗</a></p>
  </div>;
}

function PublicInquiry(props: {locale:PortalLocale;pending:boolean}) {
  const [opened,setOpened]=createSignal(false);
  return <details id="portal-public-inquiry" class="portal-inquiry" onToggle={event=>{if(event.currentTarget.open)setOpened(true);}}>
    <summary>{workspaceWords[props.locale].newInquiry}</summary>
    <Show when={props.pending}><p>{workspaceWords[props.locale].pendingInquiry}</p></Show>
    <Show when={opened()}><Suspense fallback={<p role="status">{portalMessages[props.locale].loading}</p>}><Inquiry locale={props.locale}/></Suspense></Show>
  </details>;
}

function Registration(props: {session:PortalSession;locale:Accessor<PortalLocale>;t:Text;busy:Accessor<boolean>;submit:(body:unknown)=>Promise<boolean>}) {
  const [name,setName]=createSignal(props.session.user?.name ?? '');
  const [role,setRole]=createSignal<'client'|'worker'|'partner'|'bauleiter'>('client');
  const [accepted,setAccepted]=createSignal(false);
  return <form class="portal-form portal-registration" data-knaba-dirty={name()!==(props.session.user?.name??'')||role()!=='client'||accepted()?'true':undefined} onSubmit={event=>{event.preventDefault();void props.submit({name:name().trim(),requestedRole:role(),privacyAccepted:accepted()});}}><span class="portal-kicker">KnaBa · {props.t().profileCaption}</span><h2>{props.t().registerTitle}</h2><p>{props.t().registerText}</p><fieldset disabled={props.busy()}><label>{props.t().name}<input autocomplete="name" required minLength={2} maxLength={80} value={name()} onInput={e=>setName(e.currentTarget.value)}/></label><label>{props.t().email}<input type="email" value={props.session.user?.email} readOnly/></label><label>{props.t().accessFor}<select value={role()} onChange={e=>setRole(e.currentTarget.value as 'client'|'worker'|'partner'|'bauleiter')}><option value="client">{props.t().customer}</option><option value="worker">{props.t().employee}</option><option value="partner">{props.t().partner}</option><option value="bauleiter">{props.t().bauleiter}</option></select></label><label class="portal-checkbox"><input type="checkbox" required checked={accepted()} onChange={e=>setAccepted(e.currentTarget.checked)}/><span>{props.t().privacy} <a href={portalPublicPath('/datenschutz/',props.locale())} data-astro-reload>{props.t().privacyLink} ↗</a></span></label><button type="submit" class="button button-dark">{props.busy()?props.t().saving:props.t().register} →</button></fieldset></form>;
}
function RequestForm(props:{locale:Accessor<PortalLocale>;t:Text;busy:Accessor<boolean>;submit:(body:CleaningRequestInput)=>Promise<RequestOutcome>}) {
  let form!:HTMLFormElement;
  const attempt=createRequestAttempt(createRequestId);
  const [locked,setLocked]=createSignal(false);
  const [keyError,setKeyError]=createSignal('');
  const [dirty,setDirty]=createSignal(false);
  async function submit(event:SubmitEvent) {
    event.preventDefault();if(props.busy())return;
    let body:Readonly<CleaningRequestInput>;
    try {
      const fields=new FormData(form);
      body=attempt.begin({service:'baureinigung',objectType:String(fields.get('objectType')),postcode:String(fields.get('postcode')).trim(),area:String(fields.get('area')).trim(),frequency:String(fields.get('frequency')),address:String(fields.get('address')).trim(),message:String(fields.get('message')).trim(),privacyAccepted:true});
      setKeyError('');setLocked(true);
    } catch {setKeyError(props.t().networkError);return;}
    try {
      const result=await props.submit(body);attempt.finish(result);setLocked(Boolean(attempt.pending));
      if(result.ok){form.reset();setDirty(false);}
    } catch {setLocked(true);setKeyError(props.t().networkError);}
  }
  return <form ref={form} class="portal-form" data-knaba-dirty={dirty()?'true':undefined} onInput={()=>setDirty(true)} onChange={()=>setDirty(true)} onSubmit={submit}><p>{props.t().requestHelp}</p><fieldset disabled={props.busy()||locked()}><div class="portal-form-grid"><label>{props.t().service}<select name="service"><option value="baureinigung">{props.t().baureinigung}</option></select></label><label>{props.t().objectType}<select name="objectType"><For each={objectOptions.filter(option => option.key === "construction" || option.key === "other")}>{option=><option value={option.value}>{props.t()[option.key]}</option>}</For></select></label><label>{props.t().postcode}<input name="postcode" required pattern="[0-9]{5}" maxLength={5} inputmode="numeric" autocomplete="postal-code" placeholder="10315"/></label><label>{props.t().area}<input name="area" type="number" min="1" max="1000000" step="1" inputmode="numeric" placeholder="250"/></label><label>{props.t().frequency}<select name="frequency"><For each={frequencyOptions}>{option=><option value={option.value}>{props.t()[option.key]}</option>}</For></select></label><label>{props.t().address}<input name="address" maxLength={200} autocomplete="street-address"/></label></div><label>{props.t().message}<textarea name="message" rows={5} maxLength={500} required minLength={10} placeholder={props.t().requestPlaceholder}/></label><label class="portal-checkbox"><input type="checkbox" required/><span>{props.t().privacy} <a href={portalPublicPath('/datenschutz/',props.locale())} data-astro-reload>{props.t().privacyLink} ↗</a></span></label><Show when={keyError()}><p class="portal-alert portal-alert-error" role="alert">{keyError()}</p></Show></fieldset><Show when={locked()&&!props.busy()}><p class="portal-alert" role="status">{cabinetWords[props.locale()].retryFrozen}</p></Show><button type="submit" class="button button-dark" disabled={props.busy()}>{props.busy()?props.t().saving:locked()?props.t().retry:props.t().sendRequest} →</button></form>;
}

function RequestCard(props:{request:CleaningRequest;profiles:PortalProfile[];role:PortalRole;t:Text;locale:Accessor<PortalLocale>;busy:Accessor<boolean>;patch:(body:RequestPatch)=>Promise<boolean>;message:()=>void}) {
  const [editing,setEditing]=createSignal(false);
  const [editVersion,setEditVersion]=createSignal(props.request.version);
  const [confirmCancel,setConfirmCancel]=createSignal(false);
  const [status,setStatus]=createSignal<RequestStatus>(props.request.status);
  const [worker,setWorker]=createSignal(props.request.assignedWorkerId??'');
  const [bauleiter,setBauleiter]=createSignal(props.request.assignedBauleiterId??'');
  const [date,setDate]=createSignal(localDateValue(props.request.scheduledAt));
  const [checklist,setChecklist]=createSignal([...props.request.checklist]);
  const [note,setNote]=createSignal(props.request.workerNote??'');
  const [reply,setReply]=createSignal(props.request.adminReply??'');
  const [feedback,setFeedback]=createSignal(props.request.customerFeedback??'');
  const [localError,setLocalError]=createSignal('');
  const administrator=()=>props.role==='owner'||props.role==='admin';
  const manager=()=>administrator()||props.role==='bauleiter';
  const workerEditable=()=>props.role==='worker'&&['scheduled','in_progress'].includes(props.request.status);
  const clientEditable=()=>(props.role==='client'||props.role==='partner')&&props.request.status==='completed';
  const terminal=()=>['completed','cancelled'].includes(props.request.status);
  const transitions:Record<RequestStatus,RequestStatus[]>={new:['reviewing','cancelled'],reviewing:['scheduled','cancelled'],scheduled:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:[],cancelled:[]};
  const choices=()=>[props.request.status,...(props.role==='worker'?props.request.status==='scheduled'?['in_progress'] as RequestStatus[]:props.request.status==='in_progress'?['completed'] as RequestStatus[]:[]:transitions[props.request.status])];
  function openEditor(){setEditVersion(props.request.version);setStatus(props.request.status);setWorker(props.request.assignedWorkerId??'');setBauleiter(props.request.assignedBauleiterId??'');setDate(localDateValue(props.request.scheduledAt));setChecklist([...props.request.checklist]);setNote(props.request.workerNote??'');setReply(props.request.adminReply??'');setFeedback(props.request.customerFeedback??'');setLocalError('');setEditing(true);}
  async function save(event:SubmitEvent){
    event.preventDefault();setLocalError('');let body:RequestPatch={version:editVersion()};
    if(manager()){
      let scheduled:string|null=null;
      if(date()){const parsed=new Date(date());if(Number.isNaN(parsed.valueOf())){setLocalError(props.t().scheduleInvalid);return;}scheduled=parsed.toISOString();}
      body={...body,adminReply:reply().trim()};
      if(status()!==props.request.status)body.status=status();
      if(!terminal() && (worker()||null)!==props.request.assignedWorkerId)body.assignedWorkerId=worker()||null;
      if(administrator() && !terminal() && (bauleiter()||null)!==(props.request.assignedBauleiterId??null))body.assignedBauleiterId=bauleiter()||null;
      if(!terminal() && date()!==localDateValue(props.request.scheduledAt))body.scheduledAt=scheduled;
    }else if(props.role==='worker'){body={...body,status:status(),checklist:checklist(),workerNote:note().trim()};}
    else{body={...body,customerFeedback:feedback().trim()};}
    if(await props.patch(body))setEditing(false);
  }
  return <article class="portal-request-card" data-knaba-dirty={editing()?'true':undefined}><div class="portal-request-heading"><div><p class="portal-small">{props.t().requestNumber} <span class="portal-code">#{props.request.id.slice(-8).toUpperCase()}</span></p><h3>{displayService(props.request.service,props.t())}</h3></div><Status status={props.request.status} t={props.t}/></div><div class="portal-request-meta"><span>⌂ {displayOption(props.request.objectType,props.t())} · {props.request.postcode}</span><span>◷ {props.request.scheduledAt?dateLabel(props.request.scheduledAt,props.locale()):props.t().noDate}</span></div><div class="portal-request-summary"><Show when={props.request.area}><span>{props.request.area} {props.locale() === 'ru' ? 'м²' : 'm²'}</span></Show><span>{displayOption(props.request.frequency,props.t())}</span><Show when={manager()&&props.request.assignedWorkerId}><span>{props.t().assigned}: {props.profiles.find(p=>p.id===props.request.assignedWorkerId)?.name ?? props.t().unavailableName}</span></Show><Show when={administrator()&&props.request.assignedBauleiterId}><span>{props.t().bauleiterAssignment}: {props.profiles.find(p=>p.id===props.request.assignedBauleiterId)?.name ?? props.t().unavailableName}</span></Show></div><details class="portal-details"><summary>{props.t().details} <span aria-hidden="true">＋</span></summary><dl><Show when={props.request.address}><div><dt>{props.t().address}</dt><dd>{props.request.address}</dd></div></Show><div><dt>{props.t().message}</dt><dd class="portal-preline">{props.request.message||props.t().emptyMessage}</dd></div><Show when={administrator()}><div><dt>{props.t().contact}</dt><dd>{props.request.contactName}<Show when={props.request.email}><br/><a href={`mailto:${props.request.email}`}>{props.request.email}</a></Show><Show when={props.request.phone}><br/><span>{props.request.phone}</span></Show></dd></div></Show><div><dt>{props.t().created}</dt><dd>{dateLabel(props.request.createdAt,props.locale())}</dd></div><Show when={props.role!=='worker'}><div><dt>{props.t().feedback}</dt><dd class="portal-preline">{props.request.customerFeedback||props.t().emptyFeedback}</dd></div><div><dt>{props.t().adminReply}</dt><dd class="portal-preline">{props.request.adminReply||props.t().emptyReply}</dd></div></Show><Show when={manager()&&props.request.workerNote}><div><dt>{props.t().workerNote}</dt><dd class="portal-preline">{props.request.workerNote}</dd></div></Show></dl></details>
    <Show when={props.role==='worker'||manager()}><div class="portal-check-progress"><span>{props.t().progress}: {props.request.checklist.length} {props.t().countOf} 4</span><progress value={props.request.checklist.length} max={4} aria-label={props.t().progress}/></div></Show>
    <Show when={!editing()}><div class="portal-card-actions"><button type="button" class="portal-link-button" onClick={props.message}>{cabinetWords[props.locale()].message} →</button><Show when={manager()||workerEditable()||clientEditable()}><button type="button" class="button button-outline" onClick={openEditor} disabled={props.busy()}>{manager()?(terminal()?props.t().adminReply:props.t().management):props.role==='worker'?props.t().workerUpdate:props.t().feedback} ↗</button></Show><Show when={(props.role==='client'||props.role==='partner')&&['new','reviewing'].includes(props.request.status)}><button type="button" class="portal-link-button" disabled={props.busy()} onClick={()=>setConfirmCancel(!confirmCancel())}>{props.t().cancel}</button></Show></div></Show>
    <Show when={confirmCancel()}><div class="portal-alert"><p>{props.t().cancelRequestNote}</p><div class="portal-form-actions"><button type="button" class="button button-outline" disabled={props.busy()} onClick={async()=>{if(await props.patch({version:props.request.version,status:'cancelled'}))setConfirmCancel(false);}}>{props.t().confirmCancel}</button><button type="button" class="portal-link-button" onClick={()=>setConfirmCancel(false)}>{props.t().close}</button></div></div></Show>
    <Show when={editing()&&editVersion()!==props.request.version}><p class="portal-alert" role="alert">{props.t().conflictError} <button type="button" class="portal-link-button" onClick={()=>{if(window.confirm(props.t().conflictError))openEditor();}}>{props.t().refresh}</button></p></Show>
    <Show when={editing()}><form class="portal-form portal-edit-form" onSubmit={save}><fieldset disabled={props.busy()}><Show when={manager()||props.role==='worker'}><label>{props.t().status}<select value={status()} onChange={e=>setStatus(e.currentTarget.value as RequestStatus)}><For each={choices()}>{value=><option value={value}>{props.t()[value]}</option>}</For></select></label></Show><Show when={manager()}><div class="portal-form-grid"><label>{props.t().workerAssignment}<select value={worker()} onChange={e=>setWorker(e.currentTarget.value)} disabled={terminal()}><option value="">{props.t().unassigned}</option><Show when={worker()&&!props.profiles.some(p=>p.id===worker()&&p.role==='worker'&&p.status==='approved')}><option value={worker()} disabled>{props.t().unavailableName}</option></Show><For each={props.profiles.filter(p=>p.role==='worker'&&p.status==='approved')}>{profile=><option value={profile.id}>{profile.name}</option>}</For></select></label><Show when={administrator()}><label>{props.t().bauleiterAssignment}<select value={bauleiter()} onChange={e=>setBauleiter(e.currentTarget.value)} disabled={terminal()}><option value="">{props.t().unassigned}</option><Show when={bauleiter()&&!props.profiles.some(p=>p.id===bauleiter()&&p.role==='bauleiter'&&p.status==='approved')}><option value={bauleiter()} disabled>{props.t().unavailableName}</option></Show><For each={props.profiles.filter(p=>p.role==='bauleiter'&&p.status==='approved')}>{profile=><option value={profile.id}>{profile.name}</option>}</For></select><Show when={!props.profiles.some(p=>p.role==='bauleiter'&&p.status==='approved')}><span class="portal-small">{props.t().noBauleiter}</span></Show></label></Show><label>{props.t().scheduledAt}<input type="datetime-local" value={date()} disabled={terminal()} onInput={e=>setDate(e.currentTarget.value)}/></label></div><p class="portal-small">{props.t().dateHelp}</p><label>{props.t().adminReply}<textarea value={reply()} maxLength={1000} rows={3} onInput={e=>setReply(e.currentTarget.value)}/></label></Show><Show when={props.role==='worker'}><div class="portal-checklist"><strong>{props.t().checklist}</strong><For each={checklistItems}>{item=><label class="portal-checkbox"><input type="checkbox" checked={checklist().includes(item)} onChange={e=>setChecklist(current=>e.currentTarget.checked?[...current,item]:current.filter(value=>value!==item))}/><span>{props.t()[item]}</span></label>}</For></div><p class="portal-small">{props.t().completeHint}</p><label>{props.t().workerNote}<textarea value={note()} maxLength={1000} rows={3} onInput={e=>setNote(e.currentTarget.value)}/></label><p class="portal-small">{props.t().workerNoteHint}</p></Show><Show when={clientEditable()}><p>{props.t().feedbackHelp}</p><label>{props.t().feedback}<textarea value={feedback()} maxLength={1000} minLength={2} required rows={3} onInput={e=>setFeedback(e.currentTarget.value)}/></label></Show><Show when={localError()}><p class="portal-alert portal-alert-error" role="alert">{localError()}</p></Show><div class="portal-form-actions"><button type="submit" class="button button-dark" disabled={editVersion()!==props.request.version||(props.role==='worker'&&status()==='completed'&&checklist().length!==4)}>{props.busy()?props.t().saving:props.t().save}</button><button type="button" class="portal-link-button" onClick={()=>setEditing(false)}>{props.t().cancel}</button></div></fieldset></form></Show>
  </article>;
}
function ProfileCard(props:{profile:PortalProfile;t:Text;locale:Accessor<PortalLocale>;busy:Accessor<boolean>;submit:(body:RoleInput)=>Promise<boolean>}) {
  const [role,setRole]=createSignal<ApprovedRole>(props.profile.role??props.profile.requestedRole);
  const [dirty,setDirty]=createSignal(false);
  const [editVersion,setEditVersion]=createSignal(props.profile.version);
  const [confirmPause,setConfirmPause]=createSignal(false);
  const [pauseVersion,setPauseVersion]=createSignal(props.profile.version);
  function resetRole(){setRole(props.profile.role??props.profile.requestedRole);setEditVersion(props.profile.version);setDirty(false);}
  createEffect(()=>{if(!dirty())resetRole();});
  async function save(event:SubmitEvent){
    event.preventDefault();
    if(props.busy()||editVersion()!==props.profile.version)return;
    if(await props.submit({userId:props.profile.id,role:role(),status:'approved',version:editVersion()}))setDirty(false);
  }
  return <article class="portal-profile-card" data-knaba-dirty={dirty()?'true':undefined}>
    <div class="portal-profile-main"><span class="portal-avatar" aria-hidden="true">{props.profile.name.slice(0,1).toUpperCase()}</span><div><h3>{props.profile.name}</h3><p>{props.profile.email}</p><p class="portal-small">{props.t().requestedRole}: {props.t()[props.profile.requestedRole]} · {dateLabel(props.profile.createdAt,props.locale())}</p></div><Status status={props.profile.status} t={props.t}/></div>
    <form class="portal-profile-controls" onSubmit={save}><label><span>{props.t().role}</span><select value={role()} disabled={props.busy()} onChange={e=>{setDirty(true);setRole(e.currentTarget.value as ApprovedRole);}}><For each={approvedRoles}>{item=><option value={item}>{props.t()[item]}</option>}</For></select></label><button class="button button-dark" type="submit" disabled={props.busy()||editVersion()!==props.profile.version}>{props.profile.status==='suspended'?props.t().reactivate:props.profile.status==='pending'?props.t().grant:props.t().save}</button><Show when={props.profile.status==='approved'}><button class="portal-link-button" type="button" disabled={props.busy()} onClick={()=>{setPauseVersion(props.profile.version);setConfirmPause(!confirmPause());}}>{props.t().suspend}</button></Show></form>
    <Show when={dirty()&&editVersion()!==props.profile.version}><p class="portal-alert" role="alert">{props.t().conflictError} <button type="button" class="portal-link-button" onClick={()=>{if(window.confirm(props.t().conflictError))resetRole();}}>{props.t().refresh}</button></p></Show>
    <Show when={confirmPause()}><div class="portal-alert"><p>{props.t().confirmSuspend}</p><div class="portal-form-actions"><button type="button" class="button button-outline" disabled={props.busy()} onClick={async()=>{if(await props.submit({userId:props.profile.id,role:props.profile.role,status:'suspended',version:pauseVersion()}))setConfirmPause(false);}}>{props.t().suspend}</button><button type="button" class="portal-link-button" onClick={()=>setConfirmPause(false)}>{props.t().cancel}</button></div></div></Show>
  </article>;
}
export default function Portal(props: {locale?: PortalLocale; embedded?: boolean; testing?: boolean; active?: boolean} = {}) {
  const cache = new QueryClient({defaultOptions:{queries:{gcTime:60_000}}});
  onCleanup(()=>cache.clear());
  return <QueryClientProvider client={cache}><PortalContent locale={props.locale} embedded={props.embedded} testing={props.testing} active={props.active}/></QueryClientProvider>;
}
