/**
 * Read-only artifact attestation for one immutable KnaBa VPS release.
 * Hash framing matches tests/verify-build.mjs exactly:
 * sorted relative filenames + NUL + file bytes + NUL, in that order.
 * Never read through the mutable /vps/current symlink after pinning it.
 */
import {createHash} from 'node:crypto';
import {lstat, readFile, readdir, realpath} from 'node:fs/promises';
import {join, relative, resolve, basename, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export class ArtifactAuditError extends Error {
  constructor(code,message) { super(message); this.name='ArtifactAuditError'; this.code=code; }
}
const deny=(code,message)=>{throw new ArtifactAuditError(code,message)};
const sourcePattern=/^[a-f0-9]{40}$/;
const artifactPattern=/^[a-f0-9]{64}$/;

async function listRegularFiles(root) {
  const found=[];
  async function visit(dir) {
    const entries=await readdir(dir,{withFileTypes:true});
    for(const entry of entries) {
      const p=join(dir,entry.name);
      if(entry.isSymbolicLink())deny('UNSAFE_SYMLINK','Client artifact contains a symbolic link');
      if(entry.isDirectory())await visit(p);
      else if(entry.isFile())found.push(p);
      else deny('UNSAFE_FILE_TYPE','Client artifact contains a non-regular entry');
      if(found.length>5000)deny('ARTIFACT_TOO_LARGE','Unexpectedly high artifact file count');
    }
  }
  await visit(root);
  return found.sort(); // Match Array.sort() in verify-build.mjs.
}
function sameStat(a,b) {
  return a.isFile()&&b.isFile()&&a.ino===b.ino&&a.size===b.size&&
    a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
}

/**
 * Expected source + expected build artifact digest are independently supplied.
 * beforeFinalCheck is an injected fault seam for the regression tests only;
 * it is never exposed as a CLI option.
 */
export async function verifyLiveArtifact({releases,current,expectedSource,expectedArtifact,beforeFinalCheck}={}) {
  if(typeof releases!=='string'||typeof current!=='string'||!isAbsolute(releases)||!isAbsolute(current)||
    !sourcePattern.test(expectedSource||'')||!artifactPattern.test(expectedArtifact||''))
    deny('INVALID_INPUT','Absolute release/current paths and 40/64-hex source/artifact hashes required');
  const releasesDir=await realpath(releases);
  const intended=join(releasesDir,expectedSource);
  const dirStat=await lstat(intended);
  if(!dirStat.isDirectory())deny('UNSAFE_RELEASE','Expected source is not a direct release directory');
  const currentLstat=await lstat(current);
  if(!currentLstat.isSymbolicLink())deny('UNSAFE_CURRENT','Current release must be an explicitly managed symlink');
  const atStart=await realpath(current);
  // Both paths are canonical, and basename is required to be the commit SHA.
  if(basename(intended)!==expectedSource||atStart!==intended)
    deny('WRONG_RELEASE','Currently deployed release is not the expected source SHA');
  const root=join(intended,'dist','client');
  const rootStat=await lstat(root);
  if(!rootStat.isDirectory())deny('UNSAFE_RELEASE','Client artifact is not a normal directory');
  const files=await listRegularFiles(root);
  const metadata=new Map();
  const hash=createHash('sha256');
  let htmlFiles=0;
  for(const file of files) {
    const before=await lstat(file);
    if(!before.isFile())deny('UNSAFE_FILE_TYPE','Client artifact file is not regular');
    if(before.size>64*1024*1024)deny('ARTIFACT_TOO_LARGE','Unexpectedly large artifact file');
    const bytes=await readFile(file);
    const after=await lstat(file);
    if(!sameStat(before,after)||bytes.length!==before.size)
      deny('RELEASE_MUTATED','Pinned release file changed during read');
    metadata.set(file,after);
    const rel=relative(root,file);
    hash.update(rel+'\0').update(bytes).update('\0');
    if(rel.endsWith('.html'))htmlFiles++;
  }
  if(beforeFinalCheck)await beforeFinalCheck();
  // Check mutable pointer BEFORE any hash-mismatch claim.
  const atEnd=await realpath(current);
  const currentAfter=await lstat(current);
  if(atEnd!==atStart||!currentAfter.isSymbolicLink()||
      currentLstat.ino!==currentAfter.ino||currentLstat.ctimeMs!==currentAfter.ctimeMs)
    deny('RELEASE_SWITCHED','Active release switched while audit was running; retry on fresh SHA');
  const finalFiles=await listRegularFiles(root);
  if(finalFiles.length!==files.length||finalFiles.some((x,i)=>x!==files[i]))
    deny('RELEASE_MUTATED','Pinned release file set changed during audit');
  for(const file of files){
    const after=await lstat(file);
    if(!sameStat(metadata.get(file),after))
      deny('RELEASE_MUTATED','Pinned release file metadata changed during audit');
  }
  const artifactSha256=hash.digest('hex');
  if(artifactSha256!==expectedArtifact)
    deny('ARTIFACT_MISMATCH','Pinned release bytes differ from independent expected build artifact');
  return {status:'PASS',sourceSha:expectedSource,artifactSha256,files:files.length,htmlFiles,pinnedRelease:intended};
}

async function main(argv) {
  const options={};
  for(let i=0;i<argv.length;i+=2){
    const k=argv[i];
    if(!['--releases','--current','--source','--artifact'].includes(k)||
      typeof argv[i+1]!=='string'||options[k]!==undefined)deny('INVALID_INPUT','Invalid or duplicate CLI argument');
    options[k]=argv[i+1];
  }
  return verifyLiveArtifact({releases:options['--releases'],current:options['--current'],
    expectedSource:options['--source'],expectedArtifact:options['--artifact']});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await main(process.argv.slice(2))))}
  catch(e){const code=e instanceof ArtifactAuditError?e.code:'AUDIT_FAILED';
    console.error(JSON.stringify({status:'FAIL',code,message:e.message}));process.exitCode=1;}
}
