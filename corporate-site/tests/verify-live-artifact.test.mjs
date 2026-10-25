import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, symlink, rename, rm, appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyLiveArtifact} from '../scripts/verify-live-artifact.mjs';

const FIRST='a'.repeat(40);
const SECOND='b'.repeat(40);
const digest=(files)=>{const hash=createHash('sha256');for(const [name,contents] of files){hash.update(name+'\0');hash.update(Buffer.from(contents));hash.update('\0');}return hash.digest('hex');};
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'knaba-live-artifact-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const releases=join(root,'releases');
  const first=join(releases,FIRST),second=join(releases,SECOND),current=join(root,'current');
  for(const x of [first,second]){await mkdir(join(x,'dist/client/sub'),{recursive:true});await writeFile(join(x,'dist/client/index.html'),'<html>first</html>');await writeFile(join(x,'dist/client/sub/site.js'),'const valid = true;');}
  await symlink('releases/'+FIRST,current);
  const files=[['index.html','<html>first</html>'],['sub/site.js','const valid = true;']];
  return {releases,current,first,second,expectedSource:FIRST,expectedArtifact:digest(files)};
}
async function expectCode(fn,code){await assert.rejects(fn,e=>e?.code===code);}

test('pins an immutable release and proves all file bytes using build-verifier ordering',async t=>{
  const f=await fixture(t);
  const result=await verifyLiveArtifact(f);
  assert.equal(result.status,'PASS');
  assert.equal(result.artifactSha256,f.expectedArtifact);
  assert.equal(result.sourceSha,FIRST);
  assert.equal(result.files,2);
  assert.equal(result.htmlFiles,1);
});
test('reports a genuine artifact mismatch, without accepting approximate asset sizes',async t=>{
  const f=await fixture(t);await expectCode(()=>verifyLiveArtifact({...f,expectedArtifact:'c'.repeat(64)}),'ARTIFACT_MISMATCH');
});
test('fails closed on a switched release rather than reading a moving current symlink',async t=>{
  const f=await fixture(t);
  await expectCode(()=>verifyLiveArtifact({...f,beforeFinalCheck:async()=>{
    const temp=f.current+'.next';await symlink('releases/'+SECOND,temp);await rename(temp,f.current);
  }}),'RELEASE_SWITCHED');
});
test('detects an ABA release switch even if current returns to its original SHA',async t=>{
  const f=await fixture(t);
  await expectCode(()=>verifyLiveArtifact({...f,beforeFinalCheck:async()=>{
    const one=f.current+'.one';await symlink('releases/'+SECOND,one);await rename(one,f.current);
    const two=f.current+'.two';await symlink('releases/'+FIRST,two);await rename(two,f.current);
  }}),'RELEASE_SWITCHED');
});
test('does not read a newer release if current already differs from expected source',async t=>{
  const f=await fixture(t);
  await expectCode(()=>verifyLiveArtifact({...f,expectedSource:SECOND}),'WRONG_RELEASE');
});
test('rejects mutation of pinned release files during the audit',async t=>{
  const f=await fixture(t);
  await expectCode(()=>verifyLiveArtifact({...f,beforeFinalCheck:async()=>{await appendFile(join(f.first,'dist/client/index.html'),'x')}}),'RELEASE_MUTATED');
});
test('rejects symlink inside release contents to prevent reading outside of the release',async t=>{
  const f=await fixture(t);
  await symlink(join(f.first,'dist/client/index.html'),join(f.first,'dist/client/sub/alias.html'));
  await expectCode(()=>verifyLiveArtifact(f),'UNSAFE_SYMLINK');
});
test('rejects malformed expected source or missing artifact hash',async t=>{
  const f=await fixture(t);
  await expectCode(()=>verifyLiveArtifact({...f,expectedSource:'not-a-sha'}),'INVALID_INPUT');
  await expectCode(()=>verifyLiveArtifact({...f,expectedArtifact:''}),'INVALID_INPUT');
});
