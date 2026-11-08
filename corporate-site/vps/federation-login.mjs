import {createHash,randomUUID} from 'node:crypto';
import {canonicalJson,sessionReference} from '../../erp/packages/integrations/site-federation-protocol.mjs';
import {normalizeSourceLoginPolicy,sourceLoginPolicyFingerprint,parseFederationLoginAction,
  parseFederationLoginActionResult,parseFederationLoginIntrospection,FEDERATION_LOGIN_PENDING_MS,
  FEDERATION_LOGIN_PROOF_MS} from '../../erp/packages/integrations/site-federation-login-protocol.mjs';
import {FederationSourceError} from './federation-state.mjs';
import {sourceLabel} from './federation-snapshot.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const requireValue=(condition,code='FEDERATION_CONFLICT')=>{if(!condition)throw new FederationSourceError(code);};
const iso=value=>new Date(value).toISOString();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function sourceFederationLoginPolicy(environment,authorityIds){
  try{
    const raw=environment.KNABA_FEDERATION_LOGIN_JSON;
    requireValue(raw===undefined||typeof raw==='string'&&Buffer.byteLength(raw)<=4096,'FEDERATION_CONFIGURATION');
    return normalizeSourceLoginPolicy(raw===undefined?undefined:JSON.parse(raw),{authorityIds});
  }catch{throw new FederationSourceError('FEDERATION_CONFIGURATION');}
}

/** Password reauthentication is session-bound; the ERP owns target selection,
 * MFA and final issuance. Source status can reconcile a lost ACK, but never
 * recreate a password, code, ERP credential, or approval for another session. */
export class SourceFederationLogin{
  constructor({coordinator,policy,configuration=()=>policy}){
    this.coordinator=coordinator;this.db=coordinator.db;
    this.policy=policy;this.configuration=configuration;
    this.policyFingerprint=policy?sourceLoginPolicyFingerprint(policy):null;
    this.inspections=new Map();this.activeApprovals=new Set();
  }
  get enabled(){return Boolean(this.policy);}
  close(){this.inspections.clear();}
  invalidate(subject,hashes,principal){
    for(const [id,item] of this.inspections)if(item.subject===subject&&(principal||hashes.includes(item.tokenHash)))this.inspections.delete(id);
  }
  assertConfiguration(){
    const current=this.configuration(),fingerprint=current?sourceLoginPolicyFingerprint(current):null;
    requireValue(fingerprint===this.policyFingerprint,'FEDERATION_CONFIGURATION');
  }
  authority(authorityId){
    this.coordinator.configCurrent();
    requireValue(this.policy?.authorityIds.includes(authorityId),'FEDERATION_CONFIGURATION');
    requireValue(this.coordinator.connectionCurrent(),'FEDERATION_RECONCILING');
    return this.coordinator.authority(authorityId);
  }
  requireSession(subject,tokenHash){
    requireValue(this.coordinator.localSession(subject,tokenHash)&&this.coordinator.eligible(subject),'NEEDS_REAUTH');
  }
  row(authorityId,requestId){return this.db.prepare('SELECT * FROM vps_federation_login_approvals WHERE authority_id=? AND request_id=?').get(authorityId,requestId);}
  ownsRequest(subject,tokenHash,authorityId,requestId){
    if(!this.policy?.authorityIds.includes(authorityId))return false;
    const row=this.row(authorityId,requestId),c=this.coordinator.authority(authorityId);
    return Boolean(row&&row.subject===subject&&row.session_ref===sessionReference(c.issuer,subject,tokenHash));
  }
  inspectionContext(subject,tokenHash,inspectionId){
    const item=this.inspections.get(inspectionId);
    return item?.subject===subject&&item.tokenHash===tokenHash?{authorityId:item.authorityId,requestId:item.info.requestId}:null;
  }
  returnUrl(c,requestId){return c.erpOrigin+'/auth/federation/return?request_id='+requestId;}
  validateResult(action,value,c,requestId){
    const result=parseFederationLoginActionResult(action,value);
    requireValue(result.requestId===requestId&&(!Object.hasOwn(result,'returnUrl')||result.returnUrl===this.returnUrl(c,requestId)),'FEDERATION_INVALID');
    return result;
  }
  async inspect({subject,tokenHash,authorityId,requestId}){
    const c=this.authority(authorityId);this.requireSession(subject,tokenHash);
    const payload=parseFederationLoginAction('LOGIN_INSPECT',{requestId}),witness=this.coordinator.witness(subject);
    const response=await this.coordinator.wire(c,'LOGIN_INSPECT',payload,{fresh:true});
    const info=this.validateResult('LOGIN_INSPECT',response.receipt.result,c,requestId),now=this.coordinator.now();
    requireValue(Date.parse(info.expiresAt)>now&&Date.parse(info.expiresAt)<=now+FEDERATION_LOGIN_PENDING_MS,'FEDERATION_INVALID');
    this.requireSession(subject,tokenHash);requireValue(this.coordinator.witness(subject)===witness,'NEEDS_REAUTH');
    for(const [id,item] of this.inspections)if(item.expiresAt<=now)this.inspections.delete(id);
    requireValue(this.inspections.size<256,'RATE_LIMITED');
    const inspectionId=randomUUID();
    this.inspections.set(inspectionId,{subject,tokenHash,authorityId,witness,info,expiresAt:Date.parse(info.expiresAt),pending:false});
    return {inspectionId,...info,siteLabel:sourceLabel(this.db,subject)};
  }
  async approve({subject,tokenHash,inspectionId,password,confirmed}){
    const inspection=this.inspections.get(inspectionId);
    requireValue(confirmed===true&&inspection&&!inspection.pending&&inspection.subject===subject&&inspection.tokenHash===tokenHash&&
      inspection.expiresAt>this.coordinator.now()&&inspection.witness===this.coordinator.witness(subject),'NEEDS_REAUTH');
    inspection.pending=true;
    const c=this.authority(inspection.authorityId),requestId=inspection.info.requestId;
    try{
      const reauthAt=this.coordinator.reauthenticate(subject,tokenHash,password);
      const source=await this.coordinator.enroll(subject,tokenHash,c.authorityId);
      let row;
      this.coordinator.transaction(()=>{
        this.authority(c.authorityId);this.requireSession(subject,tokenHash);
        requireValue(this.inspections.get(inspectionId)===inspection&&inspection.expiresAt>this.coordinator.now()&&
          this.coordinator.freshReauth(subject,tokenHash)&&this.coordinator.witness(subject)===inspection.witness,'NEEDS_REAUTH');
        requireValue(!this.row(c.authorityId,requestId));
        const session=this.coordinator.localSession(subject,tokenHash),sessionExpiresAt=iso(session.expires_at*1000);
        const payload=parseFederationLoginAction('LOGIN_APPROVE',{requestId,requestBinding:inspection.info.requestBinding,
          expectedVersion:inspection.info.version,subject,sessionRef:source.sessionRef,epoch:source.epoch,
          securityFingerprint:source.securityFingerprint,sourcePolicyVersion:c.policyVersion,reauthAt:iso(reauthAt),
          sessionExpiresAt,siteLabel:sourceLabel(this.db,subject),loginPolicyVersion:inspection.info.loginPolicyVersion,
          loginPolicyFingerprint:inspection.info.loginPolicyFingerprint,sourceLoginPolicyFingerprint:this.policyFingerprint});
        const json=canonicalJson(payload),operationId=randomUUID();
        this.db.prepare(`INSERT INTO vps_federation_login_approvals(authority_id,request_id,request_binding,subject,session_ref,
          epoch,security_fingerprint,source_policy_version,generation,witness,reauth_at,pending_expires_at,issue_expires_at,use_expires_at,
          login_policy_version,login_policy_fingerprint,source_login_policy_fingerprint,operation_id,payload_json,payload_digest,
          return_url,state,remote_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'CLAIMING',?,?)`)
          .run(c.authorityId,requestId,payload.requestBinding,subject,source.sessionRef,source.epoch,source.securityFingerprint,
            c.policyVersion,this.coordinator.state(c.authorityId).generation,inspection.witness,payload.reauthAt,inspection.info.expiresAt,
            iso(Math.min(inspection.expiresAt,reauthAt+FEDERATION_LOGIN_PENDING_MS,session.expires_at*1000)),sessionExpiresAt,
            payload.loginPolicyVersion,payload.loginPolicyFingerprint,this.policyFingerprint,operationId,json,sha(json),
            inspection.info.returnUrl,inspection.info.version,this.coordinator.now());
        row=this.row(c.authorityId,requestId);
      });
      return await this.sendApproval(c,row,subject,tokenHash);
    }finally{this.inspections.delete(inspectionId);}
  }
  liveRow(c,row,subject,tokenHash){
    this.authority(c.authorityId);this.requireSession(subject,tokenHash);
    requireValue(row&&row.subject===subject&&row.session_ref===sessionReference(c.issuer,subject,tokenHash)&&row.state!=='DENIED'&&
      row.source_login_policy_fingerprint===this.policyFingerprint&&row.source_policy_version===c.policyVersion&&
      row.generation===this.coordinator.state(c.authorityId).generation&&row.security_fingerprint===this.coordinator.fingerprint(subject,c)&&
      Date.parse(row.use_expires_at)>this.coordinator.now(),'NEEDS_REAUTH');
  }
  async sendApproval(c,row,subject,tokenHash){
    this.liveRow(c,row,subject,tokenHash);
    requireValue(!this.activeApprovals.has(row.operation_id));
    requireValue(row.state==='CLAIMING'&&Date.parse(row.issue_expires_at)>this.coordinator.now()&&
      this.coordinator.witness(subject)===row.witness&&this.coordinator.freshReauth(subject,tokenHash),'NEEDS_REAUTH');
    const payload=parseFederationLoginAction('LOGIN_APPROVE',JSON.parse(row.payload_json));
    requireValue(sha(canonicalJson(payload))===row.payload_digest,'FEDERATION_CONFLICT');
    this.activeApprovals.add(row.operation_id);
    try{
      const response=await this.coordinator.wire(c,'LOGIN_APPROVE',payload,{operationId:row.operation_id});
      const result=this.validateResult('LOGIN_APPROVE',response.receipt.result,c,row.request_id);
      this.liveRow(c,this.row(c.authorityId,row.request_id),subject,tokenHash);
      requireValue(result.version>payload.expectedVersion&&result.expiresAt===row.pending_expires_at);
      // A replayed durable receipt confirms that exact operation, never current
      // authority. Reconcile the current owned request before any local allow.
      return await this.readStatus(c,row,subject,tokenHash);
    }finally{this.activeApprovals.delete(row.operation_id);}
  }
  async status({subject,tokenHash,authorityId,requestId}){
    requireValue(typeof requestId==='string'&&uuid.test(requestId),'FEDERATION_INVALID');
    const c=this.authority(authorityId),row=this.row(authorityId,requestId);
    this.liveRow(c,row,subject,tokenHash);
    if(row.state==='CLAIMING')return this.sendApproval(c,row,subject,tokenHash);
    return this.readStatus(c,row,subject,tokenHash);
  }
  async readStatus(c,row,subject,tokenHash){
    const requestId=row.request_id,authorityId=c.authorityId;
    const payload=parseFederationLoginAction('LOGIN_STATUS',{requestId,requestBinding:row.request_binding,subject,
      sessionRef:row.session_ref,epoch:row.epoch,securityFingerprint:row.security_fingerprint,sourcePolicyVersion:c.policyVersion});
    const response=await this.coordinator.wire(c,'LOGIN_STATUS',payload,{fresh:true});
    const result=this.validateResult('LOGIN_STATUS',response.receipt.result,c,requestId);
    requireValue(result.expiresAt===row.pending_expires_at);
    this.liveRow(c,this.row(authorityId,requestId),subject,tokenHash);
    this.coordinator.transaction(()=>{
      this.liveRow(c,this.row(authorityId,requestId),subject,tokenHash);
      requireValue(result.version>=row.remote_version);
      if(['SOURCE_APPROVED','CODE_ISSUED','COMPLETE'].includes(result.state))
        this.db.prepare("UPDATE vps_federation_login_approvals SET state='APPROVED',remote_version=? WHERE authority_id=? AND request_id=?").run(result.version,authorityId,requestId);
      else if(['CANCELLED','EXPIRED','DENIED'].includes(result.state))
        this.db.prepare("UPDATE vps_federation_login_approvals SET state='DENIED',remote_version=? WHERE authority_id=? AND request_id=?").run(result.version,authorityId,requestId);
      else requireValue(false);
    });
    return {...result,returnUrl:row.return_url};
  }
  /** Called synchronously inside the coordinator's verified nonce transaction. */
  introspect(c,wire,raw){
    const input=parseFederationLoginIntrospection(raw),now=this.coordinator.now();
    if(!this.policy?.authorityIds.includes(c.authorityId))return {active:false};
    const row=this.row(c.authorityId,input.requestId),state=this.coordinator.state(c.authorityId);
    const tokenHash=this.coordinator.tokenHash(c,input.subject,input.sessionRef);
    const session=tokenHash&&this.coordinator.localSession(input.subject,tokenHash);
    const principal=this.db.prepare('SELECT * FROM vps_federation_principals WHERE authority_id=? AND subject=?').get(c.authorityId,input.subject);
    const sourceSession=this.db.prepare('SELECT * FROM vps_federation_sessions WHERE authority_id=? AND session_ref=?').get(c.authorityId,input.sessionRef);
    if(!this.coordinator.connectionCurrent()||state?.generation!==wire.generation||!row||row.state!=='APPROVED'||
      row.generation!==wire.generation||row.request_binding!==input.requestBinding||row.subject!==input.subject||row.session_ref!==input.sessionRef||
      row.epoch!==input.epoch||row.security_fingerprint!==input.securityFingerprint||row.source_policy_version!==input.sourcePolicyVersion||
      input.sourcePolicyVersion!==c.policyVersion||row.login_policy_version!==input.loginPolicyVersion||
      row.login_policy_fingerprint!==input.loginPolicyFingerprint||row.source_login_policy_fingerprint!==input.sourceLoginPolicyFingerprint||
      input.sourceLoginPolicyFingerprint!==this.policyFingerprint||!session||!this.coordinator.eligible(input.subject)||
      principal?.state!=='ACTIVE'||principal.epoch!==input.epoch||principal.minimum_epoch>input.epoch||
      principal.security_fingerprint!==input.securityFingerprint||sourceSession?.state!=='ACTIVE'||sourceSession.epoch!==input.epoch||
      sourceSession.security_fingerprint!==input.securityFingerprint||this.coordinator.fingerprint(input.subject,c)!==input.securityFingerprint||
      Date.parse(row.use_expires_at)<=now)return {active:false};
    if(input.purpose==='SESSION_ISSUE'&&(Date.parse(row.issue_expires_at)<=now||Date.parse(row.reauth_at)>now||
      now-Date.parse(row.reauth_at)>FEDERATION_LOGIN_PENDING_MS||!this.coordinator.freshReauth(input.subject,tokenHash)))return {active:false};
    const sessionEnd=Math.min(session.expires_at*1000,Date.parse(row.use_expires_at));
    const validUntil=Math.min(now+FEDERATION_LOGIN_PROOF_MS,sessionEnd,input.purpose==='SESSION_ISSUE'?Date.parse(row.issue_expires_at):Infinity);
    if(validUntil<=now)return {active:false};
    return {active:true,...input,generation:wire.generation,checkedAt:iso(now),validUntil:iso(validUntil),sessionExpiresAt:iso(sessionEnd),reauthAt:row.reauth_at};
  }
}
