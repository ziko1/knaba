import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublicLive} from '../scripts/verify-public-live.mjs';

const langs=['de','en','uk','ru'];
const ids=['official-01','official-02','hit','stromkreis','gewobag'];
const images=['/images/partners/goldbeck.jpg','/images/partners/bonava.jpg','/images/partners/hit.png','/images/partners/stromkreis.png','/images/partners/gewobag.png'];
const carouselPaths=['bauzwischenreinigung','bauendreinigung','baustellenraeumung',
  'bauhilfe','kernbohrungen','durchbrueche','zusatzarbeiten']
  .map(name=>'/illustrations/carousel/'+name+'.webp');

function markup(lang,gallery=false,{cards=ids,legacy=false,missingAlt=false,unsafeMedia=false,noImage=false,noArt=false}={}) {
  const alternates=langs.filter(x=>!missingAlt||x!=='ru')
    .map(x=>'<link hreflang="'+x+'" rel="alternate">').join('');
  const path=(lang==='de'?'':'/'+lang)+'/galerie/';
  const content=gallery
    ? '<section><h1 id="knaba-gallery-title">Gallery</h1><ul class="knaba-gallery-grid">'
       +Array(4).fill('<li class="knaba-gallery-card">Work</li>').join('')+'</ul></section>'
    : '<a href="'+path+'">Gallery</a><ul>'+cards.map((id,i)=>'<li data-partner-id="'+id+'">'+(noImage?'':('<img src="'+(unsafeMedia&&i===0?'https://attacker.invalid/other.png':images[i])+'" alt="Logo">'))+'</li>').join('')+'</ul>'+(noArt?'':carouselPaths.map(src=>'<img src="'+src+'" alt="">').join(''));
  return '<html lang="'+lang+'"><head>'+alternates+'</head><body>'+content
    +(legacy?'<a href="https://knaba.de/">old</a>':'')+'<footer>Footer</footer></body></html>';
}
function mock({cards=ids,ready=200,gallery=200,legacy=false,missingAlt=false,fail=null,large=false,media=206,badMime=false,badMagic=false,unsafeMedia=false,noImage=false,noArt=false,seen=[]}={}) {
  return async url=>{
    seen.push(url);
    const mediaPath=new URL(url).pathname;
    if(images.includes(mediaPath)||carouselPaths.includes(mediaPath)){
      const isArt=carouselPaths.includes(mediaPath);
      const signature=badMagic?new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12])
        :isArt?new TextEncoder().encode('RIFF1234WEBP')
        :new Uint8Array([137,80,78,71,13,10,26,10,0]);
      return new Response(signature,{status:media,
        headers:{'content-type':badMime?'text/html':isArt?'image/webp':'image/png'}});
    }
    const path=new URL(url).pathname;
    if(path===fail) throw Error('network');
    if(path==='/readyz') return new Response(ready===503?'owner enrollment required':'ready',{status:ready});
    if(path==='/healthz') return new Response('healthy',{status:200});
    const lang=(path.match(/^\/(en|uk|ru)\//)||[])[1]||'de';
    const g=path.endsWith('/galerie/');
    if(g&&gallery!==200) return new Response('missing',{status:gallery});
    return new Response(large?'x'.repeat(512001):markup(lang,g,{cards,legacy,missingAlt,unsafeMedia,noImage,noArt}),{
      status:200,headers:{'content-type':'text/html; charset=utf-8'}
    });
  };
}
const issues=r=>r.checks.flatMap(c=>c.errors);
test('synthetic public HTTP PASS remains distinct from customer readiness',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock()});
  assert.equal(r.outcome,'PASS_HTTP');assert.equal(r.checks.length,22);
  assert.equal(r.customerReady,false);assert.equal(r.releaseSha,null);
});
test('only three logos: four language homes fail closed',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock({cards:ids.slice(2)})});
  assert.equal(r.outcome,'FAIL');
  assert.equal(issues(r).filter(x=>x==='PARTNERS_NOT_FIVE_IN_ORDER').length,4);
});
test('/readyz 503 fails even if /healthz 200',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock({ready:503})});
  assert.deepEqual(r.checks.find(c=>c.path==='/readyz').errors,['HTTP_503','OWNER_ENROLLMENT_REQUIRED']);
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


test('broken local asset HTTP500 rejects otherwise healthy web release',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock({media:500})});
  assert.equal(r.outcome,'FAIL');
  assert.equal(issues(r).filter(e=>e==='HTTP_500').length,12);
});
test('bad image MIME or signature is not a logo PASS',async()=>{
  const a=await verifyPublicLive({fetchImpl:mock({badMime:true})});
  const b=await verifyPublicLive({fetchImpl:mock({badMagic:true})});
  assert.equal(issues(a).filter(e=>e==='BAD_PARTNER_IMAGE').length,5);
  assert.equal(issues(b).filter(e=>e==='BAD_PARTNER_IMAGE').length,5);
  assert.equal(issues(a).filter(e=>e==='BAD_CAROUSEL_IMAGE').length,7);
  assert.equal(issues(b).filter(e=>e==='BAD_CAROUSEL_IMAGE').length,7);
});
test('untrusted image origin is refused without contacting it',async()=>{
  const seen=[];
  const r=await verifyPublicLive({fetchImpl:mock({unsafeMedia:true,seen})});
  assert.ok(issues(r).includes('UNSAFE_OR_MISSING_PARTNER_ASSET'));
  assert.equal(seen.filter(x=>x.startsWith('https://attacker.invalid')).length,0);
});
test('missing images in all five valid cards blocks release',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock({noImage:true})});
  assert.equal(r.outcome,'FAIL');
  assert.ok(issues(r).includes('PARTNER_IMAGES_MISSING'));
});

test('seven WebP assets are validated as exactly ordered first-party paths',async()=>{
  const r=await verifyPublicLive({fetchImpl:mock()});
  assert.deepEqual(r.checks.filter(c=>c.path.startsWith('carousel-image:'))
    .map(c=>c.result),Array(7).fill('PASS'));
  const missing=await verifyPublicLive({fetchImpl:mock({noArt:true})});
  assert.equal(missing.outcome,'FAIL');
  assert.equal(issues(missing).filter(e=>e==='CAROUSEL_MEDIA_NOT_SEVEN_IN_ORDER').length,4);
});
