#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'BLOCKED_EXTERNAL: macOS + Xcode required'; exit 69; }
command -v xcodebuild >/dev/null || { echo 'BLOCKED_EXTERNAL: macOS + Xcode required'; exit 69; }
command -v xcodegen >/dev/null || { echo 'MISSING_TOOLCHAIN: install XcodeGen 2.43.0 on macOS'; exit 69; }
xcodegen version | grep -Eq '(^| )2\.43\.0($| )' || { echo 'MISSING_TOOLCHAIN: XcodeGen 2.43.0 required'; exit 69; }
xcodegen generate --spec project.yml
# The generated scheme is inspected before use. A simulator build cannot produce a phone IPA.
xcodebuild -list -json -project KNABADE.xcodeproj > build-project-list.json
python3 - <<'PY'
import json
with open('build-project-list.json') as source:
    project=json.load(source)
if 'KNABADE' not in project.get('project',{}).get('schemes',[]):
    raise SystemExit('KNABADE scheme missing from generated project')
PY
mkdir -p build/evidence
mv build-project-list.json build/evidence/project-list.json
xcodebuild -project KNABADE.xcodeproj -scheme KNABADE -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
if [[ -n "${KNABA_IOS_TEST_DESTINATION:-}" ]]; then
  [[ ! -e build/NativeTests.xcresult ]] || { echo 'Existing NativeTests.xcresult: choose a fresh build checkout.' >&2; exit 65; }
  xcodebuild -project KNABADE.xcodeproj -scheme KNABADE -configuration Debug -sdk iphonesimulator -destination "$KNABA_IOS_TEST_DESTINATION" -destination-timeout 120 -derivedDataPath build -resultBundlePath build/NativeTests.xcresult -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO test
fi
