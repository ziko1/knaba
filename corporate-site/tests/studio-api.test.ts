import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleApi } from '../worker/api';
import type { D1Database, D1Result, D1Statement, WorkerEnv } from '../worker/types';

const uri='https://kneba.vsp.rest';
const editorSelector='#main > section:nth-of-type(1) > p:nth-of-type(1)';
const initial=[{selector:editorSelector,kind:'text',value:'Saubere Räume'}];
let sqlite:DatabaseSync;
let env:WorkerEnv;
function bridge(database:DatabaseSync):D1Database{
  function statement(query:string,values:unknown[]=[]):D1Statement{
    const prepare=()=>database.prepare(query);
    return {
      bind:(...v:unknown[])=>statement(query,v),
      first:async<T>()=>(prepare().get(...values as [])||null) as T|null,
      all:async<T>()=>({success:true,results:prepare().all(...values as []) as T[]}),
      run:async()=>{const info=prepare().run(...values as []);return {success:true,meta:{changes:Number(info.changes)}};}
    };
  }
  return {
    prepare:(q:string)=>statement(q),
    batch:async<T>(statements:D1Statement[]):Promise<D1Result<T>[]>=>{
      database.exec('BEGIN IMMEDIATE;');
      try{
        const replies: D1Result<T>[]=[];
        for(const stmt of statements)replies.push(await stmt.run() as D1Result<T>);
        database.exec('COMMIT;');return replies;
      }catch(error){database.exec('ROLLBACK;');throw error;}
    }
  };
}
function fixture(method:string,path:string,body?:unknown,actor:'owner'|'anonymous'|'admin'='owner',wrongOrigin=false):Request{
  const headers=new Headers();
  if(actor!=='anonymous'){
    headers.set('oai-authenticated-user-id',actor==='owner'?'owner-id':'admin-id');
    headers.set('oai-authenticated-user-email',actor==='owner'?'owner@example.test':'admin@example.test');
  }
  if(body!==undefined){
    headers.set('content-type','application/json');
    headers.set('origin',wrongOrigin?'https://evil.example':uri);
    headers.set('x-knaba-request','portal-v1');
    headers.set('sec-fetch-site',wrongOrigin?'cross-site':'same-origin');
  }
  return new Request(uri+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
async function invoke(method:string,path:string,body?:unknown,actor:'owner'|'anonymous'|'admin'='owner',wrongOrigin=false){
  const result=await handleApi(fixture(method,path,body,actor,wrongOrigin),env);
  return {status:result.status,body:await result.json() as Record<string,any>};
}
beforeEach(()=>{
  sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  for(const file of ['0000_needy_war_machine','0001_lazy_angel','0002_tense_mother_askani','0003_absurd_bedlam']){
    const sql=readFileSync(new URL('../drizzle/'+file+'.sql',import.meta.url),'utf8');
    sqlite.exec(sql.replaceAll('--> statement-breakpoint','\n'));
  }
  env={DB:bridge(sqlite),OWNER_EMAIL:'owner@example.test'};
  sqlite.prepare("INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES ('admin-id','Admin','admin@example.test','worker','admin','approved','test','test','test',1,'test')").run();
});
afterEach(()=>sqlite.close());
describe('KNABA Studio owner isolation + atomic draft/release',()=>{
  it('denies anonymous access, approved administrator and unauthenticated mutations',async()=>{
    expect((await invoke('GET','/api/studio/page?page=%2F',undefined,'anonymous')).status).toBe(401);
    expect((await invoke('GET','/api/studio/page?page=%2F',undefined,'admin')).status).toBe(403);
    expect((await invoke('POST','/api/studio/draft',{page:'/',version:0,entries:initial},'anonymous')).status).toBe(401);
    expect((await invoke('POST','/api/studio/draft',{page:'/',version:0,entries:initial},'admin')).status).toBe(403);
    expect((await invoke('POST','/api/studio/draft',{page:'/',version:0,entries:initial},'owner',true)).status).toBe(403);
  });
  it('keeps drafts private, requires confirmation, publishes atomically, handles retries',async()=>{
    expect((await invoke('GET','/api/studio/published?page=%2F',undefined,'anonymous')).body.entries).toEqual([]);
    const saved=await invoke('POST','/api/studio/draft',{page:'/',version:0,entries:initial});
    expect(saved.status).toBe(200);expect(saved.body.version).toBe(1);
    expect((await invoke('GET','/api/studio/published?page=%2F',undefined,'anonymous')).body.entries).toEqual([]);
    expect((await invoke('POST','/api/studio/publish',{page:'/',version:1})).status).toBe(422);
    expect((await invoke('POST','/api/studio/publish',{page:'/',version:1,confirm:'PUBLISH'})).status).toBe(200);
    const publicResponse=await handleApi(fixture('GET','/api/studio/published?page=%2F',undefined,'anonymous'),env);
    expect(publicResponse.headers.get('Cache-Control')).toContain('public');
    expect(publicResponse.headers.get('Vary')).toBeNull();
    const publicData=await invoke('GET','/api/studio/published?page=%2F',undefined,'anonymous');
    expect(publicData.body.entries).toEqual(initial);
    expect(publicData.body.version).toBe(1);
    expect((await invoke('POST','/api/studio/publish',{page:'/',version:1,confirm:'PUBLISH'})).body.unchanged).toBe(true);
    expect(sqlite.prepare("SELECT count(*) as n FROM studio_revisions WHERE action='published'").get()).toEqual({n:1});
  });
  it('returns 409 for stale edits, enables explicit restore without silently republishing',async()=>{
    await invoke('POST','/api/studio/draft',{page:'/',version:0,entries:initial});
    await invoke('POST','/api/studio/publish',{page:'/',version:1,confirm:'PUBLISH'});
    expect((await invoke('POST','/api/studio/draft',{page:'/',version:0,entries:[{...initial[0],value:'Wrong'}]})).status).toBe(409);
    expect((await invoke('POST','/api/studio/draft',{page:'/',version:1,entries:[{...initial[0],value:'New'}]})).body.version).toBe(2);
    const page=(await invoke('GET','/api/studio/page?page=%2F')).body;
    expect(page.draft[0].value).toBe('New');
    const published=page.history.find((h:any)=>h.action==='published');
    const restored=await invoke('POST','/api/studio/restore',{page:'/',version:2,revisionId:published.id});
    expect(restored.status).toBe(200);expect(restored.body.version).toBe(3);
    expect((await invoke('GET','/api/studio/published?page=%2F',undefined,'anonymous')).body.version).toBe(1);
    expect((await invoke('GET','/api/studio/page?page=%2F')).body.draft[0].value).toBe('Saubere Räume');
  });
  it('blocks markup injection and oversized bodies before any D1 change',async()=>{
    expect((await invoke('POST','/api/studio/draft',{page:'/',version:0,entries:[{...initial[0],value:'<iframe src=evil>'}]})).status).toBe(422);
    expect((await invoke('POST','/api/studio/draft',{page:'/',version:0,entries:[{...initial[0],value:'x'.repeat(33000)}]})).status).toBe(413);
    expect(sqlite.prepare('SELECT count(*) as n FROM studio_pages').get()).toEqual({n:0});
  });
  it('reports owner-only AI readiness without disclosing keys or making paid calls',async()=>{
    expect((await invoke('GET','/api/studio/ai-status',undefined,'anonymous')).status).toBe(401);
    expect((await invoke('GET','/api/studio/ai-status',undefined,'admin')).status).toBe(403);
    const initialStatus=await invoke('GET','/api/studio/ai-status');
    expect(initialStatus.status).toBe(200);
    expect(initialStatus.body.ready).toBe(false);
    env.STUDIO_AI_ENABLED='true';
    env.STUDIO_AI_APPROVED='true';
    env.STUDIO_AI_API_KEY='test-secret-NEVER-show';
    env.STUDIO_AI_MODEL='gpt-test';
    env.STUDIO_AI_QUOTA_CHECKED_AT=new Date().toISOString();
    env.STUDIO_AI_DAILY_BUDGET_CENTS='100';
    env.STUDIO_AI_REQUEST_COST_CAP_CENTS='10';
    const approved=await invoke('GET','/api/studio/ai-status');
    expect(approved.status).toBe(200);
    expect(approved.body.ready).toBe(true);
    expect(JSON.stringify(approved.body)).not.toContain('test-secret-NEVER-show');
    expect(sqlite.prepare('SELECT count(*) as n FROM studio_ai_budget').get()).toEqual({n:0});
    env.STUDIO_AI_QUOTA_CHECKED_AT='2020-01-01T00:00:00Z';
    expect((await invoke('GET','/api/studio/ai-status')).body.ready).toBe(false);
  });
  it('does not spend on AI without a fresh authorized quota and budget',async()=>{
    const result=await invoke('POST','/api/studio/assist',{selector:editorSelector,text:'Saubere Räume',instruction:'Make it simpler',locale:'de'});
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('ai_not_configured');
    expect(sqlite.prepare('SELECT count(*) as n FROM studio_ai_budget').get()).toEqual({n:0});
  });
  it('protects ERP/portal data and returns safe metadata',async()=>{
    await invoke('POST','/api/studio/draft',{page:'/ru/',version:0,entries:[{selector:'@title',kind:'text',value:'Уборка в Берлине'}]});
    const publicData=await invoke('GET','/api/studio/published?page=%2Fru%2F',undefined,'anonymous');
    expect(publicData.body).not.toHaveProperty('draft');
    expect(sqlite.prepare('SELECT count(*) as n FROM cleaning_requests').get()).toEqual({n:0});
    expect(sqlite.prepare('SELECT count(*) as n FROM profiles').get()).toEqual({n:1});
  });
});
