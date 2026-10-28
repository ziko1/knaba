import type {InquiryData} from './inquiry';
import {offerBySlug} from '../data/construction-offers';

export interface InquiryDraft {
  data: InquiryData;
  topic: string;
  step: number;
  reviewing: boolean;
  entryTopic?: string;
}
type Submission = InquiryData & {privacyAccepted:true;website:string;idempotencyKey:string};

/** One transient draft per document runtime. No storage, URL, network or SSR writes. */
export function createInquiryDraftMemory(){
  let draft:InquiryDraft|null=null;
  let submission:Submission|null=null;
  let navigationTopic:string|null|undefined;
  let navigation:ReturnType<typeof bindInquiryNavigation>|undefined;
  let targets:{page:EventTarget;tab:EventTarget}|undefined;
  const disconnect=()=>{navigation?.dispose();navigation=undefined;targets=undefined;};
  const rememberNavigation=(event?:Event)=>{
    navigationTopic=null; // Locale switches and history keep the current draft choice.
    const transition=event as (Event & {sourceElement?:Element;to?:URL;from?:URL})|undefined;
    const anchor=transition?.sourceElement?.closest?.('a[href]');
    if(!anchor||anchor.hasAttribute('data-language-switch')||!transition?.to)return;
    const destination=transition.to;
    if(transition.from&&destination.origin!==transition.from.origin)return;
    if(!/^\/(?:(?:en|uk|ru)\/)?kontakt\/$/.test(destination.pathname))return;
    const params=destination.searchParams;
    navigationTopic=offerBySlug(params.get('anliegen')||'')?.slug
      ?? (params.get('leistung')==='baureinigung'?'baureinigung':null);
  };
  return {
    read():InquiryDraft|null {return draft?{...draft,data:{...draft.data}}:null;},
    save(value:InquiryDraft){draft={...value,data:{...value.data}};navigation?.refresh();},
    clear(){draft=null;submission=null;navigationTopic=undefined;disconnect();},
    resetSubmission(){submission=null;navigation?.refresh();},
    takeNavigationTopic(){const value=navigationTopic;navigationTopic=undefined;return value;},
    connectNavigation(page:EventTarget,tab:EventTarget){
      if(targets?.page===page&&targets.tab===tab)return;
      disconnect();targets={page,tab};
      navigation=bindInquiryNavigation({page,tab,hasDraft:()=>!!draft,isSending:()=>!!submission,save:rememberNavigation});
    },
    releaseIfEmpty(){if(!draft&&!submission)disconnect();},
    prepareSubmission(data:InquiryData,website:string,createId:()=>string):Submission {
      // A timeout followed by a language change must retry the exact original
      // body and key, not send a second localized copy of the same request.
      submission??={...data,privacyAccepted:true,website,idempotencyKey:createId()};
      navigation?.refresh();
      return {...submission};
    },
  };
}
export const inquiryDraftMemory=createInquiryDraftMemory();

export const inquiryDraftCopy={
  de:{restored:'Ihre Angaben wurden in diesem Tab wiederhergestellt. Bitte prüfen Sie sie vor dem Senden.'},
  en:{restored:'Your answers have been restored in this tab. Please review them before sending.'},
  uk:{restored:'Відповіді відновлено в цій вкладці. Перевірте їх перед надсиланням.'},
  ru:{restored:'Ответы восстановлены в этой вкладке. Проверьте их перед отправкой.'},
} as const;

/** Preserve normal Astro SPA navigation. Cancelling before-preparation would
 * force its full-document fallback and lose this transient memory. */
export function bindInquiryNavigation(options:{
  page:EventTarget;
  tab:EventTarget;
  hasDraft:()=>boolean;
  isSending:()=>boolean;
  save:(event?:Event)=>void;
}){
  let unloadAttached=false;
  const beforeUnload=(event:Event)=>{
    if(!options.hasDraft()&&!options.isSending())return;
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue='';
  };
  const beforeNavigation=(event:Event)=>{
    if(event.defaultPrevented)return;
    options.save(event);
  };
  const refresh=()=>{
    const needed=options.hasDraft()||options.isSending();
    if(needed===unloadAttached)return;
    unloadAttached=needed;
    if(needed)options.tab.addEventListener('beforeunload',beforeUnload);
    else options.tab.removeEventListener('beforeunload',beforeUnload);
  };
  options.page.addEventListener('astro:before-preparation',beforeNavigation);
  refresh();
  return {refresh,dispose(){
    options.page.removeEventListener('astro:before-preparation',beforeNavigation);
    if(unloadAttached)options.tab.removeEventListener('beforeunload',beforeUnload);
    unloadAttached=false;
  }};
}
