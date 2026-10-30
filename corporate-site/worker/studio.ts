import type { D1Database, WorkerEnv } from './types';
import { StudioInputError, normalizeStudioPage, validateStudioEntries, type StudioEntry } from '../src/lib/site-studio-contract';
import {parseArticlePath} from '../src/lib/article-contract';
import {handleStudioArticles} from './articles';

export class StudioFault extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
type Row = Record<string, unknown>;
type StudioActor = {id: string | null; owner: boolean};
const fail = (status: number, code: string, message: string): never => { throw new StudioFault(status,code,message); };
const text = (value: unknown) => typeof value === 'string' ? value : '';
const apiResponse = (payload: unknown,status=200) => new Response(JSON.stringify(payload),{
  status, headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
    'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'same-origin','Vary':'Cookie'
  }
});
function database(env: WorkerEnv): D1Database {
  if(!env.DB) return fail(503,'unavailable','Site Studio benötigt eine konfigurierte Datenbank.');
  return env.DB;
}
function ownerOnly(actor: StudioActor) {
  if(!actor.id) return fail(401,'unauthenticated','Bitte melden Sie sich im KNABA Portal an.');
  if(!actor.owner) return fail(403,'forbidden','Nur der verifizierte KnaBa Inhaber darf Inhalte bearbeiten.');
}
function pageFromRequest(request:Request) {
  const page=new URL(request.url).searchParams.get('page');
  let normalized:string;
  try {normalized=normalizeStudioPage(page);} catch { return fail(422,'page','Bitte eine gültige öffentliche Seite wählen.'); }
  if(parseArticlePath(normalized))return fail(422,'article_route','Artikel über den Artikel-Editor bearbeiten.');
  return normalized;
}
function parseEntries(value:unknown): StudioEntry[] {
  try {return validateStudioEntries(value);} catch(error){
    if(error instanceof StudioInputError) return fail(422,'validation',error.message);
    throw error;
  }
}
function parseStored(input:unknown):StudioEntry[]{
  try {return validateStudioEntries(JSON.parse(text(input)||'[]'));}
  catch {return [];}
}
function version(value:unknown):number {
  if(!Number.isInteger(value) || Number(value)<0 || Number(value)>2_000_000_000)
    return fail(422,'version','Ungültige Version. Bitte die Seite neu laden.');
  return Number(value);
}
function bodyPage(value:unknown) {
  let normalized:string;
  try {normalized=normalizeStudioPage(value);} catch { return fail(422,'page','Ungültige öffentliche Seite.'); }
  if(parseArticlePath(normalized))return fail(422,'article_route','Artikel über den Artikel-Editor bearbeiten.');
  return normalized;
}
function keys(body:Row, allowed:string[]){
  if(Object.keys(body).some(k=>!allowed.includes(k))) fail(422,'unexpected_field','Die Anfrage enthält unbekannte Felder.');
}
async function getPage(db:D1Database,page:string):Promise<Row|null>{
  return db.prepare('SELECT * FROM studio_pages WHERE page_path=?').bind(page).first<Row>();
}
function revisionView(row:Row){
  return {id:text(row.id),version:Number(row.version),action:text(row.action),createdAt:text(row.created_at)};
}
async function studioPage(db:D1Database,page:string) {
  const row=await getPage(db,page);
  const history=(await db.prepare('SELECT id,version,action,created_at FROM studio_revisions WHERE page_path=? ORDER BY created_at DESC, rowid DESC LIMIT 40').bind(page).all<Row>()).results || [];
  return apiResponse({page,draft:parseStored(row?.draft_json),version:Number(row?.draft_version||0),
    published:parseStored(row?.published_json),publishedVersion:Number(row?.published_version||0),
    updatedAt:text(row?.updated_at),history:history.map(revisionView)});
}
async function published(db:D1Database,page:string){
  const row=await db.prepare('SELECT published_json,published_version FROM studio_pages WHERE page_path=?').bind(page).first<Row>();
  // Only validated published public content is cacheable; never cache drafts, identity or audit history.
  const result=apiResponse({page,version:Number(row?.published_version||0),entries:parseStored(row?.published_json)});
  result.headers.set('Cache-Control','public, max-age=30, s-maxage=30');
  result.headers.delete('Vary');
  return result;
}
async function writeDraft(db:D1Database,page:string,entries:StudioEntry[],expected:number,actorId:string,action:'draft'|'restore'='draft'){
  const current=await getPage(db,page);
  const previous=Number(current?.draft_version||0);
  const json=JSON.stringify(entries);
  if(current && current.draft_json===json) return apiResponse({page,version:previous,unchanged:true});
  if(previous!==expected) return fail(409,'stale_version','Diese Seite wurde zwischenzeitlich bearbeitet. Bitte neu laden.');
  const next=previous+1;
  const now=new Date().toISOString();
  const rid=crypto.randomUUID();
  const statements=[
    db.prepare("INSERT INTO studio_pages (page_path,draft_json,draft_version,published_json,published_version,updated_at,updated_by) VALUES (?,?,?,'[]',0,?,?) ON CONFLICT(page_path) DO UPDATE SET draft_json=excluded.draft_json,draft_version=excluded.draft_version,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE studio_pages.draft_version=?")
      .bind(page,json,next,now,actorId,expected),
    db.prepare("INSERT INTO studio_revisions (id,page_path,version,action,snapshot_json,actor_id,created_at) SELECT ?,page_path,draft_version,?,draft_json,?,? FROM studio_pages WHERE page_path=? AND draft_version=? AND draft_json=?")
      .bind(rid,action,actorId,now,page,next,json)
  ];
  const results=await db.batch(statements);
  if(!results[0]?.meta?.changes || !results[1]?.meta?.changes)
    return fail(409,'stale_version','Speicherkonflikt. Bitte neu laden.');
  return apiResponse({page,version:next,unchanged:false});
}
async function publish(db:D1Database,page:string,expected:number,actorId:string){
  const current=await getPage(db,page);
  if(!current) return fail(404,'not_found','Bitte zuerst einen Entwurf speichern.');
  if(Number(current.draft_version)!==expected) return fail(409,'stale_version','Der Entwurf hat sich geändert. Bitte erneut prüfen.');
  if(current.published_version===current.draft_version && current.published_json===current.draft_json)
    return apiResponse({page,version:expected,unchanged:true});
  const now=new Date().toISOString();
  const rid=crypto.randomUUID();
  const results=await db.batch([
    db.prepare('UPDATE studio_pages SET published_json=draft_json,published_version=draft_version,updated_at=?,updated_by=? WHERE page_path=? AND draft_version=? AND (published_version<>draft_version OR published_json<>draft_json)').bind(now,actorId,page,expected),
    db.prepare("INSERT INTO studio_revisions (id,page_path,version,action,snapshot_json,actor_id,created_at) SELECT ?,page_path,draft_version,'published',published_json,?,? FROM studio_pages WHERE page_path=? AND published_version=?")
      .bind(rid,actorId,now,page,expected)
  ]);
  if(!results[0]?.meta?.changes || !results[1]?.meta?.changes)
    return fail(409,'stale_version','Die Veröffentlichung konnte nicht atomar bestätigt werden.');
  return apiResponse({page,version:expected,published:true});
}
async function restore(db:D1Database,page:string,revisionId:string,expected:number,actorId:string) {
  if(!/^[0-9a-f-]{36}$/i.test(revisionId)) return fail(422,'revision','Ungültige Sicherung.');
  const row=await db.prepare("SELECT snapshot_json FROM studio_revisions WHERE page_path=? AND id=? AND action IN ('draft','restore','published')").bind(page,revisionId).first<Row>();
  if(!row) return fail(404,'not_found','Die gewählte Version existiert nicht.');
  const entries=parseStored(row.snapshot_json);
  return writeDraft(db,page,entries,expected,actorId,'restore');
}
/** Read-only flags; never put model credentials or quota balances in API responses. */
function aiReadiness(env:WorkerEnv){
  const lastCheck=Date.parse(env.STUDIO_AI_QUOTA_CHECKED_AT||'');
  const dailyCap=Number(env.STUDIO_AI_DAILY_BUDGET_CENTS);
  const perCall=Number(env.STUDIO_AI_REQUEST_COST_CAP_CENTS);
  const quotaFresh=Number.isFinite(lastCheck)&&lastCheck<=Date.now()&&Date.now()-lastCheck<=86400000;
  const approved=env.STUDIO_AI_ENABLED==='true'&&env.STUDIO_AI_APPROVED==='true';
  const modelOK=Boolean(env.STUDIO_AI_MODEL && /^[a-zA-Z0-9._-]{1,90}$/.test(env.STUDIO_AI_MODEL));
  const capOK=Number.isInteger(dailyCap)&&Number.isInteger(perCall)&&dailyCap>=1&&perCall>=1&&perCall<=dailyCap;
  return {ready:approved&&Boolean(env.STUDIO_AI_API_KEY)&&modelOK&&capOK&&quotaFresh,
    approved,quotaFresh,budgetConfigured:capOK,dailyCap,perCall};
}
async function aiSuggestion(env:WorkerEnv,db:D1Database,body:Row){
  keys(body,['selector','text','instruction','locale']);
  const selector=text(body.selector),oldText=text(body.text),instruction=text(body.instruction),locale=text(body.locale);
  parseEntries([{selector,kind:'text',value:oldText}]);
  if(instruction.length<3||instruction.length>800 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(instruction) || !['de','ru','en','uk'].includes(locale))
    return fail(422,'instruction','Bitte eine kurze, gültige Anweisung und Sprache wählen.');
  // A short-lived operator-attested budget prevents accidental billing from stale settings.
  const {ready,dailyCap,perCall}=aiReadiness(env);
  if(!ready)
    return fail(503,'ai_not_configured','AI ist noch nicht freigeschaltet: Schlüssel, frisches Guthaben, Preisdeckel und Inhaber-Freigabe fehlen.');
  const today=new Date().toISOString().slice(0,10);
  const reserved=await db.prepare("INSERT INTO studio_ai_budget (day,scope,reserved_cents,request_count) VALUES (?,?,?,1) ON CONFLICT(day,scope) DO UPDATE SET reserved_cents=reserved_cents+excluded.reserved_cents,request_count=request_count+1 WHERE reserved_cents+excluded.reserved_cents<=? AND request_count<8 RETURNING reserved_cents")
    .bind(today,'knaba-owner',perCall,dailyCap).first<Row>();
  if(!reserved) return fail(429,'ai_budget','Das tägliche AI-Budget oder die Anfragegrenze ist erreicht.');
  const system='You are a professional public-site copy editor for KnaBa Berlin. Rewrite only the selected public text in the requested language. Do not invent offers, prices, guarantees, certifications, reviews, legal statements or business facts. Preserve meaning and links. Return only plain text, no markup, no quotes, no commentary.';
  const prompt='Language: '+locale+'\nOriginal: '+oldText+'\nInstruction: '+instruction+'\nKeep it under 700 characters.';
  let aiResponse:Response;
  try {
    aiResponse=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{'Authorization':'Bearer '+env.STUDIO_AI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model:env.STUDIO_AI_MODEL,instructions:system,input:prompt,max_output_tokens:300,store:false}),
      signal:AbortSignal.timeout(12_000)
    });
  } catch { return fail(502,'ai_unavailable','Der AI-Anbieter ist derzeit nicht erreichbar.'); }
  if(!aiResponse.ok) return fail(502,'ai_unavailable','Der AI-Anbieter hat die Anfrage nicht bestätigt.');
  let parsed:unknown;
  try { parsed=await aiResponse.json(); } catch { return fail(502,'ai_response','Ungültige Antwort vom AI-Anbieter.'); }
  const payload=parsed as {output?:Array<{content?:Array<{type?:string;text?:string}>}>};
  const suggestion=(payload.output||[]).flatMap(entry=>entry.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n').trim();
  const entry=parseEntries([{selector,kind:'text',value:suggestion}])[0];
  if(!entry?.value) return fail(502,'ai_response','Der AI-Vorschlag ist leer.');
  return apiResponse({suggestion:entry.value,source:'provider',saved:false,published:false});
}
/** All Studio mutating actions MUST pass the existing portal JSON/origin/CSRF guard. */
export async function handleStudio(request:Request,env:WorkerEnv,actor:StudioActor,readJson:(request:Request)=>Promise<Row>):Promise<Response>{
  const path=new URL(request.url).pathname.replace(/\/$/,'');
  if(path==='/api/studio/published' && request.method==='GET')
    return published(database(env),pageFromRequest(request));
  ownerOnly(actor);
  const db=database(env);
  if(path==='/api/studio/articles'||path==='/api/studio/article'||path.startsWith('/api/studio/article/'))
    return handleStudioArticles(request,db,actor.id!,readJson);
  if(path==='/api/studio/page' && request.method==='GET') return studioPage(db,pageFromRequest(request));
  if(path==='/api/studio/ai-status' && request.method==='GET'){
    const {ready,approved,quotaFresh,budgetConfigured}=aiReadiness(env);
    return apiResponse({ready,approved,quotaFresh,budgetConfigured,provider:'server-configured',saved:false,published:false});
  }
  if(request.method!=='POST') return fail(405,'method','Diese Methode ist nicht erlaubt.');
  const body=await readJson(request);
  if(path==='/api/studio/draft'){
    keys(body,['page','entries','version']);
    return writeDraft(db,bodyPage(body.page),parseEntries(body.entries),version(body.version),actor.id!);
  }
  if(path==='/api/studio/publish'){
    keys(body,['page','version','confirm']);
    if(body.confirm!=='PUBLISH') return fail(422,'confirm','Bitte die Veröffentlichung ausdrücklich bestätigen.');
    return publish(db,bodyPage(body.page),version(body.version),actor.id!);
  }
  if(path==='/api/studio/restore'){
    keys(body,['page','revisionId','version']);
    return restore(db,bodyPage(body.page),text(body.revisionId),version(body.version),actor.id!);
  }
  if(path==='/api/studio/assist') return aiSuggestion(env,db,body);
  return fail(404,'not_found','Dieser Site Studio Endpunkt existiert nicht.');
}
