/** Sanitized DTOs only. Credentials and raw transport responses never cross this boundary. */
export type ErpLeadState = 'DRAFT'|'QUEUED'|'SENDING'|'RETRY'|'APPLIED'|'QUARANTINED'|'BLOCKED'|'CANCELLED'|'UNKNOWN';
export type ErpService = {id:string;label:Record<'de'|'en'|'uk'|'ru',string>};
export type ErpPublicConfig = {enabled:boolean;services:ErpService[]};
export type ErpLeadInput = {name:string;email:string;phone:string;serviceId:string;condition:string;desiredPeriod:string};
export type ErpLeadView = {
  state:ErpLeadState;version:number;previewHash:string;preview:ErpLeadInput;
  expiresAt:number;updatedAt:number;cancelRequested:boolean;
};
export type ErpLeadErrorCode = 'lease_expired'|'approval_or_scope_changed'|'authority_changed_before_send'|'transport_unknown'|'invalid_receipt'|'provider_transient'|'provider_rejected'|'cancel_raced_transport';
export type ErpLeadReceipt =
  | {status:'APPLIED';duplicate:boolean;effectId:string}
  | {status:'QUARANTINED';duplicate:boolean;quarantineId:string};
/** Included only in authenticated owner thread responses, never guest responses. */
export type ErpLeadDiagnostics = {
  state:ErpLeadState;eventId:string;attempts:number;lastError:ErpLeadErrorCode|null;receipt:ErpLeadReceipt|null;
};
