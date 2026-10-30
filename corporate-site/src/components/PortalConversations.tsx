import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { portalHeader, type CleaningRequest, type PortalConversation, type PortalConversations as ConversationList, type PortalMessage, type PortalProfile, type PortalSession } from '../lib/portal-contract';
import { formatPortalDate, portalMessages, type PortalLocale } from '../lib/portal-i18n';
import { createRequestId } from '../lib/request-id';
import { workspaceHref } from '../lib/workspace-navigation';
import { workspaceWords } from '../lib/workspace-i18n';
import { cabinetWords } from '../lib/cabinet-words';
import '../styles/workspace.css';

interface MessagePage { conversation: PortalConversation; messages: PortalMessage[]; nextBefore: number | null }
interface RecipientOption { id: string; name: string; role: 'client' | 'partner' | 'worker' }
interface RecipientPage { recipients: RecipientOption[]; nextAfter: string | null }
class ConversationError extends Error { constructor(public status: number) { super('Conversation request failed'); } }

export default function PortalConversations(props: {
  session: PortalSession; locale: PortalLocale; active: boolean; profiles: PortalProfile[]; requests: CleaningRequest[];
}) {
  const t = () => workspaceWords[props.locale];
  const p = () => portalMessages[props.locale];
  const siteManager = () => props.session.role === 'bauleiter';
  const manager = () => props.session.role === 'owner' || props.session.role === 'admin' || siteManager();
  const [conversations, setConversations] = createSignal<PortalConversation[]>([]);
  const [recipientRows, setRecipientRows] = createSignal<RecipientOption[]>([]);
  const [recipientSearch, setRecipientSearch] = createSignal('');
  const [recipientAfter, setRecipientAfter] = createSignal<string | null>(null);
  const [recipientBusy, setRecipientBusy] = createSignal(false);
  const [limited, setLimited] = createSignal(false);
  const [listCursor, setListCursor] = createSignal<string | null>(null);
  const [nextListCursor, setNextListCursor] = createSignal<string | null>(null);
  const [selected, setSelected] = createSignal('');
  const [messages, setMessages] = createSignal<PortalMessage[]>([]);
  const [nextBefore, setNextBefore] = createSignal<number | null>(null);
  const [pageBefore, setPageBefore] = createSignal<number | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [listing, setListing] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');
  const [denied, setDenied] = createSignal(false);
  const [participant, setParticipant] = createSignal('');
  const [requestId, setRequestId] = createSignal('');
  const [drafts, setDrafts] = createSignal<Record<string, string>>({});
  const [attempts, setAttempts] = createSignal<Record<string, { key: string; body: string }>>({});
  const [sending, setSending] = createSignal('');
  const activeThread = () => conversations().find(item => item.id === selected());
  const draft = () => drafts()[selected()] || '';
  const attempt = () => attempts()[selected()];
  const recipients = () => recipientRows();
  const contexts = () => props.requests;
  const canStart = () => !siteManager() || props.requests.length > 0;
  const dirty = () => Object.values(drafts()).some(value => value.trim().length > 0) || Object.keys(attempts()).length > 0;
  let disposed = false;
  let authEpoch = 0;
  let listController: AbortController | undefined;
  let messageController: AbortController | undefined;
  let recipientController: AbortController | undefined;
  const controllers = new Set<AbortController>();
  const unavailableThreads = new Set<string>();
  let scroll: HTMLDivElement | undefined;
  let composer: HTMLTextAreaElement | undefined;

  function clearProtected() {
    authEpoch += 1;
    controllers.forEach(controller => controller.abort());
    listController = undefined; messageController = undefined;
    setDenied(true); setConversations([]); setListCursor(null); setNextListCursor(null); setRecipientRows([]); setRecipientAfter(null); setRecipientBusy(false); setParticipant(''); setRequestId(''); setMessages([]); setSelected(''); setDrafts({}); setAttempts({});
    setNextBefore(null); setPageBefore(null); setListing(false); setLoading(false); setCreating(false); setSending(''); setNotice('');
  }
  function accepts(epoch: number, thread?: string) {
    return !disposed && !denied() && authEpoch === epoch && (!thread || !unavailableThreads.has(thread));
  }
  function removeUnavailableThread(thread: string) {
    unavailableThreads.add(thread);
    setConversations(items => items.filter(item => item.id !== thread));
    setDrafts(items => { const next = { ...items }; delete next[thread]; return next; });
    setAttempts(items => { const next = { ...items }; delete next[thread]; return next; });
    if (selected() === thread) {
      messageController?.abort(); messageController = undefined;
      setMessages([]); setSelected(''); setNextBefore(null); setPageBefore(null); setLoading(false); setNotice('');
      history.replaceState(history.state, '', workspaceHref(location.href, { conversation: null }));
    }
  }
  function issue(cause: unknown) {
    if (cause instanceof ConversationError) {
      if ([401, 403].includes(cause.status)) return t().denied;
      if (cause.status === 404) return t().denied;
      if (cause.status === 429) return p().rateError;
      if ([400, 409, 413, 422].includes(cause.status)) return p().validationError;
    }
    return t().failed;
  }
  async function request<T>(path: string, method = 'GET', body?: unknown, controller = new AbortController()): Promise<T> {
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(path, {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: body ? { ...portalHeader, 'Content-Type': 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        if (!disposed && [401, 403].includes(response.status)) { clearProtected(); setError(t().denied); }
        throw new ConversationError(response.status);
      }
      return await response.json() as T;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  async function loadList(cursor: string | null = listCursor()) {
    if (!props.active || document.hidden || denied() || disposed) return;
    const epoch = authEpoch;
    listController?.abort();
    const controller = new AbortController(); listController = controller; setListing(true);
    try {
      const data = await request<ConversationList>('/api/portal/conversations'+(cursor?'?'+new URLSearchParams({cursor}):''), 'GET', undefined, controller);
      if (!accepts(epoch) || listController !== controller) return;
      setConversations(data.conversations.filter(item => !unavailableThreads.has(item.id))); setLimited(data.limited); setError('');
      setListCursor(cursor);setNextListCursor(data.nextCursor??null);
    } catch (cause) {
      if (accepts(epoch) && listController === controller) setError(issue(cause));
    } finally { if (accepts(epoch) && listController === controller) { listController = undefined; setListing(false); } }
  }
  async function loadRecipients(after: string | null = null) {
    if(!props.active || !manager() || denied() || disposed)return;
    recipientController?.abort();
    if(siteManager()&&!requestId()){setRecipientRows([]);setRecipientAfter(null);setRecipientBusy(false);return;}
    const epoch=authEpoch,controller=new AbortController();recipientController=controller;setRecipientBusy(true);
    const params=new URLSearchParams();
    if(requestId())params.set('requestId',requestId());
    if(recipientSearch().trim())params.set('q',recipientSearch().trim());
    if(after)params.set('after',after);
    try{
      const data=await request<RecipientPage>('/api/portal/conversations/recipients?'+params,'GET',undefined,controller);
      if(!accepts(epoch)||recipientController!==controller)return;
      setRecipientRows(items=>after?[...items,...data.recipients.filter(item=>!items.some(existing=>existing.id===item.id))]:data.recipients);
      setRecipientAfter(data.nextAfter);
      if(!after&&!data.recipients.some(item=>item.id===participant()))setParticipant('');
    }catch(cause){if(accepts(epoch)&&recipientController===controller)setError(issue(cause));}
    finally{if(accepts(epoch)&&recipientController===controller){recipientController=undefined;setRecipientBusy(false);}}
  }
  async function loadMessages(before: number | null = null) {
    const thread = selected();
    if (!thread || denied() || disposed || unavailableThreads.has(thread)) return;
    const epoch = authEpoch;
    messageController?.abort();
    const controller = new AbortController(); messageController = controller; setLoading(true);
    const shouldScroll = before === null && (!scroll || scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 70);
    try {
      const data = await request<MessagePage>('/api/portal/conversations/' + encodeURIComponent(thread) + '/messages' + (before ? '?before=' + before : ''), 'GET', undefined, controller);
      if (!accepts(epoch, thread) || messageController !== controller || selected() !== thread) return;
      setMessages(data.messages); setNextBefore(data.nextBefore); setPageBefore(before); setError('');
      setConversations(items => items.some(item => item.id === data.conversation.id)
        ? items.map(item => item.id === data.conversation.id ? data.conversation : item)
        : [data.conversation, ...items]);
      if (shouldScroll) queueMicrotask(() => { if (accepts(epoch, thread) && scroll && selected() === thread) scroll.scrollTop = scroll.scrollHeight; });
    } catch (cause) {
      if (accepts(epoch, thread) && messageController === controller && selected() === thread) {
        setError(issue(cause));
        if (cause instanceof ConversationError && cause.status === 404) removeUnavailableThread(thread);
      }
    } finally { if (accepts(epoch, thread) && messageController === controller) { messageController = undefined; setLoading(false); } }
  }
  function selectConversation(id: string, writeHistory = true) {
    if (denied() || disposed || id === selected() || unavailableThreads.has(id)) return;
    setSelected(id); setMessages([]); setNextBefore(null); setPageBefore(null); setError(''); setNotice('');
    if (writeHistory) history.pushState(history.state, '', workspaceHref(location.href, { tab: 'conversations', conversation: id || null, request: null }));
  }
  async function openConversation(event: SubmitEvent) {
    event.preventDefault(); if (creating() || denied()) return;
    if (manager() && (recipientBusy() || !recipients().some(item => item.id === participant()))) return;
    if (siteManager() && !requestId()) return;
    const epoch = authEpoch;
    setCreating(true); setError('');
    try {
      const data = await request<{ conversation: PortalConversation }>('/api/portal/conversations', 'POST', {
        ...(requestId() ? { requestId: requestId() } : {}), ...(manager() ? { participantId: participant() } : {}),
      });
      if (!accepts(epoch, data.conversation.id)) return;
      setConversations(items => [data.conversation, ...items.filter(item => item.id !== data.conversation.id)]);
      selectConversation(data.conversation.id); queueMicrotask(() => { if (accepts(epoch, data.conversation.id)) composer?.focus(); });
    } catch (cause) { if (accepts(epoch)) setError(issue(cause)); }
    finally { if (accepts(epoch)) setCreating(false); }
  }
  async function send(event: SubmitEvent) {
    event.preventDefault();
    const thread = selected();
    if (!thread || sending() || denied()) return;
    const epoch = authEpoch;
    let pending = attempts()[thread];
    if (!pending) {
      const body = (drafts()[thread] || '').trim();
      if (!body || body.length > 2000) return;
      try { pending = { key: createRequestId(), body }; } catch { setError(t().failed); return; }
      setAttempts(items => ({ ...items, [thread]: pending! }));
    }
    setSending(thread); setError(''); setNotice('');
    try {
      const data = await request<{ message: PortalMessage }>('/api/portal/conversations/' + encodeURIComponent(thread) + '/messages', 'POST', { body: pending.body, idempotencyKey: pending.key });
      if (!accepts(epoch, thread)) return;
      setAttempts(items => { const next = { ...items }; delete next[thread]; return next; });
      setDrafts(items => ({ ...items, [thread]: '' }));
      if (selected() === thread) {
        setNotice(t().sent); setPageBefore(null);
        setMessages(items => [...items.filter(item => item.id !== data.message.id), data.message].slice(-50));
        void loadMessages(); queueMicrotask(() => { if (accepts(epoch, thread)) composer?.focus(); });
      }
      void loadList();
    } catch (cause) {
      if (accepts(epoch, thread)) {
        setError(issue(cause));
        if (cause instanceof ConversationError && cause.status === 404) removeUnavailableThread(thread);
        // A definite rejection did not accept this send; a timeout/5xx may have.
        if (cause instanceof ConversationError && cause.status < 500) setAttempts(items => { const next = { ...items }; delete next[thread]; return next; });
      }
    } finally { if (!disposed && authEpoch === epoch) setSending(''); }
  }
  onMount(() => {
    const fromUrl = () => {
      const params=new URLSearchParams(location.search);
      const context=params.get('request');
      if(context&&props.requests.some(item=>item.id===context)){setRequestId(context);setParticipant('');setRecipientSearch('');}
      const id = params.get('conversation') || '';
      selectConversation(id.length <= 200 ? id : '', false);
    };
    fromUrl(); window.addEventListener('knaba:workspace:navigate', fromUrl);
    const refresh = () => { if (props.active && !document.hidden && !denied()) { void loadList(); if (selected() && !pageBefore()) void loadMessages(); } };
    const timer = setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    onCleanup(() => { clearInterval(timer); window.removeEventListener('knaba:workspace:navigate', fromUrl); document.removeEventListener('visibilitychange', refresh); });
  });
  createEffect(() => { if (props.active) { void loadList(); if (selected()) void loadMessages(pageBefore()); } });
  createEffect(() => {
    // Each changed search/context cancels its predecessor; a stale reply cannot
    // restore a recipient from another request or a revoked session.
    const active=props.active,context=requestId(),query=recipientSearch();
    void context;void query;
    recipientController?.abort();recipientController=undefined;
    setRecipientRows([]);setRecipientAfter(null);setParticipant('');
    if(!active||!manager()||denied())return;
    setRecipientBusy(true);
    const timer=setTimeout(()=>void loadRecipients(),250);
    onCleanup(()=>clearTimeout(timer));
  });
  onCleanup(() => { disposed = true; authEpoch += 1; controllers.forEach(controller => controller.abort()); });
  return <section class="workspace-conversations" data-knaba-dirty={dirty() ? 'true' : undefined} aria-label={t().conversations}>
    <p class="portal-small">{siteManager() ? t().siteManagerIntro : manager() ? t().managerIntro : t().conversationIntro}</p>
    <Show when={error()}><p class="portal-alert portal-alert-error" role="alert">{error()} <Show when={!denied()}><button type="button" class="portal-link-button" onClick={() => { void loadList(); if(manager())void loadRecipients(); if (selected()) void loadMessages(pageBefore()); }}>{t().retry}</button></Show></p></Show>
    <Show when={!denied()}>
      <Show when={canStart()}><form class="workspace-start portal-form" onSubmit={openConversation}>
        <label>{t().context}<select required={siteManager()} value={requestId()} onChange={e => { setRequestId(e.currentTarget.value); if (siteManager()) setParticipant(''); }}><option value="">{siteManager() ? t().chooseRequest : t().general}</option>
          <For each={contexts()}>{item => <option value={item.id}>#{item.id.slice(-8).toUpperCase()} · {item.postcode}</option>}</For>
        </select></label>
        <Show when={manager()}><label>{cabinetWords[props.locale].findPerson}<input type="search" name="recipient-search" maxLength={160} value={recipientSearch()} onInput={e=>setRecipientSearch(e.currentTarget.value)}/></label>
        <label>{t().recipient}<select required disabled={recipientBusy()} value={participant()} onChange={e => setParticipant(e.currentTarget.value)}>
          <option value="">{t().choosePerson}</option><For each={recipients()}>{person => <option value={person.id}>{person.name} · {p()[person.role!]}</option>}</For>
        </select></label><Show when={recipientBusy()}><p role="status" class="portal-small">{p().loading}</p></Show>
        <Show when={!recipientBusy()&&!recipients().length&&(!siteManager()||requestId())}><p class="portal-small" role="status">{cabinetWords[props.locale].noPeople}</p></Show>
        <Show when={recipientAfter()}><button type="button" class="portal-link-button" disabled={recipientBusy()} onClick={()=>void loadRecipients(recipientAfter())}>{cabinetWords[props.locale].morePeople}</button></Show></Show>
        <button type="submit" class="button button-outline" disabled={creating() || (manager() && (!participant()||recipientBusy())) || (siteManager() && !requestId())}>{creating() ? p().loading : t().openConversation}</button>
      </form></Show>
      <Show when={limited()}><p class="portal-small">{p().limited}</p></Show>
      <div class="portal-form-actions">
        <Show when={listCursor()}><button type="button" class="portal-link-button" disabled={listing()} onClick={()=>void loadList(null)}>{cabinetWords[props.locale].latestConversations}</button></Show>
        <Show when={nextListCursor()}><button type="button" class="portal-link-button" disabled={listing()} onClick={()=>void loadList(nextListCursor())}>{cabinetWords[props.locale].olderConversations}</button></Show>
      </div>
      <div class="workspace-chat-layout">
        <nav class="workspace-threads" aria-label={t().conversations} aria-busy={listing()}>
          <Show when={!conversations().length}><p class="portal-small">{listing() ? t().loading : manager() ? t().noManagerConversations : t().noConversations}</p></Show>
          <For each={conversations()}>{conversation => <a data-astro-reload class="workspace-thread" aria-current={selected() === conversation.id ? 'page' : undefined}
            href={workspaceHref(typeof location === 'undefined' ? '/konto/' : location.href, { tab: 'conversations', conversation: conversation.id })}
            onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); selectConversation(conversation.id); } }}>
            <strong>{manager() ? conversation.participantName : t().team}</strong>
            <span>{conversation.requestId ? '#' + conversation.requestId.slice(-8).toUpperCase() : t().general} · {p()[conversation.participantRole]}</span>
            <small>{conversation.lastMessagePreview || t().noMessages}</small>
            <time dateTime={conversation.updatedAt}>{formatPortalDate(conversation.updatedAt, props.locale)}</time>
          </a>}</For>
        </nav>
        <div class="workspace-dialog"><Show when={selected()} fallback={<p class="portal-empty">{t().selectConversation}</p>}>
          <header class="workspace-dialog-heading"><strong>{manager() ? activeThread()?.participantName : t().team}</strong>
            <button type="button" class="portal-refresh" disabled={loading()} onClick={() => void loadMessages(pageBefore())}>{t().refresh}</button></header>
          <div class="portal-form-actions"><Show when={nextBefore()}><button type="button" class="portal-link-button" disabled={loading()} onClick={() => void loadMessages(nextBefore())}>{t().older}</button></Show>
            <Show when={pageBefore()}><button type="button" class="portal-link-button" disabled={loading()} onClick={() => void loadMessages()}>{t().latest}</button></Show></div>
          <Show when={loading()}><p class="portal-small" role="status">{t().loading}</p></Show>
          <div ref={scroll} class="workspace-message-list" role="region" aria-label={t().conversations} tabIndex={0}>
            <Show when={!loading() && !messages().length}><p class="portal-empty">{t().noMessages}</p></Show>
            <For each={messages()}>{message => <article class="workspace-message" classList={{ 'is-mine': message.authorId === props.session.user?.id }}>
              <header><strong>{message.authorName}</strong><span>{p()[message.authorRole]}</span></header>
              <p>{message.body}</p><time dateTime={message.createdAt}>{formatPortalDate(message.createdAt, props.locale)}</time>
            </article>}</For>
          </div>
          <form class="portal-form workspace-composer" onSubmit={send}>
            <label>{t().message}<textarea ref={composer} value={draft()} rows={3} required maxLength={2000} name="message" autocomplete="off"
              readOnly={Boolean(attempt()) || Boolean(sending())} onInput={event => setDrafts(items => ({ ...items, [selected()]: event.currentTarget.value }))} /></label>
            <p class="portal-small">{t().limit}</p>
            <Show when={attempt() && sending() !== selected()}><p class="portal-alert" role="status">{t().uncertain}</p></Show>
            <div class="portal-form-actions"><button type="submit" class="button button-dark" disabled={Boolean(sending()) || !draft().trim()}>{sending() === selected() ? t().sending : attempt() ? t().retry : t().send}</button>
              <p class="portal-small" role="status" aria-live="polite">{notice()}</p></div>
          </form>
        </Show></div>
      </div>
    </Show>
  </section>;
}
