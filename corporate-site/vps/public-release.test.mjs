import test from 'node:test';
import assert from 'node:assert/strict';
import {publicRelease} from './public-release.mjs';
test('release defaults remain German, six ordered languages, unconfigured destinations',()=>{
  const r=publicRelease({TELEGRAM_BOT_TOKEN:'PRIVATE',OWNER_EMAIL:'private@example.test'});
  assert.deepEqual(r.languages,['de','en','pl','lt','ru','uk']);assert.equal(r.defaultLanguage,'de');
  assert.equal(r.stage,'prototype');assert.equal(r.android.url,null);assert.equal(r.ios.url,null);
  assert.equal(r.channels.telegram.url,null);assert.equal(r.migration.workingOrigin,null);
  assert.ok(!JSON.stringify(r).includes('PRIVATE'));assert.ok(!JSON.stringify(r).includes('private@example.test'));
});
test('separate verified public bot destinations never imply delivery acceptance',()=>{
  const r=publicRelease({KNABA_VERIFIED_TELEGRAM_BOT:'SyntheticKnabaBot',KNABA_VERIFIED_WHATSAPP_NUMBER:'491111111111'});
  assert.equal(r.channels.telegram.url,'https://t.me/SyntheticKnabaBot?start=website');
  assert.equal(r.channels.whatsapp.url,'https://wa.me/491111111111');assert.equal(r.channels.telegram.status,'configured');
});
test('Android prototype is explicitly identified and requires a hash and approved hosting path',()=>{
  const env={KNABA_ANDROID_APK_URL:'https://customer.example.test/downloads/knaba-prototype.apk',KNABA_ANDROID_APK_SHA256:'a'.repeat(64),KNABA_ANDROID_DISTRIBUTION:'prototype'};
  assert.equal(publicRelease(env,'https://customer.example.test').android.distribution,'prototype');
  for(const patch of [{KNABA_ANDROID_APK_SHA256:''},{KNABA_ANDROID_DISTRIBUTION:''},{KNABA_ANDROID_APK_URL:'https://evil.test/downloads/x.apk'},{KNABA_ANDROID_APK_URL:'https://customer.example.test/downloads/x.apk?token=private'}])assert.equal(publicRelease({...env,...patch},'https://customer.example.test').android.url,null);
});
test('iOS only links Apple distribution; migration is explicit and validated',()=>{
  assert.equal(publicRelease({KNABA_IOS_INSTALL_URL:'https://example.test/a.ipa'}).ios.url,null);
  assert.equal(publicRelease({KNABA_IOS_INSTALL_URL:'https://testflight.apple.com/join/AbCd1234'}).ios.status,'available');
  assert.equal(publicRelease({KNABA_WORKING_ORIGIN:'https://customer.test'}).migration.state,'pending');
  assert.equal(publicRelease({KNABA_WORKING_ORIGIN:'https://customer.test',KNABA_WORKING_ORIGIN_VERIFIED:'true'}).migration.workingOrigin,'https://customer.test');
  for(const value of ['javascript:alert(1)','https://user:pass@customer.test','https://customer.test/path','https://customer.test?secret=a'])assert.equal(publicRelease({KNABA_WORKING_ORIGIN:value,KNABA_WORKING_ORIGIN_VERIFIED:'true'}).migration.state,'pending');
});
