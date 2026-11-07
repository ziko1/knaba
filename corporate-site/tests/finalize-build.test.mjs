import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {finalizeBuild} from '../scripts/finalize-build.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'knaba-finalize-build-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const output of ['.astro-static','dist/client'])await mkdir(join(root,output),{recursive:true});
  return root;
}
async function put(root,path,contents){
  const file=join(root,path);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,contents);
}

test('removes only known server intermediates and preserves public assets byte for byte',async t=>{
  const root=await fixture(t);
  const retained={
    '.astro-static/index.html':'<html>public source</html>',
    'dist/client/index.html':'<html>public output</html>',
    'dist/client/_astro/app.js':'export const live=true;',
    'dist/client/.prerender-backup/keep.txt':'not a known intermediate',
    'dist/server/index.js':'server entry stays',
    'source/.prerender/keep.txt':'source stays',
  };
  for(const [path,contents] of Object.entries(retained))await put(root,path,contents);
  for(const output of ['.astro-static','dist/client'])await put(root,output+'/.prerender/chunks/internal.mjs','server-only module');
  await finalizeBuild(root);await finalizeBuild(root);
  for(const [path,contents] of Object.entries(retained))assert.equal(await readFile(join(root,path),'utf8'),contents);
  for(const output of ['.astro-static','dist/client'])await assert.rejects(lstat(join(root,output,'.prerender')),{code:'ENOENT'});
});

test('removes an intermediate link without touching its target and rejects linked output roots',async t=>{
  const root=await fixture(t);
  await put(root,'outside/keep.txt','retained target');
  await symlink(join(root,'outside'),join(root,'dist/client/.prerender'),'dir');
  await finalizeBuild(root);
  assert.equal(await readFile(join(root,'outside/keep.txt'),'utf8'),'retained target');
  await rm(join(root,'dist/client'),{recursive:true});
  await symlink(join(root,'outside'),join(root,'dist/client'),'dir');
  await put(root,'.astro-static/.prerender/keep.txt','no partial cleanup');
  await assert.rejects(finalizeBuild(root),/real build output directory/);
  assert.equal(await readFile(join(root,'.astro-static/.prerender/keep.txt'),'utf8'),'no partial cleanup');
});

test('fails when build output is missing instead of silently accepting an incomplete artifact',async t=>{
  const root=await fixture(t);await rm(join(root,'dist/client'),{recursive:true});
  await assert.rejects(finalizeBuild(root),{code:'ENOENT'});
});

test('the independent artifact verifier still rejects leaked prerender modules',async t=>{
  const root=await fixture(t);
  await put(root,'dist/client/.prerender/chunks/private.mjs','server-only module');
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./verify-build.mjs',import.meta.url))],{cwd:root,encoding:'utf8',timeout:10000});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Astro prerender server intermediates must never be published as client assets/);
});
