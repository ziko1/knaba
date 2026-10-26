import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditPublicLinks} from '../scripts/audit-public-links.mjs';

const base='https://kneba.vsp.rest';
const route=(path)=>base+path;
function html(lang='de',body='<a href="/uk/">Українська</a><a href="#benefits">Benefits</a><section id="benefits"></section><img src="/images/logo.svg" alt="KNABA logo">'){
  return '<!doctype html><html lang="'+lang+'"><head><title>KNABA – '+lang+'</title>'+
   '<meta name="description" content="Professional construction services in Berlin and Brandenburg." />'+
   '<link rel="canonical" href="'+base+(lang==='uk'?'/uk/':'')+'"></head><body><h1>KNABA</h1>'+body+'</body></html>';
}
function mock(overrides={}){
  const seen=[];
  const resources={
    '/sitemap.xml':new Response('<urlset><url><loc>'+base+'/</loc></url><url><loc>'+base+'/uk/</loc></url></urlset>',{headers:{'content-type':'application/xml'}}),
    '/':new Response(html(),{headers:{'content-type':'text/html'}}),
    '/uk/':new Response(html('uk'),{headers:{'content-type':'text/html'}}),
    '/images/logo.svg':new Response('<svg xmlns="http://www.w3.org/2000/svg"/>',{headers:{'content-type':'image/svg+xml'}}),
    ...overrides,
  };
  return {seen,fetch:async(url,options)=>{
    seen.push({url,redirect:options.redirect,method:options.method});
    const path=new URL(url).pathname;
    return resources[path]||new Response('Not found',{status:404});
  }};
}
const codes=r=>r.issues.map(x=>x.code);

test('all published routes, fragments and media pass without third-party fetching',async()=>{
  const m=mock();
  const r=await auditPublicLinks({fetchImpl:m.fetch,expectedSitemapRoutes:2});
  assert.equal(r.outcome,'PASS');
  assert.equal(r.sitemapPages,2);
  assert.equal(r.checkedPages,2);
  assert.equal(r.checkedAssets,1);
  assert.deepEqual(r.issues,[]);
  assert.ok(m.seen.every(x=>x.url.startsWith(base+'/')));
  assert.ok(m.seen.every(x=>x.redirect==='manual'&&x.method==='GET'));
});

test('missing local fragment is a defect rather than false PASS',async()=>{
  const m=mock({'/':new Response(html('de','<a href="#missing">Jump</a>'),{headers:{'content-type':'text/html'}})});
  const r=await auditPublicLinks({fetchImpl:m.fetch,expectedSitemapRoutes:2});
  assert.ok(codes(r).includes('MISSING_FRAGMENT'));
  assert.equal(r.outcome,'FAIL');
});

test('old KNABA domain is reported and never requested',async()=>{
  const m=mock({'/':new Response(html('de','<a href="https://knaba.de/">Old page</a>'),{headers:{'content-type':'text/html'}})});
  const r=await auditPublicLinks({fetchImpl:m.fetch,expectedSitemapRoutes:2});
  assert.ok(codes(r).includes('LEGACY_DOMAIN_LINK'));
  assert.ok(m.seen.every(x=>!x.url.includes('knaba.de')));
});

test('broken internal page and local asset fail closed',async()=>{
  const m=mock({'/uk/':new Response('Missing',{status:404}),'/images/logo.svg':new Response('No image',{status:500})});
  const r=await auditPublicLinks({fetchImpl:m.fetch,expectedSitemapRoutes:2});
  assert.ok(codes(r).includes('BAD_PAGE_STATUS'));
  assert.ok(codes(r).includes('BAD_ASSET_STATUS'));
  assert.equal(r.outcome,'FAIL');
});

test('unexpected redirect and incomplete sitemap are not accepted',async()=>{
  const m=mock({'/':new Response(null,{status:302,headers:{location:'https://knaba.de/'}})});
  const r=await auditPublicLinks({fetchImpl:m.fetch,expectedSitemapRoutes:92});
  assert.ok(codes(r).includes('SITEMAP_ROUTE_COUNT'));
  assert.ok(codes(r).includes('BAD_PAGE_STATUS'));
  assert.equal(r.outcome,'FAIL');
});

test('loopback preview is explicit and external SSRF origins are rejected',async()=>{
  const m=mock();
  await assert.rejects(auditPublicLinks({testUrl:'https://attacker.invalid',fetchImpl:m.fetch}),/INVALID_AUDIT_ORIGIN/);
  await assert.rejects(auditPublicLinks({testUrl:'http://user:pass@localhost:8080/',fetchImpl:m.fetch}),/INVALID_AUDIT_ORIGIN/);
  await assert.rejects(auditPublicLinks({mode:'other',fetchImpl:m.fetch}),/INVALID_AUDIT_MODE/);
  await assert.rejects(auditPublicLinks({timeoutMs:50000,fetchImpl:m.fetch}),/INVALID_AUDIT_CONFIGURATION/);
  assert.equal(m.seen.length,0);
});

test('all discovered same-origin non-sitemap pages are audited',async()=>{
  const m=mock({'/':new Response(html('de','<a href="/extra/">More</a>'),{headers:{'content-type':'text/html'}}),
    '/extra/':new Response(html('de','<h2>Extra</h2>').replace('href="'+base+'"','href="'+base+'/extra/"'),{headers:{'content-type':'text/html'}})});
  const r=await auditPublicLinks({fetchImpl:m.fetch,expectedSitemapRoutes:2});
  assert.equal(r.extraPages,1);
  assert.equal(r.checkedPages,3);
  assert.equal(r.outcome,'PASS');
});

test('loopback preview audits production-canonical sitemap without fetching the live host',async()=>{
  const m=mock();
  const r=await auditPublicLinks({mode:'vsp',testUrl:'http://127.0.0.1:18769',fetchImpl:m.fetch,expectedSitemapRoutes:2});
  assert.equal(r.outcome,'PASS');
  assert.equal(r.checkedPages,2);
  assert.ok(m.seen.every(x=>x.url.startsWith('http://127.0.0.1:18769/')));
});

test('mixed-case javascript scheme is detected without navigation',async()=>{
  const m=mock({'/':new Response(html('de','<a href=" JaVaScRiPt:alert(1)">Unsafe</a>'),{headers:{'content-type':'text/html'}})});
  const r=await auditPublicLinks({fetchImpl:m.fetch,expectedSitemapRoutes:2});
  assert.equal(r.outcome,'FAIL');
  assert.ok(codes(r).includes('UNSAFE_JS_LINK'));
  assert.ok(m.seen.every(x=>x.url.startsWith(base+'/')));
});

test('malformed URL fragment reports a bounded defect rather than aborting the audit',async()=>{
  const m=mock({'/':new Response(html('de','<a href="/uk/#%ZZ">Invalid fragment</a>'),{headers:{'content-type':'text/html'}})});
  const r=await auditPublicLinks({fetchImpl:m.fetch,expectedSitemapRoutes:2});
  assert.equal(r.outcome,'FAIL');
  assert.ok(codes(r).includes('INVALID_FRAGMENT'));
  assert.equal(r.checkedPages,2);
});
