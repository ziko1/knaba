import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {artifactRoots,boundSourcePaths,digestArtifacts,digestSourceInputs,validateSource,verifyManifest,captureManifest} from './ci-artifacts.mjs';
async function fixture(work){
  const root=await mkdtemp(join(tmpdir(),'knaba-ci-artifacts-'));
  try{
    for(const path of Object.values(artifactRoots)){await mkdir(join(root,path),{recursive:true});await writeFile(join(root,path,'index.js'),'synthetic artifact '+path);}
    await writeFile(join(root,artifactRoots.siteVps,'federation.mjs'),'synthetic federation bundle');
    for(const path of Object.values(boundSourcePaths)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),'synthetic source '+path);}
    await work(root);
  }
  finally{await rm(root,{recursive:true,force:true});}
}
const sha='a'.repeat(40);
test('source binding requires the exact clean committed SHA',()=>{
  assert.equal(validateSource(sha,sha,''),sha);
  for(const args of [[undefined,sha,''],[sha,'b'.repeat(40),''],[sha,sha,' M changed.ts']])assert.throws(()=>validateSource(...args));
});
test('all four artifact groups are deterministic and any changed worker bytes invalidate the build manifest',async()=>fixture(async root=>{
  const artifacts=await digestArtifacts(root),sourceInputs=await digestSourceInputs(root),measured={sourceSha:sha,artifacts,sourceInputs},manifest={schemaVersion:2,sourceSha:sha,sourceClean:true,artifacts,sourceInputs};
  assert.deepEqual(Object.keys(artifacts),['siteClient','siteWorker','siteVps','erpDist']);verifyManifest(manifest,measured);
  assert.deepEqual(await digestArtifacts(root),artifacts);
  await writeFile(join(root,artifactRoots.siteWorker,'index.js'),'different worker');
  const changed=await digestArtifacts(root);
  assert.throws(()=>verifyManifest(manifest,{sourceSha:sha,artifacts:changed,sourceInputs}),/BUILD_ARTIFACT_MISMATCH/);
}));
test('rejects missing groups and empty output instead of attesting a partial build',async()=>fixture(async root=>{
  await rm(join(root,artifactRoots.siteVps,'index.js'));
  await rm(join(root,artifactRoots.siteVps,'federation.mjs'));
  await assert.rejects(()=>digestArtifacts(root),/EMPTY_ARTIFACT/);
}));
test('a nonempty VPS output without the federation bundle cannot be attested',async()=>fixture(async root=>{
  await rm(join(root,artifactRoots.siteVps,'federation.mjs'));
  await assert.rejects(()=>digestArtifacts(root),/REQUIRED_BUILD_ARTIFACT_MISSING/);
}));
test('shared protocol and VPS entry bytes are required and any changed source invalidates the manifest',async()=>fixture(async root=>{
  const measured={sourceSha:sha,artifacts:await digestArtifacts(root),sourceInputs:await digestSourceInputs(root)};
  const manifest={schemaVersion:2,sourceClean:true,...measured};verifyManifest(manifest,measured);
  await writeFile(join(root,boundSourcePaths.federationProtocol),'changed shared protocol');
  const changed=await digestSourceInputs(root);
  assert.throws(()=>verifyManifest(manifest,{...measured,sourceInputs:changed}),/BOUND_SOURCE_MISMATCH/);
  assert.throws(()=>verifyManifest({...manifest,sourceInputs:undefined},measured),/INVALID_BUILD_MANIFEST/);
  await rm(join(root,boundSourcePaths.federationEntry));await assert.rejects(()=>digestSourceInputs(root),/ENOENT/);
}));
test('bound source rejects a symlink to an unreviewed protocol',async()=>fixture(async root=>{
  const target=join(root,'unreviewed.mjs');await writeFile(target,'synthetic');
  await rm(join(root,boundSourcePaths.federationProtocol));await symlink(target,join(root,boundSourcePaths.federationProtocol));
  await assert.rejects(()=>digestSourceInputs(root),/UNSAFE_BOUND_SOURCE/);
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
  const measured={sourceSha:sha,artifacts:await digestArtifacts(root),sourceInputs:await digestSourceInputs(root)};
  const base={schemaVersion:2,sourceSha:sha,sourceClean:true,artifacts:measured.artifacts,sourceInputs:measured.sourceInputs};
  for(const manifest of [null,{...base,schemaVersion:1},{...base,sourceClean:false},
    {...base,sourceSha:'b'.repeat(40)},
    {...base,artifacts:{siteClient:measured.artifacts.siteClient}}])assert.throws(()=>verifyManifest(manifest,measured),/INVALID_BUILD_MANIFEST/);
}));
test('build manifest must be outside the checkout at an explicit absolute path',async()=>{
  await assert.rejects(()=>captureManifest('relative.json',sha),/ABSOLUTE_BUILD_MANIFEST_PATH_REQUIRED/);
  await assert.rejects(()=>captureManifest('/synthetic/repo/evidence.json',sha,'/synthetic/repo'),/BUILD_MANIFEST_MUST_BE_OUTSIDE_SOURCE/);
});
