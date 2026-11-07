import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {openLocalDatabase,LocalD1} from '../vps/database.mjs';
import {handleApi} from '../worker/api';
import worker from '../worker/index';
import type {WorkerEnv} from '../worker/types';
import {applyActiveTemplate} from '../worker/site-template-read';
import {renderTemplateHtml} from '../src/lib/site-template-render';
import {BUILTIN_TEMPLATES} from '../src/lib/site-template-contract';
const origin='https://knaba.test';
const html='<!doctype html><html><head><title>Real title</title><link rel="stylesheet" href="/_astro/site.css"><script>window.unchanged=1</script></head><body data-public-design="vivid"><main id="main"><section class="bau-hero"><h1>Original content</h1><p>Company content</p><a href="/kontakt/">Contact</a><form action="/api/leads"><input name="name"><button>Send</button></form></section></main></body></html>';
let folder:string,db:DatabaseSync,env:WorkerEnv;
function request(method:string,path:string,body?:unknown,actor='owner',evil=false){
 const headers=new Headers({Accept:'application/json'});
 if(actor!=='guest'){headers.set('oai-authenticated-user-id',actor);headers.set('oai-authenticated-user-email',actor+'@example.test');}
 if(body!==undefined){headers.set('Content-Type','application/json');headers.set('Origin',evil?'https://evil.test':origin);headers.set('X-Knaba-Request','portal-v1');headers.set('Sec-Fetch-Site',evil?'cross-site':'same-origin');}
 return new Request(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
async function call(method:string,path='',body?:unknown,actor='owner',evil=false){
 const response=await handleApi(request(method,'/api/studio/templates'+path,body,actor,evil),env);
 return {status:response.status,body:await response.json() as any};
}
async function current(){const result=await call('GET');expect(result.status).toBe(200);return result.body;}
async function select(index=1){const initial=await current();const digest=initial.templates[index].digest;const saved=await call('POST','/select',{digest,version:initial.version});expect(saved.status).toBe(200);return {digest,version:saved.body.version};}
async function publish(index=1){const selected=await select(index);const data={...selected,confirm:'PUBLISH',idempotencyKey:crypto.randomUUID()};const result=await call('POST','/activate',data);expect(result.status).toBe(200);return {result,data};}
async function example(){const response=await handleApi(request('GET','/api/studio/templates/example'),env);expect(response.status).toBe(200);return Buffer.from(await response.arrayBuffer()).toString('base64');}
beforeEach(()=>{
 folder=mkdtempSync(join(tmpdir(),'knaba-template-api-'));
 const connection=openLocalDatabase(join(folder,'state.sqlite'));db=connection.db;
 env={DB:connection.d1,OWNER_EMAIL:'owner@example.test',ASSETS:{fetch:async()=>new Response(html,{headers:{'Content-Type':'text/html'}})}};
});
afterEach(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
describe('template management with real SQLite transactions',()=>{
 it('starts with three builtins and unchanged public content',async()=>{const s=await current();expect(s.templates).toHaveLength(3);expect(s.version).toBe(0);expect(s.activeDigest).toBeNull();expect(await applyActiveTemplate(html,env.DB!)).toBe(html);});
 it.each(['guest','worker','admin','client'])('rejects %s direct API access and example export',async actor=>{expect((await call('GET','',undefined,actor)).status).toBe(actor==='guest'?401:403);expect((await call('POST','/upload',{zip:'AAAA'},actor)).status).toBe(actor==='guest'?401:403);const response=await handleApi(request('GET','/api/studio/templates/example',undefined,actor),env);expect(response.status).toBe(actor==='guest'?401:403);});
 it('requires same-origin JSON and explicit publication confirmation',async()=>{const selected=await select();expect((await call('POST','/activate',selected,'owner',true)).status).toBe(403);expect((await call('POST','/activate',selected)).status).toBe(422);expect((await current()).activeDigest).toBeNull();});
 it('imports a real downloaded ZIP idempotently without activation',async()=>{const zip=await example();const first=await call('POST','/upload',{zip});expect(first.status).toBe(200);expect(first.body.duplicate).toBe(false);expect((await call('POST','/upload',{zip})).body.duplicate).toBe(true);expect((await current()).templates).toHaveLength(4);expect((await current()).activeDigest).toBeNull();});
 it('rejects malformed ZIP and unknown company claims with no package persistence',async()=>{expect((await call('POST','/upload',{zip:'AAAA'})).status).toBe(422);expect((await call('POST','/upload',{zip:await example(),companyId:'foreign'})).status).toBe(422);expect(db.prepare('SELECT count(*) n FROM studio_templates').get()?.n).toBe(0);});
 it('enforces encoded request size and upload rate before persistence',async()=>{expect((await call('POST','/upload',{zip:'A'.repeat(91000)})).status).toBe(413);for(let i=0;i<10;i++)expect((await call('POST','/upload',{zip:'AAAA'})).status).toBe(422);expect((await call('POST','/upload',{zip:'AAAA'})).status).toBe(429);});
 it('keeps draft private, activates a reviewed selection, and does not edit content',async()=>{const selected=await select();expect(await applyActiveTemplate(html,env.DB!)).toBe(html);const result=await call('POST','/activate',{...selected,confirm:'PUBLISH',idempotencyKey:crypto.randomUUID()});expect(result.status).toBe(200);const page=await applyActiveTemplate(html,env.DB!);expect(page).toContain('data-knaba-template="knaba-business"');expect(page).toContain('window.unchanged=1');expect(page.match(/data-public-design=/g)).toHaveLength(1);expect(page).toContain('data-public-design="vivid"');expect(page).toContain('Company content');expect(db.prepare('SELECT count(*) n FROM studio_pages').get()?.n).toBe(0);});
 it('rejects stale publication and a digest different from the draft',async()=>{const first=await select(1),second=await select(2);expect((await call('POST','/activate',{...first,confirm:'PUBLISH',idempotencyKey:crypto.randomUUID()})).status).toBe(409);expect((await call('POST','/activate',{digest:first.digest,version:second.version,confirm:'PUBLISH',idempotencyKey:crypto.randomUUID()})).status).toBe(409);expect((await current()).activeDigest).toBeNull();});
 it('deduplicates concurrent publication, and rejects key reuse with changed payload',async()=>{const selected=await select();const payload={...selected,confirm:'PUBLISH',idempotencyKey:crypto.randomUUID()};const replies=await Promise.all([call('POST','/activate',payload),call('POST','/activate',payload)]);expect(replies.map(r=>r.status)).toEqual([200,200]);expect(db.prepare("SELECT count(*) n FROM studio_template_history WHERE action='activate'").get()?.n).toBe(1);expect((await call('POST','/activate',{...payload,version:payload.version+1})).status).toBe(409);});
 it('preserves active state when rendering is unavailable or a shell is broken',async()=>{await publish();const selected=await select(2);env.ASSETS={fetch:async()=>new Response('broken',{headers:{'Content-Type':'text/html'}})};expect((await call('POST','/activate',{...selected,confirm:'PUBLISH',idempotencyKey:crypto.randomUUID()})).status).toBe(503);expect((await current()).activeDigest).not.toBe(selected.digest);});
 for(const revokeAt of ['duplicate','final-profile'])it(`rejects a session revoked during ${revokeAt} query before upload commit`,async()=>{
  const zip=await example(),local=env.DB!;let allowed=true,profiles=0;
  env.VERIFY_STUDIO_SESSION=()=>allowed;
  const wrap=(statement:any,sql:string):any=>{
   const first=statement.first.bind(statement),bind=statement.bind.bind(statement);
   statement.bind=(...values:any[])=>wrap(bind(...values),sql);
   statement.first=async(...args:any[])=>{const result=await (first as any)(...args);
    if(sql.includes('FROM profiles'))profiles++;
    if((revokeAt==='duplicate'&&sql==='SELECT digest FROM studio_templates WHERE digest=?')||(revokeAt==='final-profile'&&sql.includes('FROM profiles')&&profiles===3))allowed=false;
    return result;
   };return statement;
  };
  env.DB={prepare:(sql:string)=>wrap(local.prepare(sql),sql),batch:local.batch.bind(local)};
  expect((await call('POST','/upload',{zip})).status).toBe(403);
  expect(allowed).toBe(false);expect(db.prepare('SELECT count(*) n FROM studio_templates').get()?.n).toBe(0);
 });
 it('rechecks trusted session after async work before mutation',async()=>{const zip=await example();let checks=0;env.VERIFY_STUDIO_SESSION=()=>++checks===1;expect((await call('POST','/upload',{zip})).status).toBe(403);expect(db.prepare('SELECT count(*) n FROM studio_templates').get()?.n).toBe(0);});
 it('isolates preview with current published copy, inert forms and no scripts or navigation',async()=>{db.prepare('INSERT INTO studio_pages (page_path,draft_json,draft_version,published_json,published_version,updated_at,updated_by) VALUES (?,?,?,?,?,?,?)').run('/','[]',0,JSON.stringify([{selector:'#main > section:nth-of-type(1) > p:nth-of-type(1)',kind:'text',value:'Latest published copy'}]),1,'now','owner');const s=await current();const response=await handleApi(request('GET','/api/studio/templates/preview?digest='+s.templates[1].digest+'&page=%2F'),env);expect(response.status).toBe(200);expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'none'");expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');expect(response.headers.get('Cache-Control')).toContain('no-store');const page=await response.text();expect(page).toContain('Latest published copy');expect(page).not.toContain('<script');expect(page).not.toContain('action=');expect(page).not.toContain('href="/kontakt/"');expect(page).toContain('disabled');});
 it('refuses private/external preview routes and oversized asset streams',async()=>{const s=await current();for(const path of ['/admin/','//evil.test/','/api/portal/session']){const response=await handleApi(request('GET','/api/studio/templates/preview?digest='+s.templates[1].digest+'&page='+encodeURIComponent(path)),env);expect(response.status).toBe(422);}env.ASSETS={fetch:async()=>new Response('x'.repeat(400001),{headers:{'Content-Type':'text/html'}})};expect((await handleApi(request('GET','/api/studio/templates/preview?digest='+s.templates[1].digest),env)).status).toBe(413);});
 it('rolls back only design, retaining newer CMS content and uploaded packages',async()=>{const first=await publish();await publish(2);const zip=await example();await call('POST','/upload',{zip});db.prepare('INSERT INTO studio_pages (page_path,draft_json,draft_version,published_json,published_version,updated_at,updated_by) VALUES (?,?,?,?,?,?,?)').run('/','[]',0,'[]',1,'now','owner');const latest=await current();const result=await call('POST','/rollback',{revision:first.result.body.version,version:latest.version,confirm:'ROLLBACK',idempotencyKey:crypto.randomUUID()});expect(result.status).toBe(200);expect(result.body.activeDigest).toBe(first.data.digest);expect(db.prepare('SELECT count(*) n FROM studio_pages').get()?.n).toBe(1);expect(db.prepare('SELECT count(*) n FROM studio_templates').get()?.n).toBe(1);const original=await call('POST','/rollback',{revision:0,version:result.body.version,confirm:'ROLLBACK',idempotencyKey:crypto.randomUUID()});expect(original.status).toBe(200);expect(await applyActiveTemplate(html,env.DB!)).toBe(html);});
 it('restores persisted design and immutable history from an actual SQLite backup',async()=>{await publish(2);await backup(db,join(folder,'backup.sqlite'));const restored=new DatabaseSync(join(folder,'backup.sqlite'));try{expect(await applyActiveTemplate(html,new LocalD1(restored))).toContain('knaba-modern');expect(restored.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');expect(restored.prepare('SELECT count(*) n FROM studio_template_history').get()?.n).toBe(2);}finally{restored.close();}});
 it('keeps state isolated between two site databases',async()=>{const other=openLocalDatabase(join(folder,'other.sqlite'));try{await publish();expect(await applyActiveTemplate(html,other.d1)).toBe(html);expect(other.db.prepare('SELECT count(*) n FROM studio_template_history').get()?.n).toBe(0);}finally{other.db.close();}});
 it('does not return304 from stale static validators and has matching GET/HEAD representation',async()=>{await publish();let sourceRequest:Request|undefined;env.ASSETS={fetch:async(req)=>{sourceRequest=req;return new Response(html,{headers:{'Content-Type':'text/html','ETag':'old','Last-Modified':'old','Content-Length':String(html.length)}});}};const get=await worker.fetch(new Request(origin+'/',{headers:{'If-None-Match':'old','If-Modified-Since':'old'}}),env);expect(get.status).toBe(200);expect(sourceRequest!.headers.has('if-none-match')).toBe(false);expect(sourceRequest!.headers.has('if-modified-since')).toBe(false);expect(get.headers.has('etag')).toBe(false);const page=await get.text();expect(page).toContain('knaba-business');const head=await worker.fetch(new Request(origin+'/',{method:'HEAD'}),env);expect(head.headers.get('Content-Length')).toBe(String(new TextEncoder().encode(page).length));expect(await head.text()).toBe('');});
 it('does not transform private pages',async()=>{await publish();const response=await worker.fetch(new Request(origin+'/studio/'),env);expect(await response.text()).toBe(html);expect(response.headers.get('Cache-Control')).toContain('private');});
 it('preserves exact Original source and validates changed shell structure',()=>{expect(renderTemplateHtml(html,BUILTIN_TEMPLATES[0])).toBe(html);expect(()=>renderTemplateHtml('broken',BUILTIN_TEMPLATES[1])).toThrow();});
});
