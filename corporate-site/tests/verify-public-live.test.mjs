import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublicLive} from '../scripts/verify-public-live.mjs';

const langs=['de','en','uk','ru'];
const ids=['official-01','official-02','hit','stromkreis','gewobag'];
function markup(lang,gallery=false,{cards=ids,legacy=false,missingAlt=false}={}) {
  const alternates=langs.filter(x=>!missingAlt||x!=='ru')
    .map(x=>'<link hreflang="'+x+'" rel="alternate">').join('');
  const path=(lang==='de'?'':'/'+lang)+'/galerie/';
  const content=gallery
    ? '<section><h1 id="knaba-gallery-title">Gallery</h1><ul class="knaba-gallery-grid">'
       +Array(4).fill('<li class="knaba-gallery-card">Work</li>').join('')+'</ul></section>'
    : '<a href="'+path+'">Gallery</a><ul>'+cards.map(id=>'<li data-partner-id="'+id+'">Logo</li>').join('')+'</ul>';
  return '<html lang="'+lang+'"><head>'+alternates+'</head><body>'+content
    +(legacy?'<a href="https://knaba.de/">old</a>':'')+'<footer>Footer</footer></body></html>';
}
function mock({cards=ids,ready=200,gallery=200,legacy=false,missingAlt=false,fail=null,large=false}={}) {
  return async url=>{
    const path=new URL(url).pathname;
    if(path===fail) throw Error('network');
    if(path==='/readyz') return new Response(ready===503?'owner enrollment required':'ready',{status:ready});
    if(path==='/healthz') return new Response('healthy',{status:200});
    const lang=(path.match(/^\/(en|uk|ru)\//)||[])[1]||'de';
    const g=path.endsWith('/galerie/');
    if(g&&gallery!==200) return new Response('missing',{status:gallery});
    return new Response(large?'x'.repeat(512001):markup(lang,g,{cards,legacy,missingAlt}),{
      status:200,headers:{'content-type':'text/html; charset=utf-8'}
    });
  };
}
const issues=r=>r.checks.flatMap(c=>c.errors);
test('synthetic public HTTP PASS remains distinct from customer readiness',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock()});
  assert.equal(r.outcome,'PASS_HTTP');assert.equal(r.checks.length,10);
  assert.equal(r.customerReady,false);assert.equal(r.releaseSha,null);
});
test('only three logos: four language homes fail closed',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock({cards:ids.slice(2)})});
  assert.equal(r.outcome,'FAIL');
  assert.equal(issues(r).filter(x=>x==='PARTNERS_NOT_FIVE_IN_ORDER').length,4);
});
test('/readyz 503 fails even if /healthz 200',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock({ready:503})});
  assert.deepEqual(r.checks.at(-1).errors,['HTTP_503','OWNER_ENROLLMENT_REQUIRED']);
});
test('four missing galleries are not accepted',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock({gallery:404})});
  assert.equal(issues(r).filter(x=>x==='HTTP_404').length,4);
});
test('legacy outbound navigation and missing locale are blocked',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock({legacy:true,missingAlt:true})});
  assert.ok(issues(r).includes('LEGACY_OUTBOUND_LINK'));
  assert.ok(issues(r).includes('MISSING_HREFLANG_RU'));
});
test('network failures and oversized HTML are fail-closed',async()=>{
  const a=await verifyPublicLive({fetchImpl:mock({fail:'/uk/galerie/'})});
  const b=await verifyPublicLive({fetchImpl:mock({large:true})});
  assert.ok(issues(a).includes('FETCH_FAILED'));
  assert.ok(issues(b).includes('BODY_TOO_LARGE'));
});
test('invalid mode and unbounded timeout never fetch',async()=>{
  await assert.rejects(verifyPublicLive({mode:'other'}),/INVALID_GATE_CONFIGURATION/);
  await assert.rejects(verifyPublicLive({timeoutMs:20000}),/INVALID_GATE_CONFIGURATION/);
});
