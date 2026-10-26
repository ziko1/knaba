import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { evaluateReceipt } from './release-readiness.mjs';

const fail = message => {process.stderr.write(`RELEASE BLOCKED: ${message}\n`);process.exitCode=1;};
let receipt;
try {receipt=JSON.parse(readFileSync('docs/unified/RELEASE_READINESS.json','utf8'));}
catch {fail('missing or malformed release receipt');process.exit(1);}
let sha;
try {sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}
catch {fail('cannot resolve exact Git HEAD');process.exit(1);}
const verdict=evaluateReceipt(receipt,sha);
for (const issue of verdict.blockers) fail(issue);
if (!verdict.ready) process.exit(1);
const evidenceRoot=realpathSync(resolve('docs/evidence'));
for (const gate of receipt.gates) {
  let contents;
  try {
    const resolved=realpathSync(resolve(gate.evidencePath));
    if (!resolved.startsWith(evidenceRoot+sep)) throw new Error('evidence must remain under docs/evidence');
    contents=readFileSync(resolved);
  }
  catch {fail(`missing local evidence: ${gate.id}`);continue;}
  const actual=createHash('sha256').update(contents).digest('hex');
  if (actual!==gate.evidenceSha256) fail(`evidence SHA256 mismatch: ${gate.id}`);
}
if (process.exitCode !== 1) process.stdout.write('STRUCTURAL RELEASE GATE PASS: independent UAT/security/provider approvals still require human verification\n');
