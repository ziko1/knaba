import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReceipt, REQUIRED_GATES } from './release-readiness.mjs';

const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const accepted = () => ({
  schemaVersion: 1,
  sourceSha: sha,
  artifactSha256: digest,
  productionApproval: true,
  gates: REQUIRED_GATES.map(id => ({ id, status: 'PASS', evidencePath: `docs/evidence/knaba-unified/${id}.json`, evidenceSha256: digest })),
});

test('missing, incomplete and malformed receipts fail closed', () => {
  assert.equal(evaluateReceipt(undefined, sha).ready, false);
  assert.equal(evaluateReceipt({}, sha).ready, false);
  assert.equal(evaluateReceipt({ gates: [] }, sha).ready, false);
});
test('blocked or omitted acceptance remains blocked', () => {
  const item = accepted(); item.gates[0].status = 'NOT_RUN';
  assert.equal(evaluateReceipt(item,sha).ready, false);
  const missing = accepted(); missing.gates.pop();
  assert.equal(evaluateReceipt(missing,sha).ready, false);
});
test('approval, exact SHA and artifact digest are mandatory', () => {
  for (const change of [{ productionApproval: false }, { sourceSha: 'c'.repeat(40) }, { artifactSha256: 'not-a-hash' }]) {
    assert.equal(evaluateReceipt({ ...accepted(), ...change }, sha).ready, false);
  }
});
test('reject duplicate, forged and traversal evidence locations', () => {
  const dup = accepted(); dup.gates.push(dup.gates[0]); assert.equal(evaluateReceipt(dup,sha).ready,false);
  const rogue = accepted(); rogue.gates[0].id='privileges-bypass'; assert.equal(evaluateReceipt(rogue,sha).ready,false);
  const traversal = accepted(); traversal.gates[0].evidencePath='docs/evidence/knaba-unified/../../secrets.json'; assert.equal(evaluateReceipt(traversal,sha).ready,false);
  const noHash = accepted(); noHash.gates[0].evidenceSha256='mock'; assert.equal(evaluateReceipt(noHash,sha).ready,false);
});
test('complete structurally valid receipt passes syntax policy only', () => {
  const verdict = evaluateReceipt(accepted(),sha);
  assert.equal(verdict.ready,true);
  assert.deepEqual(verdict.blockers,[]);
});
