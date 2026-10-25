import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectPublicUrls,isReleaseEligible,prepareIndexNow} from '../scripts/indexnow-submit.mjs';

test('cannot submit unapproved or noindex sitemap',()=>{
  assert.throws(()=>collectPublicUrls('<urlset></urlset>','https://kneba.vsp.rest'),/Sitemap empty/);
  assert.equal(isReleaseEligible('vsp','0','1'),false);
  assert.equal(isReleaseEligible('vsp','1','0'),false);
  assert.equal(isReleaseEligible('official','0','0'),false);
  assert.equal(isReleaseEligible('official','0','1'),true);
});
test('extracts only canonical sitemap URLs, not hreflang targets',()=>{
  const xml='<urlset><url><loc>https://knaba.de/</loc><xhtml:link href="https://knaba.de/ru/" /></url><url><loc>https://knaba.de/leistungen/</loc></url></urlset>';
  assert.deepEqual(collectPublicUrls(xml,'https://knaba.de'),['https://knaba.de/','https://knaba.de/leistungen/']);
  assert.throws(()=>collectPublicUrls(xml,'https://kneba.vsp.rest'),/Unsafe/);
  assert.throws(()=>collectPublicUrls('<url><loc>https://knaba.de/konto/?token=1</loc></url>','https://knaba.de'),/Unsafe/);
});
test('key proof stays on identical HTTPS host',()=>{
  const args={origin:'https://knaba.de',urls:['https://knaba.de/'],key:'12345678',keyLocation:'https://knaba.de/12345678.txt'};
  assert.equal(prepareIndexNow(args).host,'knaba.de');
  assert.throws(()=>prepareIndexNow({...args,keyLocation:'https://evil.example/key.txt'}),/exact verified HTTPS/);
  assert.throws(()=>prepareIndexNow({...args,key:'bad'}),/Invalid/);
});
