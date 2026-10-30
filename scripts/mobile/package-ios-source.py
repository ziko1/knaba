#!/usr/bin/env python3
"""Create a portable Xcode source archive. This never creates or labels a signed IPA."""
import argparse
import hashlib
import io
import json
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
paths.extend(mobile / name for name in ['project.yml', 'Info.plist', 'PrivacyInfo.xcprivacy', 'README.md'])
paths += [root / 'erp/tests/native-vectors.json', root / 'erp/scripts/native-ios-simulator.py', root / 'docs/mobile/DISTRIBUTION_2026-10-28_UK.md']
assert all(p.is_file() for p in paths)
sha = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
dirty = bool(subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--', 'erp/apps/mobile-ios', 'scripts/mobile', 'docs/mobile'], text=True).strip())
manifest = {'type': 'XCODE_SOURCE_ONLY_NOT_IPA', 'version': '0.3.0', 'build': 3, 'sourceGitSha': sha, 'sourceWorkingTree': dirty, 'macOSBuild': 'NOT_RUN', 'appleSigning': 'NOT_RUN', 'files': [{'path': str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(paths)]}
args.output.parent.mkdir(parents=True, exist_ok=True)
with tarfile.open(args.output, 'w:gz') as tar:
    for path in sorted(paths):
        tar.add(path, arcname=str(path.relative_to(root)), recursive=False)
    content = (json.dumps(manifest, indent=2) + '\n').encode()
    info = tarfile.TarInfo('IOS_SOURCE_MANIFEST.json'); info.size = len(content); info.mode = 0o644
    tar.addfile(info, io.BytesIO(content))
checksum = hashlib.sha256(args.output.read_bytes()).hexdigest()
args.output.with_name(args.output.name + '.sha256').write_text(checksum + '  ' + args.output.name + '\n')
print(json.dumps({'artifact': str(args.output), 'sha256': checksum, 'bytes': args.output.stat().st_size, 'type': manifest['type']}, indent=2))
