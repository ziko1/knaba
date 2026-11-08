/** Server-owned landing decisions. URL parameters never grant a role. */
import {hasOwnerAuthority} from './admin-access.mjs';

const locales=new Set(['de','en','pl','lt','ru','uk']);
const roles=new Set(['client','partner','worker','bauleiter','admin']);
export const workspaceLocale=value=>locales.has(value)?value:'de';

export function authenticatedRole(db,user,{ownerEmail='',ownerUserId,developerEmail=''}={}){
  if(!user)return 'anonymous';
  if(hasOwnerAuthority(db,{userId:user.id,ownerEmail,ownerUserId,developerEmail}))return 'owner';
  const profile=db.prepare('SELECT email,role,status FROM profiles WHERE id=?').get(user.id);
  if(!profile)return 'pending';
  if(profile.email.trim().toLowerCase()!==user.email.trim().toLowerCase())return 'suspended';
  if(profile.status==='pending')return 'pending';
  if(profile.status!=='approved'||!roles.has(profile.role))return 'suspended';
  return profile.role;
}

export function roleDestination(role,requested='',language='de'){
  let target;
  try{
    if(typeof requested==='string'&&requested.length<=512&&requested.startsWith('/')&&
      !requested.startsWith('//')&&!/[\\\r\n\0]/.test(requested)){
      const parsed=new URL(requested,'https://knaba.invalid');
      if(parsed.origin==='https://knaba.invalid')target=parsed;
    }
  }catch{/* Invalid destinations use the role's own home. */}
  const lang=workspaceLocale(target?.searchParams.get('lang')||language);
  const manager=role==='owner'||role==='admin';
  const home=new URL(manager?'/admin/':'/konto/','https://knaba.invalid');
  home.searchParams.set('lang',lang);
  if(!target)return home.pathname+home.search;
  const path=target.pathname.replace(/\/+$/,'')||'/';
  if(path==='/konto'||path==='/ru/konto'){
    for(const key of ['tab','status','q','conversation']){
      if(target.searchParams.has(key))home.searchParams.set(key,target.searchParams.get(key));
    }
    if(manager&&target.searchParams.has('tab'))home.searchParams.set('view','operations');
    return home.pathname+home.search;
  }
  if(path==='/admin'&&manager){
    const available=role==='owner'?['overview','operations','crm','messages','studio']:['overview','operations','crm'];
    const view=target.searchParams.get('view');
    if(available.includes(view))home.searchParams.set('view',view);
    for(const key of ['tab','status','q','conversation']){
      if(target.searchParams.has(key))home.searchParams.set(key,target.searchParams.get(key));
    }
    return home.pathname+home.search;
  }
  const legacy={
    '/studio':'studio','/crm':'crm','/postfach':'messages','/ru/postfach':'messages'
  };
  if(legacy[path]&&manager&&(legacy[path]==='crm'||role==='owner')){
    home.searchParams.set('view',legacy[path]);
    return home.pathname+home.search;
  }
  if(path==='/account/password')return '/account/password/';
  if(path==='/account/settings')return '/account/settings/?lang='+lang;
  if(path==='/account/erp-link'||path==='/account/erp-link/reauth')return path+'/?lang='+lang;
  if(path==='/account/erp-login'){
    const authority=target.searchParams.get('authority_id'),request=target.searchParams.get('request_id');
    if(/^[A-Za-z0-9_-]{1,64}$/.test(authority??'')&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(request??'')&&
      target.searchParams.getAll('authority_id').length===1&&target.searchParams.getAll('request_id').length===1)
      return '/account/erp-login/?authority_id='+authority+'&request_id='+request+'&lang='+lang;
  }
  // Public links are safe to resume, but account/API paths never become a
  // fallback that takes a newly signed-in user to another role's workspace.
  if(/^\/(?:en\/|pl\/|lt\/|ru\/|uk\/)?(?:$|kontakt\/?$|leistungen(?:\/[^/?]+)?\/?$|galerie\/?$|unternehmen\/?$|karriere\/?$|datenschutz\/?$|impressum\/?$)/.test(target.pathname)){
    return target.pathname+target.search;
  }
  return home.pathname+home.search;
}
