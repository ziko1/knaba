import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Request} from 'express';
import {Database,PgTransaction} from './database.ts';
import {AuthService,RateLimiter,verifyPassword,openSecret,validateTotp,hashToken,type AuthOptions,type EngineLike} from './auth.ts';
import {assert,DomainError,type Actor} from '../../packages/domain/core.ts';
import {SiteIdentityBindings,TrustedSiteAuthorities} from './site-identity-bindings.ts';
import {digest,opaque,challengeTokenPattern,requireActive,trustFingerprint,transportFingerprint,peerRequest,
  verifyRequest,readProof,signResponse,FederationError,type FederationPeer} from '../../packages/integrations/site-identity-protocol.mjs';

const token=z.string().regex(challengeTokenPattern);
const proof=z.object({password:z.string().min(1).max(128),otp:z.string().regex(/^\d{6}$/).optional()});
const exchange=z.object({challengeToken:token,grantToken:token}).strict();
const privileged=new Set(['OWNER','DIRECTOR','OPERATIONS_MANAGER','ACCOUNTANT','BOT_ADMIN','DISPATCHER']);
const deniedRoles=new Set(['GUEST','SERVICE_ACCOUNT','DEVELOPER_SUPPORT']);
const sensitivePermissions=new Set(['scope.company','identity.manage','role.manage','company.manage','finance.payroll','finance.payroll.approve','finance.payout.approve','bot.settings.manage']);
const fingerprint=(row:any)=>digest(JSON.stringify([row.password_hash,row.totp_secret??null]));
const milliseconds=(value:unknown)=>value instanceof Date?value.getTime():typeof value==='number'?value:Date.parse(String(value));
const label=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value:'';
type Session={userId:string;sessionHash:string};
type Current={actor:Actor;user:any;credential:any;session:any;now:number};
const requiresMfa=(current:Current)=>current.user.data.mfaRequired===true||current.actor.roles.some(r=>privileged.has(r))||current.actor.permissions.some(p=>sensitivePermissions.has(p));

/** F2 creates/revokes identity bindings only. No federated session or permissions
 * are issued here. Site consent and ERP commit have separate linearization points:
 * the bounded online redemption authorizes one immutable target; an ERP rollback
 * may replay that exact redemption after rechecking both original sessions.
 */
export class SiteIdentityFlow {
  private readonly auth:AuthService;
  private readonly attempts=new RateLimiter(8,60_000);
  private readonly reads=new RateLimiter(90,60_000);
  private readonly bindings:SiteIdentityBindings;
  constructor(private readonly db:Database,private readonly engine:EngineLike,private readonly options:AuthOptions,
    private readonly config:()=>FederationPeer|null=()=>null,
    private readonly transport:typeof peerRequest=peerRequest){
    this.auth=new AuthService(db,engine,options);
    this.bindings=new SiteIdentityBindings(db,options.companyId,()=>{
      const peer=this.config();return new TrustedSiteAuthorities(peer?[{companyId:peer.companyId,issuer:peer.issuer,audience:peer.audience,
        identityNamespace:'site-user-id-v1',version:peer.version,active:peer.active,...(peer.expiresAt?{expiresAt:peer.expiresAt}:{})}]:[]);
    });
  }
  private configured(now=Date.now()){
    const peer=requireActive(this.config(),now);
    assert(peer.companyId===this.options.companyId&&(!this.options.publicOrigin||peer.erpOrigin===new URL(this.options.publicOrigin).origin),'MISSING_CONFIGURATION');
    return peer;
  }
  private sameConfiguration(peer:FederationPeer,now:number){assert(transportFingerprint(this.configured(now))===transportFingerprint(peer),'ACCESS_DENIED');}
  private async session(req:Request,mutation=false):Promise<Session>{
    // A device bearer, guest-cookie substitution or emulated developer cannot
    // satisfy a human account-link proof. Credentials are checked again in SQL.
    assert(!req.get('authorization'),'NEEDS_REAUTH');
    const auth=mutation?await this.auth.mutation(req):await this.auth.authenticate(req);
    assert(!auth.device&&!auth.guest&&auth.actor.companyId===this.options.companyId&&!auth.actor.roles.some(r=>deniedRoles.has(r)),'NEEDS_REAUTH');
    return {userId:auth.actor.userId,sessionHash:hashToken(auth.token)};
  }
  private async current(tx:PgTransaction,session:Session):Promise<Current>{
    assert(tx.companyId===this.options.companyId&&this.engine.actorIn,'ACCESS_DENIED');
    const result=await tx.query(`SELECT *,clock_timestamp() AS checked_at FROM auth_sessions WHERE company_id=$1 AND user_id=$2 AND token_hash=$3
      AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,[this.options.companyId,session.userId,session.sessionHash]);
    const row=result.rows[0];assert(row,'NEEDS_REAUTH');
    const user=await tx.get('user',session.userId);
    assert(user.companyId===this.options.companyId&&user.data.active===true&&user.data.guest!==true,'NEEDS_REAUTH');
    const actor=await this.engine.actorIn(tx,session.userId);
    assert(actor.companyId===this.options.companyId&&actor.userId===session.userId&&!actor.roles.some(r=>deniedRoles.has(r)),'NEEDS_REAUTH');
    const credential=(await tx.query('SELECT password_hash,totp_secret,totp_last_counter FROM auth_credentials WHERE company_id=$1 AND user_id=$2 FOR UPDATE',
      [this.options.companyId,session.userId])).rows[0];assert(credential,'NEEDS_REAUTH');
    return {actor,user,credential,session:row,now:milliseconds(row.checked_at)};
  }
  private async password(req:Request,session:Session,input:z.infer<typeof proof>){
    this.attempts.check(digest(`${req.ip??''}:${session.userId}`));
    const row=(await this.db.query('SELECT password_hash,totp_secret FROM auth_credentials WHERE company_id=$1 AND user_id=$2',
      [this.options.companyId,session.userId])).rows[0];
    assert(row&&await verifyPassword(input.password,row.password_hash),'NEEDS_REAUTH');
    return fingerprint(row);
  }
  private async reauthenticate(tx:PgTransaction,current:Current,expected:string,input:z.infer<typeof proof>){
    assert(fingerprint(current.credential)===expected,'NEEDS_REAUTH');
    let mfa=false;
    if(current.credential.totp_secret){
      const counter=validateTotp(openSecret(current.credential.totp_secret,this.options.encryptionKey),input.otp??'',current.now);
      assert(counter!==null,'NEEDS_REAUTH');
      const updated=await tx.query('UPDATE auth_credentials SET totp_last_counter=$3 WHERE company_id=$1 AND user_id=$2 AND totp_last_counter<$3 RETURNING user_id',
        [this.options.companyId,current.actor.userId,counter]);assert(updated.rows.length===1,'NEEDS_REAUTH');mfa=true;
    }
    assert(mfa||!requiresMfa(current),'NEEDS_REAUTH');
    return mfa;
  }
  private async checkpoint(tx:PgTransaction,session:Session,row:any,peer:FederationPeer){
    const fresh=await this.current(tx,session);
    assert(fingerprint(fresh.credential)===row.security_fingerprint&&
      (row.mfa_verified||!requiresMfa(fresh)),'NEEDS_REAUTH');
    const now=milliseconds((await tx.query('SELECT clock_timestamp() AS now')).rows[0].now);
    assert(milliseconds(row.expires_at)>now&&(!row.site_expires_at||milliseconds(row.site_expires_at)>now),'CALLBACK_EXPIRED');
    this.sameConfiguration(peer,now);
    assert(row.issuer===peer.issuer&&row.audience===peer.audience&&row.trust_fingerprint===trustFingerprint(peer)&&
      row.transport_fingerprint===transportFingerprint(peer),'ACCESS_DENIED');
    return {fresh,now};
  }
  private async challenge(tx:PgTransaction,value:string,session?:Session){
    token.parse(value);const [id,secret]=value.split('.');
    const row=(await tx.query('SELECT * FROM site_identity_challenges WHERE company_id=$1 AND id=$2 FOR UPDATE',[this.options.companyId,id])).rows[0];
    assert(row&&row.secret_hash===digest(secret!)&&row.challenge_digest===digest(value)&&row.status!=='CANCELLED'&&
      (!session||row.user_id===session.userId&&row.session_hash===session.sessionHash),'ACCESS_DENIED');
    return row;
  }
  private async company(tx:PgTransaction){const company=await tx.get('company',this.options.companyId);return {id:company.id,name:label(company.data.name??company.data.legalName??'KNABA DE',200)};}
  private person(current:Current){return {id:current.actor.userId,displayName:label(current.user.data.displayName??current.user.data.name,200),email:label(current.user.data.email,200)};}
  private snapshot(row:any){return {subject:row.site_subject,displayName:row.site_display_name,email:row.site_email};}
  private exchangeInput(row:any,grantToken:string){return {grantToken,challengeId:row.id,challengeDigest:row.challenge_digest,nonceDigest:row.nonce_digest,
    companyId:this.options.companyId,targetUserId:row.user_id,trustFingerprint:row.trust_fingerprint};}
  private validateSite(value:unknown,row:any,peer:FederationPeer,grantToken:string,now:number){
    const p=z.object({issuer:z.string(),audience:z.string(),subject:z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f]+$/),companyId:z.string(),targetUserId:z.string(),
      challengeId:z.string().uuid(),challengeDigest:z.string(),nonceDigest:z.string(),trustFingerprint:z.string(),transportFingerprint:z.string(),grantDigest:z.string(),
      sessionDigest:z.string().regex(/^[a-f0-9]{64}$/),profileVersion:z.number().int().min(0).max(2147483647),profileFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
      displayName:z.string().max(1024),email:z.string().max(320),expiresAt:z.number().int(),checkedAt:z.number().int()}).strict().parse(value);
    assert(p.issuer===peer.issuer&&p.audience===peer.audience&&p.companyId===this.options.companyId&&p.targetUserId===row.user_id&&
      p.challengeId===row.id&&p.challengeDigest===row.challenge_digest&&p.nonceDigest===row.nonce_digest&&p.trustFingerprint===row.trust_fingerprint&&
      p.transportFingerprint===row.transport_fingerprint&&p.grantDigest===digest(grantToken)&&Math.abs(now-p.checkedAt)<=15_000&&
      p.expiresAt>now&&p.expiresAt<=milliseconds(row.expires_at)&&p.expiresAt<=p.checkedAt+300_000&&
      p.displayName===label(p.displayName,1024)&&p.email===label(p.email,320),'ACCESS_DENIED');
    if(row.status!=='OPEN')assert(row.grant_digest===p.grantDigest&&row.site_subject===p.subject&&row.site_session_digest===p.sessionDigest&&
      row.site_profile_version===p.profileVersion&&row.site_profile_fingerprint===p.profileFingerprint&&
      row.site_display_name===p.displayName&&row.site_email===p.email&&milliseconds(row.site_expires_at)===p.expiresAt,'ACCESS_DENIED');
    return p;
  }
  async state(req:Request){
    const session=await this.session(req);this.reads.check(session.userId);
    return this.db.transaction(this.options.companyId,session.userId,async tx=>{
      const current=await this.current(tx,session);
      const items=(await tx.query(`SELECT id,issuer,subject,status,version,generation,created_at,revoked_at FROM site_identity_bindings
        WHERE company_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 50`,[this.options.companyId,session.userId])).rows;
      const challenges=(await tx.query(`SELECT id,status,binding_id FROM site_identity_challenges WHERE company_id=$1 AND user_id=$2 AND session_hash=$3
        AND created_at>clock_timestamp()-interval '1 day' ORDER BY created_at DESC LIMIT 20`,[this.options.companyId,session.userId,session.sessionHash])).rows;
      let configured=false;try{this.configured(current.now);configured=true;}catch{}
      return {configured,user:this.person(current),company:await this.company(tx),items,challenges};
    },5000);
  }
  async begin(req:Request,body:unknown){
    const input=proof.strict().parse(body),session=await this.session(req,true),peer=this.configured();
    const expected=await this.password(req,session,input);
    return this.db.transaction(this.options.companyId,session.userId,async tx=>{
      const current=await this.current(tx,session),mfa=await this.reauthenticate(tx,current,expected,input);
      this.sameConfiguration(peer,current.now);
      const id=randomUUID(),secret=opaque(),challengeToken=id+'.'+secret,expiresAt=Math.min(current.now+300_000,milliseconds(current.session.expires_at));
      await tx.query(`INSERT INTO site_identity_challenges(company_id,id,user_id,session_hash,security_fingerprint,mfa_verified,secret_hash,challenge_digest,
        nonce_digest,issuer,audience,trust_fingerprint,transport_fingerprint,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [this.options.companyId,id,session.userId,session.sessionHash,expected,mfa,digest(secret),digest(challengeToken),digest(opaque()),peer.issuer,peer.audience,
          trustFingerprint(peer),transportFingerprint(peer),new Date(current.now).toISOString(),new Date(expiresAt).toISOString()]);
      return {id,expiresAt,redirectUrl:peer.siteOrigin+'/account/erp/#link='+encodeURIComponent(challengeToken)};
    },5000);
  }
  async status(req:Request,body:unknown){
    const input=exchange.parse(body),session=await this.session(req,true);
    return this.db.transaction(this.options.companyId,session.userId,async tx=>{
      await this.current(tx,session);const row=await this.challenge(tx,input.challengeToken,session);
      assert(row.status==='CONSUMED'&&row.grant_digest===digest(input.grantToken),'ACCESS_DENIED');
      const binding=(await tx.query('SELECT id,status,version,generation FROM site_identity_bindings WHERE company_id=$1 AND id=$2 AND user_id=$3',
        [this.options.companyId,row.binding_id,session.userId])).rows[0];assert(binding,'ACCESS_DENIED');return {binding};
    },5000);
  }
  async inspectChallenge(req:Request,raw:Buffer){
    const peer=this.configured(),path='/api/v1/auth/site-links/inspect-challenge';
    const signed=verifyRequest(peer,path,raw,readProof(req.headers));this.reads.check(peer.keyId);
    const input=z.object({challengeToken:token}).strict().parse(JSON.parse(raw.toString('utf8')));
    const result=await this.db.transaction(this.options.companyId,'SITE_IDENTITY_CHALLENGE',async tx=>{
      const row=await this.challenge(tx,input.challengeToken);assert(row.status==='OPEN'||row.status==='PREVIEWED','ACCESS_DENIED');
      const {fresh}=await this.checkpoint(tx,{userId:row.user_id,sessionHash:row.session_hash},row,peer),company=await this.company(tx);
      return {id:row.id,challengeDigest:row.challenge_digest,nonceDigest:row.nonce_digest,companyId:this.options.companyId,issuer:peer.issuer,audience:peer.audience,
        targetUserId:row.user_id,targetDisplayName:this.person(fresh).displayName,targetEmail:this.person(fresh).email,companyName:company.name,
        trustFingerprint:row.trust_fingerprint,expiresAt:milliseconds(row.expires_at)};
    },5000);
    this.sameConfiguration(peer,Date.now());const bytes=Buffer.from(JSON.stringify(result));
    return {bytes,signature:signResponse(peer,path,bytes,signed)};
  }
  async preview(req:Request,body:unknown){
    const input=exchange.parse(body),session=await this.session(req,true),peer=this.configured();this.reads.check(session.userId);
    return this.db.transaction(this.options.companyId,session.userId,async tx=>{
      const row=await this.challenge(tx,input.challengeToken,session);assert(row.status==='OPEN'||row.status==='PREVIEWED','ACCESS_DENIED');
      await this.checkpoint(tx,session,row,peer);
      const value=await this.transport(peer,'site','/auth/site-identity/inspect',this.exchangeInput(row,input.grantToken));
      const {fresh,now}=await this.checkpoint(tx,session,row,peer),p=this.validateSite(value,row,peer,input.grantToken,now);
      if(row.status==='OPEN')await tx.query(`UPDATE site_identity_challenges SET status='PREVIEWED',grant_digest=$3,site_subject=$4,site_session_digest=$5,
        site_profile_version=$6,site_profile_fingerprint=$7,site_display_name=$8,site_email=$9,site_expires_at=$10 WHERE company_id=$1 AND id=$2`,
        [this.options.companyId,row.id,p.grantDigest,p.subject,p.sessionDigest,p.profileVersion,p.profileFingerprint,p.displayName,p.email,new Date(p.expiresAt).toISOString()]);
      return {challengeId:row.id,user:this.person(fresh),company:await this.company(tx),site:{subject:p.subject,displayName:p.displayName,email:p.email},expiresAt:p.expiresAt};
    },7000);
  }
  async confirm(req:Request,body:unknown){
    const input=exchange.extend({confirmed:z.literal(true)}).strict().parse(body),session=await this.session(req,true),peer=this.configured();this.reads.check(session.userId);
    return this.db.transaction(this.options.companyId,session.userId,async tx=>{
      const row=await this.challenge(tx,input.challengeToken,session);
      await this.checkpoint(tx,session,row,peer);
      if(row.status==='CONSUMED'){
        assert(row.grant_digest===digest(input.grantToken),'ACCESS_DENIED');
        const existing=(await tx.query('SELECT id,status,version,generation FROM site_identity_bindings WHERE company_id=$1 AND id=$2 AND user_id=$3',
          [this.options.companyId,row.binding_id,session.userId])).rows[0];assert(existing,'ACCESS_DENIED');return {binding:existing,replayed:true};
      }
      assert(row.status==='PREVIEWED','INVALID_STATE');
      const prior=(await tx.query('SELECT * FROM site_identity_bindings WHERE company_id=$1 AND issuer=$2 AND subject=$3 ORDER BY generation DESC LIMIT 1 FOR UPDATE',
        [this.options.companyId,row.issuer,row.site_subject])).rows[0];
      assert(!prior||(prior.status==='REVOKED'&&prior.user_id===session.userId&&prior.audience===row.audience),'ACCESS_DENIED');
      const value=await this.transport(peer,'site','/auth/site-identity/redeem',this.exchangeInput(row,input.grantToken));
      const {now}=await this.checkpoint(tx,session,row,peer),p=this.validateSite(value,row,peer,input.grantToken,now);
      const bindingId=randomUUID(),proofReference=digest(JSON.stringify(['KNABA-DUAL-CONSENT-V1',row.id,p.grantDigest,p.sessionDigest,p.profileFingerprint,
        row.session_hash,row.security_fingerprint,p.trustFingerprint,p.transportFingerprint,p.subject,row.user_id]));
      await tx.query(`UPDATE site_identity_challenges SET status='CONSUMED',proof_reference=$3,binding_id=$4,completed_at=clock_timestamp()
        WHERE company_id=$1 AND id=$2`,[this.options.companyId,row.id,proofReference,bindingId]);
      const linked=await this.bindings.recordVerifiedLinkIn(tx,{issuer:peer.issuer,audience:peer.audience,subject:p.subject},proofReference,undefined,
        {bindingId,challengeId:row.id,generation:prior?prior.generation+1:1,predecessorId:prior?.id??null});
      await this.checkpoint(tx,session,row,peer);
      return {binding:{id:linked.id,status:linked.status,version:linked.version,generation:linked.generation},replayed:false};
    },7000);
  }
  async unlink(req:Request,body:unknown){
    const input=proof.extend({id:z.string().uuid(),expectedVersion:z.number().int().positive()}).strict().parse(body),session=await this.session(req,true);
    const expected=await this.password(req,session,input);
    // Deliberately independent of an enabled/reachable issuer: reducing access
    // cannot depend on the peer that the account is trying to revoke.
    return this.db.transaction(this.options.companyId,session.userId,async tx=>{
      const current=await this.current(tx,session);await this.reauthenticate(tx,current,expected,input);
      const linked=await this.bindings.revokeIn(tx,input.id,input.expectedVersion);
      return {binding:{id:linked.id,status:linked.status,version:linked.version,generation:linked.generation}};
    },5000);
  }
}

export function siteIdentityHttpError(error:unknown):never {
  if(error instanceof FederationError)throw new DomainError(error.code);
  if(error instanceof SyntaxError)throw new DomainError('VALIDATION_ERROR');
  throw error;
}
