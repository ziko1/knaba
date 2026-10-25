import type {D1Database} from './types';
import {ArticleInputError,parseArticlePath,validateArticleContent,publishedArticle,type ArticleContent} from '../src/lib/article-contract';

type Row=Record<string,unknown>;
type ReadJson=(request:Request)=>Promise<Row>;
export class ArticleFault extends Error {
  constructor(readonly status:number,readonly code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{throw new ArticleFault(status,code,message);};
const text=(x:unknown)=>typeof x==='string'?x:'';
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
  'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Vary':'Cookie'
}});
const keys=(body:Row,allowed:string[])=>{
  if(Object.keys(body).some(k=>!allowed.includes(k)))fail(422,'unexpected_field','Unbekanntes Eingabefeld.');
};
const pathFor=(value:unknown)=>{
  const article=parseArticlePath(value);
  return article?article.path:fail(422,'article_path','Nur /wissen/slug/ oder übersetzte Wissensseiten sind erlaubt.');
};
const articleContent=(value:unknown,publish=false):ArticleContent=>{
  try{return validateArticleContent(value,publish);}
  catch(error){if(error instanceof ArticleInputError)fail(422,'article_content',error.message);throw error;}
};
const stored=(raw:unknown):ArticleContent|null=>{
  try{return validateArticleContent(JSON.parse(text(raw)));}catch{return null;}
};
const validVersion=(n:unknown):number=>{
  if(!Number.isSafeInteger(n)||Number(n)<0||Number(n)>2_000_000_000)
    return fail(422,'version','Ungültige Seitennummer.');
  return Number(n);
};
async function get(db:D1Database,page:string){
  return db.prepare('SELECT * FROM studio_pages WHERE page_path=?').bind(page).first<Row>();
}
async function listing(db:D1Database){
  const rows=(await db.prepare("SELECT page_path,draft_version,published_version,updated_at FROM studio_pages WHERE page_path LIKE '%/wissen/%' ORDER BY updated_at DESC,page_path LIMIT 201").all<Row>()).results||[];
  return response({items:rows.filter(r=>parseArticlePath(text(r.page_path))).slice(0,200).map(r=>({
    path:text(r.page_path),version:Number(r.draft_version),publishedVersion:Number(r.published_version),updatedAt:text(r.updated_at)
  }))});
}
async function details(db:D1Database,path:string){
  const row=await get(db,path);
  const history=(await db.prepare('SELECT id,version,action,created_at FROM studio_revisions WHERE page_path=? ORDER BY created_at DESC,rowid DESC LIMIT 40').bind(path).all<Row>()).results||[];
  return response({page:path,version:Number(row?.draft_version||0),publishedVersion:Number(row?.published_version||0),
    draft:stored(row?.draft_json)||{title:'',description:'',body:''},
    published:publishedArticle(row),updatedAt:text(row?.updated_at),
    history:history.map(v=>({id:text(v.id),version:Number(v.version),action:text(v.action),createdAt:text(v.created_at)}))
  });
}
async function save(db:D1Database,page:string,content:ArticleContent,expected:number,actorId:string,action:'draft'|'restore'='draft'){
  const row=await get(db,page),previous=Number(row?.draft_version||0),json=JSON.stringify(content);
  if(row&&previous>0&&!stored(row.draft_json))return fail(409,'type_conflict','An diesem Pfad existiert bereits ein anderes Studio-Dokument.');
  if(row?.draft_json===json)return response({page,version:previous,unchanged:true});
  if(previous!==expected)return fail(409,'stale_version','Entwurf zwischenzeitlich geändert.');
  if(!row){
    const count=await db.prepare("SELECT count(*) as n FROM studio_pages WHERE page_path LIKE '%/wissen/%'").first<Row>();
    if(Number(count?.n||0)>=200)return fail(429,'article_limit','Die Grenze von 200 Artikelentwürfen ist erreicht.');
  }
  const now=new Date().toISOString(),rid=crypto.randomUUID(),next=previous+1;
  const results=await db.batch([
    db.prepare("INSERT INTO studio_pages (page_path,draft_json,draft_version,published_json,published_version,updated_at,updated_by) VALUES (?,?,?,'[]',0,?,?) ON CONFLICT(page_path) DO UPDATE SET draft_json=excluded.draft_json,draft_version=excluded.draft_version,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE studio_pages.draft_version=?")
      .bind(page,json,next,now,actorId,expected),
    db.prepare('INSERT INTO studio_revisions (id,page_path,version,action,snapshot_json,actor_id,created_at) SELECT ?,page_path,draft_version,?,draft_json,?,? FROM studio_pages WHERE page_path=? AND draft_version=? AND draft_json=?')
      .bind(rid,action,actorId,now,page,next,json)
  ]);
  if(!results[0]?.meta?.changes||!results[1]?.meta?.changes)return fail(409,'stale_version','Speicherkonflikt.');
  return response({page,version:next,unchanged:false});
}
async function publish(db:D1Database,page:string,expected:number,actorId:string){
  const row=await get(db,page);
  if(!row)return fail(404,'article_missing','Bitte zuerst einen Entwurf erstellen.');
  if(Number(row.draft_version)!==expected)return fail(409,'stale_version','Entwurf wurde geändert.');
  const content=stored(row.draft_json);
  if(!content)return fail(422,'article_content','Ungültiger Artikelentwurf.');
  articleContent(content,true);
  if(row.draft_version===row.published_version&&row.draft_json===row.published_json)
    return response({page,version:expected,unchanged:true});
  const now=new Date().toISOString(),rid=crypto.randomUUID();
  const results=await db.batch([
    db.prepare('UPDATE studio_pages SET published_json=draft_json,published_version=draft_version,updated_at=?,updated_by=? WHERE page_path=? AND draft_version=? AND (published_version<>draft_version OR published_json<>draft_json)')
      .bind(now,actorId,page,expected),
    db.prepare("INSERT INTO studio_revisions (id,page_path,version,action,snapshot_json,actor_id,created_at) SELECT ?,page_path,draft_version,'published',published_json,?,? FROM studio_pages WHERE page_path=? AND published_version=?")
      .bind(rid,actorId,now,page,expected)
  ]);
  if(!results[0]?.meta?.changes||!results[1]?.meta?.changes)return fail(409,'stale_version','Veröffentlichung konnte nicht atomar bestätigt werden.');
  return response({page,version:expected,published:true});
}
async function restore(db:D1Database,page:string,rid:string,expected:number,actorId:string){
  if(!/^[0-9a-f-]{36}$/i.test(rid))return fail(422,'revision','Ungültige Revision.');
  const row=await db.prepare("SELECT snapshot_json FROM studio_revisions WHERE page_path=? AND id=? AND action IN ('draft','restore','published')").bind(page,rid).first<Row>();
  if(!row)return fail(404,'revision_missing','Diese Revision existiert nicht.');
  const content=stored(row.snapshot_json);
  if(!content)return fail(422,'article_content','Diese Revision enthält keinen gültigen Artikel.');
  return save(db,page,content,expected,actorId,'restore');
}
export async function handleStudioArticles(request:Request,db:D1Database,actorId:string,readJson:ReadJson):Promise<Response>{
  const path=new URL(request.url).pathname.replace(/\/$/,'');
  if(path==='/api/studio/articles'&&request.method==='GET')return listing(db);
  if(path==='/api/studio/article'&&request.method==='GET')
    return details(db,pathFor(new URL(request.url).searchParams.get('page')));
  if(request.method!=='POST')return fail(405,'method','Diese Methode ist nicht erlaubt.');
  const body=await readJson(request);
  if(path==='/api/studio/article/draft'){
    keys(body,['page','version','content']);
    return save(db,pathFor(body.page),articleContent(body.content),validVersion(body.version),actorId);
  }
  if(path==='/api/studio/article/publish'){
    keys(body,['page','version','confirm']);
    if(body.confirm!=='PUBLISH')return fail(422,'confirm','Bitte PUBLISH eingeben.');
    return publish(db,pathFor(body.page),validVersion(body.version),actorId);
  }
  if(path==='/api/studio/article/restore'){
    keys(body,['page','version','revisionId']);
    return restore(db,pathFor(body.page),text(body.revisionId),validVersion(body.version),actorId);
  }
  return fail(404,'not_found','Artikelendpunkt unbekannt.');
}
