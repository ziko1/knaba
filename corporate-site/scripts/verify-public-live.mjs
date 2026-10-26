import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Read-only live HTTP gate. Complements (never replaces) immutable artifact QA.
const origins = Object.freeze({vsp:'https://kneba.vsp.rest', official:'https://knaba.de'});
const locales = Object.freeze([{lang:'de',p:''},{lang:'en',p:'/en'},{lang:'uk',p:'/uk'},{lang:'ru',p:'/ru'}]);
const partnerIds = ['official-01','official-02','hit','stromkreis','gewobag'];

async function readBounded(response) {
  if (!response.body) return '';
  const reader=response.body.getReader(),chunks=[];
  let bytes=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      bytes+=value.byteLength;
      if (bytes>512000) throw new Error('BODY_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  } finally {await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks).toString('utf8');
}

function inspect(html,lang,kind) {
  const errors=[];
  if ((/<html\b[^>]*\blang=["']([^"']+)["']/i.exec(html)||[])[1]!==lang) errors.push('WRONG_HTML_LANG');
  for(const item of locales) if(!html.includes('hreflang="'+item.lang+'"')&&!html.includes("hreflang='"+item.lang+"'"))
    errors.push('MISSING_HREFLANG_'+item.lang.toUpperCase());
  if(/<a\b[^>]*\bhref=["']https?:\/\/(?:www\.)?knaba\.de(?:[\/?#"'])/i.test(html))
    errors.push('LEGACY_OUTBOUND_LINK');
  if(/Переглянути партнерів на knaba\.de|Stand des Quellenabgleichs|Дата сверки с источником|Джерело перевірено\s+\d/i.test(html))
    errors.push('INTERNAL_RESEARCH_NOTICE');
  if(!/<footer\b/i.test(html)) errors.push('FOOTER_MISSING');
  if(kind==='home') {
    const found=[...html.matchAll(/<li\b[^>]*\bdata-partner-id=["']([^"']+)["']/gi)].map(x=>x[1]);
    if(JSON.stringify(found)!==JSON.stringify(partnerIds)) errors.push('PARTNERS_NOT_FIVE_IN_ORDER');
    const dest=(lang==='de'?'':'/'+lang)+'/galerie/';
    if(!html.includes('href="'+dest+'"')&&!html.includes("href='"+dest+"'"))
      errors.push('GALLERY_NAV_MISSING');
  } else {
    if(!/\bclass=["'][^"']*\bknaba-gallery-grid\b/.test(html)) errors.push('GALLERY_CONTENT_MISSING');
    if(!/<h1\b[^>]*\bid=["']knaba-gallery-title["']/.test(html)) errors.push('GALLERY_HEADING_MISSING');
    if((html.match(/class=["']knaba-gallery-card["']/g)||[]).length!==4) errors.push('GALLERY_CARDS_NOT_FOUR');
  }
  return errors;
}

export async function verifyPublicLive({mode='vsp',fetchImpl=globalThis.fetch,timeoutMs=8000}={}) {
  if(!Object.hasOwn(origins,mode)||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)
    throw new TypeError('INVALID_GATE_CONFIGURATION');
  const origin=origins[mode],checks=[];
  async function probe(path,kind,lang) {
    const errors=[];let status=null;
    try {
      const response=await fetchImpl(origin+path,{
        method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
        headers:{accept:kind==='page'?'text/html':'text/plain','user-agent':'KNABA-release-verifier/1.0'},
      });
      status=response.status;
      if(status!==200) errors.push('HTTP_'+status);
      if(status===200&&kind==='page') {
        if(!response.headers.get('content-type')?.toLowerCase().includes('text/html')) errors.push('NOT_HTML');
        errors.push(...inspect(await readBounded(response),lang,path.endsWith('/galerie/')?'gallery':'home'));
      } else await response.body?.cancel().catch(()=>{});
    } catch(error) {
      errors.push(error?.message==='BODY_TOO_LARGE'?'BODY_TOO_LARGE':'FETCH_FAILED');
    }
    checks.push({path,status,result:errors.length?'FAIL':'PASS',errors});
  }
  for(const {lang,p} of locales) {
    await probe(p+'/','page',lang);
    await probe(p+'/galerie/','page',lang);
  }
  await probe('/healthz','health');
  await probe('/readyz','ready');
  return {
    scope:'PUBLIC_HTTP_ONLY',mode,origin,
    outcome:checks.every(x=>x.result==='PASS')?'PASS_HTTP':'FAIL',
    checks,releaseSha:null,releaseShaStatus:'UNKNOWN_REQUIRES_IMMUTABLE_ARTIFACT_ATTESTATION',
    deviceVisualStatus:'NOT_RUN',partnerImageRightsStatus:'NOT_VERIFIED',customerReady:false
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result=await verifyPublicLive({mode:process.env.KNABA_RELEASE_MODE||'vsp'});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.outcome!=='PASS_HTTP') process.exitCode=1;
  } catch(error) {
    process.stderr.write(JSON.stringify({outcome:'BLOCKED',error:error.message})+'\n');
    process.exitCode=2;
  }
}
