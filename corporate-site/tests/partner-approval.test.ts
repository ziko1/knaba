import {randomUUID} from 'node:crypto';
import {it, expect} from 'vitest';
import {handleApi} from '../worker/api';
import {LocalD1} from '../vps/database.mjs';
import {createCredentialsUser,createSessionForUser,readSession} from '../vps/auth.mjs';
import {issueAccountInvite,acceptAccountInvite} from '../vps/account-invite.mjs';
import {digest,parsePeerConfig,trustFingerprint} from '../vps/site-identity-protocol.mjs';
import {sessionAuthority,sessionDatabase} from './fixtures/partner-session-db.mjs';

it('only owner approval unlocks the invited partner’s site proof and suspension invalidates it',async()=>{
  const db=sessionDatabase();
  try{
    db.exec(`
      CREATE TABLE portal_audit (id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,entity_id TEXT,created_at TEXT);
      CREATE TABLE vps_account_invites (token_hash TEXT PRIMARY KEY,email TEXT,requested_role TEXT,
        issued_by TEXT,issued_at INTEGER,expires_at INTEGER,used_at INTEGER,used_by TEXT);
      CREATE TABLE vps_site_identity_consents (id TEXT PRIMARY KEY,challenge_id TEXT,challenge_digest TEXT,
        nonce_digest TEXT,company_id TEXT,target_user_id TEXT,issuer TEXT,audience TEXT,trust_fingerprint TEXT,
        transport_fingerprint TEXT,site_user_id TEXT,session_hash TEXT,profile_version INTEGER,profile_fingerprint TEXT,
        grant_hash TEXT,created_at INTEGER,expires_at INTEGER,status TEXT DEFAULT 'CONSENTED',redeemed_fingerprint TEXT,redeemed_at INTEGER);`);
    const ownerEmail='owner@example.test',email='partner@example.test',password='Synthetic-approval-password!';
    const owner=createCredentialsUser(db,ownerEmail,password);
    const invite=issueAccountInvite(db,{issuerId:owner.id,ownerEmail,email,role:'partner',identityVerified:true});
    const user=acceptAccountInvite(db,{token:invite.token,email,name:'Synthetic Partner',password,confirmed:password,privacyAccepted:true,ownerEmail});
    const loadProfile=()=>db.prepare('SELECT requested_role,role,status,version FROM profiles WHERE id=?').get(user.id);
    expect(loadProfile()).toEqual({requested_role:'partner',role:null,status:'pending',version:1});

    const siteOrigin='https://site.example';
    const peer=parsePeerConfig({companyId:'company-a',issuer:siteOrigin+'/identity',audience:'erp:company-a',version:1,
      active:true,siteOrigin,erpOrigin:'https://erp.example',keyId:'knaba-federation-approval',
      secret:Buffer.alloc(32,17).toString('base64url'),ownerUserId:owner.id})!;
    const authority=sessionAuthority(db,peer,{ownerEmail,sessionsEnabled:()=>true});
    const cookie=(id:string)=>'__Host-knaba-session='+createSessionForUser(db,id).token;
    const ownerCookie=cookie(owner.id),partnerCookie=cookie(user.id);
    const challenge={id:randomUUID(),challengeDigest:digest(randomUUID()),nonceDigest:digest(randomUUID()),
      companyId:peer.companyId,issuer:peer.issuer,audience:peer.audience,targetUserId:'erp-partner',
      targetDisplayName:'ERP partner',targetEmail:'erp-user@example.test',companyName:'Synthetic company A',
      trustFingerprint:trustFingerprint(peer),expiresAt:Date.now()+240_000};
    const consent=()=>authority.consent({cookieHeader:partnerCookie,challenge});
    expect(consent).toThrow('ACCESS_DENIED');

    const d1=new LocalD1(db);
    // Mirror the VPS adapter boundary. Worker identity comes from a current
    // persisted cookie and the same cookie is checked again under SQLite locks.
    const setRole=(sessionCookie:string,status:'approved'|'suspended',version:number)=>{
      const session=readSession(db,sessionCookie)!;
      const url=siteOrigin+'/api/portal/roles';
      return handleApi(new Request(url,{method:'POST',headers:{Origin:siteOrigin,'Content-Type':'application/json',
        'X-KnaBa-Request':'portal-v1','oai-authenticated-user-id':session.id,'oai-authenticated-user-email':session.email},
        body:JSON.stringify({userId:user.id,role:'partner',status,version})}),{
        OWNER_EMAIL:ownerEmail,OWNER_USER_ID:owner.id,
        DB:d1.withAuthorization(()=>{
          const current=readSession(db,sessionCookie);
          return current?.id===session.id&&current?.token===session.token;
        }),
      });
    };
    expect((await setRole(partnerCookie,'approved',1)).status).toBe(403);
    expect((await setRole(ownerCookie,'approved',2)).status).toBe(409);
    expect((await setRole(ownerCookie,'approved',1)).status).toBe(200);
    expect(loadProfile()).toEqual({requested_role:'partner',role:'partner',status:'approved',version:2});
    const grant=consent();
    const redeemed=authority.redeem({grantToken:grant.grantToken,challengeId:challenge.id,challengeDigest:challenge.challengeDigest,
      nonceDigest:challenge.nonceDigest,companyId:peer.companyId,targetUserId:challenge.targetUserId,trustFingerprint:challenge.trustFingerprint});
    const proof={companyId:redeemed.companyId,issuer:redeemed.issuer,audience:redeemed.audience,subject:redeemed.subject,
      sessionDigest:redeemed.sessionDigest,profileVersion:redeemed.profileVersion,profileFingerprint:redeemed.profileFingerprint,
      trustFingerprint:redeemed.trustFingerprint,transportFingerprint:redeemed.transportFingerprint};
    expect(proof).toMatchObject({subject:user.id,profileVersion:2,companyId:peer.companyId});
    expect(authority.introspectSession(proof,{partnerOnly:true})).toMatchObject({active:true,subject:user.id});
    expect((await setRole(ownerCookie,'suspended',2)).status).toBe(200);
    expect(loadProfile()).toMatchObject({status:'suspended',version:3});
    expect(authority.introspectSession(proof,{partnerOnly:true})).toEqual({active:false});
    const audit=db.prepare("SELECT actor_id,action FROM portal_audit WHERE entity_id=? AND action LIKE 'role.%' ORDER BY rowid").all(user.id);
    expect(audit).toEqual([{actor_id:owner.id,action:'role.approved.partner'},{actor_id:owner.id,action:'role.suspended'}]);
  }finally{db.close();}
});
