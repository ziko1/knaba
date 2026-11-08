#!/usr/bin/env bash
# Produce verified APK and App Bundle artifacts; debug signing remains evaluation-only.
set -euo pipefail
umask 077
if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/javac" ]]; then export PATH="$JAVA_HOME/bin:$PATH"; fi
cd "$(dirname "$0")/.."
KNABA_ANDROID_MODE="${1:-prototype}"
case "$KNABA_ANDROID_MODE" in prototype|release) ;; *) echo 'Usage: bash scripts/package.sh prototype|release' >&2; exit 64;; esac
KNABA_ANDROID_OUTPUT="$PWD/build/distribution/$KNABA_ANDROID_MODE"
mkdir -p "$KNABA_ANDROID_OUTPUT"
# A failed attempt must not retain a prior successful receipt at the same path.
rm -f "$KNABA_ANDROID_OUTPUT/receipt.json" "$KNABA_ANDROID_OUTPUT/SHA256SUMS" "$KNABA_ANDROID_OUTPUT/bundle-verification.json" "$KNABA_ANDROID_OUTPUT/bundle-integrity-tests.json"
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
read -r KNABA_ANDROID_VERSION_CODE KNABA_ANDROID_VERSION < <(python3 - <<'PY'
import pathlib,re
source=pathlib.Path('app/build.gradle.kts').read_text()
code=re.search(r'\bversionCode\s*=\s*(\d+)',source)
version=re.search(r'\bversionName\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"',source)
assert code and version,'Missing canonical Android version'
print(code[1],version[1])
PY
)
export KNABA_ANDROID_OUTPUT KNABA_ANDROID_MODE KNABA_ANDROID_VERSION_CODE KNABA_ANDROID_VERSION
python3 - <<'PY'
import hashlib,json,os,pathlib,subprocess
root=pathlib.Path('.').resolve()
files=[p for p in root.rglob('*') if p.is_file() and not any(x in {'build','.gradle','.kotlin','.git','local.properties'} for x in p.relative_to(root).parts)]
rows=[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)]
r=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True)
sha=r.stdout.strip() if r.returncode==0 else os.getenv('NATIVE_SOURCE_SHA')
r=subprocess.run(['git','status','--porcelain','--','.'],capture_output=True,text=True)
manifest={'sourceGitSha':sha,'sourceWorkingTree':bool(r.stdout.strip()) if r.returncode==0 else 'unavailable','sourceFiles':rows}
vectors=(root/'../../tests/native-vectors.json').resolve()
manifest['verificationInputs']=[{'path':'erp/tests/native-vectors.json','sha256':hashlib.sha256(vectors.read_bytes()).hexdigest()}]
pathlib.Path(os.environ['KNABA_ANDROID_OUTPUT'],'source.json').write_text(json.dumps(manifest,indent=2)+'\n')
PY
bash scripts/test-vectors.sh | tee "$KNABA_ANDROID_OUTPUT/java-vectors.log"
bash scripts/test-localization.sh | tee "$KNABA_ANDROID_OUTPUT/localization.log"
bash scripts/test-transport.sh | tee "$KNABA_ANDROID_OUTPUT/transport.log"
KNABA_JSON_JAR="$KNABA_JSON_TEST_JAR" bash scripts/test-demo-console.sh | tee "$KNABA_ANDROID_OUTPUT/demo.log"
if [[ "$KNABA_ANDROID_MODE" == prototype ]]; then
  bash ./gradlew --no-daemon --max-workers=2 :app:assembleDebug :app:bundleDebug :app:lintDebug :app:testDebugUnitTest | tee "$KNABA_ANDROID_OUTPUT/build.log"
  KNABA_ANDROID_APK="$KNABA_ANDROID_OUTPUT/knaba-android-$KNABA_ANDROID_VERSION-test.apk"
  KNABA_ANDROID_AAB="$KNABA_ANDROID_OUTPUT/knaba-android-$KNABA_ANDROID_VERSION-test.aab"
  cp app/build/outputs/apk/debug/app-debug.apk "$KNABA_ANDROID_APK"
  cp app/build/outputs/bundle/debug/app-debug.aab "$KNABA_ANDROID_AAB"
else
  command -v jarsigner >/dev/null || { echo 'BLOCKED: JDK jarsigner is required.' >&2; exit 69; }
  bash ./gradlew --no-daemon --max-workers=2 :app:assembleRelease :app:bundleRelease :app:lintRelease :app:testDebugUnitTest | tee "$KNABA_ANDROID_OUTPUT/build.log"
  "$KNABA_ANDROID_BUILD_TOOLS/zipalign" -p -f 4 app/build/outputs/apk/release/app-release-unsigned.apk "$KNABA_ANDROID_OUTPUT/aligned.apk"
  KNABA_ANDROID_APK="$KNABA_ANDROID_OUTPUT/knaba-android-$KNABA_ANDROID_VERSION.apk"
  KNABA_ANDROID_AAB="$KNABA_ANDROID_OUTPUT/knaba-android-$KNABA_ANDROID_VERSION.aab"
  "$KNABA_ANDROID_BUILD_TOOLS/apksigner" sign --ks "$KNABA_ANDROID_KEYSTORE" --ks-key-alias "$KNABA_ANDROID_KEY_ALIAS" --ks-pass env:KNABA_ANDROID_STORE_PASSWORD --key-pass env:KNABA_ANDROID_KEY_PASSWORD --out "$KNABA_ANDROID_APK" "$KNABA_ANDROID_OUTPUT/aligned.apk"
  jarsigner -keystore "$KNABA_ANDROID_KEYSTORE" -storepass:env KNABA_ANDROID_STORE_PASSWORD -keypass:env KNABA_ANDROID_KEY_PASSWORD -signedjar "$KNABA_ANDROID_AAB" app/build/outputs/bundle/release/app-release.aab "$KNABA_ANDROID_KEY_ALIAS" > "$KNABA_ANDROID_OUTPUT/bundle-signing.log" 2>&1
  rm "$KNABA_ANDROID_OUTPUT/aligned.apk"
fi
export KNABA_ANDROID_APK KNABA_ANDROID_AAB
"$KNABA_ANDROID_BUILD_TOOLS/apksigner" verify --verbose --print-certs "$KNABA_ANDROID_APK" > "$KNABA_ANDROID_OUTPUT/signature.txt"
"$KNABA_ANDROID_BUILD_TOOLS/zipalign" -c -v 4 "$KNABA_ANDROID_APK" > "$KNABA_ANDROID_OUTPUT/alignment.txt"
"$KNABA_ANDROID_BUILD_TOOLS/aapt" dump badging "$KNABA_ANDROID_APK" > "$KNABA_ANDROID_OUTPUT/package.txt"
"$KNABA_ANDROID_BUILD_TOOLS/aapt" dump xmltree "$KNABA_ANDROID_APK" AndroidManifest.xml > "$KNABA_ANDROID_OUTPUT/manifest.txt"
KNABA_ANDROID_CERT=$(python3 - <<'PY'
import os,pathlib,re
text=pathlib.Path(os.environ['KNABA_ANDROID_OUTPUT'],'signature.txt').read_text()
match=re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]{64})',text)
assert match,'Missing verified APK signer';print(match[1])
PY
)
java scripts/VerifyAppBundle.java "$KNABA_ANDROID_AAB" "$KNABA_ANDROID_CERT" > "$KNABA_ANDROID_OUTPUT/bundle-verification.json"
python3 scripts/test-app-bundle.py "$KNABA_ANDROID_AAB" "$KNABA_ANDROID_CERT" > "$KNABA_ANDROID_OUTPUT/bundle-integrity-tests.json"
python3 - <<'PY'
import datetime,hashlib,json,os,pathlib,re,subprocess,zipfile
out=pathlib.Path(os.environ['KNABA_ANDROID_OUTPUT']);apk=pathlib.Path(os.environ['KNABA_ANDROID_APK'])
metadata=(out/'package.txt').read_text();signature=(out/'signature.txt').read_text()
manifest=(out/'manifest.txt').read_text()
match=re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",metadata)
prototype=os.environ['KNABA_ANDROID_MODE']=='prototype'
expected=('de.knaba.mobile.test' if prototype else 'de.knaba.mobile',os.environ['KNABA_ANDROID_VERSION_CODE'],os.environ['KNABA_ANDROID_VERSION']+('-test' if prototype else ''))
assert match and match.groups()==expected,'Unexpected APK identity or version'
assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in signature,'Missing verified v2 signature'
cert=re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)',signature);assert cert,'Missing signing fingerprint'
expected_cert=os.getenv('KNABA_ANDROID_EXPECTED_CERT_SHA256','').lower()
if expected_cert:
    assert re.fullmatch('[0-9a-f]{64}',expected_cert),'Invalid expected signing fingerprint'
    assert cert[1].lower()==expected_cert,'Signing key changed: cannot update the existing app'
# Verify the actual compiled APK, not just the source manifest. Both aapt boolean
# encodings are accepted; unknown values fail closed. A debug APK need not be testOnly.
for attribute in ['testOnly','isFeatureSplit','isSplitRequired']:
    values=re.findall(r'^\s*A: android:'+attribute+r'(?:\([^)]*\))?=(.*)$',manifest,re.M)
    assert all(re.fullmatch(r'(?:false|\(type 0x12\)0x0+)',value.strip()) for value in values), 'APK cannot be sideloaded alone: '+attribute
assert not re.search(r'^\s*(?:A: (?:split|configForSplit)(?:\([^)]*\))?=|E: uses-split\b)',manifest,re.M), 'A standalone APK is required'
assert re.search(r"^sdkVersion:'31'$",metadata,re.M),'Unexpected minimum Android version'
assert re.search(r"^targetSdkVersion:'36'$",metadata,re.M),'Unexpected target Android version'
assert re.search(r"^launchable-activity: name='de\.knaba\.mobile\.ErpConsoleActivity'",metadata,re.M),'Missing launchable application'
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None,'Corrupted APK ZIP payload'
    names=archive.namelist()
    assert len(names)==len(set(names)),'Duplicate APK entries'
    assert {'AndroidManifest.xml','classes.dex','resources.arsc'}.issubset(names),'Incomplete APK payload'
    assert not any(name.startswith('lib/') for name in names),'Unexpected ABI-specific native payload: review device coverage'
sha=hashlib.sha256(apk.read_bytes()).hexdigest();source=json.loads((out/'source.json').read_text())
root=pathlib.Path('.').resolve()
current_files=[p for p in root.rglob('*') if p.is_file() and not any(x in {'build','.gradle','.kotlin','.git','local.properties'} for x in p.relative_to(root).parts)]
current_rows=[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(current_files)]
assert current_rows==source['sourceFiles'],'Source files changed during packaging; receipt withheld'
assert hashlib.sha256((root/'../../tests/native-vectors.json').read_bytes()).hexdigest()==source['verificationInputs'][0]['sha256'],'Verification inputs changed during packaging'
current_head=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
assert current_head==source['sourceGitSha'],'Git HEAD changed during packaging; receipt withheld'
receipt={**source,'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'artifact':apk.name,'sha256':sha,'bytes':apk.stat().st_size,'package':match[1],'versionCode':int(match[2]),'versionName':match[3],'minSdk':31,'targetSdk':36,'certificateSha256':cert[1],'expectedCertificateMatch':'PASS' if expected_cert else 'NOT_REQUESTED','signing':'DEBUG_EVALUATION_ONLY' if os.environ['KNABA_ANDROID_MODE']=='prototype' else 'OWNER_SUPPLIED_KEY','v2Signature':'PASS','zipIntegrity':'PASS','alignment':'PASS','standaloneApk':'PASS','testOnly':False,'launcher':'de.knaba.mobile.ErpConsoleActivity','nativeAbiRestrictions':[],'staticInstallerChecks':'PASS_NOT_DEVICE_INSTALL','physicalDeviceInstall':'NOT_RUN','upgradeAndDataRetention':'NOT_RUN','customerAcceptance':'NOT_RUN'}
bundle=pathlib.Path(os.environ['KNABA_ANDROID_AAB']);bundle_hash=hashlib.sha256(bundle.read_bytes()).hexdigest()
receipt['appBundle']={'artifact':bundle.name,'sha256':bundle_hash,'bytes':bundle.stat().st_size,**json.loads((out/'bundle-verification.json').read_text()),'playUpload':'NOT_RUN'}
for name,contents in [('SHA256SUMS',sha+'  '+apk.name+'\n'+bundle_hash+'  '+bundle.name+'\n'),('receipt.json',json.dumps(receipt,indent=2)+'\n')]:
    temporary=out/(name+'.tmp');temporary.write_text(contents);temporary.replace(out/name)
print(json.dumps({k:v for k,v in receipt.items() if k!='sourceFiles'},indent=2))
PY
