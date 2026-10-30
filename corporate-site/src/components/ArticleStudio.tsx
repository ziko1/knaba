import {createSignal,createEffect,For,Show,onMount,onCleanup} from 'solid-js';
import {parseArticlePath,validateArticleContent,type ArticleContent} from '../lib/article-contract';
import '../styles/article-studio.css';

type Locale='de'|'en'|'uk'|'ru';
type Revision={id:string;version:number;action:string;createdAt:string};
type ArticleItem={path:string;version:number;publishedVersion:number;updatedAt:string};
type ArticlePage={page:string;version:number;publishedVersion:number;draft:ArticleContent;published:ArticleContent|null;history:Revision[]};
const blank=():ArticleContent=>({title:'',description:'',body:''});
const dictionary={
  de:{heading:'Wissensseiten erstellen',intro:'Eigene öffentlich auffindbare Ratgeber-Seiten mit überprüfter Freigabe, Titel, Beschreibung und Sitemap. Keine automatische Veröffentlichung.',slug:'URL-Slug',language:'Sprache',new:'Neue Seite öffnen',existing:'Entwürfe und veröffentlichte Seiten',empty:'Noch keine Wissensseiten angelegt.',title:'SEO-Titel',description:'Meta-Beschreibung',body:'Inhalt als Klartext (Absätze durch Leerzeile trennen, ## für Unterüberschriften)',save:'Entwurf speichern',publish:'Veröffentlichen',confirm:'PUBLISH zur Bestätigung eingeben',restore:'Als Entwurf wiederherstellen',preview:'Vorschau des Entwurfs',status:'Status',draft:'Entwurf',live:'Öffentlich',open:'Öffnen',notPublished:'Noch nicht öffentlich',hint:'Die Seite erscheint erst nach ausdrücklicher Freigabe im HTML, Ratgeber und in der Sitemap. Keine automatische Übersetzung oder Suchmaschinen-Garantie.',saved:'Entwurf gespeichert.',published:'Version veröffentlicht.',restored:'Version als Entwurf wiederhergestellt.',validate:'Für eine Veröffentlichung sind Titel (10+), Beschreibung (50+) und Inhalt (180+) erforderlich.',emptySlug:'Bitte einen gültigen URL-Namen mit 3–64 Zeichen (a–z, 0–9, Bindestrich) eingeben.'},
  en:{heading:'Create knowledge pages',intro:'Publish real guide pages with reviewed SEO title, description and sitemap. Never auto-published.',slug:'URL slug',language:'Language',new:'Open new page',existing:'Drafts and published pages',empty:'No knowledge pages yet.',title:'SEO title',description:'Meta description',body:'Plain-text article (blank lines for paragraphs; ## for subheadings)',save:'Save draft',publish:'Publish',confirm:'Type PUBLISH to confirm',restore:'Restore as draft',preview:'Draft preview',status:'Status',draft:'Draft',live:'Public',open:'Open',notPublished:'Not published',hint:'Only published content appears in server HTML, guide links and sitemap. No automatic translation or ranking promises.',saved:'Draft saved.',published:'Published version saved.',restored:'Version restored to draft.',validate:'Publishing requires a title (10+), description (50+) and body (180+).',emptySlug:'Enter a valid 3–64-character slug (a–z, 0–9, hyphens).'},
  uk:{heading:'Створення інформаційних сторінок',intro:'Публічні статті з перевіреними SEO-назвою, описом і sitemap. Без автоматичної публікації.',slug:'Назва URL',language:'Мова',new:'Відкрити нову сторінку',existing:'Чернетки та опубліковані',empty:'Статей поки немає.',title:'SEO-назва',description:'Метаопис',body:'Текст статті (порожній рядок — абзац; ## — підзаголовок)',save:'Зберегти чернетку',publish:'Опублікувати',confirm:'Для публікації введіть PUBLISH',restore:'Відновити як чернетку',preview:'Перегляд чернетки',status:'Стан',draft:'Чернетка',live:'Публічна',open:'Відкрити',notPublished:'Не опубліковано',hint:'Лише затверджений матеріал з’являється в HTML, порадах і sitemap. Автоперекладу та гарантій позицій немає.',saved:'Чернетку збережено.',published:'Версію опубліковано.',restored:'Версію відновлено як чернетку.',validate:'Потрібні назва (10+), опис (50+) і текст (180+).',emptySlug:'Введіть URL-назву 3–64 символи (a–z, 0–9, дефіс).'},
  ru:{heading:'Создание информационных страниц',intro:'Публичные статьи с проверенными SEO-заголовком, описанием и sitemap. Без автопубликации.',slug:'Имя URL',language:'Язык',new:'Открыть новую страницу',existing:'Черновики и опубликованные',empty:'Статей ещё нет.',title:'SEO-заголовок',description:'Метаописание',body:'Текст статьи (пустая строка — абзац; ## — подзаголовок)',save:'Сохранить черновик',publish:'Опубликовать',confirm:'Для публикации введите PUBLISH',restore:'Восстановить как черновик',preview:'Предпросмотр черновика',status:'Статус',draft:'Черновик',live:'Публичная',open:'Открыть',notPublished:'Не опубликовано',hint:'Только одобренный материал появляется в HTML, статьях и sitemap. Без автоперевода и гарантий позиции.',saved:'Черновик сохранён.',published:'Версия опубликована.',restored:'Версия восстановлена в черновик.',validate:'Нужны заголовок (10+), описание (50+) и текст (180+).',emptySlug:'Введите имя URL на 3–64 символа (a–z, 0–9, дефис).'}
} as const;
async function api<T>(path:string,body?:Record<string,unknown>):Promise<T>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const res=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
      headers:body?{'Content-Type':'application/json','X-Knaba-Request':'portal-v1','Accept':'application/json'}:{Accept:'application/json'},
      body:body?JSON.stringify(body):undefined,signal:controller.signal
    });
    const value=await res.json().catch(()=>({})) as T&{error?:{message?:string}};
    if(!res.ok)throw new Error(value.error?.message||'HTTP '+res.status);
    return value;
  } finally {clearTimeout(timer);}
}
export default function ArticleStudio(props:{language:Locale;onDirtyChange?:(dirty:boolean)=>void}){
  const t=()=>dictionary[props.language];
  const [items,setItems]=createSignal<ArticleItem[]>([]);
  const [slug,setSlug]=createSignal('');
  const [locale,setLocale]=createSignal<Locale>(props.language);
  const [page,setPage]=createSignal('');
  const [draft,setDraft]=createSignal<ArticleContent>(blank());
  const [saved,setSaved]=createSignal<ArticleContent>(blank());
  const [version,setVersion]=createSignal(0);
  const [publishedVersion,setPublishedVersion]=createSignal(0);
  const [history,setHistory]=createSignal<Revision[]>([]);
  const [confirm,setConfirm]=createSignal('');
  const [unpublishCheck,setUnpublishCheck]=createSignal('');
  const [busy,setBusy]=createSignal(false);
  const [error,setError]=createSignal('');
  const [notice,setNotice]=createSignal('');
  const [loading,setLoading]=createSignal(false);
  let disposed=false,refreshVersion=0;
  const changed=()=>JSON.stringify(draft())!==JSON.stringify(saved());
  createEffect(()=>props.onDirtyChange?.(changed()));
  onCleanup(()=>{disposed=true;refreshVersion++;props.onDirtyChange?.(false);});
  const canPublish=()=>{
    try{validateArticleContent(draft(),true);return true;}catch{return false;}
  };
  const localized=()=>props.language==='de'?['de','en','uk','ru']:['de','en','uk','ru'];
  async function refresh(){
    const requestVersion=++refreshVersion;
    const result=await api<{items:ArticleItem[]}>('/api/studio/articles');
    if(!disposed&&requestVersion===refreshVersion)setItems(result.items);
  }
  async function refreshHistory(path:string){
    const result=await api<ArticlePage>('/api/studio/article?page='+encodeURIComponent(path));
    if(!disposed&&page()===path)setHistory(result.history);
  }
  async function open(path:string){
    if(disposed||busy()||loading()||changed()){if(changed())setError(({de:'Ungespeicherte Änderungen zuerst speichern.',en:'Save your unsaved changes first.',uk:'Спочатку збережіть зміни.',ru:'Сначала сохраните изменения.'} as const)[props.language]);return;}
    setLoading(true);setError('');setNotice('');
    try{
      const res=await api<ArticlePage>('/api/studio/article?page='+encodeURIComponent(path));
      if(disposed)return;
      setPage(res.page);setDraft(res.draft);setSaved(res.draft);
      setVersion(res.version);setPublishedVersion(res.publishedVersion);setHistory(res.history);
      setConfirm('');setUnpublishCheck('');
    }catch(problem){if(!disposed)setError(problem instanceof Error?problem.message:String(problem));}
    finally{if(!disposed)setLoading(false);}
  }
  async function begin(){
    const path=(locale()==='de'?'/':'/'+locale()+'/')+'wissen/'+slug().trim().toLowerCase()+'/';
    if(!parseArticlePath(path)){setError(t().emptySlug);return;}
    await open(path);
  }
  async function save(){
    if(disposed||!page()||busy()||loading()||!changed())return;
    const target=page(),submitted=draft(),expectedVersion=version();
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api<{version:number}>('/api/studio/article/draft',{page:target,version:expectedVersion,content:submitted});
      if(disposed||page()!==target)return;
      setVersion(result.version);setSaved(submitted);setNotice(t().saved);
      await Promise.all([refresh(),refreshHistory(target)]);
    }catch(problem){if(!disposed)setError(problem instanceof Error?problem.message:String(problem));}
    finally{if(!disposed)setBusy(false);}
  }
  async function publish(){
    if(disposed||!page()||busy()||loading()||changed()||!canPublish()||confirm()!=='PUBLISH'||version()===0)return;
    const target=page(),expectedVersion=version();
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api<{version:number}>('/api/studio/article/publish',{page:target,version:expectedVersion,confirm:'PUBLISH'});
      if(disposed||page()!==target)return;
      setPublishedVersion(result.version);setConfirm('');setNotice(t().published);
      await Promise.all([refresh(),refreshHistory(target)]);
    }catch(problem){if(!disposed)setError(problem instanceof Error?problem.message:String(problem));}
    finally{if(!disposed)setBusy(false);}
  }
  async function unpublish(){
    if(disposed||!page()||busy()||loading()||changed()||!publishedVersion()||unpublishCheck()!=='UNPUBLISH')return;
    const target=page(),expectedVersion=version();
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api<{published:boolean}>('/api/studio/article/unpublish',{page:target,version:expectedVersion,confirm:'UNPUBLISH'});
      if(disposed||page()!==target)return;
      if(result.published!==false)throw new Error('Publication state was not confirmed');
      setPublishedVersion(0);setUnpublishCheck('');
      setNotice(({de:'Der Artikel ist nicht mehr öffentlich.',en:'Article unpublished.',uk:'Статтю знято з публікації.',ru:'Статья снята с публикации.'} as const)[props.language]);
      await Promise.all([refresh(),refreshHistory(target)]);
    }catch(problem){if(!disposed)setError(problem instanceof Error?problem.message:String(problem));}
    finally{if(!disposed)setBusy(false);}
  }
  async function restore(id:string){
    if(disposed||!page()||busy()||loading()||changed())return;
    const target=page(),expectedVersion=version();
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api<{version:number}>('/api/studio/article/restore',{page:target,version:expectedVersion,revisionId:id});
      if(disposed||page()!==target)return;
      const updated=await api<ArticlePage>('/api/studio/article?page='+encodeURIComponent(target));
      if(disposed||page()!==target)return;
      setVersion(result.version);setDraft(updated.draft);setSaved(updated.draft);setHistory(updated.history);
      setNotice(t().restored);await refresh();
    }catch(problem){if(!disposed)setError(problem instanceof Error?problem.message:String(problem));}
    finally{if(!disposed)setBusy(false);}
  }
  onMount(()=>{
    const protectDraft=(event:BeforeUnloadEvent)=>{if(changed()){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',protectDraft);
    onCleanup(()=>window.removeEventListener('beforeunload',protectDraft));
    void refresh().catch(problem=>{if(!disposed)setError(problem instanceof Error?problem.message:String(problem));});
  });
  return <section class="studio-article-panel" aria-label={t().heading}>
    <details>
      <summary><span class="studio-article-icon" aria-hidden="true">▤</span><span><strong>{t().heading}</strong><small>{t().intro}</small></span><span aria-hidden="true">⌄</span></summary>
      <div class="studio-article-content">
        <div class="studio-article-controls">
          <label>{t().language}<select disabled={busy()||loading()} value={locale()} onChange={e=>setLocale(e.currentTarget.value as Locale)}>
            <For each={localized()}>{l=><option value={l}>{l.toUpperCase()}</option>}</For>
          </select></label>
          <label>{t().slug}<input disabled={busy()||loading()} type="text" spellcheck={false} autocapitalize="off" autocomplete="off" maxLength={64}
            placeholder="baureinigung-planung" value={slug()} onInput={e=>setSlug(e.currentTarget.value)}/></label>
          <button type="button" class="studio-btn" onClick={()=>void begin()} disabled={busy()||loading()}>{t().new}</button>
          <label>{t().existing}<select disabled={busy()||loading()||changed()} onChange={e=>{if(e.currentTarget.value)void open(e.currentTarget.value);}}>
            <option value="">{t().empty}</option><For each={items()}>{item=><option value={item.path}>{item.path}{item.publishedVersion?' ✓':' ·'}</option>}</For>
          </select></label>
        </div>
        <Show when={error()}><p class="studio-message studio-error" role="alert">{error()}</p></Show>
        <Show when={notice()}><p class="studio-message studio-success" role="status">{notice()}</p></Show>
        <Show when={page()}>
          <p class="studio-article-path"><strong>{t().status}:</strong> {page()} · {t().draft} #{version()} · {t().live} #{publishedVersion()}</p>
          <div class="studio-article-grid">
            <div class="studio-article-form">
              <label>{t().title}<input disabled={busy()||loading()} maxLength={100} value={draft().title} onInput={e=>setDraft(d=>({...d,title:e.currentTarget.value}))}/></label>
              <label>{t().description}<textarea disabled={busy()||loading()} rows={3} maxLength={250} value={draft().description} onInput={e=>setDraft(d=>({...d,description:e.currentTarget.value}))}/></label>
              <label>{t().body}<textarea disabled={busy()||loading()} rows={11} maxLength={6000} value={draft().body} onInput={e=>setDraft(d=>({...d,body:e.currentTarget.value}))}/></label>
              <p class="studio-article-count">{draft().title.length}/100 · {draft().description.length}/250 · {draft().body.length}/6000</p>
              <div class="studio-article-actions">
                <button type="button" class="studio-btn" disabled={busy()||loading()||!changed()} onClick={()=>void save()}>{t().save}</button>
                <label>{t().confirm}<input type="text" autocomplete="off" spellcheck={false} value={confirm()} onInput={e=>setConfirm(e.currentTarget.value)} placeholder="PUBLISH"/></label>
                <button type="button" class="studio-publish-button" disabled={busy()||loading()||changed()||!canPublish()||confirm()!=='PUBLISH'||version()===0||publishedVersion()===version()}
                  onClick={()=>void publish()}>{t().publish}</button>
              </div>
              <Show when={publishedVersion()>0}>
                <div class="studio-article-unpublish">
                  <p>{({de:'Öffentliche Seite zurückziehen, ohne Entwurf oder Verlauf zu löschen.',en:'Take this page offline while retaining draft and history.',uk:'Зняти публікацію, зберігши чернетку та історію.',ru:'Снять публикацию, сохранив черновик и историю.'} as const)[props.language]}</p>
                  <label>{({de:'UNPUBLISH zur Bestätigung',en:'Type UNPUBLISH to confirm',uk:'Введіть UNPUBLISH для підтвердження',ru:'Введите UNPUBLISH для подтверждения'} as const)[props.language]}
                    <input autocomplete="off" spellcheck={false} value={unpublishCheck()}
                      placeholder="UNPUBLISH" onInput={e=>setUnpublishCheck(e.currentTarget.value)} />
                  </label>
                  <button type="button" disabled={busy()||loading()||changed()||unpublishCheck()!=='UNPUBLISH'}
                    onClick={()=>void unpublish()}>{({de:'Veröffentlichung zurückziehen',en:'Unpublish article',uk:'Зняти з публікації',ru:'Снять с публикации'} as const)[props.language]}</button>
                </div>
              </Show>
              <Show when={!canPublish()}><p class="studio-muted">{t().validate}</p></Show>
              <p class="studio-muted">{t().hint}</p>
            </div>
            <aside class="studio-article-preview" aria-label={t().preview}>
              <span class="studio-kicker">{t().preview}</span>
              <h3>{draft().title||'KnaBa'}</h3>
              <p>{draft().description}</p>
              <div class="studio-article-preview-body">{draft().body}</div>
              <Show when={publishedVersion()>0}><a href={page()}>{t().open} · {page()}</a></Show>
              <Show when={publishedVersion()===0}><small>{t().notPublished}</small></Show>
            </aside>
          </div>
          <Show when={history().length>0}>
            <div class="studio-article-history"><strong>{t().draft} / {t().live}</strong>
              <ul><For each={history()}>{entry=><li><span>#{entry.version} · {entry.action}</span>
                <button type="button" disabled={busy()||changed()} onClick={()=>void restore(entry.id)}>{t().restore}</button>
              </li>}</For></ul>
            </div>
          </Show>
        </Show>
      </div>
    </details>
  </section>;
}
