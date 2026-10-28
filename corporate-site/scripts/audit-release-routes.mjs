// Read-only inventory. An HTTP/static PASS never implies role or browser acceptance.
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {resolve, relative, join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parse} from 'parse5';
const args=process.argv.slice(2);
const value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const mode=value('--mode','vsp');
if(!['vsp','official'].includes(mode))throw Error('Unsupported mode');
const live=args.includes('--live');
if(live&&mode!=='vsp')throw Error('Live audit is restricted to authorized staging');
const root=resolve(value('--root','dist/client'));
const out=resolve(value('--out','docs/evidence/staging-release-20261028'));
const origin=mode==='official'?'https://knaba.de':'https://kneba.vsp.rest';
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim());
const files=[];async function walk(p){for(const e of await readdir(p,{withFileTypes:true})){const q=join(p,e.name);if(e.isDirectory())await walk(q);else if(q.endsWith('.html'))files.push(q);}}
await walk(root);files.sort();const rows=[];
function nodes(node,result=[]){if(node.tagName)result.push(node);for(const c of node.childNodes||[])nodes(c,result);return result;}
const attr=(n,k)=>n.attrs?.find(x=>x.name===k)?.value||'';
const txt=n=>(n.childNodes||[]).map(c=>c.nodeName==='#text'?c.value:txt(c)).join('');
for(const file of files){
 const html=await readFile(file,'utf8'),all=nodes(parse(html));
 const one=(tag,test=()=>true)=>all.find(n=>n.tagName===tag&&test(n));
 const name=relative(root,file).replaceAll('\\','/');
 const path='/'+name.replace(/index\.html$/,'');
 const canonical=attr(one('link',n=>attr(n,'rel')==='canonical')||{},'href');
 const robots=attr(one('meta',n=>attr(n,'name')==='robots')||{},'content');
 const lang=attr(one('html')||{},'lang');
 const h1=all.filter(n=>n.tagName==='h1');
 const schema=all.filter(n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json');
 const errors=[];
 for(const n of schema){try{JSON.parse(txt(n));}catch{errors.push('INVALID_JSON_LD');}}
 if(h1.length!==1)errors.push('H1_COUNT');
 if(mode==='vsp'&&!robots.includes('noindex'))errors.push('STAGING_NOT_NOINDEX');
 if(canonical&&!canonical.startsWith(origin+'/'))errors.push('WRONG_CANONICAL_HOST');
 const privatePage=/\/(admin|studio|crm|konto|postfach)(\/|$)/.test(path);
 rows.push({id:'PAGE-'+String(rows.length+1).padStart(3,'0'),requirement:'published route / static SEO',path,role:privatePage?'authenticated (shell only)':'anonymous',language:lang,state:'direct URL',expected:'valid HTML; correct robots/canonical; server authorization for private data',title:txt(one('title')||{}),description:attr(one('meta',n=>attr(n,'name')==='description')||{},'content'),h1:h1.map(txt).join(' | '),canonical,robots,hreflang:all.filter(n=>n.tagName==='link'&&attr(n,'hreflang')).map(n=>attr(n,'hreflang')+':'+attr(n,'href')).join(' | '),schema_blocks:schema.length,static_result:errors.length?'FAIL':'PASS',errors:errors.join(';'),http_status:'NOT_RUN',http_result:'NOT_RUN',http_robots:'',redirect:'',browser_result:'NOT_RUN',source,environment:mode+' isolated build',evidence:mode+'-routes.json'});
}
if(live){
 const runtime=['/login/','/register/','/join/','/forgot-password/','/access-requests/','/invite-user/','/activate-owner/','/activate-developer/','/healthz','/readyz','/robots.txt','/sitemap.xml','/this-knaba-page-does-not-exist-20261028/'];
 for(const path of runtime)rows.push({id:'RUNTIME-'+String(rows.length+1).padStart(3,'0'),requirement:'runtime route',path,role:'anonymous',language:'de',state:'GET only, no credentials or mutations',expected:'health/public 200; private protected; invalid/unknown fails closed',static_result:'N/A',http_result:'NOT_RUN',browser_result:'NOT_RUN',source,environment:'kneba.vsp.rest',evidence:'vsp-routes.json'});
 let next=0;async function worker(){for(;;){const i=next++;if(i>=rows.length)return;const row=rows[i];try{
  const response=await fetch(origin+row.path,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'user-agent':'KNABA-authorized-release-audit/1.0','cache-control':'no-cache'}});
  row.http_status=response.status;row.http_robots=response.headers.get('x-robots-tag')||'';row.redirect=response.headers.get('location')||'';
  const body=await response.text();
  row.http_meta_robots=body.match(/<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i)?.[1]||'';
  const needsNoindex=response.status===200&&!['/healthz','/readyz','/robots.txt'].includes(row.path);
  const protection=/noindex/i.test(row.http_robots+' '+row.http_meta_robots);
  const unknown=row.path.includes('does-not-exist');
  const bad=response.status>=500||(unknown&&response.status!==404)||(needsNoindex&&!protection);
  row.http_result=bad?'FAIL':'PASS';row.environment='kneba.vsp.rest';
  row.actual=unknown?'HTTP '+response.status:'HTTP '+response.status+'; noindex '+(protection?'present':'not required or absent');
 }catch(e){row.http_result='FAIL';row.actual=e.name;}}}
 await Promise.all([worker(),worker(),worker()]);
}
await mkdir(out,{recursive:true});
const report={time:new Date().toISOString(),source,working_tree_dirty:dirty,mode,live,limit:'Static/HTTP observations only. Browser, authenticated actions, integrations and owner UAT require separate evidence.',rows};
await writeFile(join(out,mode+'-routes.json'),JSON.stringify(report,null,2)+'\n');
const cols=['id','requirement','path','role','language','state','expected','actual','static_result','http_status','http_result','http_robots','http_meta_robots','redirect','browser_result','source','environment','evidence','title','description','h1','canonical','robots','hreflang','schema_blocks','errors'];
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
await writeFile(join(out,mode+'-routes.csv'),cols.map(csv).join(',')+'\n'+rows.map(r=>cols.map(c=>csv(r[c])).join(',')).join('\n')+'\n');
console.log(JSON.stringify({mode,source,working_tree_dirty:dirty,routes:rows.length,static_fail:rows.filter(r=>r.static_result==='FAIL').map(r=>r.path),http_fail:rows.filter(r=>r.http_result==='FAIL').map(r=>({path:r.path,status:r.http_status,actual:r.actual})),out}));
