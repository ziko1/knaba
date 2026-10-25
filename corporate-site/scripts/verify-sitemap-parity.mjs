/**
 * Read-only SEO release gate: never remove an already-public sitemap URL silently.
 * Compare two independently captured XML files. No live fetch, provider calls,
 * account tokens, migration, or file changes are performed by this module.
 *
 * Example from corporate-site/:
 * node scripts/verify-sitemap-parity.mjs \
 *   --current ./qa/live-sitemap.xml --candidate ./dist/client/sitemap.xml \
 *   --current-origin https://kneba.vsp.rest \
 *   --candidate-origin https://kneba.vsp.rest
 */
import {readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export class SitemapParityError extends Error {
  constructor(code,message,missing=[]) {
    super(message);this.name='SitemapParityError';this.code=code;this.missing=missing;
  }
}
const deny=(code,message,missing=[])=>{throw new SitemapParityError(code,message,missing)};
const ALLOWED_ORIGINS=new Set(['https://kneba.vsp.rest','https://knaba.de']);
const PRIVATE=/^\/(?:(?:en|uk|ru)\/)?(?:api|studio|crm|konto|postfach|portal|admin|login|logout)(?:\/|$)/;

export function extractSitemapRoutes(xml,expectedOrigin) {
  if(typeof expectedOrigin!=='string'||!ALLOWED_ORIGINS.has(expectedOrigin))
    deny('INVALID_ORIGIN','Use a verified https://knaba.de or https://kneba.vsp.rest origin');
  if(typeof xml!=='string'||xml.length>2_000_000||
     !/<urlset\b[^>]*>[\s\S]*<\/urlset\s*>/i.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))
    deny('INVALID_XML','Expected a bounded XML urlset without DTD/entities');
  const found=[...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)];
  if(found.length!==(xml.match(/<loc>/g)||[]).length)
    deny('INVALID_XML','Incomplete or malformed sitemap loc entries');
  if(found.length===0)deny('EMPTY_SITEMAP','No public URLs: check staging noindex before release');
  if(found.length>1000)deny('INVALID_XML','Sitemap exceeds the scoped 1000-URL gate');
  const paths=new Set();
  for(const match of found){
    const raw=match[1].trim();
    let url;
    try{url=new URL(raw)}catch{deny('INVALID_URL','Malformed sitemap URL')}
    if(url.protocol!=='https:'||url.origin!==expectedOrigin||url.username||url.password||
       url.search||url.hash||!url.pathname.startsWith('/')||raw!==url.href)
      deny('INVALID_URL','Sitemap URL has wrong domain, query/fragment or encoding');
    if(PRIVATE.test(url.pathname))deny('PRIVATE_ROUTE','Private pages must never enter the public sitemap');
    if(paths.has(url.pathname))deny('DUPLICATE_URL','Same canonical URL appears more than once');
    paths.add(url.pathname);
  }
  return [...paths].sort();
}

export function assessSitemapParity(currentXml,candidateXml,{currentOrigin,candidateOrigin}={}) {
  const current=extractSitemapRoutes(currentXml,currentOrigin);
  const candidate=extractSitemapRoutes(candidateXml,candidateOrigin);
  const currentSet=new Set(current),candidateSet=new Set(candidate);
  const missing=current.filter(path=>!candidateSet.has(path));
  if(missing.length)deny('URL_REGRESSION',missing.length+' previously public URLs would be removed from sitemap',missing);
  const added=candidate.filter(path=>!currentSet.has(path));
  return {status:'PASS',currentCount:current.length,candidateCount:candidate.length,missing,added};
}

async function readSnapshot(filename) {
  if(typeof filename!=='string'||!filename||!filename.startsWith('/'))
    deny('INVALID_INPUT','Pass absolute captured sitemap paths');
  const info=await lstat(filename);
  if(!info.isFile()||info.size>2_000_000)
    deny('INVALID_INPUT','Sitemap snapshot must be a regular bounded file');
  return readFile(filename,'utf8');
}
async function main(argv) {
  const opts={};
  for(let i=0;i<argv.length;i+=2){
    const name=argv[i];
    if(!['--current','--candidate','--current-origin','--candidate-origin'].includes(name)||
      !argv[i+1]||opts[name]!==undefined)
      deny('INVALID_INPUT','Four explicit parameters are required, without duplicates');
    opts[name]=argv[i+1];
  }
  if(Object.keys(opts).length!==4)
    deny('INVALID_INPUT','Specify both absolute sitemap files and their expected origins');
  const [currentXml,candidateXml]=await Promise.all([
    readSnapshot(opts['--current']),readSnapshot(opts['--candidate'])
  ]);
  return assessSitemapParity(currentXml,candidateXml,{
    currentOrigin:opts['--current-origin'],
    candidateOrigin:opts['--candidate-origin']
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await main(process.argv.slice(2))))}
  catch(error){
    const code=error instanceof SitemapParityError?error.code:'AUDIT_FAILED';
    console.error(JSON.stringify({status:'FAIL',code,message:error.message,
      missing:error instanceof SitemapParityError?error.missing.slice(0,100):[]}));
    process.exitCode=1;
  }
}
