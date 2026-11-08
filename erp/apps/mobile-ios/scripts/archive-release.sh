#!/usr/bin/env bash
# Requires the customer's Apple team and export configuration; never fabricates a distributable IPA.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
KNABA_IOS_OUTPUT="$PWD/build/distribution"
mkdir -p "$KNABA_IOS_OUTPUT"
rm -f "$KNABA_IOS_OUTPUT/receipt.json" "$KNABA_IOS_OUTPUT/SHA256SUMS"
export KNABA_IOS_OUTPUT
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
python3 - <<'PY'
import hashlib,json,os,pathlib,re,subprocess
root=pathlib.Path('.').resolve()
paths=[p for name in ['Sources','Resources','scripts'] for p in (root/name).rglob('*') if p.is_file()]
paths += [root/name for name in ['project.yml','Info.plist','PrivacyInfo.xcprivacy']]
files=[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(paths)]
repository=root.parents[2]
git_root=subprocess.run(['git','rev-parse','--show-toplevel'],capture_output=True,text=True)
if git_root.returncode==0 and pathlib.Path(git_root.stdout.strip()).resolve()==repository:
 provenance={'sourceOrigin':'GIT_CHECKOUT','sourceGitSha':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceWorkingTree':bool(subprocess.check_output(['git','status','--porcelain','--','.'],text=True).strip())}
else:
 manifest_file=repository/'IOS_SOURCE_MANIFEST.json';manifest_bytes=manifest_file.read_bytes();manifest=json.loads(manifest_bytes)
 assert manifest.get('type')=='XCODE_SOURCE_ONLY_NOT_IPA' and re.fullmatch(r'[0-9a-f]{40}',manifest.get('sourceGitSha','')),'A verified portable source manifest is required outside Git'
 declared={}
 for item in manifest['files']:
  relative=pathlib.PurePosixPath(item['path'])
  assert not relative.is_absolute() and '..' not in relative.parts and str(relative) not in declared,'Unsafe or duplicate source manifest path'
  path=repository/str(relative);assert path.is_file() and not path.is_symlink(),'Missing portable source file'
  assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256'],'Portable source hash mismatch'
  declared[str(relative)]=item['sha256']
 for item in files:
  relative=str((root/item['path']).relative_to(repository))
  assert declared.get(relative)==item['sha256'],'Native input is not covered by the portable source manifest'
 provenance={'sourceOrigin':'PORTABLE_MANIFEST_VERIFIED_INPUTS','sourceGitSha':manifest['sourceGitSha'],'sourceGitBinding':'DECLARED_IN_SOURCE_ARCHIVE_MANIFEST','sourceWorkingTree':manifest['sourceWorkingTree'],'portableManifestSha256':hashlib.sha256(manifest_bytes).hexdigest()}
source={**provenance,'sourceFiles':files}
pathlib.Path(os.environ['KNABA_IOS_OUTPUT'],'source.json').write_text(json.dumps(source,indent=2)+'\n')
PY
xcodegen generate --spec project.yml
xcodebuild -project KNABADE.xcodeproj -scheme KNABADE -configuration Release -destination 'generic/platform=iOS' -archivePath "$KNABA_IOS_OUTPUT/KNABADE.xcarchive" DEVELOPMENT_TEAM="$KNABA_APPLE_TEAM_ID" archive | tee "$KNABA_IOS_OUTPUT/archive.log"
xcodebuild -exportArchive -archivePath "$KNABA_IOS_OUTPUT/KNABADE.xcarchive" -exportPath "$KNABA_IOS_OUTPUT/export" -exportOptionsPlist "$KNABA_IOS_EXPORT_OPTIONS" | tee "$KNABA_IOS_OUTPUT/export.log"
KNABA_IOS_APP="$KNABA_IOS_OUTPUT/KNABADE.xcarchive/Products/Applications/KNABADE.app"
codesign --verify --deep --strict "$KNABA_IOS_APP"
codesign -dvv "$KNABA_IOS_APP" 2> "$KNABA_IOS_OUTPUT/signature.txt"
export KNABA_IOS_OUTPUT
python3 - <<'PY'
import datetime,hashlib,json,os,pathlib,plistlib,re,subprocess,tempfile,zipfile
out=pathlib.Path(os.environ['KNABA_IOS_OUTPUT']);ipas=list((out/'export').glob('*.ipa'));assert len(ipas)==1,'Expected one signed IPA'
ipa=ipas[0]
with zipfile.ZipFile(ipa) as z:
 assert all(not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts for n in z.namelist()),'Unsafe exported archive path'
 plists=[n for n in z.namelist() if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist',n)];assert len(plists)==1
 meta=plistlib.loads(z.read(plists[0]));prefix=plists[0][:-len('Info.plist')]
 assert prefix+'embedded.mobileprovision' in z.namelist(),'Exported IPA missing provisioning profile'
project=pathlib.Path('project.yml').read_text()
version=re.search(r'MARKETING_VERSION:\s*"([0-9]+\.[0-9]+\.[0-9]+)"',project)
build=re.search(r'CURRENT_PROJECT_VERSION:\s*"([0-9]+)"',project)
assert version and build,'Missing canonical iOS version'
assert meta['CFBundleIdentifier']=='de.knaba.mobile' and meta['CFBundleShortVersionString']==version[1] and str(meta['CFBundleVersion'])==build[1]
with tempfile.TemporaryDirectory(prefix='verify-export-',dir=out) as temporary:
 subprocess.run(['ditto','-x','-k',str(ipa),temporary],check=True)
 exported=pathlib.Path(temporary)/prefix
 subprocess.run(['codesign','--verify','--deep','--strict',str(exported)],check=True)
 signature=subprocess.run(['codesign','-dvv',str(exported)],capture_output=True,text=True,check=True).stderr
 team=re.search(r'^TeamIdentifier=([A-Z0-9]{10})$',signature,re.MULTILINE)
 assert team and team[1]==os.environ['KNABA_APPLE_TEAM_ID'],'Exported signing team differs from owner'
 profile=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(exported/'embedded.mobileprovision')]))
 assert os.environ['KNABA_APPLE_TEAM_ID'] in profile.get('TeamIdentifier',[]),'Provisioning team differs from owner'
 entitlements=plistlib.loads(subprocess.run(['codesign','-d','--entitlements',':-',str(exported)],capture_output=True,check=True).stdout)
 assert entitlements.get('com.apple.developer.team-identifier')==os.environ['KNABA_APPLE_TEAM_ID'],'Exported entitlement team differs from owner'
 exported_id=entitlements.get('application-identifier')
 assert any(exported_id==prefix+'.de.knaba.mobile' for prefix in profile.get('ApplicationIdentifierPrefix',[])),'Exported App ID prefix or bundle differs from profile'
 application_id=profile.get('Entitlements',{}).get('application-identifier')
 assert isinstance(application_id,str) and (application_id==exported_id or application_id.endswith('.*') and exported_id.startswith(application_id[:-1])),'Profile does not cover the exported application identifier'
 expiry=profile['ExpirationDate'].replace(tzinfo=datetime.timezone.utc)
 assert expiry>datetime.datetime.now(datetime.timezone.utc),'Exported profile has expired'
 (out/'exported-signature.txt').write_text(signature)
source=json.loads((out/'source.json').read_text())
root=pathlib.Path('.').resolve()
if source['sourceOrigin']=='GIT_CHECKOUT':
 assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==source['sourceGitSha'],'Source HEAD changed during archive'
else:
 manifest_bytes=(root.parents[2]/'IOS_SOURCE_MANIFEST.json').read_bytes()
 assert hashlib.sha256(manifest_bytes).hexdigest()==source['portableManifestSha256'],'Portable source manifest changed during archive'
 for item in json.loads(manifest_bytes)['files']:assert hashlib.sha256((root.parents[2]/item['path']).read_bytes()).hexdigest()==item['sha256'],'Portable source input changed during archive'
paths=[p for name in ['Sources','Resources','scripts'] for p in (root/name).rglob('*') if p.is_file()]
paths += [root/name for name in ['project.yml','Info.plist','PrivacyInfo.xcprivacy']]
current=[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(paths)]
assert current==source['sourceFiles'],'Source changed during archive'
sha=hashlib.sha256(ipa.read_bytes()).hexdigest()
receipt={**source,'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'artifact':ipa.name,'sha256':sha,'bytes':ipa.stat().st_size,'bundleId':meta['CFBundleIdentifier'],'version':meta['CFBundleShortVersionString'],'build':str(meta['CFBundleVersion']),'teamId':os.environ['KNABA_APPLE_TEAM_ID'],'signing':'OWNER_SUPPLIED_APPLE_TEAM','exportedSignature':'PASS','physicalDeviceInstall':'NOT_RUN','upgradeAndDataRetention':'NOT_RUN','storePublication':'NOT_RUN'}
for name,contents in [('SHA256SUMS',sha+'  export/'+ipa.name+'\n'),('receipt.json',json.dumps(receipt,indent=2)+'\n')]:
 temporary=out/(name+'.tmp');temporary.write_text(contents);temporary.replace(out/name)
print(json.dumps(receipt,indent=2))
PY
