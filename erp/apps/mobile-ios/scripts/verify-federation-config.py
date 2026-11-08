#!/usr/bin/env python3
"""Source/configuration proof only; actual compilation/XCTest are separate gates."""
import argparse
import hashlib
import json
import plistlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALLBACK = [{'CFBundleURLName': 'knaba-ios-test-v1', 'CFBundleURLSchemes': ['de.knaba.mobile.ios.test']}]

def require(condition, message):
    if not condition:
        raise ValueError(message)

def check_plists(base, debug):
    require('CFBundleURLTypes' not in base, 'Release plist must not register a TEST callback')
    require(debug.get('CFBundleURLTypes') == CALLBACK, 'Debug callback must exactly match the reviewed registry')
    require({k: v for k, v in debug.items() if k != 'CFBundleURLTypes'} == base, 'Other Info.plist keys must remain identical')

def check_settings(values, configuration):
    rows = [row for row in values if row.get('target') == 'KNABADE']
    require(len(rows) == 1, 'Exactly one app target is required')
    settings = rows[0]['buildSettings']
    require(settings.get('CONFIGURATION') == configuration, 'Wrong configuration receipt')
    conditions = settings.get('SWIFT_ACTIVE_COMPILATION_CONDITIONS', '').split()
    if configuration == 'Debug':
        require('DEBUG' in conditions and 'KNABA_FEDERATION_TEST' in conditions, 'Debug TEST conditions missing')
        expected = ROOT / 'Info.Debug.plist'
    else:
        require('DEBUG' not in conditions and 'KNABA_FEDERATION_TEST' not in conditions, 'Release must not compile TEST registry')
        expected = ROOT / 'Info.plist'
    actual = ROOT / settings.get('INFOPLIST_FILE', '')
    require(actual.resolve() == expected.resolve(), 'Wrong configured Info.plist')
    expected_settings = {'PRODUCT_BUNDLE_IDENTIFIER': 'de.knaba.mobile', 'IPHONEOS_DEPLOYMENT_TARGET': '17.0',
                         'MARKETING_VERSION': '0.5.0', 'CURRENT_PROJECT_VERSION': '8'}
    require(all(str(settings.get(k)) == value for k, value in expected_settings.items()), 'Existing bundle/minimum/version identity changed')
    return {'configuration': configuration, 'conditions': conditions, 'infoPlist': expected.name, **expected_settings}

def check_product(value):
    require(value.get('CFBundleURLTypes') == CALLBACK, 'Built Debug app callback mismatch')
    for key, expected in [('CFBundleIdentifier', 'de.knaba.mobile'), ('CFBundleVersion', '8'), ('CFBundleShortVersionString', '0.5.0'), ('MinimumOSVersion', '17.0')]:
        require(value.get(key) == expected, 'Built Debug app identity mismatch: ' + key)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--debug-settings', type=Path)
    parser.add_argument('--release-settings', type=Path)
    parser.add_argument('--debug-product', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    require(bool(args.debug_settings) == bool(args.release_settings), 'Both resolved configurations are required together')
    check_plists(plistlib.loads((ROOT / 'Info.plist').read_bytes()), plistlib.loads((ROOT / 'Info.Debug.plist').read_bytes()))
    configurations = []
    if args.debug_settings:
        configurations = [check_settings(json.loads(path.read_text()), config) for path, config in [(args.debug_settings, 'Debug'), (args.release_settings, 'Release')]]
    if args.debug_product:
        require(bool(configurations), 'Product proof requires resolved settings')
        check_product(plistlib.loads(args.debug_product.read_bytes()))
    inputs = []
    for name in ['project.yml', 'Info.plist', 'Info.Debug.plist', 'Sources/ERPFederationLogin.swift']:
        path = ROOT / name; require(not path.is_symlink(), 'Unexpected source symlink')
        data = path.read_bytes(); inputs.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
    report = {'schemaVersion': 1, 'scope': 'TEST/Release configuration isolation; not browser/device or release acceptance',
              'plistParity': 'PASS', 'resolvedBuildSettings': 'PASS' if configurations else 'NOT_RUN',
              'compiledDebugPlist': 'PASS' if args.debug_product else 'NOT_RUN', 'releaseCompilation': 'NOT_RUN',
              'configurations': configurations, 'inputs': inputs}
    output = json.dumps(report, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(output)
    else:
        print(output, end='')

if __name__ == '__main__':
    main()
