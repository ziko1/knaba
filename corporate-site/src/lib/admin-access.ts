/**
 * Stable compatibility facade. Keep existing consumers importing admin-access;
 * module composition and access-to-navigation metadata live in one manifest.
 */
export {
  adminModules, adminSectionIds, pendingIntegrations, allowedAdminModules,
  allowedAdminSections, canAccessAdminModule, resolveAdminSection
} from './admin-modules';
export type { AdminModuleContract, AdminModuleId, AdminSection, AdminArea, ManagementRole } from './admin-modules';
