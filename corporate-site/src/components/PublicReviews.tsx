import {createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import AssistantCaptcha, {type CaptchaState} from './AssistantCaptcha';
import {reviewDate, reviewsCopy, type PublicReview, type ReviewLocale} from '../data/reviews';
import {createRequestId} from '../lib/request-id';

export default function PublicReviews(props: {locale: ReviewLocale}) {
  const t=()=>reviewsCopy[props.locale];
  const [reviews,setReviews]=createSignal<PublicReview[]>([]);
  const [total,setTotal]=createSignal(0);
  const [loading,setLoading]=createSignal(true);
  const [loadError,setLoadError]=createSignal(false);
  const [open,setOpen]=createSignal(false);
  const [busy,setBusy]=createSignal(false);
  const [success,setSuccess]=createSignal(false);
  const [error,setError]=createSignal('');
  const [captcha,setCaptcha]=createSignal<CaptchaState>('loading');
  const [token,setToken]=createSignal('');
  const [captchaReset,setCaptchaReset]=createSignal(0);
  let lastPayload='';
  let lastKey='';
  let disposed=false;
  let formElement: HTMLFormElement|undefined;
  let opener: HTMLButtonElement|undefined;
  let loadController: AbortController|undefined;
  let sendController: AbortController|undefined;
  const contact=()=> (props.locale==='de'?'':'/'+props.locale)+'/kontakt/';
  const privacy=()=>props.locale==='ru'?'/ru/datenschutz/':'/datenschutz/';

  async function load() {
    loadController?.abort();
    const controller=new AbortController();loadController=controller;
    const timeout=window.setTimeout(()=>controller.abort(),12_000);
    setLoading(true);setLoadError(false);
    try {
      const response=await fetch('/api/reviews',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('unavailable');
      const data=await response.json() as {reviews?:PublicReview[];total?:number};
      if(!Array.isArray(data.reviews)||typeof data.total!=='number')throw Error('invalid response');
      if(!disposed && loadController===controller){setReviews(data.reviews);setTotal(data.total);}
    } catch {
      if(!disposed && loadController===controller)setLoadError(true);
    } finally {
      window.clearTimeout(timeout);
      if(!disposed && loadController===controller)setLoading(false);
    }
  }

  function errorMessage(code?:string) {
    if(code==='rate_limit')return t().rateError;
    if(code==='captcha'||code==='captcha_unavailable')return t().captchaError;
    if(code==='validation'||code==='consent')return t().invalid;
    if(code==='idempotency_conflict')return t().conflictError;
    return t().sendError;
  }

  async function submit(event:SubmitEvent) {
    event.preventDefault();
    if(busy()||!formElement)return;
    setError('');
    if(!formElement.reportValidity())return;
    if(!['verified','disabled'].includes(captcha())){setError(t().captchaError);return;}
    const data=new FormData(formElement);
    const payload={
      displayName:String(data.get('displayName')||'').trim(),email:String(data.get('email')||'').trim().toLowerCase(),
      company:String(data.get('company')||'').trim(),relationship:String(data.get('relationship')||''),
      text:String(data.get('text')||'').trim(),consent:data.get('consent')==='yes',website:String(data.get('website')||''),
    };
    if(payload.displayName.length<2||payload.text.length<20||!payload.consent){setError(t().invalid);return;}
    // Keep an unchanged submission's key after uncertain network results. Captcha tokens are one-time and excluded.
    const fingerprint=JSON.stringify(payload);
    try {
      if(fingerprint!==lastPayload||!lastKey){lastKey=createRequestId();lastPayload=fingerprint;}
    } catch {setError(t().sendError);return;}
    const controller=new AbortController();sendController=controller;
    const timeout=window.setTimeout(()=>controller.abort(),15_000);
    setBusy(true);
    try {
      const response=await fetch('/api/reviews',{
        method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json','X-KnaBa-Request':'portal-v1','Idempotency-Key':lastKey},
        body:JSON.stringify({...payload,captchaToken:token()}),
      });
      const body=await response.json() as {submitted?:boolean;error?:{code?:string}};
      if(!response.ok||body.submitted!==true){if(!disposed)setError(errorMessage(body.error?.code));return;}
      if(!disposed){setSuccess(true);setOpen(false);formElement.reset();lastPayload='';lastKey='';opener?.focus();}
    } catch {if(!disposed)setError(t().sendError);}
    finally {
      window.clearTimeout(timeout);
      if(!disposed){setBusy(false);setCaptchaReset(version=>version+1);}
    }
  }

  function toggleForm() {
    if(busy())return;
    const next=!open();setOpen(next);
    if(next){setSuccess(false);queueMicrotask(()=>formElement?.querySelector<HTMLInputElement>('[name="displayName"]')?.focus());}
  }
  onMount(()=>{void load();});
  onCleanup(()=>{disposed=true;loadController?.abort();sendController?.abort();});

  return <div class="reviews-content">
    <Show when={loading()}><p class="reviews-status" role="status">{t().loading}</p></Show>
    <Show when={!loading()&&loadError()}><div class="reviews-notice" role="alert"><p>{t().loadError}</p><button type="button" class="reviews-link" onClick={()=>void load()}>{t().retry}</button></div></Show>
    <Show when={!loading()&&!loadError()}>
      <Show when={reviews().length>0} fallback={<p class="reviews-status reviews-empty" role="status">{t().emptyText}</p>}>
        <div class="reviews-grid"><For each={reviews()}>{review=><figure class="review-card">
          <span class="review-quote-mark" aria-hidden="true">“</span>
          <blockquote><p>{review.text}</p></blockquote>
          <figcaption><strong>{review.displayName}</strong><Show when={review.company}><span>{review.company}</span></Show><span class="review-meta">{review.relationship==='partner'?t().partner:t().client}<span aria-hidden="true"> · </span><time datetime={review.createdAt}>{reviewDate(review.createdAt,props.locale)}</time></span></figcaption>
        </figure>}</For></div>
        <p class="reviews-fine-print"><Show when={total()>reviews().length}>{t().recent} </Show>{t().roleNote}</p>
      </Show>
    </Show>
    <div class="reviews-action"><button ref={opener} type="button" class="reviews-button" aria-expanded={open()} aria-controls="review-form-panel" disabled={busy()} onClick={toggleForm}>{open()?t().close:t().write}<span aria-hidden="true">{open()?'−':'↗'}</span></button></div>
    <Show when={success()}><p class="reviews-success" role="status">{t().success}</p></Show>
    {/* Keep entered values when collapsing the form. Captcha mounts only when the form is open. */}
    <div id="review-form-panel" hidden={!open()} class="review-form-panel">
      <h3>{t().formTitle}</h3><p>{t().formIntro}</p>
      <form ref={formElement} class="reviews-form" onSubmit={event=>void submit(event)}>
        <fieldset disabled={busy()}><legend class="sr-only">{t().formTitle}</legend>
          <div class="reviews-form-grid">
            <label>{t().displayName}<input name="displayName" autocomplete="name" required minLength={2} maxLength={80}/></label>
            <label>{t().email}<input name="email" type="email" autocomplete="email" required maxLength={254}/></label>
            <label>{t().company}<input name="company" autocomplete="organization" maxLength={120}/></label>
            <label>{t().relationship}<select name="relationship"><option value="client">{t().client}</option><option value="partner">{t().partner}</option></select></label>
          </div>
          <label>{t().text}<textarea name="text" required minLength={20} maxLength={1200} rows={5} aria-describedby="review-text-help"/></label>
          <p id="review-text-help" class="reviews-fine-print">{t().textHelp}</p>
          <div class="reviews-honeypot" aria-hidden="true"><label>Website<input name="website" type="text" autocomplete="off" tabindex={-1}/></label></div>
          <label class="reviews-consent"><input type="checkbox" name="consent" value="yes" required/><span>{t().consent}</span></label>
          <p class="reviews-fine-print">{t().privacyNote} <a href={privacy()}>{t().privacy}</a> · <a href={contact()}>{t().contact}</a></p>
          <Show when={open()}><AssistantCaptcha locale={props.locale} endpoint="/api/reviews/captcha" resetVersion={captchaReset()} onChange={(state,value='')=>{setCaptcha(state);setToken(value);}}/></Show>
          <Show when={error()}><p class="reviews-error" role="alert">{error()}</p></Show>
          <button type="submit" class="reviews-button" disabled={busy()||!['verified','disabled'].includes(captcha())}>{busy()?t().sending:t().send}<span aria-hidden="true">→</span></button>
        </fieldset>
      </form>
    </div>
  </div>;
}
