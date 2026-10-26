import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const migrations=fileURLToPath(new URL('../drizzle/', import.meta.url));

test('VPS migrations have unique ordered numbers and both independent additive schemas',()=>{
  const names=readdirSync(migrations).filter(n=>/^\d{4}_[\w]+\.sql$/.test(n)).sort();
  const numbers=names.map(name=>name.slice(0,4));
  assert.equal(new Set(numbers).size,numbers.length,'duplicate migration sequence number');
  assert.ok(names.includes('0005_assistant_erp_bridge.sql'));
  assert.ok(names.includes('0006_owner_invite.sql'));
  assert.match(readFileSync(join(migrations,'0005_assistant_erp_bridge.sql'),'utf8'),/CREATE TABLE \`assistant_erp_requests\`/);
  assert.match(readFileSync(join(migrations,'0006_owner_invite.sql'),'utf8'),/CREATE TABLE IF NOT EXISTS vps_owner_invites/);
});
