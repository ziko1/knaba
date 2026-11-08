#!/usr/bin/env python3
"""Create a portable Xcode source archive. This never creates or labels a signed IPA."""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path
import subprocess
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path, help='Destination .tar.gz, explicitly labelled source')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
paths = []
mobile = root / 'erp/apps/mobile-ios'
for name in ['Sources', 'Resources', 'Tests', 'scripts']:
    paths.extend(p for p in (mobile / name).rglob('*') if p.is_file() and not p.is_symlink())
paths.extend(mobile / name for name in ['project.yml', 'Info.plist', 'PrivacyInfo.xcprivacy', 'README.md', 'README_RECOVERY_UK.md'])
paths += [root / 'erp/tests/native-vectors.json', root / 'erp/scripts/native-ios-simulator.py', root / 'docs/mobile/DISTRIBUTION_2026-10-28_UK.md', root / 'docs/mobile/TEST_CANDIDATE_0.5.0_UK.md', root / 'docs/mobile/IOS_CONTEXT_ACTIONS_0.5.1_UK.md', root / 'docs/mobile/BRAND_ASSETS.json']
paths += [root / 'docs/mobile/RELEASE_VERSIONS.json', root / 'docs/mobile/TEST_CANDIDATE_0.5.2_UK.md']
assert all(p.is_file() for p in paths)
snapshots = {p: p.read_bytes() for p in sorted(paths)}
sha = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
dirty = bool(subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--', 'erp/apps/mobile-ios', 'scripts/mobile', 'docs/mobile', 'erp/tests/native-vectors.json', 'erp/scripts/native-ios-simulator.py'], text=True).strip())
project = (mobile / 'project.yml').read_text()
version = re.search(r'MARKETING_VERSION:\s*"([0-9]+\.[0-9]+\.[0-9]+)"', project)
build = re.search(r'CURRENT_PROJECT_VERSION:\s*"([0-9]+)"', project)
assert version and build, 'Missing canonical iOS version'
manifest = {'type': 'XCODE_SOURCE_ONLY_NOT_IPA', 'version': version[1], 'build': int(build[1]), 'sourceGitSha': sha, 'sourceWorkingTree': dirty, 'macOSBuild': 'NOT_RUN_BY_THIS_SOURCE_PACKAGER', 'appleSigning': 'NOT_RUN', 'files': [{'path': str(p.relative_to(root)), 'sha256': hashlib.sha256(content).hexdigest()} for p, content in snapshots.items()]}
args.output.parent.mkdir(parents=True, exist_ok=True)
temporary = args.output.with_name(args.output.name + '.partial')
with tarfile.open(temporary, 'w:gz') as tar:
    for path, content in snapshots.items():
        info = tarfile.TarInfo(str(path.relative_to(root)))
        info.size = len(content); info.mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
        tar.addfile(info, io.BytesIO(content))
    content = (json.dumps(manifest, indent=2) + '\n').encode()
    info = tarfile.TarInfo('IOS_SOURCE_MANIFEST.json'); info.size = len(content); info.mode = 0o644
    tar.addfile(info, io.BytesIO(content))
assert all(path.read_bytes() == content for path, content in snapshots.items()), 'Source changed during packaging; archive withheld'
assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == sha, 'Source HEAD changed during packaging'
temporary.replace(args.output)
checksum = hashlib.sha256(args.output.read_bytes()).hexdigest()
args.output.with_name(args.output.name + '.sha256').write_text(checksum + '  ' + args.output.name + '\n')
print(json.dumps({'artifact': str(args.output), 'sha256': checksum, 'bytes': args.output.stat().st_size, 'type': manifest['type']}, indent=2))
