import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('KNABA Mobile ships genuine role-based native views without embedded browser',()=>{
 const iOS=read('erp/apps/mobile-ios/Sources/ERPConsoleView.swift');
 const android=read('erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/ErpConsoleActivity.kt');
 const manifest=read('erp/apps/mobile-android/app/src/main/AndroidManifest.xml');
 const root=read('erp/apps/mobile-ios/Sources/KNABADEApp.swift');
 assert.match(iOS,/struct ERPConsoleView: View/);assert.match(iOS,/ERPCommandForm/);
 assert.match(android,/class ErpConsoleActivity : Activity/);
 // Pending requests capture the session transport so a later login cannot redirect a mutation.
 assert.match(android,/val transport = api/);assert.match(android,/transport\.command/);
 assert.match(manifest,/android:name=".ErpConsoleActivity" android:exported="true"/);
 assert.match(root,/ERPConsoleView\(preferences:\s*model\)/);
 assert.match(iOS,/@ObservedObject\s+var preferences:\s*AppModel/);
 assert.doesNotMatch(iOS,/WKWebView|SFSafariViewController/);
 assert.doesNotMatch(android,/android\.webkit|WebView\(/);
});
test('Native accounts use existing ERP authenticated server commands and do not bypass access or location gate',()=>{
 const swift=read('erp/apps/mobile-ios/Sources/ERPConsoleCore.swift');
 const recovery=read('erp/apps/mobile-ios/Sources/ERPConsoleRecovery.swift');
 const java=read('erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/ErpConsoleTransport.java');
 const auth=read('erp/apps/api/auth.ts');
 const api=read('erp/apps/api/http.ts');
 assert.match(swift,/\/api\/v1\/auth\/login/); assert.match(java,/\/api\/v1\/auth\/login/);
 assert.match(swift,/X-CSRF-Token/);assert.match(java,/X-CSRF-Token/);
 // iOS serializes the exact envelope once in the durable command boundary.
 assert.match(recovery,/idempotency_key/);assert.match(swift,/command\.body/);assert.match(java,/idempotency_key/);
 assert.match(swift,/\/api\/v1\/commands/); assert.match(java,/\/api\/v1\/commands/);
 assert.match(auth,/SESSION_COOKIE='knaba_session'/);assert.match(api,/@Get\('entities\/:kind'\)/);
 assert.doesNotMatch(swift+recovery,/deviceToken/);assert.doesNotMatch(java,/deviceToken/);
});
test('Homepage contains one mobile work section in correct process-to-FAQ flow and no fake downloads',()=>{
 const home=read('corporate-site/src/components/ConstructionHome.astro');
 const promo=read('corporate-site/src/components/HomeMobilePromo.astro');
 assert.equal((home.match(/<HomeMobilePromo locale=/g)||[]).length,1);
 assert.ok(home.indexOf('<ProjectScopeGuide')<home.indexOf('<HomeMobilePromo'));
 assert.ok(home.indexOf('<HomeMobilePromo')<home.indexOf('<ConstructionFaq'));
 assert.match(promo,/href=\{prefix\+'\/app\/'\}/);
 assert.doesNotMatch(promo,/\.apk|\.ipa|testflight\.apple\.com/);
});
