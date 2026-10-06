import {build} from 'esbuild';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
let sha=process.env.GIT_SHA;try{sha??=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();}catch{sha='0000000000000000000000000000000000000000';}
if(!/^[a-f0-9]{40}$/.test(sha)||/^0{40}$/.test(sha))throw new Error('EXACT_NON_PLACEHOLDER_RELEASE_SHA_REQUIRED');
let sourceDirty=true;try{sourceDirty=Boolean(execFileSync('git',['status','--porcelain','--','apps','packages','infra','scripts','tests','package.json','package-lock.json','tsconfig.json','vitest.config.ts','playwright.config.ts'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim());}catch{}
const assets={};async function walk(path,prefix=''){for(const e of await readdir(path,{withFileTypes:true})){if(e.isDirectory())await walk(resolve(path,e.name),prefix+'/'+e.name);else assets[prefix+'/'+e.name]=(await readFile(resolve(path,e.name))).toString('base64');}}await walk(resolve('dist/web'));
const migration=await readFile('infra/001_init.sql','utf8');
await mkdir('dist',{recursive:true});const banner=`import { createRequire as __knabaCreateRequire } from 'node:module'; const require=__knabaCreateRequire(import.meta.url); globalThis.__KNABA_BUILD_SHA__=${JSON.stringify(sha)}; globalThis.__KNABA_MIGRATION__=${JSON.stringify(migration)}; globalThis.__KNABA_ASSETS__=${JSON.stringify(assets)};`;
await build({entryPoints:['apps/api/main.ts'],outfile:'dist/server.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',banner:{js:banner},sourcemap:true});
try{await build({entryPoints:['apps/worker/main.ts'],outfile:'dist/worker.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',banner:{js:`import { createRequire as __knabaCreateRequire } from 'node:module'; const require=__knabaCreateRequire(import.meta.url); globalThis.__KNABA_BUILD_SHA__=${JSON.stringify(sha)}; globalThis.__KNABA_MIGRATION__=${JSON.stringify(migration)};`},sourcemap:true});}catch(e){throw e;}
await writeFile('dist/release.json',JSON.stringify({code_sha:sha,source_dirty:sourceDirty,version:'0.1.0',builtAt:new Date().toISOString()},null,2));console.log('Built immutable server/worker/web',sha);
