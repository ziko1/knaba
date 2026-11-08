import type {PublicLocale} from './public-i18n';
import type {RequestStatus} from './portal-contract';
import type {InquiryData} from './inquiry';

/** Public receipt fields only; never expose ERP errors, effect IDs or credentials. */
export type AssistantTransferStatus='PENDING'|'LEASED'|'APPLIED'|'REVIEW'|'BLOCKED'|'UNKNOWN'|'NOT_QUEUED';
export type AssistantRequestSummary={
  id:string;status:RequestStatus;version:number;createdAt:string;
  erpTransfer:{status:AssistantTransferStatus};
};
export type AssistantRequestPage={limit:20;total:number;nextCursor:string|null};
export type AssistantRequestContext={
  conversation:{id:string;locale:PublicLocale;status:'assistant'|'human'|'closed';contactName:string;contactEmail:string;contactPhone:string};
  requests:AssistantRequestSummary[];requestPage:AssistantRequestPage;
};
export type AssistantRequestSubmission=InquiryData & {idempotencyKey:string;privacyAccepted:true;website:string;transferAccepted:true};
export type AssistantRequestResult={conversationId:string;request:AssistantRequestSummary};
export type AssistantRequestReceipt=AssistantRequestResult & {id:string;received:true};

/** Keep a stable loaded window without replacing a newer local status by an older page. */
export function mergeAssistantRequests(items:AssistantRequestSummary[]):AssistantRequestSummary[]{
  const result=new Map<string,AssistantRequestSummary>();
  for(const item of items){const old=result.get(item.id);if(!old||old.version<=item.version)result.set(item.id,item);}
  return [...result.values()];
}
