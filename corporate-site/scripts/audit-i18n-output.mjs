/**
 * KNABA translation release gate: check *published* public routes and approved
 * first-party branded SVG and raster assets. Pending targets cannot leak into SEO or URLs.
 * Run after the exact-source static build; fail-closed, no network or database.
 */
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {parse} from 'parse5';

const root=resolve('dist/client');
const official=process.env.KNABA_RELEASE_MODE==='official';
const socialOrigin=!official&&process.env.PUBLIC_KNABA_AUTH_MODE==='sites'
  ? new URL(process.env.PUBLIC_KNABA_ASSET_ORIGIN).origin
  : official?'https://knaba.de':'https://kneba.vsp.rest';
const brand=JSON.parse(readFileSync(new URL('../src/data/brand-messages.json',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(join(root,'languages.json'),'utf8'));
const published=Object.keys(brand);
const target=new Set(manifest.locales?.map(x=>x.code));
const fail=(msg)=>{throw new Error('KNABA I18N release gate: '+msg);};
const assert=(ok,msg)=>{if(!ok)fail(msg);};
assert(manifest.targets===99 && manifest.locales?.length===99 && target.size===99,'invalid 99-target manifest');
assert(published.length===manifest.published && manifest.pending===99-published.length,'readiness count drift');
assert(manifest.locales.filter(x=>x.status==='published').map(x=>x.code).join(',')===published.join(','),'published locale mismatch');

const getAttr=(node,key)=>node.attrs?.find(a=>a.name===key)?.value;
function nodes(root,name,out=[]){
  if(root.nodeName===name)out.push(root);
  for(const child of root.childNodes||[])nodes(child,name,out);
  return out;
}
let checkedPages=0,checkedAssets=0,checkedSocialAssets=0;
for(const code of published){
  const suffix=code==='de'?'':'-'+code;
  for(const page of ['/', '/kontakt/', '/leistungen/', '/planer/', '/faq/', '/unternehmen/']){
    const file=join(root,code==='de'?'':code,page.slice(1),'index.html');
    assert(existsSync(file),code+page+' missing HTML');
    const doc=parse(readFileSync(file,'utf8'));
    const html=nodes(doc,'html')[0];
    assert(getAttr(html,'lang')===code,code+page+' incorrect HTML lang');
    const metas=nodes(doc,'meta'),links=nodes(doc,'link'),images=nodes(doc,'img'),sources=nodes(doc,'source');
    const meta=(key)=>metas.find(x=>getAttr(x,'property')===key);
    const img=getAttr(meta('og:image'),'content')||'';
    assert(new URL(img).origin===socialOrigin,code+page+' wrong hosted social image origin');
    assert(new URL(img).pathname==='/images/knaba-social-'+code+'.png',code+page+' old/wrong social logo');
    assert(getAttr(meta('og:image:type'),'content')==='image/png',code+page+' wrong social MIME type');
    assert(getAttr(meta('og:image:width'),'content')==='1200'&&getAttr(meta('og:image:height'),'content')==='630',code+page+' wrong social image dimensions');
    assert(getAttr(meta('og:image:alt'),'content')?.includes(brand[code].slogan),code+page+' untranslated social label');
    const twitterImage=metas.find(x=>getAttr(x,'name')==='twitter:image');
    assert(getAttr(twitterImage,'content')===img,code+page+' social image mismatch');
    assert(images.some(x=>(getAttr(x,'src')||'').includes('/images/knaba-3d-header'+suffix+'.svg')),code+page+' wrong header');
    assert(images.some(x=>(getAttr(x,'src')||'').includes('/images/knaba-3d-footer'+suffix+'.svg')),code+page+' wrong footer');
    assert(sources.some(x=>(getAttr(x,'srcset')||'').includes('/images/knaba-3d-mobile-header'+suffix+'.svg')),code+page+' wrong mobile header');
    assert(sources.some(x=>(getAttr(x,'srcset')||'').includes('/images/knaba-3d-mobile-footer'+suffix+'.svg')),code+page+' wrong mobile footer');
    const alternates=links.filter(x=>getAttr(x,'rel')==='alternate').map(x=>getAttr(x,'hreflang'));
    for(const locale of published)assert(alternates.includes(locale),code+page+' missing reciprocal '+locale);
    assert(alternates.length===published.length+1,code+page+' unreviewed locale in hreflang');
    checkedPages++;
  }
  for(const surface of ['header','footer','mobile-header','mobile-footer']){
    const file=join(root,'images','knaba-3d-'+surface+suffix+'.svg');
    assert(existsSync(file),code+' missing '+surface+' brand asset');
    assert(statSync(file).size<15000,'brand asset too large');
    const art=readFileSync(file,'utf8');
    assert(art.includes(brand[code].svgDescription),code+' SVG description not localized');
    const desktop=surface==='header'||surface==='footer';
    assert(art.includes('>'+brand[code].slogan+'</text>')===desktop,code+' SVG visible slogan mismatch');
    assert(!/<script|<foreignObject|(?:href|src)="https?:/i.test(art),'active or external SVG content');
    checkedAssets++;
  }
  const raster=readFileSync(join(root,'images','knaba-social-'+code+'.png'));
  assert(raster.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),code+' invalid social PNG');
  assert(raster.length<200*1024&&raster.readUInt32BE(16)===1200&&raster.readUInt32BE(20)===630,code+' invalid social dimensions/size');
  checkedSocialAssets++;
}
for(const entry of manifest.locales.filter(x=>x.status==='pending')){
  assert(!Object.hasOwn(brand,entry.code),entry.code+' has unapproved brand');
  assert(!existsSync(join(root,entry.code,'index.html')),entry.code+' falsely published');
}
console.log(JSON.stringify({status:'PASS',targetLanguages:99,published:published.length,pending:manifest.pending,checkedPages,checkedSvgAssets:checkedAssets,checkedSocialAssets}));
