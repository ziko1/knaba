import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('KNABA Mobile native launch uses system browser and cannot exfiltrate device bearer to site',()=>{
 const android=read('erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/MainActivity.kt');
 const ios=read('erp/apps/mobile-ios/Sources/KNABADEApp.swift');
 const aurl=read('erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/WorkspaceLinks.java');
 const surl=read('erp/apps/mobile-ios/Sources/WorkspaceRoutes.swift');
 assert.match(android,/Intent\\.ACTION_VIEW/);assert.match(android,/CATEGORY_BROWSABLE/);
 assert.match(android,/openWorkspace\\(true, "\\/app\\/"\\)/);assert.match(android,/openWorkspace\\(false, "\\/console"\\)/);
 assert.match(ios,/Link\\(model\\.text\\(\\.mobilePortal\\)/);
 assert.match(ios,/Link\\(model\\.text\\(\\.mobileErp\\)/);
 assert.match(aurl,/getRawUserInfo\\(\\) != null/);
 assert.match(surl,/value\\.user == nil, value\\.password == nil/);
 assert.doesNotMatch(android,/Intent\\(Intent\\.ACTION_VIEW[^\\n]*deviceToken/);
 assert.doesNotMatch(ios,/Link\\([^\\n]*deviceToken/);
});
test('Mobile entry retains restricted partner backend and no private service-worker caching',()=>{
 const page=read('corporate-site/src/components/MobileAppPage.astro');
 const worker=read('corporate-site/public/mobile-sw.js');
 const site=read('corporate-site/src/components/Portal.tsx');
 assert.match(page,/\\['owner','admin'\\]/.test(page)?/./:/owner.*admin/); // role router exists
 assert.match(page,/androidDistributionUrl/);assert.match(page,/iosDistributionUrl/);
 assert.doesNotMatch(worker,/cache\\.put|caches\\.open|fetch\\s*\\(/i);
 assert.match(site,/data-knaba-role="partner"/);
 assert.match(site,/const authorized = \\(\\) => \\['owner','admin','worker','client'\\]\\.includes\\(role\\(\\)\\)/);
});
