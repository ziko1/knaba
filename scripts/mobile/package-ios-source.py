#!/usr/bin/env python3
"""Package exact Xcode sources. No archive produced here installs on iPhone."""
import argparse
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('knaba_ios_distribution', ROOT / 'erp/apps/mobile-ios/scripts/distribution.py')
distribution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(distribution)


def package(output, root=ROOT):
    if 'source' not in output.name.lower() or not (output.name.endswith('.tar.gz') or output.suffix == '.zip'):
        raise ValueError('Use an explicitly source-labelled .zip or .tar.gz filename; this is not an IPA')
    if output.exists():
        raise ValueError('Source archive already exists; choose a new path')
    for protected in (root / 'erp/apps/mobile-ios/Sources', root / 'erp/apps/mobile-ios/Resources', root / 'erp/apps/mobile-ios/Tests', root / 'erp/apps/mobile-ios/scripts'):
        if output.resolve().is_relative_to(protected.resolve()):
            raise ValueError('Source archive must be written outside native build inputs')
    source = distribution.snapshot(root)
    paths = distribution.source_paths(root)
    for relative in ('erp/apps/mobile-ios/README.md', 'docs/mobile/DISTRIBUTION_2026-10-28_UK.md', 'docs/mobile/TEST_IOS_0.4.0_UK.md'):
        path = root / relative
        if path.is_file() and not path.is_symlink():
            paths.append(path)
    entries = {path.relative_to(root).as_posix(): (path.read_bytes(), 0o755 if path.stat().st_mode & 0o100 else 0o644) for path in sorted(set(paths))}
    for record in source['buildInputs']:
        data, mode = entries[record['path']]
        if record['sha256'] != hashlib.sha256(data).hexdigest() or record['bytes'] != len(data) or record['mode'] != format(mode, '04o'):
            raise ValueError('Native inputs changed while creating source archive')
    if distribution.snapshot(root) != source:
        raise ValueError('Native source/commit changed while creating source archive')
    manifest = {'type': 'XCODE_SOURCE_ONLY_NOT_IPA', **source, 'macOSBuild': 'NOT_RUN_BY_PACKAGER', 'appleSigning': 'NOT_RUN_BY_PACKAGER',
                'files': [{'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'mode': format(mode, '04o')} for name, (data, mode) in sorted(entries.items())]}
    entries['IOS_SOURCE_MANIFEST.json'] = ((json.dumps(manifest, indent=2) + '\n').encode(), 0o644)
    entries['IOS_SOURCE_README_UK.txt'] = ((
        'KNABA DE — вихідний код iOS, НЕ файл для встановлення на iPhone.\n\n'
        'Вміст прив’язано до commit і SHA-256 кожного файла у IOS_SOURCE_MANIFEST.json.\n'
        'На Mac із Xcode 26+ та XcodeGen 2.43.0:\n'
        '  cd erp/apps/mobile-ios\n'
        '  bash scripts/build.sh\n'
        'Це збере лише iOS Simulator .app. Для XCTest задайте реальний KNABA_IOS_TEST_DESTINATION.\n'
        'Для owner-signed IPA потрібні встановлені сертифікат/профіль, Apple Team та reviewed ExportOptions.plist:\n'
        'destination=export, signingStyle=manual, manageAppVersionAndBuildNumber=false; method=debugging, release-testing або app-store-connect.\n'
        "  KNABA_APPLE_TEAM_ID='REPLACE_WITH_OWNER_TEAM_ID' KNABA_IOS_EXPORT_OPTIONS=/absolute/ExportOptions.plist bash scripts/archive-release.sh\n"
        'Скрипт експорту не завантажує до TestFlight/App Store і не створює provisioning assets.\n'
        'Збірка, підпис, реальна установка, backend і перевірка на iPhone — окремі етапи.\n'
    ).encode(), 0o644)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix == '.zip':
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, (data, mode) in sorted(entries.items()):
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (0o100000 | mode) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, data)
    else:
        with output.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as archive:
                for name, (data, mode) in sorted(entries.items()):
                    info = tarfile.TarInfo(name)
                    info.size, info.mode, info.mtime = len(data), mode, 0
                    archive.addfile(info, io.BytesIO(data))
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_name(output.name + '.sha256').write_text(checksum + '  ' + output.name + '\n', encoding='utf-8')
    return {'artifact': str(output), 'sha256': checksum, 'bytes': output.stat().st_size, 'type': manifest['type'],
            'sourceGitSha': source['sourceGitSha'], 'sourceWorkingTree': source['sourceWorkingTree'], 'inputSha256': source['inputSha256']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='Explicitly source-labelled .zip or .tar.gz destination')
    args = parser.parse_args()
    print(json.dumps(package(args.output), indent=2))
