#!/usr/bin/env python3
"""Package a clean KNABA source and built runtimes; never deploy or copy secrets."""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def file_map(directory):
    result = {}
    for path in sorted(directory.rglob('*')):
        if path.is_symlink() or (not path.is_file() and not path.is_dir()):
            raise RuntimeError('Non-regular artifact input: ' + str(path))
        if path.is_file():
            result[path.relative_to(directory).as_posix()] = {'sha256': digest(path), 'bytes': path.stat().st_size}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-sha', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = args.output.resolve()
    if not re.fullmatch(r'[0-9a-f]{40}', args.expected_sha):
        raise RuntimeError('Exact committed source SHA required')
    if output == root or root in output.parents or output.exists():
        raise RuntimeError('A new output directory outside the repository is required')
    def git(*parts):
        return subprocess.check_output(['git', '-C', str(root), *parts], text=True).strip()
    def clean_source():
        if git('rev-parse', 'HEAD') != args.expected_sha or git('status', '--porcelain', '--untracked-files=all'):
            raise RuntimeError('Clean expected source required; no source bypass is supported')
    clean_source()
    output.mkdir(parents=True, mode=0o700)
    package = output / 'payload'
    package.mkdir(mode=0o700)
    site = root / 'corporate-site'
    # Static HTML receipts cannot attest a Worker/SSR bundle. Always rebuild
    # both complete runtimes here, from the same clean source, before copying.
    build_environment = {**os.environ, 'GIT_SHA': args.expected_sha,
                         'KNABA_RELEASE_MODE': 'official', 'ASTRO_TELEMETRY_DISABLED': '1'}
    for directory, name in ((site, 'corporate'), (root / 'erp', 'erp')):
        clean_source()
        if name == 'erp':
            generated = directory / 'dist'
            if generated.is_symlink() or (generated.exists() and not generated.is_dir()):
                raise RuntimeError('ERP generated output is not a regular directory')
            if generated.exists():
                shutil.rmtree(generated)
        with (output / (name + '-build.log')).open('w') as log:
            subprocess.run(['npm', 'run', 'build'], cwd=directory, env=build_environment,
                           stdout=log, stderr=subprocess.STDOUT, check=True)
        clean_source()
    release = json.loads((root / 'erp/dist/release.json').read_text())
    if release.get('code_sha') != args.expected_sha or release.get('source_dirty') is not False or release.get('source_provenance') != 'GIT_WORKTREE':
        raise RuntimeError('ERP must be freshly built from the exact clean Git source')
    for path in ('dist/server.mjs', 'dist/worker.mjs', 'dist/release.json', 'dist/web/index.html'):
        if not (root / 'erp' / path).is_file() or (root / 'erp' / path).stat().st_size == 0:
            raise RuntimeError('Missing ERP artifact: ' + path)
    for path in ('dist/server/index.js', 'dist/vps/render-page.mjs', 'dist/vps/articles.mjs', 'dist/vps/erp-intake.mjs'):
        if not (site / path).is_file() or (site / path).stat().st_size == 0:
            raise RuntimeError('Missing site server artifact: ' + path)
    # The existing verifier enforces public pages, links and unchanged payload limits.
    report_path = output / 'site-build-verification.json'
    subprocess.run(['node', 'tests/verify-build.mjs'], cwd=site,
                   env={**os.environ, 'KNABA_RELEASE_MODE': 'official', 'KNABA_BUILD_REPORT_PATH': str(report_path)},
                   stdout=subprocess.DEVNULL, check=True)
    site_report = json.loads(report_path.read_text())
    recorded = json.loads((site / 'docs/evidence/official-build-verification.json').read_text())
    if site_report != recorded:
        raise RuntimeError('Current site artifact does not match the committed build receipt')
    runtime = package / 'corporate-runtime'
    runtime.mkdir()
    site_dist_files = file_map(site / 'dist')
    site_inputs = {'dist/' + name: value for name, value in site_dist_files.items()}
    shutil.copytree(site / 'dist', runtime / 'dist', symlinks=True)
    # Copy versioned runtime/support files only. No environment, state, .git or dependencies.
    paths = git('ls-files', '-z', 'corporate-site/vps', 'corporate-site/drizzle', 'corporate-site/package.json').split('\0')
    for name in filter(None, paths):
        source = root / name
        if not source.is_file() or source.is_symlink():
            raise RuntimeError('Non-regular versioned runtime input: ' + name)
        destination = runtime / source.relative_to(site)
        site_inputs[source.relative_to(site).as_posix()] = {'sha256': digest(source), 'bytes': source.stat().st_size}
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    controller = site / 'vps/customer-environments/knabactl.py'
    spec = importlib.util.spec_from_file_location('knaba_package_controller', controller)
    ctl = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ctl)
    files = ctl.manifest(runtime)
    if files != site_inputs or file_map(site / 'dist') != site_dist_files:
        raise RuntimeError('Site runtime changed while copying')
    artifact = ctl.artifact_id(files)
    erp = package / 'erp-runtime'
    erp_dist_files = file_map(root / 'erp/dist')
    shutil.copytree(root / 'erp/dist', erp / 'dist', symlinks=True)
    if file_map(erp / 'dist') != erp_dist_files or file_map(root / 'erp/dist') != erp_dist_files:
        raise RuntimeError('ERP runtime changed while copying')
    for name in ('package.json', 'package-lock.json'):
        shutil.copyfile(root / 'erp' / name, erp / name)
    subprocess.run(['git', '-C', str(root), 'archive', '--format=tar.gz',
                    '--output=' + str(package / 'source.tar.gz'), args.expected_sha], check=True)
    subprocess.run(['python3', str(root / 'scripts/mobile/package-ios-source.py'), str(package / 'ios-source.tar.gz')],
                   stdout=subprocess.DEVNULL, check=True)
    shutil.copyfile(report_path, package / 'site-build-verification.json')
    for name in ('corporate', 'erp'):
        shutil.copyfile(output / (name + '-build.log'), package / (name + '-build.log'))
    notes = f'''# KNABA DE: серверний кандидат {args.expected_sha}

Цей пакет не встановлює і не перемикає чинний сайт. Він містить source, built
corporate runtime, ERP bundles/lockfile та iOS source (не підписаний IPA).
Corporate artifact ID для knabactl: `{artifact}`. Це hash file map, не hash TAR.

Перевірте зовнішній SHA-256 TAR і MANIFEST.json до extraction. Розпаковуйте
лише в новий приватний каталог; не поверх чинного runtime/state/config.
ERP bundles потребують dependencies з lockfile; відтворювані Dockerfiles,
міграції і bootstrap є у source.tar.gz. У цьому пакеті немає node_modules,
секретів, credentials або production database. Mail і public lead search
не активуються самим завантаженням.

## Послідовність оператора із штатним доступом

1. Прочитайте docs/unified/SERVER_INTEGRATION_2026-11-08_UK.md із source.
   Звірте встановлені runtime/controller, current artifact, config hash,
   Drizzle і VPS auth ledgers. Не вгадуйте provenance або receipts.
2. Створіть і незалежно перевірте приватну backup-копію. Відновіть її в
   ізольованому testing state; не використовуйте production DB для QA.
3. Застосуйте кандидатний vps/manage.mjs migrate у цій копії з тим самим
   Node24 runtime, правильним UID та лише testing mounts. Перевірте нові
   receipts/foreign keys, акаунт/сесії/assistant expiry і повторний startup.
   Приклад лише для вже відновленої ізольованої копії; обидва env обов'язкові:
   KNABA_DB_PATH=/absolute/private/testing/site.sqlite KNABA_BACKUP_DIR=/absolute/private/testing/backups node /path/to/corporate-runtime/vps/manage.mjs migrate
   Перед командою перевірте, що site.sqlite є саме відновленою testing БД,
   а backups належить UID процесу і має mode0700. Без цих env CLI має інший
   default path /var/lib/knaba/site.sqlite; не запускайте його навмання.
4. Старі readers можуть відхиляти нові receipts або ігнорувати revocation.
   Підготуйте сумісний rollback runtime або roll-forward. Відновлення старої
   БД після password/revoke changes вимагає security-state reconciliation.
5. Доступний stage є лише копіюванням immutable runtime. Reviewed controller:
   python3 /path/to/reviewed/knabactl.py stage /path/to/corporate-runtime --artifact {artifact}
   Routine activate правильно відмовляє при Drizzle/VPS SQL drift. Не
   обходьте цю відмову; окремий migration/activation план має базуватися на
   реально прочитаному серверному стані та testing результаті.
6. Production activation потребує штатного привілейованого deployment
   доступу і фактичного receipt, що відповідає current/config/candidate.
   Поточний дозвіл користувача на доставку не замінює невиконані
   customer/device/provider acceptance. При відмові доступу зупиніться.

Стан на пакуванні: uploaded/activated ще не підтверджені. Після доставки
потрібен окремий receipt з реальним шляхом, bytes і повторним server SHA-256.
'''
    (package / 'DEPLOYMENT_UK.md').write_text(notes)
    inventory = {}
    for path in sorted(package.rglob('*')):
        if path.is_symlink() or (not path.is_file() and not path.is_dir()):
            raise RuntimeError('Archive input must be a regular file/directory')
        if path.is_file():
            inventory[path.relative_to(package).as_posix()] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    manifest = {'schemaVersion': 1, 'product': 'KNABA_DE', 'sourceGitSha': args.expected_sha,
                'sourceTreeSha': git('rev-parse', 'HEAD^{tree}'), 'corporateArtifactSha256': artifact,
                'corporateRuntimeFiles': files, 'files': inventory,
                'erpDistFiles': erp_dist_files, 'build': 'FRESH_FULL_BUILDS_FROM_CLEAN_EXPECTED_SHA',
                'deployment': 'NOT_ACTIVATED_BY_PACKAGER', 'signing': 'NOT_PERFORMED',
                'erpDependencies': 'INSTALL_FROM_INCLUDED_LOCKFILE_OR_BUILD_FROM_SOURCE_DOCKERFILE'}
    (package / 'MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    clean_source()
    archive = output / ('knaba-server-' + args.expected_sha[:12] + '.tar.gz')
    stamp = int(git('show', '-s', '--format=%ct', 'HEAD'))
    with tarfile.open(archive, 'w:gz') as tar:
        for path in sorted(package.rglob('*')):
            if not path.is_file():
                continue
            content = path.read_bytes()
            name = path.relative_to(package).as_posix()
            if name in inventory and hashlib.sha256(content).hexdigest() != inventory[name]['sha256']:
                raise RuntimeError('Package changed during archive creation')
            info = tarfile.TarInfo(name)
            info.size = len(content)
            info.mode = 0o644
            info.mtime = stamp
            tar.addfile(info, io.BytesIO(content))
    clean_source()
    result = {'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': digest(archive),
              'sourceGitSha': args.expected_sha, 'corporateArtifactSha256': artifact,
              'activated': False}
    (output / 'package-receipt.json').write_text(json.dumps(result, indent=2) + '\n')
    archive.with_suffix(archive.suffix + '.sha256').write_text(result['sha256'] + '  ' + archive.name + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
