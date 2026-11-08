import type baseline from '../data/assistant-inbox-locales/inbox-de.json';
import de from '../data/assistant-inbox-locales/inbox-de.json?url&no-inline';
import en from '../data/assistant-inbox-locales/inbox-en.json?url&no-inline';
import pl from '../data/assistant-inbox-locales/inbox-pl.json?url&no-inline';
import lt from '../data/assistant-inbox-locales/inbox-lt.json?url&no-inline';
import ru from '../data/assistant-inbox-locales/inbox-ru.json?url&no-inline';
import uk from '../data/assistant-inbox-locales/inbox-uk.json?url&no-inline';

export const INBOX_LOCALES=['de','en','pl','lt','ru','uk'] as const;
export type InboxLocale=typeof INBOX_LOCALES[number];
export type InboxLabels=Readonly<typeof baseline>;
const urls:Record<InboxLocale,string>={de,en,pl,lt,ru,uk};
export const INBOX_LOCALE_NAMES:Record<InboxLocale,string>={de:'Deutsch',en:'English',pl:'Polski',lt:'Lietuvių',ru:'Русский',uk:'Українська'};
export const INBOX_DATE_LOCALES:Record<InboxLocale,string>={de:'de-DE',en:'en-GB',pl:'pl-PL',lt:'lt-LT',ru:'ru-RU',uk:'uk-UA'};
export function assistantInboxLocale(value:unknown):InboxLocale {
  return typeof value==='string'&&INBOX_LOCALES.includes(value as InboxLocale)?value as InboxLocale:'de';
}

export async function fetchInboxLabels(locale:InboxLocale):Promise<unknown>{
  if(!INBOX_LOCALES.includes(locale))throw Error('Unsupported inbox language');
  const response=await fetch(urls[locale],{credentials:'omit',cache:'force-cache',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Inbox language unavailable');
  return response.json();
}

function validateLabels(value:unknown,locale:InboxLocale,initial:InboxLabels):InboxLabels{
  if(!value||typeof value!=='object'||Array.isArray(value)||!initial)throw Error('Missing inbox labels');
  const pack=value as Record<string,unknown>,keys=Object.keys(initial);
  if(pack.languageName!==INBOX_LOCALE_NAMES[locale]||Object.keys(pack).length!==keys.length||keys.some(key=>!Object.hasOwn(pack,key))||
    Object.values(pack).some(text=>typeof text!=='string'||!text.trim()||text.length>4000||/[<>]/.test(text)))throw Error('Invalid inbox language pack');
  return Object.freeze({...pack}) as InboxLabels;
}

/** Instance-local public labels only. Failed loads remain retryable. */
export function createInboxLocaleStore(locale:InboxLocale,labels:InboxLabels,load:(locale:InboxLocale)=>Promise<unknown>){
  const initial=validateLabels(labels,locale,labels),packs=new Map<InboxLocale,InboxLabels>([[locale,initial]]),pending=new Map<InboxLocale,Promise<InboxLabels>>();
  return {initial,ensure(selected:InboxLocale):Promise<InboxLabels>{
    if(!INBOX_LOCALES.includes(selected))return Promise.reject(Error('Unsupported inbox language'));
    if(packs.has(selected))return Promise.resolve(packs.get(selected)!);
    if(pending.has(selected))return pending.get(selected)!;
    const request=Promise.resolve().then(()=>load(selected)).then(value=>{
      const pack=validateLabels(value,selected,initial);packs.set(selected,pack);return pack;
    }).finally(()=>pending.delete(selected));
    pending.set(selected,request);return request;
  }};
}
