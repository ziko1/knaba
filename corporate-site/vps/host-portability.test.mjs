import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('KNABA Compose healthcheck and proxy follow the configured owner domain, not the old preview hostname',()=>{
 const source=readFileSync(new URL('./docker-compose.yml',import.meta.url),'utf8');
 assert.match(source,/KNABA_PUBLIC_HOST:\s*"\$\{KNABA_PUBLIC_HOST:\?/);
 assert.match(source,/Host:process\.env\.KNABA_PUBLIC_HOST/);
 assert.doesNotMatch(source,/Host:'kneba\.vsp\.rest'/);
 assert.match(source,/KNABA_PROXY_NETWORK:-coolify/);
 assert.match(source,/traefik\.docker\.network: "\$\{KNABA_PROXY_NETWORK:-coolify\}"/);
 assert.match(source,/name: "\$\{KNABA_PROXY_NETWORK:-coolify\}"/);
});
