import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const expected = Object.freeze({
  erp: 'a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43',
});

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
}
function fail(message) {
  process.stderr.write(`FAIL ${message}\n`);
  process.exitCode = 1;
}

for (const [dir, treeSha] of Object.entries(expected)) {
  if (!existsSync(dir)) { fail(`missing directory: ${dir}`); continue; }
  let actual;
  try { actual = git('rev-parse', `HEAD:${dir}`); }
  catch { fail(`missing Git tree: ${dir}`); continue; }
  if (actual !== treeSha) { fail(`${dir}: expected ${treeSha}, actual ${actual}`); continue; }
  const dirty = git('status','--porcelain','--',dir);
  if (dirty) { fail(`${dir}: uncommitted modifications; snapshot is no longer exact`); continue; }
  process.stdout.write(`PASS ${dir}: ${actual}\n`);
}
// Source assembly froze this site tree; feature work intentionally changes it.
// Report the change honestly rather than re-labeling the old import as identical.
const originalSiteTree='6ce56eb811af9733ce9b0b08dab3b636dfaf6371';
let currentSiteTree;
try { currentSiteTree=git('rev-parse','HEAD:corporate-site'); }
catch { fail('missing corporate-site Git tree'); }
if(currentSiteTree){
  const dirty=git('status','--porcelain','--','corporate-site');
  if(dirty)fail('corporate-site: uncommitted changes; tests cannot be SHA-pinned');
  else process.stdout.write(`${currentSiteTree===originalSiteTree?'PASS original import':'FEATURE CHANGE'} corporate-site: ${currentSiteTree} (original ${originalSiteTree})\n`);
}
for (const path of [
  'erp/AGENTS.md',
  'erp/KNABA_DE_TARGET_SPEC.md',
  'erp/PROJECT_MEMORY.md',
  'erp/docs/planning/DEVELOPMENT_BACKLOG.json',
  'corporate-site/PROJECT_MEMORY.md',
  'corporate-site/src/components/PublicAssistant.tsx',
  'corporate-site/worker/api.ts',
  'docs/unified/PROJECT_MEMORY.md',
  'docs/unified/BACKLOG.md',
  'docs/unified/BUDGET.md',
]) {
  if (!existsSync(path)) fail(`missing canonical file: ${path}`);
}
const root = JSON.parse(readFileSync('package.json','utf8'));
if (root.private !== true || root.name !== 'knaba-unified-integration') fail('root package metadata not isolated');
if (process.exitCode !== 1) process.stdout.write('PASS tracked source integrity; combined runtime acceptance NOT_RUN\n');
