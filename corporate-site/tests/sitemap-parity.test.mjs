import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractSitemapRoutes, assessSitemapParity, SitemapParityError} from '../scripts/verify-sitemap-parity.mjs';

function sitemap(origin, paths) {
  return '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths.map(path=>'<url><loc>'+origin+path+'</loc></url>').join('') + '</urlset>';
}
const vsp='https://kneba.vsp.rest';
const official='https://knaba.de';
const paths=['/','/faq/','/en/','/en/faq/','/uk/','/uk/faq/','/ru/','/ru/faq/'];

test('rejects an 88 -> 72 URL drop, reporting all 16 absent routes',()=>{
  const current=Array.from({length:22},(_,i)=>'/guide-'+i+'/');
  const target=current.slice(0,18);
  const expand=routes=>['','/en','/uk','/ru'].flatMap(lang=>routes.map(p=>lang+p));
  assert.throws(
    ()=>assessSitemapParity(sitemap(vsp,expand(current)),sitemap(vsp,expand(target)),{currentOrigin:vsp,candidateOrigin:vsp}),
    error=>error instanceof SitemapParityError && error.code==='URL_REGRESSION' && error.missing.length===16
  );
});

test('accepts same-origin public route parity and reports added URLs',()=>{
  const result=assessSitemapParity(sitemap(vsp,paths),sitemap(vsp,[...paths,'/bauleistungen/']),{currentOrigin:vsp,candidateOrigin:vsp});
  assert.equal(result.status,'PASS');assert.equal(result.currentCount,8);
  assert.equal(result.candidateCount,9);assert.deepEqual(result.added,['/bauleistungen/']);
  assert.deepEqual(result.missing,[]);
});

test('compares canonical path identity across approved preview-to-official origin migration',()=>{
  const result=assessSitemapParity(sitemap(vsp,paths),sitemap(official,paths),{currentOrigin:vsp,candidateOrigin:official});
  assert.equal(result.missing.length,0);
});

test('rejects foreign hosts, duplicates, private pages, empty and malformed maps',()=>{
  assert.throws(()=>extractSitemapRoutes(sitemap('https://attacker.example',['/']),vsp),e=>e.code==='INVALID_URL');
  assert.throws(()=>extractSitemapRoutes(sitemap(vsp,['/','/']),vsp),e=>e.code==='DUPLICATE_URL');
  assert.throws(()=>extractSitemapRoutes(sitemap(vsp,['/studio/']),vsp),e=>e.code==='PRIVATE_ROUTE');
  assert.throws(()=>extractSitemapRoutes(sitemap(vsp,[]),vsp),e=>e.code==='EMPTY_SITEMAP');
  assert.throws(()=>extractSitemapRoutes('<urlset><loc>'+vsp+'/</loc>',vsp),e=>e.code==='INVALID_XML');
  assert.throws(()=>extractSitemapRoutes(sitemap(vsp,['/api/secret/']),vsp),e=>e.code==='PRIVATE_ROUTE');
});

test('fails closed on changed source input contracts',()=>{
  assert.throws(()=>assessSitemapParity(sitemap(vsp,paths),sitemap(vsp,paths),{currentOrigin:'http://kneba.vsp.rest',candidateOrigin:vsp}),e=>e.code==='INVALID_ORIGIN');
  assert.throws(()=>assessSitemapParity(sitemap(vsp,paths),sitemap(vsp,paths),{currentOrigin:vsp,candidateOrigin:'https://evil.example'}),e=>e.code==='INVALID_ORIGIN');
});
