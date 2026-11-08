const modes=new Set(['DEMO','TEST','PRODUCTION']);
const companyPattern=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const demoCompanies=new Set(['knaba-demo','knaba-de-demo']);
// Validate the spelling as well as URL.pathname: WHATWG normalization can
// otherwise turn paths such as /a/.. or backslashes into an apparently clean root.
const originSpelling=/^https?:\/\/[^/\\?#@\u0000-\u0020\u007f]+\/?$/i;
const modeRequired=mode=>{if(!modes.has(mode))throw new Error('APP_MODE_REQUIRED_OR_INVALID');};

/** Explicit configuration only; this does not prove company ownership/readiness. */
export function requireCompanyId(mode,value){
  modeRequired(mode);
  if(typeof value!=='string'||value.trim()!==value||!companyPattern.test(value)||
     mode==='PRODUCTION'&&demoCompanies.has(value))throw new Error('COMPANY_ID_REQUIRED_OR_INVALID');
  return value;
}
export function resolveCompanyId(mode,value){
  modeRequired(mode);
  return requireCompanyId(mode,value===undefined&&mode!=='PRODUCTION'?'knaba-demo':value);
}

/** Keep raw worker ticket bindings separate from canonical API authority. */
export function parsePublicOrigin(mode,value,required=false){
  modeRequired(mode);
  const invalid=()=>{throw new Error('PUBLIC_ORIGIN_REQUIRED_OR_INVALID');};
  if(value===undefined){if(required)invalid();return undefined;}
  if(typeof value!=='string'||value.length===0||value.trim()!==value||!originSpelling.test(value))invalid();
  let url;try{url=new URL(value);}catch{invalid();}
  if(!url.hostname||!['http:','https:'].includes(url.protocol)||
     mode==='PRODUCTION'&&url.protocol!=='https:'||url.username||url.password||
     url.pathname!=='/'||url.search||url.hash||value.includes('?')||value.includes('#'))invalid();
  return {raw:value,origin:url.origin};
}

const placeholderReleaseSha='0'.repeat(40);
/** Grammar and agreement are configuration guards, not source attestation. */
export function requireReleaseSha(value){
  if(typeof value!=='string'||value.length!==40||!/^[a-f0-9]{40}$/.test(value)||value===placeholderReleaseSha)
    throw new Error('RELEASE_SHA_REQUIRED_OR_INVALID');
  return value;
}
export function resolveBuildSha(mode,environmentSha,compiledSha){
  modeRequired(mode);
  const configured=environmentSha===undefined?undefined:requireReleaseSha(environmentSha);
  if(mode==='PRODUCTION'&&configured===undefined)throw new Error('RELEASE_SHA_REQUIRED_OR_INVALID');
  const embedded=compiledSha===undefined?undefined:requireReleaseSha(compiledSha);
  if(configured!==undefined&&embedded!==undefined&&configured!==embedded)throw new Error('RELEASE_SHA_MISMATCH');
  return embedded??configured??placeholderReleaseSha;
}
