import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {Button} from '../../../packages/ui/index';
import {type Language} from '../../../packages/i18n/index';
import {api, ApiError, type Actor} from './api';
import {errorText, type Translate} from './CommandForm';
import {PrivateReadGeneration} from './privateReadGeneration';
import './PartnerOrders.css';

export function partnerRoute(actor: Actor): 'staff' | 'orders' | 'denied' {
  if (!Array.isArray(actor.roles) || !actor.roles.length || !actor.roles.every(role => typeof role === 'string')) return 'denied';
  if (!actor.roles.some(role => /^[\s\u0085]*PARTNER[\s\u0085]*$/i.test(role))) return 'staff';
  return actor.roles.length === 1 && actor.roles[0] === 'PARTNER' &&
    Array.isArray(actor.permissions) && actor.permissions.includes('partner.orders.read') ? 'orders' : 'denied';
}

type Order = {id: string; status: string; updatedAt: string};
type Page = {items: Order[]; nextAfter: string | null};

function fields(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 &&
    !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value);
}
function parseOrder(value: unknown): Order {
  if (!fields(value, ['id','status','updatedAt']) || !validId(value.id) ||
      typeof value.status !== 'string' || !value.status ||
      typeof value.updatedAt !== 'string' || !/T.*Z$/.test(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt)))
    throw new Error('PARTNER_ORDER_INVALID');
  return {id: value.id, status: value.status, updatedAt: value.updatedAt};
}
type Target = {after?: string; id?: string};
type Display = {kind: 'loading'} | {kind: 'list'; page: Page} | {kind: 'order'; order: Order} | {kind: 'error'; error: unknown};

const statusKeys: Record<string, string> = {
  PENDING_OPERATIONS: 'partnerPending', CONFIRMED: 'partnerConfirmed', SCHEDULED: 'partnerScheduled',
  IN_PROGRESS: 'working', WORK_SUBMITTED: 'partnerSubmitted', CLIENT_REVIEW: 'partnerReview', CLOSED: 'partnerClosed',
  PAUSED: 'partnerPaused', CANCELLED: 'cancelled', DISPUTED: 'disputed',
};

export async function readPartnerOrders(target: Target, signal: AbortSignal): Promise<Display> {
  const options: RequestInit = {signal, cache: 'no-store'};
  if (target.id !== undefined) {
    const encoded = encodeURIComponent(target.id);
    const path = target.id === '.' || target.id === '..' ? 'order?id=' + encoded : 'orders/' + encoded;
    const row = parseOrder(await api<unknown>('/api/v1/partner/' + path, options));
    if (row.id !== target.id) throw new Error('PARTNER_DETAIL_MISMATCH');
    return {kind: 'order', order: row};
  }
  const params = new URLSearchParams({limit: '50'});
  if (target.after !== undefined) params.set('after', target.after);
  const result = await api<unknown>('/api/v1/partner/orders?' + params, options);
  if (!fields(result, ['items','nextAfter']) || !Array.isArray(result.items) || result.items.length > 50 ||
      (result.nextAfter !== null && !validId(result.nextAfter))) throw new Error('PARTNER_PAGE_INVALID');
  const items = result.items.map(parseOrder);
  const ids = items.map(item => item.id);
  if (new Set(ids).size !== ids.length || ids.some(id => id === target.after) ||
      (result.nextAfter !== null && result.nextAfter !== ids.at(-1))) throw new Error('PARTNER_PAGE_INVALID');
  return {kind: 'list', page: {items, nextAfter: result.nextAfter}};
}

export default function PartnerOrders({allowed, t, language, brand, languageSelect, testNotice, logout}: {
  allowed: boolean; t: Translate; language: Language; brand: ReactNode; languageSelect: ReactNode; testNotice?: string; logout: () => Promise<void>;
}) {
  const [gate] = useState(() => new PrivateReadGeneration());
  const target = useRef<Target>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const focusOnArrival = useRef(false);
  const [display, setDisplay] = useState<Display>({kind: 'loading'});
  const ending = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const exit = useRef(logout);
  useEffect(() => { exit.current = logout; }, [logout]);
  const signOut = useCallback(() => {
    if (ending.current) return;
    ending.current = true;
    gate.invalidate();
    target.current = {};
    setLeaving(true);
    setLogoutFailed(false);
    setDisplay({kind: 'loading'});
    void exit.current().catch(() => {
      // Read authority stays invalidated until the server confirms a new login.
      ending.current = false;
      setLeaving(false);
      setLogoutFailed(true);
    });
  }, [gate]);
  const read = useCallback(async (next = target.current, revalidate = false) => {
    if (!allowed || !navigator.onLine || document.hidden) return;
    const ticket = gate.begin('partner');
    if (!ticket) return;
    focusOnArrival.current = next.id !== target.current.id || next.after !== target.current.after;
    target.current = next;
    if (!revalidate) setDisplay({kind: 'loading'});
    const controller = new AbortController();
    const abort = () => controller.abort();
    ticket.signal.addEventListener('abort', abort, {once: true});
    const deadline = window.setTimeout(abort, 10000);
    try {
      const result = await readPartnerOrders(next, controller.signal);
      setDisplay(gate.update(ticket, () => result));
    } catch (error) {
      if (!gate.accepts(ticket)) return;
      target.current = {};
      if (error instanceof ApiError && error.status === 401) { signOut(); return; }
      setDisplay(gate.update<Display>(ticket, () => ({kind: 'error', error})));
    } finally {
      window.clearTimeout(deadline);
      ticket.signal.removeEventListener('abort', abort);
    }
  }, [allowed, gate, signOut]);
  useEffect(() => {
    function suspend() {
      gate.unmount();
      target.current = {};
      setDisplay({kind: 'loading'});
    }
    function synchronize() {
      setOnline(navigator.onLine);
      if (document.hidden || !navigator.onLine) { suspend(); return; }
      if (gate.mount()) void read();
    }
    synchronize();
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    window.addEventListener('online', synchronize);
    window.addEventListener('offline', synchronize);
    return () => {
      gate.unmount();
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
      window.removeEventListener('online', synchronize);
      window.removeEventListener('offline', synchronize);
    };
  }, [gate, read]);
  useEffect(() => {
    if (display.kind !== 'list' && display.kind !== 'order') return;
    if (focusOnArrival.current) {
      focusOnArrival.current = false;
      heading.current?.focus();
    }
    const timer = window.setTimeout(() => { void read(target.current, true); }, 30000);
    return () => window.clearTimeout(timer);
  }, [display, read]);
  const status = (value: string) => t(Object.hasOwn(statusKeys, value) ? statusKeys[value] : 'unknown');
  return <div className="public-page partner-workspace">
    <header className="public-header">{brand}<div>{languageSelect}
      <Button variant="secondary" disabled={leaving} onClick={signOut}>{t('signOut')}</Button></div></header>
    <main className="partner-content">
      <h1 ref={heading} tabIndex={-1}>{t('partnerOrders')}</h1>
      {testNotice && <p className="notice warning">{testNotice}</p>}
      {logoutFailed ? <p role="alert">{t('partnerLogoutFailed')}</p>
        : leaving ? <p role="status">{t('loading')}</p>
        : !allowed ? <p role="alert">{t('permission')}</p>
        : !online ? <p role="status">{t('refreshRequired')}</p>
        : <section aria-busy={display.kind === 'loading'}>
          {display.kind === 'loading' && <p role="status">{t('loading')}</p>}
          {display.kind === 'error' && <p role="alert">{display.error instanceof ApiError && display.error.status === 404
            ? t('partnerUnavailable') : errorText(display.error, t)}</p>}
          {display.kind === 'list' && (display.page.items.length ?
            <ul className="partner-list">{display.page.items.map(row => <li key={row.id}>
              <button onClick={() => void read({...target.current, id: row.id})}>
                <strong>{row.id}</strong><span>{status(row.status)}</span>
              </button>
            </li>)}</ul> : <p role="status">{t('empty')}</p>)}
          {display.kind === 'order' && <article>
            <h2>{display.order.id}</h2>
            <dl><dt>{t('status')}</dt><dd>{status(display.order.status)}</dd>
              <dt>{t('updated')}</dt><dd><time dateTime={display.order.updatedAt}>{new Intl.DateTimeFormat(language.toLowerCase(),
                {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin'}).format(new Date(display.order.updatedAt))} (Berlin)</time></dd></dl>
          </article>}
          {display.kind !== 'loading' && <div className="partner-actions">
            {display.kind === 'order' && <Button variant="secondary" onClick={() => void read({after: target.current.after})}>{t('back')}</Button>}
            {display.kind === 'list' && target.current.after && <Button variant="secondary" onClick={() => void read({})}>{t('partnerFirst')}</Button>}
            {display.kind === 'list' && display.page.nextAfter !== null &&
              <Button onClick={() => void read({after: display.page.nextAfter!})}>{t('partnerNext')}</Button>}
            <Button variant="secondary" onClick={() => void read()}>{t(display.kind === 'error' ? 'retry' : 'refresh')}</Button>
          </div>}
        </section>}
    </main>
  </div>;
}
