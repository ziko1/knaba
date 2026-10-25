import { describe, expect, it } from 'vitest';
import { adminSectionIds, allowedAdminSections, resolveAdminSection } from '../src/lib/admin-access';

describe('KNABA unified admin section permission contract', () => {
  it('reuses existing owner vs admin privileges', () => {
    expect(allowedAdminSections('owner')).toEqual(adminSectionIds);
    expect(allowedAdminSections('admin')).toEqual(['overview', 'operations', 'crm']);
  });
  it('never exposes admin navigation to customers, workers or pending accounts', () => {
    for (const role of ['client', 'worker', 'pending', 'suspended', 'anonymous', '', 'OWNER']) {
      expect(allowedAdminSections(role)).toEqual([]);
    }
    expect(allowedAdminSections(null)).toEqual([]);
  });
  it('does not allow crafted URLs to open owner-only tabs under the admin role', () => {
    for (const view of ['studio', 'messages', '../studio', 'unknown', '']) {
      expect(resolveAdminSection('admin', view)).toBe('overview');
    }
    expect(resolveAdminSection('admin', 'crm')).toBe('crm');
    expect(resolveAdminSection('owner', 'messages')).toBe('messages');
  });
  it('does not mutate shared navigation definitions', () => {
    const views = allowedAdminSections('owner');
    views.pop();
    expect(allowedAdminSections('owner')).toEqual(adminSectionIds);
  });
});
