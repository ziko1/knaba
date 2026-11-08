import {createHmac,randomUUID} from 'node:crypto';
import {normalizeEmail} from './auth.mjs';
import {
  MAX_PROOF_AGE_MS,FederationError,challengeTokenPattern,digest,exactObject,
  proofHash,requireActive,requireValue,secureEqual,transportFingerprint,trustFingerprint
} from './site-identity-protocol.mjs';

const uuid4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ordinaryRoles=new Set(['client','worker','partner','bauleiter','admin']);
const previewKeys=['id','challengeDigest','nonceDigest','companyId','issuer','audience','targetUserId',
  'targetDisplayName','targetEmail','companyName','trustFingerprint','expiresAt'];
const proofKeys=['grantToken','challengeId','challengeDigest','nonceDigest','companyId','targetUserId','trustFingerprint'];
const sessionKeys=['companyId','issuer','audience','subject','sessionDigest','profileVersion','profileFingerprint','trustFingerprint','transportFingerprint'];
const hasText=(value,max,empty=false)=>typeof value==='string'&&(empty||value.length>0)&&
  Buffer.byteLength(value)<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const identifier=(value,max)=>hasText(value,max)&&!/[\s]/u.test(value);
function exact(value,keys){
  const result=exactObject(value,keys);
  requireValue(keys.every(key=>Object.hasOwn(result,key)),'VALIDATION_ERROR');
  return result;
}
function sessionDigest(cookieHeader){
  requireValue(typeof cookieHeader==='string'&&Buffer.byteLength(cookieHeader)<=4096);
  const matches=cookieHeader.split(';').map(piece=>piece.trim()).filter(piece=>piece.startsWith('__Host-knaba-session='));
  requireValue(matches.length===1);
  const token=matches[0].slice('__Host-knaba-session='.length);
  requireValue(/^[A-Za-z0-9_-]{43}$/.test(token)&&token.length===43);
  return digest(token);
}
function grantToken(peer,id,challengeDigest){
  const mac=createHmac('sha256',Buffer.from(peer.secret,'base64url'))
    .update(JSON.stringify(['KNABA-SITE-IDENTITY-CONSENT-V1',id,challengeDigest])).digest('base64url');
  return id+'.'+mac;
}
function requestFingerprint(peer,input){
  return digest(JSON.stringify(['KNABA-SITE-IDENTITY-REDEEM-V1',transportFingerprint(peer),
    digest(input.grantToken),input.challengeId,input.challengeDigest,input.nonceDigest,
    input.companyId,input.targetUserId,input.trustFingerprint]));
}

/** VPS authority only. The route owns CSRF and authenticated peer transport; a challenge
 * is the ERP's verified preview, never a set of browser-supplied identity claims.
 * Every database operation is synchronous; no network call occurs under SQLite locks. */
export function createSiteConsentAuthority(db,{config,developerEmail='',clock=Date.now,sessionsEnabled=()=>false}={}){
  requireValue(typeof config==='function'&&typeof clock==='function'&&typeof sessionsEnabled==='function','MISSING_CONFIGURATION');
  const requireSessions=()=>requireValue(sessionsEnabled()===true,'MISSING_CONFIGURATION');
  let developer='';
  try{if(developerEmail)developer=normalizeEmail(developerEmail);}
  catch{throw new FederationError('MISSING_CONFIGURATION');}
  const stamp=()=>{
    const value=clock();
    requireValue(Number.isSafeInteger(value)&&value>=0&&value<=8_640_000_000_000_000);
    return value;
  };
  function transaction(operation,guard=()=>{}){
    guard();
    db.exec('BEGIN IMMEDIATE');
    try{
      const now=stamp(),peer=Object.freeze({...requireActive(config(),now)});
      const trust=trustFingerprint(peer),transport=transportFingerprint(peer);
      const finish=operation(peer,now);
      const checkedAt=stamp(),latest=requireActive(config(),checkedAt);
      requireValue(checkedAt>=now&&secureEqual(trust,trustFingerprint(latest))&&
        secureEqual(transport,transportFingerprint(latest)));
      const result=finish(checkedAt);
      guard();
      db.exec('COMMIT');
      return result;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function actorFor(hash,peer,now){
    const user=db.prepare('SELECT u.id,u.email,u.disabled,s.created_at,s.expires_at FROM vps_sessions s JOIN vps_users u ON u.id=s.user_id WHERE s.token_hash=?').get(hash);
    requireValue(user&&user.disabled===0&&identifier(user.id,200)&&hasText(user.email,320)&&
      Number.isSafeInteger(user.created_at)&&user.created_at>=0&&user.created_at<=Math.floor(now/1000)&&
      Number.isSafeInteger(user.expires_at)&&Number.isSafeInteger(user.expires_at*1000)&&user.expires_at*1000>now);
    let address;
    try{address=normalizeEmail(user.email);}catch{throw new FederationError();}
    // A retained developer grant remains excluded even if the grant is inactive.
    requireValue((!developer||address!==developer)&&
      !db.prepare("SELECT 1 FROM vps_staff_grants WHERE user_id=? AND purpose='developer'").get(user.id));
    const profile=db.prepare('SELECT id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation FROM profiles WHERE id=?').get(user.id);
    const owner=peer.ownerUserId===user.id;
    if(profile){
      requireValue(profile.status==='approved'&&Number.isSafeInteger(profile.version)&&profile.version>0&&
        (ordinaryRoles.has(profile.role)||(profile.role==='owner'&&owner)));
    }else requireValue(owner);
    const snapshot=profile?[profile.id,profile.name,profile.email,profile.requested_role,profile.role,
      profile.status,profile.privacy_version,profile.created_at,profile.updated_at,profile.version,profile.last_mutation]:null;
    return {subject:user.id,displayName:profile?.name||user.email,email:user.email,sessionDigest:hash,
      profileVersion:profile?.version??0,
      profileFingerprint:digest(JSON.stringify(['KNABA-SITE-IDENTITY-PROFILE-V1',user.id,user.email,snapshot])),
      expiresAt:user.expires_at*1000};
  }
  function sameActor(first,current){
    requireValue(first.subject===current.subject&&secureEqual(first.sessionDigest,current.sessionDigest)&&
      first.profileVersion===current.profileVersion&&secureEqual(first.profileFingerprint,current.profileFingerprint));
  }
  function preview(input,peer,now){
    const value=exact(input,previewKeys);
    requireValue(typeof value.id==='string'&&uuid4.test(value.id)&&value.id.length===36&&
      typeof value.challengeDigest==='string'&&proofHash.test(value.challengeDigest)&&value.challengeDigest.length===64&&
      typeof value.nonceDigest==='string'&&proofHash.test(value.nonceDigest)&&value.nonceDigest.length===64&&
      identifier(value.targetUserId,200)&&hasText(value.targetDisplayName,1024,true)&&
      hasText(value.targetEmail,320,true)&&hasText(value.companyName,1024,true)&&
      Number.isSafeInteger(value.expiresAt)&&value.expiresAt>now&&value.expiresAt-now<=MAX_PROOF_AGE_MS,
      'VALIDATION_ERROR');
    requireValue(value.companyId===peer.companyId&&value.issuer===peer.issuer&&value.audience===peer.audience&&
      secureEqual(value.trustFingerprint,trustFingerprint(peer)));
    return value;
  }
  function proof(input,peer){
    const value=exact(input,proofKeys);
    requireValue(typeof value.grantToken==='string'&&value.grantToken.length===80&&challengeTokenPattern.test(value.grantToken)&&
      typeof value.challengeId==='string'&&value.challengeId.length===36&&uuid4.test(value.challengeId)&&
      typeof value.challengeDigest==='string'&&value.challengeDigest.length===64&&proofHash.test(value.challengeDigest)&&
      typeof value.nonceDigest==='string'&&value.nonceDigest.length===64&&proofHash.test(value.nonceDigest)&&
      identifier(value.targetUserId,200),'VALIDATION_ERROR');
    requireValue(value.companyId===peer.companyId&&secureEqual(value.trustFingerprint,trustFingerprint(peer)));
    return value;
  }
  function sessionProof(input,peer){
    const value=exact(input,sessionKeys);
    requireValue(identifier(value.subject,200)&&Number.isSafeInteger(value.profileVersion)&&value.profileVersion>=0&&
      ['sessionDigest','profileFingerprint','trustFingerprint','transportFingerprint'].every(key=>
        typeof value[key]==='string'&&value[key].length===64&&proofHash.test(value[key])),'VALIDATION_ERROR');
    requireValue(value.companyId===peer.companyId&&value.issuer===peer.issuer&&value.audience===peer.audience&&
      secureEqual(value.trustFingerprint,trustFingerprint(peer))&&secureEqual(value.transportFingerprint,transportFingerprint(peer)));
    return Object.freeze(Object.fromEntries(sessionKeys.map(key=>[key,value[key]])));
  }
  function resolve(peer,input,now){
    const row=db.prepare('SELECT * FROM vps_site_identity_consents WHERE id=?').get(input.grantToken.slice(0,36));
    requireValue(row&&row.company_id===peer.companyId&&row.issuer===peer.issuer&&row.audience===peer.audience&&
      row.challenge_id===input.challengeId&&row.target_user_id===input.targetUserId&&
      secureEqual(row.challenge_digest,input.challengeDigest)&&secureEqual(row.nonce_digest,input.nonceDigest)&&
      secureEqual(row.trust_fingerprint,input.trustFingerprint)&&secureEqual(row.transport_fingerprint,transportFingerprint(peer))&&
      secureEqual(row.grant_hash,digest(input.grantToken))&&
      secureEqual(input.grantToken,grantToken(peer,row.id,row.challenge_digest))&&
      Number.isSafeInteger(row.created_at)&&row.created_at<=now&&Number.isSafeInteger(row.expires_at)&&
      row.expires_at>now&&row.expires_at>row.created_at&&row.expires_at-row.created_at<=MAX_PROOF_AGE_MS);
    const fingerprint=requestFingerprint(peer,input);
    requireValue(row.status==='CONSENTED'?(row.redeemed_fingerprint===null&&row.redeemed_at===null):
      row.status==='REDEEMED'&&secureEqual(row.redeemed_fingerprint,fingerprint)&&
      Number.isSafeInteger(row.redeemed_at)&&row.redeemed_at>=row.created_at&&row.redeemed_at<=now&&row.redeemed_at<row.expires_at);
    const actor=actorFor(row.session_hash,peer,now);
    requireValue(actor.subject===row.site_user_id&&actor.profileVersion===row.profile_version&&
      secureEqual(actor.profileFingerprint,row.profile_fingerprint)&&actor.expiresAt>=row.expires_at);
    return {row,actor,fingerprint};
  }
  function audit(action,actor,id,now){
    db.prepare('INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
      .run(randomUUID(),actor.subject,action,id,new Date(now).toISOString());
  }
  function reply(peer,row,actor,checkedAt){
    return {issuer:row.issuer,audience:row.audience,subject:actor.subject,companyId:row.company_id,
      targetUserId:row.target_user_id,challengeId:row.challenge_id,challengeDigest:row.challenge_digest,
      nonceDigest:row.nonce_digest,trustFingerprint:row.trust_fingerprint,transportFingerprint:transportFingerprint(peer),
      grantDigest:row.grant_hash,sessionDigest:actor.sessionDigest,profileVersion:actor.profileVersion,
      profileFingerprint:actor.profileFingerprint,displayName:actor.displayName,email:actor.email,
      expiresAt:row.expires_at,checkedAt};
  }
  return Object.freeze({
    /** Signed ERP-only current-session check. No consent grant is accepted or
     * consumed, and no profile/session snapshot is refreshed for the caller. */
    introspectSession(input){
      return transaction((peer,now)=>{
        const checked=sessionProof(input,peer),first=actorFor(checked.sessionDigest,peer,now);sameActor(checked,first);
        return checkedAt=>{
          const current=actorFor(checked.sessionDigest,peer,checkedAt);sameActor(checked,current);
          const expiresAt=Math.min(first.expiresAt,current.expiresAt,peer.expiresAt?Date.parse(peer.expiresAt):Infinity);
          requireValue(expiresAt>checkedAt);
          return {active:true,...checked,expiresAt,checkedAt};
        };
      },requireSessions);
    },
    current(cookieHeader){
      return transaction((peer,now)=>{
        const hash=sessionDigest(cookieHeader),actor=actorFor(hash,peer,now);
        return checkedAt=>{
          const current=actorFor(hash,peer,checkedAt);sameActor(actor,current);
          return {...current,checkedAt};
        };
      });
    },
    consent(input){
      const {cookieHeader,challenge}=exact(input,['cookieHeader','challenge']);
      return transaction((peer,now)=>{
        const checked=preview(challenge,peer,now),actor=actorFor(sessionDigest(cookieHeader),peer,now);
        let row=db.prepare('SELECT * FROM vps_site_identity_consents WHERE company_id=? AND challenge_id=?').get(peer.companyId,checked.id);
        if(!row){
          const id=randomUUID(),token=grantToken(peer,id,checked.challengeDigest);
          const expiresAt=Math.min(checked.expiresAt,actor.expiresAt,peer.expiresAt?Date.parse(peer.expiresAt):Infinity);
          requireValue(expiresAt>now);
          db.prepare(`INSERT INTO vps_site_identity_consents
            (id,challenge_id,challenge_digest,nonce_digest,company_id,target_user_id,issuer,audience,
             trust_fingerprint,transport_fingerprint,site_user_id,session_hash,profile_version,profile_fingerprint,
             grant_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(id,checked.id,checked.challengeDigest,checked.nonceDigest,peer.companyId,checked.targetUserId,peer.issuer,peer.audience,
              trustFingerprint(peer),transportFingerprint(peer),actor.subject,actor.sessionDigest,actor.profileVersion,actor.profileFingerprint,
              digest(token),now,expiresAt);
          audit('site_identity.consented',actor,id,now);
          row=db.prepare('SELECT * FROM vps_site_identity_consents WHERE id=?').get(id);
        }
        requireValue(row&&row.expires_at<=checked.expiresAt);
        const request={grantToken:grantToken(peer,row.id,checked.challengeDigest),challengeId:checked.id,
          challengeDigest:checked.challengeDigest,nonceDigest:checked.nonceDigest,companyId:peer.companyId,
          targetUserId:checked.targetUserId,trustFingerprint:checked.trustFingerprint};
        sameActor(actor,resolve(peer,request,now).actor);
        return checkedAt=>{
          const result=resolve(peer,request,checkedAt);sameActor(actor,result.actor);
          return {grantToken:request.grantToken,expiresAt:result.row.expires_at,subject:result.actor.subject,
            displayName:result.actor.displayName,email:result.actor.email};
        };
      });
    },
    inspect(input){
      return transaction((peer,now)=>{
        const checked=proof(input,peer);resolve(peer,checked,now);
        return checkedAt=>{const {row,actor}=resolve(peer,checked,checkedAt);return reply(peer,row,actor,checkedAt);};
      });
    },
    redeem(input){
      return transaction((peer,now)=>{
        const checked=proof(input,peer),{row,actor,fingerprint}=resolve(peer,checked,now);
        if(row.status==='CONSENTED'){
          const saved=db.prepare("UPDATE vps_site_identity_consents SET status='REDEEMED',redeemed_fingerprint=?,redeemed_at=? WHERE id=? AND status='CONSENTED'")
            .run(fingerprint,now,row.id);
          requireValue(Number(saved.changes)===1);
          audit('site_identity.redeemed',actor,row.id,now);
        }
        return checkedAt=>{
          const result=resolve(peer,checked,checkedAt);requireValue(result.row.status==='REDEEMED');
          return reply(peer,result.row,result.actor,checkedAt);
        };
      });
    }
  });
}
