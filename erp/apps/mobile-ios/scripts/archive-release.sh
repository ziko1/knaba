#!/usr/bin/env bash
# Requires the customer's Apple team and export configuration; never fabricates a distributable IPA.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'BLOCKED_EXTERNAL: macOS + Xcode and owner signing assets are required.' >&2; exit 69; }
for KNABA_IOS_TOOL in xcodebuild xcodegen codesign security; do
  command -v "$KNABA_IOS_TOOL" >/dev/null || { echo "BLOCKED_EXTERNAL: missing $KNABA_IOS_TOOL" >&2; exit 69; }
done
[[ "${KNABA_APPLE_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]] || { echo 'BLOCKED_EXTERNAL: KNABA_APPLE_TEAM_ID must identify the owner Apple team.' >&2; exit 69; }
[[ -f "${KNABA_IOS_EXPORT_OPTIONS:-}" ]] || { echo 'BLOCKED_EXTERNAL: KNABA_IOS_EXPORT_OPTIONS must point to a reviewed ExportOptions.plist.' >&2; exit 69; }
plutil -lint "$KNABA_IOS_EXPORT_OPTIONS"
python3 - <<'PY'
import os,plistlib
with open(os.environ['KNABA_IOS_EXPORT_OPTIONS'],'rb') as f: options=plistlib.load(f)
assert options.get('teamID')==os.environ['KNABA_APPLE_TEAM_ID'],'Export team must match owner team'
assert options.get('method'),'Set the distribution method in reviewed Xcode ExportOptions'
PY
KNABA_IOS_OUTPUT="$PWD/build/distribution"
mkdir -p "$KNABA_IOS_OUTPUT"
xcodegen generate --spec project.yml
xcodebuild -project KNABADE.xcodeproj -scheme KNABADE -configuration Release -destination 'generic/platform=iOS' -archivePath "$KNABA_IOS_OUTPUT/KNABADE.xcarchive" DEVELOPMENT_TEAM="$KNABA_APPLE_TEAM_ID" archive | tee "$KNABA_IOS_OUTPUT/archive.log"
xcodebuild -exportArchive -archivePath "$KNABA_IOS_OUTPUT/KNABADE.xcarchive" -exportPath "$KNABA_IOS_OUTPUT/export" -exportOptionsPlist "$KNABA_IOS_EXPORT_OPTIONS" | tee "$KNABA_IOS_OUTPUT/export.log"
KNABA_IOS_APP="$KNABA_IOS_OUTPUT/KNABADE.xcarchive/Products/Applications/KNABADE.app"
codesign --verify --deep --strict "$KNABA_IOS_APP"
codesign -dvv "$KNABA_IOS_APP" 2> "$KNABA_IOS_OUTPUT/signature.txt"
export KNABA_IOS_OUTPUT
python3 - <<'PY'
import datetime,hashlib,json,os,pathlib,plistlib,re,subprocess,zipfile
out=pathlib.Path(os.environ['KNABA_IOS_OUTPUT']);ipas=list((out/'export').glob('*.ipa'));assert len(ipas)==1,'Expected one signed IPA'
ipa=ipas[0]
with zipfile.ZipFile(ipa) as z:
 plists=[n for n in z.namelist() if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist',n)];assert len(plists)==1
 meta=plistlib.loads(z.read(plists[0]));prefix=plists[0][:-len('Info.plist')]
 assert prefix+'embedded.mobileprovision' in z.namelist(),'Exported IPA missing provisioning profile'
assert meta['CFBundleIdentifier']=='de.knaba.mobile' and meta['CFBundleShortVersionString']=='0.3.0' and str(meta['CFBundleVersion'])=='3'
r=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True)
sha=hashlib.sha256(ipa.read_bytes()).hexdigest()
receipt={'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceGitSha':r.stdout.strip() if r.returncode==0 else os.getenv('NATIVE_SOURCE_SHA'),'artifact':ipa.name,'sha256':sha,'bytes':ipa.stat().st_size,'bundleId':meta['CFBundleIdentifier'],'version':meta['CFBundleShortVersionString'],'build':str(meta['CFBundleVersion']),'teamId':os.environ['KNABA_APPLE_TEAM_ID'],'signing':'OWNER_SUPPLIED_APPLE_TEAM','physicalDeviceInstall':'NOT_RUN','upgradeAndDataRetention':'NOT_RUN','storePublication':'NOT_RUN'}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');(out/'SHA256SUMS').write_text(sha+'  export/'+ipa.name+'\n');print(json.dumps(receipt,indent=2))
PY
