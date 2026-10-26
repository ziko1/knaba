import { describe, expect, it } from 'vitest';
import { adminModuleRegistry, mountedAdminModuleIdsForRole, visibleAdminModulesForRole } from '../src/lib/admin-module-registry';
import { allowedAdminSections, resolveAdminSection } from '../src/lib/admin-access';

describe('KNABA modular control centre', () => {
  it('has unique, typed module IDs with explicit availability and runtime', () => {
    expect(new Set(adminModuleRegistry.map(m => m.id)).size).toBe(adminModuleRegistry.length);
    expect(adminModuleRegistry.filter(m => m.state === 'mounted').map(m => m.id))
      .toEqual(['operations', 'crm', 'messages', 'studio']);
    expect(adminModuleRegistry.filter(m => m.state === 'source-only').every(m => m.runtime === 'erp')).toBe(true);
  });
  it('retains the exact existing site navigation permissions', () => {
    expect(allowedAdminSections('owner')).toEqual(['overview', 'operations', 'crm', 'messages', 'studio']);
    expect(allowedAdminSections('admin')).toEqual(['overview', 'operations', 'crm']);
  });
  it('does not grant unauthenticated users or suspended accounts any module', () => {
    for (const role of [null, undefined, '', 'anonymous', 'worker', 'client', 'pending', 'suspended', 'OWNER', 'owner:admin']) {
      expect(visibleAdminModulesForRole(role)).toEqual([]);
      expect(mountedAdminModuleIdsForRole(role)).toEqual([]);
    }
  });
  it('keeps imported ERP modules informational, never a navigation or authorization shortcut', () => {
    for (const role of ['owner', 'admin']) {
      for (const id of ['erp', 'hrm', 'resources', 'finance', 'analytics']) {
        expect(allowedAdminSections(role)).not.toContain(id);
        expect(resolveAdminSection(role, id)).toBe('overview');
      }
    }
    expect(visibleAdminModulesForRole('admin').find(m => m.id === 'finance')).toBeUndefined();
    expect(visibleAdminModulesForRole('owner').find(m => m.id === 'finance')?.state).toBe('source-only');
  });
  it('returns new arrays and protects canonical module definitions from mutation', () => {
    const a = mountedAdminModuleIdsForRole('owner');
    a.pop();
    expect(mountedAdminModuleIdsForRole('owner')).toHaveLength(4);
    expect(Object.isFrozen(adminModuleRegistry)).toBe(true);
    expect(adminModuleRegistry.every(m => Object.isFrozen(m) && Object.isFrozen(m.roles))).toBe(true);
  });
});
