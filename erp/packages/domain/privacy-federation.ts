import {z} from 'zod';
import {assert,type Actor,type Transaction} from './core.ts';

export const PRIVACY_FEDERATION_RECORD_LIMIT=25_000;
export const PRIVACY_FEDERATION_VERSION='knaba-federation-self-metadata-v1';
const text=z.string().min(1).max(256).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const issuer=z.string().max(512).refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password&&!url.search&&!url.hash&&!/[\u0000-\u0020\u007f]/.test(value);}catch{return false;}});
const uuid=z.string().uuid(),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const date=z.union([z.date(),z.string().datetime({offset:true})]).transform(v=>new Date(v).toISOString());
const owner={companyId:text,userId:text};
const client={clientId:text,clientKind:z.enum(['WEB','NATIVE']),platform:z.enum(['WEB','ANDROID','IOS']),clientLabel:z.string().min(1).max(120)};
const rows=z.discriminatedUnion('kind',[
 z.object({...owner,kind:z.literal('BINDING'),bindingId:uuid,sourceIssuer:issuer,sourceSubject:text,storedStatus:z.enum(['ACTIVE','REVOKED']),version:positive,createdAt:date,expiresAt:date.nullable(),revokedAt:date.nullable()}).strict(),
 z.object({...owner,kind:z.literal('LINK_ATTEMPT'),attemptId:uuid,authorityId:text,storedState:z.enum(['ISSUED','CLAIMED','CONFIRMED','CANCELLED','EXPIRED']),createdAt:date,expiresAt:date,bindingId:uuid.nullable(),lineageValid:z.literal(true)}).strict(),
 z.object({...owner,kind:z.literal('PRINCIPAL'),bindingId:uuid,authorityId:text,storedState:z.enum(['ACTIVE','FENCED']),updatedAt:date}).strict(),
 z.object({...owner,kind:z.literal('SOURCE_SESSION'),bindingId:uuid,authorityId:text,storedState:z.enum(['ACTIVE','REVOKED']),expiresAt:date.nullable(),updatedAt:date}).strict(),
 z.object({...owner,...client,kind:z.literal('LOGIN_ATTEMPT'),requestId:uuid,bindingId:uuid,storedState:z.enum(['SOURCE_APPROVED','CODE_ISSUED','COMPLETE','CANCELLED','EXPIRED','DENIED']),version:positive,createdAt:date,expiresAt:date,lineageValid:z.literal(true)}).strict(),
 z.object({...owner,...client,kind:z.literal('DERIVED_SESSION'),childSessionId:uuid,requestId:uuid,bindingId:uuid,storedState:z.enum(['ACTIVE','REVOKED']),createdAt:date,expiresAt:date,revokedAt:date.nullable(),parentExpiresAt:date,parentRevokedAt:date.nullable(),lineageValid:z.literal(true)}).strict()
]);
type Row=z.infer<typeof rows>;
export type PrivacyFederationRowLoader=(tx:Transaction,actor:Actor,now:string)=>Promise<unknown[]>;
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
function valid(condition:unknown):asserts condition {assert(condition,'INVALID_STATE',{reason:'PRIVACY_FEDERATION_METADATA_INVALID'});}
const counts=()=>({activeUnexpired:0,activeExpired:0,revokedUnexpired:0,revokedExpired:0,revokedUnknownExpiry:0});
type Summary={bindingId:string;authorityId:string;storedPrincipalState:'ACTIVE'|'FENCED'|null;principalUpdatedAt:string|null;sessionCounts:ReturnType<typeof counts>};

/** Historical stored facts only. Neither ACTIVE nor an expiry count proves live source authority. */
export function projectPrivacyFederationMetadata(actor:Actor,capturedAt:string,input:unknown[]){
 valid(date.safeParse(capturedAt).success&&Array.isArray(input));
 assert(input.length<=PRIVACY_FEDERATION_RECORD_LIMIT,'INVALID_STATE',{reason:'PRIVACY_FEDERATION_RECORD_LIMIT_EXCEEDED'});
 const parsed:Row[]=input.map(value=>{const result=rows.safeParse(value);valid(result.success);const row=result.data;valid(row.companyId===actor.companyId&&row.userId===actor.userId);return row;});
 const bindings:Array<{bindingId:string;sourceIssuer:string;sourceSubject:string;storedStatus:string;version:number;createdAt:string;expiresAt:string|null;revokedAt:string|null}>=[];
 const linkAttempts:Array<{attemptId:string;authorityId:string;storedState:string;createdAt:string;expiresAt:string;bindingId?:string}>=[];
 const loginAttempts:Array<{requestId:string;bindingId:string;storedState:string;version:number;createdAt:string;expiresAt:string;clientId:string;clientKind:string;platform:string;clientLabel:string}>=[];
 const derivedSessions:Array<{childSessionId:string;requestId:string;bindingId:string;storedState:string;createdAt:string;expiresAt:string;revokedAt:string|null;parentExpiresAt:string;parentRevokedAt:string|null;clientId:string;clientKind:string;platform:string;clientLabel:string}>=[];
 const summaries=new Map<string,Summary>(),seen=new Set<string>(),recordCounts={BINDING:0,LINK_ATTEMPT:0,PRINCIPAL:0,SOURCE_SESSION:0,LOGIN_ATTEMPT:0,DERIVED_SESSION:0};
 function unique(kind:string,key:string){const value=JSON.stringify([kind,key]);valid(!seen.has(value));seen.add(value);}
 function summary(bindingId:string,authorityId:string){const key=JSON.stringify([bindingId,authorityId]);let value=summaries.get(key);if(!value){value={bindingId,authorityId,storedPrincipalState:null,principalUpdatedAt:null,sessionCounts:counts()};summaries.set(key,value);}return value;}
 for(const row of parsed){
  recordCounts[row.kind]++;
  if(row.kind==='BINDING'){
   unique(row.kind,row.bindingId);valid((row.storedStatus==='REVOKED')===(row.revokedAt!==null));
   bindings.push({bindingId:row.bindingId,sourceIssuer:row.sourceIssuer,sourceSubject:row.sourceSubject,storedStatus:row.storedStatus,version:row.version,createdAt:row.createdAt,expiresAt:row.expiresAt,revokedAt:row.revokedAt});
  }else if(row.kind==='LINK_ATTEMPT'){
   unique(row.kind,row.attemptId);valid((row.storedState==='CONFIRMED')===(row.bindingId!==null));
   linkAttempts.push({attemptId:row.attemptId,authorityId:row.authorityId,storedState:row.storedState,createdAt:row.createdAt,expiresAt:row.expiresAt,...(row.bindingId!==null?{bindingId:row.bindingId}:{})});
  }else if(row.kind==='PRINCIPAL'){
   unique(row.kind,JSON.stringify([row.bindingId,row.authorityId]));const s=summary(row.bindingId,row.authorityId);s.storedPrincipalState=row.storedState;s.principalUpdatedAt=row.updatedAt;
  }else if(row.kind==='SOURCE_SESSION'){
   valid(row.storedState!=='ACTIVE'||row.expiresAt!==null);const c=summary(row.bindingId,row.authorityId).sessionCounts;
   if(row.expiresAt===null)c.revokedUnknownExpiry++;
   else {const unexpired=Date.parse(row.expiresAt)>Date.parse(capturedAt);if(row.storedState==='ACTIVE')unexpired?c.activeUnexpired++:c.activeExpired++;else unexpired?c.revokedUnexpired++:c.revokedExpired++;}
  }else if(row.kind==='LOGIN_ATTEMPT'){
   unique(row.kind,row.requestId);valid((row.clientKind==='WEB')===(row.platform==='WEB'));
   loginAttempts.push({requestId:row.requestId,bindingId:row.bindingId,storedState:row.storedState,version:row.version,createdAt:row.createdAt,expiresAt:row.expiresAt,clientId:row.clientId,clientKind:row.clientKind,platform:row.platform,clientLabel:row.clientLabel});
  }else{
   unique(row.kind,row.childSessionId);valid((row.storedState==='REVOKED')===(row.revokedAt!==null));valid((row.clientKind==='WEB')===(row.platform==='WEB'));
   derivedSessions.push({childSessionId:row.childSessionId,requestId:row.requestId,bindingId:row.bindingId,storedState:row.storedState,createdAt:row.createdAt,expiresAt:row.expiresAt,revokedAt:row.revokedAt,parentExpiresAt:row.parentExpiresAt,parentRevokedAt:row.parentRevokedAt,clientId:row.clientId,clientKind:row.clientKind,platform:row.platform,clientLabel:row.clientLabel});
  }
 }
 const bindingIds=new Set(bindings.map(row=>row.bindingId));
 for(const row of [...linkAttempts,...loginAttempts,...derivedSessions,...summaries.values()])if(row.bindingId)valid(bindingIds.has(row.bindingId));
 const disposition=(recordClass:string,recordCount:number,technicalReason:string)=>({recordClass,recordCount,disposition:'PRESERVE_PENDING_APPROVED_METADATA_CLASS' as const,deletionEligible:false as const,deletionExecuted:false as const,technicalReason});
 return {version:PRIVACY_FEDERATION_VERSION,capturedAt:new Date(capturedAt).toISOString(),scope:'ERP_STORED_METADATA' as const,
  bindings:bindings.sort((a,b)=>order(a.bindingId,b.bindingId)),linkAttempts:linkAttempts.sort((a,b)=>order(a.attemptId,b.attemptId)),
  loginAttempts:loginAttempts.sort((a,b)=>order(a.requestId,b.requestId)),derivedSessions:derivedSessions.sort((a,b)=>order(a.childSessionId,b.childSessionId)),
  sourceSessionSummary:[...summaries.values()].sort((a,b)=>order(a.bindingId,b.bindingId)||order(a.authorityId,b.authorityId)),
  retentionDispositions:[disposition('IDENTITY_BINDING',recordCounts.BINDING,'TERMINAL_BINDING'),disposition('LINK_ATTEMPT',recordCounts.LINK_ATTEMPT,'APPROVAL_RECOVERY'),disposition('SOURCE_PRINCIPAL',recordCounts.PRINCIPAL,'REVOCATION_HIGH_WATER'),disposition('SOURCE_SESSION',recordCounts.SOURCE_SESSION,'SESSION_TOMBSTONE'),disposition('LOGIN_ATTEMPT',recordCounts.LOGIN_ATTEMPT,'APPROVAL_RECOVERY'),disposition('DERIVED_SESSION',recordCounts.DERIVED_SESSION,'MANDATORY_SESSION_LINEAGE'),disposition('PRIVACY_EXPORT',1,'DERIVED_PRIVACY_EXPORT')]
 };
}
