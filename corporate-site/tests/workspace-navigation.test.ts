import { describe, expect, it, vi } from 'vitest';
import { listenWorkspaceNavigation, resolvePortalTab, resolveRequestFilter, safeWorkspaceRedirect, workspaceHref } from '../src/lib/workspace-navigation';

describe('role workspace navigation', () => {
  it('preserves the current one-window context when changing a tab or filter', () => {
    const current = 'https://kneba.vsp.rest/admin/?view=operations&lang=uk&status=scheduled#main';
    expect(workspaceHref(current, { tab: 'conversations', conversation: 'thread-1' }))
      .toBe('/admin/?view=operations&lang=uk&status=scheduled&tab=conversations&conversation=thread-1#main');
    expect(workspaceHref(current, { status: null, q: 'Berlin & Mitte' }))
      .toBe('/admin/?view=operations&lang=uk&q=Berlin+%26+Mitte#main');
  });

  it('restores only role-appropriate tabs from saved or crafted URLs', () => {
    expect(resolvePortalTab('newRequest', 'client')).toBe('newRequest');
    expect(resolvePortalTab('newRequest', 'partner')).toBe('newRequest');
    expect(resolvePortalTab('newRequest', 'worker')).toBe('overview');
    expect(resolvePortalTab('people', 'admin')).toBe('overview');
    expect(resolvePortalTab('activity', 'worker')).toBe('overview');
    expect(resolvePortalTab('people', 'owner')).toBe('people');
    expect(resolvePortalTab('conversations', 'worker')).toBe('conversations');
    expect(resolvePortalTab('conversations', 'bauleiter')).toBe('conversations');
    expect(resolvePortalTab('requests', 'bauleiter')).toBe('requests');
    for (const tab of ['people', 'activity', 'newRequest']) expect(resolvePortalTab(tab, 'bauleiter')).toBe('overview');
    for (const value of [null, '', '__proto__', '/admin/', 'unknown']) expect(resolvePortalTab(value, 'owner')).toBe('overview');
    expect(resolveRequestFilter('scheduled')).toBe('scheduled');
    expect(resolveRequestFilter('draft')).toBe('all');
  });

  it('accepts only internal cabinet destinations for a role switch', () => {
    expect(safeWorkspaceRedirect('/admin/?lang=uk')).toBe('/admin/?lang=uk');
    expect(safeWorkspaceRedirect('/konto/?lang=ru')).toBe('/konto/?lang=ru');
    for (const value of [null, '//evil.test/', '/\\evil.test/', 'https://evil.test/admin/', '/logout/', '/api/portal/roles', '/konto/\nLocation:evil']) {
      expect(safeWorkspaceRedirect(value)).toBeNull();
    }
  });

  it('restores shell and embedded tabs together, and protects drafts during page navigation', () => {
    const browser = new EventTarget();
    const document = new EventTarget();
    const location = { pathname: '/admin/' };
    vi.stubGlobal('window', browser); vi.stubGlobal('document', document); vi.stubGlobal('location', location);
    const shell = vi.fn(); const embedded = vi.fn();
    let dirty = true;
    const stopShell = listenWorkspaceNavigation(shell, true, () => dirty);
    const stopEmbedded = listenWorkspaceNavigation(embedded, false, () => dirty);
    try {
      browser.dispatchEvent(new Event('popstate'));
      expect(shell).toHaveBeenCalledTimes(1); expect(embedded).toHaveBeenCalledTimes(1);
      const departure = new Event('astro:before-preparation', { cancelable: true });
      document.dispatchEvent(departure); expect(departure.defaultPrevented).toBe(true);
      dirty = false;
      const cleanDeparture = new Event('astro:before-preparation', { cancelable: true });
      document.dispatchEvent(cleanDeparture); expect(cleanDeparture.defaultPrevented).toBe(false);
      location.pathname = '/'; browser.dispatchEvent(new Event('popstate'));
      expect(shell).toHaveBeenCalledTimes(1); expect(embedded).toHaveBeenCalledTimes(1);
      stopShell(); stopEmbedded(); location.pathname = '/admin/'; browser.dispatchEvent(new Event('popstate'));
      expect(shell).toHaveBeenCalledTimes(1); expect(embedded).toHaveBeenCalledTimes(1);
    } finally { stopShell(); stopEmbedded(); vi.unstubAllGlobals(); }
  });
});
