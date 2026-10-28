import { createServer as createHttpServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,relative,sep,join,extname } from 'node:path';
import { createHash } from 'node:crypto';
import { openLocalDatabase } from './database.mjs';
import { createLogin,readSession,destroySession,rotateCredentials,sessionCookie,expiredCookie } from './auth.mjs';
import {hasOwnerAuthority} from './admin-access.mjs';
import {createSessionForUser} from './auth.mjs';
import {oidcProviders,beginOidc,completeOidc,oidcStateCookie,clearOidcStateCookie,OidcError} from './oidc.mjs';
import { activateOwnerInvite, OwnerInviteError } from './owner-invite.mjs';
import { issueAccountInvite, acceptAccountInvite, revokeAccountInvite, AccountInviteError } from './account-invite.mjs';
import {authLanguage,authWords,accessWords} from './auth-locale.mjs';
import {submitAccessRequest,listAccessRequests,markAccessRequestReviewed,AccessRequestError} from './access-requests.mjs';
import { editablePublicHtmlPath } from './seo.mjs';
import { renderPublishedPage } from '../dist/vps/render-page.mjs';

const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8',
  '.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'
};
const loginStyle='body{background:#f2f6f2;margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;color:#193e32}main{background:#fff;box-sizing:border-box;width:min(400px,calc(100vw - 32px));padding:2.2rem;border:1px solid #d2e2d7;border-radius:18px;box-shadow:0 20px 55px #12392710}h1{font-size:1.5rem}label{display:block;margin:1rem 0;font-size:.9rem;font-weight:600}input{display:block;width:100%;box-sizing:border-box;padding:.78rem;font:inherit;margin-top:.45rem;border:1px solid #aabcb4;border-radius:8px}button{width:100%;background:#155b46;color:white;border:none;padding:.85rem;border-radius:8px;font:inherit;cursor:pointer}a{color:#195d47}.error{padding:.6rem;color:#8c1f20;background:#feecec}';
const authCss='select{display:block;width:100%;box-sizing:border-box;padding:.78rem;font:inherit;margin-top:.45rem;border:1px solid #aabcb4;border-radius:8px;background:white;color:inherit}.access-review-list{list-style:none;padding:0}.access-review-item{border:1px solid #d2e2d7;border-radius:10px;padding:.85rem;margin:1rem 0;overflow-wrap:anywhere}.access-review-item p{margin:.4rem 0}:focus-visible{outline:3px solid #117a57;outline-offset:3px}.auth-languages{display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:1rem}.auth-languages a{font-size:.78rem;text-decoration:none;border-radius:999px;border:1px solid #c6d9d0;padding:.35rem .6rem}.auth-languages a[aria-current=page]{background:#155b46;color:#fff;border-color:#155b46}.auth-subtle{font-size:.9rem}.auth-help{border-left:3px solid #177b5e;padding:.65rem .8rem;background:#f0f8f4}.auth-checkbox{display:flex;align-items:start;gap:.7rem;font-weight:400;line-height:1.5}.auth-checkbox input{width:1.2rem;height:1.2rem;flex:none;margin:.1rem 0}.auth-checkbox span{flex:1;min-width:0}@media(max-width:600px){body{display:block;padding:1.25rem .75rem}main{width:100%;margin:0 auto;padding:1.5rem 1.25rem;box-shadow:0 7px 24px #12392710}h1{font-size:1.5rem;line-height:1.3}}';
const escapeHTML=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const returnPath=value=>{
  if(typeof value!=='string'||value.length>180||!value.startsWith('/')||value.startsWith('//')||value.includes('\\')||/[\r\n\0]/.test(value))return '/konto/';
  try{const u=new URL(value,'https://knaba.de');return u.origin==='https://knaba.de'?u.pathname+u.search:'/konto/';}catch{return '/konto/';}
};
function html(title,content,lang='de'){
  return '<!doctype html><html lang="'+authLanguage(lang)+'"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHTML(title)+'</title><style>'+loginStyle+authCss+'</style></head><body><main>'+content+'</main></body></html>';
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
  const privatePath=/^\/(?:admin|studio|crm|konto|postfach|login|register|join|forgot-password|access-requests|invite-user|activate-owner|activate-developer|logout|ru\/(?:konto|postfach))\//.test(path);
  res.setHeader('Content-Type',mime[ext]||'application/octet-stream');
  res.setHeader('Cache-Control',privatePath?'private, no-store':hashed?'public, max-age=31536000, immutable':ext==='.html'?'no-cache':'public, max-age=300');
  if(privatePath||res.statusCode===404){
    res.setHeader('X-Robots-Tag','noindex, nofollow');
  }else if(ext==='.html' && (!['official','vsp'].includes(process.env.KNABA_RELEASE_MODE) || bytes.includes('<meta name="robots" content="noindex, follow"'))){
    // The Node VPS runtime does not apply Cloudflare Pages _headers rules.
    // Preserve the built HTML crawler gate in the actual HTTP response.
    res.setHeader('X-Robots-Tag','noindex, follow');
  }
  res.setHeader('Content-Length',bytes.length);
  res.end(req.method==='HEAD'?undefined:bytes);
}
const languageCodes=['de','uk','en','ru'];
function authLangNavigation(section,lang,returnTo='/konto/'){
  const word=authWords(lang);
  const links=languageCodes.map(code=>{
    const destination=section==='login'
      ?'/login/?lang='+code+'&return_to='+encodeURIComponent(returnTo)
      :'/register/?lang='+code;
    return '<a href="'+destination+'" lang="'+code+'"'+
      (code===lang?' aria-current="page"':'')+'>'+code.toUpperCase()+'</a>';
  }).join('');
  return '<nav class="auth-languages" aria-label="'+escapeHTML(word.language)+'">'+links+'</nav>';
}
function oidcConsentPage(provider,link=false){
  const name=provider==='google'?'Google':'Microsoft';
  return html('KNABA | '+name+'-Anmeldung',
    '<h1>KNABA · '+escapeHTML(name)+'</h1>'+
    '<p>Die Anmeldung erfolgt über den verifizierten Anbieter. KNABA übernimmt keine Passwörter des Anbieters.</p>'+
    '<form method="post" action="/auth/oidc/'+provider+'/start/">'+
    '<input type="hidden" name="mode" value="'+(link?'link':'signup')+'">'+
    (link?
      '<p>Dieses externe Konto mit Ihrem bereits angemeldeten KNABA-Konto verknüpfen. Die bestätigte E-Mail muss übereinstimmen.</p><input type="hidden" name="intent" value="client">':
      '<label>Beantragter Zugang<select name="intent" required><option value="client">Kundin / Kunde</option><option value="partner">Geschäftspartner/in</option></select></label>')+
    '<label class="auth-checkbox"><input type="checkbox" name="privacy" value="on" required><span>Ich habe die <a href="/datenschutz/">Datenschutzhinweise</a> gelesen und stimme dieser Anmeldung zu. Neue Konten warten auf Freigabe durch KNABA.</span></label>'+
    '<button type="submit">Sicher mit '+escapeHTML(name)+' fortfahren</button></form>'+
    '<p><a href="/login/">Zur Anmeldung</a></p>');
}
function loginPage(returnTo,invalid=false,lang='de',providers=[]){
  lang=authLanguage(lang);
  const word=authWords(lang);
  const error=invalid?'<p role="alert" class="error">'+escapeHTML(word.invalid)+'</p>':'';
  return html('KnaBa | '+word.signIn,
    authLangNavigation('login',lang,returnTo)+
    '<h1>'+escapeHTML(word.signInTitle)+'</h1><p>'+escapeHTML(word.signInIntro)+'</p>'+error+
    '<form method="post" action="/login/?lang='+lang+'">'+
    '<input type="hidden" name="return_to" value="'+escapeHTML(returnTo)+'">'+
    '<label>'+escapeHTML(word.email)+'<input type="email" name="email" inputmode="email" autocapitalize="none" spellcheck="false" autocomplete="username" required maxlength="320"></label>'+
    '<label>'+escapeHTML(word.password)+'<input type="password" name="password" autocomplete="current-password" required minlength="8" maxlength="256"></label>'+
    '<button type="submit">'+escapeHTML(word.signIn)+'</button></form>'+
    (providers.length?'<nav aria-label="Social sign-in"><p>Alternativ sicher anmelden:</p>'+
      providers.map(p=>'<p><a href="/auth/oidc/'+escapeHTML(p)+'/">'+escapeHTML(p==='google'?'Mit Google fortfahren':'Mit Microsoft fortfahren')+'</a></p>').join('')+'</nav>':'')+
    '<p class="auth-subtle"><a href="/register/?lang='+lang+'">'+escapeHTML(word.inviteLink)+'</a></p>'+
    '<p class="auth-subtle">'+escapeHTML(word.inviteHelp)+' <a href="/kontakt/">'+escapeHTML(word.contact)+'</a></p>'+
    '<p class="auth-subtle"><a href="/join/?lang='+lang+'">'+escapeHTML(accessWords(lang).joinLink)+'</a> · <a href="/forgot-password/?lang='+lang+'">'+escapeHTML(accessWords(lang).forgotLink)+'</a></p>'+
    '<p><a href="/">'+escapeHTML(word.website)+'</a></p>',lang);
}
const privateAccountHeaders={
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
  'X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};
function accessRequestPage(lang='de',received=false){
  lang=authLanguage(lang);
  const w=accessWords(lang);
  if(received)return html('KnaBa | '+w.title,
    '<h1>'+escapeHTML(w.title)+'</h1><p role="status">'+escapeHTML(w.ok)+'</p>'+
    '<p><a href="/login/?lang='+lang+'">'+escapeHTML(w.back)+'</a></p>',lang);
  return html('KnaBa | '+w.title,
    '<h1>'+escapeHTML(w.title)+'</h1><p>'+escapeHTML(w.intro)+'</p>'+
    '<form method="post" action="/join/?lang='+lang+'">'+
    '<label>'+escapeHTML(w.fullName)+'<input name="name" autocomplete="name" maxlength="160" required minlength="2"></label>'+
    '<label>'+escapeHTML(w.email)+'<input type="email" name="email" autocomplete="email" autocapitalize="none" inputmode="email" required maxlength="320"></label>'+
    '<label>'+escapeHTML(w.kind)+'<select name="intent" required>'+
    '<option value="client">'+escapeHTML(w.client)+'</option>'+
    '<option value="worker">'+escapeHTML(w.worker)+'</option>'+
    '<option value="partner">'+escapeHTML(w.partner)+'</option></select></label>'+
    '<div style="display:none" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>'+
    '<label class="auth-checkbox"><input type="checkbox" name="privacy" value="on" required><span>'+
    escapeHTML(w.privacy)+' <a href="/datenschutz/">Datenschutz</a></span></label>'+
    '<button type="submit">'+escapeHTML(w.submit)+'</button></form>'+
    '<p><a href="/login/?lang='+lang+'">'+escapeHTML(w.back)+'</a></p>',lang);
}
function forgottenPasswordPage(lang='de'){
  lang=authLanguage(lang);
  const w=accessWords(lang);
  return html('KnaBa | '+w.lostTitle,
    '<h1>'+escapeHTML(w.lostTitle)+'</h1><p>'+escapeHTML(w.lostIntro)+'</p>'+
    '<p><a href="/kontakt/">'+escapeHTML(w.contact)+'</a></p>'+
    '<p><a href="/account/password/">'+escapeHTML(w.passwordChange)+'</a></p>'+
    '<p><a href="/login/?lang='+lang+'">'+escapeHTML(w.back)+'</a></p>',lang);
}
function reviewRequestsPage(requests){
  const records=requests.map(record=>
    '<li class="access-review-item"><strong>'+escapeHTML(record.name)+'</strong> '+
    '<span>'+escapeHTML(record.intent==='client'?'Kunde':record.intent==='partner'?'Partner':'Mitarbeiter')+'</span>'+
    '<p>'+escapeHTML(record.email)+'</p>'+
    '<p><small>'+escapeHTML(new Date(record.created_at).toISOString())+'</small></p>'+
    '<p><small>Gültig bis: '+escapeHTML(new Date(record.expires_at).toISOString().slice(0,10))+' (UTC)</small></p>'+
    '<form method="post" action="/invite-user/">'+
    '<input type="hidden" name="email" value="'+escapeHTML(record.email)+'">'+
    '<input type="hidden" name="role" value="'+escapeHTML(record.intent)+'">'+
    '<label class="auth-checkbox"><input type="checkbox" name="identity_verified" value="on" required>'+
    '<span>Ich habe die Identität über einen unabhängigen Kontaktweg geprüft.</span></label>'+
    '<button type="submit">Einladung als '+escapeHTML(record.intent==='client'?'Kunde':record.intent==='partner'?'Partner':'Mitarbeiter')+' erstellen</button></form>'+
    '<form method="post" action="/access-requests/resolve/">'+
    '<input type="hidden" name="id" value="'+escapeHTML(record.id)+'">'+
    '<label class="auth-checkbox"><input type="checkbox" name="reviewed" value="on" required>'+
    '<span>Die Anfrage wurde nach manueller Prüfung bearbeitet. Es wurde hier keine Rolle vergeben.</span></label>'+
    '<button type="submit">Als bearbeitet markieren</button></form></li>').join('');
  return html('KNABA | Zugangs-Anfragen',
    '<h1>KNABA · Zugangs-Anfragen</h1>'+
    '<p>Nur für die verifizierte KNABA-Verwaltung. Vor dem Versand einer persönlichen Einladung die Person über einen unabhängigen Kontaktweg prüfen. Eine Anfrage allein verleiht keine Rolle.</p>'+
    (records?'<ul class="access-review-list">'+records+'</ul>':'<p>Keine offenen Anfragen.</p>')+
    '<p><a href="/invite-user/">Persönliche Einladung nach Identitätsprüfung erstellen</a></p>'+
    '<p><a href="/studio/">Zur Verwaltung</a></p>');
}
function ownerActivationPage(purpose='owner'){
  // Capability stays in fragment (not sent to HTTP servers or access logs).
  // A scoped private GET copies it to a hidden POST field then clears history.
  const script="(function(){const fragment=new URLSearchParams(location.hash.slice(1));"+
    "const token=fragment.get('token')||'';"+
    "const ok=/^[A-Za-z0-9_-]{43}$/.test(token);"+
    "const field=document.querySelector('input[name=token]');"+
    "if(field&&ok)field.value=token;"+
    "const submit=document.querySelector('button[type=submit]');"+
    "if(submit)submit.disabled=!ok;"+
    "history.replaceState(null,'',location.pathname);"+
    "})();";
  return html(purpose==='developer'?'KnaBa | Entwicklerzugang aktivieren':'KnaBa | Inhaber-Zugang aktivieren',
    '<h1>KNABA · '+(purpose==='developer'?'geschützte Entwickler-Aktivierung':'geschützte Inhaber-Aktivierung')+'</h1>'+
    '<p>Diese einmalige Einladung ist zwei Stunden gültig. Nur die berechtigte Person darf sie verwenden.</p>'+
    '<form method="post" action="/activate-'+(purpose==='developer'?'developer':'owner')+'/">'+
    '<input type="hidden" name="token" value="">'+
    '<label>Neues Passwort (mindestens 16 Zeichen)<input type="password" name="password" autocomplete="new-password" required minlength="16" maxlength="256"></label>'+
    '<label>Passwort bestätigen<input type="password" name="password_confirm" autocomplete="new-password" required minlength="16" maxlength="256"></label>'+
    '<label><input type="checkbox" name="attested" value="on" required> Ich bestätige, dass ich für KNABA zur Verwaltung bevollmächtigt bin.</label>'+
    '<button type="submit" disabled>Zugang aktivieren</button></form>'+
    '<p><a href="/login/?return_to=%2Fstudio%2F">Zur Anmeldung</a></p>'+
    '<script>'+script+'</script>');
}
function registrationPage(lang='de'){
  lang=authLanguage(lang);
  const word=authWords(lang);
  // One-use invitation secret is only ever in the fragment and form POST body.
  // Never send it as a query parameter, referer or a logging attribute.
  const script="(function(){const params=new URLSearchParams(location.hash.slice(1));"+
    "const token=params.get('token')||'';"+
    "const ok=/^[A-Za-z0-9_-]{43}$/.test(token);"+
    "const field=document.querySelector('input[name=token]');"+
    "if(field&&ok)field.value=token;"+
    "const submit=document.querySelector('button[type=submit]');"+
    "if(submit)submit.disabled=!ok;"+
    "if(ok)for(const link of document.querySelectorAll('.auth-languages a'))link.hash='token='+token;"+
    "history.replaceState(null,'',location.pathname+location.search);"+
    "})();";
  return html('KnaBa | '+word.registrationTitle,
    authLangNavigation('register',lang)+
    '<h1>'+escapeHTML(word.registrationTitle)+'</h1>'+
    '<p>'+escapeHTML(word.registrationIntro)+'</p>'+
    '<p class="auth-help" role="note">'+escapeHTML(word.tokenNote)+'</p>'+
    '<form action="/register/?lang='+lang+'" method="post">'+
    '<input type="hidden" name="token" value="">'+
    '<label>'+escapeHTML(word.name)+'<input name="name" autocomplete="name" maxlength="160" required minlength="2"></label>'+
    '<label>'+escapeHTML(word.invitedEmail)+'<input type="email" inputmode="email" autocapitalize="none" spellcheck="false" name="email" autocomplete="username" required maxlength="320"></label>'+
    '<label>'+escapeHTML(word.newPassword)+'<input type="password" name="password" autocomplete="new-password" required minlength="16" maxlength="256"></label>'+
    '<label>'+escapeHTML(word.confirm)+'<input type="password" name="password_confirm" autocomplete="new-password" required minlength="16" maxlength="256"></label>'+
    '<label class="auth-checkbox"><input type="checkbox" name="privacy" value="on" required><span>'+
    escapeHTML(word.privacyBefore)+' <a href="/datenschutz/">'+escapeHTML(word.privacyLink)+'</a> '+
    escapeHTML(word.privacyAfter)+'</span></label>'+
    '<button type="submit" disabled>'+escapeHTML(word.register)+'</button></form>'+
    '<p class="auth-subtle">'+escapeHTML(word.inviteHelp)+' <a href="/kontakt/">'+escapeHTML(word.contact)+'</a></p>'+
    '<p><a href="/join/?lang='+lang+'">'+escapeHTML(accessWords(lang).joinLink)+'</a></p>'+
    '<p><a href="/login/?lang='+lang+'">'+escapeHTML(word.backLogin)+'</a></p>'+
    '<script>'+script+'</script>',lang);
}
function invitationPage(invite=null,origin='',notice=''){
  const result=invite?
    '<p role="status">Einladung erstellt. Den Link ausschließlich persönlich und sicher an die berechtigte Person weitergeben. Es wurde keine E-Mail versandt.</p>'+
    '<label>Einmaliger Link (maximal 7 Tage)<input type="text" readonly value="'+
      escapeHTML(origin+'/register/#token='+invite.token)+'" onclick="this.select()"></label>':'';
  return html('KnaBa | Kontoeinladung',
    '<h1>KNABA · Konto einladen</h1>'+
    '<p>Nur berechtigte Administratoren dürfen Kunden, Partner oder Mitarbeitende einladen. Die ausgewählte Rolle ist lediglich eine Anfrage und muss danach im Portal freigegeben werden.</p>'+
    '<form method="post" action="/invite-user/">'+
    '<label>E-Mail des Empfängers<input type="email" name="email" maxlength="320" required></label>'+
    '<label>Zugangstyp<select name="role" required><option value="client">Kunde</option><option value="partner">Geschäftspartner/in</option><option value="worker">Mitarbeiter/in</option></select></label>'+
    '<label class="auth-checkbox"><input type="checkbox" name="identity_verified" value="on" required>'+
    '<span>Ich habe die Person über einen unabhängigen Kontaktweg überprüft. Eine E-Mail-Adresse allein genügt nicht.</span></label>'+
    '<button type="submit">Einladung generieren</button></form>'+result+
    (notice?'<p role="status">'+escapeHTML(notice)+'</p>':'')+
    '<form method="post" action="/invite-user/revoke/">'+
    '<label>Offene Einladung widerrufen (E-Mail)<input type="email" name="email" maxlength="320" required></label>'+
    '<button type="submit">Einladung widerrufen</button></form>'+
    '<p><a href="/access-requests/">Neue Zugangs-Anfragen prüfen</a></p>'+
    '<p><a href="/studio/">Zur Verwaltung</a></p>');
}
function credentialPage(invalid=false){
  return html('KnaBa | Zugangsdaten ändern',
    '<h1>KNABA · Passwort ändern</h1>'+
    '<p>Zur Bestätigung ist das bisherige Passwort notwendig. Nach Änderung werden alle bisherigen Sitzungen beendet.</p>'+
    (invalid?'<p role="alert" class="error">Änderung nicht möglich. Bitte aktuelle Angaben und Passwortanforderungen prüfen.</p>':'')+
    '<form method="post" action="/account/password/">'+
    '<label>Aktuelles Passwort<input type="password" name="current" autocomplete="current-password" required></label>'+
    '<label>Neues Passwort (mindestens 16 Zeichen)<input type="password" name="new" autocomplete="new-password" required minlength="16" maxlength="256"></label>'+
    '<label>Neues Passwort bestätigen<input type="password" name="confirm" autocomplete="new-password" required minlength="16" maxlength="256"></label>'+
    '<button type="submit">Passwort sicher ändern</button></form>'+
    '<p><a href="/konto/">Zum Konto</a></p>');
}
function logoutPage(returnTo){
  return html('KnaBa | Abmelden','<h1>KNABA</h1><p>Sitzung beenden?</p>'+
    '<form method="post" action="/logout/"><input type="hidden" name="return_to" value="'+escapeHTML(returnTo)+'"><button type="submit">Abmelden</button></form>');
}
export async function createKnabaVpsServer({
  dbPath,staticRoot,workerPath,ownerEmail='',developerEmail='',turnstileSiteKey='',turnstileSecretKey='',port=8080,host='0.0.0.0',
  origin='https://knaba.de',localTest=false,oidcConfig=oidcProviders(),oidcFetch=fetch
}){
  if(!dbPath||!staticRoot||!workerPath)throw Error('DB, static and worker artifacts are required.');
  if(developerEmail && (!ownerEmail || developerEmail.trim().toLowerCase()===ownerEmail.trim().toLowerCase()))throw Error('Developer requires a distinct owner identity.');
  const base=new URL(origin);
  if(base.protocol!=='https:'&&!localTest)throw Error('Production HTTPS origin required.');
  const publicHost=base.host.toLowerCase();
  const {db,d1,migrations}=openLocalDatabase(dbPath,{allowMigrations:localTest});
  const {default:worker}=await import(workerPath);
  const root=resolve(staticRoot);
  if(typeof worker.fetch!=='function')throw Error('Worker entry unavailable.');
  const env={DB:d1,OWNER_EMAIL:ownerEmail,DEVELOPER_EMAIL:developerEmail,TURNSTILE_SITE_KEY:turnstileSiteKey,TURNSTILE_SECRET_KEY:turnstileSecretKey,
    TURNSTILE_REQUIRED:localTest?'0':'1',
    ASSETS:{fetch:async request=>{
      return new Response('Static assets are served at the VPS edge.',{status:404});
    }}};
  const operator=user=>Boolean(user&&hasOwnerAuthority(db,{userId:user.id,ownerEmail,developerEmail}));
  const social=Object.keys(oidcConfig).filter(p=>['google','microsoft'].includes(p));
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
    if(url.pathname==='/join/'||url.pathname==='/join'){
      const lang=authLanguage(url.searchParams.get('lang'));
      if(req.method==='GET')return send(res,200,accessRequestPage(lang),privateAccountHeaders);
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'GET,POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
        return send(res,415,'Form required');
      try{
        const params=new URLSearchParams((await readBody(req,4096)).toString('utf8'));
        const keys=[...params.keys()];
        if((keys.length!==4&&keys.length!==5)||new Set(keys).size!==keys.length||
          ['name','email','intent','privacy'].some(k=>!params.has(k))||
          keys.some(k=>!['name','email','intent','privacy','website'].includes(k)))
          return send(res,422,'Invalid access request');
        // A bot trap never leads to a user or pending role.
        if(params.has('website')&&params.get('website'))return send(res,202,accessRequestPage(lang,true),privateAccountHeaders);
        submitAccessRequest(db,{
          name:params.get('name'),email:params.get('email'),intent:params.get('intent'),
          consented:params.get('privacy')==='on',ownerEmail,
          peer:req.socket.remoteAddress||'local'
        });
        return send(res,202,accessRequestPage(lang,true),privateAccountHeaders);
      }catch(error){
        if(error?.code==='too_large')return send(res,413,'Access form too large');
        if(error instanceof AccessRequestError)
          return send(res,error.code==='limited'?429:422,'Invalid access request');
        return send(res,409,'Access service temporarily unavailable');
      }
    }
    if(url.pathname==='/forgot-password/'||url.pathname==='/forgot-password'){
      if(req.method!=='GET')return send(res,405,'Method not allowed',{Allow:'GET'});
      return send(res,200,forgottenPasswordPage(authLanguage(url.searchParams.get('lang'))),privateAccountHeaders);
    }
    if(url.pathname==='/access-requests/resolve/'||url.pathname==='/access-requests/resolve'){
      const user=readSession(db,req.headers.cookie);
      if(!user)return send(res,401,'Login required');
      if(!operator(user))
        return send(res,403,'Owner approval required');
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
        return send(res,415,'Form required');
      try{
        const params=new URLSearchParams((await readBody(req,1024)).toString('utf8'));
        const keys=[...params.keys()];
        if(keys.length!==2||new Set(keys).size!==2||keys.some(k=>!['id','reviewed'].includes(k)))
          return send(res,422,'Invalid owner action');
        markAccessRequestReviewed(db,{
          ownerId:user.id,ownerEmail,developerEmail,requestId:params.get('id'),
          reviewed:params.get('reviewed')==='on'
        });
        return redirect(res,'/access-requests/');
      }catch(error){
        if(error?.code==='too_large')return send(res,413,'Invalid owner action');
        if(error instanceof AccessRequestError)
          return send(res,error.code==='forbidden'?403:422,'Invalid owner action');
        return send(res,409,'Review temporarily unavailable');
      }
    }
    if(url.pathname==='/access-requests/'||url.pathname==='/access-requests'){
      const user=readSession(db,req.headers.cookie);
      if(!user)return send(res,401,'Login required');
      if(!operator(user))
        return send(res,403,'Owner approval required');
      if(req.method!=='GET')return send(res,405,'Method not allowed',{Allow:'GET'});
      try{
        const records=listAccessRequests(db,{ownerId:user.id,ownerEmail,developerEmail});
        return send(res,200,reviewRequestsPage(records),privateAccountHeaders);
      }catch{return send(res,503,'Owner inbox unavailable');}
    }
    if(['/activate-owner/','/activate-owner','/activate-developer/','/activate-developer'].includes(url.pathname)){
      const purpose=url.pathname.includes('developer')?'developer':'owner';
      const headers={
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'private, no-store',
        'X-Robots-Tag':'noindex,nofollow',
        'Referrer-Policy':'no-referrer',
        'X-Frame-Options':'DENY',
        'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
      };
      if(!ownerEmail || (purpose==='developer'&&!developerEmail))return send(res,503,'Operator access is not configured.');
      if(req.method==='GET'){
        if(url.search)return send(res,400,'Invitation tokens must not be put in URL query strings.');
        return send(res,200,ownerActivationPage(purpose),headers);
      }
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'GET,POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
        return send(res,415,'Form required');
      try{
        const params=new URLSearchParams((await readBody(req,4096)).toString('utf8'));
        const keys=[...params.keys()];
        if(keys.length!==4||new Set(keys).size!==4||
           keys.some(k=>!['token','password','password_confirm','attested'].includes(k)))
          return send(res,422,'Invalid activation form');
        activateOwnerInvite(db,{
          token:params.get('token')||'',email:purpose==='developer'?developerEmail:ownerEmail,purpose,
          password:params.get('password')||'',confirmed:params.get('password_confirm')||'',
          attested:params.get('attested')==='on'
        });
        return redirect(res,'/login/?return_to=%2Fstudio%2F',{'Referrer-Policy':'no-referrer'});
      }catch(error){
        if(error?.code==='too_large')return send(res,413,'Invalid activation form');
        if(error instanceof OwnerInviteError){
          const invalid=/Invalid or expired invitation/.test(error.message);
          return send(res,invalid?401:422,invalid?'Invitation expired or already used':'Check activation details');
        }
        return send(res,409,'Owner account activation unavailable');
      }
    }
    if(url.pathname==='/register/'||url.pathname==='/register'){
      const headers={
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
        'X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer',
        'X-Frame-Options':'DENY',
        'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
      };
      if(req.method==='GET'){
        if(url.searchParams.has('token'))return send(res,400,'Invitation secrets belong only in URL fragments');
        return send(res,200,registrationPage(authLanguage(url.searchParams.get('lang'))),headers);
      }
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'GET,POST'});
      if(!ownerEmail)return send(res,503,'Onboarding is not configured');
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
        return send(res,415,'Form required');
      try{
        const params=new URLSearchParams((await readBody(req,6144)).toString('utf8'));
        const keys=[...params.keys()];
        if(keys.length!==6||new Set(keys).size!==6||
          keys.some(key=>!['token','email','name','password','password_confirm','privacy'].includes(key)))
          return send(res,422,'Invalid registration form');
        acceptAccountInvite(db,{
          token:params.get('token')||'',email:params.get('email')||'',name:params.get('name')||'',
          password:params.get('password')||'',confirmed:params.get('password_confirm')||'',
          privacyAccepted:params.get('privacy')==='on',ownerEmail,developerEmail
        });
        return redirect(res,'/login/?'+(authLanguage(url.searchParams.get('lang'))==='de'?'':'lang='+authLanguage(url.searchParams.get('lang'))+'&')+'return_to=%2Fkonto%2F',{'Referrer-Policy':'no-referrer'});
      }catch(error){
        if(error?.code==='too_large')return send(res,413,'Invalid registration form');
        if(error instanceof AccountInviteError)return send(res,422,'Invalid, expired or already used invitation or form');
        return send(res,409,'Registration temporarily unavailable');
      }
    }
    if(url.pathname==='/invite-user/revoke/'||url.pathname==='/invite-user/revoke'){
      const user=readSession(db,req.headers.cookie);
      if(!user)return send(res,401,'Login required');
      if(!operator(user))
        return send(res,403,'Owner approval required');
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
        return send(res,415,'Form required');
      try{
        const params=new URLSearchParams((await readBody(req,2048)).toString('utf8'));
        const keys=[...params.keys()];
        if(keys.length!==1||keys[0]!=='email')return send(res,422,'Invalid revocation request');
        const revoked=revokeAccountInvite(db,{
          issuerId:user.id,ownerEmail,developerEmail,email:params.get('email')||''
        });
        return send(res,200,invitationPage(null,'',revoked?
          'Die offene Einladung wurde widerrufen.':'Keine offene Einladung vorhanden.'),{
          'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
          'X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer',
          'X-Frame-Options':'DENY'
        });
      }catch(error){
        if(error?.code==='too_large')return send(res,413,'Invalid revocation request');
        if(error instanceof AccountInviteError)return send(res,422,'Invalid revocation request');
        return send(res,409,'Revocation temporarily unavailable');
      }
    }
    if(url.pathname==='/invite-user/'||url.pathname==='/invite-user'){
      const user=readSession(db,req.headers.cookie);
      if(!user)return send(res,401,'Login required');
      if(!operator(user))
        return send(res,403,'Owner approval required');
      const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
        'X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
      if(req.method==='GET')return send(res,200,invitationPage(),headers);
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'GET,POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
        return send(res,415,'Form required');
      try{
        const params=new URLSearchParams((await readBody(req,2048)).toString('utf8'));
        const keys=[...params.keys()];
        if(keys.length!==3||new Set(keys).size!==3||
          keys.some(key=>!['email','role','identity_verified'].includes(key))||
          params.get('identity_verified')!=='on')return send(res,422,'Invalid invitation form');
        const invite=issueAccountInvite(db,{
          issuerId:user.id,ownerEmail,developerEmail,email:params.get('email')||'',role:params.get('role')||'',
          identityVerified:params.get('identity_verified')==='on'
        });
        return send(res,200,invitationPage(invite,base.origin),headers);
      }catch(error){
        if(error?.code==='too_large')return send(res,413,'Invalid invitation form');
        if(error instanceof AccountInviteError)
          return send(res,error.message==='Invitation daily limit reached'?429:422,'Invitation not available');
        return send(res,409,'Invitation temporarily unavailable');
      }
    }
    const oidcPath=url.pathname.match(/^\/auth\/oidc\/(google|microsoft)\/(start\/|callback\/)?$/);
    if(oidcPath){
      const provider=oidcPath[1],action=oidcPath[2]||'';
      const cfg=oidcConfig[provider];
      if(!cfg)return send(res,404,'Social provider not configured');
      const heads={...privateAccountHeaders,'Referrer-Policy':'no-referrer'};
      if(action===''){
        if(req.method!=='GET')return send(res,405,'Method not allowed',{Allow:'GET'});
        const link=url.searchParams.get('mode')==='link';
        if(link&&!readSession(db,req.headers.cookie))return send(res,401,'Sign in before linking');
        return send(res,200,oidcConsentPage(provider,link),heads);
      }
      if(action==='start/'){
        if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'POST'});
        if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
        if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
          return send(res,415,'Form required');
        try{
          const params=new URLSearchParams((await readBody(req,2048)).toString('utf8'));
          const keys=[...params.keys()];
          if(keys.length!==3||new Set(keys).size!==3||
             keys.some(k=>!['intent','privacy','mode'].includes(k)))return send(res,422,'Invalid login form');
          const link=params.get('mode')==='link';
          if(!['signup','link'].includes(params.get('mode')))return send(res,422,'Invalid mode');
          const logged=link?readSession(db,req.headers.cookie):null;
          if(link&&!logged)return send(res,401,'Sign in before linking');
          const start=beginOidc(db,{provider,config:oidcConfig,origin:base.origin,
            intent:params.get('intent'),privacyAccepted:params.get('privacy')==='on',
            linkUserId:logged?.id||null});
          return redirect(res,start.redirect,{'Set-Cookie':oidcStateCookie(start.state),
            'Referrer-Policy':'no-referrer'});
        }catch(error){
          if(error?.code==='too_large')return send(res,413,'Invalid form');
          return send(res,422,'Social sign-in could not start');
        }
      }
      if(action==='callback/'){
        if(req.method!=='GET')return send(res,405,'Method not allowed',{Allow:'GET'});
        const cleared=clearOidcStateCookie();
        if((req.url||'').length>4096||url.searchParams.has('error'))
          return send(res,401,'Social authentication not completed',{
            'Set-Cookie':cleared,'Referrer-Policy':'no-referrer'});
        try{
          if(url.searchParams.has('iss')&&url.searchParams.get('iss')!==cfg.issuer)
            return send(res,401,'Social identity issuer mismatch',{'Set-Cookie':cleared});
          const result=await completeOidc(db,{
            provider,config:oidcConfig,origin:base.origin,
            code:url.searchParams.get('code'),state:url.searchParams.get('state'),
            cookie:req.headers.cookie,fetchImpl:oidcFetch
          });
          const signed=createSessionForUser(db,result.userId);
          return redirect(res,'/konto/',{'Set-Cookie':[cleared,sessionCookie(signed.token,{secure:!localTest})],
            'Referrer-Policy':'no-referrer'});
        }catch(error){
          const status=error instanceof OidcError && error.code==='provider_unavailable'?503:401;
          return send(res,status,'Social authentication failed or requires an existing linked account',{
            'Set-Cookie':cleared,'Referrer-Policy':'no-referrer'});
        }
      }
    }
    if(url.pathname==='/login/'||url.pathname==='/login'){
      const rt=returnPath(url.searchParams.get('return_to'));
      if(req.method==='GET')return send(res,200,loginPage(rt,false,authLanguage(url.searchParams.get('lang')),social),{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex,nofollow'});
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
        if(!result)return send(res,401,loginPage(target,true,authLanguage(url.searchParams.get('lang')),social),{'Content-Type':'text/html; charset=utf-8'});
        return redirect(res,target,{'Set-Cookie':sessionCookie(result.token,{secure:!localTest})});
      }catch(error){return send(res,error?.code==='too_large'?413:400,'Invalid request');}
    }
    if(url.pathname==='/account/password/'||url.pathname==='/account/password'){
      const user=readSession(db,req.headers.cookie);
      if(!user)return send(res,401,'Login required');
      const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
        'X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
      if(req.method==='GET')return send(res,200,credentialPage(),headers);
      if(req.method!=='POST')return send(res,405,'Method not allowed',{Allow:'GET,POST'});
      if(!csrfOK(req,rawHost,effectiveOrigin))return send(res,403,'Origin verification failed');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))
        return send(res,415,'Form required');
      try{
        const params=new URLSearchParams((await readBody(req,2048)).toString('utf8'));
        const keys=[...params.keys()];
        if(keys.length!==3||new Set(keys).size!==3||
           keys.some(key=>!['current','new','confirm'].includes(key)))
          return send(res,422,'Invalid form');
        const changed=rotateCredentials(db,{
          userId:user.id,currentPassword:params.get('current')||'',
          newPassword:params.get('new')||'',confirmed:params.get('confirm')||''
        });
        if(!changed)return send(res,422,credentialPage(true),headers);
        return redirect(res,'/login/?return_to=%2Fkonto%2F',{
          'Set-Cookie':expiredCookie({secure:!localTest}),'Referrer-Policy':'no-referrer'
        });
      }catch(error){
        if(error?.code==='too_large')return send(res,413,'Invalid form');
        return send(res,409,'Credential update temporarily unavailable');
      }
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
        const scopedEnv=operator(user)&&user.email.toLowerCase()!==ownerEmail.toLowerCase()
          ?{...env,DELEGATED_OWNER_ID:user.id}:env;
        reply=await worker.fetch(workRequest,scopedEnv,{waitUntil:promise=>{void Promise.resolve(promise).catch(()=>{});}});
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
    developerEmail:process.env.KNABA_DEVELOPER_EMAIL||'',
    turnstileSiteKey:process.env.TURNSTILE_SITE_KEY||'',
    turnstileSecretKey:process.env.TURNSTILE_SECRET_KEY||'',
    origin:process.env.KNABA_PUBLIC_ORIGIN||'https://knaba.de',
    port,host:'0.0.0.0',localTest:process.env.KNABA_LOCAL_TEST==='1'
  });
  process.stdout.write('KNABA VPS service listening on internal port '+instance.port+'\n');
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void instance.close().then(()=>process.exit(0));});
}
