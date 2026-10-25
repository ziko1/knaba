import { createMemo, createSignal, For, lazy, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import type { PortalSession } from '../lib/portal-contract';
import { resolvePortalLocale, type PortalLocale } from '../lib/portal-i18n';
import { allowedAdminSections, resolveAdminSection, type AdminSection } from '../lib/admin-access';
import '../styles/admin-center.css';

// Only load the real feature island after it is selected. No second CMS, CRM or API.
const Portal = lazy(() => import('./Portal'));
const CrmConsole = lazy(() => import('./CrmConsole'));
const AssistantInbox = lazy(() => import('./AssistantInbox'));
const SiteStudio = lazy(() => import('./SiteStudio'));

type Phase = 'checking' | 'ready' | 'error';
const translations = {
  de: {
    title:'Ein Unternehmen. Ein Arbeitsplatz.', subtitle:'Website, Aufträge und Kundenkommunikation an einem Ort – mit Ihrem bestehenden KnaBa-Zugang.',
    overview:'Übersicht', operations:'Aufträge & Team', crm:'CRM & Kontakte',
    messages:'Kundenpostfach', studio:'Website Studio', nav:'Verwaltungsbereiche',
    session:'Geschützter Arbeitsbereich', owner:'Inhaber', admin:'Administration',
    hint:'Ihre Rechte werden auf dem Server bei jedem Vorgang erneut geprüft.',
    publicSite:'Website ansehen', signOut:'Abmelden', signIn:'Sicher anmelden',
    loading:'Zugang wird geprüft …', unavailable:'Die Sitzung konnte nicht geprüft werden.',
    retry:'Erneut prüfen', denied:'Dieser Bereich ist nur für freigegebene KnaBa-Verwaltungskonten zugänglich.',
    portal:'Zum persönlichen Portal', welcome:'Ihr Kontrollzentrum', choose:'Bereich öffnen',
    operationsText:'Anfragen, Einsätze, Teamfreigaben und Änderungsverlauf im bestehenden Portal.',
    crmText:'Kontakte, Verkaufsphasen, interne Notizen und echte Anfragen.',
    messagesText:'Gespräche mit Kunden und Übergaben vom KNABA Assistant.',
    studioText:'Seiten, Inhalte und Veröffentlichungen mit Vorschau bearbeiten.',
    language:'Sprache', refresh:'Sitzung prüfen', unsaved:'Im Website-Editor gibt es ungespeicherte Änderungen. Trotzdem wechseln?'
  },
  en: {
    title:'One company. One workspace.', subtitle:'Website, jobs and customer communication in one place, with your existing KnaBa sign-in.',
    overview:'Overview', operations:'Jobs & team', crm:'CRM & contacts', messages:'Customer inbox', studio:'Website Studio', nav:'Administration sections',
    session:'Protected workspace', owner:'Owner', admin:'Administrator', hint:'Every operation is authorised again on the server.',
    publicSite:'View website', signOut:'Sign out', signIn:'Secure sign-in', loading:'Checking access …', unavailable:'Could not verify your session.',
    retry:'Try again', denied:'This workspace requires an approved KnaBa management account.', portal:'Go to personal portal',
    welcome:'Your control centre', choose:'Open section', operationsText:'Requests, jobs, team approvals and audit history in the existing portal.',
    crmText:'Contacts, sales stages, internal notes and real enquiries.', messagesText:'Customer conversations and KNABA Assistant handovers.',
    studioText:'Edit pages, content and publications with live preview.', language:'Language', refresh:'Verify session', unsaved:'There are unsaved website edits. Leave this section anyway?'
  },
  uk: {
    title:'Одна компанія. Один кабінет.', subtitle:'Сайт, замовлення та спілкування з клієнтами в одному місці — з чинним входом KNABA.',
    overview:'Огляд', operations:'Замовлення і команда', crm:'CRM і контакти', messages:'Повідомлення', studio:'Редактор сайту', nav:'Розділи адміністрації',
    session:'Захищений кабінет', owner:'Власник', admin:'Адміністратор', hint:'Кожну дію додатково перевіряє сервер.',
    publicSite:'Відкрити сайт', signOut:'Вийти', signIn:'Безпечний вхід', loading:'Перевірка доступу …', unavailable:'Не вдалося перевірити сеанс.',
    retry:'Спробувати ще', denied:'Потрібен підтверджений адміністративний доступ KNABA.', portal:'До особистого кабінету',
    welcome:'Центр керування', choose:'Відкрити розділ', operationsText:'Заявки, роботи, дозволи працівників та історія змін у чинному порталі.',
    crmText:'Контакти, етапи продажу, внутрішні нотатки та справжні заявки.',
    messagesText:'Розмови з клієнтами та передача звернень від KNABA Assistant.',
    studioText:'Редагування сторінок, вмісту й публікацій із переглядом.', language:'Мова', refresh:'Перевірити сеанс', unsaved:'У редакторі є незбережені зміни. Усе одно перейти до іншого розділу?'
  },
  ru: {
    title:'Одна компания. Один кабинет.', subtitle:'Сайт, заказы и общение с клиентами в одном месте — с существующим входом KNABA.',
    overview:'Обзор', operations:'Заказы и команда', crm:'CRM и контакты', messages:'Сообщения', studio:'Редактор сайта', nav:'Разделы администрации',
    session:'Защищённый кабинет', owner:'Владелец', admin:'Администратор', hint:'Каждое действие повторно проверяется сервером.',
    publicSite:'Открыть сайт', signOut:'Выйти', signIn:'Безопасный вход', loading:'Проверяем доступ …', unavailable:'Не удалось проверить сессию.',
    retry:'Повторить', denied:'Требуется подтверждённый административный доступ KNABA.', portal:'В личный кабинет',
    welcome:'Центр управления', choose:'Открыть раздел', operationsText:'Заявки, работы, права команды и история изменений в существующем портале.',
    crmText:'Контакты, этапы продаж, внутренние заметки и настоящие заявки.',
    messagesText:'Диалоги с клиентами и обращения от KNABA Assistant.',
    studioText:'Редактирование страниц, содержимого и публикаций с предпросмотром.', language:'Язык', refresh:'Проверить сессию', unsaved:'В редакторе есть несохранённые изменения. Всё равно перейти к другому разделу?'
  }
} as const;

const icons: Record<AdminSection,string> = {overview:'◈',operations:'▤',crm:'◎',messages:'✉',studio:'✳'};

export default function AdminControlCenter() {
  const [phase,setPhase] = createSignal<Phase>('checking');
  const [session,setSession] = createSignal<PortalSession|null>(null);
  const [language,setLanguage] = createSignal<PortalLocale>('de');
  const [requested,setRequested] = createSignal<string>('overview');
  const t = createMemo(() => translations[language()]);
  const role = () => session()?.user ? session()!.role : 'anonymous';
  const allowed = createMemo(() => allowedAdminSections(role()));
  const selected = createMemo(() => resolveAdminSection(role(),requested()));
  const names = createMemo<Record<AdminSection,string>>(() => ({
    overview:t().overview,operations:t().operations,crm:t().crm,messages:t().messages,studio:t().studio
  }));
  const descriptions = createMemo<Record<AdminSection,string>>(() => ({
    overview:'',operations:t().operationsText,crm:t().crmText,messages:t().messagesText,studio:t().studioText
  }));
  let pending: AbortController | null = null;
  let verifiedAt = 0;
  const [studioDirty,setStudioDirty] = createSignal(false);

  function updateUrl(view: string, locale: PortalLocale) {
    const url = new URL(location.href);
    url.searchParams.set('view',view);
    url.searchParams.set('lang',locale);
    history.replaceState(history.state,'',url);
  }
  function openSection(view: AdminSection) {
    if (!allowed().includes(view) || view===selected()) return;
    if (selected()==='studio' && studioDirty() && !window.confirm(t().unsaved)) return;
    setRequested(view);
    updateUrl(view,language());
  }
  function changeLanguage(next: PortalLocale) {
    setLanguage(next);
    updateUrl(selected(),next);
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
      if (!response.ok) throw new Error('session');
      const data = await response.json() as PortalSession;
      if (pending !== controller) return;
      setSession(data);
      verifiedAt = Date.now();
      setPhase('ready');
    } catch {
      if (pending === controller) { setSession(null); setPhase('error'); }
    } finally {
      clearTimeout(timer);
      if (pending === controller) pending = null;
    }
  }
  onMount(() => {
    const params = new URLSearchParams(location.search);
    setRequested(params.get('view') || 'overview');
    setLanguage(resolvePortalLocale(params.get('lang'),undefined,navigator.language.slice(0,2)));
    void verifySession();
    const revalidate = () => { if (Date.now()-verifiedAt>15_000) void verifySession(); };
    const onFocus = () => { revalidate(); };
    const onVisibility = () => { if (!document.hidden) revalidate(); };
    const onStudioDirty = (event:Event) => {setStudioDirty((event as CustomEvent<boolean>).detail===true);};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('knaba:studio:dirty',onStudioDirty);
    onCleanup(() => {
      pending?.abort();
      window.removeEventListener('focus',onFocus);
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('knaba:studio:dirty',onStudioDirty);
    });
  });
  const signIn = () => '/login/?return_to=' + encodeURIComponent('/admin/?view=' + selected() + '&lang=' + language());

  return <div class="kncc" lang={language()}>
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
            <Show when={!session()?.user}><a class="kncc-action" href={signIn()}>{t().signIn}</a></Show>
            <a class="kncc-action kncc-action-secondary" href="/konto/">{t().portal}</a>
          </div>
        </div>
      </Match>
      <Match when={allowed().length>0}>
        <div class="kncc-layout">
          <aside class="kncc-sidebar">
            <div class="kncc-brand"><span class="kncc-brand-symbol" aria-hidden="true">✳</span><div><strong>KNABA</strong><small>CONTROL CENTER</small></div></div>
            <p class="kncc-sidebar-caption">{t().session}</p>
            <nav aria-label={t().nav} class="kncc-navigation">
              <For each={allowed()}>{view=><button type="button" classList={{'kncc-nav-item':true,'is-current':selected()===view}}
                aria-current={selected()===view?'page':undefined} onClick={() => openSection(view)}>
                <span class="kncc-nav-icon" aria-hidden="true">{icons[view]}</span><span>{names()[view]}</span>
              </button>}</For>
            </nav>
            <p class="kncc-security">{t().hint}</p>
            <a class="kncc-site-link" href="/">{t().publicSite} ↗</a>
          </aside>
          <section class="kncc-content" aria-label={names()[selected()]}>
            <div class="kncc-toolbar">
              <div class="kncc-identity"><span class="kncc-avatar" aria-hidden="true">{(session()?.user?.name || session()?.user?.email || 'K').slice(0,1).toUpperCase()}</span>
                <span><strong>{session()?.user?.name || session()?.user?.email}</strong><small>{role()==='owner'?t().owner:t().admin}</small></span>
              </div>
              <div class="kncc-tools">
                <label class="kncc-language"><span>{t().language}</span>
                  <select value={language()} onChange={event=>changeLanguage(event.currentTarget.value as PortalLocale)}>
                    <option value="de">DE</option><option value="en">EN</option><option value="uk">UK</option><option value="ru">RU</option>
                  </select></label>
                <button type="button" class="kncc-tool" onClick={() => void verifySession()}>{t().refresh}</button>
                <a class="kncc-tool" href="/logout/?return_to=%2Fadmin%2F">{t().signOut}</a>
              </div>
            </div>
            <Show when={selected()==='overview'}>
              <div class="kncc-intro"><span class="kncc-eyebrow">KNABA · CONTROL CENTER</span><h2>{t().title}</h2><p>{t().subtitle}</p></div>
              <div class="kncc-cards"><For each={allowed().filter(item=>item!=='overview')}>{view=>
                <button class="kncc-card" type="button" onClick={()=>openSection(view)}>
                  <span class="kncc-card-icon" aria-hidden="true">{icons[view]}</span><strong>{names()[view]}</strong>
                  <span class="kncc-card-desc">{descriptions()[view]}</span><span class="kncc-card-link">{t().choose} →</span>
                </button>
              }</For></div>
            </Show>
            <Switch>
              <Match when={selected()==='operations'}><div class="kncc-module"><Portal locale={language()} /></div></Match>
              <Match when={selected()==='crm'}><div class="kncc-module"><CrmConsole /></div></Match>
              <Match when={selected()==='messages' && role()==='owner'}><div class="kncc-module"><AssistantInbox locale={language()==='ru'?'ru':'de'} /></div></Match>
              <Match when={selected()==='studio' && role()==='owner'}><div class="kncc-module"><SiteStudio /></div></Match>
            </Switch>
          </section>
        </div>
      </Match>
    </Switch>
  </div>;
}
