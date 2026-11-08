import {z} from 'zod';
import {assert,DomainError} from '../../packages/domain/core.ts';
import {activateEpochSchema,activateSourceEpoch,assertCurrentSourceSession,federationEpoch,federationRef,federationSubject,federationUuid,fenceSchema,fenceSourcePrincipal,fenceSourceSession,registerSourceSession,sourceReferenceSchema,sourceSessionSchema,type FederationPrincipal,type FederationSourceSession,type SourceReference} from '../../packages/domain/site-federation-ledger.ts';
import {authorityFingerprint,isVerifiedFederationRequest,type FederationAuthority,type VerifiedFederationRequest} from '../../packages/integrations/site-federation-protocol.mjs';
import {sql,type DatabaseLike,type SqlTransaction} from './auth.ts';
import {FederationAuthorities} from './site-federation-config.ts';

export interface FederationCurrent {generation:number;revision:number;phase:'ACTIVE'|'RECONCILING';policyVersion:number}
export interface FederationReceipt {operationId:string;action:string;generation:number;revision:number;result:Record<string,unknown>}
export type FederationResult={ok:true;receipt:FederationReceipt;current:FederationCurrent}|{ok:false;error:{code:string};current?:FederationCurrent};
type AuthorityRow={company_id:string;authority_id:string;issuer:string;audience:string;config_fingerprint:string;policy_version:number;generation:number;revision:string|number;phase:'ACTIVE'|'RECONCILING';instance_id:string;reconcile_cursor:string|null;reconciled_revision:string|number|null};
type ActionHandler=(tx:SqlTransaction,request:VerifiedFederationRequest,config:FederationAuthority,current:FederationCurrent)=>Promise<Record<string,unknown>>;
const current=(row:AuthorityRow):FederationCurrent=>({generation:row.generation,revision:Number(row.revision),phase:row.phase,policyVersion:row.policy_version});
const principal=(r:any):FederationPrincipal|undefined=>r?{subject:r.subject,epoch:r.epoch,minimumEpoch:r.minimum_epoch,state:r.state,securityFingerprint:r.security_fingerprint,sourcePolicyVersion:r.source_policy_version,version:r.version,fenceOperationId:r.fence_operation_id}:undefined;
const session=(r:any):FederationSourceSession|undefined=>r?{subject:r.subject,sessionRef:r.session_ref,epoch:r.epoch,securityFingerprint:r.security_fingerprint,expiresAt:r.expires_at?new Date(r.expires_at).toISOString():null,state:r.state,version:r.version}:undefined;
const cursorSchema=z.object({kind:z.enum(['PRINCIPAL','SESSION']),key:z.string().min(1).max(256),generation:federationEpoch,revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict();
const safeCode=(error:unknown)=>error instanceof DomainError?error.code:error instanceof z.ZodError?'VALIDATION_ERROR':undefined;

/** PostgreSQL is the revocation serialization point. No callback may do I/O. */
export class SiteFederationLedger {
 constructor(private readonly db:DatabaseLike,private readonly authorities:()=>FederationAuthorities){}
 private async authorityIn(tx:SqlTransaction,config:FederationAuthority){assert('companyId' in tx&&tx.companyId===config.companyId,'ACCESS_DENIED');return (await sql(tx,'SELECT * FROM site_federation_authorities WHERE company_id=$1 AND authority_id=$2',[config.companyId,config.authorityId])).rows[0] as AuthorityRow|undefined;}
 private configCurrent(config:FederationAuthority){return this.authorities().require(config.authorityId,authorityFingerprint(config));}
 private async clock(tx:SqlTransaction){return new Date((await sql(tx,'SELECT clock_timestamp() AS now')).rows[0].now).toISOString();}
 private async principalIn(tx:SqlTransaction,config:FederationAuthority,subject:string){return principal((await sql(tx,'SELECT * FROM site_federation_principals WHERE company_id=$1 AND authority_id=$2 AND subject=$3',[config.companyId,config.authorityId,subject])).rows[0]);}
 private async sessionIn(tx:SqlTransaction,config:FederationAuthority,ref:string){return session((await sql(tx,'SELECT * FROM site_federation_sessions WHERE company_id=$1 AND authority_id=$2 AND session_ref=$3',[config.companyId,config.authorityId,ref])).rows[0]);}
 private async savePrincipal(tx:SqlTransaction,c:FederationAuthority,p:FederationPrincipal,previous?:FederationPrincipal){
  if(previous===p)return;
  const fields=[c.companyId,c.authorityId,p.subject,p.epoch,p.minimumEpoch,p.state,p.securityFingerprint,p.sourcePolicyVersion,p.version,p.fenceOperationId];
  if(previous)await sql(tx,`UPDATE site_federation_principals SET epoch=$4,minimum_epoch=$5,state=$6,security_fingerprint=$7,source_policy_version=$8,version=$9,fence_operation_id=$10,updated_at=clock_timestamp() WHERE company_id=$1 AND authority_id=$2 AND subject=$3`,fields);
  else await sql(tx,`INSERT INTO site_federation_principals(company_id,authority_id,subject,epoch,minimum_epoch,state,security_fingerprint,source_policy_version,version,fence_operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,fields);
 }
 private async bump(tx:SqlTransaction,c:FederationAuthority){await sql(tx,'UPDATE site_federation_authorities SET revision=revision+1,reconcile_cursor=NULL,reconciled_revision=NULL,updated_at=clock_timestamp() WHERE company_id=$1 AND authority_id=$2',[c.companyId,c.authorityId]);}
 async currentSourceIn(tx:SqlTransaction,config:FederationAuthority,generation:number,raw:SourceReference){
  const input=sourceReferenceSchema.parse(raw);this.configCurrent(config);
  const row=await this.authorityIn(tx,config);assert(row&&row.config_fingerprint===authorityFingerprint(config)&&row.generation===generation&&row.phase==='ACTIVE'&&row.policy_version===config.policyVersion,'NEEDS_REAUTH');
  const p=await this.principalIn(tx,config,input.subject),s=await this.sessionIn(tx,config,input.sessionRef);assertCurrentSourceSession(p,s,input,config.policyVersion,await this.clock(tx));
  this.configCurrent(config);return {principal:p!,session:s,current:current(row)};
 }
 async handle(request:VerifiedFederationRequest,other?:ActionHandler):Promise<FederationResult>{
  assert(isVerifiedFederationRequest(request)&&request.direction==='SITE_TO_ERP','ACCESS_DENIED');
  const candidate=this.authorities().list().find(c=>c.issuer===request.envelope.issuer&&c.companyId===request.envelope.companyId);
  assert(candidate,'ACCESS_DENIED');const config=this.authorities().require(candidate.authorityId,request.configFingerprint);
  assert(config.companyId===request.envelope.companyId,'ACCESS_DENIED');
  return this.db.transaction(config.companyId,'SITE_FEDERATION',async tx=>{
   const before=await this.authorityIn(tx,config);
   const failure=(code:string,row=before):FederationResult=>({ok:false,error:{code},...(row?{current:current(row)}:{})});
   const now=Date.parse(await this.clock(tx));
   if(now-request.issuedAt>60000||request.issuedAt-now>5000)return failure('FEDERATION_AUTH_FAILED');
   this.configCurrent(config);
   await sql(tx,'DELETE FROM site_federation_nonces WHERE company_id=$1 AND authority_id=$2 AND expires_at<clock_timestamp()',[config.companyId,config.authorityId]);
   const nonce=await sql(tx,`INSERT INTO site_federation_nonces(company_id,authority_id,nonce_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '2 minutes') ON CONFLICT DO NOTHING RETURNING nonce_hash`,[config.companyId,config.authorityId,request.nonceHash]);
   if(nonce.rows.length!==1)return failure('FEDERATION_REPLAY');
   const operation=(await sql(tx,'SELECT * FROM site_federation_operations WHERE company_id=$1 AND authority_id=$2 AND operation_id=$3',[config.companyId,config.authorityId,request.operationId])).rows[0];
   if(operation&&operation.digest!==request.operationDigest)return failure('FEDERATION_CONFLICT');
   // New login status/inspection reads must never authorize from a historical receipt.
   if(operation?.committed_at&&['LOGIN_INSPECT','LOGIN_STATUS'].includes(request.envelope.action))return failure('FEDERATION_REPLAY');
   if(operation?.committed_at){if(!before||before.config_fingerprint!==authorityFingerprint(config))return failure('FEDERATION_CONFLICT');this.configCurrent(config);return {ok:true,receipt:{operationId:request.operationId,action:operation.action,generation:operation.generation,revision:Number(operation.revision),result:operation.result},current:current(before)};}
   if(!operation)await sql(tx,'INSERT INTO site_federation_operations(company_id,authority_id,operation_id,digest,action) VALUES($1,$2,$3,$4,$5)',[config.companyId,config.authorityId,request.operationId,request.operationDigest,request.envelope.action]);
   await sql(tx,'SAVEPOINT federation_effect');
   try{
    const result=await this.dispatchIn(tx,config,request,before,other);
    this.configCurrent(config);
    const after=await this.authorityIn(tx,config);assert(after,'INVALID_STATE');
    await sql(tx,`UPDATE site_federation_operations SET generation=$4,revision=$5,result=$6,committed_at=clock_timestamp() WHERE company_id=$1 AND authority_id=$2 AND operation_id=$3`,[config.companyId,config.authorityId,request.operationId,after.generation,after.revision,JSON.stringify(result)]);
    if(!['RECONCILE_PAGE','LOOKUP_PRINCIPAL','INSPECT_CHALLENGE','LINK_STATUS','LOGIN_INSPECT','LOGIN_STATUS'].includes(request.envelope.action))await sql(tx,`INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail) VALUES($1,'SITE_FEDERATION',$2,'site_federation_authority',$3,$4)`,[config.companyId,'FEDERATION_'+request.envelope.action,config.authorityId,JSON.stringify({operationId:request.operationId,generation:after.generation,revision:Number(after.revision)})]);
    await sql(tx,'RELEASE SAVEPOINT federation_effect');
    return {ok:true,receipt:{operationId:request.operationId,action:request.envelope.action,generation:after.generation,revision:Number(after.revision),result},current:current(after)};
   }catch(error){
    const code=safeCode(error);if(!code)throw error;
    await sql(tx,'ROLLBACK TO SAVEPOINT federation_effect');await sql(tx,'RELEASE SAVEPOINT federation_effect');
    return failure(code);
   }
  },10000);
 }
 private async dispatchIn(tx:SqlTransaction,c:FederationAuthority,r:VerifiedFederationRequest,row:AuthorityRow|undefined,other?:ActionHandler):Promise<Record<string,unknown>>{
  const {action,payload}=r.envelope;
  if(action==='BOOTSTRAP_AUTHORITY'){
   const input=z.object({instanceId:federationUuid}).strict().parse(payload);
   assert(r.generation===0&&(!row||row.issuer===c.issuer&&row.audience===c.erpAudience&&c.policyVersion>=row.policy_version&&(row.config_fingerprint===authorityFingerprint(c)||c.policyVersion>row.policy_version)),'FEDERATION_CONFLICT');
   const next=(row?.generation??0)+1,revision=Number(row?.revision??0)+1;
   await sql(tx,`INSERT INTO site_federation_authorities(company_id,authority_id,issuer,audience,config_fingerprint,policy_version,generation,revision,phase,instance_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'RECONCILING',$9) ON CONFLICT(company_id,authority_id) DO UPDATE SET config_fingerprint=EXCLUDED.config_fingerprint,policy_version=EXCLUDED.policy_version,generation=EXCLUDED.generation,revision=EXCLUDED.revision,phase='RECONCILING',instance_id=EXCLUDED.instance_id,reconcile_cursor=NULL,reconciled_revision=NULL,updated_at=clock_timestamp()`,[c.companyId,c.authorityId,c.issuer,c.erpAudience,authorityFingerprint(c),c.policyVersion,next,revision,input.instanceId]);
   return {instanceId:input.instanceId,generation:next,snapshotRevision:revision};
  }
  assert(row&&row.generation===r.generation,'FEDERATION_GENERATION');
  assert(row.config_fingerprint===authorityFingerprint(c)&&row.policy_version===c.policyVersion,'FEDERATION_CONFLICT');
  if(action==='RECONCILE_PAGE')return this.pageIn(tx,c,r,row);
  if(action==='LOOKUP_PRINCIPAL'){
   const input=z.object({subject:federationSubject,sessionRef:federationRef.optional()}).strict().parse(payload);
   const p=await this.principalIn(tx,c,input.subject),s=input.sessionRef?await this.sessionIn(tx,c,input.sessionRef):undefined;
   assert(!s||s.subject===input.subject,'ACCESS_DENIED');
   const hasDependencies=!!p||!!(await sql(tx,'SELECT 1 FROM site_federation_sessions WHERE company_id=$1 AND authority_id=$2 AND subject=$3 LIMIT 1',[c.companyId,c.authorityId,input.subject])).rows.length;
   return {subject:input.subject,hasDependencies,principal:p?{kind:'PRINCIPAL',...p}:null,session:s?{kind:'SESSION',...s}:null};
  }
  if(action==='ACTIVATE_AUTHORITY'){
   const input=z.object({snapshotRevision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict().parse(payload);
   assert(row.phase==='RECONCILING'&&Number(row.revision)===input.snapshotRevision&&Number(row.reconciled_revision)===input.snapshotRevision,'FEDERATION_CONFLICT');
   await sql(tx,"UPDATE site_federation_authorities SET phase='ACTIVE',updated_at=clock_timestamp() WHERE company_id=$1 AND authority_id=$2",[c.companyId,c.authorityId]);
   return {activated:true,generation:row.generation,snapshotRevision:input.snapshotRevision};
  }
  if(action==='FENCE')return this.fenceIn(tx,c,r);
  assert(row.phase==='ACTIVE','FEDERATION_RECONCILING');
  if(action==='REGISTER_SESSION'){
   const input=sourceSessionSchema.parse(payload),p=await this.principalIn(tx,c,input.subject),s=await this.sessionIn(tx,c,input.sessionRef);
   const state=registerSourceSession(p,s,input,c.policyVersion,await this.clock(tx));
   if(!p)await this.savePrincipal(tx,c,state.principal);
   if(!s)await sql(tx,`INSERT INTO site_federation_sessions(company_id,authority_id,subject,session_ref,epoch,security_fingerprint,expires_at,state,version) VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',1)`,[c.companyId,c.authorityId,input.subject,input.sessionRef,input.epoch,input.securityFingerprint,input.sessionExpiresAt]);
   if(state.changed)await this.bump(tx,c);
   return {subject:input.subject,sessionRef:input.sessionRef,epoch:input.epoch,principalVersion:state.principal.version,sessionVersion:state.session.version};
  }
  if(action==='ACTIVATE_EPOCH'){
   const input=activateEpochSchema.parse(payload),p=await this.principalIn(tx,c,input.subject),next=activateSourceEpoch(p,input,c.policyVersion);
   await this.savePrincipal(tx,c,next,p);await this.bump(tx,c);return {subject:input.subject,epoch:input.epoch,principalVersion:next.version};
  }
  assert(other&&['INSPECT_CHALLENGE','CLAIM','LINK_STATUS'].includes(action),'VALIDATION_ERROR');return other(tx,r,c,current(row));
 }
 private async fenceIn(tx:SqlTransaction,c:FederationAuthority,r:VerifiedFederationRequest){
  const input=fenceSchema.parse(r.envelope.payload);
  if(input.scope==='PRINCIPAL'){
   const previous=await this.principalIn(tx,c,input.subject),next=fenceSourcePrincipal(previous,input,r.operationId,c.policyVersion);
   if(next!==previous){await this.savePrincipal(tx,c,next,previous);await this.bump(tx,c);}
   return {scope:input.scope,subject:input.subject,minimumEpoch:next.minimumEpoch,sessionCount:0,fenceOperationId:next.fenceOperationId};
  }
  const existing=(await sql(tx,'SELECT * FROM site_federation_sessions WHERE company_id=$1 AND authority_id=$2 AND session_ref=ANY($3::text[])',[c.companyId,c.authorityId,input.sessionRefs])).rows.map(session);
  const byRef=new Map(existing.filter((s):s is FederationSourceSession=>!!s).map(s=>[s.sessionRef,s]));
  const rows=input.sessionRefs.map(ref=>{const previous=byRef.get(ref),next=fenceSourceSession(previous,input.subject,ref);return previous===next?null:next;}).filter((s):s is FederationSourceSession=>!!s);
  if(rows.length){
   await sql(tx,`INSERT INTO site_federation_sessions(company_id,authority_id,subject,session_ref,epoch,security_fingerprint,expires_at,state,version) SELECT $1,$2,x.subject,x."sessionRef",x.epoch,x."securityFingerprint",x."expiresAt"::timestamptz,'REVOKED',x.version FROM jsonb_to_recordset($3::jsonb) AS x(subject text,"sessionRef" text,epoch integer,"securityFingerprint" text,"expiresAt" text,version integer) ON CONFLICT(company_id,authority_id,session_ref) DO UPDATE SET state='REVOKED',version=EXCLUDED.version,updated_at=clock_timestamp()`,[c.companyId,c.authorityId,JSON.stringify(rows)]);
   await this.bump(tx,c);
  }
  return {scope:input.scope,subject:input.subject,minimumEpoch:null,sessionCount:input.sessionRefs.length,fenceOperationId:r.operationId};
 }
 private async pageIn(tx:SqlTransaction,c:FederationAuthority,r:VerifiedFederationRequest,row:AuthorityRow){
  const input=z.object({cursor:z.string().min(1).max(1024).nullable(),snapshotRevision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable()}).strict().parse(r.envelope.payload);
  assert(row.phase==='RECONCILING'&&(input.snapshotRevision===null||input.snapshotRevision===Number(row.revision)),'FEDERATION_CONFLICT');
  let cursor:z.infer<typeof cursorSchema>|undefined;
  if(input.cursor){try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8')));}catch{throw new DomainError('VALIDATION_ERROR');}assert(input.cursor===row.reconcile_cursor&&cursor.generation===row.generation&&cursor.revision===Number(row.revision)&&input.snapshotRevision===cursor.revision,'FEDERATION_CONFLICT');}
  const records=(await sql(tx,`SELECT kind,key,value FROM (
   SELECT 'PRINCIPAL'::text COLLATE "C" AS kind,subject COLLATE "C" AS key,jsonb_build_object('kind','PRINCIPAL','subject',subject,'epoch',epoch,'minimumEpoch',minimum_epoch,'state',state,'securityFingerprint',security_fingerprint,'sourcePolicyVersion',source_policy_version,'version',version,'fenceOperationId',fence_operation_id) AS value FROM site_federation_principals WHERE company_id=$1 AND authority_id=$2
   UNION ALL SELECT 'SESSION'::text COLLATE "C",session_ref COLLATE "C",jsonb_build_object('kind','SESSION','subject',subject,'sessionRef',session_ref,'epoch',epoch,'securityFingerprint',security_fingerprint,'expiresAt',CASE WHEN expires_at IS NULL THEN NULL ELSE to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,'state',state,'version',version) FROM site_federation_sessions WHERE company_id=$1 AND authority_id=$2
  ) entries WHERE $3::text IS NULL OR (kind,key)>($3::text COLLATE "C",$4::text COLLATE "C") ORDER BY kind,key LIMIT 51`,[c.companyId,c.authorityId,cursor?.kind??null,cursor?.key??null])).rows;
  const page=records.slice(0,50),last=page.at(-1),more=records.length>50;
  const next=more&&last?Buffer.from(JSON.stringify({kind:last.kind,key:last.key,generation:row.generation,revision:Number(row.revision)})).toString('base64url'):null;
  await sql(tx,'UPDATE site_federation_authorities SET reconcile_cursor=$3,reconciled_revision=$4 WHERE company_id=$1 AND authority_id=$2',[c.companyId,c.authorityId,next,more?null:Number(row.revision)]);
  return {generation:row.generation,snapshotRevision:Number(row.revision),records:page.map(item=>item.value),cursor:next,done:!more};
 }
}
