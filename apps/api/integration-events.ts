import type {Database} from './database.ts';
import {assert,DomainError} from '../../packages/domain/core.ts';
import {applyIntegrationEnvelope,integrationEnvelopeSchema,type IntegrationAcceptance} from '../../packages/domain/integrations.ts';
import {parseSignedIntegrationJson,selectIntegrationCredential,verifyIntegrationEventSignature,type IntegrationCredential} from '../../packages/integrations/generic-events.ts';

export interface IntegrationEventHeaders{keyId:unknown;timestamp:unknown;signature:unknown;}
/** Dedicated route adapter. Caller returns 2xx only after the awaited transaction commits. */
export async function acceptIntegrationEvent(db:Pick<Database,'transaction'>,credentials:IntegrationCredential[],source:string,rawBody:unknown,headers:IntegrationEventHeaders,nowMs=Date.now()):Promise<IntegrationAcceptance>{
 const credential=selectIntegrationCredential(credentials,source,headers.keyId,nowMs);
 assert(verifyIntegrationEventSignature(rawBody,headers.timestamp,headers.signature,credential.secret,nowMs),'ACCESS_DENIED');
 const parsed=integrationEnvelopeSchema.safeParse(parseSignedIntegrationJson(rawBody as Uint8Array));assert(parsed.success,'VALIDATION_ERROR',{reason:'INVALID_INTEGRATION_ENVELOPE'});
 assert(parsed.data.source===source,'VALIDATION_ERROR',{reason:'INTEGRATION_SOURCE_MISMATCH'});
 return db.transaction(credential.companyId,'INTEGRATION_INBOX',async tx=>{
  const configs=(await tx.list('integration_config')).filter(row=>row.data.source===source&&row.data.status==='ACTIVE');
  assert(configs.length===1,'NEEDS_APPROVAL',{reason:configs.length?'AMBIGUOUS_INTEGRATION_MAPPING':'INTEGRATION_INACTIVE'});
  return applyIntegrationEnvelope(tx,configs[0]!,parsed.data,credential.keyId,new Date(nowMs).toISOString());
 });
}
export function integrationEventError(error:unknown):{status:number;body:{code:string;details?:Record<string,unknown>}}{
 if(error instanceof DomainError){const status=error.code==='ACCESS_DENIED'?401:error.code==='VALIDATION_ERROR'?400:error.code==='NEEDS_APPROVAL'?409:503;return {status,body:{code:error.code,...status===409?{details:{reason:error.details.reason}}:{}}};}
 return {status:503,body:{code:'DEPENDENCY_UNAVAILABLE'}};
}
