#!/usr/bin/env bash
# Read-only preflight by default. Never uninstalls or clears customer data.
set -Eeuo pipefail
usage() { echo "Usage: $0 <candidate.apk> [--install]"; exit 2; }
[[ $# -ge 1 && $# -le 2 ]] || usage
apk=$1
[[ -f "$apk" ]] || { echo "FAIL: APK missing" >&2; exit 2; }
mode=${2:-}
[[ -z "$mode" || "$mode" == "--install" ]] || usage
for cmd in adb apksigner aapt sha256sum; do
  command -v "$cmd" >/dev/null || { echo "BLOCKED: missing $cmd" >&2; exit 3; }
done
[[ "$(adb devices -l | awk '$2=="device"{n++} END{print n+0}')" == "1" ]] || {
  echo "BLOCKED: connect and authorize exactly one Android device" >&2; exit 3;
}
echo "Candidate SHA256:"
sha256sum "$apk"
apksigner verify --verbose --print-certs "$apk" || { echo "FAIL: invalid APK signature" >&2; exit 4; }
info=$(aapt dump badging "$apk")
package=$(printf '%s\n' "$info" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -1)
min_sdk=$(printf '%s\n' "$info" | sed -n "s/^sdkVersion:'\([^']*\)'.*/\1/p" | head -1)
[[ -n "$package" && "$min_sdk" =~ ^[0-9]+$ ]] || { echo "FAIL: bad APK metadata" >&2; exit 4; }
device_sdk=$(adb shell getprop ro.build.version.sdk | tr -d '\r')
echo "Package: $package; min SDK: $min_sdk; device SDK: $device_sdk"
[[ "$device_sdk" =~ ^[0-9]+$ ]] || exit 4
(( device_sdk >= min_sdk )) || { echo "BLOCKED: Android OS too old" >&2; exit 5; }
if adb shell pm path "$package" | grep -q '^package:'; then
  echo "EXISTING INSTALL FOUND: $package"
  echo "Do not uninstall: existing data may be lost; signing mismatch requires a planned migration."
else
  echo "No existing install of this package"
fi
if [[ "$mode" == "--install" ]]; then
  echo "Attempting non-destructive install/update; no -r data deletion or uninstall."
  adb install -r "$apk" || {
    echo "FAIL: inspect INSTALL_FAILED_* above; do not uninstall to bypass signature mismatch." >&2
    exit 6
  }
  echo "PASS: adb install completed; login, backend, GPS and device behavior still require testing."
else
  echo "PREFLIGHT ONLY. To attempt install explicitly, rerun with --install."
fi
