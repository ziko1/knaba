import { requestStatuses, type PortalRole } from './portal-contract';

export const portalTabs = ['overview', 'requests', 'newRequest', 'conversations', 'people', 'activity'] as const;
export type PortalTab = typeof portalTabs[number];

/** URL state is only a navigation preference; server permissions remain authoritative. */
export function resolvePortalTab(value: string | null | undefined, role: PortalRole): PortalTab {
  if (!portalTabs.includes(value as PortalTab)) return 'overview';
  if ((value === 'people' || value === 'activity') && role !== 'owner') return 'overview';
  if (value === 'newRequest' && role !== 'client' && role !== 'partner') return 'overview';
  return value as PortalTab;
}

export function resolveRequestFilter(value: string | null | undefined): string {
  return requestStatuses.includes(value as typeof requestStatuses[number]) ? value! : 'all';
}

export function workspaceHref(current: string, values: Record<string, string | null>): string {
  const url = new URL(current, 'https://knaba.invalid');
  for (const [key, value] of Object.entries(values)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url.pathname + url.search + url.hash;
}

/** Accept a same-origin path from a trusted API without allowing open redirects. */
export function safeWorkspaceRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300 || /[\\\u0000-\u001f]/.test(value)) return null;
  const url = new URL(value, 'https://knaba.invalid');
  if (!value.startsWith('/') || value.startsWith('//') || url.origin !== 'https://knaba.invalid') return null;
  return ['/admin/', '/konto/', '/ru/konto/'].includes(url.pathname) ? url.pathname + url.search : null;
}

/** Keep local history inside the mounted cabinet; its document excludes Astro's page router. */
export function listenWorkspaceNavigation(readUrl: () => void, ownsPage: boolean, isDirty: () => boolean) {
  const path = location.pathname;
  const sync = () => readUrl();
  const pop = (event: PopStateEvent) => {
    if (location.pathname !== path) return;
    event.stopImmediatePropagation();
    window.dispatchEvent(new Event('knaba:workspace:navigate'));
  };
  // Astro delegates a prevented preparation to native navigation. That invokes
  // the cabinet's beforeunload guard instead of silently discarding its drafts.
  const prepare = (event: Event) => { if (isDirty()) event.preventDefault(); };
  window.addEventListener('knaba:workspace:navigate', sync);
  if (ownsPage) {
    window.addEventListener('popstate', pop, true);
    document.addEventListener('astro:before-preparation', prepare);
  }
  return () => {
    window.removeEventListener('knaba:workspace:navigate', sync);
    if (ownsPage) {
      window.removeEventListener('popstate', pop, true);
      document.removeEventListener('astro:before-preparation', prepare);
    }
  };
}
