#!/usr/bin/env python3
"""KNABA customer prototype operator. Standard library only; no shell evaluation."""
from __future__ import annotations
import argparse
import contextlib
import datetime as dt
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import secrets
import shutil
import socket
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import uuid

SCHEMA = 1
MARKER = '.knaba-install.json'
SHA = re.compile(r'^[a-f0-9]{40}$')
DIGEST = re.compile(r'^[a-f0-9]{64}$')
DOMAIN = re.compile(r'^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')
EMAIL = re.compile(r'^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$')
DEFAULT_ROOT = Path('/srv/knaba/customer')
MAX_ARCHIVE_BYTES = 2 * 1024**3
SOURCE_ROOT = Path(__file__).resolve().parents[2]
RELEASE_KEYS = {'KNABA_WORKING_ORIGIN', 'KNABA_WORKING_ORIGIN_VERIFIED', 'KNABA_VERIFIED_WHATSAPP_NUMBER',
                'KNABA_VERIFIED_TELEGRAM_BOT', 'KNABA_ANDROID_APK_URL', 'KNABA_ANDROID_APK_SHA256',
                'KNABA_ANDROID_DISTRIBUTION', 'KNABA_ANDROID_VERSION', 'KNABA_IOS_INSTALL_URL'}
SITE_PROVIDER_KEYS = {'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'KNABA_GOOGLE_CLIENT_ID', 'KNABA_GOOGLE_CLIENT_SECRET',
                      'KNABA_MICROSOFT_TENANT_ID', 'KNABA_MICROSOFT_CLIENT_ID', 'KNABA_MICROSOFT_CLIENT_SECRET'}
ERP_PROVIDER_KEYS = {'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_PUBLIC_NUMBER', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_VERIFY_TOKEN',
                     'WHATSAPP_APP_SECRET', 'WHATSAPP_API_VERSION', 'WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED',
                     'WHATSAPP_TEST_RECIPIENTS', 'WHATSAPP_BUTTONS_VERIFIED', 'WHATSAPP_LISTS_VERIFIED',
                     'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_LIVE_SEND_ALLOWED',
                     'TELEGRAM_APPROVED_CONSENT_VERSION', 'TELEGRAM_ALLOWED_CHAT_IDS', 'LIVE_SEND_ALLOWED',
                     'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'DEEPSEEK_REGION', 'AI_TRANSFER_APPROVAL_ID',
                     'AI_SYNTHETIC_ONLY', 'AI_INPUT_PRICE_PER_MILLION_CENTS', 'AI_OUTPUT_PRICE_PER_MILLION_CENTS'}

class OperatorError(Exception):
    pass

def require(condition, message):
    if not condition:
        raise OperatorError(message)

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def digest_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def emit(value):
    print(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2))

def run(argv, *, cwd=None, data=None, capture=True, timeout=300):
    # Arguments are never interpreted as a shell program. Output stays private
    # on failures because a provider/Compose error may contain an env value.
    try:
        result = subprocess.run([str(x) for x in argv], cwd=cwd, input=data,
                                stdout=subprocess.PIPE if capture else None,
                                stderr=subprocess.PIPE, timeout=timeout, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        raise OperatorError('Command unavailable or timed out: ' + str(argv[0])) from exc
    if result.returncode:
        error = OperatorError('Command failed (exit %s): %s; inspect privately on the server.' %
                              (result.returncode, ' '.join(str(x) for x in argv[:3])))
        error.private_diagnostic = ((result.stdout or b'')[-512 * 1024:] + b'\n' + (result.stderr or b'')[-512 * 1024:])
        raise error
    return result.stdout or b''

def no_symlink_components(path):
    path = Path(path).absolute()
    for candidate in [path, *path.parents]:
        require(not candidate.is_symlink(), 'Symlink paths are not allowed: ' + str(candidate))
    return path

def private_json(path):
    path = no_symlink_components(path)
    info = path.stat()
    require(stat.S_ISREG(info.st_mode) and not info.st_mode & 0o077,
            'Private input must be a regular file with mode 0600 or 0400.')
    require(info.st_size <= 128 * 1024, 'Private JSON input exceeds limit.')
    return json.loads(path.read_text())

def atomic_write(path, content, mode=0o600):
    path = Path(path)
    no_symlink_components(path)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb') as f:
            f.write(content.encode() if isinstance(content, str) else content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
        dfd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def write_json(path, value):
    atomic_write(path, json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n')

def atomic_copy(source, destination):
    source, destination = no_symlink_components(source), no_symlink_components(destination)
    require(source.is_file(), 'Copy source must be a regular file.')
    fd, temporary = tempfile.mkstemp(prefix='.' + destination.name + '.', dir=destination.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'wb') as output, source.open('rb') as input_file:
            shutil.copyfileobj(input_file, output, 1024 * 1024)
            output.flush(); os.fsync(output.fileno())
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def env_text(values):
    lines = []
    for key, value in sorted(values.items()):
        require(re.fullmatch(r'[A-Z][A-Z0-9_]*', key), 'Invalid environment key.')
        value = str(value)
        require(not any(c in value for c in "\r\n\x00'"), 'Environment value contains unsupported control/quote characters.')
        lines.append(key + "='" + value + "'")
    return '\n'.join(lines) + '\n'

def read_env(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)='([^']*)'", line)
        require(match is not None, 'Environment format changed; review protected file before using installer.')
        result[match[1]] = match[2]
    return result

def normalize_settings(raw):
    allowed = {'siteDomain', 'erpDomain', 'ownerEmail', 'developerEmail', 'companyId', 'proxyMode', 'sitePort', 'erpPort', 'mode', 'releaseConfig'}
    require(isinstance(raw, dict) and set(raw) <= allowed, 'Unexpected settings field.')
    out = {key: str(raw.get(key, '')).strip().lower() for key in ['siteDomain', 'erpDomain', 'ownerEmail', 'developerEmail']}
    require(DOMAIN.fullmatch(out['siteDomain']) and DOMAIN.fullmatch(out['erpDomain']) and
            out['siteDomain'] != out['erpDomain'], 'Provide two different DNS hostnames without scheme/path/port.')
    require(EMAIL.fullmatch(out['ownerEmail']) and len(out['ownerEmail']) <= 320, 'Verified owner email is required.')
    require(not out['developerEmail'] or (EMAIL.fullmatch(out['developerEmail']) and out['developerEmail'] != out['ownerEmail']),
            'Developer email must be valid and different from owner.')
    out['mode'] = raw.get('mode', 'production')
    require(out['mode'] in ['production', 'prototype'], 'Mode must be production or prototype.')
    out['companyId'] = raw.get('companyId', '')
    require(isinstance(out['companyId'], str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}', out['companyId']) and
            out['companyId'] not in ['knaba-demo', 'knaba-de-demo'], 'Explicit real companyId is required; no demo default.')
    if out['mode'] == 'prototype':
        require(out['companyId'].startswith('knaba-prototype-'), 'Prototype companyId must start with knaba-prototype-.')
    out['proxyMode'] = raw.get('proxyMode', 'external')
    require(out['proxyMode'] in ['external', 'standalone'], 'proxyMode must be external or standalone.')
    for key, default in [('sitePort', 19110), ('erpPort', 19111)]:
        out[key] = raw.get(key, default)
        require(type(out[key]) is int and 1024 <= out[key] <= 65535, 'Invalid loopback port.')
    require(out['sitePort'] != out['erpPort'], 'Website and ERP ports must differ.')
    release = raw.get('releaseConfig', {})
    require(isinstance(release, dict) and set(release) <= RELEASE_KEYS and all(isinstance(x, str) for x in release.values()), 'Invalid releaseConfig.')
    env_text(release)
    out['releaseConfig'] = release
    return out

def validate_provider_input(raw, mode, *, enable_live_send=False, enable_paid_ai=False):
    require(isinstance(raw, dict) and set(raw) <= {'site', 'erp', 'approval'}, 'Invalid private provider configuration.')
    site, erp, approval = raw.get('site', {}), raw.get('erp', {}), raw.get('approval', {})
    for values, allowed in [(site, SITE_PROVIDER_KEYS), (erp, ERP_PROVIDER_KEYS)]:
        require(isinstance(values, dict) and set(values) <= allowed and all(isinstance(x, str) for x in values.values()),
                'Provider keys are allowlisted strings; identity/database/host variables cannot be overridden.')
        env_text(values)
    require(site or erp, 'No provider configuration values supplied.')
    require(isinstance(approval, dict) and set(approval) <= {'reference', 'liveSendingApproved', 'paidAiApproved', 'budgetCents'},
            'Invalid operator approval metadata.')
    erp = dict(erp)
    requested_send = any(erp.get(key) == 'true' for key in ['LIVE_SEND_ALLOWED', 'TELEGRAM_LIVE_SEND_ALLOWED'])
    require(not requested_send or enable_live_send, 'Live sending requires explicit --enable-live-send and reviewed approval metadata.')
    if enable_live_send:
        require(mode == 'production' and approval.get('liveSendingApproved') is True and
                isinstance(approval.get('reference'), str) and 8 <= len(approval['reference']) <= 160,
                'Live sending requires production mode and a recorded operator-approved provider/privacy reference.')
    if erp and not enable_live_send:
        erp['LIVE_SEND_ALLOWED'] = 'false'
        erp['TELEGRAM_LIVE_SEND_ALLOWED'] = 'false'
    paid_ai = bool(erp.get('DEEPSEEK_API_KEY')) or erp.get('AI_SYNTHETIC_ONLY') == 'false'
    require(not paid_ai or enable_paid_ai, 'A paid AI key or real AI transfer requires explicit --enable-paid-ai.')
    if enable_paid_ai:
        require(mode == 'production' and approval.get('paidAiApproved') is True and
                isinstance(approval.get('reference'), str) and 8 <= len(approval['reference']) <= 160 and
                type(approval.get('budgetCents')) is int and approval['budgetCents'] > 0,
                'Paid AI requires production mode, operator approval reference and a bounded approved budget.')
    if mode == 'prototype' and erp:
        erp['AI_SYNTHETIC_ONLY'] = 'true'
    for key in ['LIVE_SEND_ALLOWED', 'TELEGRAM_LIVE_SEND_ALLOWED', 'WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED',
                'WHATSAPP_BUTTONS_VERIFIED', 'WHATSAPP_LISTS_VERIFIED', 'AI_SYNTHETIC_ONLY']:
        require(key not in erp or erp[key] in ['true', 'false'], 'Provider boolean values must be true or false.')
    if erp.get('TELEGRAM_WEBHOOK_SECRET'):
        require(re.fullmatch(r'[A-Za-z0-9_-]{16,256}', erp['TELEGRAM_WEBHOOK_SECRET']), 'Invalid Telegram webhook secret format.')
    if erp.get('TELEGRAM_BOT_TOKEN'):
        require(re.fullmatch(r'[0-9]{4,20}:[A-Za-z0-9_-]{20,200}', erp['TELEGRAM_BOT_TOKEN']), 'Invalid Telegram token format.')
    return site, erp, approval

def root_for_write(path):
    require(os.geteuid() == 0, 'This action requires root on the authorized customer server.')
    path = no_symlink_components(path)
    require(re.fullmatch(r'/srv/knaba/[A-Za-z0-9][A-Za-z0-9_-]*', str(path)) is not None and path.name != 'vps',
            'Use a dedicated /srv/knaba/<installation> directory; existing /srv/knaba/vps is protected.')
    return path

def load_install(root):
    root = no_symlink_components(root)
    marker = root / MARKER
    require(marker.is_file(), 'No KNABA customer marker. Existing directories are never adopted or overwritten.')
    data = private_json(marker)
    require(data.get('schemaVersion') == SCHEMA and data.get('product') == 'KNABA_CUSTOMER' and
            data.get('root') == str(root) and re.fullmatch(r'[a-f0-9]{32}', data.get('installId', '')),
            'Installation marker mismatch. No services changed.')
    return data

@contextlib.contextmanager
def lock(root):
    root = Path(root)
    require(root.is_dir() and not root.is_symlink(), 'Installation directory missing or unsafe.')
    lock_path = root / '.operator.lock'
    no_symlink_components(lock_path)
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise OperatorError('Another KNABA operation holds the installation lock.') from exc
        yield
    finally:
        os.close(fd)

def storage_report(path):
    while not path.exists():
        path = path.parent
    info = os.statvfs(path)
    total, available = info.f_blocks * info.f_frsize, info.f_bavail * info.f_frsize
    used = 100 * (total - available) / total
    return {'availableBytes': available, 'usedPercent': round(used, 2), 'cutoverAllowed': available >= 10 * 1024**3 and used < 90}

def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(('0.0.0.0', port))
        except OSError:
            return False
    return True

def preflight(root, settings=None, existing=False):
    require(sys.version_info >= (3, 10), 'Python 3.10 or newer is required.')
    require(sys.platform.startswith('linux'), 'Customer installer requires Linux.')
    storage = storage_report(Path(root))
    require(storage['cutoverAllowed'], 'Storage gate failed: require >=10 GiB free and <90% used; no cleanup is automatic.')
    require(shutil.which('docker'), 'Docker Engine and Compose v2 must be installed by the server administrator.')
    version = run(['docker', 'compose', 'version', '--short'], timeout=20).decode().strip()
    require(re.match(r'^v?2\.', version), 'Docker Compose v2 is required.')
    run(['docker', 'info', '--format', '{{.ServerVersion}}'], timeout=20)
    if settings and not existing:
        ports = [settings['sitePort'], settings['erpPort']]
        if settings['proxyMode'] == 'standalone':
            ports += [80, 443]
        require(all(check_port(p) for p in ports), 'A requested port is already occupied; preserve existing services and use external proxy mode.')
    return {'status': 'PASS', 'storage': storage, 'composeVersion': version, 'target': str(root), 'productionDataWritten': False}

def inventory(scan):
    roots = [no_symlink_components(p) for p in scan]
    found = []
    seen = set()
    for base in roots:
        require('/knaba' in str(base).lower(), 'Inventory roots must be explicitly KNABA-scoped.')
        if not base.is_dir():
            continue
        for directory, dirs, files in os.walk(base, followlinks=False):
            p = Path(directory)
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', '.gradle', 'dist', 'backups', 'state', 'uploads'] and
                       not (p / d).is_symlink() and len((p / d).relative_to(base).parts) <= 5]
            if MARKER in files or ('package.json' in files and 'knaba' in (p / 'package.json').read_text(errors='replace')[:8192].lower()) or '.git' in files or (p / '.git').is_dir():
                if str(p) in seen:
                    continue
                seen.add(str(p))
                item = {'path': str(p), 'customerMarker': MARKER in files, 'git': (p / '.git').exists()}
                if item['git']:
                    try:
                        sha = run(['git', '-C', p, 'rev-parse', 'HEAD'], timeout=10).decode().strip()
                        item['sourceSha'] = sha if SHA.fullmatch(sha) else 'UNKNOWN'
                        item['dirty'] = bool(run(['git', '-C', p, 'status', '--porcelain'], timeout=10))
                    except OperatorError:
                        item['sourceSha'] = 'UNREADABLE'
                found.append(item)
    return {'mode': 'READ_ONLY', 'copies': found, 'deleted': 0, 'scope': [str(p) for p in roots]}

def archive_manifest(archive, expected_digest):
    require(DIGEST.fullmatch(expected_digest or ''), 'Expected archive SHA256 is required from a trusted handover.')
    archive = no_symlink_components(archive)
    require(archive.is_file() and archive.stat().st_size <= MAX_ARCHIVE_BYTES, 'Archive missing or too large.')
    require(secrets.compare_digest(digest_file(archive), expected_digest), 'Archive checksum mismatch.')
    with tarfile.open(archive, 'r:gz') as tf:
        files, total = {}, 0
        for entry in tf.getmembers():
            path = PurePosixPath(entry.name)
            require(not path.is_absolute() and '..' not in path.parts and str(path) == entry.name and
                    path.parts and (path.parts[0] in ['corporate-site', 'erp', 'ops', 'release.json'] or
                                    path.parts[:2] in [('scripts', 'mobile'), ('docs', 'mobile')]), 'Unsafe archive path.')
            require(entry.isfile() or entry.isdir(), 'Symlinks, hardlinks and special archive entries are forbidden.')
            require(not entry.mode & 0o7000, 'Special archive permission bits are forbidden.')
            if entry.isfile():
                require(entry.name not in files, 'Duplicate archive entry.')
                total += entry.size
                require(total <= MAX_ARCHIVE_BYTES and len(files) < 30000, 'Expanded archive exceeds limits.')
                files[entry.name] = entry
        require('release.json' in files and files['release.json'].size <= 16 * 1024**2, 'Release manifest missing or too large.')
        manifest = json.load(tf.extractfile(files['release.json']))
        require(manifest.get('schemaVersion') == SCHEMA and manifest.get('artifactScope') == 'customer-prototype' and
                SHA.fullmatch(manifest.get('sourceSha', '')), 'Invalid release manifest.')
        expected = manifest.get('files')
        require(isinstance(expected, dict) and set(expected) == set(files) - {'release.json'}, 'Release file inventory mismatch.')
        for name, record in expected.items():
            require(isinstance(record, dict) and DIGEST.fullmatch(record.get('sha256', '')) and record.get('bytes') == files[name].size,
                    'Invalid per-file digest metadata.')
            h = hashlib.sha256()
            stream = tf.extractfile(files[name])
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                h.update(chunk)
            require(secrets.compare_digest(h.hexdigest(), record['sha256']), 'Release file content mismatch.')
        for needed in ['corporate-site/dist/client/index.html', 'corporate-site/dist/server/index.js',
                       'corporate-site/dist/vps/render-page.mjs',
                       'corporate-site/vps/server.mjs', 'corporate-site/vps/manage.mjs',
                       'corporate-site/drizzle/meta/_journal.json', 'erp/package-lock.json',
                       'erp/infra/Dockerfile', 'ops/customer/compose.yaml', 'ops/customer/knaba.py',
                       'ops/customer/prototype-seed.mts']:
            require(needed in expected, 'Incomplete package: ' + needed)
        return manifest

def stage(root, archive, expected):
    manifest = archive_manifest(archive, expected)
    dest = root / 'releases' / manifest['sourceSha']
    if dest.exists():
        previous = json.loads((dest / 'release.json').read_text())
        require(previous == manifest, 'Existing same-SHA release differs; refusing replacement.')
        verify_release(dest)
        return manifest
    temporary = Path(tempfile.mkdtemp(prefix='.stage-', dir=root / 'releases'))
    os.chmod(temporary, 0o700)
    # archive_manifest has inspected every entry; extract regular files manually.
    with tarfile.open(archive, 'r:gz') as tf:
        for entry in tf.getmembers():
            target = temporary / entry.name
            if entry.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as out:
                    shutil.copyfileobj(tf.extractfile(entry), out)
                target.chmod(0o755 if entry.mode & 0o100 else 0o644)
    verify_release(temporary)
    for directory, _, _ in os.walk(temporary):
        os.chmod(directory, 0o755)
    os.rename(temporary, dest)
    return manifest

def verify_release(path):
    require(path.is_dir() and not path.is_symlink(), 'Release directory missing or unsafe.')
    manifest = json.loads((path / 'release.json').read_text())
    actual = set()
    for directory, dirs, files in os.walk(path, followlinks=False):
        for name in dirs + files:
            require(not (Path(directory) / name).is_symlink(), 'Unexpected release symlink.')
        for name in files:
            file = Path(directory) / name
            rel = file.relative_to(path).as_posix()
            if rel == 'release.json':
                continue
            actual.add(rel)
            record = manifest['files'].get(rel)
            require(record and file.stat().st_size == record['bytes'] and digest_file(file) == record['sha256'], 'Installed artifact integrity mismatch.')
    require(actual == set(manifest['files']), 'Installed artifact inventory mismatch.')
    return manifest

def package(source, output):
    source = no_symlink_components(source)
    require(not run(['git', '-C', source, 'status', '--porcelain']), 'Commit the reviewed source before packaging; dirty source is refused.')
    sha = run(['git', '-C', source, 'rev-parse', 'HEAD']).decode().strip()
    require(SHA.fullmatch(sha), 'Cannot determine exact source SHA.')
    require(not output.exists() and not output.is_relative_to(source), 'Output must be a new file outside the repository.')
    output.parent.mkdir(parents=True, exist_ok=True)
    roots = ['corporate-site/dist', 'corporate-site/vps', 'corporate-site/drizzle', 'corporate-site/package.json',
             'corporate-site/package-lock.json', 'erp/apps', 'erp/packages', 'erp/infra', 'erp/scripts', 'erp/tests',
             'erp/package.json', 'erp/package-lock.json', 'erp/tsconfig.json', 'ops/customer',
             'erp/.env.example', 'erp/docs/BACKUP_RESTORE.md', 'erp/docs/BOT_RUNTIME_ORIGINS_UK.md',
             'scripts/mobile', 'docs/mobile/DISTRIBUTION_2026-10-28_UK.md',
             'docs/mobile/evidence/prototype-20261028']
    paths = {}
    excluded = {'node_modules', '.git', '.env', '.gradle', '.cache', '__pycache__', 'build', 'DerivedData', 'private', 'state', 'backups'}
    for root in roots:
        start = source / root
        require(start.exists(), 'Missing package input: ' + root)
        items = [start] if start.is_file() else start.rglob('*')
        for file in items:
            rel = file.relative_to(source)
            if any(p in excluded for p in rel.parts):
                continue
            require(not file.is_symlink(), 'Package refuses symlink input: ' + str(rel))
            if not file.is_file():
                continue
            require(not file.name.endswith(('.sqlite', '.sqlite-wal', '.sqlite-shm', '.pem', '.key', '.p12', '.keystore', '.jks')) and
                    (not file.name.startswith('.env') or rel.as_posix() == 'erp/.env.example'), 'Private state or key found in package inputs.')
            # Generated assets may intentionally include downloadable APKs. Source caches/archives are excluded.
            if rel.parts[:2] != ('corporate-site', 'dist') and file.suffix in ['.zip', '.gz', '.apk', '.ipa', '.aab', '.pyc']:
                continue
            paths[rel.as_posix()] = file
    manifest = {'schemaVersion': SCHEMA, 'artifactScope': 'customer-prototype', 'sourceSha': sha,
                'languages': ['de', 'en', 'pl', 'lt', 'ru', 'uk'], 'defaultLanguage': 'de',
                'files': {name: {'bytes': file.stat().st_size, 'sha256': digest_file(file)} for name, file in sorted(paths.items())}}
    # gzip mtime and tar uid/gid/mtime are fixed; identical inputs yield identical bytes.
    with output.open('xb') as f, gzip.GzipFile(filename='', mode='wb', fileobj=f, mtime=0) as gz, tarfile.open(fileobj=gz, mode='w') as tf:
        data = (json.dumps(manifest, sort_keys=True, separators=(',', ':')) + '\n').encode()
        info = tarfile.TarInfo('release.json'); info.size = len(data); info.mode = 0o644
        tf.addfile(info, io.BytesIO(data))
        for name, file in sorted(paths.items()):
            info = tarfile.TarInfo(name); info.size = file.stat().st_size
            info.mode = 0o755 if file.stat().st_mode & 0o100 else 0o644
            with file.open('rb') as stream:
                tf.addfile(info, stream)
    output.chmod(0o600)
    digest = digest_file(output)
    atomic_write(output.with_name(output.name + '.sha256'), digest + '  ' + output.name + '\n')
    archive_manifest(output, digest)
    return {'archive': str(output), 'sha256': digest, 'sourceSha': sha, 'files': len(paths), 'scope': 'CUSTOMER_PROTOTYPE_NOT_LIVE'}

class Installation:
    def __init__(self, root):
        self.root = Path(root)
        self.meta = load_install(self.root)
        self.settings = private_json(self.root / 'config/settings.json')

    def save(self):
        write_json(self.root / MARKER, self.meta)

    def release(self, sha=None):
        sha = sha or self.meta.get('currentSha')
        require(SHA.fullmatch(sha or ''), 'No active release configured.')
        return self.root / 'releases' / sha

    def compose(self, args, *, sha=None, data=None, timeout=300, capture=True):
        release = self.release(sha)
        env = self.root / 'config/compose.env'
        values = read_env(env)
        values.update(GIT_SHA=release.name, KNABA_RELEASE_DIR=str(release))
        # Dedicated ephemeral interpolation file supports candidate rehearsal without changing active config.
        temporary = self.root / 'config/.compose-operation.env'
        atomic_write(temporary, env_text(values))
        try:
            return run(['docker', 'compose', '--env-file', temporary, '-f', release / 'ops/customer/compose.yaml',
                        '--project-name', self.meta['projectName'], *args], data=data, timeout=timeout, capture=capture)
        except OperatorError as error:
            if getattr(error, 'private_diagnostic', None):
                atomic_write(self.root / 'last-command-error.log', error.private_diagnostic)
            raise
        finally:
            temporary.unlink(missing_ok=True)

    def set_current(self, sha):
        require(SHA.fullmatch(sha), 'Invalid source SHA.')
        self.meta['currentSha'] = sha
        self.meta['updatedAt'] = utc()
        self.save()

    def site_command(self, args, *, sha=None, data=None):
        return self.compose(['run', '--rm', '--no-deps', '-T', 'site', 'node', *args], sha=sha, data=data)

    def backup(self, scope='all'):
        tag = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + secrets.token_hex(4)
        folder = self.root / 'backups' / tag
        folder.mkdir(mode=0o700)
        site_db = self.root / 'state/site/site.sqlite'
        report = {'schemaVersion': 1, 'createdAt': utc(), 'sourceSha': self.meta.get('currentSha'),
                  'installId': self.meta['installId'], 'scope': scope, 'files': {}, 'erpActive': self.meta.get('erpActive', False)}
        if site_db.exists():
            require(not site_db.is_symlink(), 'Unsafe SQLite source.')
            target = folder / 'site.sqlite'
            with sqlite3.connect('file:' + str(site_db) + '?mode=ro', uri=True) as db, sqlite3.connect(target) as dest:
                db.backup(dest)
                require(dest.execute('PRAGMA integrity_check').fetchone()[0] == 'ok' and
                        not dest.execute('PRAGMA foreign_key_check').fetchall(), 'SQLite backup integrity failed.')
            target.chmod(0o600)
            report['files']['site.sqlite'] = digest_file(target)
        if scope == 'all' and self.meta.get('postgresInitialized'):
            if self.settings['mode'] == 'production':
                # Reuse the canonical encrypted snapshot, private-blob and privacy-ledger proof.
                self.compose(['--profile', 'erp', 'run', '--rm', '--no-deps', '-T', '--user', '0:0',
                              'backup', '/backups/' + tag + '/erp.tar.enc'], timeout=900)
                for name in ['erp.tar.enc', 'erp.tar.enc.hmac']:
                    require((folder / name).is_file(), 'Canonical encrypted backup output missing.')
                    report['files'][name] = digest_file(folder / name)
                report['erpBackupFormat'] = 'CANONICAL_ENCRYPTED_PRIVACY_LEDGER'
            else:
                # Synthetic rollback must never resurrect a test of a privacy request either.
                query = ("SELECT (SELECT count(*) FROM privacy_erasure_manifests)+"
                         "(SELECT count(*) FROM privacy_blob_deletions)+(SELECT count(*) FROM privacy_revision_permits)+"
                         "(SELECT count(*) FROM aggregates WHERE kind='privacy_request')+"
                         "(SELECT count(*) FROM aggregate_revisions WHERE kind='privacy_request')")
                count = self.compose(['exec', '-T', 'postgres', 'psql', '-U', 'knaba', '-d', 'knaba', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query]).decode().strip()
                require(count == '0', 'Prototype privacy history exists; use canonical independently reconciled recovery.')
                dump = self.compose(['exec', '-T', 'postgres', 'pg_dump', '-U', 'knaba', '-d', 'knaba', '-Fc',
                                     '--no-owner', '--no-acl', '--exclude-table-data=public.privacy_revision_permits'], timeout=600)
                atomic_write(folder / 'postgres.dump', dump)
                self.compose(['exec', '-T', 'postgres', 'pg_restore', '--list'], data=dump)
                report['files']['postgres.dump'] = digest_file(folder / 'postgres.dump')
                report['prototypePrivacyHistoryEmpty'] = True
        for name in ['site.env', 'erp.env', 'postgres.env', 'compose.env', 'settings.json', 'Caddyfile', 'backup.env']:
            file = self.root / 'config' / name
            if file.exists():
                atomic_write(folder / name, file.read_bytes())
                report['files'][name] = digest_file(folder / name)
        blobs = self.root / 'state/erp-private'
        if scope == 'all' and self.settings['mode'] == 'prototype' and blobs.is_dir():
            for entry in blobs.rglob('*'):
                require(not entry.is_symlink(), 'Unsafe ERP private blob symlink.')
            shutil.copytree(blobs, folder / 'erp-private', symlinks=False)
            for file in (folder / 'erp-private').rglob('*'):
                require(not file.is_symlink(), 'Unsafe ERP private blob.')
                if file.is_file():
                    file.chmod(0o600)
                    report['files'][file.relative_to(folder).as_posix()] = digest_file(file)
        write_json(folder / 'backup.json', report)
        return folder

    def verify(self, require_erp=False, public_https=False, require_owner=False, require_public_forms=False):
        manifest = verify_release(self.release())
        report = {'sourceSha': manifest['sourceSha'], 'artifactIntegrity': 'PASS', 'checkedAt': utc(), 'checks': {}}
        def probe(name, url, host, required, expected=None):
            req = urllib.request.Request(url, headers={'Host': host, 'Connection': 'close',
                                                     **({'X-Forwarded-Proto': 'https'} if url.startswith('http://127.0.0.1:') else {})})
            try:
                with urllib.request.urlopen(req, timeout=8) as res:
                    body = res.read(64 * 1024)
                    good = res.status == 200
                    if expected:
                        obj = json.loads(body)
                        good = good and (obj.get('sha') == expected or obj.get('gitSha') == expected)
                    report['checks'][name] = {'status': 'PASS' if good else 'FAIL', 'httpStatus': res.status, 'required': required}
            except (urllib.error.URLError, ValueError, OSError) as exc:
                report['checks'][name] = {'status': 'BLOCKED' if not required else 'FAIL', 'required': required,
                                          'reason': 'HTTP_CHECK_FAILED', 'httpStatus': getattr(exc, 'code', None)}
        site = 'http://127.0.0.1:' + str(self.settings['sitePort'])
        for name, path in [('siteHealth', '/healthz'), ('siteReady', '/readyz'), ('siteHome', '/'), ('siteLogin', '/login/'),
                           ('siteApps', '/app/'), ('whatsappEntry', '/bots/whatsapp/'), ('telegramEntry', '/bots/telegram/'),
                           ('languageEnglish', '/en/'), ('languagePolish', '/pl/'), ('languageLithuanian', '/lt/'),
                           ('languageRussian', '/ru/'), ('languageUkrainian', '/uk/'), ('publicReleaseMetadata', '/api/public/release')]:
            probe(name, site + path, self.settings['siteDomain'], name != 'siteReady' or require_owner)
        try:
            request = urllib.request.Request(site + '/api/assistant/captcha',
                headers={'Host': self.settings['siteDomain'], 'X-Forwarded-Proto': 'https', 'Connection': 'close'})
            with urllib.request.urlopen(request, timeout=8) as response:
                captcha = json.loads(response.read(8192))
            configured = captcha.get('enabled') is True and bool(captcha.get('sitekey')) and captcha.get('unavailable') is not True
            report['checks']['captchaConfiguration'] = {'status': 'PASS' if configured else 'BLOCKED_EXTERNAL',
                'required': require_public_forms, 'scope': 'CONFIGURATION_ONLY', 'liveChallenge': 'NOT_RUN',
                'reason': None if configured else 'TURNSTILE_CREDENTIALS_REQUIRED_FOR_PUBLIC_ASSISTANT_AND_FORMS'}
        except (urllib.error.URLError, ValueError, OSError):
            report['checks']['captchaConfiguration'] = {'status': 'BLOCKED_EXTERNAL', 'required': require_public_forms,
                                                        'reason': 'CAPTCHA_CONFIGURATION_ENDPOINT_UNAVAILABLE'}
        erp = 'http://127.0.0.1:' + str(self.settings['erpPort'])
        if self.meta.get('erpActive') or require_erp:
            probe('erpVersion', erp + '/version', self.settings['erpDomain'], True, manifest['sourceSha'])
            probe('erpReady', erp + '/ready', self.settings['erpDomain'], True)
            state = self.compose(['ps', '--format', 'json', 'worker']).decode()
            try:
                rows = json.loads(state) if state.strip().startswith('[') else [json.loads(x) for x in state.splitlines() if x]
                good = len(rows) == 1 and rows[0].get('Health') == 'healthy'
            except ValueError:
                good = False
            report['checks']['worker'] = {'status': 'PASS' if good else 'FAIL', 'required': True}
        else:
            report['checks']['erp'] = {'status': 'BLOCKED_EXTERNAL', 'reason': 'OWNER_AND_APPROVED_PRODUCTION_RETENTION_REQUIRED', 'required': False}
        if public_https:
            probe('publicSiteHttps', 'https://' + self.settings['siteDomain'] + '/healthz', self.settings['siteDomain'], True)
            if self.meta.get('erpActive') or require_erp:
                probe('publicErpHttps', 'https://' + self.settings['erpDomain'] + '/version', self.settings['erpDomain'], True, manifest['sourceSha'])
        else:
            report['checks']['publicHttps'] = {'status': 'NOT_RUN', 'required': False}
        report['status'] = 'PASS_IN_SCOPE' if all(c['status'] == 'PASS' for c in report['checks'].values() if c.get('required')) else 'FAIL'
        report['fullProductReady'] = False
        return report

    def owner_update(self, input_path):
        data = private_json(input_path)
        require(data.get('identityVerified') is True, 'Explicit same-owner identity verification is required.')
        current = self.settings['ownerEmail']
        require(data.get('currentEmail', '').lower() == current, 'Current owner mismatch.')
        new = str(data.get('newEmail', '')).strip().lower()
        require(EMAIL.fullmatch(new) and new != self.settings['developerEmail'], 'Invalid or conflicting new owner email.')
        journal = self.root / 'owner-maintenance.pending.json'
        require(not journal.exists(), 'An interrupted owner maintenance operation needs recovery first.')
        require(not (self.root / 'operation.pending.json').exists(), 'Deployment recovery is pending.')
        self.compose(['stop', 'site'])
        try:
            folder = self.backup(scope='site')
        except Exception:
            self.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '90', 'site'])
            raise
        write_json(journal, {'backup': folder.name, 'startedAt': utc(), 'state': 'PREPARED'})
        try:
            self.site_command(['/app/vps/manage.mjs', 'update-owner'], data=json.dumps(data).encode())
            env = read_env(self.root / 'config/site.env'); env['OWNER_EMAIL'] = new
            atomic_write(self.root / 'config/site.env', env_text(env))
            self.settings['ownerEmail'] = new
            write_json(self.root / 'config/settings.json', self.settings)
            self.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '90', 'site'])
            journal.unlink()
            return {'updated': True, 'identityPreserved': True, 'sessionsRevoked': True, 'backup': folder.name, 'erpIdentityChanged': False}
        except Exception:
            # Restore only the site database/config while site is stopped; ERP is untouched.
            self.compose(['stop', 'site'])
            self.restore_site(folder)
            self.settings = private_json(self.root / 'config/settings.json')
            self.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '90', 'site'])
            journal.unlink(missing_ok=True)
            raise

    def import_site(self, path, expected):
        path = no_symlink_components(path)
        require(path.is_file() and DIGEST.fullmatch(expected or '') and digest_file(path) == expected,
                'Transferred SQLite backup checksum mismatch.')
        require(not (self.root / 'operation.pending.json').exists() and
                not (self.root / 'owner-maintenance.pending.json').exists(), 'A prior operation needs recovery.')
        with sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True) as db:
            require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok' and not db.execute('PRAGMA foreign_key_check').fetchall(),
                    'Transferred SQLite backup integrity failed.')
            require(db.execute('SELECT count(*) FROM vps_users WHERE email=? AND disabled=0', (self.settings['ownerEmail'],)).fetchone()[0] == 1,
                    'Imported backup must contain the configured existing owner; do not silently assign a different person.')
        self.compose(['stop', 'site'])
        current = self.root / 'state/site/site.sqlite'
        try:
            require(current.is_file() and not current.is_symlink(), 'Import requires the already initialized empty website database.')
            if current.exists():
                with sqlite3.connect('file:' + str(current) + '?mode=ro', uri=True) as db:
                    for table in ['vps_users', 'profiles', 'cleaning_requests', 'assistant_conversations', 'studio_pages']:
                        require(db.execute('SELECT count(*) FROM ' + table).fetchone()[0] == 0,
                                'Import is allowed only into an empty new website; existing customer data is preserved.')
            folder = self.backup(scope='site')
        except Exception:
            self.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '90', 'site'])
            raise
        journal = self.root / 'owner-maintenance.pending.json'
        write_json(journal, {'backup': folder.name, 'state': 'SITE_IMPORT_PREPARED', 'startedAt': utc()})
        try:
            if current.exists():
                current.rename(current.with_name('pre-import-' + secrets.token_hex(6) + '.sqlite'))
            for suffix in ['-wal', '-shm']:
                sidecar = Path(str(current) + suffix)
                if sidecar.exists():
                    sidecar.rename(sidecar.with_name(sidecar.name + '.retained-' + secrets.token_hex(6)))
            atomic_copy(path, current)
            os.chown(current, self.meta['runtimeUid'], self.meta['runtimeGid'])
            self.site_command(['/app/vps/manage.mjs', 'migrate'])
            self.site_command(['/app/vps/manage.mjs', 'audit'])
            self.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'site'])
            journal.unlink()
            return {'status': 'IMPORTED_VERIFIED_SITE_BACKUP', 'sourceBackupSha256': expected,
                    'previousEmptyStateBackup': folder.name, 'ownerIdentityPreserved': True}
        except Exception:
            self.compose(['stop', 'site'])
            self.restore_site(folder)
            self.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'site'])
            journal.unlink(missing_ok=True)
            raise

    def restore_site(self, folder):
        report = private_json(folder / 'backup.json')
        require(report['installId'] == self.meta['installId'], 'Backup belongs to another installation.')
        for name in ['site.sqlite', 'site.env', 'settings.json']:
            if name in report['files']:
                require(digest_file(folder / name) == report['files'][name], 'Backup checksum mismatch.')
        db_path = self.root / 'state/site/site.sqlite'
        if 'site.sqlite' in report['files']:
            # Stopped service; preserve the failed database as evidence before replacing it.
            if db_path.exists():
                failed = db_path.with_name('failed-owner-' + secrets.token_hex(6) + '.sqlite')
                os.replace(db_path, failed)
            for suffix in ['-wal', '-shm']:
                sidecar = Path(str(db_path) + suffix)
                if sidecar.exists():
                    os.replace(sidecar, sidecar.with_name(sidecar.name + '.retained-' + secrets.token_hex(4)))
            atomic_copy(folder / 'site.sqlite', db_path)
            os.chown(db_path, self.meta['runtimeUid'], self.meta['runtimeGid'])
        for name in ['site.env', 'settings.json']:
            if name in report['files']:
                atomic_write(self.root / 'config' / name, (folder / name).read_bytes())

    def recover_owner(self):
        journal = self.root / 'owner-maintenance.pending.json'
        require(journal.exists(), 'No interrupted owner/site-import journal.')
        data = private_json(journal)
        require(re.fullmatch(r'[0-9]{8}T[0-9]{6}-[a-f0-9]{8}', data.get('backup', '')), 'Invalid recovery backup reference.')
        self.compose(['stop', 'site'])
        self.restore_site(self.root / 'backups' / data['backup'])
        self.settings = private_json(self.root / 'config/settings.json')
        self.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'site'])
        journal.unlink()
        return {'status': 'SITE_AND_OWNER_CONFIGURATION_RESTORED', 'erpChanged': False}

    def prepare_prototype(self):
        require(self.settings['mode'] == 'prototype' and self.settings['companyId'].startswith('knaba-prototype-'),
                'Synthetic bootstrap requires the explicit isolated prototype installation.')
        credentials = self.root / 'config/prototype-credentials.json'
        if not credentials.exists():
            write_json(credentials, {'syntheticOnly': True, 'password': secrets.token_hex(32),
                                     'ownerEmail': 'demo-owner@example.invalid',
                                     'erpOrigin': 'https://' + self.settings['erpDomain'], 'realDataAllowed': False})
        private_json(credentials)
        self.compose(['--profile', 'erp', 'run', '--rm', '--no-deps', '-T', '--user', '0:0',
                      '--volume', str(credentials) + ':/run/knaba-prototype-input.json:ro',
                      '--volume', str(self.release() / 'ops/customer/prototype-seed.mts') + ':/app/scripts/customer-prototype.mts:ro',
                      'api', 'node', '--import', 'tsx', 'scripts/customer-prototype.mts'], timeout=600)
        self.meta['prototypeSeeded'] = True
        self.meta['erpActive'] = True
        self.save()

    def resume(self, expected):
        journal_path = self.root / 'operation.pending.json'
        require(journal_path.exists() and expected == self.meta.get('currentSha'), 'Resume requires pending journal and exact current SHA.')
        journal = private_json(journal_path)
        require(journal.get('candidateSha') == expected, 'Candidate identity mismatch.')
        preflight(self.root, self.settings, existing=True)
        verify_release(self.release())
        erp_env = read_env(self.root / 'config/erp.env')
        erp_env['GIT_SHA'] = expected
        atomic_write(self.root / 'config/erp.env', env_text(erp_env))
        self.site_command(['/app/vps/manage.mjs', 'migrate'])
        self.site_command(['/app/vps/manage.mjs', 'audit'])
        if journal.get('prepareErp') or self.meta.get('erpActive'):
            self.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'postgres'])
            self.meta['postgresInitialized'] = True
            self.save()
            self.compose(['--profile', 'erp', 'run', '--rm', '-T', 'migrate'], timeout=600)
        if self.settings['mode'] == 'prototype' and not self.meta.get('prototypeSeeded'):
            self.prepare_prototype()
        self.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'site'])
        if self.meta.get('erpActive'):
            self.compose(['--profile', 'erp', 'up', '-d', '--wait', '--wait-timeout', '180', 'api', 'worker'])
        if self.settings['proxyMode'] == 'standalone':
            self.compose(['--profile', 'standalone-tls', 'up', '-d', '--no-deps', 'proxy'])
        result = self.verify()
        require(result['status'] == 'PASS_IN_SCOPE', 'Resume checks failed; pending journal retained.')
        self.meta['previousSha'] = journal.get('previousSha')
        self.meta['previousBackup'] = journal.get('backup')
        self.meta.pop('operationState', None)
        self.save()
        journal_path.unlink()
        return result

    def restart(self, scopes=('site', 'erp')):
        if 'site' in scopes:
            self.compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '120', 'site'])
        if 'erp' in scopes and self.meta.get('erpActive'):
            self.compose(['--profile', 'erp', 'up', '-d', '--force-recreate', '--wait', '--wait-timeout', '180', 'api', 'worker'])

    def apply_configuration(self, changed, scopes, *, approval=None):
        require(not any((self.root / name).exists() for name in
                        ['operation.pending.json', 'owner-maintenance.pending.json', 'configuration.pending.json']),
                'Another operation is pending recovery.')
        require(set(changed) <= {'site.env', 'erp.env', 'settings.json'}, 'Only allowlisted private configuration files may change.')
        verify_release(self.release())
        tag = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + secrets.token_hex(4)
        history = self.root / 'config-history'
        no_symlink_components(history); history.mkdir(mode=0o700, exist_ok=True)
        folder = history / tag; folder.mkdir(mode=0o700)
        records = {}
        for name in changed:
            content = (self.root / 'config' / name).read_bytes()
            atomic_write(folder / name, content)
            records[name] = digest_file(folder / name)
        receipt = {'installId': self.meta['installId'], 'createdAt': utc(), 'files': records,
                   'scopes': list(scopes), 'operatorApproval': approval or {}, 'independentProviderAcceptance': 'NOT_RUN'}
        write_json(folder / 'change.json', receipt)
        journal = self.root / 'configuration.pending.json'
        write_json(journal, {'history': tag, 'startedAt': utc()})
        try:
            if 'site' in scopes:
                self.compose(['stop', 'site'])
            if 'erp' in scopes and self.meta.get('erpActive'):
                self.compose(['stop', 'api', 'worker'])
            for name, content in changed.items():
                atomic_write(self.root / 'config' / name, content)
            if 'erp' in scopes:
                require(self.meta.get('postgresInitialized'), 'Prepare ERP image and database before configuring ERP providers.')
                self.compose(['--profile', 'erp', 'run', '--rm', '--no-deps', '-T', 'api', 'node', 'scripts/environment-check.mjs'])
                self.compose(['--profile', 'erp', 'run', '--rm', '--no-deps', '-T', 'api', 'node', '--import', 'tsx', '-e',
                              "import('./apps/worker/main.ts').then(m=>{m.workerOptions(process.env);console.log('PROVIDER_CONFIGURATION_VALIDATED_NO_SEND')})"])
            self.restart(scopes)
            self.settings = private_json(self.root / 'config/settings.json')
            journal.unlink()
            return {'status': 'CONFIGURATION_APPLIED', 'sourceSha': self.meta['currentSha'], 'scopes': list(scopes),
                    'privateConfigBackup': str(folder), 'liveProviderDelivery': 'NOT_RUN', 'operatorApprovalRecorded': bool(approval)}
        except Exception:
            self.recover_configuration()
            raise

    def recover_configuration(self):
        journal = self.root / 'configuration.pending.json'
        require(journal.exists(), 'No interrupted configuration journal.')
        entry = private_json(journal)
        require(re.fullmatch(r'[0-9]{8}T[0-9]{6}-[a-f0-9]{8}', entry.get('history', '')), 'Invalid configuration history reference.')
        folder = self.root / 'config-history' / entry['history']
        receipt = private_json(folder / 'change.json')
        require(receipt.get('installId') == self.meta['installId'] and set(receipt.get('files', {})) <= {'site.env', 'erp.env', 'settings.json'},
                'Configuration recovery identity mismatch.')
        for name, digest in receipt['files'].items():
            require(digest_file(folder / name) == digest, 'Configuration backup checksum mismatch.')
        scopes = receipt['scopes']
        require(isinstance(scopes, list) and set(scopes) <= {'site', 'erp'}, 'Invalid configuration recovery scope.')
        if 'site' in scopes:
            self.compose(['stop', 'site'])
        if 'erp' in scopes and self.meta.get('erpActive'):
            self.compose(['stop', 'api', 'worker'])
        for name in receipt['files']:
            atomic_write(self.root / 'config' / name, (folder / name).read_bytes())
        self.settings = private_json(self.root / 'config/settings.json')
        self.restart(scopes)
        journal.unlink()
        return {'status': 'PRIVATE_CONFIGURATION_RESTORED', 'customerDataRestored': False}

    def release_config(self, input_path):
        raw = private_json(input_path)
        require(isinstance(raw, dict) and bool(raw) and set(raw) <= RELEASE_KEYS and all(isinstance(x, str) for x in raw.values()),
                'Release configuration accepts only documented public metadata keys.')
        env_text(raw)
        site = read_env(self.root / 'config/site.env'); site.update(raw)
        settings = dict(self.settings); settings['releaseConfig'] = {**settings['releaseConfig'], **raw}
        result = self.apply_configuration({'site.env': env_text(site), 'settings.json': json.dumps(settings, sort_keys=True, indent=2) + '\n'}, ['site'])
        result['updatedKeys'] = sorted(raw)
        return result

    def provider_config(self, args):
        site, erp, approval = validate_provider_input(private_json(args.input), self.settings['mode'],
            enable_live_send=args.enable_live_send, enable_paid_ai=args.enable_paid_ai)
        changed, scopes = {}, []
        if site:
            values = read_env(self.root / 'config/site.env'); values.update(site)
            require(bool(values.get('TURNSTILE_SITE_KEY')) == bool(values.get('TURNSTILE_SECRET_KEY')),
                    'Turnstile site and secret keys must be configured together.')
            require(bool(values.get('KNABA_GOOGLE_CLIENT_ID')) == bool(values.get('KNABA_GOOGLE_CLIENT_SECRET')),
                    'Google OIDC ID and secret must be configured together.')
            microsoft = [bool(values.get(key)) for key in ['KNABA_MICROSOFT_TENANT_ID', 'KNABA_MICROSOFT_CLIENT_ID', 'KNABA_MICROSOFT_CLIENT_SECRET']]
            require(not any(microsoft) or all(microsoft), 'Microsoft OIDC requires tenant, client ID and secret together.')
            changed['site.env'] = env_text(values); scopes.append('site')
        if erp:
            values = read_env(self.root / 'config/erp.env'); values.update(erp)
            changed['erp.env'] = env_text(values); scopes.append('erp')
        result = self.apply_configuration(changed, scopes, approval=approval)
        result['updatedKeys'] = sorted([*site, *erp])
        result['externalChecks'] = 'Run ops/customer/provider_check.py; configuration does not prove provider acceptance.'
        return result

def configure(root, settings, runtime_uid, runtime_gid):
    if root.exists() and (root / MARKER).exists():
        load_install(root)
        require(private_json(root / 'config/settings.json') == settings, 'Settings differ. Use explicit owner/domain maintenance; secrets are not regenerated.')
        return {'status': 'UNCHANGED', 'root': str(root)}
    require(not root.exists() or not any(root.iterdir()), 'Existing unmarked directory detected; refusing overwrite/adoption.')
    root.mkdir(parents=True, mode=0o750, exist_ok=True)
    for name in ['config', 'releases', 'state', 'state/site', 'state/site/backups', 'state/erp-private', 'backups']:
        (root / name).mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chown(root / 'state/site', runtime_uid, runtime_gid)
    os.chown(root / 'state/site/backups', runtime_uid, runtime_gid)
    os.chown(root / 'state/erp-private', 1000, 1000)  # existing ERP image runs as node:node
    install_id = uuid.uuid4().hex
    password = secrets.token_hex(32)
    site_env = {'NODE_ENV': 'production', 'PORT': '8080', 'OWNER_EMAIL': settings['ownerEmail'],
                'KNABA_DEVELOPER_EMAIL': settings['developerEmail'], 'KNABA_PUBLIC_HOST': settings['siteDomain'],
                'KNABA_PUBLIC_ORIGIN': 'https://' + settings['siteDomain'], 'KNABA_DB_PATH': '/var/lib/knaba/site.sqlite',
                'KNABA_BACKUP_DIR': '/var/lib/knaba/backups', 'KNABA_LOCAL_TEST': '0',
                'KNABA_RELEASE_STAGE': 'prototype' if settings['mode'] == 'prototype' else 'production',
                'KNABA_ERP_PUBLIC_ORIGIN': 'https://' + settings['erpDomain'], **settings['releaseConfig']}
    erp_env = {'APP_MODE': 'TEST' if settings['mode'] == 'prototype' else 'PRODUCTION', 'COMPANY_ID': settings['companyId'], 'NODE_ENV': 'production', 'PORT': '3000',
               'DATABASE_URL': 'postgresql://knaba:' + password + '@postgres:5432/knaba',
               'AUTH_ENCRYPTION_KEY': secrets.token_hex(32), 'PUBLIC_ORIGIN': 'https://' + settings['erpDomain'],
               'BOT_WEBSITE_ORIGIN': 'https://' + settings['siteDomain'],
               'WIDGET_ALLOWED_ORIGINS': 'https://' + settings['siteDomain'], 'AI_SYNTHETIC_ONLY': 'true',
               'LIVE_SEND_ALLOWED': 'false', 'WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED': 'false',
               'GIT_SHA': ''}
    compose_env = {'COMPOSE_PROJECT_NAME': 'knaba-customer-' + install_id[:12], 'KNABA_ROOT': str(root),
                   'KNABA_RUNTIME_UID': str(runtime_uid), 'KNABA_RUNTIME_GID': str(runtime_gid),
                   'KNABA_SITE_PORT': str(settings['sitePort']), 'KNABA_ERP_PORT': str(settings['erpPort'])}
    for name, values in [('site.env', site_env), ('erp.env', erp_env),
                         ('postgres.env', {'POSTGRES_USER': 'knaba', 'POSTGRES_DB': 'knaba', 'POSTGRES_PASSWORD': password}),
                         ('backup.env', {'BACKUP_PASSPHRASE': secrets.token_hex(32), 'BACKUP_PRIVATE_STORAGE_DIR': '/app/private',
                                         'KNABA_PG_TRANSPORT': 'native', 'BACKUP_DIR': '/backups'}),
                         ('compose.env', compose_env)]:
        atomic_write(root / 'config' / name, env_text(values))
    # No access log directive: request query tokens and personal paths are not logged by this template.
    caddy = ('{\n  email ' + settings['ownerEmail'] + '\n}\n' + settings['siteDomain'] +
             ' {\n  reverse_proxy site:8080\n}\n' + settings['erpDomain'] +
             ' {\n  reverse_proxy api:3000\n}\n')
    atomic_write(root / 'config/Caddyfile', caddy)
    write_json(root / 'config/settings.json', settings)
    write_json(root / MARKER, {'schemaVersion': SCHEMA, 'product': 'KNABA_CUSTOMER', 'root': str(root),
                              'installId': install_id, 'projectName': compose_env['COMPOSE_PROJECT_NAME'],
                              'runtimeUid': runtime_uid, 'runtimeGid': runtime_gid, 'createdAt': utc(), 'currentSha': None,
                              'postgresInitialized': False, 'erpActive': False, 'mode': settings['mode'], 'realDataAllowed': settings['mode'] == 'production'})
    return {'status': 'CONFIGURED_NO_DEPLOY', 'root': str(root), 'mode': erp_env['APP_MODE'], 'syntheticSeed': False}

def runtime_user(uid=None, gid=None):
    if uid is not None or gid is not None:
        require(type(uid) is int and type(gid) is int and uid > 0 and gid > 0,
                'An explicit existing non-root UID and its primary GID are required together.')
        try:
            existing = pwd.getpwuid(uid)
        except KeyError as exc:
            raise OperatorError('Explicit runtime UID does not exist on this server.') from exc
        require(existing.pw_gid == gid, 'Explicit runtime GID must be the selected existing user primary group.')
        return uid, gid
    try:
        user = pwd.getpwnam('knaba-customer')
        require(user.pw_shell in ['/usr/sbin/nologin', '/sbin/nologin', '/bin/false'], 'Existing knaba-customer account has interactive access; review before reuse.')
    except KeyError:
        run(['useradd', '--system', '--user-group', '--no-create-home', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', 'knaba-customer'])
        user = pwd.getpwnam('knaba-customer')
    return user.pw_uid, user.pw_gid

def install_or_update(args):
    root = root_for_write(args.root)
    manifest = archive_manifest(Path(args.archive), args.sha256)
    fresh = not (root / MARKER).exists()
    if fresh:
        require(args.command == 'install' and args.settings, 'New install requires a private --settings JSON file.')
        raw_settings = private_json(args.settings)
        raw_settings['mode'] = args.mode
        require(args.mode != 'prototype' or args.synthetic_only, 'Prototype requires explicit --synthetic-only acknowledgement.')
        settings = normalize_settings(raw_settings)
        require(not root.exists() or not any(root.iterdir()), 'Target exists without this installer marker; refusing overwrite.')
        preflight(root, settings)
        uid, gid = runtime_user(getattr(args, 'runtime_uid', None), getattr(args, 'runtime_gid', None))
        configure(root, settings, uid, gid)
    app = Installation(root)
    require(app.settings['mode'] == args.mode, 'Changing prototype/production mode in place is forbidden; use a separate installation and reviewed data migration.')
    if args.mode == 'prototype':
        require(args.synthetic_only, 'Prototype requires --synthetic-only.')
        args.prepare_erp = True
    with lock(root):
        require(not (root / 'operation.pending.json').exists() and not (root / 'owner-maintenance.pending.json').exists() and
                not (root / 'configuration.pending.json').exists(),
                'Interrupted operation detected. Inspect private pending journal and recover before continuing.')
        preflight(root, app.settings, existing=not fresh)
        old = app.meta.get('currentSha')
        if old == manifest['sourceSha']:
            verify_release(app.release())
            return {'status': 'UNCHANGED', 'sourceSha': old, 'message': 'No migration, reseed, key rotation or restart performed.'}
        if old:
            require(args.command == 'update' and args.expect_current == old, 'Update needs --expect-current with the exact installed SHA.')
        manifest = stage(root, Path(args.archive), args.sha256)
        new = manifest['sourceSha']
        # Pull/build before stopping live application. No package manager runs on the host.
        app.compose(['pull', 'site', 'postgres'], sha=new, timeout=600)
        if args.prepare_erp or app.meta.get('erpActive'):
            app.compose(['--profile', 'erp', 'build', 'api'], sha=new, timeout=3600)
            if app.settings['mode'] == 'production':
                app.compose(['--profile', 'erp', 'build', 'backup'], sha=new, timeout=1800)
        if app.settings['proxyMode'] == 'standalone':
            app.compose(['--profile', 'standalone-tls', 'pull', 'proxy'], sha=new, timeout=600)
        require(storage_report(root)['cutoverAllowed'], 'Storage gate failed after staging/build; no application stopped or migrated.')
        backup = None
        if old:
            app.compose(['stop', 'site', 'api', 'worker'])
            try:
                backup = app.backup()
            except Exception:
                app.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'site'])
                if app.meta.get('erpActive'):
                    app.compose(['--profile', 'erp', 'up', '-d', '--wait', '--wait-timeout', '180', 'api', 'worker'])
                raise
        journal = root / 'operation.pending.json'
        write_json(journal, {'startedAt': utc(), 'previousSha': old, 'candidateSha': new,
                             'backup': backup.name if backup else None, 'prepareErp': args.prepare_erp, 'phase': 'BEFORE_MIGRATION'})
        app.set_current(new)
        erp_env = read_env(root / 'config/erp.env'); erp_env['GIT_SHA'] = new
        atomic_write(root / 'config/erp.env', env_text(erp_env))
        try:
            app.site_command(['/app/vps/manage.mjs', 'migrate'])
            app.site_command(['/app/vps/manage.mjs', 'audit'])
            if args.prepare_erp or app.meta.get('erpActive'):
                app.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'postgres'])
                app.meta['postgresInitialized'] = True; app.save()
                app.compose(['--profile', 'erp', 'run', '--rm', '-T', 'migrate'], timeout=600)
                if app.settings['mode'] == 'prototype' and not app.meta.get('prototypeSeeded'):
                    app.prepare_prototype()
            app.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'site'])
            if app.meta.get('erpActive'):
                app.compose(['--profile', 'erp', 'up', '-d', '--wait', '--wait-timeout', '180', 'api', 'worker'])
            if app.settings['proxyMode'] == 'standalone':
                app.compose(['--profile', 'standalone-tls', 'up', '-d', '--no-deps', 'proxy'])
            result = app.verify()
            require(result['status'] == 'PASS_IN_SCOPE', 'Post-deployment verification failed; services held for paired rollback.')
            app.meta['previousSha'] = old
            app.meta['previousBackup'] = backup.name if backup else None
            app.save()
            journal.unlink()
            write_json(root / 'last-verification.json', result)
            return {'status': 'DEPLOYED_PROTOTYPE', 'sourceSha': new, 'backup': backup.name if backup else None,
                    'siteUrl': 'https://' + app.settings['siteDomain'], 'erpActive': app.meta.get('erpActive', False),
                    'ownerActivation': 'Run owner-invite and complete private invitation.', 'fullProductReady': False}
        except Exception:
            # Never run old code against a new incompatible schema or delete new writes automatically.
            app.compose(['stop', 'site', 'api', 'worker'])
            app.meta['operationState'] = 'RECOVERY_REQUIRED'; app.save()
            raise OperatorError('Deployment stopped safely. Private operation.pending.json retains old SHA and verified backup. Run recover; no volumes or customer data were deleted.')

def recover(app, args):
    pending = app.root / 'operation.pending.json'
    require(pending.exists(), 'No interrupted deployment journal.')
    journal = private_json(pending)
    old = journal.get('previousSha')
    require(old and SHA.fullmatch(old) and journal.get('backup'), 'Fresh-install recovery has no predecessor. Fix prerequisites and explicitly resume after reviewing preserved state.')
    require(args.expect_current == app.meta.get('currentSha') and args.accept_data_rollback,
            'Recovery requires exact --expect-current and --accept-data-rollback; later writes may be replaced.')
    folder = app.root / 'backups' / journal['backup']
    report = private_json(folder / 'backup.json')
    require(report.get('installId') == app.meta['installId'] and report.get('sourceSha') == old, 'Backup/source installation mismatch.')
    require('erp.tar.enc' not in report['files'],
            'Production ERP recovery requires the canonical empty-destination restore with an independent current erasure ledger. Source database and journal are preserved; see the runbook.')
    if 'postgres.dump' in report['files']:
        require(app.settings['mode'] == 'prototype' and report.get('prototypePrivacyHistoryEmpty') is True,
                'Automatic PostgreSQL data rollback is limited to explicitly synthetic installations without privacy history.')
    for name, digest in report['files'].items():
        require(digest_file(folder / name) == digest, 'Recovery backup checksum mismatch.')
    verify_release(app.release(old))
    app.compose(['stop', 'site', 'api', 'worker'])
    # Preserve the failed state before restoring. It is never silently discarded.
    failed_backup = app.backup()
    if 'postgres.dump' in report['files']:
        app.compose(['exec', '-T', 'postgres', 'psql', '-U', 'knaba', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
                     'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=\'knaba\' AND pid<>pg_backend_pid();'])
        app.compose(['exec', '-T', 'postgres', 'dropdb', '-U', 'knaba', '--if-exists', 'knaba'])
        app.compose(['exec', '-T', 'postgres', 'createdb', '-U', 'knaba', 'knaba'])
        app.compose(['exec', '-T', 'postgres', 'pg_restore', '-U', 'knaba', '-d', 'knaba', '--exit-on-error', '--single-transaction'],
                    data=(folder / 'postgres.dump').read_bytes(), timeout=600)
    app.restore_site(folder)
    for name in ['erp.env', 'postgres.env', 'compose.env', 'Caddyfile', 'backup.env']:
        if name in report['files']:
            atomic_write(app.root / 'config' / name, (folder / name).read_bytes())
    blobs = app.root / 'state/erp-private'
    if (folder / 'erp-private').is_dir():
        if blobs.exists():
            blobs.rename(blobs.with_name('erp-private-failed-' + secrets.token_hex(4)))
        shutil.copytree(folder / 'erp-private', blobs)
        for directory, dirs, files in os.walk(blobs):
            os.chown(directory, 1000, 1000)
            for name in files:
                os.chown(Path(directory) / name, 1000, 1000)
    app.set_current(old)
    app.meta['erpActive'] = report.get('erpActive', False)
    app.meta.pop('operationState', None); app.save()
    app.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'site'])
    if app.meta['erpActive']:
        app.compose(['--profile', 'erp', 'up', '-d', '--wait', '--wait-timeout', '180', 'api', 'worker'])
    result = app.verify()
    require(result['status'] == 'PASS_IN_SCOPE', 'Restored application verification failed; journal retained.')
    pending.unlink()
    return {'status': 'RESTORED_PREVIOUS_RELEASE', 'sourceSha': old, 'failedStatePreserved': failed_backup.name, 'verification': result}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default=str(DEFAULT_ROOT), help='Dedicated /srv/knaba/<installation>; never /srv/knaba/vps')
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('inventory'); p.add_argument('--scan', action='append', default=None)
    p = sub.add_parser('preflight'); p.add_argument('--settings')
    p = sub.add_parser('package'); p.add_argument('--source', default=str(SOURCE_ROOT)); p.add_argument('--output', required=True)
    p = sub.add_parser('inspect-archive'); p.add_argument('--archive', required=True); p.add_argument('--sha256', required=True)
    for command in ['install', 'update']:
        p = sub.add_parser(command); p.add_argument('--archive', required=True); p.add_argument('--sha256', required=True)
        p.add_argument('--settings'); p.add_argument('--expect-current'); p.add_argument('--prepare-erp', action='store_true')
        p.add_argument('--mode', choices=['production', 'prototype'], default='production'); p.add_argument('--synthetic-only', action='store_true')
        p.add_argument('--runtime-uid', type=int); p.add_argument('--runtime-gid', type=int)
    p = sub.add_parser('verify'); p.add_argument('--require-erp', action='store_true')
    p.add_argument('--public-https', action='store_true'); p.add_argument('--require-owner', action='store_true')
    p.add_argument('--require-public-forms', action='store_true')
    sub.add_parser('backup')
    sub.add_parser('restart')
    sub.add_parser('recover-config')
    p = sub.add_parser('release-config'); p.add_argument('--input', required=True)
    p = sub.add_parser('provider-config'); p.add_argument('--input', required=True)
    p.add_argument('--enable-live-send', action='store_true'); p.add_argument('--enable-paid-ai', action='store_true')
    sub.add_parser('owner-invite')
    sub.add_parser('developer-invite')
    sub.add_parser('recover-owner')
    p = sub.add_parser('site-import'); p.add_argument('--input', required=True); p.add_argument('--sha256', required=True)
    p = sub.add_parser('resume'); p.add_argument('--expect-current', required=True)
    p = sub.add_parser('owner-update'); p.add_argument('--input', required=True)
    for command in ['recover', 'rollback']:
        p = sub.add_parser(command); p.add_argument('--expect-current', required=True); p.add_argument('--accept-data-rollback', action='store_true')
    p = sub.add_parser('erp-bootstrap-owner'); p.add_argument('--input', required=True)
    sub.add_parser('erp-activate')
    args = parser.parse_args()
    root = Path(args.root).absolute()
    if args.command == 'inventory':
        emit(inventory(args.scan or ['/srv/knaba', '/opt/knaba'])); return 0
    if args.command == 'package':
        emit(package(Path(args.source).absolute(), Path(args.output).absolute())); return 0
    if args.command == 'inspect-archive':
        m = archive_manifest(Path(args.archive), args.sha256)
        emit({'status': 'PASS', 'sourceSha': m['sourceSha'], 'files': len(m['files'])}); return 0
    if args.command == 'preflight':
        settings = normalize_settings(private_json(args.settings)) if args.settings else None
        emit(preflight(root, settings, (root / MARKER).exists())); return 0
    if args.command in ['install', 'update']:
        emit(install_or_update(args)); return 0
    root_for_write(root)  # all remaining commands inspect private customer state
    app = Installation(root)
    with lock(root):
        require(args.command in ['verify', 'recover-config'] or not (root / 'configuration.pending.json').exists(),
                'Interrupted configuration update: run recover-config before another mutation.')
        if args.command == 'verify':
            result = app.verify(args.require_erp, args.public_https, args.require_owner, args.require_public_forms)
            emit(result); return 0 if result['status'] == 'PASS_IN_SCOPE' else 2
        if args.command == 'recover-config':
            emit(app.recover_configuration()); return 0
        if args.command == 'release-config':
            emit(app.release_config(args.input)); return 0
        if args.command == 'provider-config':
            emit(app.provider_config(args)); return 0
        if args.command == 'restart':
            require(not (root / 'operation.pending.json').exists() and not (root / 'owner-maintenance.pending.json').exists(),
                    'Recovery is pending; unsafe restart refused.')
            verify_release(app.release())
            app.restart(); emit(app.verify()); return 0
        if args.command == 'backup':
            # Freeze only this install's application writers for a cross-store backup.
            app.compose(['stop', 'site', 'api', 'worker'])
            try:
                folder = app.backup()
            finally:
                app.compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'site'])
                if app.meta.get('erpActive'):
                    app.compose(['--profile', 'erp', 'up', '-d', '--wait', '--wait-timeout', '180', 'api', 'worker'])
            emit({'status': 'BACKED_UP', 'privateBackup': str(folder), 'offHostCopy': 'NOT_RUN'}); return 0
        if args.command in ['owner-invite', 'developer-invite']:
            require(not (root / 'operation.pending.json').exists(), 'Deployment recovery is pending.')
            result = app.site_command(['/app/vps/manage.mjs', 'invite-owner' if args.command == 'owner-invite' else 'invite-developer'])
            metadata = json.loads(result)
            # The existing CLI prints only path/expiry, never the bearer invitation.
            if metadata.get('secretFile', '').startswith('/var/lib/knaba/'):
                metadata['secretFile'] = str(root / 'state/site' / metadata['secretFile'][len('/var/lib/knaba/'):])
            emit(metadata); return 0
        if args.command == 'resume':
            emit(app.resume(args.expect_current)); return 0
        if args.command == 'recover-owner':
            emit(app.recover_owner()); return 0
        if args.command == 'site-import':
            emit(app.import_site(Path(args.input), args.sha256)); return 0
        if args.command == 'owner-update':
            emit(app.owner_update(args.input)); return 0
        if args.command == 'rollback':
            require(not (root / 'operation.pending.json').exists() and app.meta.get('previousSha') and app.meta.get('previousBackup'), 'No verified previous release or another recovery is pending.')
            require(args.expect_current == app.meta.get('currentSha') and args.accept_data_rollback, 'Rollback requires exact current SHA and --accept-data-rollback.')
            write_json(root / 'operation.pending.json', {'previousSha': app.meta['previousSha'], 'candidateSha': app.meta['currentSha'], 'backup': app.meta['previousBackup'], 'startedAt': utc(), 'phase': 'EXPLICIT_PAIRED_ROLLBACK'})
        if args.command in ['recover', 'rollback']:
            emit(recover(app, args)); return 0
        if args.command == 'erp-bootstrap-owner':
            path = no_symlink_components(args.input)
            private_json(path)
            require(app.settings['mode'] == 'production', 'Real owner bootstrap is forbidden in synthetic prototype.')
            require(app.meta.get('postgresInitialized') and not app.meta.get('erpActive'), 'Prepare ERP first; running ERP cannot be bootstrapped.')
            app.compose(['--profile', 'erp', 'run', '--rm', '--no-deps', '-T', '--user', '0:0',
                         '--volume', str(path) + ':/run/knaba-owner.json:ro', 'api',
                         'node', '--import', 'tsx', 'scripts/bootstrap-owner.mts', '/run/knaba-owner.json'])
            emit({'status': 'OWNER_BOOTSTRAP_EXECUTED', 'productionRetention': 'REQUIRES_APPROVED_EXISTING_MATRIX', 'erpActive': False}); return 0
        if args.command == 'erp-activate':
            require(app.meta.get('postgresInitialized'), 'Run install/update --prepare-erp first.')
            # Existing production startup validation is authoritative, including real retention approvals.
            app.compose(['--profile', 'erp', 'up', '-d', '--wait', '--wait-timeout', '180', 'api', 'worker'])
            app.meta['erpActive'] = True; app.save()
            result = app.verify(True); emit(result); return 0 if result['status'] == 'PASS_IN_SCOPE' else 2
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OperatorError, OSError, ValueError, KeyError, tarfile.TarError) as exc:
        print('KNABA_OPERATOR_ERROR: ' + str(exc), file=sys.stderr)
        sys.exit(2)
