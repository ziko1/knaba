/**
 * Optional owner-triggered IndexNow submission for already public, indexable URLs.
 * No background jobs or network calls from import or --dry-run.
 * Google does not support IndexNow; submit the sitemap to Search Console separately.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function collectPublicUrls(xml, expectedOrigin) {
  if (typeof xml !== 'string' || xml.length > 8_000_000) throw new Error('Sitemap exceeds safety bounds');
  if (!/^https:\/\/(?:knaba\.de|kneba\.vsp\.rest)$/.test(expectedOrigin)) throw new Error('Unapproved origin');
  const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
  if (!urls.length || urls.length > 1000) throw new Error('Sitemap empty or outside expected bounds; indexing may be disabled');
  const unique=new Set();
  for (const value of urls) {
    const url=new URL(value);
    if (url.origin !== expectedOrigin || url.search || url.hash || !/^\/[a-zA-Z0-9/_-]*$/.test(url.pathname) ||
        /^\/(?:en\/|uk\/|ru\/)?(?:api|konto|postfach|portal|studio|crm)(?:\/|$)/.test(url.pathname)) {
      throw new Error('Unsafe or cross-origin sitemap URL');
    }
    unique.add(url.href);
  }
  return [...unique];
}

export function isReleaseEligible(mode, vspApproved, manualApproved) {
  return (mode === 'official' || (mode === 'vsp' && vspApproved === '1')) && manualApproved === '1';
}

export function prepareIndexNow({origin,urls,key,keyLocation}) {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key || '')) throw new Error('Invalid IndexNow public key');
  const location=new URL(keyLocation);
  if (location.origin !== origin || location.protocol !== 'https:' || location.search || location.hash) {
    throw new Error('Key file must be hosted on the exact verified HTTPS origin');
  }
  return {host:new URL(origin).hostname,key,keyLocation:location.href,urlList:urls};
}

export async function main({args=process.argv.slice(2),env=process.env,fetchImpl=fetch}={}) {
  if (args.some(arg=>arg!=='--submit' && arg!=='--dry-run')) throw new Error('Unsupported flag');
  const submit=args.includes('--submit');
  const origin=env.KNABA_RELEASE_MODE === 'official' ? 'https://knaba.de' : 'https://kneba.vsp.rest';
  const xml=await readFile(resolve('dist/client/sitemap.xml'),'utf8');
  const urls=collectPublicUrls(xml,origin);
  if (!submit) return {mode:'DRY_RUN_ONLY',host:new URL(origin).hostname,urlCount:urls.length,networkRequests:0};
  if (!isReleaseEligible(env.KNABA_RELEASE_MODE,env.KNABA_VSP_INDEX_APPROVED,env.KNABA_INDEXNOW_APPROVED)) {
    throw new Error('Owner-approved public indexing AND explicit IndexNow permission required');
  }
  const payload=prepareIndexNow({origin,urls,key:env.KNABA_INDEXNOW_KEY,keyLocation:env.KNABA_INDEXNOW_KEY_LOCATION});
  const keyRes=await fetchImpl(payload.keyLocation,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if (!keyRes.ok || (await keyRes.text()).trim() !== payload.key) {
    throw new Error('Public proof-of-domain key file mismatch; nothing submitted');
  }
  const res=await fetchImpl('https://api.indexnow.org/indexnow',{
    method:'POST',headers:{'content-type':'application/json; charset=utf-8'},
    body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)
  });
  if (![200,202].includes(res.status)) throw new Error('IndexNow rejected batch with HTTP '+res.status);
  return {mode:'SUBMITTED_FOR_PROCESSING_NOT_INDEXED',host:payload.host,urlCount:urls.length,httpStatus:res.status};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error('IndexNow: '+error.message);
    process.exitCode=1;
  });
}
