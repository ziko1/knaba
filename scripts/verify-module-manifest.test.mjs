import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleManifest, validateModuleManifest } from './verify-module-manifest.mjs';

test('manifest includes existing CMS/CRM/portal/inbox and a separate, disabled ERP', () => {
  assert.deepEqual(validateModuleManifest(loadModuleManifest()), []);
});
test('fails closed on a fabricated running ERP module', () => {
  const candidate = structuredClone(loadModuleManifest());
  const erp = candidate.modules.find(m => m.id === 'erp-core');
  erp.status = 'bundled';
  erp.roles = ['owner'];
  erp.adminView = 'erp';
  assert.match(validateModuleManifest(candidate).join(', '), /ERP runtime must stay disconnected/);
});
test('fails closed when mandatory backup/cutover gates disappear', () => {
  const candidate = structuredClone(loadModuleManifest());
  candidate.promotionGuards = ['exact-source-and-artifact-verification'];
  assert.match(validateModuleManifest(candidate).join(', '), /release guards/);
});
test('rejects duplicate or unknown module instead of dynamically loading code', () => {
  const candidate = structuredClone(loadModuleManifest());
  candidate.modules[0].id = 'studio';
  assert.match(validateModuleManifest(candidate).join(', '), /duplicate module/);
});
test('rejects invalid source paths and missing checkout', () => {
  const candidate = structuredClone(loadModuleManifest());
  candidate.modules[0].source = '../private/';
  assert.match(validateModuleManifest(candidate).join(', '), /module source outside allowlist/);
});
