import {assertRequestAuthority,authorityTransaction,bindRequestAuthority,carryRequestAuthority,rememberRequestAuthority,revocationAcknowledgement} from './request-authority.ts';
import { randomBytes, createHash, createHmac, scrypt as nodeScrypt, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { z } from 'zod';
import { assert, DomainError, type Actor,type Entity, type Data, type Transaction,type CommandContext } from '../../packages/domain/core.js';
import type { Request, Response } from 'express';

export interface QueryResult {rows:any[]}
export interface SqlTransaction extends Transaction {query?:(sql:string,params?:any[])=>Promise<QueryResult>}
export interface DatabaseLike {query:(sql:string,params?:any[])=>Promise<QueryResult>;transaction:<T>(companyId:string,actorId:string,fn:(tx:SqlTransaction)=>Promise<T>,timeoutMs?:number,readOnly?:boolean)=>Promise<T>;close?:()=>Promise<void>}
export interface EngineLike {actorIn?:(tx:any,userId:string)=>Promise<Actor>;visible?:(tx:any,actor:Actor,entity:Entity)=>Promise<boolean>;scope?:(actor:Actor,permission:string)=>Actor;context?:(tx:any,actor:Actor,key:string,version:number|undefined,now:string,scopedUserIds:string[],permission:string)=>CommandContext;authorizeEntity?:(tx:any,userId:string,kind:string,id:string)=>Promise<{actor:Actor;entity:Entity}>;execute:(actor:Actor,name:string,envelope:{input:unknown;expected_version?:number;idempotency_key:string;native_device?:{id:string;token_hash:string}})=>Promise<any>;readEntities:(actor:Actor,kind:string)=>Promise<any[]>;readEntitiesPage?:(actor:Actor,kind:string,page:{limit:number;snapshotAt:string;after?:{createdAt:string;id:string}},channelId?:string)=>Promise<{items:Entity[];has_more:boolean;cursorAfter?:{createdAt:string;id:string}}>;getActor:(userId:string,companyId:string)=>Promise<Actor>;registry:Record<string,any>}
export interface AuthOptions {companyId:string;appMode:string;publicOrigin?:string;cookieSecure?:boolean;encryptionKey?:string}
export function freshMfa(verified:unknown,createdAt:unknown,now=Date.now()):boolean {const age=now-new Date(String(createdAt)).getTime();return verified===true&&Number.isFinite(age)&&age>=-30000&&age<=10*60000;}
export const SESSION_COOKIE='knaba_session';
export const GUEST_COOKIE='knaba_guest';
export const hashToken=(value:string)=>createHash('sha256').update(value).digest('hex');
export const opaqueToken=()=>randomBytes(32).toString('base64url');
export const csrfFor=(token:string)=>createHmac('sha256',token).update('KNABA-DE-CSRF-v1').digest('base64url');
const passwordSchema=z.string().min(8).max(128);
const privileged=['OWNER','DIRECTOR','OPERATIONS_MANAGER','ACCOUNTANT','BOT_ADMIN','DISPATCHER'];
const derive=(password:string,salt:Buffer)=>new Promise<Buffer>((resolve,reject)=>nodeScrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){passwordSchema.parse(password);const salt=randomBytes(24);const key=await derive(password,salt);return `scrypt$v1$32768$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;}
export async function verifyPassword(password:string,stored:string){if(password.length>128)return false;const parts=stored.split('$');if(parts.length!==7||parts.slice(0,5).join('$')!=='scrypt$v1$32768$8$1')return false;try{const salt=Buffer.from(parts[5]!,'base64url'),expected=Buffer.from(parts[6]!,'base64url');if(salt.length!==24||expected.length!==64)return false;const actual=await derive(password,salt);return timingSafeEqual(actual,expected);}catch{return false;}}
export function parseCookies(value?:string){const out:Record<string,string>={};for(const segment of (value??'').split(';')){const index=segment.indexOf('=');if(index<1)continue;try{out[segment.slice(0,index).trim()]=decodeURIComponent(segment.slice(index+1).trim());}catch{}}return out;}
export function sameOrigin(req:Request,configuredOrigin?:string){const origin=req.get('origin');if(req.get('sec-fetch-site')==='cross-site')throw new DomainError('ACCESS_DENIED');if(!origin)return;let expected=configuredOrigin; if(!expected)expected=`${req.protocol}://${req.get('host')}`;assert(origin===new URL(expected).origin,'ACCESS_DENIED');}
export function requireCsrf(req:Request,token:string,configuredOrigin?:string){sameOrigin(req,configuredOrigin);const provided=req.get('x-csrf-token')??'';const expected=csrfFor(token);const p=Buffer.from(provided),e=Buffer.from(expected);assert(p.length===e.length&&timingSafeEqual(p,e),'ACCESS_DENIED',{reason:'CSRF_REQUIRED'});}
export function sealSecret(secret:string,key?:string){if(!key)throw new DomainError('MISSING_CONFIGURATION',{field:'AUTH_ENCRYPTION_KEY'});const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(key).digest(),iv);const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');}
export function openSecret(sealed:string,key?:string){if(!key)throw new DomainError('MISSING_CONFIGURATION',{field:'AUTH_ENCRYPTION_KEY'});const [i,t,e]=sealed.split('.');assert(i&&t&&e,'NEEDS_REAUTH');try{const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(key).digest(),Buffer.from(i,'base64url'));decipher.setAuthTag(Buffer.from(t,'base64url'));return Buffer.concat([decipher.update(Buffer.from(e,'base64url')),decipher.final()]).toString('utf8');}catch{throw new DomainError('NEEDS_REAUTH');}}
export function validateTotp(secret:string,token:string,now=Date.now()){if(!/^\d{6}$/.test(token))return null;try{const totp=new OTPAuth.TOTP({issuer:'KNABA DE',algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(secret)});const delta=totp.validate({token,timestamp:now,window:1});return delta===null?null:Math.floor(now/30000)+delta;}catch{return null;}}
export async function sql(tx:SqlTransaction,statement:string,params:any[]=[]){assert(tx.query,'MISSING_CONFIGURATION',{reason:'TRANSACTION_SQL_REQUIRED'});return tx.query(statement,params);}

export class RateLimiter {
 private buckets=new Map<string,{count:number;until:number}>();
 constructor(private limit=20,private windowMs=60000){}
 check(key:string,now=Date.now()){if(this.buckets.size>10000){for(const [k,v]of this.buckets)if(v.until<=now)this.buckets.delete(k);assert(this.buckets.size<=10000,'RATE_LIMITED');}const old=this.buckets.get(key);const bucket=!old||old.until<=now?{count:0,until:now+this.windowMs}:old;bucket.count++;this.buckets.set(key,bucket);assert(bucket.count<=this.limit,'RATE_LIMITED',{retryAfterSeconds:Math.ceil((bucket.until-now)/1000)});}
}
export class AuthService {
 private limiter=new RateLimiter(12,60000);
 private dummyHash=hashPassword('KNABA dummy timing password; no account');
 constructor(public db:DatabaseLike,public engine:EngineLike,public options:AuthOptions){}
 cookie(res:Response,token:string,guest=false){res.cookie(guest?GUEST_COOKIE:SESSION_COOKIE,token,{httpOnly:true,secure:this.options.appMode==='PRODUCTION'||(this.options.cookieSecure??this.options.publicOrigin?.startsWith('https:')===true),sameSite:'strict',path:'/',maxAge:(guest?24:8)*3600000});}
 async createSession(userId:string,guest=false,mfa=false,tx?:SqlTransaction){const token=opaqueToken();const expiresAt=new Date(Date.now()+(guest?24:8)*3600000).toISOString();const statement='INSERT INTO auth_sessions(token_hash,user_id,company_id,expires_at,mfa_verified) VALUES($1,$2,$3,$4,$5)';const params=[hashToken(token),userId,this.options.companyId,expiresAt,mfa];if(tx)await sql(tx,statement,params);else await this.db.query(statement,params);return {token,csrfToken:csrfFor(token),expiresAt};}
 bindSession(req:Request,actor:Actor,token:string){const bound=bindRequestAuthority(actor,{kind:'session',companyId:actor.companyId,userId:actor.userId,tokenHash:hashToken(token)});return rememberRequestAuthority(req,this.db,bound);}
 transaction<T>(actor:Actor,fn:(tx:SqlTransaction)=>Promise<T>,timeoutMs?:number,readOnly=false){return authorityTransaction(this.db,actor,fn,timeoutMs,readOnly,this.engine);}
 async authenticate(req:Request,guest=false){const bearer=req.get('authorization');if(bearer){assert(/^Bearer [A-Za-z0-9_-]{30,100}$/.test(bearer),'NEEDS_REAUTH');const token=bearer.slice(7);const devices=await this.db.transaction(this.options.companyId,'AUTH_DEVICE',tx=>tx.list('device'));const now=Date.now();const device=devices.find(d=>d.companyId===this.options.companyId&&d.data.tokenHash===hashToken(token)&&d.data.active===true&&(d.data.revokedAt===undefined||d.data.revokedAt===null)&&(d.data.revoked_at===undefined||d.data.revoked_at===null)&&typeof d.data.tokenExpiresAt==='string'&&Number.isFinite(Date.parse(d.data.tokenExpiresAt))&&Date.parse(d.data.tokenExpiresAt)>now);assert(device,'NEEDS_REAUTH');const actor=await this.engine.getActor(device.data.employeeId,this.options.companyId);assert(actor.companyId===this.options.companyId&&actor.userId===device.data.employeeId,'NEEDS_REAUTH');const bound=bindRequestAuthority({...actor,mfaVerified:false},{kind:'device',companyId:actor.companyId,userId:actor.userId,deviceId:device.id,tokenHash:hashToken(token)});return {actor:rememberRequestAuthority(req,this.db,bound),token,device,csrfToken:null,guest:false};}const cookies=parseCookies(req.get('cookie'));const token=cookies[guest?GUEST_COOKIE:SESSION_COOKIE];assert(token&&/^[A-Za-z0-9_-]{30,100}$/.test(token),'NEEDS_REAUTH');const result=await this.db.query('SELECT user_id,company_id,mfa_verified,created_at FROM auth_sessions WHERE token_hash=$1 AND company_id=$2 AND revoked_at IS NULL AND expires_at>now()',[hashToken(token),this.options.companyId]);const session=result.rows[0];assert(session,'NEEDS_REAUTH');const actor=await this.engine.getActor(session.user_id,session.company_id);return {actor:this.bindSession(req,{...actor,mfaVerified:freshMfa(session.mfa_verified,session.created_at),mfaVerifiedAt:new Date(session.created_at).toISOString()},token),token,csrfToken:csrfFor(token),guest,device:undefined};}
 async mutation(req:Request,guest=false){const auth=await this.authenticate(req,guest);if(!auth.device)requireCsrf(req,auth.token,this.options.publicOrigin);return auth;}
 async currentActor(actor:Actor){return this.transaction(actor,async tx=>{assert(this.engine.actorIn,'MISSING_CONFIGURATION');return carryRequestAuthority(actor,{...await this.engine.actorIn(tx,actor.userId),mfaVerified:actor.mfaVerified,mfaVerifiedAt:actor.mfaVerifiedAt});},10000,true);}
 async profileSnapshot(actor:Actor){return this.transaction(actor,async tx=>{assert(this.engine.actorIn,'MISSING_CONFIGURATION');const fresh=carryRequestAuthority(actor,{...await this.engine.actorIn(tx,actor.userId),mfaVerified:actor.mfaVerified,mfaVerifiedAt:actor.mfaVerifiedAt}),u=await tx.get('user',actor.userId);return {actor:fresh,user:{id:u.id,name:u.data.name??u.data.displayName,displayName:u.data.displayName,email:u.data.email,language:u.data.language,businessCode:u.data.businessCode,roles:u.data.roles??[]}};},10000,true);}
 async profile(actor:Actor){return (await this.profileSnapshot(actor)).user;}
 async login(req:Request,res:Response,input:any){
  sameOrigin(req,this.options.publicOrigin);
  const i=z.object({email:z.string().email().max(200),password:z.string().min(1).max(128),otp:z.string().regex(/^\d{6}$/).optional(),totp:z.string().regex(/^\d{6}$/).optional(),companyId:z.string().optional()}).strict().parse(input);
  assert(!i.companyId||i.companyId===this.options.companyId,'NEEDS_REAUTH');
  this.limiter.check(hashToken(`${req.ip??'unknown'}:${i.email.toLowerCase()}`));
  const user=await this.db.transaction(this.options.companyId,'AUTH_LOGIN',async tx=>(await tx.list('user')).find(u=>u.data.active!==false&&u.data.email?.toLowerCase()===i.email.toLowerCase()));
  const row=user?(await this.db.query('SELECT password_hash,totp_secret,totp_last_counter FROM auth_credentials WHERE user_id=$1 AND company_id=$2',[user.id,this.options.companyId])).rows[0]:undefined;
  // Keep scrypt outside the company lock. Its result is bound to the exact
  // credential revision re-read below, never to email or an earlier actor alone.
  const valid=await verifyPassword(i.password,row?.password_hash??await this.dummyHash);
  assert(user&&row&&valid,'NEEDS_REAUTH');
  assert(this.engine.actorIn,'MISSING_CONFIGURATION');
  const result=await this.db.transaction(this.options.companyId,'AUTH_LOGIN',async tx=>{
   const current=await tx.get('user',user.id).catch(error=>{if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')return null;throw error;});
   assert(current&&current.companyId===this.options.companyId&&current.data.active!==false&&current.data.email?.toLowerCase()===i.email.toLowerCase(),'NEEDS_REAUTH');
   const credential=(await sql(tx,'SELECT password_hash,totp_secret,totp_last_counter FROM auth_credentials WHERE user_id=$1 AND company_id=$2 FOR UPDATE',[user.id,this.options.companyId])).rows[0];
   assert(credential&&credential.password_hash===row.password_hash&&(credential.totp_secret??null)===(row.totp_secret??null),'NEEDS_REAUTH');
   // actorIn reuses this transaction; getActor would open a nested company lock.
   const actor=await this.engine.actorIn!(tx,user.id);
   assert(actor.userId===user.id&&actor.companyId===this.options.companyId,'NEEDS_REAUTH');
   let mfa=false;
   if(credential.totp_secret){
    const counter=validateTotp(openSecret(credential.totp_secret,this.options.encryptionKey),i.otp??i.totp??'');
    assert(counter!==null,'NEEDS_REAUTH');
    const updated=await sql(tx,'UPDATE auth_credentials SET totp_last_counter=$3 WHERE user_id=$1 AND company_id=$2 AND totp_last_counter<$3 RETURNING user_id',[user.id,this.options.companyId,counter]);
    assert(updated.rows.length===1,'NEEDS_REAUTH');mfa=true;
   }else assert(this.options.appMode!=='PRODUCTION'||!actor.roles.some(r=>privileged.includes(r)),'NEEDS_REAUTH');
   // Credential changes, revocation and issuance serialize on the same company
   // lock. A later rotation sees/revokes this session; an earlier one is rejected.
   const session=await this.createSession(user.id,false,mfa,tx);
   return {actor:{...actor,mfaVerified:mfa},user:{id:current.id,name:current.data.name??current.data.displayName,displayName:current.data.displayName,email:current.data.email,language:current.data.language,businessCode:current.data.businessCode,roles:actor.roles},session};
  },10000);
  // Never emit an authentication cookie before the transaction commits.
  this.cookie(res,result.session.token);
  return {actor:this.bindSession(req,result.actor,result.session.token),user:result.user,mode:this.options.appMode,csrfToken:result.session.csrfToken,expiresAt:result.session.expiresAt};
 }
 async demo(req:Request,res:Response,input:any){sameOrigin(req,this.options.publicOrigin);assert(this.options.appMode==='DEMO','NOT_FOUND_SAFE');const i=z.object({role:z.string().min(1).max(60)}).strict().parse(input);this.limiter.check(hashToken(`demo:${req.ip??'unknown'}`));const requestedRole=({FOREMAN:'INTERNAL_BAULEITER',TEAM_LEAD:'TEAM_LEADER',WAREHOUSE:'STOREKEEPER'} as Record<string,string>)[i.role]??i.role;const user=await this.db.transaction(this.options.companyId,'AUTH_DEMO',async tx=>(await tx.list('user')).find(u=>u.data.active!==false&&(u.data.synthetic===true||u.data.demo===true)&&u.data.roles?.includes(requestedRole)));assert(user,'NOT_FOUND_SAFE');const session=await this.createSession(user.id,false,true);this.cookie(res,session.token);const actor=this.bindSession(req,{...await this.engine.getActor(user.id,this.options.companyId),mfaVerified:true},session.token);return {actor,user:await this.profile(actor),mode:'DEMO',csrfToken:session.csrfToken,expiresAt:session.expiresAt};}
 async logout(req:Request,res:Response){const auth=await this.mutation(req);await this.db.transaction(auth.actor.companyId,auth.actor.userId,async tx=>{await assertRequestAuthority(tx,auth.actor);await sql(tx,'UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND company_id=$2',[hashToken(auth.token),auth.actor.companyId]);});res.clearCookie(SESSION_COOKIE,{httpOnly:true,secure:this.options.appMode==='PRODUCTION'||(this.options.cookieSecure??this.options.publicOrigin?.startsWith('https:')===true),sameSite:'strict',path:'/'});return revocationAcknowledgement(auth.actor,false);}
 async bootstrapOwner(input:{email:string;name:string;password:string;totpSecret:string;evidence:string}){assert(this.options.appMode==='PRODUCTION','INVALID_STATE');z.object({email:z.string().email(),name:z.string().min(1),password:passwordSchema,totpSecret:z.string().regex(/^[A-Z2-7]{16,100}$/),evidence:z.string().min(8)}).strict().parse(input);const passwordHash=await hashPassword(input.password),secret=sealSecret(input.totpSecret,this.options.encryptionKey);return this.db.transaction(this.options.companyId,'OFFLINE_BOOTSTRAP',async tx=>{assert(!(await tx.list('user')).some(u=>u.data.roles?.includes('OWNER')),'INVALID_STATE',{reason:'BOOTSTRAP_CLOSED'});const user=await tx.add('user',{name:input.name,email:input.email.toLowerCase(),roles:['OWNER'],permissions:['identity.manage','role.manage','legal.manage','company.manage','bot.manage','audit.read','scope.company'],siteIds:[],warehouseIds:[],customerIds:[],active:true,bootstrapEvidence:input.evidence,mfaRequired:true});await sql(tx,'INSERT INTO auth_credentials(user_id,company_id,password_hash,totp_secret,totp_last_counter) VALUES($1,$2,$3,$4,-1)',[user.id,this.options.companyId,passwordHash,secret]);await tx.event('identity.owner_bootstrapped',{userId:user.id,evidence:input.evidence});return {userId:user.id,companyId:this.options.companyId};});}
}
