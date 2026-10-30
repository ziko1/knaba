#!/usr/bin/env bash
# Produce a verified APK. A debug key remains evaluation-only; release uses the owner's stable key.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
KNABA_ANDROID_MODE="${1:-prototype}"
case "$KNABA_ANDROID_MODE" in prototype|release) ;; *) echo 'Usage: bash scripts/package.sh prototype|release' >&2; exit 64;; esac
KNABA_ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[[ -n "$KNABA_ANDROID_SDK" && -d "$KNABA_ANDROID_SDK/platforms/android-36" ]] || { echo 'BLOCKED: Android SDK 36 is required.' >&2; exit 69; }
KNABA_ANDROID_BUILD_TOOLS="${KNABA_ANDROID_BUILD_TOOLS:-$KNABA_ANDROID_SDK/build-tools/35.0.0}"
for KNABA_ANDROID_TOOL in aapt apksigner zipalign; do
  [[ -x "$KNABA_ANDROID_BUILD_TOOLS/$KNABA_ANDROID_TOOL" ]] || { echo "BLOCKED: missing $KNABA_ANDROID_TOOL in build-tools." >&2; exit 69; }
done
if [[ "$KNABA_ANDROID_MODE" == release ]]; then
  for KNABA_ANDROID_VAR in KNABA_ANDROID_KEYSTORE KNABA_ANDROID_KEY_ALIAS KNABA_ANDROID_STORE_PASSWORD KNABA_ANDROID_KEY_PASSWORD; do
    [[ -n "${!KNABA_ANDROID_VAR:-}" ]] || { echo "BLOCKED: owner signing variable $KNABA_ANDROID_VAR is required." >&2; exit 69; }
  done
  [[ -f "$KNABA_ANDROID_KEYSTORE" ]] || { echo 'BLOCKED: owner keystore file is missing.' >&2; exit 69; }
fi
KNABA_ANDROID_OUTPUT="$PWD/build/distribution/$KNABA_ANDROID_MODE"
mkdir -p "$KNABA_ANDROID_OUTPUT"
export KNABA_ANDROID_OUTPUT KNABA_ANDROID_MODE
python3 - <<'PY'
import hashlib,json,os,pathlib,subprocess
root=pathlib.Path('.').resolve()
files=[p for p in root.rglob('*') if p.is_file() and not any(x in {'build','.gradle','.git','local.properties'} for x in p.relative_to(root).parts)]
rows=[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)]
r=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True)
sha=r.stdout.strip() if r.returncode==0 else os.getenv('NATIVE_SOURCE_SHA')
r=subprocess.run(['git','status','--porcelain','--','.'],capture_output=True,text=True)
manifest={'sourceGitSha':sha,'sourceWorkingTree':bool(r.stdout.strip()) if r.returncode==0 else 'unavailable','sourceFiles':rows}
pathlib.Path(os.environ['KNABA_ANDROID_OUTPUT'],'source.json').write_text(json.dumps(manifest,indent=2)+'\n')
PY
bash scripts/test-vectors.sh | tee "$KNABA_ANDROID_OUTPUT/java-vectors.log"
bash scripts/test-localization.sh | tee "$KNABA_ANDROID_OUTPUT/localization.log"
if [[ "$KNABA_ANDROID_MODE" == prototype ]]; then
  bash ./gradlew --no-daemon :app:assembleDebug :app:lintDebug | tee "$KNABA_ANDROID_OUTPUT/build.log"
  KNABA_ANDROID_APK="$KNABA_ANDROID_OUTPUT/knaba-android-0.3.0-prototype.apk"
  cp app/build/outputs/apk/debug/app-debug.apk "$KNABA_ANDROID_APK"
else
  bash ./gradlew --no-daemon :app:assembleRelease :app:lintRelease | tee "$KNABA_ANDROID_OUTPUT/build.log"
  "$KNABA_ANDROID_BUILD_TOOLS/zipalign" -p -f 4 app/build/outputs/apk/release/app-release-unsigned.apk "$KNABA_ANDROID_OUTPUT/aligned.apk"
  KNABA_ANDROID_APK="$KNABA_ANDROID_OUTPUT/knaba-android-0.3.0.apk"
  "$KNABA_ANDROID_BUILD_TOOLS/apksigner" sign --ks "$KNABA_ANDROID_KEYSTORE" --ks-key-alias "$KNABA_ANDROID_KEY_ALIAS" --ks-pass env:KNABA_ANDROID_STORE_PASSWORD --key-pass env:KNABA_ANDROID_KEY_PASSWORD --out "$KNABA_ANDROID_APK" "$KNABA_ANDROID_OUTPUT/aligned.apk"
  rm "$KNABA_ANDROID_OUTPUT/aligned.apk"
fi
export KNABA_ANDROID_APK
"$KNABA_ANDROID_BUILD_TOOLS/apksigner" verify --verbose --print-certs "$KNABA_ANDROID_APK" > "$KNABA_ANDROID_OUTPUT/signature.txt"
"$KNABA_ANDROID_BUILD_TOOLS/aapt" dump badging "$KNABA_ANDROID_APK" > "$KNABA_ANDROID_OUTPUT/package.txt"
python3 - <<'PY'
import datetime,hashlib,json,os,pathlib,re
out=pathlib.Path(os.environ['KNABA_ANDROID_OUTPUT']);apk=pathlib.Path(os.environ['KNABA_ANDROID_APK'])
metadata=(out/'package.txt').read_text();signature=(out/'signature.txt').read_text()
match=re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",metadata)
assert match and match.groups()==('de.knaba.mobile','3','0.3.0'),'Unexpected APK identity or version'
assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in signature,'Missing verified v2 signature'
cert=re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)',signature);assert cert,'Missing signing fingerprint'
sha=hashlib.sha256(apk.read_bytes()).hexdigest();source=json.loads((out/'source.json').read_text())
receipt={**source,'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'artifact':apk.name,'sha256':sha,'bytes':apk.stat().st_size,'package':match[1],'versionCode':int(match[2]),'versionName':match[3],'certificateSha256':cert[1],'signing':'DEBUG_EVALUATION_ONLY' if os.environ['KNABA_ANDROID_MODE']=='prototype' else 'OWNER_SUPPLIED_KEY','v2Signature':'PASS','physicalDeviceInstall':'NOT_RUN','upgradeAndDataRetention':'NOT_RUN','customerAcceptance':'NOT_RUN'}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');(out/'SHA256SUMS').write_text(sha+'  '+apk.name+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='sourceFiles'},indent=2))
PY
