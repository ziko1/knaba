import defaultPack from '../data/portal-locales/de.json' with {type:'json'};
import {createPortalLocaleStore,type PortalLocalePack} from './portal-locale-store.ts';
import type {PublishedSiteLocale} from './locale-catalog';

const store=createPortalLocaleStore(defaultPack as PortalLocalePack,async locale=>{
  if(locale==='de')return defaultPack;
  const {portalLocaleUrls}=await import('./portal-locale-urls.ts');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(portalLocaleUrls[locale],{credentials:'omit',cache:'force-cache',signal:controller.signal});
    if(!response.ok)throw Error('Language pack unavailable');
    return await response.json();
  }finally{clearTimeout(timer);}
});
export const {portalMessages,workspaceWords,adminWords}=store;
export const ensurePortalLocale=store.ensure;

if(import.meta.env?.SSR!==false){
  const {portalLocalePacks}=await import('./portal-locales-server.ts');
  for(const [locale,pack] of Object.entries(portalLocalePacks))store.install(pack,locale as PublishedSiteLocale);
}else if(location.pathname.startsWith('/ru/konto/')){
  // Match the existing Russian SSR island before hydrating it. Other portal
  // routes begin in German and apply an explicit/saved choice after mount.
  await ensurePortalLocale('ru').catch(()=>{});
}
