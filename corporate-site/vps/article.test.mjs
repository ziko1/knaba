import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {addPublishedGuideLinks,expandPublishedSitemap,parseArticlePath,renderArticleDocument} from './articles.mjs';

const slug='baureinigung-planung',route='/wissen/'+slug+'/';
const text={
  title:'Baureinigung & Übergabe richtig planen',
  description:'So planen Sie die Baureinigung und den Bauhelfer-Einsatz in Berlin vor einer Übergabe ohne pauschale Leistungsversprechen.',
  body:'Eine Bauendreinigung wird gemeinsam mit der Bauleitung geplant. Saubere Bereiche müssen vor erneuter Verschmutzung geschützt werden.\n\nDie Reihenfolge hängt von der Bauphase und vom vereinbarten Leistungsumfang ab. Vor der Übergabe sollten Erreichbarkeit, Material und freigegebene Flächen abgestimmt werden. Ein Angebot wird individuell geprüft.'
};
const english={...text,title:'Construction cleaning & handover planning',
  description:'Practical, contract-dependent construction cleaning preparation for Berlin building managers and their partners.'};
const article=(path,content)=>({...parseArticlePath(path),...content});
const shell=(origin='https://preview.example.test')=>'<html lang="de"><head>'+
 '<title>Guides</title><meta name="description" content="Existing guide description">'+
 '<meta name="robots" content="noindex, follow">'+
 '<meta property="og:title" content="Guides"><meta property="og:description" content="Existing guide description">'+
 '<meta property="og:url" content="'+origin+'/ratgeber/"><meta property="og:type" content="website">'+
 '<link rel="canonical" href="'+origin+'/ratgeber/">'+
 '<link rel="alternate" hreflang="uk" href="'+origin+'/uk/ratgeber/">'+
 '<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'LocalBusiness','@id':origin+'/#business'}]})+'</script>'+
 '</head><body><main id="main" tabindex="-1"><h1>Guides</h1></main></body></html>';
test('article renderer escapes reviewed content, retains crawler policy and links only published translations',()=>{
 const published=article(route,text),en=article('/en'+route,english);
 const html=renderArticleDocument(shell(),published,[published,en]);
 assert.ok(html);
 assert.match(html,/<title>Baureinigung &amp; Übergabe richtig planen<\/title>/);
 assert.ok(html.includes('<meta name="robots" content="noindex, follow">'));
 assert.ok(html.includes('<link rel="canonical" href="https://preview.example.test'+route+'">'));
 assert.ok(html.includes('hreflang="en" href="https://preview.example.test/en'+route+'"'));
 assert.ok(!html.includes('hreflang="uk"'),'The shell must not invent an unpublished article translation');
 assert.match(html,/"@type":"Article"/);
 assert.match(html,/"@type":"LocalBusiness"/);
 const guides=addPublishedGuideLinks(shell(),'de',[published,en]);
 assert.ok(guides.includes('href="'+route+'">Baureinigung &amp; Übergabe richtig planen</a>'));
 assert.ok(!guides.includes('href="/en'+route+'"'));
});
test('article renderer rejects unsafe content and ambiguous or incomplete shell markup',()=>{
 const published=article(route,text),template=shell();
 assert.equal(renderArticleDocument(template,{...published,title:'<script>alert(1)</script>'},[published]),null);
 assert.equal(renderArticleDocument(template,{...published,path:'/admin/'},[published]),null);
 assert.equal(renderArticleDocument(template.replace('<title>Guides</title>',''),published,[published]),null);
 assert.equal(renderArticleDocument(template.replace('</head>','<title>Duplicate title</title></head>'),published,[published]),null);
 assert.equal(renderArticleDocument(template.replace('tabindex="-1"','tabindex="0"'),published,[published]),null);
 assert.equal(renderArticleDocument(template.replace('"@type":"LocalBusiness"','"@type":"WebPage"'),published,[published]),null);
});
test('article sitemap preserves an empty preview sitemap and expands only the matching canonical base',()=>{
 const origin='https://knaba.example.test',published=article(route,text),en=article('/en'+route,english);
 const empty='<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
 assert.equal(expandPublishedSitemap(empty,origin,[published,en]),empty);
 const base=empty.replace('</urlset>','<url><loc>'+origin+'/</loc></url></urlset>');
 assert.equal(expandPublishedSitemap(base,'https://preview.example.test',[published,en]),base);
 const expanded=expandPublishedSitemap(base,origin,[published,en]);
 assert.equal((expanded.match(/<loc>/g)||[]).length,3);
 assert.ok(expanded.includes('<loc>'+origin+route+'</loc>'));
 assert.ok(expanded.includes('hreflang="en" href="'+origin+'/en'+route+'"'));
 assert.ok(!expanded.includes('hreflang="uk"'));
});
test('published owner Studio knowledge pages retain runtime crawler policy, guide links and sitemap visibility',async()=>{
 const {createKnabaVpsServer}=await import('./server.mjs');
 const staticRoot=new URL('../dist/client/',import.meta.url).pathname;
 const template=await readFile(join(staticRoot,'ratgeber/index.html'),'utf8');
 const canonical=/<link rel="canonical" href="(https:\/\/[^"]+)"\s*\/?>/.exec(template);
 assert.ok(canonical,'The current build must provide a canonical guide shell');
 const origin=new URL(canonical[1]).origin;
 const dir=await mkdtemp(join(tmpdir(),'knaba-article-vps-'));
 const dbPath=join(dir,'db.sqlite');
 const app=await createKnabaVpsServer({dbPath,origin,localTest:true,
   staticRoot,
   workerPath:new URL('../dist/server/index.js',import.meta.url).href,
   host:'127.0.0.1',port:0});
 const fetchAt=(path,method='GET')=>fetch('http://127.0.0.1:'+app.port+path,{method,redirect:'manual',headers:{Host:new URL(origin).host}});
 const now=new Date().toISOString();
 const row=(path,article,published)=>app.db.prepare(
   'INSERT INTO studio_pages (page_path,draft_json,draft_version,published_json,published_version,updated_at,updated_by) VALUES (?,?,1,?,?,?,?)'
 ).run(path,JSON.stringify(article),published?JSON.stringify(article):'[]',published?1:0,now,'synthetic-owner');
 try {
   const xml0=await (await fetchAt('/sitemap.xml')).text();
   const initialCount=(xml0.match(/<loc>/g)||[]).length;
   const indexableSitemap=xml0.includes('<loc>'+origin+'/</loc>');
   const originalGuide=await fetchAt('/ratgeber/');
   assert.equal(originalGuide.status,200);
   const expectedRobots=originalGuide.headers.get('x-robots-tag');
   const robotsMeta=/<meta name="robots" content="[^"]*"\s*\/?>/.exec(template)?.[0];
   assert.equal((await fetchAt(route)).status,404);
   row(route,text,false);
   assert.equal((await fetchAt(route)).status,404,'draft-only content is not public');
   assert.ok(!(await (await fetchAt('/ratgeber/')).text()).includes('/wissen/'+slug+'/'));
   app.db.prepare('UPDATE studio_pages SET published_json=?,published_version=1 WHERE page_path=?')
     .run(JSON.stringify(text),route);
   const res=await fetchAt(route),html=await res.text();
   assert.equal(res.status,200);
   assert.equal(res.headers.get('x-robots-tag'),expectedRobots,'Article publication must preserve the current crawler gate');
   assert.equal(res.headers.get('cache-control'),'no-cache');
   assert.equal(res.headers.get('vary'),'Cookie');
   assert.match(res.headers.get('content-type')||'',/text\/html/);
   assert.match(html,/<title>Baureinigung &amp; Übergabe richtig planen<\/title>/);
   assert.match(html,/<h1[^>]*>Baureinigung &amp; Übergabe richtig planen<\/h1>/);
   assert.ok(html.includes('<link rel="canonical" href="'+origin+route+'">'));
   if(robotsMeta)assert.ok(html.includes(robotsMeta),'The article keeps the built robots metadata');
   assert.match(html,/"@type":"Article"/);
   assert.ok(!html.includes('href="'+origin+'/en/wissen/'+slug+'/"'),'Do not invent unpublished translations');
   const head=await fetchAt(route,'HEAD');
   assert.equal(head.status,200);
   assert.equal(head.headers.get('content-length'),String(Buffer.byteLength(html)));
   assert.equal(await head.text(),'');
   const guide=await (await fetchAt('/ratgeber/')).text();
   assert.match(guide,/href="\/wissen\/baureinigung-planung\/"/);
   const map1=await (await fetchAt('/sitemap.xml')).text();
   assert.equal((map1.match(/<loc>/g)||[]).length,initialCount+(indexableSitemap?1:0));
   assert.equal(map1.includes('<loc>'+origin+route+'</loc>'),indexableSitemap);
   assert.ok(!map1.includes(origin+'/en/wissen/'+slug+'/'));
   row('/en/wissen/'+slug+'/',english,true);
   const en=await fetchAt('/en/wissen/'+slug+'/');
   assert.equal(en.status,200);
   assert.match(await en.text(),/<html lang="en">/);
   const xml2=await (await fetchAt('/sitemap.xml')).text();
   assert.equal((xml2.match(/<loc>/g)||[]).length,initialCount+(indexableSitemap?2:0));
   assert.equal(xml2.includes('hreflang="en" href="'+origin+'/en/wissen/'+slug+'/"'),indexableSitemap);
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
   assert.equal(postUnpublishXml.includes('<loc>'+origin+'/en/wissen/'+slug+'/</loc>'),indexableSitemap);
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
