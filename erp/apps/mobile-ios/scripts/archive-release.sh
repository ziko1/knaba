#!/usr/bin/env bash
# Requires the customer's Apple team and export configuration; never fabricates a distributable IPA.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'BLOCKED_EXTERNAL: macOS + Xcode and owner signing assets are required.' >&2; exit 69; }
for KNABA_IOS_TOOL in xcodebuild xcodegen codesign security python3 openssl plutil; do
  command -v "$KNABA_IOS_TOOL" >/dev/null || { echo "BLOCKED_EXTERNAL: missing $KNABA_IOS_TOOL" >&2; exit 69; }
done
[[ "${KNABA_APPLE_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]] || { echo 'BLOCKED_EXTERNAL: KNABA_APPLE_TEAM_ID must identify the owner Apple team.' >&2; exit 69; }
[[ -f "${KNABA_IOS_EXPORT_OPTIONS:-}" ]] || { echo 'BLOCKED_EXTERNAL: KNABA_IOS_EXPORT_OPTIONS must point to a reviewed ExportOptions.plist.' >&2; exit 69; }
plutil -lint "$KNABA_IOS_EXPORT_OPTIONS"
python3 scripts/distribution.py export-options "$KNABA_IOS_EXPORT_OPTIONS" "$KNABA_APPLE_TEAM_ID"
xcodegen version | grep -Eq '(^| )2\.43\.0($| )' || { echo 'BLOCKED_EXTERNAL: XcodeGen 2.43.0 required.' >&2; exit 69; }
xcodebuild -version | python3 -c 'import re,sys; value=re.match(r"Xcode ([0-9]+)",sys.stdin.read()); sys.exit(0 if value and int(value[1]) >= 26 else 1)' || { echo 'BLOCKED_EXTERNAL: use Xcode 26 or newer for this distribution candidate.' >&2; exit 69; }
KNABA_IOS_OUTPUT="${KNABA_IOS_OUTPUT:-$PWD/build/distribution}"
[[ ! -e "$KNABA_IOS_OUTPUT" ]] || { echo 'REFUSED: distribution output already exists; preserve it and select a fresh KNABA_IOS_OUTPUT.' >&2; exit 65; }
mkdir -p "$KNABA_IOS_OUTPUT"
python3 scripts/distribution.py snapshot "$KNABA_IOS_OUTPUT/source.json" --require-clean
# Snapshot the validated options so the archive and export consume identical reviewed bytes.
cp "$KNABA_IOS_EXPORT_OPTIONS" "$KNABA_IOS_OUTPUT/ExportOptions.plist"
KNABA_IOS_PROFILE="$(python3 scripts/distribution.py export-options "$KNABA_IOS_OUTPUT/ExportOptions.plist" "$KNABA_APPLE_TEAM_ID" --field profile)"
KNABA_IOS_CERTIFICATE="$(python3 scripts/distribution.py export-options "$KNABA_IOS_OUTPUT/ExportOptions.plist" "$KNABA_APPLE_TEAM_ID" --field certificate)"
xcodegen generate --spec project.yml
xcodebuild -project KNABADE.xcodeproj -scheme KNABADE -configuration Release -destination 'generic/platform=iOS' -archivePath "$KNABA_IOS_OUTPUT/KNABADE.xcarchive" DEVELOPMENT_TEAM="$KNABA_APPLE_TEAM_ID" CODE_SIGN_STYLE=Manual PROVISIONING_PROFILE_SPECIFIER="$KNABA_IOS_PROFILE" CODE_SIGN_IDENTITY="$KNABA_IOS_CERTIFICATE" archive | tee "$KNABA_IOS_OUTPUT/archive.log"
# No -allowProvisioningUpdates, App Store upload, account registration or certificate creation.
xcodebuild -exportArchive -archivePath "$KNABA_IOS_OUTPUT/KNABADE.xcarchive" -exportPath "$KNABA_IOS_OUTPUT/export" -exportOptionsPlist "$KNABA_IOS_OUTPUT/ExportOptions.plist" | tee "$KNABA_IOS_OUTPUT/export.log"
KNABA_IOS_APP="$KNABA_IOS_OUTPUT/KNABADE.xcarchive/Products/Applications/KNABADE.app"
codesign --verify --deep --strict "$KNABA_IOS_APP"
python3 scripts/distribution.py compare "$KNABA_IOS_OUTPUT/source.json"
shopt -s nullglob
KNABA_IOS_IPAS=("$KNABA_IOS_OUTPUT"/export/*.ipa)
[[ ${#KNABA_IOS_IPAS[@]} -eq 1 ]] || { echo 'Expected exactly one exported signed IPA.' >&2; exit 65; }
# Verify the final exported bytes, not only the pre-export xcarchive signature.
python3 scripts/distribution.py verify-ipa "${KNABA_IOS_IPAS[0]}" "$KNABA_IOS_OUTPUT/source.json" "$KNABA_IOS_OUTPUT/ExportOptions.plist" "$KNABA_APPLE_TEAM_ID" "$KNABA_IOS_OUTPUT/receipt.json"
shasum -a 256 "${KNABA_IOS_IPAS[0]}" > "$KNABA_IOS_OUTPUT/SHA256SUMS"
echo "Local IPA export: $KNABA_IOS_OUTPUT/export; physical installation and TestFlight remain separate."
