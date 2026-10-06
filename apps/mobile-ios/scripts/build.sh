#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v xcodebuild >/dev/null || { echo 'BLOCKED_EXTERNAL: macOS + Xcode required'; exit 69; }
command -v xcodegen >/dev/null || { echo 'MISSING_TOOLCHAIN: install XcodeGen 2.43.0 on macOS'; exit 69; }
xcodegen generate --spec project.yml
xcodebuild -project KNABADE.xcodeproj -scheme KNABADE -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
if [[ -n "${KNABA_IOS_TEST_DESTINATION:-}" ]]; then
  xcodebuild -project KNABADE.xcodeproj -scheme KNABADE -destination "$KNABA_IOS_TEST_DESTINATION" -derivedDataPath build -resultBundlePath build/NativeTests.xcresult CODE_SIGNING_ALLOWED=NO test
fi
