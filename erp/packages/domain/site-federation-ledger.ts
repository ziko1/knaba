import {z} from 'zod';
import {assert} from './core.ts';

export const federationSubject=z.string().min(1).max(128).refine(value=>new TextEncoder().encode(value).length<=128&&!/[\u0000-\u0020\u007f]/.test(value));
export const federationRef=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const federationHash=z.string().regex(/^[a-f0-9]{64}$/);
export const federationEpoch=z.number().int().min(1).max(2_147_483_647);
export const federationUuid=z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
export const federationInstant=z.string().refine(value=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value);
export const sourceSessionSchema=z.object({subject:federationSubject,sessionRef:federationRef,epoch:federationEpoch,securityFingerprint:federationHash,sessionExpiresAt:federationInstant,sourcePolicyVersion:federationEpoch}).strict();
export const sourceReferenceSchema=sourceSessionSchema.omit({sessionExpiresAt:true});
export const fenceSchema=z.discriminatedUnion('scope',[
  z.object({subject:federationSubject,scope:z.literal('SESSION'),sessionRefs:z.array(federationRef).min(1).max(256).refine(value=>new Set(value).size===value.length),intentHash:federationHash}).strict(),
  z.object({subject:federationSubject,scope:z.literal('PRINCIPAL'),throughEpoch:federationEpoch,nextEpoch:federationEpoch,intentHash:federationHash}).strict()
]).refine(value=>value.scope!=='PRINCIPAL'||value.nextEpoch===value.throughEpoch+1);
export const activateEpochSchema=z.object({subject:federationSubject,epoch:federationEpoch,securityFingerprint:federationHash,fenceOperationId:federationUuid,sourcePolicyVersion:federationEpoch}).strict();
export type SourceSession=z.infer<typeof sourceSessionSchema>;
export type SourceReference=z.infer<typeof sourceReferenceSchema>;
export interface FederationPrincipal {
  subject:string;epoch:number;minimumEpoch:number;state:'ACTIVE'|'FENCED';securityFingerprint:string|null;
  sourcePolicyVersion:number;version:number;fenceOperationId:string|null;
}
export interface FederationSourceSession {
  subject:string;sessionRef:string;epoch:number|null;securityFingerprint:string|null;
  expiresAt:string|null;state:'ACTIVE'|'REVOKED';version:number;
}
const deny=()=>assert(false,'ACCESS_DENIED',{reason:'FEDERATION_AUTHORITY_REQUIRED'});
export function registerSourceSession(principal:FederationPrincipal|undefined,previous:FederationSourceSession|undefined,input:SourceSession,policyVersion:number,now:string){
  assert(Number.isFinite(Date.parse(now))&&Date.parse(input.sessionExpiresAt)>Date.parse(now)&&Date.parse(input.sessionExpiresAt)<=Date.parse(now)+86_400_000,'EXPIRED');
  assert(input.sourcePolicyVersion===policyVersion,'ACCESS_DENIED');
  if(previous&&(previous.state!=='ACTIVE'||previous.subject!==input.subject||previous.epoch!==input.epoch||previous.securityFingerprint!==input.securityFingerprint||previous.expiresAt!==input.sessionExpiresAt))deny();
  if(!principal)assert(input.epoch===1,'ACCESS_DENIED');
  else if(principal.subject!==input.subject||principal.state!=='ACTIVE'||principal.epoch!==input.epoch||principal.minimumEpoch>input.epoch||principal.securityFingerprint!==input.securityFingerprint||principal.sourcePolicyVersion!==policyVersion)deny();
  const current: FederationPrincipal=principal??{subject:input.subject,epoch:1,minimumEpoch:1,state:'ACTIVE',securityFingerprint:input.securityFingerprint,sourcePolicyVersion:policyVersion,version:1,fenceOperationId:null};
  const session: FederationSourceSession=previous??{subject:input.subject,sessionRef:input.sessionRef,epoch:input.epoch,securityFingerprint:input.securityFingerprint,expiresAt:input.sessionExpiresAt,state:'ACTIVE',version:1};
  return {principal:current,session,changed:!principal||!previous};
}
export function fenceSourcePrincipal(previous:FederationPrincipal|undefined,input:Extract<z.infer<typeof fenceSchema>,{scope:'PRINCIPAL'}>,operationId:string,policyVersion:number):FederationPrincipal {
  assert(input.nextEpoch===input.throughEpoch+1,'VALIDATION_ERROR');
  if(previous){assert(previous.subject===input.subject,'ACCESS_DENIED');if(previous.minimumEpoch>=input.nextEpoch)return previous;}
  const epoch=previous?.epoch??0;
  return {subject:input.subject,epoch,minimumEpoch:input.nextEpoch,state:epoch>=input.nextEpoch?'ACTIVE':'FENCED',securityFingerprint:previous?.securityFingerprint??null,sourcePolicyVersion:previous?.sourcePolicyVersion??policyVersion,version:(previous?.version??0)+1,fenceOperationId:operationId};
}
export function fenceSourceSession(previous:FederationSourceSession|undefined,subject:string,sessionRef:string):FederationSourceSession {
  if(previous){assert(previous.subject===subject&&previous.sessionRef===sessionRef,'ACCESS_DENIED');if(previous.state==='REVOKED')return previous;}
  return {subject,sessionRef,epoch:previous?.epoch??null,securityFingerprint:previous?.securityFingerprint??null,expiresAt:previous?.expiresAt??null,state:'REVOKED',version:(previous?.version??0)+1};
}
export function activateSourceEpoch(previous:FederationPrincipal|undefined,input:z.infer<typeof activateEpochSchema>,policyVersion:number):FederationPrincipal {
  assert(previous&&previous.subject===input.subject&&previous.state==='FENCED'&&previous.minimumEpoch===input.epoch&&previous.fenceOperationId===input.fenceOperationId&&input.sourcePolicyVersion===policyVersion,'ACCESS_DENIED');
  return {...previous,epoch:input.epoch,state:'ACTIVE',securityFingerprint:input.securityFingerprint,sourcePolicyVersion:policyVersion,version:previous.version+1};
}
export function assertCurrentSourceSession(principal:FederationPrincipal|undefined,session:FederationSourceSession|undefined,input:SourceReference,policyVersion:number,now:string):asserts session is FederationSourceSession {
  assert(principal&&session&&principal.state==='ACTIVE'&&session.state==='ACTIVE'&&principal.subject===input.subject&&session.subject===input.subject&&session.sessionRef===input.sessionRef&&principal.epoch===input.epoch&&session.epoch===input.epoch&&principal.minimumEpoch<=input.epoch&&principal.securityFingerprint===input.securityFingerprint&&session.securityFingerprint===input.securityFingerprint&&principal.sourcePolicyVersion===policyVersion&&input.sourcePolicyVersion===policyVersion&&session.expiresAt!==null&&Number.isFinite(Date.parse(now))&&Date.parse(session.expiresAt)>Date.parse(now),'NEEDS_REAUTH');
}
