import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKnabaVpsServer} from './server.mjs';

const origin='https://kneba.vsp.rest';
const slug='baureinigung-planung',route='/wissen/'+slug+'/';
const text={
  title:'Baureinigung & Übergabe richtig planen',
  description:'So planen Sie die Baureinigung und den Bauhelfer-Einsatz in Berlin vor einer Übergabe ohne pauschale Leistungsversprechen.',
  body:'Eine Bauendreinigung wird gemeinsam mit der Bauleitung geplant. Saubere Bereiche müssen vor erneuter Verschmutzung geschützt werden.\n\nDie Reihenfolge hängt von der Bauphase und vom vereinbarten Leistungsumfang ab. Vor der Übergabe sollten Erreichbarkeit, Material und freigegebene Flächen abgestimmt werden. Ein Angebot wird individuell geprüft.'
};
const english={...text,title:'Construction cleaning & handover planning',
  description:'Practical, contract-dependent construction cleaning preparation for Berlin building managers and their partners.'};
test('published owner Studio knowledge pages are indexable HTML, linked from guides, and reflected atomically in sitemap',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'knaba-article-vps-'));
 const dbPath=join(dir,'db.sqlite');
 const app=await createKnabaVpsServer({dbPath,origin,localTest:true,
   staticRoot:new URL('../dist/client/',import.meta.url).pathname,
   workerPath:new URL('../dist/server/index.js',import.meta.url).href,
   host:'127.0.0.1',port:0});
 const fetchAt=(path,method='GET')=>fetch('http://127.0.0.1:'+app.port+path,{method,redirect:'manual',headers:{Host:'kneba.vsp.rest'}});
 const now=new Date().toISOString();
 const row=(path,article,published)=>app.db.prepare(
   'INSERT INTO studio_pages (page_path,draft_json,draft_version,published_json,published_version,updated_at,updated_by) VALUES (?,?,1,?,?,?,?)'
 ).run(path,JSON.stringify(article),published?JSON.stringify(article):'[]',published?1:0,now,'synthetic-owner');
 try {
   const xml0=await (await fetchAt('/sitemap.xml')).text();
   assert.equal((xml0.match(/<loc>/g)||[]).length,72);
   assert.equal((await fetchAt(route)).status,404);
   row(route,text,false);
   assert.equal((await fetchAt(route)).status,404,'draft-only content is not public');
   assert.ok(!(await (await fetchAt('/ratgeber/')).text()).includes('/wissen/'+slug+'/'));
   app.db.prepare('UPDATE studio_pages SET published_json=?,published_version=1 WHERE page_path=?')
     .run(JSON.stringify(text),route);
   const res=await fetchAt(route),html=await res.text();
   assert.equal(res.status,200);
   assert.equal(res.headers.get('x-robots-tag'),null);
   assert.match(res.headers.get('content-type')||'',/text\/html/);
   assert.match(html,/<title>Baureinigung &amp; Übergabe richtig planen<\/title>/);
   assert.match(html,/<h1[^>]*>Baureinigung &amp; Übergabe richtig planen<\/h1>/);
   assert.match(html,/<link rel="canonical" href="https:\/\/kneba\.vsp\.rest\/wissen\/baureinigung-planung\/"\s*\/?>/);
   assert.match(html,/<meta name="robots" content="index, follow, max-image-preview:large"/);
   assert.ok(!html.includes('https://knaba.de/wissen/'+slug+'/'));
   assert.match(html,/"@type":"Article"/);
   assert.ok(!html.includes('href="https://kneba.vsp.rest/en/wissen/'+slug+'/"'),'Do not invent unpublished translations');
   const head=await fetchAt(route,'HEAD');
   assert.equal(head.status,200);
   assert.equal(head.headers.get('content-length'),String(Buffer.byteLength(html)));
   assert.equal(await head.text(),'');
   const guide=await (await fetchAt('/ratgeber/')).text();
   assert.match(guide,/href="\/wissen\/baureinigung-planung\/"/);
   const map1=await (await fetchAt('/sitemap.xml')).text();
   assert.equal((map1.match(/<loc>/g)||[]).length,73);
   assert.ok(map1.includes('<loc>'+origin+route+'</loc>'));
   assert.ok(!map1.includes(origin+'/en/wissen/'+slug+'/'));
   row('/en/wissen/'+slug+'/',english,true);
   const en=await fetchAt('/en/wissen/'+slug+'/');
   assert.equal(en.status,200);
   assert.match(await en.text(),/<html lang="en">/);
   const xml2=await (await fetchAt('/sitemap.xml')).text();
   assert.equal((xml2.match(/<loc>/g)||[]).length,74);
   assert.ok(xml2.includes('hreflang="en" href="'+origin+'/en/wissen/'+slug+'/"'));
   assert.equal((await fetchAt('/sitemap.xml')).headers.get('cache-control'),'no-cache',
     'Dynamic owner publication must not be served with a 5-minute stale sitemap cache');
   assert.equal((await fetchAt('/uk/wissen/'+slug+'/')).status,404);
   // Bad data is never published even if a database row was tampered with.
   app.db.prepare('UPDATE studio_pages SET published_json=? WHERE page_path=?')
     .run('{"title":"<script>alert(1)</script>","description":"x","body":"x"}',route);
   assert.equal((await fetchAt(route)).status,404);
   // After a safe owner unpublish the document remains in draft history, not on the web.
   app.db.prepare("UPDATE studio_pages SET published_json='[]',published_version=0 WHERE page_path=?").run(route);
   assert.equal((await fetchAt(route)).status,404);
   const postUnpublishXml=await (await fetchAt('/sitemap.xml')).text();
   assert.ok(!postUnpublishXml.includes('<loc>'+origin+route+'</loc>'));
   assert.ok(postUnpublishXml.includes('<loc>'+origin+'/en/wissen/'+slug+'/</loc>'));
   const guideAfter=await (await fetchAt('/ratgeber/')).text();
   assert.ok(!guideAfter.includes('href="'+route+'"'));
   const persisted=app.db.prepare('SELECT draft_version,draft_json,published_version FROM studio_pages WHERE page_path=?').get(route);
   assert.equal(persisted.draft_version,1);
   assert.equal(persisted.published_version,0);
   assert.equal(JSON.parse(persisted.draft_json).title,text.title);
 } finally {
   await app.close();
   await rm(dir,{recursive:true,force:true});
 }
});
