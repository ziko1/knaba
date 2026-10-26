import { createServer as createHttpServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,relative,sep,join,extname } from 'node:path';
import { createHash } from 'node:crypto';
import { openLocalDatabase } from './database.mjs';
import { createLogin,createSession,readSession,destroySession,sessionCookie,expiredCookie } from './auth.mjs';
import {googleConfigured,googleOnlyUser,startGoogleLogin,consumeGoogleState,exchangeGoogleCode,acceptGoogleIdentity,googleStateCookie,googleCookieState} from './google-oidc.mjs';
import { beginSignup,finishSignup,cancelUndeliveredSignup,makeWorkerInvite,signupSchemaReady,emailSignupEnabled,sendVerificationEmail } from './auth-signup.mjs';
import { editablePublicHtmlPath } from './seo.mjs';
import { renderPublishedPage } from '../dist/vps/render-page.mjs';

const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8',
  '.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'
};
const loginStyle='body{background:#f2f6f2;margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;color:#193e32}main{background:#fff;width:min(400px,90vw);padding:2.2rem;border:1px solid #d2e2d7;border-radius:18px;box-shadow:0 20px 55px #12392710}h1{font-size:1.5rem}label{display:block;margin:1rem 0;font-size:.9rem;font-weight:600}input{display:block;width:100%;box-sizing:border-box;padding:.78rem;font:inherit;margin-top:.45rem;border:1px solid #aabcb4;border-radius:8px}button{width:100%;background:#155b46;color:white;border:none;padding:.85rem;border-radius:8px;font:inherit;cursor:pointer}a{color:#195d47}.error{padding:.6rem;color:#8c1f20;background:#feecec}';
const escapeHTML=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const returnPath=value=>{
  if(typeof value!=='string'||value.length>180||!value.startsWith('/')||value.startsWith('//')||value.includes('\\')||/[\r\n\0]/.test(value))return '/konto/';
  try{const u=new URL(value,'https://knaba.de');return u.origin==='https://knaba.de'?u.pathname+u.search:'/konto/';}catch{return '/konto/';}
};
function html(title,content){
  return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHTML(title)+'</title><style>'+loginStyle+'</style></head><body><main>'+content+'</main></body></html>';
}
function send(res,status,body,headers={}){
  res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(body);
}
function redirect(res,to,extra={}){
  send(res,303,'See Other',{Location:to,...extra});
}
const csrfOK=(req,host,origin)=>{
  const clientOrigin=req.headers.origin;
  const site=req.headers['sec-fetch-site'];
  return clientOrigin===origin && site!=='cross-site' && site!=='none' && req.headers.host===host;
};
async function readBody(req,limit){
  let total=0;
  const chunks=[];
  for await(const c of req){
    total+=c.length;
    if(total>limit){const err=new Error('body too large');err.code='too_large';throw err;}
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function sendStatic(root,req,res,path,db){
  let decoded;
  try{decoded=decodeURIComponent(path);}catch{return send(res,400,'Bad path');}
  if(decoded.includes('\0')||decoded.includes('\\')||/\/\./.test(decoded))return send(res,404,'Not found');
  let file=resolve(root,'.'+decoded);
  if(!file.startsWith(root+sep) && file!==root)return send(res,404,'Not found');
  let stats=await stat(file).catch(()=>null);
  if(stats?.isDirectory() || path.endsWith('/')){
    file=join(file,'index.html');
    stats=await stat(file).catch(()=>null);
  }
  if(!stats?.isFile() && !path.endsWith('/') && !extname(path)){
    return redirect(res,path+'/');
  }
  if(!stats?.isFile()){
    res.statusCode=404;
    file=join(root,'404.html');
    stats=await stat(file).catch(()=>null);
    if(!stats?.isFile())return send(res,404,'Not found');
  }
  if(stats.size>10*1024*1024)return send(res,413,'Asset too large');
  const ext=extname(file).toLowerCase();
  let bytes=await readFile(file);
  // Only published SEO fields appear in the HTTP HTML returned to crawlers.
  // Drafts, private routes and error pages must never influence page metadata.
  if(ext==='.html' && res.statusCode!==404 && editablePublicHtmlPath(decoded)){
    const row=db.prepare('SELECT published_json,published_version FROM studio_pages WHERE page_path=?').get(decoded);
    if(row?.published_version>0){
      const transformed=renderPublishedPage(bytes.toString('utf8'),row);
      bytes=Buffer.from(transformed,'utf8');
    }
  }
  const hashed=/\/_astro\//.test(path);
  const privatePath=/^\/(?:admin|studio|crm|konto|postfach|login|register|logout|auth|ru\/(?:konto|postfach))\//.test(path);
  res.setHeader('Content-Type',mime[ext]||'application/octet-stream');
  res.setHeader('Cache-Control',privatePath?'private, no-store':hashed?'public, max-age=31536000, immutable':'no-cache');
  if(privatePath||res.statusCode===404){
    res.setHeader('X-Robots-Tag','noindex, nofollow');
  }else if(ext==='.html' && bytes.includes('<meta name="robots" content="noindex, follow"')){
    // The Node VPS runtime does not apply Cloudflare Pages _headers rules.
    // Preserve the built HTML crawler gate in the actual HTTP response.
    res.setHeader('X-Robots-Tag','noindex, follow');
  }
  res.setHeader('Content-Length',bytes.length);
  res.end(req.method==='HEAD'?undefined:bytes);
}
function loginPage(returnTo,invalid=false){
  const error=invalid?'<p role="alert" class="error">Anmeldung fehlgeschlagen. Bitte Angaben prüfen.</p>':'';
  return html('KnaBa | Sicher anmelden','<h1>KnaBa · sicher anmelden</h1><p>Verwaltungszugang für autorisierte Personen.</p>'+error+
    '<form method="post" action="/login/"><input type="hidden" name="return_to" value="'+escapeHTML(returnTo)+'">'+
    '<label>E-Mail<input type="email" name="email" autocomplete="username" required maxlength="320"></label>'+
    '<label>Passwort<input type="password" name="password" autocomplete="current-password" required minlength="16" maxlength="256"></label>'+
    '<button type="submit">Anmelden</button></form><p><a href="/">Zur Website</a></p>');
}
function logoutPage(returnTo){
  return html('KnaBa | Abmelden','<h1>KNABA</h1><p>Sitzung beenden?</p>'+
    '<form method="post" action="/logout/"><input type="hidden" name="return_to" value="'+escapeHTML(returnTo)+'"><button type="submit">Abmelden</button></form>');
}
export async function createKnabaVpsServer({
  dbPath,staticRoot,workerPath,ownerEmail='',turnstileSiteKey='',turnstileSecretKey='',port=8080,host='0.0.0.0',
  origin='https://knaba.de',localTest=false,signup={},mailFetch=fetch,googleOidc={enabled:false,clientId:'',clientSecret:''}
}){
  if(!dbPath||!staticRoot||!workerPath)throw Error('DB, static and worker artifacts are required.');
  const base=new URL(origin);
  if(base.protocol!=='https:'&&!localTest)throw Error('Production HTTPS origin required.');
  const publicHost=base.host.toLowerCase();
  const {db,d1,migrations}=openLocalDatabase(dbPath,{allowMigrations:localTest});
  const googleReady=googleConfigured(googleOidc,db);
  const {default:worker}=await import(workerPath);
  const root=resolve(staticRoot);
  if(typeof worker.fetch!=='function')throw Error('Worker entry unavailable.');
  const env={DB:d1,OWNER_EMAIL:ownerEmail,TURNSTILE_SITE_KEY:turnstileSiteKey,TURNSTILE_SECRET_KEY:turnstileSecretKey,
    TURNSTILE_REQUIRED:localTest?'0':'1',
    ASSETS:{fetch:async request=>{
      return new Response('Static assets are served at the VPS edge.',{status:404});
    }}};
  const server=createHttpServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    if(!localTest && req.headers['x-forwarded-proto']==='https')
      res.setHeader('Strict-Transport-Security','max-age=604800');
    res.setHeader('X-Frame-Options','SAMEORIGIN');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    const challengeOrigin=turnstileSiteKey && turnstileSecretKey ? ' https://challenges.cloudflare.com' : '';
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'"+challengeOrigin+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"+challengeOrigin+"; frame-src 'self'"+challengeOrigin+"; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    const rawHost=String(req.headers.host||'').toLowerCase();
    const allowed=rawHost===publicHost || (localTest && /^127\.0\.0\.1(?::\d+)?$/.test(rawHost));
    const url=new URL(req.url||'/',origin);
    if(url.pathname==='/healthz' || url.pathname==='/readyz'){
      if(!allowed && !localTest)return send(res,421,'Wrong host');
      const ready=Boolean(ownerEmail&&db.prepare('SELECT id FROM vps_users WHERE email=? AND disabled=0').get(ownerEmail.toLowerCase()));
      return send(res,url.pathname==='/healthz'||ready?200:503,url.pathname==='/healthz'?'healthy':ready?'ready':'owner enrollment required');
    }
    if(publicHost==='knaba.de' && rawHost==='www.knaba.de'){
      if(!['GET','HEAD'].includes(req.method))return send(res,421,'Wrong host');
      return send(res,308,'Canonical origin',{Location:'https://knaba.de'+url.pathname+url.search});
    }
    if(!allowed)return send(res,421,'Wrong host');
    const effectiveOrigin=localTest&&rawHost.startsWith('127.0.0.1')?origin:(base.protocol+'//'+rawHost);
    // Local service is accessible only behind trusted loopback proxy; never trust client-provided identity.
    if(!localTest && req.headers['x-forwarded-proto']!=='https')return send(res,421,'TLS proxy required');
    // Public rebrand: stop serving the discontinued office-cleaning marketing URL.
    // Historical CRM service IDs are intentionally left intact.
    const legacyOffice=url.pathname.match(/^\/(?:(ru|en|uk)\/)?leistungen\/bueroreinigung\/?$/);
    if(publicHost==='kneba.vsp.rest' && legacyOffice){
      if(req.method!=='GET' && req.method!=='HEAD')return send(res,405,'Method not allowed',{Allow:'GET, HEAD'});
      const destination='/'+(legacyOffice[1]?legacyOffice[1]+'/':'')+'leistungen/';
      return send(res,308,'Service catalogue moved',{Location:destination});
    }
    if(url.pathname==='/auth/providers' && req.method==='GET'){
      return send(res,200,JSON.stringify({
        email:emailSignupEnabled(db,signup),google:googleReady,
        sms:false,facebook:false,microsoft:false,apple:false
      }),{'Content-Type':'application/json; charset=utf-8','X-Robots-Tag':'noindex, nofollow'});
    }
    if(url.pathname==='/auth/google/start'){
      if(!googleReady)return send(res,404,'Provider disabled');
      if(req.method!=='GET')return send(res,405,'Method not allowed',{Allow:'GET'});
      try{
        const state=startGoogleLogin(db,{clientId:googleOidc.clientId,origin:effectiveOrigin,returnTo:returnPath(url.searchParams.get('return_to'))});
        return send(res,302,'Continue to Google',{Location:state.authorizationUrl,
          'Set-Cookie':googleStateCookie(state.state,{secure:!localTest}),'Referrer-Policy':'no-referrer',
          'X-Robots-Tag':'noindex,nofollow'});
      }catch{return send(res,503,'Provider currently unavailable');}
    }
    if(url.pathname==='/auth/google/callback'){
      if(!googleReady)return send(res,404,'Provider disabled');
      if(req.method!=='GET')return send(res,405,'Method not allowed',{Allow:'GET'});
      const clear=googleStateCookie('',{secure:!localTest,clear:true});
      try{
        if(url.searchParams.has('error'))throw Error('Provider declined');
        const pending=consumeGoogleState(db,{state:url.searchParams.get('state')||'',cookieState:googleCookieState(req.headers.cookie)});
        const identity=await exchangeGoogleCode(url.searchParams.get('code'),pending,{
          clientId:googleOidc.clientId,clientSecret:googleOidc.clientSecret,origin:effectiveOrigin,fetchImpl:googleOidc.fetchImpl||fetch});
        const account=acceptGoogleIdentity(db,{...identity,ownerEmail});
        const session=createSession(db,account);
        return send(res,303,'Continue to KNABA',{
          Location:returnPath(pending.return_to),
          'Set-Cookie':[clear,sessionCookie(session.token,{secure:!localTest})],
          'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow'});
      }catch{return send(res,401,'Provider identity could not be verified',{
        'Set-Cookie':clear,'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow'});}
    }
    if(url.pathname==='/auth/login' && req.method==='POST'){
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Forbidden');
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,'JSON required');
      try{
        const value=JSON.parse((await readBody(req,4096)).toString('utf8'));
        if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!['email','password'].includes(k)) ||
           typeof value.email!=='string'||typeof value.password!=='string'||value.password.length>256)return send(res,422,'Invalid login');
        let login=null;
        try{login=createLogin(db,{email:value.email,password:value.password,clientKey:req.socket.remoteAddress||'local'});}catch{}
        if(!login)return send(res,401,JSON.stringify({error:'invalid_credentials'}),{'Content-Type':'application/json'});
        return send(res,200,JSON.stringify({ok:true}),{'Content-Type':'application/json','Set-Cookie':sessionCookie(login.token,{secure:!localTest})});
      }catch{return send(res,400,'Invalid login');}
    }
    if(url.pathname==='/auth/logout' && req.method==='POST'){
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Forbidden');
      destroySession(db,req.headers.cookie);
      return send(res,200,JSON.stringify({ok:true}),{'Content-Type':'application/json','Set-Cookie':expiredCookie({secure:!localTest})});
    }
    if(url.pathname==='/auth/register/start' && req.method==='POST'){
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Forbidden');
      if(!emailSignupEnabled(db,signup))return send(res,503,JSON.stringify({error:'email_provider_not_ready'}),{'Content-Type':'application/json'});
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,'JSON required');
      let result=null;
      try{
        const value=JSON.parse((await readBody(req,4096)).toString('utf8'));
        if(!value||typeof value!=='object'||Array.isArray(value)||
           Object.keys(value).some(k=>!['name','email','password','passwordConfirmation','privacyAccepted','role','inviteCode','companyName'].includes(k)))return send(res,422,'Invalid registration');
        result=beginSignup(db,value,{pepper:signup.pepper,ownerEmail,clientKey:req.socket.remoteAddress||'local'});
      }catch{return send(res,422,JSON.stringify({error:'registration_rejected'}),{'Content-Type':'application/json'});}
      if(result.code){
        try{
          await sendVerificationEmail({key:signup.mailKey,from:signup.from,to:result.email,code:result.code,origin:effectiveOrigin,fetchImpl:mailFetch});
        }catch{
          cancelUndeliveredSignup(db,result.email,result.code,signup.pepper);
          return send(res,503,JSON.stringify({error:'delivery_unavailable'}),{'Content-Type':'application/json'});
        }
      }
      return send(res,202,JSON.stringify({accepted:true}),{'Content-Type':'application/json'});
    }
    if(url.pathname==='/auth/register/verify' && req.method==='POST'){
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Forbidden');
      if(!emailSignupEnabled(db,signup))return send(res,503,JSON.stringify({error:'registration_unavailable'}),{'Content-Type':'application/json'});
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,'JSON required');
      try{
        const value=JSON.parse((await readBody(req,2048)).toString('utf8'));
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['email','code'].includes(k)))return send(res,422,'Invalid verification');
        const verified=finishSignup(db,value,{pepper:signup.pepper,ownerEmail});
        return send(res,200,JSON.stringify({ok:true,pendingApproval:true}),{'Content-Type':'application/json','Set-Cookie':sessionCookie(verified.token,{secure:!localTest})});
      }catch{return send(res,422,JSON.stringify({error:'code_invalid_or_expired'}),{'Content-Type':'application/json'});}
    }
    if(url.pathname==='/auth/invites' && req.method==='POST'){
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Forbidden');
      const user=readSession(db,req.headers.cookie);
      if(!user)return send(res,401,'Sign in required');
      const isOwner=Boolean(ownerEmail)&&user.email.toLowerCase()===ownerEmail.toLowerCase();
      const staff=db.prepare("SELECT 1 FROM profiles WHERE id=? AND lower(email)=? AND role='admin' AND status='approved'").get(user.id,user.email.toLowerCase());
      if(!isOwner&&!staff)return send(res,403,'Manager permission required');
      if(!signupSchemaReady(db))return send(res,503,'Invite schema not ready');
      try{
        const raw=await readBody(req,1024);
        if(!String(req.headers['content-type']||'').startsWith('application/json')||JSON.stringify(JSON.parse(raw.toString('utf8')))!=='{}')return send(res,422,'Empty JSON required');
        const invite=makeWorkerInvite(db,user.id);
        return send(res,201,JSON.stringify(invite),{'Content-Type':'application/json; charset=utf-8'});
      }catch{return send(res,400,'Invalid invite request');}
    }
    if(url.pathname==='/login/'||url.pathname==='/login'){
      const rt=returnPath(url.searchParams.get('return_to'));
      if(req.method==='GET'||req.method==='HEAD')return await sendStatic(root,req,res,'/login/',db);

      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'GET,POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))return send(res,415,'Form required');
      try{
        const raw=await readBody(req,4096);
        const params=new URLSearchParams(raw.toString('utf8'));
        const keys=[...params.keys()];
        if(keys.length!==3 || new Set(keys).size!==3 || keys.some(k=>!['email','password','return_to'].includes(k)))return send(res,422,'Invalid form');
        const email=params.get('email')||'',password=params.get('password')||'';
        const target=returnPath(params.get('return_to'));
        if(password.length>256 || email.length>320)return send(res,422,'Invalid form');
        let result=null;
        try{result=createLogin(db,{email,password,clientKey:req.socket.remoteAddress||'local'});}catch{/* Uniform response */}
        if(!result)return send(res,401,loginPage(target,true),{'Content-Type':'text/html; charset=utf-8'});
        return redirect(res,target,{'Set-Cookie':sessionCookie(result.token,{secure:!localTest})});
      }catch(error){return send(res,error?.code==='too_large'?413:400,'Invalid request');}
    }
    if(url.pathname==='/logout/'||url.pathname==='/logout'){
      const rt=returnPath(url.searchParams.get('return_to'));
      if(req.method==='GET')return send(res,200,logoutPage(rt),{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex,nofollow'});
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'GET,POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      try{
        const raw=await readBody(req,1024);
        const target=returnPath(new URLSearchParams(raw.toString()).get('return_to'));
        destroySession(db,req.headers.cookie);
        return redirect(res,target,{'Set-Cookie':expiredCookie({secure:!localTest})});
      }catch{return send(res,400,'Invalid request');}
    }
    if(url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/catalogue')){
      const valid=['GET','HEAD','POST','PUT','PATCH','DELETE'];
      if(!valid.includes(req.method))return send(res,405,'Method not allowed');
      let body;
      try{body=['GET','HEAD'].includes(req.method)?undefined:await readBody(req,64*1024);}
      catch(e){return send(res,e?.code==='too_large'?413:400,'Invalid request');}
      const user=readSession(db,req.headers.cookie);
      const headers=new Headers();
      for(const name of ['origin','content-type','accept','sec-fetch-site','x-knaba-request','content-length','user-agent','x-knaba-conversation','authorization','idempotency-key']){
        if(req.headers[name]!==undefined&&name!=='content-length')headers.set(name,String(req.headers[name]));
      }
      // Only server-side verified sessions can supply these Cloudflare Sites legacy identity headers.
      if(user && !(googleOnlyUser(db,user.id) && ownerEmail && user.email.toLowerCase()===ownerEmail.toLowerCase())){
        headers.set('oai-authenticated-user-id',user.id);
        headers.set('oai-authenticated-user-email',user.email);
      }
      // Never forward incoming cf-connecting-ip or forged oai-* headers.
      headers.set('cf-connecting-ip',String(req.socket.remoteAddress||'127.0.0.1'));
      const urlForWorker=effectiveOrigin+url.pathname+url.search;
      let reply;
      try{
        const workRequest=new Request(urlForWorker,{method:req.method,headers,body,signal:AbortSignal.timeout(16_000)});
        reply=await worker.fetch(workRequest,env,{waitUntil:promise=>{void Promise.resolve(promise).catch(()=>{});}});
      }catch{return send(res,503,'Service temporarily unavailable');}
      res.writeHead(reply.status,Object.fromEntries(reply.headers.entries()));
      return res.end(Buffer.from(await reply.arrayBuffer()));
    }
    if(!['GET','HEAD'].includes(req.method))return send(res,405,'Method not allowed');
    try{return await sendStatic(root,req,res,url.pathname,db);}catch{return send(res,503,'Service temporarily unavailable');}
  });
  server.requestTimeout=20_000;
  server.headersTimeout=15_000;
  server.keepAliveTimeout=5_000;
  server.maxRequestsPerSocket=100;
  server.listen(port,host);
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  return {server,db,migrations,port:server.address().port,close:()=>new Promise(resolve=>server.close(()=>{db.close();resolve();}))};
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const port=Number(process.env.PORT||8080);
  const instance=await createKnabaVpsServer({
    dbPath:process.env.KNABA_DB_PATH||'/var/lib/knaba/site.sqlite',
    staticRoot:process.env.KNABA_STATIC_ROOT||new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    ownerEmail:process.env.OWNER_EMAIL||'',
    turnstileSiteKey:process.env.TURNSTILE_SITE_KEY||'',
    turnstileSecretKey:process.env.TURNSTILE_SECRET_KEY||'',
    origin:process.env.KNABA_PUBLIC_ORIGIN||'https://knaba.de',
    signup:{enabled:process.env.KNABA_AUTH_EMAIL_ENABLED==='1',mailKey:process.env.KNABA_AUTH_RESEND_API_KEY||'',
      from:process.env.KNABA_AUTH_FROM||'',pepper:process.env.KNABA_AUTH_PEPPER||''},
    googleOidc:{enabled:process.env.KNABA_GOOGLE_LOGIN_ENABLED==='1',
      clientId:process.env.KNABA_GOOGLE_CLIENT_ID||'',clientSecret:process.env.KNABA_GOOGLE_CLIENT_SECRET||''},
    port,host:'0.0.0.0',localTest:process.env.KNABA_LOCAL_TEST==='1'
  });
  process.stdout.write('KNABA VPS service listening on internal port '+instance.port+'\n');
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void instance.close().then(()=>process.exit(0));});
}
