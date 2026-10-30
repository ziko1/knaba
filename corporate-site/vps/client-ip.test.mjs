import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClientIp,createClientIpResolver} from './client-ip.mjs';

const request=(peer,client,other={})=>({socket:{remoteAddress:peer},headers:{'cf-connecting-ip':client,...other}});
test('default and untrusted peers ignore all spoofed forwarding headers',()=>{
  for(const config of ['', '172.20.0.1']){
    const resolve=createClientIpResolver(config);
    for(const client of ['198.51.100.1','198.51.100.2']){
      assert.equal(resolve(request('::ffff:192.0.2.3',client,{
        'x-forwarded-for':client,'x-real-ip':client,forwarded:'for='+client,'x-forwarded-proto':'https'
      })),'192.0.2.3');
    }
  }
});
test('trusted exact peer resolves separate visitors and ignores alternate headers',()=>{
  const resolve=createClientIpResolver('172.20.0.1');
  assert.equal(resolve(request('::ffff:172.20.0.1','198.51.100.1')),'198.51.100.1');
  assert.equal(resolve(request('172.20.0.1','198.51.100.2')),'198.51.100.2');
  assert.equal(resolve(request('172.20.0.1',undefined,{'x-forwarded-for':'198.51.100.2'})),'172.20.0.1');
});
test('IPv4, IPv4-mapped and canonical IPv6 share one address identity',()=>{
  for(const value of ['192.0.2.1','::ffff:192.0.2.1','0:0:0:0:0:FFFF:C000:0201']){
    assert.equal(normalizeClientIp(value),'192.0.2.1');
  }
  assert.equal(normalizeClientIp('2001:0DB8:0000:0000:0000:0000:0000:0001'),'2001:db8::1');
  const resolve=createClientIpResolver('::ffff:172.20.0.1,2001:0db8:0:0:0:0:0:2');
  assert.equal(resolve(request('172.20.0.1','::ffff:192.0.2.1')),'192.0.2.1');
  assert.equal(resolve(request('2001:db8::2','2001:0DB8::1')),'2001:db8::1');
});
test('explicit IPv4/IPv6 CIDRs include only their declared peer ranges',()=>{
  for(const config of ['172.20.0.0/24','::ffff:172.20.0.0/120']){
    const resolve=createClientIpResolver(config);
    assert.equal(resolve(request('::ffff:172.20.0.255','192.0.2.1')),'192.0.2.1');
    assert.equal(resolve(request('172.20.1.1','192.0.2.1')),'172.20.1.1');
  }
  const resolve=createClientIpResolver('2001:db8::/64');
  assert.equal(resolve(request('2001:db8::2','192.0.2.1')),'192.0.2.1');
  assert.equal(resolve(request('2001:db8:0:1::2','192.0.2.1')),'2001:db8:0:1::2');
});
test('malformed, multiple, missing and oversized client headers fall back to socket',()=>{
  const resolve=createClientIpResolver('172.20.0.1');
  for(const client of [undefined,null,[],['192.0.2.1'],'','unknown','192.0.2.1, 198.51.100.1',
    '192.0.2.1:80','[2001:db8::1]','fe80::1%eth0','"192.0.2.1"',' 192.0.2.1',
    '192.0.2.1\r\nX: evil','192.0.02.1','x'.repeat(4096)]){
    assert.equal(resolve(request('::ffff:172.20.0.1',client)),'172.20.0.1');
  }
  assert.equal(resolve(request(undefined,'192.0.2.1')),'unknown');
});
test('invalid and unlimited trust configuration fails closed',()=>{
  for(const config of [null,[],42,'*','localhost','127.0.0.1,','127.0.0.1,,::1',
    '0.0.0.0/0','::/0','172.20.0.1/33','::1/129','127.0.0.1/-1','127.0.0.1/01',
    '127.0.0.1/24/1','::ffff:172.20.0.0/96','fe80::1%eth0','127.0.0.1:80',
    '[::1]','x'.repeat(4097),Array(33).fill('127.0.0.1').join(',')]){
    assert.throws(()=>createClientIpResolver(config),/Invalid KNABA_TRUSTED_PROXY_IPS configuration/);
  }
});
