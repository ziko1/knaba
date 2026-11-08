#!/usr/bin/env python3
"""Build-variant exposure guard. Optional AGP manifests prove the actual merge separately."""
import argparse
import pathlib
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--merged-debug', type=pathlib.Path)
parser.add_argument('--merged-release', type=pathlib.Path)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
ns = '{http://schemas.android.com/apk/res/android}'
callback = '.FederationCallbackActivity'

def receiver(manifest):
    activities = manifest.findall('./application/activity')
    return [node for node in activities if node.get(ns + 'name', '').endswith(callback)]

def check_debug(path):
    items = receiver(ET.parse(path).getroot())
    assert len(items) == 1, 'Exactly one TEST callback receiver'
    node = items[0]
    assert node.get(ns + 'exported') == 'true'
    assert node.get(ns + 'noHistory') == 'true'
    assert node.get(ns + 'excludeFromRecents') == 'true'
    filters = node.findall('intent-filter')
    assert len(filters) == 1
    assert [item.get(ns + 'name') for item in filters[0].findall('action')] == ['android.intent.action.VIEW']
    assert {item.get(ns + 'name') for item in filters[0].findall('category')} == {'android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'}
    data = filters[0].findall('data')
    assert len(data) == 1 and data[0].attrib == {ns + 'scheme': 'de.knaba.mobile.test'}

def check_release(path):
    tree = ET.parse(path).getroot()
    assert not receiver(tree), 'TEST callback must be absent in Release'
    assert not tree.findall(".//data[@" + ns + "scheme='de.knaba.mobile.test']")

check_debug(root / 'app/src/debug/AndroidManifest.xml')
check_release(root / 'app/src/main/AndroidManifest.xml')
for variant in ['main', 'release']:
    assert not (root / ('app/src/' + variant + '/java/de/knaba/mobile/FederationCallbackActivity.java')).exists()
    manifest = root / ('app/src/' + variant + '/AndroidManifest.xml')
    if manifest.exists():
        check_release(manifest)
assert (root / 'app/src/debug/java/de/knaba/mobile/FederationCallbackActivity.java').is_file()
print('PASS source TEST-only callback boundary; Release registry has no callback component')
if args.merged_debug or args.merged_release:
    assert args.merged_debug and args.merged_release, 'Both AGP outputs are required'
    check_debug(args.merged_debug)
    check_release(args.merged_release)
    assert ET.parse(args.merged_debug).getroot().get('package') == 'de.knaba.mobile.test'
    assert ET.parse(args.merged_release).getroot().get('package') == 'de.knaba.mobile'
    print('PASS actual AGP Debug/Release manifest exposure and package isolation; no APK/device claim')
