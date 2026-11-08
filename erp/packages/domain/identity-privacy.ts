import {z} from 'zod';
import {assert,type Transaction} from './core.ts';

// Match the existing bounded privacy planning inventory. Overflow is an explicit
// failure, never a successful export containing an undisclosed truncated history.
export const IDENTITY_PRIVACY_MAX_RECORDS=25_000;
export interface IdentityPrivacyScope {readonly companyId:string;readonly subjectUserId:string;}
export type IdentityPrivacyReader=(tx:Transaction,scope:IdentityPrivacyScope)=>Promise<unknown>;

const instant=z.string().refine(value=>{
 const time=Date.parse(value);
 return Number.isFinite(time)&&new Date(time).toISOString()===value;
},'Canonical UTC instant required');
const entityId=z.string().uuid();
const count=z.number().int().positive().max(2_147_483_647);
const binding=z.object({
 id:entityId,issuer:z.string().min(1).max(512),audience:z.string().min(1).max(256),subject:z.string().min(1).max(256),
 status:z.enum(['ACTIVE','REVOKED']),version:count,generation:count,
 createdAt:instant,expiresAt:instant.nullable(),revokedAt:instant.nullable()
}).strict();
const session=z.object({id:entityId,bindingId:entityId,createdAt:instant,expiresAt:instant,revokedAt:instant.nullable()}).strict();
const challenge=z.object({
 id:entityId,status:z.enum(['OPEN','PREVIEWED','CONSUMED','CANCELLED']),
 createdAt:instant,expiresAt:instant,completedAt:instant.nullable()
}).strict();
const snapshot=z.object({
 companyId:z.string().min(1).max(128),subjectUserId:z.string().min(1).max(128),
 bindings:z.array(binding).max(IDENTITY_PRIVACY_MAX_RECORDS),
 sessions:z.array(session).max(IDENTITY_PRIVACY_MAX_RECORDS),
 challenges:z.array(challenge).max(IDENTITY_PRIVACY_MAX_RECORDS)
}).strict();
export type IdentityPrivacySnapshot=z.infer<typeof snapshot>;

/** A versioned self-data projection, not an authentication or deletion decision.
 * The persistence reader must select only this subject's rows. This second
 * boundary rejects extra fields, inconsistent lineage and malformed snapshots.
 */
export function identityPrivacySnapshot(value:unknown,scope:IdentityPrivacyScope):IdentityPrivacySnapshot {
 const collections=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const lists=['bindings','sessions','challenges'].map(name=>collections[name]);
 assert(lists.every(Array.isArray),'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_METADATA_INVALID'});
 assert(lists.reduce((total,list)=>total+(list as unknown[]).length,0)<=IDENTITY_PRIVACY_MAX_RECORDS,
  'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_SNAPSHOT_LIMIT'});
 const parsed=snapshot.safeParse(value);
 assert(parsed.success,'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_METADATA_INVALID'});
 const data=parsed.data;
 assert(data.companyId===scope.companyId&&data.subjectUserId===scope.subjectUserId,'ACCESS_DENIED');
 for(const rows of [data.bindings,data.sessions,data.challenges]){
  assert(new Set(rows.map(row=>row.id)).size===rows.length,'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_DUPLICATE_ID'});
  rows.sort((a,b)=>a.createdAt<b.createdAt?-1:a.createdAt>b.createdAt?1:a.id<b.id?-1:a.id>b.id?1:0);
 }
 const ownBindings=new Set(data.bindings.map(row=>row.id));
 const after=(value:string|null,start:string)=>value===null||Date.parse(value)>=Date.parse(start);
 assert(data.bindings.every(row=>(row.expiresAt===null||Date.parse(row.expiresAt)>Date.parse(row.createdAt))&&
  after(row.revokedAt,row.createdAt)&&((row.status==='ACTIVE')===(row.revokedAt===null))),
  'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_METADATA_INVALID'});
 assert(data.sessions.every(row=>ownBindings.has(row.bindingId)&&Date.parse(row.expiresAt)>Date.parse(row.createdAt)&&after(row.revokedAt,row.createdAt)),
  'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_SESSION_LINEAGE_INVALID'});
 assert(data.challenges.every(row=>Date.parse(row.expiresAt)>Date.parse(row.createdAt)&&
  (row.status==='CONSUMED'?row.completedAt!==null&&after(row.completedAt,row.createdAt)&&Date.parse(row.completedAt)<Date.parse(row.expiresAt):row.completedAt===null)),
  'VALIDATION_ERROR',{reason:'IDENTITY_PRIVACY_METADATA_INVALID'});
 return data;
}
