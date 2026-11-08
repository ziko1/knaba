import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {artifactRoots,digestArtifacts,validateSource,verifyManifest,captureManifest} from './ci-artifacts.mjs';
async function fixture(work){
  const root=await mkdtemp(join(tmpdir(),'knaba-ci-artifacts-'));
  try{for(const path of Object.values(artifactRoots)){await mkdir(join(root,path),{recursive:true});await writeFile(join(root,path,'index.js'),'synthetic artifact '+path);}await work(root);}
  finally{await rm(root,{recursive:true,force:true});}
}
const sha='a'.repeat(40);
test('source binding requires the exact clean committed SHA',()=>{
  assert.equal(validateSource(sha,sha,''),sha);
  for(const args of [[undefined,sha,''],[sha,'b'.repeat(40),''],[sha,sha,' M changed.ts']])assert.throws(()=>validateSource(...args));
});
test('all four artifact groups are deterministic and any changed worker bytes invalidate the build manifest',async()=>fixture(async root=>{
  const artifacts=await digestArtifacts(root),measured={sourceSha:sha,artifacts},manifest={schemaVersion:1,sourceSha:sha,sourceClean:true,artifacts};
  assert.deepEqual(Object.keys(artifacts),['siteClient','siteWorker','siteVps','erpDist']);verifyManifest(manifest,measured);
  assert.deepEqual(await digestArtifacts(root),artifacts);
  await writeFile(join(root,artifactRoots.siteWorker,'index.js'),'different worker');
  const changed=await digestArtifacts(root);
  assert.throws(()=>verifyManifest(manifest,{sourceSha:sha,artifacts:changed}),/BUILD_ARTIFACT_MISMATCH/);
}));
test('rejects missing groups and empty output instead of attesting a partial build',async()=>fixture(async root=>{
  await rm(join(root,artifactRoots.siteVps,'index.js'));
  await assert.rejects(()=>digestArtifacts(root),/EMPTY_ARTIFACT/);
}));
test('rejects symlink files and symlink ancestors without following them into an artifact',async()=>fixture(async root=>{
  const target=join(root,'outside');await writeFile(target,'must not be an asset');
  await symlink(target,join(root,artifactRoots.siteClient,'linked.js'));
  await assert.rejects(()=>digestArtifacts(root),/ARTIFACT_SYMLINK/);
  await rm(join(root,artifactRoots.siteClient,'linked.js'));await rm(join(root,'erp'),{recursive:true,force:true});
  await mkdir(join(root,'alternate','dist'),{recursive:true});await symlink(join(root,'alternate'),join(root,'erp'));
  await assert.rejects(()=>digestArtifacts(root),/UNSAFE_ARTIFACT_ROOT/);
}));
test('rejects malformed manifests and source mismatches',async()=>fixture(async root=>{
  const measured={sourceSha:sha,artifacts:await digestArtifacts(root)};
  for(const manifest of [null,{schemaVersion:1,sourceSha:sha,sourceClean:false,artifacts:measured.artifacts},
    {schemaVersion:1,sourceSha:'b'.repeat(40),sourceClean:true,artifacts:measured.artifacts},
    {schemaVersion:1,sourceSha:sha,sourceClean:true,artifacts:{siteClient:measured.artifacts.siteClient}}])assert.throws(()=>verifyManifest(manifest,measured),/INVALID_BUILD_MANIFEST/);
}));
test('build manifest must be outside the checkout at an explicit absolute path',async()=>{
  await assert.rejects(()=>captureManifest('relative.json',sha),/ABSOLUTE_BUILD_MANIFEST_PATH_REQUIRED/);
  await assert.rejects(()=>captureManifest('/synthetic/repo/evidence.json',sha,'/synthetic/repo'),/BUILD_MANIFEST_MUST_BE_OUTSIDE_SOURCE/);
});
