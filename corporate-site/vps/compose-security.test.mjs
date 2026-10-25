import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const compose=readFileSync(new URL('./docker-compose.yml',import.meta.url),'utf8');
test('KnaBa release preserves exact-domain HTTPS 308 and seven-day scoped HSTS',()=>{
  const bt=String.fromCharCode(96);
  assert.ok(compose.includes('traefik.http.routers.knaba-vps-public.rule: "Host('+bt+'kneba.vsp.rest'+bt+')"'));
  assert.match(compose,/traefik\.http\.routers\.knaba-vps-public\.tls\.certresolver: "letsencrypt"/);
  assert.match(compose,/traefik\.http\.middlewares\.knaba-vps-redirect\.redirectscheme\.permanent: "true"/);
  assert.match(compose,/traefik\.http\.routers\.knaba-vps-public\.middlewares: "knaba-vps-secure-headers"/);
  assert.match(compose,/traefik\.http\.middlewares\.knaba-vps-secure-headers\.headers\.stsSeconds: "604800"/);
  assert.doesNotMatch(compose,/stsIncludeSubdomains|stsPreload|includeSubDomains|preload/i);
  assert.match(compose,/127\.0\.0\.1:19110:8080/);
  assert.match(compose,/read_only: true/);
  assert.match(compose,/cap_drop:\s*\["ALL"\]/);
});
