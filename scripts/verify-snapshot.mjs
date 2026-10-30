import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// These identify the original assembly, NOT an approved current feature tree.
// Never advance them just to make a feature branch pass.
export const IMPORT_COMMIT = '66b07fb46d23c7110473c51fc23ce58d3c40a1b1';
export const IMPORT_TREES = Object.freeze({
  erp: 'a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43',
  'corporate-site': '6ce56eb811af9733ce9b0b08dab3b636dfaf6371',
});
const REQUIRED_PATHS = Object.freeze([
  'erp/AGENTS.md', 'erp/KNABA_DE_TARGET_SPEC.md', 'erp/PROJECT_MEMORY.md',
  'erp/docs/planning/DEVELOPMENT_BACKLOG.json',
  'corporate-site/PROJECT_MEMORY.md', 'corporate-site/src/components/PublicAssistant.tsx',
  'corporate-site/worker/api.ts', 'docs/unified/PROJECT_MEMORY.md',
  'docs/unified/BACKLOG.md', 'docs/unified/BUDGET.md',
]);

/** Source provenance only. Neither feature correctness nor release approval. */
export function verifySnapshot({cwd=process.cwd(),importCommit=IMPORT_COMMIT,
  expectedTrees=IMPORT_TREES,requiredPaths=REQUIRED_PATHS}={}) {
  const lines=[],errors=[],modules={};
  const git=(...args)=>execFileSync('git',args,{
    cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:4*1024*1024,
    env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1'},
  }).trim();
  let head=null,importVerified=true;
  try { head=git('rev-parse','--verify','HEAD^{commit}'); }
  catch { return {ok:false,importVerified:false,head,modules,lines,errors:['missing current Git commit']}; }
  try { git('cat-file','-e',`${importCommit}^{commit}`); }
  catch { errors.push('missing historical import anchor; provide its verified Git history before auditing');importVerified=false; }
  if(importVerified){
    try { git('merge-base','--is-ancestor',importCommit,head); }
    catch { errors.push('historical import anchor is not an ancestor of current HEAD');importVerified=false; }
  }
  for(const [dir,expected]of Object.entries(expectedTrees)){
    if(importVerified){
      try {
        const historical=git('rev-parse',`${importCommit}:${dir}`);
        if(historical!==expected||git('cat-file','-t',historical)!=='tree'){
          errors.push(`${dir}: historical import tree mismatch`);importVerified=false;
        }
      }catch{errors.push(`${dir}: missing historical import tree`);importVerified=false;}
    }
    try {
      const current=git('rev-parse',`${head}:${dir}`);
      if(git('cat-file','-t',current)!=='tree'||!lstatSync(join(cwd,dir)).isDirectory())
        throw Error('not a directory');
      modules[dir]={tree:current,originalTree:expected,changed:current!==expected};
      lines.push(`${current===expected?'UNCHANGED IMPORT':'FEATURE CHANGE'} ${dir}: ${current} (original ${expected})`);
    }catch{errors.push(`${dir}: missing current regular directory/Git tree`);}
  }
  if(importVerified)lines.unshift(`PASS historical import: ${importCommit}`);
  try {
    if(git('status','--porcelain=v1','--untracked-files=all'))
      errors.push('uncommitted tracked/staged/untracked files; current source cannot be SHA-pinned');
  }catch{errors.push('unable to establish worktree integrity');}
  for(const path of [...requiredPaths,'package.json']){
    try {
      const entry=git('ls-tree',head,'--',path);
      if(!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(entry)||!lstatSync(join(cwd,path)).isFile())
        throw Error('not a tracked regular file');
    }catch{errors.push(`missing/non-regular tracked canonical file: ${path}`);}
  }
  try {
    const root=JSON.parse(readFileSync(join(cwd,'package.json'),'utf8'));
    if(root.private!==true||root.name!=='knaba-unified-integration')
      errors.push('root package metadata not isolated');
  }catch{errors.push('invalid/missing root package metadata');}
  const ok=errors.length===0;
  if(ok)lines.push(`PASS clean committed source: ${head}; combined runtime acceptance NOT_RUN`);
  return {ok,importVerified,head,modules,lines,errors};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  // The CLI does not allow callers to substitute a new historical baseline.
  if(process.argv.length!==2){process.stderr.write('FAIL no baseline override arguments accepted\n');process.exitCode=1;}
  else {
    const result=verifySnapshot();
    for(const line of result.lines)process.stdout.write(line+'\n');
    for(const error of result.errors)process.stderr.write('FAIL '+error+'\n');
    process.exitCode=result.ok?0:1;
  }
}
