import { builtins, resolveTemplate, stateRow, hash, fail, templateManifest, readBoundedHtml } from './site-template-read';
export {TemplateFault} from './site-template-read';
import type { D1Database, WorkerEnv } from './types';
import { BUILTIN_TEMPLATES, validateSiteTemplate, TemplateInputError, type SiteTemplate } from '../src/lib/site-template-contract';
import { parseTemplateZip, MAX_TEMPLATE_ZIP_BYTES } from './template-zip';
import { studioPages } from '../src/lib/studio-pages';
import { renderTemplatePreview } from '../src/lib/site-template-render';
import { renderPublishedPage } from '../vps/render-page.mjs';

type Row = Record<string, unknown>;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(body:unknown)=>new Response(JSON.stringify(body),{headers});
const digestValue=(value:unknown):string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:fail(422,'template_digest','Ungültige Vorlagenkennung.');
const versionValue=(value:unknown):number=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<2_000_000_000?Number(value):fail(422,'version','Ungültige Version.');
const only=(body:Row,keys:string[])=>{if(Object.keys(body).some(k=>!keys.includes(k)))fail(422,'unknown_field','Unbekanntes Feld.');};
const database=(env:WorkerEnv):D1Database=>env.DB??fail(503,'unavailable','Datenbank nicht verfügbar.');
async function state(db:D1Database){
  const row=await stateRow(db);
  const uploaded=(await db.prepare('SELECT digest FROM studio_templates ORDER BY created_at DESC,digest LIMIT 40').all<Row>()).results??[];
  const templates=[...await builtins(),...await Promise.all(uploaded.map(item=>resolveTemplate(db,String(item.digest))))];
  const history=(await db.prepare("SELECT revision,digest,action,created_at FROM studio_template_history WHERE action IN ('activate','rollback') ORDER BY revision DESC LIMIT 40").all<Row>()).results??[];
  return {version:Number(row.version),activeDigest:row.active_digest??null,draftDigest:row.draft_digest??null,templates,
    history:history.map(item=>({revision:Number(item.revision),digest:item.digest??null,action:String(item.action),createdAt:String(item.created_at)}))};
}
async function limit(db:D1Database,actor:string,action:string,max:number){
  const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/900);
  const result=await db.prepare('INSERT INTO portal_rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count')
    .bind('template:'+action+':'+actor+':'+bucket,(bucket+1)*900,max).first();
  if(!result)fail(429,'rate_limit','Zu viele Vorlagenanfragen. Bitte später erneut versuchen.');
}
function decodeZip(value:unknown):Uint8Array{
  if(typeof value!=='string'||value.length>Math.ceil(MAX_TEMPLATE_ZIP_BYTES/3)*4||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))fail(422,'zip_encoding','Ungültige ZIP-Datei.');
  let raw:string;try{raw=atob(value as string);}catch{return fail(422,'zip_encoding','Ungültige ZIP-Datei.');}
  if(raw.length>MAX_TEMPLATE_ZIP_BYTES)fail(413,'zip_size','ZIP-Datei ist zu groß.');
  return Uint8Array.from(raw,char=>char.charCodeAt(0));
}
// Fixed, trusted ZIP creation for the downloadable example; no source filesystem access.
function exampleZip(manifest:SiteTemplate):Uint8Array{
  const filename=new TextEncoder().encode('template.json'),data=new TextEncoder().encode(JSON.stringify(manifest,null,2));
  let crc=0xffffffff;for(const byte of data){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const local=30+filename.length+data.length,central=46+filename.length,out=new Uint8Array(local+central+22),v=new DataView(out.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);out.set(filename,30);out.set(data,30+filename.length);
  v.setUint32(local,0x02014b50,true);v.setUint16(local+4,20,true);v.setUint16(local+6,20,true);v.setUint32(local+16,crc,true);v.setUint32(local+20,data.length,true);v.setUint32(local+24,data.length,true);v.setUint16(local+28,filename.length,true);out.set(filename,local+46);
  const end=local+central;v.setUint32(end,0x06054b50,true);v.setUint16(end+8,1,true);v.setUint16(end+10,1,true);v.setUint32(end+12,central,true);v.setUint32(end+16,local,true);return out;
}
async function preview(request:Request,env:WorkerEnv,db:D1Database){
  const url=new URL(request.url),page=url.searchParams.get('page')??'/';
  if(!studioPages.some(item=>item.path===page))fail(422,'page','Bitte eine veröffentlichte Seite wählen.');
  const template=await resolveTemplate(db,digestValue(url.searchParams.get('digest')));
  if(!env.ASSETS)fail(503,'preview_unavailable','Vorschau ist nicht verfügbar.');
  const source=await env.ASSETS!.fetch(new Request(new URL(page,url.origin),{headers:{Accept:'text/html'}}));
  if(!source.ok||!source.headers.get('content-type')?.includes('text/html'))fail(503,'preview_unavailable','Vorschauseite ist nicht verfügbar.');
  // Known local asset binding only; never fetch a URL supplied by a template.
  const original=await readBoundedHtml(source);
  const row=await db.prepare('SELECT published_json,published_version FROM studio_pages WHERE page_path=?').bind(page).first<Row>();
  const html=renderTemplatePreview(renderPublishedPage(original,row),templateManifest(template));
  return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline' "+url.origin+"; img-src "+url.origin+" data:; font-src "+url.origin+"; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox",
    'X-Frame-Options':'SAMEORIGIN'}});
}
export async function handleSiteTemplates(request:Request,env:WorkerEnv,actorId:string,readJson:(request:Request)=>Promise<Row>,assertOwner:()=>Promise<void>):Promise<Response>{
  const db=database(env),path=new URL(request.url).pathname.replace(/\/$/,'');
  await assertOwner();
  if(request.method==='GET'){
    if(path==='/api/studio/templates')return reply(await state(db));
    if(path==='/api/studio/templates/preview'){await limit(db,actorId,'preview',120);return preview(request,env,db);}
    if(path==='/api/studio/templates/example'){
      const bytes=exampleZip(validateSiteTemplate({...BUILTIN_TEMPLATES[1],id:'my-knaba-design',name:'My KnaBa design'}));
      return new Response(bytes as BodyInit,{headers:{...headers,'Content-Type':'application/zip','Content-Disposition':'attachment; filename="KNABA_template_example.zip"'}});
    }
    return fail(404,'not_found','Endpunkt nicht gefunden.');
  }
  if(request.method!=='POST')fail(405,'method','Methode nicht erlaubt.');
  const body=await readJson(request);
  if(path==='/api/studio/templates/upload'){
    only(body,['zip']);await limit(db,actorId,'upload',10);
    let manifest:SiteTemplate;
    try{manifest=await parseTemplateZip(decodeZip(body.zip));}catch(error){if(error instanceof TemplateInputError)fail(422,error.code,error.message);throw error;}
    const json=JSON.stringify(manifest),digest=await hash(json);
    if((await builtins()).some(item=>item.id===manifest.id))fail(422,'reserved_id','Diese Kennung ist für eine integrierte Vorlage reserviert.');
    const duplicate=Boolean(await db.prepare('SELECT digest FROM studio_templates WHERE digest=?').bind(digest).first());
    await assertOwner();
    if(!duplicate){
      const inserted=await db.prepare('INSERT INTO studio_templates (digest,manifest_json,created_by,created_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM studio_templates)<40 ON CONFLICT(digest) DO NOTHING')
        .bind(digest,json,actorId,new Date().toISOString()).run();
      if(!inserted.meta?.changes&&!await db.prepare('SELECT digest FROM studio_templates WHERE digest=?').bind(digest).first())fail(409,'template_quota','Maximal 40 eigene Vorlagen.');
    }
    return reply({template:{...manifest,digest,builtin:false},duplicate});
  }
  const action=path==='/api/studio/templates/select'?'select':path==='/api/studio/templates/activate'?'activate':path==='/api/studio/templates/rollback'?'rollback':null;
  if(!action)fail(404,'not_found','Endpunkt nicht gefunden.');
  only(body,action==='select'?['digest','version']:action==='activate'?['digest','version','confirm','idempotencyKey']:['revision','version','confirm','idempotencyKey']);
  const expected=versionValue(body.version);
  if(action!=='select'&&body.confirm!==(action==='activate'?'PUBLISH':'ROLLBACK'))fail(422,'confirm','Bitte bestätigen Sie die Veröffentlichung ausdrücklich.');
  const requestHash=await hash(JSON.stringify({actorId,action,version:expected,digest:body.digest??null,revision:body.revision??null}));
  const key=action==='select'?'select:'+requestHash:typeof body.idempotencyKey==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(body.idempotencyKey)?body.idempotencyKey:fail(422,'idempotency','Ungültige Anfragekennung.');
  const replay=await db.prepare('SELECT request_hash,actor_id FROM studio_template_history WHERE mutation_key=?').bind(key).first<Row>();
  if(replay){if(replay.request_hash!==requestHash||replay.actor_id!==actorId)fail(409,'idempotency','Anfragekennung bereits anders verwendet.');return reply(await state(db));}
  await limit(db,actorId,'change',60);
  let digest:string|null;
  if(action==='rollback'){
    const target=versionValue(body.revision);
    if(target===0)digest=null;
    else {const row=await db.prepare("SELECT digest FROM studio_template_history WHERE revision=? AND action IN ('activate','rollback')").bind(target).first<Row>();if(!row)fail(404,'revision','Version nicht gefunden.');digest=row!.digest as string|null;}
  }else digest=digestValue(body.digest);
  if(digest){
    await resolveTemplate(db,digest);
    if(action!=='select'){
      // The VPS/Worker renders trusted presets at request time, without a build job.
      // Validate all six public home shells before switching the atomic pointer.
      for(const page of ['/','/en/','/pl/','/lt/','/ru/','/uk/']){
        const check=new URL('/api/studio/templates/preview',request.url);check.searchParams.set('digest',digest);check.searchParams.set('page',page);
        await preview(new Request(check),env,db);
      }
    }
  }
  await assertOwner();
  const marker=crypto.randomUUID(),now=new Date().toISOString();
  const update=action==='select'
    ?db.prepare('UPDATE studio_template_state SET draft_digest=?,version=version+1,last_mutation=? WHERE id=1 AND version=?').bind(digest,marker,expected)
    :action==='activate'
    ?db.prepare('UPDATE studio_template_state SET active_digest=?,version=version+1,last_mutation=? WHERE id=1 AND version=? AND draft_digest=?').bind(digest,marker,expected,digest)
    :db.prepare('UPDATE studio_template_state SET active_digest=?,draft_digest=?,version=version+1,last_mutation=? WHERE id=1 AND version=?').bind(digest,digest,marker,expected);
  const results=await db.batch([update,db.prepare('INSERT INTO studio_template_history (revision,digest,action,actor_id,created_at,mutation_key,request_hash) SELECT version,?,?,?,?,?,? FROM studio_template_state WHERE id=1 AND last_mutation=?').bind(digest,action,actorId,now,key,requestHash,marker)]);
  if(!results[0]?.meta?.changes||!results[1]?.meta?.changes){
    const concurrent=await db.prepare('SELECT request_hash,actor_id FROM studio_template_history WHERE mutation_key=?').bind(key).first<Row>();
    if(concurrent?.request_hash===requestHash&&concurrent.actor_id===actorId)return reply(await state(db));
    fail(409,'stale_version','Die Vorlage wurde inzwischen geändert. Bitte neu laden und erneut prüfen.');
  }
  return reply(await state(db));
}
