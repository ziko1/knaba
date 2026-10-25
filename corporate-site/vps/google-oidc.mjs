import { randomBytes, createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { normalizeEmail } from './auth.mjs';

/** Fail-closed Google OIDC (web authorization-code + PKCE). No bearer/refresh tokens persist. */
const authorizeEndpoint='https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint='https://oauth2.googleapis.com/token';
const jwksEndpoint='https://www.googleapis.com/oauth2/v3/certs';
const stateAge=600;
const digest=value=>createHash('sha256').update(value).digest('hex');
const safeRandom=()=>randomBytes(32).toString('base64url');
const stateCookieName='__Host-knaba-google-state';

export function googleSchemaReady(db){
  try {
    const count=db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('vps_google_states','vps_google_identities','vps_google_only_users')").get()?.n;
    return count===3;
  }catch{return false;}
}
export function googleConfigured({enabled=false,clientId='',clientSecret=''}={},db){
  return enabled===true && typeof clientId==='string' && /^[\w.-]{10,220}\.apps\.googleusercontent\.com$/.test(clientId)
    && typeof clientSecret==='string' && clientSecret.length>=8 && clientSecret.length<=1024
    && googleSchemaReady(db);
}
export function googleStateCookie(value,{secure=true,clear=false}={}){
  return stateCookieName+'='+(clear?'':value)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+(clear?'0':String(stateAge))+(secure?'; Secure':'');
}
export function googleCookieState(rawCookie){
  if(typeof rawCookie!=='string'||rawCookie.length>4096)return '';
  const found=rawCookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(stateCookieName+'='));
  const value=found?.slice(stateCookieName.length+1)||'';
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';
}
export function startGoogleLogin(db,{clientId,origin,returnTo='/konto/'}){
  if(!googleSchemaReady(db))throw Error('Social schema unavailable');
  const now=Math.floor(Date.now()/1000);
  db.prepare('DELETE FROM vps_google_states WHERE expires_at<=?').run(now);
  if(db.prepare('SELECT count(*) AS n FROM vps_google_states').get().n>=2000)throw Error('Too many in-progress logins');
  const state=safeRandom(),nonce=safeRandom(),verifier=safeRandom();
  db.prepare('INSERT INTO vps_google_states (state_hash,nonce,verifier,return_to,expires_at) VALUES (?,?,?,?,?)')
    .run(digest(state),nonce,verifier,returnTo,now+stateAge);
  const redirectUri=new URL('/auth/google/callback',origin).href;
  const url=new URL(authorizeEndpoint);
  for(const [name,value] of Object.entries({
    client_id:clientId,redirect_uri:redirectUri,response_type:'code',
    scope:'openid email profile',state,nonce,
    code_challenge:createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method:'S256'
  }))url.searchParams.set(name,value);
  return {authorizationUrl:url.href,state};
}
export function consumeGoogleState(db,{state,cookieState}){
  if(typeof state!=='string'||typeof cookieState!=='string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(cookieState) ||
    !timingSafeEqual(Buffer.from(state),Buffer.from(cookieState)))throw Error('Invalid OIDC state');
  const row=db.prepare('DELETE FROM vps_google_states WHERE state_hash=? AND expires_at>? RETURNING nonce,verifier,return_to')
    .get(digest(state),Math.floor(Date.now()/1000));
  if(!row)throw Error('Expired or replayed OIDC state');
  return row;
}
function decodePart(segment){
  if(typeof segment!=='string'||segment.length>11000 || !/^[A-Za-z0-9_-]+$/.test(segment))throw Error('Malformed token');
  return JSON.parse(Buffer.from(segment,'base64url').toString('utf8'));
}
export async function verifyGoogleIdToken(idToken,{clientId,nonce,fetchImpl=fetch,now=Math.floor(Date.now()/1000)}){
  if(typeof idToken!=='string'||idToken.length>16500)throw Error('Invalid ID token');
  const segments=idToken.split('.');
  if(segments.length!==3)throw Error('Malformed ID token');
  const [head,body,sig]=segments;
  const header=decodePart(head),claims=decodePart(body);
  if(header?.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128)throw Error('Unsupported JWT algorithm');
  if(!sig||sig.length>1500||!/^[A-Za-z0-9_-]+$/.test(sig))throw Error('Malformed JWT signature');
  if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss) ||
      claims.aud!==clientId || (claims.azp!==undefined&&claims.azp!==clientId) ||
      claims.nonce!==nonce || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) ||
      claims.iat>now+60 || claims.iat<now-7200 || claims.exp<=now || claims.exp>now+7200 ||
      !(claims.email_verified===true||claims.email_verified==='true') ||
      typeof claims.sub!=='string'||!/^[\x21-\x7e]{1,255}$/.test(claims.sub))
    throw Error('Invalid Google identity claims');
  const address=normalizeEmail(claims.email);
  const response=await fetchImpl(jwksEndpoint,{method:'GET',redirect:'error',signal:AbortSignal.timeout(6500)});
  if(!response.ok)throw Error('Google JWKS fetch failed');
  const keys=await response.json();
  if(!Array.isArray(keys?.keys) || keys.keys.length>24)throw Error('Invalid Google JWKS');
  const key=keys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg!=='HS256'&&
    (!k.use||k.use==='sig') && (!k.key_ops||k.key_ops.includes('verify')));
  if(!key)throw Error('Signing key unavailable');
  let publicKey;
  try {publicKey=createPublicKey({key,format:'jwk'});}catch{throw Error('Bad signing key');}
  if(!verify('RSA-SHA256',Buffer.from(head+'.'+body),publicKey,Buffer.from(sig,'base64url')))
    throw Error('Invalid Google JWT signature');
  return {subject:claims.sub,email:address};
}
export async function exchangeGoogleCode(code,{verifier,nonce},{clientId,clientSecret,origin,fetchImpl=fetch}){
  if(typeof code!=='string'||code.length<4||code.length>2048||!/^[A-Za-z0-9_./-]+$/.test(code))
    throw Error('Invalid authorization code');
  const form=new URLSearchParams({
    code,client_id:clientId,client_secret:clientSecret,redirect_uri:new URL('/auth/google/callback',origin).href,
    grant_type:'authorization_code',code_verifier:verifier
  });
  const response=await fetchImpl(tokenEndpoint,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,
    redirect:'error',signal:AbortSignal.timeout(6500)
  });
  if(!response.ok)throw Error('Google code exchange failed');
  const json=await response.json();
  if(typeof json?.id_token!=='string')throw Error('Google ID token missing');
  return verifyGoogleIdToken(json.id_token,{clientId,nonce,fetchImpl});
}
export function googleOnlyUser(db,userId){
  if(!googleSchemaReady(db))return false;
  return Boolean(db.prepare('SELECT 1 FROM vps_google_only_users WHERE user_id=?').get(userId));
}
/** Provider subject is the only identity key. Email never grants owner or links an existing account. */
export function acceptGoogleIdentity(db,{subject,email,ownerEmail=''}) {
  if(!googleSchemaReady(db))throw Error('Social schema unavailable');
  if(typeof subject!=='string'||!/^[\x21-\x7e]{1,255}$/.test(subject))throw Error('Invalid Google subject');
  const address=normalizeEmail(email),owner=ownerEmail?normalizeEmail(ownerEmail):'';
  if((owner && address===owner)||address==='kontakt@knaba.de')
    throw Error('Company owner email requires protected account linking');
  const mapped=db.prepare('SELECT u.id,u.email,u.disabled FROM vps_google_identities g JOIN vps_users u ON u.id=g.user_id WHERE g.google_sub=?').get(subject);
  if(mapped){
    if(mapped.disabled || mapped.email!==address)throw Error('Google email changed; account recovery required');
    return {id:mapped.id,email:mapped.email,created:false};
  }
  const userId=randomBytes(18).toString('base64url');
  const salt=randomBytes(16).toString('hex');
  // A uniformly random 512-bit value cannot be known as a password/scrypt digest.
  const unmatchablePasswordHash=randomBytes(64).toString('hex');
  db.exec('BEGIN IMMEDIATE');
  try{
    if(db.prepare('SELECT 1 FROM vps_users WHERE email=?').get(address))throw Error('Manual account linking required');
    if(db.prepare('SELECT 1 FROM vps_google_identities WHERE google_sub=?').get(subject))throw Error('Concurrent Google identity');
    db.prepare('INSERT INTO vps_users (id,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)')
      .run(userId,address,salt,unmatchablePasswordHash,new Date().toISOString());
    db.prepare('INSERT INTO vps_google_identities (google_sub,user_id,created_at) VALUES (?,?,?)')
      .run(subject,userId,new Date().toISOString());
    db.prepare('INSERT INTO vps_google_only_users (user_id) VALUES (?)').run(userId);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return {id:userId,email:address,created:true};
}
