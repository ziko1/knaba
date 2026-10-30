import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Suspense, Switch } from 'solid-js';
import type { PortalSession } from '../lib/portal-contract';
import { portalReturnTo, resolvePortalLocale, ensurePortalLocale, portalMessages, type PortalLocale } from '../lib/portal-i18n';
import { allowedAdminModules, allowedAdminSections, resolveAdminSection, type AdminModuleId, type AdminSection } from '../lib/admin-access';
import AdminModuleOutlet from './AdminModuleOutlet';
import DeveloperWorkspaceBar from './DeveloperWorkspaceBar';
import { workspaceWords } from '../lib/workspace-i18n';
import {adminWords} from '../lib/portal-locale-data';
import { listenWorkspaceNavigation, workspaceHref } from '../lib/workspace-navigation';
import { hostingAuthentication } from '../lib/hosting-auth';
import '../styles/admin-center.css';
const hostingAuth = hostingAuthentication();

type Phase = 'checking' | 'ready' | 'error';


const overviewIcon = '◈';

export default function AdminControlCenter() {
  const [phase,setPhase] = createSignal<Phase>('checking');
  const [session,setSession] = createSignal<PortalSession|null>(null);
  const [language,setLanguage] = createSignal<PortalLocale>('de');
  const [languageBusy,setLanguageBusy] = createSignal(false);
  const [languageError,setLanguageError] = createSignal('');
  let languageAttempt=0,languageDisposed=false;
  const [requested,setRequested] = createSignal<string>('overview');
  const [testing,setTesting] = createSignal(false);
  const [stale,setStale] = createSignal(false);
  const [visited,setVisited] = createSignal<AdminModuleId[]>([]);
  let region: HTMLDivElement | undefined;
  const [navigationOpen,setNavigationOpen] = createSignal(false);
  const t = createMemo(() => adminWords[language()]);
  const role = () => session()?.user ? session()!.role : 'anonymous';
  const allowed = createMemo(() => allowedAdminSections(role()));
  const modules = createMemo(() => allowedAdminModules(role()));
  const selected = createMemo(() => resolveAdminSection(role(),requested()));
  const names = createMemo<Record<AdminSection,string>>(() => ({
    overview:t().overview,operations:t().operations,crm:t().crm,messages:t().messages,studio:t().studio
  }));
  const descriptions = createMemo<Record<AdminSection,string>>(() => ({
    overview:'',operations:t().operationsText,crm:t().crmText,messages:t().messagesText,studio:t().studioText
  }));
  let pending: AbortController | null = null;
  let verifiedAt = 0;
  let sectionHeading: HTMLHeadingElement | undefined;
  let navigationToggle: HTMLButtonElement | undefined;
  let navigationPanel: HTMLDivElement | undefined;
  const [studioDirty,setStudioDirty] = createSignal(false);
  const publicHome = () => language()==='de' ? '/' : `/${language()}/`;

  function updateUrl(view: string, locale: PortalLocale, push = false) {
    const url = new URL(location.href);
    url.searchParams.set('view',view);
    url.searchParams.set('lang',locale);
    if (push) history.pushState(history.state,'',url);
    else history.replaceState(history.state,'',url);
  }
  function openSection(view: AdminSection) {
    if (!allowed().includes(view)) return;
    const changed=view!==selected();
    setRequested(view);setNavigationOpen(false);
    if(changed)updateUrl(view,language(),true);
    queueMicrotask(() => { if (sectionHeading?.isConnected) sectionHeading.focus(); });
  }
  async function loadLanguage(next:PortalLocale){
    const attempt=++languageAttempt;setLanguageBusy(true);
    try{
      await ensurePortalLocale(next);
      if(languageDisposed||attempt!==languageAttempt)return false;
      setLanguage(next);setLanguageError('');return true;
    }catch{
      if(!languageDisposed&&attempt===languageAttempt)setLanguageError(portalMessages[language()].networkError);
      return false;
    }finally{if(!languageDisposed&&attempt===languageAttempt)setLanguageBusy(false);}
  }
  onCleanup(()=>{languageDisposed=true;languageAttempt++;});
  async function changeLanguage(next: PortalLocale) {
    if(await loadLanguage(next))updateUrl(selected(),next);
  }
  createEffect(() => {
    const view=selected();
    if (view!=='overview' && allowed().includes(view)) setVisited(items=>items.includes(view as AdminModuleId)?items:[...items,view as AdminModuleId]);
  });
  const sectionHref = (view:AdminSection) => workspaceHref(typeof location==='undefined'?'/admin/':location.href,{view,lang:language()});
  function sectionClick(event:MouseEvent,view:AdminSection) {
    if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();openSection(view);}
  }
  async function verifySession() {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    // Keep authorized editor state mounted during routine, successful revalidation.
    if (!session()) setPhase('checking');
    const timer = setTimeout(() => controller.abort(),12000);
    try {
      const response = await fetch('/api/portal/session', {
        method:'GET',credentials:'same-origin',cache:'no-store',
        headers:{Accept:'application/json'},signal:controller.signal
      });
      if (!response.ok) {
        if ([401,403].includes(response.status)) { setSession(null);setVisited([]);setStudioDirty(false);setStale(false);setPhase('ready');return; }
        throw new Error('session');
      }
      const data = await response.json() as PortalSession;
      if (pending !== controller) return;
      if (!data.user || data.user.id!==session()?.user?.id || data.role!==session()?.role) {setVisited([]);setStudioDirty(false);}
      setSession(data);setStale(false);
      verifiedAt = Date.now();
      setPhase('ready');
    } catch {
      if (pending === controller) {
        if(session()?.user){setStale(true);setPhase('ready');}
        else setPhase('error');
      }
    } finally {
      clearTimeout(timer);
      if (pending === controller) pending = null;
    }
  }
  onMount(() => {
    const readUrl=()=>{
      const params=new URLSearchParams(location.search);
      setRequested(params.get('view') || 'overview');
      void loadLanguage(resolvePortalLocale(params.get('lang'),undefined,navigator.language.slice(0,2)));
    };
    const beforeLeave=(event:BeforeUnloadEvent)=>{
      if(studioDirty()||region?.querySelector('[data-knaba-dirty="true"]')){event.preventDefault();Reflect.set(event,'returnValue','');}
    };
    readUrl();
    const stopNavigation=listenWorkspaceNavigation(readUrl,true,()=>studioDirty()||Boolean(region?.querySelector('[data-knaba-dirty="true"]')));
    window.addEventListener('beforeunload',beforeLeave);
    void verifySession();
    const revalidate = () => { if (Date.now()-verifiedAt>15_000) void verifySession(); };
    const onFocus = () => { revalidate(); };
    const onVisibility = () => { if (!document.hidden) revalidate(); };
    const onAuthChanged = () => { void verifySession(); };
    const onStudioDirty = (event:Event) => { setStudioDirty((event as CustomEvent<boolean>).detail===true); };
    const mobileNavigation = window.matchMedia('(max-width:800px)');
    const onNavigationResize = (event:MediaQueryListEvent) => {
      // Preserve visible keyboard focus when a desktop navigation becomes a disclosure.
      if (event.matches && navigationPanel?.contains(document.activeElement)) setNavigationOpen(true);
    };
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    document.addEventListener('knaba:auth-changed',onAuthChanged);
    window.addEventListener('knaba:studio:dirty',onStudioDirty);
    mobileNavigation.addEventListener('change',onNavigationResize);
    onCleanup(() => {
      pending?.abort();
      stopNavigation();
      window.removeEventListener('beforeunload',beforeLeave);
      window.removeEventListener('focus',onFocus);
      document.removeEventListener('visibilitychange',onVisibility);
      document.removeEventListener('knaba:auth-changed',onAuthChanged);
      window.removeEventListener('knaba:studio:dirty',onStudioDirty);
      mobileNavigation.removeEventListener('change',onNavigationResize);
    });
  });
  const signIn = () => hostingAuth.signIn('/admin/?view=' + selected() + '&lang=' + language())
    + (hostingAuth.passwordAccounts ? '&lang=' + language() : '');

  return <div ref={region} class="kncc" lang={language()}>
    <DeveloperWorkspaceBar locale={language()} onEnabled={setTesting}/>
    <Show when={languageError()}><p class="portal-alert portal-alert-error" role="alert">{languageError()}</p></Show>
    <Show when={stale()}><p class="portal-alert" role="status">{workspaceWords[language()].stale} <button type="button" class="portal-link-button" onClick={()=>void verifySession()}>{t().retry}</button></p></Show>
    <Switch>
      <Match when={phase()==='checking'}>
        <div class="kncc-gate" role="status"><span class="kncc-glyph" aria-hidden="true">✳</span><p>{t().loading}</p></div>
      </Match>
      <Match when={phase()==='error'}>
        <div class="kncc-gate" role="alert"><span class="kncc-glyph" aria-hidden="true">!</span><h2>{t().unavailable}</h2><button type="button" class="kncc-action" onClick={() => void verifySession()}>{t().retry}</button></div>
      </Match>
      <Match when={allowed().length===0}>
        <div class="kncc-gate"><span class="kncc-glyph" aria-hidden="true">✳</span><h2>{t().session}</h2><p>{t().denied}</p>
          <div class="kncc-gate-links">
            <Show when={!session()?.user}><a data-account-access={hostingAuth.passwordAccounts?'login':undefined} data-astro-reload={hostingAuth.native?true:undefined} target={hostingAuth.native?'_top':undefined} class="kncc-action" href={signIn()}>{t().signIn}</a></Show>
            <a class="kncc-action kncc-action-secondary" href={portalReturnTo(language())}>{t().portal}</a>
            <a class="kncc-action kncc-action-secondary" href={publicHome()}>{t().publicSite}</a>
          </div>
        </div>
      </Match>
      <Match when={allowed().length>0 ? session()!.user!.id+':'+role() : false} keyed>
        <div class="kncc-layout">
          <aside class="kncc-sidebar" onKeyDown={event => {
            if (event.key==='Escape' && navigationOpen() && navigationToggle?.offsetParent) {
              event.preventDefault(); setNavigationOpen(false); navigationToggle?.focus();
            }
          }}>
            <div class="kncc-brand"><span class="kncc-brand-symbol" aria-hidden="true">✳</span><div><strong>KNABA</strong><small>CONTROL CENTER</small></div></div>
            <button ref={navigationToggle} type="button" class="kncc-nav-toggle" aria-expanded={navigationOpen()}
              aria-controls="kncc-navigation-panel" onClick={() => setNavigationOpen(!navigationOpen())}>
              <span><small>{t().nav}</small><strong>{names()[selected()]}</strong></span><span aria-hidden="true">{navigationOpen()?'−':'+'}</span>
            </button>
            <div ref={navigationPanel} id="kncc-navigation-panel" class="kncc-navigation-panel" data-open={navigationOpen()}>
              <p class="kncc-sidebar-caption">{t().session}</p>
              <nav aria-label={t().nav} class="kncc-navigation">
              <a data-astro-reload href={sectionHref('overview')} classList={{'kncc-nav-item':true,'is-current':selected()==='overview'}}
                aria-current={selected()==='overview'?'page':undefined} onClick={event => sectionClick(event,'overview')}>
                <span class="kncc-nav-icon" aria-hidden="true">{overviewIcon}</span><span>{t().overview}</span>
              </a>
              <For each={modules()}>{module=><a data-astro-reload href={sectionHref(module.id)} classList={{'kncc-nav-item':true,'is-current':selected()===module.id}}
                aria-current={selected()===module.id?'page':undefined} onClick={event => sectionClick(event,module.id)}>
                <span class="kncc-nav-icon" aria-hidden="true">{module.icon}</span><span>{names()[module.id]}</span>
              </a>}</For>
              </nav>
              <p class="kncc-security">{t().hint}</p>
            </div>
            <div class="kncc-shortcuts">
              <a class="kncc-site-link" data-astro-reload href={portalReturnTo(language())}>{t().portal}</a>
              <a class="kncc-site-link" data-astro-reload href={publicHome()}>{t().publicSite} ↗</a>
            </div>
          </aside>
          <section class="kncc-content" aria-label={names()[selected()]}>
            <div class="kncc-toolbar">
              <div class="kncc-identity"><span class="kncc-avatar" aria-hidden="true">{(session()?.user?.name || session()?.user?.email || 'K').slice(0,1).toUpperCase()}</span>
                <span><strong>{session()?.user?.name || session()?.user?.email}</strong><small>{role()==='owner'?t().owner:t().admin}</small></span>
              </div>
              <div class="kncc-tools">
                <label class="kncc-language"><span>{t().language}</span>
                  <select value={language()} disabled={languageBusy()} onChange={event=>{const next=event.currentTarget.value as PortalLocale;event.currentTarget.value=language();void changeLanguage(next);}}>
                    <option value="de">DE</option><option value="en">EN</option><option value="pl">PL</option><option value="lt">LT</option><option value="ru">RU</option><option value="uk">UK</option>
                  </select></label>
                <button type="button" class="kncc-tool" onClick={() => void verifySession()}>{t().refresh}</button>
                <a class="kncc-tool" data-astro-reload target="_top" href={hostingAuth.signOut(publicHome())}>{t().signOut}</a>
              </div>
            </div>
            <Show when={selected()==='overview'}>
              <div class="kncc-intro"><span class="kncc-eyebrow">KNABA · CONTROL CENTER</span><h2 ref={sectionHeading} tabIndex={-1}>{t().title}</h2><p>{t().subtitle}</p></div>
              <div class="kncc-cards"><For each={modules()}>{module=>
                <button class="kncc-card" type="button" onClick={()=>openSection(module.id)}>
                  <span class="kncc-card-icon" aria-hidden="true">{module.icon}</span><strong>{names()[module.id]}</strong>
                  <span class="kncc-card-desc">{descriptions()[module.id]}</span><span class="kncc-card-link">{t().choose} →</span>
                </button>
              }</For></div>
            </Show>
            <Show when={selected()!=='overview'}><div class="kncc-module-heading"><h2 ref={sectionHeading} tabIndex={-1}>{names()[selected()]}</h2></div></Show>
            <For each={modules()}>{module=><Show when={visited().includes(module.id)}>
              <div class="kncc-module" hidden={selected()!==module.id}><Suspense fallback={<p role="status">{t().loading}</p>}><AdminModuleOutlet id={module.id} role={role()} locale={language()} active={selected()===module.id} testing={testing()}/></Suspense></div>
            </Show>}</For>
          </section>
        </div>
      </Match>
    </Switch>
  </div>;
}
