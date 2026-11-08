/** Build provenance for the exact local CI artifacts; no browser or remote access. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstat,readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const artifactRoots=Object.freeze({
  siteClient:'corporate-site/dist/client',siteWorker:'corporate-site/dist/server',siteVps:'corporate-site/dist/vps',erpDist:'erp/dist',
});
const requiredArtifactFiles=Object.freeze({siteVps:['federation.mjs']});
export const boundSourcePaths=Object.freeze({
  federationProtocol:'erp/packages/integrations/site-federation-protocol.mjs',
  federationEntry:'corporate-site/vps/federation-entry.mjs',
});
export function validateSource(expected,actual,dirty){
  if(!/^[a-f0-9]{40}$/.test(expected??'')||actual!==expected)throw Error('EXACT_SOURCE_SHA_REQUIRED');
  if(dirty.trim())throw Error('CLEAN_COMMITTED_SOURCE_REQUIRED');
  return actual;
}
function sourceIdentity(root,expected){
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  return validateSource(expected,git(['rev-parse','HEAD']),git(['status','--porcelain']));
}
export async function digestArtifacts(root=repo){
  const groups={};
  for(const [name,directory] of Object.entries(artifactRoots)){
    let prefix=root;
    for(const part of directory.split('/')){
      prefix=join(prefix,part);const info=await lstat(prefix);
      if(info.isSymbolicLink()||!info.isDirectory())throw Error('UNSAFE_ARTIFACT_ROOT: '+directory);
    }
    const base=join(root,directory),files=[];
    async function walk(path){
      for(const item of await readdir(path,{withFileTypes:true})){
        const file=join(path,item.name),info=await lstat(file);
        if(info.isSymbolicLink())throw Error('ARTIFACT_SYMLINK: '+relative(root,file));
        if(info.isDirectory())await walk(file);
        else if(info.isFile())files.push(file);
        else throw Error('NON_REGULAR_ARTIFACT: '+relative(root,file));
        if(files.length>10000)throw Error('ARTIFACT_FILE_LIMIT');
      }
    }
    await walk(base);if(!files.length)throw Error('EMPTY_ARTIFACT: '+directory);
    for(const required of requiredArtifactFiles[name]??[])if(!files.includes(join(base,required)))throw Error('REQUIRED_BUILD_ARTIFACT_MISSING: '+directory+'/'+required);
    const hash=createHash('sha256');let bytes=0;
    for(const file of files.sort()){
      const before=await lstat(file);if(!before.isFile()||before.size>64*1024*1024)throw Error('UNSAFE_ARTIFACT_FILE');
      const content=await readFile(file),after=await lstat(file);
      if(!after.isFile()||before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||before.mtimeMs!==after.mtimeMs||content.length!==before.size)throw Error('ARTIFACT_CHANGED_DURING_HASH');
      hash.update(relative(base,file).split(sep).join('/')+'\0').update(content).update('\0');bytes+=content.length;
    }
    groups[name]={path:directory,files:files.length,bytes,sha256:hash.digest('hex')};
  }
  return groups;
}
export async function digestSourceInputs(root=repo){
  const inputs={};
  for(const [name,path] of Object.entries(boundSourcePaths)){
    const parts=path.split('/');let file=root;
    for(let i=0;i<parts.length;i++){
      file=join(file,parts[i]);const info=await lstat(file);
      if(info.isSymbolicLink()||(i<parts.length-1?!info.isDirectory():!info.isFile()))throw Error('UNSAFE_BOUND_SOURCE: '+path);
    }
    const before=await lstat(file);if(before.size>1024*1024)throw Error('BOUND_SOURCE_SIZE_LIMIT');
    const bytes=await readFile(file),after=await lstat(file);
    if(!after.isFile()||before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||before.mtimeMs!==after.mtimeMs||bytes.length!==before.size)throw Error('BOUND_SOURCE_CHANGED_DURING_HASH');
    inputs[name]={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  return inputs;
}
export async function measureCandidate(expectedSource,root=repo){
  const sourceSha=sourceIdentity(root,expectedSource),artifacts=await digestArtifacts(root),sourceInputs=await digestSourceInputs(root);
  sourceIdentity(root,expectedSource);
  return {sourceSha,artifacts,sourceInputs};
}
export function verifyManifest(manifest,measured){
  if(manifest?.schemaVersion!==2||manifest.sourceSha!==measured.sourceSha||manifest.sourceClean!==true||
    Object.keys(manifest.artifacts??{}).sort().join(',')!==Object.keys(artifactRoots).sort().join(',')||
    Object.keys(manifest.sourceInputs??{}).sort().join(',')!==Object.keys(boundSourcePaths).sort().join(','))throw Error('INVALID_BUILD_MANIFEST');
  for(const [name,value] of Object.entries(measured.artifacts)){
    if(JSON.stringify(manifest.artifacts[name])!==JSON.stringify(value))throw Error('BUILD_ARTIFACT_MISMATCH: '+name);
  }
  for(const [name,value] of Object.entries(measured.sourceInputs)){
    if(JSON.stringify(manifest.sourceInputs[name])!==JSON.stringify(value))throw Error('BOUND_SOURCE_MISMATCH: '+name);
  }
}
export async function captureManifest(path,expectedSource,root=repo){
  if(!path||!isAbsolute(path))throw Error('ABSOLUTE_BUILD_MANIFEST_PATH_REQUIRED');
  if(resolve(path)===resolve(root)||resolve(path).startsWith(resolve(root)+sep))throw Error('BUILD_MANIFEST_MUST_BE_OUTSIDE_SOURCE');
  const measured=await measureCandidate(expectedSource,root);
  const manifest={schemaVersion:2,sourceSha:measured.sourceSha,sourceClean:true,createdAt:new Date().toISOString(),
    scope:'Fresh CI build artifacts; no runtime, browser or production acceptance',
    algorithm:'SHA-256(sorted relative path + NUL + bytes + NUL)',artifacts:measured.artifacts,sourceInputs:measured.sourceInputs};
  await mkdir(dirname(resolve(path)),{recursive:true});await writeFile(path,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const manifest=await captureManifest(process.env.KNABA_CI_ARTIFACT_MANIFEST,process.env.SOURCE_SHA);
    console.log('KNABA_CI_BUILD_ARTIFACTS '+JSON.stringify(manifest));
  }catch(error){console.error(String(error.message));process.exitCode=1;}
}
