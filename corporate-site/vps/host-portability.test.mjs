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

test('release checksum is generated with a relative filename so it verifies after moving to another server',()=>{
 const script=readFileSync(new URL('./owner-server-setup.sh',import.meta.url),'utf8');
 assert.match(script,/cd "\$dir" && sha256sum "\$\(basename "\$bundle"\)"/);
 assert.match(script,/cd "\$\(dirname "\$bundle"\)" && sha256sum -c/);
 assert.doesNotMatch(script,/^ sha256sum "\$bundle" > "\$bundle\.sha256"/m);
});
