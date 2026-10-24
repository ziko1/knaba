import { createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { normalizeStudioPage, validateStudioEntries, type StudioEntry, type StudioKind } from '../lib/site-studio-contract';
import '../styles/site-studio.css';

type Language='de'|'en'|'uk'|'ru';
type Revision={id:string;version:number;action:string;createdAt:string};
type PageResponse={page:string;version:number;draft:StudioEntry[];published:StudioEntry[];publishedVersion:number;history:Revision[];updatedAt:string};
type Selected={selector:string;tag:string;kind:StudioKind;value:string;href?:string;alt?:string};
type ApiError={error?:{message:string;code:string}};
const pages=[
  {path:'/',title:'Startseite DE'}, {path:'/ru/',title:'Главная RU'},
  {path:'/en/',title:'Home EN'}, {path:'/uk/',title:'Головна UK'},
  {path:'/leistungen/',title:'Leistungen'}, {path:'/ru/leistungen/',title:'Услуги'},
  {path:'/unternehmen/',title:'Unternehmen'}, {path:'/kontakt/',title:'Kontakt'},
  {path:'/karriere/',title:'Karriere'}, {path:'/ratgeber/',title:'Ratgeber'}
];
const copy={
  de:{studio:'Site Studio',owner:'Inhaber-Konsole',loading:'Zugang wird geprüft…',denied:'Nur der verifizierte Inhaber hat Zugriff. Bitte melden Sie sich im KnaBa Portal an.',portal:'Zum Portal',page:'Seite',open:'Öffnen',preview:'Live-Vorschau',edit:'Element anklicken',properties:'Eigenschaften',select:'Klicken Sie auf einen Text oder ein Bild in der Vorschau.',text:'Inhalt',kind:'Feld',save:'Entwurf speichern',publish:'Veröffentlichen',confirm:'Zum Veröffentlichen PUBLISH eingeben',unsaved:'Nicht gespeicherte Änderungen',published:'Öffentliche Version',draft:'Entwurf',versions:'Versionen',restore:'Als neuen Entwurf wiederherstellen',undo:'Rückgängig',redo:'Wiederholen',reset:'Feld zurücksetzen',seo:'SEO der Seite',title:'Seitentitel',description:'Meta-Beschreibung',ai:'AI-Textvorschlag',instruction:'Was soll verbessert werden?',suggest:'Vorschlag erzeugen',use:'Vorschlag übernehmen',aiNote:'Eine externe AI wird nur mit bestätigter Freigabe, Guthaben und Budget verwendet. Niemals automatisch veröffentlichen. Keine Kundendaten in Prompts.',empty:'Noch keine veröffentlichten Änderungen.',okDraft:'Entwurf gespeichert.',okPublish:'Version veröffentlicht.',okRestore:'Version als Entwurf wiederhergestellt.',mobile:'Mobil',desktop:'Desktop',color:'Textfarbe',status:'Status',nav:'Editor-Navigation',hint:'Nur die öffentliche Seite wird bearbeitet. Formulare, Preise, Rollen und Kundendaten bleiben geschützt.'},
  ru:{studio:'Редактор сайта',owner:'Панель владельца',loading:'Проверка доступа…',denied:'Доступ только владельцу. Войдите в портал KnaBa.',portal:'В портал',page:'Страница',open:'Открыть',preview:'Просмотр',edit:'Нажмите элемент',properties:'Свойства',select:'Выберите текст или изображение на странице.',text:'Содержимое',kind:'Поле',save:'Сохранить черновик',publish:'Опубликовать',confirm:'Для публикации введите PUBLISH',unsaved:'Изменения не сохранены',published:'Публичная версия',draft:'Черновик',versions:'История',restore:'Восстановить в черновик',undo:'Отменить',redo:'Повторить',reset:'Сбросить поле',seo:'SEO страницы',title:'Заголовок',description:'Мета-описание',ai:'AI-предложение',instruction:'Как изменить текст?',suggest:'Создать вариант',use:'Использовать',aiNote:'AI доступен только при подтвержденных ключе, квоте и бюджете. Публикация всегда вручную. Без данных клиентов.',empty:'Нет опубликованных правок.',okDraft:'Черновик сохранён.',okPublish:'Версия опубликована.',okRestore:'Версия восстановлена в черновик.',mobile:'Телефон',desktop:'ПК',color:'Цвет текста',status:'Статус',nav:'Навигация',hint:'Редактируется только публичный контент. Формы, цены, роли и персональные данные защищены.'},
  en:{studio:'Site Studio',owner:'Owner workspace',loading:'Checking access…',denied:'Verified owner only. Please sign in through the KnaBa portal.',portal:'Portal',page:'Page',open:'Open',preview:'Live preview',edit:'Select an element',properties:'Properties',select:'Click text or an image in the preview.',text:'Content',kind:'Field',save:'Save draft',publish:'Publish',confirm:'Type PUBLISH to confirm publication',unsaved:'Unsaved changes',published:'Published',draft:'Draft',versions:'History',restore:'Restore to draft',undo:'Undo',redo:'Redo',reset:'Reset field',seo:'Page SEO',title:'Page title',description:'Meta description',ai:'AI suggestion',instruction:'What should change?',suggest:'Generate suggestion',use:'Apply suggestion',aiNote:'External AI requires verified approval, credits and budget. Never autopublishes. Do not include customer data.',empty:'No published changes.',okDraft:'Draft saved.',okPublish:'Version published.',okRestore:'Revision restored to draft.',mobile:'Mobile',desktop:'Desktop',color:'Text color',status:'Status',nav:'Navigation',hint:'Public copy only. Forms, prices, roles and customer data are excluded.'},
  uk:{studio:'Редактор сайту',owner:'Панель власника',loading:'Перевірка доступу…',denied:'Доступ лише підтвердженому власнику. Увійдіть через портал KNABA.',portal:'До порталу',page:'Сторінка',open:'Відкрити',preview:'Попередній перегляд',edit:'Оберіть елемент',properties:'Властивості',select:'Натисніть на текст або зображення в перегляді.',text:'Вміст',kind:'Поле',save:'Зберегти чернетку',publish:'Опублікувати',confirm:'Для публікації введіть PUBLISH',unsaved:'Є незбережені зміни',published:'Опубліковано',draft:'Чернетка',versions:'Історія',restore:'Відновити як чернетку',undo:'Скасувати',redo:'Повторити',reset:'Скинути поле',seo:'SEO сторінки',title:'Назва сторінки',description:'Метаопис',ai:'AI-підказка',instruction:'Що змінити?',suggest:'Запропонувати текст',use:'Застосувати',aiNote:'Зовнішній AI потребує підтверджених ключа, квоти й бюджету. Публікація вручну. Без даних клієнтів.',empty:'Публічних змін поки немає.',okDraft:'Чернетку збережено.',okPublish:'Опубліковано.',okRestore:'Версію відновлено в чернетку.',mobile:'Телефон',desktop:'ПК',color:'Колір тексту',status:'Стан',nav:'Навігація',hint:'Лише публічний текст. Форми, ціни, ролі та дані клієнтів захищені.'}
};
async function requestJson<T>(path:string,body?:Record<string,unknown>):Promise<T>{
  const response=await fetch(path,{
    method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
    headers:body?{'Content-Type':'application/json','X-Knaba-Request':'portal-v1','Accept':'application/json'}:{'Accept':'application/json'},
    body:body?JSON.stringify(body):undefined
  });
  const payload=await response.json().catch(()=>({})) as T & ApiError;
  if(!response.ok)throw new Error(payload.error?.message||'HTTP '+response.status);
  return payload;
}
export default function SiteStudio(){
  const [language,setLanguage]=createSignal<Language>('de');
  const t=()=>copy[language()];
  const [authorized,setAuthorized]=createSignal(false);
  const [checking,setChecking]=createSignal(true);
  const [page,setPage]=createSignal('/');
  const [pathInput,setPathInput]=createSignal('/');
  const [mobile,setMobile]=createSignal(false);
  const [draft,setDraft]=createSignal<StudioEntry[]>([]);
  const [saved,setSaved]=createSignal<StudioEntry[]>([]);
  const [version,setVersion]=createSignal(0);
  const [publishedVersion,setPublishedVersion]=createSignal(0);
  const [history,setHistory]=createSignal<Revision[]>([]);
  const [selected,setSelected]=createSignal<Selected|null>(null);
  const [kind,setKind]=createSignal<StudioKind>('text');
  const [notice,setNotice]=createSignal('');
  const [error,setError]=createSignal('');
  const [busy,setBusy]=createSignal(false);
  const [publishCheck,setPublishCheck]=createSignal('');
  const [instruction,setInstruction]=createSignal('');
  const [suggestion,setSuggestion]=createSignal('');
  const [undo,setUndo]=createSignal<StudioEntry[][]>([]);
  const [redo,setRedo]=createSignal<StudioEntry[][]>([]);
  let frame:HTMLIFrameElement|undefined;
  const changed=()=>JSON.stringify(draft())!==JSON.stringify(saved());
  const valueFor=(selector:string,field:StudioKind,fallback='')=>draft().find(e=>e.selector===selector&&e.kind===field)?.value??fallback;
  function transmit(entries:StudioEntry[]=draft()){
    frame?.contentWindow?.postMessage({type:'knaba:studio:apply',page:page(),entries},location.origin);
  }
  function applyLocal(next:StudioEntry[],remember=true){
    try {const validated=validateStudioEntries(next);
      if(remember){setUndo(prev=>[...prev.slice(-24),draft()]);setRedo([]);}
      setDraft(validated);transmit(validated);setError('');setSuggestion('');
    } catch(problem){setError(problem instanceof Error?problem.message:String(problem));}
  }
  function updateField(selector:string,field:StudioKind,value:string){
    const next=draft().filter(e=>!(e.selector===selector&&e.kind===field));
    next.push({selector,kind:field,value});
    applyLocal(next);
  }
  function removeField(selector:string,field:StudioKind){
    applyLocal(draft().filter(e=>!(e.selector===selector&&e.kind===field)));
  }
  function undoEdit(){
    const stack=undo();if(!stack.length)return;
    setRedo(prev=>[...prev,draft()]);const previous=stack[stack.length-1];setUndo(stack.slice(0,-1));applyLocal(previous,false);
  }
  function redoEdit(){
    const stack=redo();if(!stack.length)return;
    setUndo(prev=>[...prev,draft()]);const next=stack[stack.length-1];setRedo(stack.slice(0,-1));applyLocal(next,false);
  }
  async function load(path:string){
    let normalized:string;
    try{normalized=normalizeStudioPage(path);}catch(problem){setError(String(problem));return;}
    setBusy(true);setError('');setNotice('');
    try{
      const result=await requestJson<PageResponse>('/api/studio/page?page='+encodeURIComponent(normalized));
      setPage(normalized);setPathInput(normalized);setVersion(result.version);setPublishedVersion(result.publishedVersion);
      setDraft(result.draft);setSaved(result.draft);setHistory(result.history);setSelected(null);
      setUndo([]);setRedo([]);setPublishCheck('');setSuggestion('');
    }catch(problem){setError(problem instanceof Error?problem.message:String(problem));}
    finally{setBusy(false);}
  }
  async function save(){
    if(busy()||!changed())return;
    setBusy(true);setError('');setNotice('');
    try{
      const valid=validateStudioEntries(draft());
      const result=await requestJson<{version:number}>('/api/studio/draft',{page:page(),version:version(),entries:valid});
      setVersion(result.version);setSaved(valid);setNotice(t().okDraft);
      const refresh=await requestJson<PageResponse>('/api/studio/page?page='+encodeURIComponent(page()));
      setHistory(refresh.history);
    }catch(problem){setError(problem instanceof Error?problem.message:String(problem));}
    finally{setBusy(false);}
  }
  async function publish(){
    if(busy()||changed()||publishCheck()!=='PUBLISH'||version()===0)return;
    setBusy(true);setError('');setNotice('');
    try{
      await requestJson('/api/studio/publish',{page:page(),version:version(),confirm:'PUBLISH'});
      setPublishedVersion(version());setPublishCheck('');setNotice(t().okPublish);
      const refresh=await requestJson<PageResponse>('/api/studio/page?page='+encodeURIComponent(page()));
      setHistory(refresh.history);
    }catch(problem){setError(problem instanceof Error?problem.message:String(problem));}
    finally{setBusy(false);}
  }
  async function restore(id:string){
    if(busy()||changed()){setError(t().unsaved);return;}
    setBusy(true);setError('');setNotice('');
    try{
      await requestJson('/api/studio/restore',{page:page(),version:version(),revisionId:id});
      await load(page());setNotice(t().okRestore);
    }catch(problem){setError(problem instanceof Error?problem.message:String(problem));}
    finally{setBusy(false);}
  }
  async function askAi(){
    const entry=selected();if(!entry||kind()!=='text'||busy())return;
    setBusy(true);setError('');setSuggestion('');
    try{
      const result=await requestJson<{suggestion:string}>('/api/studio/assist',{
        selector:entry.selector,text:valueFor(entry.selector,'text',entry.value),
        instruction:instruction(),locale:language()
      });
      setSuggestion(result.suggestion);
    }catch(problem){setError(problem instanceof Error?problem.message:String(problem));}
    finally{setBusy(false);}
  }
  function onFrameMessage(event:MessageEvent){
    if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
    const data=event.data as {type?:string;page?:string;selector?:string;kind?:StudioKind;tag?:string;value?:string;href?:string;alt?:string};
    if(!data||data.page!==page())return;
    if(data.type==='knaba:studio:ready') {transmit();return;}
    if(data.type!=='knaba:studio:select'||!data.selector||!data.kind||!data.tag)return;
    const candidate={selector:data.selector,kind:data.kind,value:data.value||''};
    try{validateStudioEntries([candidate]);}
    catch{return;}
    setSelected({selector:data.selector,kind:data.kind,tag:data.tag,value:data.value||'',href:data.href,alt:data.alt});
    setKind(data.kind);setSuggestion('');setInstruction('');
  }
  onMount(()=>{
    const preferred=navigator.language.slice(0,2) as Language;
    if(preferred in copy)setLanguage(preferred);
    window.addEventListener('message',onFrameMessage);
    void requestJson<{role:string}>('/api/portal/session').then(async result=>{
      if(result.role==='owner'){setAuthorized(true);await load('/');}
    }).catch(problem=>setError(problem instanceof Error?problem.message:String(problem))).finally(()=>setChecking(false));
  });
  onCleanup(()=>{ if(typeof window !== 'undefined') window.removeEventListener('message',onFrameMessage); });
  const selectedFallback=()=>{const item=selected();if(!item)return '';return kind()==='href'?item.href||'':kind()==='alt'?item.alt||'':item.value;};
  const selectedValue=()=>{const item=selected();return item?valueFor(item.selector,kind(),selectedFallback()):'';};
  const kindsFor=()=>selected()?.tag==='img'?['src','alt'] as StudioKind[]:selected()?.tag==='a'?['text','href','color'] as StudioKind[]:['text','color'] as StudioKind[];

  return <div class="knaba-studio" lang={language()}>
    <header class="studio-top">
      <div class="studio-brand"><span class="studio-mark" aria-hidden="true">✳</span><div><strong>KNABA</strong><span>{t().studio} · {t().owner}</span></div></div>
      <div class="studio-top-actions"><label class="studio-small-label" for="studio-language">Language</label><select id="studio-language" value={language()} onChange={event=>setLanguage(event.currentTarget.value as Language)}><option value="de">DE</option><option value="ru">RU</option><option value="en">EN</option><option value="uk">UK</option></select><a href="/crm/">CRM ↗</a><a href="/postfach/">✉</a><a href="/konto/">{t().portal} ↗</a></div>
    </header>
    <Show when={checking()}><div class="studio-gate" role="status">{t().loading}</div></Show>
    <Show when={!checking()&&!authorized()}><div class="studio-gate" role="alert"><h2>{t().denied}</h2><a class="button button-dark" href="/konto/">{t().portal} ↗</a></div></Show>
    <Show when={!checking()&&authorized()}>
      <div class="studio-toolbar" aria-label={t().nav}>
        <label>{t().page}<select value={pages.find(p=>p.path===pathInput())?.path||'custom'} onChange={event=>{if(event.currentTarget.value!=='custom')setPathInput(event.currentTarget.value);}}><For each={pages}>{option=><option value={option.path}>{option.title}</option>}</For><option value="custom">Eigener Pfad</option></select></label>
        <label class="studio-path-label"><span class="sr-only">Pfad</span><input aria-label="Pfad" value={pathInput()} onInput={event=>setPathInput(event.currentTarget.value)} spellcheck={false} /></label>
        <button type="button" class="studio-btn" disabled={busy()} onClick={()=>void load(pathInput())}>{t().open}</button>
        <span class="studio-spacer" />
        <div class="studio-viewport"><button type="button" classList={{active:!mobile()}} onClick={()=>setMobile(false)} title={t().desktop}>▣</button><button type="button" classList={{active:mobile()}} onClick={()=>setMobile(true)} title={t().mobile}>▯</button></div>
        <button type="button" class="studio-btn" disabled={!undo().length||busy()} onClick={undoEdit} aria-label={t().undo}>↶</button>
        <button type="button" class="studio-btn" disabled={!redo().length||busy()} onClick={redoEdit} aria-label={t().redo}>↷</button>
        <span class="studio-version">{t().draft} #{version()} · {t().published} #{publishedVersion()}</span>
      </div>
      <Show when={error()}><p class="studio-message studio-error" role="alert">{error()}</p></Show>
      <Show when={notice()}><p class="studio-message studio-success" role="status">{notice()}</p></Show>
      <Show when={changed()}><p class="studio-message" role="status">● {t().unsaved}</p></Show>
      <div class="studio-workspace">
        <section class="studio-canvas" aria-label={t().preview}>
          <div class="studio-canvas-head"><span><span class="studio-dot" /> {t().preview}</span><span>{page()}</span></div>
          <div classList={{'studio-preview-wrap':true,'is-mobile':mobile()}}>
            <iframe ref={frame} title={t().preview} src={page()+'?knaba_studio_preview=1'} onLoad={()=>transmit()} loading="eager" referrerpolicy="same-origin" />
          </div>
        </section>
        <aside class="studio-inspector" aria-label={t().properties}>
          <div class="studio-section">
            <p class="studio-kicker">01 / {t().edit}</p><h2>{t().properties}</h2>
            <Show when={selected()} fallback={<p class="studio-muted">{t().select}</p>}>
              {item=><>
                <p class="studio-code" title={item().selector}>{item().selector}</p>
                <label>{t().kind}<select value={kind()} onChange={event=>{setKind(event.currentTarget.value as StudioKind);setSuggestion('');}}><For each={kindsFor()}>{option=><option value={option}>{option}</option>}</For></select></label>
                <label>{t().text}
                  <Show when={kind()==='text'||kind()==='alt'} fallback={<input value={selectedValue()} onInput={event=>updateField(item().selector,kind(),event.currentTarget.value)} spellcheck={false}/>}>
                    <textarea rows={4} value={selectedValue()} maxLength={700} onInput={event=>updateField(item().selector,kind(),event.currentTarget.value)} />
                  </Show>
                </label>
                <Show when={kind()==='src'}><p class="studio-muted">/images/*.svg, .png, .jpg, .webp, .avif</p></Show>
                <Show when={kind()==='color'}><input aria-label={t().color} type="color" value={selectedValue().match(/^#[a-fA-F0-9]{6}$/)?selectedValue():'#203c36'} onInput={event=>updateField(item().selector,'color',event.currentTarget.value)}/></Show>
                <button type="button" class="studio-minor" onClick={()=>removeField(item().selector,kind())}>{t().reset}</button>
              </>}
            </Show>
          </div>
          <div class="studio-section">
            <p class="studio-kicker">02 / SEO</p><h2>{t().seo}</h2>
            <label>{t().title}<input maxLength={100} value={valueFor('@title','text')} placeholder="KnaBa Berlin" onInput={event=>updateField('@title','text',event.currentTarget.value)}/></label>
            <label>{t().description}<textarea rows={3} maxLength={250} value={valueFor('@description','text')} onInput={event=>updateField('@description','text',event.currentTarget.value)}/></label>
          </div>
          <div class="studio-section">
            <p class="studio-kicker">03 / AI</p><h2>{t().ai}</h2>
            <p class="studio-muted">{t().aiNote}</p>
            <label>{t().instruction}<textarea rows={3} maxLength={800} value={instruction()} placeholder="Kürzer, präziser, freundlich…" onInput={event=>setInstruction(event.currentTarget.value)}/></label>
            <button type="button" class="studio-btn" disabled={busy()||!selected()||kind()!=='text'||instruction().trim().length<3} onClick={()=>void askAi()}>{t().suggest}</button>
            <Show when={suggestion()}><div class="studio-suggestion"><p>{suggestion()}</p><button type="button" class="studio-btn" onClick={()=>{const el=selected();if(el)updateField(el.selector,'text',suggestion());setSuggestion('');}}>{t().use}</button></div></Show>
          </div>
          <div class="studio-section">
            <p class="studio-kicker">04 / {t().versions}</p><h2>{t().versions}</h2>
            <Show when={history().length} fallback={<p class="studio-muted">{t().empty}</p>}>
              <ol class="studio-history"><For each={history()}>{entry=><li><span>#{entry.version} · {entry.action}<small>{new Date(entry.createdAt).toLocaleString(language())}</small></span><button type="button" class="studio-minor" disabled={busy()||changed()} onClick={()=>void restore(entry.id)} aria-label={t().restore}>↺</button></li>}</For></ol>
            </Show>
          </div>
          <div class="studio-publish">
            <button type="button" class="studio-save" disabled={busy()||!changed()} onClick={()=>void save()}>{t().save}</button>
            <label>{t().confirm}<input value={publishCheck()} onInput={event=>setPublishCheck(event.currentTarget.value)} placeholder="PUBLISH" autocomplete="off" spellcheck={false}/></label>
            <button type="button" class="studio-publish-button" disabled={busy()||changed()||!version()||publishedVersion()===version()||publishCheck()!=='PUBLISH'} onClick={()=>void publish()}>{t().publish} ↗</button>
            <p>{t().hint}</p>
          </div>
        </aside>
      </div>
    </Show>
  </div>;
}
