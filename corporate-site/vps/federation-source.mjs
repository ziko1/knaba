import {createHash,randomUUID} from 'node:crypto';
import {authorityFingerprint,canonicalJson,sessionReference,sendFederation,
  verifyFederationRequest,makeFederationResponse} from '../../erp/packages/integrations/site-federation-protocol.mjs';
import {bindFederationCoordinator,FederationSourceError,securityTransaction,federationSessionAllowed} from './federation-state.mjs';
import {sourceFingerprint,sourceMutationWitness,sourceEligible,sourceLabel} from './federation-snapshot.mjs';
import {verifyCredentialPassword} from './auth.mjs';
import {parseFederationLoginIntrospection} from '../../erp/packages/integrations/site-federation-login-protocol.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,id)=>{throw new FederationSourceError(code,id);};
const requireValue=(condition,code='FEDERATION_UNAVAILABLE')=>{if(!condition)fail(code);};
const pendingStates="('PENDING_DENY','FENCED','SOURCE_COMMITTED')";
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hashPattern=/^[a-f0-9]{64}$/;
const refPattern=/^[A-Za-z0-9_-]{43}$/;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** A durable source coordinator; PostgreSQL owns the global revocation point.
 * All callbacks executed with a SQLite permit are synchronous. Network calls
 * occur only between committed SQLite transactions. Replacement credentials
 * and grant candidates remain in the caller's RAM and are never journaled. */
export class SourceFederationCoordinator{
  constructor({db,authorities,ownerPolicy={},fetchImpl=fetch,now=Date.now,configuration,
    stateApi={bindFederationCoordinator,securityTransaction,federationSessionAllowed}}){
    this.db=db;this.authorities=new Map(authorities.map(c=>[c.authorityId,c]));
    this.ownerPolicy=Object.freeze({...ownerPolicy});this.fetchImpl=fetchImpl;this.now=now;
    this.configuration=configuration??(()=>authorities);this.closed=false;this.ready=false;this.inspections=new Map();
    this.instanceId=null;this.activeOperations=new Set();this.activeRegistrations=new Set();this.maintenance=null;this.maintenanceRun=null;
    this.permits=stateApi.bindFederationCoordinator(db,this);
    this.transaction=(work,options)=>stateApi.securityTransaction(db,work,options);
    this.sessionAllowed=(subject,tokenHash)=>stateApi.federationSessionAllowed(db,subject,tokenHash);
  }
  close(){clearInterval(this.maintenance);this.maintenance=null;this.closed=true;this.ready=false;this.inspections.clear();this.login?.close();this.permits.close();}
  async stop(){clearInterval(this.maintenance);this.maintenance=null;await this.maintenanceRun;this.close();}
  connectionCurrent(){
    return this.ready&&!this.closed&&[...this.authorities.keys()].every(id=>{const state=this.state(id);return state?.instance_id===this.instanceId&&state.phase==='ACTIVE';});
  }
  configCurrent(){
    requireValue(!this.closed,'FEDERATION_COORDINATOR_REQUIRED');
    if(this.instanceId)requireValue([...this.authorities.keys()].every(id=>this.state(id)?.instance_id===this.instanceId),'FEDERATION_RECONCILING');
    let current;
    try{current=this.configuration();this.login?.assertConfiguration();}
    catch{
      this.db.prepare("UPDATE vps_federation_authorities SET phase='RECONCILING'").run();this.ready=false;
      fail('FEDERATION_CONFIGURATION');
    }
    if(current.length!==this.authorities.size||current.some(c=>!this.authorities.has(c.authorityId)||authorityFingerprint(c)!==authorityFingerprint(this.authorities.get(c.authorityId)))){
      this.db.prepare("UPDATE vps_federation_authorities SET phase='RECONCILING'").run();this.ready=false;
      fail('FEDERATION_CONFIGURATION');
    }
  }
  authority(id){const c=this.authorities.get(id);requireValue(c,'FEDERATION_CONFIGURATION');return c;}
  state(id){return this.db.prepare('SELECT * FROM vps_federation_authorities WHERE authority_id=?').get(id);}
  pending(subject){return this.db.prepare(`SELECT operation_id FROM vps_federation_operations WHERE subject=? AND state IN ${pendingStates} LIMIT 1`).get(subject);}
  fingerprint(subject,c){return sourceFingerprint(this.db,subject,c,this.ownerPolicy);}
  witness(subject){return sourceMutationWitness(this.db,subject,this.ownerPolicy);}
  eligible(subject){return sourceEligible(this.db,subject,this.ownerPolicy);}

  async wire(c,action,payload,{operationId=randomUUID(),generation=this.state(c.authorityId)?.generation??0,fresh=false}={}){
    this.configCurrent();requireValue(!this.db.isTransaction,'FEDERATION_ASYNC_TRANSACTION');
    const {status,result}=await sendFederation(c,'SITE_TO_ERP',action,payload,{operationId,generation,fetchImpl:this.fetchImpl});
    this.configCurrent();
    if(status!==200||result?.ok!==true){
      if(['FEDERATION_GENERATION','FEDERATION_RECONCILING'].includes(result?.error?.code)){
        this.db.prepare("UPDATE vps_federation_authorities SET phase='RECONCILING' WHERE authority_id=?").run(c.authorityId);this.ready=false;
      }
      fail(['FEDERATION_GENERATION','FEDERATION_RECONCILING','FEDERATION_CONFLICT','NEEDS_REAUTH','RATE_LIMITED'].includes(result?.error?.code)?result.error.code:'FEDERATION_UNAVAILABLE');
    }
    const {receipt,current}=result;
    requireValue(record(receipt)&&record(current)&&receipt.operationId===operationId&&receipt.action===action&&record(receipt.result));
    requireValue(integer(receipt.generation)&&integer(receipt.revision)&&integer(current.generation)&&current.generation>0&&integer(current.revision)&&
      ['ACTIVE','RECONCILING'].includes(current.phase)&&current.policyVersion===c.policyVersion);
    requireValue(action==='BOOTSTRAP_AUTHORITY'||current.generation===generation,'FEDERATION_GENERATION');
    requireValue(receipt.generation<=current.generation&&receipt.revision<=current.revision);
    if(fresh)requireValue(receipt.generation===current.generation&&receipt.revision===current.revision,'FEDERATION_CONFLICT');
    return result;
  }

  async initialize(){
    this.configCurrent();
    const existing=this.db.prepare('SELECT authority_id FROM vps_federation_authorities').all();
    requireValue(existing.every(row=>this.authorities.has(row.authority_id)),'FEDERATION_CONFIGURATION');
    if(!this.authorities.size){this.ready=true;return;}
    const instance=randomUUID();this.instanceId=null;
    this.transaction(()=>{
      for(const c of this.authorities.values()){
        const prior=this.state(c.authorityId),fingerprint=authorityFingerprint(c);
        requireValue(!prior||(prior.company_id===c.companyId&&prior.issuer===c.issuer&&c.policyVersion>=prior.policy_version&&
          (prior.config_fingerprint===fingerprint||c.policyVersion>prior.policy_version)),'FEDERATION_CONFIGURATION');
        this.db.prepare(`INSERT INTO vps_federation_authorities(authority_id,company_id,issuer,config_fingerprint,policy_version,
          phase,instance_id,bootstrap_operation_id,updated_at) VALUES(?,?,?,?,?,'RECONCILING',?,?,?)
          ON CONFLICT(authority_id) DO UPDATE SET config_fingerprint=excluded.config_fingerprint,policy_version=excluded.policy_version,
          phase='RECONCILING',instance_id=excluded.instance_id,bootstrap_operation_id=excluded.bootstrap_operation_id,updated_at=excluded.updated_at`)
          .run(c.authorityId,c.companyId,c.issuer,fingerprint,c.policyVersion,instance,randomUUID(),this.now());
      }
    });
    this.instanceId=instance;
    for(const c of this.authorities.values()){
      const state=this.state(c.authorityId);
      const result=await this.wire(c,'BOOTSTRAP_AUTHORITY',{instanceId:instance},{operationId:state.bootstrap_operation_id,generation:0,fresh:true});
      requireValue(result.receipt.result.instanceId===instance&&result.receipt.result.generation===result.current.generation&&result.current.phase==='RECONCILING');
      this.db.prepare('UPDATE vps_federation_authorities SET generation=?,revision=?,snapshot_revision=NULL WHERE authority_id=?')
        .run(result.current.generation,result.current.revision,c.authorityId);
      await this.reconcile(c);
    }
    this.ready=true;
  }

  savePrincipal(c,p){
    requireValue(record(p)&&p.kind==='PRINCIPAL'&&typeof p.subject==='string'&&integer(p.epoch)&&integer(p.minimumEpoch)&&p.minimumEpoch>0&&
      ['ACTIVE','FENCED'].includes(p.state)&&(p.securityFingerprint===null||hashPattern.test(p.securityFingerprint))&&integer(p.sourcePolicyVersion)&&integer(p.version));
    const prior=this.db.prepare('SELECT minimum_epoch,version,epoch FROM vps_federation_principals WHERE authority_id=? AND subject=?').get(c.authorityId,p.subject);
    requireValue(!prior||(p.minimumEpoch>=prior.minimum_epoch&&p.version>=prior.version&&p.epoch>=prior.epoch),'FEDERATION_RECOVERY_REQUIRED');
    const actual=this.fingerprint(p.subject,c);
    const state=p.state==='FENCED'||p.epoch<p.minimumEpoch?'FENCED':actual===p.securityFingerprint&&p.sourcePolicyVersion===c.policyVersion?'ACTIVE':'RECOVERY_REQUIRED';
    this.db.prepare(`INSERT INTO vps_federation_principals(authority_id,subject,epoch,minimum_epoch,security_fingerprint,source_policy_version,version,state,fence_operation_id)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(authority_id,subject) DO UPDATE SET epoch=excluded.epoch,minimum_epoch=excluded.minimum_epoch,
      security_fingerprint=excluded.security_fingerprint,source_policy_version=excluded.source_policy_version,version=excluded.version,state=excluded.state,fence_operation_id=excluded.fence_operation_id`)
      .run(c.authorityId,p.subject,p.epoch,p.minimumEpoch,p.securityFingerprint,p.sourcePolicyVersion,p.version,state,p.fenceOperationId??null);
  }
  tokenHash(c,subject,ref){
    return this.db.prepare('SELECT token_hash FROM vps_sessions WHERE user_id=?').all(subject)
      .find(row=>sessionReference(c.issuer,subject,row.token_hash)===ref)?.token_hash??null;
  }
  saveSession(c,s){
    requireValue(record(s)&&s.kind==='SESSION'&&typeof s.subject==='string'&&refPattern.test(s.sessionRef)&&
      ['ACTIVE','REVOKED'].includes(s.state)&&(s.epoch===null||integer(s.epoch))&&(s.securityFingerprint===null||hashPattern.test(s.securityFingerprint))&&integer(s.version));
    const p=this.db.prepare('SELECT * FROM vps_federation_principals WHERE authority_id=? AND subject=?').get(c.authorityId,s.subject);
    const revoked=s.state==='REVOKED'||(p&&(p.state!=='ACTIVE'||s.epoch<p.minimum_epoch||s.securityFingerprint!==p.security_fingerprint));
    this.db.prepare(`INSERT INTO vps_federation_sessions(authority_id,session_ref,subject,token_hash,epoch,security_fingerprint,expires_at,state,version,snapshot_generation)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(authority_id,session_ref) DO UPDATE SET token_hash=COALESCE(excluded.token_hash,token_hash),
      epoch=excluded.epoch,security_fingerprint=excluded.security_fingerprint,expires_at=excluded.expires_at,
      state=CASE WHEN state='REVOKED' THEN 'REVOKED' ELSE excluded.state END,version=excluded.version,snapshot_generation=excluded.snapshot_generation`)
      .run(c.authorityId,s.sessionRef,s.subject,this.tokenHash(c,s.subject,s.sessionRef),s.epoch,s.securityFingerprint,s.expiresAt,revoked?'REVOKED':'ACTIVE',s.version,this.state(c.authorityId).generation);
  }
  async reconcile(c){
    const deadline=this.now()+60_000;let cursor=null,revision=null,restarts=0;
    for(let pages=0;pages<512&&this.now()<deadline;pages++){
      let response;
      try{response=await this.wire(c,'RECONCILE_PAGE',{cursor,snapshotRevision:revision},{fresh:true});}
      catch(error){if(error.code==='FEDERATION_CONFLICT'&&restarts++<2){cursor=null;revision=null;continue;}throw error;}
      const value=response.receipt.result;
      requireValue(value.generation===response.current.generation&&value.snapshotRevision===response.current.revision&&Array.isArray(value.records)&&value.records.length<=50&&
        typeof value.done==='boolean'&&(value.cursor===null||typeof value.cursor==='string')&&value.done===(value.cursor===null));
      this.transaction(()=>{
        for(const item of value.records){if(item.kind==='PRINCIPAL')this.savePrincipal(c,item);else this.saveSession(c,item);}
        this.db.prepare('UPDATE vps_federation_authorities SET revision=?,snapshot_revision=? WHERE authority_id=?')
          .run(response.current.revision,value.snapshotRevision,c.authorityId);
      });
      revision=value.snapshotRevision;cursor=value.cursor;
      if(!value.done)continue;
      const missing=this.db.prepare("SELECT * FROM vps_federation_sessions WHERE authority_id=? AND snapshot_generation<>? AND state<>'REVOKED' ORDER BY subject,session_ref").all(c.authorityId,response.current.generation);
      if(missing.length){
        // REGISTERING is persisted before outbound proof. Fence even a ref whose
        // first registration never reached PostgreSQL; no missing-ACK assumption.
        for(const row of missing){
          const operationId=row.registration_operation_id??randomUUID();
          const id=digest('restore-fence\0'+operationId).slice(0,8)+'-'+digest(operationId).slice(0,4)+'-4'+digest(operationId).slice(4,7)+'-8'+digest(operationId).slice(7,10)+'-'+digest(operationId).slice(10,22);
          await this.wire(c,'FENCE',{subject:row.subject,scope:'SESSION',sessionRefs:[row.session_ref],intentHash:digest('restore-fence\0'+row.session_ref)},{operationId:id});
          this.db.prepare("UPDATE vps_federation_sessions SET state='REVOKED' WHERE authority_id=? AND session_ref=?").run(c.authorityId,row.session_ref);
        }
        cursor=null;revision=null;continue;
      }
      this.transaction(()=>{
        const revoked=this.db.prepare("SELECT DISTINCT subject,token_hash FROM vps_federation_sessions WHERE token_hash IS NOT NULL AND state='REVOKED'").all();
        for(const row of revoked)this.permits.reconcile(row.subject,[row.token_hash],()=>this.db.prepare('DELETE FROM vps_sessions WHERE token_hash=? AND user_id=?').run(row.token_hash,row.subject));
      });
      const active=await this.wire(c,'ACTIVATE_AUTHORITY',{snapshotRevision:revision},{fresh:true});
      requireValue(active.current.phase==='ACTIVE'&&active.receipt.result.activated===true&&active.receipt.result.snapshotRevision===revision);
      this.db.prepare("UPDATE vps_federation_authorities SET phase='ACTIVE',revision=? WHERE authority_id=?").run(active.current.revision,c.authorityId);
      return;
    }
    fail('FEDERATION_RECONCILING');
  }

  async lookup(c,subject,sessionRef){
    const response=await this.wire(c,'LOOKUP_PRINCIPAL',{subject,...(sessionRef?{sessionRef}:{})},{fresh:true});
    const value=response.receipt.result;
    requireValue(value.subject===subject&&typeof value.hasDependencies==='boolean'&&(value.principal===null||record(value.principal))&&(value.session===null||record(value.session)));
    this.transaction(()=>{
      if(value.principal){requireValue(value.principal.subject===subject);this.savePrincipal(c,value.principal);}
      else{
        const prior=this.db.prepare('SELECT version,state FROM vps_federation_principals WHERE authority_id=? AND subject=?').get(c.authorityId,subject);
        requireValue(!prior||prior.version===0&&prior.state==='REGISTERING','FEDERATION_RECOVERY_REQUIRED');
        // This is only an unacknowledged local placeholder. The durable session
        // dependency, including unknown refs, remains and must still be fenced.
        if(prior)this.db.prepare("DELETE FROM vps_federation_principals WHERE authority_id=? AND subject=? AND version=0 AND state='REGISTERING'").run(c.authorityId,subject);
      }
      if(value.session){requireValue(value.session.subject===subject&&value.session.sessionRef===sessionRef);this.saveSession(c,value.session);}
      this.db.prepare('UPDATE vps_federation_authorities SET revision=? WHERE authority_id=?').run(response.current.revision,c.authorityId);
    });
    return {...value,current:response.current};
  }

  async mutate(plan){
    plan=Object.freeze({...plan,sessionHashes:Object.freeze([...(plan.sessionHashes??[])])});
    this.configCurrent();requireValue(this.ready,'FEDERATION_RECONCILING');
    if(!this.authorities.size)return plan.apply();
    requireValue(typeof plan.subject==='string'&&['PRINCIPAL','SESSION'].includes(plan.scope)&&typeof plan.apply==='function'&&typeof plan.authorize==='function','FEDERATION_INVALID');
    const operationId=randomUUID(),createdAt=this.now(),sessionHashes=[...new Set(plan.sessionHashes??[])].sort();
    requireValue(sessionHashes.every(hash=>hashPattern.test(hash)),'FEDERATION_INVALID');
    this.transaction(()=>{
      requireValue(!this.pending(plan.subject),'FEDERATION_PENDING');
      requireValue(plan.authorize()===true,'NEEDS_REAUTH');
      requireValue(plan.pureRevocation||!this.db.prepare("SELECT 1 FROM vps_federation_principals WHERE subject=? AND state='RECOVERY_REQUIRED'").get(plan.subject),'FEDERATION_RECOVERY_REQUIRED');
      const witness={source:this.witness(plan.subject),fingerprints:Object.fromEntries([...this.authorities.values()].map(c=>[c.authorityId,this.fingerprint(plan.subject,c)]))};
      const intentHash=digest(canonicalJson({operationId,subject:plan.subject,kind:plan.kind,scope:plan.scope,sessionHashes,excludedHash:plan.excludedHash??null,intent:plan.intent??null}));
      this.db.prepare(`INSERT INTO vps_federation_operations(operation_id,subject,kind,scope,session_hashes,excluded_hash,intent_hash,witness_json,pure_revocation,state,created_at,authorization_expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,'PENDING_DENY',?,?)`).run(operationId,plan.subject,plan.kind,plan.scope,JSON.stringify(sessionHashes),plan.excludedHash??null,intentHash,JSON.stringify(witness),plan.pureRevocation?1:0,createdAt,Math.min(plan.authorizationExpiresAt??createdAt+300_000,createdAt+300_000));
    });
    for(const [key,value] of this.inspections)if(value.subject===plan.subject&&(plan.scope==='PRINCIPAL'||sessionHashes.includes(value.tokenHash)))this.inspections.delete(key);
    this.login?.invalidate(plan.subject,sessionHashes,plan.scope==='PRINCIPAL');
    this.activeOperations.add(operationId);
    try{return await this.finish(operationId,plan);}finally{this.activeOperations.delete(operationId);}
  }

  async fenceOperation(op){
    for(const c of this.authorities.values()){
      const already=this.db.prepare('SELECT 1 FROM vps_federation_fences WHERE operation_id=? AND authority_id=?').get(op.operation_id,c.authorityId);
      if(!already){
        const lookup=await this.lookup(c,op.subject);
        requireValue(lookup.current.phase==='ACTIVE','FEDERATION_RECONCILING');
        const local=this.db.prepare('SELECT 1 FROM vps_federation_principals WHERE authority_id=? AND subject=? UNION SELECT 1 FROM vps_federation_sessions WHERE authority_id=? AND subject=? LIMIT 1').get(c.authorityId,op.subject,c.authorityId,op.subject);
        if(!lookup.hasDependencies&&!local)continue;
        const payloads=[];
        if(op.scope==='PRINCIPAL'){
          const floor=Math.max(lookup.principal?.epoch??1,lookup.principal?.minimumEpoch??1);
          payloads.push({subject:op.subject,scope:'PRINCIPAL',throughEpoch:floor,nextEpoch:floor+1,intentHash:op.intent_hash});
        }else{
          const refs=new Set(JSON.parse(op.session_hashes).map(hash=>sessionReference(c.issuer,op.subject,hash)));
          if(op.kind==='REVOKE_OTHERS')for(const row of this.db.prepare('SELECT session_ref FROM vps_federation_sessions WHERE authority_id=? AND subject=?').all(c.authorityId,op.subject))
            if(row.session_ref!==sessionReference(c.issuer,op.subject,op.excluded_hash))refs.add(row.session_ref);
          const all=[...refs].sort();for(let index=0;index<all.length;index+=256)payloads.push({subject:op.subject,scope:'SESSION',sessionRefs:all.slice(index,index+256),intentHash:op.intent_hash});
        }
        this.transaction(()=>payloads.forEach((payload,index)=>{
          const body=canonicalJson(payload);
          this.db.prepare("INSERT INTO vps_federation_fences(operation_id,fence_index,authority_id,wire_operation_id,payload_json,payload_digest,state) VALUES(?,?,?,?,?,?,'PENDING')")
            .run(op.operation_id,index,c.authorityId,randomUUID(),body,digest(body));
        }));
      }
      for(const fence of this.db.prepare('SELECT * FROM vps_federation_fences WHERE operation_id=? AND authority_id=? ORDER BY fence_index').all(op.operation_id,c.authorityId)){
        requireValue(digest(fence.payload_json)===fence.payload_digest,'FEDERATION_CONFLICT');
        if(fence.state!=='PENDING')continue;
        const response=await this.wire(c,'FENCE',JSON.parse(fence.payload_json),{operationId:fence.wire_operation_id});
        const payload=JSON.parse(fence.payload_json);
        requireValue(response.receipt.result.scope===payload.scope&&response.receipt.result.subject===op.subject);
        if(payload.scope==='SESSION')requireValue(response.receipt.result.fenceOperationId===fence.wire_operation_id);
        if(payload.scope==='PRINCIPAL')requireValue(response.receipt.result.minimumEpoch>=payload.nextEpoch,'FEDERATION_CONFLICT');
        if(payload.scope==='PRINCIPAL'&&!op.pure_revocation)requireValue(response.receipt.result.minimumEpoch===payload.nextEpoch&&response.receipt.result.fenceOperationId===fence.wire_operation_id,'FEDERATION_CONFLICT');
        this.db.prepare("UPDATE vps_federation_fences SET state='ACKNOWLEDGED',receipt_json=? WHERE operation_id=? AND authority_id=? AND fence_index=?")
          .run(JSON.stringify(response.receipt),op.operation_id,c.authorityId,fence.fence_index);
        if(payload.scope==='PRINCIPAL'){
          const current=await this.lookup(c,op.subject);
          if(!op.pure_revocation)requireValue(current.principal?.minimumEpoch===payload.nextEpoch&&current.principal?.fenceOperationId===fence.wire_operation_id,'FEDERATION_CONFLICT');
        }
        else this.db.prepare(`UPDATE vps_federation_sessions SET state='REVOKED' WHERE authority_id=? AND session_ref IN (SELECT value FROM json_each(?))`).run(c.authorityId,JSON.stringify(payload.sessionRefs));
      }
    }
    this.db.prepare("UPDATE vps_federation_operations SET state='FENCED' WHERE operation_id=? AND state='PENDING_DENY'").run(op.operation_id);
  }

  async finish(operationId,plan){
    let op=this.db.prepare('SELECT * FROM vps_federation_operations WHERE operation_id=?').get(operationId);
    requireValue(op,'FEDERATION_CONFLICT');let result;
    try{
      if(op.state==='PENDING_DENY')await this.fenceOperation(op);
      op=this.db.prepare('SELECT * FROM vps_federation_operations WHERE operation_id=?').get(operationId);
      if(op.state==='FENCED'){
        this.configCurrent();requireValue(this.connectionCurrent(),'FEDERATION_RECONCILING');
        const authorized=Boolean(op.pure_revocation)||(plan&&this.now()<=op.authorization_expires_at&&this.witness(op.subject)===JSON.parse(op.witness_json).source);
        if(!authorized){this.abortFenced(op);fail('REENTRY_REQUIRED',operationId);}
        try{
          this.transaction(()=>this.permits.commit(operationId,op.subject,()=>{
            if(!op.pure_revocation)requireValue(plan.authorize()===true&&this.now()<=op.authorization_expires_at,'NEEDS_REAUTH');
            if(!op.pure_revocation)requireValue(!this.db.prepare("SELECT 1 FROM vps_federation_principals WHERE subject=? AND state='RECOVERY_REQUIRED'").get(op.subject),'FEDERATION_RECOVERY_REQUIRED');
            result=plan?plan.apply():this.applyPureRevocation(op);
            requireValue(!result||typeof result.then!=='function','FEDERATION_ASYNC_TRANSACTION');
            requireValue(result!==false&&result!==null&&result!==undefined,'FEDERATION_CONFLICT');
            if(op.scope==='PRINCIPAL'){
              this.db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(op.subject);
              this.db.prepare('DELETE FROM vps_account_tokens WHERE user_id=?').run(op.subject);
              this.db.prepare('DELETE FROM vps_federation_reauth WHERE user_id=?').run(op.subject);
              this.db.prepare("UPDATE vps_federation_sessions SET state='REVOKED' WHERE subject=?").run(op.subject);
              // A new, explicitly authorized successful change may finish a prior
              // failed intent's recovery; it never reports that lost change applied.
              this.db.prepare("UPDATE vps_federation_operations SET state='COMPLETE',outcome='CHANGE_NOT_APPLIED' WHERE subject=? AND state='ABORTED_FENCED'").run(op.subject);
            }
            this.db.prepare("UPDATE vps_federation_operations SET state='SOURCE_COMMITTED',result_json=? WHERE operation_id=? AND state='FENCED'")
              .run(JSON.stringify({applied:true}),operationId);
            for(const c of this.authorities.values()){
              const fence=this.db.prepare('SELECT * FROM vps_federation_fences WHERE operation_id=? AND authority_id=? AND fence_index=0').get(operationId,c.authorityId);
              if(!fence||op.scope!=='PRINCIPAL')continue;
              const body=JSON.parse(fence.payload_json),fingerprint=this.fingerprint(op.subject,c),old=JSON.parse(op.witness_json).fingerprints[c.authorityId];
              const acknowledged=JSON.parse(fence.receipt_json).result;
              if(!this.eligible(op.subject)||(op.pure_revocation&&(old!==fingerprint||acknowledged.minimumEpoch!==body.nextEpoch||acknowledged.fenceOperationId!==fence.wire_operation_id))){
                this.db.prepare("UPDATE vps_federation_fences SET state='COMPLETE' WHERE operation_id=? AND authority_id=?").run(operationId,c.authorityId);continue;
              }
              this.db.prepare("UPDATE vps_federation_fences SET state='ACTIVATION_PENDING',activation_operation_id=?,activation_payload_json=? WHERE operation_id=? AND authority_id=? AND fence_index=0")
                .run(randomUUID(),canonicalJson({subject:op.subject,epoch:body.nextEpoch,securityFingerprint:fingerprint,fenceOperationId:fence.wire_operation_id,sourcePolicyVersion:c.policyVersion}),operationId,c.authorityId);
            }
          }));
        }catch(error){this.abortFenced(op);throw error;}
      }
      await this.finishActivations(operationId);
      this.db.prepare("UPDATE vps_federation_operations SET state='COMPLETE',outcome='APPLIED' WHERE operation_id=? AND state='SOURCE_COMMITTED'").run(operationId);
      return result??{revoked:true};
    }catch(error){
      if(error instanceof FederationSourceError&&error.code==='REENTRY_REQUIRED')throw error;
      const current=this.db.prepare('SELECT state FROM vps_federation_operations WHERE operation_id=?').get(operationId);
      fail(current?.state==='ABORTED_FENCED'?'REENTRY_REQUIRED':'FEDERATION_PENDING',operationId);
    }
  }
  applyPureRevocation(op){
    const changed=op.scope==='PRINCIPAL'?this.db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(op.subject):
      this.db.prepare('DELETE FROM vps_sessions WHERE user_id=? AND token_hash IN (SELECT value FROM json_each(?))').run(op.subject,op.session_hashes);
    return {revoked:Number(changed.changes)};
  }
  abortFenced(op){
    this.transaction(()=>this.permits.commit(op.operation_id,op.subject,()=>{
      this.applyPureRevocation(op);
      if(op.scope==='PRINCIPAL'){
        this.db.prepare('DELETE FROM vps_account_tokens WHERE user_id=?').run(op.subject);
        this.db.prepare('DELETE FROM vps_federation_reauth WHERE user_id=?').run(op.subject);
      }
      this.db.prepare("UPDATE vps_federation_operations SET state='ABORTED_FENCED',outcome='REENTRY_REQUIRED',result_json=NULL WHERE operation_id=?").run(op.operation_id);
    }));
  }
  async finishActivations(operationId){
    for(const row of this.db.prepare("SELECT * FROM vps_federation_fences WHERE operation_id=? AND state='ACTIVATION_PENDING' ORDER BY authority_id,fence_index").all(operationId)){
      const c=this.authority(row.authority_id),payload=JSON.parse(row.activation_payload_json);
      requireValue(this.fingerprint(payload.subject,c)===payload.securityFingerprint,'FEDERATION_CONFLICT');
      await this.wire(c,'ACTIVATE_EPOCH',payload,{operationId:row.activation_operation_id});
      const fresh=await this.lookup(c,payload.subject);
      requireValue(fresh.current.phase==='ACTIVE'&&fresh.principal?.state==='ACTIVE'&&fresh.principal.epoch===payload.epoch&&
        fresh.principal.securityFingerprint===payload.securityFingerprint&&fresh.principal.minimumEpoch<=payload.epoch,'FEDERATION_CONFLICT');
      this.db.prepare("UPDATE vps_federation_fences SET state='COMPLETE' WHERE operation_id=? AND authority_id=? AND fence_index=?").run(operationId,row.authority_id,row.fence_index);
    }
  }
  async resumePending({limit=100}={}){
    requireValue(this.ready,'FEDERATION_RECONCILING');const results=[];
    requireValue(Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'FEDERATION_INVALID');
    for(const op of this.db.prepare(`SELECT operation_id FROM vps_federation_operations WHERE state IN ${pendingStates} ORDER BY created_at LIMIT ?`).all(limit)){
      if(this.closed)break;if(this.activeOperations.has(op.operation_id))continue;this.activeOperations.add(op.operation_id);
      try{await this.finish(op.operation_id);results.push({operationId:op.operation_id,state:'COMPLETE'});}
      catch(error){results.push({operationId:op.operation_id,state:error.code});}
      finally{this.activeOperations.delete(op.operation_id);}
    }
    return results;
  }
  startMaintenance(){
    if(this.maintenance)return;
    this.maintenance=setInterval(()=>{
      if(!this.maintenanceRun&&!this.closed)this.maintenanceRun=(async()=>{await this.resumePending({limit:5});await this.resumeRegistrations();})().catch(()=>{}).finally(()=>{this.maintenanceRun=null;});
    },30_000);this.maintenance.unref?.();
  }

  localSession(subject,tokenHash,{allowRegistering=false}={}){
    const session=this.db.prepare('SELECT s.*,u.email,u.disabled FROM vps_sessions s JOIN vps_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=?').get(tokenHash,subject);
    if(!session||session.disabled||session.expires_at*1000<=this.now()||this.pending(subject)||!this.connectionCurrent())return null;
    if(!allowRegistering&&!this.sessionAllowed(subject,tokenHash))return null;
    return session;
  }
  prepareEnrollment(c,subject,session,lookup){
    requireValue(!this.pending(subject)&&this.eligible(subject),'NEEDS_REAUTH');
    const fingerprint=this.fingerprint(subject,c),ref=sessionReference(c.issuer,subject,session.token_hash);
    requireValue(lookup.current.phase==='ACTIVE'&&(!lookup.principal||(lookup.principal.state==='ACTIVE'&&lookup.principal.minimumEpoch<=lookup.principal.epoch&&lookup.principal.securityFingerprint===fingerprint&&lookup.principal.sourcePolicyVersion===c.policyVersion)),'NEEDS_REAUTH');
    requireValue(!lookup.session||lookup.session.state==='ACTIVE','NEEDS_REAUTH');
    const previous=this.db.prepare('SELECT * FROM vps_federation_sessions WHERE authority_id=? AND session_ref=?').get(c.authorityId,ref);
    requireValue(!previous||previous.state!=='REVOKED','NEEDS_REAUTH');
    requireValue(previous?.state==='ACTIVE'||this.freshReauth(subject,session.token_hash),'NEEDS_REAUTH');
    const epoch=lookup.principal?.epoch??1,operationId=previous?.registration_operation_id??randomUUID();
    const payload={subject,sessionRef:ref,epoch,securityFingerprint:fingerprint,sessionExpiresAt:new Date(session.expires_at*1000).toISOString(),sourcePolicyVersion:c.policyVersion};
    this.db.prepare(`INSERT INTO vps_federation_principals(authority_id,subject,epoch,minimum_epoch,security_fingerprint,source_policy_version,state)
      VALUES(?,?,?,?,?,?,'REGISTERING') ON CONFLICT(authority_id,subject) DO NOTHING`).run(c.authorityId,subject,epoch,epoch,fingerprint,c.policyVersion);
    this.db.prepare(`INSERT INTO vps_federation_sessions(authority_id,session_ref,subject,token_hash,epoch,security_fingerprint,expires_at,state,registration_operation_id)
      VALUES(?,?,?,?,?,?,?,'REGISTERING',?) ON CONFLICT(authority_id,session_ref) DO NOTHING`)
      .run(c.authorityId,ref,subject,session.token_hash,epoch,fingerprint,payload.sessionExpiresAt,operationId);
    return {c,payload,operationId};
  }
  async completeEnrollment(prepared){
    const {c,payload,operationId}=prepared;
    const key=c.authorityId+'\0'+payload.sessionRef;
    requireValue(!this.activeRegistrations.has(key),'FEDERATION_PENDING');this.activeRegistrations.add(key);
    try{
    await this.wire(c,'REGISTER_SESSION',payload,{operationId});
    const lookup=await this.lookup(c,payload.subject,payload.sessionRef);
    requireValue(lookup.current.phase==='ACTIVE'&&lookup.principal?.state==='ACTIVE'&&lookup.session?.state==='ACTIVE'&&
      lookup.principal.epoch===payload.epoch&&lookup.principal.minimumEpoch<=payload.epoch&&lookup.session.epoch===payload.epoch&&
      lookup.principal.securityFingerprint===payload.securityFingerprint&&lookup.session.securityFingerprint===payload.securityFingerprint&&
      lookup.session.expiresAt===payload.sessionExpiresAt,'NEEDS_REAUTH');
    requireValue(!this.pending(payload.subject)&&this.eligible(payload.subject)&&this.fingerprint(payload.subject,c)===payload.securityFingerprint,'NEEDS_REAUTH');
    return payload;
    }finally{this.activeRegistrations.delete(key);}
  }
  async resumeRegistrations(){
    requireValue(this.connectionCurrent(),'FEDERATION_RECONCILING');const results=[];
    const rows=this.db.prepare("SELECT * FROM vps_federation_sessions WHERE state='REGISTERING' AND token_hash IS NOT NULL ORDER BY authority_id,session_ref LIMIT 5").all();
    for(const row of rows){
      if(this.activeRegistrations.has(row.authority_id+'\0'+row.session_ref)||this.pending(row.subject))continue;
      try{
        const c=this.authority(row.authority_id),lookup=await this.lookup(c,row.subject,row.session_ref);
        if(lookup.principal?.state==='ACTIVE'&&lookup.session?.state==='ACTIVE'&&lookup.principal.epoch===lookup.session.epoch&&lookup.principal.minimumEpoch<=lookup.session.epoch&&
          lookup.session.securityFingerprint===this.fingerprint(row.subject,c)&&this.localSession(row.subject,row.token_hash)){
          results.push({state:'REGISTERED'});continue;
        }
        await this.mutate({subject:row.subject,kind:'REVOKE_SESSION',scope:'SESSION',sessionHashes:[row.token_hash],pureRevocation:true,
          authorize:()=>Boolean(this.db.prepare('SELECT 1 FROM vps_federation_sessions WHERE authority_id=? AND session_ref=?').get(row.authority_id,row.session_ref)),
          apply:()=>({revoked:Number(this.db.prepare('DELETE FROM vps_sessions WHERE user_id=? AND token_hash=?').run(row.subject,row.token_hash).changes)})});
        results.push({state:'REVOKED'});
      }catch(error){results.push({state:error.code??'FEDERATION_PENDING'});}
    }
    return results;
  }
  async enroll(subject,tokenHash,authorityId){
    this.configCurrent();requireValue(this.ready,'FEDERATION_RECONCILING');
    const c=this.authority(authorityId),before=this.localSession(subject,tokenHash,{allowRegistering:true}),witness=this.witness(subject);
    requireValue(before&&this.eligible(subject),'NEEDS_REAUTH');
    const ref=sessionReference(c.issuer,subject,tokenHash),lookup=await this.lookup(c,subject,ref);
    let prepared;
    this.transaction(()=>{
      requireValue(this.localSession(subject,tokenHash,{allowRegistering:true})&&this.witness(subject)===witness,'NEEDS_REAUTH');
      prepared=this.prepareEnrollment(c,subject,before,lookup);
    });
    const payload=await this.completeEnrollment(prepared);
    requireValue(this.localSession(subject,tokenHash)&&this.witness(subject)===witness,'NEEDS_REAUTH');
    return payload;
  }
  async issueSession(subject,plan){
    this.configCurrent();requireValue(this.ready&&!this.pending(subject),'FEDERATION_RECONCILING');
    requireValue(!this.db.prepare("SELECT 1 FROM vps_federation_operations WHERE subject=? AND scope='PRINCIPAL' AND state='ABORTED_FENCED'").get(subject),'REENTRY_REQUIRED');
    const witness=this.witness(subject),lookups=[];
    requireValue(plan.authorize()===true,'NEEDS_REAUTH');
    for(const c of this.authorities.values()){
      const lookup=await this.lookup(c,subject,sessionReference(c.issuer,subject,plan.tokenHash));
      requireValue(!this.db.prepare("SELECT 1 FROM vps_federation_principals WHERE authority_id=? AND subject=? AND state='RECOVERY_REQUIRED'").get(c.authorityId,subject),'FEDERATION_RECOVERY_REQUIRED');
      requireValue(lookup.current.phase==='ACTIVE','FEDERATION_RECONCILING');lookups.push({c,lookup});
    }
    let result;const prepared=[];
    this.transaction(()=>{
      requireValue(!this.pending(subject)&&this.witness(subject)===witness&&plan.authorize()===true,'NEEDS_REAUTH');
      for(const {c,lookup} of lookups){
        const local=this.db.prepare('SELECT 1 FROM vps_federation_principals WHERE authority_id=? AND subject=? UNION SELECT 1 FROM vps_federation_sessions WHERE authority_id=? AND subject=? LIMIT 1').get(c.authorityId,subject,c.authorityId,subject);
        requireValue(lookup.hasDependencies||!local,'FEDERATION_CONFLICT');
      }
      result=this.permits.issue(subject,plan.tokenHash,plan.apply);
      if(plan.passwordVerified)this.db.prepare('INSERT INTO vps_federation_reauth(token_hash,user_id,witness,checked_at,expires_at) VALUES(?,?,?,?,?)')
        .run(plan.tokenHash,subject,witness,this.now(),this.now()+300_000);
      const session=this.db.prepare('SELECT * FROM vps_sessions WHERE token_hash=? AND user_id=?').get(plan.tokenHash,subject);requireValue(session);
      for(const {c,lookup} of lookups)if(lookup.hasDependencies)prepared.push(this.prepareEnrollment(c,subject,session,lookup));
    });
    for(const item of prepared)await this.completeEnrollment(item);
    requireValue(this.localSession(subject,plan.tokenHash)&&this.witness(subject)===witness&&plan.authorize()===true,'NEEDS_REAUTH');
    return result;
  }

  reauthenticate(subject,tokenHash,password){
    this.configCurrent();requireValue(this.localSession(subject,tokenHash)&&this.eligible(subject),'NEEDS_REAUTH');
    const bucket=Math.floor(this.now()/900_000),key='federation-reauth:'+digest(subject+'\0'+bucket);
    const limit=this.db.prepare('INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<5 RETURNING attempts').get(key,(bucket+1)*900);
    requireValue(limit,'RATE_LIMITED');
    const user=this.db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=? AND disabled=0').get(subject);
    requireValue(user&&verifyCredentialPassword(user,password),'NEEDS_REAUTH');
    const checkedAt=this.now();
    this.db.prepare(`INSERT INTO vps_federation_reauth(token_hash,user_id,witness,checked_at,expires_at) VALUES(?,?,?,?,?)
      ON CONFLICT(token_hash) DO UPDATE SET user_id=excluded.user_id,witness=excluded.witness,checked_at=excluded.checked_at,expires_at=excluded.expires_at`)
      .run(tokenHash,subject,this.witness(subject),checkedAt,checkedAt+300_000);
    return checkedAt;
  }
  freshReauth(subject,tokenHash){
    if(!this.localSession(subject,tokenHash))return null;
    const row=this.db.prepare('SELECT * FROM vps_federation_reauth WHERE token_hash=? AND user_id=?').get(tokenHash,subject);
    return row&&row.expires_at>=this.now()&&row.checked_at<=this.now()&&row.witness===this.witness(subject)?row:null;
  }
  async inspectLink({subject,tokenHash,authorityId,code}){
    requireValue(this.localSession(subject,tokenHash)&&this.eligible(subject),'NEEDS_REAUTH');
    requireValue(typeof code==='string'&&/^KNABA-LINK-[A-Za-z0-9_-]{43}$/.test(code),'FEDERATION_INVALID');
    const c=this.authority(authorityId),witness=this.witness(subject);
    const response=await this.wire(c,'INSPECT_CHALLENGE',{code},{fresh:true}),info=response.receipt.result;
    requireValue(uuidPattern.test(info.challengeId)&&typeof info.companyLabel==='string'&&info.companyLabel.length<=160&&typeof info.erpUserLabel==='string'&&info.erpUserLabel.length<=160&&
      Date.parse(info.expiresAt)>this.now()&&Date.parse(info.expiresAt)<=this.now()+300_000,'FEDERATION_INVALID');
    requireValue(this.localSession(subject,tokenHash)&&this.witness(subject)===witness,'NEEDS_REAUTH');
    for(const [key,value] of this.inspections)if(value.expiresAt<=this.now())this.inspections.delete(key);
    requireValue(this.inspections.size<256,'RATE_LIMITED');
    const inspectionId=randomUUID();this.inspections.set(inspectionId,{subject,tokenHash,authorityId,code,witness,info,expiresAt:Date.parse(info.expiresAt)});
    return {inspectionId,...info,siteLabel:sourceLabel(this.db,subject)};
  }
  async claimLink({subject,tokenHash,inspectionId,password,confirmed}){
    const inspection=this.inspections.get(inspectionId);
    requireValue(confirmed===true&&inspection?.subject===subject&&inspection.tokenHash===tokenHash&&inspection.expiresAt>this.now()&&inspection.witness===this.witness(subject),'NEEDS_REAUTH');
    const reauthAt=this.reauthenticate(subject,tokenHash,password),c=this.authority(inspection.authorityId);
    const source=await this.enroll(subject,tokenHash,c.authorityId);
    requireValue(this.inspections.get(inspectionId)===inspection&&this.freshReauth(subject,tokenHash)&&this.witness(subject)===inspection.witness,'NEEDS_REAUTH');
    const generation=this.state(c.authorityId).generation,claimId=inspection.info.challengeId,operationId=randomUUID();
    requireValue(!this.db.prepare('SELECT 1 FROM vps_federation_claims WHERE authority_id=? AND challenge_id=?').get(c.authorityId,claimId),'FEDERATION_CONFLICT');
    this.db.prepare(`INSERT INTO vps_federation_claims(authority_id,challenge_id,subject,session_ref,epoch,security_fingerprint,generation,reauth_at,expires_at,claim_operation_id,state)
      VALUES(?,?,?,?,?,?,?,?,?,?,'CLAIMING')`).run(c.authorityId,claimId,subject,source.sessionRef,source.epoch,source.securityFingerprint,generation,new Date(reauthAt).toISOString(),inspection.info.expiresAt,operationId);
    try{
      const response=await this.wire(c,'CLAIM',{code:inspection.code,subject,sessionRef:source.sessionRef,epoch:source.epoch,securityFingerprint:source.securityFingerprint,
        sourcePolicyVersion:c.policyVersion,reauthAt:new Date(reauthAt).toISOString(),siteLabel:sourceLabel(this.db,subject)},{operationId,fresh:true});
      requireValue(response.receipt.result.challengeId===claimId&&response.receipt.result.state==='CLAIMED','FEDERATION_CONFLICT');
      requireValue(this.localSession(subject,tokenHash)&&this.freshReauth(subject,tokenHash)&&this.witness(subject)===inspection.witness&&this.state(c.authorityId).generation===generation,'NEEDS_REAUTH');
      this.db.prepare("UPDATE vps_federation_claims SET state='CLAIMED' WHERE authority_id=? AND challenge_id=?").run(c.authorityId,claimId);
      return {challengeId:claimId,state:'CLAIMED',expiresAt:inspection.info.expiresAt};
    }finally{this.inspections.delete(inspectionId);}
  }
  async linkStatus(subject,tokenHash){
    requireValue(this.localSession(subject,tokenHash),'NEEDS_REAUTH');const witness=this.witness(subject),statuses=[];
    for(const c of this.authorities.values()){
      const ref=sessionReference(c.issuer,subject,tokenHash),lookup=await this.lookup(c,subject,ref);
      if(!lookup.hasDependencies){statuses.push({authorityId:c.authorityId,bindings:[],challenges:[],erpAccountUrl:c.erpOrigin+'/account/site-links'});continue;}
      const source=await this.enroll(subject,tokenHash,c.authorityId);
      const response=await this.wire(c,'LINK_STATUS',{subject,sessionRef:source.sessionRef,epoch:source.epoch,securityFingerprint:source.securityFingerprint,sourcePolicyVersion:c.policyVersion},{fresh:true});
      const value=response.receipt.result;
      requireValue(Array.isArray(value.bindings)&&Array.isArray(value.challenges)&&value.bindings.length<=100&&value.challenges.length<=8);
      requireValue(this.localSession(subject,tokenHash)&&this.witness(subject)===witness,'NEEDS_REAUTH');
      statuses.push({authorityId:c.authorityId,...value,erpAccountUrl:c.erpOrigin+'/account/site-links'});
    }
    return statuses;
  }

  introspect(headers,body){
    this.configCurrent();const id=headers instanceof Headers?headers.get('x-knaba-federation-authority'):headers['x-knaba-federation-authority'];
    const c=this.authority(id),wire=verifyFederationRequest(c,'ERP_TO_SITE',headers,body);
    const input=wire.envelope.payload;
    let loginInput=null;
    if(input?.purpose==='SESSION_ISSUE'||input?.purpose==='SESSION_USE'){
      try{loginInput=parseFederationLoginIntrospection(input);}catch{/* Signed invalid input uses the same bounded failure below. */}
    }
    const keys=['subject','sessionRef','epoch','securityFingerprint','sourcePolicyVersion','challengeId','purpose'];
    // Valid authentication establishes the response signing context even when
    // the application payload is invalid. Return only a bounded public code.
    if(!(wire.envelope.action==='INTROSPECT'&&(loginInput||(record(input)&&Object.keys(input).length===keys.length&&keys.every(k=>Object.hasOwn(input,k))&&
      typeof input.subject==='string'&&input.subject.length>=1&&input.subject.length<=128&&Buffer.byteLength(input.subject,'utf8')<=128&&!/[\u0000-\u0020\u007f]/.test(input.subject)&&
      refPattern.test(input.sessionRef)&&integer(input.epoch)&&input.epoch>0&&input.epoch<=2_147_483_647&&hashPattern.test(input.securityFingerprint)&&input.sourcePolicyVersion===c.policyVersion&&uuidPattern.test(input.challengeId)&&input.purpose==='LINK_CONFIRM'))))
      return makeFederationResponse(c,wire,{ok:false,error:{code:'VALIDATION_ERROR'}},400);
    let value={active:false};
    try{this.transaction(()=>{
      // SQLite may have waited for another writer after the first verification.
      // Reuse the protocol verifier and its exact time/skew rules at the locked
      // decision boundary, before recording a nonce or emitting a source proof.
      verifyFederationRequest(c,'ERP_TO_SITE',headers,body,this.now());
      this.db.prepare('DELETE FROM vps_federation_nonces WHERE expires_at<?').run(this.now());
      requireValue(!this.db.prepare('SELECT 1 FROM vps_federation_nonces WHERE authority_id=? AND nonce_hash=?').get(c.authorityId,wire.nonceHash),'FEDERATION_REPLAY');
      const prior=this.db.prepare('SELECT digest FROM vps_federation_inbound_operations WHERE authority_id=? AND operation_id=?').get(c.authorityId,wire.operationId);
      requireValue(!prior||prior.digest===wire.operationDigest,'FEDERATION_CONFLICT');
      this.db.prepare('INSERT INTO vps_federation_nonces(authority_id,nonce_hash,expires_at) VALUES(?,?,?)').run(c.authorityId,wire.nonceHash,this.now()+120_000);
      this.db.prepare('INSERT INTO vps_federation_inbound_operations(authority_id,operation_id,digest) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(c.authorityId,wire.operationId,wire.operationDigest);
      if(loginInput){value=this.login?.introspect(c,wire,loginInput)??{active:false};return;}
      const state=this.state(c.authorityId),claim=this.db.prepare('SELECT * FROM vps_federation_claims WHERE authority_id=? AND challenge_id=?').get(c.authorityId,input.challengeId);
      const tokenHash=this.tokenHash(c,input.subject,input.sessionRef),session=tokenHash&&this.localSession(input.subject,tokenHash),reauth=tokenHash&&this.freshReauth(input.subject,tokenHash);
      const p=this.db.prepare('SELECT * FROM vps_federation_principals WHERE authority_id=? AND subject=?').get(c.authorityId,input.subject);
      if(this.ready&&state?.phase==='ACTIVE'&&state.generation===wire.generation&&claim&&claim.subject===input.subject&&claim.session_ref===input.sessionRef&&claim.generation===wire.generation&&claim.epoch===input.epoch&&
        claim.security_fingerprint===input.securityFingerprint&&Date.parse(claim.expires_at)>this.now()&&session&&reauth&&reauth.checked_at>=Date.parse(claim.reauth_at)&&this.eligible(input.subject)&&
        p?.state==='ACTIVE'&&p.epoch===input.epoch&&p.minimum_epoch<=input.epoch&&this.fingerprint(input.subject,c)===input.securityFingerprint){
        value={active:true,subject:input.subject,sessionRef:input.sessionRef,epoch:input.epoch,securityFingerprint:input.securityFingerprint,sourcePolicyVersion:c.policyVersion,generation:wire.generation,
          reauthAt:new Date(reauth.checked_at).toISOString(),sessionExpiresAt:new Date(session.expires_at*1000).toISOString(),siteLabel:sourceLabel(this.db,input.subject)};
      }
    });}catch(error){
      const code=['FEDERATION_REPLAY','FEDERATION_CONFLICT','FEDERATION_AUTH_FAILED'].includes(error?.code)?error.code:'FEDERATION_UNAVAILABLE';
      return makeFederationResponse(c,wire,{ok:false,error:{code}},code==='FEDERATION_UNAVAILABLE'?503:code==='FEDERATION_AUTH_FAILED'?401:409);
    }
    return makeFederationResponse(c,wire,value);
  }
}
