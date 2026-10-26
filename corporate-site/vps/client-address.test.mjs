import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClientAddressResolver} from './client-address.mjs';

const request=(peer,forwarded,extra={})=>({socket:{remoteAddress:peer},headers:{'x-forwarded-for':forwarded,...extra}});
test('forwarded identity is ignored by default and from untrusted peers',()=>{
  for(const resolve of [createClientAddressResolver(),createClientAddressResolver(['10.0.0.2'])]){
    assert.equal(resolve(request('192.0.2.5','203.0.113.9',{'cf-connecting-ip':'203.0.113.10'})),'192.0.2.5');
  }
});
test('trusted edge separates real clients and discards spoofed left prefixes',()=>{
  const resolve=createClientAddressResolver(['10.0.0.2']);
  assert.equal(resolve(request('10.0.0.2','198.51.100.1')),'198.51.100.1');
  assert.equal(resolve(request('10.0.0.2','198.51.100.2')),'198.51.100.2');
  for(const forged of ['203.0.113.10','10.0.0.2','127.0.0.1'])
    assert.equal(resolve(request('10.0.0.2',forged+', 198.51.100.1')),'198.51.100.1');
});
test('only explicitly trusted intermediate hops are traversed',()=>{
  const resolve=createClientAddressResolver(['10.0.0.2','10.0.0.3']);
  assert.equal(resolve(request('10.0.0.2','198.51.100.1, 10.0.0.3')),'198.51.100.1');
  assert.equal(resolve(request('10.0.0.2','198.51.100.1, 10.0.0.4')),'10.0.0.4');
});
test('missing, malformed, ambiguous and excessive forwarding falls back to the socket peer',()=>{
  const resolve=createClientAddressResolver(['10.0.0.2']);
  for(const forwarded of [undefined,[],['198.51.100.1'],'','bad','198.51.100.1,','unknown, 198.51.100.1',
    '198.51.100.1:443','[2001:db8::1]','fe80::1%eth0',Array(17).fill('198.51.100.1').join(','),'x'.repeat(1025)])
    assert.equal(resolve(request('10.0.0.2',forwarded)),'10.0.0.2');
});
test('equivalent IPv6 and IPv4-mapped addresses share the same bucket',()=>{
  const resolve=createClientAddressResolver(['::ffff:10.0.0.2','2001:db8::2']);
  assert.equal(resolve(request('::ffff:a00:2','::ffff:192.0.2.1')),'192.0.2.1');
  assert.equal(resolve(request('2001:0DB8:0:0:0:0:0:2','2001:0DB8:0:0:0:0:0:1')),'2001:db8::1');
});
test('invalid trust configuration fails before server startup',()=>{
  for(const ips of ['10.0.0.2',['*'],['10.0.0.0/8'],['localhost'],[''],['127.0.0.1:443']])
    assert.throws(()=>createClientAddressResolver(ips),/Trusted proxy/);
});
