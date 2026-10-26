// Syntax and scope policy only. CLI also verifies evidence file bytes.
export const REQUIRED_GATES = Object.freeze([
  'identity-scope', 'owner-chat', 'erp-bridge', 'erp-regression',
  'security-gdpr', 'browser-accessibility', 'native-device',
  'notification-delivery', 'backup-rollback', 'customer-uat', 'legal-approval',
]);

const gitHash = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const safeEvidencePath = value => typeof value === 'string' &&
  /^docs\/evidence\/knaba-unified\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.json$/.test(value);

export function evaluateReceipt(receipt, currentSha) {
  const blockers = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return {ready:false,blockers:['invalid release receipt']};
  if (receipt.schemaVersion !== 1) blockers.push('unsupported release receipt schema');
  if (!gitHash(currentSha) || !gitHash(receipt.sourceSha) || currentSha !== receipt.sourceSha) blockers.push('missing/mismatched exact source SHA');
  if (!digest(receipt.artifactSha256)) blockers.push('missing exact artifact SHA256');
  if (receipt.productionApproval !== true) blockers.push('explicit production approval is not recorded');
  if (!Array.isArray(receipt.gates)) return {ready:false,blockers:[...blockers,'missing required gate records']};
  const seen = new Set();
  for (const gate of receipt.gates) {
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {blockers.push('malformed gate');continue;}
    const id = gate.id;
    if (typeof id !== 'string' || !REQUIRED_GATES.includes(id)) {blockers.push('unknown gate');continue;}
    if (seen.has(id)) blockers.push(`duplicate gate: ${id}`);
    seen.add(id);
    if (gate.status !== 'PASS') blockers.push(`gate not accepted: ${id}`);
    if (!safeEvidencePath(gate.evidencePath) || !digest(gate.evidenceSha256)) blockers.push(`missing scoped evidence: ${id}`);
  }
  for (const id of REQUIRED_GATES) if (!seen.has(id)) blockers.push(`missing required gate: ${id}`);
  return {ready:blockers.length===0,blockers};
}
