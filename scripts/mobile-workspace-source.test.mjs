import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('native KNABA workspace uses browser handoff without sharing device bearer credentials',()=>{
 const android=read('erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/MainActivity.kt');
 const ios=read('erp/apps/mobile-ios/Sources/KNABADEApp.swift');
 const aurl=read('erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/WorkspaceLinks.java');
 const surl=read('erp/apps/mobile-ios/Sources/WorkspaceRoutes.swift');
 assert.ok(android.includes('Intent.ACTION_VIEW'));
 assert.ok(android.includes('CATEGORY_BROWSABLE'));
 assert.ok(android.includes('openWorkspace(true, "/app/")'));
 assert.ok(android.includes('openWorkspace(false, "/console")'));
 assert.ok(ios.includes('Link(model.text(.mobilePortal)'));
 assert.ok(ios.includes('Link(model.text(.mobileErp)'));
 assert.ok(aurl.includes('getRawUserInfo() != null'));
 assert.ok(surl.includes('value.user == nil, value.password == nil'));
 assert.ok(!android.includes('Intent.ACTION_VIEW + deviceToken'));
});

test('mobile portal preserves backend-restricted partners, gated binaries and no private offline caching',()=>{
 const page=read('corporate-site/src/components/MobileAppPage.astro');
 const worker=read('corporate-site/public/mobile-sw.js');
 const site=read('corporate-site/src/components/Portal.tsx');
 assert.ok(page.includes("role==='owner'||role==='admin'"));
 assert.ok(page.includes('androidDistributionUrl'));
 assert.ok(page.includes('iosDistributionUrl'));
 assert.ok(!worker.includes('caches.open'));
 assert.ok(!worker.includes('cache.put'));
 assert.ok(site.includes('data-knaba-role="partner"'));
 assert.ok(site.includes("['owner','admin','worker','client'].includes(role())"));
});
