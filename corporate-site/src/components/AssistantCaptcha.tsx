import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import type { AssistantLocale } from '../lib/assistant-knowledge';

export type CaptchaState = 'loading'|'disabled'|'pending'|'verified'|'error';
interface TurnstileAPI {
  render: (element:HTMLElement,options:Record<string,unknown>)=>string;
  reset: (id:string)=>void;
  remove: (id:string)=>void;
}
type TurnstileWindow=Window & {turnstile?:TurnstileAPI};
const labels={
  de:{loading:'Sicherheitsprüfung wird geladen …',check:'Sicherheitsprüfung',error:'Prüfung nicht verfügbar. Bitte nutzen Sie die Kontaktseite.',retry:'Erneut laden',contact:'Kontaktformular',privacy:'Die Sicherheitsprüfung nutzt Cloudflare Turnstile. Technische Daten können an Cloudflare übermittelt werden.'},
  en:{loading:'Loading security check …',check:'Security check',error:'Verification unavailable. Please use the contact page.',retry:'Retry',contact:'Contact form',privacy:'This security check uses Cloudflare Turnstile. Technical information may be sent to Cloudflare.'},
  pl:{loading:'Ładowanie kontroli bezpieczeństwa…',check:'Kontrola bezpieczeństwa',error:'Weryfikacja niedostępna. Skorzystaj ze strony kontaktowej.',retry:'Spróbuj ponownie',contact:'Formularz kontaktowy',privacy:'Kontrola korzysta z Cloudflare Turnstile. Dane techniczne mogą zostać przekazane do Cloudflare.'},
  lt:{loading:'Įkeliama saugumo patikra…',check:'Saugumo patikra',error:'Patikra nepasiekiama. Naudokite kontaktų puslapį.',retry:'Bandyti dar kartą',contact:'Kontaktų forma',privacy:'Patikra naudoja Cloudflare Turnstile. Techniniai duomenys gali būti perduoti Cloudflare.'},
  uk:{loading:'Завантаження перевірки безпеки …',check:'Перевірка безпеки',error:'Перевірка недоступна. Скористайтеся сторінкою контактів.',retry:'Спробувати ще',contact:'Форма зв’язку',privacy:'Перевірка використовує Cloudflare Turnstile. Технічні дані можуть передаватися Cloudflare.'},
  ru:{loading:'Загрузка проверки безопасности …',check:'Проверка безопасности',error:'Проверка недоступна. Воспользуйтесь страницей контактов.',retry:'Повторить',contact:'Форма связи',privacy:'Проверка использует Cloudflare Turnstile. Технические данные могут передаваться Cloudflare.'},
};

function loadScript():Promise<TurnstileAPI> {
  const browser=window as TurnstileWindow;
  if(browser.turnstile?.render)return Promise.resolve(browser.turnstile);
  return new Promise((resolve,reject)=>{
    let script=document.querySelector<HTMLScriptElement>('script[data-knaba-turnstile]');
    let timer:number|undefined;
    const done=()=>{window.clearTimeout(timer);script?.removeEventListener('load',loaded);script?.removeEventListener('error',failed);};
    const loaded=()=>{done();browser.turnstile?.render?resolve(browser.turnstile):reject(Error('captcha script incomplete'));};
    const failed=()=>{done();script?.remove();reject(Error('captcha script failed'));};
    if(!script){
      script=document.createElement('script');
      script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async=true;
      script.dataset.knabaTurnstile='';
      document.head.appendChild(script);
    }
    script.addEventListener('load',loaded,{once:true});
    script.addEventListener('error',failed,{once:true});
    timer=window.setTimeout(()=>{done();script?.remove();reject(Error('captcha load timeout'));},10_000);
    if(browser.turnstile?.render)loaded();
  });
}

/** Render only when a new public conversation is needed. Token is kept in component memory. */
export default function AssistantCaptcha(props:{
  locale: AssistantLocale;
  resetVersion: number;
  endpoint?: '/api/assistant/captcha' | '/api/reviews/captcha';
  onChange:(state:CaptchaState,token?:string)=>void;
}) {
  const [state,setState]=createSignal<CaptchaState>('loading');
  const t=labels[props.locale];
  let mountEl!:HTMLDivElement;
  let widgetId:string|undefined;
  let disposed=false;
  let api:TurnstileAPI|undefined;
  let generation=0;

  const update=(next:CaptchaState,token='')=>{
    if(disposed)return;
    setState(next);props.onChange(next,token);
  };
  async function mount() {
    const current=++generation;
    update('loading');
    try{
      const response=await fetch(props.endpoint ?? '/api/assistant/captcha',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8_000)});
      if(!response.ok)throw Error('captcha config unavailable');
      const cfg=await response.json() as {enabled?:unknown;sitekey?:unknown;unavailable?:unknown};
      if(cfg.unavailable)throw Error('captcha configuration incomplete');
      if(!cfg.enabled){update('disabled');return;}
      if(typeof cfg.sitekey!=='string'||!cfg.sitekey)throw Error('captcha sitekey missing');
      const provider=await loadScript();
      if(disposed||current!==generation)return;
      api=provider;
      widgetId=provider.render(mountEl,{
        sitekey:cfg.sitekey,
        theme:'light',
        size:'flexible',
        'response-field':false,
        callback:(token:string)=>update('verified',token),
        'expired-callback':()=>{update('pending');if(widgetId)provider.reset(widgetId);},
        'error-callback':()=>{update('error');return true;},
        'timeout-callback':()=>{update('pending');if(widgetId)provider.reset(widgetId);},
      });
      if(state()!=='verified')update('pending');
    }catch{update('error');}
  }
  onMount(()=>{void mount();});
  createEffect(()=>{
    const version=props.resetVersion;
    if(version>0 && api && widgetId && !disposed){
      api.reset(widgetId);
      update('pending');
    }
  });
  onCleanup(()=>{disposed=true;generation++;if(api&&widgetId)api.remove(widgetId);});
  return <div class="ka-captcha" hidden={state()==='disabled'}>
    <div class="ka-captcha-heading">{t.check}</div>
    <div ref={mountEl} class="ka-captcha-widget" aria-label={t.check}/>
    {state()==='loading'&&<p role="status">{t.loading}</p>}
    {state()==='error'&&<p role="alert">{t.error}
      <button type="button" class="ka-captcha-retry" onClick={()=>{if(api&&widgetId)api.remove(widgetId);api=undefined;widgetId=undefined;void mount();}}>{t.retry}</button>
      <a href={props.locale==='de'?'/kontakt/':'/'+props.locale+'/kontakt/'}>{t.contact} ↗</a></p>}
    <p class="ka-captcha-privacy">{t.privacy}</p>
  </div>;
}
