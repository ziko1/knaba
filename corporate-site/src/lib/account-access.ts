import type { PortalLocale } from './portal-i18n';
import type { PortalRole } from './portal-contract';
import { allowedAdminSections } from './admin-access';

export const accountRoles = ['client', 'worker', 'partner', 'bauleiter', 'admin'] as const;
export type AccountRole = typeof accountRoles[number];
export type AccessMode = 'login' | 'request' | 'invite' | 'forgot';
export function accountRole(value: unknown): AccountRole | undefined {
  return accountRoles.includes(value as AccountRole) ? value as AccountRole : undefined;
}
export function accountLocale(...values: unknown[]): PortalLocale {
  return values.find(value => ['de', 'en', 'pl', 'lt', 'ru', 'uk'].includes(String(value))) as PortalLocale ?? 'de';
}
/** Navigation only. API authorization remains server-owned; no role is assigned here. */
export function accountDestinations(role: PortalRole, locale: PortalLocale, requestedPath?: string) {
  const portal = `/konto/?lang=${locale}`;
  const management = role === 'owner' || role === 'admin';
  let admin = `/admin/?lang=${locale}`;
  if (management && requestedPath && requestedPath.length <= 180 && !/[\\\r\n\0]/.test(requestedPath)) {
    try {
      const parsed = new URL(requestedPath, 'https://knaba.invalid');
      if (parsed.origin === 'https://knaba.invalid' && ['/admin/','/studio/','/crm/','/postfach/'].includes(parsed.pathname)) {
        const legacyViews: Record<string,string> = {'/studio/':'studio','/crm/':'crm','/postfach/':'messages'};
        const view = legacyViews[parsed.pathname] ?? parsed.searchParams.get('view');
        if (view && allowedAdminSections(role).some(section => section === view)) admin += `&view=${encodeURIComponent(view)}`;
      }
    } catch { /* Ignore malformed navigation intent. */ }
  }
  if (role === 'anonymous') return [];
  return [
    { id: 'portal', href: portal + (accountRole(role) ? `&cabinet=${role}` : '') },
    ...(management ? [{ id: 'admin', href: admin }] : [])
  ];
}
