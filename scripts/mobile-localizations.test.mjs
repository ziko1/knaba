import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'knaba-native-catalog-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  for (const path of [
    'scripts/mobile/check-localizations.py', 'docs/mobile/RELEASE_VERSIONS.json',
    'erp/apps/mobile-ios/Sources', 'erp/apps/mobile-ios/Resources',
    'erp/apps/mobile-ios/Info.plist', 'erp/apps/mobile-ios/project.yml',
    'erp/apps/mobile-android/app/build.gradle.kts',
    'erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/NativeLocale.kt'
  ]) {
    mkdirSync(dirname(join(directory, path)), {recursive: true});
    cpSync(join(root, path), join(directory, path), {recursive: true});
  }
  return {
    run: () => spawnSync('python3', [join(directory, 'scripts/mobile/check-localizations.py')], {encoding: 'utf8', timeout: 10000}),
    edit(path, change) {const file = join(directory, path); writeFileSync(file, change(readFileSync(file, 'utf8')));}
  };
}

test('native catalog gate reports each current source version without claiming device acceptance', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const contract = JSON.parse(readFileSync(join(root, 'docs/mobile/RELEASE_VERSIONS.json')));
  for (const platform of ['android', 'ios']) {
    assert.deepEqual(report.versions[platform], {version: contract[platform].version, build: contract[platform].build});
  }
  assert.equal(report.nativeDeviceVerification, 'NOT_RUN');
  assert.equal(report.swiftCompilation, 'NOT_RUN');
  assert.deepEqual(report.languages, ['de', 'en', 'pl', 'lt', 'ru', 'uk']);
});

for (const [name, path, change, reason] of [
  ['iOS version drift', 'erp/apps/mobile-ios/project.yml', text => text.replace(/MARKETING_VERSION: "[^"]+"/, 'MARKETING_VERSION: "0.0.1"'), 'version differs'],
  ['Android build drift', 'erp/apps/mobile-android/app/build.gradle.kts', text => text.replace(/versionCode = \d+/, 'versionCode = 1'), 'build differs'],
  ['non-monotonic release build', 'docs/mobile/RELEASE_VERSIONS.json', text => {const value = JSON.parse(text); value.android.previouslyObservedBuild = value.android.build; return JSON.stringify(value);}, 'non-monotonic build'],
  ['missing translated value', 'erp/apps/mobile-ios/Sources/NativeLocalization.swift', text => text.replace('"Sprache", "Language"', '"Sprache", ""'), 'language'],
  ['localized placeholder mismatch', 'erp/apps/mobile-ios/Sources/ERPStrings.swift', text => text.replace('Authorized records: %@', 'Authorized records: %s'), 'authorizedCount']
]) {
  test(`native catalog gate rejects ${name}`, t => {
    const f = fixture(t); f.edit(path, change);
    const result = f.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, new RegExp(reason));
  });
}
