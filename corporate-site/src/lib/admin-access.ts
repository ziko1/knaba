/** Client navigation only. All business permissions are enforced by the existing APIs. */
export const adminSectionIds = ['overview', 'operations', 'crm', 'messages', 'studio'] as const;
export type AdminSection = (typeof adminSectionIds)[number];

const ownerSections: readonly AdminSection[] = adminSectionIds;
const managerSections: readonly AdminSection[] = ['overview', 'operations', 'crm'];

export function allowedAdminSections(role: string | null | undefined): AdminSection[] {
  if (role === 'owner') return [...ownerSections];
  if (role === 'admin') return [...managerSections];
  return [];
}

export function resolveAdminSection(role: string | null | undefined, requested: string | null | undefined): AdminSection {
  const allowed = allowedAdminSections(role);
  return requested && allowed.includes(requested as AdminSection) ? requested as AdminSection : 'overview';
}
