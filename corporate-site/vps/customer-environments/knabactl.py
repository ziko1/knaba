#!/usr/bin/env python3
"""KNABA-only environment operator. No DNS, account transfer, or automatic production push.

Run on the authorized physical host as root. Defaults are intentionally fixed to
KNABA, so a mistaken invocation cannot become an operation on the developer VPS.
The initial deployment clones the restored bytes/data without altering that source.
Production promotion requires a separate, private, exact-artifact approval receipt.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import sqlite3
import stat
import subprocess
import sys
import time
from urllib.parse import urlsplit

ROOT = Path('/srv/knaba/customer')
SOURCE = Path('/srv/knaba/restored-preview-20261028')
SOURCE_CONTAINER = 'knaba-physical-preview'
HOSTS = {'production': 'knaba.de', 'testing': 'testing.knaba.de'}
PORTS = {'production': 19120, 'testing': 19121}
USERS = {'production': 'knaba-prod', 'testing': 'knaba-test'}
CONTAINERS = {'production': 'knaba-customer-prod', 'testing': 'knaba-customer-test'}
HEX64 = re.compile(r'^[0-9a-f]{64}$')
PARTS = ('dist', 'vps', 'drizzle', 'package.json')


class Refused(RuntimeError):
    pass


def require(condition, reason):
    if not condition:
        raise Refused(reason)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(argv, *, timeout=90, stdin=None):
    # Never print arbitrary command output: env-file or an application error may contain secrets.
    p = subprocess.run(argv, input=stdin, text=True, capture_output=True, timeout=timeout)
    require(p.returncode == 0, f'Command failed: {Path(argv[0]).name} (exit {p.returncode}); inspect private server logs.')
    return p.stdout


def regular(path):
    s = Path(path).lstat()
    require(stat.S_ISREG(s.st_mode), f'Expected regular file: {path}')
    return s


def no_symlink_ancestors(path):
    p = Path(path).absolute()
    for parent in (p, *p.parents):
        if parent.exists() or parent.is_symlink():
            require(not parent.is_symlink(), f'Symlink not allowed: {parent}')


def manifest(directory):
    directory = Path(directory)
    no_symlink_ancestors(directory)
    require(directory.is_dir(), 'Missing release directory.')
    require(sorted(p.name for p in directory.iterdir()) == sorted(PARTS),
            'Release must contain only dist/, vps/, drizzle/, package.json; no config or state.')
    result = {}
    for item in sorted(directory.rglob('*')):
        meta = item.lstat()
        require(not stat.S_ISLNK(meta.st_mode), 'Release symlinks are forbidden.')
        if stat.S_ISDIR(meta.st_mode):
            continue
        require(stat.S_ISREG(meta.st_mode) and meta.st_size <= 64 * 1024 * 1024,
                'Unexpected artifact file type or size.')
        before = (meta.st_ino, meta.st_size, meta.st_mtime_ns, meta.st_ctime_ns)
        digest = sha(item)
        after = item.lstat()
        require(before == (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                'Artifact changed while being hashed.')
        result[item.relative_to(directory).as_posix()] = {'sha256': digest, 'bytes': meta.st_size}
    require(0 < len(result) <= 10000, 'Unexpected artifact file count.')
    for required in ('dist/client/index.html', 'dist/server/index.js', 'dist/vps/render-page.mjs',
                     'vps/server.mjs', 'vps/manage.mjs', 'drizzle/meta/_journal.json', 'package.json'):
        require(required in result, f'Missing runtime artifact: {required}')
    return result


def artifact_id(files):
    return hashlib.sha256(canonical(files)).hexdigest()


def schema_manifest(files):
    return {k: v for k, v in files.items() if k.startswith('drizzle/')}


def read_env_identity(path):
    """Copy only existing operator identity bindings, never developer-owned provider credentials."""
    regular(path)
    values = {}
    for line in Path(path).read_text().splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        key, value = line.split('=', 1)
        if key in ('OWNER_EMAIL', 'KNABA_DEVELOPER_EMAIL'):
            require(key not in values, 'Duplicate operator identity setting.')
            # Preserve the dotenv literal exactly, including optional quotes.
            require('\x00' not in value and '\r' not in value and len(value) < 500, 'Invalid identity value.')
            values[key] = value
    return ''.join(f'{k}={v}\n' for k, v in values.items())


def private_write(path, value, mode=0o600, *, replace=False):
    path = Path(path)
    no_symlink_ancestors(path.parent)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
    temp = path.with_name(path.name + f'.new-{os.getpid()}')
    require(replace or not (path.exists() or path.is_symlink()), f'Refusing to overwrite {path}')
    fd = os.open(temp, flags, mode)
    try:
        with os.fdopen(fd, 'w') as output:
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
        if replace:
            os.replace(temp, path)
        else:
            # Atomic, no-clobber publication.
            os.link(temp, path)
            temp.unlink()
        os.chmod(path, mode)
    finally:
        if temp.exists():
            temp.unlink()


def write_json(path, value, **kwargs):
    private_write(path, json.dumps(value, indent=2, ensure_ascii=False) + '\n', **kwargs)


def database_snapshot(source, target):
    """SQLite online backup: never copy an open database/WAL pair."""
    regular(source)
    no_symlink_ancestors(source)
    no_symlink_ancestors(Path(target).parent)
    require(not Path(target).exists(), 'Backup target already exists.')
    with contextlib.closing(sqlite3.connect(Path(source).as_uri() + '?mode=ro', uri=True, timeout=20)) as src:
        with contextlib.closing(sqlite3.connect(target)) as dst:
            src.backup(dst, pages=256, sleep=0.05)
            require(dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'Backup integrity failed.')
            require(not dst.execute('PRAGMA foreign_key_check').fetchall(), 'Backup foreign-key check failed.')
    os.chmod(target, 0o600)
    with open(target, 'rb') as stream:
        os.fsync(stream.fileno())
    return {'path': str(target), 'sha256': sha(target), 'bytes': Path(target).stat().st_size,
            'integrity': 'ok', 'foreign_key_errors': 0}


def ensure_user(name):
    try:
        account = pwd.getpwnam(name)
        require(account.pw_shell in ('/usr/sbin/nologin', '/sbin/nologin', '/bin/false'),
                'An existing runtime account has interactive access; review before reuse.')
    except KeyError:
        run(['useradd', '--system', '--user-group', '--no-create-home', '--home-dir', '/nonexistent',
             '--shell', '/usr/sbin/nologin', name])
        account = pwd.getpwnam(name)
    require(account.pw_uid > 0 and account.pw_gid > 0, 'Root runtime user is forbidden.')
    return account.pw_uid, account.pw_gid


def compose_document(environment, image, uid, gid, root=ROOT):
    require(environment in HOSTS, 'Unknown environment.')
    require(bool(re.fullmatch(r'sha256:[0-9a-f]{64}', image)), 'Pin the exact already available runtime image ID.')
    require(uid > 0 and gid > 0, 'A non-root runtime identity is required.')
    envroot = Path(root) / environment
    common = {'image': image, 'pull_policy': 'never', 'user': f'{uid}:{gid}', 'init': True,
              'read_only': True, 'restart': 'unless-stopped', 'pids_limit': 96,
              'mem_limit': '512m', 'cpus': 1.0, 'cap_drop': ['ALL'],
              'security_opt': ['no-new-privileges:true'], 'tmpfs': ['/tmp:size=16m,mode=1777'],
              'logging': {'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '3'}}}
    env = {'NODE_ENV': 'production', 'PORT': '8080', 'KNABA_PUBLIC_HOST': HOSTS[environment],
           'KNABA_PUBLIC_ORIGIN': 'https://' + HOSTS[environment], 'KNABA_LOCAL_TEST': '0',
           'KNABA_DB_PATH': '/var/lib/knaba/site.sqlite', 'KNABA_BACKUP_DIR': '/var/lib/knaba/backups',
           'KNABA_RELEASE_MODE': 'customer-candidate' if environment == 'production' else 'testing',
           'ASSISTANT_NOTIFICATIONS_ENABLED': '0', 'STUDIO_AI_ENABLED': '0', 'STUDIO_AI_APPROVED': '0'}
    web = {**common, 'container_name': CONTAINERS[environment], 'working_dir': '/app',
           'command': ['node', '/app/vps/server.mjs'], 'env_file': [str(envroot / 'config/site.env')],
           'environment': env,
           'volumes': [str(envroot / 'current') + ':/app:ro', str(envroot / 'state') + ':/var/lib/knaba:rw'],
           'ports': [f'127.0.0.1:{PORTS[environment]}:8080'],
           'healthcheck': {'test': ['CMD', 'node', '-e',
             "require('http').get({hostname:'127.0.0.1',port:8080,path:'/healthz',headers:{Host:process.env.KNABA_PUBLIC_HOST}},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"],
             'interval': '20s', 'timeout': '5s', 'start_period': '10s', 'retries': 3}}
    services = {'web': web}
    if environment == 'testing':
        services['preview'] = {**common, 'container_name': 'knaba-customer-test-gateway', 'mem_limit': '128m',
            'command': ['node', '/ops/preview-gateway.mjs'],
            'environment': {'KNABA_PREVIEW_HOST': HOSTS['testing'], 'KNABA_PREVIEW_BIND': '0.0.0.0',
                            'KNABA_PREVIEW_PORT': '8081', 'KNABA_PREVIEW_UPSTREAM': 'http://web:8080',
                            'KNABA_PREVIEW_AUTH_FILE': '/run/knaba-preview/access.json'},
            'volumes': [str(Path(root) / 'ops') + ':/ops:ro',
                        str(envroot / 'config/access.json') + ':/run/knaba-preview/access.json:ro'],
            'ports': ['127.0.0.1:19131:8081'], 'depends_on': {'web': {'condition': 'service_healthy'}}}
    # Distinct project networks, no connection to any existing VPS/project network.
    return {'name': 'knaba-customer-' + environment, 'services': services,
            'networks': {'default': {'name': 'knaba-customer-' + environment}}}


def host_guard():
    require(os.geteuid() == 0, 'Run with sudo on the physical KNABA host.')
    require(socket.gethostname().split('.')[0] == 'knaba', 'This operator only targets hostname knaba, never the developer VPS.')
    for p in (ROOT, SOURCE):
        no_symlink_ancestors(p)
    require(shutil.disk_usage('/srv').free >= 8 * 1024**3, 'At least 8 GiB free is required.')
    run(['docker', 'compose', 'version'])


@contextlib.contextmanager
def locked():
    ROOT.mkdir(mode=0o700, exist_ok=True)
    no_symlink_ancestors(ROOT)
    fd = os.open(ROOT / 'operation.lock', os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refused('Another KNABA environment operation is active.')
        yield


def inspect_source():
    files = manifest(SOURCE / 'release')
    value = json.loads(run(['docker', 'inspect', SOURCE_CONTAINER]))[0]
    require(value['State']['Running'], 'Restored source container is not running.')
    require(value['State'].get('Health', {}).get('Status') == 'healthy', 'Restored source is not healthy.')
    mounts = {m['Destination']: m['Source'] for m in value['Mounts']}
    require(mounts.get('/var/lib/knaba') == str(SOURCE / 'state'), 'Unexpected source state mount.')
    allowed_release_mount = (mounts.get('/app') == str(SOURCE / 'release') or
        all(mounts.get('/app/' + name) == str(SOURCE / 'release' / name) for name in PARTS))
    require(allowed_release_mount, 'Unexpected source release mount.')
    relevant_mounts = [m for m in value['Mounts'] if m['Destination'] == '/app' or m['Destination'].startswith('/app/')]
    allowed_destinations = {'/app'} if '/app' in mounts else {'/app/' + name for name in PARTS}
    require({m['Destination'] for m in relevant_mounts} == allowed_destinations and
            all(m.get('RW') is False for m in relevant_mounts),
            'Source release has a writable or overriding mount.')
    require(value['Config'].get('Cmd') == ['node', '/app/vps/server.mjs'], 'Unexpected source entry command.')
    require(value['HostConfig'].get('ReadonlyRootfs') is True, 'Source root filesystem is not read-only.')
    runtime_env = dict(item.split('=', 1) for item in value['Config'].get('Env', []) if '=' in item)
    require(runtime_env.get('KNABA_DB_PATH') == '/var/lib/knaba/site.sqlite', 'Unexpected source database path.')
    require(runtime_env.get('KNABA_STATIC_ROOT', '/app/dist/client').rstrip('/') == '/app/dist/client',
            'Unexpected source static root.')
    source_origin = urlsplit(runtime_env.get('KNABA_PUBLIC_ORIGIN', ''))
    require(source_origin.scheme == 'https' and source_origin.netloc in ('kneba.vsp.rest', 'knaba.de'),
            'Unexpected restored source origin.')
    readiness = probe(19110, source_origin.netloc, '/readyz')['status']
    require(readiness in (200, 503), 'Source readiness returned an unexpected response.')
    require(not (SOURCE / 'state/uploads').exists(), 'Uploads need a coordinated file snapshot; no deployment performed.')
    identity = read_env_identity(SOURCE / 'config/site.env')
    return {'artifact': artifact_id(files), 'files': files, 'image': value['Image'],
            'identity_env': identity, 'container_id': value['Id'], 'ready_status': readiness}


def preflight():
    host_guard()
    value = inspect_source()
    for port in (*PORTS.values(), 19131):
        with socket.socket() as s:
            require(s.connect_ex(('127.0.0.1', port)) != 0, f'Planned port {port} is already occupied.')
    return {'status': 'PREFLIGHT_ONLY', 'observed_at': now(), 'source_artifact': value['artifact'],
            'runtime_image': value['image'], 'runtime_file_count': len(value['files']),
            'source_git_provenance': 'NOT_INFERRED_FROM_IMAGE_OR_LABEL',
            'target': str(ROOT), 'customer_accounts': 'NOT_CONFIGURED', 'dns_changes': False}


def install_release(source, expected):
    require(bool(HEX64.fullmatch(expected)), 'An exact full-runtime artifact digest is required.')
    before = manifest(source)
    require(artifact_id(before) == expected, 'Source artifact differs from approved/pinned digest.')
    destination = ROOT / 'releases' / expected
    if destination.exists():
        require(manifest(destination) == before, 'Existing immutable release differs.')
        return destination
    temporary = ROOT / 'releases' / ('.stage-' + expected)
    require(not temporary.exists(), 'An interrupted staging directory needs inspection.')
    shutil.copytree(source, temporary, symlinks=True)
    require(manifest(temporary) == before and manifest(source) == before, 'Source changed during staging.')
    for entry in temporary.rglob('*'):
        os.chown(entry, 0, 0)
        os.chmod(entry, 0o555 if entry.is_dir() else 0o444)
    os.chmod(temporary, 0o555)
    temporary.rename(destination)
    write_json(ROOT / 'manifests' / (expected + '.json'), before)
    return destination


def switch(environment, target):
    pointer = ROOT / environment / 'current'
    temp = pointer.with_name('.current-' + str(os.getpid()))
    require(not temp.exists() and not temp.is_symlink(), 'Temporary release pointer already exists.')
    os.symlink(target, temp)
    os.replace(temp, pointer)


def compose(environment, *args, timeout=120):
    return run(['docker', 'compose', '-f', str(ROOT / environment / 'compose.json'), *args], timeout=timeout)


def probe(port, host, path='/healthz'):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=8)
    try:
        connection.request('GET', path, headers={'Host': host, 'X-Forwarded-Proto': 'https'})
        response = connection.getresponse()
        body = response.read(512 * 1024)
        return {'status': response.status, 'robots': response.getheader('X-Robots-Tag'), 'bytes': len(body)}
    finally:
        connection.close()


def private_backup(environment, label='scheduled'):
    directory = ROOT / 'backups' / environment
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = directory / (dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ-') + label + '.sqlite')
    return database_snapshot(ROOT / environment / 'state/site.sqlite', target)


def bootstrap(expected):
    host_guard()
    # Everything before acquiring the destination lock is read-only.
    preflight()
    value = inspect_source()
    require(value['artifact'] == expected, 'Source changed after preflight; re-inspect it.')
    gateway = Path(__file__).with_name('preview-gateway.mjs')
    regular(gateway)
    with locked():
        require(not any((ROOT / x).exists() for x in ('production', 'testing', 'installation.json')),
                'Installation already exists or was interrupted; inspect it, do not overwrite.')
        for name in ('releases', 'manifests', 'ops', 'receipts', 'backups', 'approvals'):
            (ROOT / name).mkdir(mode=0o700, exist_ok=True)
        os.chmod(ROOT / 'ops', 0o755)
        private_write(ROOT / 'ops/knabactl.py', Path(__file__).read_text(), 0o700)
        private_write(ROOT / 'ops/preview-gateway.mjs', gateway.read_text(), 0o444)
        # The Docker daemon mounts this exact file; it does not need host traversal by runtime users.
        destination = install_release(SOURCE / 'release', expected)
        report = {'started_at': now(), 'artifact': expected, 'runtime_image': value['image'],
                  'source_preserved': str(SOURCE), 'public_dns_changed': False, 'customer_account_transfer': False,
                  'production_publication': 'BLOCKED_PENDING_CUSTOMER_ACCOUNT_AND_DOMAIN_ACCEPTANCE'}
        try:
            for environment in ('production', 'testing'):
                uid, gid = ensure_user(USERS[environment])
                directory = ROOT / environment
                directory.mkdir(mode=0o700)
                (directory / 'config').mkdir(mode=0o700)
                (directory / 'state').mkdir(mode=0o700)
                os.chown(directory / 'state', uid, gid)
                identity = value['identity_env'] if environment == 'production' else ''
                private_write(directory / 'config/site.env', identity +
                    '# Customer-owned provider credentials must be provisioned separately.\n')
                if environment == 'testing':
                    # Empty config is intentional: every gateway request remains closed.
                    write_json(directory / 'config/access.json', {})
                    os.chown(directory / 'config/access.json', uid, gid)
                switch(environment, destination)
                write_json(directory / 'compose.json', compose_document(environment, value['image'], uid, gid))
                compose(environment, 'config', '--quiet')
            backup_directory = ROOT / 'backups/initial-restored-source'
            backup_directory.mkdir(mode=0o700)
            backup = database_snapshot(SOURCE / 'state/site.sqlite', backup_directory / 'site.sqlite')
            report['source_backup'] = backup
            production_db = ROOT / 'production/state/site.sqlite'
            shutil.copy2(backup['path'], production_db)
            require(sha(production_db) == backup['sha256'], 'Production clone differs from verified backup.')
            account = pwd.getpwnam(USERS['production'])
            os.chown(production_db, account.pw_uid, account.pw_gid)
            # Only the clean testing database is migrated. Production retains the restored ledger/data.
            compose('testing', 'run', '--rm', '--no-deps', 'web', 'node', '/app/vps/manage.mjs', 'migrate')
            require(inspect_source()['artifact'] == expected, 'Restored source changed during preparation.')
            for environment in ('production', 'testing'):
                compose(environment, 'up', '-d', '--wait', '--wait-timeout', '70')
                checks = {path: probe(PORTS[environment], HOSTS[environment], path)
                          for path in ('/healthz', '/readyz', '/', '/en/', '/uk/', '/ru/', '/login/', '/api/crm/contacts')}
                for path in ('/healthz', '/', '/en/', '/uk/', '/ru/', '/login/'):
                    require(checks[path]['status'] == 200, f'{environment} HTTP check failed: {path}')
                expected_ready = value['ready_status'] if environment == 'production' else 503
                require(checks['/readyz']['status'] == expected_ready, f'{environment} owner readiness changed unexpectedly.')
                require(checks['/api/crm/contacts']['status'] in (401, 403), 'Anonymous CRM must remain denied.')
                require(probe(PORTS[environment], 'wrong-host.invalid')['status'] == 421, 'Host isolation failed.')
                report[environment] = checks
            gateway_check = probe(19131, HOSTS['testing'], '/')
            require(gateway_check['status'] == 503 and 'noindex' in (gateway_check['robots'] or ''),
                    'Testing gateway must remain closed until customer Access is configured.')
            report['testing_gateway'] = gateway_check
            report['production_owner_ready'] = report['production']['/readyz']['status'] == 200
            report['result'] = 'INTERNAL_ENVIRONMENTS_RUNNING_PUBLIC_ACTIVATION_BLOCKED'
            report['finished_at'] = now()
            install_backup_timer()
            write_json(ROOT / 'installation.json', report)
            return report
        except Exception:
            # Stop only the new containers; retain all staged evidence, backups and original runtime.
            for environment in ('production', 'testing'):
                if (ROOT / environment / 'compose.json').is_file():
                    with contextlib.suppress(Exception):
                        compose(environment, 'stop')
            report['result'] = 'FAILED_NEW_ENVIRONMENTS_STOPPED_SOURCE_PRESERVED'
            report['finished_at'] = now()
            write_json(ROOT / 'receipts/bootstrap-failed.json', report)
            raise


def install_backup_timer():
    service = Path('/etc/systemd/system/knaba-customer-backup.service')
    timer = Path('/etc/systemd/system/knaba-customer-backup.timer')
    require(not service.exists() and not timer.exists(), 'Existing backup units need review; refusing overwrite.')
    private_write(service, '[Unit]\nDescription=KNABA customer production SQLite online backup\n'
                  '[Service]\nType=oneshot\nUser=root\nUMask=0077\n'
                  'ExecStart=/usr/bin/python3 /srv/knaba/customer/ops/knabactl.py backup production\n'
                  'NoNewPrivileges=yes\nPrivateTmp=yes\nProtectSystem=strict\nProtectHome=yes\n'
                  'ReadWritePaths=/srv/knaba/customer\n', 0o644)
    private_write(timer, '[Unit]\nDescription=Daily KNABA customer production backup\n'
                  '[Timer]\nOnCalendar=*-*-* 03:15:00 UTC\nRandomizedDelaySec=300\nPersistent=true\n'
                  '[Install]\nWantedBy=timers.target\n', 0o644)
    run(['systemd-analyze', 'verify', str(service), str(timer)])
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'enable', '--now', timer.name])


def validate_approval(receipt, *, artifact, previous, configuration, clock=None):
    require(isinstance(receipt, dict), 'Approval must be a JSON object.')
    require(receipt.get('environment') == 'production' and receipt.get('hostname') == 'knaba.de', 'Wrong approval target.')
    require(receipt.get('artifact_sha256') == artifact and receipt.get('expected_current_artifact') == previous,
            'Approval does not match the candidate and current production artifacts.')
    require(receipt.get('configuration_sha256') == configuration, 'Production configuration changed after approval.')
    require(receipt.get('user_approved') is True and receipt.get('customer_approved') is True,
            'Both explicit user approval and customer confirmation are required.')
    for key in ('user_approval_reference', 'customer_approval_reference'):
        require(isinstance(receipt.get(key), str) and len(receipt[key].strip()) >= 8,
                'Approval references must identify the actual confirmations, not placeholders.')
        require(receipt[key] not in ('PENDING', 'NOT_PROVIDED', 'REPLACE_ME'), 'Approval references are placeholders.')
    try:
        expires = dt.datetime.fromisoformat(receipt['expires_at'].replace('Z', '+00:00'))
        issued = dt.datetime.fromisoformat(receipt['issued_at'].replace('Z', '+00:00'))
        current = clock or dt.datetime.now(dt.timezone.utc)
        require(issued.tzinfo is not None and expires.tzinfo is not None, 'Approval timestamps need timezone.')
        require(issued <= current < expires and expires - issued <= dt.timedelta(hours=48), 'Approval is expired or not current.')
    except (KeyError, TypeError, ValueError):
        raise Refused('Invalid approval timestamps.')
    return True


def configuration_id(environment):
    directory = ROOT / environment
    return hashlib.sha256(canonical({name: sha(directory / name)
        for name in ('compose.json', 'config/site.env')})).hexdigest()


def active(environment):
    current = ROOT / environment / 'current'
    require(current.is_symlink(), 'Current pointer is not a managed symlink.')
    resolved = current.resolve(strict=True)
    require(resolved.parent == ROOT / 'releases' and HEX64.fullmatch(resolved.name), 'Unsafe current release target.')
    return resolved


def activate(environment, artifact, approval_path=None):
    host_guard()
    require(HEX64.fullmatch(artifact) is not None, 'Invalid candidate digest.')
    with locked():
        old = active(environment)
        require(old.name != artifact, 'This artifact is already active; no release change is needed.')
        candidate = ROOT / 'releases' / artifact
        expected = json.loads((ROOT / 'manifests' / (artifact + '.json')).read_text())
        require(manifest(candidate) == expected and artifact_id(expected) == artifact, 'Candidate artifact changed.')
        old_files = manifest(old)
        require(old.name == artifact_id(old_files), 'Current release changed in place.')
        # Additive schema updates need a separate plan; neither routine promotion nor rollback migrates production.
        require(schema_manifest(old_files) == schema_manifest(expected), 'Schema change requires separately reviewed migration and rollback.')
        if environment == 'production':
            require(approval_path is not None, 'Production requires a private approval receipt.')
            path = Path(approval_path)
            no_symlink_ancestors(path)
            meta = regular(path)
            require(path.parent == ROOT / 'approvals' and meta.st_uid == 0 and not (meta.st_mode & 0o077),
                    'Approval must be root-owned mode0600 in the production approvals directory.')
            value = json.loads(path.read_text())
            validate_approval(value, artifact=artifact, previous=old.name, configuration=configuration_id(environment))
            approval_digest = sha(path)
            require(not (ROOT / 'receipts' / ('approval-used-' + approval_digest + '.json')).exists(), 'Approval already consumed.')
        backup = private_backup(environment, 'pre-activate')
        previous_ready = probe(PORTS[environment], HOSTS[environment], '/readyz')['status']
        require(previous_ready in (200, 503), 'Current owner readiness needs inspection.')
        report = {'environment': environment, 'artifact': artifact, 'previous': old.name,
                  'backup': backup, 'started_at': now(), 'data_source': environment + '-state-preserved'}
        require(active(environment) == old, 'Current release changed concurrently.')
        switch(environment, candidate)
        try:
            compose(environment, 'up', '-d', '--force-recreate', '--no-deps', '--wait', '--wait-timeout', '70', 'web')
            for path in ('/healthz', '/', '/en/', '/uk/', '/ru/', '/login/'):
                require(probe(PORTS[environment], HOSTS[environment], path)['status'] == 200,
                        'Candidate HTTP smoke failed: ' + path)
            require(probe(PORTS[environment], HOSTS[environment], '/readyz')['status'] == previous_ready,
                    'Candidate changed existing owner readiness.')
            require(probe(PORTS[environment], HOSTS[environment], '/api/crm/contacts')['status'] in (401, 403),
                    'Candidate exposed anonymous CRM.')
            report['result'] = 'ACTIVATED_CODE_ONLY'
        except Exception:
            require(active(environment) == candidate, 'Concurrent switch prevents automatic rollback; inspect manually.')
            switch(environment, old)
            compose(environment, 'up', '-d', '--force-recreate', '--no-deps', '--wait', '--wait-timeout', '70', 'web')
            report['result'] = 'ROLLED_BACK_CODE_DATABASE_PRESERVED'
            write_json(ROOT / 'receipts' / ('failed-activation-' + str(time.time_ns()) + '.json'), report)
            raise
        report['finished_at'] = now()
        name = 'approval-used-' + approval_digest if environment == 'production' else 'testing-' + str(time.time_ns())
        write_json(ROOT / 'receipts' / (name + '.json'), report)
        return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('preflight')
    p = sub.add_parser('bootstrap'); p.add_argument('--source-artifact', required=True)
    p = sub.add_parser('stage'); p.add_argument('directory', type=Path); p.add_argument('--artifact', required=True)
    p = sub.add_parser('activate'); p.add_argument('environment', choices=HOSTS); p.add_argument('--artifact', required=True); p.add_argument('--approval', type=Path)
    p = sub.add_parser('backup'); p.add_argument('environment', choices=HOSTS)
    sub.add_parser('status')
    args = parser.parse_args(argv)
    if args.action == 'preflight':
        output = preflight()
    elif args.action == 'bootstrap':
        output = bootstrap(args.source_artifact)
    elif args.action == 'activate':
        output = activate(args.environment, args.artifact, args.approval)
    else:
        host_guard()
        if args.action == 'stage':
            with locked():
                output = {'staged': str(install_release(args.directory, args.artifact)), 'activated': False}
        elif args.action == 'backup':
            with locked():
                output = private_backup(args.environment)
        else:
            output = {'at': now(), 'environments': {}}
            for name in HOSTS:
                directory = active(name)
                files = manifest(directory)
                output['environments'][name] = {'artifact': directory.name,
                    'artifact_verified': artifact_id(files) == directory.name,
                    'configuration_sha256': configuration_id(name),
                    'health': probe(PORTS[name], HOSTS[name]), 'ready': probe(PORTS[name], HOSTS[name], '/readyz')}
            output['testing_gateway'] = probe(19131, HOSTS['testing'])
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except (Refused, OSError, subprocess.TimeoutExpired, ValueError, sqlite3.Error) as error:
        # Keep arbitrary DB/provider error payloads private.
        message = str(error) if isinstance(error, Refused) else type(error).__name__
        print(json.dumps({'status': 'BLOCKED', 'reason': message}), file=sys.stderr)
        sys.exit(2)
