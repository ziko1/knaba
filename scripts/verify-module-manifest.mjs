import { readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = resolve(repoRoot, 'deploy/knaba-modules.json');
const expected = Object.freeze({
  operations: { legacyPath: '/konto/', adminView: 'operations', roles: ['owner', 'admin'] },
  crm: { legacyPath: '/crm/', adminView: 'crm', roles: ['owner', 'admin'] },
  messages: { legacyPath: '/postfach/', adminView: 'messages', roles: ['owner'] },
  studio: { legacyPath: '/studio/', adminView: 'studio', roles: ['owner'] }
});

export function validateModuleManifest(manifest, root = repoRoot) {
  const faults = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['not an object'];
  if (manifest.schemaVersion !== 1 || manifest.product !== 'KNABA' || manifest.environment !== 'preview') faults.push('invalid schema/product/environment');
  if (manifest.site?.officialDomainCutover !== false || manifest.site?.privateManagementRoute !== '/admin/') faults.push('unsafe site promotion');
  if (!Array.isArray(manifest.modules) || manifest.modules.length !== 5) return [...faults, 'wrong module inventory'];

  const seen = new Set();
  for (const module of manifest.modules) {
    if (!module || typeof module !== 'object' || typeof module.id !== 'string' || seen.has(module.id)) {
      faults.push('invalid or duplicate module id'); continue;
    }
    seen.add(module.id);
    const spec = expected[module.id];
    if (spec) {
      if (module.status !== 'bundled' || module.source !== 'corporate-site/' || module.legacyPath !== spec.legacyPath ||
        module.adminView !== spec.adminView || JSON.stringify(module.roles) !== JSON.stringify(spec.roles)) {
        faults.push('invalid bundled module: ' + module.id);
      }
    } else if (module.id === 'erp-core') {
      if (module.status !== 'source-only' || module.source !== 'erp/' || module.legacyPath !== null ||
        module.adminView !== null || !Array.isArray(module.roles) || module.roles.length !== 0) {
        faults.push('ERP runtime must stay disconnected');
      }
    } else {
      faults.push('unknown module ' + module.id);
    }
    if (!['corporate-site/', 'erp/'].includes(module.source)) {
      faults.push('module source outside allowlist: ' + module.id);
    } else {
      const directory = resolve(root, module.source);
      if (!directory.startsWith(resolve(root) + sep) || !statIsDirectory(directory)) faults.push('module source is missing: ' + module.id);
    }
  }
  for (const id of [...Object.keys(expected), 'erp-core']) {
    if (!seen.has(id)) faults.push('missing module ' + id);
  }
  const requiredGuards = ['db-ledger-check-and-verified-off-host-backup', 'explicit-production-approval', 'disk-headroom-below-90-percent'];
  if (!Array.isArray(manifest.promotionGuards) || requiredGuards.some(g => !manifest.promotionGuards.includes(g))) faults.push('release guards are missing');
  return faults;
}
function statIsDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}
export function loadModuleManifest(path = manifestPath) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const faults = validateModuleManifest(loadModuleManifest());
  if (faults.length) { console.error('KNABA_MODULE_MANIFEST_FAIL', faults.join('; ')); process.exitCode = 1; }
  else console.log('KNABA_MODULE_MANIFEST_PASS: 4 existing site modules + 1 source-only ERP; preview only. Not a deployment or release acceptance.');
}
