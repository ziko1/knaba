/** Test-process transport adapter. Never loaded by a production entrypoint. */
import assert from 'node:assert/strict';

assert.equal(process.env.APP_MODE,'TEST','SYNTHETIC_FEDERATION_REQUIRES_TEST_MODE');
const database=new URL(process.env.DATABASE_URL);
assert.equal(database.hostname,'127.0.0.1');
assert.match(database.pathname,/^\/knaba_bridge_(?:ci|test)$/);
const source=new URL(process.env.KNABA_BRIDGE_TEST_SITE_ORIGIN);
const relay=new URL(process.env.KNABA_BRIDGE_TEST_RELAY_ORIGIN);
assert.equal(source.protocol,'https:');
assert.equal(source.hostname,'site.federation.invalid');
assert.equal(relay.protocol,'http:');
assert.equal(relay.hostname,'127.0.0.1');
assert.equal(relay.pathname,'/');
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
  assert.equal(String(input),source.origin+'/api/federation/introspect','SYNTHETIC_FEDERATION_NETWORK_FENCE');
  assert.equal(init?.method,'POST');
  assert.equal(init?.redirect,'manual');
  return nativeFetch(relay.origin+'/site',init);
};
