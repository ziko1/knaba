import {createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {reviewDate, reviewsCopy, type ManagedReview, type ReviewLocale} from '../data/reviews';
import '../styles/reviews.css';

export default function ReviewsModeration(props:{locale:ReviewLocale}) {
  const t=()=>reviewsCopy[props.locale];
  const [access,setAccess]=createSignal<'loading'|'owner'|'denied'|'error'>('loading');
  const [reviews,setReviews]=createSignal<ManagedReview[]>([]);
  const [loading,setLoading]=createSignal(false);
  const [busy,setBusy]=createSignal('');
  const [error,setError]=createSignal('');
  const [notice,setNotice]=createSignal('');
  const [filter,setFilter]=createSignal('all');
  const [offset,setOffset]=createSignal(0);
  const [total,setTotal]=createSignal(0);
  const [hasMore,setHasMore]=createSignal(false);
  const pageSize=50;
  let disposed=false;
  let controller:AbortController|undefined;
  const portal=()=>props.locale==='ru'?'/ru/konto/':'/konto/';

  async function load(checkAccess=false) {
    setLoading(true);setError('');
    controller?.abort();const active=new AbortController();controller=active;
    const timeout=window.setTimeout(()=>active.abort(),12_000);
    try {
      if(checkAccess){
        const session=await fetch('/api/portal/session',{credentials:'same-origin',cache:'no-store',signal:active.signal});
        if(!session.ok)throw Error('session');
        const data=await session.json() as {role?:string};
        if(data.role!=='owner'){if(!disposed)setAccess('denied');return;}
      }
      const response=await fetch('/api/reviews/manage?status='+filter()+'&offset='+offset(),{credentials:'same-origin',cache:'no-store',signal:active.signal});
      if(response.status===401||response.status===403){if(!disposed)setAccess('denied');return;}
      if(!response.ok)throw Error('unavailable');
      const data=await response.json() as {reviews?:ManagedReview[];total?:number;hasMore?:boolean};
      if(!Array.isArray(data.reviews)||typeof data.total!=='number')throw Error('response');
      if(!disposed){setReviews(data.reviews);setTotal(data.total);setHasMore(data.hasMore===true);setAccess('owner');}
    } catch {
      if(!disposed){setError(t().loadError);if(access()==='loading')setAccess('error');}
    } finally {window.clearTimeout(timeout);if(!disposed)setLoading(false);}
  }

  async function change(review:ManagedReview,status:'published'|'hidden') {
    if(busy())return;
    setBusy(review.id);setError('');setNotice('');
    try {
      const response=await fetch('/api/reviews/'+encodeURIComponent(review.id),{
        method:'PATCH',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12_000),
        headers:{'Content-Type':'application/json','X-KnaBa-Request':'portal-v1'},body:JSON.stringify({version:review.version,status}),
      });
      if(response.status===401||response.status===403){if(!disposed)setAccess('denied');return;}
      if(response.status===409){await load();if(!disposed)setError(t().versionConflict);return;}
      if(!response.ok)throw Error('unavailable');
      await load();if(!disposed)setNotice(t().updated);
    } catch {if(!disposed)setError(t().moderationError);}
    finally {if(!disposed)setBusy('');}
  }

  onMount(()=>void load(true));onCleanup(()=>{disposed=true;controller?.abort();});
  return <section class="reviews-moderation" aria-labelledby="reviews-moderation-title">
    <div class="reviews-moderation-heading"><h2 id="reviews-moderation-title">{t().moderation}</h2><Show when={access()==='owner'}><button type="button" class="reviews-link" disabled={loading()||!!busy()} onClick={()=>void load()}>{t().refresh}</button></Show></div>
    <Show when={access()==='loading'}><p role="status">{t().loading}</p></Show>
    <Show when={access()==='denied'}><p>{t().denied} <a class="reviews-link" href={portal()}>{t().portal}</a></p></Show>
    <Show when={error()}><p class="reviews-error" role="alert">{error()} <Show when={access()==='error'}><button type="button" class="reviews-link" onClick={()=>void load(true)}>{t().retry}</button></Show></p></Show>
    <Show when={notice()}><p class="reviews-success" role="status">{notice()}</p></Show>
    <Show when={access()==='owner'}>
      <p class="reviews-fine-print">{t().moderationIntro}</p>
      <label class="reviews-moderation-filter">{t().filter}<select value={filter()} disabled={loading()||!!busy()} onChange={event=>{setFilter(event.currentTarget.value);setOffset(0);setNotice('');void load();}}><option value="all">{t().all}</option><option value="pending">{t().pending}</option><option value="published">{t().published}</option><option value="hidden">{t().hidden}</option></select></label>
      <Show when={loading()}><p role="status">{t().loading}</p></Show>
      <Show when={!loading()&&!reviews().length}><p>{t().noPending}</p></Show>
      <div class="reviews-moderation-list"><For each={reviews()}>{review=><article class="reviews-moderation-card">
        <div class="reviews-moderation-meta"><span class={'reviews-badge reviews-badge-'+review.status}>{t()[review.status]}</span><time datetime={review.createdAt}>{reviewDate(review.createdAt,props.locale)}</time></div>
        <h3>{review.displayName}</h3><p class="reviews-fine-print">{review.company&&review.company+' · '}{review.relationship==='partner'?t().partner:t().client}</p>
        <blockquote>{review.text}</blockquote>
        <dl><div><dt>{t().privateEmail}</dt><dd>{review.email}</dd></div><div><dt>{t().consentAt}</dt><dd><time datetime={review.consentAt}>{reviewDate(review.consentAt,props.locale)}</time></dd></div></dl>
        <div class="reviews-moderation-actions"><Show when={review.status!=='published'}><button type="button" class="reviews-button" disabled={!!busy()||loading()} onClick={()=>void change(review,'published')}>{busy()===review.id?t().sending:t().publish}</button></Show><Show when={review.status!=='hidden'}><button type="button" class="reviews-link" disabled={!!busy()||loading()} onClick={()=>void change(review,'hidden')}>{t().hide}</button></Show></div>
      </article>}</For></div>
      <nav class="reviews-pagination" aria-label={t().moderation}><button type="button" class="reviews-link" disabled={offset()===0||loading()||!!busy()} onClick={()=>{setOffset(value=>Math.max(0,value-pageSize));void load();}}>{t().previous}</button><span>{reviews().length?offset()+1:0}–{reviews().length?offset()+reviews().length:0} / {total()} {t().entries}</span><button type="button" class="reviews-link" disabled={!hasMore()||loading()||!!busy()} onClick={()=>{setOffset(value=>value+pageSize);void load();}}>{t().next}</button></nav>
    </Show>
  </section>;
}
