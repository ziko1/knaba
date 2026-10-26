import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as source from './verify-snapshot.mjs';

function fixture(run){
 const cwd=mkdtempSync(join(tmpdir(),'knaba-provenance-'));
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const put=(path,text)=>{mkdirSync(join(cwd,path,'..'),{recursive:true});writeFileSync(join(cwd,path),text);};
 const commit=()=>{git('add','.');git('-c','user.name=KNABA QA','-c','user.email=qa@invalid.example','commit','-qm','synthetic fixture');return git('rev-parse','HEAD');};
 try{
  git('init','-q');put('erp/AGENTS.md','original erp');put('corporate-site/PROJECT_MEMORY.md','original site');
  put('package.json',JSON.stringify({name:'knaba-unified-integration',private:true}));
  const importCommit=commit();
  const options={cwd,importCommit,expectedTrees:{erp:git('rev-parse','HEAD:erp'),'corporate-site':git('rev-parse','HEAD:corporate-site')},requiredPaths:['erp/AGENTS.md','corporate-site/PROJECT_MEMORY.md']};
  return run({cwd,git,put,commit,options,check:()=>{assert.equal(typeof source.verifySnapshot,'function');return source.verifySnapshot(options);}});
 }finally{rmSync(cwd,{recursive:true,force:true});}
}
test('original imported trees and clean source are independently verified',()=>fixture(({check})=>{
 const r=check();assert.equal(r.ok,true);assert.equal(r.importVerified,true);assert.equal(r.modules.erp.changed,false);assert.match(r.lines.join('\n'),/runtime acceptance NOT_RUN/);
}));
test('committed ERP and site evolution does not corrupt historical import proof',()=>fixture(({put,commit,check})=>{
 put('erp/feature.mjs','export const enabled=false;');put('corporate-site/feature.mjs','export const enabled=false;');commit();
 const r=check();assert.equal(r.ok,true);assert.equal(r.importVerified,true);assert.equal(r.modules.erp.changed,true);assert.equal(r.modules['corporate-site'].changed,true);assert.match(r.lines.join('\n'),/FEATURE CHANGE erp/);
}));
for(const [name,mutate]of[
 ['unstaged ERP edit',({put})=>put('erp/AGENTS.md','dirty')],
 ['unstaged site edit',({put})=>put('corporate-site/PROJECT_MEMORY.md','dirty')],
 ['staged change',({put,git})=>{put('erp/AGENTS.md','dirty');git('add','.');}],
 ['untracked root source',({put})=>put('untracked.mjs','unsafe')],
 ['dirty root metadata',({put})=>put('package.json','{}')],
])test(name+' fails exact-source integrity',()=>fixture(f=>{mutate(f);const r=f.check();assert.equal(r.ok,false);assert.match(r.errors.join('\n'),/uncommitted/);}));
test('committed deletion of a canonical file fails',()=>fixture(f=>{
 rmSync(join(f.cwd,'erp/AGENTS.md'));f.commit();const r=f.check();assert.equal(r.ok,false);assert.match(r.errors.join('\n'),/canonical|tree/);
}));
test('canonical file symlink cannot substitute for tracked regular file',()=>fixture(f=>{
 rmSync(join(f.cwd,'erp/AGENTS.md'));symlinkSync('../package.json',join(f.cwd,'erp/AGENTS.md'));f.commit();const r=f.check();assert.equal(r.ok,false);assert.match(r.errors.join('\n'),/regular|canonical/);
}));
test('missing historical anchor fails closed without fetching',()=>fixture(f=>{
 f.options.importCommit='f'.repeat(40);const r=f.check();assert.equal(r.ok,false);assert.match(r.errors.join('\n'),/anchor/);
}));
test('an unrelated root history cannot claim imported ancestry',()=>fixture(f=>{
 f.git('checkout','--orphan','unrelated');f.put('root-marker','unrelated');f.commit();const r=f.check();assert.equal(r.ok,false);assert.match(r.errors.join('\n'),/ancestor/);
}));
test('historical tree mismatch is never relabeled as feature change',()=>fixture(f=>{
 f.options.expectedTrees.erp='f'.repeat(40);const r=f.check();assert.equal(r.ok,false);assert.equal(r.importVerified,false);assert.match(r.errors.join('\n'),/historical/);
}));
for(const text of ['{not json',JSON.stringify({name:'another-project',private:true}),JSON.stringify({name:'knaba-unified-integration',private:false})])
 test('invalid committed root metadata fails: '+text,()=>fixture(f=>{f.put('package.json',text);f.commit();const r=f.check();assert.equal(r.ok,false);assert.match(r.errors.join('\n'),/metadata/);}));
