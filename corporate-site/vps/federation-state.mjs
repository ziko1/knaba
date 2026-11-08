/** Connection-local capabilities. No permit survives a transaction or an await. */
const connections=new WeakMap();
export class FederationSourceError extends Error{
  constructor(code='FEDERATION_UNAVAILABLE',operationId){
    super('Federation action unavailable');this.name='FederationSourceError';this.code=code;
    if(operationId)this.operationId=operationId;
  }
}
const fail=(code,id)=>{throw new FederationSourceError(code,id);};
const unresolved="('PENDING_DENY','FENCED','SOURCE_COMMITTED','ABORTED_FENCED')";

export function installFederationGuard(db){
  if(connections.has(db))return;
  const state={coordinator:null,permit:null};connections.set(db,state);
  db.function('knaba_federation_permit_active',()=>Number(Boolean(state.permit)));
  db.function('knaba_federation_write_allowed',(subject,kind,tokenHash)=>{
    const p=state.permit;
    if(!p||!db.isTransaction||p.subject!==subject)return 0;
    if(p.kind==='ISSUANCE')return Number(kind==='SESSION_INSERT'&&p.hashes.has(tokenHash));
    if(p.kind==='RECONCILE')return Number(kind==='SESSION_DELETE'&&p.hashes.has(tokenHash));
    if(p.scope==='SESSION')return Number(kind==='SESSION_DELETE'&&p.hashes.has(tokenHash));
    return Number(p.scope==='PRINCIPAL'&&kind!=='IDENTITY_UPDATE'&&kind!=='SESSION_INSERT');
  });
}

function hasSchema(db){return connections.has(db)&&Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE name='vps_federation_authorities' AND type='table'").get());}
export function hasFederationObligation(db,subject){
  if(!hasSchema(db))return false;
  return Boolean(db.prepare(`SELECT 1 WHERE
    EXISTS(SELECT 1 FROM vps_federation_authorities WHERE phase<>'ACTIVE') OR
    EXISTS(SELECT 1 FROM vps_federation_principals WHERE subject=?) OR
    EXISTS(SELECT 1 FROM vps_federation_sessions WHERE subject=?) OR
    EXISTS(SELECT 1 FROM vps_federation_operations WHERE subject=? AND state IN ${unresolved})`).get(subject,subject,subject));
}
export function inFederationCommit(db){return Boolean(connections.get(db)?.permit?.kind==='MUTATION');}

export function federationSessionAllowed(db,subject,tokenHash){
  if(!hasSchema(db))return true;
  const state=connections.get(db),p=state.permit;
  if(p?.kind==='MUTATION'&&p.subject===subject&&db.isTransaction)return true;
  if(db.prepare("SELECT 1 FROM vps_federation_authorities WHERE phase<>'ACTIVE'").get())return false;
  if(state.coordinator?.connectionCurrent&&!state.coordinator.connectionCurrent())return false;
  if(db.prepare(`SELECT 1 FROM vps_federation_operations o WHERE subject=? AND state IN ${unresolved}
    AND (scope='PRINCIPAL' OR EXISTS(SELECT 1 FROM json_each(o.session_hashes) WHERE value=?))`).get(subject,tokenHash))return false;
  if(db.prepare("SELECT 1 FROM vps_federation_principals WHERE subject=? AND state<>'ACTIVE'").get(subject))return false;
  if(db.prepare("SELECT 1 FROM vps_federation_sessions WHERE subject=? AND token_hash=? AND state<>'ACTIVE'").get(subject,tokenHash))return false;
  if(db.prepare(`SELECT 1 FROM vps_federation_sessions s JOIN vps_federation_principals p
    ON p.authority_id=s.authority_id AND p.subject=s.subject WHERE s.subject=? AND s.token_hash=?
    AND (s.epoch<p.minimum_epoch OR s.epoch<>p.epoch OR s.security_fingerprint<>p.security_fingerprint)`).get(subject,tokenHash))return false;
  // A legacy CLI cannot make a linked session usable merely by opening SQLite.
  return Boolean(state.coordinator)||!hasFederationObligation(db,subject);
}

export function federationMutation(db,plan){
  const state=connections.get(db);
  if(state?.permit?.kind==='MUTATION'){
    // A final transaction owns exactly one already-fenced intent. Nested public
    // mutation entrypoints cannot borrow its authorization for another intent.
    fail('FEDERATION_COORDINATOR_REQUIRED');
  }
  if(state?.coordinator)return state.coordinator.mutate(plan);
  if(hasFederationObligation(db,plan.subject))fail('FEDERATION_COORDINATOR_REQUIRED');
  return plan.apply();
}
export function federationIssueSession(db,subject,plan){
  const coordinator=connections.get(db)?.coordinator;
  if(coordinator)return coordinator.issueSession(subject,plan);
  if(hasFederationObligation(db,subject))fail('FEDERATION_COORDINATOR_REQUIRED');
  return plan.apply();
}
export function federationCoordinator(db){return connections.get(db)?.coordinator??null;}
export function securityTransaction(db,work,{readOnly=false}={}){
  if(db.isTransaction){
    if(!connections.get(db)?.permit)fail('FEDERATION_COORDINATOR_REQUIRED');
    return work();
  }
  db.exec(readOnly?'BEGIN':'BEGIN IMMEDIATE');
  try{const value=work();if(value&&typeof value.then==='function')fail('FEDERATION_ASYNC_TRANSACTION');db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
}

export function bindFederationCoordinator(db,coordinator){
  const state=connections.get(db);
  if(!state||state.coordinator)fail('FEDERATION_COORDINATOR_REQUIRED');
  state.coordinator=coordinator;
  const scoped=(permit,work)=>{
    if(!db.isTransaction||state.permit)fail('FEDERATION_COORDINATOR_REQUIRED');
    state.permit=permit;
    try{const result=work();if(result&&typeof result.then==='function')fail('FEDERATION_ASYNC_TRANSACTION');return result;}
    finally{state.permit=null;}
  };
  return Object.freeze({
    commit(operationId,subject,work){
      const op=db.prepare("SELECT subject,scope,session_hashes FROM vps_federation_operations WHERE operation_id=? AND state='FENCED'").get(operationId);
      if(!op||op.subject!==subject)fail('FEDERATION_COORDINATOR_REQUIRED');
      return scoped({kind:'MUTATION',operationId,subject,scope:op.scope,hashes:new Set(JSON.parse(op.session_hashes))},work);
    },
    issue(subject,tokenHash,work){return scoped({kind:'ISSUANCE',subject,hashes:new Set([tokenHash])},work);},
    reconcile(subject,hashes,work){return scoped({kind:'RECONCILE',subject,hashes:new Set(hashes)},work);},
    close(){if(state.permit)fail('FEDERATION_COORDINATOR_REQUIRED');state.coordinator=null;}
  });
}
