/** Synthetic signed HTTP authority: never a PostgreSQL/F1 acceptance result. */
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser} from './auth.mjs';
import {createSourceFederation} from './federation-entry.mjs';
import {testAuthority} from './federation-test-authority.mjs';
import {makeFederationRequest,verifyFederationResponse} from '../../erp/packages/integrations/site-federation-protocol.mjs';
import {parseFederationLoginAction} from '../../erp/packages/integrations/site-federation-login-protocol.mjs';

export const loginTestPassword='synthetic-f3-site-password-2026';
export const loginSha=value=>createHash('sha256').update(value).digest('hex');
export function enableLoginTestAuthority(authority){
  const {ledger,config}=authority,requests=new Map();
  const createRequest=()=>{
    const requestId=randomUUID(),requestBinding=loginSha(requestId);
    const row={requestId,requestBinding,version:2,state:'BROWSER_BOUND',expiresAt:new Date(Date.now()+300000).toISOString(),
      companyLabel:'Synthetic Company',client:{clientId:'knaba-web-v1',kind:'WEB',platform:'WEB',label:'KNABA Web'},
      returnUrl:config.erpOrigin+'/auth/federation/return?request_id='+requestId,loginPolicyVersion:1,loginPolicyFingerprint:loginSha('synthetic-erp-policy'),source:null};
    requests.set(requestId,row);return row;
  };
  const reject=()=>{throw Object.assign(Error('Synthetic scoped conflict'),{code:'FEDERATION_CONFLICT'});};
  ledger.action=wire=>{
    const {action}=wire.envelope,p=parseFederationLoginAction(action,wire.envelope.payload),row=requests.get(p.requestId);
    if(!row||ledger.phase!=='ACTIVE')reject();
    if(action==='LOGIN_INSPECT'){
      if(row.state!=='BROWSER_BOUND')reject();
      const {requestId,requestBinding,version,expiresAt,companyLabel,client,returnUrl,loginPolicyVersion,loginPolicyFingerprint}=row;
      return {requestId,requestBinding,version,expiresAt,companyLabel,client,returnUrl,loginPolicyVersion,loginPolicyFingerprint};
    }
    if(action==='LOGIN_APPROVE'){
      const principal=ledger.principals.get(p.subject),session=ledger.sessions.get(p.sessionRef);
      if(row.state!=='BROWSER_BOUND'||p.requestBinding!==row.requestBinding||p.expectedVersion!==row.version||
        p.loginPolicyVersion!==row.loginPolicyVersion||p.loginPolicyFingerprint!==row.loginPolicyFingerprint||
        principal?.state!=='ACTIVE'||session?.state!=='ACTIVE'||principal.epoch!==p.epoch||session.securityFingerprint!==p.securityFingerprint)reject();
      row.source=structuredClone(p);row.state='SOURCE_APPROVED';row.version++;ledger.revision++;
      return {requestId:row.requestId,state:row.state,version:row.version,expiresAt:row.expiresAt,returnUrl:row.returnUrl};
    }
    if(action==='LOGIN_STATUS'){
      if(!row.source||['subject','sessionRef','epoch','securityFingerprint','sourcePolicyVersion','requestBinding'].some(k=>row.source[k]!==p[k]))reject();
      return {requestId:row.requestId,state:row.state,version:row.version,expiresAt:row.expiresAt};
    }
    reject();
  };
  return {requests,createRequest};
}
export async function loginFixture(t,{enabled=true}={}){
  const directory=mkdtempSync(join(tmpdir(),'knaba-f3-source-')),path=join(directory,'auth.sqlite'),db=openLocalDatabase(path).db;
  const user=createCredentialsUser(db,'source@example.test',loginTestPassword),other=createCredentialsUser(db,'other@example.test',loginTestPassword);
  for(const u of [user,other])db.prepare(`INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation)
    VALUES(?,?,?,'client','client','approved','2026-10-28','2026-11-08','2026-11-08',1,'fixture')`).run(u.id,'Synthetic '+u.id.slice(0,4),u.email);
  const session=createSessionForUser(db,user.id),otherSession=createSessionForUser(db,other.id),tokenHash=loginSha(session.token);
  const authority=await testAuthority(t),testLogin=enableLoginTestAuthority(authority);
  const environment={KNABA_FEDERATION_ENABLED:'approved',KNABA_FEDERATION_AUTHORITIES:JSON.stringify([authority.config]),
    KNABA_FEDERATION_LOGIN_JSON:JSON.stringify(enabled?{enabled:true,authorityIds:[authority.config.authorityId],policyVersion:1}:{enabled:false})};
  const state={directory,path,db,user,other,session,otherSession,tokenHash,otherHash:loginSha(otherSession.token),environment,
    ...authority,...testLogin,coordinator:null};
  state.coordinator=await createSourceFederation({db,environment,origin:authority.config.siteOrigin,mode:'TEST',ownerPolicy:{},fetchImpl:authority.fetchImpl});
  t.after(()=>{state.coordinator.close();db.close();rmSync(directory,{recursive:true,force:true});});
  state.inspect=async(request=state.createRequest())=>({request,inspection:await state.coordinator.login.inspect({subject:user.id,tokenHash,authorityId:authority.config.authorityId,requestId:request.requestId})});
  state.approve=async value=>state.coordinator.login.approve({subject:user.id,tokenHash,inspectionId:value.inspection.inspectionId,password:loginTestPassword,confirmed:true});
  state.status=request=>state.coordinator.login.status({subject:user.id,tokenHash,authorityId:authority.config.authorityId,requestId:request.requestId});
  state.input=(request,purpose='SESSION_ISSUE')=>{
    const p=request.source;return {purpose,requestId:request.requestId,requestBinding:request.requestBinding,subject:p.subject,sessionRef:p.sessionRef,
      epoch:p.epoch,securityFingerprint:p.securityFingerprint,sourcePolicyVersion:p.sourcePolicyVersion,loginPolicyVersion:p.loginPolicyVersion,
      loginPolicyFingerprint:p.loginPolicyFingerprint,sourceLoginPolicyFingerprint:p.sourceLoginPolicyFingerprint,...(purpose==='SESSION_USE'?{erpSessionId:randomUUID()}:{})};
  };
  state.proof=(input,request)=>{
    const packet=request??makeFederationRequest(authority.config,'ERP_TO_SITE','INTROSPECT',input,{generation:authority.ledger.generation});
    const response=state.coordinator.introspect(packet.headers,packet.body);
    return {packet,response,value:verifyFederationResponse(authority.config,packet.context,response.status,new Headers(response.headers),response.body)};
  };
  return state;
}
