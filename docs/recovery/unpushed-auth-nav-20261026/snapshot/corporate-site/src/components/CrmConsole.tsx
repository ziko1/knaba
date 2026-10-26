import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import '../styles/crm.css';

type Stage='new'|'contacted'|'qualified'|'proposal'|'won'|'lost';
type Contact={
  id:string;email:string;name:string;phone:string;lastAt:string;
  lastRequestId:string;latestService:string;latestRequestStatus:string;
  requestCount:number;stage:Stage;tags:string[];version:number;
};
type Note={id:string;body:string;createdAt:string;actorId:string};
type ListResponse={contacts:Contact[];limited:boolean};
type NoteResponse={notes:Note[];limited:boolean};
const stages: {value:Stage;label:string}[]=[
  {value:'new',label:'Neu'},{value:'contacted',label:'Kontaktiert'},
  {value:'qualified',label:'Qualifiziert'},{value:'proposal',label:'Angebot'},
  {value:'won',label:'Gewonnen'},{value:'lost',label:'Verloren'}
];
type ApiError={error?:{message?:string;code?:string}};
async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const res=await fetch(path,{method,cache:'no-store',credentials:'same-origin',
      headers:body===undefined?{'Accept':'application/json'}:
        {'Accept':'application/json','Content-Type':'application/json','X-KnaBa-Request':'portal-v1'},
      body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    if(!res.ok){
      const err=await res.json().catch(()=>({})) as ApiError;
      throw new Error(err.error?.message || 'Anfrage fehlgeschlagen (HTTP '+res.status+').');
    }
    return await res.json() as T;
  }finally{clearTimeout(timer);}
}
function formatted(date:string):string {
  const parsed=new Date(date);
  return Number.isFinite(parsed.valueOf())?parsed.toLocaleString('de-DE'):'—';
}
export default function CrmConsole() {
  const [contacts,setContacts]=createSignal<Contact[]>([]);
  const [limited,setLimited]=createSignal(false);
  const [search,setSearch]=createSignal('');
  const [loading,setLoading]=createSignal(true);
  const [busy,setBusy]=createSignal(false);
  const [error,setError]=createSignal('');
  const [notice,setNotice]=createSignal('');
  const [selected,setSelected]=createSignal<Contact|null>(null);
  const [stage,setStage]=createSignal<Stage>('new');
  const [tagText,setTagText]=createSignal('');
  const [notes,setNotes]=createSignal<Note[]>([]);
  const [notesLoading,setNotesLoading]=createSignal(false);
  const [noteBody,setNoteBody]=createSignal('');
  let pendingNoteKey:string|null=null;
  let readEpoch=0;

  const salesCount=createMemo(()=>contacts().filter(c=>c.stage==='won').length);
  const inProgressCount=createMemo(()=>contacts().filter(c=>['contacted','qualified','proposal'].includes(c.stage)).length);

  async function reload() {
    setLoading(true);setError('');
    try{
      const data=await api<ListResponse>('/api/crm/contacts?q='+encodeURIComponent(search().trim()));
      setContacts(data.contacts);setLimited(data.limited);
      const previous=selected();
      if(previous) {
        const item=data.contacts.find(c=>c.id===previous.id);
        if(item)setSelected(item);
        else{setSelected(null);setNotes([]);}
      }
    }catch(e){setError(e instanceof Error?e.message:'CRM nicht erreichbar.');}
    finally{setLoading(false);}
  }
  async function open(contact:Contact) {
    if(busy()) return;
    const epoch=++readEpoch;
    setSelected(contact);setStage(contact.stage);setTagText(contact.tags.join(', '));
    setNoteBody('');pendingNoteKey=null;setNotes([]);setNotice('');setError('');
    setNotesLoading(true);
    try{
      const data=await api<NoteResponse>('/api/crm/contacts/'+contact.id+'/notes');
      if(epoch===readEpoch)setNotes(data.notes);
      if(data.limited&&epoch===readEpoch)setNotice('Nur die neuesten 40 Notizen werden angezeigt.');
    }catch(e){if(epoch===readEpoch)setError(e instanceof Error?e.message:'Notizen nicht verfügbar.');}
    finally{if(epoch===readEpoch)setNotesLoading(false);}
  }
  async function saveContact() {
    const contact=selected();
    if(!contact || busy())return;
    setBusy(true);setError('');setNotice('');
    try{
      const tags=tagText().split(',').map(v=>v.trim()).filter(Boolean);
      const value=await api<{contact:Pick<Contact,'id'|'email'|'stage'|'tags'|'version'>}>(
        '/api/crm/contacts/'+contact.id,'PUT',{email:contact.email,version:contact.version,stage:stage(),tags});
      const updated={...contact,...value.contact};
      setSelected(updated);
      setContacts(list=>list.map(c=>c.id===updated.id?updated:c));
      setTagText(updated.tags.join(', '));
      setNotice('CRM-Status und Tags gespeichert. Ein ERP-Auftrag wird dadurch nicht automatisch verändert.');
    }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.');}
    finally{setBusy(false);}
  }
  async function addNote() {
    const contact=selected();
    if(!contact || !noteBody().trim() || busy())return;
    setBusy(true);setError('');setNotice('');
    if(!pendingNoteKey)pendingNoteKey=crypto.randomUUID();
    try{
      const result=await api<{note:Note}>('/api/crm/contacts/'+contact.id+'/notes','POST',
        {email:contact.email,body:noteBody().trim(),idempotencyKey:pendingNoteKey});
      setNotes(list=>[result.note,...list.filter(n=>n.id!==result.note.id)].slice(0,40));
      setNoteBody('');pendingNoteKey=null;
      setNotice('Interne Notiz gespeichert. Es wurde keine Nachricht an den Kunden versendet.');
    }catch(e){setError(e instanceof Error?e.message:'Notiz nicht gespeichert.');}
    finally{setBusy(false);}
  }
  onMount(()=>void reload());

  return <section class="kncrm" aria-labelledby="kncrm-heading">
    <header class="kncrm-header">
      <div><p class="eyebrow">KNABA STUDIO · CRM</p><h2 id="kncrm-heading">Kontakte & Vertrieb</h2>
        <p>Ein zentraler Kundenüberblick aus vorhandenen KnaBa-Anfragen. Aufträge und Einsätze bleiben im Verwaltungsportal.</p></div>
      <button class="button button-outline" type="button" disabled={loading()||busy()} onClick={()=>void reload()}>↻ Aktualisieren</button>
    </header>
    <div class="kncrm-stats" aria-label="CRM-Übersicht">
      <div><span>Kontakte in der Ansicht</span><strong>{contacts().length}{limited()?'+':''}</strong></div>
      <div><span>In Bearbeitung · Ansicht</span><strong>{inProgressCount()}</strong></div>
      <div><span>Gewonnen · Ansicht</span><strong>{salesCount()}</strong></div>
    </div>
    <Show when={error()}><p class="kncrm-alert kncrm-error" role="alert">{error()}</p></Show>
    <Show when={notice()}><p class="kncrm-alert" role="status" aria-live="polite">{notice()}</p></Show>
    <div class="kncrm-grid">
      <div class="kncrm-list">
        <div class="kncrm-search">
          <label for="kncrm-query">Kontakte suchen</label>
          <div><input id="kncrm-query" type="search" maxLength={70} placeholder="Name oder E-Mail" value={search()}
            onInput={e=>setSearch(e.currentTarget.value)}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void reload();}}}/>
            <button class="button button-dark" type="button" disabled={loading()} onClick={()=>void reload()}>Suchen</button></div>
        </div>
        <Show when={loading()}><p class="kncrm-empty" role="status">Kontakte werden geladen …</p></Show>
        <Show when={!loading()&&contacts().length===0}><p class="kncrm-empty">Noch keine passenden Anfragen. Kontakte entstehen aus echten Anfragen, nicht aus Demo-Daten.</p></Show>
        <ul class="kncrm-contacts">
          <For each={contacts()}>{contact=><li>
            <button type="button" classList={{'kncrm-contact':true,'is-selected':selected()?.id===contact.id}}
              aria-pressed={selected()?.id===contact.id} disabled={busy()} onClick={()=>void open(contact)}>
              <span class="kncrm-contact-top"><strong>{contact.name}</strong><span class="kncrm-stage">{stages.find(s=>s.value===contact.stage)?.label}</span></span>
              <span>{contact.email}</span>
              <small>{contact.requestCount} Anfrage(n) · {formatted(contact.lastAt)}</small>
            </button>
          </li>}</For>
        </ul>
        <Show when={limited()}><p class="kncrm-hint">Anzeige auf 100 Kontakte begrenzt. Suche nach Namen oder E-Mail für weitere Treffer.</p></Show>
      </div>
      <div class="kncrm-details">
        <Show when={!selected()}><div class="kncrm-empty"><strong>Kontakt auswählen</strong><p>Wählen Sie links einen Kontakt, um CRM-Status, Tags und interne Notizen zu bearbeiten.</p></div></Show>
        <Show when={selected()}>{contact=><div>
          <div class="kncrm-detail-head"><div><p class="eyebrow">KONTAKTDETAILS</p><h3>{contact().name}</h3>
            <p>{contact().email}<Show when={contact().phone}><span> · {contact().phone}</span></Show></p></div>
            <a href="/admin/?view=operations" class="button button-outline">Aufträge →</a>
          </div>
          <p class="kncrm-meta">Letzte Anfrage: {contact().latestService} · {contact().latestRequestStatus} · {formatted(contact().lastAt)}</p>
          <div class="kncrm-form">
            <label for="kncrm-stage">Vertriebsphase</label>
            <select id="kncrm-stage" value={stage()} onChange={e=>setStage(e.currentTarget.value as Stage)} disabled={busy()}>
              <For each={stages}>{s=><option value={s.value}>{s.label}</option>}</For>
            </select>
            <label for="kncrm-tags">Tags (kommagetrennt)</label>
            <input id="kncrm-tags" value={tagText()} onInput={e=>setTagText(e.currentTarget.value)} maxLength={300}
              placeholder="Büro, Rückruf, Bauhelfer" disabled={busy()}/>
            <small>Max. 10 Tags, je 28 Zeichen. Nur interne CRM-Kennzeichnung.</small>
            <button class="button button-dark" type="button" disabled={busy()} onClick={()=>void saveContact()}>
              {busy()?'Speichern …':'Kontakt speichern'}
            </button>
          </div>
          <div class="kncrm-notes">
            <h4>Interne Notizen</h4>
            <label for="kncrm-note">Neue Notiz</label>
            <textarea id="kncrm-note" rows={4} maxLength={1000} value={noteBody()} disabled={busy()} placeholder="Absprachen, nächster Rückruf, besondere Anforderungen …"
              onInput={e=>{setNoteBody(e.currentTarget.value);pendingNoteKey=null;}}></textarea>
            <button class="button button-outline" type="button" disabled={!noteBody().trim()||busy()} onClick={()=>void addNote()}>Notiz speichern</button>
            <p class="kncrm-hint">Private CRM-Notiz. Keine automatische KI-Verarbeitung oder E-Mail.</p>
            <Show when={notesLoading()}><p role="status">Notizen werden geladen …</p></Show>
            <ul><For each={notes()}>{note=><li><p>{note.body}</p><small>{formatted(note.createdAt)}</small></li>}</For></ul>
            <Show when={!notesLoading()&&notes().length===0}><p class="kncrm-hint">Noch keine Notizen zu diesem Kontakt.</p></Show>
          </div>
        </div>}</Show>
      </div>
    </div>
  </section>;
}
