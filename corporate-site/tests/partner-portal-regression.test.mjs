import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('partner is a first-class authenticated portal role with its own request controls',()=>{
  const src=readFileSync(new URL('../src/components/Portal.tsx',import.meta.url),'utf8');
  assert.match(src,/const canRequest = \(\) => role\(\) === 'client' \|\| role\(\) === 'partner'/);
  assert.match(src,/const authorized = \(\) => \['owner','admin','worker','client','partner','bauleiter'\]/);
  assert.match(src,/data-knaba-role=\{role\(\)\}/);
  // Approved clients and partners keep their request draft mounted between tabs.
  assert.match(src,/<Show when=\{canRequest\(\)\}><div class="portal-panel" hidden=\{currentTab\(\)!=='newRequest'\}><RequestForm/);
  assert.doesNotMatch(src,/<Match when=\{role\(\)==='partner'\}>/);
  assert.match(src,/role\(\)==='owner'\?\['people','activity'\]/);
});
test('partner backend can only create and view own scoped requests, never worker notes',()=>{
  const src=readFileSync(new URL('../worker/api.ts',import.meta.url),'utf8');
  assert.match(src,/requireRole\(s,\['client','partner'\]\)/);
  assert.match(src,/const filters=\(s.role==='client'\|\|s.role==='partner'\)\?'client_id=\?'/);
  // Pagination and totals must both retain the partner filter and actor membership.
  assert.match(src,/const where=`\$\{filters\} AND \$\{actor\}`/);
  assert.match(src,/SELECT count\(\*\) AS count FROM cleaning_requests WHERE \$\{where\}/);
  assert.match(src,/SELECT \* FROM cleaning_requests WHERE \$\{where\}\$\{after\}/);
  assert.match(src,/role !== 'client' && role !== 'partner'/);
  assert.match(src,/const scopeGuard=\(s.role==='client'\|\|s.role==='partner'\)\?' AND client_id=\?'/);
  assert.match(src,/role=\? AND status='approved'/);
});
