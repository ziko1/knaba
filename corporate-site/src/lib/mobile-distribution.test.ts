import {describe,it,expect} from 'vitest';
import {androidDistributionUrl,iosDistributionUrl,erpConsoleUrl} from './mobile-distribution';
describe('mobile distribution is gated by explicit safe release endpoints',()=>{
 it('does not invent download endpoints',()=>{
  expect(androidDistributionUrl(undefined)).toBeNull();
  expect(iosDistributionUrl('')).toBeNull();
  expect(erpConsoleUrl('')).toBeNull();
 });
 it('allows only approved Android release paths',()=>{
  expect(androidDistributionUrl('https://knaba.de/releases/knaba-release.apk')).toBe('https://knaba.de/releases/knaba-release.apk');
  expect(androidDistributionUrl('https://github.com/ziko1/knaba/releases/download/v1.2/knaba-v1.2.apk')).not.toBeNull();
  expect(androidDistributionUrl('https://example.com/knaba.apk')).toBeNull();
  expect(androidDistributionUrl('https://owner.example/knaba.apk','owner.example')).toBe('https://owner.example/knaba.apk');
  for(const bad of ['http://knaba.de/a.apk','https://knaba.de@evil.example/a.apk','https://knaba.de/a.apk?token=secret','https://github.com/ziko1/other/releases/download/v1/a.apk','https://knaba.de/a.exe'])expect(androidDistributionUrl(bad)).toBeNull();
 });
 it('accepts only known Apple distribution domains',()=>{
  expect(iosDistributionUrl('https://testflight.apple.com/join/AbcdEF123')).not.toBeNull();
  expect(iosDistributionUrl('https://apps.apple.com/de/app/knaba/id1234567890')).not.toBeNull();
  expect(iosDistributionUrl('https://evil.example/join/AbcdEF123')).toBeNull();
  expect(iosDistributionUrl('https://testflight.apple.com/join/AbcdEF123?key=x')).toBeNull();
 });
 it('requires a plain HTTPS origin for portable ERP console',()=>{
  expect(erpConsoleUrl('https://erp.knaba.de')).toBe('https://erp.knaba.de/console');
  for(const bad of ['http://localhost:3000','https://erp.knaba.de/path','https://user:pass@erp.knaba.de','https://erp.knaba.de/?x=1','javascript:alert(1)'])expect(erpConsoleUrl(bad)).toBeNull();
 });
});
