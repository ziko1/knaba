/** Shared wire contract. Authorization is always enforced by the Worker. */
export const portalHeader = { "X-KnaBa-Request": "portal-v1" } as const;
export const approvedRoles = ["client", "worker", "admin"] as const;
export type ApprovedRole = (typeof approvedRoles)[number];
export type PortalRole = ApprovedRole | "owner" | "anonymous" | "pending" | "suspended";
export const requestStatuses = ["new", "reviewing", "scheduled", "in_progress", "completed", "cancelled"] as const;
export type RequestStatus = (typeof requestStatuses)[number];
export const checklistItems = ["access_checked", "surfaces_cleaned", "quality_checked", "reported"] as const;
export type ChecklistItem = (typeof checklistItems)[number];
export interface PortalUser { id: string; email: string; name: string }
export interface PortalProfile {
  id: string; name: string; email: string; requestedRole: "client" | "worker";
  role: ApprovedRole | null; status: "pending" | "approved" | "suspended";
  createdAt: string; updatedAt: string; version: number;
}
export interface PortalSession { user: PortalUser | null; profile: PortalProfile | null; role: PortalRole }
export interface CleaningRequest {
  id: string; clientId: string | null; service: string; objectType: string;
  postcode: string; area: string; frequency: string; message: string;
  contactName: string; email?: string; phone?: string; address: string;
  status: RequestStatus; assignedWorkerId: string | null; scheduledAt: string | null;
  checklist: ChecklistItem[]; workerNote?: string; customerFeedback: string; adminReply: string;
  createdAt: string; updatedAt: string; version: number;
}
export interface AuditEvent { id: string; actorId: string; action: string; entityId: string; createdAt: string }
export interface PortalDashboard {
  session: PortalSession; requests: CleaningRequest[];
  /** Owner sees all profiles; admin sees only approved workers for assignment. */
  profiles: PortalProfile[]; audit: AuditEvent[];
  limited: boolean;
}
export interface RegistrationInput { name: string; requestedRole: "client" | "worker"; privacyAccepted: true }
export interface CleaningRequestInput {
  service: string; objectType: string; postcode: string; area: string; frequency: string;
  message: string; address?: string; idempotencyKey: string; privacyAccepted: true;
}
export interface LeadInput extends CleaningRequestInput { name: string; email: string; phone: string; website?: string }
export interface RequestPatch {
  version: number; status?: RequestStatus; assignedWorkerId?: string | null;
  scheduledAt?: string | null; checklist?: ChecklistItem[]; workerNote?: string;
  customerFeedback?: string; adminReply?: string;
}
export interface RoleInput { userId: string; role: ApprovedRole | null; status: "approved" | "suspended"; version: number }
export interface ApiError { error: { code: string; message: string; fields?: Record<string, string> } }
/** GET session; POST register; GET dashboard; POST requests; PATCH requests/:id;
 * POST roles; POST /api/leads. Successful mutations return {profile}, {request},
 * or for public leads {id,received:true}. Replays return the same record.
 * Request mutations require JSON, matching Origin and portalHeader.
 * Errors: 400/422 invalid, 401 login, 403 permission, 404 hidden/not found,
 * 409 version conflict, 413 size, 429 rate limit, 503 storage unavailable.
 */
