/**
 * KNABA CMS module manifest. This is navigation/composition metadata, NOT
 * permission enforcement. Each legacy module's existing server API remains
 * responsible for authorisation, tenant/site scoping, CSRF and audit.
 */
export type ManagementRole = 'owner' | 'admin';
export type AdminArea = 'operations' | 'crm' | 'communications' | 'cms';
export type AdminModuleContract = Readonly<{
  id: string;
  area: AdminArea;
  icon: string;
  roles: readonly ManagementRole[];
  legacyPath: `/${string}/`;
  deployment: 'same-origin';
}>;

/** Only shipped, same-origin modules are shown as working modules. */
export const adminModules = [
  { id: 'operations', area: 'operations', icon: '▤', roles: ['owner', 'admin'], legacyPath: '/konto/', deployment: 'same-origin' },
  { id: 'crm', area: 'crm', icon: '◎', roles: ['owner', 'admin'], legacyPath: '/crm/', deployment: 'same-origin' },
  { id: 'messages', area: 'communications', icon: '✉', roles: ['owner'], legacyPath: '/postfach/', deployment: 'same-origin' },
  { id: 'studio', area: 'cms', icon: '✳', roles: ['owner'], legacyPath: '/studio/', deployment: 'same-origin' }
] as const satisfies readonly AdminModuleContract[];

export type AdminModuleId = (typeof adminModules)[number]['id'];
export const adminSectionIds = ['overview', ...adminModules.map(module => module.id)] as const;
export type AdminSection = (typeof adminSectionIds)[number];

/**
 * The imported V4 ERP is not the public Portal: its runtime and identity
 * remain independent until an authenticated, tenant-scoped bridge is proven.
 */
export const pendingIntegrations = [
  { id: 'erp-core', source: 'erp/', deployment: 'separate-runtime', status: 'integration-required' }
] as const;

export function allowedAdminModules(role: string | null | undefined) {
  return adminModules.filter(module => module.roles.some(allowedRole => allowedRole === role));
}

export function allowedAdminSections(role: string | null | undefined): AdminSection[] {
  const modules = allowedAdminModules(role);
  return modules.length ? ['overview', ...modules.map(module => module.id)] : [];
}

export function canAccessAdminModule(role: string | null | undefined, id: string | null | undefined): boolean {
  return typeof id === 'string' && allowedAdminModules(role).some(module => module.id === id);
}

export function resolveAdminSection(
  role: string | null | undefined,
  requested: string | null | undefined
): AdminSection {
  const candidate = allowedAdminSections(role).find(id => id === requested);
  return candidate ?? 'overview';
}
