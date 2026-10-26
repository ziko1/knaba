/**
 * KNABA Control Center feature registry.
 *
 * Client-side discovery only: visibility never grants an API permission.
 * The Worker/VPS site APIs and ERP API must independently authorize each request.
 * Imported ERP source is NOT an activated integration.
 */
export type AdminRole = 'owner' | 'admin';
export type MountedModuleId = 'operations' | 'crm' | 'messages' | 'studio';
export type ImportedModuleId = 'erp' | 'hrm' | 'resources' | 'finance' | 'analytics';
export type AdminModuleId = MountedModuleId | ImportedModuleId;

export type AdminModule =
  | Readonly<{ id: MountedModuleId; state: 'mounted'; runtime: 'site'; roles: readonly AdminRole[] }>
  | Readonly<{ id: ImportedModuleId; state: 'source-only'; runtime: 'erp'; roles: readonly AdminRole[] }>;

export const adminModuleRegistry: readonly AdminModule[] = Object.freeze([
  Object.freeze({ id: 'operations', state: 'mounted', runtime: 'site', roles: Object.freeze(['owner', 'admin'] as const) }),
  Object.freeze({ id: 'crm', state: 'mounted', runtime: 'site', roles: Object.freeze(['owner', 'admin'] as const) }),
  Object.freeze({ id: 'messages', state: 'mounted', runtime: 'site', roles: Object.freeze(['owner'] as const) }),
  Object.freeze({ id: 'studio', state: 'mounted', runtime: 'site', roles: Object.freeze(['owner'] as const) }),
  Object.freeze({ id: 'erp', state: 'source-only', runtime: 'erp', roles: Object.freeze(['owner', 'admin'] as const) }),
  Object.freeze({ id: 'hrm', state: 'source-only', runtime: 'erp', roles: Object.freeze(['owner', 'admin'] as const) }),
  Object.freeze({ id: 'resources', state: 'source-only', runtime: 'erp', roles: Object.freeze(['owner', 'admin'] as const) }),
  Object.freeze({ id: 'finance', state: 'source-only', runtime: 'erp', roles: Object.freeze(['owner'] as const) }),
  Object.freeze({ id: 'analytics', state: 'source-only', runtime: 'erp', roles: Object.freeze(['owner', 'admin'] as const) }),
] satisfies AdminModule[]);

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === 'owner' || role === 'admin';
}

export function visibleAdminModulesForRole(role: string | null | undefined): AdminModule[] {
  if (!isAdminRole(role)) return [];
  return adminModuleRegistry.filter((module) => module.roles.includes(role));
}

export function mountedAdminModuleIdsForRole(role: string | null | undefined): MountedModuleId[] {
  return visibleAdminModulesForRole(role)
    .filter((module): module is Extract<AdminModule, {state: 'mounted'}> => module.state === 'mounted')
    .map((module) => module.id);
}
