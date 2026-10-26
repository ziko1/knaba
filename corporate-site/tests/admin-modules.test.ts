import { describe, expect, it } from 'vitest';
import {
  adminModules, adminSectionIds, pendingIntegrations, allowedAdminModules,
  allowedAdminSections, canAccessAdminModule, resolveAdminSection
} from '../src/lib/admin-access';

describe('KNABA composable CMS/CRM/Portal modules', () => {
  it('keeps exactly one same-origin mount per existing module and original legacy links', () => {
    expect(adminModules.map(module => module.id)).toEqual(['operations', 'crm', 'messages', 'studio']);
    expect(adminSectionIds).toEqual(['overview', ...adminModules.map(module => module.id)]);
    expect(adminModules.map(module => module.legacyPath)).toEqual(['/konto/', '/crm/', '/postfach/', '/studio/']);
    expect(new Set(adminModules.map(module => module.id)).size).toBe(adminModules.length);
    expect(new Set(adminModules.map(module => module.legacyPath)).size).toBe(adminModules.length);
    expect(adminModules.every(module => module.deployment === 'same-origin')).toBe(true);
  });

  it('always fails closed for unapproved and unknown roles or module identifiers', () => {
    for (const role of [null, undefined, 'pending', 'client', 'worker', 'suspended', 'OWNER', '']) {
      expect(allowedAdminSections(role)).toEqual([]);
      expect(allowedAdminModules(role)).toEqual([]);
      expect(canAccessAdminModule(role, 'studio')).toBe(false);
    }
    for (const id of ['erp-core', 'operations/../studio', 'constructor', '__proto__', '', null]) {
      expect(canAccessAdminModule('owner', id)).toBe(false);
      expect(resolveAdminSection('owner', id)).toBe('overview');
    }
  });

  it('enforces role-aware modules even for manually crafted deep links', () => {
    expect(allowedAdminSections('owner')).toEqual(adminSectionIds);
    expect(allowedAdminSections('admin')).toEqual(['overview', 'operations', 'crm']);
    expect(canAccessAdminModule('admin', 'crm')).toBe(true);
    expect(canAccessAdminModule('admin', 'studio')).toBe(false);
    expect(canAccessAdminModule('admin', 'messages')).toBe(false);
    expect(resolveAdminSection('admin', 'studio')).toBe('overview');
    expect(resolveAdminSection('owner', 'studio')).toBe('studio');
  });

  it('does not pretend that imported V4 ERP is already an authenticated CMS runtime', () => {
    expect(pendingIntegrations).toEqual([{
      id: 'erp-core', source: 'erp/', deployment: 'separate-runtime', status: 'integration-required'
    }]);
    expect(adminModules.some(module => (module.id as string) === 'erp-core')).toBe(false);
  });
});
