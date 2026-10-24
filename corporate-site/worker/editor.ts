import type { PortalSession } from '../src/lib/portal-contract';
import { CMS_MAX_PAYLOAD, isCmsPage, parseCmsBlocks, type CmsBlocks } from '../src/lib/editor-contract';
import type { D1Database, D1Statement, WorkerEnv } from './types';

type RecordRow = Record<string, unknown>;
class CmsFault extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const fault = (status: number, code: string, message: string): never => { throw new CmsFault(status,code,message); };
const json = (body: unknown, status=200): Response => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
    'Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff' }
});
const editor = (s: PortalSession): void => {
  if (!s.user) fault(401,'unauthenticated','Bitte melden Sie sich an.');
  if (s.role!=='owner' && s.role!=='admin') fault(403,'forbidden','Nur die Websiteverwaltung hat Zugriff.');
};
const dbFor = (env: WorkerEnv): D1Database => env.DB ?? fault(503,'unavailable','Der Editor ist noch nicht eingerichtet.');
const page = (value: unknown): string => {
  if (typeof value!=='string' || !isCmsPage(value)) fault(422,'page','Diese Seite ist nicht zur Bearbeitung freigegeben.');
  return value as string;
};
const version = (value: unknown, allowZero=false): number => {
  if (!Number.isSafeInteger(value) || Number(value)<(allowZero?0:1)) fault(422,'version','Ungültige Seitenversion.');
  return value as number;
};
const data = (value: unknown): CmsBlocks => {
  try { return parseCmsBlocks(value); }
  catch { return fault(422,'blocks','Nur kurze Textblöcke ohne HTML sind erlaubt.'); }
};
const parseStored = (value: unknown): CmsBlocks => {
  try { return parseCmsBlocks(JSON.parse(String(value || '{}'))); }
  catch { return fault(503,'corrupt','Die gespeicherte Version konnte nicht sicher gelesen werden.'); }
};
const guard = (s: PortalSession): {sql: string; bindings: string[]} =>
  s.role==='owner' ? {sql:'',bindings:[]} : {
    sql: " AND EXISTS (SELECT 1 FROM profiles WHERE id=? AND email=? AND role='admin' AND status='approved')",
    bindings: [s.user!.id, s.user!.email.trim().toLowerCase()]
  };
const allowed = (body: RecordRow, keys: string[]): void => {
  if (Object.keys(body).some(key=>!keys.includes(key))) fault(422,'fields','Unerlaubte Felder.');
};

async function readBody(request: Request): Promise<RecordRow> {
  const origin=request.headers.get('Origin');
  if (!origin || origin!==new URL(request.url).origin ||
      request.headers.get('sec-fetch-site')==='cross-site' ||
      request.headers.get('X-KnaBa-Request')!=='portal-v1')
    fault(403,'origin','Diese Anfrage ist nicht erlaubt.');
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json'))
    fault(415,'content_type','JSON erforderlich.');
  const claimed=Number(request.headers.get('content-length')||0);
  if (!Number.isFinite(claimed) || claimed>CMS_MAX_PAYLOAD) fault(413,'size','Die Bearbeitung ist zu groß.');
  if (!request.body) fault(400,'json','Keine Daten.');
  const reader=request.body!.getReader(), parts:Uint8Array[]=[];
  let size=0;
  try {
    while (true) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if (size>CMS_MAX_PAYLOAD) { await reader.cancel();fault(413,'size','Die Bearbeitung ist zu groß.'); }
      parts.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for (const part of parts) { bytes.set(part,offset);offset+=part.length; }
  let result:unknown;
  try {result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch {fault(400,'json','Ungültiges JSON.');}
  if (!result || typeof result!=='object' || Array.isArray(result)) fault(400,'json','Ungültiges JSON.');
  return result as RecordRow;
}
async function current(db: D1Database, path: string) {
  const row = await db.prepare('SELECT * FROM cms_pages WHERE path=?').bind(path).first<RecordRow>();
  return row ? {path,version:Number(row.version),publishedVersion:Number(row.published_version),
    draft:parseStored(row.draft_json),published:parseStored(row.published_json),
    updatedAt:String(row.updated_at)} : {path,version:0,publishedVersion:0,draft:{},published:{},updatedAt:null};
}
async function pageState(db: D1Database, path:string) {
  const state=await current(db,path);
  const history=(await db.prepare('SELECT version,kind,created_at FROM cms_history WHERE path=? ORDER BY version DESC LIMIT 30')
    .bind(path).all<RecordRow>()).results || [];
  return json({...state,history:history.map(row=>({version:Number(row.version),kind:String(row.kind),createdAt:String(row.created_at)}))});
}
async function mutate(db:D1Database, s:PortalSession, path:string, expected:number,
                      kind:'draft'|'publish'|'restore_draft', blocks?:CmsBlocks) {
  const g=guard(s), time=new Date().toISOString(),next=expected+1,actor=s.user!.id;
  let mutation:D1Statement;
  if (kind==='draft' && expected===0) {
    const sql = 'INSERT INTO cms_pages (path,draft_json,published_json,version,published_version,updated_by,updated_at) ' +
      "SELECT ?,?,'{}',1,0,?,?" + (g.sql ? ' WHERE ' + g.sql.slice(5) : '') + ' ON CONFLICT(path) DO NOTHING';
    mutation=db.prepare(sql).bind(path,JSON.stringify(blocks),actor,time,...g.bindings);
  } else if(kind==='draft' || kind==='restore_draft') {
    mutation=db.prepare('UPDATE cms_pages SET draft_json=?,version=version+1,updated_by=?,updated_at=? ' +
      'WHERE path=? AND version=?' + g.sql).bind(JSON.stringify(blocks),actor,time,path,expected,...g.bindings);
  } else {
    mutation=db.prepare('UPDATE cms_pages SET published_json=draft_json,published_version=version+1,' +
      'version=version+1,updated_by=?,updated_at=? WHERE path=? AND version=?' + g.sql)
      .bind(actor,time,path,expected,...g.bindings);
  }
  const snapshotColumn=kind==='publish'?'published_json':'draft_json';
  const history=db.prepare('INSERT INTO cms_history (id,path,version,kind,snapshot_json,actor_id,created_at) ' +
    'SELECT ?,path,version,?,'+snapshotColumn+',?,? FROM cms_pages ' +
    'WHERE path=? AND version=? AND updated_by=? ON CONFLICT(path,version) DO NOTHING')
    .bind(crypto.randomUUID(),kind,actor,time,path,next,actor);
  const results=await db.batch([mutation,history]);
  if (results[0]?.meta?.changes!==1 || results[1]?.meta?.changes!==1)
    fault(409,'conflict','Die Seite oder Ihre Berechtigung hat sich geändert. Bitte neu laden.');
  return pageState(db,path);
}
export function isEditorRoute(path: string): boolean {
  return path==='/editor' || path==='/editor/' || path==='/editor/index.html';
}
export async function editorSessionAuthorized(request:Request,env:WorkerEnv,readSession:(r:Request,e:WorkerEnv)=>Promise<PortalSession>):Promise<boolean> {
  try { editor(await readSession(request,env)); return true; }
  catch {return false;}
}
export async function handleCmsApi(request:Request,env:WorkerEnv,s:PortalSession):Promise<Response> {
  try {
    editor(s);
    const path=new URL(request.url).pathname;
    const db=dbFor(env);
    if (path==='/api/editor/page' && request.method==='GET')
      return await pageState(db,page(new URL(request.url).searchParams.get('path')));
    if (path==='/api/editor/draft' && request.method==='PUT') {
      const body=await readBody(request);allowed(body,['path','version','blocks']);
      return await mutate(db,s,page(body.path),version(body.version,true),'draft',data(body.blocks));
    }
    if (path==='/api/editor/publish' && request.method==='POST') {
      const body=await readBody(request);allowed(body,['path','version']);
      return await mutate(db,s,page(body.path),version(body.version),'publish');
    }
    if (path==='/api/editor/restore' && request.method==='POST') {
      const body=await readBody(request);allowed(body,['path','version','revision']);
      const path=page(body.path),expected=version(body.version),revision=version(body.revision);
      const record=await db.prepare("SELECT snapshot_json FROM cms_history WHERE path=? AND version=? AND kind='publish'")
        .bind(path,revision).first<RecordRow>();
      if(!record)fault(404,'not_found','Diese veröffentlichte Version ist nicht verfügbar.');
      return await mutate(db,s,path,expected,'restore_draft',parseStored(record!.snapshot_json));
    }
    return json({error:{code:'not_found',message:'Unbekannte Editor-Funktion.'}},404);
  } catch(e) {
    if(e instanceof CmsFault) return json({error:{code:e.code,message:e.message}},e.status);
    return json({error:{code:'unavailable',message:'Der Editor ist derzeit nicht verfügbar.'}},503);
  }
}
/** Server-side text replacement: escaping is performed by HTMLRewriter.setInnerContent (no html flag). */
export async function renderCmsPage(request:Request,env:WorkerEnv,asset:Response,preview=false):Promise<Response> {
  if (request.method!=='GET' || !isCmsPage(new URL(request.url).pathname) ||
      !asset.ok || !(asset.headers.get('content-type')||'').includes('text/html')) return asset;
  if (!env.DB) return preview ? json({error:{code:'unavailable'}},503) : asset;
  let blocks:CmsBlocks={};
  try {
    const path=new URL(request.url).pathname;
    const row=await env.DB.prepare('SELECT draft_json,published_json FROM cms_pages WHERE path=?').bind(path).first<RecordRow>();
    if (row) blocks=parseStored(preview?row.draft_json:row.published_json);
  } catch {
    // Existing public website remains usable if CMS D1 is unavailable.
    if(preview)return json({error:{code:'unavailable',message:'Vorschau ist nicht verfügbar.'}},503);
    return asset;
  }
  interface CmsRewriteElement { setAttribute(name:string,value:string):void; setInnerContent(value:string,opts?:{html?:boolean}):void }
  interface CmsHtmlRewriter { on(selector:string,handler:{element(el:CmsRewriteElement):void}):CmsHtmlRewriter; transform(response:Response):Response }
  const Rewriter=(globalThis as typeof globalThis & {HTMLRewriter?:new()=>CmsHtmlRewriter}).HTMLRewriter;
  if(!Rewriter)return preview?json({error:{code:'unavailable'}},503):asset;
  const rewriter=new Rewriter();
  for (const tag of ['h1','h2','h3','p']) {
    let index=0;
    rewriter.on('main '+tag, {
      element(element: CmsRewriteElement) {
        const key=tag+'-'+index++;
        element.setAttribute('data-knaba-cms',key);
        if (Object.prototype.hasOwnProperty.call(blocks,key)) element.setInnerContent(blocks[key]);
      }
    });
  }
  const headers=new Headers(asset.headers);
  headers.set('Cache-Control',preview?'private, no-store':'no-store');
  headers.set('Vary','Cookie');
  if(preview){headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Referrer-Policy','same-origin');headers.set('Content-Security-Policy',"frame-ancestors 'self'; base-uri 'self'; form-action 'self'");}
  return rewriter.transform(new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers}));
}
