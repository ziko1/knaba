import type {Express} from 'express';
import {renderSiteIdentityPage,siteIdentityClient} from '../../packages/integrations/site-identity-ui.mjs';
export function installSiteIdentityPages(server:Express){
 for(const path of ['/account/site-link','/account/site-link/','/site-identity-ui.js'])server.get(path,(_req,res)=>{
  res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',
   'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"});
  res.type(path.endsWith('.js')?'text/javascript':'text/html').send(path.endsWith('.js')?siteIdentityClient:renderSiteIdentityPage('erp'));
 });
}
