#!/usr/bin/env python3
"""Static catalog and declared-version checks, not Swift compilation or device QA."""
import json
from pathlib import Path
import plistlib
import re
import subprocess

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
config = (IOS / 'project.yml').read_text()
assert 'MARKETING_VERSION: "0.3.0"' in config and 'CURRENT_PROJECT_VERSION: "3"' in config
config = (ANDROID / 'app/build.gradle.kts').read_text()
assert 'versionCode = 3' in config and 'versionName = "0.3.0"' in config
assert '?? "de"' in (IOS / 'Sources/AppModel.swift').read_text()
assert 'getString(KEY, "de")' in (ANDROID / 'app/src/main/java/de/knaba/mobile/NativeLocale.kt').read_text()
assert 'language: language.rawValue.uppercased()' in (IOS / 'Sources/ERPConsoleView.swift').read_text()
print(json.dumps({'status': 'PASS_STATIC_ONLY', 'languages': LANGUAGES, 'default': 'de', 'iosCompanionKeys': len(native), 'iosERPKeys': len(erp), 'version': '0.3.0', 'build': 3, 'swiftCompilation': 'NOT_RUN', 'nativeDeviceVerification': 'NOT_RUN'}, indent=2))
