import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handleApi } from '../worker/api';
import type { D1Database, D1Statement, D1Result, WorkerEnv } from '../worker/types';

class SqliteD1 implements D1Database {
  sql = new DatabaseSync(':memory:');
  constructor() {
    this.sql.exec('PRAGMA foreign_keys=ON');
    for (const name of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
      this.sql.exec(readFileSync('drizzle/' + name, 'utf8'));
    }
  }
  prepare(sql: string): D1Statement {
    const db = this; let vals: unknown[] = [];
    return {
      bind(...v: unknown[]) { vals = v; return this; },
      async first<T>(column?: string) {
        const row = db.sql.prepare(sql).get(...vals as never[]) as Record<string, unknown> | undefined;
        return row ? (column ? row[column] : row) as T : null;
      },
      async all<T>() { return { success: true, results: db.sql.prepare(sql).all(...vals as never[]) as T[] }; },
      async run() { const r = db.sql.prepare(sql).run(...vals as never[]); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
  }
  async batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]> {
    this.sql.exec('BEGIN');
    try {
      const out: D1Result<T>[] = [];
      for (const statement of statements) out.push(await statement.run() as D1Result<T>);
      this.sql.exec('COMMIT'); return out;
    } catch (e) { this.sql.exec('ROLLBACK'); throw e; }
  }
}
const origin = 'https://kneba.vsp.rest';
function req(path: string, person?: 'owner' | 'admin' | 'client', method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
  const ids = { owner: ['owner-1','owner@example.test'], admin: ['admin-1','admin@example.test'], client: ['client-1','client@example.test'] };
  return new Request(origin + path, { method,
    headers: { 'Content-Type': 'application/json', 'Origin': origin, 'X-KnaBa-Request': 'portal-v1',
      ...(person ? {'oai-authenticated-user-id': ids[person][0], 'oai-authenticated-user-email': ids[person][1]} : {}), ...extra },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}) });
}
function setup() {
  const db = new SqliteD1();
  const env: WorkerEnv = { DB: db, OWNER_EMAIL: 'owner@example.test' };
  const now = new Date().toISOString();
  for (const [id, email, role] of [['admin-1','admin@example.test','admin'], ['client-1','client@example.test','client']] ) {
    db.sql.prepare("INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)")
      .run(id,'Name',email,'client',role,'approved','test',now,now,'seed');
  }
  return {db,env};
}
describe('KnaBa admin-only visual editor', () => {
  it('never serves editor API to anonymous visitors', async () => {
    const {db, env} = setup();
    try { expect((await handleApi(req('/api/editor/page?path=%2F'),env)).status).toBe(401); }
    finally { db.sql.close(); }
  });
  it('only owner or approved admin can read document state', async () => {
    const {db,env} = setup();
    try {
      expect((await handleApi(req('/api/editor/page?path=%2F','client'),env)).status).toBe(403);
      const r = await handleApi(req('/api/editor/page?path=%2F','owner'),env);
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({path:'/',version:0,draft:{},published:{}});
    } finally { db.sql.close(); }
  });
});

describe('editor lifecycle and security', () => {
  it('approved admin saves draft, owner publishes; content and audit are durable', async () => {
    const {db,env} = setup();
    try {
      const initial = await handleApi(req('/api/editor/draft','admin','PUT',
        {path:'/',version:0,blocks:{'h1-0':'Saubere Räume','p-0':'Ein Text für Besucher'}}),env);
      expect(initial.status,await initial.clone().text()).toBe(200);
      expect(await initial.json()).toMatchObject({
        path:'/',version:1,publishedVersion:0,
        draft:{'h1-0':'Saubere Räume','p-0':'Ein Text für Besucher'},published:{}
      });
      const published = await handleApi(req('/api/editor/publish','owner','POST',{path:'/',version:1}),env);
      expect(published.status,await published.clone().text()).toBe(200);
      expect(await published.json()).toMatchObject({
        version:2,publishedVersion:2,published:{'h1-0':'Saubere Räume','p-0':'Ein Text für Besucher'}
      });
      const read=await (await handleApi(req('/api/editor/page?path=%2F','admin'),env)).json();
      expect(read.history.map((r: {kind:string})=>r.kind)).toEqual(['publish','draft']);
      expect(db.sql.prepare('SELECT COUNT(*) AS n FROM cms_history').get()).toMatchObject({n:2});
    } finally {db.sql.close();}
  });
  it('optimistic locking rejects stale edits and prevents publish of stale draft',async()=>{
    const {db,env}=setup();
    try {
      const edit=()=>handleApi(req('/api/editor/draft','admin','PUT',{path:'/',version:0,blocks:{'p-0':'Text'}}),env);
      expect((await edit()).status).toBe(200);
      const stale=await edit();
      expect(stale.status).toBe(409);
      expect((await handleApi(req('/api/editor/publish','owner','POST',{path:'/',version:0}),env)).status).toBe(422);
      const result=await handleApi(req('/api/editor/publish','owner','POST',{path:'/',version:1}),env);
      expect(result.status,await result.clone().text()).toBe(200);
    } finally {db.sql.close();}
  });
  it('rejects invalid route, script HTML, unsafe metadata and cross-origin writes',async()=>{
    const {db,env}=setup();
    try{
      for(const path of ['/portal/','/impressum/','/api/leads','/ru/konto/','/editor/','https://evil.test/']) {
        expect((await handleApi(req('/api/editor/draft','owner','PUT',{path,version:0,blocks:{'p-0':'Hi'}}),env)).status).toBe(422);
      }
      for(const blocks of [{ 'p-0':'<img src=x onerror=alert(1)>' },{'p-0':'a\u0000b'},{'style-0':'display:none'},{'p-0':14}]) {
        expect((await handleApi(req('/api/editor/draft','owner','PUT',{path:'/',version:0,blocks}),env)).status).toBe(422);
      }
      expect((await handleApi(req('/api/editor/draft','owner','PUT',{path:'/',version:0,blocks:{}},
        {Origin:'https://attacker.example'}),env)).status).toBe(403);
      expect((await handleApi(req('/api/editor/draft','owner','PUT',{path:'/',version:0,blocks:{}},
        {'X-KnaBa-Request':'evil'}),env)).status).toBe(403);
      expect((await handleApi(req('/api/editor/draft','client','PUT',{path:'/',version:0,blocks:{}}),env)).status).toBe(403);
      expect(db.sql.prepare('SELECT COUNT(*) AS n FROM cms_pages').get()).toMatchObject({n:0});
    } finally {db.sql.close();}
  });
  it('suspended admin cannot edit even with stale role and approved status changes',async()=>{
    const {db,env}=setup();
    try{
      expect((await handleApi(req('/api/editor/page?path=%2F','admin'),env)).status).toBe(200);
      db.sql.prepare("UPDATE profiles SET status='suspended' WHERE id='admin-1'").run();
      expect((await handleApi(req('/api/editor/page?path=%2F','admin'),env)).status).toBe(403);
      expect((await handleApi(req('/api/editor/draft','admin','PUT',{path:'/',version:0,blocks:{}}),env)).status).toBe(403);
    } finally {db.sql.close();}
  });
  it('restores a prior published revision as a draft without changing currently published content',async()=>{
    const {db,env}=setup();
    try{
      const call=(path:string,method:string,body:unknown)=>handleApi(req(path,'owner',method,body),env);
      expect((await call('/api/editor/draft','PUT',{path:'/',version:0,blocks:{'p-0':'Original'}})).status).toBe(200);
      expect((await call('/api/editor/publish','POST',{path:'/',version:1})).status).toBe(200);
      expect((await call('/api/editor/draft','PUT',{path:'/',version:2,blocks:{'p-0':'Updated'}})).status).toBe(200);
      expect((await call('/api/editor/publish','POST',{path:'/',version:3})).status).toBe(200);
      const restore=await call('/api/editor/restore','POST',{path:'/',version:4,revision:2});
      expect(restore.status,await restore.clone().text()).toBe(200);
      expect(await restore.json()).toMatchObject({version:5,draft:{'p-0':'Original'},published:{'p-0':'Updated'}});
      expect((await call('/api/editor/restore','POST',{path:'/',version:5,revision:1234})).status).toBe(404);
    } finally{db.sql.close();}
  });
});

describe('Worker route is guarded before static editor HTML',()=>{
  it('blocks direct editor HTML and draft preview for guests and clients', async()=>{
    const {db,env}=setup();
    try {
      env.ASSETS = {fetch: async()=>new Response('<html><body><main><h1>Hello</h1></main></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})};
      const worker=(await import('../worker/index')).default;
      for (const visitor of [undefined,'client'] as const) {
        expect((await worker.fetch(req('/editor/',visitor),env)).status).toBe(404);
        expect((await worker.fetch(req('/editor/index.html',visitor),env)).status).toBe(404);
        expect((await worker.fetch(req('/?cms-preview=1',visitor),env)).status).toBe(404);
      }
      const authorized=await worker.fetch(req('/editor/','owner'),env);
      expect(authorized.status).toBe(200);
      expect(authorized.headers.get('cache-control')).toContain('no-store');
      expect(authorized.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }finally{db.sql.close();}
  });
  it('keeps regular pages available to unauthenticated visitors', async()=>{
    const {db,env}=setup();
    try {
      env.ASSETS = {fetch: async()=>new Response('hello from KnaBa',{headers:{'Content-Type':'text/plain'}})};
      const worker=(await import('../worker/index')).default;
      const publicPage=await worker.fetch(req('/'),env);
      expect(publicPage.status).toBe(200);
      expect(await publicPage.text()).toBe('hello from KnaBa');
    }finally{db.sql.close();}
  });
});
