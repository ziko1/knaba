import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('an approved partner has a dedicated portal view without customer data actions',()=>{
  const src=readFileSync(new URL('../src/components/Portal.tsx',import.meta.url),'utf8');
  const start=src.indexOf("<Match when={role()==='partner'}>");
  const end=src.indexOf('<Match when={authorized()}>',start);
  assert.ok(start>0&&end>start,'partner view must precede general business dashboard');
  const panel=src.slice(start,end);
  assert.match(panel,/data-knaba-role="partner"/);
  assert.match(panel,/t\(\)\.partnerGuide/);
  assert.match(panel,/portalPublicPath\('\/kontakt\/',locale\(\)\)/);
  assert.doesNotMatch(panel,/mutate\(|\/api\/portal\/requests|\/api\/portal\/roles/);
  assert.match(src,/const authorized = \(\) => \['owner','admin','worker','client'\]\.includes\(role\(\)\)/);
});

test('partner backend retains the no-cross-customer-data policy',()=>{
  const source=readFileSync(new URL('../worker/api.ts',import.meta.url),'utf8');
  assert.match(source,/\['pending','suspended','partner'\]\.includes\(s\.role\)/);
  assert.match(source,/if\(s\.role==='owner'\)/);
});
