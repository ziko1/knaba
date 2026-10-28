/** KNABA OIDC: opt-in, provider-pinned authorization code + PKCE + nonce, no email-based privilege upgrades.
 * Public sign-up is PENDING client/partner only; owner/developer require separately provisioned credentials.
 */
import {randomBytes,createHash,createPublicKey,verify as verifySignature,timingSafeEqual} from 'node:crypto';
import {normalizeEmail,createCredentialsUser,createSessionForUser} from './auth.mjs';

const random=()=>randomBytes(32).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest('hex');
const codeChallenge=v=>createHash('sha256').update(v).digest('base64url');
const statePattern=/^[A-Za-z0-9_-]{43}$/;
const hashPattern=/^[A-Za-z0-9_-]{10,100}$/;
const ttlMs=10*60*1000;
const head={'Content-Type':'application/x-www-form-urlencoded'};
export class OidcError extends Error{
  constructor(code='invalid'){super(code);this.name='OidcError';this.code=code;}
}
export function oidcProviders(env=process.env){
  const result={};
  if(env.KNABA_GOOGLE_CLIENT_ID?.trim()&&env.KNABA_GOOGLE_CLIENT_SECRET?.trim()){
    result.google={
      label:'Google',issuer:'https://accounts.google.com',
      authorizationEndpoint:'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint:'https://oauth2.googleapis.com/token',
      jwksEndpoint:'https://www.googleapis.com/oauth2/v3/certs',
      clientId:env.KNABA_GOOGLE_CLIENT_ID,clientSecret:env.KNABA_GOOGLE_CLIENT_SECRET
    };
  }
  const tenant=(env.KNABA_MICROSOFT_TENANT_ID||'').trim().toLowerCase();
  if(env.KNABA_MICROSOFT_CLIENT_ID?.trim()&&env.KNABA_MICROSOFT_CLIENT_SECRET?.trim()&&
     /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tenant)){
    const prefix='https://login.microsoftonline.com/'+tenant;
    result.microsoft={
      label:'Microsoft',issuer:prefix+'/v2.0',
      authorizationEndpoint:prefix+'/oauth2/v2.0/authorize',
      tokenEndpoint:prefix+'/oauth2/v2.0/token',
      jwksEndpoint:prefix+'/discovery/v2.0/keys',tenant,
      clientId:env.KNABA_MICROSOFT_CLIENT_ID,clientSecret:env.KNABA_MICROSOFT_CLIENT_SECRET
    };
  }
  return result;
}
export const oidcStateCookie=state=>'__Host-knaba-oidc='+state+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600';
export const clearOidcStateCookie=()=>'__Host-knaba-oidc=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
export function stateCookieMatches(rawCookie,expected){
  if(typeof rawCookie!=='string'||rawCookie.length>4096||!statePattern.test(expected||''))return false;
  const values=rawCookie.split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-knaba-oidc='));
  if(values.length!==1)return false;
  const value=values[0].slice('__Host-knaba-oidc='.length);
  return statePattern.test(value)&&timingSafeEqual(Buffer.from(value),Buffer.from(expected));
}
function transaction(db,work){
  db.exec('BEGIN IMMEDIATE');
  try{const r=work();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}
}
export function beginOidc(db,{provider,config,origin,intent='client',privacyAccepted,linkUserId=null,now=Date.now()}){
  const p=config[provider];
  if(!p)throw new OidcError('disabled');
  if(!['client','partner'].includes(intent)||privacyAccepted!==true||!Number.isSafeInteger(now))
    throw new OidcError('invalid');
  const state=random(),nonce=random(),verifier=random(),callback=origin+'/auth/oidc/'+provider+'/callback/';
  const authorize=new URL(p.authorizationEndpoint);
  authorize.search=new URLSearchParams({
    response_type:'code',client_id:p.clientId,redirect_uri:callback,
    scope:'openid email profile',state,nonce,code_challenge:codeChallenge(verifier),code_challenge_method:'S256'
  }).toString();
  transaction(db,()=>{
    db.prepare('DELETE FROM vps_oidc_states WHERE expires_at<=?').run(now);
    db.prepare('INSERT INTO vps_oidc_states(state_hash,provider,nonce,verifier,intent,link_user_id,issued_at,expires_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(hash(state),provider,nonce,verifier,intent,linkUserId,now,now+ttlMs);
  });
  return {redirect:authorize.href,state};
}
async function boundedJSON(response,max){
  if(!response.ok)throw new OidcError('provider_unavailable');
  let total=0;
  const reader=response.body?.getReader();
  if(!reader)throw new OidcError('provider_unavailable');
  const chunks=[];
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.length;if(total>max)throw new OidcError('provider_unavailable');
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(Buffer.concat(chunks.map(v=>Buffer.from(v))).toString('utf8'));}
  catch{throw new OidcError('provider_unavailable');}
}
function parseJsonPart(part,max){
  if(typeof part!=='string'||part.length>max||!/^[A-Za-z0-9_-]+$/.test(part))
    throw new OidcError('invalid_identity');
  try{return JSON.parse(Buffer.from(part,'base64url').toString('utf8'));}
  catch{throw new OidcError('invalid_identity');}
}
export function verifyIdToken(idToken,jwks,{provider,nonce,now=Math.floor(Date.now()/1000)}){
  if(typeof idToken!=='string'||idToken.length>12000)throw new OidcError('invalid_identity');
  const parts=idToken.split('.');
  if(parts.length!==3)throw new OidcError('invalid_identity');
  const header=parseJsonPart(parts[0],2500),claims=parseJsonPart(parts[1],9000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256 ||
     !Array.isArray(jwks.keys))throw new OidcError('invalid_identity');
  const matches=jwks.keys.filter(k=>k.kty==='RSA'&&k.kid===header.kid&&
    (!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  if(matches.length!==1)throw new OidcError('invalid_identity');
  try{
    const key=createPublicKey({key:matches[0],format:'jwk'});
    if(!verifySignature('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))
      throw new OidcError('invalid_identity');
  }catch{throw new OidcError('invalid_identity');}
  if(claims.iss!==provider.issuer||claims.nonce!==nonce ||
     typeof claims.sub!=='string'||!hashPattern.test(claims.sub)||
     !Number.isSafeInteger(claims.exp)||claims.exp<=now||
     !Number.isSafeInteger(claims.iat)||claims.iat>now+120||
     (claims.nbf!==undefined && (!Number.isSafeInteger(claims.nbf)||claims.nbf>now+120))||
     (Array.isArray(claims.aud)?
       !claims.aud.includes(provider.clientId)||claims.azp!==provider.clientId:
       claims.aud!==provider.clientId))
    throw new OidcError('invalid_identity');
  // Do not trust unverified aliases, even if a provider happens to return an email value.
  if(claims.email_verified!==true && claims.email_verified!=='true')throw new OidcError('unverified_email');
  let email;
  try{email=normalizeEmail(claims.email);}catch{throw new OidcError('unverified_email');}
  if(provider.tenant && claims.tid!==provider.tenant)throw new OidcError('invalid_identity');
  const name=typeof claims.name==='string'&&claims.name.trim().length>=2?claims.name.trim().slice(0,80):'Neuer Kontakt';
  return {issuer:claims.iss,subject:claims.sub,email,name};
}
export async function completeOidc(db,{provider,config,origin,code,state,cookie,now=Date.now(),fetchImpl=fetch}){
  const p=config[provider];
  if(!p)throw new OidcError('disabled');
  if(!statePattern.test(state||'')||!stateCookieMatches(cookie,state)||typeof code!=='string'||
     code.length<1||code.length>2048||/[\u0000-\u001f\u007f]/.test(code))throw new OidcError('invalid_state');
  const consumed=transaction(db,()=>{
    const r=db.prepare('SELECT * FROM vps_oidc_states WHERE state_hash=?').get(hash(state));
    db.prepare('DELETE FROM vps_oidc_states WHERE state_hash=?').run(hash(state));
    if(!r||r.provider!==provider||r.expires_at<=now)throw new OidcError('invalid_state');
    return r;
  });
  const form=new URLSearchParams({
    grant_type:'authorization_code',code,client_id:p.clientId,client_secret:p.clientSecret,
    redirect_uri:origin+'/auth/oidc/'+provider+'/callback/',code_verifier:consumed.verifier
  });
  let tokenReply,jwksReply;
  try{
    tokenReply=await fetchImpl(p.tokenEndpoint,{method:'POST',headers:head,body:form.toString(),signal:AbortSignal.timeout(8000),redirect:'error'});
    const token=await boundedJSON(tokenReply,32000);
    if(typeof token.id_token!=='string')throw new OidcError('invalid_identity');
    jwksReply=await fetchImpl(p.jwksEndpoint,{method:'GET',signal:AbortSignal.timeout(8000),redirect:'error'});
    const identity=verifyIdToken(token.id_token,await boundedJSON(jwksReply,80000),
      {provider:p,nonce:consumed.nonce,now:Math.floor(now/1000)});
    return transaction(db,()=>{
      const existingLink=db.prepare('SELECT user_id FROM vps_oidc_links WHERE issuer=? AND subject=?')
        .get(identity.issuer,identity.subject);
      let user;
      if(existingLink){
        if(consumed.link_user_id && consumed.link_user_id!==existingLink.user_id)throw new OidcError('link_required');
        user=db.prepare('SELECT id,email,disabled FROM vps_users WHERE id=?').get(existingLink.user_id);
        if(!user||user.disabled||user.email!==identity.email)throw new OidcError('link_required');
      }else if(consumed.link_user_id){
        user=db.prepare('SELECT id,email,disabled FROM vps_users WHERE id=?').get(consumed.link_user_id);
        if(!user||user.disabled||user.email!==identity.email)throw new OidcError('link_required');
        db.prepare('INSERT INTO vps_oidc_links(issuer,subject,user_id,linked_at) VALUES (?,?,?,?)')
          .run(identity.issuer,identity.subject,user.id,new Date(now).toISOString());
      }else{
        // Existing account (especially owner/developer) can only link while signed in with its own credential.
        if(db.prepare('SELECT 1 FROM vps_users WHERE email=?').get(identity.email))
          throw new OidcError('link_required');
        user=createCredentialsUser(db,identity.email,random());
        const iso=new Date(now).toISOString(),mutation=randomBytes(18).toString('base64url');
        db.prepare('INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,NULL,?,?,?,?,1,?)')
          .run(user.id,identity.name,identity.email,consumed.intent,'pending','2026-10-28',iso,iso,mutation);
        db.prepare('INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
          .run(randomBytes(18).toString('base64url'),user.id,'profile.social-pending',user.id,iso);
        db.prepare('INSERT INTO vps_oidc_links(issuer,subject,user_id,linked_at) VALUES (?,?,?,?)')
          .run(identity.issuer,identity.subject,user.id,iso);
      }
      return {userId:user.id,newAccount:!existingLink&&!consumed.link_user_id};
    });
  }catch(error){
    if(error instanceof OidcError)throw error;
    throw new OidcError('provider_unavailable');
  }finally{
    // No raw OAuth token or authorization code is persisted.
    await tokenReply?.body?.cancel?.().catch(()=>{});
    await jwksReply?.body?.cancel?.().catch(()=>{});
  }
}
