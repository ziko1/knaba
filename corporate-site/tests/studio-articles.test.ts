import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleApi} from '../worker/api';
import type {D1Database,D1Statement,D1Result,WorkerEnv} from '../worker/types';

const origin='https://kneba.vsp.rest';
const articlePath='/wissen/baureinigung-planung/';
const content={
  title:'Baureinigung in Berlin richtig planen',
  description:'Praktische Hinweise zur Planung einer Baureinigung in Berlin, zur Abstimmung der Bauphasen und zur Vorbereitung der Übergabe.',
  body:'Für eine geordnete Baureinigung stimmen Bauleitung und Reinigungsteam die Bauphasen, den Zugang, die Oberflächen und den Termin ab.\n\nVor der Übergabe wird gemeinsam geprüft, welche Flächen freigegeben sind und welche Arbeiten zuerst abgeschlossen werden müssen. Der genaue Umfang bleibt abhängig vom Auftrag.'
};
let db:DatabaseSync;
let env:WorkerEnv;
const bridge=(sqlite:DatabaseSync):D1Database=>{
  const stmt=(sql:string,values:unknown[]=[]):D1Statement=>({
    bind:(...v:unknown[])=>stmt(sql,v),
    first:async<T>()=>(sqlite.prepare(sql).get(...values as [])??null) as T|null,
    all:async<T>()=>({success:true,results:sqlite.prepare(sql).all(...values as []) as T[]}),
    run:async()=>{const result=sqlite.prepare(sql).run(...values as []);return {success:true,meta:{changes:Number(result.changes)}};}
  });
  return {prepare:sql=>stmt(sql),batch:async<T>(all:D1Statement[]):Promise<D1Result<T>[]>=>{
    sqlite.exec('BEGIN IMMEDIATE');
    try{const rows=[];for(const s of all)rows.push(await s.run() as D1Result<T>);sqlite.exec('COMMIT');return rows;}
    catch(e){sqlite.exec('ROLLBACK');throw e;}
  }};
};
function request(method:string,path:string,body?:unknown,role:'owner'|'anonymous'|'admin'='owner',wrongOrigin=false){
 const headers=new Headers();
 if(role!=='anonymous'){
   headers.set('oai-authenticated-user-id',role==='owner'?'synthetic-owner':'synthetic-admin');
   headers.set('oai-authenticated-user-email',role==='owner'?'owner@example.test':'admin@example.test');
 }
 if(body!==undefined){
   headers.set('content-type','application/json');headers.set('x-knaba-request','portal-v1');
   headers.set('origin',wrongOrigin?'https://evil.invalid':origin);
   headers.set('sec-fetch-site',wrongOrigin?'cross-site':'same-origin');
 }
 return new Request(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
async function invoke(method:string,path:string,body?:unknown,role:'owner'|'anonymous'|'admin'='owner',wrongOrigin=false){
 const result=await handleApi(request(method,path,body,role,wrongOrigin),env);
 return {status:result.status,body:await result.json() as Record<string,any>,headers:result.headers};
}
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const filename of ['0000_needy_war_machine','0001_lazy_angel','0002_tense_mother_askani','0003_absurd_bedlam','0004_dusty_hiroim']){
   db.exec(readFileSync(new URL('../drizzle/'+filename+'.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint','\n'));
 }
 env={DB:bridge(db),OWNER_EMAIL:'owner@example.test'};
 db.prepare("INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES ('synthetic-admin','Admin','admin@example.test','worker','admin','approved','test','test','test',1,'test')").run();
});
afterEach(()=>db.close());
describe('Studio owner-published multilingual knowledge pages',()=>{
 it('denies anonymous, admin and cross-origin article writes and private article inventories',async()=>{
   expect((await invoke('GET','/api/studio/articles',undefined,'anonymous')).status).toBe(401);
   expect((await invoke('GET','/api/studio/articles',undefined,'admin')).status).toBe(403);
   const payload={page:articlePath,version:0,content};
   expect((await invoke('POST','/api/studio/article/draft',payload,'anonymous')).status).toBe(401);
   expect((await invoke('POST','/api/studio/article/draft',payload,'admin')).status).toBe(403);
   expect((await invoke('POST','/api/studio/article/draft',payload,'owner',true)).status).toBe(403);
   expect(db.prepare('SELECT COUNT(*) as n FROM studio_pages').get()).toEqual({n:0});
 });
 it('persists a draft without publishing, then publishes only after review and confirmation',async()=>{
   expect((await invoke('GET','/api/studio/articles')).body.items).toEqual([]);
   const saved=await invoke('POST','/api/studio/article/draft',{page:articlePath,version:0,content});
   expect(saved.status).toBe(200);
   expect(saved.body.version).toBe(1);
   expect(db.prepare('SELECT published_version as n FROM studio_pages WHERE page_path=?').get(articlePath)).toEqual({n:0});
   const current=await invoke('GET','/api/studio/article?page='+encodeURIComponent(articlePath));
   expect(current.status).toBe(200);
   expect(current.body.draft.title).toBe(content.title);
   expect(current.body.publishedVersion).toBe(0);
   expect((await invoke('POST','/api/studio/article/publish',{page:articlePath,version:1,confirm:'YES'})).status).toBe(422);
   expect((await invoke('POST','/api/studio/article/publish',{page:articlePath,version:1,confirm:'PUBLISH'})).status).toBe(200);
   const published=JSON.parse((db.prepare('SELECT published_json FROM studio_pages WHERE page_path=?').get(articlePath) as {published_json:string}).published_json);
   expect(published).toEqual(content);
   expect((await invoke('POST','/api/studio/article/publish',{page:articlePath,version:1,confirm:'PUBLISH'})).body.unchanged).toBe(true);
   const list=await invoke('GET','/api/studio/articles');
   expect(list.status).toBe(200);
   expect(list.body.items.map((item:{path:string})=>item.path)).toContain(articlePath);
 });
 it('rejects unsafe content, invalid namespace, content collisions and stale writes',async()=>{
   const unsafe={...content,body:'<script>alert(1)</script>'};
   expect((await invoke('POST','/api/studio/article/draft',{page:articlePath,version:0,content:unsafe})).status).toBe(422);
   expect((await invoke('POST','/api/studio/article/draft',{page:'/konto/',version:0,content})).status).toBe(422);
   expect((await invoke('POST','/api/studio/article/draft',{page:'/wissen/%2e%2e/',version:0,content})).status).toBe(422);
   expect((await invoke('POST','/api/studio/article/draft',{page:articlePath,version:0,content})).status).toBe(200);
   expect((await invoke('POST','/api/studio/article/draft',{page:articlePath,version:0,content:{...content,title:'New version'}})).status).toBe(409);
   expect((await invoke('POST','/api/studio/draft',{page:articlePath,version:1,entries:[{selector:'@title',kind:'text',value:'Hidden collision'}]})).status).toBe(422);
 });
 it('can unpublish an approved article with explicit confirmation, retaining its draft and revision history',async()=>{
   expect((await invoke('POST','/api/studio/article/draft',{page:articlePath,version:0,content})).status).toBe(200);
   expect((await invoke('POST','/api/studio/article/publish',{page:articlePath,version:1,confirm:'PUBLISH'})).status).toBe(200);
   expect((await invoke('POST','/api/studio/article/unpublish',{page:articlePath,version:1,confirm:'UNPUBLISH'},'anonymous')).status).toBe(401);
   expect((await invoke('POST','/api/studio/article/unpublish',{page:articlePath,version:1,confirm:'UNPUBLISH'},'admin')).status).toBe(403);
   expect((await invoke('POST','/api/studio/article/unpublish',{page:articlePath,version:1,confirm:'PUBLISH'})).status).toBe(422);
   expect((await invoke('POST','/api/studio/article/unpublish',{page:articlePath,version:0,confirm:'UNPUBLISH'})).status).toBe(409);
   const hidden=await invoke('POST','/api/studio/article/unpublish',{page:articlePath,version:1,confirm:'UNPUBLISH'});
   expect(hidden.status).toBe(200);
   expect(hidden.body.published).toBe(false);
   const row=db.prepare('SELECT draft_json,published_json,draft_version,published_version FROM studio_pages WHERE page_path=?').get(articlePath) as Record<string,unknown>;
   expect(Number(row.published_version)).toBe(0);
   expect(Number(row.draft_version)).toBe(1);
   expect(row.published_json).toBe('[]');
   expect(JSON.parse(String(row.draft_json))).toEqual(content);
   expect((await invoke('GET','/api/studio/article?page='+encodeURIComponent(articlePath))).body.published).toBeNull();
   expect((await invoke('POST','/api/studio/article/unpublish',{page:articlePath,version:1,confirm:'UNPUBLISH'})).body.unchanged).toBe(true);
   expect((db.prepare("SELECT count(*) as n FROM studio_revisions WHERE page_path=? AND action='unpublished'").get(articlePath) as {n:number}).n).toBe(1);
 });

});
