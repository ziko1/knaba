import {createPortalLocaleStore} from './portal-locale-store.ts';
import type {PublishedSiteLocale} from './locale-catalog';

const store=createPortalLocaleStore(undefined,async locale=>{
  const {portalLocaleUrls}=await import('./portal-locale-urls.ts');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(portalLocaleUrls[locale],{credentials:'omit',cache:'force-cache',signal:controller.signal});
    if(!response.ok)throw Error('Language pack unavailable');
    return await response.json();
  }finally{clearTimeout(timer);}
});
export const {portalMessages,workspaceWords,adminWords,cabinetWords}=store;
export const ensurePortalLocale=store.ensure;
// Astro supplies the exact SSR copy before a private island reads its labels.
// Embedded modules share this cache after their parent has selected a language.
export const installPortalLocale=store.install;

if(import.meta.env?.SSR!==false){
  const {portalLocalePacks}=await import('./portal-locales-server.ts');
  for(const [locale,pack] of Object.entries(portalLocalePacks))store.install(pack,locale as PublishedSiteLocale);
}
