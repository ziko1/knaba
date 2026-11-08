import type defaultPack from '../data/portal-locales/de.json';
import type {PublishedSiteLocale} from './locale-catalog';
import {portalLocaleKeys} from './portal-locale-schema';

export type PortalText = typeof defaultPack.portal;
export type WorkspaceText = typeof defaultPack.workspace;
export type AdminText = typeof defaultPack.admin;
export type CabinetText = typeof defaultPack.cabinet;
export type PortalLocalePack = {locale:PublishedSiteLocale;portal:PortalText;workspace:WorkspaceText;admin:AdminText;cabinet:CabinetText};

/** Validate static language data before allowing it to replace the current UI. */
export function validatePortalLocalePack(value:unknown,locale:PublishedSiteLocale):PortalLocalePack {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid language pack');
  const pack=value as Record<string,unknown>;
  if(!['de','en','pl','lt','ru','uk'].includes(locale)||pack.locale!==locale)throw Error('Wrong language pack');
  for(const section of ['portal','workspace','admin','cabinet'] as const){
    const words=pack[section];
    if(!words||typeof words!=='object'||Array.isArray(words))throw Error('Missing language section');
    const expected=portalLocaleKeys[section],actual=Object.keys(words).sort();
    if(expected.length!==actual.length||expected.some((key,index)=>key!==actual[index]))throw Error('Incomplete language pack');
    for(const text of Object.values(words))if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Invalid translation');
  }
  return value as PortalLocalePack;
}

/** Keeps the active copy intact on a failed fetch and deduplicates simultaneous loads. */
export function createPortalLocaleStore(initialPack:PortalLocalePack|undefined,load:(locale:PublishedSiteLocale)=>Promise<unknown>){
  const portalMessages={} as Record<PublishedSiteLocale,PortalText>;
  const workspaceWords={} as Record<PublishedSiteLocale,WorkspaceText>;
  const adminWords={} as Record<PublishedSiteLocale,AdminText>;
  const cabinetWords={} as Record<PublishedSiteLocale,CabinetText>;
  const pending=new Map<PublishedSiteLocale,Promise<void>>();
  const install=(value:unknown,locale:PublishedSiteLocale)=>{
    const pack=validatePortalLocalePack(value,locale);
    portalMessages[locale]=pack.portal;workspaceWords[locale]=pack.workspace;adminWords[locale]=pack.admin;cabinetWords[locale]=pack.cabinet;
  };
  const ensure=(locale:PublishedSiteLocale):Promise<void>=>{
    if(!['de','en','pl','lt','ru','uk'].includes(locale))return Promise.reject(Error('Unsupported language'));
    if(Object.hasOwn(portalMessages,locale))return Promise.resolve();
    if(pending.has(locale))return pending.get(locale)!;
    const task=Promise.resolve().then(()=>load(locale)).then(pack=>install(pack,locale)).finally(()=>pending.delete(locale));
    pending.set(locale,task);return task;
  };
  if(initialPack!==undefined)install(initialPack,initialPack.locale);
  return {portalMessages,workspaceWords,adminWords,cabinetWords,ensure,install};
}
