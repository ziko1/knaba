#!/usr/bin/env python3
"""Static catalog and declared-version checks, not Swift compilation or device QA."""
import json
from pathlib import Path
import plistlib
import re

ROOT = Path(__file__).resolve().parents[2]
LANGUAGES = ['de', 'en', 'pl', 'lt', 'ru', 'uk']
IOS = ROOT / 'erp/apps/mobile-ios'
ANDROID = ROOT / 'erp/apps/mobile-android'

def table(path, enum):
    source = path.read_text()
    body = re.search(r'enum '+enum+r': String, CaseIterable[^\{]*\{(.*?)\n\}', source, re.S)[1]
    keys = [key.strip() for row in re.findall(r'^\s*case (.*)', body, re.M) for key in row.split(',')]
    rows = {key: json.loads(value) for key, value in re.findall(r'^\s*\.(\w+): (\[.*\]),?$', source, re.M)}
    assert set(keys) == set(rows), f'{path.name}: missing or extra translations'
    for key, values in rows.items():
        assert len(values) == 6 and all(value.strip() for value in values), key
        assert len({value.count('%@') for value in values}) == 1, key
    return rows

native = table(IOS / 'Sources/NativeLocalization.swift', 'NativeText')
erp = table(IOS / 'Sources/ERPStrings.swift', 'ERPText')
assert re.search(r'case de, en, pl, lt, ru, uk', (IOS / 'Sources/NativeLocalization.swift').read_text())
assert native['language'] == ['Sprache', 'Language', 'Język', 'Kalba', 'Язык', 'Мова']
assert erp['signIn'][0] == 'Sicher anmelden'
assert erp['authorizedCount'][1] == 'Authorized records: %@'
assert erp['authorizedCount'][5] == 'Доступні записи: %@'
with (IOS / 'Info.plist').open('rb') as file:
    info = plistlib.load(file)
assert info['CFBundleLocalizations'] == LANGUAGES
assert info['CFBundleDevelopmentRegion'] == 'de'
assert info['NSAppTransportSecurity']['NSAllowsArbitraryLoads'] is False
for language in LANGUAGES:
    assert (IOS / 'Resources' / (language + '.lproj') / 'InfoPlist.strings').is_file()
versions = json.loads((ROOT / 'docs/mobile/RELEASE_VERSIONS.json').read_text())
assert versions['schemaVersion'] == 1, 'unsupported release version contract'
patterns = {
    'ios': (IOS / 'project.yml', r'^\s*MARKETING_VERSION:\s*"([^"\n]+)"\s*$',
            r'^\s*CURRENT_PROJECT_VERSION:\s*"(\d+)"\s*$'),
    'android': (ANDROID / 'app/build.gradle.kts', r'\bversionName\s*=\s*"([^"\n]+)"',
                r'\bversionCode\s*=\s*(\d+)\b'),
}
declared_versions = {}
for platform, (path, version_pattern, build_pattern) in patterns.items():
    expected = versions[platform]
    assert re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', expected['version']), platform + ': invalid version'
    assert type(expected['build']) is int and type(expected['previouslyObservedBuild']) is int, platform + ': invalid build'
    assert 0 <= expected['previouslyObservedBuild'] < expected['build'] <= 2100000000, platform + ': non-monotonic build'
    config = path.read_text()
    version_matches = re.findall(version_pattern, config, re.M)
    build_matches = re.findall(build_pattern, config, re.M)
    assert version_matches == [expected['version']], platform + ': version differs from release contract'
    assert build_matches == [str(expected['build'])], platform + ': build differs from release contract'
    declared_versions[platform] = {'version': expected['version'], 'build': expected['build']}
assert info['CFBundleShortVersionString'] == '$(MARKETING_VERSION)'
assert info['CFBundleVersion'] == '$(CURRENT_PROJECT_VERSION)'
assert '?? "de"' in (IOS / 'Sources/AppModel.swift').read_text()
assert 'getString(KEY, "de")' in (ANDROID / 'app/src/main/java/de/knaba/mobile/NativeLocale.kt').read_text()
assert 'language: language.rawValue.uppercased()' in (IOS / 'Sources/ERPConsoleView.swift').read_text()
print(json.dumps({'status': 'PASS_STATIC_ONLY', 'languages': LANGUAGES, 'default': 'de', 'iosCompanionKeys': len(native), 'iosERPKeys': len(erp), 'versions': declared_versions, 'swiftCompilation': 'NOT_RUN', 'nativeDeviceVerification': 'NOT_RUN'}, indent=2))
