import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {buildCatalog,validatePack,makeDraft,germanPathsFromSitemap,catalogFromDist} from '../scripts/i18n-source-catalog.mjs';

const fixture='<!doctype html><html lang="de"><head><title>KNABA Bauarbeiten</title><meta name="description" content="Wir helfen Ihrem Projekt."></head><body>'+
'<header><a href="/kontakt/" aria-label="Anfrage öffnen">Kontakt</a></header>'+
'<main><h1>Baureinigung und Bauhilfe</h1><p>Kontakt</p><input placeholder="Ihr Name" />'+
'<p>Für {company} in Berlin</p><script>SECRET_DYNAMIC_CONTENT</script>'+
'<style>.x{content:"Private literal"}</style></main><footer><span>Kontakt</span></footer></body></html>';
const catalog=()=>buildCatalog([{path:'/',html:fixture},{path:'/kontakt/',html:fixture.replace('Bauhilfe','Bauprojekt')}]);
const codes=['de','en','uk','ru','fr','ar'];
function packComplete(c,language='fr'){
 const draft=makeDraft(c,language,codes);
 for(const [id,unit] of Object.entries(c.units))draft.translations[id]=unit.source;
 draft.brand={descriptor:'KNABA – nettoyage de chantier',slogan:'Notre objectif est de créer de la valeur pour vous.',svgDescription:'Trois bâtiments et symbole KNABA'};
 return draft;
}

test('extracts public HTML headings, metadata, ARIA, placeholders, not code or URLs',()=>{
 const c=catalog();const entries=Object.values(c.units).map(x=>x.source);
 for(const text of ['KNABA Bauarbeiten','Wir helfen Ihrem Projekt.','Anfrage öffnen','Kontakt','Baureinigung und Bauhilfe','Ihr Name','Für {company} in Berlin'])
   assert.ok(entries.includes(text),'missing '+text);
 for(const text of ['SECRET_DYNAMIC_CONTENT','Private literal','/kontakt/'])assert.ok(!entries.includes(text),text+' leaked');
 assert.equal(c.sourceLocale,'de');
 assert.equal(c.routes.length,2);
 assert.equal(new Set(Object.keys(c.units)).size,Object.keys(c.units).length);
 assert.equal(c.scope,'public-html-only');
});
test('deduplicates repeated labels but changes digest for new source copy',()=>{
 const original=catalog();
 assert.equal(Object.values(original.units).filter(u=>u.source==='Kontakt').length,1);
 assert.equal(original.sourceDigest,catalog().sourceDigest);
 const changed=buildCatalog([{path:'/',html:fixture.replace('Ihr Name','Ihre Anschrift')}]);
 assert.notEqual(changed.sourceDigest,original.sourceDigest);
});
test('reads only first-party published German sitemap paths; no external or private locations',()=>{
 const xml='<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://kneba.vsp.rest/</loc></url><url><loc>https://kneba.vsp.rest/en/</loc></url>'+
 '<url><loc>https://kneba.vsp.rest/leistungen/</loc></url><url><loc>https://knaba.de/</loc></url><url><loc>https://kneba.vsp.rest/admin/</loc></url>'+
 '<url><loc>https://kneba.vsp.rest/konto/</loc></url><url><loc>https://kneba.vsp.rest/leistungen/</loc></url></urlset>';
 assert.deepEqual(germanPathsFromSitemap(xml,'https://kneba.vsp.rest'),['/','/leistungen/']);
});
test('a draft is incomplete and never becomes a published language',()=>{
 const c=catalog(),draft=makeDraft(c,'fr',codes),report=validatePack(c,draft,codes);
 assert.equal(report.status,'INCOMPLETE');
 assert.ok(report.missingCount>0);
 assert.equal(draft.sourceDigest,c.sourceDigest);
 assert.equal(draft.review.state,'not-reviewed');
 assert.equal(report.published,false);
 assert.ok(!Object.hasOwn(draft,'published'));
});
test('100% static translation remains blocked on dynamic, legal, real reviewer and device gates',()=>{
 const c=catalog(),draft=packComplete(c);
 const report=validatePack(c,draft,codes);
 assert.equal(report.coveragePercent,100);
 assert.equal(report.missingCount,0);
 assert.equal(report.status,'REVIEW_REQUIRED');
 assert.equal(report.published,false);
 assert.ok(report.blockers.includes('DYNAMIC_AND_HUMAN_REVIEW_REQUIRED'));
});
test('stale source rejects even all translations; never silently accepts old packs',()=>{
 const c=catalog(),draft=packComplete(c);
 draft.sourceDigest='0'.repeat(64);
 const report=validatePack(c,draft,codes);
 assert.equal(report.status,'INVALID');
 assert.ok(report.errors.includes('SOURCE_DIGEST_MISMATCH'));
});
test('rejects unsupported locales and malformed or unknown strings, XSS, changed placeholders',()=>{
 const c=catalog();
 const invalid=makeDraft(c,'xx',codes);
 assert.equal(validatePack(c,invalid,codes).status,'INVALID');
 const draft=packComplete(c);
 const [id]=Object.entries(c.units).find(([_,u])=>u.source.includes('{company}'));
 draft.translations[id]='Pour {client} à Berlin';
 assert.equal(validatePack(c,draft,codes).status,'INVALID');
 draft.translations[id]='Pour {company} à Berlin';
 draft.translations[Object.keys(c.units)[0]]='<script>alert(1)</script>';
 assert.equal(validatePack(c,draft,codes).status,'INVALID');
 draft.translations[Object.keys(c.units)[0]]='Texte vérifié';
 draft.translations.unexpected='stray';
 assert.equal(validatePack(c,draft,codes).status,'INVALID');
});
test('never uses translated business contacts or unsafe browser markup as a replacement payload',()=>{
 const c=catalog(),draft=packComplete(c,'ar');
 const htmlToken=Object.keys(c.units)[0];
 draft.translations[htmlToken]='<img src=x onerror=alert(1)>';
 assert.ok(validatePack(c,draft,codes).errors.some(e=>e.startsWith('HTML_FORBIDDEN')));
});

test('adds legally required public routes and the account entry without mixing private admin',()=>{
 const root=mkdtempSync(join(tmpdir(),'knaba-i18n-test-'));
 try{
  writeFileSync(join(root,'sitemap.xml'),'<urlset><url><loc>https://kneba.vsp.rest/</loc></url></urlset>');
  writeFileSync(join(root,'index.html'),fixture);
  for(const path of ['datenschutz','impressum','konto','admin']){
   mkdirSync(join(root,path));
   writeFileSync(join(root,path,'index.html'),fixture.replace('Kontakt','Inhalt '+path));
  }
  const c=catalogFromDist(root);
  assert.deepEqual(c.routes,['/','/datenschutz/','/impressum/','/konto/']);
  assert.ok(!c.routes.includes('/admin/'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
