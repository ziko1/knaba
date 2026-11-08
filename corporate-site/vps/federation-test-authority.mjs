/** Synthetic signed HTTP authority for source tests. PostgreSQL acceptance is separate. */
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {normalizeAuthority,verifyFederationRequest,makeFederationResponse} from '../../erp/packages/integrations/site-federation-protocol.mjs';

export async function testAuthority(t,{authorityId='synthetic',companyId='company-test'}={}){
  const config=normalizeAuthority({authorityId,companyId,issuer:'https://site.example.test',siteOrigin:'https://site.example.test',erpOrigin:'https://erp.example.test',
    erpAudience:'urn:knaba:erp',siteAudience:'urn:knaba:site',policyVersion:1,
    siteToErp:{kid:'site-key',secret:randomBytes(32).toString('base64url')},erpToSite:{kid:'erp-key',secret:randomBytes(32).toString('base64url')}});
  const ledger={generation:0,revision:0,phase:'RECONCILING',principals:new Map(),sessions:new Map(),receipts:new Map(),nonces:new Set(),challenges:new Map(),requests:[],before:null,after:null};
  const code='KNABA-LINK-'+randomBytes(32).toString('base64url');
  ledger.challenges.set(code,{challengeId:randomUUID(),companyLabel:'Synthetic Company',erpUserLabel:'Synthetic ERP User',expiresAt:new Date(Date.now()+300_000).toISOString(),state:'ISSUED'});
  const current=()=>({generation:ledger.generation,revision:ledger.revision,phase:ledger.phase,policyVersion:config.policyVersion});
  const reject=code=>{throw Object.assign(new Error(code),{code});};
  const server=createServer(async(req,res)=>{
    let wire;
    try{
      if(req.method!=='POST'||req.url!=='/api/v1/federation/authority')return res.writeHead(404).end();
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      wire=verifyFederationRequest(config,'SITE_TO_ERP',req.headers,Buffer.concat(chunks));
      const {action,payload:p}=wire.envelope;
      ledger.requests.push({action,operationId:wire.operationId,nonce:wire.nonce,digest:wire.operationDigest,payload:p});
      if(ledger.nonces.has(wire.nonce))reject('FEDERATION_REPLAY');ledger.nonces.add(wire.nonce);
      await ledger.before?.(wire);
      const prior=ledger.receipts.get(wire.operationId);let receipt;
      if(prior){if(prior.digest!==wire.operationDigest)reject('FEDERATION_CONFLICT');receipt=prior.receipt;}
      else{
        let value;
        if(action==='BOOTSTRAP_AUTHORITY'){
          ledger.generation++;ledger.revision++;ledger.phase='RECONCILING';ledger.reconciled=false;
          value={instanceId:p.instanceId,generation:ledger.generation,snapshotRevision:ledger.revision};
        }else{
          if(wire.generation!==ledger.generation)reject('FEDERATION_GENERATION');
          if(action==='RECONCILE_PAGE'){
            if(ledger.phase!=='RECONCILING'||p.cursor!==null||p.snapshotRevision!==null)reject('FEDERATION_CONFLICT');
            const records=[...ledger.principals.values(),...ledger.sessions.values()];if(records.length>50)throw Error('Fixture page overflow');
            ledger.reconciled=true;value={generation:ledger.generation,snapshotRevision:ledger.revision,records,cursor:null,done:true};
          }else if(action==='ACTIVATE_AUTHORITY'){
            if(!ledger.reconciled||ledger.phase!=='RECONCILING'||p.snapshotRevision!==ledger.revision)reject('FEDERATION_CONFLICT');
            ledger.phase='ACTIVE';value={activated:true,generation:ledger.generation,snapshotRevision:ledger.revision};
          }else if(action==='LOOKUP_PRINCIPAL'){
            const principal=ledger.principals.get(p.subject)??null,session=p.sessionRef?ledger.sessions.get(p.sessionRef)??null:null;
            value={subject:p.subject,hasDependencies:Boolean(principal||[...ledger.sessions.values()].some(s=>s.subject===p.subject)),principal,session};
          }else if(action==='FENCE'){
            if(p.scope==='PRINCIPAL'){
              const old=ledger.principals.get(p.subject);
              if(!old||old.minimumEpoch<p.nextEpoch)ledger.principals.set(p.subject,{kind:'PRINCIPAL',subject:p.subject,epoch:old?.epoch??0,minimumEpoch:p.nextEpoch,
                state:'FENCED',securityFingerprint:old?.securityFingerprint??null,sourcePolicyVersion:1,version:(old?.version??0)+1,fenceOperationId:wire.operationId});
              const next=ledger.principals.get(p.subject);
              value={scope:p.scope,subject:p.subject,minimumEpoch:next.minimumEpoch,sessionCount:0,fenceOperationId:next.fenceOperationId};
            }else{
              for(const ref of p.sessionRefs){const old=ledger.sessions.get(ref);ledger.sessions.set(ref,{kind:'SESSION',subject:p.subject,sessionRef:ref,epoch:old?.epoch??null,
                securityFingerprint:old?.securityFingerprint??null,expiresAt:old?.expiresAt??null,state:'REVOKED',version:(old?.version??0)+1});}
              value={scope:p.scope,subject:p.subject,minimumEpoch:null,sessionCount:p.sessionRefs.length,fenceOperationId:wire.operationId};
            }
            ledger.revision++;ledger.reconciled=false;
          }else if(action==='ACTIVATE_EPOCH'){
            const old=ledger.principals.get(p.subject);
            if(ledger.phase!=='ACTIVE'||!old||old.state!=='FENCED'||old.minimumEpoch!==p.epoch||old.fenceOperationId!==p.fenceOperationId)reject('FEDERATION_CONFLICT');
            Object.assign(old,{state:'ACTIVE',epoch:p.epoch,securityFingerprint:p.securityFingerprint,version:old.version+1});ledger.revision++;
            value={subject:p.subject,epoch:p.epoch,principalVersion:old.version};
          }else if(action==='REGISTER_SESSION'){
            const old=ledger.principals.get(p.subject),existing=ledger.sessions.get(p.sessionRef);
            if(ledger.phase!=='ACTIVE'||(existing&&existing.state!=='ACTIVE')||(old&&(old.state!=='ACTIVE'||old.minimumEpoch>p.epoch||old.epoch!==p.epoch||old.securityFingerprint!==p.securityFingerprint)))reject('NEEDS_REAUTH');
            if(!old){if(p.epoch!==1)reject('NEEDS_REAUTH');ledger.principals.set(p.subject,{kind:'PRINCIPAL',subject:p.subject,epoch:1,minimumEpoch:1,state:'ACTIVE',securityFingerprint:p.securityFingerprint,sourcePolicyVersion:1,version:1,fenceOperationId:null});}
            if(!existing){ledger.sessions.set(p.sessionRef,{kind:'SESSION',subject:p.subject,sessionRef:p.sessionRef,epoch:p.epoch,securityFingerprint:p.securityFingerprint,expiresAt:p.sessionExpiresAt,state:'ACTIVE',version:1});ledger.revision++;}
            value={subject:p.subject,sessionRef:p.sessionRef,epoch:p.epoch,principalVersion:ledger.principals.get(p.subject).version,sessionVersion:1};
          }else if(action==='INSPECT_CHALLENGE'){
            const challenge=ledger.challenges.get(p.code);if(!challenge||challenge.state!=='ISSUED')reject('FEDERATION_CONFLICT');
            const {challengeId,companyLabel,erpUserLabel,expiresAt}=challenge;value={challengeId,companyLabel,erpUserLabel,expiresAt};
          }else if(action==='CLAIM'){
            const challenge=ledger.challenges.get(p.code),principal=ledger.principals.get(p.subject),session=ledger.sessions.get(p.sessionRef);
            if(!challenge||challenge.state!=='ISSUED'||principal?.state!=='ACTIVE'||session?.state!=='ACTIVE'||session.epoch!==principal.epoch)reject('FEDERATION_CONFLICT');
            Object.assign(challenge,{state:'CLAIMED',subject:p.subject,sessionRef:p.sessionRef,generation:ledger.generation});ledger.revision++;
            value={challengeId:challenge.challengeId,state:'CLAIMED',expiresAt:challenge.expiresAt};
          }else if(action==='LINK_STATUS'){
            value={bindings:[],challenges:[...ledger.challenges.values()].filter(x=>x.subject===p.subject&&x.sessionRef===p.sessionRef).map(({challengeId,state,expiresAt})=>({challengeId,state,expiresAt}))};
          }else reject('VALIDATION_ERROR');
        }
        receipt={operationId:wire.operationId,action,generation:ledger.generation,revision:ledger.revision,result:value};
        ledger.receipts.set(wire.operationId,{digest:wire.operationDigest,receipt:structuredClone(receipt)});
      }
      if(await ledger.after?.(wire,res)===false)return;
      const reply=makeFederationResponse(config,wire,{ok:true,receipt,current:current()});res.writeHead(reply.status,reply.headers).end(reply.body);
    }catch(error){
      if(!wire)return res.writeHead(401).end();
      const reply=makeFederationResponse(config,wire,{ok:false,error:{code:error.code??'FEDERATION_UNAVAILABLE'},current:current()},409);res.writeHead(reply.status,reply.headers).end(reply.body);
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base='http://127.0.0.1:'+server.address().port;
  return {config,ledger,code,fetchImpl:(url,options)=>{
    if(url!==config.erpOrigin+'/api/v1/federation/authority')throw Error('Unexpected synthetic origin or path');
    return fetch(base+'/api/v1/federation/authority',options);
  }};
}
