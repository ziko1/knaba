import {createHmac} from 'node:crypto';
import {createSiteConsentAuthority} from './site-identity-consent.mjs';
import {renderSiteIdentityPage,siteIdentityClient} from './site-identity-ui.mjs';
import {challengeTokenPattern,exactObject,requireValue,requireActive,transportFingerprint,secureEqual,
 peerRequest,readProof,verifyRequest,signResponse,FederationError,digest,trustFingerprint,proofHash} from './site-identity-protocol.mjs';

const browserPaths=new Set(['/auth/site-identity/session','/auth/site-identity/preview','/auth/site-identity/consent']);
const sessionPath='/auth/site-identity/introspect-session';
const backPaths=new Set(['/auth/site-identity/inspect','/auth/site-identity/redeem',sessionPath]);
const csrf=token=>createHmac('sha256',token).update('KNABA-SITE-IDENTITY-CSRF-V1').digest('base64url');
const previewProof=(token,challenge,user)=>createHmac('sha256',token).update(JSON.stringify(['KNABA-SITE-IDENTITY-PREVIEW-V1',
 ...['id','challengeDigest','nonceDigest','companyId','issuer','audience','targetUserId','targetDisplayName','targetEmail','companyName','trustFingerprint','expiresAt'].map(key=>challenge[key]),
 user.subject,user.sessionDigest,user.profileVersion,user.profileFingerprint])).digest('hex');
const publicUser=user=>({id:user.subject,displayName:user.displayName,email:user.email});
const fullChallenge=(value,peer,token)=>{const row=exactObject(value,['id','challengeDigest','nonceDigest','companyId','issuer','audience','targetUserId','targetDisplayName','targetEmail','companyName','trustFingerprint','expiresAt']);
 const text=(value,max)=>typeof value==='string'&&Buffer.byteLength(value)<=max&&!/[\u0000-\u001f\u007f]/.test(value),now=Date.now();
 requireValue(row.id===token.split('.')[0]&&row.challengeDigest===digest(token)&&typeof row.nonceDigest==='string'&&proofHash.test(row.nonceDigest)&&
  row.companyId===peer.companyId&&row.issuer===peer.issuer&&row.audience===peer.audience&&row.trustFingerprint===trustFingerprint(peer)&&
  text(row.targetUserId,200)&&row.targetUserId.length>0&&!/\s/.test(row.targetUserId)&&text(row.targetDisplayName,1024)&&text(row.targetEmail,320)&&text(row.companyName,1024)&&
  Number.isSafeInteger(row.expiresAt)&&row.expiresAt>now&&row.expiresAt<=now+300_000,'ACCESS_DENIED');return row;};

export function createSiteIdentityHandler(db,{config,developerEmail='',origin,localTest=false,transport=peerRequest,sessionsEnabled=()=>false}={}){
 const authority=createSiteConsentAuthority(db,{config,developerEmail,sessionsEnabled}),buckets=new Map();
 const requireSessions=()=>requireValue(sessionsEnabled()===true,'MISSING_CONFIGURATION');
 function rate(key,limit=40){const now=Date.now();if(!buckets.has(key)&&buckets.size>=5000){for(const [id,row]of buckets)if(row.until<=now)buckets.delete(id);requireValue(buckets.size<5000,'RATE_LIMITED');}
  const old=buckets.get(key),row=!old||old.until<=now?{count:0,until:now+60_000}:old;row.count++;buckets.set(key,row);requireValue(row.count<=limit,'RATE_LIMITED');}
 function peer(){const current=requireActive(config());requireValue(localTest||current.siteOrigin===origin,'MISSING_CONFIGURATION');return current;}
 function unchanged(original){requireValue(transportFingerprint(peer())===transportFingerprint(original));}
 return async function handle({req,res,url,accountUser,readBody,sameAccountSession,developerWorkspace=false,clientIp=''}){
  const path=url.pathname;
  if(!browserPaths.has(path)&&!backPaths.has(path)&&!['/account/erp/','/account/erp','/auth/site-identity-ui.js'].includes(path))return false;
  const reply=(status,value,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',
   'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Vary':'Cookie','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",...extra});
   res.end(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value));return true;};
  if(['/account/erp/','/account/erp','/auth/site-identity-ui.js'].includes(path)){
   if(req.method!=='GET')return reply(405,{code:'METHOD_NOT_ALLOWED'},{Allow:'GET'});
   return reply(200,path.endsWith('.js')?siteIdentityClient:renderSiteIdentityPage('site'),{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});
  }
  try{
   requireValue(!url.search,'VALIDATION_ERROR');if(path===sessionPath)requireSessions();const currentPeer=peer();
   if(backPaths.has(path)){
    requireValue(req.method==='POST'&&String(req.headers['content-type']||'').split(';')[0]==='application/json','VALIDATION_ERROR');
    const bytes=await readBody(8192);if(path===sessionPath)requireSessions();
    const signed=verifyRequest(currentPeer,path,bytes,readProof(req.headers));unchanged(currentPeer);
    const input=JSON.parse(bytes.toString('utf8'));
    // A per-session transport limiter is not an authority cache. F2 keeps its
    // existing peer bucket; each accepted introspection still reads live SQLite.
    if(path===sessionPath){
     requireValue(typeof input?.sessionDigest==='string'&&input.sessionDigest.length===64&&proofHash.test(input.sessionDigest),'VALIDATION_ERROR');
     rate('session:'+digest(JSON.stringify([currentPeer.keyId,input.sessionDigest])),600);
    }else rate(currentPeer.keyId);
    const result=path===sessionPath?authority.introspectSession(input):path.endsWith('/inspect')?authority.inspect(input):authority.redeem(input);
    unchanged(currentPeer);const returned=Buffer.from(JSON.stringify(result));
    const signature=signResponse(currentPeer,path,returned,signed);if(path===sessionPath)requireSessions();
    return reply(200,returned,{'x-knaba-federation-response':signature});
   }
   requireValue(!developerWorkspace&&accountUser&&sameAccountSession(),'NEEDS_REAUTH');
   rate(digest(clientIp+':'+accountUser.id));
   const first=authority.current(req.headers.cookie);
   if(path.endsWith('/session')){
    requireValue(req.method==='GET','VALIDATION_ERROR');
    return reply(200,{user:publicUser(first),csrfToken:csrf(accountUser.token)});
   }
   requireValue(req.method==='POST'&&String(req.headers['content-type']||'').split(';')[0]==='application/json'&&
    req.headers.origin===currentPeer.siteOrigin&&!['cross-site','none'].includes(req.headers['sec-fetch-site'])&&
    req.headers['x-knaba-request']==='site-identity-v1'&&secureEqual(req.headers['x-csrf-token'],csrf(accountUser.token)));
   const input=exactObject(JSON.parse((await readBody(4096)).toString('utf8')),path.endsWith('/consent')?['challengeToken','previewProof','confirmed']:['challengeToken']);
   requireValue(typeof input.challengeToken==='string'&&challengeTokenPattern.test(input.challengeToken),'VALIDATION_ERROR');
   const challenge=fullChallenge(await transport(currentPeer,'erp','/api/v1/auth/site-links/inspect-challenge',{challengeToken:input.challengeToken}),currentPeer,input.challengeToken);
   unchanged(currentPeer);requireValue(sameAccountSession(),'NEEDS_REAUTH');const user=authority.current(req.headers.cookie);
   requireValue(user.subject===first.subject&&user.sessionDigest===first.sessionDigest&&user.profileFingerprint===first.profileFingerprint,'NEEDS_REAUTH');
   const expected=previewProof(accountUser.token,challenge,user);
   if(path.endsWith('/preview'))return reply(200,{site:publicUser(user),user:{id:challenge.targetUserId,displayName:challenge.targetDisplayName,email:challenge.targetEmail},
    company:{id:challenge.companyId,name:challenge.companyName},expiresAt:Math.min(challenge.expiresAt,user.expiresAt,currentPeer.expiresAt?Date.parse(currentPeer.expiresAt):Infinity),previewProof:expected});
   requireValue(input.confirmed===true&&secureEqual(input.previewProof,expected));
   const result=authority.consent({cookieHeader:req.headers.cookie,challenge});unchanged(currentPeer);
   return reply(200,{expiresAt:result.expiresAt,redirectUrl:currentPeer.erpOrigin+'/account/site-link/#challenge='+encodeURIComponent(input.challengeToken)+'&grant='+encodeURIComponent(result.grantToken)});
  }catch(error){
   const code=error instanceof FederationError?error.code:error instanceof SyntaxError?'VALIDATION_ERROR':error?.code==='session_revoked'?'NEEDS_REAUTH':'DEPENDENCY_UNAVAILABLE';
   const status=code==='NEEDS_REAUTH'?401:code==='ACCESS_DENIED'?403:code==='VALIDATION_ERROR'?400:code==='RATE_LIMITED'?429:503;
   return reply(status,{code});
  }
 };
}
