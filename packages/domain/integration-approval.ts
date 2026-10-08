import {assert,type Transaction} from './core.ts';
import {validateIntegrationWebhookUrl} from '../integrations/outbound-webhook.ts';
export const INTEGRATION_OUTBOUND_FIELDS=['id','status','review_state','language'] as const;
/** A URL or arbitrary prose is not an approval. Require current recorded legal scope. */
export async function validateIntegrationOutboundApproval(tx:Transaction,source:string,outbound:{url:string;approvalReference:string},now:string){
 const approval=await tx.get('legal_approval',outbound.approvalReference),profile=approval.data.scope?.integrationOutbound;
 const nowMs=Date.parse(now),endpoint=validateIntegrationWebhookUrl(outbound.url).href;
 assert(approval.companyId===(tx as any).companyId&&approval.data.status==='APPROVED'&&approval.data.active!==false&&approval.data.subject==='PRIVACY'&&Number.isFinite(nowMs)&&Date.parse(approval.data.approvedAt)<=nowMs&&Date.parse(approval.data.expiresAt)>nowMs&&typeof approval.data.evidenceReference==='string'&&approval.data.evidenceReference.length>=8&&approval.data.approvalType==='RECORDED_EXTERNAL_REVIEW','NEEDS_APPROVAL',{reason:'INTEGRATION_PRIVACY_APPROVAL_REQUIRED'});
 assert(profile&&Array.isArray(profile.sources)&&profile.sources.includes(source)&&Array.isArray(profile.endpoints)&&profile.endpoints.includes(endpoint)&&Array.isArray(profile.allowedFields)&&INTEGRATION_OUTBOUND_FIELDS.every(field=>profile.allowedFields.includes(field))&&Array.isArray(profile.allowedEventTypes)&&profile.allowedEventTypes.includes('lead.status'),'NEEDS_APPROVAL',{reason:'INTEGRATION_PRIVACY_SCOPE_MISMATCH'});
 return approval;
}
