import type baseline from '../data/studio-locales/studio-de.json';

export const studioLocales=['de','en','uk','ru'] as const;
export type StudioLocale=typeof studioLocales[number];
export type StudioLocalePack={readonly locale:StudioLocale;readonly studio:Readonly<typeof baseline.studio>;readonly modes:Readonly<typeof baseline.modes>;readonly article:Readonly<typeof baseline.article>;readonly reviews:Readonly<typeof baseline.reviews>};
export type ArticleWords=StudioLocalePack['article'];
export type ModerationWords=StudioLocalePack['reviews'];
const fields={
  studio: "studio owner loading denied portal page open preview edit properties select text kind save publish confirm unsaved published draft versions restore undo redo reset seo title description ai instruction suggest use aiNote empty okDraft okPublish okRestore mobile desktop color status nav hint".split(" "),
  modes: "visual manual section apply reset manualHint unsent background padding fontSize media aiReady aiLocked".split(" "),
  article: "heading intro slug language new existing empty title description body save publish confirm restore preview status draft live open notPublished hint saved published restored validate emptySlug unsaved unpublished unpublishHint unpublishConfirm unpublish".split(" "),
  reviews: "all client consentAt denied entries filter hidden hide loadError loading moderation moderationError moderationIntro next noPending partner pending portal previous privateEmail publish published refresh retry sending updated versionConflict".split(" "),
} as const;
export const isStudioLocale=(value:unknown):value is StudioLocale=>studioLocales.includes(value as StudioLocale);

/** Only complete static UI text may replace the currently selected language. */
export function validateStudioLocalePack(value:unknown,locale:StudioLocale):StudioLocalePack{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Studio language pack');
  const pack=value as Record<string,unknown>;
  if(!isStudioLocale(locale)||pack.locale!==locale||Object.keys(pack).sort().join(',')!=='article,locale,modes,reviews,studio')throw Error('Wrong Studio language pack');
  for(const section of Object.keys(fields) as (keyof typeof fields)[]){
    const values=pack[section];
    if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Missing Studio language section');
    const words=values as Record<string,unknown>,expected=fields[section];
    if(Object.keys(words).length!==expected.length||expected.some(key=>!Object.hasOwn(words,key)))throw Error('Incomplete Studio language pack');
    if(Object.values(words).some(text=>typeof text!=='string'||!text.trim()||text.length>4000))throw Error('Invalid Studio translation');
  }
  return Object.freeze({locale,...Object.fromEntries(Object.keys(fields).map(section=>[section,Object.freeze({...pack[section] as Record<string,string>})]))}) as StudioLocalePack;
}

/** Cache valid data only; a failed attempt remains retryable. */
export function createStudioLocaleStore(load:(locale:StudioLocale)=>Promise<unknown>){
  const packs=new Map<StudioLocale,StudioLocalePack>(),pending=new Map<StudioLocale,Promise<StudioLocalePack>>();
  const ensure=(locale:StudioLocale):Promise<StudioLocalePack>=>{
    if(!isStudioLocale(locale))return Promise.reject(Error('Unsupported Studio language'));
    if(packs.has(locale))return Promise.resolve(packs.get(locale)!);
    if(pending.has(locale))return pending.get(locale)!;
    const task=Promise.resolve().then(()=>load(locale)).then(value=>{
      const pack=validateStudioLocalePack(value,locale);packs.set(locale,pack);return pack;
    }).finally(()=>pending.delete(locale));
    pending.set(locale,task);return task;
  };
  return {ensure};
}
export type StudioLocaleState={locale:StudioLocale|null;pack:StudioLocalePack|null;requested:StudioLocale;loading:boolean;failed:boolean};
export const initialStudioLocaleState:StudioLocaleState={locale:null,pack:null,requested:'de',loading:false,failed:false};

/** Changes labels without clearing the active pack or remounting edited forms. */
export function createStudioLocaleSelection(store:ReturnType<typeof createStudioLocaleStore>,changed:(state:StudioLocaleState)=>void){
  let state={...initialStudioLocaleState},attempt=0,disposed=false;
  const update=(patch:Partial<StudioLocaleState>)=>{state={...state,...patch};changed(state);};
  const select=async(locale:StudioLocale):Promise<boolean>=>{
    if(disposed||!isStudioLocale(locale))return false;
    const current=++attempt;update({requested:locale,loading:true,failed:false});
    try{
      const pack=await store.ensure(locale);
      if(disposed||attempt!==current)return false;
      update({locale,pack,loading:false,failed:false});return true;
    }catch{
      if(!disposed&&attempt===current)update({loading:false,failed:true});
      return false;
    }
  };
  return {select,retry:()=>select(state.requested),snapshot:()=>state,dispose:()=>{disposed=true;attempt++;}};
}
