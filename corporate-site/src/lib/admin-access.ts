/** Client navigation only. Every business permission is enforced by the real APIs. */
import { mountedAdminModuleIdsForRole } from './admin-module-registry';

export const adminSectionIds = ['overview', 'operations', 'crm', 'messages', 'studio'] as const;
export type AdminSection = (typeof adminSectionIds)[number];

export function allowedAdminSections(role: string | null | undefined): AdminSection[] {
  const mounted = mountedAdminModuleIdsForRole(role);
  return mounted.length ? ['overview', ...mounted] : [];
}

export function resolveAdminSection(role: string | null | undefined, requested: string | null | undefined): AdminSection {
  const allowed = allowedAdminSections(role);
  return requested && allowed.includes(requested as AdminSection) ? requested as AdminSection : 'overview';
}
