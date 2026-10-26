import { createServer as createHttpServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,relative,sep,join,extname } from 'node:path';
import { createHash } from 'node:crypto';
import { openLocalDatabase } from './database.mjs';
import { createLogin,readSession,destroySession,sessionCookie,expiredCookie } from './auth.mjs';
import { activateOwnerInvite,OwnerInviteError } from './owner-invite.mjs';
import { editablePublicHtmlPath } from './seo.mjs';
import { renderPublishedPage } from '../dist/vps/render-page.mjs';

const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8',
  '.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'
};
const loginStyle='body{background:#f2f6f2;margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;color:#193e32}main{background:#fff;box-sizing:border-box;width:min(400px,calc(100vw - 32px));padding:2.2rem;border:1px solid #d2e2d7;border-radius:18px;box-shadow:0 20px 55px #12392710}h1{font-size:1.5rem}label{display:block;margin:1rem 0;font-size:.9rem;font-weight:600}input{display:block;width:100%;box-sizing:border-box;padding:.78rem;font:inherit;margin-top:.45rem;border:1px solid #aabcb4;border-radius:8px}button{width:100%;background:#155b46;color:white;border:none;padding:.85rem;border-radius:8px;font:inherit;cursor:pointer}a{color:#195d47}input[type=hidden]{display:none}input[type=checkbox]{display:inline;width:18px;height:18px;margin-right:.45rem}button:disabled{opacity:.6;cursor:not-allowed}.error{padding:.6rem;color:#8c1f20;background:#feecec}';
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
  const privatePath=/^\/(?:admin|studio|crm|konto|postfach|ru\/(?:konto|postfach))\//.test(path);
  res.setHeader('Content-Type',mime[ext]||'application/octet-stream');
  res.setHeader('Cache-Control',privatePath?'private, no-store':hashed?'public, max-age=31536000, immutable':ext==='.html'?'no-cache':'public, max-age=300');
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
    '<button type="submit">Anmelden</button></form><p><a href="/register/">Konto mit Einladung einrichten</a></p><p><a href="/">Zur Website</a></p>');
}
function previewRegistrationPage(){
  // Invitation is in URL fragment: never send it in GET, Referer or server logs.
  const script="(function(){const token=new URLSearchParams(location.hash.slice(1)).get('token')||'';"+
    "history.replaceState(null,'',location.pathname);"+
    "const valid=/^[A-Za-z0-9_-]{43}$/.test(token);"+
    "const field=document.querySelector('input[name=token]');"+
    "if(field&&valid)field.value=token;"+
    "document.querySelector('button[type=submit]').disabled=!valid;"+
    "})();";
  return html('KNABA | Registrierung',
    '<h1>KNABA · Konto einrichten</h1>'+
    '<p>Geschützter Testzugang: Nur Personen mit einer einmaligen persönlichen Einladung können sich registrieren. Die Einladung ist 2 Stunden gültig.</p>'+
    '<form method="post" action="/register/">'+
    '<input type="hidden" name="token" value="">'+
    '<label>E-Mail-Adresse der Einladung<input type="email" name="email" autocomplete="username" maxlength="320" required></label>'+
    '<label>Neues Passwort (mindestens 16 Zeichen)<input type="password" name="password" autocomplete="new-password" minlength="16" maxlength="256" required></label>'+
    '<label>Passwort bestätigen<input type="password" name="password_confirm" autocomplete="new-password" minlength="16" maxlength="256" required></label>'+
    '<label><input type="checkbox" name="attested" value="on" required>Ich bin zur Nutzung dieses KNABA-Testzugangs berechtigt.</label>'+
    '<button type="submit" disabled>Konto aktivieren</button></form>'+
    '<p>Keine Einladung erhalten? Bitte kontaktieren Sie die Website-Entwicklung.</p>'+
    '<p><a href="/login/?return_to=%2Fadmin%2F">Zur Anmeldung</a></p>'+
    '<script>'+script+'</script>');
}
function logoutPage(returnTo){
  return html('KnaBa | Abmelden','<h1>KNABA</h1><p>Sitzung beenden?</p>'+
    '<form method="post" action="/logout/"><input type="hidden" name="return_to" value="'+escapeHTML(returnTo)+'"><button type="submit">Abmelden</button></form>');
}
export async function createKnabaVpsServer({
  dbPath,staticRoot,workerPath,ownerEmail='',previewOwnerEmail='',turnstileSiteKey='',turnstileSecretKey='',port=8080,host='0.0.0.0',
  origin='https://knaba.de',localTest=false
}){
  if(!dbPath||!staticRoot||!workerPath)throw Error('DB, static and worker artifacts are required.');
  const base=new URL(origin);
  if(base.protocol!=='https:'&&!localTest)throw Error('Production HTTPS origin required.');
  const publicHost=base.host.toLowerCase();
  const {db,d1,migrations}=openLocalDatabase(dbPath,{allowMigrations:localTest});
  const {default:worker}=await import(workerPath);
  const root=resolve(staticRoot);
  if(typeof worker.fetch!=='function')throw Error('Worker entry unavailable.');
  const previewRegistrationEnabled=origin==='https://kneba.vsp.rest' && Boolean(previewOwnerEmail);
  const env={DB:d1,OWNER_EMAIL:ownerEmail,
    PREVIEW_OWNER_EMAIL:previewRegistrationEnabled?previewOwnerEmail:'',
    TURNSTILE_SITE_KEY:turnstileSiteKey,TURNSTILE_SECRET_KEY:turnstileSecretKey,
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
    if(url.pathname==='/register/'||url.pathname==='/register'){
      const headers={
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
        'X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'same-origin',
        'X-Frame-Options':'DENY',
        'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
      };
      if(!previewRegistrationEnabled)return send(res,404,'Not found');
      if(req.method==='GET'){
        if(url.search)return send(res,400,'Invitation tokens must not be sent in query strings');
        return send(res,200,previewRegistrationPage(),headers);
      }
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'GET,POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
        return send(res,415,'Form required');
      try{
        const raw=await readBody(req,4096);
        const params=new URLSearchParams(raw.toString('utf8'));
        const keys=[...params.keys()];
        if(keys.length!==5||new Set(keys).size!==5||
          keys.some(k=>!['token','email','password','password_confirm','attested'].includes(k)))
          return send(res,422,'Invalid registration form');
        const email=params.get('email')||'';
        const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/900);
        const client=String(req.socket.remoteAddress||'local').slice(0,100);
        const key=createHash('sha256').update('preview-register|'+email.toLowerCase()+'|'+client+'|'+bucket).digest('hex');
        const allowance=db.prepare(
          'INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<10 RETURNING attempts'
        ).get(key,(bucket+1)*900);
        if(!allowance)return send(res,429,'Registration temporarily rate limited',{'Retry-After':'900'});
        if(email.trim().toLowerCase()!==previewOwnerEmail.trim().toLowerCase())
          return send(res,401,'Invalid or expired invitation');
        activateOwnerInvite(db,{
          token:params.get('token')||'',
          email,password:params.get('password')||'',
          confirmed:params.get('password_confirm')||'',
          attested:params.get('attested')==='on'
        });
        return redirect(res,'/login/?return_to=%2Fadmin%2F',{'Referrer-Policy':'no-referrer'});
      }catch(error){
        if(error?.code==='too_large')return send(res,413,'Invalid registration form');
        if(error instanceof OwnerInviteError){
          const invalid=/Invalid or expired invitation/.test(error.message);
          return send(res,invalid?401:422,invalid?'Invalid or expired invitation':'Check registration details');
        }
        return send(res,409,'Registration unavailable');
      }
    }
    if(url.pathname==='/login/'||url.pathname==='/login'){
      const rt=returnPath(url.searchParams.get('return_to'));
      if(req.method==='GET')return send(res,200,loginPage(rt),{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex,nofollow'});
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
      if(user){
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
    previewOwnerEmail:process.env.KNABA_PREVIEW_OWNER_EMAIL||'',

    turnstileSiteKey:process.env.TURNSTILE_SITE_KEY||'',
    turnstileSecretKey:process.env.TURNSTILE_SECRET_KEY||'',
    origin:process.env.KNABA_PUBLIC_ORIGIN||'https://knaba.de',
    port,host:'0.0.0.0',localTest:process.env.KNABA_LOCAL_TEST==='1'
  });
  process.stdout.write('KNABA VPS service listening on internal port '+instance.port+'\n');
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void instance.close().then(()=>process.exit(0));});
}
